// Prueba el intérprete de tarjetas (QR y texto impreso): node pruebas/lector.test.cjs
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const src = html.match(/<script id="motor">([\s\S]*?)<\/script>/)[1] + html.match(/<script id="lector">([\s\S]*?)<\/script>/)[1];
const m = { exports: {} }; new Function("module", src + "\nmodule.exports={interpretar,interpretarDifuso,ESTILOS,CLIMAS,EVENTOS};")(m);
const { interpretar, ESTILOS, CLIMAS, EVENTOS } = m.exports;
const fmt = l => l.map(x => `${x.g}:${x.k}`).sort().join(" ");
let mal = 0, n = 0;
const caso = (txt, esperado) => { n++; const r = fmt(interpretar(txt)); if (r !== esperado) { mal++; console.log(`FALLA  ${JSON.stringify(txt)} → "${r}" (esperado "${esperado}")`); } };
// Todas las tarjetas: QR y texto impreso tal como sale en la tarjeta
for (const [g, D] of [["estilo", ESTILOS], ["clima", CLIMAS], ["evento", EVENTOS]]) for (const k in D) {
  caso(`ICON|${g}|${k}`, `${g}:${k}`);
  caso(`TARJETA · ${g === "estilo" ? "ESTILO PERSONAL" : g === "clima" ? "CLIMA" : "TIPO DE EVENTO"}\n${D[k].nombre}`, `${g}:${k}`);
}
caso("Evento elegante", "evento:elegante");
caso("Elegante", "estilo:elegante");
caso("Día casual", "evento:casual");
caso("CASUAL", "estilo:casual");
caso("Romántico, frío y fiesta nocturna", "clima:frio estilo:romantico evento:fiesta");
caso("Estilo: casual · Evento: día casual", "estilo:casual evento:casual");
caso("Cita o salida especial", "evento:cita");
caso("Paseo al aire libre con lluvia", "clima:lluvia evento:airelibre");
caso("informal", "");
caso("ICON|estilo|inventado", "");
caso("https://claude.ai/artifact/xyz", "");
caso("", "");
// Texto leído de fotos (manuscrito o pantalla) con errores típicos del lector
const casoD = (txt, esperado) => { n++; const r = fmt(m.exports.interpretarDifuso(txt)); if (r !== esperado) { mal++; console.log(`FALLA difuso ${JSON.stringify(txt)} → "${r}" (esperado "${esperado}")`); } };
casoD("Cita o Salida e Special", "evento:cita");
casoD("Veyoriivo cálido exento elegante", "clima:calido estilo:deportivo evento:elegante");
casoD("Pasco al aire libre Templado", "clima:templado evento:airelibre");
casoD("Elegarte", "estilo:elegante");
casoD("Minimalisto", "estilo:minimal");
casoD("Lluvi0so", "clima:lluvia");
casoD("FIESTA NOCTURNA", "evento:fiesta");
casoD("Dia de clase", "evento:clases");
casoD("salida", "");
casoD("E e T a u Ss N u E", "");
casoD("Clima: frio", "clima:frio");
casoD("e e a o ia a e Er e L Estilo casual TF TT NENE NOE", "estilo:casual");
console.log(`${n - mal}/${n} casos bien`);
process.exitCode = mal ? 1 : 0;
