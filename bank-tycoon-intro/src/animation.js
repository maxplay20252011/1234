/* =========================================================================
   Bank Tycoon — Intro MAXWER
   Motor de animación DETERMINÍSTICO.

   No hay requestAnimationFrame, ni CSS animations, ni transitions.
   Existe una única función pura de tiempo: INTRO.seek(t) que, dado un
   instante virtual t (en segundos), deja el DOM exactamente en el estado
   de ese frame. Llamar seek(1.234) mil veces devuelve siempre el mismo
   píxel. Puppeteer avanza t de a 1/fps y captura.

   Todo lo configurable sale de config.json.
   ========================================================================= */
(function () {
  'use strict';

  /* ---------------------------------------------------------------------
     1. Utilidades matemáticas (puras, sin estado)
     --------------------------------------------------------------------- */
  const clamp  = (v, a, b) => v < a ? a : (v > b ? b : v);
  const clamp01 = v => clamp(v, 0, 1);
  const lerp   = (a, b, k) => a + (b - a) * k;
  const smooth = k => { k = clamp01(k); return k * k * (3 - 2 * k); };
  const easeOutCubic = k => 1 - Math.pow(1 - clamp01(k), 3);
  const easeOutQuint = k => 1 - Math.pow(1 - clamp01(k), 5);
  const easeInQuad   = k => { k = clamp01(k); return k * k; };
  const easeInOut    = k => { k = clamp01(k); return k < .5 ? 2*k*k : 1 - Math.pow(-2*k+2, 2)/2; };
  // Overshoot suave para el "golpe" del título
  const easeOutBack  = (k, s) => { k = clamp01(k); s = s === undefined ? 1.4 : s;
                                   const p = k - 1; return 1 + (s + 1) * p*p*p + s * p*p; };
  // Rango normalizado: cuánto avanzó t dentro de [a,b]
  const range = (t, a, b) => b <= a ? (t >= b ? 1 : 0) : clamp01((t - a) / (b - a));
  // PRNG determinístico (mulberry32). Misma semilla => misma intro.
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let x = Math.imul(a ^ (a >>> 15), 1 | a);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------------------------------------------------------------
     2. Config: window.__INTRO_CONFIG__ (inyectada por render.mjs) o fetch
     --------------------------------------------------------------------- */
  async function loadConfig() {
    if (window.__INTRO_CONFIG__) return window.__INTRO_CONFIG__;
    for (const url of ['/config.json', '../config.json', 'config.json']) {
      try {
        const r = await fetch(url, { cache: 'no-store' });
        if (r.ok) return await r.json();
      } catch (e) { /* file:// bloquea fetch: seguimos probando */ }
    }
    throw new Error('No se pudo cargar config.json');
  }

  /* ---------------------------------------------------------------------
     3. Estado del motor
     --------------------------------------------------------------------- */
  const S = {
    cfg: null, fmt: null, W: 0, H: 0, u: 1,
    duration: 4, base: 4, k: 1,          // k = factor de escala temporal
    beats: null, cubes: [], coins: [], lines: [],
    cubeSize: 44, seedRnd: null, alpha: false
  };

  // Devuelve el beat ya escalado a la duración real (soporta variante corta)
  function beat(name) {
    const b = S.cfg.beats[name];
    return { on: b.enabled !== false, a: b.start * S.k, b: b.end * S.k, raw: b };
  }
  // Progreso normalizado dentro del beat
  function bp(B, t) { return range(t, B.a, B.b); }

  /* ---------------------------------------------------------------------
     4. Construcción del modelo voxel de la bóveda
     Coordenadas en unidades de cubo. Mundo: +Z = arriba en pantalla.
     Sólo se instancian los cubos con alguna cara visible (+X, +Y o +Z),
     que son las únicas tres caras que la cámara isométrica puede ver.
     --------------------------------------------------------------------- */
  function buildVoxelModel(rnd, cfg) {
    const solid = new Set();
    const key = (x, y, z) => x + ',' + y + ',' + z;
    const put = (x, y, z, mat) => { solid.add(key(x, y, z)); raw.push({ x, y, z, mat }); };
    const raw = [];

    // Plinto / base del banco (6x6, un nivel abajo)
    for (let x = -1; x <= 4; x++)
      for (let y = -1; y <= 4; y++) put(x, y, -1, 'stone');

    // Cuerpo de la bóveda 4x4x4 (sólo cáscara: el interior no se ve nunca)
    const moneyR = cfg.beats.vault.moneyRatio, billR = cfg.beats.vault.billRatio;
    for (let x = 0; x <= 3; x++)
      for (let y = 0; y <= 3; y++)
        for (let z = 0; z <= 3; z++) {
          const shell = (x === 0 || x === 3 || y === 0 || y === 3 || z === 0 || z === 3);
          if (!shell) continue;
          const r = rnd();
          const mat = r < moneyR ? 'money' : (r < moneyR + billR ? 'bill' : 'gold');
          put(x, y, z, mat);
        }

    // Remate superior (cofre / cartel del banco)
    for (let x = 1; x <= 2; x++)
      for (let y = 1; y <= 2; y++) put(x, y, 4, 'gold');

    // Culling: si +X, +Y y +Z están ocupados, el cubo es invisible
    const visible = raw.filter(c =>
      !(solid.has(key(c.x + 1, c.y, c.z)) &&
        solid.has(key(c.x, c.y + 1, c.z)) &&
        solid.has(key(c.x, c.y, c.z + 1))));

    // Orden de caída: primero lo de abajo, y dentro de cada nivel lo del fondo
    visible.sort((a, b) => (a.z - b.z) || ((b.x + b.y) - (a.x + a.y)));
    return visible;
  }

  const MAT_COLOR = {
    gold:  v => v.gold,
    money: v => v.money,
    bill:  v => v.money,
    stone: () => '#23232C'
  };

  // Multiplica un color por un factor: sombreado de caras sin filtros CSS
  function shade(hex, f) {
    const h = String(hex).replace('#', '');
    const n = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
    const v = parseInt(n, 16);
    const c = i => Math.max(0, Math.min(255, Math.round(((v >> i) & 255) * f)));
    return 'rgb(' + c(16) + ',' + c(8) + ',' + c(0) + ')';
  }

  // #RRGGBB -> rgba(): permite atenuar una familia de líneas sin tocar el config
  function hexToRgba(hex, a) {
    const h = String(hex).replace('#', '');
    const n = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
    const v = parseInt(n, 16);
    return 'rgba(' + ((v >> 16) & 255) + ',' + ((v >> 8) & 255) + ',' + (v & 255) + ',' + a + ')';
  }

  /* ---------------------------------------------------------------------
     5. Construcción del DOM (una sola vez)
     --------------------------------------------------------------------- */
  function buildDOM() {
    const cfg = S.cfg, C = cfg.colors, root = document.documentElement;

    // Variables de color y tipografía
    const rs = root.style;
    rs.setProperty('--bg', C.bg);
    rs.setProperty('--gold', C.gold);
    rs.setProperty('--goldDeep', C.goldDeep);
    rs.setProperty('--money', C.money);
    rs.setProperty('--white', C.white);
    rs.setProperty('--outline', C.outline);
    rs.setProperty('--grid', C.grid || C.gold);
    rs.setProperty('--gridDim', hexToRgba(C.grid || C.gold, 0.45));
    rs.setProperty('--fbDisplay', cfg.fonts.display.fallback);
    rs.setProperty('--fbPixel', cfg.fonts.pixel.fallback);
    rs.setProperty('--u', String(S.u));
    rs.setProperty('--safeTop', S.fmt.safeTop + 'px');
    rs.setProperty('--safeBottom', S.fmt.safeBottom + 'px');
    rs.setProperty('--safeSide', S.fmt.safeSide + 'px');

    // --- Grilla isométrica
    const gl = document.querySelector('.grid-lines');
    gl.style.setProperty('--gcell', (cfg.beats.grid.cell * S.u) + 'px');
    gl.style.setProperty('--gw', (cfg.beats.grid.lineWidth * S.u) + 'px');

    // --- Escena 3D
    const scene = document.getElementById('scene');
    scene.style.setProperty('--isoX', cfg.camera.isoX + 'deg');
    scene.style.setProperty('--isoZ', cfg.camera.isoZ + 'deg');
    scene.style.setProperty('--stageY', (S.H * (S.fmt.stageY || 0)) + 'px');
    scene.style.setProperty('--stageZoom', String(S.fmt.stageZoom || 1));
    document.getElementById('stage').style.perspective = (cfg.camera.perspective * S.u) + 'px';

    // --- Cubos voxel
    const size = S.cubeSize = cfg.beats.vault.cubeSize * S.u;
    const model = buildVoxelModel(S.seedRnd, cfg);
    const host = document.getElementById('voxels');
    host.style.left = '0'; host.style.top = '0';
    const cx = 1.5, cy = 1.5, cz = 1.5;   // centro del modelo
    const FACES = ['fz', 'fnz', 'fx', 'fnx', 'fy', 'fny'];
    const frag = document.createDocumentFragment();

    model.forEach((v, i) => {
      const el = document.createElement('div');
      el.className = 'cube ' + v.mat;
      el.style.setProperty('--s', size + 'px');
      const base = MAT_COLOR[v.mat](S.cfg.colors);
      el.style.setProperty('--cz', shade(base, 1.12));   // cara superior
      el.style.setProperty('--cx', shade(base, 0.80));   // cara +X
      el.style.setProperty('--cy', shade(base, 0.58));   // cara +Y
      for (const f of FACES) {
        const face = document.createElement('div');
        face.className = 'face ' + f;
        el.appendChild(face);
      }
      frag.appendChild(el);
      S.cubes.push({
        el,
        px: (v.x - cx) * size, py: (v.y - cy) * size, pz: (v.z - cz) * size,
        // Retardo de caída escalonado + jitter determinístico
        delay: (i / model.length) * cfg.beats.vault.stagger + S.seedRnd() * 0.04,
        spin: (S.seedRnd() - 0.5) * 40,
        drift: (S.seedRnd() - 0.5) * 1.2
      });
    });
    host.appendChild(frag);

    // --- Puerta de la bóveda, apoyada sobre la cara +X del cuerpo
    const mount = document.getElementById('doorMount');
    const dw = size * 3.5;
    mount.style.left = '0'; mount.style.top = '0';
    mount.style.setProperty('--dw', dw + 'px');
    // rotateY(90) apoya el plano sobre la cara; rotateZ(-90) endereza el "arriba"
    mount.style.transform =
      'translate3d(' + ((3.5 - cx) * size + 1) + 'px,0px,0px) rotateY(90deg) rotateZ(-90deg)';

    // --- Monedas
    const coinHost = document.getElementById('coins');
    const nCoins = cfg.beats.brand.coins;
    for (let i = 0; i < nCoins; i++) {
      const el = document.createElement('div');
      el.className = 'coin';
      const cs = (26 + S.seedRnd() * 26) * S.u;
      el.style.setProperty('--cs', cs + 'px');
      coinHost.appendChild(el);
      S.coins.push({
        el,
        x0: S.W * (0.5 + (S.seedRnd() - 0.5) * 0.66),
        y0: S.H * (0.74 + (S.seedRnd() - 0.5) * 0.10),
        vx: (S.seedRnd() - 0.5) * S.W * 1.05,
        vy: -(0.85 + S.seedRnd() * 0.95) * S.H,
        g: (1.5 + S.seedRnd() * 0.9) * S.H,
        rot: (S.seedRnd() - 0.5) * 900,
        flip: 300 + S.seedRnd() * 900,
        t0: S.seedRnd() * 0.45          // escalonado dentro del beat
      });
    }

    // --- Textos
    const T = cfg.text;
    document.getElementById('kicker').textContent = T.kicker || '';
    document.getElementById('tagline').textContent = T.tagline || '';
    document.querySelector('#brand .brand-name').textContent = T.brand || '';
    layoutTitle(T.title || '', T.titleLayout || 'auto');

    // --- Posición del logo en la esquina, respetando la zona segura
    const brand = document.getElementById('brand');
    const corner = S.fmt.brandCorner || 'bottom-right';
    // Margen extra para que ni el overshoot de entrada ni el shake se coman el borde
    const slack = 26 * S.u;
    const pad = Math.max(S.fmt.safeSide, 40 * S.u) + slack;
    const vert = corner.indexOf('top') === 0 ? 'top' : 'bottom';
    const horz = corner.indexOf('left') > -1 ? 'left' : 'right';
    if (vert === 'top') brand.style.top = (S.fmt.safeTop + 24 * S.u + slack) + 'px';
    else brand.style.bottom = (S.fmt.safeBottom + 24 * S.u + slack) + 'px';
    brand.style[horz] = pad + 'px';
    // El escalado de entrada crece hacia adentro, nunca hacia el borde
    brand.style.transformOrigin = horz + ' ' + vert;
  }

  /* ---------------------------------------------------------------------
     6. Título: partición en líneas + autoajuste al ancho seguro
     Cambiar el texto en config.json no puede romper el encuadre.
     --------------------------------------------------------------------- */
  function layoutTitle(text, mode) {
    const words = String(text).trim().split(/\s+/).filter(Boolean);
    let lines;
    if (mode === '1line' || words.length < 2) lines = [words.join(' ')];
    else if (mode === '2lines') lines = splitBalanced(words);
    else lines = (S.fmt.width < S.fmt.height) ? splitBalanced(words) : [words.join(' ')];

    const els = document.querySelectorAll('#title .t-line');
    els.forEach((el, i) => {
      const txt = lines[i] || '';
      el.classList.toggle('empty', !txt);
      el.querySelector('.t-stroke').textContent = txt;
      el.querySelector('.t-fill').textContent = txt;
      S.lines.push({ el, text: txt });
    });

    const bt = S.cfg.beats.title;
    const baseSize = (lines.length > 1 ? 240 : 172) * (S.fmt.titleScale || 1);
    els.forEach(el => el.style.setProperty('--tSize', baseSize + 'px'));
    document.documentElement.style.setProperty('--tStroke', (bt.strokePx * S.u) + 'px');
    document.documentElement.style.setProperty('--tShadow', (bt.shadowPx * S.u) + 'px');
  }

  function splitBalanced(words) {
    if (words.length === 2) return words;
    let best = 1, bestDiff = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' ').length, b = words.slice(i).join(' ').length;
      if (Math.abs(a - b) < bestDiff) { bestDiff = Math.abs(a - b); best = i; }
    }
    return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
  }

  // Se llama después de cargar fuentes: mide y escala para no pasarse del safe area
  function fitTitle() {
    const bt = S.cfg.beats.title;
    const wrap = document.getElementById('titleWrap');
    wrap.style.setProperty('--tScale', '1');
    S.lines.forEach(l => l.el.style.setProperty('--tTrack', (bt.toTracking * S.u) + 'px'));

    const avail = S.W - 2 * S.fmt.safeSide;
    let worst = 1;
    S.lines.forEach(l => {
      if (!l.text) return;
      const w = l.el.querySelector('.t-fill').getBoundingClientRect().width;
      // Ancho máximo en toda la animación: tracking inicial + escala inicial
      const extra = Math.max(0, l.text.length - 1) * (bt.fromTracking - bt.toTracking) * S.u;
      worst = Math.max(worst, (w + extra) * bt.fromScale + bt.strokePx * 2 * S.u);
    });
    const scale = Math.min(1, avail / worst);
    wrap.style.setProperty('--tScale', String(scale));

    // El tagline también se ajusta si el texto es largo
    const tag = document.getElementById('tagline');
    tag.style.transform = 'none';
    const tw = tag.getBoundingClientRect().width;
    if (tw > avail) tag.style.fontSize =
      (parseFloat(getComputedStyle(tag).fontSize) * (avail / tw)) + 'px';
  }

  /* ---------------------------------------------------------------------
     7. Micro-shake de cámara: suma de senos con fases fijas.
     Determinístico (depende sólo de t) y sin ruido aleatorio por frame.
     --------------------------------------------------------------------- */
  function shakeAt(t, amp) {
    if (amp <= 0) return [0, 0, 0];
    const x = (Math.sin(t * 47.3) * 0.62 + Math.sin(t * 97.1 + 1.7) * 0.38) * amp;
    const y = (Math.sin(t * 53.9 + 0.9) * 0.62 + Math.sin(t * 111.7 + 2.3) * 0.38) * amp;
    const r = Math.sin(t * 41.1 + 0.4) * amp * 0.06;
    return [x, y, r];
  }

  /* ---------------------------------------------------------------------
     8. seek(t) — el corazón del render
     --------------------------------------------------------------------- */
  const $ = id => document.getElementById(id);
  let E = null;                              // cache de nodos
  function cacheNodes() {
    E = {
      grid: $('grid'), gridRing: document.querySelector('.grid-ring'),
      vignette: $('vignette'), stage: $('stage'), stageGlow: $('stageGlow'),
      sweep: $('sweep'), sweepBar: document.querySelector('.sweep-bar'),
      doorMount: $('doorMount'), hinge: document.querySelector('.door-hinge'),
      spokes: document.querySelector('.door-spokes'), wheel: document.querySelector('.door-wheel'),
      hole: document.querySelector('.door-hole'),
      titleWrap: $('titleWrap'), kicker: $('kicker'), titleBar: $('titleBar'),
      tagline: $('tagline'), brand: $('brand'), flash: $('flash'), shake: $('shake')
    };
  }

  function seek(tRaw) {
    const cfg = S.cfg, u = S.u;
    const t = clamp(tRaw, 0, S.duration);

    const Bgrid  = beat('grid'),  Bvault = beat('vault'), Bdoor = beat('door');
    const Btitle = beat('title'), Bbrand = beat('brand'), Bflash = beat('flash');

    /* ---- 8.1 Shake global -------------------------------------------- */
    let amp = 0;
    if (Bgrid.on)  amp += (1 - bp(Bgrid, t) * 0.55) * 6 * cfg.camera.shakeAmp * (t < Bgrid.b ? 1 : 0);
    if (Bdoor.on)  amp += 10 * Math.pow(1 - clamp01((t - Bdoor.a) / (0.22 * S.k)), 3);
    if (Btitle.on) amp += 16 * Math.pow(1 - clamp01((t - Btitle.a) / (0.26 * S.k)), 3);
    if (Bflash.on) amp += 12 * Math.pow(1 - clamp01((t - Bflash.a) / (0.16 * S.k)), 3);
    const [sx, sy, sr] = shakeAt(t, amp * u);
    E.shake.style.setProperty('--shakeX', sx.toFixed(3) + 'px');
    E.shake.style.setProperty('--shakeY', sy.toFixed(3) + 'px');
    E.shake.style.setProperty('--shakeR', sr.toFixed(4) + 'deg');

    /* ---- 8.2 Grilla isométrica (0.00–0.50) ---------------------------- */
    if (Bgrid.on) {
      const p = bp(Bgrid, t);
      // El % del radial-gradient se resuelve contra la diagonal, así que 82%
      // ya cubre las esquinas: con exponente 1.15 el trazado se ve avanzar.
      const r = Math.pow(p, 1.15) * 82;
      E.grid.style.setProperty('--gridR', r.toFixed(2) + '%');
      // Aparece rápido y se atenúa cuando entran los cubos y el título
      const fade = 1 - range(t, Btitle.a - 0.25 * S.k, Btitle.a + 0.15 * S.k);
      E.grid.style.opacity = (smooth(p * 3) * fade).toFixed(3);
      E.gridRing.style.opacity = (Math.sin(clamp01(p) * Math.PI) * 0.95 + 0.05).toFixed(3);
      E.vignette.style.opacity = (smooth(p) * 0.55 * fade + 0.08).toFixed(3);
    } else { E.grid.style.opacity = '0'; E.vignette.style.opacity = '0'; }

    /* ---- 8.3 Cubos voxel: caída y apilado (0.50–1.30) ------------------ */
    if (Bvault.on) {
      const p = bp(Bvault, t);
      const V = Bvault.raw;
      const span = Math.max(0.001, 1 - V.stagger);
      const fadeOut = 1 - range(t, Btitle.a - 0.06 * S.k, Btitle.a + 0.22 * S.k);
      E.stage.style.opacity = (clamp01(p * 6) * fadeOut).toFixed(3);

      for (let i = 0; i < S.cubes.length; i++) {
        const c = S.cubes[i];
        const q = clamp01((p - c.delay) / span);
        if (q <= 0) { c.el.style.opacity = '0'; continue; }
        // Caída acelerada (gravedad) desde fallHeight cubos arriba
        const fall = (1 - easeInQuad(q)) * V.fallHeight * S.cubeSize;
        // Rebote corto al aterrizar
        const land = clamp01((q - 0.86) / 0.14);
        const squash = 1 + Math.sin(land * Math.PI) * 0.16;
        const drift = (1 - q) * c.drift * S.cubeSize;
        const spin = (1 - q) * c.spin;
        c.el.style.opacity = clamp01(q * 5).toFixed(3);
        c.el.style.transform =
          'translate3d(' + (c.px + drift).toFixed(2) + 'px,' +
                           (c.py + drift).toFixed(2) + 'px,' +
                           (c.pz + fall).toFixed(2) + 'px)' +
          ' rotateZ(' + spin.toFixed(2) + 'deg)' +
          ' scale3d(' + squash.toFixed(3) + ',' + squash.toFixed(3) + ',' + (2 - squash).toFixed(3) + ')';
      }
    } else { E.stage.style.opacity = '0'; }

    /* ---- 8.4 Puerta: gira, se abre, y barrido de luz (1.30–2.20) ------- */
    if (Bdoor.on) {
      const D = Bdoor.raw;
      const p = bp(Bdoor, t);
      // Aparición de la puerta junto con los últimos cubos
      // La puerta recién existe cuando el cuerpo terminó de armarse
      const show = range(t, Bvault.b - 0.08 * S.k, Bdoor.a + 0.10 * S.k);
      const fadeOut = 1 - range(t, Btitle.a - 0.06 * S.k, Btitle.a + 0.22 * S.k);
      E.doorMount.style.opacity = (show * fadeOut).toFixed(3);

      // Fase 1 (0–0.38): gira el volante. Fase 2 (0.34–0.86): se abre.
      const spinP = easeInOut(range(p, 0, 0.38));
      const openP = easeOutCubic(range(p, 0.34, 0.86));
      const deg = spinP * D.wheelTurns * 360;
      E.wheel.style.transform = 'rotate(' + deg.toFixed(2) + 'deg)';
      E.spokes.style.transform = 'rotate(' + (-deg * 0.45).toFixed(2) + 'deg)';
      E.hinge.style.transform = 'rotateY(' + (-openP * D.openDeg).toFixed(2) + 'deg)';
      E.hole.style.opacity = (openP * 0.95).toFixed(3);
      E.stageGlow.style.opacity = (openP * 0.85 * fadeOut).toFixed(3);

      // Barrido de luz dorada cruzando la pantalla
      if (D.sweep) {
        const sp = range(p, 0.52, 1.0);
        E.sweep.style.opacity = (Math.sin(clamp01(sp) * Math.PI) * fadeOut).toFixed(3);
        E.sweepBar.style.transform =
          'translateX(' + lerp(-150, 260, easeInOut(sp)).toFixed(2) + '%) skewX(-18deg)';
      }
    } else { E.doorMount.style.opacity = '0'; E.sweep.style.opacity = '0'; E.stageGlow.style.opacity = '0'; }

    /* ---- 8.5 Título (2.20–3.10) ---------------------------------------- */
    if (Btitle.on) {
      const B = Btitle.raw;
      const p = bp(Btitle, t);
      const inP = easeOutQuint(range(p, 0, 0.42));          // entrada
      const scale = lerp(B.fromScale, B.toScale, easeOutBack(range(p, 0, 0.52), 1.1));
      const blur = lerp(B.fromBlur, 0, easeOutQuint(range(p, 0, 0.34))) * u;
      const track = lerp(B.fromTracking, B.toTracking, easeOutQuint(range(p, 0, 0.55))) * u;
      const outP = range(t, Bflash.a + 0.05 * S.k, Bflash.a + 0.17 * S.k);

      E.titleWrap.style.opacity = (inP * (1 - outP)).toFixed(3);
      E.titleWrap.style.transform =
        'translate(-50%,-50%) scale(' + scale.toFixed(4) + ')';
      E.titleWrap.style.filter = blur > 0.05 ? 'blur(' + blur.toFixed(2) + 'px)' : 'none';
      S.lines.forEach(l => l.el.style.setProperty('--tTrack', track.toFixed(2) + 'px'));

      E.kicker.style.opacity = (easeOutCubic(range(p, 0.10, 0.42)) * (1 - outP)).toFixed(3);
      E.titleBar.style.width = (easeOutQuint(range(p, 0.30, 0.85)) * 100).toFixed(2) + '%';
      E.titleBar.style.opacity = (1 - outP).toFixed(3);
    } else { E.titleWrap.style.opacity = '0'; }

    /* ---- 8.6 Tagline, logo y monedas (3.10–3.70) ----------------------- */
    if (Bbrand.on) {
      const p = bp(Bbrand, t);
      const outP = range(t, Bflash.a + 0.05 * S.k, Bflash.a + 0.17 * S.k);
      E.tagline.style.opacity = (easeOutCubic(range(p, 0, 0.38)) * (1 - outP)).toFixed(3);
      E.tagline.style.transform =
        'translateY(' + ((1 - easeOutCubic(range(p, 0, 0.38))) * 22 * u).toFixed(2) + 'px)';

      const bIn = easeOutBack(range(p, 0.12, 0.52), 1.6);
      E.brand.style.opacity = (clamp01(range(p, 0.12, 0.34)) * (1 - outP)).toFixed(3);
      E.brand.style.transform = 'scale(' + bIn.toFixed(3) + ')';

      // Monedas: parábola determinística por moneda
      for (let i = 0; i < S.coins.length; i++) {
        const c = S.coins[i];
        const lt = (p - c.t0) * (Bbrand.b - Bbrand.a);      // tiempo local en segundos
        if (lt <= 0) { c.el.style.opacity = '0'; continue; }
        const x = c.x0 + c.vx * lt;
        const y = c.y0 + c.vy * lt + 0.5 * c.g * lt * lt;
        const life = clamp01(lt / ((Bbrand.b - Bbrand.a) * 0.9));
        c.el.style.opacity = ((1 - life * life) * (1 - outP)).toFixed(3);
        c.el.style.transform =
          'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)' +
          ' rotateZ(' + (c.rot * lt).toFixed(1) + 'deg)' +
          ' rotateY(' + (c.flip * lt).toFixed(1) + 'deg)';
      }
    } else {
      E.tagline.style.opacity = '0'; E.brand.style.opacity = '0';
      S.coins.forEach(c => { c.el.style.opacity = '0'; });
    }

    /* ---- 8.7 Flash y corte limpio (3.70–4.00) -------------------------- */
    if (Bflash.on) {
      const F = Bflash.raw;
      const dur = Bflash.b - Bflash.a;
      const peak = F.peak * S.k;
      const up = range(t, Bflash.a, Bflash.a + peak);
      const down = range(t, Bflash.a + peak, Bflash.b - F.holdOut * S.k);
      E.flash.style.opacity = (easeOutQuint(up) * (1 - easeInOut(down))).toFixed(3);
      // Todo el contenido se va: corte limpio (a negro, o a transparente en alfa)
      const out = 1 - range(t, Bflash.a + 0.07 * S.k, Bflash.a + 0.19 * S.k);
      E.shake.style.opacity = out.toFixed(3);
      if (S.alpha) document.getElementById('bg').style.opacity = '0';
    } else { E.flash.style.opacity = '0'; E.shake.style.opacity = '1'; }
  }

  /* ---------------------------------------------------------------------
     9. Medición de zona segura (la usa render.mjs para verificar)
     --------------------------------------------------------------------- */
  function measure() {
    const out = [];
    const wrapOp = parseFloat(getComputedStyle(document.getElementById('titleWrap')).opacity);
    const strokePad = (S.cfg.beats.title.strokePx * S.u) / 2;   // el contorno crece hacia afuera

    // Mide el TEXTO, no la caja: un <div> a 100% de ancho no dice nada útil.
    const textRect = el => {
      const r = document.createRange();
      r.selectNodeContents(el);
      return r.getBoundingClientRect();
    };
    const push = (id, el, op, pad) => {
      if (!el || op < 0.05) return;
      const r = (el.firstChild && el.firstChild.nodeType === 3) ? textRect(el) : el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      out.push({ id, top: r.top - pad, bottom: r.bottom + pad,
                 left: r.left - pad, right: r.right + pad, opacity: op });
    };

    const k = document.getElementById('kicker');
    push('kicker', k, parseFloat(getComputedStyle(k).opacity) * wrapOp, 0);

    document.querySelectorAll('#title .t-line').forEach((line, i) => {
      const fill = line.querySelector('.t-fill');
      if (!fill || !fill.textContent) return;
      push('title' + i, fill, wrapOp, strokePad);
    });

    const tg = document.getElementById('tagline');
    push('tagline', tg, parseFloat(getComputedStyle(tg).opacity) * wrapOp, 0);

    const br = document.getElementById('brand');
    push('brand', br, parseFloat(getComputedStyle(br).opacity), 0);

    return out;
  }

  /* ---------------------------------------------------------------------
     10. Arranque
     --------------------------------------------------------------------- */
  async function init() {
    const q = new URLSearchParams(location.search);
    const cfg = S.cfg = await loadConfig();

    const fmtName = q.get('format') || 'vertical';
    S.fmt = Object.assign({}, cfg.formats[fmtName]);
    if (!S.fmt.width) throw new Error('Formato desconocido: ' + fmtName);

    // Duración: variante o override por query
    let dur = cfg.timeline.duration;
    const variant = q.get('variant');
    if (variant && cfg.variants && cfg.variants[variant]) dur = cfg.variants[variant].duration;
    if (q.get('duration')) dur = parseFloat(q.get('duration'));
    S.base = cfg.timeline.baseDuration || cfg.timeline.duration;
    S.duration = dur;
    S.k = dur / S.base;                       // los beats se reescalan solos

    S.W = S.fmt.width; S.H = S.fmt.height;
    S.u = Math.min(S.W, S.H) / 1080;
    S.alpha = q.get('alpha') === '1';
    S.seedRnd = rng(cfg.timeline.seed || 1);

    if (S.alpha) document.documentElement.classList.add('alpha');
    if (q.get('safe') === '1') document.documentElement.classList.add('showsafe');

    buildDOM();
    cacheNodes();

    // Esperar fuentes reales antes de medir (si faltan, cae al fallback)
    try {
      await Promise.all([
        document.fonts.load('400 200px AntonLocal'),
        document.fonts.load('400 24px PressStart2P')
      ]);
      await document.fonts.ready;
    } catch (e) { /* sin fuentes: seguimos con el fallback */ }

    fitTitle();
    seek(0);

    window.INTRO = {
      seek, measure,
      duration: S.duration, fps: cfg.timeline.fps,
      width: S.W, height: S.H, format: fmtName,
      fontsLoaded: document.fonts.check('400 200px AntonLocal'),
      config: cfg
    };
    window.__INTRO_READY__ = true;
  }

  init().catch(err => {
    window.__INTRO_ERROR__ = String(err && err.stack || err);
    console.error(err);
  });
})();
