import { connect, type TLSSocket } from 'node:tls';
import { EventEmitter } from 'node:events';
import { decodeCastMessage, deframe, encodeCastMessage, frame } from './protobuf.js';
import {
  CAST_PORT,
  HEARTBEAT_INTERVAL_MS,
  NS,
  RECEIVER_ID,
  SENDER_ID,
  closePayload,
  connectPayload,
  messageType,
  pingPayload,
  pongPayload,
  requestIdOf,
} from './protocol.js';
import { logger, protocolLog } from '../../logger.js';
import { DeviceOfflineError, ControlError } from '../errors.js';

const CONNECT_TIMEOUT_MS = 8000;
const REQUEST_TIMEOUT_MS = 8000;

type Eventos = {
  /** namespace, payload */
  message: [string, string];
  close: [];
};

/**
 * Conexion castv2 con un aparato Cast.
 *
 * El transporte es TLS crudo en el puerto 8009, con mensajes protobuf
 * precedidos por su longitud. Se implementa directo sobre node:tls porque
 * castv2-client hace anios que no se mantiene.
 *
 * Dos cosas que el protocolo exige y son faciles de pasar por alto:
 *  - Hay que mandar CONNECT antes de cualquier otra cosa, y de nuevo por cada
 *    destino nuevo (la aplicacion cargada tiene su propio transportId).
 *  - Hay que mandar PING cada pocos segundos o el aparato corta la conexion
 *    sin avisar.
 */
export class CastClient extends EventEmitter<Eventos> {
  private socket: TLSSocket | undefined;
  private buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  private siguienteRequestId = 1;
  private heartbeat: NodeJS.Timeout | undefined;
  private readonly pendientes = new Map<
    number,
    { resolve: (payload: string) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }
  >();
  /** Destinos a los que ya se les mando CONNECT. */
  private readonly conectados = new Set<string>();

  /** El puerto es configurable solo para poder probar contra un aparato falso. */
  constructor(
    private readonly ip: string,
    private readonly port: number = CAST_PORT,
  ) {
    super();
  }

  get connected(): boolean {
    return this.socket !== undefined && !this.socket.destroyed;
  }

  connect(): Promise<void> {
    if (this.connected) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      const socket = connect(
        {
          host: this.ip,
          port: this.port,
          // El aparato usa un certificado propio de Google que no encadena a
          // ninguna CA publica. La excepcion vale SOLO para esta conexion.
          rejectUnauthorized: false,
          timeout: CONNECT_TIMEOUT_MS,
        },
        () => {
          this.socket = socket;
          this.buffer = Buffer.alloc(0);
          this.conectados.clear();
          this.enviarConnect(RECEIVER_ID);
          this.iniciarHeartbeat();
          logger.debug({ ip: this.ip }, 'Conectado por castv2');
          resolve();
        },
      );

      socket.on('data', (chunk) => this.alRecibirDatos(chunk));

      socket.on('error', (err) => {
        logger.debug({ err, ip: this.ip }, 'Error en la conexion castv2');
        this.limpiar();
        reject(new DeviceOfflineError(this.ip));
      });

      socket.once('timeout', () => {
        socket.destroy();
        this.limpiar();
        reject(new DeviceOfflineError(this.ip));
      });

      socket.on('close', () => {
        this.limpiar();
        this.emit('close');
      });
    });
  }

  disconnect(): void {
    if (this.socket && !this.socket.destroyed) {
      try {
        this.enviar(NS.connection, RECEIVER_ID, closePayload());
      } catch {
        // Si ya se cayo, no importa.
      }
      this.socket.destroy();
    }
    this.limpiar();
  }

  /** Manda un mensaje sin esperar respuesta. */
  enviar(namespace: string, destination: string, payload: string): void {
    if (!this.socket || this.socket.destroyed) throw new DeviceOfflineError(this.ip);
    protocolLog('castv2', 'tx', `${this.ip}/${destination}`, payload);
    const mensaje = encodeCastMessage({
      sourceId: SENDER_ID,
      destinationId: destination,
      namespace,
      payloadUtf8: payload,
    });
    this.socket.write(frame(mensaje));
  }

  /**
   * Manda un mensaje y espera la respuesta que traiga el mismo requestId.
   * El aparato responde fuera de orden y mezcla difusiones espontaneas, asi que
   * correlacionar por requestId es la unica forma de saber que contesto que.
   */
  request(
    namespace: string,
    destination: string,
    construir: (requestId: number) => string,
  ): Promise<string> {
    const requestId = this.siguienteRequestId++;

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendientes.delete(requestId);
        reject(
          new ControlError(
            `El aparato no respondio a la peticion ${requestId}`,
            'El dispositivo no respondio. Esta encendido y conectado a la red?',
            'cast_timeout',
            504,
          ),
        );
      }, REQUEST_TIMEOUT_MS);
      timer.unref?.();

      this.pendientes.set(requestId, { resolve, reject, timer });

      try {
        this.enviar(namespace, destination, construir(requestId));
      } catch (err) {
        clearTimeout(timer);
        this.pendientes.delete(requestId);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /** CONNECT a un destino nuevo. Hace falta antes de hablarle a una aplicacion. */
  enviarConnect(destination: string): void {
    if (this.conectados.has(destination)) return;
    this.enviar(NS.connection, destination, connectPayload());
    this.conectados.add(destination);
  }

  private alRecibirDatos(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const { messages, rest } = deframe(this.buffer);
    this.buffer = rest;

    for (const crudo of messages) {
      let mensaje;
      try {
        mensaje = decodeCastMessage(crudo);
      } catch (err) {
        logger.debug({ err, ip: this.ip }, 'Mensaje castv2 ilegible');
        continue;
      }

      protocolLog('castv2', 'rx', `${this.ip}/${mensaje.namespace}`, mensaje.payloadUtf8);

      // El aparato tambien pinguea: si no le contestamos, corta.
      if (mensaje.namespace === NS.heartbeat && messageType(mensaje.payloadUtf8) === 'PING') {
        this.enviar(NS.heartbeat, RECEIVER_ID, pongPayload());
        continue;
      }

      const requestId = requestIdOf(mensaje.payloadUtf8);
      if (requestId !== undefined) {
        const pendiente = this.pendientes.get(requestId);
        if (pendiente) {
          clearTimeout(pendiente.timer);
          this.pendientes.delete(requestId);
          pendiente.resolve(mensaje.payloadUtf8);
          continue;
        }
      }

      // Difusiones espontaneas: cambios de volumen desde el control del TV,
      // avances de la reproduccion, etc.
      this.emit('message', mensaje.namespace, mensaje.payloadUtf8);
    }
  }

  private iniciarHeartbeat(): void {
    this.heartbeat = setInterval(() => {
      try {
        this.enviar(NS.heartbeat, RECEIVER_ID, pingPayload());
      } catch {
        this.limpiar();
      }
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeat.unref?.();
  }

  private limpiar(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = undefined;
    this.socket = undefined;
    this.conectados.clear();

    for (const [, pendiente] of this.pendientes) {
      clearTimeout(pendiente.timer);
      pendiente.reject(new DeviceOfflineError(this.ip));
    }
    this.pendientes.clear();
  }
}
