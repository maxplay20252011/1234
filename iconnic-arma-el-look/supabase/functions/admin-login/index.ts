import { servir } from "../_shared/http.js";
import { adminLogin } from "../_shared/handlers.js";

Deno.serve(servir(adminLogin));
