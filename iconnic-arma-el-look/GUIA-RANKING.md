# Guía: poner en marcha el ranking de "Armá el look"

Tiempo estimado: 45 minutos la primera vez. No hace falta saber programar: vas a copiar, pegar y hacer clic.

**Qué vas a tener al final:**
- El juego publicado en una dirección propia, por ejemplo `arma-el-look.netlify.app`.
- Un ranking que comparten todas las personas que juegan, desde cualquier celular.
- La tuerquita ⚙ del ranking, que abre la administración con tu contraseña.

**Qué necesitás:**
- Una computadora (Windows o Mac) con el navegador Chrome.
- Esta carpeta del proyecto: `iconnic-arma-el-look`.
- Node.js, un programa gratuito que permite usar las herramientas de Supabase. Se instala en el paso 0.

> **Nota:** los nombres de los menús de Supabase, Netlify y Cloudflare cambian cada tanto. Si un botón no se llama exactamente igual, buscá el más parecido. La función es la misma.

---

## Paso 0 — Instalar Node.js (una sola vez)

1. Entrá a **nodejs.org** y descargá la versión que dice **LTS**.
2. Instalala con todas las opciones que vienen marcadas: Siguiente, Siguiente, Instalar.
3. Abrí la terminal:
   - **Windows:** botón Inicio → escribí `PowerShell` → abrilo.
   - **Mac:** Cmd + Espacio → escribí `Terminal` → abrila.

   Se abre una ventana con fondo oscuro o blanco y un cursor que titila. Ahí se pegan los comandos: pegás con Ctrl + V (en Mac, Cmd + V) y apretás Enter.
4. Para comprobar que se instaló bien, pegá esto y apretá Enter:
   ```
   node --version
   ```
   Tiene que aparecer algo como `v22.x.x`.

---

## Paso A — Crear la cuenta y el proyecto en Supabase

1. Entrá a **supabase.com** → **Start your project** → registrate con tu mail o con GitHub.
2. Tocá **New project**.
   - **Name:** `arma-el-look`.
   - **Database Password:** tocá **Generate a password** y **guardala en un lugar seguro**. No es la contraseña de admin del juego; es la de la base de datos, y no la vas a necesitar para nada de esta guía.
   - **Region:** la más cercana a tus jugadoras. Para Argentina, **South America (São Paulo)**.
   - **Plan:** Free.
3. Tocá **Create new project** y esperá 1 o 2 minutos. Vas a ver una pantalla de "Setting up project" y después el panel del proyecto.
4. Anotá el **identificador del proyecto** (*Project ref*). Es el código de letras que aparece en la dirección del navegador, por ejemplo `https://supabase.com/dashboard/project/abcdefghijklmnop`. Ahí, el ref es `abcdefghijklmnop`.

> **Importante (plan gratuito):** si nadie usa el proyecto durante 7 días, Supabase lo **pausa** y el ranking deja de responder. El juego sigue funcionando, pero sin ranking. Para reactivarlo, entrá al panel y tocá **Restore project**. Durante una campaña activa no pasa.

---

## Paso B — Pegar el SQL

1. En el menú de la izquierda, tocá **SQL Editor** (el ícono de una hoja con `>_`).
2. Tocá **New query**. Se abre un editor vacío.
3. Abrí el archivo `supabase/schema.sql` de esta carpeta con el Bloc de notas (o TextEdit en Mac). Seleccioná todo con Ctrl + A, copialo y pegalo en el editor de Supabase.
4. Tocá **Run** (abajo a la derecha) o apretá Ctrl + Enter.
5. Abajo tiene que aparecer **"Success. No rows returned"**. Si aparece un aviso en naranja sobre "destructive operations", confirmá con **Run this query**: el script no borra datos.
6. Para comprobarlo, entrá a **Table Editor** en el menú de la izquierda. Tienen que figurar las tablas `players`, `scores`, `games`, `admin_log`, `admin_sessions`, `login_attempts` y `login_locks`. Todas muestran un candado o la etiqueta **RLS enabled**: eso es lo que impide que alguien las modifique desde afuera.

Si más adelante hay una versión nueva del SQL, se puede volver a pegar y correr sin perder datos.

---

## Paso C — Cargar la contraseña de admin como secreto

La contraseña **nunca** va en el archivo del juego: se guarda en Supabase, donde nadie la puede ver.

**Opción 1, desde el panel (más fácil):**
1. Menú de la izquierda → **Edge Functions** → **Secrets**. En algunas versiones está en **Project Settings → Edge Functions**.
2. Tocá **Add new secret**:
   - **Name:** `ADMIN_PASSWORD`
   - **Value:** `merluza`
3. Tocá **Save**.

**Opción 2, desde la terminal:** está en el paso D.4.

> Para cambiar la contraseña en el futuro, editá este secreto. No hace falta tocar el juego ni volver a publicar las funciones.

---

## Paso D — Publicar las funciones del servidor

### Opción fácil: desde el navegador, sin instalar nada (recomendada)
Son 4 funciones, y para cada una se repite lo mismo. Los archivos ya vienen listos en la carpeta `supabase/para-pegar/`:

| Nombre de la función (exacto) | Archivo para pegar |
|---|---|
| `start-game` | `supabase/para-pegar/start-game.ts` |
| `submit-score` | `supabase/para-pegar/submit-score.ts` |
| `admin-login` | `supabase/para-pegar/admin-login.ts` |
| `admin-action` | `supabase/para-pegar/admin-action.ts` |

1. En el menú de la izquierda, entrá a **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Arriba, donde dice el nombre de la función, borrá el que viene y escribí el nombre **exacto** de la tabla (por ejemplo `start-game`).
3. Borrá todo el código de ejemplo del editor.
4. Abrí el archivo correspondiente con el Bloc de notas, copiá **todo** (Ctrl + A, Ctrl + C) y pegalo en el editor.
5. Tocá **Deploy function** y esperá a que diga que se publicó.
6. **Apagá la verificación de JWT:** en la página de la función, entrá a **Details** (o **Settings**) y desactivá **Enforce JWT verification** (puede llamarse **Verify JWT**). Guardá.
   - Sin este paso, el juego no puede usar la función.
   - Está bien apagarla: cada función hace sus propios controles.
7. Repetí con las otras 3 funciones.

Si en el futuro cambiás prendas, consignas o reglas en el juego, hay que regenerar estos archivos (`node scripts/armar-funciones.mjs`) y volver a pegarlos.

### Opción con terminal (para quien ya usa la línea de comandos)

Son 4: `start-game`, `submit-score`, `admin-login` y `admin-action`. Se publican desde la terminal.

1. En la terminal, entrá a la carpeta del proyecto. La forma fácil es escribir `cd ` (con un espacio al final), arrastrar la carpeta `iconnic-arma-el-look` sobre la ventana y apretar Enter.
2. Iniciá sesión en Supabase:
   ```
   npx supabase login
   ```
   - La primera vez pregunta si querés instalar el paquete `supabase`: escribí `y` y Enter.
   - Se abre el navegador: tocá **Authorize**. Vas a ver un código de verificación; copialo y pegalo en la terminal si te lo pide.
3. Prepará la carpeta y conectala con tu proyecto. Reemplazá `TU_PROJECT_REF` por el código del paso A.4:
   ```
   npx supabase init
   npx supabase link --project-ref TU_PROJECT_REF
   ```
   - Si `init` hace preguntas (sobre VS Code o Deno), respondé `N` y Enter.
   - Si `link` pide la contraseña de la base de datos, es la del paso A.2.
4. (Solo si no hiciste el paso C por el panel) cargá el secreto:
   ```
   npx supabase secrets set ADMIN_PASSWORD=merluza
   ```
5. Publicá las 4 funciones, pegando las 4 líneas juntas:
   ```
   npx supabase functions deploy start-game --no-verify-jwt
   npx supabase functions deploy submit-score --no-verify-jwt
   npx supabase functions deploy admin-login --no-verify-jwt
   npx supabase functions deploy admin-action --no-verify-jwt
   ```
   Cada una termina con algo como **"Deployed Functions on project …: start-game"**. La opción `--no-verify-jwt` es necesaria: las funciones hacen sus propios controles (ticket de partida, contraseña y token de admin).
6. Para comprobarlo, en el panel → **Edge Functions** tienen que aparecer las 4 con estado **Active**.

> **Si tu proyecto usa solo claves nuevas** (`sb_secret_…`): la clave de servicio normalmente ya está disponible para las funciones y no tenés que hacer nada. Si al jugar el ranking da "Error del servidor", hacé esto:
> 1. Copiá la clave **secret** desde **Project Settings → API Keys**.
> 2. Cargala como secreto con el nombre `SERVICE_KEY` (igual que en el paso C).
>
> Esa clave **nunca** va en el HTML.

---

## Paso E — Copiar la URL y la clave pública al juego

1. En el panel → **Project Settings** (la tuerquita abajo a la izquierda) → **API Keys**. En versiones viejas, **API**.
2. Copiá dos datos:
   - **Project URL**: algo como `https://abcdefghijklmnop.supabase.co`. A veces está en **Project Settings → Data API**.
   - La clave **publishable** (`sb_publishable_…`) o, si no aparece, la **anon public** (empieza con `eyJ…`).

   ⚠️ No copies la **secret** ni la **service_role**: esas nunca van en el juego.
3. Abrí `index.html` con el Bloc de notas. Buscá (Ctrl + F) `SUPABASE_URL` y completá las dos líneas, que están casi al principio del código:
   ```
   const SUPABASE_URL = "https://abcdefghijklmnop.supabase.co";
   const SUPABASE_ANON_KEY = "sb_publishable_xxxxxxxx";
   ```
   Respetá las comillas.
4. Guardá el archivo.

La clave pública está pensada para estar a la vista. Con ella solo se puede **leer el ranking**: no se puede escribir, borrar ni sumar puntos.

---

## Paso F — Subir el juego a internet

Subí **solo** `index.html`, sin las carpetas `supabase`, `scripts` ni `pruebas`. Lo más simple es crear una carpeta nueva, por ejemplo `publicar`, y copiar ahí `index.html`.

**Netlify (lo más rápido):**
1. Entrá a **app.netlify.com/drop** y creá una cuenta gratis si te la pide.
2. Arrastrá la carpeta `publicar` al recuadro punteado.
3. En unos segundos aparece una dirección del tipo `https://nombre-raro-123.netlify.app`. Para cambiarla: **Site configuration → Change site name**.
4. Para actualizar el juego más adelante: en tu sitio, pestaña **Deploys**, arrastrá de nuevo la carpeta.

**Cloudflare Pages (alternativa):**
1. Entrá a **dash.cloudflare.com** → **Workers & Pages** → **Create** → pestaña **Pages** → **Upload assets**.
2. Elegí un nombre de proyecto, arrastrá la carpeta `publicar` y tocá **Deploy site**.
3. La dirección queda como `https://nombre.pages.dev`.

**Opcional (recomendado):** para que solo tu sitio pueda usar las funciones, cargá otro secreto (como en el paso C) y después volvé a publicar las 4 funciones (paso D.5):
- **Name:** `ALLOWED_ORIGIN`
- **Value:** tu dirección exacta, sin barra al final. Por ejemplo `https://arma-el-look.netlify.app`.

---

## Paso G — Probar que todo anda (5 minutos)

1. **Desde tu celular:**
   - Abrí la dirección y tocá **Jugar**.
   - Te pide un nombre: escribilo y jugá las 3 rondas.
   - Al final tiene que decir **"Quedaste 1ª de 1"**.
2. **Desde otro celular, o en modo incógnito:**
   - Jugá con otro nombre.
   - Tocá **Ver ranking**: tienen que aparecer los dos.
3. **La tuerquita:**
   - En el ranking, tocá ⚙ (arriba a la derecha).
   - Poné una contraseña cualquiera: tiene que decir **"Contraseña incorrecta"**.
   - Poné `merluza`: se abre la lista de jugadoras.
4. **Puntos:**
   - En una jugadora, tocá **± Puntos**, escribí `10` y un motivo, y tocá **Aplicar**.
   - Volvé al ranking y tocá **Actualizar**: tiene que haber subido 10.
   - En **Historial** aparece la acción.
5. **Borrar y restaurar:**
   - Tocá **Borrar** en una jugadora y confirmá. Ya no aparece en el ranking.
   - En **Historial**, tocá **Restaurar**: vuelve.
6. **Contraseña oculta:** en la computadora, abrí el juego, hacé clic derecho → **Ver código fuente de la página** → Ctrl + F → escribí `merluza`. Tiene que decir **0 resultados**.

### Si algo no anda
| Lo que ves | Qué revisar |
|---|---|
| No aparece el botón "Ver ranking" | Faltan la URL o la clave en `index.html` (paso E), o subiste una versión vieja. |
| "No pudimos cargar el ranking" | El proyecto está pausado (paso A) o la URL tiene un error de tipeo. |
| Al terminar: "Jugaste sin conexión" | Las funciones no están publicadas (paso D) o `ALLOWED_ORIGIN` no coincide con tu dirección. |
| "Error del servidor" | Ver la nota al final del paso D. En el panel → **Edge Functions** → la función → **Logs** está el detalle. |
| La tuerquita dice "No pudimos conectar" | Falta publicar `admin-login` o `admin-action`. |
| "Contraseña incorrecta" con la correcta | El secreto `ADMIN_PASSWORD` no está cargado o tiene un espacio de más. |

---

## Cómo funciona la seguridad, en criollo
- **La contraseña** vive solo en Supabase. El juego se la manda al servidor, que la compara y devuelve un permiso que vence en 30 minutos. El permiso queda en la memoria de la pestaña: si recargás, la pide de nuevo.
- **Intentos fallidos:** 5 seguidos desde la misma conexión la bloquean 10 minutos.
- **Nadie puede escribir directo en la base:** el navegador solo puede **leer el ranking**. Guardar partidas, sumar puntos y borrar pasa por las funciones del servidor.
- **Puntajes truchos:**
  - El servidor elige las 3 consignas y entrega un ticket de un solo uso.
  - Al terminar, recalcula el puntaje con el mismo motor del juego e ignora el número que manda el celular.
  - Rechaza las partidas de menos de 15 segundos y los looks imposibles.
  - Admite una partida guardada por minuto por celular.
- **Límite que no se puede cerrar sin login:** alguien insistente puede borrar los datos de su navegador y aparecer con otro nombre. Para eso está el botón **Borrar**.

## Si cambiás prendas, consignas o reglas
El servidor tiene una copia del motor del juego. Después de editar `index.html`, actualizala y volvé a publicar `submit-score` y `start-game`:
```
node scripts/extraer-motor.mjs
npx supabase functions deploy submit-score --no-verify-jwt
npx supabase functions deploy start-game --no-verify-jwt
```
Si te olvidás, las partidas con prendas nuevas van a fallar al guardarse ("prendas o consignas que no existen").

---

## Para quien programa: cómo repetir las pruebas automáticas
Requisitos: Node 20 o más nuevo, PostgreSQL 15 o más nuevo y Chromium de Playwright.

```
cd pruebas
npm install
createdb look
psql -d look -f roles-supabase.sql          # roles y permisos por defecto de Supabase
psql -d look -f ../supabase/schema.sql
ADMIN_PASSWORD=merluza npm run servidor     # imita Supabase en http://localhost:8787
npm run e2e                                 # en otra terminal
```
`DATABASE_URL` permite apuntar a otra base (por defecto `postgres://postgres@localhost:5432/look`). La prueba vacía las tablas al empezar.
