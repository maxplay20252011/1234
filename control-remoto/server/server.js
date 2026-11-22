// Servidor relay: autentica, limita intentos y reenvía órdenes cliente -> agente
// y resultados agente -> el cliente que pidió. No ejecuta nada por sí mismo.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { createHash, timingSafeEqual, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const TOKEN = process.env.TOKEN;
if (!TOKEN || TOKEN.length < 32) {
  throw new Error("Falta TOKEN o es demasiado corto (mínimo 32 caracteres)");
}
const PORT = Number(process.env.PORT) || 8080;
const TRUST_PROXY = process.env.TRUST_PROXY === "1";

const AUTH_TIMEOUT_MS = 5_000;
const HEARTBEAT_MS = 25_000;
const MAX_FALLOS = 5;
const BLOQUEO_MS = 15 * 60_000;
const MAX_CLIENTES = 20;
const MAX_MSG_POR_10S = 30;

const INDEX_PATH = fileURLToPath(new URL("../web/index.html", import.meta.url));
const tokenHash = createHash("sha256").update(TOKEN).digest();

const log = (evento, datos = {}) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), evento, ...datos }));

function tokenValido(candidato) {
  if (typeof candidato !== "string" || candidato.length > 256) return false;
  const h = createHash("sha256").update(candidato).digest();
  return timingSafeEqual(h, tokenHash); // tiempo constante
}

// IP real: detrás de un proxy de confianza usamos la ÚLTIMA entrada de x-forwarded-for
// (la agrega el proxy; las anteriores las puede falsificar el atacante).
function ipDe(req) {
  if (TRUST_PROXY) {
    const xff = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (xff.length) return xff[xff.length - 1];
  }
  return req.socket.remoteAddress || "desconocida";
}

// Límite de intentos fallidos por IP
const intentos = new Map(); // ip -> { fallos, hasta }
const bloqueada = (ip) => (intentos.get(ip)?.hasta ?? 0) > Date.now();
function registrarFallo(ip) {
  const r = intentos.get(ip) ?? { fallos: 0, hasta: 0 };
  r.fallos += 1;
  if (r.fallos >= MAX_FALLOS) { r.hasta = Date.now() + BLOQUEO_MS; r.fallos = 0; log("ip_bloqueada", { ip }); }
  intentos.set(ip, r);
}
setInterval(() => {
  for (const [ip, r] of intentos) if (r.hasta < Date.now() && r.fallos === 0) intentos.delete(ip);
}, 60_000).unref();

// --- HTTP: sirve la web y un healthcheck ---
const CABECERAS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self' wss: ws://localhost:*; base-uri 'none'; form-action 'none'",
};
const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  if (pathname === "/healthz") { res.writeHead(200, { "Content-Type": "text/plain" }); return res.end("ok"); }
  if (pathname === "/" || pathname === "/index.html") {
    try {
      const html = await readFile(INDEX_PATH);
      res.writeHead(200, { ...CABECERAS, "Content-Type": "text/html; charset=utf-8" });
      return res.end(html);
    } catch { /* cae al 404 */ }
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("no encontrado");
});

// --- WebSocket ---
const wss = new WebSocketServer({ server, maxPayload: 4096 });
let agente = null;
let accionesAgente = [];
const clientes = new Map(); // cid -> ws

const enviar = (ws, obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };
const difundir = (obj) => clientes.forEach((ws) => enviar(ws, obj));
const estado = () => ({ type: "estado", agente: agente !== null });

wss.on("connection", (ws, req) => {
  const ip = ipDe(req);
  if (bloqueada(ip)) return ws.close(1008, "bloqueado");

  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });
  ws.on("error", () => {});

  let rol = null;
  let cid = null;
  const limite = setTimeout(() => ws.close(1008, "auth timeout"), AUTH_TIMEOUT_MS);
  let ventana = { inicio: Date.now(), n: 0 };

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return ws.close(1003, "json invalido"); }

    // 1) Primer mensaje obligatorio: autenticación (el token NO viaja en la URL)
    if (rol === null) {
      if (msg?.type !== "auth" || !tokenValido(msg.token) || !["agente", "cliente"].includes(msg.rol)) {
        registrarFallo(ip);
        log("auth_fallida", { ip });
        return ws.close(1008, "no autorizado");
      }
      if (msg.rol === "cliente" && clientes.size >= MAX_CLIENTES) return ws.close(1013, "demasiados clientes");
      clearTimeout(limite);
      intentos.delete(ip);
      rol = msg.rol;

      if (rol === "agente") {
        if (agente && agente !== ws) agente.close(1000, "reemplazado");
        agente = ws;
        accionesAgente = [];
        log("agente_conectado", { ip });
        enviar(ws, { type: "auth_ok" });
        difundir(estado());
      } else {
        cid = randomUUID();
        clientes.set(cid, ws);
        log("cliente_conectado", { ip, cid });
        enviar(ws, { type: "auth_ok" });
        enviar(ws, estado());
        if (agente) enviar(ws, { type: "acciones", lista: accionesAgente });
      }
      return;
    }

    // 2) Mensajes ya autenticados
    if (rol === "cliente") {
      if (Date.now() - ventana.inicio > 10_000) ventana = { inicio: Date.now(), n: 0 };
      if (++ventana.n > MAX_MSG_POR_10S) return ws.close(1008, "demasiados mensajes");

      if (msg?.type !== "orden" || typeof msg.accion !== "string" || msg.accion.length > 64
        || (msg.nonce !== undefined && (typeof msg.nonce !== "string" || msg.nonce.length > 64))) {
        return enviar(ws, { type: "resultado", ok: false, error: "mensaje invalido" });
      }
      if (!agente) return enviar(ws, { type: "resultado", ok: false, accion: msg.accion, error: "agente desconectado" });
      // Reenviamos solo campos conocidos; cid lo pone el servidor (el cliente no lo puede falsificar)
      enviar(agente, { type: "orden", cid, accion: msg.accion, nonce: msg.nonce });
    } else if (ws === agente) {
      if (msg?.type === "acciones" && Array.isArray(msg.lista)) {
        accionesAgente = msg.lista.slice(0, 50);
        difundir({ type: "acciones", lista: accionesAgente });
      } else if (msg?.type === "resultado") {
        const destino = clientes.get(msg.cid);
        if (destino) { const { cid: _omitido, ...resto } = msg; enviar(destino, resto); }
      }
    }
  });

  ws.on("close", () => {
    clearTimeout(limite);
    if (rol === "cliente") { clientes.delete(cid); log("cliente_desconectado", { cid }); }
    if (rol === "agente" && agente === ws) {
      agente = null; accionesAgente = [];
      log("agente_desconectado");
      difundir(estado());
    }
  });
});

// Detecta conexiones muertas y mantiene vivas las que pasan por proxies con timeout de inactividad
const latido = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_MS);
wss.on("close", () => clearInterval(latido));

export { server, wss };
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => log("servidor_iniciado", { puerto: PORT }));
}
