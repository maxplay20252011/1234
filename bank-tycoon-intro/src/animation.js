/* =========================================================================
   Bank Tycoon — intro MAXWER
   animation.js · Motor DETERMINÍSTICO a ticks, sobre Canvas 2D.

   Dos ideas gobiernan todo el archivo:

   1) NO hay requestAnimationFrame. Existe una única función pura de tiempo,
      INTRO.seek(t), que deja el canvas exactamente en el estado de ese
      instante. render.mjs la llama con t = i/fps y captura. Llamar
      seek(1.234) mil veces da siempre el mismo píxel.

   2) La lógica corre a 20 TICKS POR SEGUNDO aunque el video salga a 60 fps.
      Lo primero que hace seek() es cuantizar: tick = floor(t * 20). Todo
      —caídas, construcción, giro de ítems, contador— se calcula desde ese
      entero. Por eso el movimiento se siente a pasos, como Minecraft, y
      cada tick ocupa exactamente 3 frames del video.

   Además: todas las coordenadas son enteras, los bloques caen sobre una
   grilla de 16 px y no hay una sola rotación libre.
   ========================================================================= */
(function () {
  'use strict';

  const PB = window.PixelBlocks;
  const PF = window.PixelFont;

  /* ------------------------- utilidades puras -------------------------- */
  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  const clamp01 = v => clamp(v, 0, 1);
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeOutQuad = k => 1 - (1 - clamp01(k)) * (1 - clamp01(k));
  const R = Math.round;

  /* ------------------------------ estado ------------------------------- */
  const S = {
    cfg: null, fmt: null, beats: null,
    W: 0, H: 0, up: 4, alpha: false,
    duration: 4, k: 1, TPS: 20, fps: 60,
    cv: null, cx: null,
    spr: {}, items: [], dust: [], burst: [],
    blocks: [],           // lista única ordenada por profundidad de pintor
    buildCount: 0,        // cuántos bloques tiene la bóveda (sin cofre)
    origin: { x: 0, y: 0 },
    title: null, textRects: [], rnd: null
  };

  // Beat ya resuelto contra la duración real
  function beat(name) {
    const b = S.beats[name];
    return {
      on: b.enabled !== false,
      a: b.start * S.k, b: b.end * S.k, raw: b,
      ta: R(b.start * S.k * S.TPS), tb: R(b.end * S.k * S.TPS)
    };
  }
  const bticks = B => Math.max(1, B.tb - B.ta);

  /* =====================================================================
     1. Construcción del modelo (una sola vez)
     ===================================================================== */

  // Bóveda: piso de piedra, anillo perimetral y paredes del fondo.
  // Se descartan los bloques sin ninguna cara visible (+x, +y y +z ocupados),
  // que son justo las tres caras que la cámara isométrica puede ver.
  function buildVault() {
    const N = S.cfg.scene.footprint, WH = S.cfg.scene.wallHeight;
    const gold = S.cfg.scene.goldChance;
    const solid = new Set(), raw = [];
    const key = (x, y, z) => x + ',' + y + ',' + z;
    const add = (x, y, z, kind) => {
      if (solid.has(key(x, y, z))) return;
      solid.add(key(x, y, z)); raw.push({ x, y, z, kind });
    };

    for (let x = 0; x < N; x++)                       // piso
      for (let y = 0; y < N; y++) add(x, y, 0, 'stone');

    for (let x = 0; x < N; x++)                       // anillo de 1 bloque
      for (let y = 0; y < N; y++) {
        if (x !== 0 && y !== 0 && x !== N - 1 && y !== N - 1) continue;
        const corner = (x === 0 || x === N - 1) && (y === 0 || y === N - 1);
        add(x, y, 1, corner || S.rnd() < gold ? 'gold' : 'iron');
      }

    for (let z = 2; z <= WH; z++)                     // paredes del fondo
      for (let x = 0; x < N; x++)
        for (let y = 0; y < N; y++) {
          if (x !== 0 && y !== 0) continue;
          add(x, y, z, S.rnd() < gold ? 'gold' : 'iron');
        }

    const vis = raw.filter(b => !(
      solid.has(key(b.x + 1, b.y, b.z)) &&
      solid.has(key(b.x, b.y + 1, b.z)) &&
      solid.has(key(b.x, b.y, b.z + 1))));

    // Orden de armado: de abajo hacia arriba y del fondo hacia adelante
    vis.sort((p, q) => (p.z - q.z) || ((p.x + p.y) - (q.x + q.y)) || (p.x - q.x));
    vis.forEach((b, i) => { b.order = i; b.part = 'vault'; });
    return vis;
  }

  // Cofre gigante: cuerpo de dos bloques, tesoro de losas de oro y tapa.
  // El descarte de caras se hace SIN contar la tapa: cuando se abre, los
  // bordes del cuerpo tienen que seguir teniendo su cara superior.
  function buildChest() {
    const N = S.cfg.scene.footprint, C = S.cfg.scene.chestFootprint;
    const o = ((N - C) / 2) | 0;                      // centrado en la bóveda
    const lo = o, hi = o + C - 1;
    const solid = new Set(), body = [], gold = [], lid = [];
    const key = (x, y, z) => x + ',' + y + ',' + z;

    for (let x = lo; x <= hi; x++)
      for (let y = lo; y <= hi; y++) {
        body.push({ x, y, z: 1, kind: 'chest', part: 'chestBody' });
        body.push({ x, y, z: 2, kind: 'chest', part: 'chestBody' });
        solid.add(key(x, y, 1)); solid.add(key(x, y, 2));
        if (x > lo && x < hi && y > lo && y < hi) {
          gold.push({ x, y, z: 3, kind: 'goldSlab', part: 'chestGold' });
          solid.add(key(x, y, 3));
        }
        lid.push({ x, y, z: 3, kind: 'chestSlab', part: 'chestLid' });
      }

    const vis = body.filter(b => !(
      solid.has(key(b.x + 1, b.y, b.z)) &&
      solid.has(key(b.x, b.y + 1, b.z)) &&
      solid.has(key(b.x, b.y, b.z + 1))));

    // Bisagra al fondo: la tapa se levanta más cuanto más cerca del frente
    const sLo = lo * 2, sHi = hi * 2;
    lid.forEach(b => { b.hinge = (b.x + b.y - sLo) / (sHi - sLo || 1); });
    return vis.concat(gold, lid);
  }

  function buildSprites() {
    const P = S.cfg.palette, px = S.cfg.pixel, seed = px.textureSeed;
    const fb = px.faceBrightness, ed = px.edgeDarken;
    const mk = (kind, ramp, h) => PB.makeCubeSprite(
      PB.makeToneMap(kind, seed + kind.length * 977), ramp, fb, { h, edgeDarken: ed });

    S.spr.stone = mk('stone', P.stone, 16);
    S.spr.iron = mk('iron', P.iron, 16);
    S.spr.gold = mk('gold', P.gold, 16);
    S.spr.wood = mk('wood', P.wood, 16);
    S.spr.emerald = mk('emerald', P.emerald, 16);
    S.spr.goldSlab = mk('gold', P.gold, 8);
    S.spr.woodSlab = mk('wood', P.wood, 8);
    // El cofre usa una rampa mixta: madera oscura + dorado para fleje y cerrojo
    const chestRamp = [P.wood[1], P.wood[2], P.gold[1]];
    S.spr.chest = mk('chest', chestRamp, 16);
    S.spr.chestSlab = mk('chest', chestRamp, 8);

    // Ítems que salen del cofre, con sus fotogramas de giro
    const nF = S.cfg.beats.chest.spinFrames;
    S.spr.ingotSpin = PB.makeSpinFrames(PB.makeIngot(P.gold), nF);
    S.spr.gemSpin = PB.makeSpinFrames(PB.makeGem(P.emerald), nF);
  }

  // Bloque de piedra suelto del beat 0.00–0.45 (se dibuja fuera de la grilla iso)
  function buildDrop() {
    const Bd = S.cfg.beats.drop;
    S.dust = [];
    for (let i = 0; i < Bd.dust; i++) {
      const a = S.rnd() * Math.PI * 2, sp = 2.0 + S.rnd() * 6.0;
      S.dust.push({
        vx: Math.cos(a) * sp, vy: -1.6 - S.rnd() * 3.8,
        g: 0.55 + S.rnd() * 0.35, life: 7 + ((S.rnd() * 6) | 0),
        size: S.rnd() < 0.4 ? 6 : (S.rnd() < 0.6 ? 4 : 3), tone: S.rnd() < 0.5 ? 0 : 1
      });
    }
  }

  function buildItems() {
    const Bc = S.cfg.beats.chest;
    S.items = [];
    for (let i = 0; i < Bc.items; i++) {
      const a = (i / Bc.items) * Math.PI * 2 + S.rnd() * 0.5;
      S.items.push({
        gem: S.rnd() < 0.45,
        delay: i,                                   // ticks de retraso al salir
        dx: R(Math.cos(a) * (20 + S.rnd() * 40)),
        dy: R(-34 - S.rnd() * 42),
        rise: 5 + ((S.rnd() * 4) | 0),
        phase: (S.rnd() * Bc.spinFrames) | 0,
        bob: (S.rnd() * 6) | 0
      });
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

  /* ---------------- Título: partición, escala entera y posiciones -------- */
  function buildTitle() {
    const T = S.cfg.text, bt = S.cfg.beats.title;
    const words = String(T.title).trim().split(/\s+/).filter(Boolean);
    const wantLines = T.titleLayout === '1line' ? 1
      : T.titleLayout === '2lines' ? 2
        : (S.fmt.titleLines || (S.W < S.H ? 2 : 1));

    let lines;
    if (wantLines < 2 || words.length < 2) lines = [words.join(' ')];
    else {
      let best = 1, diff = Infinity;
      for (let i = 1; i < words.length; i++) {
        const d = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
        if (d < diff) { diff = d; best = i; }
      }
      lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
    }

    // Escala SIEMPRE entera: media escala rompería el pixel-perfect.
    const avail = S.W - 2 * lowSafeSide() - 2;
    let scale = 1;
    for (let s = 10; s >= 1; s--) {
      const w = Math.max.apply(null, lines.map(l => PF.measure(l, s, s)));
      if (w <= avail) { scale = s; break; }
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

  const lowSafeSide = () => R(S.fmt.safeSide / S.up);
  const lowSafeTop = () => R(S.fmt.safeTop / S.up);
  const lowSafeBottom = () => R(S.fmt.safeBottom / S.up);

  /* ---------------- Centrado de la escena en el canvas ------------------ */
  function layoutScene(all) {
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const b of all) {
      const p = PB.isoPos(b.x, b.y, b.z);
      const h = b.kind.indexOf('Slab') > 0 ? 8 : 16;
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x + PB.B);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y + PB.TH + h);
    }
    // Origen pegado a la grilla: múltiplo de 8 en x y de 4 en y
    const ox = S.W / 2 - (minX + maxX) / 2;
    const oy = S.fmt.sceneY * S.H - (minY + maxY) / 2;
    S.origin = { x: Math.round(ox / 8) * 8, y: Math.round(oy / 4) * 4 };
    S.sceneCenter = {
      x: R(S.origin.x + (minX + maxX) / 2),
      y: R(S.origin.y + (minY + maxY) / 2)
    };
  }

  function build() {
    buildSprites();
    const vault = buildVault();
    S.buildCount = vault.length;
    const chest = buildChest();
    const all = vault.concat(chest);
    layoutScene(all);
    // Un único orden de pintor para toda la escena
    all.forEach((b, i) => { b.idx = i; b.depth = PB.isoDepth(b.x, b.y, b.z); });
    all.sort((p, q) => (p.depth - q.depth) || (p.z - q.z) || (p.idx - q.idx));
    S.blocks = all;
    buildDrop(); buildItems(); buildBurst(); buildTitle();
  }

  /* =====================================================================
     2. Dibujo
     ===================================================================== */
  const blit = (spr, x, y) => S.cx.drawImage(spr, R(x), R(y));
  // Mismo blit pero a escala ENTERA: cada píxel del sprite ocupa kxk.
  const blitK = (spr, x, y, k) => S.cx.drawImage(
    spr, 0, 0, spr.width, spr.height, R(x), R(y), spr.width * k, spr.height * k);

  function drawBlock(b, dy) {
    const p = PB.isoPos(b.x, b.y, b.z);
    blit(S.spr[b.kind], S.origin.x + p.x, S.origin.y + p.y + (dy || 0));
  }

  function px(x, y, w, h, color) {
    S.cx.fillStyle = color;
    S.cx.fillRect(R(x), R(y), R(w), R(h));
  }

  // Texto + registro del rectángulo, para el chequeo de zona segura
  function text(str, x, y, opts) {
    const r = PF.drawText(S.cx, str, x, y, opts);
    S.textRects.push({ id: opts.id || 'text', x: r.x, y: r.y, w: r.width, h: r.height });
    return r;
  }

  /* =====================================================================
     3. seek(t) — el corazón del render
     ===================================================================== */
  function seek(tRaw) {
    const cfg = S.cfg, P = cfg.palette, cx = S.cx;
    const t = clamp(tRaw, 0, S.duration);
    const tick = Math.floor(t * S.TPS + 1e-9);        // <<< cuantización a ticks
    const T = tick / S.TPS;
    S.textRects.length = 0;

    const Bdrop = beat('drop'), Bvault = beat('vault'), Bchest = beat('chest');
    const Btitle = beat('title'), Bhud = beat('hud'), Bburst = beat('burst');

    /* ---- fondo ---- */
    cx.clearRect(0, 0, S.W, S.H);
    if (!S.alpha) { cx.fillStyle = P.bg; cx.fillRect(0, 0, S.W, S.H); }

    // Tras el destello final ya no queda nada: corte limpio a alfa
    const burstTick = tick - Bburst.ta;
    const wipedOut = Bburst.on && burstTick >= cfg.beats.burst.flashTicks;

    /* ---- beat 1: bloque de piedra que cae y estalla (0.00–0.45) ---- */
    let dustTick = -1;
    if (Bdrop.on) {
      const D = Bdrop.raw, n = bticks(Bdrop);
      const bt = tick - Bdrop.ta;
      const landT = n - D.bounceTicks - 1;            // tick en que toca el piso
      const breakT = n - 1;                           // tick en que revienta
      const K = D.blockScale || 1;
      const target = {
        x: S.sceneCenter.x - (PB.B * K) / 2,
        y: S.sceneCenter.y - ((PB.TH + PB.B) * K) / 2
      };
      if (bt >= 0 && bt < breakT) {
        let y;
        if (bt <= landT) {                            // caída acelerada
          const q = landT > 0 ? bt / landT : 1;
          y = target.y - (1 - q * q) * D.fallBlocks * PB.B;
        } else {                                      // rebote de 2 ticks
          y = target.y - (bt === landT + 1 ? 5 * K : 2 * K);
        }
        blitK(S.spr.stone, target.x, y, K);
      }
      if (bt >= breakT) dustTick = bt - breakT;       // polvo del bloque roto
    }

    if (dustTick >= 0) {
      const cxp = S.sceneCenter.x, cyp = S.sceneCenter.y - 6;
      for (const d of S.dust) {
        if (dustTick >= d.life) continue;
        const k = dustTick;
        const x = cxp + d.vx * k;
        const y = cyp + d.vy * k + 0.5 * d.g * k * k;
        px(x, y, d.size, d.size, P.stone[d.tone]);
      }
    }

    /* ---- beat 2 y 3: bóveda que se arma + cofre (0.45–2.00) ---- */
    let placed = 0, shake = 0, lidFrame = 0, chestOn = false;
    if (Bvault.on) {
      const V = Bvault.raw, n = bticks(Bvault), bt = tick - Bvault.ta;
      const steps = Math.max(1, Math.floor(n / V.ticksPerPlace));
      const per = V.blocksPerStep > 0 ? V.blocksPerStep : Math.ceil(S.buildCount / steps);
      const step = clamp(Math.floor((bt + V.ticksPerPlace) / V.ticksPerPlace), 0, steps);
      placed = bt < 0 ? 0 : Math.min(S.buildCount, step * per);
      // Micro-shake justo en el tick en que se asienta una tanda
      if (bt >= 0 && bt < n && bt % V.ticksPerPlace === 0) shake = V.shakePx;
      if (bt >= n) placed = S.buildCount;
    } else if (Bchest.on || Btitle.on) {
      placed = S.buildCount;                          // variante corta: sin bóveda
    }
    if (!Bvault.on) placed = 0;

    if (Bchest.on) {
      const C = Bchest.raw, n = bticks(Bchest), bt = tick - Bchest.ta;
      chestOn = tick >= Bvault.tb - 1 || bt >= 0;
      // La tapa gira en 4 fotogramas discretos durante la primera mitad
      const half = Math.max(1, Math.floor(n * 0.45));
      lidFrame = bt < 0 ? 0 : clamp(Math.floor((bt / half) * C.lidFrames), 0, C.lidFrames - 1);
    }

    if (!wipedOut && (placed > 0 || chestOn)) {
      const lift = [0, 10, 20, 30];
      for (const b of S.blocks) {
        if (b.part === 'vault') {
          if (b.order >= placed) continue;
          drawBlock(b, shake);
        } else if (chestOn) {
          if (b.part === 'chestGold') { if (lidFrame > 0) drawBlock(b, shake); }
          else if (b.part === 'chestLid') drawBlock(b, shake - R(lift[lidFrame] * b.hinge));
          else drawBlock(b, shake);
        }
      }
    }

    /* ---- ítems flotando con giro de item drop (1.20–3.60) ---- */
    if (!wipedOut && Bchest.on && chestOn) {
      const C = Bchest.raw, bt = tick - Bchest.ta;
      const ox = S.sceneCenter.x - PB.B / 2, oy = S.sceneCenter.y - PB.B;
      for (const it of S.items) {
        const lt = bt - it.delay;
        if (lt < 0) continue;
        const q = easeOutQuad(clamp01(lt / it.rise));
        const bobT = Math.sin((lt + it.bob) * 0.55);
        const x = ox + it.dx * q;
        const y = oy + it.dy * q + R(bobT * C.bobPx);
        const frames = it.gem ? S.spr.gemSpin : S.spr.ingotSpin;
        blit(frames[(lt + it.phase) % frames.length], x, y);
      }
    }

    /* ---- beat 4: título letra por letra (2.00–2.90) ---- */
    if (!wipedOut && Btitle.on && S.title) {
      const B4 = Btitle.raw, bt = tick - Btitle.ta;
      const dist = B4.fallBlocks * PB.B, FT = 4;
      for (const c of S.title.chars) {
        const lt = bt - c.order * B4.ticksPerLetter;
        if (lt < 0) continue;
        const q = clamp01(lt / FT);
        const y = c.y - R((1 - q * q) * dist);
        PF.drawChar(S.cx, c.ch, c.x + S.title.shadowOffset * S.title.scale,
          y + S.title.shadowOffset * S.title.scale, S.title.scale, P.textShadow);
        PF.drawChar(S.cx, c.ch, c.x, y, S.title.scale, P.text);
      }
      // Rectángulo real del título ya asentado, para la zona segura
      const done = S.title.chars.filter(c => bt - c.order * B4.ticksPerLetter >= FT);
      if (done.length) {
        const x0 = Math.min.apply(null, done.map(c => c.x));
        const x1 = Math.max.apply(null, done.map(c => c.x + PF.W * S.title.scale));
        const y0 = Math.min.apply(null, done.map(c => c.y));
        const y1 = Math.max.apply(null, done.map(c => c.y + PF.H * S.title.scale));
        S.textRects.push({
          id: 'title', x: x0, y: y0,
          w: x1 - x0 + S.title.shadowOffset * S.title.scale,
          h: y1 - y0 + S.title.shadowOffset * S.title.scale
        });
      }
    }

    /* ---- beat 5: HUD falso (2.90–3.60) ---- */
    if (!wipedOut && Bhud.on) {
      const Hd = Bhud.raw, n = bticks(Bhud), bt = tick - Bhud.ta;
      if (bt >= 0) {
        const q = clamp01(bt / (n - 1 || 1));
        const top = R(S.fmt.hudY * S.H);
        const sc = Math.max(2, Math.min(3, Math.floor(S.H / 160)));

        // Contador de monedas, con separador de miles
        const val = Math.round(lerp(cfg.text.coinFrom, cfg.text.coinTo, easeOutQuad(q)));
        const num = cfg.text.coinPrefix + String(val).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        text(num, S.W / 2, top, {
          id: 'coins', scale: sc, tracking: sc, align: 'center',
          color: P.gold[0], shadowColor: P.textShadow, shadowOffset: 1
        });

        // Barra de experiencia: marco negro, fondo gris, relleno verde
        const bw = Math.min(Hd.barWidth, S.W - 2 * lowSafeSide()), bh = Hd.barHeight;
        const bx = R(S.W / 2 - bw / 2), by = top + PF.H * sc + 6;
        px(bx - 1, by - 1, bw + 2, bh + 2, '#000000');
        px(bx, by, bw, bh, P.hudBack);
        px(bx, by, R(bw * q), bh, P.emerald[0]);
        px(bx, by, R(bw * q), 1, P.emerald[0]);

        // Hotbar con el logo MAXWER como ítem en el slot seleccionado
        const slots = 5, ss = 16, gap = 2;
        const labelW = PF.measure(cfg.text.brand, 2, 2);
        const hbW = slots * ss + (slots - 1) * gap;
        const totalW = hbW + 6 + labelW;
        const hx = R(S.W / 2 - totalW / 2), hy = by + bh + 7;
        for (let i = 0; i < slots; i++) {
          const sx = hx + i * (ss + gap), sel = i === (slots >> 1);
          px(sx - 1, hy - 1, ss + 2, ss + 2, sel ? P.text : '#000000');
          px(sx, hy, ss, ss, P.hudSlot);
          if (sel) {                                   // el "ítem" MAXWER: una M dorada
            PF.drawChar(S.cx, 'M', sx + 4, hy + 2, 2, P.textShadow);
            PF.drawChar(S.cx, 'M', sx + 3, hy + 1, 2, P.gold[0]);
          }
        }
        text(cfg.text.brand, hx + hbW + 6, hy + 1, {
          id: 'brand', scale: 2, tracking: 2, align: 'left',
          color: P.text, shadowColor: P.textShadow, shadowOffset: 1
        });
      }
    }

    /* ---- beat 6: explosión dorada y corte a alfa (3.60–4.00) ---- */
    if (Bburst.on && burstTick >= 0) {
      const Bb = Bburst.raw;
      const cxp = S.sceneCenter.x, cyp = R((S.sceneCenter.y + S.fmt.titleY * S.H) / 2);
      for (const p of S.burst) {
        if (burstTick >= p.life) continue;
        const k = burstTick;
        px(cxp + p.vx * k, cyp + p.vy * k + 0.5 * p.g * k * k, p.size, p.size, P.gold[p.tone]);
      }
      if (burstTick < Bb.flashTicks) {                 // destello duro, sin degradé
        px(0, 0, S.W, S.H, burstTick === 0 ? P.text : P.gold[0]);
      }
    }
  }

  /* =====================================================================
     4. Medición para el chequeo de zona segura (en píxeles de SALIDA)
     ===================================================================== */
  function measure() {
    return S.textRects.map(r => ({
      id: r.id,
      left: r.x * S.up, right: (r.x + r.w) * S.up,
      top: r.y * S.up, bottom: (r.y + r.h) * S.up
    }));
  }

  /* =====================================================================
     5. Arranque
     ===================================================================== */
  async function loadConfig() {
    if (window.__INTRO_CONFIG__) return window.__INTRO_CONFIG__;
    for (const url of ['/config.json', '../config.json', 'config.json']) {
      try { const r = await fetch(url, { cache: 'no-store' }); if (r.ok) return await r.json(); }
      catch (e) { /* file:// bloquea fetch: seguimos probando */ }
    }
    throw new Error('No se pudo cargar config.json');
  }

  // Mezcla profunda de los overrides de una variante sobre los beats base
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
    S.up = S.fmt.width / S.fmt.lowWidth;              // factor de upscale (4)
    S.TPS = cfg.timeline.ticksPerSecond;
    S.fps = cfg.timeline.fps;

    // Duración y variante. Si la variante trae sus propios beats, sus tiempos
    // ya están en su escala: no se vuelven a reescalar.
    let dur = cfg.timeline.duration, beats = cfg.beats, k = 1;
    const vName = q.get('variant');
    const v = vName && cfg.variants ? cfg.variants[vName] : null;
    if (v) { dur = v.duration; beats = mergeBeats(cfg.beats, v.beats); k = v.beats ? 1 : dur / cfg.timeline.baseDuration; }
    else if (q.get('duration')) { dur = parseFloat(q.get('duration')); k = dur / cfg.timeline.baseDuration; }
    S.duration = dur; S.beats = beats; S.k = k;

    S.alpha = q.get('alpha') === '1';
    S.rnd = PB.rng(cfg.timeline.seed || 1);

    const cv = S.cv = document.getElementById('stage');
    cv.width = S.W; cv.height = S.H;
    const zoom = parseInt(q.get('zoom') || '1', 10);
    if (zoom > 1) {
      document.body.classList.add('zoomed');
      cv.style.width = (S.W * zoom) + 'px'; cv.style.height = (S.H * zoom) + 'px';
    }
    S.cx = cv.getContext('2d', { alpha: true, willReadFrequently: false });
    S.cx.imageSmoothingEnabled = false;               // nunca interpolar

    build();
    seek(0);

    window.INTRO = {
      seek, measure,
      duration: S.duration, fps: S.fps, ticksPerSecond: S.TPS,
      width: S.fmt.width, height: S.fmt.height,
      lowWidth: S.W, lowHeight: S.H, upscale: S.up,
      format: fmtName, blocks: S.buildCount, config: cfg
    };
    window.__INTRO_READY__ = true;
  }

  init().catch(err => {
    window.__INTRO_ERROR__ = String((err && err.stack) || err);
    console.error(err);
  });
})();
