#!/usr/bin/env node
/* =========================================================================
   Bank Tycoon — intro MAXWER
   render.mjs · Captura DETERMINÍSTICA de frames.

   Clave del pipeline pixel-perfect: la captura es a RESOLUCIÓN BAJA
   (270x480 en vertical). El upscale x4 a 1080x1920 lo hace ffmpeg con
   nearest-neighbor en build.sh. Nunca se escala en el navegador para el
   video, así que no hay una sola interpolación.

   No graba "en vivo": para cada frame llama a window.INTRO.seek(t) con
   t = i/fps y saca la captura. La lógica interna está cuantizada a 20
   ticks/s, así que cada tick ocupa exactamente 3 frames.

   Uso:
     node scripts/render.mjs --format=vertical
     node scripts/render.mjs --format=vertical --with-alpha
     node scripts/render.mjs --format=vertical --variant=short
     node scripts/render.mjs --stills-only
     node scripts/render.mjs --serve
   ========================================================================= */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/* ---------------------------- argumentos ------------------------------- */
const argv = process.argv.slice(2);
const arg = (name, def = null) => {
  const hit = argv.find(a => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return def;
  const eq = hit.indexOf('=');
  return eq === -1 ? true : hit.slice(eq + 1);
};
const OPT = {
  format: String(arg('format', 'vertical')),
  variant: arg('variant', null),
  duration: arg('duration', null),
  configPath: String(arg('config', 'config.json')),
  alphaOnly: arg('alpha', false) === true,
  withAlpha: arg('with-alpha', false) === true,
  stillsOnly: arg('stills-only', false) === true,
  serve: arg('serve', false) === true,
  quiet: arg('quiet', false) === true
};

const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, OPT.configPath), 'utf8'));
const FMT = CFG.formats[OPT.format];
if (!FMT) { console.error(`Formato desconocido: ${OPT.format}. Opciones: ${Object.keys(CFG.formats).join(', ')}`); process.exit(1); }

const FPS = CFG.timeline.fps;
let DURATION = CFG.timeline.duration;
if (OPT.variant && CFG.variants?.[OPT.variant]) DURATION = CFG.variants[OPT.variant].duration;
if (OPT.duration) DURATION = parseFloat(OPT.duration);

const TOTAL = Math.round(DURATION * FPS);
const UP = FMT.width / FMT.lowWidth;
const TAG = `${OPT.format}_${DURATION.toFixed(2).replace(/\.?0+$/, '')}s`;
const OUT = path.join(ROOT, CFG.render.outDir || 'out');
const log = (...a) => { if (!OPT.quiet) console.log(...a); };

if (UP !== FMT.height / FMT.lowHeight || UP !== Math.round(UP)) {
  console.error(`El upscale tiene que ser un entero igual en x e y: ${FMT.lowWidth}x${FMT.lowHeight} -> ${FMT.width}x${FMT.height}`);
  process.exit(1);
}

/* ------------------------- server local estático ----------------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png' };

function startServer() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
      const file = path.join(ROOT, rel || 'src/intro.html');
      if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404).end('404'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(buf);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

/* ------------------------------ chromium ------------------------------- */
function chromePath() {
  const env = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
  if (env && fs.existsSync(env)) return env;
  for (const p of ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
                   '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

const FLAGS = [
  '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
  '--hide-scrollbars', '--force-color-profile=srgb', '--force-device-scale-factor=1',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows', '--disable-gpu',
  // Rasterizado repetible entre corridas y entre máquinas
  '--disable-skia-runtime-opts', '--disable-partial-raster',
  '--disable-checker-imaging', '--disable-threaded-animation'
];

let BASE = '';

async function openPage(browser, { alpha }) {
  const page = await browser.newPage();
  // Viewport = resolución BAJA: la captura sale 1:1 con el canvas
  await page.setViewport({ width: FMT.lowWidth, height: FMT.lowHeight, deviceScaleFactor: 1 });
  const q = new URLSearchParams({ format: OPT.format });
  if (OPT.variant) q.set('variant', OPT.variant);
  else if (OPT.duration) q.set('duration', String(DURATION));
  if (alpha) q.set('alpha', '1');
  await page.goto(`${BASE}/src/intro.html?${q}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__INTRO_READY__ === true || window.__INTRO_ERROR__', { timeout: 30000 });
  const err = await page.evaluate(() => window.__INTRO_ERROR__ || null);
  if (err) throw new Error('Error en animation.js:\n' + err);
  return page;
}

const seekTo = (page, t) =>
  page.evaluate(t => { window.INTRO.seek(t); return document.body.offsetHeight; }, t);

/* --------- upscale nearest hecho en el canvas (para los stills) --------- *
 * Mismo resultado que scale=flags=neighbor: cada píxel se replica UPxUP.  */
async function grabUpscaled(page, up, crop) {
  const b64 = await page.evaluate((up, crop) => {
    const src = document.getElementById('stage');
    const sx = crop ? crop.x : 0, sy = crop ? crop.y : 0;
    const sw = crop ? crop.w : src.width, sh = crop ? crop.h : src.height;
    const c = document.createElement('canvas');
    c.width = sw * up; c.height = sh * up;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return c.toDataURL('image/png').split(',')[1];
  }, up, crop || null);
  return Buffer.from(b64, 'base64');
}

/* ------------------------- verificación safe area ---------------------- */
async function checkSafeArea(page) {
  const bad = [];
  const lim = { top: FMT.safeTop, bottom: FMT.height - FMT.safeBottom,
                left: FMT.safeSide, right: FMT.width - FMT.safeSide };
  // Un chequeo por tick lógico: entre ticks nada se mueve.
  const tps = CFG.timeline.ticksPerSecond;
  for (let k = 0; k <= Math.round(DURATION * tps); k++) {
    const t = Math.min(k / tps, DURATION);
    await seekTo(page, t);
    const boxes = await page.evaluate(() => window.INTRO.measure());
    for (const b of boxes) {
      const v = [];
      if (b.top < lim.top - 0.5) v.push(`top ${b.top.toFixed(0)}<${lim.top}`);
      if (b.bottom > lim.bottom + 0.5) v.push(`bottom ${b.bottom.toFixed(0)}>${lim.bottom}`);
      if (b.left < lim.left - 0.5) v.push(`left ${b.left.toFixed(0)}<${lim.left}`);
      if (b.right > lim.right + 0.5) v.push(`right ${b.right.toFixed(0)}>${lim.right}`);
      if (v.length) bad.push({ t: +t.toFixed(3), id: b.id, issues: v });
    }
  }
  return bad;
}

/* ------------------------------- stills -------------------------------- */
async function renderStills(page) {
  const dir = path.join(OUT, 'preview');
  const lowDir = path.join(dir, 'low');
  await fsp.mkdir(lowDir, { recursive: true });
  const files = [];
  for (const t of (CFG.render.stills || [])) {
    if (t > DURATION) continue;
    await seekTo(page, t);
    const name = `still_${t.toFixed(2)}s_${OPT.format}.png`;
    // Nativo 270x480 y la versión final ya escalada x4 con nearest
    await page.screenshot({ path: path.join(lowDir, name), type: 'png' });
    const big = path.join(dir, name);
    await fsp.writeFile(big, await grabUpscaled(page, UP));
    files.push(path.relative(ROOT, big));
    log(`  still t=${t.toFixed(2)}s -> ${path.relative(ROOT, big)}`);
  }

  // Recorte con zoom x8 sobre el título: para mirar si el píxel es cuadrado
  const zt = (CFG.render.stills || []).reduce((a, b) => Math.abs(b - 2.5) < Math.abs(a - 2.5) ? b : a, 0);
  await seekTo(page, zt);
  const cw = Math.min(72, FMT.lowWidth), ch = Math.min(48, FMT.lowHeight);
  const crop = { x: Math.round(FMT.lowWidth / 2 - cw / 2), y: Math.round(FMT.lowHeight * 0.60 - ch / 2), w: cw, h: ch };
  const zoomFile = path.join(dir, `zoom8x_${OPT.format}.png`);
  await fsp.writeFile(zoomFile, await grabUpscaled(page, 8, crop));
  files.push(path.relative(ROOT, zoomFile));
  log(`  zoom x8   t=${zt.toFixed(2)}s -> ${path.relative(ROOT, zoomFile)}`);
  return files;
}

/* -------------------------- captura de frames -------------------------- */
async function renderFrames(page, { alpha }) {
  const dir = path.join(OUT, 'frames', alpha ? `${TAG}_alpha` : TAG);
  await fsp.rm(dir, { recursive: true, force: true });
  await fsp.mkdir(dir, { recursive: true });
  const t0 = Date.now();
  for (let i = 0; i < TOTAL; i++) {
    await seekTo(page, i / FPS);
    await page.screenshot({
      path: path.join(dir, `frame_${String(i).padStart(6, '0')}.png`),
      type: 'png', omitBackground: !!alpha, captureBeyondViewport: false
    });
    if (!OPT.quiet && (i % 40 === 0 || i === TOTAL - 1)) {
      process.stdout.write(`\r  frames ${i + 1}/${TOTAL} (${((i + 1) / TOTAL * 100).toFixed(0)}%)  ${((Date.now() - t0) / 1000).toFixed(1)}s  `);
    }
  }
  if (!OPT.quiet) process.stdout.write('\n');
  return dir;
}

/* --------------------------------- main -------------------------------- */
const { srv, port } = await startServer();
BASE = `http://127.0.0.1:${port}`;

if (OPT.serve) {
  console.log(`Preview: ${BASE}/src/intro.html?format=${OPT.format}&zoom=2`);
  console.log('En la consola del navegador: INTRO.seek(2.5)   ·   Ctrl+C para salir');
} else {
  const exe = chromePath();
  log(`\n▶ Bank Tycoon intro — render pixel-art`);
  log(`  formato   ${OPT.format}  ${FMT.lowWidth}x${FMT.lowHeight} -> ${FMT.width}x${FMT.height} (x${UP} nearest en build.sh)`);
  log(`  timeline  ${DURATION}s @ ${FPS}fps = ${TOTAL} frames · lógica a ${CFG.timeline.ticksPerSecond} ticks/s`);
  log(`  chromium  ${exe || '(descargado por puppeteer)'}\n`);

  const browser = await puppeteer.launch({ headless: true, args: FLAGS, executablePath: exe, protocolTimeout: 180000 });
  const report = {
    tag: TAG, format: OPT.format,
    width: FMT.width, height: FMT.height,
    lowWidth: FMT.lowWidth, lowHeight: FMT.lowHeight, upscale: UP,
    fps: FPS, ticksPerSecond: CFG.timeline.ticksPerSecond,
    duration: DURATION, frames: TOTAL,
    dir: null, alpha: null, safeArea: null, stills: null,
    createdAt: new Date().toISOString()
  };

  try {
    if (!OPT.alphaOnly) {
      const page = await openPage(browser, { alpha: false });
      const info = await page.evaluate(() => ({ blocks: window.INTRO.blocks, tps: window.INTRO.ticksPerSecond }));
      log(`  bóveda    ${info.blocks} bloques visibles\n`);

      if (CFG.render.checkSafeArea) {
        log('· Verificando zona segura…');
        const bad = await checkSafeArea(page);
        report.safeArea = { ok: bad.length === 0, violations: bad,
                            limits: { top: FMT.safeTop, bottom: FMT.safeBottom, side: FMT.safeSide } };
        log(bad.length ? `  ✗ ${bad.length} violaciones (ver manifest)`
                       : `  ✓ nada de texto dentro de ${FMT.safeTop}px arriba / ${FMT.safeBottom}px abajo`);
      }

      log('· Stills de control…');
      report.stills = await renderStills(page);

      if (!OPT.stillsOnly) {
        log('· Capturando frames (opaco)…');
        report.dir = path.relative(ROOT, await renderFrames(page, { alpha: false }));
      }
      await page.close();
    }

    if ((OPT.withAlpha || OPT.alphaOnly) && !OPT.stillsOnly) {
      log('· Capturando frames (canal alfa)…');
      const pa = await openPage(browser, { alpha: true });
      report.alpha = path.relative(ROOT, await renderFrames(pa, { alpha: true }));
      await pa.close();
    }
  } finally {
    await browser.close();
  }

  await fsp.mkdir(OUT, { recursive: true });
  const lastPath = path.join(OUT, 'last-render.json');
  // Un pase --alpha suelto no debe borrar los datos del pase opaco anterior
  if (OPT.alphaOnly && fs.existsSync(lastPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(lastPath, 'utf8'));
      if (prev.tag === TAG) {
        report.dir = report.dir || prev.dir;
        report.stills = report.stills || prev.stills;
        report.safeArea = report.safeArea || prev.safeArea;
      }
    } catch (e) { /* manifest viejo ilegible: se ignora */ }
  }
  if (report.dir) await fsp.writeFile(path.join(OUT, `frames/${TAG}/manifest.json`), JSON.stringify(report, null, 2));
  await fsp.writeFile(lastPath, JSON.stringify(report, null, 2));
  log(`\n✔ Listo. Manifest: ${path.relative(ROOT, lastPath)}`);
  log(`  Siguiente paso: bash scripts/build.sh\n`);
  srv.close();
  process.exit(0);
}
