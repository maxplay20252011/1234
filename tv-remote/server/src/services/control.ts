import type { App, Capability, Device, Input, PairingStatus, RemoteKey } from '@tv-remote/shared';
import type { AdapterRegistry, DeviceState, TvAdapter } from '../adapters/types.js';
import { ControlError, NotSupportedError } from '../adapters/errors.js';
import type { DevicesRepo } from '../db/devices.repo.js';
import type { CredentialsRepo } from './credentials.repo.js';
import type { StateHub } from './state-hub.js';
import { logger } from '../logger.js';

/**
 * Punto unico por donde pasa todo comando hacia un televisor.
 *
 * Resuelve el dispositivo, elige el adapter, carga las credenciales
 * descifradas, verifica que la accion este dentro de lo que ese aparato declara
 * poder hacer, y refresca el estado en vivo despues de actuar.
 *
 * La verificacion de capacidades es el corazon del diseno: un televisor Samsung
 * no tiene volumen absoluto salvo que conteste RenderingControl, y el registro
 * de capacidades es lo que hace que la interfaz esconda el control deslizante
 * en vez de mostrar uno que no funciona.
 */
export class ControlService {
  constructor(
    private readonly devices: DevicesRepo,
    private readonly credentials: CredentialsRepo,
    private readonly registry: AdapterRegistry,
    private readonly hub: StateHub,
  ) {}

  /** Refresca en la base lo que el adapter declara que este aparato puede hacer. */
  async refreshCapabilities(deviceId: string): Promise<Capability[]> {
    const { device, adapter } = this.resolve(deviceId);
    const caps = await adapter.capabilities(device);
    this.devices.upsert({ ...device, capabilities: caps });
    return caps;
  }

  async pairingStatus(deviceId: string): Promise<PairingStatus> {
    const { device, adapter } = this.resolve(deviceId);
    return adapter.pairingStatus(device, this.credentials.get(deviceId));
  }

  async pair(deviceId: string, pin?: string): Promise<PairingStatus> {
    const { device, adapter } = this.resolve(deviceId);
    if (!adapter.pair) {
      return {
        deviceId,
        state: 'not_required',
        message: 'Este dispositivo no necesita emparejamiento.',
        needsPin: false,
      };
    }

    this.hub.pairing({
      deviceId,
      state: 'waiting_for_user',
      message: 'Mira la pantalla del televisor y aceptá el aviso.',
      needsPin: false,
    });

    const creds = await adapter.pair(device, pin);
    this.credentials.save(deviceId, device.brand, creds);
    await this.refreshCapabilities(deviceId);

    const status: PairingStatus = {
      deviceId,
      state: 'paired',
      message: 'Listo, quedó emparejado.',
      needsPin: false,
    };
    this.hub.pairing(status);
    return status;
  }

  async sendKey(deviceId: string, key: RemoteKey): Promise<void> {
    const { device, adapter, creds } = this.resolve(deviceId);
    await adapter.sendKey(device, key, creds);
    this.refreshStateSoon(deviceId);
  }

  async volumeStep(deviceId: string, delta: number): Promise<void> {
    const { device, adapter, creds } = this.resolve(deviceId);
    this.requireCapability(device, 'volume', 'cambiar el volumen');
    await adapter.volumeStep(device, delta, creds);
    this.refreshStateSoon(deviceId);
  }

  async setVolume(deviceId: string, level: number): Promise<void> {
    const { device, adapter, creds } = this.resolve(deviceId);
    this.requireCapability(device, 'volumeAbsolute', 'poner un volumen exacto');
    if (!adapter.setVolume) throw new NotSupportedError('el volumen exacto', device.brand);
    await adapter.setVolume(device, level, creds);
    this.hub.update(deviceId, { volume: level });
  }

  async setMute(deviceId: string, muted: boolean): Promise<void> {
    const { device, adapter, creds } = this.resolve(deviceId);
    // Sin capacidad 'mute' el silencio existe igual, pero como interruptor:
    // se manda la tecla y el televisor decide. Es honesto y sigue siendo util.
    if (!device.capabilities.includes('mute') || !adapter.setMute) {
      await adapter.sendKey(device, 'mute', creds);
      this.refreshStateSoon(deviceId);
      return;
    }
    await adapter.setMute(device, muted, creds);
    this.hub.update(deviceId, { muted });
  }

  async powerOn(deviceId: string): Promise<void> {
    const { device, adapter, creds } = this.resolve(deviceId);
    if (!adapter.powerOn) throw new NotSupportedError('el encendido remoto', device.brand);
    await adapter.powerOn(device, creds);
    // El televisor tarda varios segundos en aceptar comandos despues de
    // encender, asi que no se refresca el estado enseguida.
    this.refreshStateSoon(deviceId, 8000);
  }

  async powerOff(deviceId: string): Promise<void> {
    const { device, adapter, creds } = this.resolve(deviceId);
    if (!adapter.powerOff) throw new NotSupportedError('el apagado remoto', device.brand);
    await adapter.powerOff(device, creds);
    this.hub.update(deviceId, { powered: false });
  }

  async listInputs(deviceId: string): Promise<Input[]> {
    const { device, adapter, creds } = this.resolve(deviceId);
    if (!adapter.listInputs) return [];
    return adapter.listInputs(device, creds);
  }

  async setInput(deviceId: string, inputId: string): Promise<void> {
    const { device, adapter, creds } = this.resolve(deviceId);
    this.requireCapability(device, 'input', 'cambiar la entrada');
    if (!adapter.setInput) throw new NotSupportedError('el cambio de entrada', device.brand);
    await adapter.setInput(device, inputId, creds);
    this.hub.update(deviceId, { currentInput: inputId });
  }

  async listApps(deviceId: string): Promise<App[]> {
    const { device, adapter, creds } = this.resolve(deviceId);
    if (!adapter.listApps) return [];
    return adapter.listApps(device, creds);
  }

  async launchApp(deviceId: string, appId: string, deepLink?: string): Promise<void> {
    const { device, adapter, creds } = this.resolve(deviceId);
    this.requireCapability(device, 'launchApp', 'abrir aplicaciones');
    if (!adapter.launchApp) throw new NotSupportedError('abrir aplicaciones', device.brand);
    await adapter.launchApp(device, appId, deepLink, creds);
    this.hub.update(deviceId, { currentApp: appId });
  }

  async refreshState(deviceId: string): Promise<DeviceState> {
    const { device, adapter, creds } = this.resolve(deviceId);
    const state = await adapter.getState(device, creds);
    this.hub.update(deviceId, state);
    return state;
  }

  /** Marcas con adapter. La interfaz lo usa para saber que se puede controlar. */
  controllableBrands(): string[] {
    return this.registry.brands();
  }

  private resolve(deviceId: string): {
    device: Device;
    adapter: TvAdapter;
    creds: ReturnType<CredentialsRepo['get']>;
  } {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new ControlError(
        `No existe el dispositivo ${deviceId}`,
        'Ese dispositivo ya no esta en la lista. Proba escanear de nuevo.',
        'device_not_found',
        404,
      );
    }

    const adapter = this.registry.get(device.brand);
    if (!adapter) {
      throw new ControlError(
        `Sin adapter para la marca ${device.brand}`,
        `Todavia no hay soporte de control para este dispositivo (${device.brand}). Se detecta pero no se puede manejar.`,
        'no_adapter',
        501,
      );
    }

    return { device, adapter, creds: this.credentials.get(deviceId) };
  }

  private requireCapability(device: Device, cap: Capability, accion: string): void {
    if (device.capabilities.includes(cap)) return;
    throw new ControlError(
      `El dispositivo no declara la capacidad ${cap}`,
      `Este dispositivo no permite ${accion}.`,
      'missing_capability',
      400,
    );
  }

  /**
   * Relee el estado un rato despues de actuar. El televisor necesita un momento
   * para aplicar el cambio, y preguntarle enseguida devuelve el valor viejo.
   */
  private refreshStateSoon(deviceId: string, delayMs = 400): void {
    setTimeout(() => {
      void this.refreshState(deviceId).catch((err: unknown) => {
        logger.debug({ err, deviceId }, 'No se pudo refrescar el estado');
      });
    }, delayMs).unref?.();
  }
}
