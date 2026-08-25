import { connect, type TLSSocket, type PeerCertificate } from 'node:tls';
import { EventEmitter } from 'node:events';
import { deframeVarint, frameVarint } from '../../protobuf/index.js';
import { logger, protocolLog } from '../../logger.js';
import { DeviceOfflineError } from '../errors.js';

type Eventos = { message: [Buffer]; close: [] };

/**
 * Conexion TLS con certificado de cliente para androidtvremote2.
 *
 * Dos diferencias con castv2 que conviene no mezclar:
 *  - El enmarcado usa la longitud como varint, no como cuatro bytes.
 *  - Hace falta presentar un certificado de cliente; el televisor lo guarda
 *    durante el emparejamiento y despues solo acepta ese.
 */
export class AndroidTvClient extends EventEmitter<Eventos> {
  private socket: TLSSocket | undefined;
  private buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);

  constructor(
    private readonly ip: string,
    private readonly port: number,
    private readonly cert: { certificatePem: string; privateKeyPem: string },
  ) {
    super();
  }

  get connected(): boolean {
    return this.socket !== undefined && !this.socket.destroyed;
  }

  /** Certificado que presento el televisor. Hace falta para el emparejamiento. */
  peerCertificate(): PeerCertificate | undefined {
    if (!this.socket) return undefined;
    const cert = this.socket.getPeerCertificate();
    return cert && Object.keys(cert).length > 0 ? cert : undefined;
  }

  connect(timeoutMs = 10_000): Promise<void> {
    if (this.connected) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      const socket = connect(
        {
          host: this.ip,
          port: this.port,
          cert: this.cert.certificatePem,
          key: this.cert.privateKeyPem,
          // El televisor usa un certificado propio sin cadena publica. La
          // excepcion vale SOLO para esta conexion.
          rejectUnauthorized: false,
          timeout: timeoutMs,
        },
        () => {
          this.socket = socket;
          this.buffer = Buffer.alloc(0);
          logger.debug({ ip: this.ip, port: this.port }, 'Conectado a Android TV');
          resolve();
        },
      );

      socket.on('data', (chunk) => {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        const { messages, rest } = deframeVarint(this.buffer);
        this.buffer = rest;
        for (const mensaje of messages) {
          protocolLog('androidtv', 'rx', `${this.ip}:${this.port}`, mensaje.toString('hex'));
          this.emit('message', mensaje);
        }
      });

      socket.on('error', (err) => {
        logger.debug({ err, ip: this.ip, port: this.port }, 'Error en la conexion Android TV');
        this.socket = undefined;
        reject(new DeviceOfflineError(this.ip));
      });

      socket.once('timeout', () => {
        socket.destroy();
        this.socket = undefined;
        reject(new DeviceOfflineError(this.ip));
      });

      socket.on('close', () => {
        this.socket = undefined;
        this.emit('close');
      });
    });
  }

  send(payload: Buffer): void {
    if (!this.socket || this.socket.destroyed) throw new DeviceOfflineError(this.ip);
    protocolLog('androidtv', 'tx', `${this.ip}:${this.port}`, payload.toString('hex'));
    this.socket.write(frameVarint(payload));
  }

  /** Espera el proximo mensaje que cumpla la condicion. */
  waitFor(predicado: (buf: Buffer) => boolean, timeoutMs = 15_000): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off('message', alRecibir);
        reject(new Error('Se agoto el tiempo esperando la respuesta del televisor'));
      }, timeoutMs);
      timer.unref?.();

      const alRecibir = (buf: Buffer): void => {
        if (!predicado(buf)) return;
        clearTimeout(timer);
        this.off('message', alRecibir);
        resolve(buf);
      };

      this.on('message', alRecibir);
    });
  }

  disconnect(): void {
    this.socket?.destroy();
    this.socket = undefined;
  }
}

/** Modulo y exponente de la clave publica que presento el televisor. */
export function peerKeyParts(cert: PeerCertificate): { modulus: Buffer; exponent: Buffer } {
  if (!cert.modulus || !cert.exponent) {
    throw new Error('El televisor no presento una clave RSA utilizable');
  }
  // Node entrega el modulo como hexadecimal y el exponente como '0x10001'.
  const exponenteHex = cert.exponent.replace(/^0x/i, '');
  return {
    modulus: Buffer.from(cert.modulus, 'hex'),
    exponent: Buffer.from(exponenteHex.length % 2 ? `0${exponenteHex}` : exponenteHex, 'hex'),
  };
}
