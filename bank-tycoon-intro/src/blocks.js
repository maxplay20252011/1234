/* =========================================================================
   Bank Tycoon — intro MAXWER
   blocks.js · Texturas procedurales 16x16 y tiles de bloque en vista lateral.

   Nada acá es un asset: cada textura se genera con ruido determinístico a
   partir de una semilla. La textura NO guarda colores, guarda ÍNDICES DE
   TONO (0 claro / 1 medio / 2 oscuro). El color sale de la paleta de
   config.json en el momento de armar el tile.

   Sombreado por caras, una sola dirección de luz (arriba-izquierda):
     cara superior expuesta -> tonos claros (100%)
     cuerpo del bloque      -> tonos medios (80%)
     lateral derecho y base -> tono oscuro  (60%)
   Y donde el bloque toca a otro va una línea de ambient occlusion de 1 px.

   Como el sombreado ELIGE un tono de la rampa en vez de multiplicar el
   color, la intro no inventa colores nuevos: se queda en la paleta de 16.
   ========================================================================= */
(function () {
  'use strict';

  const T = 16;                       // lado de la textura en píxeles

  /* --------------------------- utilidades ------------------------------ */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let x = Math.imul(a ^ (a >>> 15), 1 | a);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hexToRgb(hex) {
    const h = String(hex).replace('#', '');
    const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const v = parseInt(n, 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  function newCanvas(w, h) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.imageSmoothingEnabled = false;
    return { cv, cx };
  }

  /* ------------------- Texturas: mapas de tono 16x16 ------------------- */

  // Tablones horizontales de 4 px con juntas verticales escalonadas.
  // Tilea sin costura en los dos ejes.
  function texPlanks(seed) {
    const r = rng(seed), m = new Uint8Array(T * T);
    // Tablas de 8 px: dos por tile, como el roble de referencia.
    for (let y = 0; y < T; y++) {
      const row = (y / 8) | 0;
      const joint = (row * 9 + 5) % T;               // junta desplazada por tabla
      for (let x = 0; x < T; x++) {
        let t = r() < 0.20 ? 1 : 0;                  // veta suave
        if (y % 8 === 0) t = 0;                      // canto superior de la tabla
        if (y % 8 === 7) t = 1;                      // sombra entre tablas (tono medio)
        if (x === joint && row % 2 === 0) t = 1;     // junta vertical, una cada dos
        if (r() < 0.03) t = 2;                       // nudos
        m[y * T + x] = t;
      }
    }
    return m;
  }

  // Tablones VERTICALES, para las hojas de la puerta
  function texPlanksV(seed) {
    const r = rng(seed), m = new Uint8Array(T * T);
    for (let x = 0; x < T; x++)
      for (let y = 0; y < T; y++) {
        let t = r() < 0.26 ? 1 : 0;
        if (x % 4 === 0) t = 0;
        if (x % 4 === 3) t = 2;
        if (r() < 0.06) t = 2;
        m[y * T + x] = t;
      }
    return m;
  }

  // Piedra pulida: casi lisa, con manchones muy suaves
  function texPolished(seed) {
    const r = rng(seed), m = new Uint8Array(T * T);
    for (let i = 0; i < m.length; i++) m[i] = 1;
    for (let i = 0; i < m.length; i++) {
      const v = r();
      if (v < 0.10) m[i] = 0;
      else if (v < 0.18) m[i] = 2;
    }
    for (let k = 0; k < 3; k++) {                     // vetas diagonales claras
      let x = (r() * T) | 0, y = (r() * T) | 0;
      for (let d = 0; d < 5; d++) m[((y + d) % T) * T + ((x + d) % T)] = 0;
    }
    return m;
  }

  // Cuarzo: muy claro y parejo
  function texQuartz(seed) {
    const r = rng(seed), m = new Uint8Array(T * T);
    for (let i = 0; i < m.length; i++) m[i] = r() < 0.20 ? 1 : 0;
    for (let k = 0; k < 4; k++) m[((r() * T) | 0) * T + ((r() * T) | 0)] = 2;
    return m;
  }

  // Oro: base media con brillos arriba-izquierda y pepitas oscuras
  function texGold(seed) {
    const r = rng(seed), m = new Uint8Array(T * T);
    for (let i = 0; i < m.length; i++) {
      const x = i % T, y = (i / T) | 0;
      const bias = (T - x + T - y) / (2 * T);
      m[i] = r() < 0.18 + bias * 0.28 ? 0 : (r() < 0.20 ? 2 : 1);
    }
    for (let k = 0; k < 4; k++) {
      const x = 1 + ((r() * (T - 2)) | 0), y = 1 + ((r() * (T - 2)) | 0);
      m[y * T + x] = 2; m[y * T + x + 1] = 2;
    }
    return m;
  }

  // Alfombra: trama tejida
  function texCarpet(seed) {
    const r = rng(seed), m = new Uint8Array(T * T);
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++)
        m[y * T + x] = ((x + y) % 4 < 2) ? 0 : 1;
    for (let i = 0; i < m.length; i++) if (r() < 0.06) m[i] = 2;
    return m;
  }

  const TEXTURES = {
    planks: texPlanks, planksV: texPlanksV, polished: texPolished,
    quartz: texQuartz, gold: texGold, carpet: texCarpet
  };

  function makeToneMap(kind, seed) {
    const f = TEXTURES[kind];
    if (!f) throw new Error('Textura desconocida: ' + kind);
    return f(seed);
  }

  /* ------------------------- Tile 16x16 con caras ---------------------- *
   * edges: bitmask  1 arriba · 2 derecha · 4 abajo · 8 izquierda
   *        expuesto = ese lado da al aire.
   *        edges === -1 => tile "plano", sin caras ni AO (para tilear pared)
   */
  function makeTile(tones, ramp, edges) {
    const { cv, cx } = newCanvas(T, T);
    const img = cx.createImageData(T, T), d = img.data;
    const RGB = ramp.map(hexToRgb);
    const up = !!(edges & 1), rt = !!(edges & 2), dn = !!(edges & 4), lf = !!(edges & 8);
    const plain = edges === -1;

    for (let y = 0; y < T; y++) {
      for (let x = 0; x < T; x++) {
        const tone = tones[y * T + x];
        let t;
        if (plain) {
          t = tone;
        } else {
          t = Math.max(1, tone);                     // cuerpo: cara frontal (80%)
          if (up && y < 2) t = Math.min(1, tone);    // cara superior (100%)
          if (lf && x === 0) t = Math.min(1, tone);  // canto izquierdo iluminado
          if (rt && x === T - 1) t = 2;              // lateral derecho (60%)
          if (dn && y === T - 1) t = 2;              // base (60%)
          if (!up && y === 0) t = 2;                 // AO del bloque de arriba
          if (!lf && x === 0) t = 2;                 // AO del bloque de al lado
        }
        const c = RGB[Math.min(t, RGB.length - 1)];
        const o = (y * T + x) * 4;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      }
    }
    cx.putImageData(img, 0, 0);
    return cv;
  }

  /* Juego de tiles de un material, con caché por combinación de caras.
     Se construyen los 16 casos una sola vez y después es puro blit.       */
  function tileSet(kind, ramp, seed) {
    const tones = makeToneMap(kind, seed);
    const cache = new Map();
    return {
      tones,
      get(edges) {
        if (!cache.has(edges)) cache.set(edges, makeTile(tones, ramp, edges));
        return cache.get(edges);
      }
    };
  }

  // Rectángulo de color plano, útil para sombras y AO
  function makeSolid(color, w, h) {
    const { cv, cx } = newCanvas(w || T, h || T);
    cx.fillStyle = color; cx.fillRect(0, 0, cv.width, cv.height);
    return cv;
  }

  /* ------------------ Máscara de viñeta con dithering ------------------ *
   * Oscurecer multiplicando inventaría colores nuevos y rompería el límite
   * de 16. En su lugar se apagan píxeles sueltos al color de fondo con una
   * matriz de Bayer 8x8: viñeta pixel art de verdad, sin colores nuevos.  */
  const BAYER8 = (function () {
    const m = [[0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26],
               [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
               [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25],
               [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21]];
    return m;
  })();

  function makeVignette(w, h, color, strength, cyFrac, inner) {
    const { cv, cx } = newCanvas(w, h);
    const img = cx.createImageData(w, h), d = img.data;
    const [r, g, b] = hexToRgb(color);
    // El centro va bajo, a la altura de la acción: así el cielo/pared de
    // arriba se apaga y el título entra sobre negro, sin colores nuevos.
    const cxp = (w - 1) / 2, cyp = (h - 1) * (cyFrac === undefined ? 0.5 : cyFrac);
    const maxD = Math.hypot(Math.max(cxp, w - cxp), Math.max(cyp, h - cyp));
    const inn = inner === undefined ? 0.55 : inner;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nd = Math.hypot(x - cxp, y - cyp) / maxD;
        const k = Math.max(0, (nd - inn) / (1 - inn)) * strength;
        const thr = (BAYER8[y & 7][x & 7] + 0.5) / 64;
        if (k > thr) {
          const o = (y * w + x) * 4;
          d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
        }
      }
    }
    cx.putImageData(img, 0, 0);
    return cv;
  }

  window.PixelBlocks = {
    T, rng, hexToRgb, newCanvas,
    makeToneMap, makeTile, tileSet, makeSolid, makeVignette
  };
})();
