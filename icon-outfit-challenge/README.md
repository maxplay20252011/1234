# ICON Outfit Challenge

Juego para el stand de ICONNIC. El visitante elige tres tarjetas físicas (estilo personal, clima y tipo de evento); una persona del equipo marca esas elecciones en la app y la app arma un outfit ilustrado, con explicación, peinado y maquillaje sugeridos.

## Cómo usarla en el stand

1. Abrí el link del artefacto (o `index.html` en cualquier navegador moderno). No necesita registro, no guarda datos personales y, una vez cargada, funciona sin conexión salvo las tipografías.
2. **Crear mi outfit** → marcá una opción por tarjeta. La barra de abajo muestra el resumen; si falta una tarjeta, **Generar mi outfit** avisa cuál.
3. En el resultado:
   - **Ver en pantalla completa**: muestra el look grande para que se vea desde el stand (Esc o "Salir de pantalla completa" para volver).
   - **Probar otra combinación**: vuelve al formulario con las tarjetas actuales marcadas, para cambiar una sola.
   - **Ver otra versión con las mismas tarjetas**: otra propuesta para la misma combinación (útil si dos visitantes eligen lo mismo).
   - **Volver al inicio** o **Nuevo visitante** (arriba a la derecha): borra todo y empieza de cero.

## Cómo se arma el outfit

- **Motor de reglas local** (`src/motor.js`), sin servicios externos. Catálogo de ~80 prendas etiquetadas por afinidad con cada estilo, climas en los que sirven y rango de formalidad.
- **Reglas fijas**: nada fuera de su clima; con frío siempre hay abrigo de verdad; con lluvia, abrigo y calzado impermeables, paraguas y nada de ruedos largos; con calor no hay tercera prenda; sin taco en clases ni en paseos al aire libre; medias si las piernas quedan al aire con frío o lluvia.
- **El estilo cambia las prendas y la paleta**: cada estilo tiene su propia paleta de 5 colores y la ilustración se pinta con ella.
- **Sin suposiciones**: no se pregunta género, talle ni presupuesto. Cada look trae una alternativa (pantalón ↔ pollera/vestido) y el peinado contempla pelo largo y corto. El maquillaje se presenta como opcional.

## La imagen

La imagen es un **flat-lay compuesto**: prendas dibujadas en SVG (la misma librería de ilustración de `../iconnic-arma-el-look`) que se colorean con la paleta del estilo y se acomodan en una composición editorial. Cada número de la imagen coincide con la lista de abajo. **No es una imagen generada con IA**, y la app lo aclara debajo de la imagen.

### Si en el futuro se quiere IA de imágenes

No está implementado. Haría falta un servicio de generación de imágenes (por ejemplo, OpenAI Images, Stability o Replicate) **detrás de un servidor propio** que guarde la clave de API: la clave nunca puede ir en el HTML. El servidor recibiría la lista de prendas del look (`generarLook(...).piezas`) y devolvería la imagen. Además, la página publicada como artefacto no puede llamar a servicios externos, así que esa versión tendría que alojarse en otro lado (Vercel, Netlify, etc.).

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La app completa en un solo archivo (generado). |
| `src/app.html` | Estructura y estilos. |
| `src/motor.js` | Estilos, climas, eventos, catálogo y reglas (funciones puras). |
| `src/ui.js` | Pantallas, composición del flat-lay, pantalla completa. |
| `src/lib-ilustracion.js` | Librería de dibujo de prendas (copiada de `iconnic-arma-el-look`). |
| `src/build.cjs` | Arma `index.html`: `node src/build.cjs`. |
| `pruebas/motor.test.cjs` | Recorre las 256 combinaciones × 2 versiones y verifica las reglas. |
| `pruebas/e2e.cjs` | Prueba el flujo en Chromium (escritorio y celular) y saca capturas. |
| `VALIDACION.md` | Resultado de la última corrida de ambas pruebas. |

## Probar

```bash
node src/build.cjs                 # después de editar algo en src/
node pruebas/motor.test.cjs --mas  # reglas + looks de ejemplo (A, B, C y otros)
node pruebas/e2e.cjs               # requiere Playwright con Chromium
```

Para agregar una prenda: sumá un objeto a `CATALOGO` en `src/motor.js` (usando un `dibujo` que exista en la librería), corré el build y las pruebas.
