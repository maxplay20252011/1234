// Genera hojas con texto manuscrito y digital (sin QR) para medir la lectura de texto:
//   node pruebas/banco-texto.cjs CARPETA      → CARPETA/hojas/*.png + CARPETA/hojas.json
// Después: python3 pruebas/banco-texto.py CARPETA  (las convierte en fotos de celular)
const { chromium } = require("playwright"), fs = require("fs"), path = require("path");
const out = process.argv[2]; fs.mkdirSync(path.join(out, "hojas"), { recursive: true });
let semilla = 11; const rnd = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647, elegir = a => a[Math.floor(rnd() * a.length)];
// Cómo lo escribiría una persona: con y sin tildes, mayúsculas o minúsculas.
const OPC = [
  ["estilo", "elegante", ["Elegante"]], ["estilo", "casual", ["Casual"]], ["estilo", "urbano", ["Urbano"]], ["estilo", "minimal", ["Minimalista"]],
  ["estilo", "romantico", ["Romántico", "Romantico"]], ["estilo", "glam", ["Glam"]], ["estilo", "deportivo", ["Deportivo"]], ["estilo", "boho", ["Boho"]],
  ["clima", "calido", ["Cálido", "Calido"]], ["clima", "templado", ["Templado"]], ["clima", "frio", ["Frío", "Frio"]], ["clima", "lluvia", ["Lluvioso"]],
  ["evento", "amigos", ["Salida con amigos"]], ["evento", "fiesta", ["Fiesta nocturna"]], ["evento", "elegante", ["Evento elegante"]], ["evento", "clases", ["Día de clases", "Dia de clases"]],
  ["evento", "cita", ["Cita o salida especial", "Cita"]], ["evento", "airelibre", ["Paseo al aire libre"]], ["evento", "formal", ["Evento formal"]], ["evento", "casual", ["Día casual", "Dia casual"]],
];
const MANO = ["Caveat", "Indie Flower", "Patrick Hand", "Shadows Into Light", "Kalam", "Gloria Hallelujah", "Reenie Beanie", "Homemade Apple"];
const DIGITAL = ["Roboto", "Open Sans", "Montserrat", "Lora", "Bebas Neue", "Merriweather"];
const caja = s => elegir([s, s.toUpperCase(), s.toLowerCase()]);
const casos = [];
for (let i = 0; i < 70; i++) {
  const tipo = i < 42 ? "mano" : "digital";
  const multi = i % 7 === 6; // algunas hojas con las tres tarjetas escritas
  const elegidas = multi ? ["estilo", "clima", "evento"].map(g => elegir(OPC.filter(o => o[0] === g))) : [elegir(OPC)];
  const conCat = rnd() < 0.3 && !multi; // a veces escriben la categoría: "Clima: frío"
  const lineas = elegidas.map(([g, k, t]) => (conCat ? { estilo: "Estilo: ", clima: "Clima: ", evento: "Evento: " }[g] : "") + caja(elegir(t)));
  const fuente = tipo === "mano" ? elegir(MANO) : elegir(DIGITAL);
  const fondo = tipo === "mano" ? elegir(["papel", "rayado", "post-it"]) : elegir(["pantalla-clara", "pantalla-oscura", "impreso"]);
  const tinta = tipo === "mano" ? elegir(["#1d2a6b", "#1a1a1a", "#2a3f9e", "#0d0d0d"]) : fondo === "pantalla-oscura" ? "#f2f2f2" : "#151515";
  casos.push({ archivo: `hoja${String(i).padStart(2, "0")}.png`, tipo, fondo, fuente, lineas, esperado: elegidas.map(([g, k]) => `${g}:${k}`).sort(), rot: (rnd() - 0.5) * 8 });
  Object.assign(casos[i], { tinta, tam: tipo === "mano" ? 64 + rnd() * 40 : 52 + rnd() * 34 });
}
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1000, height: 760 }, deviceScaleFactor: 2 });
  const familias = [...new Set([...MANO, ...DIGITAL])].map(f => "family=" + f.replace(/ /g, "+")).join("&");
  for (const c of casos) {
    const fondoCss = { papel: "background:#fbf8f0", rayado: "background:#fbfbf6 repeating-linear-gradient(transparent 0 46px,#9fb8d8 46px 48px)", "post-it": "background:#fbe88a",
      "pantalla-clara": "background:#ffffff", "pantalla-oscura": "background:#1e1f24", impreso: "background:#f7f7f4" }[c.fondo];
    await p.setContent(`<!doctype html><html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?${familias}&display=block">
      <style>body{margin:0}#h{width:1000px;height:760px;${fondoCss};display:flex;flex-direction:column;justify-content:center;align-items:${c.tipo === "mano" ? "flex-start" : "center"};gap:28px;padding:60px 90px;box-sizing:border-box}
      #h div{font-family:'${c.fuente}',cursive;font-size:${c.tam.toFixed(0)}px;color:${c.tinta};line-height:1.1;transform:rotate(${c.rot.toFixed(1)}deg)}
      ${c.fondo.startsWith("pantalla") ? "#h::before{content:'';position:absolute;inset:0 0 auto 0;height:54px;background:" + (c.fondo === "pantalla-oscura" ? "#2c2d33" : "#eef0f3") + "}" : ""}</style></head>
      <body><div id="h">${c.lineas.map((l, j) => `<div style="margin-left:${c.tipo === "mano" ? Math.round(rnd() * 120) : 0}px">${l}</div>`).join("")}</div></body></html>`);
    await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(150);
    await (await p.$("#h")).screenshot({ path: path.join(out, "hojas", c.archivo) });
  }
  fs.writeFileSync(path.join(out, "hojas.json"), JSON.stringify(casos, null, 1));
  await b.close(); console.log(casos.length, "hojas en", out);
})();
