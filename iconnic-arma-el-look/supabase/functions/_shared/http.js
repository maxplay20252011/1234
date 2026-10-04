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

export function servir(handler) {
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
