// Lógica de las Edge Functions, sin dependencias de Deno ni de Supabase:
// cada handler recibe (body, ctx) y devuelve { status, json }.
// ctx = { rpc(nombre, args) → data, ip, adminPassword }
import { CONSIGNAS, sortearConsignas, puntuarPartida } from "./motor.js";

const ok = json => ({ status: 200, json });
const err = (status, error, mensaje, extra = {}) => ({ status, json: { error, mensaje, ...extra } });

/* ---------- validaciones ---------- */
const DEVICE_RE = /^[A-Za-z0-9_-]{8,64}$/;
export const deviceValido = d => typeof d === "string" && DEVICE_RE.test(d);

// Filtro básico de malas palabras. Se compara sin tildes, sin espacios ni signos y con "leet" básico (4→a, 3→e, 0→o...).
const MALAS = ["puta", "puto", "pija", "poronga", "concha", "mierda", "forro", "pelotud", "boludo", "garca", "trolo",
  "verga", "chupala", "sorete", "culiad", "cogi", "coger", "pajer", "nazi", "hitler", "violad", "mogolic", "negrodemierda", "putita", "zorra", "trola"];
const normalizar = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[4@]/g, "a").replace(/3/g, "e").replace(/[1!|]/g, "i").replace(/0/g, "o").replace(/[5$]/g, "s").replace(/7/g, "t")
  .replace(/[^a-z]/g, "");
export function validarNombre(n) {
  if (typeof n !== "string") return { ok: false, mensaje: "Escribí un apodo." };
  const limpio = n.normalize("NFC").replace(/\s+/g, " ").trim();
  if (limpio.length < 2 || limpio.length > 20) return { ok: false, mensaje: "El apodo tiene que tener entre 2 y 20 caracteres." };
  if (!/^[\p{L}\p{N} ._'-]+$/u.test(limpio)) return { ok: false, mensaje: "Usá solo letras, números, espacios, punto, guion o apóstrofo." };
  const plano = normalizar(limpio);
  if (MALAS.some(m => plano.includes(m))) return { ok: false, mensaje: "Elegí otro apodo, por favor." };
  return { ok: true, nombre: limpio };
}

/* ---------- start-game ---------- */
export async function startGame(body, ctx) {
  if (!deviceValido(body?.deviceId)) return err(400, "device_invalido", "Dispositivo inválido.");
  const excluir = Array.isArray(body.excluir) ? body.excluir.filter(x => typeof x === "string").slice(0, 10) : [];
  const consignas = sortearConsignas(Math.random, excluir).map(c => c.id);
  const r = await ctx.rpc("iniciar_partida", { p_device: body.deviceId, p_ip: ctx.ip, p_consignas: consignas });
  if (!r.ok) return err(429, r.error, "Jugaste muchas partidas seguidas. Probá en un rato.");
  return ok({ gameId: r.gameId, consignas });
}

/* ---------- submit-score ---------- */
const MENSAJES = {
  partida_invalida: "Esta partida no es válida.", partida_usada: "Esta partida ya se guardó.",
  consignas_distintas: "Las consignas no coinciden con la partida.", muy_rapida: "La partida terminó demasiado rápido.",
  partida_vencida: "La partida venció.", espera: "Esperá un minuto entre partidas para guardar.",
};
export async function submitScore(body, ctx) {
  if (!deviceValido(body?.deviceId)) return err(400, "device_invalido", "Dispositivo inválido.");
  if (typeof body.gameId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.gameId)) return err(400, "partida_invalida", MENSAJES.partida_invalida);
  const nombre = validarNombre(body.nombre);
  if (!nombre.ok) return err(400, "nombre_invalido", nombre.mensaje);
  let calculo;
  try { calculo = puntuarPartida(body.rondas); }   // el puntaje que mande el navegador se ignora
  catch (e) { return err(400, e.message || "look_invalido", "La partida tiene prendas o consignas que no existen."); }
  const r = await ctx.rpc("registrar_partida", {
    p_game: body.gameId, p_device: body.deviceId, p_nombre: nombre.nombre, p_consignas: calculo.rondas.map(x => x.consigna),
    p_total: calculo.total, p_rounds: calculo.rondas, p_ip: ctx.ip,
  });
  if (!r.ok) return err(r.error === "espera" ? 429 : 400, r.error, MENSAJES[r.error] || "No se pudo guardar.", r.segundos ? { segundos: r.segundos } : {});
  return ok({ total: r.total, posicion: r.posicion, de: r.de, nombre: nombre.nombre });
}

/* ---------- admin-login ---------- */
async function sha256(texto) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return new Uint8Array(buf);
}
async function igualSeguro(a, b) { // compara en tiempo constante (sobre los hashes)
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}
function tokenAleatorio() { const b = new Uint8Array(32); crypto.getRandomValues(b); return Array.from(b, x => x.toString(16).padStart(2, "0")).join(""); }

export async function adminLogin(body, ctx) {
  if (!ctx.adminPassword) return err(500, "sin_configurar", "Falta configurar ADMIN_PASSWORD en el servidor.");
  const ip = ctx.ip || "desconocida";
  if (await ctx.rpc("admin_ip_bloqueada", { p_ip: ip })) return err(429, "bloqueada", "Demasiados intentos. Probá en 10 minutos.");
  const correcta = typeof body?.password === "string" && body.password.length <= 200 && await igualSeguro(body.password, ctx.adminPassword);
  const r = await ctx.rpc("admin_registrar_intento", { p_ip: ip, p_ok: correcta });
  if (!correcta) return r.bloqueada ? err(429, "bloqueada", "Demasiados intentos. Probá en 10 minutos.") : err(401, "incorrecta", "Contraseña incorrecta");
  const token = tokenAleatorio();
  await ctx.rpc("admin_crear_sesion", { p_token: token });
  return ok({ token, venceEnMinutos: 30 });
}

/* ---------- admin-action ---------- */
export async function adminAction(body, ctx) {
  if (!(await ctx.rpc("admin_sesion_valida", { p_token: typeof body?.token === "string" ? body.token : "" })))
    return err(401, "sesion_vencida", "Tu sesión venció. Entrá de nuevo.");
  const d = body.deviceId;
  switch (body.accion) {
    case "list": return ok({ jugadoras: await ctx.rpc("admin_listar", {}) });
    case "history": return ok({ historial: await ctx.rpc("admin_historial", { p_limite: 200 }) });
    case "add_points": {
      const n = Number(body.cantidad);
      if (!deviceValido(d) || !Number.isInteger(n) || n === 0 || n < -300 || n > 300) return err(400, "cantidad_invalida", "La cantidad tiene que ser un número entero entre -300 y 300, distinto de 0.");
      if (typeof body.motivo !== "string" || !body.motivo.trim()) return err(400, "falta_motivo", "Escribí el motivo.");
      const r = await ctx.rpc("admin_sumar", { p_device: d, p_cantidad: n, p_motivo: body.motivo.slice(0, 200) });
      return r.ok ? ok(r) : err(400, r.error, "No se pudo aplicar.");
    }
    case "delete_player": {
      if (!deviceValido(d)) return err(400, "device_invalido", "Jugadora inválida.");
      const r = await ctx.rpc("admin_borrar", { p_device: d, p_motivo: typeof body.motivo === "string" ? body.motivo.slice(0, 200) : null });
      return r.ok ? ok(r) : err(400, r.error, "No se pudo borrar.");
    }
    case "restore_player": {
      if (!deviceValido(d)) return err(400, "device_invalido", "Jugadora inválida.");
      const r = await ctx.rpc("admin_restaurar", { p_device: d });
      return r.ok ? ok(r) : err(400, r.error, "No se pudo restaurar.");
    }
    default: return err(400, "accion_invalida", "Acción desconocida.");
  }
}
