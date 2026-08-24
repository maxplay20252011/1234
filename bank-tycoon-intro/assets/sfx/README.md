# SFX de la intro

Esta carpeta va **vacía** en el repo a propósito: no se incluye audio con
copyright ni nada extraído de Minecraft. `scripts/build.sh` funciona igual
sin archivos acá (genera una pista de silencio AAC 48 kHz estéreo), y en
cuanto aparezcan los WAV los mezcla y normaliza a **-14 LUFS** solo.

## Archivos que espera (nombres exactos)

| Archivo | Entra en | Qué buscar |
|---|---|---|
| `01_block_break.wav` | 0.28 s | golpe seco + crujido de piedra rompiéndose |
| `02_build.wav`       | 0.45 s | serie de "thunk" de bloques asentándose, ~0.7 s |
| `03_chest_open.wav`  | 1.20 s | bisagra de madera + metal, tipo cofre abriéndose |
| `04_title.wav`       | 1.98 s | impacto grave con cola corta (el título entra en 2.00) |
| `05_levelup.wav`     | 2.90 s | arpegio corto de subida de nivel / caja registradora |
| `06_explode.wav`     | 3.58 s | estallido corto y brillante, sin cola larga |

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
grabarlos: un golpe de mesa con el celular más un compresor ya es un
`02_build.wav` decente.

**No uses** sonidos de Minecraft ni música con copyright: el video se come
un reclamo.
