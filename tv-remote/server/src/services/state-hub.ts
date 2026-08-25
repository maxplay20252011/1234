import { EventEmitter } from 'node:events';
import type { Device, PairingStatus, ServerMessage } from '@tv-remote/shared';
import type { DeviceState } from '../adapters/types.js';

type Eventos = { message: [ServerMessage] };

/**
 * Estado en vivo de los dispositivos y su difusion a las interfaces conectadas.
 *
 * Guarda el ultimo estado conocido de cada televisor para que una pantalla que
 * se abre ahora reciba algo util al instante, sin esperar al proximo sondeo.
 */
export class StateHub extends EventEmitter<Eventos> {
  private readonly estados = new Map<string, DeviceState & { updatedAt: string }>();

  get(deviceId: string): (DeviceState & { updatedAt: string }) | undefined {
    return this.estados.get(deviceId);
  }

  snapshot(): ServerMessage[] {
    return [...this.estados.entries()].map(([deviceId, estado]) => ({
      type: 'state' as const,
      deviceId,
      ...estado,
    }));
  }

  /** Solo emite si algo cambio de verdad: evita despertar la interfaz al pedo. */
  update(deviceId: string, parcial: DeviceState): void {
    const previo = this.estados.get(deviceId);
    const nuevo = { ...previo, ...parcial, updatedAt: new Date().toISOString() };

    if (previo && sinCambios(previo, nuevo)) return;

    this.estados.set(deviceId, nuevo);
    this.emit('message', { type: 'state', deviceId, ...nuevo });
  }

  devices(devices: Device[]): void {
    this.emit('message', { type: 'devices', devices });
  }

  scanning(scanning: boolean): void {
    this.emit('message', { type: 'scanning', scanning });
  }

  pairing(status: PairingStatus): void {
    this.emit('message', { type: 'pairing', status });
  }

  forget(deviceId: string): void {
    this.estados.delete(deviceId);
  }
}

function sinCambios(a: DeviceState, b: DeviceState): boolean {
  return (
    a.powered === b.powered &&
    a.volume === b.volume &&
    a.muted === b.muted &&
    a.currentApp === b.currentApp &&
    a.currentInput === b.currentInput
  );
}
