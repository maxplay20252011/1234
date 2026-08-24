# Bank Tycoon — intro animada por código (canal MAXWER)

Intro de 4 s renderizada 100 % por código: la animación es HTML/CSS/JS,
Puppeteer captura los frames uno por uno y FFmpeg los ensambla. **No hay
editor de video en el medio** y todo el look sale de `config.json`.

Sin librerías: nada de React, Three.js, GSAP ni canvas. Los cubos voxel son
`transform: translate3d/rotate` sobre divs con `transform-style: preserve-3d`,
y las caras que no se ven las descarta el propio `backface-visibility`.

```
bank-tycoon-intro/
  config.json          textos, colores, tiempos, beats on/off, audio, encode
  src/
    intro.html         capas de la escena
    styles.css         todo el look (sin @keyframes ni transition, a propósito)
    animation.js       motor: INTRO.seek(t) deja el DOM en el frame exacto de t
  scripts/
    render.mjs         captura determinística frame a frame
    build.sh           ffmpeg: frames -> mp4 + audio, versión alfa, verificación
  assets/
    fonts/             Anton + Press Start 2P (OFL) con fallback si faltan
    sfx/               vacía — ver assets/sfx/README.md
  out/
    preview/           6 stills de control + prueba de legibilidad al 30 %
    frames/            PNG intermedios (no se versionan)
```

---

## 1. Requisitos

- **Node 20+** (probado en 22)
- **FFmpeg 6+** con `libx264`, `aac`, `libvpx-vp9` y el filtro `loudnorm`

Verificá con `node -v` y `ffmpeg -version`. Si falta FFmpeg:

```bash
# macOS
brew install ffmpeg

# Ubuntu / Debian / WSL
sudo apt-get update && sudo apt-get install -y ffmpeg

# Windows (PowerShell como admin)
winget install Gyan.FFmpeg      # o: choco install ffmpeg-full
```

Si falta Node: <https://nodejs.org> (LTS) o `brew install node` /
`winget install OpenJS.NodeJS.LTS`.

## 2. Uso

```bash
npm i                                        # baja Puppeteer + su Chromium
node scripts/render.mjs --format=vertical    # 1080x1920, 4 s, 240 frames
bash scripts/build.sh                        # mp4 + verificación con ffprobe
```

Salida: `out/bank-tycoon-intro_vertical_4s.mp4`

### Variantes

```bash
node scripts/render.mjs --format=horizontal              # 1920x1080
node scripts/render.mjs --format=vertical --variant=short # 1.2 s
node scripts/render.mjs --format=vertical --with-alpha    # + pase con canal alfa
node scripts/render.mjs --format=vertical --stills-only   # sólo los 6 stills
node scripts/render.mjs --serve                           # preview en el navegador
bash scripts/build.sh --prores                            # además ProRes 4444
```

La variante corta no tiene un timeline aparte: `render.mjs` escala todos los
beats por `duration / baseDuration`, así que 1.2 s es la misma intro comprimida.

### Preview interactivo

`node scripts/render.mjs --serve` levanta un server local e imprime la URL.
En la consola del navegador podés hacer `INTRO.seek(2.5)` para saltar a
cualquier instante, y agregar `?safe=1` a la URL para ver las guías de zona
segura pintadas encima.

## 3. Editar la intro sin tocar código

Todo vive en `config.json`:

| Querés cambiar | Tocá |
|---|---|
| Título, tagline, kicker, marca | `text.*` |
| Paleta | `colors.*` |
| Duración total / fps | `timeline.duration`, `timeline.fps` |
| Cuándo pasa cada cosa | `beats.<beat>.start` / `.end` |
| Apagar un beat entero | `beats.<beat>.enabled: false` |
| Tamaño y densidad de la bóveda | `beats.vault.cubeSize`, `.moneyRatio`, `.billRatio` |
| Cuánto abre la puerta | `beats.door.openDeg` |
| Entrada del título (escala, blur, kerning) | `beats.title.*` |
| Cantidad de monedas | `beats.brand.coins` |
| Encuadre por formato | `formats.<fmt>.stageZoom`, `.stageY`, `.titleScale` |
| Zona segura | `formats.<fmt>.safeTop` / `.safeBottom` / `.safeSide` |
| Calidad / peso | `encode.crf`, `encode.preset`, `encode.maxSizeMB` |
| SFX y loudness | `audio.cues`, `audio.targetLufs` |

El título se **autoajusta**: `animation.js` mide el texto con la fuente ya
cargada y escala el bloque para que ni siquiera en su fotograma más ancho
(escala 1.15 + kerning inicial + contorno) se salga del margen seguro. Podés
poner un título más largo y no se rompe. `text.titleLayout` acepta `"auto"`
(2 líneas en vertical, 1 en horizontal), `"1line"` o `"2lines"`.

## 4. Timeline (4 s @ 60 fps)

| Beat | Tiempo | Qué pasa |
|---|---|---|
| `grid`  | 0.00–0.50 | negro; grilla isométrica dorada que se dibuja desde el centro con un filo brillante, micro shake |
| `vault` | 0.50–1.30 | ~90 cubos voxel de oro y billete caen con gravedad y se apilan sobre un plinto formando la bóveda |
| `door`  | 1.30–2.20 | gira el volante, la puerta abre sobre su bisagra vertical, sale luz dorada y un barrido cruza la pantalla |
| `title` | 2.20–3.10 | "BANK TYCOON" entra: escala 1.15→1.00, blur 8→0 px, kerning 22→2 px, contorno negro grueso y sombra dura dorada |
| `brand` | 3.10–3.70 | tagline + placa MAXWER en la esquina, lluvia de monedas con parábola |
| `flash` | 3.70–4.00 | destello blanco y corte limpio (a negro, o a transparente en la versión alfa) |

## 5. Determinismo

No hay `requestAnimationFrame`, ni `@keyframes`, ni `transition` en ningún
lado. Existe una sola función pura de tiempo, `INTRO.seek(t)`, que deja el DOM
en el estado exacto de ese instante; `render.mjs` la llama con `t = i / fps` y
saca la captura. Todo lo "aleatorio" (materiales de los cubos, retardos de
caída, trayectorias de las monedas) sale de un PRNG *mulberry32* con la semilla
`timeline.seed`, y el shake es una suma de senos de fase fija.

Resultado: **el mismo `config.json` produce PNG bit a bit idénticos**. Está
verificado comparando MD5 entre dos corridas completas.

Dos detalles que costaron eso y conviene no deshacer:
- las caras de los cubos usan colores planos calculados en JS, no
  `filter: brightness()` — el filtro metía un pase de compositing que variaba
  ±1/255 entre corridas;
- `render.mjs` lanza Chromium con `--disable-skia-runtime-opts`,
  `--disable-partial-raster` y `--force-color-profile=srgb`, entre otros.

## 6. Salidas y verificación

`build.sh` produce y después chequea con `ffprobe`:

- **MP4** H.264 High@4.2, `yuv420p`, CRF 18, `+faststart`, BT.709;
  audio AAC 48 kHz estéreo (silencio si no hay SFX, o la mezcla normalizada
  a −14 LUFS / −1.5 dBTP si los hay).
- **WebM** VP9 con canal alfa real (`alpha_mode=1`), para superponer sobre el
  gameplay. Con `--prores`, además un `.mov` ProRes 4444 `yuva444p10le`.

Chequeos que corren solos y hacen fallar el build si no dan:

- resolución, fps, cantidad de frames y duración exactas;
- frames 1:1 con los PNG (`-fps_mode passthrough`) + control cruzado con
  `mpdecimate`;
- peso del MP4 bajo `encode.maxSizeMB` (8 MB);
- presencia real del canal alfa en la versión overlay;
- **zona segura**: `render.mjs` mide el rectángulo del *texto* (no de la caja)
  cada 1/30 s a lo largo de toda la intro y verifica que nada quede a menos de
  120 px del borde superior ni a 320 px del inferior en 9:16.

Además `out/preview/` queda con los 6 stills (t = 0.3 / 1.0 / 1.8 / 2.5 / 3.2 /
3.9) y con `legibility_30pct_vertical.png`, que es el still del título reducido
al 30 % para leerlo como se ve en un celular.

## 7. Concatenar con el gameplay

```bash
# opción A: recodifica (siempre funciona)
ffmpeg -i out/bank-tycoon-intro_vertical_4s.mp4 -i gameplay.mp4 \
  -filter_complex "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]" \
  -map "[v]" -map "[a]" -c:v libx264 -crf 18 -preset slow \
  -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart final.mp4

# opción B: como overlay sobre el gameplay (versión alfa)
ffmpeg -i gameplay.mp4 -c:v libvpx-vp9 -i out/bank-tycoon-intro_vertical_4s_alpha.webm \
  -filter_complex "[0:v][1:v]overlay=0:0:eof_action=pass" \
  -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a copy final.mp4
```

Para el concat directo (`-c copy` con demuxer concat) el gameplay tiene que
compartir resolución, fps, perfil y parámetros de audio con la intro.

## 8. Licencias y restricciones

- Todo lo visual está **generado por código**: no hay texturas, sprites ni
  assets de Mojang, ni la fuente oficial de Minecraft.
- Fuentes: Anton y Press Start 2P, ambas **SIL OFL 1.1** — ver
  `assets/fonts/LICENSE.md`.
- Audio: la carpeta `assets/sfx/` va vacía. Poné ahí SFX **CC0** o propios;
  ver `assets/sfx/README.md`.

## 9. Notas de entorno

- Puppeteer baja su propio Chromium en `npm i`. Si estás en un contenedor o CI
  donde esa descarga está bloqueada, instalá con `PUPPETEER_SKIP_DOWNLOAD=1` y
  apuntá `PUPPETEER_EXECUTABLE_PATH` (o `CHROME_PATH`) a un Chromium existente:
  `render.mjs` lo respeta y, si no, prueba las rutas típicas del sistema.
- Tiempos de referencia (contenedor Linux, sin GPU): ~65 s el pase de 240
  frames en 9:16, ~70 s el pase alfa, ~40 s el encode.
