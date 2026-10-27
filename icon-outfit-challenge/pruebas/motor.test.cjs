// Corre el motor real (extraído de index.html o de src/) en Node y valida las reglas en las 256 combinaciones.
const fs = require("fs"), path = require("path");
const html = path.join(__dirname, "..", "index.html");
let src;
if (fs.existsSync(html)) src = fs.readFileSync(html, "utf8").match(/<script id="motor">([\s\S]*?)<\/script>/)[1];
else src = fs.readFileSync(path.join(__dirname, "..", "src", "lib-ilustracion.js"), "utf8") + fs.readFileSync(path.join(__dirname, "..", "src", "motor.js"), "utf8");
const m = { exports: {} }; new Function("module", src + "\nmodule.exports={ESTILOS,CLIMAS,EVENTOS,CATALOGO,generarLook,DIBUJOS,prendaPlana:typeof prendaPlana!=='undefined'?prendaPlana:null};")(m);
const { ESTILOS, CLIMAS, EVENTOS, generarLook, DIBUJOS } = m.exports;
const errores = [], firmas = new Map(); let n = 0;
const falla = (k, msg) => errores.push(`${k}: ${msg}`);
for (const e in ESTILOS) for (const c in CLIMAS) for (const v in EVENTOS) for (const vari of [0, 1]) {
  const k = `${e}/${c}/${v}#${vari}`, L = generarLook(e, c, v, vari); n++;
  const P = L.piezas, de = p => P.filter(x => x.papel === p), ids = P.map(p => p.it.id);
  const ev = EVENTOS[v];
  if (!(de("vestido").length === 1 || (de("top").length === 1 && de("bottom").length === 1))) falla(k, "base incompleta");
  if (de("calzado").length !== 1) falla(k, "sin calzado");
  if (de("bolso").length !== 1) falla(k, "sin bolso");
  for (const p of P) { if (p.it.cl && !p.it.cl.includes(c)) falla(k, `${p.it.id} no es para clima ${c}`); if (!DIBUJOS[p.it.dibujo]) falla(k, `sin dibujo ${p.it.dibujo}`); }
  const calz = de("calzado")[0].it, abr = de("abrigo")[0];
  if (c === "frio" && !(abr && abr.it.calor >= 2)) falla(k, "frío sin abrigo abrigado");
  if (c === "lluvia" && !(abr && abr.it.imper)) falla(k, "lluvia sin abrigo impermeable");
  if (c === "lluvia" && !calz.imper) falla(k, "lluvia con calzado no impermeable");
  if (c === "lluvia" && !ids.includes("paraguas")) falla(k, "lluvia sin paraguas");
  if (c === "calido" && abr) falla(k, "abrigo con calor");
  if ((c === "frio" || c === "lluvia") && calz.abierto) falla(k, "calzado abierto con frío/lluvia");
  if (ev.practico && calz.taco) falla(k, "taco en evento práctico");
  const piernas = de("vestido")[0] ? de("vestido")[0].it.tipo !== "pantalon" : de("bottom")[0].it.tipo !== "pantalon";
  if (piernas && (c === "frio" || c === "lluvia") && !de("medias").length) falla(k, "piernas al aire con frío/lluvia");
  if (ev.f >= 4.4 && P.some(p => p.it.f[1] < 2.5 && !["medias", "paraguas"].includes(p.papel))) falla(k, "prenda demasiado informal: " + P.filter(p => p.it.f[1] < 2.5).map(p => p.it.id));
  if (ev.f <= 1.6 && P.some(p => p.it.f[0] > 3.6)) falla(k, "prenda demasiado formal: " + P.filter(p => p.it.f[0] > 3.6).map(p => p.it.id));
  if (new Set(P.filter(p => p.it.slot).map(p => p.it.slot)).size !== P.filter(p => p.it.slot).length) falla(k, "accesorios en la misma zona");
  if (!L.nombre || L.porque.length !== 3 || !L.peinado || !L.maquillaje) falla(k, "faltan textos");
  if (/undefined|null|NaN/.test(JSON.stringify([L.nombre, L.porque, L.alternativa, P.map(p => p.texto)]))) falla(k, "texto con undefined");
  if (vari === 0) firmas.set(`${e}/${c}/${v}`, P.map(p => p.it.id + ":" + p.color.hex).join(","));
}
// Mismas tarjetas de clima y evento, distinto estilo → look distinto.
let iguales = 0;
for (const c in CLIMAS) for (const v in EVENTOS) { const s = Object.keys(ESTILOS).map(e => firmas.get(`${e}/${c}/${v}`)); iguales += s.length - new Set(s).size; }
if (iguales) errores.push(`${iguales} looks repetidos entre estilos`);
const distintos = new Set([...firmas.values()]).size;
const muestra = (e, c, v) => { const L = generarLook(e, c, v); return `\n### ${ESTILOS[e].nombre} · ${CLIMAS[c].nombre} · ${EVENTOS[v].nombre} → «${L.nombre}» (${L.tag})\n` + L.piezas.map(p => `${p.n}. [${p.papel}] ${p.texto}`).join("\n") + (L.sinAbrigo ? `\n· Tercera prenda: ${L.sinAbrigo}` : "") + `\n· Peinado: ${L.peinado}\n· Maquillaje: ${L.maquillaje}\n· Por qué: ${L.porque.join(" ")}\n· ${L.alternativa ? L.alternativa.titulo + " " + L.alternativa.texto : ""}`; };
console.log(`Combinaciones probadas: ${n} (256 × 2 versiones). Looks distintos (versión 1): ${distintos}/256.`);
const tipos = {}; errores.forEach(x => { const k = x.split(": ").slice(1).join(": "); tipos[k] = (tipos[k] || 0) + 1; });
console.log(errores.length ? `ERRORES (${errores.length}):\n` + Object.entries(tipos).map(([k, n]) => `  ${n}× ${k}`).join("\n") + "\n" + errores.slice(0, 15).join("\n") : "Todas las reglas se cumplen.");
console.log(muestra("elegante", "frio", "fiesta") + muestra("urbano", "calido", "amigos") + muestra("romantico", "templado", "cita"));
if (process.argv.includes("--mas")) console.log(muestra("deportivo", "lluvia", "formal") + muestra("boho", "frio", "airelibre") + muestra("glam", "lluvia", "clases") + muestra("minimal", "calido", "formal"));
process.exitCode = errores.length ? 1 : 0;
