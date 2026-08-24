/* =========================================================================
   Bank Tycoon — intro MAXWER
   animation.js · Motor DETERMINÍSTICO a ticks, sobre Canvas 2D.

   Dos ideas gobiernan todo:

   1) NO hay requestAnimationFrame. Existe una sola función pura de tiempo,
      INTRO.seek(t), que deja el canvas exactamente en el estado de ese
      instante. render.mjs la llama con t = i/fps y captura.

   2) La lógica corre a 20 TICKS/s aunque el video salga a 60 fps. Lo
      primero que hace seek() es tick = floor(t*20); todo se calcula desde
      ese entero. Por eso el movimiento se siente a pasos, como Minecraft,
      y cada tick ocupa exactamente 3 frames del video.

   El personaje camina EN EL LUGAR, fijo en x = 35.5 % del ancho: lo que se
   mueve es el mundo. La cámara no se mueve nunca en vertical.
   ========================================================================= */
(function () {
  'use strict';

  const PB = window.PixelBlocks;
  const PF = window.PixelFont;
  const PC = window.PixelCharacter;

  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  const clamp01 = v => clamp(v, 0, 1);
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeOutCubic = k => 1 - Math.pow(1 - clamp01(k), 3);
  const easeOutQuad = k => 1 - (1 - clamp01(k)) * (1 - clamp01(k));
  const R = Math.round;

  const S = {
    cfg: null, fmt: null, beats: null, ch: null,
    W: 0, H: 0, up: 4, k: 2, T: 16, B: 32,
    TPS: 20, fps: 60, duration: 4, tk: 1, alpha: false,
    cv: null, cx: null, rnd: null,
    tiles: {}, rig: null, vignette: null, fadeMasks: [],
    worldX: [], speed: [], phase: [],
    dust: [], burst: [], title: null, textRects: []
  };

  function beat(name) {
    const b = S.beats[name];
    return {
      on: b.enabled !== false,
      a: b.start * S.tk, b: b.end * S.tk, raw: b,
      ta: R(b.start * S.tk * S.TPS), tb: R(b.end * S.tk * S.TPS)
    };
  }
  const bticks = B => Math.max(1, B.tb - B.ta);

  /* =====================================================================
     1. Fachada del banco: mapa de bloques
        S cartel · C columna · Q cuarzo · W marco de ventana · G oro
        D puerta de roble oscuro · P base de piedra pulida
     ===================================================================== */
  const BANK_FULL = [
    'SSSSSS',
    'CQQQQC',
    'CWGGWC',
    'CWGGWC',
    'CQDDQC',
    'CQDDQC',
    'CQDDQC',
    'PPPPPP'
  ];
  const MAT = { S: 'sign', C: 'column', Q: 'quartz', W: 'frame', G: 'gold', D: 'door', P: 'base' };

  function bankMap(rows) {
    if (rows >= BANK_FULL.length) return BANK_FULL.slice();
    // Se conserva siempre el cartel de arriba y las filas de abajo
    return [BANK_FULL[0]].concat(BANK_FULL.slice(BANK_FULL.length - (rows - 1)));
  }

  /* =====================================================================
     2. Construcción (una sola vez)
     ===================================================================== */
  function buildTiles() {
    const P = S.cfg.palette, seed = S.cfg.pixel.textureSeed;
    const set = (kind, ramp, off) => PB.tileSet(kind, ramp, seed + off);
    S.tiles = {
      wallFar: set('planks', P.wallFar, 11),
      wallNear: set('planks', P.wallNear, 23),
      base: set('polished', P.stone, 37),
      column: set('polished', P.stone, 41),
      quartz: set('quartz', P.quartz, 53),
      gold: set('gold', P.gold, 67),
      door: set('planksV', P.darkOak, 71),
      frame: set('planksV', P.darkOak, 83),
      sign: set('planks', P.darkOak, 89),
      carpet: set('carpet', P.carpet, 97)
    };
    S.tiles.floor = S.tiles.base;
  }

  // Máscaras de fundido: dithering Bayer al color de fondo. Un degradé real
  // inventaría colores nuevos y rompería el límite de paleta.
  function buildFadeMasks() {
    const P = S.cfg.palette;
    S.fadeMasks = [];
    for (let k = 0; k <= 8; k++) {
      const { cv, cx } = PB.newCanvas(S.W, S.H);
      const img = cx.createImageData(S.W, S.H), d = img.data;
      const [r, g, b] = PB.hexToRgb(P.bg);
      for (let y = 0; y < S.H; y++)
        for (let x = 0; x < S.W; x++) {
          const thr = (((x & 7) * 5 + (y & 7) * 13 + ((x >> 3) ^ (y >> 3))) % 64 + 0.5) / 64;
          if (thr >= k / 8) continue;
          const o = (y * S.W + x) * 4;
          d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
        }
      cx.putImageData(img, 0, 0);
      S.fadeMasks.push(cv);
    }
    S.fadeMasks.reverse();   // índice 0 = todo tapado, 8 = nada
  }

  /* Cámara: velocidad por tick con desaceleración con easing (nunca lineal)
     y desplazamiento acumulado. Se precalcula por tick: puro y repetible. */
  function buildCamera() {
    const Bw = beat('walk'), Bs = beat('stop');
    const base = S.cfg.scene.walkSpeed;
    const decel = S.cfg.beats.stop.walkDownTicks || 6;
    const total = R(S.duration * S.TPS) + 2;
    S.worldX = new Array(total); S.speed = new Array(total); S.phase = new Array(total);
    let x = 0, ph = 0;
    for (let t = 0; t < total; t++) {
      let v = Bw.on ? base : 0;
      if (Bs.on) {
        if (t >= Bs.ta) {
          const q = clamp01((t - Bs.ta) / decel);
          v = R(base * Math.pow(1 - q, 2));         // ease-out cuadrático
        }
      }
      if (!Bw.on && !Bs.on) v = 0;
      S.speed[t] = v; S.worldX[t] = x; S.phase[t] = ph;
      x += v;
      ph += base > 0 ? v / base : 0;                // el ciclo frena con el cuerpo
    }
  }

  // Polvo de las pisadas: se precalcula recorriendo los ticks y detectando
  // en cuáles la pose entra en apoyo.
  function buildDust() {
    const C = S.cfg.character, n = PC.poseCount(C);
    const per = S.cfg.scene.dustPerStep;
    S.dust = [];
    let prev = -1;
    for (let t = 0; t < S.phase.length; t++) {
      if (S.speed[t] <= 0) { prev = -1; continue; }
      const pose = Math.floor(S.phase[t] / C.poseTicks) % n;
      if (pose === prev) continue;
      prev = pose;
      if (!PC.poseAngles(C, pose).contact) continue;
      for (let i = 0; i < per; i++) {
        S.dust.push({
          t0: t,
          dx: -6 - S.rnd() * 10, dy: -1 - S.rnd() * 2,
          vx: -1 - S.rnd() * 3, vy: -1.2 - S.rnd() * 1.8,
          g: 0.5 + S.rnd() * 0.4, life: 4 + ((S.rnd() * 4) | 0),
          size: S.rnd() < 0.5 ? 2 : 3, tone: S.rnd() < 0.5 ? 0 : 1
        });
      }
    }
  }

  function buildBurst() {
    const Bb = S.cfg.beats.burst;
    S.burst = [];
    for (let i = 0; i < Bb.particles; i++) {
      const a = S.rnd() * Math.PI * 2, sp = 3 + S.rnd() * 17;
      S.burst.push({
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.75 - 3.5,
        g: 0.5 + S.rnd() * 0.6, size: S.rnd() < 0.3 ? 6 : (S.rnd() < 0.62 ? 4 : 3),
        life: 6 + ((S.rnd() * 6) | 0), tone: (S.rnd() * 3) | 0
      });
    }
  }

  function buildTitle() {
    const T = S.cfg.text, bt = S.cfg.beats.title;
    const words = String(T.title).trim().split(/\s+/).filter(Boolean);
    const want = T.titleLayout === '1line' ? 1 : T.titleLayout === '2lines' ? 2
      : (S.fmt.titleLines || (S.W < S.H ? 2 : 1));
    let lines;
    if (want < 2 || words.length < 2) lines = [words.join(' ')];
    else {
      let best = 1, diff = Infinity;
      for (let i = 1; i < words.length; i++) {
        const d = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
        if (d < diff) { diff = d; best = i; }
      }
      lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
    }
    // Escala SIEMPRE entera: media escala rompería el pixel-perfect
    const avail = S.W - 2 * lowSide() - 2;
    let scale = 1;
    for (let s = 10; s >= 1; s--) {
      if (Math.max.apply(null, lines.map(l => PF.measure(l, s, s))) <= avail) { scale = s; break; }
    }
    const lineH = PF.H * scale + 2 * scale;
    const topY = R(S.fmt.titleY * S.H);
    const chars = [];
    lines.forEach((line, li) => {
      const w = PF.measure(line, scale, scale);
      let x = R(S.W / 2 - w / 2 - (bt.shadowOffset * scale) / 2);
      const y = topY + li * lineH;
      for (let i = 0; i < line.length; i++) {
        if (line[i] !== ' ') chars.push({ ch: line[i], x, y, order: chars.length });
        x += PF.W * scale + scale;
      }
    });
    S.title = { lines, chars, scale, lineH, topY, shadowOffset: bt.shadowOffset };
  }

  const lowSide = () => R(S.fmt.safeSide / S.up);

  function build() {
    buildTiles();
    buildFadeMasks();
    buildCamera();
    buildDust();
    buildBurst();
    buildTitle();
    S.rig = PC.build(S.cfg.character, S.cfg.palette);
    S.vignette = PB.makeVignette(S.W, S.H, S.cfg.palette.bg, S.cfg.scene.vignette,
      S.cfg.scene.vignetteCenterY, S.cfg.scene.vignetteInner);

    S.floorTop = S.fmt.floorTop;
    S.charX = R(S.W * S.cfg.character.xFrac);
    S.bankRows = S.fmt.bankRows;
    S.bankMap = bankMap(S.bankRows);
    S.bankCols = S.cfg.scene.bankCols;
    S.bankTop = S.floorTop - S.bankRows * S.B;
    S.nearTop = S.floorTop - S.cfg.scene.nearWallRows * S.B;
    // El banco viaja con el mundo: se ancla para terminar en bankFinalX
    const endTick = beat('stop').tb;
    S.bankWorldX = S.fmt.bankFinalX + S.worldX[Math.min(endTick, S.worldX.length - 1)];
  }

  /* =====================================================================
     3. Dibujo
     ===================================================================== */
  const blit2 = (spr, x, y) => S.cx.drawImage(
    spr, 0, 0, spr.width, spr.height, R(x), R(y), spr.width * S.k, spr.height * S.k);

  function px(x, y, w, h, color) {
    S.cx.fillStyle = color;
    S.cx.fillRect(R(x), R(y), R(w), R(h));
  }

  function text(str, x, y, opts) {
    const r = PF.drawText(S.cx, str, x, y, opts);
    S.textRects.push({ id: opts.id || 'text', x: r.x, y: r.y, w: r.width, h: r.height });
    return r;
  }

  // Tilea un material sobre un rectángulo, con desplazamiento de parallax
  function tileRect(set, edges, x0, y0, x1, y1, offX) {
    const B = S.B;
    const start = Math.floor((x0 + offX) / B) * B - offX;
    const spr = set.get(edges);
    for (let y = y0; y < y1; y += B)
      for (let x = start; x < x1; x += B) blit2(spr, x, y);
  }

  function drawBank(sx) {
    const map = S.bankMap, cols = S.bankCols, B = S.B;
    if (sx > S.W || sx + cols * B < 0) return;
    const at = (r, c) => (r < 0 || r >= map.length || c < 0 || c >= cols) ? null : map[r][c];
    for (let r = 0; r < map.length; r++) {
      for (let c = 0; c < cols; c++) {
        const ch = at(r, c); if (!ch) continue;
        const x = sx + c * B, y = S.bankTop + r * B;
        if (x + B < 0 || x > S.W) continue;
        // Expuesto = el vecino es aire o es otro material: así cada pieza
        // (puerta, ventana, columnas) queda con su propio relieve.
        const e = (at(r - 1, c) === ch ? 0 : 1) | (at(r, c + 1) === ch ? 0 : 2)
                | (at(r + 1, c) === ch ? 0 : 4) | (at(r, c - 1) === ch ? 0 : 8);
        blit2(S.tiles[MAT[ch]].get(e), x, y);
      }
    }
    // Cartel: texto en la fila de arriba
    const P = S.cfg.palette, sign = S.cfg.text.bankSign;
    if (sign) {
      const sc = 3, w = PF.measure(sign, sc, sc);
      const cx0 = sx + (cols * B) / 2;
      if (cx0 > -w && cx0 < S.W + w) {
        PF.drawText(S.cx, sign, cx0, S.bankTop + 6, {
          scale: sc, tracking: sc, align: 'center',
          color: P.gold[0], shadowColor: P.shadow, shadowOffset: 1
        });
      }
    }
    // Antorchas encendidas a los lados de la puerta, parpadeo de 3 pasos
    drawTorch(sx + 6, S.bankTop + (map.length - 4) * B + 8);
    drawTorch(sx + (cols - 1) * B + 20, S.bankTop + (map.length - 4) * B + 8);
  }

  let torchStep = 0;
  function drawTorch(x, y) {
    const P = S.cfg.palette, k = S.k;
    if (x < -16 || x > S.W + 16) return;
    px(x, y, 2 * k, 6 * k, P.oak[2]);                       // palo
    px(x, y, k, 6 * k, P.oak[1]);
    const f = torchStep;                                     // 0,1,2
    const h = [3, 4, 3][f], w = [3, 3, 4][f];
    px(x - k, y - h * k, w * k, h * k, P.gold[1]);           // llama
    px(x - k + (f === 2 ? k : 0), y - h * k, k * 2, k * 2, P.gold[0]);
    px(x, y - (h + 1) * k, k, k, P.gold[0]);
  }

  /* =====================================================================
     4. seek(t)
     ===================================================================== */
  function seek(tRaw) {
    const cfg = S.cfg, P = cfg.palette, cx = S.cx, C = cfg.character;
    const t = clamp(tRaw, 0, S.duration);
    const tick = Math.floor(t * S.TPS + 1e-9);         // <<< cuantización
    S.textRects.length = 0;

    const Bfade = beat('fade'), Bwalk = beat('walk'), Bstop = beat('stop');
    const Btitle = beat('title'), Bhud = beat('hud'), Bburst = beat('burst');

    cx.clearRect(0, 0, S.W, S.H);
    if (!S.alpha) { cx.fillStyle = P.bg; cx.fillRect(0, 0, S.W, S.H); }

    const burstTick = tick - Bburst.ta;
    const wiped = Bburst.on && burstTick >= cfg.beats.burst.flashTicks;

    const iw = Math.min(tick, S.worldX.length - 1);
    const worldX = S.worldX[iw], speed = S.speed[iw], phase = S.phase[iw];
    torchStep = Math.floor(tick / cfg.scene.torchFlickerTicks) % 3;

    if (!wiped) {
      /* ---- fondo: dos capas de tablones con parallax ---- */
      const offFar = R(worldX * cfg.scene.parallaxFar);
      const offNear = R(worldX * cfg.scene.parallaxNear);
      tileRect(S.tiles.wallFar, -1, 0, 0, S.W, S.floorTop, offFar);
      tileRect(S.tiles.wallNear, -1, 0, S.nearTop, S.W, S.floorTop, offNear);
      // AO donde arranca la pared cercana: contra el fondo lejano (que ya es
      // #3F3F3F) la línea tiene que ir en el color de fondo para que se vea.
      px(0, S.nearTop, S.W, 2, P.bg);

      /* ---- banco ---- */
      const bankSX = S.bankWorldX - worldX;
      drawBank(bankSX);
      // AO de la fachada contra la pared
      if (bankSX > 0 && bankSX < S.W) px(bankSX - 2, S.bankTop, 2, S.floorTop - S.bankTop, P.shadow);

      /* ---- suelo: una fila de piedra pulida + línea de sombra ---- */
      px(0, S.floorTop - 2, S.W, 2, P.shadow);          // AO donde toca la pared
      tileRect(S.tiles.floor, 1, 0, S.floorTop, S.W, S.H, worldX);
      tileRect(S.tiles.base, 0, 0, S.floorTop + S.B, S.W, S.H, worldX);

      /* ---- alfombra roja saliendo de la puerta hacia el personaje ---- */
      const carpetX0 = bankSX + 2 * S.B - 84, carpetX1 = bankSX + 4 * S.B;
      const cx0 = Math.max(0, carpetX0), cx1 = Math.min(S.W, carpetX1);
      if (cx1 > cx0) {
        px(cx0, S.floorTop, cx1 - cx0, 6, P.carpet[0]);
        px(cx0, S.floorTop + 5, cx1 - cx0, 1, P.carpet[1]);
        // Trama tejida: 1 px cada 4, enganchada al mundo para que no patine
        for (let x = cx0; x < cx1; x++) {
          if (((x + worldX) & 3) === 0) px(x, S.floorTop, 1, 5, P.carpet[1]);
        }
        if (carpetX0 >= 0) px(cx0, S.floorTop, 2, 6, P.carpet[1]);   // fleco
      }

      /* ---- personaje ---- */
      const stopT = tick - Bstop.ta;
      let view = 'side';
      if (Bstop.on && stopT >= 8) view = 'front';
      else if (Bstop.on && stopT >= 6) view = 'q34';
      const n = PC.poseCount(C);
      const pose = Math.floor(phase / C.poseTicks) % n;
      const A = speed > 0 ? PC.poseAngles(C, pose)
        : { legFront: 0, legBack: 0, armFront: 0, armBack: 0, bob: 0, contact: false };
      PC.drawShadow(cx, S.charX, S.floorTop + 4, S.k, P.shadow, A.bob !== 0);
      PC.draw(cx, S.rig, S.charX, S.floorTop, { scale: S.k, view, angles: A });

      /* ---- polvo de las pisadas ---- */
      for (const d of S.dust) {
        const lt = tick - d.t0;
        if (lt < 0 || lt >= d.life) continue;
        const x = S.charX + d.dx + d.vx * lt;
        const y = S.floorTop + d.dy + d.vy * lt + 0.5 * d.g * lt * lt;
        px(x, y, d.size, d.size, P.stone[d.tone]);
      }

      /* ---- lingote que cae y rebota a sus pies ---- */
      if (Bstop.on && stopT >= 3) {
        const lt = stopT - 3, land = cfg.beats.stop.ingotDropTicks;
        const bx = S.charX + 20;
        let y;
        if (lt < land) {
          const q = lt / land;
          y = S.floorTop - 5 * S.k - (1 - q * q) * 180;
        } else {
          const b = lt - land;
          y = S.floorTop - 5 * S.k - (b === 0 ? 0 : b === 1 ? 10 : b === 2 ? 4 : 0);
        }
        blit2(S.rig.ingot, bx, y);
      }
    }

    /* ---- viñeta con dithering (nunca inventa colores) ----
       Va acá, sobre la escena pero DEBAJO del texto: si fuera al final se
       comería las letras del título con el patrón de puntos. */
    if (!wiped && cfg.scene.vignette > 0) maskBlit(S.vignette);

    /* ---- título letra por letra ---- */
    if (!wiped && Btitle.on && S.title) {
      const B4 = Btitle.raw, bt = tick - Btitle.ta;
      const dist = B4.fallBlocks * S.B, FT = 4;
      for (const c of S.title.chars) {
        const lt = bt - c.order * B4.ticksPerLetter;
        if (lt < 0) continue;
        const q = clamp01(lt / FT);
        const y = c.y - R((1 - q * q) * dist);
        PF.drawChar(cx, c.ch, c.x + S.title.shadowOffset * S.title.scale,
          y + S.title.shadowOffset * S.title.scale, S.title.scale, P.shadow);
        PF.drawChar(cx, c.ch, c.x, y, S.title.scale, P.text);
      }
      const done = S.title.chars.filter(c => bt - c.order * B4.ticksPerLetter >= FT);
      if (done.length) {
        const x0 = Math.min.apply(null, done.map(c => c.x));
        const x1 = Math.max.apply(null, done.map(c => c.x + PF.W * S.title.scale));
        const y0 = Math.min.apply(null, done.map(c => c.y));
        const y1 = Math.max.apply(null, done.map(c => c.y + PF.H * S.title.scale));
        S.textRects.push({ id: 'title', x: x0, y: y0,
          w: x1 - x0 + S.title.shadowOffset * S.title.scale,
          h: y1 - y0 + S.title.shadowOffset * S.title.scale });
      }
    }

    /* ---- HUD falso: contador de monedas + MAXWER en la hotbar ---- */
    if (!wiped && Bhud.on) {
      const bt = tick - Bhud.ta, n = bticks(Bhud);
      if (bt >= 0) {
        const q = clamp01(bt / (n - 1 || 1));
        const top = R(S.fmt.hudY * S.H);
        const sc = Math.max(2, Math.min(3, Math.floor(S.H / 160)));
        const val = Math.round(lerp(cfg.text.coinFrom, cfg.text.coinTo, easeOutQuad(q)));
        const num = cfg.text.coinPrefix + String(val).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        text(num, S.W / 2, top, {
          id: 'coins', scale: sc, tracking: sc, align: 'center',
          color: P.gold[0], shadowColor: P.shadow, shadowOffset: 1
        });
        const slots = 5, ss = 16, gap = 2;
        const labelW = PF.measure(cfg.text.brand, 2, 2);
        const hbW = slots * ss + (slots - 1) * gap;
        const hx = R(S.W / 2 - (hbW + 6 + labelW) / 2), hy = top + PF.H * sc + 6;
        for (let i = 0; i < slots; i++) {
          const sx = hx + i * (ss + gap), sel = i === (slots >> 1);
          px(sx - 1, hy - 1, ss + 2, ss + 2, sel ? P.text : P.shadow);
          px(sx, hy, ss, ss, P.stone[1]);
          if (sel) {
            PF.drawChar(cx, 'M', sx + 4, hy + 2, 2, P.shadow);
            PF.drawChar(cx, 'M', sx + 3, hy + 1, 2, P.gold[0]);
          }
        }
        text(cfg.text.brand, hx + hbW + 6, hy + 1, {
          id: 'brand', scale: 2, tracking: 2, align: 'left',
          color: P.text, shadowColor: P.shadow, shadowOffset: 1
        });
      }
    }

    /* ---- explosión dorada y corte a alfa ---- */
    if (Bburst.on && burstTick >= 0) {
      const Bb = Bburst.raw;
      const cxp = S.charX + 20, cyp = R(S.floorTop - 60);
      for (const p of S.burst) {
        if (burstTick >= p.life) continue;
        const kk = burstTick;
        px(cxp + p.vx * kk, cyp + p.vy * kk + 0.5 * p.g * kk * kk, p.size, p.size, P.gold[p.tone]);
      }
      if (burstTick < Bb.flashTicks) px(0, 0, S.W, S.H, burstTick === 0 ? P.text : P.gold[0]);
    }

    /* ---- fundido de entrada, también con dithering ---- */
    if (Bfade.on && tick <= Bfade.tb) {
      const q = clamp01((tick - Bfade.ta) / Math.max(1, bticks(Bfade)));
      const idx = clamp(Math.floor(q * 8), 0, 8);
      if (idx < 8) maskBlit(S.fadeMasks[idx]);
    }
  }

  // En modo alfa las máscaras perforan en vez de pintar: el overlay queda
  // con las esquinas transparentes en lugar de con el fondo pintado.
  function maskBlit(mask) {
    const cx = S.cx;
    if (S.alpha) {
      cx.save();
      cx.globalCompositeOperation = 'destination-out';
      cx.drawImage(mask, 0, 0);
      cx.restore();
    } else {
      cx.drawImage(mask, 0, 0);
    }
  }

  /* =====================================================================
     5. Medición y control de paleta
     ===================================================================== */
  function measure() {
    return S.textRects.map(r => ({
      id: r.id,
      left: r.x * S.up, right: (r.x + r.w) * S.up,
      top: r.y * S.up, bottom: (r.y + r.h) * S.up
    }));
  }

  // Cuenta cuántos colores distintos hay en pantalla ahora mismo
  function colorCount() {
    const d = S.cx.getImageData(0, 0, S.W, S.H).data;
    const set = new Set();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 8) continue;
      set.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    }
    return { count: set.size, colors: [...set].map(v => '#' + v.toString(16).padStart(6, '0').toUpperCase()) };
  }

  /* =====================================================================
     6. Arranque
     ===================================================================== */
  async function loadConfig() {
    if (window.__INTRO_CONFIG__) return window.__INTRO_CONFIG__;
    for (const url of ['/config.json', '../config.json', 'config.json']) {
      try { const r = await fetch(url, { cache: 'no-store' }); if (r.ok) return await r.json(); }
      catch (e) { /* file:// bloquea fetch: seguimos probando */ }
    }
    throw new Error('No se pudo cargar config.json');
  }

  function mergeBeats(base, over) {
    const out = JSON.parse(JSON.stringify(base));
    for (const k in (over || {})) out[k] = Object.assign(out[k] || {}, over[k]);
    return out;
  }

  async function init() {
    const q = new URLSearchParams(location.search);
    const cfg = S.cfg = await loadConfig();
    const fmtName = q.get('format') || 'vertical';
    S.fmt = cfg.formats[fmtName];
    if (!S.fmt) throw new Error('Formato desconocido: ' + fmtName);

    S.W = S.fmt.lowWidth; S.H = S.fmt.lowHeight;
    S.up = S.fmt.width / S.fmt.lowWidth;
    S.k = cfg.pixel.blockScale; S.T = cfg.pixel.tile; S.B = S.T * S.k;
    S.TPS = cfg.timeline.ticksPerSecond; S.fps = cfg.timeline.fps;

    let dur = cfg.timeline.duration, beats = cfg.beats, tk = 1;
    const v = q.get('variant') && cfg.variants ? cfg.variants[q.get('variant')] : null;
    if (v) { dur = v.duration; beats = mergeBeats(cfg.beats, v.beats); tk = v.beats ? 1 : dur / cfg.timeline.baseDuration; }
    else if (q.get('duration')) { dur = parseFloat(q.get('duration')); tk = dur / cfg.timeline.baseDuration; }
    S.duration = dur; S.beats = beats; S.tk = tk;

    S.alpha = q.get('alpha') === '1';
    S.rnd = PB.rng(cfg.timeline.seed || 1);

    const cv = S.cv = document.getElementById('stage');
    cv.width = S.W; cv.height = S.H;
    const zoom = parseInt(q.get('zoom') || '1', 10);
    if (zoom > 1) {
      document.body.classList.add('zoomed');
      cv.style.width = (S.W * zoom) + 'px'; cv.style.height = (S.H * zoom) + 'px';
    }
    S.cx = cv.getContext('2d', { alpha: true, willReadFrequently: true });
    S.cx.imageSmoothingEnabled = false;

    build();
    seek(0);

    window.INTRO = {
      seek, measure, colorCount,
      duration: S.duration, fps: S.fps, ticksPerSecond: S.TPS,
      width: S.fmt.width, height: S.fmt.height,
      lowWidth: S.W, lowHeight: S.H, upscale: S.up,
      format: fmtName, config: cfg,
      charX: S.charX, floorTop: S.floorTop,
      poseCount: PC.poseCount(cfg.character), cycleTicks: cfg.character.cycleTicks
    };
    window.__INTRO_READY__ = true;
  }

  init().catch(err => {
    window.__INTRO_ERROR__ = String((err && err.stack) || err);
    console.error(err);
  });
})();
