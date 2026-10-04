// Copia los datos y el motor de puntaje del juego (index.html) al servidor.
// Uso: node scripts/extraer-motor.mjs   (correlo cada vez que cambies prendas, consignas o reglas)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(raiz, "index.html"), "utf8");
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const seccion = (desde, hasta) => {
  const a = js.indexOf(desde), b = js.indexOf(hasta);
  if (a < 0 || b < 0 || b < a) throw new Error(`No encontré la sección "${desde}"`);
  return js.slice(a, b);
};
const MARCA = "/* =====================================================================\n   ";
// 1) Configuración  +  3) Catálogo, 4) Consignas, 5) Motor. Se omite 2) Ilustración y lo visual.
const codigo = seccion(MARCA + "1) CONFIG", MARCA + "2) ILUSTRACIÓN") + seccion(MARCA + "3) DATOS", MARCA + "6) AVATAR");
const salida = `// ARCHIVO GENERADO por scripts/extraer-motor.mjs a partir de index.html. No lo edites a mano.
// eslint-disable
${codigo}
export { CONFIG, REGLAS, CATALOGO, CONSIGNAS, POR_ID, aplicarPrenda, faltantes, puntuarLook, sortearConsignas, lookValido, puntuarPartida };
`;
writeFileSync(join(raiz, "supabase/functions/_shared/motor.js"), salida);
console.log("motor.js actualizado:", (salida.length / 1024).toFixed(1), "KB");
