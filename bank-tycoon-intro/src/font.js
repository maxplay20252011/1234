/* =========================================================================
   Bank Tycoon — intro MAXWER
   font.js · Tipografía bitmap propia de 5x7, dibujada píxel por píxel.

   No usa ninguna fuente del sistema ni ningún TTF: cada glifo es una
   matriz de 7 filas de 5 caracteres ('#' = píxel encendido). Se dibuja con
   fillRect de 1x1 (escalado por un entero), así que nunca hay antialiasing
   ni posiciones fraccionarias.

   Nada que ver con la tipografía de Minecraft: es un trazado propio.
   ========================================================================= */
(function () {
  'use strict';

  const W = 5, H = 7;

  // Cada glifo: 7 filas de 5 columnas. '#' pinta, cualquier otra cosa no.
  const G = {
    'A': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    'B': ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
    'C': ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
    'D': ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
    'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    'F': ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
    'G': ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
    'H': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    'I': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
    'J': ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
    'K': ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
    'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    'M': ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
    'N': ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
    'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    'Q': ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
    'R': ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    'S': ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
    'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    'V': ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
    'W': ['#...#', '#...#', '#...#', '#...#', '#.#.#', '##.##', '#...#'],
    'X': ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
    'Y': ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
    'Z': ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],

    '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
    '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
    '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
    '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
    '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
    '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
    '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],

    ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
    '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
    ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '.#...'],
    ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
    '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
    '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
    '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
    '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
    '?': ['.###.', '#...#', '....#', '..##.', '..#..', '.....', '..#..'],
    "'": ['..#..', '..#..', '.....', '.....', '.....', '.....', '.....'],
    '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
    '$': ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..']
  };

  const glyph = ch => G[ch] || G['?'];
  const has = ch => Object.prototype.hasOwnProperty.call(G, ch);

  // Avance por carácter, en píxeles del canvas de baja resolución
  function advance(scale, tracking) { return W * scale + tracking; }

  function measure(text, scale, tracking) {
    const t = String(text);
    if (!t.length) return 0;
    return t.length * advance(scale, tracking) - tracking;
  }

  // Dibuja un glifo. x,y son la esquina superior izquierda, siempre enteros.
  function drawChar(ctx, ch, x, y, scale, color) {
    const rows = glyph(String(ch).toUpperCase());
    ctx.fillStyle = color;
    x = Math.round(x); y = Math.round(y);
    for (let r = 0; r < H; r++) {
      const row = rows[r];
      let c = 0;
      while (c < W) {
        if (row[c] !== '#') { c++; continue; }
        // Agrupa píxeles contiguos en un solo fillRect: menos llamadas,
        // mismo resultado exacto.
        let run = 1;
        while (c + run < W && row[c + run] === '#') run++;
        ctx.fillRect(x + c * scale, y + r * scale, run * scale, scale);
        c += run;
      }
    }
  }

  /* Dibuja una línea completa.
     opts: { scale, tracking, color, shadowColor, shadowOffset, align }
     La sombra es dura: el mismo texto desplazado shadowOffset*scale px
     abajo-derecha, sin desenfoque (estilo HUD). */
  function drawText(ctx, text, x, y, opts) {
    const o = opts || {};
    const scale = o.scale || 1;
    const tracking = o.tracking === undefined ? scale : o.tracking;
    const t = String(text).toUpperCase();
    const wide = measure(t, scale, tracking);
    let ox = Math.round(x);
    if (o.align === 'center') ox = Math.round(x - wide / 2);
    else if (o.align === 'right') ox = Math.round(x - wide);
    const oy = Math.round(y);
    const adv = advance(scale, tracking);
    const so = (o.shadowOffset === undefined ? 1 : o.shadowOffset) * scale;

    for (const pass of (o.shadowColor ? [1, 0] : [0])) {
      const col = pass ? o.shadowColor : (o.color || '#fff');
      const dx = pass ? so : 0, dy = pass ? so : 0;
      for (let i = 0; i < t.length; i++) drawChar(ctx, t[i], ox + i * adv + dx, oy + dy, scale, col);
    }
    return { x: ox, y: oy, width: wide, height: H * scale };
  }

  window.PixelFont = { W, H, has, glyph, measure, advance, drawChar, drawText };
})();
