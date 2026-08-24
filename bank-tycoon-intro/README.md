# Bank Tycoon — intro side-scroller pixel art (canal MAXWER)

Un muñeco blocky camina de perfil hasta un banco construido con bloques y
aparece el título. Todo renderizado por código: **Canvas 2D puro**,
Puppeteer captura los frames y FFmpeg los ensambla. Sin editor de video,
sin librerías y sin un solo asset externo — ni siquiera una fuente.

Tres reglas gobiernan el proyecto:

1. **Pipeline pixel-perfect.** Se anima a **270x480** y se escala a
   **1080x1920** con `flags=neighbor`. Cada píxel de textura termina
   ocupando 8x8 en el video final. Nunca se interpola nada.
2. **Lógica a 20 ticks/s** aunque el video salga a 60 fps. `seek(t)`
   empieza con `tick = floor(t*20)` y todo se calcula desde ese entero.
3. **Paleta cerrada de 16 colores.** El sombreado por caras *elige un tono
   de la rampa* en vez de multiplicar el color, y la viñeta y el fundido
   se hacen con dithering. Así la intro nunca inventa un color nuevo, y
   `render.mjs` lo verifica tick por tick.

```
bank-tycoon-intro/
  config.json          textos, paleta, personaje, tiempos, beats on/off
  src/
    intro.html         un canvas y nada más
    styles.css         image-rendering: pixelated (y poco más)
    blocks.js          texturas procedurales 16x16 + tiles con caras y AO
    character.js       rig del muñeco y ciclo de caminata
    font.js            tipografía bitmap propia de 5x7
    animation.js       motor: INTRO.seek(t) deja el canvas en el frame de t
  scripts/
    render.mjs         captura determinística a 270x480 + verificaciones
    build.sh           ffmpeg: upscale nearest -> mp4 + audio + versión alfa
  assets/sfx/          vacía — ver assets/sfx/README.md
  out/
    preview/           6 stills escalados, contact sheet del ciclo y zoom x8
    preview/low/       los mismos stills en 270x480 nativos
    frames/            PNG intermedios (no se versionan)
```

---

## 1. Requisitos

- **Node 20+** (probado en 22)
- **FFmpeg 6+** con `libx264`, `aac`, `libvpx-vp9` y el escalador `neighbor`

```bash
brew install ffmpeg                                    # macOS
sudo apt-get update && sudo apt-get install -y ffmpeg   # Ubuntu / Debian / WSL
winget install Gyan.FFmpeg                              # Windows
```

## 2. Uso

```bash
npm i                                        # baja Puppeteer + su Chromium
node scripts/render.mjs --format=vertical    # 240 frames de 270x480
bash scripts/build.sh                        # upscale x4 nearest + mp4 + verificación
```

Salida: `out/bank-tycoon-intro_vertical_4s.mp4` (1080x1920)

```bash
node scripts/render.mjs --format=horizontal               # 480x270 -> 1920x1080
node scripts/render.mjs --format=vertical --variant=short # 1.2 s: frenada + título + partículas
node scripts/render.mjs --format=vertical --with-alpha    # + pase con canal alfa
node scripts/render.mjs --format=vertical --stills-only   # sólo stills y contact sheet
node scripts/render.mjs --serve                           # preview en el navegador
bash scripts/build.sh --prores                            # además ProRes 4444
```

`--serve` imprime una URL con `&zoom=2`; en la consola del navegador podés
hacer `INTRO.seek(2.5)` para saltar a cualquier instante.

## 3. Editar sin tocar código

| Querés cambiar | Tocá |
|---|---|
| Título, marca, cartel del banco, contador | `text.*` |
| Paleta completa (16 colores) | `palette.*` |
| Color del personaje: piel, traje, camisa, corbata, pelo | `character.*` |
| Amplitud de piernas y brazos, ciclo, bob | `character.legSwingDeg`, `.armSwingDeg`, `.cycleTicks`, `.poseTicks`, `.bobTexPx` |
| Dónde se para el personaje | `character.xFrac` |
| Velocidad de caminata y parallax | `scene.walkSpeed`, `.parallaxFar`, `.parallaxNear` |
| Alto de la pared cercana | `scene.nearWallRows` |
| Viñeta | `scene.vignette`, `.vignetteCenterY`, `.vignetteInner` |
| Parpadeo de antorchas | `scene.torchFlickerTicks` |
| Cuándo pasa cada cosa | `beats.<beat>.start` / `.end` |
| Apagar un beat entero | `beats.<beat>.enabled: false` |
| Caída del título y sombra dura | `beats.title.fallBlocks`, `.shadowOffset` |
| Encuadre por formato | `formats.<fmt>.floorTop` / `.titleY` / `.hudY` / `.bankRows` |
| Zona segura | `formats.<fmt>.safeTop` / `.safeBottom` / `.safeSide` |
| Límite de colores del chequeo | `pixel.maxColors` |
| Calidad y peso | `encode.crf`, `.preset`, `.maxSizeMB` |
| SFX y loudness | `audio.cues`, `audio.targetLufs` |

La textura **no guarda colores**: guarda índices de tono (0 claro / 1 medio
/ 2 oscuro). El color sale de `palette` al armar el tile. Por eso cambiar un
hex repinta todo sin regenerar nada — y si agregás un color nuevo, el
chequeo de paleta te avisa en el mismo render.

El título se **autoajusta**: elige la mayor escala **entera** que entre en
el ancho seguro (media escala rompería el pixel-perfect) y se parte en dos
líneas en vertical.

## 4. Timeline (4 s @ 60 fps, lógica a 20 ticks/s)

| Beat | Tiempo | Qué pasa |
|---|---|---|
| `fade`  | 0.00–0.30 | fundido desde negro con dithering; el personaje ya viene caminando |
| `walk`  | 0.30–1.80 | caminata en el lugar, el mundo scrollea. Dos capas de tablones con parallax (40 % y 75 %). Polvo en cada pisada. El banco asoma por la derecha a los ~1.2 s |
| `stop`  | 1.80–2.30 | desaceleración con easing cuadrático, frena frente a la puerta y gira a cámara en 2 pasos discretos (perfil → 3/4 → frente). Un lingote de oro cae y rebota a sus pies |
| `title` | 2.30–3.10 | "BANK TYCOON" entra letra por letra, cada una cayendo como un bloque, con sombra dura desplazada |
| `hud`   | 3.10–3.65 | contador de monedas subiendo y el logo MAXWER como ítem en un slot de hotbar |
| `burst` | 3.65–4.00 | destello de 2 ticks, explosión de partículas cúbicas doradas y corte a alfa |

La variante corta (`--variant=short`) apaga `walk` y `hud` y reubica
frenada, título y partículas en 1.2 s.

## 5. Cómo está hecho el personaje

Medidas en unidades de textura (1 tu = 1 px de textura = 2 px de canvas =
8 px del video final): cabeza 8x8, torso 4x12 de perfil, brazo 4x12,
pierna 4x12. Total 32 tu = 2 bloques de alto, igual que un jugador.

Camina **en el lugar**, fijo en `xFrac` (35.5 % del ancho); lo que se mueve
es el mundo. La cámara nunca se desplaza en vertical.

El ciclo dura 10 ticks y cambia de pose cada 2 → **5 poses discretas**. El
ángulo sale de un seno muestreado en esas 5 poses: nunca se interpola. Las
extremidades **no se rotan en el canvas**: cada ángulo se rasteriza una vez
a un sprite de píxeles recorriendo el destino y mapeando hacia atrás, así
que cada píxel toma un texel exacto o queda transparente. Eso es lo que da
la rotación "por frames discretos" sin un borde suave.

La pierna y el brazo de atrás usan tonos más oscuros que los de adelante:
sin eso las dos piernas se funden en un solo bloque gris.

## 6. Sombreado y acabado

- **Una sola dirección de luz** (arriba-izquierda) en todos los bloques:
  cara superior expuesta → tono claro (100 %), cuerpo → tono medio (80 %),
  lateral derecho y base → tono oscuro (60 %).
- **AO pixelado**: 1 px de sombra en cada encuentro entre bloques, y líneas
  de contacto donde el suelo toca la pared y donde la fachada se apoya.
- **Viñeta con dithering Bayer**, centrada abajo (a la altura de la acción)
  para que el título entre sobre negro. Oscurecer multiplicando inventaría
  colores; el dithering no.
- **Easing** en la desaceleración de la cámara (cuadrático) y en la entrada
  del banco, que viaja con el mundo y por lo tanto hereda esa curva.
- **16 colores en pantalla**, verificados tick por tick.

## 7. Determinismo

No hay `requestAnimationFrame` ni animaciones CSS: una sola función pura de
tiempo, `INTRO.seek(t)`. Todo lo "aleatorio" —ruido de las texturas, polvo
de las pisadas, partículas— sale de un PRNG *mulberry32* con la semilla de
`config.json`. Las posiciones de cámara se precalculan por tick.

**El mismo `config.json` produce PNG bit a bit idénticos**, verificado
comparando MD5 entre dos corridas completas.

## 8. Verificación (la corre `build.sh` sola)

- **Píxel cuadrado**: se escala un frame con `flags=neighbor` y se comprueba
  que cada bloque de 4x4 sea de un solo color. El truco: bajar por promedio
  de área y volver a subir con nearest; si el bloque era uniforme la ida y
  vuelta es la identidad y el PSNR da `inf`. **Falla el build si no da.**
  Sobre el MP4 comprimido se repite y se reporta el desvío (finito, sólo
  por H.264).
- **ffprobe**: resolución, fps, cantidad de frames y duración exactas.
- **Cadencia de ticks**: a 20 ticks/s y 60 fps, 2 de cada 3 frames son
  iguales *a propósito*; se verifica que los frames distintos no superen la
  cantidad de ticks lógicos. Si la superaran, algo se estaría interpolando.
- **Paleta**: máximo de colores simultáneos contra `pixel.maxColors`.
- **Zona segura**: se mide el rectángulo real de cada texto (no el de su
  caja) en cada tick.
- **Peso** bajo `encode.maxSizeMB` y **canal alfa** en la versión overlay.

`out/preview/` queda con los 6 stills a 1080x1920, los mismos en 270x480
nativos, `zoom8x_vertical.png` (recorte ampliado x8 para mirar el píxel de
cerca) y `walkcycle_vertical.png`, el contact sheet con los 10 ticks del
ciclo de caminata uno al lado del otro.

## 9. Concatenar con el gameplay

```bash
# A: recodifica (siempre funciona)
ffmpeg -i out/bank-tycoon-intro_vertical_4s.mp4 -i gameplay.mp4 \
  -filter_complex "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]" \
  -map "[v]" -map "[a]" -c:v libx264 -crf 18 -preset slow \
  -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart final.mp4

# B: como overlay (versión alfa)
ffmpeg -i gameplay.mp4 -c:v libvpx-vp9 -i out/bank-tycoon-intro_vertical_4s_alpha.webm \
  -filter_complex "[0:v][1:v]overlay=0:0:eof_action=pass" \
  -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a copy final.mp4
```

## 10. Licencias y restricciones

- **Cero assets de Mojang**: no hay texturas, sonidos, skins ni la fuente
  oficial. Las seis texturas (tablones horizontales y verticales, piedra
  pulida, cuarzo, oro, alfombra) se generan con ruido determinístico.
- **El personaje no es Steve**: es un muñeco genérico de rectángulos con
  proporciones de Minecraft y paleta configurable.
- **Tipografía propia**: bitmap de 5x7 dibujada glifo por glifo en
  `font.js`. No se carga ninguna fuente del sistema ni ningún TTF.
- **Audio**: `assets/sfx/` va vacía. Poné ahí SFX **CC0** o propios.
- **Sin librerías**: Canvas 2D puro.

## 11. Notas de entorno

- Puppeteer baja su propio Chromium en `npm i`. En un contenedor o CI donde
  esa descarga esté bloqueada, instalá con `PUPPETEER_SKIP_DOWNLOAD=1` y
  apuntá `PUPPETEER_EXECUTABLE_PATH` (o `CHROME_PATH`) a un Chromium
  existente: `render.mjs` lo respeta.
- Capturar a 270x480 es barato: el pase de 240 frames tarda ~10 s en un
  contenedor Linux sin GPU, y el build unos 25 s.
