/* =========================================================================
   Bank Tycoon — intro MAXWER
   blocks.js · Texturas procedurales y sprites de bloque isométricos.

   Nada de esto es un asset: cada textura de 16x16 se genera con ruido
   determinístico a partir de una semilla, y cada cubo se rasteriza píxel
   por píxel (sin transformaciones de canvas, así que no hay ni un pixel
   interpolado ni una costura entre caras).

   La textura NO guarda colores: guarda ÍNDICES DE TONO (0 = claro,
   1 = medio, 2 = oscuro). El color sale de la paleta de config.json en el
   momento de construir el sprite, y encima se aplica el brillo por cara
   (superior 100%, frontal 80%, lateral 60%). Por eso cambiar la paleta en
   el config cambia la intro sin tocar una línea de código.

   Proyección isométrica falsa 2:1, como los renders de bloque:
       screenX = (gx - gy) * B/2
       screenY = (gx + gy) * B/4 - gz * B
   Con B = 16 todos los pasos son de 8 y 4 px: siempre enteros.
   ========================================================================= */
(function () {
  'use strict';

  const B = 16;            // lado del bloque en píxeles (grilla de 16)
  const TH = B / 2;        // alto de la cara superior en la proyección 2:1

  /* --------------------------- utilidades ------------------------------ */

  // PRNG determinístico (mulberry32): misma semilla, misma textura siempre.
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
  function shade(hex, f) {
    const [r, g, b] = hexToRgb(hex);
    const c = x => Math.max(0, Math.min(255, Math.round(x * f)));
    return 'rgb(' + c(r) + ',' + c(g) + ',' + c(b) + ')';
  }

  function newCanvas(w, h) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.imageSmoothingEnabled = false;
    return { cv, cx };
  }

  /* ------------------- 1. Texturas 16x16 por tipo ---------------------- *
   * Devuelven un Uint8Array de 16*16 con el índice de tono de cada texel. */

  function texStone(seed) {
    const r = rng(seed), m = new Uint8Array(B * B);
    // Piedra: ruido plano con manchones sueltos más oscuros
    for (let i = 0; i < m.length; i++) m[i] = r() < 0.34 ? 1 : 0;
    for (let k = 0; k < 5; k++) {                       // manchones de 2x2
      const x = (r() * (B - 1)) | 0, y = (r() * (B - 1)) | 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) m[(y + dy) * B + x + dx] = 1;
    }
    return m;
  }

  function texIron(seed) {
    const r = rng(seed), m = new Uint8Array(B * B);
    // Hierro: casi liso, con vetas verticales cortas
    for (let i = 0; i < m.length; i++) m[i] = r() < 0.14 ? 1 : 0;
    for (let k = 0; k < 7; k++) {
      const x = (r() * B) | 0, y = (r() * (B - 4)) | 0, len = 2 + ((r() * 3) | 0);
      for (let d = 0; d < len; d++) m[(y + d) * B + x] = 1;
    }
    return m;
  }

  function texGold(seed) {
    const r = rng(seed), m = new Uint8Array(B * B);
    // Oro: base media, brillos claros arriba-izquierda y vetas oscuras
    for (let i = 0; i < m.length; i++) m[i] = 1;
    for (let i = 0; i < m.length; i++) {
      const x = i % B, y = (i / B) | 0;
      const bias = (B - x + B - y) / (2 * B);           // más brillo arriba-izq
      if (r() < 0.20 + bias * 0.22) m[i] = 0;
      else if (r() < 0.20) m[i] = 2;
    }
    for (let k = 0; k < 4; k++) {                        // pepitas oscuras
      const x = 1 + ((r() * (B - 3)) | 0), y = 1 + ((r() * (B - 3)) | 0);
      m[y * B + x] = 2; m[y * B + x + 1] = 2; m[(y + 1) * B + x] = 2;
    }
    return m;
  }

  function texEmerald(seed) {
    const r = rng(seed), m = new Uint8Array(B * B);
    // Esmeralda: cristal romboidal claro sobre base oscura
    for (let i = 0; i < m.length; i++) m[i] = 1;
    for (let y = 0; y < B; y++) {
      for (let x = 0; x < B; x++) {
        const d = Math.abs(x - 7.5) + Math.abs(y - 7.5);
        if (d < 6.5) m[y * B + x] = 0;
        if (d < 6.5 && r() < 0.22) m[y * B + x] = 1;     // facetas
      }
    }
    for (let i = 0; i < m.length; i++) if (r() < 0.08) m[i] = m[i] === 0 ? 1 : 0;
    return m;
  }

  function texWood(seed) {
    const r = rng(seed), m = new Uint8Array(B * B);
    // Madera: tablas horizontales de 5px separadas por línea oscura + veta
    for (let y = 0; y < B; y++) {
      const plankEdge = (y % 5 === 4);
      for (let x = 0; x < B; x++) {
        let t = plankEdge ? 2 : (r() < 0.30 ? 1 : 0);
        if (!plankEdge && r() < 0.09) t = 2;             // veta
        m[y * B + x] = t;
      }
    }
    return m;
  }

  // Cofre: tablas oscuras con un fleje horizontal y un cerrojo (tono 2 = dorado)
  function texChest(seed) {
    const r = rng(seed), m = new Uint8Array(B * B);
    for (let y = 0; y < B; y++)
      for (let x = 0; x < B; x++)
        m[y * B + x] = (y % 5 === 4) ? 1 : (r() < 0.26 ? 1 : 0);
    for (let y = 6; y <= 8; y++) for (let x = 0; x < B; x++) m[y * B + x] = 2;   // fleje
    for (let y = 4; y <= 11; y++) for (let x = 6; x <= 9; x++) m[y * B + x] = 2; // cerrojo
    for (let y = 6; y <= 9; y++) for (let x = 7; x <= 8; x++) m[y * B + x] = 1;  // ojo de la cerradura
    return m;
  }

  const TEXTURES = {
    stone: texStone, iron: texIron, gold: texGold,
    emerald: texEmerald, wood: texWood, chest: texChest
  };

  // Devuelve el mapa de tonos de un tipo de bloque (16x16)
  function makeToneMap(kind, seed) {
    const f = TEXTURES[kind];
    if (!f) throw new Error('Tipo de bloque desconocido: ' + kind);
    return f(seed);
  }

  /* ------------------- 2. Sprite de cubo isométrico -------------------- *
   * Rasterizado a mano: para cada píxel del sprite se calcula a qué cara
   * pertenece y qué texel le toca. Sin drawImage con transform => ni una
   * costura, ni un píxel interpolado.
   * Sprite: B de ancho, TH + h de alto (h = altura del bloque, 16 normal,
   * 8 para una losa).                                                     */
  function makeCubeSprite(tones, ramp, bright, opts) {
    const o = opts || {};
    const h = o.h === undefined ? B : o.h;
    const edge = o.edgeDarken === undefined ? 0.9 : o.edgeDarken;
    const { cv, cx } = newCanvas(B, TH + h);
    const img = cx.createImageData(B, TH + h);
    const d = img.data;

    // Tabla de colores: [cara][tono] -> [r,g,b], y su versión de borde
    const faces = ['top', 'front', 'side'];
    const LUT = {};
    for (const f of faces) {
      LUT[f] = ramp.map(hex => {
        const [r, g, b] = hexToRgb(hex), k = bright[f];
        return [[r * k, g * k, b * k], [r * k * edge, g * k * edge, b * k * edge]]
          .map(c => c.map(v => Math.max(0, Math.min(255, Math.round(v)))));
      });
    }

    for (let py = 0; py < TH + h; py++) {
      for (let px = 0; px < B; px++) {
        const dx = px + 0.5, dy = py + 0.5;
        let face = null, u = 0, v = 0;

        // Cara superior (rombo): u,v se despejan de la afín 2:1
        const tu = (dx) - 2 * (dy - TH / 2);
        const tv = (dx) + 2 * (dy - TH / 2);
        if (tu >= 0 && tu < B && tv >= 0 && tv < B) { face = 'top'; u = tu; v = tv; }
        else if (dx < B / 2) {                       // cara frontal (izquierda)
          u = 2 * dx;
          v = (dy - TH / 2 - 0.25 * u) * B / h;
          if (u >= 0 && u < B && v >= 0 && v < B) face = 'front';
        } else {                                     // cara lateral (derecha)
          u = 2 * (dx - B / 2);
          v = (dy - TH + 0.25 * u) * B / h;
          if (u >= 0 && u < B && v >= 0 && v < B) face = 'side';
        }
        if (!face) continue;

        const iu = Math.min(B - 1, Math.max(0, u | 0));
        const iv = Math.min(B - 1, Math.max(0, v | 0));
        const tone = tones[iv * B + iu];
        const isEdge = (iu === B - 1 || iv === B - 1);
        const c = LUT[face][Math.min(tone, ramp.length - 1)][isEdge ? 1 : 0];
        const o4 = (py * B + px) * 4;
        d[o4] = c[0]; d[o4 + 1] = c[1]; d[o4 + 2] = c[2]; d[o4 + 3] = 255;
      }
    }
    cx.putImageData(img, 0, 0);
    return cv;
  }

  /* ------------------- 3. Sprites de ítem (16x16) ---------------------- */

  // Lingote de oro: trapecio con cara superior clara y frente medio/oscuro
  function makeIngot(ramp) {
    const { cv, cx } = newCanvas(B, B);
    const img = cx.createImageData(B, B), d = img.data;
    const put = (x, y, hex) => {
      if (x < 0 || y < 0 || x >= B || y >= B) return;
      const [r, g, b] = hexToRgb(hex), o = (y * B + x) * 4;
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    };
    for (let y = 3; y <= 6; y++) {                    // cara superior
      const half = 3 + (y - 3);
      for (let x = 8 - half; x < 8 + half; x++) put(x, y, ramp[0]);
    }
    for (let y = 7; y <= 12; y++) {                   // frente
      const half = 6;
      for (let x = 8 - half; x < 8 + half; x++) put(x, y, y >= 11 ? ramp[2] : ramp[1]);
    }
    for (let x = 2; x < 14; x++) put(x, 13, ramp[2]); // base
    cx.putImageData(img, 0, 0);
    return cv;
  }

  // Esmeralda: gema romboidal con brillo arriba-izquierda
  function makeGem(ramp) {
    const { cv, cx } = newCanvas(B, B);
    const img = cx.createImageData(B, B), d = img.data;
    for (let y = 1; y < B - 1; y++) {
      for (let x = 1; x < B - 1; x++) {
        const dd = Math.abs(x - 7.5) / 6.2 + Math.abs(y - 7.5) / 7.2;
        if (dd > 1) continue;
        const light = (x - 7.5) + (y - 7.5) < -2;
        const hex = light ? ramp[0] : (dd > 0.72 ? ramp[1] : ramp[0]);
        const o = (y * B + x) * 4, [r, g, b] = hexToRgb(hex);
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
      }
    }
    cx.putImageData(img, 0, 0);
    return cv;
  }

  /* Fotogramas de giro en Y, como un item drop: el sprite se comprime
     horizontalmente a anchos discretos. Muestreo nearest hecho a mano. */
  function makeSpinFrames(src, n) {
    const sctx = src.getContext('2d', { willReadFrequently: true });
    const sd = sctx.getImageData(0, 0, src.width, src.height).data;
    const out = [];
    for (let f = 0; f < n; f++) {
      const k = Math.cos((f / n) * Math.PI * 2);
      const w = Math.max(1, Math.round(Math.abs(k) * src.width));
      const { cv, cx } = newCanvas(src.width, src.height);
      const img = cx.createImageData(src.width, src.height), d = img.data;
      const x0 = ((src.width - w) / 2) | 0;
      for (let y = 0; y < src.height; y++) {
        for (let x = 0; x < w; x++) {
          let sx = Math.min(src.width - 1, ((x + 0.5) / w * src.width) | 0);
          if (k < 0) sx = src.width - 1 - sx;         // espejado en media vuelta
          const so = (y * src.width + sx) * 4, dof = (y * src.width + x0 + x) * 4;
          d[dof] = sd[so]; d[dof + 1] = sd[so + 1]; d[dof + 2] = sd[so + 2]; d[dof + 3] = sd[so + 3];
        }
      }
      cx.putImageData(img, 0, 0);
      out.push(cv);
    }
    return out;
  }

  /* ------------------- 4. Proyección isométrica ------------------------ */
  // Esquina superior izquierda del sprite del bloque (gx,gy,gz)
  function isoPos(gx, gy, gz) {
    return { x: (gx - gy) * (B / 2), y: (gx + gy) * (B / 4) - gz * B };
  }
  // Clave de pintor: menor = más lejos. +x, +y y +z se dibujan después.
  function isoDepth(gx, gy, gz) { return gx + gy + gz; }

  window.PixelBlocks = {
    B, TH, rng, shade, hexToRgb, newCanvas,
    makeToneMap, makeCubeSprite, makeIngot, makeGem, makeSpinFrames,
    isoPos, isoDepth
  };
})();
