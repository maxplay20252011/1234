/* =====================================================================
   ICON OUTFIT CHALLENGE · ESCÁNER
   1) interpretar(texto): funciones puras (QR o texto impreso → tarjetas).
   2) En el navegador: cámara en vivo, foto y lectura con Claude.
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

if (typeof module !== "undefined") module.exports = { interpretar, SINONIMOS };

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

  /* ---------- tarjetas leídas (se leen del formulario, que es la fuente de verdad) ---------- */
  const actual = g => { const b = document.querySelector(`#g-${g} .opcion[aria-pressed="true"]`); return b ? b.dataset.k : null; };
  function pintarLeidas() {
    ["estilo", "clima", "evento"].forEach(g => {
      const k = actual(g), el = document.querySelector(`.leida[data-g="${g}"]`);
      if (!k) origen[g] = null;
      el.classList.toggle("ok", !!k);
      el.querySelector(".valor").textContent = k ? NOMBRES[g][k].nombre : "Falta escanear";
      el.querySelector(".via").textContent = k ? ({ qr: "Leída por QR", claude: "Leída por Claude", mano: "Elegida a mano" }[origen[g] || "mano"]) : "";
      const ilu = el.querySelector(".mini");
      const src = k ? document.querySelector(`#op-${g}-${k} .ilu`) : null;
      ilu.innerHTML = src ? src.innerHTML.replace(/id="u/g, 'id="l' + g).replace(/url\(#u/g, "url(#l" + g) : "";
    });
  }
  new MutationObserver(pintarLeidas).observe($("#p-sel"), { subtree: true, attributes: true, attributeFilter: ["aria-pressed"] });
  $("#p-sel").addEventListener("click", e => { const b = e.target.closest(".opcion"); if (b && e.isTrusted) origen[b.dataset.g] = "mano"; });

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

  /* ---------- decodificar QR en una imagen (varios por foto) ---------- */
  let detector = null;
  try { if ("BarcodeDetector" in window) detector = new BarcodeDetector({ formats: ["qr_code"] }); } catch (e) { detector = null; }
  async function leerQRs(canvas, max = 3) {
    if (detector) { try { const r = await detector.detect(canvas); if (r.length) return r.map(x => x.rawValue); } catch (e) { /* sigue con jsQR */ } }
    if (typeof jsQR !== "function") return [];
    const ctx = canvas.getContext("2d", { willReadFrequently: true }), out = [];
    for (let i = 0; i < max; i++) {
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const r = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
      if (!r || !r.data) break;
      out.push(r.data);
      tapar(ctx, r.location, 0, 0); // tapa el QR leído y busca el siguiente
    }
    return out;
  }
  function tapar(ctx, L, dx, dy) {
    const pts = [L.topLeftCorner, L.topRightCorner, L.bottomRightCorner, L.bottomLeftCorner];
    ctx.fillStyle = ctx.strokeStyle = "#fff"; ctx.lineWidth = 24; ctx.beginPath();
    pts.forEach((p, j) => (j ? ctx.lineTo(p.x + dx, p.y + dy) : ctx.moveTo(p.x + dx, p.y + dy))); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  /* Con varias tarjetas en la misma foto jsQR mezcla las esquinas de distintos códigos:
     se busca también por regiones superpuestas (2×2 y 3×3) y se juntan los resultados. */
  function leerRegiones(canvas, set, cats) {
    if (typeof jsQR !== "function") return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    for (const n of [2, 3]) {
      const tw = Math.min(canvas.width, Math.round(canvas.width / n * 1.5)), th = Math.min(canvas.height, Math.round(canvas.height / n * 1.5));
      for (let yi = 0; yi < n; yi++) for (let xi = 0; xi < n; xi++) {
        if (cats().size >= 3) return;
        const x = Math.round(Math.max(0, Math.min(canvas.width - tw, xi * canvas.width / n - tw * 0.17)));
        const y = Math.round(Math.max(0, Math.min(canvas.height - th, yi * canvas.height / n - th * 0.17)));
        for (let i = 0; i < 2; i++) { // dentro de la región también se tapa lo leído y se busca otra vez
          const d = ctx.getImageData(x, y, tw, th), q = jsQR(d.data, d.width, d.height, { inversionAttempts: "dontInvert" });
          if (!q || !q.data) break;
          set.add(q.data); tapar(ctx, q.location, x, y);
        }
      }
    }
  }
  /** Todos los QR de una foto. Corta apenas tiene una tarjeta de cada categoría. */
  async function buscarQRs(bmp) {
    const set = new Set(), cats = () => new Set([...set].flatMap(interpretar).map(x => x.g));
    const grande = aCanvas(bmp, bmp.width, bmp.height, 1600);
    (await leerQRs(grande)).forEach(t => set.add(t));
    if (detector && set.size) return [...set];
    if (!set.size) leerRegiones(grande, set, cats);
    if (cats().size < 3) { const chica = aCanvas(bmp, bmp.width, bmp.height, 900); (await leerQRs(chica)).forEach(t => set.add(t)); if (cats().size < 3) leerRegiones(chica, set, cats); }
    return [...set];
  }
  function aCanvas(src, w, h, maxLado) {
    const k = Math.min(1, maxLado / Math.max(w, h)), c = document.createElement("canvas");
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext("2d", { willReadFrequently: true }).drawImage(src, 0, 0, c.width, c.height);
    return c;
  }

  /* ---------- Claude lee el texto impreso (si la tarjeta no tiene QR) ---------- */
  let sample = null, puedeImagen = false;
  (async () => {
    try {
      if (!window.claude || !window.claude.use) return;
      sample = await window.claude.use("sample");
      if (!sample) return;
      const lim = await sample.limits().catch(() => null);
      puedeImagen = !!(lim && lim.images);
    } catch (e) { sample = null; }
    $("#scan-claude-nota").hidden = !puedeImagen;
  })();
  const lista = g => Object.entries(NOMBRES[g]).map(([k, d]) => `${k} (${d.nombre})`).join(", ");
  async function leerConClaude(blob) {
    if (!sample || !puedeImagen) return null;
    const prompt = "La imagen es una foto de una o más tarjetas físicas de un juego de moda. Cada tarjeta dice un estilo personal, un clima o un tipo de evento. "
      + "Leé solo el texto impreso en las tarjetas y respondé únicamente con un objeto JSON {\"estilo\": id o null, \"clima\": id o null, \"evento\": id o null}. "
      + `Ids válidos. estilo: ${lista("estilo")}. clima: ${lista("clima")}. evento: ${lista("evento")}. `
      + "Usá null para una categoría que no aparece o que no se lee con claridad. No adivines. Ejemplo: {\"estilo\":\"glam\",\"clima\":null,\"evento\":\"fiesta\"}";
    const r = await sample.json(prompt, { images: blob, modelTier: "quick" });
    const out = [];
    for (const g of ["estilo", "clima", "evento"]) { const v = r && typeof r[g] === "string" ? r[g].toLowerCase().trim() : null; if (v && NOMBRES[g][v]) out.push({ g, k: v }); else if (v) out.push(...interpretar(v).filter(x => x.g === g)); }
    return out;
  }
  const ERR_CLAUDE = { not_granted: "No se dio permiso para que Claude lea la foto.", rate_limited: "Claude está ocupado: probá de nuevo en un rato.", image_rejected: "La foto no se pudo usar: probá con otra.", session_expired: "Hay que volver a iniciar sesión en Claude." };

  /* ---------- foto (abre la cámara del celular o elige un archivo) ---------- */
  $("#scan-foto").onchange = async e => {
    const f = e.target.files && e.target.files[0]; e.target.value = "";
    if (!f) return;
    estado("Buscando el QR en la foto…");
    $("#visor").classList.add("leyendo");
    let bmp;
    try { bmp = await createImageBitmap(f); } catch (err) { $("#visor").classList.remove("leyendo"); estado("No pude abrir esa imagen. Probá con otra foto."); return; }
    pararCamara();
    const vista = aCanvas(bmp, bmp.width, bmp.height, 1200);
    mostrarEnVisor(vista);
    await new Promise(r => setTimeout(r, 30)); // deja pintar el estado antes del cálculo
    const textos = await buscarQRs(bmp);
    let leidos = textos.flatMap(interpretar), via = "qr";
    if (!leidos.length && textos.length) { $("#visor").classList.remove("leyendo"); estado("Leí un QR, pero no es de una tarjeta ICON."); return; }
    if (!leidos.length && puedeImagen) {
      estado("No encontré un QR. Claude está leyendo el texto de la tarjeta…");
      try { leidos = (await leerConClaude(f)) || []; via = "claude"; }
      catch (err) { $("#visor").classList.remove("leyendo"); estado(ERR_CLAUDE[err && err.code] || "No se pudo leer el texto ahora. Probá de nuevo o elegí a mano."); return; }
    }
    $("#visor").classList.remove("leyendo");
    despues(aplicar(leidos, via), leidos.length ? "Esa tarjeta ya estaba cargada. Escaneá la siguiente." : (puedeImagen ? "No encontré estilo, clima ni evento en la foto. Acercate a la tarjeta y probá con más luz." : "No encontré un QR en la foto. Encuadrá el QR de la tarjeta, acercate y probá con más luz."));
  };
  function mostrarEnVisor(canvas) {
    const v = $("#visor .pantalla-visor"); v.innerHTML = ""; canvas.className = "foto"; v.appendChild(canvas);
    $("#visor").classList.add("con-imagen");
  }

  /* ---------- cámara en vivo ---------- */
  let stream = null, timer = null, ultimo = { t: "", at: 0 };
  async function activarCamara() {
    if (stream) { pararCamara(); estado("Cámara apagada."); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { sinCamara(); return; }
    estado("Pidiendo acceso a la cámara…");
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false }); }
    catch (e) { stream = null; sinCamara(e && e.name); return; }
    const video = document.createElement("video");
    video.setAttribute("playsinline", ""); video.muted = true; video.srcObject = stream; video.className = "foto";
    const v = $("#visor .pantalla-visor"); v.innerHTML = ""; v.appendChild(video);
    $("#visor").classList.add("con-imagen", "vivo");
    try { await video.play(); } catch (e) { /* algunos navegadores arrancan solos */ }
    $("#scan-camara").textContent = "Apagar cámara";
    $("#scan-texto").hidden = !puedeImagen;
    estado("Cámara activa. Mostrá el QR de una tarjeta.");
    const loop = async () => {
      if (!stream) return;
      if (video.readyState >= 2 && video.videoWidth) {
        const textos = await leerQRs(aCanvas(video, video.videoWidth, video.videoHeight, 720), 2);
        const t = textos.join("\n");
        if (t && (t !== ultimo.t || Date.now() - ultimo.at > 2500)) {
          ultimo = { t, at: Date.now() };
          const leidos = textos.flatMap(interpretar);
          if (leidos.length) despues(aplicar(leidos, "qr"), "Esa tarjeta ya estaba cargada. Mostrá la siguiente.");
          else estado("Ese QR no es de una tarjeta ICON.");
        }
      }
      timer = setTimeout(loop, 180);
    };
    loop();
  }
  function pararCamara() {
    clearTimeout(timer); timer = null;
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    $("#visor").classList.remove("vivo");
    $("#scan-camara").textContent = "Activar cámara";
    $("#scan-texto").hidden = true;
  }
  function sinCamara(nombre) {
    $("#scan-alt").classList.add("resalta");
    estado(nombre === "NotAllowedError" || nombre === "SecurityError" || !nombre
      ? "Esta pantalla no deja usar la cámara en vivo. Tocá «Sacar o subir foto»: abre la cámara del celular y lee la tarjeta igual."
      : "No encontré una cámara disponible. Tocá «Sacar o subir foto» para usar una foto.");
  }
  $("#scan-camara").onclick = activarCamara;
  $("#scan-texto").onclick = async () => { // tarjeta sin QR con la cámara en vivo: Claude lee el cuadro actual
    const video = $("#visor video"); if (!video || !video.videoWidth) return;
    const c = aCanvas(video, video.videoWidth, video.videoHeight, 1280);
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.9));
    estado("Claude está leyendo el texto de la tarjeta…");
    try { const l = (await leerConClaude(blob)) || []; despues(aplicar(l, "claude"), l.length ? "Esa tarjeta ya estaba cargada." : "No encontré estilo, clima ni evento. Acercá la tarjeta."); }
    catch (err) { estado(ERR_CLAUDE[err && err.code] || "No se pudo leer el texto ahora. Probá de nuevo o elegí a mano."); }
  };

  // Al salir de la pantalla de escaneo (generar, reiniciar) se apaga la cámara y se limpia el visor.
  new MutationObserver(() => {
    if ($("#p-sel").hidden) { pararCamara(); $("#visor .pantalla-visor").innerHTML = ""; $("#visor").classList.remove("con-imagen"); $("#scan-alt").classList.remove("resalta"); estado("Escaneá la primera tarjeta."); }
    pintarLeidas();
  }).observe($("#p-sel"), { attributes: true, attributeFilter: ["hidden"] });
  pintarLeidas();
})();
