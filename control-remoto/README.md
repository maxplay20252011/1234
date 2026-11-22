# Control remoto por internet (camino C: relay propio)

Celular (web) → **servidor relay** en internet ← **agente** en tu compu. El agente inicia la conexión (saliente), no se toca el router.

> Si solo querés usar tu compu a distancia, Chrome Remote Desktop o Tailscale son mejores opciones. Esto vale la pena solo si querés botones/acciones a medida.

## Probar en local
```bash
cp .env.example .env     # completá TOKEN (mín. 32 chars):
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
(cd server && npm install && npm run dev)      # terminal 1
(cd agent  && npm install && npm run dev)      # terminal 2
# abrí http://localhost:8080 y pegá el token
cd server && npm test                          # tests automáticos (9)
```
Requiere Node >= 20.6 (por `--env-file`).

## Publicar el servidor (Render / Railway / Fly.io — NO Vercel)
- Raíz del servicio = raíz del repo. Build: `npm --prefix server install`. Start: `node server/server.js`.
- Variables de entorno en el servicio: `TOKEN` (el mismo del .env) y `TRUST_PROXY=1`.
- Health check: `/healthz`. La web se sirve desde la misma URL (`https://tu-servicio/`), así que el celular usa `wss://` automáticamente.
- En tu compu, en `.env`: `SERVER_URL=wss://tu-servicio.onrender.com` y `cd agent && npm start`.
- Los planes gratuitos suelen "dormir" el servicio por inactividad: el agente reintenta solo, pero la primera conexión puede tardar.

## Agregar acciones
Editá `ACCIONES` en `agent/agent.js`. Los botones de la web se generan solos desde esa lista.
`peligrosa: true` exige confirmación en dos pasos. Nunca pases texto del mensaje a un shell; si necesitás un comando, `execFile` con argumentos fijos.

## Protocolo (JSON)
- Primer mensaje obligatorio: `{type:"auth", rol:"cliente"|"agente", token}` (5 s de plazo).
- Cliente → `{type:"orden", accion, nonce?}`. Agente → `{type:"resultado", cid, ok, ...}` (el servidor lo entrega solo al cliente que pidió).

## Seguridad: qué hay y qué falta
Hay: lista blanca, token en el primer mensaje (no en la URL/logs), comparación en tiempo constante, bloqueo de IP 15 min tras 5 fallos, límite de mensajes, confirmación de acciones peligrosas con nonce de un solo uso (atado al cliente), log JSON (`agent.log` en el agente), cabeceras CSP en la web.
**Falta (a propósito, es un MVP):** un único token compartido sin vencimiento (si se filtra, da control total: rotalo en el servicio y en `.env`); el token queda en `sessionStorage` del navegador de la pestaña; el límite de intentos vive en memoria (se reinicia con el servidor); un solo agente. Para algo serio: login con sesión/2FA o tokens de corta duración.
