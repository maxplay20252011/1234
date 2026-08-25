import type {
  App,
  Capability,
  CastUrlRequest,
  Device,
  Input,
  MediaState,
  PairingStatus,
  RemoteKey,
} from '@tv-remote/shared';

/** Credenciales de emparejamiento. Se guardan cifradas, nunca en texto plano. */
export type Credentials = {
  /** Token de Samsung, client-key de LG, etc. Opaco para el resto del sistema. */
  token: string;
  extra?: Record<string, string>;
};

export type DeviceState = {
  powered?: boolean;
  volume?: number;
  muted?: boolean;
  currentApp?: string;
  currentInput?: string;
  media?: MediaState;
};

/**
 * Contrato de un adapter de marca.
 *
 * Los metodos obligatorios son los que TODA marca controlable puede cumplir.
 * El resto son opcionales y solo se implementan si el aparato realmente los
 * soporta: `capabilities` declara cuales, y el ControlService rechaza con un
 * mensaje claro los que no estan.
 *
 * Es a proposito. Roku no tiene volumen absoluto y Samsung solo tiene el mute
 * como interruptor, no como valor. Con una interfaz que obligue a implementar
 * setVolume(level), esos adapters tendrian que fingirlo mandando pasos a
 * ciegas: justo el adapter falso que este proyecto no quiere.
 */
export interface TvAdapter {
  readonly brand: string;

  /** Lo que este dispositivo concreto puede hacer, no lo que dice el manual. */
  capabilities(device: Device): Promise<Capability[]>;

  connect(device: Device, credentials?: Credentials): Promise<void>;
  disconnect(device: Device): Promise<void>;

  /** Estado del emparejamiento, para que la interfaz sepa que instrucciones dar. */
  pairingStatus(device: Device, credentials?: Credentials): Promise<PairingStatus>;

  /** Empareja. Devuelve las credenciales a persistir cifradas. */
  pair?(device: Device, pin?: string): Promise<Credentials>;

  sendKey(device: Device, key: RemoteKey, credentials?: Credentials): Promise<void>;
  volumeStep(device: Device, delta: number, credentials?: Credentials): Promise<void>;
  getState(device: Device, credentials?: Credentials): Promise<DeviceState>;

  // ─── Opcionales: solo si la marca los soporta de verdad ───────────────────

  powerOff?(device: Device, credentials?: Credentials): Promise<void>;
  powerOn?(device: Device, credentials?: Credentials): Promise<void>;
  /** Solo con capacidad 'volumeAbsolute'. */
  setVolume?(device: Device, level: number, credentials?: Credentials): Promise<void>;
  /** Solo con capacidad 'mute'. Sin esto, el mute es un interruptor por sendKey. */
  setMute?(device: Device, muted: boolean, credentials?: Credentials): Promise<void>;
  listInputs?(device: Device, credentials?: Credentials): Promise<Input[]>;
  setInput?(device: Device, inputId: string, credentials?: Credentials): Promise<void>;
  listApps?(device: Device, credentials?: Credentials): Promise<App[]>;
  launchApp?(device: Device, appId: string, deepLink?: string, credentials?: Credentials): Promise<void>;

  /** Solo con capacidad 'castUrl'. La URL tiene que ser un stream directo. */
  castUrl?(device: Device, media: CastUrlRequest, credentials?: Credentials): Promise<void>;
  /** Corta lo que se este reproduciendo y libera el aparato. */
  stopCast?(device: Device, credentials?: Credentials): Promise<void>;
}

export class AdapterRegistry {
  private readonly adapters = new Map<string, TvAdapter>();

  register(adapter: TvAdapter): void {
    this.adapters.set(adapter.brand, adapter);
  }

  /** undefined significa "esta marca todavia no tiene adapter", no un error. */
  get(brand: string): TvAdapter | undefined {
    return this.adapters.get(brand);
  }

  brands(): string[] {
    return [...this.adapters.keys()];
  }
}
