import { chromium } from "playwright";
import pg from "pg";
import { puntuarPartida } from "../supabase/functions/_shared/motor.js";
const URL = "http://localhost:8787";
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL || "postgres://postgres@localhost:5432/look" });
const q = async (s, p) => (await db.query(s, p)).rows;
let fallas = 0;
const check = (cond, msg) => { console.log(cond ? "  OK " : "  FALLA ", msg); if (!cond) fallas++; };
const api = (path, body, ip) => fetch(URL + path, { method: "POST", headers: { "Content-Type": "application/json", ...(ip ? { "x-forwarded-for": ip } : {}) }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, json: await r.json() }));
const espera = ms => new Promise(r => setTimeout(r, ms));

await q("truncate players, games, scores, admin_log, admin_sessions, login_attempts, login_locks cascade");
const b = await chromium.launch();

async function jugar(nombre, ancho, opciones = {}) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: 760 }, hasTouch: true, isMobile: true, extraHTTPHeaders: opciones.ip ? { "x-forwarded-for": opciones.ip } : {} });
  const pg2 = await ctx.newPage(); const errs = []; pg2.on("pageerror", e => errs.push(e.message));
  if (opciones.offline) await pg2.route(/\/(functions|rest)\//, r => r.abort());
  await pg2.goto(URL); await pg2.tap("#btn-jugar");
  if (!opciones.offline || opciones.pideNombre) { await pg2.fill("#in-nombre", nombre); await pg2.tap("#f-nombre button[type=submit]"); }
  await pg2.tap("#btn-empezar"); await pg2.waitForSelector("#s-ronda:not([hidden])");
  for (let r = 0; r < 3; r++) {
    const pick = async (tab, idx) => { await pg2.tap(`#tab-${tab}`); const c = await pg2.$$("#rail .prenda"); await c[idx % c.length].tap(); };
    await pick("vestido", r + opciones.sesgo || 0); await pick("calzado", r + 2); await pick("accesorios", r);
    await espera(opciones.lento ? 5500 : 300);
    await pg2.tap("#btn-listo"); await pg2.waitForSelector("#s-res:not([hidden])"); await espera(1100); await pg2.tap("#btn-next");
  }
  await pg2.waitForSelector("#s-final:not([hidden])");
  await pg2.waitForFunction(() => !/Guardando/.test(document.getElementById("fin-envio").textContent), null, { timeout: 10000 });
  await espera(1500); // termina la animación del puntaje
  return { ctx, page: pg2, errs, envio: (await pg2.textContent("#fin-envio")).trim(), total: +(await pg2.textContent("#fin-pts")) };
}

console.log("1) Dos celulares juegan y aparecen en el mismo ranking");
const sofi = await jugar("Sofi", 360, { lento: true, ip: "10.0.0.1" });
check(/Quedaste 1ª de 1/.test(sofi.envio), `Sofi ve: "${sofi.envio}"`);
const caro = await jugar("Caro", 390, { lento: true, ip: "10.0.0.2", sesgo: 3 });
check(/Quedaste [12]ª de 2/.test(caro.envio), `Caro ve: "${caro.envio}"`);
await caro.page.waitForSelector("#fin-envio .rk-lista .rk-fila");
const mini = await caro.page.$$eval("#fin-envio .rk-fila", l => l.map(x => x.textContent));
check(mini.length === 2 && mini.some(t => t.includes("Caro (vos)")), `al terminar aparece el ranking solo: ${JSON.stringify(mini)}`);
await caro.page.evaluate(() => document.getElementById("fin-envio").scrollIntoView({ block: "start" }));
await caro.page.screenshot({ path: "e2e-final-ranking.png" });
await caro.page.tap("#fin-envio [data-a=ver]"); await caro.page.waitForSelector("#rk-lista .rk-fila");
const filas = await caro.page.$$eval("#rk-lista .rk-fila", l => l.map(x => x.textContent));
check(filas.length === 2 && filas.some(f => f.includes("Sofi")) && filas.some(f => f.includes("Caro (vos)")), `ranking de Caro: ${JSON.stringify(filas)}`);
const guardados = await q("select player_name, total from scores order by player_name");
check(guardados.find(x => x.player_name === "Sofi")?.total === sofi.total && guardados.find(x => x.player_name === "Caro")?.total === caro.total, `puntajes guardados = puntajes del juego (${JSON.stringify(guardados)})`);
check(sofi.errs.length + caro.errs.length === 0, "sin errores de JS");

console.log("2) 'merluza' no aparece en el código de la página");
const html = await (await fetch(URL)).text();
check(!/merluza/i.test(html), `búsqueda de "merluza" en el HTML: ${(html.match(/merluza/gi) || []).length} resultados`);

console.log("3) La llave pública no puede modificar ni borrar datos");
for (const [m, p, b2] of [["POST", "/rest/v1/rpc/admin_sumar", { p_device: "x".repeat(12), p_cantidad: 300, p_motivo: "hack" }], ["POST", "/rest/v1/rpc/registrar_partida", { p_game: "00000000-0000-0000-0000-000000000000", p_device: "x".repeat(12), p_nombre: "Hack", p_consignas: ["a", "b", "c"], p_total: 300, p_rounds: [{ a: 1 }], p_ip: "1.1.1.1" }], ["DELETE", "/rest/v1/scores"], ["PATCH", "/rest/v1/players"], ["POST", "/rest/v1/players"], ["GET", "/rest/v1/scores"]]) {
  const r = await fetch(URL + p, { method: m, headers: { "Content-Type": "application/json" }, body: m === "GET" ? undefined : JSON.stringify(b2 || {}) });
  const j = await r.json(); check(r.status === 403 && /permission denied/.test(j.mensaje || ""), `${m} ${p} → ${r.status} ${(j.mensaje || "").slice(0, 45)}`);
}
check((await q("select count(*)::int n from scores"))[0].n === 2, "siguen 2 partidas intactas");

console.log("4) Un puntaje inventado se guarda recalculado");
const dev = "tramposa-device-001";
const g = await api("/functions/v1/start-game", { deviceId: dev }, "10.0.0.3");
const malos = g.json.consignas.map(c => ({ consigna: c, prendas: ["top_07", "bot_05", "sho_04"], puntaje: 100 }));
const rapido = await api("/functions/v1/submit-score", { gameId: g.json.gameId, deviceId: dev, nombre: "Trampa", rondas: malos, total: 300 }, "10.0.0.3");
check(rapido.json.error === "muy_rapida", `enviar a los 0 s → ${rapido.json.error}`);
await q("update games set created_at = now() - interval '30 seconds' where id = $1", [g.json.gameId]);
const imposible = await api("/functions/v1/submit-score", { gameId: g.json.gameId, deviceId: dev, nombre: "Trampa", rondas: malos.map(r => ({ ...r, prendas: ["top_01", "dre_01", "sho_01"] })) }, "10.0.0.3");
check(imposible.status === 400 && imposible.json.error === "look_invalido", `look imposible (top + vestido) → ${imposible.json.error}`);
const otras = await api("/functions/v1/submit-score", { gameId: g.json.gameId, deviceId: dev, nombre: "Trampa", rondas: malos.map((r, i) => ({ ...r, consigna: ["casamiento", "oficina", "asado", "rooftop"].filter(x => !g.json.consignas.includes(x))[i] || "gala" })) }, "10.0.0.3");
check(otras.json.error === "consignas_distintas", `consignas elegidas por el navegador → ${otras.json.error}`);
const trucho = await api("/functions/v1/submit-score", { gameId: g.json.gameId, deviceId: dev, nombre: "Trampa", rondas: malos, total: 300 }, "10.0.0.3");
const real = (await q("select total from scores where device_id = $1", [dev]))[0]?.total;
const esperado = puntuarPartida(malos).total;
check(trucho.status === 200 && real === esperado && real !== 300, `pidió 300 con puntajes de 100 por ronda; se guardó ${real} (motor: ${esperado})`);
const otraVez = await api("/functions/v1/submit-score", { gameId: g.json.gameId, deviceId: dev, nombre: "Trampa", rondas: malos }, "10.0.0.3");
check(otraVez.json.error === "partida_usada", `reusar el ticket → ${otraVez.json.error}`);
const g2 = await api("/functions/v1/start-game", { deviceId: dev }, "10.0.0.3");
await q("update games set created_at = now() - interval '30 seconds' where id = $1", [g2.json.gameId]);
const seguido = await api("/functions/v1/submit-score", { gameId: g2.json.gameId, deviceId: dev, nombre: "Trampa", rondas: g2.json.consignas.map(c => ({ consigna: c, prendas: ["dre_01", "sho_01"] })) }, "10.0.0.3");
check(seguido.status === 429 && seguido.json.error === "espera", `segunda partida antes de 60 s → ${seguido.json.error} (${seguido.json.segundos} s)`);
const feo = await api("/functions/v1/submit-score", { gameId: g2.json.gameId, deviceId: dev, nombre: "Pel0tud4", rondas: [] }, "10.0.0.3");
check(feo.json.error === "nombre_invalido", `apodo "Pel0tud4" → ${feo.json.error}`);
const htmlNombre = await api("/functions/v1/submit-score", { gameId: g2.json.gameId, deviceId: dev, nombre: "<b>hola</b>", rondas: [] }, "10.0.0.3");
check(htmlNombre.json.error === "nombre_invalido", `apodo con HTML → ${htmlNombre.json.error}`);

console.log("5) Admin: contraseña, puntos, historial, borrar y restaurar");
const p = caro.page;
await p.tap("#rk-admin"); await p.waitForSelector("#ad-login:not([hidden])");
await p.fill("#in-pass", "pescado"); await p.tap("#ad-entrar"); await p.waitForFunction(() => document.getElementById("ad-error").textContent);
check((await p.textContent("#ad-error")) === "Contraseña incorrecta", `contraseña mala → "${await p.textContent("#ad-error")}"`);
await p.fill("#in-pass", "merluza"); await p.tap("#ad-entrar"); await p.waitForSelector("#ad-panel:not([hidden]) .ad-fila");
check(true, "contraseña correcta abre el panel");
const rank0 = (await api("/rest/v1/rpc/ranking", { p_device: null })).json.filas.map(f => f.nombre + ":" + f.puntaje);
const ultimo = (await api("/rest/v1/rpc/ranking", { p_device: null })).json.filas.at(-1);
const primero = (await api("/rest/v1/rpc/ranking", { p_device: null })).json.filas[0];
const suma = Math.min(300, primero.puntaje - ultimo.puntaje + 10);
const filaUlt = p.locator(".ad-fila", { hasText: ultimo.nombre }).first();
await filaUlt.locator("[data-a=puntos]").tap(); await filaUlt.locator("[data-f=cant]").fill(String(suma));
const preview = await filaUlt.locator("[data-f=prev]").textContent();
await filaUlt.locator("[data-a=aplicar]").tap(); await espera(400);
check(/Escribí el motivo/.test(await p.textContent("#toast")), "sin motivo no aplica");
await filaUlt.locator("[data-f=motivo]").fill("Ganó el sorteo del evento"); await filaUlt.locator("[data-a=aplicar]").tap(); await espera(800);
const rank1 = (await api("/rest/v1/rpc/ranking", { p_device: null })).json.filas.map(f => f.nombre + ":" + f.puntaje);
check(rank1[0].startsWith(ultimo.nombre), `+${suma} a ${ultimo.nombre} (vista previa "${preview}"): ${JSON.stringify(rank0)} → ${JSON.stringify(rank1)}`);
await p.tap("#ad-panel .chip[data-v=historial]");
check(/Ganó el sorteo del evento/.test(await p.textContent("#ad-log")), "la acción aparece en el historial");
await p.tap("#ad-panel .chip[data-v=jugadoras]");
const filaSofi = p.locator(".ad-fila", { hasText: "Sofi" }).first();
await filaSofi.locator("[data-a=borrar]").tap();
check(/¿Borrar a Sofi del ranking\? Esta acción se puede deshacer desde el historial\./.test(await filaSofi.textContent()), "confirmación dentro de la página");
await filaSofi.locator("[data-a=confirmar-borrar]").tap(); await espera(800);
const rank2 = (await api("/rest/v1/rpc/ranking", { p_device: null })).json.filas.map(f => f.nombre);
check(!rank2.includes("Sofi"), `Sofi borrada: ${JSON.stringify(rank2)}`);
await p.tap("#ad-panel .chip[data-v=historial]"); await p.locator("#ad-log [data-a=restaurar-log]").first().tap(); await espera(800);
const rank3 = (await api("/rest/v1/rpc/ranking", { p_device: null })).json.filas.map(f => f.nombre);
check(rank3.includes("Sofi"), `Sofi restaurada: ${JSON.stringify(rank3)}`);
await p.tap("#ad-salir");
check(!(await p.isHidden("#ad-login")) && (await p.isHidden("#ad-panel")), "Salir de admin vuelve a pedir la contraseña");
const sinToken = await api("/functions/v1/admin-action", { token: "inventado", accion: "delete_player", deviceId: "x".repeat(12) });
check(sinToken.status === 401, `admin-action con token inventado → ${sinToken.status}`);

console.log("6) Bloqueo tras 5 intentos fallidos desde la misma IP");
for (let i = 0; i < 5; i++) await api("/functions/v1/admin-login", { password: "nope" + i }, "10.9.9.9");
const sexta = await api("/functions/v1/admin-login", { password: "merluza" }, "10.9.9.9");
check(sexta.status === 429 && sexta.json.mensaje === "Demasiados intentos. Probá en 10 minutos.", `con la correcta, después de 5 fallos → ${sexta.status} "${sexta.json.mensaje}"`);
const otraIp = await api("/functions/v1/admin-login", { password: "merluza" }, "10.9.9.10");
check(otraIp.status === 200 && otraIp.json.token, "otra IP no queda bloqueada");

console.log("7) Sin conexión el juego se juega completo");
const off = await jugar("Offline", 360, { offline: true, pideNombre: true });
check(/sin conexión/i.test(off.envio) && off.total > 0, `final sin conexión: "${off.envio}", ${off.total} pts`);
check(off.errs.length === 0, "sin errores de JS");

console.log("8) Pantalla de ranking a 360 px");
await sofi.page.tap("#fin-envio [data-a=ver]"); await sofi.page.waitForSelector("#rk-lista .rk-fila");
await sofi.page.screenshot({ path: "e2e-ranking-360.png" });
const sw = await sofi.page.evaluate(() => document.documentElement.scrollWidth);
check(sw === 360, `sin scroll horizontal (${sw}px)`);
await sofi.page.tap("#s-ranking .chip[data-p=hoy]"); await espera(400);
check((await sofi.page.$$("#rk-lista .rk-fila")).length >= 2, "filtro Hoy");
await caro.page.tap("#rk-admin").catch(() => {}); // vuelve a admin desde el ranking
await p.goto(URL); await p.tap("#btn-ranking-inicio"); await p.waitForSelector("#rk-lista .rk-fila"); await p.tap("#rk-admin");
await p.fill("#in-pass", "merluza"); await p.tap("#ad-entrar"); await p.waitForSelector("#ad-panel:not([hidden]) .ad-fila");
await p.screenshot({ path: "e2e-admin-390.png" });

await b.close(); await db.end();
console.log(fallas ? `\n${fallas} FALLAS` : "\nTODO OK");
process.exit(fallas ? 1 : 0);
