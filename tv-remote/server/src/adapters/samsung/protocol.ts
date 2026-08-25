/**
 * Construccion y parseo de los mensajes del canal de control de Samsung.
 *
 * Todo lo de aca es puro y esta cubierto por tests: es la parte del adapter que
 * se puede validar sin un televisor delante.
 *
 * Origen: ingenieria inversa de la comunidad. Samsung no publica este protocolo,
 * asi que puede cambiar con una actualizacion de firmware.
 */

export const SAMSUNG_PORT_LEGACY = 8001;
export const SAMSUNG_PORT_SECURE = 8002;

export type SamsungEndpoint = {
  url: string;
  /** true en 8002: certificado autofirmado, hay que aceptarlo explicitamente. */
  secure: boolean;
};

/**
 * Arma la URL del canal de control.
 *
 * La generacion la decide el propio televisor, no una lista de modelos que
 * envejece: `tokenAuthSupport` viene de GET /api/v2/, que ya lee el sondeo del
 * descubrimiento.
 *
 *   tokenAuthSupport = false  ->  2016 y anteriores: ws:// por el 8001, sin token
 *   tokenAuthSupport = true   ->  2017 en adelante:  wss:// por el 8002, con token
 */
export function buildChannelUrl(
  ip: string,
  appName: string,
  options: { tokenAuthSupport: boolean; token?: string },
): SamsungEndpoint {
  // El nombre va en base64 y es lo que el televisor muestra en el aviso de
  // autorizacion, asi que conviene que sea reconocible para el usuario.
  const name = Buffer.from(appName, 'utf8').toString('base64');
  const ruta = `/api/v2/channels/samsung.remote.control?name=${encodeURIComponent(name)}`;

  if (!options.tokenAuthSupport) {
    return { url: `ws://${ip}:${SAMSUNG_PORT_LEGACY}${ruta}`, secure: false };
  }

  const conToken = options.token ? `${ruta}&token=${encodeURIComponent(options.token)}` : ruta;
  return { url: `wss://${ip}:${SAMSUNG_PORT_SECURE}${conToken}`, secure: true };
}

/** Mensaje de pulsacion de tecla. `Click` es pulsar y soltar. */
export function buildKeyMessage(samsungKey: string): string {
  return JSON.stringify({
    method: 'ms.remote.control',
    params: {
      Cmd: 'Click',
      DataOfCmd: samsungKey,
      Option: 'false',
      TypeOfRemote: 'SendRemoteKey',
    },
  });
}

/** Pedido de la lista de apps instaladas. */
export function buildAppListMessage(): string {
  return JSON.stringify({
    method: 'ms.channel.emit',
    params: { event: 'ed.installedApp.get', to: 'host' },
  });
}

export type SamsungEvent =
  | { kind: 'connected'; token?: string }
  | { kind: 'unauthorized' }
  | { kind: 'timeout' }
  | { kind: 'apps'; apps: { id: string; name: string }[] }
  | { kind: 'other'; event: string };

/**
 * Interpreta un mensaje entrante del televisor.
 *
 * El token aparece UNA sola vez, dentro del evento `ms.channel.connect` de la
 * primera conexion autorizada. Si se pierde hay que emparejar de nuevo, asi que
 * el adapter lo persiste apenas lo ve.
 */
export function parseSamsungMessage(raw: string): SamsungEvent | null {
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof msg !== 'object' || msg === null) return null;

  const obj = msg as Record<string, unknown>;
  const event = typeof obj['event'] === 'string' ? obj['event'] : undefined;
  if (!event) return null;

  if (event === 'ms.channel.connect') {
    const data = obj['data'];
    const token =
      typeof data === 'object' && data !== null
        ? (data as Record<string, unknown>)['token']
        : undefined;
    return typeof token === 'string' && token.length > 0
      ? { kind: 'connected', token }
      : { kind: 'connected' };
  }

  // El televisor cierra con este evento cuando el usuario rechaza el aviso o
  // cuando el dispositivo esta en su lista de bloqueados.
  if (event === 'ms.channel.unauthorized') return { kind: 'unauthorized' };
  if (event === 'ms.channel.timeOut') return { kind: 'timeout' };

  if (event === 'ed.installedApp.get') {
    return { kind: 'apps', apps: parseAppList(obj['data']) };
  }

  return { kind: 'other', event };
}

function parseAppList(data: unknown): { id: string; name: string }[] {
  if (typeof data !== 'object' || data === null) return [];
  const lista = (data as Record<string, unknown>)['data'];
  if (!Array.isArray(lista)) return [];

  const apps: { id: string; name: string }[] = [];
  for (const item of lista) {
    if (typeof item !== 'object' || item === null) continue;
    const app = item as Record<string, unknown>;
    const id = app['appId'];
    const name = app['name'];
    if (typeof id === 'string' && typeof name === 'string') apps.push({ id, name });
  }
  return apps;
}
