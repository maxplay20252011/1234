# SFX de la intro

Esta carpeta va **vacía** en el repo a propósito: no se incluye audio con
copyright ni nada extraído de Minecraft. `scripts/build.sh` funciona igual
sin archivos acá (genera una pista de silencio AAC 48 kHz estéreo), y en
cuanto aparezcan los WAV los mezcla y normaliza a **-14 LUFS** solo.

## Archivos que espera (nombres exactos)

| Archivo | Entra en | Qué buscar |
|---|---|---|
| `01_footsteps.wav`   | 0.30 s | pasos sobre piedra, en loop de ~1.5 s. El ciclo es de 0.5 s: si grabás 3 pasos calza justo |
| `02_bank_reveal.wav` | 1.20 s | riser corto o acorde grave: el banco asomando por la derecha |
| `03_stop_ingot.wav`  | 1.95 s | frenada + un lingote metálico rebotando en el piso |
| `04_title.wav`       | 2.28 s | impacto grave con cola corta (el título entra en 2.30) |
| `05_coins.wav`       | 3.10 s | monedas / caja registradora, acompañando el contador |
| `06_explode.wav`     | 3.63 s | estallido corto y brillante, sin cola larga |

Los tiempos, los nombres y el volumen de cada uno salen de `config.json` →
`audio.cues`. Si querés otro archivo, otro instante o bajarle el volumen,
tocá ahí y no el script.

## Formato recomendado

- WAV PCM 24 bit, 48 kHz, estéreo (mono también sirve).
- Sin normalizar y sin fade de salida: el `loudnorm` del build se encarga.
- Que no pasen de la duración de la intro; lo que sobre se recorta.

## De dónde sacarlos sin problemas de licencia

Todo tiene que ser **CC0 / dominio público** o grabado por vos. Opciones:
freesound.org filtrando por licencia CC0, packs CC0 de opengameart.org, o
grabarlos vos (unos pasos sobre baldosa con el celular ya sirven).

**No uses** sonidos de Minecraft ni música con copyright: el video se come
un reclamo.
