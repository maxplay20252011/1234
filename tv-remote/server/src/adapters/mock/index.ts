import type { App, Capability, Device, Input, PairingStatus, RemoteKey } from '@tv-remote/shared';
import type { Credentials, DeviceState, TvAdapter } from '../types.js';
import { NotPairedError } from '../errors.js';
import { logger } from '../../logger.js';

export const MOCK_BRAND = 'mock';

/** Dispositivo simulado, para desarrollar y probar la interfaz sin hardware. */
export function buildMockDevice(): Device {
  return {
    id: 'mock:televisor-de-prueba',
    name: 'Televisor de prueba',
    brand: MOCK_BRAND as Device['brand'],
    model: 'Simulado (no es un televisor real)',
    ip: '0.0.0.0',
    mac: 'aa:bb:cc:dd:ee:ff',
    capabilities: [],
    paired: false,
    online: true,
    lastSeen: new Date().toISOString(),
    unstableId: false,
    sources: ['manual'],
    raw: { mock: true },
  };
}

/**
 * Televisor simulado.
 *
 * Existe por dos motivos. Uno, poder desarrollar y probar toda la interfaz sin
 * un televisor delante. Dos, y mas importante: es la unica manera de validar de
 * punta a punta el ControlService, las rutas y el estado en vivo, porque los
 * adapters reales no se pueden ejercitar en CI.
 *
 * Simula a proposito las limitaciones incomodas de un televisor de verdad:
 * pide emparejamiento, tarda en responder y el mute es un interruptor.
 */
export class MockAdapter implements TvAdapter {
  readonly brand = MOCK_BRAND;

  private emparejado = false;
  // currentApp se omite en vez de ponerlo en undefined: con
  // exactOptionalPropertyTypes, "ausente" y "undefined" no son lo mismo.
  private state: DeviceState = {
    powered: true,
    volume: 12,
    muted: false,
    currentInput: 'hdmi1',
  };

  async capabilities(_device: Device): Promise<Capability[]> {
    return ['power', 'wakeOnLan', 'volume', 'volumeAbsolute', 'mute', 'input', 'dpad', 'launchApp'];
  }

  async pairingStatus(device: Device, credentials?: Credentials): Promise<PairingStatus> {
    const listo = this.emparejado || credentials?.token !== undefined;
    return {
      deviceId: device.id,
      state: listo ? 'paired' : 'required',
      message: listo
        ? 'Emparejado.'
        : 'Este es un televisor simulado: al tocar Emparejar se acepta solo, sin aviso en pantalla.',
      needsPin: false,
    };
  }

  async pair(_device: Device): Promise<Credentials> {
    await this.demora(600);
    this.emparejado = true;
    return { token: 'token-simulado' };
  }

  async connect(_device: Device): Promise<void> {
    await this.demora(120);
  }

  async disconnect(_device: Device): Promise<void> {}

  async sendKey(device: Device, key: RemoteKey, credentials?: Credentials): Promise<void> {
    this.exigirEmparejado(credentials);
    await this.demora(80);
    logger.debug({ deviceId: device.id, key }, 'MockAdapter recibio una tecla');

    switch (key) {
      case 'volumeUp':
        this.state.volume = Math.min(100, (this.state.volume ?? 0) + 1);
        break;
      case 'volumeDown':
        this.state.volume = Math.max(0, (this.state.volume ?? 0) - 1);
        break;
      case 'mute':
        this.state.muted = !this.state.muted;
        break;
      case 'power':
        this.state.powered = !this.state.powered;
        break;
      default:
        break;
    }
  }

  async volumeStep(device: Device, delta: number, credentials?: Credentials): Promise<void> {
    for (let i = 0; i < Math.abs(delta); i++) {
      await this.sendKey(device, delta > 0 ? 'volumeUp' : 'volumeDown', credentials);
    }
  }

  async setVolume(_device: Device, level: number, credentials?: Credentials): Promise<void> {
    this.exigirEmparejado(credentials);
    await this.demora(80);
    this.state.volume = level;
  }

  async setMute(_device: Device, muted: boolean, credentials?: Credentials): Promise<void> {
    this.exigirEmparejado(credentials);
    await this.demora(80);
    this.state.muted = muted;
  }

  async powerOn(_device: Device): Promise<void> {
    await this.demora(400);
    this.state.powered = true;
  }

  async powerOff(_device: Device, credentials?: Credentials): Promise<void> {
    this.exigirEmparejado(credentials);
    await this.demora(200);
    this.state.powered = false;
  }

  async listInputs(): Promise<Input[]> {
    return [
      { id: 'hdmi1', name: 'HDMI 1' },
      { id: 'hdmi2', name: 'HDMI 2' },
      { id: 'hdmi3', name: 'HDMI 3' },
    ];
  }

  async setInput(_device: Device, inputId: string, credentials?: Credentials): Promise<void> {
    this.exigirEmparejado(credentials);
    await this.demora(300);
    this.state.currentInput = inputId;
  }

  async listApps(): Promise<App[]> {
    return [
      { id: 'netflix', name: 'Netflix' },
      { id: 'youtube', name: 'YouTube' },
      { id: 'disney', name: 'Disney+' },
    ];
  }

  async launchApp(_device: Device, appId: string, _deepLink?: string, credentials?: Credentials): Promise<void> {
    this.exigirEmparejado(credentials);
    await this.demora(500);
    this.state.currentApp = appId;
  }

  async getState(): Promise<DeviceState> {
    return { ...this.state };
  }

  private exigirEmparejado(credentials?: Credentials): void {
    if (!this.emparejado && credentials?.token === undefined) throw new NotPairedError();
  }

  private demora(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
