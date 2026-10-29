// Prueba de punta a punta del escáner en Chromium:
//   URL=http://localhost:8811/index.html FOTOS=carpeta node pruebas/e2e.cjs [carpeta-capturas]
// URL: la app servida con su carpeta vendor/ (ver pruebas/servidor.cjs).
// FOTOS debe tener foto-tres-tarjetas.jpg, sin-qr.png y camara.y4m (video falso de cámara).
const { chromium } = require("playwright"), fs = require("fs"), path = require("path");
const out = process.argv[2] || path.join(__dirname, "capturas"); fs.mkdirSync(out, { recursive: true });
const F = process.env.FOTOS, T = path.join(__dirname, "..", "tarjetas", "png");
const ok = (c, m) => { if (!c) { console.log("FALLA:", m); process.exitCode = 1; } else console.log("ok  ", m); };
async function abrir(b, w, h) {
  const p = await b.newPage({ viewport: { width: w, height: h } }), errs = [];
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && !/fonts\.|Permission|NotAllowed|getUserMedia/.test(m.text()) && errs.push(m.text()));
  await p.goto(process.env.URL); await p.waitForTimeout(400); await p.click("#crear");
  return { p, errs };
}
const leida = (p, g) => p.$eval(`.leida[data-g="${g}"] .valor`, e => e.textContent);
const subir = async (p, f) => { await p.setInputFiles("#scan-foto", f); await p.waitForFunction(() => window.ICON_LECTOR.ocupado(), null, { timeout: 3000 }).catch(() => {}); await p.waitForFunction(() => !window.ICON_LECTOR.ocupado(), null, { timeout: 60000 }); };
(async () => {
  // 1) Fotos sueltas + generar (escritorio y celular)
  let b = await chromium.launch();
  for (const [w, h, tag] of [[1366, 900, "escritorio"], [390, 844, "celular"]]) {
    const { p, errs } = await abrir(b, w, h);
    await p.screenshot({ path: `${out}/1-escaneo-vacio-${tag}.png` });
    await subir(p, `${T}/estilo-elegante.png`);
    ok(await leida(p, "estilo") === "Elegante", `${tag}: foto de tarjeta de estilo → Elegante`);
    ok((await p.textContent("#scan-estado")).includes("Falta: clima, evento"), `${tag}: dice qué falta`);
    await subir(p, `${T}/clima-frio.png`); await subir(p, `${T}/evento-fiesta.png`);
    ok(await leida(p, "clima") === "Frío" && await leida(p, "evento") === "Fiesta nocturna", `${tag}: clima y evento leídos`);
    ok((await p.textContent(".leida[data-g=estilo] .via")) === "Leída por QR", `${tag}: indica que se leyó por QR`);
    ok((await p.textContent("#scan-estado")).includes("Listo"), `${tag}: avisa que están las tres`);
    await p.screenshot({ path: `${out}/2-escaneo-completo-${tag}.png` });
    await subir(p, `${T}/evento-fiesta.png`);
    ok((await p.textContent("#scan-estado")).includes("ya estaba"), `${tag}: repetir tarjeta no cambia nada`);
    await p.click("#generar", { force: true }); await p.waitForSelector("#p-res:not([hidden])", { timeout: 5000 }); await p.waitForTimeout(900);
    ok(await p.textContent("#t-res") === "Pista de Invierno", `${tag}: genera el mismo look que la versión manual (A)`);
    await p.screenshot({ path: `${out}/3-resultado-${tag}.png` });
    await p.click("#otra"); ok(await leida(p, "estilo") === "Elegante", `${tag}: "Probar otra combinación" conserva lo escaneado`);
    await subir(p, `${T}/estilo-urbano.png`); await subir(p, `${T}/clima-calido.png`); await subir(p, `${T}/evento-amigos.png`);
    await p.click("#generar", { force: true }); await p.waitForSelector("#p-res:not([hidden])"); await p.waitForTimeout(900);
    ok(await p.textContent("#t-res") === "Plan al Sol", `${tag}: combinación B escaneada → Plan al Sol`);
    await p.click("#volver"); await p.click("#crear");
    ok(await leida(p, "estilo") === "Falta escanear", `${tag}: "Volver al inicio" borra lo escaneado`);
    const ancho = await p.evaluate(() => document.documentElement.scrollWidth); ok(ancho <= w, `${tag}: sin scroll horizontal (${ancho}px)`);
    ok(errs.length === 0, `${tag}: sin errores de consola ${errs.join(" / ")}`);
    await p.close();
  }
  // 2) Una foto con las tres tarjetas juntas, sin QR y elección a mano
  {
    const { p, errs } = await abrir(b, 1366, 900);
    await subir(p, `${F}/foto-tres-tarjetas.jpg`);
    ok(await leida(p, "estilo") === "Elegante" && await leida(p, "clima") === "Frío" && await leida(p, "evento") === "Fiesta nocturna", "foto con tres tarjetas juntas → las tres leídas de una vez");
    await p.screenshot({ path: `${out}/4-foto-tres-tarjetas.png` });
    await p.click("#volver").catch(() => {}); await p.click("#nuevo"); await p.click("#crear");
    await subir(p, `${F}/sin-qr.png`);
    ok(await leida(p, "clima") === "Lluvioso" && (await p.textContent(".leida[data-g=clima] .via")) === "Leída por el texto", "tarjeta sin QR → se lee el texto impreso, sin internet");
    await p.click("#manual summary"); await p.click("#op-clima-frio");
    ok(await leida(p, "clima") === "Frío" && (await p.textContent(".leida[data-g=clima] .via")) === "Elegida a mano", "elegir a mano también carga (y corrige) la tarjeta");
    await p.click("#scan-camara"); await p.waitForTimeout(800);
    ok((await p.textContent("#scan-estado")).includes("Sacar foto") && await p.$eval("#scan-alt", e => e.classList.contains("resalta")), "sin permiso de cámara → ofrece la foto");
    await p.screenshot({ path: `${out}/5-sin-camara.png` });
    ok(errs.length === 0, `sin errores de consola ${errs.join(" / ")}`);
    await p.close();
  }
  await b.close();
  // 3) Cámara en vivo con un video falso que muestra la tarjeta "Cita o salida especial"
  b = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${F}/camara.y4m`] });
  {
    const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, permissions: ["camera"] });
    const p = await ctx.newPage();
    await p.goto(process.env.URL); await p.waitForTimeout(400); await p.click("#crear");
    await p.click("#scan-camara"); await p.waitForTimeout(2500);
    ok(await leida(p, "evento") === "Cita o salida especial", "cámara en vivo lee el QR de la tarjeta");
    await p.screenshot({ path: `${out}/6-camara-en-vivo.png` });
    await p.click("#scan-camara"); ok(!(await p.$("#visor.vivo")), "la cámara se apaga");
    await ctx.close();
  }
  await b.close();
})();
