// Servidor local que imita Supabase: Edge Functions (handlers reales) + PostgREST (rpc como anon).
import http from "node:http";
import { readFileSync } from "node:fs";
import pg from "pg";
import { startGame, submitScore, adminLogin, adminAction } from "../supabase/functions/_shared/handlers.js";

const PORT = 8787;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || "postgres://postgres@localhost:5432/look", max: 5 });
const HANDLERS = { "start-game": startGame, "submit-score": submitScore, "admin-login": adminLogin, "admin-action": adminAction };

async function comoRol(rol, sql, params) {
  const c = await pool.connect();
  try { await c.query("begin"); await c.query(`set local role ${rol}`); const r = await c.query(sql, params); await c.query("commit"); return r; }
  catch (e) { await c.query("rollback"); throw e; } finally { c.release(); }
}
function llamadaSQL(fn, args) {
  const keys = Object.keys(args), vals = keys.map(k => { const v = args[k]; return Array.isArray(v) && v.some(x => x && typeof x === "object") ? JSON.stringify(v) : v; });
  return { sql: `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`, vals };
}
const rpcServicio = async (fn, args) => { const { sql, vals } = llamadaSQL(fn, args); return (await comoRol("service_role", sql, vals)).rows[0].r; };

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS" };
const enviar = (res, status, json) => { res.writeHead(status, { ...CORS, "Content-Type": "application/json" }); res.end(JSON.stringify(json)); };

http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }
  const url = new URL(req.url, "http://x");
  if (req.method === "GET" && url.pathname === "/") {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8")
      .replace('const SUPABASE_URL = "";', `const SUPABASE_URL = "http://localhost:${PORT}";`)
      .replace('const SUPABASE_ANON_KEY = "";', 'const SUPABASE_ANON_KEY = "sb_publishable_prueba";');
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return res.end(html);
  }
  let body = ""; for await (const ch of req) body += ch;
  let json = {}; try { json = JSON.parse(body || "{}"); } catch { return enviar(res, 400, { error: "json" }); }
  try {
    const fnMatch = url.pathname.match(/^\/functions\/v1\/([a-z-]+)$/);
    if (fnMatch && HANDLERS[fnMatch[1]]) {
      const ip = (req.headers["x-forwarded-for"] || "127.0.0.1").split(",")[0].trim();
      const r = await HANDLERS[fnMatch[1]](json, { rpc: rpcServicio, ip, adminPassword: process.env.ADMIN_PASSWORD });
      return enviar(res, r.status, r.json);
    }
    // PostgREST con la clave pública (rol anon): rpc y tablas
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/);
    const rol = req.headers.apikey === "clave-servicio-de-prueba" ? "service_role" : "anon";
    if (rpc) { const { sql, vals } = llamadaSQL(rpc[1], json); return enviar(res, 200, (await comoRol(rol, sql, vals)).rows[0].r); }
    const tabla = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
    if (tabla) {
      const t = `public.${tabla[1]}`;
      const sql = req.method === "GET" ? `select * from ${t}` : req.method === "DELETE" ? `delete from ${t}` : req.method === "PATCH" ? `update ${t} set bonus = 999` : `insert into ${t} (device_id, name) values ('hackhackhack', 'Hack')`;
      return enviar(res, 200, (await comoRol("anon", sql, [])).rows);
    }
    enviar(res, 404, { error: "no_encontrado" });
  } catch (e) { enviar(res, 403, { error: "postgres", mensaje: e.message }); }
}).listen(PORT, () => console.log("mock en", PORT));
