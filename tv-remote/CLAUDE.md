# CLAUDE.md — notas de arquitectura

Guía para trabajar sobre este proyecto. El README está pensado para quien lo
usa; esto es para quien lo toca.

## Estado actual

**Fases 1 a 4 terminadas.** Descubrimiento, base de datos, CLI, API, estado en
vivo por WebSocket, el patrón adapter, el adapter de Samsung Tizen,
el adapter castv2 para dispositivos Cast, Wake-on-LAN, cifrado de credenciales,
casteo de URL y de archivos locales con historial, MediaServer con rangos HTTP,
subtítulos, detección de códecs y la pantalla de control completa.

**Ni el adapter de Samsung ni el de Cast están verificados contra hardware
real.** Los dos están escritos contra documentación de ingeniería inversa de la
comunidad. Las partes puras tienen tests, y el cliente castv2 se ejercita entero
contra un aparato falso sobre TLS; el comportamiento contra un aparato de verdad
hay que confirmarlo con `LOG_LEVEL=debug` la primera vez.

| Fase | Alcance | Estado |
|---|---|---|
| 1 | Base, descubrimiento, `npm run discover`, `GET /api/devices`, UI de lista | ✅ |
| 2 | `TvAdapter` + registry + adapter Samsung Tizen + Wake-on-LAN + UI de control | ✅ sin probar en hardware |
| 3 | Chromecast por castv2 (castear y volumen) | ✅ sin probar en hardware |
| 4 | MediaServer con Range, archivo local, subtítulos, códecs | ✅ sin probar en hardware |
| 5 | `androidtvremote2` para el D-pad del Google TV, grupos, escenas, empaquetado | pendiente |

La instalación en pantalla de inicio de iOS ya está hecha, adelantada de la
Fase 5 a pedido. Ver abajo por qué no llega a ser una PWA completa.

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
  adapters/        types · errors · samsung/ · chromecast/ · dlna/ · mock/
  media/           range · subtitles · mime · tokens · library · probe · server
  services/        wol · crypto · credentials.repo · control · state-hub
                   media-history · media-caster
  db/              schema (migraciones) · conexión · repositorio
  http/            Fastify, rutas, canal WebSocket y servido del build.
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

**Los métodos opcionales del `TvAdapter` son opcionales de verdad.** No existe
un `setVolume(level)` obligatorio, porque Roku no tiene volumen absoluto y en
Samsung el mute es un interruptor, no un valor. Con una interfaz que los
obligara, esos adapters tendrían que fingir mandando pasos a ciegas. En su
lugar: `capabilities()` declara lo que el aparato probó poder hacer, el
`ControlService` rechaza lo que no está con un mensaje claro, y la interfaz
esconde el control en vez de mostrar uno roto.

**Las capacidades se preguntan al aparato, no se deducen de la marca.** El
volumen absoluto de Samsung solo existe si ESE televisor contesta
`RenderingControl`, así que se sondea (`probeRenderingControl`) y recién ahí se
declara. Dos Samsung del mismo año pueden diferir.

**Todo mensaje de error que llega a la pantalla está en castellano y es
concreto.** `ControlError` lleva un `userMessage` que la ruta devuelve tal cual.
Nunca un "Error" pelado: si el televisor está apagado, hay que decir eso.

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

### Samsung Tizen — implementado, sin verificar en hardware
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
- **Sin selección directa de entrada HDMI.** No hay una tecla confiable entre
  modelos, así que no se declara la capacidad `input`: se expone `KEY_SOURCE`,
  que abre el menú de fuentes, y elige el usuario.
- **La lista de apps puede venir vacía.** Se pide con `ed.installedApp.get` y
  varios modelos 2020+ dejaron de responder. Si no contesta en dos segundos se
  devuelve vacía y la interfaz lo dice, en vez de inventar una lista.
- **El token nunca se loguea**, ni en `debug`. En la URL de conexión se
  reemplaza por `***`.

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

### Chromecast y Google TV — implementado, sin verificar en hardware

Lo de arriba sobre distinguirlos por mDNS sigue valiendo. Además:

- **El adapter se registra para `chromecast` Y para `androidtv`.** Un Chromecast
  con Google TV es las dos cosas: habla castv2 para reproducir y volumen, y
  `androidtvremote2` para la cruceta y el encendido (Fase 5). Sin registrarlo
  para las dos marcas, el aparato del usuario quedaría detectado pero sin
  control.
- **El protobuf está implementado a mano** (`protobuf.ts`), sin `protobufjs`. El
  `CastMessage` tiene siete campos de tipos básicos y su definición no cambia
  desde que existe el protocolo.
- **Dos cosas que el protocolo exige y son fáciles de pasar por alto:** hay que
  mandar `CONNECT` antes que nada *y de nuevo por cada destino nuevo* (la
  aplicación cargada tiene su propio `transportId`), y hay que mandar `PING`
  cada pocos segundos o el aparato corta sin avisar.
- **El volumen va de 0 a 1, no de 0 a 100.** La conversión está en un solo lugar
  (`setVolumePayload`) para que el resto del sistema siga hablando en
  porcentaje como todas las demás marcas.
- **No hay "subir un paso":** hay que leer el valor y escribir el nuevo.
- **castv2 no permite enumerar las aplicaciones instaladas.** `listApps()`
  devuelve vacío, que es la verdad.
- **`LOAD` necesita metadata válida.** Sin ella, algunos receptores rechazan la
  carga sin explicar por qué.

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

## iOS: instalable sí, PWA completa no

Los service workers exigen contexto seguro (HTTPS). Una dirección de LAN como
`http://192.168.1.10:8099` no lo es, así que **no se puede registrar un service
worker ni ofrecer instalación estándar**. No es evitable desde el código: es la
política del navegador.

Lo que sí funciona sobre HTTP plano es el mecanismo propio de Apple, anterior a
las PWA, y es lo que está implementado en `web/index.html`:
`apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`,
`apple-mobile-web-app-title` y `apple-touch-icon`. Con eso, "Agregar a pantalla
de inicio" deja un ícono real que abre a pantalla completa.

iOS nunca ofrece instalar por su cuenta (no existe `beforeinstallprompt`), así
que `InstallHint.tsx` muestra el aviso a mano, solo en iOS y solo fuera del modo
standalone.

Si en algún momento se quiere la PWA completa, el camino es `mkcert` más
instalar la CA en cada dispositivo. Es un paso manual por celular: no conviene
como opción por defecto.

Los íconos se generan con `node tools/generate-icons.mjs`, que rasteriza y
codifica PNG a mano con `node:zlib`. Es a propósito: no vale la pena sumar una
librería de imágenes al proyecto para algo que se corre una vez.

**`navigator.vibrate` no existe en Safari iOS.** Cuando la Fase 2 agregue
feedback háptico, hay que detectarlo antes de llamarlo.

## El MediaServer y por qué adelantar el video no siempre es exacto

El televisor **no lee el disco del servidor**. Lo que se le manda es una URL de
nuestro propio `MediaServer`, y el archivo viaja por HTTP desde la red local.
Por eso la URL se arma con la IP real de la LAN: con `localhost` el televisor se
estaría buscando a sí mismo.

Hay dos caminos, y la diferencia importa:

| Camino | Cuándo | Adelantar el video |
|---|---|---|
| **Directo** | El archivo ya es compatible | **Exacto.** Rangos HTTP reales, 206 con los bytes pedidos |
| **Conversión** | Códec o envase incompatibles | **Aproximado.** Se relanza `ffmpeg` desde otro punto |

La conversión no puede dar seek exacto y no es un defecto que se pueda arreglar:
el contenido se genera sobre la marcha, no hay un archivo con posiciones
conocidas contra el cual responder un rango. La barra del televisor queda
desfasada. Se eligió esto sobre la alternativa, que era no poder reproducir el
archivo en absoluto.

Detalles que cuesta descubrir solo:

- **`Range` no es opcional.** Sin él muchos televisores ni arrancan: piden los
  primeros bytes para leer la cabecera, y si les llega el archivo entero se
  cuelgan. Cubierto por tests unitarios y de integración HTTP.
- **La cabecera `contentFeatures.dlna.org` con `DLNA.ORG_OP=01`** es lo que
  declara que se admite búsqueda por bytes. Sin ella, varios Samsung reproducen
  pero no dejan adelantar.
- **Fastify genera un HEAD automático por cada GET**, y ese ejecuta el manejador
  entero descartando el cuerpo: leería el archivo completo para no mandarlo. Va
  `exposeHeadRoute: false` y un HEAD propio.
- **La comprobación de rutas se hace sobre la ruta REAL** (`realpath`), no sobre
  la pedida: un enlace simbólico dentro de la carpeta permitida podría apuntar a
  cualquier parte del disco. Y se compara con el separador final, porque
  `/videos-privados` no está dentro de `/videos` aunque el texto empiece igual.
- **Los enlaces caducan.** Protegen de dejar el disco expuesto para siempre, no
  de alguien dentro de la red mientras el enlace vive.

## Trampas ya pisadas

Cosas que costó encontrar y no conviene volver a romper:

- **El `StateHub` compara campo por campo para no difundir de más, así que un
  campo nuevo hay que agregarlo a la comparación.** Cuando se sumó `media`, la
  comparación no lo miraba: cambiar de video se descartaba como "sin novedad" y
  la interfaz mostraba el título anterior para siempre. Hay tests de regresión.
- **La posición de reproducción se compara redondeada al segundo.** Llega con
  decimales y, sin redondear, cada lectura parece un cambio y difunde sin parar.
- **`◀` y `▶` tienen forma de emoji por defecto y `▲`/`▼` no.** Todos los íconos
  van en SVG; no usar caracteres Unicode para flechas.
- **`exactOptionalPropertyTypes` está activo.** Un campo ausente y uno en
  `undefined` no son lo mismo: omitir la propiedad, no asignarle `undefined`.
- **El historial NO puede deduplicar por URL.** La URL de un archivo local lleva
  un token efímero distinto en cada envío: el mismo video generaba una entrada
  nueva cada vez, todas con tokens que al poco tiempo daban 403 al repetir. Se
  guarda una `ref` estable (el id del archivo) y se repite por ahí.
- **`formatDuration` recorta a cero ANTES de calcular los milisegundos.** Al
  revés producía `0:00:00.-10000`, que deja el DIDL-Lite inválido y el televisor
  descarta el envío en silencio.

## Probar sin hardware

```bash
MOCK_DEVICE=1 npm start
```

Agrega un televisor simulado a la lista. El `MockAdapter` imita a propósito las
incomodidades de uno real: pide emparejamiento, tarda en responder y el mute es
un interruptor. Es lo que permite ejercitar el `ControlService`, las rutas y el
estado en vivo de punta a punta, que es imposible con adapters reales en CI.

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
