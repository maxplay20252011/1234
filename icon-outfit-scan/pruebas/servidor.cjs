// Servidor estático para pruebas, con una CSP parecida a la del visor de artefactos.
// node pruebas/servidor.cjs CARPETA PUERTO [sin-wasm]
const http = require("http"), fs = require("fs"), path = require("path");
const [dir, puerto, modo] = process.argv.slice(2);
const wasm = modo === "sin-wasm" ? "" : " 'wasm-unsafe-eval'";
const CSP = `default-src 'none'; script-src 'self' 'unsafe-inline' blob:${wasm} https://cdnjs.cloudflare.com https://cdn.jsdelivr.net/npm/ https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:`;
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".gz": "application/gzip", ".jpg": "image/jpeg", ".png": "image/png" };
http.createServer((req, res) => {
  const f = path.join(dir, decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html");
  if (!f.startsWith(path.resolve(dir)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TIPOS[path.extname(f)] || "application/octet-stream", "Content-Security-Policy": CSP });
  fs.createReadStream(f).pipe(res);
}).listen(+puerto, () => console.log(`sirviendo ${dir} en http://localhost:${puerto} (${modo || "con wasm"})`));
