/* =====================================================================
   ICON OUTFIT CHALLENGE · ESCÁNER
   1) interpretar(texto) e interpretarDifuso(texto): funciones puras.
   2) En el navegador:
      - QR con tres motores (nativo del navegador, ZXing y jsQR), con contraste,
        nitidez y búsqueda por zonas con zoom para tarjetas lejanas o varias juntas.
      - Texto impreso sin internet (Tesseract) y, si no alcanza, con Claude.
      - Cámara en vivo cuando el navegador la permite.
   La selección se aplica tocando los mismos botones del formulario manual,
   así el resto de la app (resumen, generar, reinicio) queda igual.
   ===================================================================== */

/* Sinónimos por opción. Se buscan sin tildes y como palabras completas. */
const SINONIMOS = {
  estilo: {
    elegante: ["elegante"], casual: ["casual"], urbano: ["urbano", "urbana", "urban", "street", "streetwear"],
    minimal: ["minimalista", "minimal"], romantico: ["romantico", "romantica", "romantic"],
    glam: ["glam", "glamour", "glamoroso", "glamorosa"], deportivo: ["deportivo", "deportiva", "sport", "sporty", "athleisure"],
    boho: ["boho chic", "boho", "bohemio", "bohemia"],
  },
  clima: {
    calido: ["calido", "calida", "caluroso", "calor", "verano", "soleado"], templado: ["templado", "templada", "entretiempo", "primavera", "otono"],
    frio: ["frio", "fria", "invierno", "nieve"], lluvia: ["lluvioso", "lluviosa", "lluvia", "lluvias"],
  },
  evento: {
    amigos: ["salida con amigos", "amigos", "amigas", "juntada"], fiesta: ["fiesta nocturna", "fiesta", "boliche"],
    elegante: ["evento elegante"], clases: ["dia de clases", "clases", "colegio", "escuela", "facultad"],
    cita: ["cita o salida especial", "salida especial", "cita"], airelibre: ["paseo al aire libre", "aire libre", "paseo"],
    formal: ["evento formal", "formal", "gala", "casamiento"], casual: ["dia casual"],
  },
};
const normalizar = t => " " + String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9|]+/g, " ").replace(/\s+/g, " ").trim() + " ";

/** Texto (de un QR o impreso) → [{g, k}] sin repetir categoría. */
function interpretar(texto) {
  const crudo = String(texto || "").trim();
  // Formato de las tarjetas ICON: "ICON|estilo|glam"
  const m = crudo.toLowerCase().match(/^icon\|(estilo|clima|evento)\|([a-z]+)$/);
  if (m && SINONIMOS[m[1]][m[2]]) return [{ g: m[1], k: m[2] }];
  let t = normalizar(crudo.replace(/\|/g, " "));
  const hallados = {};
  // Frases largas primero: "evento elegante" antes que "elegante", "dia casual" antes que "casual".
  const reglas = [];
  for (const g in SINONIMOS) for (const k in SINONIMOS[g]) for (const p of SINONIMOS[g][k]) reglas.push({ g, k, p });
  reglas.sort((a, b) => b.p.length - a.p.length);
  for (const r of reglas) {
    const pat = " " + r.p + " ";
    if (!t.includes(pat)) continue;
    if (r.g === "estilo" && (r.k === "elegante" || r.k === "casual") && / evento /.test(t) && !hallados.evento && !/ estilo /.test(t)) {
      if (!hallados.evento) hallados.evento = r.k; // "Evento: elegante" impreso en dos líneas
    } else if (!hallados[r.g]) hallados[r.g] = r.k;
    t = t.split(pat).join(" ");
  }
  return Object.entries(hallados).map(([g, k]) => ({ g, k }));
}

/* Distancia de edición (para tolerar errores del lector de texto: "Elegarte" → "elegante"). */
function distancia(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
const PALABRAS_CLAVE = [...new Set(Object.values(SINONIMOS).flatMap(o => Object.values(o).flat()).concat(["estilo", "evento", "clima"]))];
/** Como interpretar(), pero corrige primero palabras casi iguales (texto leído de una foto). */
function interpretarDifuso(texto) {
  const tokens = normalizar(texto).trim().split(" ").filter(Boolean);
  const tol = n => (n >= 8 ? 2 : n >= 5 ? 1 : 0);
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    let mejor = null;
    for (const p of PALABRAS_CLAVE) {
      const n = p.split(" ").length; if (i + n > tokens.length) continue;
      const s = tokens.slice(i, i + n).join(" "), d = s === p ? 0 : distancia(s, p);
      if (d <= tol(p.length) && (!mejor || n > mejor.n || (n === mejor.n && d < mejor.d))) mejor = { p, n, d };
    }
    if (mejor) { out.push(mejor.p); i += mejor.n - 1; } else out.push(tokens[i]);
  }
  return interpretar(out.join(" "));
}

if (typeof module !== "undefined") module.exports = { interpretar, interpretarDifuso, SINONIMOS };

/* ---------------------------------------------------------------------
   Navegador
   --------------------------------------------------------------------- */
if (typeof document !== "undefined") (function () {
  const $ = s => document.querySelector(s);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NOMBRES = { estilo: ESTILOS, clima: CLIMAS, evento: EVENTOS };
  const ETIQ = { estilo: "Estilo", clima: "Clima", evento: "Evento" };
  const origen = { estilo: null, clima: null, evento: null }; // cómo se leyó cada tarjeta
  const estado = msg => { $("#scan-estado").textContent = msg; };
  const pausa = (ms = 0) => new Promise(r => setTimeout(r, ms));
  const ultima = { pasos: 0, ms: 0, motor: "", textos: [], ocr: "" };
  let stream = null, timer = null, ultimo = { t: "", at: 0 }, camEstado = "sin probar", cuadro = 0, pista = null; // cámara en vivo

  /* ---------- tarjetas leídas (se leen del formulario, que es la fuente de verdad) ---------- */
  const actual = g => { const b = document.querySelector(`#g-${g} .opcion[aria-pressed="true"]`); return b ? b.dataset.k : null; };
  function pintarLeidas() {
    ["estilo", "clima", "evento"].forEach(g => {
      const k = actual(g), el = document.querySelector(`.leida[data-g="${g}"]`);
      if (!k) origen[g] = null;
      el.classList.toggle("ok", !!k);
      el.querySelector(".valor").textContent = k ? NOMBRES[g][k].nombre : "Falta escanear";
      el.querySelector(".via").textContent = k ? ({ qr: "Leída por QR", texto: "Leída por el texto", claude: "Leída por Claude", mano: "Elegida a mano" }[origen[g] || "mano"]) : "";
      const ilu = el.querySelector(".mini");
      const src = k ? document.querySelector(`#op-${g}-${k} .ilu`) : null;
      ilu.innerHTML = src ? src.innerHTML.replace(/id="u/g, 'id="l' + g).replace(/url\(#u/g, "url(#l" + g) : "";
    });
  }
  new MutationObserver(pintarLeidas).observe($("#p-sel"), { subtree: true, attributes: true, attributeFilter: ["aria-pressed"] });
  $("#p-sel").addEventListener("click", e => { const b = e.target.closest(".opcion"); if (b && e.isTrusted) origen[b.dataset.g] = "mano"; });

  /** Aplica lo leído tocando el botón del formulario. Devuelve los cambios. */
  function aplicar(lista, via) {
    const cambios = [];
    for (const { g, k } of lista) {
      const b = document.getElementById(`op-${g}-${k}`);
      if (!b) continue;
      if (actual(g) !== k) { origen[g] = via; b.click(); cambios.push({ g, k }); }
      else if (via !== "mano") origen[g] = via;
    }
    pintarLeidas();
    cambios.forEach(({ g }) => { const el = document.querySelector(`.leida[data-g="${g}"]`); el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); });
    if (cambios.length && navigator.vibrate) try { navigator.vibrate(60); } catch (e) { /* sin vibración */ }
    return cambios;
  }
  const describir = l => l.map(({ g, k }) => `${ETIQ[g]}: ${NOMBRES[g][k].nombre}`).join(" · ");
  const faltan = () => ["estilo", "clima", "evento"].filter(g => !actual(g));
  function despues(cambios, sinNovedad) {
    if (!cambios.length) { estado(sinNovedad); return; }
    const f = faltan();
    estado(`Leí ${describir(cambios)}. ${f.length ? "Falta: " + f.map(g => ETIQ[g].toLowerCase()).join(", ") + "." : "¡Listo! Ya podés generar el outfit."}`);
    if (!f.length) { pararCamara(); $("#generar").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" }); }
  }

  /* =====================================================================
     QR: imagen → luminancia con contraste → ZXing / jsQR (y nativo si hay)
     ===================================================================== */
  let nativo = null;
  (async () => {
    try {
      if (!("BarcodeDetector" in window)) return;
      const f = await BarcodeDetector.getSupportedFormats();
      if (f.includes("qr_code")) nativo = new BarcodeDetector({ formats: ["qr_code"] });
    } catch (e) { nativo = null; }
    pintarDiag();
  })();
  const hayZX = () => typeof ZXing !== "undefined" && ZXing.QRCodeReader;
  const hayJQ = () => typeof jsQR === "function";
  let zxLector = null, zxPistas = null;

  /** Recorta (sx, sy, sw, sh) de la fuente, la escala a "lado" y devuelve luminancia con contraste estirado. */
  function luminancia(src, sx, sy, sw, sh, lado, nitidez) {
    const k = Math.min(1, lado / Math.max(sw, sh)), w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingQuality = "high"; ctx.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data, n = w * h;
    let lum = new Uint8ClampedArray(n);
    const hist = new Uint32Array(256);
    for (let i = 0, j = 0; i < n; i++, j += 4) { const v = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8; lum[i] = v; hist[v]++; }
    // estira el contraste entre el 1 % más oscuro y el 1 % más claro (fotos oscuras o lavadas)
    let lo = 0, hi = 255, acc = 0;
    for (; lo < 255; lo++) { acc += hist[lo]; if (acc > n * 0.01) break; }
    acc = 0; for (; hi > 0; hi--) { acc += hist[hi]; if (acc > n * 0.01) break; }
    if (hi - lo > 20 && (lo > 8 || hi < 247)) { const s = 255 / (hi - lo); for (let i = 0; i < n; i++) lum[i] = (lum[i] - lo) * s; }
    if (nitidez) { // máscara de enfoque 3×3 para fotos movidas
      const o = new Uint8ClampedArray(n); o.set(lum);
      for (let y = 1; y < h - 1; y++) for (let x = 1, i = y * w + 1; x < w - 1; x++, i++) o[i] = 5 * lum[i] - lum[i - 1] - lum[i + 1] - lum[i - w] - lum[i + w];
      lum = o;
    }
    return { lum, w, h, k, sx, sy };
  }
  function conZXing(L) {
    if (!hayZX()) return null;
    if (!zxLector) { zxLector = new ZXing.QRCodeReader(); zxPistas = new Map([[ZXing.DecodeHintType.TRY_HARDER, true]]); }
    try {
      const fuente = new ZXing.RGBLuminanceSource(L.lum, L.w, L.h, L.w, L.h, 0, 0);
      const r = zxLector.decode(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(fuente)), zxPistas);
      const pts = r.getResultPoints().map(p => ({ x: p.getX(), y: p.getY() }));
      return { texto: r.getText(), pts, margen: 0.32, motor: "ZXing" };
    } catch (e) { return null; }
  }
  function conJsQR(L) {
    if (!hayJQ()) return null;
    const rgba = new Uint8ClampedArray(L.w * L.h * 4);
    for (let i = 0, j = 0; i < L.lum.length; i++, j += 4) { const v = L.lum[i]; rgba[j] = rgba[j + 1] = rgba[j + 2] = v; rgba[j + 3] = 255; }
    const r = jsQR(rgba, L.w, L.h, { inversionAttempts: "attemptBoth" });
    if (!r || !r.data) return null;
    const c = r.location;
    return { texto: r.data, pts: [c.topLeftCorner, c.topRightCorner, c.bottomRightCorner, c.bottomLeftCorner], margen: 0.08, motor: "jsQR" };
  }
  function tapar(L, hit) { // pinta de blanco el QR leído para que no tape a los demás
    const xs = hit.pts.map(p => p.x), ys = hit.pts.map(p => p.y);
    let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const m = Math.max(x1 - x0, y1 - y0) * hit.margen;
    x0 = Math.max(0, Math.floor(x0 - m)); y0 = Math.max(0, Math.floor(y0 - m)); x1 = Math.min(L.w - 1, Math.ceil(x1 + m)); y1 = Math.min(L.h - 1, Math.ceil(y1 + m));
    for (let y = y0; y <= y1; y++) L.lum.fill(255, y * L.w + x0, y * L.w + x1 + 1);
  }
  /** Decodifica todos los QR de una zona (tapa cada uno leído y vuelve a buscar). */
  function decodificarZona(L, set, motores, max = 3, soloJsQR = false) {
    for (let i = 0; i < max; i++) {
      const hit = (soloJsQR ? null : conZXing(L)) || conJsQR(L);
      if (!hit) break;
      set.add(hit.texto); motores.add(hit.motor); tapar(L, hit);
    }
  }
  /** Busca todos los QR de una foto. Corta apenas tiene una tarjeta de cada categoría. */
  async function analizarFoto(bmp, progreso) {
    const t0 = performance.now(), W = bmp.width, H = bmp.height, set = new Set(), motores = new Set();
    const cats = () => new Set([...set].flatMap(interpretar).map(x => x.g)).size;
    if (nativo) { try { (await nativo.detect(bmp)).forEach(r => set.add(r.rawValue)); if (set.size) motores.add("lector del navegador"); } catch (e) { /* sigue con ZXing */ } }
    // Pasos: foto entera; zoom ×2 (2×2 zonas); zoom ×3 (3×3 zonas); y versiones con nitidez.
    const pasos = [{ r: [0, 0, 1, 1], lado: 1400 }];
    for (const y of [0, 0.4]) for (const x of [0, 0.4]) pasos.push({ r: [x, y, 0.6, 0.6], lado: 1400, zoom: 2 });
    for (const y of [0, 0.29, 0.58]) for (const x of [0, 0.29, 0.58]) pasos.push({ r: [x, y, 0.42, 0.42], lado: 1100, zoom: 3 });
    pasos.push({ r: [0, 0, 1, 1], lado: 1000, nitidez: true });
    for (const y of [0, 0.4]) for (const x of [0, 0.4]) pasos.push({ r: [x, y, 0.6, 0.6], lado: 1100, zoom: 2, nitidez: true });
    let i = 0;
    for (const p of pasos) {
      if (cats() >= 3) break;
      const ms = performance.now() - t0;
      if (set.size && (p.zoom === 3 || p.nitidez) && ms > 900) break; // ya hay lectura: no se insiste en zonas finas
      if (ms > 9000) break;
      if (progreso && i % 3 === 0) { progreso(i / pasos.length); await pausa(); }
      const [fx, fy, fw, fh] = p.r;
      const L = luminancia(bmp, fx * W, fy * H, fw * W, fh * H, p.lado, p.nitidez);
      decodificarZona(L, set, motores);
      i++;
    }
    Object.assign(ultima, { pasos: i, ms: Math.round(performance.now() - t0), motor: [...motores].join(" + ") || "—", textos: [...set] });
    return [...set];
  }

  /* =====================================================================
     Texto impreso sin internet (Tesseract, servido con la app)
     ===================================================================== */
  const ocr = { estado: "sin cargar", worker: null, promesa: null, avance: 0, error: "" };
  function prepararOCR() {
    if (ocr.promesa) return ocr.promesa;
    if (typeof Tesseract === "undefined" || !window.Worker || typeof WebAssembly === "undefined") { ocr.estado = "no disponible"; ocr.error = "falta el motor"; pintarDiag(); return (ocr.promesa = Promise.resolve(null)); }
    const base = new URL("vendor/", document.baseURI).href;
    ocr.estado = "cargando"; pintarDiag();
    const crear = Tesseract.createWorker("spa", 1, {
      workerPath: base + "worker.min.js", corePath: base, langPath: base.replace(/\/$/, ""), cacheMethod: "none",
      logger: m => { if (m && typeof m.progress === "number" && /load|init/i.test(m.status || "")) { ocr.avance = m.progress; pintarDiag(); } },
      errorHandler: e => { ocr.error = String((e && e.message) || e); },
    });
    const limite = new Promise((_, rej) => setTimeout(() => rej(new Error("tardó demasiado")), 60000));
    ocr.promesa = Promise.race([crear, limite]).then(async w => {
      await w.setParameters({ tessedit_pageseg_mode: "11", tessedit_char_whitelist: "ABCDEFGHIJKLMNÑOPQRSTUVWXYZabcdefghijklmnñopqrstuvwxyzÁÉÍÓÚÜáéíóúü ", preserve_interword_spaces: "1" });
      ocr.worker = w; ocr.estado = "listo"; pintarDiag(); return w;
    }).catch(e => { ocr.estado = "no disponible"; ocr.error = ocr.error || String((e && e.message) || e); pintarDiag(); return null; });
    return ocr.promesa;
  }
  function lienzoGirado(bmp, giro, lado) {
    const k = Math.min(1, lado / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const c = document.createElement("canvas"), rot = giro % 180 !== 0;
    c.width = rot ? h : w; c.height = rot ? w : h;
    const ctx = c.getContext("2d"); ctx.filter = "grayscale(1) contrast(1.35)";
    ctx.translate(c.width / 2, c.height / 2); ctx.rotate(giro * Math.PI / 180); ctx.drawImage(bmp, -w / 2, -h / 2, w, h);
    return c;
  }
  async function leerTextoLocal(bmp, progreso) {
    const w = await prepararOCR(); if (!w) return null;
    let texto = "";
    for (const [i, giro] of [0, 90, 270, 180].entries()) {
      if (progreso) progreso(i);
      const { data } = await w.recognize(lienzoGirado(bmp, giro, 1800));
      texto = data.text || "";
      const l = interpretarDifuso(texto);
      if (l.length) { ultima.ocr = texto.replace(/\s+/g, " ").trim().slice(0, 160); return l; }
    }
    ultima.ocr = texto.replace(/\s+/g, " ").trim().slice(0, 160) || "(sin texto)";
    return [];
  }

  /* =====================================================================
     Texto impreso con Claude (si el visor lo permite)
     ===================================================================== */
  let sample = null, puedeImagen = false, claudeEstado = "comprobando";
  (async () => {
    try {
      if (!window.claude || !window.claude.use) { claudeEstado = "no disponible fuera de Claude"; return; }
      sample = await window.claude.use("sample");
      if (!sample) { claudeEstado = "no disponible en esta vista"; return; }
      const lim = await sample.limits().catch(() => null);
      puedeImagen = !!(lim && lim.images);
      claudeEstado = puedeImagen ? "disponible" : "no puede ver fotos en esta vista";
    } catch (e) { sample = null; claudeEstado = "no disponible"; }
    finally { pintarDiag(); }
  })();
  const lista = g => Object.entries(NOMBRES[g]).map(([k, d]) => `${k} (${d.nombre})`).join(", ");
  async function leerConClaude(blob) {
    if (!sample || !puedeImagen) return null;
    const prompt = "La imagen es una foto de una o más tarjetas físicas de un juego de moda. Cada tarjeta dice un estilo personal, un clima o un tipo de evento. "
      + "Leé solo el texto impreso en las tarjetas y respondé únicamente con un objeto JSON {\"estilo\": id o null, \"clima\": id o null, \"evento\": id o null}. "
      + `Ids válidos. estilo: ${lista("estilo")}. clima: ${lista("clima")}. evento: ${lista("evento")}. `
      + "Usá null para una categoría que no aparece o que no se lee con claridad. No adivines. Ejemplo: {\"estilo\":\"glam\",\"clima\":null,\"evento\":\"fiesta\"}";
    const r = await sample.json(prompt, { images: blob, modelTier: "quick" });
    const out = [];
    for (const g of ["estilo", "clima", "evento"]) { const v = r && typeof r[g] === "string" ? r[g].toLowerCase().trim() : null; if (v && NOMBRES[g][v]) out.push({ g, k: v }); else if (v) out.push(...interpretar(v).filter(x => x.g === g)); }
    return out;
  }
  const ERR_CLAUDE = { not_granted: "No se dio permiso para que Claude lea la foto.", rate_limited: "Claude está ocupado: probá de nuevo en un rato.", image_rejected: "La foto no se pudo usar: probá con otra.", session_expired: "Hay que volver a iniciar sesión en Claude." };

  /* =====================================================================
     Foto: QR → texto sin internet → Claude
     ===================================================================== */
  async function abrirImagen(f) {
    try { return await createImageBitmap(f, { imageOrientation: "from-image" }); }
    catch (e) { try { return await createImageBitmap(f); } catch (e2) { /* sigue con <img> */ } }
    const url = URL.createObjectURL(f);
    try { const img = new Image(); img.src = url; await img.decode(); return img; } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  let ocupado = false;
  async function procesarFoto(f) {
    if (ocupado) return; ocupado = true;
    estado("Analizando la foto…");
    $("#visor").classList.add("leyendo");
    try {
      let bmp;
      try { bmp = await abrirImagen(f); } catch (err) { estado("No pude abrir esa imagen. Probá con otra foto."); return; }
      pararCamara();
      mostrarEnVisor(bmp);
      await pausa(30);
      Object.assign(ultima, { ocr: "", textos: [], motor: "", pasos: 0, ms: 0 });
      if (!hayZX() && !hayJQ() && !nativo) { estado("El lector de QR no cargó. Recargá la página; si sigue igual, elegí a mano."); return; }
      const textos = await analizarFoto(bmp, p => estado(`Buscando el QR… ${Math.round(p * 100)} %`));
      let leidos = textos.flatMap(interpretar), via = "qr";
      if (!leidos.length && textos.length) { estado("Leí un QR, pero no es de una tarjeta ICON."); return; }
      if (!leidos.length) {
        if (ocr.estado !== "no disponible") {
          estado(ocr.estado === "listo" ? "No encontré un QR. Leyendo el texto de la tarjeta…" : "No encontré un QR. Preparando el lector de texto…");
          const l = await leerTextoLocal(bmp, i => estado(`No encontré un QR. Leyendo el texto de la tarjeta${i ? " (girando la foto)" : ""}…`));
          if (l && l.length) { leidos = l; via = "texto"; }
        }
        if (!leidos.length && puedeImagen) {
          estado("No encontré un QR. Claude está leyendo el texto de la tarjeta…");
          try { leidos = (await leerConClaude(f)) || []; via = "claude"; }
          catch (err) { estado(ERR_CLAUDE[err && err.code] || "No se pudo leer el texto ahora. Probá de nuevo o elegí a mano."); return; }
        }
      }
      despues(aplicar(leidos, via), leidos.length ? "Esa tarjeta ya estaba cargada. Escaneá la siguiente." : consejo());
    } finally { $("#visor").classList.remove("leyendo"); ocupado = false; pintarDiag(); }
  }
  function consejo() {
    const texto = ocr.estado === "listo" || puedeImagen;
    return `No pude leer ninguna tarjeta. Probá así: tarjeta sobre una mesa, foto de frente, que ocupe buena parte de la foto, sin reflejos y enfocada.${texto ? "" : " Si tu tarjeta no tiene QR, en esta pantalla no se puede leer el texto: elegí a mano."}`;
  }
  $("#scan-foto").onchange = e => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) procesarFoto(f); };
  // Arrastrar una foto al visor (computadora)
  const visor = $("#visor");
  visor.addEventListener("dragover", e => { e.preventDefault(); visor.classList.add("arrastre"); });
  visor.addEventListener("dragleave", () => visor.classList.remove("arrastre"));
  visor.addEventListener("drop", e => { e.preventDefault(); visor.classList.remove("arrastre"); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f && /^image\//.test(f.type)) procesarFoto(f); });
  function mostrarEnVisor(src) {
    const k = Math.min(1, 1200 / Math.max(src.width, src.height)), c = document.createElement("canvas");
    c.width = Math.round(src.width * k); c.height = Math.round(src.height * k); c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
    const v = $("#visor .pantalla-visor"); v.innerHTML = ""; c.className = "foto"; v.appendChild(c);
    $("#visor").classList.add("con-imagen");
  }

  /* =====================================================================
     Cámara en vivo
     ===================================================================== */
  async function activarCamara() {
    if (stream) { pararCamara(); estado("Cámara apagada."); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { sinCamara(); return; }
    estado("Pidiendo acceso a la cámara…");
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }); }
    catch (e) { stream = null; sinCamara(e && e.name); return; }
    camEstado = "activa"; pintarDiag();
    pista = stream.getVideoTracks()[0];
    try { await pista.applyConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch (e) { /* sin enfoque continuo */ }
    const cap = pista.getCapabilities ? pista.getCapabilities() : {};
    $("#scan-luz").hidden = !cap.torch;
    if (cap.zoom && cap.zoom.max > cap.zoom.min) { const z = $("#scan-zoom"); z.min = cap.zoom.min; z.max = Math.min(cap.zoom.max, 5); z.step = cap.zoom.step || 0.1; z.value = cap.zoom.min; $("#scan-zoom-caja").hidden = false; }
    const video = document.createElement("video");
    video.setAttribute("playsinline", ""); video.muted = true; video.srcObject = stream; video.className = "foto";
    const v = $("#visor .pantalla-visor"); v.innerHTML = ""; v.appendChild(video);
    $("#visor").classList.add("con-imagen", "vivo");
    try { await video.play(); } catch (e) { /* algunos navegadores arrancan solos */ }
    $("#scan-camara").textContent = "Apagar cámara";
    $("#scan-texto").hidden = !(ocr.estado !== "no disponible" || puedeImagen);
    estado("Cámara activa. Poné el QR de una tarjeta dentro del recuadro.");
    const loop = async () => {
      if (!stream) return;
      if (video.readyState >= 2 && video.videoWidth) {
        const vw = video.videoWidth, vh = video.videoHeight, textos = new Set(), mot = new Set();
        if (nativo) { try { (await nativo.detect(video)).forEach(r => textos.add(r.rawValue)); } catch (e) { /* sigue */ } }
        if (!textos.size) {
          // alterna: centro con zoom (QR chico o lejano) y cuadro completo (varias tarjetas)
          const L = cuadro++ % 2 === 0 ? luminancia(video, vw * 0.2, vh * 0.15, vw * 0.6, vh * 0.7, 900) : luminancia(video, 0, 0, vw, vh, 960);
          decodificarZona(L, textos, mot, 2);
        }
        const t = [...textos].join("\n");
        if (t && (t !== ultimo.t || Date.now() - ultimo.at > 2500)) {
          ultimo = { t, at: Date.now() };
          const leidos = [...textos].flatMap(interpretar);
          if (leidos.length) despues(aplicar(leidos, "qr"), "Esa tarjeta ya estaba cargada. Mostrá la siguiente.");
          else estado("Ese QR no es de una tarjeta ICON.");
        }
      }
      timer = setTimeout(loop, 120);
    };
    loop();
  }
  function pararCamara() {
    clearTimeout(timer); timer = null;
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; if (camEstado === "activa") camEstado = "funciona"; }
    pista = null;
    $("#visor").classList.remove("vivo");
    $("#scan-camara").textContent = "Activar cámara";
    $("#scan-texto").hidden = true; $("#scan-luz").hidden = true; $("#scan-zoom-caja").hidden = true;
    pintarDiag();
  }
  function sinCamara(nombre) {
    camEstado = "bloqueada en esta pantalla"; pintarDiag();
    $("#scan-alt").classList.add("resalta");
    estado(nombre === "NotFoundError" || nombre === "OverconstrainedError"
      ? "No encontré una cámara disponible. Tocá «Sacar o subir foto» para usar una foto."
      : "Esta pantalla no deja usar la cámara en vivo. Tocá «Sacar o subir foto»: abre la cámara del celular y lee la tarjeta igual.");
  }
  $("#scan-camara").onclick = activarCamara;
  $("#scan-luz").onclick = async () => { if (!pista) return; const on = $("#scan-luz").getAttribute("aria-pressed") !== "true"; try { await pista.applyConstraints({ advanced: [{ torch: on }] }); $("#scan-luz").setAttribute("aria-pressed", String(on)); } catch (e) { $("#scan-luz").hidden = true; } };
  $("#scan-zoom").oninput = e => { if (pista) pista.applyConstraints({ advanced: [{ zoom: Number(e.target.value) }] }).catch(() => {}); };
  $("#scan-texto").onclick = async () => { // tarjeta sin QR con la cámara en vivo: lee el texto del cuadro actual
    const video = $("#visor video"); if (!video || !video.videoWidth) return;
    const c = document.createElement("canvas"); c.width = video.videoWidth; c.height = video.videoHeight; c.getContext("2d").drawImage(video, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.92));
    if (blob) procesarFoto(blob);
  };

  /* =====================================================================
     Diagnóstico visible
     ===================================================================== */
  function pintarDiag() {
    const qr = [nativo && "navegador", hayZX() && "ZXing", hayJQ() && "jsQR"].filter(Boolean);
    const ocrTxt = ocr.estado === "cargando" ? `cargando ${Math.round(ocr.avance * 100)} %` : ocr.estado;
    const items = [
      ["Lector de QR", qr.length ? "listo" : "no cargó", qr.length ? "ok" : "mal", qr.join(" + ")],
      ["Texto sin internet", ocrTxt, ocr.estado === "listo" ? "ok" : ocr.estado === "no disponible" ? "mal" : "espera", ocr.error],
      ["Texto con Claude", claudeEstado, puedeImagen ? "ok" : claudeEstado === "comprobando" ? "espera" : "mal", ""],
      ["Cámara en vivo", camEstado, /activa|funciona/.test(camEstado) ? "ok" : camEstado === "sin probar" ? "espera" : "mal", ""],
    ];
    $("#diag-lista").innerHTML = items.map(([n, v, c, t]) => `<li class="${c}" title="${String(t || "").replace(/"/g, "&quot;")}"><span>${n}</span><b>${v}</b></li>`).join("");
    $("#diag-ultima").textContent = ultima.ms ? `Última foto: ${ultima.ms} ms, ${ultima.pasos} zonas revisadas, motor ${ultima.motor}. QR leídos: ${ultima.textos.join(" · ") || "ninguno"}.${ultima.ocr ? ` Texto leído: «${ultima.ocr}».` : ""}` : "Todavía no se analizó ninguna foto.";
  }

  // Al salir de la pantalla de escaneo (generar, reiniciar) se apaga la cámara y se limpia el visor.
  // Al entrar por primera vez se empieza a cargar el lector de texto, para que esté listo si hace falta.
  new MutationObserver(() => {
    if ($("#p-sel").hidden) { pararCamara(); $("#visor .pantalla-visor").innerHTML = ""; $("#visor").classList.remove("con-imagen"); $("#scan-alt").classList.remove("resalta"); estado("Escaneá la primera tarjeta."); }
    else prepararOCR();
    pintarLeidas();
  }).observe($("#p-sel"), { attributes: true, attributeFilter: ["hidden"] });
  pintarLeidas(); pintarDiag();

  // Para pruebas automáticas y soporte
  window.ICON_LECTOR = { analizarFoto, leerTextoLocal, prepararOCR, ocr, ultima, ocupado: () => ocupado };
})();
