import { createSocket, type Socket } from 'node:dgram';
import { listLanInterfaces } from '../net/interfaces.js';
import { logger, protocolLog } from '../logger.js';

export const SSDP_MULTICAST_ADDRESS = '239.255.255.250';
export const SSDP_PORT = 1900;

/**
 * Targets de busqueda. El orden importa poco, pero la cobertura si:
 * - MediaRenderer  -> DLNA. Lo hablan Samsung, Sony, Philips y casi cualquier
 *                     smart TV, aunque despues no tenga adapter propio.
 * - roku:ecp       -> Roku, que no responde a los targets estandar de UPnP.
 * - dial-multiscreen -> DIAL. Lo responden Chromecast, Android TV y varios TVs.
 * - ssdp:all       -> barrido de respaldo, ruidoso pero encuentra rarezas.
 */
export const SSDP_SEARCH_TARGETS = [
  'urn:schemas-upnp-org:device:MediaRenderer:1',
  'urn:dial-multiscreen-org:service:dial:1',
  'roku:ecp',
  'upnp:rootdevice',
  'ssdp:all',
] as const;

export type SsdpResponse = {
  /** IP de quien contesto. Es la fuente de verdad, no lo que diga el LOCATION. */
  address: string;
  headers: Record<string, string>;
  /** URL del XML de descripcion del dispositivo UPnP, si la mando. */
  location?: string;
  st?: string;
  usn?: string;
  server?: string;
};

/**
 * Parsea una respuesta SSDP cruda.
 *
 * Acepta tanto respuestas a M-SEARCH (`HTTP/1.1 200 OK`) como anuncios
 * espontaneos (`NOTIFY * HTTP/1.1`), porque muchos televisores se anuncian solos
 * al encenderse y conviene aprovecharlo.
 *
 * Devuelve null si el paquete no es SSDP o si es un NOTIFY de despedida
 * (`ssdp:byebye`), que significa que el dispositivo se esta yendo de la red.
 */
export function parseSsdpMessage(raw: string, address: string): SsdpResponse | null {
  const lines = raw.split(/\r?\n/);
  const startLine = lines[0]?.trim() ?? '';

  const esRespuesta = /^HTTP\/1\.\d\s+200/i.test(startLine);
  const esNotify = /^NOTIFY\s+\*\s+HTTP\/1\.\d/i.test(startLine);
  if (!esRespuesta && !esNotify) return null;

  const headers: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const sep = line.indexOf(':');
    if (sep <= 0) continue;
    // Los nombres de header van en minuscula: el RFC dice que son
    // case-insensitive y los fabricantes usan cada uno su capitalizacion.
    headers[line.slice(0, sep).trim().toLowerCase()] = line.slice(sep + 1).trim();
  }

  if (headers['nts'] === 'ssdp:byebye') return null;

  const location = headers['location'];
  const st = headers['st'] ?? headers['nt'];
  const usn = headers['usn'];
  const server = headers['server'];

  return {
    address,
    headers,
    ...(location !== undefined ? { location } : {}),
    ...(st !== undefined ? { st } : {}),
    ...(usn !== undefined ? { usn } : {}),
    ...(server !== undefined ? { server } : {}),
  };
}

/**
 * Extrae el UDN (`uuid:...`) de un header USN.
 *
 * El USN viene como `uuid:9ab0c000-f24f-11de-9e96-0800200c9a66::urn:schemas-...`
 * y la parte del uuid es un identificador del dispositivo estable entre
 * reinicios y, sobre todo, independiente de la IP. Es la mejor fuente de id que
 * tenemos despues de la MAC.
 */
export function extractUdn(usn: string | undefined): string | undefined {
  if (!usn) return undefined;
  const m = /^(uuid:[^:]+(?:-[^:]+)*)/i.exec(usn.trim());
  return m?.[1]?.toLowerCase();
}

export function buildMSearch(target: string, mx: number): Buffer {
  // El CRLF final doble es obligatorio: sin la linea en blanco que cierra los
  // headers, muchos dispositivos descartan el paquete en silencio.
  const msg = [
    'M-SEARCH * HTTP/1.1',
    `HOST: ${SSDP_MULTICAST_ADDRESS}:${SSDP_PORT}`,
    'MAN: "ssdp:discover"',
    `MX: ${mx}`,
    `ST: ${target}`,
    '',
    '',
  ].join('\r\n');
  return Buffer.from(msg, 'utf8');
}

export type SsdpScanOptions = {
  timeoutMs: number;
  targets?: readonly string[];
};

/**
 * Manda M-SEARCH por CADA interfaz de red y junta las respuestas.
 *
 * Mandar por todas las interfaces no es paranoia: en una notebook con VPN,
 * WSL o Docker, el socket por defecto sale por la interfaz equivocada y el
 * escaneo devuelve cero resultados con la red funcionando perfecto.
 */
export async function scanSsdp(options: SsdpScanOptions): Promise<SsdpResponse[]> {
  const targets = options.targets ?? SSDP_SEARCH_TARGETS;
  const interfaces = listLanInterfaces();

  if (interfaces.length === 0) {
    logger.warn('No se encontro ninguna interfaz de red local. Estas conectado a la red?');
    return [];
  }

  const porInterfaz = await Promise.all(
    interfaces.map((iface) => scanOnInterface(iface.address, targets, options.timeoutMs)),
  );

  // Un mismo TV contesta por varias interfaces y a varios targets. Se deduplica
  // por (ip + st), quedandose con la respuesta que traiga LOCATION.
  const porClave = new Map<string, SsdpResponse>();
  for (const res of porInterfaz.flat()) {
    const clave = `${res.address}|${res.st ?? ''}`;
    const previa = porClave.get(clave);
    if (!previa || (!previa.location && res.location)) porClave.set(clave, res);
  }
  return [...porClave.values()];
}

function scanOnInterface(
  localAddress: string,
  targets: readonly string[],
  timeoutMs: number,
): Promise<SsdpResponse[]> {
  return new Promise((resolve) => {
    const found: SsdpResponse[] = [];
    let socket: Socket;

    try {
      socket = createSocket({ type: 'udp4', reuseAddr: true });
    } catch (err) {
      logger.debug({ err, localAddress }, 'No se pudo crear el socket SSDP');
      resolve(found);
      return;
    }

    const cerrar = (): void => {
      try {
        socket.close();
      } catch {
        // Ya cerrado: no importa.
      }
      resolve(found);
    };

    socket.on('error', (err) => {
      logger.debug({ err, localAddress }, 'Error en el socket SSDP');
      cerrar();
    });

    socket.on('message', (msg, rinfo) => {
      const raw = msg.toString('utf8');
      protocolLog('ssdp', 'rx', rinfo.address, raw);
      const parsed = parseSsdpMessage(raw, rinfo.address);
      if (parsed) found.push(parsed);
    });

    socket.bind({ address: localAddress, port: 0 }, () => {
      try {
        socket.setBroadcast(true);
        socket.setMulticastTTL(4);
        socket.setMulticastInterface(localAddress);
      } catch (err) {
        logger.debug({ err, localAddress }, 'No se pudo configurar multicast en la interfaz');
      }

      // MX le dice al dispositivo cuanto puede demorar la respuesta, para que no
      // contesten todos a la vez. Se deja margen respecto de nuestro timeout.
      const mx = Math.max(1, Math.floor(timeoutMs / 1000) - 1);
      for (const target of targets) {
        const packet = buildMSearch(target, mx);
        protocolLog('ssdp', 'tx', `${SSDP_MULTICAST_ADDRESS} via ${localAddress}`, target);
        socket.send(packet, SSDP_PORT, SSDP_MULTICAST_ADDRESS, (err) => {
          if (err) logger.debug({ err, target, localAddress }, 'Fallo el envio del M-SEARCH');
        });
      }

      setTimeout(cerrar, timeoutMs);
    });
  });
}
