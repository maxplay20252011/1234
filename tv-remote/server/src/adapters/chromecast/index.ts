import type {
  App,
  Capability,
  CastUrlRequest,
  Device,
  PairingStatus,
  RemoteKey,
} from '@tv-remote/shared';
import type { DeviceState, TvAdapter } from '../types.js';
import { ControlError, NotSupportedError } from '../errors.js';
import { logger } from '../../logger.js';
import { CastClient } from './client.js';
import {
  DEFAULT_MEDIA_RECEIVER,
  NS,
  RECEIVER_ID,
  getStatusPayload,
  guessContentType,
  launchPayload,
  loadPayload,
  mediaCommandPayload,
  parseMediaStatus,
  parseReceiverStatus,
  setMutePayload,
  setVolumePayload,
  stopSessionPayload,
  type MediaStatus,
} from './protocol.js';

type Sesion = {
  client: CastClient;
  /** Destino de la aplicacion cargada; hay que hablarle a el, no al receptor. */
  transportId?: string;
  sessionId?: string;
  mediaSessionId?: number;
  ultimoMedia?: MediaStatus;
};

/**
 * Adapter para aparatos Cast: Chromecast, Chromecast con Google TV, Google TV
 * Streamer y televisores con Cast integrado.
 *
 * Se registra para las marcas 'chromecast' Y 'androidtv', porque un Chromecast
 * con Google TV es las dos cosas: habla castv2 para reproducir y volumen, y
 * androidtvremote2 para la cruceta y el encendido (eso es la Fase 5).
 *
 * Lo que NO tiene, y no es una omision:
 *  - Encendido y apagado. El aparato Cast no es el televisor. Lo que enciende
 *    la pantalla es el HDMI-CEC cuando empieza a castear: o sea que castear ES
 *    el encendido.
 *  - Cruceta y entradas HDMI. Un Chromecast pelado no tiene botones que emular.
 *  - Lista de aplicaciones. castv2 no permite enumerar lo instalado; solo se
 *    puede lanzar una aplicacion si ya se conoce su identificador.
 *
 * ADVERTENCIA: escrito contra documentacion de ingenieria inversa de la
 * comunidad y NO verificado contra un aparato real.
 */
export class ChromecastAdapter implements TvAdapter {
  private readonly sesiones = new Map<string, Sesion>();

  constructor(readonly brand: string = 'chromecast') {}

  async capabilities(_device: Device): Promise<Capability[]> {
    // castv2 tiene volumen absoluto y silencio por valor de forma nativa: son
    // parte del protocolo, no una extension que haya que sondear.
    return ['volume', 'volumeAbsolute', 'mute', 'castUrl'];
  }

  async pairingStatus(device: Device): Promise<PairingStatus> {
    // castv2 no tiene emparejamiento: cualquiera en la red puede controlarlo.
    return {
      deviceId: device.id,
      state: 'not_required',
      message: 'Los dispositivos Cast no necesitan emparejamiento.',
      needsPin: false,
    };
  }

  async connect(device: Device): Promise<void> {
    await this.sesion(device);
  }

  async disconnect(device: Device): Promise<void> {
    const sesion = this.sesiones.get(device.id);
    if (!sesion) return;
    sesion.client.disconnect();
    this.sesiones.delete(device.id);
  }

  /**
   * Solo teclas de reproduccion: un aparato Cast no tiene cruceta.
   * Las demas fallan con un mensaje claro en lugar de no hacer nada en silencio.
   */
  async sendKey(device: Device, key: RemoteKey): Promise<void> {
    const comandos: Partial<Record<RemoteKey, 'PLAY' | 'PAUSE' | 'STOP'>> = {
      play: 'PLAY',
      pause: 'PAUSE',
      stop: 'STOP',
    };
    const comando = comandos[key];
    if (!comando) {
      throw new NotSupportedError(
        `la tecla "${key}"`,
        'Un dispositivo Cast (solo controla la reproduccion)',
      );
    }

    const sesion = await this.sesion(device);
    if (sesion.mediaSessionId === undefined || !sesion.transportId) {
      throw new ControlError(
        'No hay nada reproduciendose',
        'No hay nada reproduciendose en este dispositivo.',
        'no_media',
        409,
      );
    }

    await sesion.client.request(NS.media, sesion.transportId, (id) =>
      mediaCommandPayload(id, comando, sesion.mediaSessionId as number),
    );
  }

  async volumeStep(device: Device, delta: number): Promise<void> {
    const sesion = await this.sesion(device);
    const estado = await this.receiverStatus(sesion);
    const actual = estado?.volume ?? 0;
    // castv2 no tiene "subir un paso": hay que leer y escribir el valor. Se usa
    // un salto de 5 para que se parezca a un paso de control remoto.
    const nuevo = Math.max(0, Math.min(100, actual + delta * 5));
    await sesion.client.request(NS.receiver, RECEIVER_ID, (id) => setVolumePayload(id, nuevo));
  }

  async setVolume(device: Device, level: number): Promise<void> {
    const sesion = await this.sesion(device);
    await sesion.client.request(NS.receiver, RECEIVER_ID, (id) => setVolumePayload(id, level));
  }

  async setMute(device: Device, muted: boolean): Promise<void> {
    const sesion = await this.sesion(device);
    await sesion.client.request(NS.receiver, RECEIVER_ID, (id) => setMutePayload(id, muted));
  }

  /** castv2 no permite enumerar lo instalado. Devolver vacio es la verdad. */
  async listApps(): Promise<App[]> {
    return [];
  }

  /**
   * Castea una URL.
   *
   * Lanza el receptor por defecto de Google, se conecta a la sesion que crea y
   * le manda la carga. Los tres pasos son obligatorios y en ese orden.
   */
  async castUrl(device: Device, media: CastUrlRequest): Promise<void> {
    const sesion = await this.sesion(device);

    const estado = await this.receiverStatus(sesion);
    // Si ya esta cargado el receptor por defecto, se reutiliza en vez de
    // relanzarlo: relanzar corta lo que se este viendo y parpadea la pantalla.
    if (estado?.appId !== DEFAULT_MEDIA_RECEIVER || !estado.transportId) {
      const respuesta = await sesion.client.request(NS.receiver, RECEIVER_ID, (id) =>
        launchPayload(id, DEFAULT_MEDIA_RECEIVER),
      );
      const lanzado = parseReceiverStatus(respuesta);
      if (!lanzado?.transportId) {
        throw new ControlError(
          'El aparato no devolvio la sesion tras el LAUNCH',
          'El dispositivo no pudo abrir el reproductor. Proba desenchufarlo y volver a enchufarlo.',
          'launch_failed',
        );
      }
      sesion.transportId = lanzado.transportId;
      if (lanzado.sessionId !== undefined) sesion.sessionId = lanzado.sessionId;
    } else {
      sesion.transportId = estado.transportId;
      if (estado.sessionId !== undefined) sesion.sessionId = estado.sessionId;
    }

    // Hay que mandarle CONNECT a la aplicacion antes de hablarle.
    sesion.client.enviarConnect(sesion.transportId);

    const respuesta = await sesion.client.request(NS.media, sesion.transportId, (id) =>
      loadPayload(id, {
        url: media.url,
        contentType: media.contentType ?? guessContentType(media.url),
        ...(media.title !== undefined ? { title: media.title } : {}),
      }),
    );

    const estadoMedia = parseMediaStatus(respuesta);
    if (estadoMedia?.mediaSessionId !== undefined) {
      sesion.mediaSessionId = estadoMedia.mediaSessionId;
      sesion.ultimoMedia = estadoMedia;
      return;
    }

    // El aparato responde LOAD_FAILED cuando no puede con el formato. Es el
    // caso mas comun al pasarle una pagina en vez de un archivo de video.
    throw new ControlError(
      `El aparato rechazo la carga: ${respuesta.slice(0, 200)}`,
      'El dispositivo no pudo reproducir esa direccion. Tiene que ser un enlace directo a un archivo de video (que termine en .mp4, por ejemplo), no la pagina de un servicio.',
      'load_failed',
    );
  }

  async stopCast(device: Device): Promise<void> {
    const sesion = await this.sesion(device);
    if (!sesion.sessionId) return;
    await sesion.client.request(NS.receiver, RECEIVER_ID, (id) =>
      stopSessionPayload(id, sesion.sessionId as string),
    );
    delete sesion.transportId;
    delete sesion.sessionId;
    delete sesion.mediaSessionId;
  }

  async getState(device: Device): Promise<DeviceState> {
    const sesion = await this.sesion(device);
    const estado = await this.receiverStatus(sesion);
    if (!estado) return {};

    const state: DeviceState = {};
    // Si contesta, esta encendido. No dice nada del televisor detras.
    state.powered = true;
    if (estado.volume !== undefined) state.volume = estado.volume;
    if (estado.muted !== undefined) state.muted = estado.muted;
    if (estado.displayName !== undefined) state.currentApp = estado.displayName;

    const media = sesion.ultimoMedia;
    if (media) {
      state.media = {
        ...(media.playerState !== undefined ? { playerState: media.playerState } : {}),
        ...(media.title !== undefined ? { title: media.title } : {}),
        ...(media.currentTime !== undefined ? { position: media.currentTime } : {}),
        ...(media.duration !== undefined ? { duration: media.duration } : {}),
      };
    }
    return state;
  }

  private async receiverStatus(sesion: Sesion) {
    const respuesta = await sesion.client.request(NS.receiver, RECEIVER_ID, (id) =>
      getStatusPayload(id),
    );
    return parseReceiverStatus(respuesta);
  }

  private async sesion(device: Device): Promise<Sesion> {
    const existente = this.sesiones.get(device.id);
    if (existente?.client.connected) return existente;

    const client = new CastClient(device.ip);
    const sesion: Sesion = { client };

    // Las difusiones espontaneas mantienen el estado fresco sin preguntar: el
    // aparato avisa cuando alguien cambia el volumen desde el control del TV o
    // cuando avanza la reproduccion.
    client.on('message', (namespace, payload) => {
      if (namespace === NS.media) {
        const media = parseMediaStatus(payload);
        if (media) {
          sesion.ultimoMedia = media;
          if (media.mediaSessionId !== undefined) sesion.mediaSessionId = media.mediaSessionId;
        }
      }
    });

    client.on('close', () => {
      logger.debug({ deviceId: device.id }, 'La conexion castv2 se cerro');
      this.sesiones.delete(device.id);
    });

    await client.connect();
    this.sesiones.set(device.id, sesion);
    return sesion;
  }
}
