import { createSocket } from 'node:dgram';
import { listLanInterfaces } from '../net/interfaces.js';
import { logger } from '../logger.js';

/** Puertos habituales del magic packet. Se usan los dos: los TVs no coinciden. */
export const WOL_PORTS = [9, 7] as const;

/**
 * Arma el magic packet de Wake-on-LAN.
 *
 * Son 6 bytes 0xFF seguidos de la MAC repetida 16 veces: 102 bytes exactos.
 * El formato no lleva checksum ni cabecera, por eso se manda por UDP a un
 * broadcast: la placa de red lo reconoce por el patron.
 */
export function buildMagicPacket(mac: string): Buffer {
  const bytes = mac.split(/[:-]/).map((o) => Number.parseInt(o, 16));
  if (bytes.length !== 6 || bytes.some((b) => Number.isNaN(b) || b < 0 || b > 255)) {
    throw new Error(`MAC invalida: "${mac}"`);
  }
  const packet = Buffer.alloc(102, 0xff);
  const macBuf = Buffer.from(bytes);
  for (let i = 0; i < 16; i++) macBuf.copy(packet, 6 + i * 6);
  return packet;
}

/** Todas las direcciones a las que conviene disparar el paquete. */
export function wakeTargets(): string[] {
  // El broadcast global no siempre atraviesa el router; el de la subred a veces
  // llega donde el global no. Se mandan los dos porque no hay forma de saber
  // de antemano cual va a funcionar con un televisor determinado.
  const destinos = new Set<string>(['255.255.255.255']);
  for (const iface of listLanInterfaces()) destinos.add(iface.broadcast);
  return [...destinos];
}

export type WakeOptions = {
  /** Cuantas veces repetir. Algunos televisores ignoran el primer paquete. */
  repeats?: number;
  intervalMs?: number;
};

/**
 * Manda el magic packet a todos los destinos y puertos, repetido.
 *
 * Devuelve sin error aunque el televisor no despierte: no hay confirmacion
 * posible, el protocolo es de una sola via. Si no enciende, casi siempre es que
 * falta habilitar la opcion en el televisor ("Encender movil", "Wake on LAN" o
 * "Conexion de red en espera"), o que ese modelo solo despierta por cable.
 */
export async function wake(mac: string, options: WakeOptions = {}): Promise<void> {
  const { repeats = 3, intervalMs = 150 } = options;
  const packet = buildMagicPacket(mac);
  const destinos = wakeTargets();
  const socket = createSocket({ type: 'udp4', reuseAddr: true });

  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('error', reject);
      socket.bind(() => {
        try {
          socket.setBroadcast(true);
          resolve();
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    });

    for (let intento = 0; intento < repeats; intento++) {
      for (const destino of destinos) {
        for (const port of WOL_PORTS) {
          await new Promise<void>((resolve) => {
            socket.send(packet, port, destino, (err) => {
              if (err) logger.debug({ err, destino, port }, 'Fallo el envio del magic packet');
              resolve();
            });
          });
        }
      }
      if (intento < repeats - 1) {
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    }

    logger.info({ mac, destinos, puertos: WOL_PORTS }, 'Magic packet enviado');
  } finally {
    socket.close();
  }
}
