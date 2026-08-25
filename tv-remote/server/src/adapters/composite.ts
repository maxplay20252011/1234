import type { App, Capability, Device, Input, PairingStatus, RemoteKey, CastUrlRequest } from '@tv-remote/shared';
import type { Credentials, DeviceState, TvAdapter } from './types.js';
import { NotSupportedError } from './errors.js';

/**
 * Combina dos adapters que hablan con el MISMO aparato por protocolos distintos.
 *
 * Existe por un caso concreto: un Chromecast con Google TV habla castv2 (para
 * reproducir contenido y manejar el volumen) Y androidtvremote2 (para la
 * cruceta, el encendido y las apps). Ninguno de los dos solo alcanza, y el
 * registro de adapters mapea una marca a un adapter, asi que hace falta algo
 * que los presente como uno.
 *
 * El reparto no es arbitrario:
 *  - control (cruceta, encendido): va al adapter de control, que es el unico
 *    que las tiene;
 *  - volumen y reproduccion: van al de medios, porque castv2 tiene volumen
 *    absoluto real y no necesita emparejamiento.
 */
export class CompositeAdapter implements TvAdapter {
  constructor(
    readonly brand: string,
    /** Cruceta, encendido y emparejamiento. */
    private readonly control: TvAdapter,
    /** Volumen, silencio y reproduccion de contenido. */
    private readonly media: TvAdapter,
  ) {}

  async capabilities(device: Device): Promise<Capability[]> {
    // La union de lo que cada uno puede: es lo que el aparato puede en total.
    const [a, b] = await Promise.all([
      this.control.capabilities(device).catch(() => [] as Capability[]),
      this.media.capabilities(device).catch(() => [] as Capability[]),
    ]);
    return [...new Set([...a, ...b])];
  }

  async pairingStatus(device: Device, credentials?: Credentials): Promise<PairingStatus> {
    return this.control.pairingStatus(device, credentials);
  }

  async beginPairing(device: Device): Promise<PairingStatus> {
    if (!this.control.beginPairing) {
      return this.control.pairingStatus(device);
    }
    return this.control.beginPairing(device);
  }

  async pair(device: Device, pin?: string): Promise<Credentials> {
    if (!this.control.pair) throw new NotSupportedError('el emparejamiento', this.brand);
    return this.control.pair(device, pin);
  }

  async connect(device: Device, credentials?: Credentials): Promise<void> {
    // El de medios no necesita emparejamiento, asi que puede conectar aunque el
    // de control todavia no este emparejado. Se intentan los dos y se ignora el
    // que falle: tener uno solo ya es util.
    await Promise.allSettled([
      this.control.connect(device, credentials),
      this.media.connect(device, credentials),
    ]);
  }

  async disconnect(device: Device): Promise<void> {
    await Promise.allSettled([this.control.disconnect(device), this.media.disconnect(device)]);
  }

  async sendKey(device: Device, key: RemoteKey, credentials?: Credentials): Promise<void> {
    // Las teclas de reproduccion las maneja mejor el adapter de medios, que sabe
    // que se esta reproduciendo; el resto va al de control.
    const deMedios: RemoteKey[] = ['play', 'pause', 'stop'];
    if (deMedios.includes(key)) {
      try {
        await this.media.sendKey(device, key, credentials);
        return;
      } catch {
        // Si no hay nada reproduciendose, la tecla fisica sirve igual.
      }
    }
    await this.control.sendKey(device, key, credentials);
  }

  async volumeStep(device: Device, delta: number, credentials?: Credentials): Promise<void> {
    return this.media.volumeStep(device, delta, credentials);
  }

  async setVolume(device: Device, level: number, credentials?: Credentials): Promise<void> {
    if (!this.media.setVolume) throw new NotSupportedError('el volumen exacto', this.brand);
    return this.media.setVolume(device, level, credentials);
  }

  async setMute(device: Device, muted: boolean, credentials?: Credentials): Promise<void> {
    if (!this.media.setMute) throw new NotSupportedError('silenciar por valor', this.brand);
    return this.media.setMute(device, muted, credentials);
  }

  async powerOn(device: Device, credentials?: Credentials): Promise<void> {
    if (!this.control.powerOn) throw new NotSupportedError('el encendido', this.brand);
    return this.control.powerOn(device, credentials);
  }

  async powerOff(device: Device, credentials?: Credentials): Promise<void> {
    if (!this.control.powerOff) throw new NotSupportedError('el apagado', this.brand);
    return this.control.powerOff(device, credentials);
  }

  async listInputs(device: Device, credentials?: Credentials): Promise<Input[]> {
    return this.control.listInputs?.(device, credentials) ?? [];
  }

  async setInput(device: Device, inputId: string, credentials?: Credentials): Promise<void> {
    if (!this.control.setInput) throw new NotSupportedError('el cambio de entrada', this.brand);
    return this.control.setInput(device, inputId, credentials);
  }

  async listApps(device: Device, credentials?: Credentials): Promise<App[]> {
    return this.control.listApps?.(device, credentials) ?? [];
  }

  async launchApp(
    device: Device,
    appId: string,
    deepLink?: string,
    credentials?: Credentials,
  ): Promise<void> {
    if (!this.control.launchApp) throw new NotSupportedError('abrir aplicaciones', this.brand);
    return this.control.launchApp(device, appId, deepLink, credentials);
  }

  async castUrl(device: Device, media: CastUrlRequest, credentials?: Credentials): Promise<void> {
    if (!this.media.castUrl) throw new NotSupportedError('reproducir contenido', this.brand);
    return this.media.castUrl(device, media, credentials);
  }

  async stopCast(device: Device, credentials?: Credentials): Promise<void> {
    return this.media.stopCast?.(device, credentials);
  }

  /** Estado combinado: lo que sepa cada uno, sin que uno pise al otro con vacio. */
  async getState(device: Device, credentials?: Credentials): Promise<DeviceState> {
    const [control, media] = await Promise.allSettled([
      this.control.getState(device, credentials),
      this.media.getState(device, credentials),
    ]);
    return {
      ...(control.status === 'fulfilled' ? control.value : {}),
      ...(media.status === 'fulfilled' ? media.value : {}),
    };
  }
}
