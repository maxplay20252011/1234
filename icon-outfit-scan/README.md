# ICON Outfit Scan

Versión del ICON Outfit Challenge en la que las tarjetas **se escanean** en lugar de elegirse en pantalla. El resto (motor de outfits, imagen, resultado, pantalla completa, reinicio) es el mismo código que `../icon-outfit-challenge`.

## Antes del stand

1. Imprimí `tarjetas/tarjetas-icon-outfit.pdf` (A4, sin escalar, "tamaño real"). Son 20 tarjetas de 63 × 88 mm: 8 de estilo, 4 de clima y 8 de evento. Cortá por la línea punteada.
2. Abrí el artefacto en el celular o la tablet del stand y probá una tarjeta de cada categoría.

## Cómo se lee una tarjeta

| Forma | Cuándo usarla | Qué pasa |
|---|---|---|
| **Activar cámara** | Si la página se abre fuera del visor de Claude (ver abajo) | Pide permiso de cámara y lee los QR en vivo, uno tras otro. |
| **Sacar o subir foto** | Siempre funciona | En el celular abre la cámara nativa. La foto puede tener una sola tarjeta o las tres juntas. |
| **Claude lee el texto** | Tarjetas sin QR (por ejemplo, las originales) | Si la foto no tiene QR, Claude lee el texto impreso. La primera vez pide permiso y usa el plan de Claude de quien tiene la página abierta. |
| **Elegir a mano** | Si algo falla | Debajo del escáner, el formulario de la primera versión. |

Cada QR guarda el texto `ICON|categoría|opción` (por ejemplo `ICON|estilo|glam`). La app también reconoce sinónimos en texto impreso: "Calor", "Invierno", "Boliche", "Bohemio", etc.

### Sobre la cámara en vivo

Dentro del visor de artefactos de Claude la cámara en vivo está bloqueada: la página no puede pedir el permiso. Por eso, si **Activar cámara** falla, la app lo dice y resalta **Sacar o subir foto**, que sí funciona porque usa la cámara del sistema. Para tener cámara en vivo hay que publicar `index.html` en un sitio propio con HTTPS (Vercel, Netlify, GitHub Pages). Ahí la lectura por QR funciona igual, pero la lectura de texto con Claude no.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La app en un solo archivo (generado). |
| `src/app.html` | Estructura y estilos (pantalla de escaneo). |
| `src/lector.js` | Intérprete de tarjetas, lectura de QR (varias por foto), cámara y lectura con Claude. |
| `src/build.cjs` | Arma `index.html` con el motor y la interfaz de `../icon-outfit-challenge/src`. |
| `tarjetas/` | `qrs.py` (QR de cada tarjeta), `generar.cjs` (PDF e imágenes), el PDF y una imagen por tarjeta. |
| `pruebas/lector.test.cjs` | 52 casos del intérprete (QR, texto, sinónimos, ambigüedades). |
| `pruebas/e2e.cjs` | Flujo completo en Chromium: fotos, foto con tres tarjetas, cámara en vivo simulada, sin cámara y a mano. |
| `qr-outfit-scan.png` / `qr-simple.png` | QR que abre este artefacto. |

## Probar

```bash
node src/build.cjs
node pruebas/lector.test.cjs
JSQR=ruta/jsQR.js FOTOS=carpeta node pruebas/e2e.cjs   # ver comentario al inicio del archivo
```
