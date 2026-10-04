// Arma cada Edge Function como UN archivo autocontenido, para pegarla en el editor web de Supabase
// (Edge Functions → Deploy a new function → Via Editor). Uso: node scripts/armar-funciones.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const shared = f => readFileSync(join(raiz, "supabase/functions/_shared", f), "utf8");
const sinExports = t => t.replace(/^export \{[^}]*\};?\s*$/m, "").replace(/^export (async function|function|const)/gm, "$1");
const motor = sinExports(shared("motor.js"));
const handlers = sinExports(shared("handlers.js").replace(/^import .* from "\.\/motor\.js";\s*$/m, ""));
const http = sinExports(shared("http.js"));
const FUNCIONES = { "start-game": "startGame", "submit-score": "submitScore", "admin-login": "adminLogin", "admin-action": "adminAction" };
mkdirSync(join(raiz, "supabase/para-pegar"), { recursive: true });
for (const [nombre, handler] of Object.entries(FUNCIONES)) {
  const salida = `// @ts-nocheck\n// ${nombre} · ARCHIVO GENERADO por scripts/armar-funciones.mjs. Copiá TODO y pegalo en el editor de Supabase.\n`
    + `${http}\n// ---------------- motor del juego ----------------\n${motor}\n// ---------------- lógica ----------------\n${handlers}\nDeno.serve(servir(${handler}));\n`;
  writeFileSync(join(raiz, "supabase/para-pegar", `${nombre}.ts`), salida);
  console.log(`supabase/para-pegar/${nombre}.ts`, (salida.length / 1024).toFixed(0), "KB");
}
