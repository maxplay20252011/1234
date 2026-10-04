import { servir } from "../_shared/http.js";
import { submitScore } from "../_shared/handlers.js";

Deno.serve(servir(submitScore));
