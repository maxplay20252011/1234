#!/usr/bin/env node
/* =========================================================================
   Bank Tycoon — Intro MAXWER
   Captura DETERMINÍSTICA de frames.

   No graba "en vivo": levanta un server local, abre la página en Chromium
   headless y para cada frame llama a window.INTRO.seek(t) con t = i/fps.
   Cada PNG es exactamente el estado del timeline en ese instante, así que
   el render es 100% repetible (mismo config => mismos bytes).

   Uso:
     node scripts/render.mjs --format=vertical
     node scripts/render.mjs --format=horizontal --with-alpha
     node scripts/render.mjs --format=vertical --variant=short
     node scripts/render.mjs --stills-only
     node scripts/render.mjs --serve            (preview en el navegador)
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
  format:     String(arg('format', 'vertical')),
  variant:    arg('variant', null),
  duration:   arg('duration', null),
  configPath: String(arg('config', 'config.json')),
  alphaOnly:  arg('alpha', false) === true,
  withAlpha:  arg('with-alpha', false) === true,
  stillsOnly: arg('stills-only', false) === true,
  serve:      arg('serve', false) === true,
  quiet:      arg('quiet', false) === true
};

const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, OPT.configPath), 'utf8'));
const FMT = CFG.formats[OPT.format];
if (!FMT) { console.error(`Formato desconocido: ${OPT.format}. Opciones: ${Object.keys(CFG.formats).join(', ')}`); process.exit(1); }

const FPS = CFG.timeline.fps;
let DURATION = CFG.timeline.duration;
if (OPT.variant && CFG.variants?.[OPT.variant]) DURATION = CFG.variants[OPT.variant].duration;
if (OPT.duration) DURATION = parseFloat(OPT.duration);

const TOTAL = Math.round(DURATION * FPS);
const TAG = `${OPT.format}_${DURATION.toFixed(2).replace(/\.?0+$/, '')}s`;
const OUT = path.join(ROOT, CFG.render.outDir || 'out');

const log = (...a) => { if (!OPT.quiet) console.log(...a); };

/* ------------------------- server local estático ----------------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg' };

function startServer() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
      const file = path.join(ROOT, rel || 'src/intro.html');
      if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404).end('404'); return; }
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
          'Cache-Control': 'no-store'
        });
        res.end(buf);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

/* ------------------------------ chromium ------------------------------- */
function chromePath() {
  // Permite usar un Chromium ya instalado (CI, contenedores sin descarga)
  const env = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
  if (env && fs.existsSync(env)) return env;
  for (const p of ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
                   '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;   // que puppeteer use el Chrome que bajó en npm i
}

const FLAGS = [
  '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
  '--hide-scrollbars', '--force-color-profile=srgb', '--force-device-scale-factor=1',
  '--font-render-hinting=none', '--disable-lcd-text', '--disable-font-subpixel-positioning',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows', '--disable-gpu',
  '--autoplay-policy=no-user-gesture-required',
  // Rasterizado repetible: sin rutas SIMD dependientes de la CPU, sin raster
  // parcial ni checker-imaging (fuentes de ruido de ±1/255 entre corridas).
  '--disable-skia-runtime-opts', '--disable-partial-raster',
  '--disable-checker-imaging', '--disable-threaded-animation',
  '--disable-threaded-scrolling', '--disable-image-animation-resync'
];

async function openPage(browser, { alpha }) {
  const page = await browser.newPage();
  await page.setViewport({ width: FMT.width, height: FMT.height, deviceScaleFactor: 1 });
  const q = new URLSearchParams({ format: OPT.format, duration: String(DURATION) });
  if (alpha) q.set('alpha', '1');
  await page.goto(`${BASE}/src/intro.html?${q}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__INTRO_READY__ === true || window.__INTRO_ERROR__', { timeout: 30000 });
  const err = await page.evaluate(() => window.__INTRO_ERROR__ || null);
  if (err) throw new Error('Error en animation.js:\n' + err);
  const info = await page.evaluate(() => ({
    duration: window.INTRO.duration, fps: window.INTRO.fps, fonts: window.INTRO.fontsLoaded
  }));
  if (!info.fonts) log('  ⚠  Fuente display no cargó: se usa el fallback del config.');
  return page;
}

// seek + forzar layout antes de capturar
const seekTo = (page, t) =>
  page.evaluate(t => { window.INTRO.seek(t); return document.body.offsetHeight; }, t);

/* ------------------------- verificación safe area ---------------------- */
async function checkSafeArea(page) {
  const times = [];
  for (let t = 0; t <= DURATION + 1e-6; t += 1 / 30) times.push(Math.min(t, DURATION));
  const bad = [];
  const lim = { top: FMT.safeTop, bottom: FMT.height - FMT.safeBottom,
                left: FMT.safeSide, right: FMT.width - FMT.safeSide };
  for (const t of times) {
    await seekTo(page, t);
    const boxes = await page.evaluate(() => window.INTRO.measure());
    for (const b of boxes) {
      const v = [];
      if (b.top    < lim.top - 0.5)    v.push(`top ${b.top.toFixed(0)}<${lim.top}`);
      if (b.bottom > lim.bottom + 0.5) v.push(`bottom ${b.bottom.toFixed(0)}>${lim.bottom}`);
      if (b.left   < lim.left - 0.5)   v.push(`left ${b.left.toFixed(0)}<${lim.left}`);
      if (b.right  > lim.right + 0.5)  v.push(`right ${b.right.toFixed(0)}>${lim.right}`);
      if (v.length) bad.push({ t: +t.toFixed(3), id: b.id, issues: v });
    }
  }
  return bad;
}

/* ------------------------------- stills -------------------------------- */
async function renderStills(page, browser) {
  const dir = path.join(OUT, 'preview');
  await fsp.mkdir(dir, { recursive: true });
  const list = CFG.render.stills || [];
  const files = [];
  for (const t of list) {
    if (t > DURATION) continue;
    await seekTo(page, t);
    const f = path.join(dir, `still_${t.toFixed(2)}s_${OPT.format}.png`);
    await page.screenshot({ path: f, type: 'png' });
    files.push(f);
    log(`  still t=${t.toFixed(2)}s -> ${path.relative(ROOT, f)}`);
  }

  // Chequeo de legibilidad: el still del título visto al 30% (lectura en celular)
  const scale = CFG.render.legibilityScale || 0.3;
  const titleT = list.reduce((best, t) =>
    Math.abs(t - 2.5) < Math.abs(best - 2.5) ? t : best, list[0]);
  const src = `/out/preview/still_${titleT.toFixed(2)}s_${OPT.format}.png`;
  const p2 = await browser.newPage();
  await p2.setViewport({ width: Math.round(FMT.width * scale), height: Math.round(FMT.height * scale), deviceScaleFactor: 1 });
  await p2.goto(`${BASE}${src}`, { waitUntil: 'load' });
  await p2.evaluate(() => {
    document.body.style.margin = '0';
    const img = document.querySelector('img');
    img.style.width = '100vw'; img.style.height = '100vh'; img.style.display = 'block';
  });
  const legFile = path.join(dir, `legibility_${Math.round(scale * 100)}pct_${OPT.format}.png`);
  await p2.screenshot({ path: legFile, type: 'png' });
  await p2.close();
  log(`  legibilidad ${Math.round(scale * 100)}% -> ${path.relative(ROOT, legFile)}`);
  files.push(legFile);
  return files;
}

/* -------------------------- captura de frames -------------------------- */
async function renderFrames(page, { alpha }) {
  const dir = path.join(OUT, 'frames', alpha ? `${TAG}_alpha` : TAG);
  await fsp.rm(dir, { recursive: true, force: true });
  await fsp.mkdir(dir, { recursive: true });

  const t0 = Date.now();
  for (let i = 0; i < TOTAL; i++) {
    const t = i / FPS;                       // tiempo virtual exacto del frame
    await seekTo(page, t);
    await page.screenshot({
      path: path.join(dir, `frame_${String(i).padStart(6, '0')}.png`),
      type: 'png', omitBackground: !!alpha, captureBeyondViewport: false
    });
    if (!OPT.quiet && (i % 30 === 0 || i === TOTAL - 1)) {
      const pct = ((i + 1) / TOTAL * 100).toFixed(0);
      const el = (Date.now() - t0) / 1000;
      process.stdout.write(`\r  frames ${i + 1}/${TOTAL} (${pct}%)  ${el.toFixed(1)}s  `);
    }
  }
  if (!OPT.quiet) process.stdout.write('\n');
  return dir;
}

/* --------------------------------- main -------------------------------- */
let BASE = '';
const { srv, port } = await startServer();
BASE = `http://127.0.0.1:${port}`;

if (OPT.serve) {
  console.log(`Preview: ${BASE}/src/intro.html?format=${OPT.format}`);
  console.log('En la consola del navegador: INTRO.seek(2.5)   ·   Ctrl+C para salir');
} else {
  const exe = chromePath();
  log(`\n▶ Bank Tycoon intro — render`);
  log(`  formato   ${OPT.format}  ${FMT.width}x${FMT.height}`);
  log(`  timeline  ${DURATION}s @ ${FPS}fps  =  ${TOTAL} frames`);
  log(`  chromium  ${exe || '(descargado por puppeteer)'}\n`);

  const browser = await puppeteer.launch({ headless: true, args: FLAGS, executablePath: exe, protocolTimeout: 180000 });
  const report = { tag: TAG, format: OPT.format, width: FMT.width, height: FMT.height,
                   fps: FPS, duration: DURATION, frames: TOTAL, alpha: null, dir: null,
                   safeArea: null, createdAt: new Date().toISOString() };
  try {
    if (!OPT.alphaOnly) {
      const page = await openPage(browser, { alpha: false });

      if (CFG.render.checkSafeArea) {
        log('· Verificando zona segura…');
        const bad = await checkSafeArea(page);
        report.safeArea = { ok: bad.length === 0, violations: bad,
                            limits: { top: FMT.safeTop, bottom: FMT.safeBottom, side: FMT.safeSide } };
        log(bad.length ? `  ✗ ${bad.length} violaciones (ver manifest.json)`
                       : `  ✓ nada de texto dentro de ${FMT.safeTop}px arriba / ${FMT.safeBottom}px abajo`);
      }

      log('· Stills de control…');
      report.stills = (await renderStills(page, browser)).map(f => path.relative(ROOT, f));

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

  // Un pase --alpha suelto no debe borrar los datos del pase opaco anterior:
  // se fusiona con el manifest existente si es el mismo tag.
  const lastPath = path.join(OUT, 'last-render.json');
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

  const manifest = path.join(OUT, `frames/${TAG}/manifest.json`);
  if (report.dir) await fsp.writeFile(manifest, JSON.stringify(report, null, 2));
  await fsp.writeFile(path.join(OUT, 'last-render.json'), JSON.stringify(report, null, 2));
  log(`\n✔ Listo. Manifest: ${path.relative(ROOT, path.join(OUT, 'last-render.json'))}`);
  log(`  Siguiente paso: bash scripts/build.sh\n`);
  srv.close();
  process.exit(0);
}
