# CLAUDE.md — notas de arquitectura

Guía para trabajar sobre este proyecto. El README está pensado para quien lo
usa; esto es para quien lo toca.

## Estado actual

**Fase 1 terminada.** Descubrimiento, base de datos, CLI de diagnóstico, API y
la pantalla que lista dispositivos. **No hay ningún adapter implementado
todavía**, así que no se puede controlar ningún televisor.

| Fase | Alcance | Estado |
|---|---|---|
| 1 | Base, descubrimiento, `npm run discover`, `GET /api/devices`, UI de lista | ✅ |
| 2 | `TvAdapter` + registry + adapter Samsung Tizen + Wake-on-LAN + UI de control | pendiente |
| 3 | Chromecast por castv2 (castear y volumen) | pendiente |
| 4 | MediaServer con Range, cast de URL y archivo, subtítulos, códecs | pendiente |
| 5 | `androidtvremote2` para el D-pad del Google TV, grupos, escenas, PWA, empaquetado | pendiente |

LG webOS, Roku y Vizio se detectan pero no tienen adapter: no hay hardware de
esas marcas para validarlos, y un adapter sin verificar contra el aparato real
es peor que ninguno.

## Estructura

```
shared/    Schemas zod. Fuente única de los tipos: el server y la web los
           importan de acá, nadie redefine un Device por su cuenta.
server/
  config.ts        .env validado con zod. Falla al arrancar, no en runtime.
  logger.ts        pino + protocolLog(), que escribe siempre en nivel debug.
  net/             Interfaces de red, cálculo de broadcast, lectura de ARP.
  discovery/       ssdp · mdns · upnp · probe · identify · service
  db/              schema (migraciones) · conexión · repositorio
  http/            Fastify, rutas y servido del build de la web.
  cli/discover.ts  La herramienta de diagnóstico.
web/       React + Vite + Tailwind. Mobile-first, oscuro.
```

## Decisiones que no hay que deshacer sin pensarlo

**El `id` del dispositivo nunca se deriva de la IP.** Es la regla central. El
DHCP cambia direcciones y, si el id dependiera de la IP, cada renovación
perdería las credenciales de emparejamiento del televisor — que cuestan un
pop-up y a veces un PIN. El orden de prioridad está en `resolveDeviceId()`:

1. `id` del TXT de mDNS (Chromecast) → uuid de fábrica
2. UDN de UPnP
3. Número de serie del Roku
4. MAC que declara el propio televisor
5. MAC de la tabla ARP del sistema
6. IP, marcado `unstableId: true` y avisado en la UI

**El orden dentro del escaneo importa.** SSDP y mDNS primero, después el sondeo
de puertos sobre los hosts encontrados, y **la tabla ARP al final**: es el
sondeo lo que fuerza al sistema operativo a resolver esas MAC. Leer ARP antes
devuelve una tabla casi vacía.

**El M-SEARCH sale por todas las interfaces.** Con una VPN, WSL o Docker
activos, el socket por defecto sale por la interfaz equivocada y el escaneo
devuelve cero con la red andando perfecto. Es la causa número uno de "no
aparece mi TV".

**`capabilities` sale vacío mientras no haya adapter.** Declarar que un
televisor "puede" subir el volumen sin código que lo respalde es exactamente el
adapter falso que este proyecto no quiere. Lo llena el `AdapterRegistry`.

## Cómo agregar un adapter

1. **Verificá el protocolo antes de escribir nada.** Documentación oficial si
   existe; si no, capturá tráfico real. Si no podés verificarlo, dejá
   `throw new NotImplementedError()` con un `TODO` explicando qué falta. Un
   adapter que "parece" andar hace perder más tiempo que uno que no existe.
2. Creá `server/src/adapters/<marca>/index.ts` implementando `TvAdapter`.
3. **Declará `capabilities` con lo que probaste contra el aparato**, no con lo
   que dice el manual. Los métodos que la marca no soporta van como opcionales
   y no se implementan; la UI los esconde sola.
4. Registralo en el `AdapterRegistry`.
5. Agregá tests de las funciones puras (armado de mensajes, parseo de
   respuestas). Lo que necesita hardware se prueba a mano y se documenta acá.
6. Anotá abajo las trampas que encuentres.

## Trampas por marca

Marcadas según su origen: **[doc]** hay documentación pública del fabricante;
**[rev]** es ingeniería inversa de la comunidad, puede romperse con cualquier
actualización de firmware.

### Samsung Tizen — el objetivo de la Fase 2
- **[doc]** `GET http://<ip>:8001/api/v2/` responde sin autenticación y trae
  `modelName`, `wifiMac` y `TokenAuthSupport`. Es la mejor fuente de datos de
  la marca y ya está implementada en `probe.ts`.
- **El año del modelo decide el protocolo.** Los dos primeros dígitos del campo
  `model` son el año (`20_KANTM_UHD` → 2020). Hasta 2015 no hay API de red;
  2016 usa `ws://` por el 8001 sin token; de 2017 en adelante `wss://` por el
  8002 con token y pop-up en pantalla.
- **[rev]** El canal de control es
  `wss://<ip>:8002/api/v2/channels/samsung.remote.control?name=<nombre en base64>`.
  El certificado es autofirmado: hay que aceptarlo explícitamente, y **eso vale
  solo para esta conexión**, nunca globalmente.
- **El token llega una sola vez**, en el evento de conexión, y hay que
  persistirlo cifrado. Si el usuario rechaza el pop-up, hay que resetear los
  permisos de dispositivos en el menú del televisor para que vuelva a aparecer.
- **No hay volumen absoluto** por el canal de control remoto, solo pasos.
  **[rev]** El absoluto existe por UPnP `RenderingControl` en el puerto 9197,
  pero no todos los modelos lo exponen: hay que detectarlo, no asumirlo.
- **El encendido es solo por Wake-on-LAN.** Y la MAC de cable es distinta de la
  de Wi-Fi: si guardaste la de Wi-Fi, el WoL por cable no va a funcionar nunca.

### Chromecast y Google TV
- Un Chromecast pelado y uno con Google TV **anuncian los dos** `_googlecast._tcp`
  y los dos dicen `md=Chromecast`. Lo que los distingue es que solo el Google TV
  anuncia además `_androidtvremote2._tcp`. Ya está implementado en
  `detectBrand()` y **el orden de esos dos `if` no es negociable**.
- El Chromecast **no es el televisor**: no tiene encendido ni entradas HDMI, y
  el volumen que controla es el suyo. Lo que enciende la TV es el HDMI-CEC
  cuando empieza a castear. O sea que "castear algo" *es* el encendido.
- **[rev]** castv2 en el 8009 sobre TLS: framing de 4 bytes big-endian más un
  protobuf `CastMessage`. Se implementa directo sobre `node:tls` porque
  `castv2-client` está abandonado.
- **Castear YouTube no es pasar la URL.** El `DefaultMediaReceiver` espera un
  stream directo, no una página. La app de Google usa el protocolo Lounge, que
  es privado. Ver la discusión en el README.

### LG webOS — sin hardware, sin adapter
- **[rev]** SSAP por WebSocket en el 3000 (`ws://`) o el 3001 (`wss://`).
- El handshake devuelve un `client-key` que hay que persistir; sin él, cada
  conexión dispara un pop-up nuevo.
- **Trampa grande: el D-pad no va por SSAP.** Hay que pedir
  `ssap://com.webos.service.networkinput/getPointerInputSocket`, que devuelve la
  ruta de un socket aparte, y mandar por ahí comandos de texto
  (`type:button\nname:LEFT\n\n`).
- Apagar sí; encender solo por Wake-on-LAN.

### Roku — sin hardware, sin adapter
- **[doc]** ECP es HTTP plano en el 8060. El más simple de todos.
- **Los sticks y boxes no controlan volumen**, solo los Roku TV. El campo
  `is-tv` de `/query/device-info` lo dice y ya lo parseamos.
- **No existe volumen absoluto en ECP**, solo `VolumeUp` / `VolumeDown`.
- Requiere que "Control por aplicaciones móviles" esté habilitado en el
  televisor (Configuración → Sistema → Configuración avanzada del sistema).

### Wake-on-LAN (Fase 2)
El magic packet son 6 bytes `0xFF` seguidos de la MAC repetida 16 veces. En la
práctica falla seguido, así que hay que mandarlo a `255.255.255.255` **y** al
broadcast de la subred, a los puertos **7 y 9**, repetido unas tres veces.
Muchos LG y Samsung modernos **ignoran el paquete por Wi-Fi y solo despiertan
por cable**. Si aun así no anda, es una opción del televisor, no un bug: se
llama "Encender móvil", "Wake on LAN" o "Conexión de red en espera".

## Cosas que están fuera de alcance

- **Duplicación de pantalla** (Miracast, AirPlay Mirroring, "Cast desktop"):
  son protocolos propietarios a nivel de driver, inalcanzables desde Node.js.
  La alternativa es castear un archivo o una URL.
- **AirPlay**: se detecta por mDNS, no se implementa.
- **Inventar endpoints**: si no se puede verificar, va `NotImplementedError`.

## Comandos

```bash
npm install
npm run discover                  # diagnóstico
npm run discover -- --raw         # con tráfico crudo
npm run discover -- --sweep --raw # barre las 254 IPs de la subred
npm run dev                       # backend con recarga
npm run dev:web                   # frontend en :5173, proxy al :8099
npm run build && npm start        # producción, todo en un puerto
npm test                          # vitest
npm run typecheck                 # tsc en los tres paquetes
```

`LOG_LEVEL=debug` muestra el tráfico crudo de todos los protocolos.
