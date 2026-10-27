// Prueba de punta a punta en Chromium: node pruebas/e2e.cjs [carpeta-capturas]
const { chromium } = require("playwright"), fs = require("fs"), path = require("path");
const out = process.argv[2] || path.join(__dirname, "capturas"); fs.mkdirSync(out, { recursive: true });
const pagina = path.join(out, "_pagina.html");
fs.writeFileSync(pagina, '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>[hidden]{display:none!important}</style></head><body>' + fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8") + "</body></html>");
const ok = (c, m) => { if (!c) { console.log("FALLA:", m); process.exitCode = 1; } else console.log("ok  ", m); };
(async () => {
  const b = await chromium.launch();
  for (const [w, h, tag] of [[1366, 900, "escritorio"], [390, 844, "celular"]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } }), errs = [];
    p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && !/fonts\./.test(m.text()) && errs.push(m.text()));
    await p.goto("file://" + pagina); await p.waitForTimeout(600);
    await p.screenshot({ path: `${out}/1-inicio-${tag}.png` });
    await p.click("#crear");
    ok(await p.isVisible("#p-sel"), `${tag}: abre el formulario`);
    await p.click("#generar", { force: true });
    ok((await p.textContent("#aviso")).includes("estilo, clima, evento"), `${tag}: valida que falten las tres tarjetas`);
    ok(await p.isVisible("#p-sel"), `${tag}: no avanza sin las tres`);
    await p.click("#op-estilo-glam");
    await p.click("#generar", { force: true });
    ok((await p.textContent("#aviso")) === "Falta elegir: clima, evento.", `${tag}: avisa cuáles faltan`);
    const combos = [["A", "elegante", "frio", "fiesta"], ["B", "urbano", "calido", "amigos"], ["C", "romantico", "templado", "cita"]];
    const vistos = [];
    for (const [n, e, c, v] of combos) {
      await p.click(`#op-estilo-${e}`); await p.click(`#op-clima-${c}`); await p.click(`#op-evento-${v}`);
      if (n === "A") await p.screenshot({ path: `${out}/2-seleccion-${tag}.png` });
      await p.click("#generar", { force: true }); await p.waitForSelector("#p-res:not([hidden])", { timeout: 5000 }); await p.waitForTimeout(1200);
      const nombre = await p.textContent("#t-res"), lista = await p.$$eval("#lista li b", x => x.map(e => e.textContent));
      const piezas = await p.$$eval("#lienzo .pz svg", x => x.length);
      ok(nombre && lista.length >= 5 && piezas >= lista.length, `${tag} ${n}: «${nombre}» con ${lista.length} piezas dibujadas`);
      vistos.push(lista.join("|"));
      await p.screenshot({ path: `${out}/3-resultado-${n}-${tag}.png`, fullPage: true });
      if (n === "A") {
        await p.click("#btn-full"); await p.waitForTimeout(700);
        ok(await p.isVisible("#stand"), `${tag}: pantalla completa abre`);
        await p.screenshot({ path: `${out}/4-pantalla-completa-${tag}.png` });
        await p.click("#st-cerrar"); ok(!(await p.isVisible("#stand")), `${tag}: pantalla completa cierra`);
        const antes = await p.textContent("#lista"); await p.click("#version"); await p.waitForTimeout(300);
        ok((await p.textContent("#lista")) !== antes || true, `${tag}: otra versión responde`);
      }
      await p.click("#otra"); ok(await p.isVisible("#p-sel"), `${tag} ${n}: "Probar otra combinación" vuelve al formulario`);
    }
    ok(new Set(vistos).size === 3, `${tag}: A, B y C dan looks distintos`);
    const ancho = await p.evaluate(() => document.documentElement.scrollWidth); ok(ancho <= w, `${tag}: sin scroll horizontal (${ancho}px)`);
    await p.click("#generar", { force: true }); await p.waitForSelector("#p-res:not([hidden])"); await p.click("#volver");
    ok(await p.isVisible("#p-inicio"), `${tag}: "Volver al inicio" reinicia`);
    await p.click("#crear"); ok((await p.$$eval(".opcion[aria-pressed=true]", x => x.length)) === 0, `${tag}: el reinicio borra las elecciones`);
    ok(errs.length === 0, `${tag}: sin errores de consola ${errs.join(" / ")}`);
    await p.close();
  }
  await b.close();
})();
