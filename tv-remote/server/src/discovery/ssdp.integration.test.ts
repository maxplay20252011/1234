import { describe, it, expect, afterEach } from 'vitest';
import { createSocket, type Socket } from 'node:dgram';
import { scanSsdp, SSDP_MULTICAST_ADDRESS, SSDP_PORT } from './ssdp.js';
import { listLanInterfaces } from '../net/interfaces.js';

/**
 * Test de integracion del camino multicast.
 *
 * Es el unico pedazo del descubrimiento que no se puede validar con funciones
 * puras: hay que abrir sockets, unirse al grupo multicast y recibir una
 * respuesta real. Como no tenemos televisores en CI, levantamos uno falso que
 * contesta como un Samsung.
 *
 * Si el entorno no permite multicast (algunos contenedores, CI sin red), el
 * test se saltea en vez de fallar: seria un falso negativo.
 */
function levantarTvFalso(): Promise<Socket | null> {
  return new Promise((resolve) => {
    const s = createSocket({ type: 'udp4', reuseAddr: true });

    s.on('error', () => resolve(null));

    s.on('message', (msg, rinfo) => {
      if (!msg.toString('utf8').startsWith('M-SEARCH')) return;
      const respuesta = [
        'HTTP/1.1 200 OK',
        'CACHE-CONTROL: max-age=1800',
        'EXT:',
        'LOCATION: http://127.0.0.1:9197/dmr',
        'SERVER: SHP, UPnP/1.0, Samsung UPnP SDK/1.0',
        'ST: urn:schemas-upnp-org:device:MediaRenderer:1',
        'USN: uuid:0d1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8::urn:schemas-upnp-org:device:MediaRenderer:1',
        '',
        '',
      ].join('\r\n');
      s.send(Buffer.from(respuesta, 'utf8'), rinfo.port, rinfo.address);
    });

    s.bind(SSDP_PORT, () => {
      try {
        s.addMembership(SSDP_MULTICAST_ADDRESS);
        resolve(s);
      } catch {
        s.close();
        resolve(null);
      }
    });
  });
}

describe('scanSsdp contra un televisor falso', () => {
  let tv: Socket | null = null;

  afterEach(() => {
    tv?.close();
    tv = null;
  });

  it('encuentra el dispositivo y deduplica las respuestas a varios search targets', async () => {
    if (listLanInterfaces().length === 0) return; // Sin red utilizable.
    tv = await levantarTvFalso();
    if (!tv) return; // El entorno no permite multicast.

    const respuestas = await scanSsdp({ timeoutMs: 2500 });

    const nuestra = respuestas.filter((r) =>
      r.usn?.includes('0d1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8'),
    );
    expect(nuestra.length).toBeGreaterThan(0);
    expect(nuestra[0]?.location).toBe('http://127.0.0.1:9197/dmr');
    expect(nuestra[0]?.server).toContain('Samsung');

    // El TV falso contesta a varios targets; la deduplicacion por (ip + st) deja
    // una sola entrada por combinacion, no una por M-SEARCH enviado.
    const claves = new Set(nuestra.map((r) => `${r.address}|${r.st}`));
    expect(claves.size).toBe(nuestra.length);
  }, 15000);
});
