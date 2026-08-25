# Control de televisores en red local

Una aplicación que corre en tu casa y te deja controlar y castear a los
televisores de la red desde el navegador del celular o de la computadora.

**Sin nube, sin cuenta de usuario, sin internet.** Todo pasa dentro de tu red.

> ### Estado: Fase 2 de 5
>
> La aplicación **encuentra** los televisores y ya **controla** los Samsung con
> Tizen: encendido, volumen, silencio, cruceta y aplicaciones.
>
> **El control de Samsung todavía no se probó contra un televisor real**, así
> que puede necesitar ajustes. Si algo no anda, mandá la salida de
> `LOG_LEVEL=debug npm start`.
>
> El Chromecast se detecta pero todavía no se controla: eso es la Fase 3.

---

## Qué necesitás

- Una computadora que quede **prendida y conectada a la misma red** que los
  televisores. Puede ser tu notebook.
- **Node.js 20 o superior**. Si no lo tenés: <https://nodejs.org> → botón LTS.

Para verificar que Node está instalado, abrí una terminal y escribí:

```bash
node --version
```

Tiene que responder algo como `v20.11.0` o mayor.

### Sobre el iPhone

**El iPhone es el control remoto, no el servidor.** Desde el celular abrís la
aplicación en Safari y la usás; lo que no puede es *alojarla*. Más abajo hay una
[sección entera sobre esto](#desde-el-iphone).

---

## Instalación

```bash
cd tv-remote
npm install
cp .env.example .env
```

Eso es todo. No hace falta editar el `.env` para empezar.

## Usarlo

**Primero, probá que encuentre tus televisores:**

```bash
npm run discover
```

Deberías ver tus televisores con su marca, IP y MAC. Si no aparece nada, andá
directo a [Solución de problemas](#solución-de-problemas).

**Después, levantá la aplicación:**

```bash
npm run build
npm start
```

La terminal te va a decir algo como:

```
Abri  http://192.168.1.10:8099  desde el celular o la compu
```

Abrí esa dirección en el navegador del celular. Esa es la aplicación.

> **Importante: no abras el puerto 8099 en el router.** Mientras no lo hagas,
> esto solo es accesible desde tu red y nadie de afuera puede llegar.

---

## Controlar un televisor

En la lista, tocá **Controlar** en el televisor que quieras manejar.

**La primera vez hay que emparejar.** Al tocar *Emparejar*, en la pantalla del
televisor va a aparecer un aviso pidiendo permiso. Elegí **Permitir**. Tenés
unos segundos para hacerlo.

Si lo rechazaste sin querer, el aviso no vuelve a salir solo: entrá en el
televisor a *Configuración → General → Administrador de dispositivos externos*
y borrá la lista de dispositivos.

Una vez emparejado queda guardado, **también después de reiniciar el servidor**.

### Desde la computadora, con el teclado

| Tecla | Hace |
|---|---|
| Flechas | Mover en el menú |
| Enter | Aceptar |
| Esc | Volver |
| `+` y `−` | Volumen |
| `M` | Silenciar |

### Probar sin televisor

```bash
MOCK_DEVICE=1 npm start
```

Agrega un televisor de mentira a la lista, para ver cómo funciona todo sin
tener que tocar el de verdad.

---

## Solución de problemas

### No aparece mi televisor

Probá en este orden, que va de lo más común a lo menos:

1. **¿Está encendido?** En reposo profundo muchos televisores no contestan a
   nada. Encendelo y volvé a escanear.

2. **¿Están en la misma red?** El error más frecuente es que la computadora
   esté en la red normal y el televisor en la de invitados, o al revés.
   También pasa cuando el router separa las bandas de 2.4 y 5 GHz en dos
   redes distintas.

3. **Mirá qué dice el diagnóstico:**
   ```bash
   npm run discover -- --raw
   ```
   Lo primero que imprime son las interfaces de red. Si ves varias (una VPN,
   Docker, WSL), no es problema: el escaneo sale por todas.

4. **Probá el barrido completo.** Algunos routers tienen activado el
   "aislamiento de clientes" (*AP isolation*), que impide que los dispositivos
   se vean entre sí. Ahí el descubrimiento automático no puede funcionar:
   ```bash
   npm run discover -- --sweep --raw
   ```
   Esto prueba una por una las 254 direcciones de tu red. Tarda más, pero
   encuentra televisores que no contestan al descubrimiento normal.

5. **Cargalo a mano.** En la aplicación, el botón *"No aparece mi televisor:
   agregarlo por IP"*. La IP del televisor está en su menú de red
   (Configuración → Red → Estado de la red).

6. **Desactivá la VPN un momento** y volvé a probar. Algunas VPN capturan todo
   el tráfico y bloquean el descubrimiento local.

### Aparece pero dice "sin detectar" en la MAC

Sin la MAC no se puede encender el televisor por Wake-on-LAN; todo lo demás
funciona igual. Pasa cuando el televisor no la publica y el sistema operativo
todavía no la resolvió. Suele arreglarse escaneando de nuevo con el televisor
encendido.

Si el televisor está en otra red o detrás de un router, no hay MAC posible.

### No enciende por Wake-on-LAN

1. Hay que **habilitarlo en el televisor**. Buscá en su menú una opción llamada
   "Encender móvil", "Wake on LAN" o "Conexión de red en espera". Si está
   apagada, ningún programa del mundo va a poder encenderlo.
2. **Muchos televisores solo despiertan por cable, no por Wi-Fi.** Es una
   limitación del televisor.
3. En Samsung, la MAC de cable es **distinta** de la de Wi-Fi. Si el televisor
   está conectado por cable, hace falta la MAC de cable.

### El video no arranca

*(Aplica a partir de la Fase 4.)*

Casi siempre es el códec: los televisores son quisquillosos con HEVC de 10
bits, con audio AC3 y con MKV que traen subtítulos incrustados. La aplicación
detecta el códec y ofrece convertirlo si tenés `ffmpeg` instalado.

### Dice que no está emparejado

El televisor guarda una credencial la primera vez que aceptás el aviso. Se
puede perder si reiniciaste el televisor de fábrica, si borraste la lista de
dispositivos externos, o si cambiaste `ENCRYPTION_KEY` en el `.env` (en ese
caso las credenciales guardadas dejan de poder leerse y hay que emparejar de
nuevo). Tocá *Emparejar* otra vez.

### El volumen sube y baja pero no puedo poner un número exacto

Es normal en varios Samsung. El control remoto del televisor solo maneja pasos;
el valor exacto va por otro camino que no todos los modelos abren. La
aplicación lo detecta al conectarse y, si tu televisor no lo soporta, esconde
la barra en vez de mostrar una que no funciona.

### Se desconecta solo

Es normal: cuando el televisor se apaga, cierra la conexión. La aplicación
reconecta sola con esperas cada vez más largas y lo marca como "sin conexión"
mientras tanto.

### Quiero ver qué está pasando en detalle

```bash
LOG_LEVEL=debug npm start
```

Muestra el tráfico crudo de todos los protocolos. Es mucho texto, pero es lo
que sirve para entender por qué un televisor no responde.

---

## Desde el iPhone

La aplicación está pensada para usarse desde el celular, y en iPhone funciona
sin instalar nada: abrís la dirección en Safari y listo.

### Dejarla como una app en la pantalla de inicio

1. Abrí `http://192.168.1.10:8099` (la dirección que te imprime la terminal) en
   **Safari**. Tiene que ser Safari; desde Chrome en iPhone no se puede.
2. Tocá el botón **Compartir** (el cuadradito con la flecha hacia arriba).
3. Bajá y elegí **Agregar a pantalla de inicio**.

Queda un ícono igual al de cualquier app, y al abrirlo arranca a pantalla
completa, sin la barra de Safari. La aplicación te muestra este recordatorio
sola la primera vez que entrás desde un iPhone.

### Por qué no es una PWA completa

Una PWA "de verdad" —la que funciona sin conexión— necesita un *service
worker*, y los navegadores solo los permiten en contexto seguro, o sea HTTPS.
Una dirección de red local como `http://192.168.1.10:8099` no lo es, así que
esa parte no se puede sobre HTTP plano. **No es una limitación de esta
aplicación, es la política de todos los navegadores.**

Lo que sí funciona sobre HTTP es el ícono y el modo pantalla completa, porque
Apple lo resuelve con un mecanismo propio anterior a las PWA. En la práctica se
ve y se abre igual que una app.

Si más adelante querés la PWA completa, hay que generar un certificado propio
con `mkcert` e instalarlo en cada celular. Se puede, pero es un paso manual por
dispositivo.

### El vibrado no funciona en iPhone

Safari en iOS no soporta `navigator.vibrate`. El feedback al tocar los botones
va a andar en Android y no en iPhone. No hay forma de evitarlo desde una
página web.

### Y si no quiero depender de que la notebook esté prendida

El servidor tiene que correr en algo encendido y conectado a la misma red. No
puede ser el iPhone: iOS no tiene Node, suspende las apps al bloquear la
pantalla, y desde iOS 14 bloquea el multicast que necesita el descubrimiento.
Las alternativas reales, de más barata a más cómoda:

| Opción | Costo | Comentario |
|---|---|---|
| **Un Android viejo con Termux** | gratis | Node corre nativo y el multicast funciona. Lo dejás enchufado y listo. |
| **Raspberry Pi Zero 2 W** | ~USD 20 | Alcanza y sobra para esto. |
| **Raspberry Pi 4 o 5** | ~USD 50-80 | Más margen, y te sirve para otras cosas. |
| **Un NAS que ya tengas** | gratis | Con Docker en `network_mode: host`. |

### Mientras tanto, hoy, sin nada de esto

Para tu hardware concreto ya existen apps de iPhone que controlan cada aparato
por separado, gratis y sin servidor:

- **Google Home** controla el Chromecast con Google TV, con D-pad incluido.
- **SmartThings** controla el televisor Samsung.
- Si tu Samsung es 2018 o posterior, probablemente soporte **AirPlay 2**, así
  que podés mandarle video desde el iPhone directo, sin app de por medio.

Son tres cosas distintas en vez de una sola, que es justamente lo que este
proyecto viene a resolver. Pero si lo que necesitás es control desde el iPhone
*ya*, están ahí.

---

## Configuración

Todo se ajusta en el archivo `.env`. Los valores por defecto sirven para la
mayoría de las casas; `.env.example` explica cada uno.

Los más útiles:

| Variable | Para qué |
|---|---|
| `PORT` | Puerto de la aplicación. Por defecto `8099`. |
| `PROBE_TIMEOUT_MS` | Subilo si tu red es lenta y algún televisor no llega a contestar. |
| `AUTH_PIN` | Si lo completás, pide un PIN para entrar. Vacío = sin contraseña. |
| `LOG_LEVEL` | `debug` para ver el tráfico de protocolo. |

## Seguridad

- El servidor **no se expone a internet**. Escucha en tu red local y nada más.
  Lo único que lo expondría sería abrir el puerto en el router: **no lo hagas.**
- Los tokens de emparejamiento de los televisores se guardan **cifrados**.
- El archivo `.env` y la carpeta `data/` están fuera del control de versiones.

## Qué falta

Ver `CLAUDE.md` para el plan de fases, el estado de cada marca y las trampas
conocidas de cada protocolo.
