/* Librería de ilustración de prendas tomada de ../iconnic-arma-el-look/index.html (sección 2). No editar acá: si cambia allá, volver a copiarla. */
/* =====================================================================
   2) ILUSTRACIÓN
   Todo se dibuja a partir de ANCHORS (puntos del cuerpo). Cada prenda es una
   función (anclajes, color, prenda) → { p: [siluetas], d: [detalles], capas? }.
   La misma función dibuja la prenda puesta (cuerpo en pose) y en flat-lay
   (cuerpo FLAT: simétrico, mangas y piernas estiradas). El calzado tiene
   además un dibujo de perfil para el placard.
   ===================================================================== */
const CONTORNO = "#2B2040";
const PIELES = ["#F5DCCB", "#EBC3A3", "#D6A07A", "#B07C57", "#8A5739", "#5E3B27"];
const PELOS = [{ nombre: "Negro", hex: "#2A1E1B" }, { nombre: "Castaño", hex: "#5E3B26" }, { nombre: "Rubio", hex: "#C9A26B" }, { nombre: "Cobrizo", hex: "#93421F" }];
// Siluetas: factor de ancho por zona (hombros, busto, cintura, cadera, rodilla, tobillo).
const SILUETAS = [
  { id: "A", k: { sh: 1, bu: 1, wa: 1, hi: 1, ro: 1, to: 1 } },
  { id: "B", k: { sh: 1.04, bu: 1.1, wa: 1.13, hi: 1.12, ro: 1.12, to: 1.05 } },
  { id: "C", k: { sh: 1.08, bu: 1.2, wa: 1.3, hi: 1.25, ro: 1.25, to: 1.1 } },
];
const BASE_HEX = "#D7CACD"; // ropa interior neutra

/* ---------- color y geometría ---------- */
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16), f = amt < 0 ? 0 : 255, t = Math.abs(amt);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v + (f - v) * t));
  return "#" + ch.map(v => v.toString(16).padStart(2, "0")).join("");
}
function mix(a, b, t) {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  return "#" + [16, 8, 0].map(s => Math.round(((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t).toString(16).padStart(2, "0")).join("");
}
const f1 = n => Math.round(n * 10) / 10;
const pt = p => f1(p[0]) + "," + f1(p[1]);
const lerp = (a, b, t) => a + (b - a) * t;
const lp = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];
const PARES = /(-?\d*\.?\d+),(-?\d*\.?\d+)/g; // los paths a mano usan solo M L C Z con pares "x,y"
const mir = d => d.replace(PARES, (m, x, y) => f1(200 - x) + "," + y);
/** Transforma un path local: espejo opcional, rotación (grados) y traslado. */
function xf(d, t) {
  const r = (t.rot || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return d.replace(PARES, (m, X, Y) => { let px = +X; const py = +Y; if (t.flip) px = -px; return f1(t.x + px * c - py * s) + "," + f1(t.y + px * s + py * c); });
}
const circ = (x, y, r) => { const k = r * 0.5523; return `M${pt([x - r, y])} C${pt([x - r, y - k])} ${pt([x - k, y - r])} ${pt([x, y - r])} C${pt([x + k, y - r])} ${pt([x + r, y - k])} ${pt([x + r, y])} C${pt([x + r, y + k])} ${pt([x + k, y + r])} ${pt([x, y + r])} C${pt([x - k, y + r])} ${pt([x - r, y + k])} ${pt([x - r, y])} Z`; };
/** Contorno cerrado suave (Catmull-Rom). Un punto [x,y,1] es una esquina. */
function shape(pts) {
  const n = pts.length; let s = pts.findIndex(p => p[2]); if (s < 0) s = 0;
  const P = pts.slice(s).concat(pts.slice(0, s));
  let d = "M" + pt(P[0]);
  for (let i = 0; i < n; i++) {
    const p1 = P[i], p2 = P[(i + 1) % n], p0 = p1[2] ? p1 : P[(i - 1 + n) % n], p3 = p2[2] ? p2 : P[(i + 2) % n];
    d += " C" + pt([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]) + " " + pt([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]) + " " + pt(p2);
  }
  return d + " Z";
}
/** Línea abierta suave. */
function curva(P) {
  let d = "M" + pt(P[0]);
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    d += " C" + pt([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]) + " " + pt([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]) + " " + pt(p2);
  }
  return d;
}
/** Remuestrea un miembro {pts, w} entre las fracciones t0 y t1 de su largo. */
function resample(def, t0, t1, k = 6) {
  const P = def.pts, W = def.w, Lc = [0];
  for (let i = 1; i < P.length; i++) Lc.push(Lc[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const tot = Lc[Lc.length - 1], pts = [], w = [];
  for (let j = 0; j <= k; j++) {
    const d = (t0 + (t1 - t0) * j / k) * tot; let i = 1;
    while (i < P.length - 1 && Lc[i] < d) i++;
    const u = Math.min(1, Math.max(0, (d - Lc[i - 1]) / ((Lc[i] - Lc[i - 1]) || 1)));
    pts.push(lp(P[i - 1], P[i], u)); w.push(lerp(W[i - 1], W[i], u));
  }
  return { pts, w };
}
function bordes(def, ex = () => 0) {
  const P = def.pts, n = P.length, L = [], R = [], dirs = [];
  P.forEach((p, i) => {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
    const w = (def.w[i] + ex(i / (n - 1))) / 2;
    dirs.push([dx, dy]); L.push([p[0] - dy * w, p[1] + dx * w]); R.push([p[0] + dy * w, p[1] - dx * w]);
  });
  return { L, R, dirs };
}
/** Miembro con volumen (brazo, pierna, manga, botamanga). extra = holgura total (número o función de 0..1). */
function limb(def, o = {}) {
  const P = def.pts, n = P.length, ex = typeof o.extra === "function" ? o.extra : () => o.extra || 0;
  const { L, R, dirs } = bordes(def, ex);
  const wE = (def.w[n - 1] + ex(1)) / 2, wI = (def.w[0] + ex(0)) / 2, finP = o.capFin === "flat", iniP = o.capIni === "flat";
  const pts = L.map((p, i) => ((i === n - 1 && finP) || (i === 0 && iniP) ? [...p, 1] : p));
  if (!finP) pts.push([P[n - 1][0] + dirs[n - 1][0] * wE * 0.85, P[n - 1][1] + dirs[n - 1][1] * wE * 0.85]);
  for (let i = n - 1; i >= 0; i--) pts.push((i === n - 1 && finP) || (i === 0 && iniP) ? [...R[i], 1] : R[i]);
  if (!iniP) pts.push([P[0][0] - dirs[0][0] * wI * 0.85, P[0][1] - dirs[0][1] * wI * 0.85]);
  return shape(pts);
}
/** Puntos izquierdo y derecho de un miembro a la fracción t. */
function cruce(def, t, extra = 0) { const r = resample(def, Math.max(0, t - 0.03), t, 1), b = bordes(r, () => extra); return [b.L[1], b.R[1]]; }

/* ---------- ANCHORS: cuerpo base (silueta A) en pose de croquis ----------
   Contrapposto: el peso va en la pierna izquierda de la pantalla (cadera más alta,
   hombro más bajo); la otra pierna se flexiona con la rodilla hacia adentro.
   Unas 8,5 cabezas de alto. Los brazos y piernas son {pts: eje, w: ancho}. */
const ANCHORS = {
  tilt: 3,
  cabeza: [100, 44], orejas: { l: [83.6, 45], r: [116.4, 45] }, ojos: { l: [93, 44], r: [107, 44] }, boca: [100, 57],
  cuello: { top: [100, 58], base: [100, 86], l: [92.6, 83], r: [107.4, 82] },
  hombros: { l: [71.5, 95], r: [128.5, 92] },
  axilas: { l: [74.5, 116], r: [125.5, 113] },
  busto: { l: [77, 129], r: [123, 126] },
  cintura: { l: [82, 168], r: [118, 166] },
  cadera: { l: [71, 204], r: [127, 210] },
  entrepierna: [98.5, 240],
  brazos: {
    l: { pts: [[74, 101], [69, 130], [64.5, 160], [64, 188], [67, 213]], w: [15, 12.5, 10, 9, 7] },   // codo = pts[2], muñeca = pts[4]
    r: { pts: [[126, 98], [131.5, 127], [137.5, 156], [140, 184], [137, 209]], w: [15, 12.5, 10, 9, 7] },
  },
  piernas: {
    l: { pts: [[84.5, 214], [86.5, 280], [88, 318], [89, 350], [92, 399]], w: [27, 20, 14, 14.5, 8.5] },  // rodilla = pts[2], tobillo = pts[4]
    r: { pts: [[113, 218], [112, 281], [110, 321], [113, 353], [118, 396]], w: [27, 20, 14, 14.5, 8.5] },
  },
  pies: { l: { rot: 6, flip: false }, r: { rot: -10, flip: true } },
};
/* Cuerpo "flat-lay": simétrico, sin inclinación, mangas abiertas y piernas rectas. */
const FLAT = (() => {
  const A = JSON.parse(JSON.stringify(ANCHORS));
  A.tilt = 0; A.flat = true;
  A.cadera.l = [71, 207];
  ["cuello", "hombros", "axilas", "busto", "cintura", "cadera"].forEach(k => { A[k].r = [200 - A[k].l[0], A[k].l[1]]; });
  A.entrepierna = [100, 240];
  A.brazos.l.pts = [[74, 101], [63, 126], [52, 151], [44, 175], [38, 199]];
  A.piernas.l.pts = [[85, 214], [86, 280], [87, 318], [88, 350], [89, 399]];
  A.brazos.r.pts = A.brazos.l.pts.map(p => [200 - p[0], p[1]]);
  A.piernas.r.pts = A.piernas.l.pts.map(p => [200 - p[0], p[1]]);
  A.pies = { l: { rot: 0, flip: false }, r: { rot: 0, flip: true } };
  return A;
})();

function escalar(A, k) {
  const tabla = [[88, 1], [95, k.sh], [127, k.bu], [167, k.wa], [207, k.hi], [318, k.ro], [400, k.to]];
  const kAt = y => {
    if (y <= tabla[0][0]) return 1;
    for (let i = 1; i < tabla.length; i++) if (y <= tabla[i][0]) return lerp(tabla[i - 1][1], tabla[i][1], (y - tabla[i - 1][0]) / (tabla[i][0] - tabla[i - 1][0]));
    return tabla[tabla.length - 1][1];
  };
  const sx = p => { p[0] = 100 + (p[0] - 100) * kAt(p[1]); };
  ["hombros", "axilas", "busto", "cintura", "cadera"].forEach(n => { sx(A[n].l); sx(A[n].r); });
  sx(A.entrepierna);
  ["brazos", "piernas"].forEach(n => ["l", "r"].forEach(s => { const d = A[n][s]; d.w = d.w.map((w, i) => w * kAt(d.pts[i][1])); d.pts.forEach(sx); }));
}
/** Agrega medidas derivadas: alturas clave (Y) y el perfil lateral del cuerpo. */
function derivar(base, sil) {
  const A = JSON.parse(JSON.stringify(base));
  if (sil) escalar(A, sil.k);
  const m = o => (o.l[1] + o.r[1]) / 2;
  A.Y = { sh: m(A.hombros), ax: m(A.axilas), bu: m(A.busto), wa: m(A.cintura), hi: m(A.cadera), cr: A.entrepierna[1],
    ro: (A.piernas.l.pts[2][1] + A.piernas.r.pts[2][1]) / 2, to: (A.piernas.l.pts[4][1] + A.piernas.r.pts[4][1]) / 2 };
  const bl = bordes(A.piernas.l), br = bordes(A.piernas.r);
  A.perfil = {
    l: [A.hombros.l, A.axilas.l, A.busto.l, A.cintura.l, A.cadera.l, ...bl.L.slice(1)],
    r: [A.hombros.r, A.axilas.r, A.busto.r, A.cintura.r, A.cadera.r, ...br.R.slice(1)],
  };
  return A;
}
const CUERPOS = SILUETAS.map(s => derivar(ANCHORS, s));
const FLAT_D = derivar(FLAT);

function sideX(A, s, y) {
  const P = A.perfil[s];
  if (y <= P[0][1]) return P[0][0];
  for (let i = 1; i < P.length; i++) if (y <= P[i][1]) return lerp(P[i - 1][0], P[i][0], (y - P[i - 1][1]) / (P[i][1] - P[i - 1][1]));
  return P[P.length - 1][0];
}
const ext = (A, s, y, e) => [sideX(A, s, y) + (s === "l" ? -e : e), y];
const cX = (A, y) => (sideX(A, "l", y) + sideX(A, "r", y)) / 2;
const lado = (A, s, y0, y1, e, k = 5) => Array.from({ length: k + 1 }, (_, i) => ext(A, s, lerp(y0, y1, i / k), e));
const LADOS = ["l", "r"];

/* ---------- moldes reutilizables ---------- */
function torsoPts(A, o) {
  const e = o.ease ?? 2, Y = A.Y, cu = o.cuello || "redondo", t = A.tilt * 0.4;
  const nl = A.cuello.l, nr = A.cuello.r, nb = A.cuello.base, shl = A.hombros.l, shr = A.hombros.r, cx = nb[0];
  const sinHombro = ["recto", "tirantes", "hombrosAfuera"].includes(cu);
  const bajo = sinHombro && cu !== "hombrosAfuera" ? 4 : 0;
  const L = lado(A, "l", A.axilas.l[1] + bajo, o.hem - t, e, 6);
  const R = lado(A, "r", A.axilas.r[1] + bajo, o.hem + t, e, 6).reverse();
  L[L.length - 1].push(1); R[0].push(1);
  const mid = [cX(A, o.hem), o.hem + (o.hemCurva ?? 1.5)]; if (o.hemPico) mid.push(1);
  let top;
  if (cu === "hombrosAfuera") {
    top = [[A.axilas.r[0] + e, A.axilas.r[1] - 6], [cx, Y.ax - 3], [A.axilas.l[0] - e, A.axilas.l[1] - 6]];
  } else if (sinHombro) {
    const yT = Y.bu - (o.alto ?? 11), escote = cu === "recto" ? 0 : 1;
    top = [[A.busto.r[0] - 4, yT - 1, 1], [cx + 9, yT - 2.5], [cx, yT + (escote ? 3.5 : 2), escote], [cx - 9, yT - 2.5], [A.busto.l[0] + 4, yT - 1, 1]];
  } else {
    const sm = !!o.sinMangas;
    const hR = sm ? lp(nr, shr, 0.58) : [shr[0] + e, shr[1] - 0.8], hL = sm ? lp(nl, shl, 0.58) : [shl[0] - e, shl[1] - 0.8];
    const mR = lp(nr, shr, sm ? 0.3 : 0.5), mL = lp(nl, shl, sm ? 0.3 : 0.5); mR[1] -= 1.2; mL[1] -= 1.2;
    const cuellos = {
      redondo: [[nr[0] + 1.5, nr[1] - 0.6], [cx, nb[1] + 4.5], [nl[0] - 1.5, nl[1] - 0.6]],
      u: [[nr[0] + 3.5, nr[1] + 0.5], [cx, nb[1] + 15], [nl[0] - 3.5, nl[1] + 0.5]],
      v: [[nr[0] + 2, nr[1] - 0.5, 1], [cx, Y.bu - 4, 1], [nl[0] - 2, nl[1] - 0.5, 1]],
      alto: [[nr[0] + 0.6, nr[1] - 1.2], [cx, nb[1] + 1.5], [nl[0] - 0.6, nl[1] - 1.2]],
      camisa: [[nr[0] + 1, nr[1] - 1.2, 1], [cx, nb[1] + 11, 1], [nl[0] - 1, nl[1] - 1.2, 1]],
    };
    const sisaR = sm ? [[A.axilas.r[0] - 1.5, A.axilas.r[1] - 7]] : [], sisaL = sm ? [[A.axilas.l[0] + 1.5, A.axilas.l[1] - 7]] : [];
    top = [...sisaR, [...hR, 1], mR, ...cuellos[cu], mL, [...hL, 1], ...sisaL];
  }
  return [...L, mid, ...R, ...top];
}
const mangas = (A, t, extra) => LADOS.map(s => limb(resample(A.brazos[s], 0, t, 7), { extra, capFin: "flat" }));
const punos = (A, t0, t1, extra) => LADOS.map(s => limb(resample(A.brazos[s], t0, t1, 2), { extra, capFin: "flat", capIni: "flat" }));
/** La falda acompaña la inclinación de la cadera. */
function faldaPts(A, o) {
  const e = o.ease ?? 2, yw = A.Y.wa + (o.tiro ?? 0), fl = o.flare ?? 10, t = A.tilt;
  const lado2 = (s, h) => Array.from({ length: 8 }, (_, i) => { const u = i / 7; return ext(A, s, lerp(yw, h, u), e + fl * Math.pow(u, 1.5)); });
  const L = lado2("l", o.hem - t), R = lado2("r", o.hem + t).reverse();
  L[0].push(1); L[7].push(1); R[0].push(1); R[7].push(1);
  const hem = [];
  if (o.zig) { const n = 14; for (let i = 1; i < n; i++) { const p = lp(L[7], R[0], i / n); hem.push([p[0], p[1] + (i % 2 ? 3 : 0), 1]); } }
  else { const p = lp(L[7], R[0], 0.5); hem.push([p[0], p[1] + 2.5]); }
  return [...L, ...hem, ...R, [cX(A, yw), yw + 0.6]];
}
function pantalonP(A, o) {
  const e = o.ease ?? 1.5, Y = A.Y, yw = Y.wa + (o.tiro ?? 2), cr = A.entrepierna;
  const pelvis = shape([[...ext(A, "l", yw - A.tilt * 0.3, e), 1], ext(A, "l", (yw + Y.hi) / 2, e), ext(A, "l", Y.hi, e), ext(A, "l", Y.hi + 16, e),
    [cr[0], cr[1] + 2], ext(A, "r", Y.hi + 16, e), ext(A, "r", Y.hi, e), ext(A, "r", (yw + Y.hi) / 2, e), [...ext(A, "r", yw + A.tilt * 0.3, e), 1], [cX(A, yw), yw + 0.4]]);
  const piernas = LADOS.map(s => limb(resample(A.piernas[s], 0.05, o.t ?? 0.965, 8), { extra: u => e * 2 + (o.flare ? o.flare(u) : 0), capFin: "flat" }));
  return [pelvis, ...piernas];
}
/** Delantero de abrigo abierto. En flat-lay se cierra. */
function panelPts(A, s, o) {
  const e = o.ease ?? 4, g = s === "l" ? -1 : 1, Y = A.Y, n = A.cuello[s], sh = A.hombros[s];
  const gap = A.flat ? (o.gapFlat ?? -1.5) : (o.gap ?? 5), hem = o.hem + g * A.tilt * 0.8, qb = o.quiebre ?? Y.bu + 12;
  const side = lado(A, s, A.axilas[s][1], hem, e, 7); side[7].push(1);
  const front = Array.from({ length: 6 }, (_, i) => { const y = lerp(hem, qb, i / 5); return [cX(A, y) + g * gap, y]; });
  front[0].push(1); front[5].push(1);
  const m = lp(n, sh, 0.5); m[1] -= 1.2;
  return { pts: [[n[0] + g * 0.5, n[1] - 1.5, 1], m, [sh[0] + g * e, sh[1] - 1, 1], ...side, ...front], quiebre: front[5], cuello: n };
}

/* ---------- detalles ---------- */
const entrepierna = (A, c, t) => { const a = cruce(A.piernas.l, t, 0)[1], b = cruce(A.piernas.r, t, 0)[0]; return ln(curva([[A.entrepierna[0], A.entrepierna[1]], lp(a, b, 0.5)]), shade(c, -0.4), 1.3); };
const ln = (d, c, w = 0.9, x = "") => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${x}/>`;
const dot = (p, r, c, x = "") => `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="${r}" fill="${c}" ${x}/>`;
const fillD = (d, c, w = 1) => `<path d="${d}" fill="${c}" stroke="${CONTORNO}" stroke-width="${w}" stroke-linejoin="round"/>`;
const tira = (d, c, w = 1.9) => ln(d, CONTORNO, w + 1.2) + ln(d, c, w);
function pliegues(A, c, q) {
  const k = shade(c, -0.32), out = [];
  if (q.codos) LADOS.forEach(s => { const [x, y] = A.brazos[s].pts[2], g = s === "l" ? 1 : -1;
    out.push(ln(curva([[x + g * 0.5, y - 5], [x + g * 3, y - 2.5], [x + g * 5.5, y - 3.5]]), k, 0.8), ln(curva([[x + g * 1, y + 0.5], [x + g * 3.5, y + 2.5], [x + g * 5.5, y + 1]]), k, 0.7)); });
  if (q.cintura) LADOS.forEach(s => { const g = s === "l" ? 1 : -1, y = A.Y.wa + (q.dy || 0), x = sideX(A, s, y) + g * 1.5;
    out.push(ln(curva([[x, y - 3], [x + g * 5, y - 1], [x + g * 10, y - 2.5]]), k, 0.8)); });
  if (q.rodillas) LADOS.forEach(s => { const [x, y] = A.piernas[s].pts[2];
    out.push(ln(curva([[x - 4, y - 3], [x, y - 1.5], [x + 4, y - 3]]), k, 0.7), ln(curva([[x - 3, y + 3], [x + 0.5, y + 4.5], [x + 3.5, y + 3]]), k, 0.6)); });
  return out;
}
const rayasV = (c, w = 1.3, paso = 5) => { let s = ""; for (let x = 30; x <= 170; x += paso) s += ln(`M${x},60 L${x},440`, c, w); return s; };
const lunaresP = (c, r = 2) => { let s = ""; for (let y = 70, f = 0; y < 440; y += 9, f++) for (let x = 20 + (f % 2) * 5; x < 180; x += 10) s += dot([x, y], r, c); return s; };

/* ---------- calzado: pie local (pie izquierdo, punta hacia -x, tobillo en 0,0) ---------- */
const PIE_PLANO = "M-4.6,-2 C-5,5 -7.5,11 -11.5,16 C-14,19 -14.5,22.5 -11.5,23.2 L-1.5,23 C2.5,23 5.2,20 5.2,15 C5.2,9 4.8,4 4.6,-2 Z";
const PIE_TACO = "M-4.6,-2 C-5,6 -6.5,13 -9,19 C-10.5,23 -9.5,26 -6.5,25.5 L-4.5,25 C-2,20 1.5,14 4.6,9 C5,5 4.8,1 4.6,-2 Z";
const pieT = (A, s) => { const a = A.piernas[s].pts[4]; return { x: a[0], y: a[1], rot: A.pies[s].rot, flip: A.pies[s].flip }; };
/** Calzado puesto en 3/4: up = capellada (color), suela = capa aparte, det = detalles. */
function calzadoPuesto(A, c, o) {
  const p = [], d = [], suela = [];
  LADOS.forEach(s => {
    const t = pieT(A, s);
    o.up.forEach(u => p.push(xf(u, t)));
    (o.suela || []).forEach(u => suela.push(xf(u, t)));
    (o.det || []).forEach(([u, col, w]) => d.push(ln(xf(u, t), col, w)));
    (o.tiras || []).forEach(([u, col, w]) => d.push(tira(xf(u, t), col, w)));
  });
  return { p, d, capas: suela.length ? [{ p: suela, c: o.suelaHex || shade(c, -0.35), d: [] }] : [] };
}

/* ---------- PRENDAS (dibujo → función) ---------- */
const DIBUJOS = {
  /* ---- tops ---- */
  remera: (A, c) => { const hem = A.Y.wa + 18, k = shade(c, -0.28);
    return { p: [shape(torsoPts(A, { hem, ease: 2.5 })), ...mangas(A, 0.26, 4.5)],
      d: [ln(curva([[A.cuello.r[0] + 1.5, A.cuello.r[1] + 2.2], [A.cuello.base[0], A.cuello.base[1] + 7], [A.cuello.l[0] - 1.5, A.cuello.l[1] + 2.2]]), k, 0.9),
        ln(curva([ext(A, "l", hem - 4.5 - A.tilt * 0.4, 1), [cX(A, hem), hem - 3], ext(A, "r", hem - 4.5 + A.tilt * 0.4, 1)]), k, 0.7, 'stroke-dasharray="1.6 1.6"'),
        ...LADOS.map(s => { const [a, b] = cruce(A.brazos[s], 0.22, 4.5); return ln(curva([a, b]), k, 0.7, 'stroke-dasharray="1.6 1.6"'); }),
        ...pliegues(A, c, { cintura: 1 })] }; },
  blusa: (A, c) => { const hem = A.Y.wa + 20, lt = shade(c, 0.6);
    return { p: [shape(torsoPts(A, { hem, ease: 3, cuello: "v" })), ...mangas(A, 0.9, u => 5 + u * 5), ...punos(A, 0.88, 0.97, 3.5)],
      d: [ln(curva([ext(A, "l", A.Y.bu, -6), ext(A, "l", A.Y.wa, -7), ext(A, "l", A.Y.wa + 15, -6)]), lt, 1.6, 'opacity=".55"'),
        ...LADOS.map(s => { const [a, b] = cruce(A.brazos[s], 0.88, 3.5); return ln(curva([a, b]), shade(c, -0.3), 0.8); }),
        ...LADOS.map(s => ln(curva(resample(A.brazos[s], 0.15, 0.8, 4).pts.map(p => [p[0] + (s === "l" ? -2 : 2), p[1]])), lt, 1.2, 'opacity=".45"')),
        ...pliegues(A, c, { codos: 1, cintura: 1 })] }; },
  camisa: (A, c, it) => { const hem = A.Y.wa + 24, nb = A.cuello.base, nl = A.cuello.l, nr = A.cuello.r, k = shade(c, -0.35);
    return { p: [shape(torsoPts(A, { hem, ease: 2.5, cuello: "camisa", hemCurva: 4 })), ...mangas(A, 0.9, 4), ...punos(A, 0.88, 0.97, 4.5)],
      d: [rayasV(it.detalleHex || shade(c, -0.4), 1.3, 5),
        ln(curva([[nb[0], nb[1] + 11], [cX(A, A.Y.bu), A.Y.bu], [cX(A, hem), hem + 3]]), k, 0.9),
        ...[0.2, 0.42, 0.64, 0.86].map(u => { const y = lerp(nb[1] + 14, hem, u); return dot([cX(A, y) + 1.5, y], 1.3, "#FBFAF7", `stroke="${k}" stroke-width=".5"`); }),
        fillD(shape([[nl[0] - 0.5, nl[1] - 2.5, 1], [nb[0] - 0.5, nb[1] + 11, 1], [nl[0] - 9, nb[1] + 7, 1]]), c),
        fillD(shape([[nr[0] + 0.5, nr[1] - 2.5, 1], [nb[0] + 0.5, nb[1] + 11, 1], [nr[0] + 9, nb[1] + 6, 1]]), c),
        ...pliegues(A, c, { codos: 1, cintura: 1 })] }; },
  musculosa: (A, c) => { const hem = A.Y.wa + 16, k = shade(c, -0.3);
    return { p: [shape(torsoPts(A, { hem, ease: 2, cuello: "u", sinMangas: 1 }))],
      d: [ln(curva([[A.cuello.r[0] + 3.5, A.cuello.r[1] + 3], [A.cuello.base[0], A.cuello.base[1] + 17], [A.cuello.l[0] - 3.5, A.cuello.l[1] + 3]]), k, 0.8),
        ...[-6, 0, 6].map(dx => ln(curva([[cX(A, A.Y.bu) + dx, A.Y.bu + 4], [cX(A, A.Y.wa) + dx * 1.1, A.Y.wa], [cX(A, hem) + dx * 1.2, hem - 2]]), shade(c, -0.12), 0.6)),
        ...pliegues(A, c, { cintura: 1 })] }; },
  sweater: (A, c) => { const hem = A.Y.wa + 28, k = shade(c, -0.3), Y = A.Y; let rib = "";
    for (let x = 40; x <= 160; x += 2.6) rib += ln(`M${f1(x)},${f1(hem - 8)} L${f1(x)},${f1(hem + 6)}`, k, 0.6);
    const ocho = dx => ln(curva(Array.from({ length: 11 }, (_, i) => { const y = lerp(Y.ax, hem - 10, i / 10); return [cX(A, y) + dx + (i % 2 ? 2.4 : -2.4), y]; })), k, 1.1);
    return { p: [shape(torsoPts(A, { hem, ease: 4 })), ...mangas(A, 0.9, u => 6 + u * 2), ...punos(A, 0.88, 0.98, 4)],
      d: [rib, ocho(-9), ocho(9), ocho(0), ln(curva([[A.cuello.r[0] + 1.5, A.cuello.r[1] + 1.5], [A.cuello.base[0], A.cuello.base[1] + 6], [A.cuello.l[0] - 1.5, A.cuello.l[1] + 1.5]]), k, 2.2),
        ...LADOS.map(s => { const [a, b] = cruce(A.brazos[s], 0.88, 4); return ln(curva([a, b]), k, 0.8); }), ...pliegues(A, c, { codos: 1 })] }; },
  corset: (A, c) => { const hem = A.Y.wa + 10, lt = shade(c, 0.35), Y = A.Y, yT = Y.bu - 9;
    return { p: [shape(torsoPts(A, { hem, ease: 1, cuello: "recto", alto: 9, hemPico: 1, hemCurva: 6 }))],
      d: [...[-14, -7, 7, 14].map(dx => ln(curva([[cX(A, yT + 2) + dx * 1.05, yT + 2], [cX(A, Y.wa) + dx * 0.8, Y.wa], [cX(A, hem) + dx * 0.9, hem]]), lt, 0.7)),
        ln(curva(Array.from({ length: 10 }, (_, i) => { const y = lerp(yT + 4, hem - 2, i / 9); return [cX(A, y) + (i % 2 ? 2 : -2), y]; })), shade(c, 0.6), 0.8),
        ln(curva([[A.busto.l[0] + 4, yT + 1.5], [cX(A, yT), yT + 4], [A.busto.r[0] - 4, yT + 1.5]]), lt, 0.8)] }; },
  deportivo: (A, c) => { const hem = A.Y.bu + 15, k = shade(c, -0.3);
    return { p: [shape(torsoPts(A, { hem, ease: 1, cuello: "u", sinMangas: 1, hemCurva: 0.5 }))],
      d: [ln(curva([ext(A, "l", hem - 3 - A.tilt * 0.4, -0.5), [cX(A, hem), hem - 2.5], ext(A, "r", hem - 3 + A.tilt * 0.4, -0.5)]), k, 4),
        ...LADOS.map(s => ln(curva([lp(A.cuello[s], A.hombros[s], 0.45), [lerp(A.busto[s][0], 100, 0.25), A.Y.bu - 4], [lerp(A.busto[s][0], 100, 0.15), hem - 5]]), shade(c, 0.35), 1))] }; },
  polera: (A, c) => { const hem = A.Y.wa + 24, k = shade(c, -0.32), nb = A.cuello.base; let rib = "";
    for (let x = 90; x <= 110; x += 2.5) rib += ln(`M${x},62 L${x},${nb[1]}`, k, 0.6);
    return { p: [shape(torsoPts(A, { hem, ease: 3, cuello: "alto" })), ...mangas(A, 0.97, 4.5), limb({ pts: [[A.cuello.top[0], 62], [nb[0], nb[1] + 1]], w: [17.5, 19] }, { capIni: "flat", capFin: "flat" })],
      d: [rib, ...pliegues(A, c, { codos: 1, cintura: 1 })] }; },
  volados: (A, c) => { const hem = A.Y.wa + 18, aL = cruce(A.brazos.l, 0.24, 7), aR = cruce(A.brazos.r, 0.24, 7), cx = A.cuello.base[0], k = shade(c, -0.3);
    const fondo = []; const n = 11; for (let i = 0; i <= n; i++) { const p = lp(aR[1], aL[0], i / n); fondo.push([p[0], p[1] + (i % 2 ? 4 : 0), i % 2 ? 0 : 1]); }
    const volado = shape([[aL[0][0] - 1, aL[0][1] - 13], [cx, A.Y.ax - 6], [aR[1][0] + 1, aR[1][1] - 13], ...fondo]);
    return { p: [shape(torsoPts(A, { hem, ease: 2.5, cuello: "hombrosAfuera" })), volado],
      d: [...fondo.filter((_, i) => i % 2).map(q => ln(`M${pt([q[0], q[1] - 12])} L${pt([q[0], q[1] - 3])}`, k, 0.6)), ...pliegues(A, c, { cintura: 1 })] }; },

  /* ---- bottoms ---- */
  jean: (A, c) => { const Y = A.Y, yw = Y.wa + 2, hilo = "#D9A44A", k = shade(c, -0.3);
    const costura = s => { const b = bordes(resample(A.piernas[s], 0.12, 0.95, 6), () => -2); return ln(curva(s === "l" ? b.L : b.R), hilo, 0.7, 'stroke-dasharray="1.8 1.4"'); };
    return { p: pantalonP(A, { ease: 1.6, t: 0.965 }),
      d: [ln(curva([ext(A, "l", yw + 4.5 - A.tilt * 0.3, 0.5), [cX(A, yw + 5), yw + 5], ext(A, "r", yw + 4.5 + A.tilt * 0.3, 0.5)]), hilo, 0.7, 'stroke-dasharray="1.8 1.4"'),
        ln(curva([ext(A, "l", yw + 4 - A.tilt * 0.3, 0.5), [cX(A, yw + 4), yw + 4], ext(A, "r", yw + 4 + A.tilt * 0.3, 0.5)]), k, 0.8),
        ln(curva([[cX(A, yw) + 2, yw + 5], [cX(A, yw + 20) + 3, yw + 22], [cX(A, yw + 28) - 0.5, yw + 30]]), hilo, 0.8),
        ...LADOS.map(s => { const g = s === "l" ? 1 : -1, x = sideX(A, s, yw + 5); return ln(curva([[x + g * 1, yw + 5], [x + g * 7, yw + 9], [x + g * 11, yw + 5]]), hilo, 0.8); }),
        ...LADOS.map(s => { const g = s === "l" ? 1 : -1; return dot([sideX(A, s, yw + 5) + g * 11, yw + 5.5], 1, "#C9A45A"); }),
        costura("l"), costura("r"),
        ...LADOS.map(s => { const [a, b] = cruce(A.piernas[s], 0.93, 3.2); return ln(curva([a, b]), hilo, 0.7, 'stroke-dasharray="1.8 1.4"'); }),
        ...pliegues(A, c, { rodillas: 1 })] }; },
  sastrero: (A, c) => { const yw = A.Y.wa + 2, lt = shade(c, 0.22);
    return { p: pantalonP(A, { ease: 2.6, t: 0.975, flare: u => u * 6 }),
      d: [ln(curva([ext(A, "l", yw + 5 - A.tilt * 0.3, 0.6), [cX(A, yw + 5), yw + 5.5], ext(A, "r", yw + 5 + A.tilt * 0.3, 0.6)]), shade(c, 0.12), 1),
        ...LADOS.map(s => ln(curva(resample(A.piernas[s], 0.1, 0.97, 6).pts), lt, 0.9)),
        ...LADOS.map(s => { const g = s === "l" ? 1 : -1, x = sideX(A, s, yw + 6); return ln(`M${pt([x + g * 3, yw + 6])} L${pt([x + g * 0.5, yw + 22])}`, lt, 0.8); })] }; },
  plisada: (A, c) => { const Y = A.Y, hem = Y.ro + 16, pts = faldaPts(A, { hem, flare: 26, ease: 2, zig: 1 }); let pl = "";
    for (let i = 1; i < 14; i++) { const u = i / 14, top = lp(ext(A, "l", Y.wa + 6, 2), ext(A, "r", Y.wa + 6, 2), u), bot = lp(ext(A, "l", hem - A.tilt, 28), ext(A, "r", hem + A.tilt, 28), u);
      pl += ln(`M${pt(top)} L${pt([bot[0], bot[1] + (i % 2 ? 3 : 0)])}`, i % 2 ? shade(c, -0.22) : shade(c, 0.3), 0.8); }
    return { p: [shape(pts)], d: [pl, ln(curva([ext(A, "l", Y.wa + 5, 2), [cX(A, Y.wa + 5), Y.wa + 5.5], ext(A, "r", Y.wa + 5, 2)]), shade(c, -0.25), 0.9)] }; },
  short: (A, c) => { const yw = A.Y.wa + 2, k = shade(c, -0.3), deshilache = [];
    LADOS.forEach(s => { const [a, b] = cruce(A.piernas[s], 0.2, 7); for (let i = 1; i < 8; i++) { const q = lp(a, b, i / 8); deshilache.push(ln(`M${pt([q[0], q[1] - 1])} L${pt([q[0] + 0.4, q[1] + 2.2])}`, "#FFFFFF", 0.7, 'opacity=".85"')); } });
    const botamangas = LADOS.map(s => { const [a, b] = cruce(A.piernas[s], 0.2, 7.5), [c2, d2] = cruce(A.piernas[s], 0.155, 7); return fillD(shape([[...c2, 1], [...d2, 1], [...b, 1], [...a, 1]]), shade(c, 0.12), 1); });
    return { p: pantalonP(A, { ease: 3, t: 0.2, flare: u => u * 4 }),
      d: [...botamangas, ln(curva([[A.entrepierna[0], A.entrepierna[1] - 2], lp(cruce(A.piernas.l, 0.2, 7)[1], cruce(A.piernas.r, 0.2, 7)[0], 0.5)]), shade(c, -0.4), 1.2), ln(curva([ext(A, "l", yw + 4 - A.tilt * 0.3, 0.5), [cX(A, yw + 4), yw + 4], ext(A, "r", yw + 4 + A.tilt * 0.3, 0.5)]), k, 0.8),
        ln(curva([[cX(A, yw) + 2, yw + 5], [cX(A, yw + 18) + 3, yw + 19], [cX(A, yw + 24) - 0.5, yw + 26]]), "#D9A44A", 0.8),
        ...LADOS.map(s => { const g = s === "l" ? 1 : -1, x = sideX(A, s, yw + 5); return ln(curva([[x + g * 1, yw + 5], [x + g * 7, yw + 9], [x + g * 11, yw + 5]]), "#D9A44A", 0.8); }), ...deshilache] }; },
  calza: (A, c) => { const lt = shade(c, 0.4), yw = A.Y.wa;
    return { p: pantalonP(A, { ease: 0.4, t: 0.985, tiro: -2 }),
      d: [ln(curva([ext(A, "l", yw + 6 - A.tilt * 0.3, 0), [cX(A, yw + 6), yw + 6.5], ext(A, "r", yw + 6 + A.tilt * 0.3, 0)]), shade(c, 0.2), 1.2),
        ...LADOS.map(s => { const b = bordes(resample(A.piernas[s], 0.06, 0.97, 7), () => -2.2); return ln(curva(s === "l" ? b.L : b.R), lt, 1.3); }), ...pliegues(A, c, { rodillas: 1 })] }; },
  palazzo: (A, c) => { const yw = A.Y.wa, k = shade(c, -0.22);
    return { p: pantalonP(A, { ease: 3, t: 0.995, flare: u => 4 + u * 22, tiro: -2 }),
      d: [ln(curva([ext(A, "l", yw + 6 - A.tilt * 0.3, 3), [cX(A, yw + 6), yw + 6.5], ext(A, "r", yw + 6 + A.tilt * 0.3, 3)]), k, 1),
        entrepierna(A, c, 0.995),
        ...LADOS.flatMap(s => [-0.25, 0.2].map(off => { const r = resample(A.piernas[s], 0.25, 0.99, 5); return ln(curva(r.pts.map((p, i) => [p[0] + off * (r.w[i] + 4 + (i / 5) * 22), p[1]])), k, 0.8); }))] }; },
  minifalda: (A, c) => { const Y = A.Y, hem = Y.cr + 12;
    return { p: [shape(faldaPts(A, { hem, flare: 6, ease: 2 }))],
      d: [ln(`M${pt([cX(A, Y.wa) + 5, Y.wa + 2])} L${pt([cX(A, Y.wa + 28) + 5, Y.wa + 28])}`, shade(c, 0.5), 0.9),
        ln(curva([ext(A, "l", Y.wa + 8, -3), ext(A, "l", Y.hi, -4), ext(A, "l", hem - 6 - A.tilt, -3)]), "#FFFFFF", 1.6, 'opacity=".25"')] }; },

  /* ---- vestidos / enteritos ---- */
  slip: (A, c) => { const Y = A.Y, yT = Y.bu - 10, lt = shade(c, 0.55);
    const tiras = LADOS.map(s => limb({ pts: [[A.busto[s][0] + (s === "l" ? 5 : -5), yT - 1], lp(A.cuello[s], A.hombros[s], 0.42)], w: [1.8, 1.8] }));
    return { p: [shape(torsoPts(A, { hem: Y.wa + 3, ease: 1.5, cuello: "tirantes", alto: 10 })), shape(faldaPts(A, { hem: Y.ro + 30, flare: 16, ease: 2, tiro: -1 })), ...tiras],
      d: [ln(curva([ext(A, "l", Y.bu, -6), ext(A, "l", Y.hi, -8), ext(A, "l", Y.ro + 20 - A.tilt, -4)]), lt, 1.6, 'opacity=".5"'),
        ln(curva([[cX(A, Y.hi) + 8, Y.hi], [cX(A, Y.ro) + 14, Y.ro], [cX(A, Y.ro + 26) + 20, Y.ro + 28]]), shade(c, -0.25), 0.8)] }; },
  gala: (A, c) => { const Y = A.Y, lt = shade(c, 0.4), k = shade(c, -0.35);
    return { p: [shape(torsoPts(A, { hem: Y.wa + 3, ease: 1.5, cuello: "v", sinMangas: 1 })), shape(faldaPts(A, { hem: 414, flare: 30, ease: 2 }))],
      d: [ln(curva([ext(A, "l", Y.wa + 1, 0), [cX(A, Y.wa + 2), Y.wa + 3.5], ext(A, "r", Y.wa + 1, 0)]), lt, 1.2),
        ln(curva([[cX(A, Y.ro) + 12, Y.ro - 6], [cX(A, Y.ro + 40) + 16, Y.ro + 40], [cX(A, 412) + 22, 416]]), k, 1),
        ...[-14, -4, 6].map(dx => ln(curva([[cX(A, Y.hi) + dx * 0.6, Y.hi], [cX(A, Y.ro) + dx * 1.2, Y.ro], [cX(A, 410) + dx * 1.9, 410]]), dx < 0 ? lt : k, 0.8, 'opacity=".7"'))] }; },
  camisero: (A, c) => { const Y = A.Y, nb = A.cuello.base, nl = A.cuello.l, nr = A.cuello.r, hem = Y.ro + 8, k = shade(c, -0.35);
    return { p: [shape(torsoPts(A, { hem: Y.wa + 4, ease: 2.5, cuello: "camisa" })), ...mangas(A, 0.3, 5), ...punos(A, 0.25, 0.32, 6.5), shape(faldaPts(A, { hem, flare: 14 }))],
      d: [ln(curva([[nb[0], nb[1] + 11], [cX(A, Y.wa), Y.wa], [cX(A, hem), hem + 3]]), k, 0.9),
        ...[0.12, 0.3, 0.48, 0.66, 0.84].map(u => { const y = lerp(nb[1] + 14, hem - 8, u); return dot([cX(A, y) + 1.5, y], 1.2, k); }),
        fillD(shape([[nl[0] - 0.5, nl[1] - 2.5, 1], [nb[0] - 0.5, nb[1] + 11, 1], [nl[0] - 9, nb[1] + 7, 1]]), c),
        fillD(shape([[nr[0] + 0.5, nr[1] - 2.5, 1], [nb[0] + 0.5, nb[1] + 11, 1], [nr[0] + 9, nb[1] + 6, 1]]), c),
        fillD(shape([[...ext(A, "l", Y.wa - 3, 2.5), 1], [...ext(A, "r", Y.wa - 3, 2.5), 1], [...ext(A, "r", Y.wa + 4, 2.5), 1], [...ext(A, "l", Y.wa + 4, 2.5), 1]]), shade(c, -0.45), 0.8),
        dot([cX(A, Y.wa) + 2, Y.wa + 0.5], 2.4, "#C9A45A")] }; },
  enterito: (A, c) => { const Y = A.Y, k = shade(c, -0.3);
    return { p: [shape(torsoPts(A, { hem: Y.wa + 4, ease: 2, cuello: "u", sinMangas: 1 })), ...pantalonP(A, { ease: 3, t: 0.99, flare: u => 3 + u * 16, tiro: 0 })],
      d: [ln(curva([ext(A, "l", Y.wa + 1, 2.5), [cX(A, Y.wa + 2), Y.wa + 2.5], ext(A, "r", Y.wa + 1, 2.5)]), k, 2.2),
        ln(curva([[cX(A, Y.wa) + 3, Y.wa + 2], [cX(A, Y.wa) + 8, Y.wa + 14], [cX(A, Y.wa) + 6, Y.wa + 22]]), k, 1.2),
        ln(curva([[cX(A, Y.wa) + 3, Y.wa + 2], [cX(A, Y.wa) - 1, Y.wa + 15], [cX(A, Y.wa) + 1, Y.wa + 21]]), k, 1.2),
        entrepierna(A, c, 0.99), ...LADOS.map(s => ln(curva(resample(A.piernas[s], 0.3, 0.98, 4).pts), shade(c, -0.18), 0.8))] }; },
  lunares: (A, c, it) => { const Y = A.Y;
    return { p: [shape(torsoPts(A, { hem: Y.wa + 3, ease: 2 })), ...mangas(A, 0.25, u => 6 + u * 10), shape(faldaPts(A, { hem: Y.cr + 20, flare: 18 }))],
      d: [lunaresP(it.detalleHex || "#FFFFFF", 1.9), ln(curva([ext(A, "l", Y.wa + 2, 2), [cX(A, Y.wa + 3), Y.wa + 3.5], ext(A, "r", Y.wa + 2, 2)]), shade(c, -0.3), 0.9)] }; },
  punto: (A, c) => { const Y = A.Y, k = shade(c, -0.18); let rib = "";
    for (let x = 34; x <= 166; x += 4) rib += ln(`M${x},80 L${x},420`, k, 0.6);
    return { p: [shape(torsoPts(A, { hem: Y.wa + 4, ease: 1.5 })), ...mangas(A, 0.97, 3), shape(faldaPts(A, { hem: Y.ro + 26, flare: -3, ease: 1.5 }))],
      d: [rib, ln(curva([[A.cuello.r[0] + 1.5, A.cuello.r[1] + 1.5], [A.cuello.base[0], A.cuello.base[1] + 6], [A.cuello.l[0] - 1.5, A.cuello.l[1] + 1.5]]), shade(c, -0.35), 2), ...pliegues(A, c, { codos: 1 })] }; },

  /* ---- calzado (puesto en 3/4 + perfil para el placard) ---- */
  zapatillas: Object.assign((A, c) => calzadoPuesto(A, c, {
    up: ["M-5.6,-3 L5.6,-3 C6.3,4 6.5,10 6.5,16 L6.5,22 L-11.6,22.6 C-15.8,22.6 -16.6,18.6 -13.6,16.2 C-9.2,12.6 -6.6,6 -5.6,-3 Z"],
    suela: ["M-16.2,20.6 L6.8,20.6 L6.8,25.6 L-12.2,25.8 C-15.6,25.8 -16.8,23.4 -16.2,20.6 Z"], suelaHex: "#E4E1DA",
    det: [["M-5.6,3 L-1.4,1.8 M-6.8,7 L-2.6,5.8 M-8.4,11 L-4.2,9.8", "#9C9AA6", 0.9], ["M-12.6,17 C-9,16 -4,13.4 1.6,15.8", "#C7C4CC", 0.8]] }), {
    perfil: c => ({ p: ["M8,32 C8,27 14,25 22,23 L34,17 C38,15 44,13 50,13 L58,14 C61,18 62,26 62,33 L10,35 C8.5,35 8,34 8,32 Z"],
      capas: [{ p: ["M5,33 L63,33 L63,39 L10,39 C6.5,39 5,36 5,33 Z"], c: "#E4E1DA", d: [] }],
      d: [ln("M31,19 L35,23 M36,16.5 L40,20.5 M41,14.6 L45,18.6", "#9C9AA6", 1), ln("M14,30 C24,27 36,26 52,25", "#C7C4CC", 1), ln("M56,14 L60,26", "#C7C4CC", 0.9)] }) }),
  stilettos: Object.assign((A, c) => calzadoPuesto(A, c, {
    up: ["M-5,8 C-6.6,13 -8.4,18.6 -9.8,21.6 C-11,25 -9.2,26.6 -6.6,26 C-3,22 0.8,15.6 5,9.4 L5,5 C1.6,7.8 -1.8,8.8 -5,8 Z", "M3,9 L5.6,9 L5.2,28.6 L4.1,28.6 Z"],
    det: [["M-7.6,18 C-6.6,15 -5.2,12.6 -3.4,11", shade(c, 0.45), 0.8]] }), { pie: "taco",
    perfil: c => ({ p: ["M4,35 C4,31.5 10,30 18,29 C28,27.5 36,24 44,17 L54,9.5 C58,7 63,8 64,12 L64,18 C58,19 52,23 46,28 C38,34 26,37 10,38 C6,38 4,37 4,35 Z", "M58,17 L64,17 L61.5,41 L59.8,41 Z"],
      d: [ln("M18,29.5 C28,27.5 37,23 45,16", shade(c, 0.45), 1)] }) }),
  borcegos: Object.assign((A, c) => calzadoPuesto(A, c, {
    up: ["M-5.9,-16 L5.9,-16 L6.3,13 C6.7,17 6.7,20 6.5,22.6 L-11.9,23 C-16.1,23 -17.1,19 -13.9,16.4 C-9.7,13 -6.9,6 -5.9,-16 Z"],
    suela: ["M-17.2,21 L7,21 L7,26.6 L-13.2,26.8 C-16.2,26.8 -17.8,24 -17.2,21 Z"], suelaHex: "#16121A",
    det: [["M-5.2,-12 L-1.2,-10.6 M-5.4,-7 L-1.4,-5.6 M-5.8,-2 L-1.8,-0.6 M-6.4,3 L-2.4,4.4 M-7.6,8 L-3.6,9.4", "#B8B2BC", 0.8], ["M-5.9,-12.8 L5.9,-12.8", shade(c, 0.3), 0.8]] }), {
    perfil: c => ({ p: ["M10,31 L28,27 L30,4 L56,4 L58,30 L58,35 L11,36 C6,36 5,32 10,31 Z"],
      capas: [{ p: ["M5,34 L60,34 L60,40 L9,40 C6,40 5,37 5,34 Z"], c: "#16121A", d: [] }],
      d: [ln("M31,9 L37,11 M31,14 L37,16 M30.6,19 L36.6,21 M30,24 L36,26", "#B8B2BC", 1), ln("M30,8 L56,8", shade(c, 0.3), 0.9), ln("M14,31 C20,29 26,28 29,27", shade(c, 0.3), 0.8)] }) }),
  ojotas: Object.assign((A, c) => calzadoPuesto(A, c, {
    up: ["M-15,21.6 L6,21.4 C6.6,23.6 6,25.4 4,25.6 L-12,25.8 C-15.4,25.8 -16,23.6 -15,21.6 Z"],
    tiras: [["M-11,17.5 L-4.5,8 L4.8,13", shade(c, -0.2), 1.8]] }), {
    perfil: c => { const suela = "M20,4 C27,4 30,10 29.5,18 C29,26 27,32 27,40 C27,50 25,58 19,58 C13,58 11,50 11,40 C11,32 9,26 9,18 C9,10 13,4 20,4 Z", v = "M20,9 L13,26 M20,9 L27,26", otro = { x: 58, y: 0, flip: true };
      return { p: [suela, xf(suela, otro)], d: [tira(v, shade(c, -0.25), 2.2), tira(xf(v, otro), shade(c, -0.25), 2.2)] }; } }),
  mocasines: Object.assign((A, c) => calzadoPuesto(A, c, {
    up: ["M-5,6 C-7.5,11 -10,15 -12.6,17.2 C-15,19.4 -14.6,23.4 -11.2,23.6 L4.2,23.2 C6.2,22.4 6.2,18 5.8,12 L5.4,4.6 C1.6,7 -2,7.4 -5,6 Z"],
    suela: ["M-14.4,22.2 L6.2,22 L6.2,25 L-11.2,25.2 C-13.8,25.2 -14.8,24 -14.4,22.2 Z"],
    det: [["M-10,12.5 C-7.6,10 -4.4,9.6 -1.6,10.6", shade(c, 0.35), 0.9], ["M-8.4,14.4 L-3.6,13", shade(c, -0.35), 1.1]] }), {
    perfil: c => ({ p: ["M6,33 C6,26 12,22 20,20 C28,18.5 34,17 40,16 C48,15 58,16 62,21 L62,34 L9,36 C7,36 6,35 6,33 Z"],
      capas: [{ p: ["M5,34.5 L63,33.5 L63,38 L9,38.5 C6,38.5 5,36.5 5,34.5 Z"], c: shade(c, -0.35), d: [] }],
      d: [ln("M14,27 C20,24 28,23.5 34,25", shade(c, 0.35), 1), ln("M20,27.5 L31,26", shade(c, -0.35), 1.3)] }) }),
  sandalias: Object.assign((A, c) => calzadoPuesto(A, c, {
    up: ["M-10.6,24.6 C-6,24 -1,17.5 4.6,9.5 L5.6,10.6 C0,18.6 -5,25.6 -10,26.6 C-11.6,26.8 -12,25.2 -10.6,24.6 Z", "M3.4,9.4 L5.6,9.4 L5.1,28.6 L4,28.6 Z"],
    tiras: [["M-9.2,19.4 C-7.4,17.4 -4.6,17.4 -3.2,20", c, 2.4], ["M-5.2,1.6 C-1.6,0.2 2,0.2 5.2,1.6", c, 2.2], ["M-6,11.5 L3.4,4", c, 2.2], ["M-6,4 L3.6,11", c, 2]] }), { pie: "taco",
    perfil: c => ({ p: ["M4,36 C4,33 9,32 16,32 C28,31 40,26 50,18 L58,13 C62,11 64,14 63,18 L60,19 C52,24 44,32 30,36 L10,38.5 C6,38.5 4,37.5 4,36 Z", "M57,18 L62.5,18 L60,41 L58.6,41 Z"],
      d: [tira("M14,32 C16,26 22,25 26,30", c, 2), tira("M50,16 C51,10 56,8 59,11", c, 2), tira("M32,29 L44,20", c, 1.8)] }) }),
  botasAltas: Object.assign((A, c) => { const b = calzadoPuesto(A, c, {
      up: ["M-5.9,-8 L5.9,-8 L6.3,13 C6.7,17 6.7,20 6.5,22.6 L-11.9,23 C-16.1,23 -17.1,19 -13.9,16.4 C-9.7,13 -6.9,6 -5.9,-8 Z", "M1.6,21.6 L6.6,21.6 L6.3,27.2 L2.2,27.2 Z"],
      suela: ["M-16.8,21.6 L2,21.6 L2,24.6 L-13,24.8 C-15.6,24.8 -17.2,23.4 -16.8,21.6 Z"], suelaHex: "#1F1714" });
    LADOS.forEach(s => { b.p.push(limb(resample(A.piernas[s], 0.6, 0.99, 5), { extra: 4, capIni: "flat", capFin: "flat" }));
      const [a, q] = cruce(A.piernas[s], 0.63, 4); b.d.push(ln(curva([a, q]), shade(c, -0.35), 0.9));
      b.d.push(ln(curva(resample(A.piernas[s], 0.64, 0.97, 3).pts.map(p => [p[0] + (s === "l" ? -2 : 2), p[1]])), shade(c, 0.35), 1.1, 'opacity=".6"')); });
    return b; }, {
    perfil: c => ({ p: ["M8,34 C8,30 14,28 22,26 L34,23 L34,-24 L58,-24 L58,28 L58,35 L10,37 C8.5,37 8,36 8,34 Z", "M48,35 L58,35 L58,41 L49,41 Z"],
      capas: [{ p: ["M5,35 L48,35 L48,39 L9,39 C6,39 5,37 5,35 Z"], c: "#1F1714", d: [] }],
      d: [ln("M34,-19 L58,-19", shade(c, -0.35), 1), ln("M38,-14 L38,22", shade(c, 0.35), 1.2, 'opacity=".6"')] }) }),

  /* ---- abrigos ---- */
  blazer: (A, c) => { const Y = A.Y, hem = Y.hi + 16, pan = LADOS.map(s => panelPts(A, s, { hem, ease: 4.5, gap: 5 })), k = shade(c, -0.35);
    return { p: [...pan.map(x => shape(x.pts)), ...mangas(A, 0.97, 6)],
      d: [...pan.map((x, i) => { const g = i ? 1 : -1, q = x.quiebre, n = x.cuello, m = lp(q, n, 0.5); return fillD(shape([[...q, 1], [m[0] + g * 9, m[1], 1], [n[0] + g * 3, n[1] + 3, 1]]), shade(c, -0.06)); }),
        ...LADOS.map(s => { const g = s === "l" ? 1 : -1, y = Y.hi + 2, x = sideX(A, s, y) - g * 3; return ln(`M${pt([x + g * 1, y])} L${pt([x + g * 13, y + (s === "l" ? -1 : 1)])}`, k, 1); }),
        dot([cX(A, Y.bu + 14) - 4, Y.bu + 14], 1.8, k), ...LADOS.map(s => { const [a, b] = cruce(A.brazos[s], 0.9, 6); return ln(curva([a, b]), k, 0.8); }),
        ...pliegues(A, c, { codos: 1 })] }; },
  cuero: (A, c) => { const Y = A.Y, hem = Y.wa + 18, pan = LADOS.map(s => panelPts(A, s, { hem, ease: 3.5, gap: 4, quiebre: Y.bu + 2 })), cierre = "#B9B6BE";
    return { p: [...pan.map(x => shape(x.pts)), ...mangas(A, 0.97, 5)],
      d: [...pan.map((x, i) => { const g = i ? 1 : -1, q = x.quiebre, n = x.cuello, m = lp(q, n, 0.5); return fillD(shape([[...q, 1], [m[0] + g * 11, m[1] + 2, 1], [n[0] + g * 4, n[1] + 2, 1]]), shade(c, 0.12)); }),
        ...pan.map((x, i) => { const g = i ? 1 : -1; return ln(curva(Array.from({ length: 4 }, (_, j) => { const y = lerp(x.quiebre[1], hem, j / 3); return [cX(A, y) + g * 6, y]; })), cierre, 0.9, 'stroke-dasharray="1 1"'); }),
        ln(curva([ext(A, "l", hem - 5 - A.tilt * 0.8, 3), [cX(A, hem - 5) - 6, hem - 5]]), shade(c, 0.25), 0.9), ln(curva([[cX(A, hem - 5) + 6, hem - 5], ext(A, "r", hem - 5 + A.tilt * 0.8, 3)]), shade(c, 0.25), 0.9),
        ...LADOS.map(s => ln(curva(resample(A.brazos[s], 0.1, 0.9, 4).pts.map(p => [p[0] + (s === "l" ? -2.5 : 2.5), p[1]])), "#FFFFFF", 1.4, 'opacity=".18"')),
        ...pliegues(A, c, { codos: 1 })] }; },
  tapado: (A, c) => { const Y = A.Y, hem = Y.ro + 30, pan = LADOS.map(s => panelPts(A, s, { hem, ease: 5, gap: 4 })), k = shade(c, -0.3);
    return { p: [...pan.map(x => shape(x.pts)), ...mangas(A, 0.97, 7)],
      d: [...pan.map((x, i) => { const g = i ? 1 : -1, q = x.quiebre, n = x.cuello, m = lp(q, n, 0.5); return fillD(shape([[...q, 1], [m[0] + g * 10, m[1], 1], [n[0] + g * 3, n[1] + 3, 1]]), shade(c, -0.06)); }),
        fillD(shape([[...ext(A, "l", Y.wa - 3, 5.5), 1], [cX(A, Y.wa) - 4, Y.wa - 2.5, 1], [cX(A, Y.wa) - 4, Y.wa + 4.5, 1], [...ext(A, "l", Y.wa + 4, 5.5), 1]]), shade(c, -0.1), 0.9),
        fillD(shape([[cX(A, Y.wa) + 4, Y.wa - 2.5, 1], [...ext(A, "r", Y.wa - 3, 5.5), 1], [...ext(A, "r", Y.wa + 4, 5.5), 1], [cX(A, Y.wa) + 4, Y.wa + 4.5, 1]]), shade(c, -0.1), 0.9),
        ...LADOS.map(s => ln(curva([ext(A, s, Y.hi + 10, 1), ext(A, s, Y.ro + 26 + (s === "l" ? -A.tilt : A.tilt), 3)]), k, 0.8)), ...pliegues(A, c, { codos: 1 })] }; },
  puffer: (A, c) => { const Y = A.Y, hem = Y.hi + 6, k = shade(c, -0.3), nb = A.cuello.base; let q = "";
    for (let y = Y.ax + 4; y < hem - 4; y += 15) q += ln(curva([ext(A, "l", y, 8), [cX(A, y), y + 3], ext(A, "r", y, 8)]), k, 1);
    LADOS.forEach(s => [0.3, 0.55, 0.8].forEach(t => { const [a, b] = cruce(A.brazos[s], t, 11); q += ln(curva([a, lp(a, b, 0.5).map((v, i) => v + (i ? 2 : 0)), b]), k, 1); }));
    return { p: [shape(torsoPts(A, { hem, ease: 8, cuello: "alto" })), ...mangas(A, 0.96, u => 11 - u * 2), limb({ pts: [[nb[0], 72], [nb[0], nb[1] + 3]], w: [26, 28] }, { capIni: "flat", capFin: "flat" })],
      d: [q, ln(`M${pt([nb[0], 72])} L${pt([cX(A, hem), hem + 2])}`, shade(c, -0.45), 1.1)] }; },
  kimono: (A, c, it) => { const Y = A.Y, hem = Y.ro - 4, pan = LADOS.map(s => panelPts(A, s, { hem, ease: 6, gap: 14, gapFlat: 8, quiebre: Y.ax })), m = it.detalleHex || "#F7D9B8"; let flores = "";
    for (let y = 104, f = 0; y < hem; y += 16, f++) for (let x = 22 + (f % 2) * 10; x < 180; x += 20) flores += dot([x, y], 2.6, m) + dot([x + 3.2, y - 2], 1.2, shade(m, -0.2));
    return { p: [...pan.map(x => shape(x.pts)), ...LADOS.map(s => limb(resample(A.brazos[s], 0, 0.55, 5), { extra: u => 10 + u * 16, capFin: "flat" }))],
      d: [flores, ...pan.map((x, i) => { const g = i ? 1 : -1; return ln(curva([x.cuello, ...Array.from({ length: 5 }, (_, j) => { const y = lerp(Y.ax, hem, j / 4); return [cX(A, y) + g * 14, y]; })]), shade(c, -0.35), 2.4); })] }; },

  /* ---- bolsos ---- */
  clutch: Object.assign((A, c) => { const w = A.brazos.l.pts[4], x = w[0] - 1, y = w[1] + 13;
    return { p: [shape([[x - 14, y - 8, 1], [x + 14, y - 8, 1], [x + 14, y + 8, 1], [x - 14, y + 8, 1]])],
      d: [fillD(`M${pt([x - 14, y - 8])} L${pt([x + 14, y - 8])} L${pt([x, y + 2])} Z`, shade(c, -0.08), 0.8), dot([x, y + 1], 1.6, shade(c, 0.5)), ln(`M${pt([x - 11, y + 5.5])} L${pt([x + 11, y + 5.5])}`, "#FFFFFF", 1, 'opacity=".45"')] }; }, { opts: { sh: 0.7 } }),
  tote: Object.assign((A, c) => { const Y = A.Y, bx = sideX(A, "r", Y.wa + 40) + 3, t = Y.wa + 30, b = Y.wa + 82, s = lp(A.cuello.r, A.hombros.r, 0.55);
    const manijas = A.flat ? [limb({ pts: [[bx + 6, t + 1], [bx + 9, t - 14], [bx + 21, t - 14], [bx + 24, t + 1]], w: [2.6, 2.6, 2.6, 2.6] })]
      : [limb({ pts: [s, [bx + 5, t + 1]], w: [2.6, 2.6] }), limb({ pts: [[s[0] + 2, s[1]], [bx + 25, t + 1]], w: [2.6, 2.6] })];
    return { p: [shape([[bx, t, 1], [bx + 30, t, 1], [bx + 33, b, 1], [bx - 3, b, 1]]), ...manijas],
      d: [ln(`M${pt([bx + 1, t + 6])} L${pt([bx + 29, t + 6])}`, shade(c, -0.3), 0.7, 'stroke-dasharray="1.6 1.4"'), fillD(shape([[bx + 6, t + 16, 1], [bx + 24, t + 16, 1], [bx + 24.5, t + 32, 1], [bx + 5.5, t + 32, 1]]), shade(c, -0.06), 0.7)] }; }, { opts: { sh: 0.8 } }),
  cartera: Object.assign((A, c) => { const w = A.brazos.r.pts[4], x = w[0], y = w[1] + 12;
    return { p: [shape([[x - 13, y, 1], [x + 13, y, 1], [x + 14, y + 26, 1], [x - 14, y + 26, 1]]), limb({ pts: [[x - 7, y + 1], [x - 4, y - 9], [x + 4, y - 9], [x + 7, y + 1]], w: [2.4, 2.4, 2.4, 2.4] })],
      d: [fillD(shape([[x - 13, y, 1], [x + 13, y, 1], [x + 13.3, y + 10, 1], [x - 13.3, y + 10, 1]]), shade(c, -0.1), 0.8), dot([x, y + 10], 1.8, "#C9A45A"), ln(`M${pt([x - 11, y + 22])} L${pt([x + 11, y + 22])}`, shade(c, 0.3), 0.6, 'stroke-dasharray="1.4 1.2"')] }; }, { opts: { sh: 0.8 } }),
  rinonera: Object.assign((A, c) => { const Y = A.Y, cx = cX(A, Y.wa + 14) + 4, y = Y.wa + 15;
    return { p: [limb({ pts: [ext(A, "l", Y.wa + 10, 2.5), [cX(A, Y.wa + 12), Y.wa + 13], ext(A, "r", Y.wa + 6, 2.5)], w: [3.2, 3.2, 3.2] }, { capIni: "flat", capFin: "flat" }),
      shape([[cx - 17, y - 6], [cx, y - 9.5], [cx + 17, y - 6], [cx + 16, y + 6], [cx, y + 9], [cx - 16, y + 6]])],
      d: [ln(curva([[cx - 14, y - 3], [cx, y - 5.5], [cx + 14, y - 3]]), shade(c, 0.45), 0.9), dot([cx + 10, y - 3.6], 1.1, "#C9C6CE")] }; }, { opts: { sh: 0.7 } }),

  /* ---- joyería y gafas ---- */
  perlas: Object.assign((A, c) => ({ p: LADOS.map(s => circ(A.orejas[s][0], A.orejas[s][1] + 8, 2.8)), d: LADOS.map(s => dot([A.orejas[s][0] - 0.8, A.orejas[s][1] + 7.2], 0.8, "#FFFFFF")) }), { opts: { sh: 0.25, ancho: 1.4 } }),
  argollas: Object.assign((A, c) => ({ p: LADOS.map(s => "!" + circ(A.orejas[s][0], A.orejas[s][1] + 9, 5) + " " + circ(A.orejas[s][0], A.orejas[s][1] + 9, 3.7)), d: [] }), { opts: { sh: 0.2, ancho: 1.2 } }),
  lentes: Object.assign((A, c) => { const lente = s => { const [x, y] = A.ojos[s]; return shape([[x - 6.8, y - 4.6], [x + 6.2, y - 4.8], [x + 6, y + 1.5], [x + 1, y + 5], [x - 5.5, y + 3.5]].map(p => (s === "l" ? p : [2 * x - p[0], p[1]]))); };
    return { p: [lente("l"), lente("r"), limb({ pts: [[A.ojos.l[0] + 6, A.ojos.l[1] - 2.6], [A.ojos.r[0] - 6, A.ojos.r[1] - 2.6]], w: [1.6, 1.6] })],
      d: LADOS.map(s => ln(`M${pt([A.ojos[s][0] - 3.5, A.ojos[s][1] - 2.4])} L${pt([A.ojos[s][0] - 1, A.ojos[s][1] - 2.8])}`, "#FFFFFF", 0.9, 'opacity=".6"')) }; }, { opts: { sh: 0.3, ancho: 1.4 } }),
  collar: Object.assign((A, c) => { const nb = A.cuello.base, nl = A.cuello.l, nr = A.cuello.r, p = [[nl[0] - 1, nl[1] + 1.5], [nb[0] - 6, nb[1] + 10], [nb[0], nb[1] + 13], [nb[0] + 6, nb[1] + 10], [nr[0] + 1, nr[1] + 1.5]];
    return { p: [limb({ pts: p, w: p.map(() => 1.5) }, { capIni: "flat", capFin: "flat" }), circ(nb[0], nb[1] + 16.5, 2.7)], d: [ln(curva(p), shade(c, 0.45), 0.6, 'stroke-dasharray=".8 1.6"')] }; }, { opts: { sh: 0.3, ancho: 1.4 } }),
};

/* ---------- PRENDAS (Bloque A): formas nuevas ---------- */
const elip = (x, y, rx, ry) => { const kx = rx * 0.5523, ky = ry * 0.5523; return `M${pt([x - rx, y])} C${pt([x - rx, y - ky])} ${pt([x - kx, y - ry])} ${pt([x, y - ry])} C${pt([x + kx, y - ry])} ${pt([x + rx, y - ky])} ${pt([x + rx, y])} C${pt([x + rx, y + ky])} ${pt([x + kx, y + ry])} ${pt([x, y + ry])} C${pt([x - kx, y + ry])} ${pt([x - rx, y + ky])} ${pt([x - rx, y])} Z`; };
const cinturaL = (A, y, e) => curva([ext(A, "l", y - A.tilt * 0.3, e), [cX(A, y), y + 0.5], ext(A, "r", y + A.tilt * 0.3, e)]);
const banda = (A, y0, y1, e) => shape([[...ext(A, "l", y0 - A.tilt * 0.3, e), 1], [...ext(A, "r", y0 + A.tilt * 0.3, e), 1], [...ext(A, "r", y1 + A.tilt * 0.3, e), 1], [...ext(A, "l", y1 - A.tilt * 0.3, e), 1]]);
const HILO = "#D9A44A", DASH = 'stroke-dasharray="1.8 1.4"';
const escoteRedondo = (A, k) => ln(curva([[A.cuello.r[0] + 1.5, A.cuello.r[1] + 2.2], [A.cuello.base[0], A.cuello.base[1] + 7], [A.cuello.l[0] - 1.5, A.cuello.l[1] + 2.2]]), k, 0.9);
const solapas = (A, pan, c, ancho = 9) => pan.map((x, i) => { const g = i ? 1 : -1, q = x.quiebre, n = x.cuello, m = lp(q, n, 0.5); return fillD(shape([[...q, 1], [m[0] + g * ancho, m[1], 1], [n[0] + g * 3, n[1] + 3, 1]]), shade(c, -0.06)); });

Object.assign(DIBUJOS, {
  /* ---- tops ---- */
  crop: (A, c) => { const hem = A.Y.bu + 18, k = shade(c, -0.28);
    return { p: [shape(torsoPts(A, { hem, ease: 2.5, hemCurva: 1 })), ...mangas(A, 0.22, 4)],
      d: [escoteRedondo(A, k), ln(curva([ext(A, "l", hem - 3.5 - A.tilt * 0.4, 1), [cX(A, hem), hem - 2.5], ext(A, "r", hem - 3.5 + A.tilt * 0.4, 1)]), k, 0.7, 'stroke-dasharray="1.6 1.6"')] }; },
  camisola: (A, c) => { const Y = A.Y, yT = Y.bu - 10, cx = cX(A, yT);
    const tiras = LADOS.map(s => limb({ pts: [[A.busto[s][0] + (s === "l" ? 5 : -5), yT - 1], lp(A.cuello[s], A.hombros[s], 0.42)], w: [1.6, 1.6] }));
    return { p: [shape(torsoPts(A, { hem: Y.wa + 14, ease: 2.5, cuello: "tirantes", alto: 10 })), ...tiras],
      d: [ln(curva([[A.busto.l[0] + 4, yT + 1.5], [cx - 9, yT], [cx, yT + 5], [cx + 9, yT], [A.busto.r[0] - 4, yT + 1.5]]), shade(c, -0.3), 2.6, 'stroke-dasharray=".1 2.4"'),
        ln(curva([ext(A, "l", Y.bu, -6), ext(A, "l", Y.wa, -7), ext(A, "l", Y.wa + 10, -6)]), shade(c, 0.6), 1.6, 'opacity=".55"'), ...pliegues(A, c, { cintura: 1 })] }; },
  cardigan: (A, c) => { const Y = A.Y, hem = Y.wa + 10, pan = LADOS.map(s => panelPts(A, s, { hem, ease: 3.5, gap: 2.5, quiebre: Y.bu + 8 })), k = shade(c, -0.3); let rib = "";
    for (let x = 36; x <= 164; x += 2.6) rib += ln(`M${f1(x)},${f1(hem - 7)} L${f1(x)},${f1(hem + 5)}`, k, 0.55);
    return { p: [...pan.map(x => shape(x.pts)), ...mangas(A, 0.9, u => 5 + u * 2), ...punos(A, 0.88, 0.98, 3.5)],
      d: [rib, ...pan.map((x, i) => { const g = i ? 1 : -1; return ln(curva([x.cuello, x.quiebre, ...[1, 2, 3].map(j => { const y = lerp(x.quiebre[1], hem, j / 3); return [cX(A, y) + g * 2.5, y]; })]), k, 2); }),
        ...[0.15, 0.45, 0.75].map(u => { const y = lerp(Y.bu + 8, hem - 4, u); return dot([cX(A, y) - 2.5, y], 1.5, shade(c, 0.45)); }), ...pliegues(A, c, { codos: 1 })] }; },
  halter: (A, c) => { const Y = A.Y, yT = Y.bu - 9, nb = A.cuello.base;
    const tiras = LADOS.map(s => limb({ pts: [[A.busto[s][0] + (s === "l" ? 6 : -6), yT], [nb[0] + (s === "l" ? -5 : 5), nb[1] - 10]], w: [3, 3] }));
    return { p: [shape(torsoPts(A, { hem: Y.wa + 14, ease: 1.5, cuello: "tirantes", alto: 9 })), ...tiras],
      d: [...[-6, -2, 2, 6].map(dx => ln(curva([[cX(A, yT) + dx * 1.4, yT + 3], [cX(A, Y.bu + 4) + dx, Y.bu + 4], [cX(A, Y.bu + 14) + dx * 0.6, Y.bu + 14]]), shade(c, -0.25), 0.7)), ...pliegues(A, c, { cintura: 1 })] }; },
  chaleco: (A, c) => { const Y = A.Y, hem = Y.wa + 16, k = shade(c, -0.35);
    return { p: [shape(torsoPts(A, { hem, ease: 2.5, cuello: "v", sinMangas: 1, hemPico: 1, hemCurva: 5 }))],
      d: [ln(curva([[cX(A, Y.bu - 4), Y.bu - 4], [cX(A, hem) + 0.5, hem + 5]]), k, 0.9), ...[0.2, 0.45, 0.7].map(u => { const y = lerp(Y.bu + 2, hem - 4, u); return dot([cX(A, y) + 2, y], 1.4, k); }),
        ...LADOS.map(s => { const g = s === "l" ? 1 : -1, y = Y.wa + 6, x = sideX(A, s, y) + g * 4; return ln(`M${pt([x, y])} L${pt([x + g * 10, y - 1])}`, k, 1.1); })] }; },

  /* ---- bottoms ---- */
  wideLeg: (A, c) => { const yw = A.Y.wa + 2;
    return { p: pantalonP(A, { ease: 2, t: 0.99, flare: u => 3 + u * 15 }),
      d: [ln(cinturaL(A, yw + 4.5, 0.5), HILO, 0.7, DASH), ln(cinturaL(A, yw + 4, 0.5), shade(c, -0.3), 0.8), ln(curva([[cX(A, yw) + 2, yw + 5], [cX(A, yw + 20) + 3, yw + 22], [cX(A, yw + 28) - 0.5, yw + 30]]), HILO, 0.8),
        ...LADOS.map(s => { const g = s === "l" ? 1 : -1, x = sideX(A, s, yw + 5); return ln(curva([[x + g, yw + 5], [x + g * 7, yw + 9], [x + g * 11, yw + 5]]), HILO, 0.8); }),
        entrepierna(A, c, 0.99), ...LADOS.map(s => ln(curva(resample(A.piernas[s], 0.15, 0.99, 5).pts.map((p, i) => [p[0] + (s === "l" ? -1 : 1) * (4 + i * 1.6), p[1]])), shade(c, 0.2), 0.8))] }; },
  lapiz: (A, c) => { const Y = A.Y, hem = Y.ro + 6;
    return { p: [shape(faldaPts(A, { hem, flare: -4, ease: 1.5 }))],
      d: [ln(cinturaL(A, Y.wa + 5, 1.5), shade(c, -0.3), 0.9), ln(`M${pt([cX(A, hem) + 3, hem - 18])} L${pt([cX(A, hem) + 3, hem + 2])}`, shade(c, -0.45), 1.1),
        ...LADOS.map(s => ln(curva([ext(A, s, Y.wa + 6, -6), ext(A, s, Y.hi, -9)]), shade(c, -0.2), 0.7))] }; },
  faldaLarga: (A, c, it) => { const Y = A.Y, hem = 404, fl = 26, ea = y => 2 + fl * Math.pow((y - Y.wa) / (hem - Y.wa), 1.5), tiers = [0.36, 0.68].map(u => lerp(Y.wa, hem, u));
    return { p: [shape(faldaPts(A, { hem, flare: fl, ease: 2 }))],
      d: [...(it.detalleHex ? [lunaresP(it.detalleHex, 1.3)] : []),
        ...tiers.map(y => ln(curva([ext(A, "l", y - A.tilt * 0.5, ea(y)), [cX(A, y), y + 1.5], ext(A, "r", y + A.tilt * 0.5, ea(y))]), shade(c, -0.3), 1)),
        ...tiers.flatMap(y => { const xl = sideX(A, "l", y) - ea(y), xr = sideX(A, "r", y) + ea(y); return Array.from({ length: 8 }, (_, i) => { const x = lerp(xl, xr, (i + 1) / 9); return ln(`M${pt([x, y + 2])} L${pt([x + (i - 3.5) * 0.6, y + 9])}`, shade(c, -0.18), 0.6); }); }),
        ln(cinturaL(A, Y.wa + 4, 2), shade(c, -0.3), 0.9)] }; },
  jogger: (A, c) => { const yw = A.Y.wa, k = shade(c, -0.3), cx = cX(A, yw + 7);
    return { p: [...pantalonP(A, { ease: 3, t: 0.92, flare: u => -u * 5, tiro: 0 }), ...LADOS.map(s => limb(resample(A.piernas[s], 0.9, 0.97, 2), { extra: 2.5, capIni: "flat", capFin: "flat" }))],
      d: [fillD(banda(A, yw, yw + 7, 3.2), shade(c, 0.08), 0.9), ln(curva([[cx - 2, yw + 7], [cx - 4, yw + 16]]), "#F4F1EC", 0.9), ln(curva([[cx + 2, yw + 7], [cx + 3.5, yw + 15]]), "#F4F1EC", 0.9),
        ...LADOS.map(s => { const [a, b] = cruce(A.piernas[s], 0.9, 2.5); return ln(curva([a, b]), k, 0.9); }), ...pliegues(A, c, { rodillas: 1 })] }; },
  cargo: (A, c) => { const yw = A.Y.wa + 2, k = shade(c, -0.32);
    const bolsillo = s => { const b = bordes(resample(A.piernas[s], 0.32, 0.5, 1), () => 7), o = s === "l" ? b.L : b.R, n = s === "l" ? b.R : b.L;
      const p0 = lp(o[0], n[0], 0.12), p1 = lp(o[0], n[0], 0.6), p2 = lp(o[1], n[1], 0.6), p3 = lp(o[1], n[1], 0.12);
      return fillD(shape([[...p0, 1], [...p1, 1], [...p2, 1], [...p3, 1]]), shade(c, 0.06), 0.9) + ln(`M${pt(lp(p0, p3, 0.25))} L${pt(lp(p1, p2, 0.25))}`, k, 0.9); };
    return { p: pantalonP(A, { ease: 3.5, t: 0.97, flare: () => 2 }),
      d: [ln(cinturaL(A, yw + 4, 0.5), k, 0.9), bolsillo("l"), bolsillo("r"), ...pliegues(A, c, { rodillas: 1 }), ...LADOS.map(s => { const [a, b] = cruce(A.piernas[s], 0.94, 9); return ln(curva([a, b]), k, 0.8); })] }; },
  bermuda: (A, c) => { const yw = A.Y.wa + 2, k = shade(c, -0.3);
    return { p: pantalonP(A, { ease: 3, t: 0.4, flare: u => u * 6 }),
      d: [ln(cinturaL(A, yw + 5, 0.6), k, 0.9), ...LADOS.map(s => ln(curva(resample(A.piernas[s], 0.1, 0.39, 3).pts), shade(c, 0.2), 0.9)),
        ...LADOS.map(s => { const [a, b] = cruce(A.piernas[s], 0.36, 9); return ln(curva([a, b]), k, 0.8); }), entrepierna(A, c, 0.4)] }; },

  /* ---- vestidos / enteritos ---- */
  coctel: (A, c) => { const Y = A.Y, k = shade(c, -0.3), cx = cX(A, Y.wa);
    return { p: [shape(torsoPts(A, { hem: Y.wa + 3, ease: 1, cuello: "recto", alto: 8 })), shape(faldaPts(A, { hem: Y.cr + 32, flare: 24, ease: 1.5, tiro: 2 }))],
      d: [ln(cinturaL(A, Y.wa + 3, 1), k, 1.6), fillD(shape([[cx + 5, Y.wa + 3], [cx + 14, Y.wa - 3], [cx + 13, Y.wa + 9]]), c, 0.8), fillD(shape([[cx + 5, Y.wa + 3], [cx - 4, Y.wa - 3], [cx - 3, Y.wa + 9]]), c, 0.8), dot([cx + 5, Y.wa + 3], 2, shade(c, -0.15)),
        ...[-16, -6, 4, 14].map(dx => ln(curva([[cX(A, Y.wa + 8) + dx * 0.5, Y.wa + 8], [cX(A, Y.cr + 28) + dx * 1.4, Y.cr + 28]]), dx < 0 ? shade(c, 0.45) : k, 0.8, 'opacity=".7"'))] }; },
  wrap: (A, c, it) => { const Y = A.Y, nl = A.cuello.l, k = shade(c, -0.32), xs = sideX(A, "l", Y.wa);
    return { p: [shape(torsoPts(A, { hem: Y.wa + 4, ease: 2, cuello: "v" })), ...mangas(A, 0.55, 5), shape(faldaPts(A, { hem: Y.ro + 14, flare: 15 }))],
      d: [...(it.detalleHex ? [lunaresP(it.detalleHex, 1.4)] : []), ln(curva([[nl[0] - 1, nl[1]], [cX(A, Y.bu) + 3, Y.bu - 2], [sideX(A, "r", Y.wa) - 2, Y.wa + 2]]), k, 1.1),
        ln(curva([[sideX(A, "r", Y.wa) - 2, Y.wa + 3], [cX(A, Y.hi) + 16, Y.hi + 6], [cX(A, Y.ro + 12) + 22, Y.ro + 14]]), k, 0.9),
        ln(curva([[xs + 3, Y.wa + 2], [xs + 1, Y.wa + 14], [xs + 3, Y.wa + 24]]), shade(c, -0.2), 2.2), ln(curva([[xs + 3, Y.wa + 2], [xs + 6, Y.wa + 16], [xs + 9, Y.wa + 22]]), shade(c, -0.2), 2.2),
        ...LADOS.map(s => { const [a, b] = cruce(A.brazos[s], 0.52, 5); return ln(curva([a, b]), k, 0.8); })] }; },
  tejidoLargo: (A, c) => { const Y = A.Y, nb = A.cuello.base, k = shade(c, -0.2); let rib = "";
    for (let x = 30; x <= 170; x += 3.4) rib += ln(`M${f1(x)},60 L${f1(x)},420`, k, 0.55);
    return { p: [shape(torsoPts(A, { hem: Y.wa + 4, ease: 2, cuello: "alto" })), ...mangas(A, 0.97, 4), limb({ pts: [[A.cuello.top[0], 64], [nb[0], nb[1] + 1]], w: [17, 18.5] }, { capIni: "flat", capFin: "flat" }), shape(faldaPts(A, { hem: 404, flare: 12, ease: 2 }))],
      d: [rib, ...pliegues(A, c, { codos: 1 })] }; },
  mono: (A, c) => { const Y = A.Y;
    return { p: [shape(torsoPts(A, { hem: Y.wa + 4, ease: 2, cuello: "v", sinMangas: 1 })), ...pantalonP(A, { ease: 3, t: 0.985, flare: u => 2 + u * 8, tiro: 0 })],
      d: [fillD(banda(A, Y.wa - 2.5, Y.wa + 4, 2.5), shade(c, -0.2), 0.8), dot([cX(A, Y.wa) + 1, Y.wa + 0.8], 2.2, "#C9A45A"),
        ...LADOS.map(s => ln(curva(resample(A.piernas[s], 0.12, 0.98, 5).pts), shade(c, 0.2), 0.9)), entrepierna(A, c, 0.985)] }; },
  vCamiseta: (A, c, it) => { const Y = A.Y;
    return { p: [shape(torsoPts(A, { hem: Y.wa + 4, ease: 4 })), ...mangas(A, 0.27, 5.5), shape(faldaPts(A, { hem: Y.cr + 28, flare: 5, ease: 4 }))],
      d: [...(it.detalleHex ? [Y.bu + 4, Y.bu + 11, Y.cr + 6, Y.cr + 13].map(y => ln(`M20,${f1(y)} L180,${f1(y)}`, it.detalleHex, 3)) : []), escoteRedondo(A, shade(c, -0.28)), ...pliegues(A, c, { cintura: 1, dy: 4 })] }; },

  /* ---- abrigos ---- */
  trench: (A, c) => { const Y = A.Y, hem = Y.ro + 22, pan = LADOS.map(s => panelPts(A, s, { hem, ease: 5, gap: 3, quiebre: Y.bu + 8 })), k = shade(c, -0.35), cx = cX(A, Y.wa);
    return { p: [...pan.map(x => shape(x.pts)), ...mangas(A, 0.97, 7)],
      d: [...solapas(A, pan, c, 13), ...[Y.bu + 14, Y.bu + 28, Y.wa + 16].flatMap(y => [dot([cX(A, y) - 7, y], 1.5, k), dot([cX(A, y) + 7, y], 1.5, k)]),
        fillD(banda(A, Y.wa - 3, Y.wa + 4, 5.5), shade(c, -0.08), 0.9), fillD(shape([[cx - 6, Y.wa - 4.5, 1], [cx + 4, Y.wa - 4.5, 1], [cx + 4, Y.wa + 5.5, 1], [cx - 6, Y.wa + 5.5, 1]]), "none", 1.2),
        ...LADOS.map(s => { const [a, b] = cruce(A.brazos[s], 0.85, 7); return ln(curva([a, b]), k, 2.2); }),
        ...LADOS.map(s => ln(curva([lp(A.cuello[s], A.hombros[s], 0.35), [A.hombros[s][0] + (s === "l" ? 2 : -2), A.hombros[s][1] + 1]]), k, 1.6)), ...pliegues(A, c, { codos: 1 })] }; },
  chalecoInflable: (A, c) => { const Y = A.Y, hem = Y.hi + 2, k = shade(c, -0.3), nb = A.cuello.base; let q = "";
    for (let y = Y.ax + 2; y < hem - 4; y += 14) q += ln(curva([ext(A, "l", y, 7), [cX(A, y), y + 3], ext(A, "r", y, 7)]), k, 1);
    return { p: [shape(torsoPts(A, { hem, ease: 7, cuello: "alto", sinMangas: 1 })), limb({ pts: [[nb[0], 73], [nb[0], nb[1] + 3]], w: [25, 27] }, { capIni: "flat", capFin: "flat" })],
      d: [q, ln(`M${pt([nb[0], 73])} L${pt([cX(A, hem), hem + 2])}`, shade(c, -0.45), 1.1)] }; },
  camperaJean: (A, c) => { const Y = A.Y, hem = Y.wa + 14, pan = LADOS.map(s => panelPts(A, s, { hem, ease: 4, gap: 4, quiebre: Y.bu - 4 }));
    return { p: [...pan.map(x => shape(x.pts)), ...mangas(A, 0.9, 5), ...punos(A, 0.88, 0.98, 6)],
      d: [...solapas(A, pan, c, 8), ln(curva([ext(A, "l", Y.ax + 4, 4), [cX(A, Y.ax + 6), Y.ax + 8], ext(A, "r", Y.ax + 4, 4)]), HILO, 0.8, DASH),
        ...LADOS.map(s => { const x = lerp(sideX(A, s, Y.bu + 4), cX(A, Y.bu + 4), 0.45), y = Y.bu + 4; return fillD(shape([[x - 6, y, 1], [x + 6, y, 1], [x + 6, y + 5, 1], [x, y + 7.5, 1], [x - 6, y + 5, 1]]), shade(c, 0.05), 0.8) + dot([x, y + 4.5], 1, "#C9A45A"); }),
        ln(curva([ext(A, "l", hem - 6 - A.tilt * 0.8, 4), [cX(A, hem - 6), hem - 5], ext(A, "r", hem - 6 + A.tilt * 0.8, 4)]), HILO, 0.8, DASH),
        ...[0.2, 0.5, 0.8].map(u => { const y = lerp(Y.bu, hem - 4, u); return dot([cX(A, y) - 4, y], 1.3, "#C9A45A"); }), ...pliegues(A, c, { codos: 1 })] }; },
  poncho: (A, c, it) => { const Y = A.Y, nl = A.cuello.l, nr = A.cuello.r, nb = A.cuello.base, wl = A.brazos.l.pts[3], wr = A.brazos.r.pts[3], hy = Y.hi + 14, m = it.detalleHex || "#F2E6D0";
    const iz = [wl[0] - 9, hy - 6], de = [wr[0] + 9, hy - 6], pu = [cX(A, hy), hy + 12];
    const pts = [[nl[0] - 1, nl[1] - 1], [lp(nl, A.hombros.l, 0.6)[0], A.hombros.l[1] - 2], [A.hombros.l[0] - 9, A.hombros.l[1] + 8], [...iz, 1], [...pu, 1], [...de, 1], [A.hombros.r[0] + 9, A.hombros.r[1] + 8], [lp(nr, A.hombros.r, 0.6)[0], A.hombros.r[1] - 2], [nr[0] + 1, nr[1] - 1], [nb[0], nb[1] + 5]];
    let guarda = ""; [Y.bu + 6, Y.wa + 12].forEach(y => { guarda += ln(`M10,${f1(y)} L190,${f1(y)}`, m, 4) + ln(Array.from({ length: 31 }, (_, i) => `${i ? "L" : "M"}${10 + i * 6},${f1(y + (i % 2 ? 5 : 9))}`).join(" "), shade(c, -0.35), 1.2); });
    let fleco = ""; for (let i = 0; i <= 18; i++) { const a = i / 18, p = a < 0.5 ? lp(iz, pu, a * 2) : lp(pu, de, (a - 0.5) * 2); fleco += ln(`M${pt(p)} L${pt([p[0], p[1] + 7])}`, shade(c, -0.15), 1.2); }
    return { p: [shape(pts)], d: [guarda, ln(curva([[nl[0] - 1, nl[1]], [nb[0], nb[1] + 6], [nr[0] + 1, nr[1]]]), shade(c, -0.35), 1.6)], fuera: fleco }; },

  /* ---- calzado ---- */
  chatitas: Object.assign((A, c) => calzadoPuesto(A, c, {
    up: ["M-4.8,8 C-7.5,12 -10,15.5 -12.6,17.4 C-15,19.4 -14.6,23.4 -11.2,23.6 L4.2,23.2 C6.2,22.4 6.2,18 5.8,13 L5.4,7 C1.6,9 -2,9.4 -4.8,8 Z"],
    suela: ["M-14,22.6 L6,22.4 L6,24.4 L-11.2,24.6 C-13.6,24.6 -14.4,23.8 -14,22.6 Z"],
    det: [["M-10.6,13.4 L-8,11.8 L-7.6,14.6 Z M-7.6,13.2 L-5,12 L-5.6,14.8 Z", shade(c, -0.4), 0.9]] }), {
    perfil: c => ({ p: ["M6,33 C6,28 12,27 20,26.5 C30,26 38,25 44,22 C50,20 58,21 62,25 L62,34 L9,35.5 C7,35.5 6,34.8 6,33 Z"],
      capas: [{ p: ["M5,34 L63,33.4 L63,36.4 L9,37 C6,37 5,35.6 5,34 Z"], c: shade(c, -0.35), d: [] }],
      d: [ln("M13,27.4 C18,24.6 24,24 28,25", shade(c, -0.35), 1), dot([18, 26.2], 1.8, shade(c, -0.35))] }) }),
  mules: Object.assign((A, c) => calzadoPuesto(A, c, {
    up: ["M-6,12.6 C-7.6,17 -9.4,21 -10,23 C-11,25.6 -9,26.6 -6.6,26 C-4,23 -1.4,18 1.4,14 C-1,13 -3.6,12.4 -6,12.6 Z", "M2.4,12 L5.6,12 L5.4,28.6 L2.8,28.6 Z"],
    det: [["M-8.2,19.4 C-6,17.4 -3,16.6 -0.6,17.4", shade(c, -0.35), 0.8]] }), { pie: "taco",
    perfil: c => ({ p: ["M4,35 C4,31.5 10,30 18,29 C26,28 32,26 36,22 L40,24 C36,30 26,36 10,38 C6,38 4,37 4,35 Z", "M52,18 L60,18 L59,41 L54,41 Z"],
      capas: [{ p: ["M36,22 C42,19 50,16 60,17 L60,19.6 C52,19.6 44,22 40,24.4 Z"], c: shade(c, -0.3), d: [] }], d: [] }) }),
  botineta: Object.assign((A, c) => calzadoPuesto(A, c, {
    up: ["M-5.9,-12 L5.9,-12 L5.8,9 C3,14 -1,20 -4.6,24.6 C-6.6,26.6 -9.6,26.4 -10,24 C-10.2,21 -8,15 -6,8 Z", "M2,9 L5.8,9 L5.6,28.6 L2.6,28.6 Z"],
    det: [["M-5.9,-8 L5.9,-8", shade(c, 0.3), 0.8], ["M5.1,-10 L4.8,6", shade(c, 0.35), 0.8]] }), { pie: "taco",
    perfil: c => ({ p: ["M4,35 C4,31.5 10,30 18,29 C28,27.5 36,24 40,18 L40,2 L60,2 L61,19 L58,22 L58,41 L50,41 L50,30 C40,34 26,37 10,38 C6,38 4,37 4,35 Z"],
      d: [ln("M40,7 L60,7", shade(c, 0.3), 1), ln("M57,4 L57,18", shade(c, 0.35), 1)] }) }),
  plataformas: Object.assign((A, c, it) => { const t = it.detalleHex || "#F1E6D2"; return calzadoPuesto(A, c, {
    up: ["M-11.6,24 C-6,23 0,16 5,9 L6.2,9 L6.2,30 L-11,30 C-12.8,30 -13,24.6 -11.6,24 Z"],
    tiras: [["M-8.6,19 C-6.6,16.8 -3.6,16.6 -2,19.6", t, 2.4], ["M-5,1.5 C-1.6,0.2 2,0.2 5,1.5", t, 2.2], ["M-5.6,10.6 L3.6,4.6", t, 2.2]] }); }, { pie: "taco",
    perfil: (c, it) => ({ p: ["M4,36 C4,33 9,32 16,31.6 C28,31 40,26 52,18 L62,14 L62,42 L8,42 C5,42 4,40 4,36 Z"],
      d: [ln("M8,39 L62,39", shade(c, -0.25), 0.8, 'stroke-dasharray="1 2"')], fuera: tira("M14,32 C16,26 22,25 26,30", it.detalleHex || "#F1E6D2", 2.2) + tira("M50,17 C51,10 56,8 60,11", it.detalleHex || "#F1E6D2", 2.2) }) }),
  sandaliasBajas: Object.assign((A, c) => calzadoPuesto(A, c, {
    up: ["M-15,21.8 L6,21.6 C6.6,23.4 6,25 4,25.2 L-12,25.4 C-15.4,25.4 -16,23.6 -15,21.8 Z"],
    tiras: [["M-12.4,17.8 C-10,15.8 -7,15.4 -5,17", c, 2.2], ["M-7,11.4 C-4,9.6 0,9.6 3,11.6", c, 2.2], ["M-4.8,1.4 C-1.6,0 2,0 5,1.4", c, 1.8], ["M4.6,1.4 L5,21", c, 1.6]] }), {
    perfil: c => ({ p: ["M4,34 C4,31 8,30 14,30 L58,30 C62,30 64,32 64,34 C64,37 62,38 58,38 L10,38 C6,38 4,37 4,34 Z"],
      d: [], fuera: tira("M14,31 C16,25 22,24 26,30", c, 2.2) + tira("M30,30 C32,23 40,22 44,30", c, 2.2) + tira("M50,30 C50,22 56,18 60,20 L61,30", c, 2) }) }),
  running: Object.assign((A, c, it) => { const t = it.detalleHex || "#F4F2EE"; return calzadoPuesto(A, c, {
    up: ["M-5.6,-3 L5.6,-3 C6.3,4 6.5,10 6.5,16 L6.5,21 L-11.6,21.6 C-15.8,21.6 -16.6,17.6 -13.6,15.2 C-9.2,11.6 -6.6,6 -5.6,-3 Z"],
    suela: ["M-16.8,19.6 L7,19.6 L7,26.4 L-12.6,26.6 C-16,26.6 -17.4,23 -16.8,19.6 Z"], suelaHex: "#F4F2EE",
    det: [["M-5.6,3 L-1.4,1.8 M-6.8,7 L-2.6,5.8 M-8.4,11 L-4.2,9.8", "#F4F2EE", 0.9], ["M-13,16.4 C-8,13 -2,10.6 4.6,10", t, 1.8]] }); }, {
    perfil: (c, it) => ({ p: ["M8,31 C8,26 14,24 22,22 L34,16 C38,14 44,12 50,12 L58,13 C61,17 62,24 62,31 L10,33 C8.5,33 8,32 8,31 Z"],
      capas: [{ p: ["M5,31 L63,31 L63,39 L10,39 C6.5,39 5,35 5,31 Z"], c: "#F4F2EE", d: [ln("M6,35 L62,35", it.detalleHex || "#C9C6CE", 1.6)] }],
      d: [ln("M31,18 L35,22 M36,15.5 L40,19.5 M41,13.6 L45,17.6", "#F4F2EE", 1.1), ln("M14,29 C26,24 38,21 54,22", it.detalleHex || "#F4F2EE", 2.4)] }) }),

  /* ---- bolsos ---- */
  bandolera: Object.assign((A, c) => { const Y = A.Y, bx = sideX(A, "r", Y.wa + 34) + 1, by = Y.wa + 26;
    const tiraB = A.flat ? limb({ pts: [[bx + 1, by + 1], [bx + 4, by - 16], [bx + 15, by - 16], [bx + 18, by + 1]], w: [2, 2, 2, 2] }) : limb({ pts: [lp(A.cuello.l, A.hombros.l, 0.5), [cX(A, Y.bu + 12), Y.bu + 14], [bx + 1, by + 1]], w: [2.2, 2.2, 2.2] });
    return { p: [shape([[bx - 2, by, 1], [bx + 20, by, 1], [bx + 20, by + 16], [bx + 9, by + 18], [bx - 2, by + 16]]), tiraB],
      d: [fillD(shape([[bx - 2, by, 1], [bx + 20, by, 1], [bx + 20, by + 9, 1], [bx + 9, by + 11], [bx - 2, by + 9, 1]]), shade(c, -0.08), 0.8), dot([bx + 9, by + 9.5], 1.4, "#C9A45A")] }; }, { opts: { sh: 0.7 } }),
  mochila: Object.assign((A, c) => { const Y = A.Y;
    if (A.flat) { const x = 100, y = 200;
      return { p: [shape([[x - 18, y - 22], [x, y - 28], [x + 18, y - 22], [x + 20, y + 22, 1], [x - 20, y + 22, 1]]), limb({ pts: [[x - 6, y - 26], [x, y - 36], [x + 6, y - 26]], w: [2.4, 2.4, 2.4] })],
        d: [fillD(shape([[x - 12, y + 2, 1], [x + 12, y + 2, 1], [x + 12, y + 18, 1], [x - 12, y + 18, 1]]), shade(c, -0.06), 0.8), ln(`M${x - 12},${y + 6} L${x + 12},${y + 6}`, shade(c, 0.4), 0.8)],
        fuera: [-1, 1].map(g => ln(curva([[x + g * 12, y - 20], [x + g * 27, y - 6], [x + g * 23, y + 20]]), shade(c, -0.3), 2.6)).join("") }; }
    const bx = sideX(A, "r", Y.wa + 30) + 2, by = Y.wa + 14, s = lp(A.cuello.r, A.hombros.r, 0.5);
    return { p: [shape([[bx, by + 2], [bx + 13, by - 4], [bx + 26, by + 2], [bx + 28, by + 46, 1], [bx - 2, by + 46, 1]]), limb({ pts: [s, [A.hombros.r[0] + 2, A.hombros.r[1] + 16], [bx + 6, by + 2]], w: [3, 3, 3] })],
      d: [fillD(shape([[bx + 4, by + 22, 1], [bx + 22, by + 22, 1], [bx + 22.5, by + 40, 1], [bx + 3.5, by + 40, 1]]), shade(c, -0.06), 0.8), ln(`M${pt([bx + 4, by + 26])} L${pt([bx + 22, by + 26])}`, shade(c, 0.4), 0.8)] }; }, { opts: { sh: 0.8 } }),

  /* ---- accesorios: sombreros, cinturones, medias, pañuelos, joyas ---- */
  capelina: Object.assign((A, c) => ({ p: [elip(100, 31, 32, 6.5), "M86,31 C85,17 91,11 100,11 C109,11 115,17 114,31 Z"],
    d: [ln("M86,27 C94,29.6 106,29.6 114,27", shade(c, -0.45), 2.6), ln("M90,18 C92,14 96,12.6 99,12.4", shade(c, 0.35), 0.9, 'opacity=".7"')] }), { opts: { sh: 0.5 } }),
  gorro: Object.assign((A, c) => { let r = ""; for (let x = 84; x <= 116; x += 3) r += ln(`M${x},${f1(18 + Math.abs(x - 100) * 0.25)} L${x},31`, shade(c, -0.2), 0.6);
    return { p: ["M82.6,37 C82,20 90,13 100,13 C110,13 118,20 117.4,37 Z", circ(100, 11, 5.5)], d: [r, fillD(shape([[82.4, 30, 1], [117.6, 30, 1], [117.8, 38.5, 1], [82.2, 38.5, 1]]), shade(c, -0.08), 0.9)] }; }, { opts: { sh: 0.5 } }),
  cinturonAncho: Object.assign((A, c) => { const y = A.Y.wa + 1, cx = cX(A, y);
    return { p: [limb({ pts: [ext(A, "l", y - A.tilt * 0.3, 3), [cx, y + 0.6], ext(A, "r", y + A.tilt * 0.3, 3)], w: [7.5, 7.5, 7.5] }, { capIni: "flat", capFin: "flat" })],
      d: [fillD(shape([[cx - 5, y - 5, 1], [cx + 5, y - 5, 1], [cx + 5, y + 6, 1], [cx - 5, y + 6, 1]]), "#C9A45A", 0.9), fillD(shape([[cx - 2.6, y - 2.4, 1], [cx + 2.6, y - 2.4, 1], [cx + 2.6, y + 3.4, 1], [cx - 2.6, y + 3.4, 1]]), c, 0.6)] }; }, { opts: { sh: 0.4 } }),
  cinturonFino: Object.assign((A, c) => { const y = A.Y.wa + 3, cx = cX(A, y);
    return { p: [limb({ pts: [ext(A, "l", y - A.tilt * 0.3, 2.5), [cx, y + 0.6], ext(A, "r", y + A.tilt * 0.3, 2.5)], w: [3.2, 3.2, 3.2] }, { capIni: "flat", capFin: "flat" })],
      d: [fillD(shape([[cx - 2.6, y - 2.6, 1], [cx + 2.6, y - 2.6, 1], [cx + 2.6, y + 3.2, 1], [cx - 2.6, y + 3.2, 1]]), "none", 0.9), ln(`M${pt([cx - 2.6, y - 2.6])} L${pt([cx + 2.6, y - 2.6])} L${pt([cx + 2.6, y + 3.2])} L${pt([cx - 2.6, y + 3.2])} Z`, "#C9A45A", 1)] }; }, { opts: { sh: 0.3 } }),
  medias: Object.assign((A, c) => { const pie = A.pie || "plano";
    return { p: [...pantalonP(A, { ease: 0.3, t: 1, tiro: 4 }), ...LADOS.map(s => xf(pie === "taco" ? PIE_TACO : PIE_PLANO, pieT(A, s)))], d: pliegues(A, c, { rodillas: 1 }) }; }, { opts: { sh: 0.6 } }),
  panty: Object.assign((A, c) => ({ ...DIBUJOS.medias(A, c), op: 0.5 }), { opts: { sh: 0.3, ancho: 1.4 } }),
  panuelo: Object.assign((A, c, it) => { const nl = A.cuello.l, nr = A.cuello.r, nb = A.cuello.base;
    if (A.flat) return { p: [shape([[100, 172, 1], [128, 200, 1], [100, 228, 1], [72, 200, 1]])], d: [lunaresP(it.detalleHex || shade(c, 0.45), 1.1), ln("M100,177 L123,200 L100,223 L77,200 Z", it.detalleHex || shade(c, 0.45), 1.4)] };
    return { p: [limb({ pts: [[nl[0] - 1, nl[1] - 3], [nb[0] - 4, nb[1] + 3], [nb[0] + 4, nb[1] + 3], [nr[0] + 1, nr[1] - 3]], w: [5, 6, 6, 5] }), circ(nb[0] + 6, nb[1] + 3, 3.6),
      shape([[nb[0] + 6, nb[1] + 4], [nb[0] + 12, nb[1] + 14], [nb[0] + 15, nb[1] + 12, 1], [nb[0] + 9, nb[1] + 2]]), shape([[nb[0] + 5, nb[1] + 5], [nb[0] + 3, nb[1] + 17, 1], [nb[0] + 7, nb[1] + 17, 1], [nb[0] + 8, nb[1] + 5]])],
      d: [lunaresP(it.detalleHex || shade(c, 0.45), 0.9)] }; }, { opts: { sh: 0.5 } }),
  bufanda: Object.assign((A, c) => { const nl = A.cuello.l, nr = A.cuello.r, nb = A.cuello.base, y = A.Y.wa + 16; let r = "", fleco = "";
    if (A.flat) { for (let x = 92; x <= 108; x += 2.6) r += ln(`M${f1(x)},150 L${f1(x)},250`, shade(c, -0.25), 0.5);
      for (let x = 92; x <= 108; x += 2.4) fleco += ln(`M${f1(x)},145 L${f1(x)},151 M${f1(x)},249 L${f1(x)},255`, c, 1.3);
      return { p: [shape([[91, 150, 1], [109, 150, 1], [109, 250, 1], [91, 250, 1]])], d: [r], fuera: fleco }; }
    for (let x = 60; x <= 140; x += 2.6) r += ln(`M${f1(x)},60 L${f1(x)},${f1(y)}`, shade(c, -0.25), 0.5);
    for (let i = 0; i < 6; i++) { const x = nb[0] - 13.5 + i * 1.9; fleco += ln(`M${f1(x)},${f1(y)} L${f1(x)},${f1(y + 6)}`, c, 1.3); }
    return { p: [limb({ pts: [[nl[0] - 2, nl[1] - 6], [nb[0] - 6, nb[1] + 3], [nb[0] + 6, nb[1] + 3], [nr[0] + 2, nr[1] - 6]], w: [9, 10, 10, 9] }), limb({ pts: [[nb[0] - 5, nb[1] + 2], [nb[0] - 8, A.Y.bu], [nb[0] - 9, y]], w: [10, 10, 10] }, { capFin: "flat" })],
      d: [r], fuera: fleco }; }, { opts: { sh: 0.6 } }),
  arosLargos: Object.assign((A, c) => ({ p: LADOS.flatMap(s => { const [x, y] = A.orejas[s]; return [limb({ pts: [[x, y + 5], [x, y + 12]], w: [0.9, 0.9] }), shape([[x, y + 11], [x + 2.6, y + 16], [x, y + 19.5], [x - 2.6, y + 16]])]; }), d: [] }), { opts: { sh: 0.25, ancho: 1.2 } }),
  pulsera: Object.assign((A, c) => { if (A.flat) return { p: ["!" + elip(100, 200, 14, 8) + " " + elip(100, 200, 10.5, 5.2)], d: [] };
    const [a, b] = cruce(A.brazos.l, 0.93, 3.2), [a2, b2] = cruce(A.brazos.l, 0.98, 3.2);
    return { p: [shape([[...a, 1], [...b, 1], [...b2, 1], [...a2, 1]])], d: [ln(curva([lp(a, a2, 0.5), lp(b, b2, 0.5)]), shade(c, 0.45), 0.7)] }; }, { opts: { sh: 0.25, ancho: 1.2 } }),
  collarPerlas: Object.assign((A, c) => { const nl = A.cuello.l, nr = A.cuello.r;
    return { p: Array.from({ length: 13 }, (_, i) => { const t = i / 12; return circ(lerp(nl[0] - 1, nr[0] + 1, t), lerp(nl[1] + 1.5, nr[1] + 1.5, t) + Math.sin(t * Math.PI) * 12, 1.5); }), d: [] }; }, { opts: { sh: 0.3, ancho: 1 } }),
});

/* ---------- cuerpo, cabeza y pelo ---------- */
const CABEZA = "M100,20.5 C110.5,20.5 116.6,29 116.6,40.5 C116.6,52.5 110,63 100,67.5 C90,63 83.4,52.5 83.4,40.5 C83.4,29 89.5,20.5 100,20.5 Z";
const OREJA = "M84.4,40.5 C81.6,40 80.8,43.5 81.4,47 C81.9,49.6 83.4,51 85,50.4 Z";
const MANO = "M-3.6,0 C-4.8,4 -5.2,9 -4.4,13.5 C-3.6,17.5 -1.2,19.5 1,19 C3.4,18.4 4.2,15 4.2,11 L4.4,7.5 C6.2,6.8 7,5 6,3.6 C5,2.8 4,3 3.4,3.6 L3.6,0 Z";
function manoT(A, s) { const P = A.brazos[s].pts, w = P[4], dx = w[0] - P[3][0], dy = w[1] - P[3][1]; return { x: w[0], y: w[1] - 1, rot: Math.atan2(-dx, dy) * 180 / Math.PI, flip: s === "r" }; }
function torsoContorno(A) {
  const mid = (a, b) => { const m = lp(a, b, 0.5); m[1] -= 1.5; return m; };
  return [A.cuello.l, mid(A.cuello.l, A.hombros.l), A.hombros.l, A.axilas.l, A.busto.l, A.cintura.l, A.cadera.l, [A.cadera.l[0] + 5, A.cadera.l[1] + 22], A.entrepierna,
    [A.cadera.r[0] - 5, A.cadera.r[1] + 20], A.cadera.r, A.cintura.r, A.busto.r, A.axilas.r, A.hombros.r, mid(A.cuello.r, A.hombros.r), A.cuello.r];
}
function cuerpoPiezas(A, pie = "plano") {
  const p = [limb({ pts: [A.cuello.top, [100, 74], [A.cuello.base[0], A.cuello.base[1] + 2]], w: [13, 13.4, 17] }), shape(torsoContorno(A))];
  LADOS.forEach(s => { p.push(limb(A.piernas[s]), limb(A.brazos[s]), xf(pie === "taco" ? PIE_TACO : PIE_PLANO, pieT(A, s)), xf(MANO, manoT(A, s))); });
  return p;
}
function ropaInterior(A) {
  const Y = A.Y, yT = Y.bu - 12, cx = cX(A, Y.bu);
  const corpino = shape([[...ext(A, "l", A.axilas.l[1] + 5, -0.3), 1], [A.busto.l[0] + 11, yT], [cx, Y.bu - 4, 1], [A.busto.r[0] - 11, yT - 1], [...ext(A, "r", A.axilas.r[1] + 5, -0.3), 1], [...ext(A, "r", Y.bu + 9, -0.3), 1], [cx, Y.bu + 11], [...ext(A, "l", Y.bu + 9, -0.3), 1]]);
  const breteles = LADOS.map(s => limb({ pts: [[A.busto[s][0] + (s === "l" ? 10 : -10), yT + 1], lp(A.cuello[s], A.hombros[s], 0.45)], w: [1.6, 1.6] }));
  const cr = A.entrepierna;
  const bombacha = shape([[...ext(A, "l", Y.hi - 9 - A.tilt * 0.6, -0.3), 1], ext(A, "l", Y.hi + 5, -0.3), [cr[0] - 5, cr[1] - 7], [cr[0], cr[1] + 1.5], [cr[0] + 5, cr[1] - 7], ext(A, "r", Y.hi + 5, -0.3), [...ext(A, "r", Y.hi - 9 + A.tilt * 0.6, -0.3), 1], [cX(A, Y.hi - 9), Y.hi - 7.5]]);
  return { p: [corpino, ...breteles, bombacha], d: [] };
}
const CAPA_PELO = "M83,46 C81,29 89.5,19.5 101,19.5 C113,19.5 120,29 117.6,46 C116,37 112.5,30.5 106.5,28.6 C102,34.5 93,38 84.6,46.5 Z";
const MECHON_LACIO = "M84.6,44 C82,62 82.2,86 78.4,112 C77,123 79.6,131 84,134 C84.6,120 86.4,104 88,86 C89.2,72 88.6,56 86.6,45 Z";
const MECHON_ONDA = "M84.6,44 C80,54 85,62 81,72 C77,82 84,92 79,104 C83.6,104.5 88.4,97 88.4,87 C88.4,77 86.2,68 88,58 C88.8,52 87.8,47 86.4,44 Z";
const MECHON_BOB = "M83.4,44 C81.4,56 81.4,68 83,75.5 C87.2,75 89.4,70 88.8,62 C88.2,54 86.6,48 85,44 Z";
const PEINADOS = [
  { id: "lacio", nombre: "Lacio",
    atras: ["M84,30 C77.5,44 78,80 76.5,112 C75.5,128 79,142 84,149 L116,149 C121,142 124.5,128 123.5,112 C122,80 122.5,44 116,30 C110,19.5 90,19.5 84,30 Z"],
    frente: [CAPA_PELO, MECHON_LACIO, mir(MECHON_LACIO)], mechas: ["M95,22 C90,26 87,33 85.5,42", "M84,60 C83.5,80 82,100 80,118"] },
  { id: "ondulado", nombre: "Ondulado",
    atras: ["M84,30 C75.5,40 80,54 76,66 C72,80 80,90 75,104 C71.5,116 79,126 84.5,131 L115.5,131 C121,126 128.5,116 125,104 C120,90 128,80 124,66 C120,54 124.5,40 116,30 C110,19.5 90,19.5 84,30 Z"],
    frente: [CAPA_PELO, MECHON_ONDA, mir(MECHON_ONDA)], mechas: ["M95,22 C90,26 87,33 85.5,42", "M84,62 C81,70 85,78 82,88"] },
  { id: "bob", nombre: "Bob",
    atras: ["M82,30 C75.5,42 77,60 78,75 C84,78 90.5,76 94,73.5 L106,73.5 C109.5,76 116,78 122,75 C123,60 124.5,42 118,30 C112,19.5 88,19.5 82,30 Z"],
    frente: [CAPA_PELO, MECHON_BOB, mir(MECHON_BOB)], mechas: ["M95,22 C90,26 87,33 85.5,42", "M84.6,52 C83.6,60 83.8,68 84.8,73"] },
  { id: "recogido", nombre: "Recogido",
    atras: [circ(106.5, 16.5, 10.5), "M86,40 C84,52 86,62 90,66 L110,66 C114,62 116,52 114,40 Z"],
    atrasSombrero: ["M86,40 C84,52 86,62 90,66 L110,66 C114,62 116,52 114,40 Z", circ(113.5, 60, 7.5)], // con sombrero, el rodete baja a la nuca
    frente: ["M83.2,45 C81.5,28.5 90,19.6 100.5,19.6 C111.5,19.6 119,28.5 116.8,45 C114.6,35 108.6,29.4 100.5,29.4 C92.4,29.4 85.4,35 83.2,45 Z", "M84,44 C82.6,50 83,56 84.6,60 C85.6,56 85.8,50 85.4,45 Z"],
    mechas: ["M92,22.6 C96,21 104,21 108,22.6", "M101,8 C104,11 108,12 112,11"] },
];
function cara(sk, hc) {
  const ojo = "M89.4,44.4 C91,42.5 94.6,42.3 96.6,44.1 C94.6,45.8 91,45.9 89.4,44.4 Z", ceja = "M88.6,39.8 C91.2,38 94.8,37.9 97.2,39.2", pest = "M89.6,44.2 C88.8,43.6 88.2,43 87.8,42.3";
  const labios = mix(sk, "#B4485F", 0.45), piel2 = shade(sk, -0.3);
  return `<circle cx="90" cy="51.5" r="4.2" fill="#E07A8A" opacity=".13"/><circle cx="110" cy="51.5" r="4.2" fill="#E07A8A" opacity=".13"/>`
    + `<path d="${ojo}" fill="${CONTORNO}"/><path d="${mir(ojo)}" fill="${CONTORNO}"/><circle cx="94.3" cy="43.6" r=".6" fill="#fff"/><circle cx="108.3" cy="43.6" r=".6" fill="#fff"/>`
    + ln(pest, CONTORNO, 0.7) + ln(mir(pest), CONTORNO, 0.7) + ln(ceja, shade(hc, -0.15), 1.2) + ln(mir(ceja), shade(hc, -0.15), 1.2)
    + ln("M101,45.5 C101.4,49 102,51.4 100,52.4", piel2, 0.8)
    + `<path d="M96.2,56.8 C97.6,55.7 99,56.1 100,56.7 C101,56.1 102.4,55.7 103.8,56.8 C102.2,57.5 97.8,57.5 96.2,56.8 Z" fill="${shade(labios, -0.15)}"/>`
    + `<path d="M96.6,57 C98,59.6 102,59.6 103.4,57 C101.4,57.7 98.6,57.7 96.6,57 Z" fill="${labios}"/>` + ln("M96.2,56.9 C98.5,57.4 101.5,57.4 103.8,56.9", shade(labios, -0.4), 0.5);
}
const OPC_PIEL = sk => ({ contorno: shade(sk, -0.42), ancho: 2, sombra: shade(sk, -0.1), luz: shade(sk, 0.22), opLuz: 0.35, sh: 0.7 });
const OPC_PELO = hc => ({ contorno: shade(hc, -0.45), ancho: 2, sombra: shade(hc, -0.18), luz: shade(hc, 0.3), opLuz: 0.5, sh: 0.8 });
function cabezaSVG(sk, hc, pz) {
  const P = PEINADOS[pz];
  return pintar({ p: P.atras }, hc, OPC_PELO(hc)) + pintar({ p: [OREJA, mir(OREJA), CABEZA] }, sk, OPC_PIEL(sk)) + cara(sk, hc)
    + pintar({ p: P.frente, d: P.mechas.map(m => ln(m, shade(hc, 0.28), 0.8, 'opacity=".7"')) }, hc, OPC_PELO(hc));
}

/* ---------- pintura: contorno, sombra, luz y detalles ---------- */
let UID = 0;
function pintar(g, c, o = {}) {
  const id = "k" + (++UID).toString(36), sh = o.sh ?? g.sh ?? 1;
  const ps = g.p.map(x => (x[0] === "!" ? `<path d="${x.slice(1)}" fill-rule="evenodd" clip-rule="evenodd"/>` : `<path d="${x}"/>`)).join("");
  const sx = f1(-3.2 * sh), sy = f1(-2.4 * sh);
  return `<g fill="${c}" stroke="${o.contorno || CONTORNO}" stroke-width="${o.ancho ?? 3}" stroke-linejoin="round">${ps}</g>`
    + `<clipPath id="${id}">${ps}</clipPath><g clip-path="url(#${id})">`
    + `<g fill="${o.sombra || shade(c, -0.15)}">${ps}</g><g fill="${c}" transform="translate(${sx} ${sy})">${ps}</g>`
    + `<g fill="none" stroke="${o.luz || shade(c, 0.28)}" stroke-width="${o.anchoLuz ?? 1.2}" opacity="${o.opLuz ?? 0.55}" transform="translate(${f1(-sx * 0.6)} ${f1(-sy * 0.8)})">${ps}</g>`
    + (g.d || []).join("") + `</g>` + (g.fuera || "");
}
function pintarPrenda(g, c, opts) { const s = pintar(g, c, opts) + (g.capas || []).map(k => pintar(k, k.c, opts)).join(""); return g.op ? `<g opacity="${g.op}">${s}</g>` : s; }

