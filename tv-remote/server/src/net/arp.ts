import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { logger } from '../logger.js';

const exec = promisify(execFile);

export type ArpTable = Map<string, string>;

/**
 * Lee la tabla ARP del sistema para sacar la MAC de una IP.
 *
 * Node no tiene acceso a ARP, asi que hay que leer lo que expone cada SO. Es
 * "best effort" por dos motivos que conviene tener presentes:
 *
 *  1. Solo aparecen hosts con los que la maquina ya hablo. Por eso el
 *     DiscoveryService sondea puertos ANTES de leer ARP: el sondeo fuerza la
 *     resolucion y llena la tabla.
 *  2. Solo funciona en el mismo segmento de red (misma L2). Si el televisor
 *     esta detras de un router o en otra VLAN, no hay MAC y por lo tanto
 *     tampoco hay Wake-on-LAN.
 */
export async function readArpTable(): Promise<ArpTable> {
  try {
    switch (process.platform) {
      case 'linux':
        return parseLinuxArp(await readFile('/proc/net/arp', 'utf8'));
      case 'darwin':
        return parseBsdArp((await exec('arp', ['-an'])).stdout);
      case 'win32':
        return parseWindowsArp((await exec('arp', ['-a'])).stdout);
      default:
        return new Map();
    }
  } catch (err) {
    // Nunca romper el descubrimiento por esto: sin MAC igual se puede controlar
    // el televisor, lo unico que se pierde es el encendido por Wake-on-LAN.
    logger.debug({ err }, 'No se pudo leer la tabla ARP');
    return new Map();
  }
}

export function parseLinuxArp(content: string): ArpTable {
  const table: ArpTable = new Map();
  for (const line of content.split('\n').slice(1)) {
    const cols = line.trim().split(/\s+/);
    const ip = cols[0];
    const mac = cols[3];
    if (ip && mac && isUsableMac(mac)) table.set(ip, normalizeMac(mac));
  }
  return table;
}

/** macOS y BSD: `? (192.168.1.1) at aa:bb:cc:dd:ee:ff on en0 ifscope [ethernet]` */
export function parseBsdArp(content: string): ArpTable {
  const table: ArpTable = new Map();
  const re = /\((\d+\.\d+\.\d+\.\d+)\)\s+at\s+([0-9a-fA-F:]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const [, ip, mac] = m;
    if (ip && mac && isUsableMac(mac)) table.set(ip, normalizeMac(mac));
  }
  return table;
}

/** Windows usa guiones en vez de dos puntos: `192.168.1.1  aa-bb-cc-dd-ee-ff  dynamic` */
export function parseWindowsArp(content: string): ArpTable {
  const table: ArpTable = new Map();
  const re = /(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F]{2}(?:-[0-9a-fA-F]{2}){5})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const [, ip, mac] = m;
    if (ip && mac && isUsableMac(mac)) table.set(ip, normalizeMac(mac));
  }
  return table;
}

/**
 * Normaliza a `aa:bb:cc:dd:ee:ff`. Hace falta porque macOS imprime los octetos
 * sin cero a la izquierda (`0:1a:2b:3:4:5`) y Windows usa guiones: sin esto,
 * la misma placa de red generaria tres ids distintos segun el sistema.
 */
export function normalizeMac(mac: string): string {
  return mac
    .split(/[:-]/)
    .map((o) => o.toLowerCase().padStart(2, '0'))
    .join(':');
}

function isUsableMac(mac: string): boolean {
  const n = normalizeMac(mac);
  if (!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(n)) return false;
  // Descartar broadcast y direcciones nulas: no identifican a nadie.
  return n !== 'ff:ff:ff:ff:ff:ff' && n !== '00:00:00:00:00:00';
}
