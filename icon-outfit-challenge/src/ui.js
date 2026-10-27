/* =====================================================================
   ICON OUTFIT CHALLENGE · INTERFAZ (solo navegador)
   ===================================================================== */
(function () {
  const $ = s => document.querySelector(s);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------- íconos de línea para clima y evento ---------- */
  const ico = d => `<svg class="ico" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONOS = {
    calido: ico('<circle cx="24" cy="24" r="8"/><path d="M24 6v5M24 37v5M6 24h5M37 24h5M11.3 11.3l3.5 3.5M33.2 33.2l3.5 3.5M11.3 36.7l3.5-3.5M33.2 14.8l3.5-3.5"/>'),
    templado: ico('<circle cx="18" cy="17" r="6"/><path d="M18 5v3M6 17h3M9.5 8.5l2 2M26.5 8.5l-2 2"/><path d="M15 36h20a7 7 0 0 0 0-14 9 9 0 0 0-17 3 5.5 5.5 0 0 0-3 11z" fill="var(--cream)"/>'),
    frio: ico('<path d="M24 5v38M7.5 14.5l33 19M7.5 33.5l33-19"/><path d="M19 8l5 4 5-4M19 40l5-4 5 4M8 20l6-1 1-6M40 28l-6 1-1 6M8 28l6 1 1 6M40 20l-6-1-1-6"/>'),
    lluvia: ico('<path d="M13 28h22a7.5 7.5 0 0 0 0-15 10 10 0 0 0-19 3 6 6 0 0 0-3 12z"/><path d="M16 33l-2 5M24 33l-2 5M32 33l-2 5M20 40l-1.5 3M28 40l-1.5 3"/>'),
    amigos: ico('<path d="M10 14h11l-1.5 18a4 4 0 0 1-4 3.6 4 4 0 0 1-4-3.6z"/><path d="M27 14h11l-1.5 18a4 4 0 0 1-4 3.6 4 4 0 0 1-4-3.6z"/><path d="M10.5 20h10M27.5 20h10M24 6v4M19 8l2 2.5M29 8l-2 2.5"/>'),
    fiesta: ico('<path d="M30 9a13 13 0 1 0 9 22 11 11 0 0 1-9-22z"/><path d="M12 10v6M9 13h6M38 7v4M36 9h4M14 34v4M12 36h4"/>'),
    elegante: ico('<path d="M17 6h14l-1 10a6 6 0 0 1-12 0z"/><path d="M24 22v15M17 42h14M19 12h10"/><circle cx="35" cy="9" r="1"/><circle cx="38" cy="15" r="1"/>'),
    clases: ico('<path d="M6 12c6-2 12-1 18 3 6-4 12-5 18-3v24c-6-2-12-1-18 3-6-4-12-5-18-3z"/><path d="M24 15v24M11 19c3-.6 6-.2 9 1M11 25c3-.6 6-.2 9 1M28 20c3-1.2 6-1.6 9-1"/>'),
    cita: ico('<path d="M24 40S8 30.5 8 19a8 8 0 0 1 16-2 8 8 0 0 1 16 2c0 11.5-16 21-16 21z"/><path d="M33 8l1.5-3M37 10l3-1.5"/>'),
    airelibre: ico('<path d="M4 38l12-16 8 10 6-7 14 13z"/><circle cx="35" cy="12" r="4.5"/><path d="M16 22l3 4"/>'),
    formal: ico('<path d="M24 24l-14-8v16zM24 24l14-8v16z"/><rect x="21" y="20.5" width="6" height="7" rx="1.5"/>'),
    casual: ico('<path d="M9 18h24v10a10 10 0 0 1-10 10h-4A10 10 0 0 1 9 28z"/><path d="M33 21h3a5 5 0 0 1 0 10h-3.5M17 6c-2 2.5 2 4.5 0 7M24 6c-2 2.5 2 4.5 0 7"/>'),
  };

  /* ---------- dibujo de prendas con recorte a su caja ---------- */
  const mg = $("#medida"), cache = new Map();
  function plano(dibujo, hex, det) {
    const k = dibujo + hex + (det || "");
    if (cache.has(k)) return cache.get(k);
    const svg = prendaPlana({ dibujo, colorHex: hex, detalleHex: det });
    mg.innerHTML = svg;
    let b = null;
    try {
      [...mg.children].filter(n => n.tagName === "g" && !n.hasAttribute("clip-path")).forEach(n => {
        const r = n.getBBox(); if (!r.width && !r.height) return;
        if (!b) b = { x: r.x, y: r.y, x2: r.x + r.width, y2: r.y + r.height };
        else { b.x = Math.min(b.x, r.x); b.y = Math.min(b.y, r.y); b.x2 = Math.max(b.x2, r.x + r.width); b.y2 = Math.max(b.y2, r.y + r.height); }
      });
    } catch (e) { b = null; }
    mg.innerHTML = "";
    const pad = 3;
    const bb = b ? { x: b.x - pad, y: b.y - pad, w: b.x2 - b.x + pad * 2, h: b.y2 - b.y + pad * 2 } : { x: 40, y: 60, w: 120, h: 220 };
    const o = { svg, bb }; cache.set(k, o); return o;
  }
  const r1 = n => Math.round(n * 10) / 10;
  let usoId = 0; // cada uso de un dibujo cacheado lleva ids de clipPath propios
  const unico = svg => { const k = "u" + (++usoId).toString(36) + "_"; return svg.replace(/id="k/g, `id="${k}k`).replace(/url\(#k/g, `url(#${k}k`); };
  const miniatura = (dibujo, hex, det) => { const o = plano(dibujo, hex, det); return `<svg viewBox="${r1(o.bb.x)} ${r1(o.bb.y)} ${r1(o.bb.w)} ${r1(o.bb.h)}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${unico(o.svg)}</svg>`; };

  /* ---------- composición flat-lay ---------- */
  const W = 1000, H = 1250, TOP = 70, BOT = 1150;
  function componer(look, idPref) {
    const P = look.piezas, de = r => P.filter(p => p.papel === r);
    const dib = p => plano(p.it.dibujo, p.color.hex, p.detalleHex);
    const abrigo = de("abrigo")[0], vestido = de("vestido")[0], top = de("top")[0], bottom = de("bottom")[0];
    const col = abrigo ? { L: [36, 316], M: [336, 676], R: [700, 964] } : { L: [44, 304], M: [320, 680], R: [700, 960] };
    const ancho = c => c[1] - c[0];
    const items = []; // {p, x, y, s, o}
    // Columna central: escala común para que las prendas guarden proporción entre sí.
    const disp = BOT - TOP;
    let s0;
    if (vestido) { const o = dib(vestido); s0 = Math.min(ancho(col.M) / o.bb.w, disp / o.bb.h, 3.4); items.push({ p: vestido, o, s: s0, cx: (col.M[0] + col.M[1]) / 2, cy: TOP + disp / 2 }); }
    else {
      const a = dib(top), b = dib(bottom), gap = -6;
      s0 = Math.min(ancho(col.M) / a.bb.w, ancho(col.M) / b.bb.w, (disp - gap) / (a.bb.h + b.bb.h), 3.4);
      const hT = a.bb.h * s0, hB = b.bb.h * s0, y0 = TOP + (disp - (hT + hB + gap)) / 2, cx = (col.M[0] + col.M[1]) / 2;
      items.push({ p: top, o: a, s: s0, cx, cy: y0 + hT / 2, z: 2 });
      items.push({ p: bottom, o: b, s: s0, cx, cy: y0 + hT + gap + hB / 2, z: 1 });
    }
    // Columnas laterales: cada pieza tiene una caja máxima y un tope de escala relativo a s0.
    const caja = { abrigo: [1, 640, 1], calzado: [0.92, 210, 1.15], bolso: [0.78, 250, 1.3], acc: [0.62, 130, 2.3], medias: [0.6, 380, 1], paraguas: [0.5, 330, 1.5] };
    const lados = { L: [], R: [] };
    if (abrigo) { lados.L.push(abrigo); de("calzado").forEach(p => lados.L.push(p)); de("acc").forEach(p => lados.R.push(p)); de("bolso").forEach(p => lados.R.push(p)); de("medias").concat(de("paraguas")).forEach(p => (lados.R.length > 4 ? lados.L : lados.R).push(p)); }
    else { de("acc").forEach((p, i) => lados[i % 2 ? "L" : "R"].push(p)); de("bolso").forEach(p => lados.R.push(p)); de("calzado").forEach(p => lados.L.push(p)); de("medias").forEach(p => lados.L.push(p)); de("paraguas").forEach(p => lados.R.push(p)); }
    const orden = { acc: 0, abrigo: 1, bolso: 2, medias: 3, paraguas: 3, calzado: 4 };
    for (const lado of ["L", "R"]) {
      const c = col[lado], lista = lados[lado].sort((a, b) => orden[a.papel] - orden[b.papel]);
      let filas = lista.map(p => { const [fw, mh, k] = caja[p.papel], o = dib(p); const s = Math.min((ancho(c) * fw) / o.bb.w, mh / o.bb.h, s0 * k); return { p, o, s, h: o.bb.h * s }; });
      const gap = 36, total = () => filas.reduce((t, f) => t + f.h, 0) + gap * (filas.length - 1);
      if (total() > disp) { const k = (disp - gap * (filas.length - 1)) / filas.reduce((t, f) => t + f.h, 0); filas.forEach(f => { f.s *= k; f.h *= k; }); }
      let y = TOP + (disp - total()) / 2;
      filas.forEach(f => { items.push({ p: f.p, o: f.o, s: f.s, cx: (c[0] + c[1]) / 2, cy: y + f.h / 2 }); y += f.h + gap; });
    }
    const piezaSVG = (it, i) => {
      const { o, s } = it, w = o.bb.w * s, h = o.bb.h * s, x = it.cx - w / 2, y = it.cy - h / 2;
      const anidado = () => `<svg x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" viewBox="${r1(o.bb.x)} ${r1(o.bb.y)} ${r1(o.bb.w)} ${r1(o.bb.h)}" overflow="visible">${unico(o.svg)}</svg>`;
      let cuerpo = anidado();
      if (it.p.papel === "calzado") { // par: el segundo zapato un poco atrás
        const dx = w * 0.16, dy = -h * 0.2, k = 0.86;
        cuerpo = `<g transform="translate(${r1(x + w * 0.5 + dx)} ${r1(y + h * 0.5 + dy)}) scale(${k}) translate(${r1(-x - w * 0.5)} ${r1(-y - h * 0.5)})" opacity=".96">${anidado()}</g>` + cuerpo;
      }
      const tx = Math.max(24, x - 4), ty = Math.max(24, y - 4);
      return `<g class="pz" style="--i:${i}" filter="url(#${idPref}-sombra)">${cuerpo}</g>`
        + `<g class="pz" style="--i:${i}"><circle cx="${r1(tx)}" cy="${r1(ty)}" r="19" fill="#FCFAF6" stroke="#A9ADB8" stroke-width="1.4"/><text x="${r1(tx)}" y="${r1(ty + 6)}" text-anchor="middle" font-family="Jost, sans-serif" font-size="18" font-weight="600" fill="#221A30">${it.p.n}</text></g>`;
    };
    const orden2 = items.slice().sort((a, b) => (a.p.papel === "abrigo" ? -1 : 0) - (b.p.papel === "abrigo" ? -1 : 0) || (a.z || 0) - (b.z || 0));
    const cards = `${ESTILOS[look.estilo].nombre} · ${CLIMAS[look.clima].nombre} · ${EVENTOS[look.evento].nombre}`;
    return `<svg class="comp" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc("Flat-lay del look " + look.nombre + ": " + P.map(p => p.texto).join(", "))}">`
      + `<defs><radialGradient id="${idPref}-fondo" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".6" stop-color="#FBF8F3"/><stop offset="1" stop-color="#F1EAF8"/></radialGradient>`
      + `<filter id="${idPref}-sombra" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#4E3A75" flood-opacity=".16"/></filter></defs>`
      + `<rect width="${W}" height="${H}" fill="url(#${idPref}-fondo)"/>`
      + `<rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="10" fill="none" stroke="#C9CBD3" stroke-width="1.2"/>`
      + orden2.map((it, i) => piezaSVG(it, i)).join("")
      + `<text x="44" y="${H - 40}" font-family="'Bodoni Moda', Georgia, serif" font-size="26" letter-spacing="4" fill="#221A30">ICON</text>`
      + `<text x="${W - 44}" y="${H - 42}" text-anchor="end" font-family="Jost, sans-serif" font-size="15" letter-spacing="2" fill="#5E5478">${esc(cards.toUpperCase())}</text>`
      + `</svg>`;
  }

  /* ---------- estado ---------- */
  const S = { pantalla: "p-inicio", sel: { estilo: null, clima: null, evento: null }, variante: 0, look: null };
  const GRUPOS = [
    { key: "estilo", datos: ESTILOS, el: "#g-estilo", nombre: "Estilo" },
    { key: "clima", datos: CLIMAS, el: "#g-clima", nombre: "Clima" },
    { key: "evento", datos: EVENTOS, el: "#g-evento", nombre: "Evento" },
  ];
  function show(id, foco = true) {
    S.pantalla = id;
    document.querySelectorAll(".pantalla").forEach(s => { s.hidden = s.id !== id; });
    $("#resumen").hidden = id !== "p-sel";
    window.scrollTo({ top: 0, behavior: "instant" in document.documentElement.style ? "instant" : "auto" });
    if (foco) { const h = $("#" + id).querySelector("h1,h2"); if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); } }
  }

  /* ---------- inicio: cartas del abanico ---------- */
  const PE = ESTILOS.romantico.pal;
  $("#carta-1").innerHTML = miniatura("volados", PE.claro[0]);
  $("#carta-2").innerHTML = ICONOS.templado.replace('class="ico"', 'class="ico" style="width:120px;height:120px;color:var(--violet)"');
  $("#carta-3").innerHTML = ICONOS.cita.replace('class="ico"', 'class="ico" style="width:120px;height:120px;color:var(--violet)"');

  /* ---------- selección ---------- */
  const check = '<span class="check" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5l2.6 2.6L11 4.5"/></svg></span>';
  GRUPOS.forEach(g => {
    const cont = $(g.el + " .opciones");
    cont.innerHTML = Object.entries(g.datos).map(([k, d]) => {
      let ilu;
      if (g.key === "estilo") { const m = d.mini, c = m.rol === "denim" ? "#4D6E98" : d.pal[m.rol][0]; ilu = miniatura(m.dibujo, c, d.pal.claro[0]); }
      else ilu = ICONOS[k];
      return `<button class="opcion" type="button" id="op-${g.key}-${k}" data-g="${g.key}" data-k="${k}" aria-pressed="false">${check}<span class="ilu">${ilu}</span><span class="nom">${esc(d.nombre)}</span></button>`;
    }).join("");
  });
  document.querySelectorAll(".opcion").forEach(b => { b.onclick = () => elegir(b.dataset.g, b.dataset.k); });

  function pintarSel() {
    GRUPOS.forEach(g => {
      const v = S.sel[g.key];
      document.querySelectorAll(`${g.el} .opcion`).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.k === v)));
      $(g.el + " .estado").innerHTML = v ? `Elegido: <b>${esc(g.datos[v].nombre)}</b>` : "Sin elegir";
      const slot = document.querySelector(`.slot[data-ir="${g.key}"]`);
      slot.querySelector("b").textContent = v ? g.datos[v].nombre : "—";
      slot.classList.toggle("ok", !!v);
      if (v) $(g.el).classList.remove("falta");
    });
    const completo = GRUPOS.every(g => S.sel[g.key]);
    $("#generar").setAttribute("aria-disabled", String(!completo));
    $("#resumen").classList.toggle("completo", completo);
    if (completo) $("#aviso").textContent = "";
  }
  function elegir(g, k) {
    S.sel[g] = k; pintarSel();
    const sig = GRUPOS[GRUPOS.findIndex(x => x.key === g) + 1];
    if (sig && !S.sel[sig.key]) { // acerca la siguiente tarjeta si no se ve
      const el = $(sig.el), r = el.getBoundingClientRect();
      if (r.top > innerHeight * 0.55) el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  }
  document.querySelectorAll(".slot").forEach(s => { s.onclick = () => $(GRUPOS.find(g => g.key === s.dataset.ir).el).scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); });

  $("#generar").onclick = () => {
    const faltan = GRUPOS.filter(g => !S.sel[g.key]);
    if (faltan.length) {
      faltan.forEach(g => $(g.el).classList.add("falta"));
      $("#aviso").textContent = `Falta elegir: ${faltan.map(g => g.nombre.toLowerCase()).join(", ")}.`;
      const el = $(faltan[0].el); el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      el.querySelector(".opcion").focus({ preventScroll: true });
      return;
    }
    S.variante = 0; generar(true);
  };

  /* ---------- resultado ---------- */
  function generar(conPausa) {
    S.look = generarLook(S.sel.estilo, S.sel.clima, S.sel.evento, S.variante);
    const fin = () => { $("#generando").hidden = true; pintarResultado(); show("p-res"); };
    if (conPausa && !reduce) { $("#generando").hidden = false; setTimeout(fin, 1100); } else fin();
  }
  const NOMBRE_PAPEL = { top: "Prenda superior", bottom: "Prenda inferior", vestido: "Vestido o enterito", abrigo: "Tercera prenda", calzado: "Calzado", bolso: "Bolso", acc: "Accesorio", medias: "Por el clima", paraguas: "Por la lluvia" };
  const chips = L => [["1", ESTILOS[L.estilo].nombre], ["2", CLIMAS[L.clima].nombre], ["3", EVENTOS[L.evento].nombre]].map(([n, t]) => `<span class="chip"><i>TARJETA ${n}</i>${esc(t)}</span>`).join("");
  function pintarResultado() {
    const L = S.look;
    $("#lienzo").innerHTML = componer(L, "res");
    $("#r-tag").textContent = `Look ${L.tag}`;
    $("#t-res").textContent = L.nombre;
    $("#r-chips").innerHTML = chips(L);
    const etiquetas = ["Estilo", "Clima", "Evento"];
    $("#r-porque").innerHTML = L.porque.map((t, i) => `<li><b>${etiquetas[i]}.</b> ${esc(t)}</li>`).join("");
    $("#r-peinado").textContent = L.peinado;
    $("#r-maq").textContent = L.maquillaje;
    $("#r-alt").hidden = !L.alternativa;
    if (L.alternativa) $("#r-alt").innerHTML = `<b>${esc(L.alternativa.titulo)}</b> ${esc(L.alternativa.texto)}`;
    let html = L.piezas.map(p => `<li><span class="num">${p.n}</span><div><span class="cat">${NOMBRE_PAPEL[p.papel]}</span><b><span class="sw" style="background:${p.color.hex}"></span>${esc(p.texto)}</b><p>${esc(p.it.desc)}</p></div></li>`).join("");
    if (L.sinAbrigo) html += `<li class="nota"><span class="num">–</span><div><span class="cat">Tercera prenda</span><p>${esc(L.sinAbrigo)}</p></div></li>`;
    $("#lista").innerHTML = html;
    document.querySelectorAll("#p-res .entra").forEach(e => { e.style.animation = "none"; void e.offsetWidth; e.style.animation = ""; });
  }
  $("#otra").onclick = () => { show("p-sel"); pintarSel(); };
  $("#version").onclick = () => { S.variante++; generar(false); };

  /* ---------- pantalla completa ---------- */
  function abrirStand() {
    const L = S.look; if (!L) return;
    $("#st-lienzo").innerHTML = componer(L, "st");
    $("#st-tag").textContent = `Look ${L.tag}`;
    $("#st-nombre").textContent = L.nombre;
    $("#st-chips").innerHTML = chips(L);
    $("#st-lista").innerHTML = L.piezas.map(p => `<li>${esc(p.texto)}</li>`).join("");
    $("#stand").hidden = false; $("#st-cerrar").focus();
    const el = $("#stand");
    try { const r = el.requestFullscreen && el.requestFullscreen(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* sin API: queda la vista fija */ }
  }
  function cerrarStand() {
    $("#stand").hidden = true;
    try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (e) { /* nada */ }
    $("#btn-full").focus();
  }
  $("#btn-full").onclick = abrirStand;
  $("#st-cerrar").onclick = cerrarStand;
  document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && !$("#stand").hidden) { $("#stand").hidden = true; $("#btn-full").focus(); } });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#stand").hidden) cerrarStand(); });

  /* ---------- inicio y reinicio ---------- */
  function reiniciar() {
    if (!$("#stand").hidden) cerrarStand();
    S.sel = { estilo: null, clima: null, evento: null }; S.variante = 0; S.look = null;
    GRUPOS.forEach(g => $(g.el).classList.remove("falta")); $("#aviso").textContent = "";
    pintarSel(); show("p-inicio");
  }
  $("#crear").onclick = () => { show("p-sel"); pintarSel(); };
  $("#volver").onclick = reiniciar;
  $("#nuevo").onclick = reiniciar;
  $("#ir-inicio").onclick = reiniciar;

  /* ---------- conservar el estado si la página se actualiza mientras está abierta ---------- */
  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => ({ pantalla: S.pantalla, sel: S.sel, variante: S.variante }));
  const start = d => {
    if (d && d.sel) { S.sel = { ...S.sel, ...d.sel }; S.variante = d.variante || 0; }
    pintarSel();
    if (d && d.pantalla === "p-res" && S.sel.estilo && S.sel.clima && S.sel.evento) { generar(false); }
    else show(d && d.pantalla === "p-sel" ? "p-sel" : "p-inicio", false);
  };
  if (hot && hot.ready) hot.ready(start); else start(hot && hot.data ? hot.data : {});
})();
