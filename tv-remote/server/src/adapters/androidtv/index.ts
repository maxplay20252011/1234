import type { App, Capability, Device, PairingStatus, RemoteKey } from '@tv-remote/shared';
import type { Credentials, DeviceState, TvAdapter } from '../types.js';
import { ControlError, NotImplementedError, NotSupportedError, NotPairedError } from '../errors.js';
import { logger } from '../../logger.js';
import { AndroidTvClient, peerKeyParts } from './client.js';
import { generateClientCertificate, publicKeyParts, type ClientCertificate } from './certificate.js';
import { ANDROID_KEYCODES } from './keys.js';
import {
  PAIRING_PORT,
  REMOTE_PORT,
  STATUS,
  computePairingSecret,
  pairingConfiguration,
  pairingOption,
  pairingRequest,
  pairingSecret,
  parsePairingMessage,
  parseRemoteMessage,
  remoteConfigure,
  remoteKeyInject,
  remotePingResponse,
  remoteSetActive,
} from './protocol.js';

const SERVICE_NAME = 'tv-remote';
const CLIENT_NAME = 'Control de TVs';

type SesionEmparejamiento = {
  client: AndroidTvClient;
  cert: ClientCertificate;
  server: { modulus: Buffer; exponent: Buffer };
  expira: NodeJS.Timeout;
};

/**
 * Adapter de Android TV y Google TV por androidtvremote2.
 *
 * Es lo que le da cruceta, encendido y volumen a un Chromecast con Google TV.
 * El casteo de contenido sigue yendo por el adapter Cast: los dos hablan con el
 * mismo aparato, cada uno por su protocolo.
 *
 * ═══ ADVERTENCIA ═══
 * Es la parte mas fragil del proyecto. Google no publica este protocolo. Las
 * piezas verificables tienen tests (el certificado se valida contra
 * crypto.X509Certificate, los codigos de tecla son constantes publicas de
 * Android), pero el emparejamiento NO se probo contra un aparato real.
 *
 * Si falla, el orden de sospecha esta documentado en protocol.ts.
 */
export class AndroidTvAdapter implements TvAdapter {
  readonly brand = 'androidtv';

  private readonly sesiones = new Map<string, SesionEmparejamiento>();
  private readonly conexiones = new Map<string, AndroidTvClient>();

  async capabilities(_device: Device): Promise<Capability[]> {
    // Sin 'volumeAbsolute': el protocolo maneja pasos, y el mensaje de volumen
    // exacto es de los que no se pudieron verificar.
    return ['power', 'volume', 'mute', 'dpad'];
  }

  async pairingStatus(device: Device, credentials?: Credentials): Promise<PairingStatus> {
    if (credentials?.extra?.['certificatePem']) {
      return {
        deviceId: device.id,
        state: 'paired',
        message: 'Emparejado.',
        needsPin: true,
      };
    }
    return {
      deviceId: device.id,
      state: 'required',
      message:
        'Al tocar Emparejar, el televisor va a mostrar un código de 6 caracteres. Escribilo acá abajo.',
      needsPin: true,
    };
  }

  /**
   * Primer paso: conecta al puerto de emparejamiento y hace el saludo hasta que
   * el televisor muestra el codigo en pantalla. La conexion queda abierta,
   * porque el secreto se calcula sobre las claves de ESTA sesion.
   */
  async beginPairing(device: Device): Promise<PairingStatus> {
    this.cerrarSesion(device.id);

    const cert = generateClientCertificate(SERVICE_NAME);
    const client = new AndroidTvClient(device.ip, PAIRING_PORT, cert);
    await client.connect();

    const peer = client.peerCertificate();
    if (!peer) {
      client.disconnect();
      throw new ControlError(
        'El televisor no presento certificado',
        'El televisor no completó la conexión segura. Probá apagarlo y encenderlo.',
        'no_peer_cert',
      );
    }

    const paso = async (mensaje: Buffer, esperado: number): Promise<void> => {
      client.send(mensaje);
      const respuesta = await client.waitFor((buf) => {
        const evento = parsePairingMessage(buf);
        return evento.kind === esperado || evento.status !== STATUS.OK;
      });
      const evento = parsePairingMessage(respuesta);
      if (evento.status !== STATUS.OK) {
        throw new ControlError(
          `El televisor respondio estado ${evento.status} en el paso ${esperado}`,
          'El televisor rechazó el emparejamiento. Fijate en Configuración que las conexiones de aplicaciones estén permitidas.',
          'pairing_rejected',
          403,
        );
      }
    };

    try {
      await paso(pairingRequest(SERVICE_NAME, CLIENT_NAME), 11);
      await paso(pairingOption(), 21);
      await paso(pairingConfiguration(), 31);
    } catch (err) {
      client.disconnect();
      throw err;
    }

    // La sesion caduca sola: el codigo del televisor tampoco dura para siempre.
    const expira = setTimeout(() => this.cerrarSesion(device.id), 120_000);
    expira.unref?.();
    this.sesiones.set(device.id, { client, cert, server: peerKeyParts(peer), expira });

    logger.info({ deviceId: device.id }, 'El televisor deberia estar mostrando el codigo');
    return {
      deviceId: device.id,
      state: 'waiting_for_user',
      message: 'Mirá el televisor: apareció un código de 6 caracteres. Escribilo acá.',
      needsPin: true,
    };
  }

  /** Segundo paso: manda el secreto derivado del codigo que tipeo el usuario. */
  async pair(device: Device, pin?: string): Promise<Credentials> {
    const sesion = this.sesiones.get(device.id);
    if (!sesion) {
      throw new ControlError(
        'No hay un emparejamiento en curso',
        'Tocá Emparejar primero para que el televisor muestre el código.',
        'no_pairing_session',
        409,
      );
    }
    if (!pin) {
      throw new ControlError(
        'Falta el codigo',
        'Escribí el código de 6 caracteres que muestra el televisor.',
        'pin_required',
        400,
      );
    }

    let secreto;
    try {
      secreto = computePairingSecret(pin, publicKeyParts(sesion.cert.certificatePem), sesion.server);
    } catch {
      throw new ControlError(
        'Codigo con formato invalido',
        'El código tiene que ser de 6 caracteres (números y letras de la A a la F).',
        'bad_pin_format',
        400,
      );
    }

    // La comprobacion es local: los dos primeros caracteres del codigo tienen
    // que coincidir con el primer byte del hash. Si no dan, o el codigo esta
    // mal tipeado o el calculo del secreto esta mal (ver protocol.ts).
    if (!secreto.checksumMatches) {
      logger.warn(
        { deviceId: device.id },
        'La comprobacion del codigo no coincide. Si el codigo esta bien tipeado, revisar computePairingSecret.',
      );
    }

    try {
      sesion.client.send(pairingSecret(secreto.secret));
      const respuesta = await sesion.client.waitFor((buf) => {
        const evento = parsePairingMessage(buf);
        return evento.kind === 41 || evento.status !== STATUS.OK;
      });

      const evento = parsePairingMessage(respuesta);
      if (evento.status !== STATUS.OK) {
        throw new ControlError(
          `El televisor rechazo el secreto (estado ${evento.status})`,
          evento.status === STATUS.BAD_SECRET
            ? 'El código no es correcto. Fijate bien en la pantalla del televisor y probá de nuevo.'
            : 'El televisor rechazó el emparejamiento. Probá de nuevo desde el principio.',
          'bad_secret',
          403,
        );
      }
    } finally {
      this.cerrarSesion(device.id);
    }

    // El certificado ES la credencial: el televisor lo recuerda y despues solo
    // acepta conexiones que lo presenten.
    return {
      token: 'androidtv',
      extra: {
        certificatePem: sesion.cert.certificatePem,
        privateKeyPem: sesion.cert.privateKeyPem,
      },
    };
  }

  async connect(device: Device, credentials?: Credentials): Promise<void> {
    await this.conexion(device, credentials);
  }

  async disconnect(device: Device): Promise<void> {
    this.conexiones.get(device.id)?.disconnect();
    this.conexiones.delete(device.id);
    this.cerrarSesion(device.id);
  }

  async sendKey(device: Device, key: RemoteKey, credentials?: Credentials): Promise<void> {
    // 'exit' no existe en Android; 'back' hace lo mismo en la practica.
    const efectiva: RemoteKey = key === 'exit' ? 'back' : key;
    const keyCode = ANDROID_KEYCODES[efectiva];
    if (keyCode === undefined) {
      throw new NotSupportedError(`la tecla "${key}"`, 'Android TV');
    }

    const client = await this.conexion(device, credentials);
    client.send(remoteKeyInject(keyCode));
  }

  async volumeStep(device: Device, delta: number, credentials?: Credentials): Promise<void> {
    const key: RemoteKey = delta > 0 ? 'volumeUp' : 'volumeDown';
    for (let i = 0; i < Math.abs(delta); i++) {
      await this.sendKey(device, key, credentials);
      if (i < Math.abs(delta) - 1) await new Promise((r) => setTimeout(r, 60));
    }
  }

  async powerOn(device: Device, credentials?: Credentials): Promise<void> {
    // KEYCODE_POWER alterna. El aparato Cast nunca se apaga del todo, asi que
    // sigue escuchando y la tecla llega.
    await this.sendKey(device, 'power', credentials);
  }

  async powerOff(device: Device, credentials?: Credentials): Promise<void> {
    await this.sendKey(device, 'power', credentials);
  }

  /**
   * Abrir aplicaciones va por RemoteAppLinkLaunchRequest, cuyo numero de campo
   * no se pudo verificar. Mandar un numero equivocado no da error: el televisor
   * ignora el mensaje y parece que la aplicacion "no abrio". Preferible fallar
   * claro.
   *
   * TODO: confirmar el numero de campo capturando trafico de la app oficial de
   * Google TV y quitar este stub.
   */
  async launchApp(): Promise<void> {
    throw new NotImplementedError('abrir aplicaciones en Android TV');
  }

  async listApps(): Promise<App[]> {
    return [];
  }

  async getState(device: Device, credentials?: Credentials): Promise<DeviceState> {
    // El protocolo no expone consulta de estado: solo avisa cuando algo cambia.
    // Que la conexion se mantenga en pie es lo unico que se puede afirmar.
    try {
      await this.conexion(device, credentials);
      return { powered: true };
    } catch {
      return { powered: false };
    }
  }

  private async conexion(device: Device, credentials?: Credentials): Promise<AndroidTvClient> {
    const existente = this.conexiones.get(device.id);
    if (existente?.connected) return existente;

    const certificatePem = credentials?.extra?.['certificatePem'];
    const privateKeyPem = credentials?.extra?.['privateKeyPem'];
    if (!certificatePem || !privateKeyPem) throw new NotPairedError();

    const client = new AndroidTvClient(device.ip, REMOTE_PORT, { certificatePem, privateKeyPem });

    client.on('message', (buf) => {
      const evento = parseRemoteMessage(buf);
      if (!evento) return;
      // El televisor pinguea; hay que contestarle o corta la conexion.
      if (evento.kind === 'ping') client.send(remotePingResponse(evento.val1));
      if (evento.kind === 'error') {
        logger.debug({ deviceId: device.id, detalle: evento.detalle }, 'Android TV informo un error');
      }
    });

    client.on('close', () => this.conexiones.delete(device.id));

    await client.connect();
    client.send(remoteConfigure(device.model ?? 'desconocido', 'tv-remote'));
    client.send(remoteSetActive());

    this.conexiones.set(device.id, client);
    return client;
  }

  private cerrarSesion(deviceId: string): void {
    const sesion = this.sesiones.get(deviceId);
    if (!sesion) return;
    clearTimeout(sesion.expira);
    sesion.client.disconnect();
    this.sesiones.delete(deviceId);
  }
}
