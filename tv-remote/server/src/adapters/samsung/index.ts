import WebSocket from 'ws';
import type {
  App,
  Capability,
  CastUrlRequest,
  Device,
  PairingStatus,
  RemoteKey,
} from '@tv-remote/shared';
import type { Credentials, DeviceState, TvAdapter } from '../types.js';
import {
  DeviceOfflineError,
  NotSupportedError,
  PairingRejectedError,
  ControlError,
} from '../errors.js';
import { logger, protocolLog } from '../../logger.js';
import { probeSamsung } from '../../discovery/probe.js';
import { wake } from '../../services/wol.js';
import { SAMSUNG_KEYS } from './keys.js';
import {
  buildAppListMessage,
  buildChannelUrl,
  buildKeyMessage,
  parseSamsungMessage,
} from './protocol.js';
import * as rc from './upnp-volume.js';
import { AvTransportClient } from '../dlna/avtransport.js';
import { buildDidlLite } from '../dlna/didl.js';
import { fetchUpnpDescription, findServiceControlUrl } from '../../discovery/upnp.js';

/** Nombre que ve el usuario en el aviso de autorizacion del televisor. */
const APP_NAME = 'Control de TVs';
const CONNECT_TIMEOUT_MS = 12_000;
/** Se cierra la conexion tras un rato sin uso: el TV limita clientes simultaneos. */
const IDLE_TIMEOUT_MS = 60_000;

type Conexion = {
  ws: WebSocket;
  lista: Promise<void>;
  ultimoUso: number;
  idleTimer?: NodeJS.Timeout;
};

/**
 * Adapter de televisores Samsung con Tizen (2016 en adelante).
 *
 * ADVERTENCIA: escrito contra documentacion de ingenieria inversa de la
 * comunidad y NO verificado contra un televisor real. Samsung no publica este
 * protocolo. Las partes puras (armado y parseo de mensajes, eleccion de la
 * generacion del protocolo) estan cubiertas por tests; el comportamiento contra
 * hardware hay que confirmarlo con LOG_LEVEL=debug la primera vez.
 *
 * Lo que NO tiene y por que:
 *  - volumen absoluto y mute por valor: el canal de control solo maneja pasos y
 *    el mute es un interruptor. El absoluto se intenta por UPnP
 *    RenderingControl y solo se declara si ESE televisor lo contesta.
 *  - seleccion directa de entrada HDMI: no hay tecla confiable por modelo. Se
 *    expone KEY_SOURCE, que abre el menu de fuentes, y no se declara 'input'.
 */
export class SamsungAdapter implements TvAdapter {
  readonly brand = 'samsung';

  private readonly conexiones = new Map<string, Conexion>();
  /** Cache de si este televisor contesta RenderingControl, para no re-sondear. */
  private readonly soportaVolumenAbsoluto = new Map<string, boolean>();
  /** Cache del controlURL de AVTransport. null = ya se busco y no lo tiene. */
  private readonly avTransport = new Map<string, string | null>();

  constructor(private readonly onToken: (deviceId: string, token: string) => void) {}

  async capabilities(device: Device): Promise<Capability[]> {
    const caps: Capability[] = ['power', 'volume', 'dpad', 'launchApp'];

    // El encendido solo es posible por Wake-on-LAN, y solo si tenemos la MAC.
    if (device.mac) caps.push('wakeOnLan');

    let absoluto = this.soportaVolumenAbsoluto.get(device.id);
    if (absoluto === undefined) {
      absoluto = await rc.probeRenderingControl(device.ip);
      this.soportaVolumenAbsoluto.set(device.id, absoluto);
      logger.debug(
        { deviceId: device.id, absoluto },
        absoluto
          ? 'El televisor contesta RenderingControl: hay volumen absoluto'
          : 'Sin RenderingControl: volumen solo por pasos',
      );
    }
    if (absoluto) caps.push('volumeAbsolute', 'mute');

    // Reproducir archivos va por DLNA, no por el canal de control remoto. Solo
    // se declara si el televisor expone de verdad el servicio AVTransport.
    if ((await this.controlUrlAvTransport(device)) !== null) caps.push('castUrl', 'castFile');

    return caps;
  }

  /**
   * Busca el controlURL de AVTransport en el descriptor UPnP del televisor.
   *
   * El descriptor se anuncia en la cabecera LOCATION de SSDP, que el
   * descubrimiento ya guardo. Si no hay ninguna, se prueba la ruta habitual de
   * Samsung, pero solo se acepta si el televisor contesta de verdad: probarla no
   * es asumir que existe.
   */
  private async controlUrlAvTransport(device: Device): Promise<string | null> {
    const cacheado = this.avTransport.get(device.id);
    if (cacheado !== undefined) return cacheado;

    const ssdp = device.raw?.['ssdp'];
    const locations: string[] = Array.isArray(ssdp)
      ? ssdp
          .map((r) => (typeof r === 'object' && r !== null ? (r as Record<string, unknown>)['location'] : undefined))
          .filter((l): l is string => typeof l === 'string')
      : [];
    // Ruta habitual del renderizador de Samsung, como ultimo intento.
    locations.push(`http://${device.ip}:9197/dmr`);

    for (const location of [...new Set(locations)]) {
      const descripcion = await fetchUpnpDescription(location, 3000);
      const url = findServiceControlUrl(descripcion, 'AVTransport');
      if (url) {
        logger.debug({ deviceId: device.id, url }, 'AVTransport encontrado');
        this.avTransport.set(device.id, url);
        return url;
      }
    }

    logger.debug({ deviceId: device.id }, 'Este televisor no expone AVTransport');
    this.avTransport.set(device.id, null);
    return null;
  }

  async pairingStatus(device: Device, credentials?: Credentials): Promise<PairingStatus> {
    const info = await probeSamsung(device.ip, 2000);

    // Los modelos 2016 y anteriores no piden token: no hay nada que emparejar.
    if (info?.tokenAuthSupport === false) {
      return {
        deviceId: device.id,
        state: 'not_required',
        message: 'Este televisor no necesita emparejamiento.',
        needsPin: false,
      };
    }

    if (credentials?.token) {
      return {
        deviceId: device.id,
        state: 'paired',
        message: 'Emparejado.',
        needsPin: false,
      };
    }

    return {
      deviceId: device.id,
      state: 'required',
      message:
        'Al tocar Emparejar va a aparecer un aviso en la pantalla del televisor. Elegi "Permitir". ' +
        'Tenes unos segundos para hacerlo.',
      needsPin: false,
    };
  }

  /**
   * Empareja abriendo el canal sin token: eso dispara el aviso en el televisor.
   * El token llega dentro del evento de conexion y se devuelve para persistirlo.
   */
  async pair(device: Device): Promise<Credentials> {
    this.cerrar(device.id);
    const token = await this.abrirYObtenerToken(device, undefined);
    if (!token) {
      throw new ControlError(
        'El televisor acepto la conexion pero no devolvio token',
        'El televisor se conecto pero no devolvio la credencial. Proba apagarlo y encenderlo, y emparejar de nuevo.',
        'no_token',
      );
    }
    return { token };
  }

  async connect(device: Device, credentials?: Credentials): Promise<void> {
    await this.asegurarConexion(device, credentials);
  }

  async disconnect(device: Device): Promise<void> {
    this.cerrar(device.id);
  }

  async sendKey(device: Device, key: RemoteKey, credentials?: Credentials): Promise<void> {
    const samsungKey = SAMSUNG_KEYS[key];
    if (!samsungKey) throw new NotSupportedError(`la tecla "${key}"`, 'Samsung');

    const conexion = await this.asegurarConexion(device, credentials);
    const mensaje = buildKeyMessage(samsungKey);
    protocolLog('samsung', 'tx', device.ip, mensaje);
    conexion.ws.send(mensaje);
    this.marcarUso(device.id, conexion);
  }

  async volumeStep(device: Device, delta: number, credentials?: Credentials): Promise<void> {
    const key: RemoteKey = delta > 0 ? 'volumeUp' : 'volumeDown';
    // El televisor ignora pulsaciones demasiado seguidas, por eso van espaciadas.
    for (let i = 0; i < Math.abs(delta); i++) {
      await this.sendKey(device, key, credentials);
      if (i < Math.abs(delta) - 1) await esperar(60);
    }
  }

  async setVolume(device: Device, level: number, _credentials?: Credentials): Promise<void> {
    if (!(await rc.setVolume(device.ip, level))) {
      throw new NotSupportedError('poner un volumen exacto', 'Este televisor');
    }
  }

  async setMute(device: Device, muted: boolean, _credentials?: Credentials): Promise<void> {
    if (!(await rc.setMute(device.ip, muted))) {
      throw new NotSupportedError('silenciar por valor', 'Este televisor');
    }
  }

  async powerOff(device: Device, credentials?: Credentials): Promise<void> {
    await this.sendKey(device, 'power', credentials);
  }

  /**
   * Encendido por Wake-on-LAN: es la unica via. Con el televisor apagado, el
   * canal de control no existe, asi que ninguna tecla llega.
   */
  async powerOn(device: Device): Promise<void> {
    if (!device.mac) {
      throw new ControlError(
        'Sin MAC no se puede hacer Wake-on-LAN',
        'No conocemos la direccion MAC de este televisor, asi que no se puede encender de forma remota. Proba escanear de nuevo con el televisor encendido.',
        'no_mac',
        400,
      );
    }
    await wake(device.mac);
  }

  /**
   * Envia una URL al televisor por DLNA.
   *
   * El televisor va a buscar el archivo por su cuenta a la direccion que le
   * pasamos, asi que tiene que ser una IP de la red local alcanzable desde el
   * televisor: nunca localhost.
   */
  async castUrl(device: Device, media: CastUrlRequest): Promise<void> {
    const controlUrl = await this.controlUrlAvTransport(device);
    if (!controlUrl) {
      throw new NotSupportedError('reproducir contenido enviado', 'Este televisor');
    }

    const cliente = new AvTransportClient(controlUrl);
    const didl = buildDidlLite({
      title: media.title ?? 'Video',
      url: media.url,
      contentType: media.contentType ?? 'video/mp4',
    });

    if (!(await cliente.setUri(media.url, didl))) {
      throw new ControlError(
        'El televisor rechazo SetAVTransportURI',
        'El televisor no acepto el video. Fijate que el archivo sea accesible desde la red y que el formato sea compatible.',
        'set_uri_failed',
      );
    }

    // Algunos modelos necesitan un respiro entre cargar y reproducir: mandar
    // Play inmediatamente devuelve error de "transicion no permitida".
    await esperar(400);

    if (!(await cliente.play())) {
      throw new ControlError(
        'El televisor rechazo Play',
        'El video se cargo pero el televisor no lo empezo a reproducir. Proba darle play con el control del televisor.',
        'play_failed',
      );
    }
  }

  async stopCast(device: Device): Promise<void> {
    const controlUrl = await this.controlUrlAvTransport(device);
    if (!controlUrl) return;
    await new AvTransportClient(controlUrl).stop();
  }

  async getState(device: Device, _credentials?: Credentials): Promise<DeviceState> {
    // Si /api/v2/ contesta, el televisor esta encendido o en espera con red.
    const info = await probeSamsung(device.ip, 1500);
    const state: DeviceState = { powered: info !== undefined };

    if (this.soportaVolumenAbsoluto.get(device.id)) {
      const [volume, muted] = await Promise.all([rc.getVolume(device.ip), rc.getMute(device.ip)]);
      if (volume !== undefined) state.volume = volume;
      if (muted !== undefined) state.muted = muted;
    }

    const controlUrl = this.avTransport.get(device.id);
    if (controlUrl) {
      const cliente = new AvTransportClient(controlUrl);
      const [posicion, transporte] = await Promise.all([
        cliente.positionInfo(),
        cliente.transportState(),
      ]);
      if (transporte && transporte !== 'NO_MEDIA_PRESENT') {
        state.media = {
          playerState: traducirEstadoTransporte(transporte),
          ...(posicion.title !== undefined ? { title: posicion.title } : {}),
          ...(posicion.position !== undefined ? { position: posicion.position } : {}),
          ...(posicion.duration !== undefined ? { duration: posicion.duration } : {}),
        };
      }
    }
    return state;
  }

  /**
   * Lista de apps instaladas.
   *
   * El televisor la manda por un evento aparte y muchos modelos 2020+ dejaron
   * de responder. Si no contesta en dos segundos se devuelve vacio: la interfaz
   * muestra "no se pudo obtener" en vez de una lista inventada.
   */
  async listApps(device: Device, credentials?: Credentials): Promise<App[]> {
    const conexion = await this.asegurarConexion(device, credentials);

    return new Promise<App[]>((resolve) => {
      const timer = setTimeout(() => {
        conexion.ws.off('message', alRecibir);
        logger.debug({ deviceId: device.id }, 'El televisor no devolvio la lista de apps');
        resolve([]);
      }, 2000);

      const alRecibir = (data: WebSocket.RawData): void => {
        const evento = parseSamsungMessage(data.toString());
        if (evento?.kind !== 'apps') return;
        clearTimeout(timer);
        conexion.ws.off('message', alRecibir);
        resolve(evento.apps.map((a) => ({ id: a.id, name: a.name })));
      };

      conexion.ws.on('message', alRecibir);
      conexion.ws.send(buildAppListMessage());
    });
  }

  /**
   * Lanza una app por la API REST del televisor.
   * [rev] Funciona en varios modelos y en otros devuelve 404. El error se
   * propaga con un mensaje claro en vez de fingir que salio bien.
   */
  async launchApp(device: Device, appId: string): Promise<void> {
    try {
      const res = await fetch(`http://${device.ip}:8001/api/v2/applications/${appId}`, {
        method: 'POST',
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) {
        throw new ControlError(
          `El televisor respondio ${res.status} al lanzar ${appId}`,
          'Este televisor no dejo abrir la aplicacion. Algunos modelos Samsung recientes bloquean esta funcion.',
          'launch_failed',
        );
      }
    } catch (err) {
      if (err instanceof ControlError) throw err;
      throw new DeviceOfflineError(device.ip);
    }
  }

  // ─── Conexion ─────────────────────────────────────────────────────────────

  private async asegurarConexion(device: Device, credentials?: Credentials): Promise<Conexion> {
    const existente = this.conexiones.get(device.id);
    if (existente && existente.ws.readyState === WebSocket.OPEN) {
      this.marcarUso(device.id, existente);
      return existente;
    }
    if (existente) this.cerrar(device.id);

    await this.abrirYObtenerToken(device, credentials?.token);
    const conexion = this.conexiones.get(device.id);
    if (!conexion) throw new DeviceOfflineError(device.ip);
    return conexion;
  }

  private async abrirYObtenerToken(
    device: Device,
    token: string | undefined,
  ): Promise<string | undefined> {
    const info = await probeSamsung(device.ip, 2000);
    if (!info) throw new DeviceOfflineError(device.ip);

    const endpoint = buildChannelUrl(device.ip, APP_NAME, {
      tokenAuthSupport: info.tokenAuthSupport ?? true,
      ...(token !== undefined ? { token } : {}),
    });

    logger.debug({ deviceId: device.id, url: endpoint.url.replace(/token=[^&]*/, 'token=***') },
      'Abriendo el canal de control de Samsung');

    return new Promise<string | undefined>((resolve, reject) => {
      const ws = new WebSocket(endpoint.url, {
        // El certificado del televisor es autofirmado. La excepcion vale SOLO
        // para esta conexion; nunca se toca la validacion global de TLS.
        rejectUnauthorized: false,
        handshakeTimeout: CONNECT_TIMEOUT_MS,
      });

      let resuelto = false;
      const timer = setTimeout(() => {
        if (resuelto) return;
        resuelto = true;
        ws.close();
        reject(
          new ControlError(
            'Se agoto el tiempo esperando la autorizacion',
            'El televisor no respondio a tiempo. Si aparecio un aviso en la pantalla, aceptalo y proba de nuevo.',
            'pairing_timeout',
            504,
          ),
        );
      }, CONNECT_TIMEOUT_MS);

      const terminar = (fn: () => void): void => {
        if (resuelto) return;
        resuelto = true;
        clearTimeout(timer);
        fn();
      };

      ws.on('message', (data) => {
        const raw = data.toString();
        protocolLog('samsung', 'rx', device.ip, raw);
        const evento = parseSamsungMessage(raw);
        if (!evento) return;

        switch (evento.kind) {
          case 'connected': {
            if (evento.token) this.onToken(device.id, evento.token);
            const conexion: Conexion = { ws, lista: Promise.resolve(), ultimoUso: Date.now() };
            this.conexiones.set(device.id, conexion);
            this.marcarUso(device.id, conexion);
            terminar(() => resolve(evento.token));
            break;
          }
          case 'unauthorized':
            terminar(() => {
              ws.close();
              reject(new PairingRejectedError());
            });
            break;
          case 'timeout':
            terminar(() => {
              ws.close();
              reject(
                new ControlError(
                  'El televisor cerro la conexion por inactividad',
                  'El televisor cerro la conexion. Proba de nuevo.',
                  'tv_timeout',
                  504,
                ),
              );
            });
            break;
          default:
            break;
        }
      });

      ws.on('error', (err) => {
        logger.debug({ err, deviceId: device.id }, 'Error en el WebSocket de Samsung');
        terminar(() => reject(new DeviceOfflineError(device.ip)));
      });

      ws.on('close', () => {
        this.conexiones.delete(device.id);
        terminar(() => reject(new DeviceOfflineError(device.ip)));
      });
    });
  }

  private marcarUso(deviceId: string, conexion: Conexion): void {
    conexion.ultimoUso = Date.now();
    if (conexion.idleTimer) clearTimeout(conexion.idleTimer);
    conexion.idleTimer = setTimeout(() => this.cerrar(deviceId), IDLE_TIMEOUT_MS);
    conexion.idleTimer.unref?.();
  }

  private cerrar(deviceId: string): void {
    const conexion = this.conexiones.get(deviceId);
    if (!conexion) return;
    if (conexion.idleTimer) clearTimeout(conexion.idleTimer);
    try {
      conexion.ws.close();
    } catch {
      // Ya cerrado.
    }
    this.conexiones.delete(deviceId);
  }
}

function esperar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** UPnP usa sus propios nombres de estado; se unifican con los de castv2. */
function traducirEstadoTransporte(estado: string): string {
  const equivalencias: Record<string, string> = {
    PLAYING: 'PLAYING',
    PAUSED_PLAYBACK: 'PAUSED',
    TRANSITIONING: 'BUFFERING',
    STOPPED: 'IDLE',
    NO_MEDIA_PRESENT: 'IDLE',
  };
  return equivalencias[estado] ?? estado;
}
