// @ts-nocheck
// start-game · ARCHIVO GENERADO por scripts/armar-funciones.mjs. Copiá TODO y pegalo en el editor de Supabase.
// Envoltorio HTTP para Deno (Supabase Edge Functions). La lógica está en handlers.js.
import { createClient } from "npm:@supabase/supabase-js@2";

const ORIGEN = Deno.env.get("ALLOWED_ORIGIN") || "*";
const CORS = {
  "Access-Control-Allow-Origin": ORIGEN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const responder = (status, json) => new Response(JSON.stringify(json), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Cliente con la clave de servicio: vive solo en el servidor.
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY las pone Supabase solo. Si tu proyecto usa únicamente las claves
// nuevas ("sb_secret_..."), cargá esa clave como secreto SERVICE_KEY (ver la guía).
const CLAVE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_KEY");
const sb = createClient(Deno.env.get("SUPABASE_URL"), CLAVE, { auth: { persistSession: false } });
async function rpc(nombre, args) {
  const { data, error } = await sb.rpc(nombre, args);
  if (error) throw new Error(`${nombre}: ${error.message}`);
  return data;
}

function servir(handler) {
  return async req => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return responder(405, { error: "metodo", mensaje: "Usá POST." });
    const texto = await req.text();
    if (texto.length > 20000) return responder(413, { error: "muy_grande", mensaje: "Pedido demasiado grande." });
    let body; try { body = JSON.parse(texto || "{}"); } catch { return responder(400, { error: "json", mensaje: "JSON inválido." }); }
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "desconocida";
    try {
      const r = await handler(body, { rpc, ip, adminPassword: Deno.env.get("ADMIN_PASSWORD") });
      return responder(r.status, r.json);
    } catch (e) {
      console.error(e);
      return responder(500, { error: "servidor", mensaje: "Error del servidor." });
    }
  };
}

// ---------------- motor del juego ----------------
// ARCHIVO GENERADO por scripts/extraer-motor.mjs a partir de index.html. No lo edites a mano.
// eslint-disable
/* =====================================================================
   1) CONFIGURACIÓN
   ===================================================================== */
const CONFIG = {
  ctaUrl: "https://example.com/icon?utm_source=juego&utm_medium=arma-el-look", // TODO: reemplazar por la landing / tienda de ICON
  ctaTexto: "Probá tus looks en el espejo de ICON",
  rondas: 3,
  segundosContrarreloj: 45,
  storageKey: "icon_armaellook_best_v1",
};

/* Reglas de puntaje. Todo número del motor sale de acá. */
const REGLAS = {
  ocasion: { max: 40, bandas: [[0.5, 40], [1, 30], [1.5, 18], [2, 8]], extremoDist: 3, extremoResta: 8, prohibidaResta: 10 },
  // Nota: con la regla literal (hasta 2 familias = 30, tope 30) el bonus tono sobre tono nunca suma.
  // Por eso "hasta 2 familias" vale 25 y el bonus de +5 lleva a 30 los looks de 0-1 familia.
  // Para volver a la regla literal: hasta2: 30.
  color: { max: 30, hasta2: 25, tres: 18, cuatroOMas: 6, bonusMono: 5 },
  clima: { max: 15, sinAbrigoInvierno: 5 },
  estilo: { max: 15, porPrenda: 5 },
  estrellas: [[80, 3], [50, 2], [0, 1]],
  titulos: [[270, "ICON total"], [220, "Stylist en potencia"], [150, "Ojo entrenado"], [0, "Estilo en construcción"]],
};

/* Pestañas del placard: cada una agrupa una o más categorías. Los subfiltros salen del campo "sub". */
const TABS = [
  { id: "top", nombre: "Tops", cats: ["top"], modo: "percha" },
  { id: "bottom", nombre: "Bottoms", cats: ["bottom"], modo: "percha" },
  { id: "vestido", nombre: "Vestidos", cats: ["vestido"], modo: "percha" },
  { id: "calzado", nombre: "Calzado", cats: ["calzado"], modo: "estante" },
  { id: "abrigo", nombre: "Abrigos", cats: ["abrigo"], modo: "percha" },
  { id: "bolso", nombre: "Bolsos", cats: ["bolso"], modo: "estante" },
  { id: "accesorios", nombre: "Accesorios", cats: ["joyeria", "cinturon", "medias", "panuelo", "sombrero"], modo: "estante" },
];
// Orden de capas: piel → medias → bottom → top/vestido → cinturón → abrigo → pañuelo → calzado → bolso → joyas → sombrero
const CAPA = { medias: 0.5, bottom: 1, top: 2, vestido: 2, cinturon: 2.5, abrigo: 3, panuelo: 3.5, calzado: 4, bolso: 5, joyeria: 6, sombrero: 7 };
const MAX_JOYERIA = 2;


const TXT = {
  formalidad: ["", "Súper relajado", "Casual", "Smart casual", "Formal", "Gala"],
  estilo: { romantico: "romántico", minimal: "minimal", clasico: "clásico", urbano: "urbano", boho: "boho", sporty: "deportivo", rocker: "rockero", glam: "glam" },
  familia: { neutro: "neutros", calido: "tonos cálidos", frio: "tonos fríos", pastel: "pasteles", saturado: "colores plenos" },
};

/* =====================================================================
   3) DATOS: CATÁLOGO. Para sumar una prenda, agregá un objeto acá.
      art: artículo para los comentarios ("la", "el", "las", "los").
      dibujo: clave de DIBUJOS; colorHex pinta la prenda; detalleHex (opcional)
        pinta rayas, lunares o estampado.
      slot (opcional, joyería): zona del cuerpo; no se repite.
      img (opcional): URL o data URI que reemplaza la miniatura del placard.
      imgPuesta (opcional): {href, x, y, w, h} en coordenadas del avatar
        (viewBox 0 4 200 434) que reemplaza el dibujo puesto.
   ===================================================================== */
/** Una prenda con "variantes" genera prendas hermanas: heredan todo y pisan lo que traen. */
function expandirVariantes(lista) { return lista.flatMap(({ variantes, ...it }) => [it, ...(variantes || []).map(v => ({ ...it, ...v }))]); }
const TODAS = ["primavera", "verano", "otoño", "invierno"];
const CATALOGO = expandirVariantes([
  // TOPS (9)
  { id: "top_01", sub: "Básicos", categoria: "top", nombre: "Remera blanca", art: "la", colorHex: "#F3F1EC", familiaColor: "neutro", formalidad: 2, estaciones: ["primavera", "verano", "otoño"], estilos: ["minimal", "urbano", "sporty"], dibujo: "remera", variantes: [{ id: "top_15", nombre: "Remera negra", colorHex: "#211F24", estilos: ["minimal", "urbano", "rocker"] }] },
  { id: "top_02", sub: "Camisas y blusas", categoria: "top", nombre: "Blusa satinada", art: "la", colorHex: "#E8D5C4", familiaColor: "neutro", formalidad: 4, estaciones: ["primavera", "verano", "otoño"], estilos: ["romantico", "glam"], dibujo: "blusa" },
  { id: "top_03", sub: "Camisas y blusas", categoria: "top", nombre: "Camisa a rayas", art: "la", colorHex: "#DCE6F2", familiaColor: "frio", formalidad: 3, estaciones: ["primavera", "verano", "otoño"], estilos: ["clasico", "minimal"], dibujo: "camisa", detalleHex: "#5B7DAB" },
  { id: "top_04", sub: "Básicos", categoria: "top", nombre: "Musculosa de lino", art: "la", colorHex: "#D9A441", familiaColor: "calido", formalidad: 2, estaciones: ["primavera", "verano"], estilos: ["boho", "minimal"], dibujo: "musculosa" },
  { id: "top_05", sub: "Tejidos", categoria: "top", nombre: "Sweater trenzado", art: "el", colorHex: "#9C4A2F", familiaColor: "calido", formalidad: 2, estaciones: ["otoño", "invierno"], estilos: ["clasico", "boho"], dibujo: "sweater" },
  { id: "top_06", sub: "Para salir", categoria: "top", nombre: "Top corset", art: "el", colorHex: "#1E1B21", familiaColor: "neutro", formalidad: 4, estaciones: ["primavera", "verano", "otoño"], estilos: ["glam", "rocker"], dibujo: "corset" },
  { id: "top_07", sub: "Básicos", categoria: "top", nombre: "Top deportivo", art: "el", colorHex: "#E2457A", familiaColor: "saturado", formalidad: 1, estaciones: ["primavera", "verano"], estilos: ["sporty", "urbano"], dibujo: "deportivo" },
  { id: "top_08", sub: "Tejidos", categoria: "top", nombre: "Polera de cuello alto", art: "la", colorHex: "#2F3B5C", familiaColor: "frio", formalidad: 3, estaciones: ["otoño", "invierno"], estilos: ["minimal", "clasico"], dibujo: "polera" },
  { id: "top_09", sub: "Camisas y blusas", categoria: "top", nombre: "Blusa con volados", art: "la", colorHex: "#F1C6CF", familiaColor: "pastel", formalidad: 3, estaciones: ["primavera", "verano"], estilos: ["romantico", "boho"], dibujo: "volados" },
  // BOTTOMS (7)
  { id: "bot_01", sub: "Pantalones", categoria: "bottom", nombre: "Jean recto", art: "el", colorHex: "#4D6E98", familiaColor: "neutro", formalidad: 2, estaciones: TODAS, estilos: ["urbano", "clasico"], dibujo: "jean", variantes: [{ id: "bot_14", nombre: "Jean negro", colorHex: "#2E2D33", estilos: ["urbano", "rocker", "clasico"] }] },
  { id: "bot_02", sub: "Pantalones", categoria: "bottom", nombre: "Pantalón sastrero", art: "el", colorHex: "#2A292E", familiaColor: "neutro", formalidad: 4, estaciones: ["primavera", "otoño", "invierno"], estilos: ["clasico", "minimal"], dibujo: "sastrero" },
  { id: "bot_03", sub: "Polleras", categoria: "bottom", nombre: "Falda midi plisada", art: "la", colorHex: "#C5D6C0", familiaColor: "pastel", formalidad: 3, estaciones: ["primavera", "verano"], estilos: ["romantico", "clasico"], dibujo: "plisada" },
  { id: "bot_04", sub: "Shorts", categoria: "bottom", nombre: "Short de jean", art: "el", colorHex: "#8CAAD0", familiaColor: "neutro", formalidad: 1, estaciones: ["verano"], estilos: ["urbano", "sporty", "boho"], dibujo: "short" },
  { id: "bot_05", sub: "Pantalones", categoria: "bottom", nombre: "Calza deportiva", art: "la", colorHex: "#2C2B33", familiaColor: "neutro", formalidad: 1, estaciones: TODAS, estilos: ["sporty"], dibujo: "calza" },
  { id: "bot_06", sub: "Pantalones", categoria: "bottom", nombre: "Pantalón palazzo", art: "el", colorHex: "#E6D8C3", familiaColor: "neutro", formalidad: 3, estaciones: ["primavera", "verano"], estilos: ["boho", "minimal"], dibujo: "palazzo", variantes: [{ id: "bot_15", nombre: "Palazzo de satén", colorHex: "#CDB58A", formalidad: 5, estaciones: ["primavera", "verano", "otoño"], estilos: ["glam", "minimal"] }] },
  { id: "bot_07", sub: "Polleras", categoria: "bottom", nombre: "Minifalda de cuero", art: "la", colorHex: "#6E1F30", familiaColor: "calido", formalidad: 3, estaciones: ["primavera", "otoño", "invierno"], estilos: ["rocker", "glam"], dibujo: "minifalda" },
  // VESTIDOS / ENTERITOS (6)
  { id: "dre_01", sub: "Cortos y midi", categoria: "vestido", nombre: "Vestido slip de seda", art: "el", colorHex: "#B8A4D4", familiaColor: "pastel", formalidad: 4, estaciones: ["primavera", "verano"], estilos: ["romantico", "glam", "minimal"], dibujo: "slip", variantes: [{ id: "dre_12", nombre: "Vestido slip negro", colorHex: "#1D1B20", familiaColor: "neutro", estaciones: ["primavera", "verano", "otoño"], estilos: ["glam", "minimal", "rocker"] }] },
  { id: "dre_02", sub: "Largos", categoria: "vestido", nombre: "Vestido largo de gala", art: "el", colorHex: "#1F3B63", familiaColor: "frio", formalidad: 5, estaciones: ["primavera", "otoño", "invierno"], estilos: ["glam", "clasico"], dibujo: "gala" },
  { id: "dre_03", sub: "Cortos y midi", categoria: "vestido", nombre: "Vestido camisero", art: "el", colorHex: "#D6C2A3", familiaColor: "neutro", formalidad: 3, estaciones: ["primavera", "verano", "otoño"], estilos: ["clasico", "minimal"], dibujo: "camisero" },
  { id: "dre_04", sub: "Enteritos", categoria: "vestido", nombre: "Enterito de lino", art: "el", colorHex: "#C46A48", familiaColor: "calido", formalidad: 2, estaciones: ["primavera", "verano"], estilos: ["boho", "urbano"], dibujo: "enterito" },
  { id: "dre_05", sub: "Cortos y midi", categoria: "vestido", nombre: "Vestido corto con lunares", art: "el", colorHex: "#EE9B2F", familiaColor: "saturado", formalidad: 2, estaciones: ["verano"], estilos: ["boho", "romantico"], dibujo: "lunares", detalleHex: "#FFF6E8" },
  { id: "dre_06", sub: "Cortos y midi", categoria: "vestido", nombre: "Vestido de punto", art: "el", colorHex: "#6B4A3A", familiaColor: "calido", formalidad: 3, estaciones: ["otoño", "invierno"], estilos: ["minimal", "clasico"], dibujo: "punto" },
  // CALZADO (7)
  { id: "sho_01", sub: "Zapatillas", categoria: "calzado", nombre: "Zapatillas blancas", art: "las", colorHex: "#F4F3EF", familiaColor: "neutro", formalidad: 2, estaciones: TODAS, estilos: ["urbano", "sporty", "minimal"], dibujo: "zapatillas" },
  { id: "sho_02", sub: "Tacos", categoria: "calzado", nombre: "Stilettos", art: "los", colorHex: "#1D1A1F", familiaColor: "neutro", formalidad: 5, estaciones: TODAS, estilos: ["glam", "clasico"], dibujo: "stilettos" },
  { id: "sho_03", sub: "Botas", categoria: "calzado", nombre: "Borcegos", art: "los", colorHex: "#2B2523", familiaColor: "neutro", formalidad: 2, estaciones: ["primavera", "otoño", "invierno"], estilos: ["rocker", "urbano"], dibujo: "borcegos" },
  { id: "sho_04", sub: "Planos", categoria: "calzado", nombre: "Ojotas", art: "las", colorHex: "#3BA39B", familiaColor: "frio", formalidad: 1, estaciones: ["verano"], estilos: ["sporty", "boho"], dibujo: "ojotas" },
  { id: "sho_05", sub: "Planos", categoria: "calzado", nombre: "Mocasines", art: "los", colorHex: "#6A3D25", familiaColor: "calido", formalidad: 3, estaciones: ["primavera", "otoño", "invierno"], estilos: ["clasico", "minimal"], dibujo: "mocasines" },
  { id: "sho_06", sub: "Tacos", categoria: "calzado", nombre: "Sandalias doradas", art: "las", colorHex: "#C9A45A", familiaColor: "neutro", formalidad: 4, estaciones: ["primavera", "verano"], estilos: ["glam", "romantico"], dibujo: "sandalias" },
  { id: "sho_07", sub: "Botas", categoria: "calzado", nombre: "Botas de caña alta", art: "las", colorHex: "#4E3226", familiaColor: "calido", formalidad: 3, estaciones: ["otoño", "invierno"], estilos: ["boho", "clasico", "rocker"], dibujo: "botasAltas" },
  // ABRIGOS (5)
  { id: "coa_01", sub: "Sacos y tapados", categoria: "abrigo", nombre: "Blazer oversize", art: "el", colorHex: "#CDBA9C", familiaColor: "neutro", formalidad: 4, estaciones: ["primavera", "otoño"], estilos: ["clasico", "minimal"], dibujo: "blazer", variantes: [{ id: "coa_10", nombre: "Blazer de terciopelo", colorHex: "#2B2230", formalidad: 5, estaciones: ["primavera", "otoño", "invierno"], estilos: ["glam", "clasico"] }] },
  { id: "coa_02", sub: "Camperas", categoria: "abrigo", nombre: "Campera de cuero", art: "la", colorHex: "#1F1D21", familiaColor: "neutro", formalidad: 2, estaciones: ["primavera", "otoño", "invierno"], estilos: ["rocker", "urbano"], dibujo: "cuero" },
  { id: "coa_03", sub: "Sacos y tapados", categoria: "abrigo", nombre: "Tapado de lana", art: "el", colorHex: "#B88A5E", familiaColor: "neutro", formalidad: 4, estaciones: ["otoño", "invierno"], estilos: ["clasico", "minimal"], dibujo: "tapado" },
  { id: "coa_04", sub: "Camperas", categoria: "abrigo", nombre: "Campera puffer", art: "la", colorHex: "#9FC3B2", familiaColor: "pastel", formalidad: 1, estaciones: ["invierno"], estilos: ["sporty", "urbano"], dibujo: "puffer" },
  { id: "coa_05", sub: "Kimonos y ponchos", categoria: "abrigo", nombre: "Kimono liviano", art: "el", colorHex: "#D9734E", familiaColor: "calido", formalidad: 2, estaciones: ["primavera", "verano"], estilos: ["boho"], dibujo: "kimono", detalleHex: "#F7D9B8" },
  // BOLSOS (4)
  { id: "bag_01", sub: "De mano", categoria: "bolso", nombre: "Clutch metalizado", art: "el", colorHex: "#C9A45A", familiaColor: "neutro", formalidad: 5, estaciones: TODAS, estilos: ["glam"], dibujo: "clutch", variantes: [{ id: "bag_08", nombre: "Clutch plateado", colorHex: "#C4C8D0" }] },
  { id: "bag_02", sub: "Al hombro", categoria: "bolso", nombre: "Tote de lona", art: "el", colorHex: "#E7DBC2", familiaColor: "neutro", formalidad: 2, estaciones: ["primavera", "verano"], estilos: ["boho", "urbano", "minimal"], dibujo: "tote" },
  { id: "bag_03", sub: "De mano", categoria: "bolso", nombre: "Cartera estructurada", art: "la", colorHex: "#7A1F2B", familiaColor: "calido", formalidad: 4, estaciones: TODAS, estilos: ["clasico", "glam"], dibujo: "cartera", variantes: [{ id: "bag_07", nombre: "Cartera negra", colorHex: "#1F1D21", familiaColor: "neutro", estilos: ["clasico", "glam", "minimal"] }] },
  { id: "bag_04", sub: "Manos libres", categoria: "bolso", nombre: "Riñonera", art: "la", colorHex: "#E2457A", familiaColor: "saturado", formalidad: 1, estaciones: TODAS, estilos: ["sporty", "urbano"], dibujo: "rinonera" },
  // JOYERÍA Y GAFAS (4)
  { id: "jew_01", sub: "Joyas", categoria: "joyeria", slot: "orejas", nombre: "Aros de perla", art: "los", colorHex: "#F4EFE6", familiaColor: "neutro", formalidad: 4, estaciones: TODAS, estilos: ["romantico", "clasico"], dibujo: "perlas" },
  { id: "jew_02", sub: "Gafas", categoria: "joyeria", slot: "cara", nombre: "Lentes de sol", art: "los", colorHex: "#1E1C1F", familiaColor: "neutro", formalidad: 2, estaciones: ["primavera", "verano"], estilos: ["urbano", "glam"], dibujo: "lentes" },
  { id: "jew_03", sub: "Joyas", categoria: "joyeria", slot: "cuello", nombre: "Collar de cadena", art: "el", colorHex: "#C9A45A", familiaColor: "neutro", formalidad: 3, estaciones: TODAS, estilos: ["rocker", "glam", "minimal"], dibujo: "collar" },
  { id: "jew_04", sub: "Joyas", categoria: "joyeria", slot: "orejas", nombre: "Argollas doradas", art: "las", colorHex: "#C9A45A", familiaColor: "neutro", formalidad: 3, estaciones: TODAS, estilos: ["urbano", "boho", "glam"], dibujo: "argollas" },
  // ---- Bloque A: prendas nuevas ----
  { id: "top_10", sub: "Básicos", categoria: "top", nombre: "Crop top", art: "el", colorHex: "#E9B949", familiaColor: "calido", formalidad: 1, estaciones: ["primavera", "verano"], estilos: ["urbano", "sporty"], dibujo: "crop" },
  { id: "top_11", sub: "Para salir", categoria: "top", nombre: "Camisola de seda", art: "la", colorHex: "#E3CFAE", familiaColor: "neutro", formalidad: 5, estaciones: ["primavera", "verano", "otoño"], estilos: ["glam", "romantico", "minimal"], dibujo: "camisola" },
  { id: "top_12", sub: "Tejidos", categoria: "top", nombre: "Cárdigan corto", art: "el", colorHex: "#B9C7DB", familiaColor: "pastel", formalidad: 3, estaciones: ["primavera", "otoño", "invierno"], estilos: ["romantico", "clasico"], dibujo: "cardigan" },
  { id: "top_13", sub: "Para salir", categoria: "top", nombre: "Top halter", art: "el", colorHex: "#B8263B", familiaColor: "saturado", formalidad: 3, estaciones: ["primavera", "verano"], estilos: ["glam", "boho"], dibujo: "halter" },
  { id: "top_14", sub: "Camisas y blusas", categoria: "top", nombre: "Chaleco sastrero", art: "el", colorHex: "#6B6B70", familiaColor: "neutro", formalidad: 4, estaciones: ["primavera", "otoño", "invierno"], estilos: ["clasico", "minimal", "urbano"], dibujo: "chaleco" },
  { id: "bot_08", sub: "Pantalones", categoria: "bottom", nombre: "Jean wide leg", art: "el", colorHex: "#7C9CC4", familiaColor: "neutro", formalidad: 2, estaciones: TODAS, estilos: ["urbano", "boho"], dibujo: "wideLeg" },
  { id: "bot_09", sub: "Polleras", categoria: "bottom", nombre: "Pollera lápiz", art: "la", colorHex: "#2F3A55", familiaColor: "frio", formalidad: 4, estaciones: ["primavera", "otoño", "invierno"], estilos: ["clasico", "minimal"], dibujo: "lapiz" },
  { id: "bot_10", sub: "Polleras", categoria: "bottom", nombre: "Pollera larga boho", art: "la", colorHex: "#C98B5B", detalleHex: "#F3E3C8", familiaColor: "calido", formalidad: 2, estaciones: ["primavera", "verano"], estilos: ["boho", "romantico"], dibujo: "faldaLarga" },
  { id: "bot_11", sub: "Pantalones", categoria: "bottom", nombre: "Jogger", art: "el", colorHex: "#9DA3AE", familiaColor: "neutro", formalidad: 1, estaciones: ["primavera", "otoño", "invierno"], estilos: ["sporty", "urbano"], dibujo: "jogger" },
  { id: "bot_12", sub: "Pantalones", categoria: "bottom", nombre: "Pantalón cargo", art: "el", colorHex: "#7A7A52", familiaColor: "calido", formalidad: 2, estaciones: ["primavera", "otoño", "invierno"], estilos: ["urbano", "rocker"], dibujo: "cargo" },
  { id: "bot_13", sub: "Shorts", categoria: "bottom", nombre: "Bermuda sastrera", art: "la", colorHex: "#D8CBB4", familiaColor: "neutro", formalidad: 3, estaciones: ["primavera", "verano"], estilos: ["clasico", "minimal"], dibujo: "bermuda" },
  { id: "dre_07", sub: "Cortos y midi", categoria: "vestido", nombre: "Vestido de cóctel", art: "el", colorHex: "#127A68", familiaColor: "saturado", formalidad: 4, estaciones: ["primavera", "verano", "otoño"], estilos: ["glam", "romantico"], dibujo: "coctel" },
  { id: "dre_08", sub: "Cortos y midi", categoria: "vestido", nombre: "Vestido cruzado", art: "el", colorHex: "#B5523B", detalleHex: "#F1D7C3", familiaColor: "calido", formalidad: 3, estaciones: ["primavera", "verano", "otoño"], estilos: ["romantico", "clasico"], dibujo: "wrap" },
  { id: "dre_09", sub: "Largos", categoria: "vestido", nombre: "Vestido tejido largo", art: "el", colorHex: "#D7CDBF", familiaColor: "neutro", formalidad: 3, estaciones: ["otoño", "invierno"], estilos: ["minimal", "boho"], dibujo: "tejidoLargo" },
  { id: "dre_10", sub: "Enteritos", categoria: "vestido", nombre: "Mono sastrero", art: "el", colorHex: "#1F2A44", familiaColor: "frio", formalidad: 4, estaciones: ["primavera", "otoño", "invierno"], estilos: ["clasico", "minimal", "glam"], dibujo: "mono" },
  { id: "dre_11", sub: "Cortos y midi", categoria: "vestido", nombre: "Vestido remera a rayas", art: "el", colorHex: "#F4F2EE", detalleHex: "#2F3B5C", familiaColor: "neutro", formalidad: 1, estaciones: ["primavera", "verano"], estilos: ["urbano", "sporty", "minimal"], dibujo: "vCamiseta" },
  { id: "coa_06", sub: "Sacos y tapados", categoria: "abrigo", nombre: "Trench", art: "el", colorHex: "#C9AE85", familiaColor: "neutro", formalidad: 3, estaciones: ["primavera", "otoño"], estilos: ["clasico", "minimal"], dibujo: "trench" },
  { id: "coa_07", sub: "Camperas", categoria: "abrigo", nombre: "Chaleco inflable", art: "el", colorHex: "#3E4A3C", familiaColor: "frio", formalidad: 1, estaciones: ["otoño", "invierno"], estilos: ["sporty", "urbano"], dibujo: "chalecoInflable" },
  { id: "coa_08", sub: "Camperas", categoria: "abrigo", nombre: "Campera de jean", art: "la", colorHex: "#6F8FBA", familiaColor: "neutro", formalidad: 2, estaciones: ["primavera", "otoño"], estilos: ["urbano", "boho", "rocker"], dibujo: "camperaJean" },
  { id: "coa_09", sub: "Kimonos y ponchos", categoria: "abrigo", nombre: "Poncho", art: "el", colorHex: "#A35A3C", detalleHex: "#F2E6D0", familiaColor: "calido", formalidad: 2, estaciones: ["otoño", "invierno"], estilos: ["boho"], dibujo: "poncho" },
  { id: "sho_08", sub: "Planos", categoria: "calzado", nombre: "Chatitas", art: "las", colorHex: "#D9B3A8", familiaColor: "neutro", formalidad: 3, estaciones: ["primavera", "verano", "otoño"], estilos: ["romantico", "clasico", "minimal"], dibujo: "chatitas" },
  { id: "sho_09", sub: "Tacos", categoria: "calzado", nombre: "Mules", art: "los", colorHex: "#E8DCC6", familiaColor: "neutro", formalidad: 4, estaciones: ["primavera", "verano"], estilos: ["minimal", "glam"], dibujo: "mules" },
  { id: "sho_10", sub: "Botas", categoria: "calzado", nombre: "Botinetas", art: "las", colorHex: "#2A2326", familiaColor: "neutro", formalidad: 3, estaciones: ["primavera", "otoño", "invierno"], estilos: ["rocker", "clasico", "urbano"], dibujo: "botineta" },
  { id: "sho_11", sub: "Tacos", categoria: "calzado", nombre: "Plataformas de corcho", art: "las", colorHex: "#C8A06A", detalleHex: "#F1E6D2", familiaColor: "neutro", formalidad: 2, estaciones: ["primavera", "verano"], estilos: ["boho", "glam"], dibujo: "plataformas" },
  { id: "sho_12", sub: "Planos", categoria: "calzado", nombre: "Sandalias bajas", art: "las", colorHex: "#8A5A3C", familiaColor: "calido", formalidad: 2, estaciones: ["primavera", "verano"], estilos: ["boho", "minimal"], dibujo: "sandaliasBajas" },
  { id: "sho_13", sub: "Zapatillas", categoria: "calzado", nombre: "Zapatillas running", art: "las", colorHex: "#2F6FDB", detalleHex: "#FF7A59", familiaColor: "saturado", formalidad: 1, estaciones: TODAS, estilos: ["sporty"], dibujo: "running" },
  { id: "bag_05", sub: "Manos libres", categoria: "bolso", nombre: "Bandolera", art: "la", colorHex: "#A8693F", familiaColor: "calido", formalidad: 3, estaciones: TODAS, estilos: ["urbano", "clasico", "boho"], dibujo: "bandolera" },
  { id: "bag_06", sub: "Al hombro", categoria: "bolso", nombre: "Mochila chica", art: "la", colorHex: "#2F3440", familiaColor: "neutro", formalidad: 2, estaciones: TODAS, estilos: ["urbano", "sporty"], dibujo: "mochila" },
  { id: "jew_05", sub: "Joyas", categoria: "joyeria", slot: "orejas", nombre: "Aros largos", art: "los", colorHex: "#C9A45A", familiaColor: "neutro", formalidad: 4, estaciones: TODAS, estilos: ["glam", "boho"], dibujo: "arosLargos" },
  { id: "jew_06", sub: "Joyas", categoria: "joyeria", slot: "muñeca", nombre: "Pulsera dorada", art: "la", colorHex: "#C9A45A", familiaColor: "neutro", formalidad: 3, estaciones: TODAS, estilos: ["glam", "minimal", "boho"], dibujo: "pulsera" },
  { id: "jew_07", sub: "Joyas", categoria: "joyeria", slot: "cuello", nombre: "Collar de perlas", art: "el", colorHex: "#F4EFE6", familiaColor: "neutro", formalidad: 5, estaciones: TODAS, estilos: ["clasico", "romantico", "glam"], dibujo: "collarPerlas" },
  { id: "hat_01", sub: "Sombreros", categoria: "sombrero", nombre: "Capelina", art: "la", colorHex: "#D9C29A", familiaColor: "neutro", formalidad: 2, estaciones: ["primavera", "verano"], estilos: ["boho", "romantico"], dibujo: "capelina",
    variantes: [{ id: "hat_03", nombre: "Capelina negra", colorHex: "#1F1D21", formalidad: 3, estaciones: ["primavera", "verano", "otoño"], estilos: ["glam", "clasico"] }] },
  { id: "hat_02", sub: "Sombreros", categoria: "sombrero", nombre: "Gorro de lana", art: "el", colorHex: "#B23A48", familiaColor: "calido", formalidad: 1, estaciones: ["otoño", "invierno"], estilos: ["urbano", "sporty"], dibujo: "gorro" },
  { id: "bel_01", sub: "Cinturones", categoria: "cinturon", nombre: "Cinturón ancho", art: "el", colorHex: "#6A3D25", familiaColor: "calido", formalidad: 3, estaciones: TODAS, estilos: ["boho", "clasico"], dibujo: "cinturonAncho",
    variantes: [{ id: "bel_03", nombre: "Cinturón ancho negro", colorHex: "#1F1D21", familiaColor: "neutro", estilos: ["rocker", "clasico"] }] },
  { id: "bel_02", sub: "Cinturones", categoria: "cinturon", nombre: "Cinturón fino", art: "el", colorHex: "#1F1D21", familiaColor: "neutro", formalidad: 4, estaciones: TODAS, estilos: ["minimal", "clasico", "glam"], dibujo: "cinturonFino" },
  { id: "med_01", sub: "Medias", categoria: "medias", nombre: "Medias negras", art: "las", colorHex: "#1F1D21", familiaColor: "neutro", formalidad: 3, estaciones: ["otoño", "invierno"], estilos: ["clasico", "rocker", "minimal"], dibujo: "medias",
    variantes: [{ id: "med_03", nombre: "Medias de lana bordó", colorHex: "#6E1F30", familiaColor: "calido", formalidad: 2, estilos: ["boho", "urbano"] }] },
  { id: "med_02", sub: "Medias", categoria: "medias", nombre: "Panty nude", art: "la", colorHex: "#C99E86", familiaColor: "neutro", formalidad: 4, estaciones: ["primavera", "otoño", "invierno"], estilos: ["clasico", "romantico", "glam"], dibujo: "panty" },
  { id: "pan_01", sub: "Pañuelos", categoria: "panuelo", nombre: "Pañuelo de seda", art: "el", colorHex: "#E3B23C", detalleHex: "#7A1F2B", familiaColor: "calido", formalidad: 4, estaciones: ["primavera", "otoño"], estilos: ["clasico", "romantico"], dibujo: "panuelo",
    variantes: [{ id: "pan_03", nombre: "Pañuelo azul", colorHex: "#2F4E86", detalleHex: "#F4EFE6", familiaColor: "frio" }] },
  { id: "pan_02", sub: "Pañuelos", categoria: "panuelo", nombre: "Bufanda tejida", art: "la", colorHex: "#9E8F80", familiaColor: "neutro", formalidad: 2, estaciones: ["otoño", "invierno"], estilos: ["boho", "urbano", "clasico"], dibujo: "bufanda" },
]);
/* =====================================================================
   4) DATOS: CONSIGNAS. "para" es la frase que usan los comentarios.
   ===================================================================== */
const CONSIGNAS = [
  { id: "casamiento", titulo: "Casamiento de día", icono: "💐", estacion: "primavera", clima: "22°, sol", formalidadObjetivo: 4, estilosBonus: ["romantico", "clasico"], prendasProhibidas: ["top_07", "bot_05"], para: "un casamiento de día", flavor: "Ceremonia al mediodía en una quinta. Elegante, pero que se pueda bailar." },
  { id: "oficina", titulo: "Primer día en la oficina", icono: "💼", estacion: "otoño", clima: "16°, nublado", formalidadObjetivo: 3, estilosBonus: ["clasico", "minimal"], prendasProhibidas: ["top_07", "bot_04"], para: "tu primer día en la oficina", flavor: "Querés causar buena impresión sin parecer disfrazada." },
  { id: "asado", titulo: "Asado con amigas", icono: "🔥", estacion: "otoño", clima: "18°, patio", formalidadObjetivo: 2, estilosBonus: ["urbano", "boho"], para: "un asado con amigas", flavor: "Guitarreada y sobremesa larga. Cómoda, pero con onda." },
  { id: "rooftop", titulo: "Cita en un rooftop", icono: "🌇", estacion: "verano", clima: "27°, atardecer", formalidadObjetivo: 3, estilosBonus: ["glam", "romantico"], para: "una cita en un rooftop", flavor: "Tragos con vista a la ciudad. Que se note el esfuerzo, pero poquito." },
  { id: "entrevista", titulo: "Entrevista de trabajo", icono: "🤝", estacion: "invierno", clima: "9°, frío seco", formalidadObjetivo: 4, estilosBonus: ["clasico", "minimal"], prendasProhibidas: ["top_07", "bot_04", "sho_04"], para: "una entrevista de trabajo", flavor: "Es para el puesto que querés. Seria, segura y sin distracciones." },
  { id: "palermo", titulo: "Paseo de domingo en Palermo", icono: "☕", estacion: "primavera", clima: "20°, soleado", formalidadObjetivo: 2, estilosBonus: ["urbano", "minimal"], para: "un domingo en Palermo", flavor: "Café, feria y caminar mucho. Canchera y con calzado que aguante." },
  { id: "recital", titulo: "Recital al aire libre", icono: "🎸", estacion: "verano", clima: "25°, noche", formalidadObjetivo: 2, estilosBonus: ["rocker", "urbano"], para: "un recital al aire libre", flavor: "Pasto, pogo y horas de pie. Actitud antes que todo." },
  { id: "familia", titulo: "Cena con la familia de tu pareja", icono: "🍝", estacion: "invierno", clima: "7°, de noche", formalidadObjetivo: 3, estilosBonus: ["clasico", "romantico"], para: "la cena con la familia de tu pareja", flavor: "Primera vez en la casa. Prolija, cálida y nada de más." },
  { id: "playa", titulo: "Escapada a la playa", icono: "🌊", estacion: "verano", clima: "30°, viento", formalidadObjetivo: 1, estilosBonus: ["boho", "sporty"], prendasProhibidas: ["sho_02", "coa_03"], para: "una escapada a la playa", flavor: "Arena, sol y un parador al atardecer." },
  { id: "gala", titulo: "Evento de gala", icono: "✨", estacion: "invierno", clima: "10°, noche", formalidadObjetivo: 5, estilosBonus: ["glam", "clasico"], prendasProhibidas: ["sho_01", "sho_04", "bag_04"], para: "un evento de gala", flavor: "Alfombra, flashes y dress code estricto." },
  { id: "yoga", titulo: "Yoga y brunch", icono: "🧘", estacion: "primavera", clima: "19°, mañana", formalidadObjetivo: 1, estilosBonus: ["sporty", "minimal"], para: "una mañana de yoga y brunch", flavor: "Clase en el parque y después medialunas. Que todo se mueva con vos." },
  { id: "muestra", titulo: "Inauguración de una muestra", icono: "🖼️", estacion: "otoño", clima: "15°, de noche", formalidadObjetivo: 3, estilosBonus: ["minimal", "rocker"], para: "una inauguración en una galería", flavor: "Vino, arte contemporáneo y todos mirando a todos. Un look con concepto." },
];

const POR_ID = Object.fromEntries(CATALOGO.map(i => [i.id, i]));

/* =====================================================================
   5) MOTOR (funciones puras, sin DOM)
   ===================================================================== */
/** Pone o saca una prenda aplicando exclusiones. Devuelve {puestas, aviso}. */
function aplicarPrenda(puestas, id) {
  const it = POR_ID[id];
  if (!it) return { puestas, aviso: null };
  if (puestas.includes(id)) return { puestas: puestas.filter(x => x !== id), aviso: null };
  let aviso = null;
  let out = puestas.filter(x => {
    const o = POR_ID[x];
    if (it.categoria === "vestido") return !["top", "bottom", "vestido"].includes(o.categoria);
    if (it.categoria === "top" || it.categoria === "bottom") return o.categoria !== "vestido" && o.categoria !== it.categoria;
    if (it.categoria === "joyeria") return !(o.categoria === "joyeria" && it.slot && o.slot === it.slot);
    return o.categoria !== it.categoria;
  });
  if (it.categoria === "joyeria") {
    const joyas = out.filter(x => POR_ID[x].categoria === "joyeria");
    if (joyas.length >= MAX_JOYERIA) {
      out = out.filter(x => x !== joyas[0]);
      aviso = `Máximo ${MAX_JOYERIA} de joyería: saqué ${conArt(POR_ID[joyas[0]])}.`;
    }
  }
  const quitadas = puestas.filter(x => !out.includes(x));
  if (!aviso && it.categoria === "vestido" && quitadas.length) aviso = "El vestido reemplaza al top y al bottom.";
  if (!aviso && (it.categoria === "top" || it.categoria === "bottom") && quitadas.some(x => POR_ID[x].categoria === "vestido")) aviso = `Saqué el vestido para sumar ${conArt(it)}.`;
  return { puestas: [...out, id], aviso };
}

/** Qué falta para poder confirmar. [] = listo. */
function faltantes(puestas) {
  const cats = new Set(puestas.map(id => POR_ID[id].categoria));
  const f = [];
  if (!cats.has("vestido")) {
    if (!cats.has("top") && !cats.has("bottom")) f.push("top y bottom (o un vestido)");
    else if (!cats.has("top")) f.push("un top");
    else if (!cats.has("bottom")) f.push("un bottom");
  }
  if (!cats.has("calzado")) f.push("calzado");
  return f;
}

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const elegir = (arr, semilla) => arr[hash(semilla) % arr.length];
const esPlural = i => i.art === "los" || i.art === "las";
const v = (i, sing, plur) => (esPlural(i) ? plur : sing);
const conArt = i => `${i.art} ${i.nombre.charAt(0).toLowerCase()}${i.nombre.slice(1)}`;
const Cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const listaY = arr => arr.length < 2 ? arr.join("") : arr.slice(0, -1).join(", ") + " y " + arr[arr.length - 1];

function estrellasDe(total) { return REGLAS.estrellas.find(([min]) => total >= min)[1]; }
function tituloFinal(total) { return REGLAS.titulos.find(([min]) => total >= min)[1]; }

/** Sortea las consignas de una partida sin repetir. La usan el juego (sin conexión) y el servidor. */
function sortearConsignas(azar = Math.random, excluir = [], n = CONFIG.rondas) {
  let pool = CONSIGNAS.filter(c => !excluir.includes(c.id));
  if (pool.length < n) pool = CONSIGNAS.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, n);
}
/** Un look es válido si se puede armar en el placard: prendas que existen, sin repetir y sin combinaciones imposibles. */
function lookValido(ids) {
  if (!Array.isArray(ids) || ids.length > 20 || new Set(ids).size !== ids.length || !ids.every(id => typeof id === "string" && POR_ID[id])) return false;
  return ids.reduce((p, id) => aplicarPrenda(p, id).puestas, []).length === ids.length;
}
/** Puntaje de una partida: [{consigna, prendas}] → {total, rondas}. Un look incompleto (se acabó el tiempo) vale 0. */
function puntuarPartida(rondas) {
  if (!Array.isArray(rondas) || rondas.length !== CONFIG.rondas) throw new Error("rondas_invalidas");
  const detalle = rondas.map(r => {
    const c = CONSIGNAS.find(x => x.id === r?.consigna);
    if (!c || !lookValido(r.prendas)) throw new Error("look_invalido");
    return { consigna: c.id, prendas: r.prendas.slice(), puntaje: faltantes(r.prendas).length ? 0 : puntuarLook(r.prendas, c).total };
  });
  return { total: detalle.reduce((s, r) => s + r.puntaje, 0), rondas: detalle };
}

/** Puntúa un look para una consigna. Determinístico: mismo look → mismo resultado. */
function puntuarLook(ids, consigna) {
  const items = [...ids].sort().map(id => POR_ID[id]);
  const obj = consigna.formalidadObjetivo, R = REGLAS;
  const semilla = consigna.id + "|" + items.map(i => i.id).join(",");
  const nivel = obj === 5 ? "de gala" : TXT.formalidad[obj].toLowerCase();
  const prioridad = i => (CAPA[i.categoria] >= 5 ? 1 : 0);
  const pos = [], neg = [];

  // 1) Ocasión
  const prom = items.reduce((s, i) => s + i.formalidad, 0) / items.length;
  const dif = Math.round(Math.abs(prom - obj) * 1000) / 1000;
  const banda = R.ocasion.bandas.find(([lim]) => dif <= lim);
  const baseOc = banda ? banda[1] : 0;
  const prohibidas = items.filter(i => (consigna.prendasProhibidas || []).includes(i.id));
  const extremos = items.filter(i => Math.abs(i.formalidad - obj) >= R.ocasion.extremoDist);
  const ocasion = Math.max(0, baseOc - extremos.length * R.ocasion.extremoResta - prohibidas.length * R.ocasion.prohibidaResta);
  const candLejana = items.filter(i => !prohibidas.includes(i));
  const lejana = [...(candLejana.length ? candLejana : items)].sort((a, b) => Math.abs(b.formalidad - obj) - Math.abs(a.formalidad - obj) || prioridad(a) - prioridad(b))[0];
  const cercana = [...items].filter(i => i.categoria !== "joyeria").sort((a, b) => Math.abs(a.formalidad - obj) - Math.abs(b.formalidad - obj) || b.formalidad - a.formalidad)[0] || items[0];
  prohibidas.forEach(i => neg.push({ peso: 20, texto: elegir([
    `${Cap(conArt(i))} no ${v(i, "va", "van")} en ${consigna.para}.`,
    `Justo ${conArt(i)} ${v(i, "es", "son")} lo que nadie usa en ${consigna.para}.`,
    `En ${consigna.para}, ${conArt(i)} ${v(i, "resta", "restan")} sí o sí.`], semilla + i.id) }));
  extremos.filter(i => !prohibidas.includes(i)).forEach(i => {
    const baja = i.formalidad < obj;
    neg.push({ peso: 10 + Math.abs(i.formalidad - obj), texto: elegir(baja ? [
      `${Cap(conArt(i))} le ${v(i, "bajó", "bajaron")} formalidad a ${consigna.para}.`,
      `Con ${conArt(i)} el look se fue a otro registro: ${consigna.para} pide algo ${nivel}.`,
      `${Cap(conArt(i))} ${v(i, "es", "son")} demasiado relajad${esPlural(i) ? (i.art === "las" ? "as" : "os") : (i.art === "la" ? "a" : "o")} para ${consigna.para}.`,
    ] : [
      `${Cap(conArt(i))} le ${v(i, "subió", "subieron")} de más la formalidad a ${consigna.para}.`,
      `Con ${conArt(i)} quedaste demasiado producida para ${consigna.para}.`,
      `${Cap(conArt(i))} ${v(i, "es", "son")} para otra ocasión: ${consigna.para} pide algo ${nivel}.`,
    ], semilla + "x" + i.id) });
  });
  if (baseOc < R.ocasion.max) {
    const relajado = prom < obj;
    neg.push({ peso: R.ocasion.max - baseOc, texto: elegir([
      `El look quedó más ${relajado ? "relajado" : "formal"} de lo que pide ${consigna.para}; ${conArt(lejana)} ${v(lejana, "pesó", "pesaron")} en eso.`,
      `Para ${consigna.para} hacía falta un punto más de ${relajado ? "formalidad" : "soltura"}: revisá ${conArt(lejana)}.`,
      `Formalidad promedio ${prom.toFixed(1).replace(".", ",")} contra ${obj} pedido: ${conArt(lejana)} ${v(lejana, "tiró", "tiraron")} para el otro lado.`], semilla + "oc") });
  } else if (ocasion > 0) {
    pos.push({ peso: ocasion, texto: elegir([
      `Formalidad clavada: ${consigna.para} pide algo ${nivel} y tu look está justo ahí.`,
      `${Cap(conArt(cercana))} ${v(cercana, "marca", "marcan")} el tono justo para ${consigna.para}.`,
      `Leíste bien la ocasión: nivel ${nivel} de punta a punta.`], semilla + "oc+") });
  }

  // 2) Armonía de color
  const noNeutras = items.filter(i => i.familiaColor !== "neutro");
  const familias = [...new Set(noNeutras.map(i => i.familiaColor))];
  const baseCol = familias.length <= 2 ? R.color.hasta2 : familias.length === 3 ? R.color.tres : R.color.cuatroOMas;
  const mono = familias.length <= 1;
  const color = Math.min(R.color.max, baseCol + (mono ? R.color.bonusMono : 0));
  const neutras = items.filter(i => i.familiaColor === "neutro");
  if (familias.length === 0) {
    const [a, b] = [neutras[0], neutras[1] || neutras[0]];
    pos.push({ peso: color, texto: elegir([
      `Paleta neutra de punta a punta: ${conArt(a)} con ${conArt(b)} no falla.`,
      `Todo en neutros: elegancia sin esfuerzo.`,
      `Neutros bien combinados; ${conArt(a)} sostiene todo el look.`], semilla + "col") });
  } else if (familias.length === 1) {
    const fam = TXT.familia[familias[0]];
    const a = noNeutras[0], b = noNeutras[1];
    pos.push({ peso: color, texto: elegir(b ? [
      `Tono sobre tono en ${fam}: impecable.`,
      `${Cap(conArt(a))} y ${conArt(b)} en la misma gama: look pensado.`,
      `Una sola familia de color (${fam}) y el resto neutros: color con intención.`,
    ] : [
      `${Cap(conArt(a))} ${v(a, "pone", "ponen")} el color y el resto acompaña en neutros: prolijo.`,
      `Un solo acento de color, ${conArt(a)}, sobre base neutra: bien resuelto.`,
      `Neutros de base y ${conArt(a)} como protagonista: look con intención.`], semilla + "col") });
  } else if (familias.length === 2) {
    const a = noNeutras.find(i => i.familiaColor === familias[0]), b = noNeutras.find(i => i.familiaColor === familias[1]);
    pos.push({ peso: color, texto: elegir([
      `${Cap(conArt(a))} y ${conArt(b)} combinan sin pelearse.`,
      `Dos familias de color bien llevadas: ${TXT.familia[familias[0]]} y ${TXT.familia[familias[1]]}.`,
      `Buen contraste entre ${conArt(a)} y ${conArt(b)}.`], semilla + "col") });
  } else {
    const rep = familias.map(f => noNeutras.find(i => i.familiaColor === f));
    neg.push({ peso: R.color.max - color, texto: elegir([
      `Demasiados frentes de color: ${listaY(familias.map(f => TXT.familia[f]))}. Dejá uno o dos y sumá neutros.`,
      `${Cap(listaY(rep.slice(0, 3).map(conArt)))} compiten entre sí.`,
      `Con ${familias.length} familias de color el look se dispersa; probá apoyarte en neutros.`], semilla + "col-") });
  }

  // 3) Clima / estación
  const est = consigna.estacion;
  const aptas = items.filter(i => i.estaciones.includes(est));
  const noAptas = items.filter(i => !i.estaciones.includes(est));
  const sinAbrigo = est === "invierno" && !items.some(i => i.categoria === "abrigo");
  const clima = Math.max(0, Math.round((aptas.length / items.length) * R.clima.max) - (sinAbrigo ? R.clima.sinAbrigoInvierno : 0));
  if (noAptas.length) {
    const i = noAptas[0];
    neg.push({ peso: R.clima.max - Math.round((aptas.length / items.length) * R.clima.max), texto: elegir([
      `${Cap(conArt(i))} no ${v(i, "es", "son")} para ${est}.`,
      `${Cap(conArt(i))} no ${v(i, "acompaña", "acompañan")} el clima de ${est}.`,
      `Ojo con el clima: ${conArt(i)} ${v(i, "es", "son")} de otra estación.`], semilla + "cl-") });
  }
  if (sinAbrigo) neg.push({ peso: R.clima.sinAbrigoInvierno + 0.5, texto: elegir([
    `Es invierno y no llevaste abrigo: -${R.clima.sinAbrigoInvierno}.`,
    `Sin abrigo en pleno invierno: el look se queda corto.`,
    `Con ${consigna.clima.split(",")[0]} afuera, un abrigo sumaba.`], semilla + "ab") });
  if (!noAptas.length && !sinAbrigo) pos.push({ peso: clima, texto: elegir([
    `Todo el look está pensado para ${est}.`,
    `Impecable para el clima: nada fuera de estación.`,
    `Ni frío ni calor: el look acompaña el ${consigna.clima.split(",")[0]} de ${est}.`], semilla + "cl") });

  // 4) Estilo
  const bonus = consigna.estilosBonus;
  const matches = items.filter(i => i.estilos.some(s => bonus.includes(s)));
  const estilo = Math.min(R.estilo.max, matches.length * R.estilo.porPrenda);
  const nombreEst = bonus.map(s => TXT.estilo[s]);
  if (matches.length) {
    const i = matches.find(m => m.categoria !== "calzado") || matches[0];
    const s = TXT.estilo[i.estilos.find(e => bonus.includes(e))];
    pos.push({ peso: estilo, texto: elegir([
      `${Cap(conArt(i))} ${v(i, "suma", "suman")} ese aire ${s} que pedía la consigna.`,
      `El guiño ${s} de ${conArt(i)} sumó puntos.`,
      `Bien ahí con ${conArt(i)}: ${s} total.`], semilla + "es") });
  }
  if (estilo < R.estilo.max) {
    const sug = CATALOGO.filter(i => !ids.includes(i.id) && i.estilos.some(s => bonus.includes(s)) && i.estaciones.includes(est) && !(consigna.prendasProhibidas || []).includes(i.id))
      .sort((a, b) => Math.abs(a.formalidad - obj) - Math.abs(b.formalidad - obj) || a.id.localeCompare(b.id))[0];
    if (sug) neg.push({ peso: R.estilo.max - estilo - (matches.length ? 2 : 0), texto: elegir(matches.length ? [
      `Te faltó reforzar el estilo ${listaY(nombreEst)}: ${conArt(sug)} ${v(sug, "sumaba", "sumaban")} más.`,
      `Para más puntos de estilo, probá ${conArt(sug)}.`,
      `Un toque ${nombreEst[0]} más, como ${conArt(sug)}, y llegabas al máximo.`,
    ] : [
      `Faltó un guiño ${listaY(nombreEst)}: ${conArt(sug)} te ${v(sug, "hubiera", "hubieran")} sumado.`,
      `Nada del estilo ${listaY(nombreEst)} en el look; con ${conArt(sug)} sumabas.`,
      `La consigna pedía algo ${listaY(nombreEst)} y no apareció: probá ${conArt(sug)}.`], semilla + "es-") });
  }

  const total = ocasion + color + clima + estilo;
  pos.sort((a, b) => b.peso - a.peso); neg.sort((a, b) => b.peso - a.peso);
  let comentarios;
  if (total >= 80) comentarios = [...pos.slice(0, 2).map(c => ({ ...c, tipo: "+" })), ...neg.slice(0, 1).map(c => ({ ...c, tipo: "-" }))];
  else comentarios = [...pos.slice(0, 1).map(c => ({ ...c, tipo: "+" })), ...neg.slice(0, 2).map(c => ({ ...c, tipo: "-" }))];
  if (comentarios.length < 2) {
    const resto = [...pos.map(c => ({ ...c, tipo: "+" })), ...neg.map(c => ({ ...c, tipo: "-" }))].filter(c => !comentarios.some(x => x.texto === c.texto));
    comentarios.push(...resto.slice(0, 2 - comentarios.length));
  }
  return {
    total, estrellas: estrellasDe(total),
    desglose: { ocasion, color, clima, estilo },
    detalle: { promedioFormalidad: +prom.toFixed(2), diferencia: dif, familias, aptas: aptas.length, sinAbrigo, coincidenEstilo: matches.map(i => i.id), extremos: extremos.map(i => i.id), prohibidas: prohibidas.map(i => i.id) },
    comentarios: comentarios.map(({ tipo, texto }) => ({ tipo, texto: texto.replace(/\bde el /g, "del ").replace(/\ba el /g, "al ") })),
  };
}



// ---------------- lógica ----------------
// Lógica de las Edge Functions, sin dependencias de Deno ni de Supabase:
// cada handler recibe (body, ctx) y devuelve { status, json }.
// ctx = { rpc(nombre, args) → data, ip, adminPassword }

const ok = json => ({ status: 200, json });
const err = (status, error, mensaje, extra = {}) => ({ status, json: { error, mensaje, ...extra } });

/* ---------- validaciones ---------- */
const DEVICE_RE = /^[A-Za-z0-9_-]{8,64}$/;
const deviceValido = d => typeof d === "string" && DEVICE_RE.test(d);

// Filtro básico de malas palabras. Se compara sin tildes, sin espacios ni signos y con "leet" básico (4→a, 3→e, 0→o...).
const MALAS = ["puta", "puto", "pija", "poronga", "concha", "mierda", "forro", "pelotud", "boludo", "garca", "trolo",
  "verga", "chupala", "sorete", "culiad", "cogi", "coger", "pajer", "nazi", "hitler", "violad", "mogolic", "negrodemierda", "putita", "zorra", "trola"];
const normalizar = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[4@]/g, "a").replace(/3/g, "e").replace(/[1!|]/g, "i").replace(/0/g, "o").replace(/[5$]/g, "s").replace(/7/g, "t")
  .replace(/[^a-z]/g, "");
function validarNombre(n) {
  if (typeof n !== "string") return { ok: false, mensaje: "Escribí un apodo." };
  const limpio = n.normalize("NFC").replace(/\s+/g, " ").trim();
  if (limpio.length < 2 || limpio.length > 20) return { ok: false, mensaje: "El apodo tiene que tener entre 2 y 20 caracteres." };
  if (!/^[\p{L}\p{N} ._'-]+$/u.test(limpio)) return { ok: false, mensaje: "Usá solo letras, números, espacios, punto, guion o apóstrofo." };
  const plano = normalizar(limpio);
  if (MALAS.some(m => plano.includes(m))) return { ok: false, mensaje: "Elegí otro apodo, por favor." };
  return { ok: true, nombre: limpio };
}

/* ---------- start-game ---------- */
async function startGame(body, ctx) {
  if (!deviceValido(body?.deviceId)) return err(400, "device_invalido", "Dispositivo inválido.");
  const excluir = Array.isArray(body.excluir) ? body.excluir.filter(x => typeof x === "string").slice(0, 10) : [];
  const consignas = sortearConsignas(Math.random, excluir).map(c => c.id);
  const r = await ctx.rpc("iniciar_partida", { p_device: body.deviceId, p_ip: ctx.ip, p_consignas: consignas });
  if (!r.ok) return err(429, r.error, "Jugaste muchas partidas seguidas. Probá en un rato.");
  return ok({ gameId: r.gameId, consignas });
}

/* ---------- submit-score ---------- */
const MENSAJES = {
  partida_invalida: "Esta partida no es válida.", partida_usada: "Esta partida ya se guardó.",
  consignas_distintas: "Las consignas no coinciden con la partida.", muy_rapida: "La partida terminó demasiado rápido.",
  partida_vencida: "La partida venció.", espera: "Esperá un minuto entre partidas para guardar.",
};
async function submitScore(body, ctx) {
  if (!deviceValido(body?.deviceId)) return err(400, "device_invalido", "Dispositivo inválido.");
  if (typeof body.gameId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.gameId)) return err(400, "partida_invalida", MENSAJES.partida_invalida);
  const nombre = validarNombre(body.nombre);
  if (!nombre.ok) return err(400, "nombre_invalido", nombre.mensaje);
  let calculo;
  try { calculo = puntuarPartida(body.rondas); }   // el puntaje que mande el navegador se ignora
  catch (e) { return err(400, e.message || "look_invalido", "La partida tiene prendas o consignas que no existen."); }
  const r = await ctx.rpc("registrar_partida", {
    p_game: body.gameId, p_device: body.deviceId, p_nombre: nombre.nombre, p_consignas: calculo.rondas.map(x => x.consigna),
    p_total: calculo.total, p_rounds: calculo.rondas, p_ip: ctx.ip,
  });
  if (!r.ok) return err(r.error === "espera" ? 429 : 400, r.error, MENSAJES[r.error] || "No se pudo guardar.", r.segundos ? { segundos: r.segundos } : {});
  return ok({ total: r.total, posicion: r.posicion, de: r.de, nombre: nombre.nombre });
}

/* ---------- admin-login ---------- */
async function sha256(texto) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return new Uint8Array(buf);
}
async function igualSeguro(a, b) { // compara en tiempo constante (sobre los hashes)
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}
function tokenAleatorio() { const b = new Uint8Array(32); crypto.getRandomValues(b); return Array.from(b, x => x.toString(16).padStart(2, "0")).join(""); }

async function adminLogin(body, ctx) {
  if (!ctx.adminPassword) return err(500, "sin_configurar", "Falta configurar ADMIN_PASSWORD en el servidor.");
  const ip = ctx.ip || "desconocida";
  if (await ctx.rpc("admin_ip_bloqueada", { p_ip: ip })) return err(429, "bloqueada", "Demasiados intentos. Probá en 10 minutos.");
  const correcta = typeof body?.password === "string" && body.password.length <= 200 && await igualSeguro(body.password, ctx.adminPassword);
  const r = await ctx.rpc("admin_registrar_intento", { p_ip: ip, p_ok: correcta });
  if (!correcta) return r.bloqueada ? err(429, "bloqueada", "Demasiados intentos. Probá en 10 minutos.") : err(401, "incorrecta", "Contraseña incorrecta");
  const token = tokenAleatorio();
  await ctx.rpc("admin_crear_sesion", { p_token: token });
  return ok({ token, venceEnMinutos: 30 });
}

/* ---------- admin-action ---------- */
async function adminAction(body, ctx) {
  if (!(await ctx.rpc("admin_sesion_valida", { p_token: typeof body?.token === "string" ? body.token : "" })))
    return err(401, "sesion_vencida", "Tu sesión venció. Entrá de nuevo.");
  const d = body.deviceId;
  switch (body.accion) {
    case "list": return ok({ jugadoras: await ctx.rpc("admin_listar", {}) });
    case "history": return ok({ historial: await ctx.rpc("admin_historial", { p_limite: 200 }) });
    case "add_points": {
      const n = Number(body.cantidad);
      if (!deviceValido(d) || !Number.isInteger(n) || n === 0 || n < -300 || n > 300) return err(400, "cantidad_invalida", "La cantidad tiene que ser un número entero entre -300 y 300, distinto de 0.");
      if (typeof body.motivo !== "string" || !body.motivo.trim()) return err(400, "falta_motivo", "Escribí el motivo.");
      const r = await ctx.rpc("admin_sumar", { p_device: d, p_cantidad: n, p_motivo: body.motivo.slice(0, 200) });
      return r.ok ? ok(r) : err(400, r.error, "No se pudo aplicar.");
    }
    case "delete_player": {
      if (!deviceValido(d)) return err(400, "device_invalido", "Jugadora inválida.");
      const r = await ctx.rpc("admin_borrar", { p_device: d, p_motivo: typeof body.motivo === "string" ? body.motivo.slice(0, 200) : null });
      return r.ok ? ok(r) : err(400, r.error, "No se pudo borrar.");
    }
    case "restore_player": {
      if (!deviceValido(d)) return err(400, "device_invalido", "Jugadora inválida.");
      const r = await ctx.rpc("admin_restaurar", { p_device: d });
      return r.ok ? ok(r) : err(400, r.error, "No se pudo restaurar.");
    }
    default: return err(400, "accion_invalida", "Acción desconocida.");
  }
}

Deno.serve(servir(startGame));
