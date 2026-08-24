# Bank Tycoon — intro pixel-art por código (canal MAXWER)

Intro de 4 s con estética Minecraft, renderizada 100 % por código: la
animación es **Canvas 2D puro**, Puppeteer captura los frames uno por uno y
FFmpeg los ensambla. No hay editor de video, ni librerías, ni un solo asset
externo — ni siquiera una fuente.

Dos reglas gobiernan todo:

1. **Pipeline pixel-perfect.** Se anima a **270x480** y se escala a
   **1080x1920** con `flags=neighbor`. Nunca se interpola nada.
2. **Lógica a 20 ticks/s** aunque el video salga a 60 fps. `seek(t)` lo
   primero que hace es `tick = floor(t * 20)`; todo se calcula desde ese
   entero. Por eso el movimiento va a pasos y cada tick ocupa 3 frames.

```
bank-tycoon-intro/
  config.json          textos, paleta, tiempos, beats on/off, audio, encode
  src/
    intro.html         un canvas y nada más
    styles.css         image-rendering: pixelated (y poco más)
    blocks.js          texturas procedurales 16x16 + cubos isométricos 2:1
    font.js            tipografía bitmap propia de 5x7
    animation.js       motor: INTRO.seek(t) deja el canvas en el frame de t
  scripts/
    render.mjs         captura determinística frame a frame (a 270x480)
    build.sh           ffmpeg: upscale nearest -> mp4 + audio + versión alfa
  assets/sfx/          vacía — ver assets/sfx/README.md
  out/
    preview/           6 stills ya escalados + recorte con zoom x8
    preview/low/       los mismos stills en 270x480 nativos
    frames/            PNG intermedios (no se versionan)
```

---

## 1. Requisitos

- **Node 20+** (probado en 22)
- **FFmpeg 6+** con `libx264`, `aac`, `libvpx-vp9` y el escalador `neighbor`

Verificá con `node -v` y `ffmpeg -version`. Si falta FFmpeg:

```bash
brew install ffmpeg                                    # macOS
sudo apt-get update && sudo apt-get install -y ffmpeg   # Ubuntu / Debian / WSL
winget install Gyan.FFmpeg                              # Windows (o choco install ffmpeg-full)
```

Si falta Node: <https://nodejs.org> (LTS), `brew install node` o
`winget install OpenJS.NodeJS.LTS`.

## 2. Uso

```bash
npm i                                        # baja Puppeteer + su Chromium
node scripts/render.mjs --format=vertical    # captura 240 frames de 270x480
bash scripts/build.sh                        # upscale x4 nearest + mp4 + verificación
```

Salida: `out/bank-tycoon-intro_vertical_4s.mp4` (1080x1920)

### Variantes

```bash
node scripts/render.mjs --format=horizontal               # 480x270 -> 1920x1080
node scripts/render.mjs --format=vertical --variant=short # 1.2 s: sólo título + partículas
node scripts/render.mjs --format=vertical --with-alpha    # + pase con canal alfa
node scripts/render.mjs --format=vertical --stills-only   # sólo los stills
node scripts/render.mjs --serve                           # preview en el navegador
bash scripts/build.sh --prores                            # además ProRes 4444
```

`--serve` imprime una URL con `&zoom=2`; en la consola del navegador podés
hacer `INTRO.seek(2.5)` para saltar a cualquier instante.

## 3. Editar la intro sin tocar código

Todo vive en `config.json`:

| Querés cambiar | Tocá |
|---|---|
| Título, marca, contador de saldo | `text.*` |
| Paleta (3 tonos de oro, esmeralda, hierro, piedra, madera) | `palette.*` |
| Brillo por cara (100 / 80 / 60 %) | `pixel.faceBrightness` |
| Semilla de las texturas | `pixel.textureSeed` |
| Duración, fps, ticks/s | `timeline.*` |
| Cuándo pasa cada cosa | `beats.<beat>.start` / `.end` |
| Apagar un beat entero | `beats.<beat>.enabled: false` |
| Tamaño de la bóveda y del cofre | `scene.footprint`, `scene.chestFootprint` |
| Ritmo de construcción | `beats.vault.ticksPerPlace`, `.blocksPerStep` |
| Fotogramas de apertura de la tapa | `beats.chest.lidFrames` |
| Caída del título y sombra dura | `beats.title.fallBlocks`, `.shadowOffset` |
| Encuadre por formato | `formats.<fmt>.sceneY` / `.titleY` / `.hudY` |
| Zona segura | `formats.<fmt>.safeTop` / `.safeBottom` / `.safeSide` |
| Calidad y peso | `encode.crf`, `encode.preset`, `encode.maxSizeMB` |
| SFX y loudness | `audio.cues`, `audio.targetLufs` |

La textura **no guarda colores**: guarda índices de tono (0 claro / 1 medio /
2 oscuro). El color sale de `palette` al construir el sprite y encima se
aplica el brillo de la cara. Por eso cambiar un hex en el config repinta
todos los bloques sin regenerar nada.

El título se **autoajusta**: elige la mayor escala **entera** que entre en el
ancho seguro (media escala rompería el pixel-perfect) y se parte en dos
líneas en vertical. Podés poner un título más largo y no se rompe.

## 4. Timeline (4 s @ 60 fps, lógica a 20 ticks/s)

| Beat | Tiempo | Qué pasa |
|---|---|---|
| `drop`  | 0.00–0.45 | negro; cae un bloque de piedra a escala x3, rebota 2 ticks y estalla en partículas cúbicas de polvo |
| `vault` | 0.45–1.20 | la bóveda se arma capa por capa: piso de piedra, anillo de hierro con esquinas de oro, paredes del fondo. Una tanda cada 2 ticks con micro-shake de 1 px al asentar |
| `chest` | 1.20–2.00 | el cofre gigante abre la tapa en 4 fotogramas discretos (bisagra atrás) y salen lingotes y esmeraldas con giro en Y y bobbing |
| `title` | 2.00–2.90 | "BANK TYCOON" entra letra por letra, cada una cayendo como un bloque, con sombra dura desplazada |
| `hud`   | 2.90–3.60 | barra de experiencia verde de 0 a 100 %, contador de saldo subiendo y el logo MAXWER como ítem en el slot de la hotbar |
| `burst` | 3.60–4.00 | destello de 2 ticks, explosión de partículas cúbicas doradas y corte a alfa |

La variante corta (`--variant=short`) no es otro timeline: apaga `drop`,
`vault` y `chest` y reubica los tres beats restantes en 1.2 s.

## 5. Cómo se dibuja un bloque

Proyección isométrica falsa 2:1, como los renders de bloque:

```
screenX = (gx - gy) * 8        // B/2
screenY = (gx + gy) * 4 - gz * 16
```

Con `B = 16` todos los pasos son de 8 y 4 px: **siempre enteros**, nunca una
posición fraccionaria. Cada sprite de cubo se rasteriza a mano píxel por
píxel (`blocks.js`): para cada píxel se resuelve a qué cara pertenece y qué
texel le toca. No se usa `drawImage` con transformaciones, así que no hay ni
una costura entre caras ni un píxel interpolado.

Un bloque se descarta si tiene ocupados sus vecinos +x, +y y +z: son
exactamente las tres caras que esta cámara puede ver.

## 6. Determinismo

No hay `requestAnimationFrame` ni animaciones CSS. Existe una sola función
pura de tiempo, `INTRO.seek(t)`. Todo lo "aleatorio" —ruido de las texturas,
qué bloque es de oro, trayectorias de polvo y partículas, fase del giro de
los ítems— sale de un PRNG *mulberry32* con la semilla de `config.json`.

**El mismo `config.json` produce PNG bit a bit idénticos**, verificado
comparando MD5 entre dos corridas completas.

## 7. Verificación (la corre `build.sh` sola)

- **Píxel cuadrado**: se escala un frame con `flags=neighbor` y se comprueba
  que cada bloque de 4x4 sea de un solo color. El truco: bajar por promedio
  de área y volver a subir con nearest; si el bloque era uniforme la ida y
  vuelta es la identidad y el PSNR da `inf`. Si diera un número finito,
  el escalado no sería nearest y habría bordes borrosos. **Falla el build.**
  Sobre el MP4 ya comprimido se repite el chequeo y se reporta el desvío
  (finito, sólo por H.264).
- **ffprobe**: resolución, fps, cantidad de frames y duración exactas.
- **Cadencia de ticks**: se cuenta cuántos frames son distintos entre sí. A
  20 ticks/s y 60 fps, 2 de cada 3 frames son iguales *a propósito*; lo que
  se verifica es que los frames distintos **no superen** la cantidad de
  ticks lógicos. Si la superaran, algo se estaría interpolando entre ticks.
- **Zona segura**: `render.mjs` mide el rectángulo real de cada texto (no el
  de su caja) en cada tick y verifica que nada quede a menos de 120 px del
  borde superior ni 320 px del inferior en 9:16.
- **Peso** del MP4 bajo `encode.maxSizeMB`, y **canal alfa** presente en la
  versión overlay.

`out/preview/` queda con los 6 stills ya escalados a 1080x1920, los mismos
en 270x480 nativos (`preview/low/`) y `zoom8x_vertical.png`, un recorte
ampliado x8 para mirar el píxel de cerca.

## 8. Concatenar con el gameplay

```bash
# A: recodifica (siempre funciona)
ffmpeg -i out/bank-tycoon-intro_vertical_4s.mp4 -i gameplay.mp4 \
  -filter_complex "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]" \
  -map "[v]" -map "[a]" -c:v libx264 -crf 18 -preset slow \
  -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart final.mp4

# B: como overlay sobre el gameplay (versión alfa)
ffmpeg -i gameplay.mp4 -c:v libvpx-vp9 -i out/bank-tycoon-intro_vertical_4s_alpha.webm \
  -filter_complex "[0:v][1:v]overlay=0:0:eof_action=pass" \
  -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a copy final.mp4
```

Para el concat directo con `-c copy` el gameplay tiene que compartir
resolución, fps, perfil y parámetros de audio con la intro.

## 9. Licencias y restricciones

- **Cero assets de Mojang**: no hay texturas, sonidos ni la fuente oficial.
  Las cinco texturas (piedra, hierro, oro, esmeralda, madera) más la del
  cofre se generan con ruido determinístico en `blocks.js`.
- **Tipografía propia**: bitmap de 5x7 dibujada glifo por glifo en
  `font.js`. No se carga ninguna fuente del sistema ni ningún TTF.
- **Audio**: `assets/sfx/` va vacía. Poné ahí SFX **CC0** o propios; ver
  `assets/sfx/README.md`.
- **Sin librerías**: Canvas 2D puro. Nada de React, Three.js ni motores de
  animación.

## 10. Notas de entorno

- Puppeteer baja su propio Chromium en `npm i`. Si estás en un contenedor o
  CI donde esa descarga está bloqueada, instalá con `PUPPETEER_SKIP_DOWNLOAD=1`
  y apuntá `PUPPETEER_EXECUTABLE_PATH` (o `CHROME_PATH`) a un Chromium
  existente: `render.mjs` lo respeta y si no prueba las rutas típicas.
- Capturar a 270x480 es mucho más barato que a 1080x1920: el pase de 240
  frames tarda ~25 s en un contenedor Linux sin GPU.
