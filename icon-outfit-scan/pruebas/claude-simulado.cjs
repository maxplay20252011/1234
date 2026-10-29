// Verifica el circuito de lectura con Claude simulando el visor (window.claude.use("sample")):
//   URL=http://localhost:8811/index.html FOTOS=carpeta node pruebas/claude-simulado.cjs
// FOTOS debe tener sin-qr.png. Claude simulado: el modelo rápido no encuentra nada y el preciso lee "Glam / Fiesta nocturna".
const { chromium } = require("playwright");
const ok = (c, m) => { if (!c) { console.log("FALLA:", m); process.exitCode = 1; } else console.log("ok  ", m); };
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1366, height: 900 } });
  await p.addInitScript(() => {
    window.__llamadas = [];
    const sample = async () => ({ text: "" });
    sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 4, maxInputBytes: 2e7, mediaTypes: ["image/jpeg", "image/png"] } });
    sample.json = async (prompt, o) => {
      window.__llamadas.push({ tier: o.modelTier, imagenes: !!o.images, menciona: /escrito a mano/.test(prompt) });
      await new Promise(r => setTimeout(r, 200));
      return o.modelTier === "quick" ? { estilo: null, clima: null, evento: null, leido: "" } : { estilo: "glam", clima: null, evento: "Fiesta nocturna", leido: "Glam / Fiesta nocturna" };
    };
    window.claude = { use: async n => (n === "sample" ? sample : null) };
  });
  await p.goto(process.env.URL); await p.waitForTimeout(600); await p.click("#crear");
  await p.click("details.diag summary");
  ok((await p.textContent("#diag-lista")).includes("disponible"), "el estado del lector muestra Claude disponible");
  // Foto que la lectura local no entiende (una imagen sin texto): pasa a Claude solo
  await p.setInputFiles("#scan-foto", { name: "garabato.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==", "base64") });
  await p.waitForFunction(() => window.ICON_LECTOR.ocupado(), null, { timeout: 3000 }).catch(() => {});
  await p.waitForFunction(() => !window.ICON_LECTOR.ocupado(), null, { timeout: 90000 });
  const ll = await p.evaluate(() => window.__llamadas);
  ok(ll.length === 2 && ll[0].tier === "quick" && ll[1].tier === "default" && ll.every(x => x.imagenes && x.menciona), "sin resultado local: Claude rápido y después el preciso, con la foto y la instrucción para letra a mano");
  ok(await p.$eval('.leida[data-g="estilo"] .valor', e => e.textContent) === "Glam" && await p.$eval('.leida[data-g="evento"] .valor', e => e.textContent) === "Fiesta nocturna", "lo que leyó Claude carga Glam y Fiesta nocturna");
  ok(await p.$eval('.leida[data-g="estilo"] .via', e => e.textContent) === "Leída por Claude", "indica que lo leyó Claude");
  ok(await p.isVisible("#scan-claude"), "falta el clima: aparece «Leer esta foto con Claude»");
  await p.click("#scan-claude");
  await p.waitForFunction(() => !window.ICON_LECTOR.ocupado(), null, { timeout: 30000 }); await p.waitForTimeout(400);
  const ll2 = await p.evaluate(() => window.__llamadas);
  ok(ll2.length === 3 && ll2[2].tier === "default", "el botón usa directamente el modelo preciso");
  ok((await p.textContent("#scan-estado")).includes("Claude leyó lo mismo"), "el botón informa el resultado");
  await b.close();
})();
