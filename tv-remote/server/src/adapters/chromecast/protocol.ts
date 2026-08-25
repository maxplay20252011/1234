/**
 * Mensajes del protocolo castv2.
 *
 * Origen: ingenieria inversa de la comunidad. Google no publica este protocolo,
 * asi que puede cambiar. Todo lo de aca es puro y esta cubierto por tests.
 */

export const CAST_PORT = 8009;

export const NS = {
  connection: 'urn:x-cast:com.google.cast.tp.connection',
  heartbeat: 'urn:x-cast:com.google.cast.tp.heartbeat',
  receiver: 'urn:x-cast:com.google.cast.receiver',
  media: 'urn:x-cast:com.google.cast.media',
} as const;

export const SENDER_ID = 'sender-0';
export const RECEIVER_ID = 'receiver-0';

/**
 * Aplicacion receptora por defecto de Google. Reproduce una URL de media
 * directa (un archivo de video o audio) y viene en todos los aparatos Cast.
 */
export const DEFAULT_MEDIA_RECEIVER = 'CC1AD845';

/** El aparato corta la conexion si deja de recibir pings. */
export const HEARTBEAT_INTERVAL_MS = 5000;

export type MediaLoadRequest = {
  url: string;
  contentType: string;
  title?: string;
  subtitle?: string;
  imageUrl?: string;
  /** LIVE para transmisiones sin duracion; BUFFERED para archivos. */
  streamType?: 'BUFFERED' | 'LIVE';
};

export function connectPayload(): string {
  return JSON.stringify({ type: 'CONNECT' });
}

export function closePayload(): string {
  return JSON.stringify({ type: 'CLOSE' });
}

export function pingPayload(): string {
  return JSON.stringify({ type: 'PING' });
}

export function pongPayload(): string {
  return JSON.stringify({ type: 'PONG' });
}

export function getStatusPayload(requestId: number): string {
  return JSON.stringify({ type: 'GET_STATUS', requestId });
}

export function launchPayload(requestId: number, appId: string): string {
  return JSON.stringify({ type: 'LAUNCH', requestId, appId });
}

export function stopSessionPayload(requestId: number, sessionId: string): string {
  return JSON.stringify({ type: 'STOP', requestId, sessionId });
}

/**
 * El volumen de castv2 es un decimal de 0 a 1, no un porcentaje entero.
 * Se convierte en un solo lugar para que el resto del sistema siga hablando
 * en 0-100 como todas las demas marcas.
 */
export function setVolumePayload(requestId: number, level0to100: number): string {
  const level = Math.max(0, Math.min(1, level0to100 / 100));
  return JSON.stringify({ type: 'SET_VOLUME', requestId, volume: { level } });
}

export function setMutePayload(requestId: number, muted: boolean): string {
  return JSON.stringify({ type: 'SET_VOLUME', requestId, volume: { muted } });
}

export function loadPayload(requestId: number, media: MediaLoadRequest): string {
  return JSON.stringify({
    type: 'LOAD',
    requestId,
    autoplay: true,
    currentTime: 0,
    media: {
      contentId: media.url,
      contentType: media.contentType,
      streamType: media.streamType ?? 'BUFFERED',
      metadata: {
        // 0 = GenericMediaMetadata. Con metadata valida el aparato muestra
        // titulo e imagen; sin ella algunos receptores rechazan la carga.
        metadataType: 0,
        title: media.title ?? 'Video',
        ...(media.subtitle !== undefined ? { subtitle: media.subtitle } : {}),
        ...(media.imageUrl !== undefined ? { images: [{ url: media.imageUrl }] } : {}),
      },
    },
  });
}

export function mediaCommandPayload(
  requestId: number,
  type: 'PLAY' | 'PAUSE' | 'STOP',
  mediaSessionId: number,
): string {
  return JSON.stringify({ type, requestId, mediaSessionId });
}

export function seekPayload(requestId: number, mediaSessionId: number, seconds: number): string {
  return JSON.stringify({ type: 'SEEK', requestId, mediaSessionId, currentTime: seconds });
}

// ─── Parseo de respuestas ────────────────────────────────────────────────────

export type ReceiverStatus = {
  /** 0 a 100, ya convertido desde el decimal del protocolo. */
  volume?: number;
  muted?: boolean;
  appId?: string;
  displayName?: string;
  sessionId?: string;
  /** Destino al que hay que hablarle para controlar la reproduccion. */
  transportId?: string;
};

export function parseReceiverStatus(payload: string): ReceiverStatus | undefined {
  const msg = safeJson(payload);
  if (!msg || msg['type'] !== 'RECEIVER_STATUS') return undefined;

  const status = asRecord(msg['status']);
  if (!status) return undefined;

  const out: ReceiverStatus = {};

  const volume = asRecord(status['volume']);
  if (volume) {
    const level = volume['level'];
    if (typeof level === 'number') out.volume = Math.round(level * 100);
    if (typeof volume['muted'] === 'boolean') out.muted = volume['muted'];
  }

  // `applications` esta ausente cuando el aparato no tiene nada cargado.
  const apps = status['applications'];
  const app = Array.isArray(apps) ? asRecord(apps[0]) : undefined;
  if (app) {
    if (typeof app['appId'] === 'string') out.appId = app['appId'];
    if (typeof app['displayName'] === 'string') out.displayName = app['displayName'];
    if (typeof app['sessionId'] === 'string') out.sessionId = app['sessionId'];
    if (typeof app['transportId'] === 'string') out.transportId = app['transportId'];
  }

  return out;
}

export type MediaStatus = {
  mediaSessionId?: number;
  playerState?: string;
  currentTime?: number;
  duration?: number;
  title?: string;
};

export function parseMediaStatus(payload: string): MediaStatus | undefined {
  const msg = safeJson(payload);
  if (!msg || msg['type'] !== 'MEDIA_STATUS') return undefined;

  const lista = msg['status'];
  const status = Array.isArray(lista) ? asRecord(lista[0]) : undefined;
  if (!status) return {};

  const out: MediaStatus = {};
  if (typeof status['mediaSessionId'] === 'number') out.mediaSessionId = status['mediaSessionId'];
  if (typeof status['playerState'] === 'string') out.playerState = status['playerState'];
  if (typeof status['currentTime'] === 'number') out.currentTime = status['currentTime'];

  const media = asRecord(status['media']);
  if (media) {
    if (typeof media['duration'] === 'number') out.duration = media['duration'];
    const metadata = asRecord(media['metadata']);
    if (metadata && typeof metadata['title'] === 'string') out.title = metadata['title'];
  }

  return out;
}

export function messageType(payload: string): string | undefined {
  const msg = safeJson(payload);
  return typeof msg?.['type'] === 'string' ? msg['type'] : undefined;
}

export function requestIdOf(payload: string): number | undefined {
  const msg = safeJson(payload);
  return typeof msg?.['requestId'] === 'number' ? msg['requestId'] : undefined;
}

/**
 * Adivina el tipo MIME por la extension de la URL.
 *
 * El aparato lo necesita para elegir el decodificador y rechaza la carga si no
 * se lo mandamos. Ante la duda se usa video/mp4, que es lo que soporta
 * cualquier receptor Cast.
 */
export function guessContentType(url: string): string {
  const limpia = url.split('?')[0]?.toLowerCase() ?? '';
  const tipos: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.m4v': 'video/mp4',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m3u8': 'application/x-mpegurl',
    '.mpd': 'application/dash+xml',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
  };
  for (const [ext, tipo] of Object.entries(tipos)) {
    if (limpia.endsWith(ext)) return tipo;
  }
  return 'video/mp4';
}

function safeJson(text: string): Record<string, unknown> | undefined {
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
