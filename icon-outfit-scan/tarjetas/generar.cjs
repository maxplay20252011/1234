// Arma tarjetas.pdf (A4, 63×88 mm) y una imagen por tarjeta: node tarjetas/generar.cjs
// Requiere Playwright con Chromium y qrs.json (python3 tarjetas/qrs.py > tarjetas/qrs.json).
const { chromium } = require("playwright"), fs = require("fs"), path = require("path");
const d = __dirname, index = path.join(d, "..", "index.html"), jsqr = process.env.JSQR;
const QR = JSON.parse(fs.readFileSync(path.join(d, "qrs.json"), "utf8"));
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ deviceScaleFactor: 3 });
  if (jsqr) await p.route(/jsQR\.js$/, r => r.fulfill({ path: jsqr, contentType: "text/javascript" }));
  const tmp = path.join(d, "_index.html");
  fs.writeFileSync(tmp, '<!doctype html><html><head><meta charset="utf-8"></head><body>' + fs.readFileSync(index, "utf8") + "</body></html>");
  await p.goto("file://" + tmp); await p.waitForTimeout(500);
  const datos = await p.evaluate(() => ["estilo", "clima", "evento"].map(g => ({ g, ops: [...document.querySelectorAll(`#g-${g} .opcion`)].map(o => ({ k: o.dataset.k, nombre: o.querySelector(".nom").textContent, ilu: o.querySelector(".ilu").innerHTML })) })));
  fs.unlinkSync(tmp);
  const CAT = { estilo: ["1", "Estilo personal", "#6B2FB3"], clima: ["2", "Clima", "#7E6AA6"], evento: ["3", "Tipo de evento", "#4E1F87"] };
  const carta = (g, o) => `<div class="carta" id="c-${g}-${o.k}" style="--c:${CAT[g][2]}">
    <div class="cab"><span>TARJETA ${CAT[g][0]}</span><span>${CAT[g][1].toUpperCase()}</span></div>
    <div class="ilu">${o.ilu}</div>
    <h2>${o.nombre}</h2>
    <div class="pie"><div class="marca"><b>ICON</b><small>Tu imagen,<br>tus reglas</small></div><div class="qr">${QR[g + "|" + o.k]}</div></div>
  </div>`;
  const hojas = datos.map(({ g, ops }) => `<section class="hoja">${ops.map(o => carta(g, o)).join("")}</section>`).join("");
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,500;1,6..96,400&family=Jost:wght@400;500;600&display=swap">
  <style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; } body { margin: 0; font-family: Jost, "Futura", sans-serif; color: #221A30; }
  .hoja { width: 210mm; height: 297mm; padding: 13mm 9mm; display: grid; grid-template-columns: repeat(3, 63mm); grid-auto-rows: 88mm; gap: 3mm; justify-content: center; align-content: start; page-break-after: always; }
  .carta { width: 63mm; height: 88mm; background: #FCFAF6; border: .3mm dashed #B8BBC5; border-radius: 3.5mm; padding: 4.5mm; display: flex; flex-direction: column; position: relative; }
  .carta::before { content: ""; position: absolute; inset: 2mm; border: .25mm solid #DCD4EA; border-radius: 2.5mm; pointer-events: none; }
  .cab { display: flex; justify-content: space-between; font-size: 2.3mm; font-weight: 600; letter-spacing: .14em; color: var(--c); }
  .ilu { flex: 1; display: grid; place-items: center; min-height: 0; padding: 1.5mm 0; }
  .ilu svg { max-width: 30mm; max-height: 24mm; width: 100%; height: 100%; color: var(--c); }
  h2 { margin: 0 0 2.5mm; font: 500 7mm/1.02 "Bodoni Moda", Georgia, serif; text-align: center; text-wrap: balance; }
  .pie { display: flex; align-items: flex-end; justify-content: space-between; }
  .marca b { font: 600 4.2mm/1 "Bodoni Moda", Georgia, serif; letter-spacing: .14em; display: block; }
  .marca small { font-size: 2.1mm; color: #5E5478; letter-spacing: .06em; line-height: 1.25; display: block; margin-top: 1mm; }
  .qr { width: 23mm; height: 23mm; background: #fff; padding: 1.6mm; border-radius: 1.5mm; }
  .qr svg { width: 100%; height: 100%; display: block; }
  </style></head><body>${hojas}</body></html>`);
  await p.waitForTimeout(1500);
  await p.pdf({ path: path.join(d, "tarjetas-icon-outfit.pdf"), format: "A4", printBackground: true });
  fs.mkdirSync(path.join(d, "png"), { recursive: true });
  await p.setViewportSize({ width: 800, height: 1131 });
  for (const { g, ops } of datos) for (const o of ops) await (await p.$(`#c-${g}-${o.k}`)).screenshot({ path: path.join(d, "png", `${g}-${o.k}.png`), scale: "device" });
  await (await p.$(".hoja")).screenshot({ path: path.join(d, "vista-hoja-estilos.png") });
  await b.close(); console.log("ok: tarjetas-icon-outfit.pdf + png/ (20)");
})();
