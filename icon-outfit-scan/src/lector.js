/* =====================================================================
   ICON OUTFIT CHALLENGE · ESCÁNER
   1) interpretar(texto) e interpretarDifuso(texto): funciones puras.
   2) En el navegador:
      - QR con tres motores (nativo del navegador, ZXing y jsQR) y
        búsqueda por zonas con zoom para tarjetas lejanas o varias juntas.
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
  if (Math.abs(a.length - b.length) > 3) return 9;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
const PALABRAS_CLAVE = [...new Set(Object.values(SINONIMOS).flatMap(o => Object.values(o).flat()).concat(["estilo", "evento", "clima"]))]
  .map(p => ({ p, c: p.replace(/ /g, "") }));
// Palabras comunes que se parecen a una opción pero no lo son ("salida" ≠ "cálida"): nunca se corrigen solas.
const NO_CORREGIR = new Set(["salida", "con", "de", "dia", "al", "o", "y", "especial", "tarjeta", "personal", "tipo", "aire", "libre", "icon"]);
/** Como interpretar(), pero corrige antes lo que el lector de texto leyó casi bien.
    Compara frases completas sin espacios ("cita o salida e special" = "cita o salida especial")
    y tolera más errores cuanto más larga es la palabra ("veyoriivo" → "deportivo"). */
function interpretarDifuso(texto) {
  const tokens = normalizar(texto).trim().split(" ").filter(Boolean);
  const tol = n => (n >= 12 ? 3 : n >= 9 ? 3 : n >= 7 ? 2 : n >= 5 ? 1 : 0);
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    let mejor = null;
    for (let n = 1; n <= 6 && i + n <= tokens.length; n++) {
      const ventana = tokens.slice(i, i + n), c = ventana.join("");
      for (const k of PALABRAS_CLAVE) {
        if (Math.abs(c.length - k.c.length) > 3) continue;
        if (n === 1 && NO_CORREGIR.has(c) && c !== k.c) continue;
        const d = c === k.c ? 0 : distancia(c, k.c);
        if (d > tol(k.c.length)) continue;
        // puntaje: cuanto más larga la frase, mejor; cada error resta mucho. Así "casual" exacto
        // le gana a "casual tf" leído como "día casual", y "cita o salida e special" entra entero.
        const puntaje = k.c.length - 3 * d;
        if (!mejor || puntaje > mejor.puntaje) mejor = { p: k.p, n, d, puntaje };
      }
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
  $("#p-sel").addEventListener("click", e => { const b = e.target.closest(".opcion"); if (b && e.isTrusted) { origen[b.dataset.g] = "mano"; pintarLeidas(); } });

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
     QR: zonas de la imagen → jsQR / ZXing (y el lector nativo si hay)
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

  /** Recorta (sx, sy, sw, sh) de la fuente y la escala a "lado". Medido con 60 fotos difíciles:
      retocar contraste o nitidez empeora la lectura, así que la imagen va tal cual. */
  function zona(src, sx, sy, sw, sh, lado, tapados) {
    const k = Math.min(1, lado / Math.max(sw, sh)), w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingQuality = "high"; ctx.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
    // los QR ya leídos en otras zonas se tapan acá también, así no confunden la búsqueda de los demás
    ctx.fillStyle = "#fff";
    (tapados || []).forEach(b => ctx.fillRect((b.x0 - sx) * k, (b.y0 - sy) * k, (b.x1 - b.x0) * k, (b.y1 - b.y0) * k));
    return { img: ctx.getImageData(0, 0, w, h), w, h, lum: null, sx, sy, k };
  }
  function lumDe(Z) {
    if (!Z.lum) { const d = Z.img.data, n = Z.w * Z.h, l = new Uint8ClampedArray(n); for (let i = 0, j = 0; i < n; i++, j += 4) l[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8; Z.lum = l; }
    return Z.lum;
  }
  function conZXing(Z) {
    if (!hayZX()) return null;
    if (!zxLector) { zxLector = new ZXing.QRCodeReader(); zxPistas = new Map([[ZXing.DecodeHintType.TRY_HARDER, true]]); }
    try {
      const fuente = new ZXing.RGBLuminanceSource(lumDe(Z), Z.w, Z.h, Z.w, Z.h, 0, 0);
      const r = zxLector.decode(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(fuente)), zxPistas);
      return { texto: r.getText(), pts: r.getResultPoints().map(p => ({ x: p.getX(), y: p.getY() })), margen: 0.32, motor: "ZXing" };
    } catch (e) { return null; }
  }
  function conJsQR(Z) {
    if (!hayJQ()) return null;
    const r = jsQR(Z.img.data, Z.w, Z.h, { inversionAttempts: "dontInvert" });
    if (!r || !r.data) return null;
    const c = r.location;
    return { texto: r.data, pts: [c.topLeftCorner, c.topRightCorner, c.bottomRightCorner, c.bottomLeftCorner], margen: 0.08, motor: "jsQR" };
  }
  /** Pinta de blanco el QR leído en la zona y devuelve su caja en coordenadas de la foto original. */
  function tapar(Z, hit) {
    const xs = hit.pts.map(p => p.x), ys = hit.pts.map(p => p.y);
    let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const m = Math.max(x1 - x0, y1 - y0) * hit.margen;
    x0 = Math.max(0, Math.floor(x0 - m)); y0 = Math.max(0, Math.floor(y0 - m)); x1 = Math.min(Z.w - 1, Math.ceil(x1 + m)); y1 = Math.min(Z.h - 1, Math.ceil(y1 + m));
    const d = Z.img.data;
    for (let y = y0; y <= y1; y++) { d.fill(255, (y * Z.w + x0) * 4, (y * Z.w + x1 + 1) * 4); if (Z.lum) Z.lum.fill(255, y * Z.w + x0, y * Z.w + x1 + 1); }
    const k = Z.k || 1, sx = Z.sx || 0, sy = Z.sy || 0;
    return { x0: sx + x0 / k, y0: sy + y0 / k, x1: sx + x1 / k, y1: sy + y1 / k };
  }
  /** Lee todos los QR de una zona con un motor (tapa cada uno leído y vuelve a buscar). */
  function decodificarZona(Z, motor, set, motores, max = 3, tapados) {
    for (let i = 0; i < max; i++) {
      const hit = motor(Z);
      if (!hit) break;
      set.add(hit.texto); motores.add(hit.motor);
      const caja = tapar(Z, hit);
      if (tapados) tapados.push(caja);
    }
  }
  /** Busca todos los QR de una foto. Corta apenas tiene una tarjeta de cada categoría. */
  async function analizarFoto(bmp, progreso) {
    const t0 = performance.now(), W = bmp.width, H = bmp.height, set = new Set(), motores = new Set(), tapados = [];
    const cats = () => new Set([...set].flatMap(interpretar).map(x => x.g)).size;
    // Un QR grande es señal de una sola tarjeta de cerca: no hace falta buscar más.
    // QR chicos suelen ser varias tarjetas en la foto: se sigue buscando por zonas.
    const qrGrande = () => tapados.some(b => (b.x1 - b.x0) > Math.max(W, H) * 0.12);
    if (nativo) { try { (await nativo.detect(bmp)).forEach(r => set.add(r.rawValue)); if (set.size) motores.add("lector del navegador"); } catch (e) { /* sigue */ } }
    // Pasos: foto entera, zoom ×2 (2×2 zonas), zoom ×3 (3×3 zonas) y, si no apareció nada, alta resolución.
    const pasos = [{ r: [0, 0, 1, 1], jq: 1400, zx: 900 }];
    for (const y of [0, 0.4]) for (const x of [0, 0.4]) pasos.push({ r: [x, y, 0.6, 0.6], jq: 1400, zx: 900 });
    for (const y of [0, 0.29, 0.58]) for (const x of [0, 0.29, 0.58]) pasos.push({ r: [x, y, 0.42, 0.42], jq: 1100, zx: 900, fina: true });
    pasos.push({ r: [0, 0, 1, 1], zx: 2000, fina: true, ultimo: true });
    let i = 0;
    for (const p of pasos) {
      if (cats() >= 3) break;
      const ms = performance.now() - t0;
      if (set.size && p.fina && (qrGrande() || ms > 4000)) break;
      if (p.ultimo && set.size) break;
      if (ms > 8000) break;
      if (progreso) { progreso(i / pasos.length); await pausa(); }
      const [fx, fy, fw, fh] = p.r;
      if (p.jq) decodificarZona(zona(bmp, fx * W, fy * H, fw * W, fh * H, p.jq, tapados), conJsQR, set, motores, 3, tapados);
      if (p.zx && cats() < 3) decodificarZona(zona(bmp, fx * W, fy * H, fw * W, fh * H, p.zx, tapados), conZXing, set, motores, 3, tapados);
      i++;
    }
    Object.assign(ultima, { pasos: i, ms: Math.round(performance.now() - t0), motor: [...motores].join(" + ") || "—", textos: [...set] });
    analizarFoto.variasTarjetas = set.size > 0 && !qrGrande();
    return [...set];
  }

  /* =====================================================================
     Texto impreso sin internet (Tesseract, servido con la app)
     ===================================================================== */
  const ocr = { estado: "sin cargar", worker: null, promesa: null, avance: 0, error: "" };
  function prepararOCR() {
    if (ocr.promesa) return ocr.promesa;
    if (typeof Tesseract === "undefined" || !window.Worker || typeof WebAssembly === "undefined") { ocr.estado = "no disponible"; ocr.error = "falta el motor"; pintarDiag(); return (ocr.promesa = Promise.resolve(null)); }
    // Si el visor no permite WebAssembly, se sabe al instante compilando un módulo vacío.
    try { new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])); }
    catch (e) { ocr.estado = "no disponible"; ocr.error = "esta pantalla no permite WebAssembly"; pintarDiag(); return (ocr.promesa = Promise.resolve(null)); }
    const base = new URL("vendor/", document.baseURI).href;
    ocr.estado = "cargando"; pintarDiag();
    // El idioma (español) viaja como texto base64 porque el visor no sirve archivos .gz. Se guarda en la
    // caché de Tesseract (IndexedDB "keyval-store", clave "./spa.traineddata") y Tesseract lo lee de ahí.
    const crear = fetch(base + "spa-traineddata-gz.b64.txt").then(r => { if (!r.ok) throw new Error("no se pudo bajar el idioma (" + r.status + ")"); return r.text(); }).then(async b64 => {
      const bin = atob(b64.trim()), datos = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) datos[i] = bin.charCodeAt(i);
      await guardarEnCache("./spa.traineddata", datos);
      return Tesseract.createWorker("spa", 1, {
        workerPath: base + "worker.min.js", corePath: base, langPath: base.replace(/\/$/, ""), cacheMethod: "readOnly",
        logger: m => { if (m && typeof m.progress === "number" && /load|init/i.test(m.status || "")) { ocr.avance = m.progress; pintarDiag(); } },
        errorHandler: e => { ocr.error = String((e && e.message) || e); },
      });
    });
    const limite = new Promise((_, rej) => setTimeout(() => rej(new Error("tardó demasiado")), 60000));
    ocr.promesa = Promise.race([crear, limite]).then(async w => {
      await w.setParameters({ tessedit_pageseg_mode: "11", tessedit_char_whitelist: "ABCDEFGHIJKLMNÑOPQRSTUVWXYZabcdefghijklmnñopqrstuvwxyzÁÉÍÓÚÜáéíóúü ", preserve_interword_spaces: "1" });
      ocr.worker = w; ocr.estado = "listo"; pintarDiag(); return w;
    }).catch(e => { ocr.estado = "no disponible"; ocr.error = ocr.error || String((e && e.message) || e); pintarDiag(); return null; });
    return ocr.promesa;
  }
  /** Escribe en la misma base que usa Tesseract (idb-keyval: base "keyval-store", almacén "keyval"). */
  function guardarEnCache(clave, valor) {
    return new Promise((ok, mal) => {
      const req = indexedDB.open("keyval-store");
      req.onupgradeneeded = () => req.result.createObjectStore("keyval");
      req.onerror = () => mal(req.error);
      req.onsuccess = () => {
        const db = req.result, tx = db.transaction("keyval", "readwrite");
        tx.objectStore("keyval").put(valor, clave);
        tx.oncomplete = () => { db.close(); ok(); }; tx.onerror = () => mal(tx.error);
      };
    });
  }
  /* Imagen para el lector de texto. Medido con 70 fotos de texto manuscrito y digital:
     el lector falla mucho con sombras, renglones y pantallas oscuras, así que se prepara:
     - gris(): escala y gira la foto en escala de grises.
     - binarizar(): umbral adaptativo (Sauvola): separa tinta y papel aunque haya sombra o poca luz;
       con "invertir" sirve para letra clara sobre pantalla oscura.
     - sin renglones: borra trazos horizontales o verticales muy largos (renglones, bordes de la hoja). */
  function gris(bmp, giro, lado) {
    const k = Math.min(1, lado / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const c = document.createElement("canvas"), rot = giro % 180 !== 0;
    c.width = rot ? h : w; c.height = rot ? w : h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.translate(c.width / 2, c.height / 2); ctx.rotate(giro * Math.PI / 180); ctx.drawImage(bmp, -w / 2, -h / 2, w, h);
    const d = ctx.getImageData(0, 0, c.width, c.height).data, n = c.width * c.height, g = new Uint8ClampedArray(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
    return { g, w: c.width, h: c.height };
  }
  function binarizar({ g, w, h }, invertir) {
    const W1 = w + 1, S = new Float64Array(W1 * (h + 1)), Q = new Float64Array(W1 * (h + 1));
    for (let y = 1; y <= h; y++) {
      let fila = 0, fila2 = 0;
      for (let x = 1; x <= w; x++) {
        let v = g[(y - 1) * w + x - 1]; if (invertir) v = 255 - v;
        fila += v; fila2 += v * v;
        S[y * W1 + x] = S[(y - 1) * W1 + x] + fila; Q[y * W1 + x] = Q[(y - 1) * W1 + x] + fila2;
      }
    }
    const r = Math.max(8, Math.round(Math.max(w, h) / 40)), out = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), area = (x1 - x0) * (y1 - y0);
        const sum = S[y1 * W1 + x1] - S[y0 * W1 + x1] - S[y1 * W1 + x0] + S[y0 * W1 + x0];
        const sq = Q[y1 * W1 + x1] - Q[y0 * W1 + x1] - Q[y1 * W1 + x0] + Q[y0 * W1 + x0];
        const m = sum / area, sd = Math.sqrt(Math.max(0, sq / area - m * m));
        let v = g[y * w + x]; if (invertir) v = 255 - v;
        out[y * w + x] = v < m * (1 + 0.3 * (sd / 128 - 1)) && sd > 6 ? 0 : 255;
      }
    }
    // borra trazos muy largos: renglones de la hoja y bordes (no son letras)
    const largoH = w * 0.18, largoV = h * 0.18;
    for (let y = 0; y < h; y++) for (let x = 0; x < w;) {
      if (out[y * w + x]) { x++; continue; }
      let e = x; while (e < w && !out[y * w + e]) e++;
      if (e - x > largoH) out.fill(255, y * w + x, y * w + e);
      x = e;
    }
    for (let x = 0; x < w; x++) for (let y = 0; y < h;) {
      if (out[y * w + x]) { y++; continue; }
      let e = y; while (e < h && !out[e * w + x]) e++;
      if (e - y > largoV) for (let k = y; k < e; k++) out[k * w + x] = 255;
      y = e;
    }
    return { g: out, w, h };
  }
  function aLienzo({ g, w, h }) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d"), img = ctx.createImageData(w, h);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) { img.data[j] = img.data[j + 1] = img.data[j + 2] = g[i]; img.data[j + 3] = 255; }
    ctx.putImageData(img, 0, 0); return c;
  }
  /** Lee el texto de la foto con varias pasadas; corta apenas encuentra una coincidencia segura. */
  async function leerTextoLocal(bmp, progreso) {
    const w = await prepararOCR(); if (!w) return null;
    const t0 = performance.now(), textos = [];
    const pasadas = [
      { giro: 0, prep: "tinta" }, { giro: 0, prep: "tinta-invertida" }, { giro: 0, prep: "gris" },
      { giro: 180, prep: "tinta" }, { giro: 90, prep: "tinta" }, { giro: 270, prep: "tinta" },
      { giro: 180, prep: "tinta-invertida" }, { giro: 90, prep: "tinta-invertida" }, { giro: 270, prep: "tinta-invertida" },
    ];
    const hallado = {};
    for (const [i, p] of pasadas.entries()) {
      if (performance.now() - t0 > 20000) break;
      if (progreso) progreso(i, pasadas.length);
      const G = gris(bmp, p.giro, 1600);
      const lienzo = p.prep === "gris" ? aLienzo({ ...G, g: G.g.map(v => Math.min(255, Math.max(0, (v - 128) * 1.35 + 128))) }) : aLienzo(binarizar(G, p.prep === "tinta-invertida"));
      const { data } = await w.recognize(lienzo);
      const texto = (data.text || "").replace(/\s+/g, " ").trim();
      textos.push(texto);
      const l = interpretarDifuso(texto);
      l.forEach(x => { if (!hallado[x.g]) hallado[x.g] = x.k; });
      const n = Object.keys(hallado).length;
      // con una coincidencia alcanza para una tarjeta; si el texto tiene varias líneas puede haber más: se prueba una pasada más
      if (n >= 3 || (n && (!/\S+\s+\S+\s+\S+/.test(texto) || i % 3 === 1 || i >= 3))) break;
    }
    ultima.ocr = textos.filter(Boolean).join(" ‖ ").slice(0, 200) || "(sin texto)";
    return Object.entries(hallado).map(([g, k]) => ({ g, k }));
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
  /** Claude lee la foto: tarjetas impresas, papeles escritos a mano o texto en una pantalla.
      Primero el modelo rápido; si no encuentra nada, el más preciso (letra difícil). */
  async function leerConClaude(blob, soloPreciso) {
    if (!sample || !puedeImagen) return null;
    const prompt = "La foto muestra una o más tarjetas, papeles o una pantalla de un juego de moda. Cada una dice un estilo personal, un clima o un tipo de evento. "
      + "El texto puede estar impreso, escrito a mano (con letra cursiva o desprolija) o en la pantalla de un celular o computadora; puede estar en mayúsculas, sin tildes, con errores de ortografía, abreviado, girado o con poca luz. "
      + "Leé lo que dice e identificá, para cada categoría, la opción de la lista que corresponde (también vale un sinónimo claro: 'calor' es cálido, 'invierno' es frío, 'boliche' es fiesta nocturna). "
      + "Respondé únicamente con un objeto JSON {\"estilo\": id o null, \"clima\": id o null, \"evento\": id o null, \"leido\": \"el texto tal como lo leíste\"}. "
      + `Ids válidos. estilo: ${lista("estilo")}. clima: ${lista("clima")}. evento: ${lista("evento")}. `
      + "Ojo: 'Elegante' solo es estilo; 'Evento elegante' es el evento. 'Casual' solo es estilo; 'Día casual' es el evento. "
      + "Usá null para una categoría que no aparece. Si una palabra es ilegible, no la inventes. Ejemplo: {\"estilo\":\"glam\",\"clima\":null,\"evento\":\"fiesta\",\"leido\":\"Glam / Fiesta nocturna\"}";
    const pedir = async tier => {
      const r = await sample.json(prompt, { images: blob, modelTier: tier });
      const out = [];
      for (const g of ["estilo", "clima", "evento"]) { const v = r && typeof r[g] === "string" ? r[g].toLowerCase().trim() : null; if (v && NOMBRES[g][v]) out.push({ g, k: v }); else if (v) out.push(...interpretarDifuso(v).filter(x => x.g === g)); }
      if (r && typeof r.leido === "string") ultima.ocr = "Claude: " + r.leido.slice(0, 160);
      return out;
    };
    let out = soloPreciso ? [] : await pedir("quick");
    if (!out.length) out = await pedir("default");
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
  let ultimaFoto = null;
  async function procesarFoto(f) {
    if (ocupado) return; ocupado = true;
    ultimaFoto = f; $("#scan-claude").hidden = true;
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
      // Foto con varias tarjetas y alguna sin leer por QR: se completa con el texto impreso.
      const cats = new Set(leidos.map(x => x.g));
      if (leidos.length && cats.size < 3 && analizarFoto.variasTarjetas && ocr.estado !== "no disponible") {
        estado(`Leí ${cats.size} por QR. Buscando el resto en el texto de las tarjetas…`);
        const l = await leerTextoLocal(bmp);
        const extra = (l || []).filter(x => !cats.has(x.g));
        if (extra.length) { despues([...aplicar(leidos, "qr"), ...aplicar(extra, "texto")], ""); return; }
      }
      if (!leidos.length) {
        if (ocr.estado !== "no disponible") {
          estado(ocr.estado === "listo" ? "No encontré un QR. Leyendo el texto de la tarjeta…" : "No encontré un QR. Preparando el lector de texto…");
          const l = await leerTextoLocal(bmp, (i, n) => estado(`No encontré un QR. Leyendo el texto… (pasada ${i + 1} de ${n})`));
          if (l && l.length) { leidos = l; via = "texto"; }
        }
        if (!leidos.length && puedeImagen) {
          estado("No encontré un QR. Claude está leyendo el texto (puede tardar unos segundos)…");
          try { leidos = (await leerConClaude(f)) || []; via = "claude"; }
          catch (err) { estado(ERR_CLAUDE[err && err.code] || "No se pudo leer el texto ahora. Probá de nuevo o elegí a mano."); return; }
        }
      }
      despues(aplicar(leidos, via), leidos.length ? "Esa tarjeta ya estaba cargada. Escaneá la siguiente." : consejo());
    } finally { $("#visor").classList.remove("leyendo"); ocupado = false; $("#scan-claude").hidden = !(puedeImagen && ultimaFoto && faltan().length); pintarDiag(); }
  }
  function consejo() {
    const texto = ocr.estado === "listo" || puedeImagen;
    return `No pude leer ninguna tarjeta. Probá así: tarjeta sobre una mesa, foto de frente, que ocupe buena parte de la foto, sin reflejos y enfocada.${texto ? "" : " Si tu tarjeta no tiene QR, en esta pantalla no se puede leer el texto: elegí a mano."}`;
  }
  // Volver a leer la última foto con Claude (letra a mano difícil, o lectura local incompleta)
  $("#scan-claude").onclick = async () => {
    if (!ultimaFoto || ocupado) return; ocupado = true;
    $("#visor").classList.add("leyendo"); estado("Claude está leyendo la foto…");
    try { const l = (await leerConClaude(ultimaFoto, true)) || []; despues(aplicar(l, "claude"), l.length ? "Claude leyó lo mismo que ya estaba cargado." : "Claude tampoco encontró estilo, clima ni evento en la foto."); }
    catch (err) { estado(ERR_CLAUDE[err && err.code] || "No se pudo leer con Claude ahora. Probá de nuevo o elegí a mano."); }
    finally { $("#visor").classList.remove("leyendo"); ocupado = false; $("#scan-claude").hidden = !faltan().length; pintarDiag(); }
  };
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
          // alterna: centro con zoom (QR chico o lejano) y cuadro completo (varias tarjetas); jsQR y ZXing
          const Z = cuadro % 2 === 0 ? zona(video, vw * 0.2, vh * 0.15, vw * 0.6, vh * 0.7, 900) : zona(video, 0, 0, vw, vh, 960);
          decodificarZona(Z, cuadro % 4 < 2 ? conJsQR : conZXing, textos, mot, 2); cuadro++;
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
