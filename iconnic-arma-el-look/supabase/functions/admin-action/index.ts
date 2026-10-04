import { servir } from "../_shared/http.js";
import { adminAction } from "../_shared/handlers.js";

Deno.serve(servir(adminAction));
