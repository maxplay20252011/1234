import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server, type TLSSocket } from 'node:tls';
import { CastClient } from './client.js';
import { decodeCastMessage, deframe, encodeCastMessage, frame } from './protobuf.js';
import {
  DEFAULT_MEDIA_RECEIVER,
  NS,
  RECEIVER_ID,
  getStatusPayload,
  loadPayload,
  messageType,
  parseMediaStatus,
  parseReceiverStatus,
  requestIdOf,
  setVolumePayload,
} from './protocol.js';

/**
 * Aparato Cast falso.
 *
 * Es la unica forma de validar el cliente completo sin hardware: TLS,
 * enmarcado, protobuf, el CONNECT obligatorio, el latido y la correlacion de
 * respuestas por requestId. Todo eso son funciones impuras que los tests de
 * unidad no tocan.
 *
 * El certificado se genera al vuelo con openssl, igual que el de un Chromecast
 * real: autofirmado y sin cadena a ninguna CA publica.
 */
function crearAparatoFalso(): {
  server: Server;
  puerto: Promise<number>;
  recibidos: string[];
  limpiar: () => void;
} {
  const dir = mkdtempSync(join(tmpdir(), 'cast-fake-'));
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', join(dir, 'key.pem'),
    '-out', join(dir, 'cert.pem'),
    '-days', '1', '-subj', '/CN=fake-chromecast',
  ], { stdio: 'ignore' });

  const recibidos: string[] = [];

  const server = createServer(
    { key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) },
    (socket: TLSSocket) => {
      let buffer = Buffer.alloc(0);

      const responder = (namespace: string, destino: string, payload: string): void => {
        socket.write(
          frame(
            encodeCastMessage({
              sourceId: destino === RECEIVER_ID ? RECEIVER_ID : destino,
              destinationId: 'sender-0',
              namespace,
              payloadUtf8: payload,
            }),
          ),
        );
      };

      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        const { messages, rest } = deframe(buffer);
        buffer = Buffer.from(rest);

        for (const crudo of messages) {
          const msg = decodeCastMessage(crudo);
          recibidos.push(`${msg.namespace}|${msg.payloadUtf8}`);
          const tipo = messageType(msg.payloadUtf8);
          const requestId = requestIdOf(msg.payloadUtf8);

          if (msg.namespace === NS.heartbeat && tipo === 'PING') {
            responder(NS.heartbeat, RECEIVER_ID, JSON.stringify({ type: 'PONG' }));
            continue;
          }

          if (msg.namespace === NS.receiver && tipo === 'GET_STATUS') {
            responder(
              NS.receiver,
              RECEIVER_ID,
              JSON.stringify({
                type: 'RECEIVER_STATUS',
                requestId,
                status: { volume: { level: 0.4, muted: false } },
              }),
            );
            continue;
          }

          if (msg.namespace === NS.receiver && tipo === 'LAUNCH') {
            responder(
              NS.receiver,
              RECEIVER_ID,
              JSON.stringify({
                type: 'RECEIVER_STATUS',
                requestId,
                status: {
                  applications: [
                    {
                      appId: DEFAULT_MEDIA_RECEIVER,
                      displayName: 'Default Media Receiver',
                      sessionId: 'sesion-de-prueba',
                      transportId: 'transporte-de-prueba',
                    },
                  ],
                  volume: { level: 0.4, muted: false },
                },
              }),
            );
            continue;
          }

          if (msg.namespace === NS.receiver && tipo === 'SET_VOLUME') {
            responder(
              NS.receiver,
              RECEIVER_ID,
              JSON.stringify({
                type: 'RECEIVER_STATUS',
                requestId,
                status: { volume: { level: 0.75, muted: false } },
              }),
            );
            continue;
          }

          if (msg.namespace === NS.media && tipo === 'LOAD') {
            responder(
              NS.media,
              'transporte-de-prueba',
              JSON.stringify({
                type: 'MEDIA_STATUS',
                requestId,
                status: [
                  {
                    mediaSessionId: 99,
                    playerState: 'PLAYING',
                    currentTime: 0,
                    media: { duration: 120, metadata: { title: 'Video de prueba' } },
                  },
                ],
              }),
            );
            continue;
          }
        }
      });

      socket.on('error', () => {
        // El cliente cierra de golpe al terminar el test.
      });
    },
  );

  const puerto = new Promise<number>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const dir = server.address();
      resolve(typeof dir === 'object' && dir !== null ? dir.port : 0);
    });
  });

  return { server, puerto, recibidos, limpiar: () => rmSync(dir, { recursive: true, force: true }) };
}

/**
 * Espera a que se cumpla una condicion.
 *
 * connect() resuelve apenas escribe el CONNECT, sin esperar a que el aparato lo
 * procese: comprobarlo enseguida es una carrera. Esto no es tolerar un fallo,
 * es reconocer que el envio y la recepcion son dos momentos distintos.
 */
async function esperarA(condicion: () => boolean, ms = 3000): Promise<void> {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    if (condicion()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('Se agoto la espera de la condicion');
}

describe('CastClient contra un aparato Cast falso', () => {
  let aparato: ReturnType<typeof crearAparatoFalso> | null = null;
  let client: CastClient | null = null;

  afterEach(() => {
    client?.disconnect();
    aparato?.server.close();
    aparato?.limpiar();
    aparato = null;
    client = null;
  });

  it('completa el flujo entero: conectar, consultar, lanzar y cargar', async () => {
    aparato = crearAparatoFalso();
    const puerto = await aparato.puerto;

    client = new CastClient('127.0.0.1', puerto);
    await client.connect();

    // 1. El CONNECT inicial es obligatorio: sin el, el aparato ignora todo lo demas.
    const recibidos = aparato.recibidos;
    await esperarA(() => recibidos.some((m) => m.startsWith(NS.connection)));
    expect(recibidos.some((m) => m.includes('"CONNECT"'))).toBe(true);

    // 2. Consulta de estado, correlacionada por requestId.
    const estado = parseReceiverStatus(
      await client.request(NS.receiver, RECEIVER_ID, (id) => getStatusPayload(id)),
    );
    expect(estado?.volume).toBe(40);

    // 3. Volumen: se manda en porcentaje y viaja como decimal.
    const trasVolumen = parseReceiverStatus(
      await client.request(NS.receiver, RECEIVER_ID, (id) => setVolumePayload(id, 75)),
    );
    expect(trasVolumen?.volume).toBe(75);
    const enviado = recibidos.find((m) => m.includes('SET_VOLUME'));
    expect(enviado).toContain('"level":0.75');

    // 4. Lanzar el receptor por defecto devuelve el transportId de la sesion.
    const lanzado = parseReceiverStatus(
      await client.request(NS.receiver, RECEIVER_ID, (id) =>
        JSON.stringify({ type: 'LAUNCH', requestId: id, appId: DEFAULT_MEDIA_RECEIVER }),
      ),
    );
    expect(lanzado?.transportId).toBe('transporte-de-prueba');

    // 5. Hay que mandarle CONNECT a la aplicacion antes de hablarle.
    client.enviarConnect('transporte-de-prueba');

    // 6. Cargar el video.
    const media = parseMediaStatus(
      await client.request(NS.media, 'transporte-de-prueba', (id) =>
        loadPayload(id, {
          url: 'http://192.168.1.10:8099/media/abc.mp4',
          contentType: 'video/mp4',
          title: 'Video de prueba',
        }),
      ),
    );
    expect(media?.mediaSessionId).toBe(99);
    expect(media?.playerState).toBe('PLAYING');
    expect(media?.title).toBe('Video de prueba');
  }, 30000);

  it('correlaciona las respuestas aunque lleguen fuera de orden', async () => {
    aparato = crearAparatoFalso();
    const puerto = await aparato.puerto;
    client = new CastClient('127.0.0.1', puerto);
    await client.connect();

    // Tres peticiones simultaneas: cada promesa tiene que resolver con SU
    // respuesta, no con la primera que llegue.
    const [a, b, c] = await Promise.all([
      client.request(NS.receiver, RECEIVER_ID, (id) => getStatusPayload(id)),
      client.request(NS.receiver, RECEIVER_ID, (id) => setVolumePayload(id, 75)),
      client.request(NS.receiver, RECEIVER_ID, (id) => getStatusPayload(id)),
    ]);

    expect(parseReceiverStatus(a)?.volume).toBe(40);
    expect(parseReceiverStatus(b)?.volume).toBe(75);
    expect(parseReceiverStatus(c)?.volume).toBe(40);
  }, 30000);

  it('avisa que el dispositivo no responde si no hay nadie escuchando', async () => {
    // Puerto cerrado a proposito: tiene que dar el mensaje para el usuario, no
    // un ECONNREFUSED crudo.
    client = new CastClient('127.0.0.1', 1);
    await expect(client.connect()).rejects.toMatchObject({ code: 'device_offline' });
  }, 20000);
});
