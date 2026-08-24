# Control de televisores en red local

Una aplicación que corre en tu casa y te deja controlar y castear a los
televisores de la red desde el navegador del celular o de la computadora.

**Sin nube, sin cuenta de usuario, sin internet.** Todo pasa dentro de tu red.

> ### Estado: Fase 1 de 5
>
> Por ahora la aplicación **encuentra** los televisores y los muestra. Todavía
> **no los controla**: el control se agrega en la Fase 2. Si estás probando
> esto ahora, lo que tiene que funcionar es el descubrimiento.

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

### El servidor no puede ser un iPhone ni un iPad

iOS no permite correr un servidor: no hay Node, las apps se suspenden al
bloquear la pantalla, y desde iOS 14 el sistema bloquea el multicast que
necesita el descubrimiento. **El iPhone es el control remoto, no el servidor.**

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

*(Aplica a partir de la Fase 2.)*

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

### Se desconecta solo

*(Aplica a partir de la Fase 2.)*

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
