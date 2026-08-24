/* =========================================================================
   Bank Tycoon — intro MAXWER
   character.js · Rig del muñeco y ciclo de caminata.

   NO es Steve ni ninguna skin de Mojang: es un muñeco blocky genérico
   armado con rectángulos, con proporciones tipo Minecraft y la paleta
   entera saliendo de config.json -> character.

   Todo se trabaja en UNIDADES DE TEXTURA (1 tu = 1 píxel de textura) y se
   dibuja escalado x2, igual que los bloques. Las extremidades no se rotan
   en el canvas: cada ángulo del ciclo se RASTERIZA una vez a un sprite de
   píxeles (nearest, sin antialiasing) y después es puro blit a coordenadas
   enteras. Eso es lo que da la rotación "por frames discretos".

   Medidas (tu):  cabeza 8x8 · torso 4x12 de perfil · brazo 4x12 · pierna 4x12
   ========================================================================= */
(function () {
  'use strict';

  const PB = window.PixelBlocks;
  const LIMB_W = 4, LIMB_H = 12;
  const D = 20, PIVX = 10, PIVY = 4;      // lienzo del sprite rotado y su pivote

  /* ------------- helpers: grilla de colores -> canvas de píxeles -------- */
  function gridCanvas(w, h, fn) {
    const { cv, cx } = PB.newCanvas(w, h);
    const img = cx.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const col = fn(x, y);
        if (!col) continue;
        const [r, g, b] = PB.hexToRgb(col), o = (y * w + x) * 4;
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
      }
    cx.putImageData(img, 0, 0);
    return cv;
  }

  /* Rasteriza un rectángulo de color rotado alrededor de un pivote.
     Se recorre el DESTINO y se mapea hacia atrás: cada píxel destino toma
     un texel exacto o queda transparente. Sin interpolación posible.      */
  function rotatedLimb(fn, w, h, pivX, pivY, deg) {
    const { cv, cx } = PB.newCanvas(D, D);
    const img = cx.createImageData(D, D), d = img.data;
    const a = deg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    for (let dy = 0; dy < D; dy++) {
      for (let dx = 0; dx < D; dx++) {
        const rx = dx + 0.5 - PIVX, ry = dy + 0.5 - PIVY;
        const sx = Math.floor(rx * ca + ry * sa + pivX);
        const sy = Math.floor(-rx * sa + ry * ca + pivY);
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
        const col = fn(sx, sy);
        if (!col) continue;
        const [r, g, b] = PB.hexToRgb(col), o = (dy * D + dx) * 4;
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
      }
    }
    cx.putImageData(img, 0, 0);
    return cv;
  }

  /* ---------------------------- construcción --------------------------- */
  function build(P, cfg) {
    // Miembro delantero y trasero con tonos distintos: el de atrás va en
    // sombra. Sin eso las dos piernas se funden en un solo bloque gris.
    const dark = P.hair || P.suit[1];
    const legFn = back => (x, y) => y >= 10 ? (back ? dark : P.suit[1])
      : (x === LIMB_W - 1 ? (back ? dark : P.suit[1]) : (back ? P.suit[1] : P.suit[0]));
    const armFn = back => (x, y) => y >= 10
      ? (back ? P.skin[1] : (x === LIMB_W - 1 ? P.skin[1] : P.skin[0]))
      : (x === LIMB_W - 1 ? (back ? dark : P.suit[1]) : (back ? P.suit[1] : P.suit[0]));

    // Cabeza de perfil mirando a la derecha
    const headSide = gridCanvas(8, 8, (x, y) => {
      const hair = P.hair || P.suit[1];
      if (y < 2) return hair;                            // pelo
      if (x < 2 && y < 5) return hair;                   // nuca
      if (x === 6 && y === 4) return P.eye;              // ojo
      if (x === 2 && y === 5) return P.skin[1];          // oreja
      return x >= 6 ? P.skin[1] : P.skin[0];
    });
    const headFront = gridCanvas(8, 8, (x, y) => {
      if (y < 2) return P.hair || P.suit[1];
      if (y === 4 && (x === 2 || x === 5)) return P.eye;
      return (x === 7) ? P.skin[1] : P.skin[0];
    });

    // Torso de perfil: 4 de ancho, camisa y corbata al frente (derecha)
    const torsoSide = gridCanvas(4, 12, (x, y) => {
      if (x === 3) {
        if (y >= 1 && y <= 5) return P.tie;
        if (y <= 8) return P.shirt;
        return P.suit[1];
      }
      return x === 2 ? P.suit[1] : P.suit[0];
    });
    // Torso de frente: 8 de ancho, solapa blanca y corbata al centro
    const torsoFront = gridCanvas(8, 12, (x, y) => {
      if ((x === 3 || x === 4) && y <= 8) return (y >= 1 && y <= 5 && x === 4) ? P.tie : P.shirt;
      if (x === 7) return P.suit[1];
      return P.suit[0];
    });
    // Torso a 3/4: 6 de ancho
    const torso34 = gridCanvas(6, 12, (x, y) => {
      if (x >= 4 && y <= 8) return (y >= 1 && y <= 5 && x === 5) ? P.tie : P.shirt;
      return x === 3 ? P.suit[1] : P.suit[0];
    });

    // Sprites rotados: un canvas por ángulo discreto del ciclo
    const cacheLeg = new Map(), cacheArm = new Map();
    const legAt = (deg, back) => {
      const k = Math.round(deg) + (back ? 1000 : 0);
      if (!cacheLeg.has(k)) cacheLeg.set(k, rotatedLimb(legFn(!!back), LIMB_W, LIMB_H, 2, 0, Math.round(deg)));
      return cacheLeg.get(k);
    };
    const armAt = (deg, back) => {
      const k = Math.round(deg) + (back ? 1000 : 0);
      if (!cacheArm.has(k)) cacheArm.set(k, rotatedLimb(armFn(!!back), LIMB_W, LIMB_H, 2, 0, Math.round(deg)));
      return cacheArm.get(k);
    };

    // Lingote de oro que cae a sus pies (8x5 tu)
    const ingot = gridCanvas(8, 5, (x, y) => {
      if (y === 0) return (x >= 1 && x <= 6) ? cfg.gold[0] : null;
      if (y === 4) return (x >= 1 && x <= 6) ? cfg.gold[2] : null;
      if (y === 1) return cfg.gold[0];
      return x === 7 ? cfg.gold[2] : cfg.gold[1];
    });

    return {
      headSide, headFront, torsoSide, torsoFront, torso34, legAt, armAt, ingot,
      W: LIMB_W, H: LIMB_H, D, PIVX, PIVY
    };
  }

  /* --------------------------- ciclo de caminata ----------------------- *
   * cycleTicks (10) ticks por ciclo, poseTicks (2) => 5 poses discretas.
   * El ángulo es un seno muestreado en esas 5 poses: nunca se interpola.  */
  function poseCount(cfg) { return Math.max(1, Math.round(cfg.cycleTicks / cfg.poseTicks)); }

  function poseAngles(cfg, pose) {
    const n = poseCount(cfg);
    const s = Math.sin((pose / n) * Math.PI * 2);
    return {
      legFront: cfg.legSwingDeg * s,
      legBack: -cfg.legSwingDeg * s,
      armFront: -cfg.armSwingDeg * s,
      armBack: cfg.armSwingDeg * s,
      // Bob: sube 1 px de textura en el paso medio (piernas juntas)
      bob: Math.abs(s) < 0.2 ? -cfg.bobTexPx : 0,
      contact: Math.abs(s) > 0.9      // pose de apoyo: ahí salta el polvo
    };
  }

  /* ------------------------------- dibujo ------------------------------ *
   * x, yFeet en píxeles de canvas (enteros). k = escala (2).
   * view: 'side' | 'q34' | 'front'                                        */
  function draw(cx, R, x, yFeet, opts) {
    const k = opts.scale, view = opts.view || 'side';
    const A = opts.angles || { legFront: 0, legBack: 0, armFront: 0, armBack: 0, bob: 0 };
    const bob = (opts.bobOverride !== undefined ? opts.bobOverride : A.bob) * k;
    const blitK = (spr, px, py) => cx.drawImage(
      spr, 0, 0, spr.width, spr.height,
      Math.round(px), Math.round(py), spr.width * k, spr.height * k);

    const hipY = yFeet - 12 * k + bob;          // cadera: 12 tu sobre el piso
    const shoulderY = yFeet - 23 * k + bob;     // hombro
    const torsoY = yFeet - 24 * k + bob;
    const headY = yFeet - 32 * k + bob;
    const putLimb = (spr, px, py) => cx.drawImage(
      spr, 0, 0, spr.width, spr.height,
      Math.round(px - R.PIVX * k), Math.round(py - R.PIVY * k), spr.width * k, spr.height * k);

    if (view === 'side') {
      // Orden de pintor: lo de atrás primero. Los brazos van corridos 1 tu
      // para que se vean aunque el ángulo sea 0 (pose de paso medio).
      putLimb(R.armAt(A.armBack, true), x - k, shoulderY);
      putLimb(R.legAt(A.legBack, true), x - k, hipY);
      blitK(R.torsoSide, x - 2 * k, torsoY);
      blitK(R.headSide, x - 3 * k, headY);
      putLimb(R.legAt(A.legFront, false), x + k, hipY);
      putLimb(R.armAt(A.armFront, false), x + k, shoulderY);
    } else if (view === 'q34') {
      putLimb(R.legAt(0, true), x - 2 * k, hipY);
      blitK(R.torso34, x - 3 * k, torsoY);
      blitK(R.headSide, x - 3 * k, headY);
      putLimb(R.legAt(0, false), x + 2 * k, hipY);
      putLimb(R.armAt(0, false), x + 3 * k, shoulderY);
    } else {
      putLimb(R.legAt(0, true), x - 2 * k, hipY);
      putLimb(R.legAt(0, false), x + 2 * k, hipY);
      blitK(R.torsoFront, x - 4 * k, torsoY);
      blitK(R.headFront, x - 4 * k, headY);
      putLimb(R.armAt(0, true), x - 6 * k, shoulderY);
      putLimb(R.armAt(0, false), x + 6 * k, shoulderY);
    }
  }

  // Sombra elíptica pixelada bajo los pies (se achica con el bob)
  function drawShadow(cx, x, yFeet, k, color, shrink) {
    const halfW = (shrink ? 5 : 6) * k, h = (shrink ? 1 : 2) * k;
    cx.fillStyle = color;
    cx.fillRect(Math.round(x - halfW), Math.round(yFeet - h), Math.round(halfW * 2), Math.round(h));
    cx.fillRect(Math.round(x - halfW + k), Math.round(yFeet - h - k), Math.round(halfW * 2 - 2 * k), Math.round(k));
  }

  window.PixelCharacter = { build, poseAngles, poseCount, draw, drawShadow, LIMB_W, LIMB_H };
})();
