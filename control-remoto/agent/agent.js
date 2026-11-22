// Agente: corre en tu compu, se conecta al servidor (conexión SALIENTE) y ejecuta
// SOLO las acciones de la lista blanca. Nunca ejecuta texto recibido como comando.
import os from "node:os";
import { appendFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import WebSocket from "ws";

const SERVER_URL = process.env.SERVER_URL;
const TOKEN = process.env.TOKEN;
if (!SERVER_URL || !TOKEN) throw new Error("Faltan SERVER_URL y/o TOKEN");
if (!/^wss:\/\//.test(SERVER_URL) && !/^ws:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(SERVER_URL)) {
  throw new Error("SERVER_URL debe usar wss:// (ws:// solo se permite contra localhost)");
}

// ---- LISTA BLANCA ----------------------------------------------------------
// peligrosa: true  => exige confirmación en dos pasos (el cliente debe reenviar el nonce).
// Para sumar una acción real, agregá una entrada. Si necesitás un comando del sistema,
// usá execFile con argumentos FIJOS, nunca interpolando datos que vengan del mensaje.
const ACCIONES = {
  hora: { label: "Ver hora", run: () => new Date().toString() },
  ping: { label: "Ping", run: () => "pong" },
  info: {
    label: "Info de la compu",
    run: () => ({ host: os.hostname(), so: `${os.platform()} ${os.release()}`, uptime_min: Math.round(os.uptime() / 60) }),
  },
  // Ejemplo de acción peligrosa (solo simula; reemplazala por la real cuando la necesites)
  simular_apagado: { label: "Apagar (simulado)", peligrosa: true, run: () => "apagado simulado: no se apagó nada" },
};

const NONCE_TTL_MS = 15_000;
const nonces = new Map(); // nonce -> { accion, cid, vence }

const log = (evento, datos = {}) => {
  const linea = JSON.stringify({ t: new Date().toISOString(), evento, ...datos });
  console.log(linea);
  appendFile("agent.log", linea + "\n").catch(() => {});
};

function procesar(msg) {
  const { cid, accion, nonce } = msg;
  const def = Object.hasOwn(ACCIONES, accion) ? ACCIONES[accion] : null;
  if (!def) return { ok: false, accion, error: "accion no permitida" };

  if (def.peligrosa) {
    const n = nonce && nonces.get(nonce);
    if (!n || n.accion !== accion || n.cid !== cid || n.vence < Date.now()) {
      const nuevo = randomBytes(16).toString("hex");
      nonces.set(nuevo, { accion, cid, vence: Date.now() + NONCE_TTL_MS });
      return { ok: false, accion, requiere_confirmacion: true, nonce: nuevo };
    }
    nonces.delete(nonce); // de un solo uso
  }
  try {
    return { ok: true, accion, resultado: def.run() };
  } catch (e) {
    return { ok: false, accion, error: "fallo al ejecutar" };
  }
}

let espera = 1000;
function conectar() {
  const ws = new WebSocket(SERVER_URL);
  let vigilante;
  const armarVigilante = () => { // si el servidor deja de pinguear, la conexión murió: reconectar
    clearTimeout(vigilante);
    vigilante = setTimeout(() => ws.terminate(), 70_000);
  };

  ws.on("open", () => {
    ws.send(JSON.stringify({ type: "auth", rol: "agente", token: TOKEN }));
    armarVigilante();
  });
  ws.on("ping", armarVigilante);
  ws.on("message", (m) => {
    let msg;
    try { msg = JSON.parse(m.toString()); } catch { return; }
    if (msg.type === "auth_ok") {
      espera = 1000;
      log("conectado");
      const lista = Object.entries(ACCIONES).map(([id, a]) => ({ id, label: a.label, peligrosa: !!a.peligrosa }));
      ws.send(JSON.stringify({ type: "acciones", lista }));
      return;
    }
    if (msg.type !== "orden" || typeof msg.accion !== "string") return;
    const r = procesar(msg);
    log("orden", { accion: msg.accion, cid: msg.cid, ok: r.ok, confirmacion_pedida: !!r.requiere_confirmacion });
    ws.send(JSON.stringify({ type: "resultado", cid: msg.cid, ...r }));
  });
  ws.on("close", (codigo) => {
    clearTimeout(vigilante);
    if (codigo === 1008) { espera = 60_000; log("rechazado", { motivo: "token invalido o IP bloqueada" }); }
    else log("desconectado", { codigo });
    setTimeout(conectar, espera);
    espera = Math.min(espera * 2, 30_000); // backoff exponencial
  });
  ws.on("error", () => {}); // 'close' se dispara después y maneja la reconexión
}

setInterval(() => { for (const [k, v] of nonces) if (v.vence < Date.now()) nonces.delete(k); }, 30_000).unref();
conectar();
