# SFX de la intro

Esta carpeta va **vacía** en el repo a propósito: no se incluye audio con
copyright. `scripts/build.sh` funciona igual sin archivos acá (genera una
pista de silencio AAC 48 kHz estéreo), y en cuanto aparezcan los WAV los
mezcla y normaliza a **-14 LUFS** automáticamente.

## Archivos que espera (nombres exactos)

| Archivo | Entra en | Qué buscar |
|---|---|---|
| `01_grid_riser.wav`   | 0.00 s | riser/whoosh corto y sintético, sube 0.5 s |
| `02_blocks.wav`       | 0.50 s | golpes secos de bloques apilándose (madera/piedra), tipo *thunk thunk* |
| `03_vault_door.wav`   | 1.30 s | metal girando + cerrojo + chirrido de bisagra |
| `04_title_impact.wav` | 2.18 s | impacto grave con cola corta (el título entra en 2.20) |
| `05_coins.wav`        | 3.10 s | monedas cayendo / caja registradora |
| `06_flash_out.wav`    | 3.66 s | swoosh de salida, corto |

Los tiempos, los nombres y el volumen de cada uno salen de `config.json` →
`audio.cues`. Si querés otro archivo, otro instante o bajarle el volumen,
tocá ahí y no el script.

## Formato recomendado

- WAV PCM 24 bit, 48 kHz, estéreo (mono también sirve).
- Sin normalizar y sin fade de salida: el `loudnorm` del build se encarga.
- Que no pasen de la duración de la intro; lo que sobre se recorta.

## De dónde sacarlos sin problemas de licencia

Todo lo que uses tiene que ser **CC0 / dominio público** o de tu propia
grabación. Opciones habituales: freesound.org filtrando por licencia CC0,
packs CC0 de opengameart.org, o generarlos vos mismo (un golpe de mesa
grabado con el celular + un compresor ya es un `02_blocks.wav` decente).

**No uses** sonidos extraídos de Minecraft ni música con copyright: el
video se va a comer un reclamo.
