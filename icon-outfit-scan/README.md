# ICON Outfit Scan

Versión del ICON Outfit Challenge en la que las tarjetas **se escanean** en lugar de elegirse en pantalla. El resto (motor de outfits, imagen, resultado, pantalla completa, reinicio) es el mismo código que `../icon-outfit-challenge`.

## Antes del stand

1. Imprimí `tarjetas/tarjetas-icon-outfit.pdf` (A4, sin escalar, "tamaño real"). Son 20 tarjetas de 63 × 88 mm: 8 de estilo, 4 de clima y 8 de evento. Cortá por la línea punteada.
2. Abrí el artefacto en el celular o la tablet del stand y probá una tarjeta de cada categoría.

## Cómo se lee una tarjeta

| Forma | Cuándo usarla | Qué pasa |
|---|---|---|
| **Sacar o subir foto** | Siempre funciona | En el celular abre la cámara nativa; en la computadora también se puede arrastrar una foto al recuadro. La foto puede tener una tarjeta o las tres juntas. |
| **Activar cámara** | Si la página se abre fuera del visor de Claude | Lee los QR en vivo, uno tras otro. Si el celular lo permite, aparecen linterna y zoom. |
| **Elegir a mano** | Si algo falla | Debajo del escáner, el formulario de la primera versión. |

Orden de lectura de cada foto:

1. **QR** con tres motores: el lector del navegador (si existe, por ejemplo Chrome en Android), **ZXing** y **jsQR**. Revisa la foto entera y después zonas con zoom ×2 y ×3; cada QR leído se tapa para encontrar los demás.
2. **Texto impreso, sin internet** (Tesseract, en español), si no hubo QR o si en una foto con varias tarjetas faltó alguna. Tolera errores de lectura ("Pasco al aire libre" → paseo al aire libre).
3. **Texto con Claude**, si lo anterior no alcanzó y el visor lo permite (pide permiso la primera vez).

Debajo de los botones, **Estado del lector** muestra qué motores cargaron, si la lectura de texto está disponible y qué leyó la última foto. Sirve para saber qué pasó si una tarjeta no se lee.

Cada QR guarda el texto `ICON|categoría|opción` (por ejemplo `ICON|estilo|glam`). También se reconocen sinónimos: "Calor", "Invierno", "Boliche", "Bohemio", etc.

### Medición (60 fotos difíciles simuladas)

`pruebas/banco.py` genera fotos de celular de 3000×4000 con tarjetas lejanas, giradas, inclinadas, borrosas, oscuras, con reflejo, ruido y compresión. Resultado en Chromium de escritorio:

| Versión | Fotos bien leídas | Tiempo medio |
|---|---|---|
| Anterior (solo jsQR) | 40 / 60 (67 %) | 4,9 s |
| Actual | **49 / 60 (82 %)**; tres tarjetas juntas: 8 de 12 (antes 1 de 12) | 4,2 s* |

\* El promedio incluye las fotos que no tienen QR legible y pasan por la lectura de texto (hasta ~9 s). Una foto con QR legible tarda entre 0,3 y 2 s. En un celular, contá entre 2 y 4 veces más.

Las 11 que fallan combinan desenfoque fuerte con ruido, o son tarjetas muy chicas, oscuras y con reflejo.

### Sobre la cámara en vivo y el visor de Claude

- Dentro del visor de artefactos la **cámara en vivo está bloqueada**: la página no puede pedir el permiso. Si **Activar cámara** falla, la app lo dice y resalta **Sacar o subir foto**.
- La **lectura de texto sin internet** necesita WebAssembly. Si el visor no lo permite, la app lo detecta al instante, lo muestra en el estado del lector y pasa directo a Claude (o a elegir a mano).
- Para cámara en vivo y lectura de texto garantizadas, publicá `index.html` con su carpeta `vendor/` en un sitio propio con HTTPS (Vercel, Netlify, GitHub Pages).

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La app en un solo archivo (generado). |
| `src/app.html` | Estructura y estilos (pantalla de escaneo). |
| `src/lector.js` | Intérprete de tarjetas (exacto y tolerante a errores), lectura de QR, lectura de texto, cámara y diagnóstico. |
| `vendor/` | jsQR, ZXing (caracteres de control escapados), Tesseract y el idioma español en base64. Se publican junto a la página. |
| `src/build.cjs` | Arma `index.html` con el motor y la interfaz de `../icon-outfit-challenge/src`. |
| `tarjetas/` | `qrs.py` (QR de cada tarjeta), `generar.cjs` (PDF e imágenes), el PDF y una imagen por tarjeta. |
| `pruebas/lector.test.cjs` | 52 casos del intérprete (QR, texto, sinónimos, ambigüedades). |
| `pruebas/e2e.cjs` | Flujo completo en Chromium: fotos, foto con tres tarjetas, sin QR, cámara en vivo simulada, sin cámara y a mano. |
| `pruebas/banco.py` / `pruebas/banco.cjs` | Genera las 60 fotos difíciles y mide cuántas se leen bien. |
| `pruebas/servidor.cjs` | Servidor local con una política de seguridad parecida a la del visor (con o sin WebAssembly). |
| `qr-outfit-scan.png` / `qr-simple.png` | QR que abre este artefacto. |

## Probar

```bash
node src/build.cjs
node pruebas/lector.test.cjs
node pruebas/servidor.cjs CARPETA 8811              # CARPETA con index.html (con <!doctype>) y vendor/
URL=http://localhost:8811/index.html FOTOS=carpeta node pruebas/e2e.cjs
python3 pruebas/banco.py BANCO && URL=http://localhost:8811/index.html node pruebas/banco.cjs BANCO index.html --fallas
```
