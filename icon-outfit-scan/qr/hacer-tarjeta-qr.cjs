// Tarjeta del QR (PNG 1200×1600 y PDF A4): node qr/hacer-tarjeta-qr.cjs URL SALIDA_SIN_EXTENSION
const { chromium } = require("playwright"), fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const [url, salida] = process.argv.slice(2), d = __dirname, raiz = path.join(d, "..");
const svg = execFileSync("python3", ["-I", path.join(d, "hacer-tarjeta-qr.py"), url]).toString();
const logo = "data:image/png;base64," + fs.readFileSync(path.join(raiz, "assets", "icon-logo.png")).toString("base64");
const corto = url.replace(/^https?:\/\//, "");
const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,500;0,6..96,600;1,6..96,400&family=Jost:wght@400;500;600&display=block">
<style>
*{box-sizing:border-box;margin:0}
body{background:#fff}
#c{width:1200px;height:1600px;position:relative;overflow:hidden;background:#F6F2FB;font-family:Jost,"Segoe UI",sans-serif;color:#221A30;display:flex;flex-direction:column;align-items:center}
.banda{width:100%;height:430px;padding-bottom:64px;background:linear-gradient(160deg,#BBA6F2 0%,#A58AE6 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;position:relative;flex:none}
.banda::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:44px;background:#F6F2FB;border-radius:44px 44px 0 0}
.logo{width:200px;height:200px;filter:drop-shadow(0 18px 28px rgba(60,30,120,.35))}
.marca{font:600 56px/1 "Bodoni Moda",Georgia,serif;letter-spacing:.2em;padding-left:.2em;color:#1E1530}
.lema{font-size:28px;letter-spacing:.22em;text-transform:uppercase;font-weight:500;color:#2A1F40}
h1{font:500 78px/.98 "Bodoni Moda",Georgia,serif;text-align:center;margin-top:14px;letter-spacing:-.01em}
h1 em{font-style:italic;font-weight:400;color:#6B2FB3}
.sub{font:500 42px/1.2 Jost,sans-serif;text-align:center;margin-top:14px;color:#3A2E52}
.sub b{color:#6B2FB3;font-weight:600}
.qr{margin-top:26px;background:#fff;border-radius:32px;padding:38px;box-shadow:0 30px 60px -34px rgba(34,26,48,.55);border:2px solid #DFD6EC}
.qr svg{display:block;width:584px;height:584px}
.pasos{display:flex;gap:18px;margin-top:34px}
.paso{width:350px;display:flex;align-items:center;gap:14px;font-size:29px;line-height:1.15;font-weight:500}
.paso i{flex:none;width:52px;height:52px;border-radius:50%;background:#6B2FB3;color:#fff;font:600 29px/52px Jost;text-align:center;font-style:normal}
.url{position:absolute;bottom:26px;font-size:28px;letter-spacing:.02em;color:#4A3F63;font-weight:500}
</style></head><body><div id="c">
<div class="banda"><img class="logo" src="${logo}" alt=""><div class="marca">ICON</div><div class="lema">Tu imagen, tus reglas</div></div>
<h1>ICON <em>Outfit</em><br>Challenge</h1>
<p class="sub">Escaneá este código para <b>jugar</b></p>
<div class="qr">${svg}</div>
<div class="pasos"><div class="paso"><i>1</i>Elegí tus 3 tarjetas</div><div class="paso"><i>2</i>Sacales una foto</div><div class="paso"><i>3</i>Descubrí tu look</div></div>
<div class="url">${corto}</div>
</div></body></html>`;
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1200, height: 1600 } });
  await p.setContent(html); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(600);
  await (await p.$("#c")).screenshot({ path: salida + ".png" });
  await b.close();
})();
