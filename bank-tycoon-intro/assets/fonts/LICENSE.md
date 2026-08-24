# Fuentes incluidas

Las dos son de licencia libre y se distribuyen bajo la
**SIL Open Font License 1.1 (OFL-1.1)**, que permite usarlas, redistribuirlas
y embeberlas en trabajos comerciales.

| Archivo | Familia | Autoría | Licencia |
|---|---|---|---|
| `Anton-Regular.ttf` | Anton | Vernon Adams, Cyreal | OFL-1.1 |
| `PressStart2P-Regular.ttf` | Press Start 2P | CodeMan38 | OFL-1.1 |

Texto completo de la licencia: <https://openfontlicense.org/>
Origen de los archivos: Google Fonts (<https://fonts.google.com>).

## Fallback sin internet / sin estos archivos

`src/intro.html` declara las `@font-face` apuntando a esta carpeta. Si los
`.ttf` faltan, la animación **no se rompe**: cae a las familias definidas en
`config.json` → `fonts.display.fallback` y `fonts.pixel.fallback`
(Impact / Arial Black / DejaVu Sans y Courier New / DejaVu Sans Mono).
El render avisa por consola cuando está usando el fallback, y el autoajuste
del título recalcula el tamaño con la métrica real de la fuente que haya.

Ninguna fuente, textura ni asset de Mojang se usa en este proyecto.
