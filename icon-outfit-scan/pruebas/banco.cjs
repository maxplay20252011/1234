// Mide el escáner con el banco de fotos: node pruebas/banco.cjs CARPETA_BANCO [html]
// Cuenta una foto como bien leída si carga exactamente las tarjetas esperadas.
const { chromium } = require("playwright"), fs = require("fs"), path = require("path");
const dir = process.argv[2], html = process.argv[3] || path.join(__dirname, "..", "index.html");
const casos = JSON.parse(fs.readFileSync(path.join(dir, "casos.json"), "utf8"));
const pagina = path.join(dir, "_pagina.html");
fs.writeFileSync(pagina, '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>[hidden]{display:none!important}</style></head><body>' + fs.readFileSync(html, "utf8") + "</body></html>");
const vend = path.join(path.dirname(path.resolve(html)), "vendor");
if (fs.existsSync(vend)) { fs.mkdirSync(path.join(dir, "vendor"), { recursive: true }); for (const f of fs.readdirSync(vend)) fs.copyFileSync(path.join(vend, f), path.join(dir, "vendor", f)); }
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  if (process.env.JSQR) await p.route(/jsQR\.js$/, r => r.fulfill({ path: process.env.JSQR, contentType: "text/javascript" }));
  await p.goto(process.env.URL || "file://" + pagina); await p.waitForTimeout(600);
  let bien = 0, tiempo = 0, tarjetas = 0, totalT = 0, malas = 0; const fallas = [], vias = {};
  for (const c of casos) {
    await p.click("#nuevo"); await p.click("#crear");
    const t0 = Date.now();
    await p.setInputFiles("#scan-foto", path.join(dir, c.archivo));
    if (await p.evaluate(() => !!window.ICON_LECTOR)) { await p.waitForFunction(() => window.ICON_LECTOR.ocupado(), null, { timeout: 5000 }).catch(() => {}); await p.waitForFunction(() => !window.ICON_LECTOR.ocupado(), null, { timeout: 90000 }); }
    else { await p.waitForTimeout(100); await p.waitForFunction(() => !/^(Buscando|Analizando)/.test(document.querySelector("#scan-estado").textContent), null, { timeout: 60000 }); }
    const det = await p.evaluate(() => window.ICON_LECTOR ? `${window.ICON_LECTOR.ultima.ms}ms ${window.ICON_LECTOR.ultima.motor} ocr=«${window.ICON_LECTOR.ultima.ocr}»` : "");
    tiempo += Date.now() - t0;
    const leido = await p.$$eval(".opcion[aria-pressed=true]", x => x.map(e => e.dataset.g + ":" + e.dataset.k).sort());
    const via = await p.$$eval(".leida .via", x => x.map(e => e.textContent).filter(Boolean));
    via.forEach(v => { vias[v] = (vias[v] || 0) + 1; });
    tarjetas += leido.filter(x => c.esperado.includes(x)).length; totalT += c.esperado.length; malas += leido.filter(x => !c.esperado.includes(x)).length;
    if (JSON.stringify(leido) === JSON.stringify(c.esperado)) bien++;
    else fallas.push(`${c.archivo} tam=${c.tam} giro=${c.giro} persp=${c.persp} blur=${c.blur} luz=${c.luz} reflejo=${c.reflejo} ruido=${c.ruido} → ${leido.join(",") || "nada"} (esperado ${c.esperado.join(",")}) ${det}`);
  }
  console.log("Tarjetas cargadas por vía:", JSON.stringify(vias));
  console.log(`Bien leídas: ${bien}/${casos.length} (${Math.round(bien / casos.length * 100)} %) · tiempo medio ${Math.round(tiempo / casos.length)} ms`);
  console.log(`Tarjetas correctas: ${tarjetas}/${totalT} · equivocadas: ${malas}`);
  if (process.argv.includes("--fallas")) console.log(fallas.join("\n"));
  await b.close();
})();
