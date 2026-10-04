import { servir } from "../_shared/http.js";
import { startGame } from "../_shared/handlers.js";

Deno.serve(servir(startGame));
