// Prueba la "Lista para probar que anda" del documento, contra un servidor y agente reales.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const TOKEN = "t".repeat(40);
const PORT = 18080 + Math.floor(Math.random() * 1000);
const URL_WS = `ws://127.0.0.1:${PORT}`;
const dir = (p) => fileURLToPath(new URL(p, import.meta.url));
let srv, agt;

const arrancar = (archivo, cwd, env) => {
  const p = spawn("node", [archivo], { cwd, env: { ...process.env, TOKEN, ...env }, stdio: ["ignore", "pipe", "inherit"] });
  return p;
};
const esperarLinea = (p, texto) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error("timeout esperando " + texto)), 5000);
  p.stdout.on("data", (d) => { if (String(d).includes(texto)) { clearTimeout(t); res(); } });
});

// Cliente de prueba: cola de mensajes
function abrir(rol, token = TOKEN) {
  return new Promise((res) => {
    const ws = new WebSocket(URL_WS);
    ws.cola = []; ws.espera = [];
    ws.on("message", (d) => { const m = JSON.parse(d); const w = ws.espera.shift(); w ? w(m) : ws.cola.push(m); });
    ws.sig = () => new Promise((r) => (ws.cola.length ? r(ws.cola.shift()) : ws.espera.push(r)));
    ws.cerrado = new Promise((r) => ws.on("close", (code) => r(code)));
    ws.on("open", () => { ws.send(JSON.stringify({ type: "auth", rol, token })); res(ws); });
  });
}
const sigTipo = async (ws, tipo) => { for (;;) { const m = await ws.sig(); if (m.type === tipo) return m; } };

before(async () => {
  srv = arrancar(dir("../server.js"), dir(".."), { PORT: String(PORT) });
  await esperarLinea(srv, "servidor_iniciado");
  agt = arrancar(dir("../../agent/agent.js"), dir("../../agent"), { SERVER_URL: URL_WS });
  await esperarLinea(agt, "conectado");
});
after(() => { srv?.kill(); agt?.kill(); });

test("rechaza token incorrecto y mensaje sin auth", async () => {
  const ws = await abrir("cliente", "x".repeat(40));
  assert.equal(await ws.cerrado, 1008);
});

test("rechaza conexión que no se autentica (timeout)", async () => {
  const ws = new WebSocket(URL_WS);
  const code = await new Promise((r) => ws.on("close", r));
  assert.equal(code, 1008);
});

test("healthcheck y web servida", async () => {
  assert.equal(await (await fetch(`http://127.0.0.1:${PORT}/healthz`)).text(), "ok");
  const r = await fetch(`http://127.0.0.1:${PORT}/`);
  assert.match(await r.text(), /Control remoto/);
  assert.ok(r.headers.get("content-security-policy"));
});

test("acción de la lista blanca se ejecuta y vuelve solo al cliente que la pidió", async () => {
  const a = await abrir("cliente"), b = await abrir("cliente");
  await sigTipo(a, "acciones"); await sigTipo(b, "acciones");
  a.send(JSON.stringify({ type: "orden", accion: "ping" }));
  const r = await sigTipo(a, "resultado");
  assert.deepEqual([r.ok, r.resultado], [true, "pong"]);
  assert.equal(r.cid, undefined);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(b.cola.filter((m) => m.type === "resultado").length, 0);
  a.close(); b.close();
});

test("acción fuera de la lista blanca es rechazada", async () => {
  const c = await abrir("cliente");
  await sigTipo(c, "acciones");
  for (const accion of ["rm -rf /", "__proto__", "constructor", "toString"]) {
    c.send(JSON.stringify({ type: "orden", accion }));
    const r = await sigTipo(c, "resultado");
    assert.deepEqual([r.ok, r.error], [false, "accion no permitida"], accion);
  }
  c.close();
});

test("acción peligrosa exige confirmación con nonce de un solo uso", async () => {
  const c = await abrir("cliente");
  await sigTipo(c, "acciones");
  c.send(JSON.stringify({ type: "orden", accion: "simular_apagado" }));
  const pedido = await sigTipo(c, "resultado");
  assert.equal(pedido.requiere_confirmacion, true);
  c.send(JSON.stringify({ type: "orden", accion: "simular_apagado", nonce: pedido.nonce }));
  assert.equal((await sigTipo(c, "resultado")).ok, true);
  c.send(JSON.stringify({ type: "orden", accion: "simular_apagado", nonce: pedido.nonce })); // reuso
  assert.equal((await sigTipo(c, "resultado")).requiere_confirmacion, true);
  c.close();
});

test("el nonce de un cliente no sirve para otro", async () => {
  const a = await abrir("cliente"), b = await abrir("cliente");
  await sigTipo(a, "acciones"); await sigTipo(b, "acciones");
  a.send(JSON.stringify({ type: "orden", accion: "simular_apagado" }));
  const { nonce } = await sigTipo(a, "resultado");
  b.send(JSON.stringify({ type: "orden", accion: "simular_apagado", nonce }));
  assert.equal((await sigTipo(b, "resultado")).requiere_confirmacion, true);
  a.close(); b.close();
});

test("si el agente se apaga, el cliente se entera; y el agente se reconecta solo", async () => {
  const c = await abrir("cliente");
  await sigTipo(c, "acciones");
  agt.kill();
  assert.equal((await sigTipo(c, "estado")).agente, false);
  c.send(JSON.stringify({ type: "orden", accion: "ping" }));
  assert.equal((await sigTipo(c, "resultado")).error, "agente desconectado");
  agt = arrancar(dir("../../agent/agent.js"), dir("../../agent"), { SERVER_URL: URL_WS });
  assert.equal((await sigTipo(c, "estado")).agente, true);
  c.close();
});

test("tras 5 intentos fallidos la IP queda bloqueada, incluso con token correcto", async () => {
  for (let i = 0; i < 5; i++) await (await abrir("cliente", "mal".repeat(15))).cerrado;
  const ws = await abrir("cliente");
  assert.equal(await ws.cerrado, 1008);
});
