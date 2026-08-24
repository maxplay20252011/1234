import { Socket } from 'node:net';
import { XMLParser } from 'fast-xml-parser';
import { logger, protocolLog } from '../logger.js';

const xml = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true });

/**
 * Puertos que delatan una marca. Un puerto abierto NO alcanza para afirmar la
 * marca (cualquiera puede tener el 3000 ocupado); solo marca al host como
 * candidato para una consulta especifica.
 */
export const BRAND_PORTS = {
  samsung: [8001, 8002],
  lg: [3000, 3001],
  roku: [8060],
  vizio: [7345, 9000],
  chromecast: [8009],
} as const;

export type SamsungInfo = {
  name?: string;
  modelName?: string;
  /** Codigo interno tipo "20_KANTM_UHD". Los dos primeros digitos son el ANIO. */
  model?: string;
  /** Anio del modelo, derivado de `model`. Decide el protocolo: ver CLAUDE.md. */
  modelYear?: number;
  wifiMac?: string;
  udn?: string;
  /** true => hace falta el token por wss en 8002. false => 2016 y anteriores, ws en 8001. */
  tokenAuthSupport?: boolean;
  networkType?: string;
};

export type RokuInfo = {
  friendlyName?: string;
  modelName?: string;
  serialNumber?: string;
  wifiMac?: string;
  ethernetMac?: string;
  /** Los sticks y boxes NO controlan volumen; los Roku TV si. */
  isTv?: boolean;
  powerMode?: string;
};

export type ProbeResult = {
  ip: string;
  openPorts: number[];
  samsung?: SamsungInfo;
  roku?: RokuInfo;
};

/** Abre y cierra un TCP para ver si el puerto responde. No manda nada. */
export function tcpPing(ip: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    let resuelto = false;
    const terminar = (abierto: boolean): void => {
      if (resuelto) return;
      resuelto = true;
      socket.destroy();
      resolve(abierto);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => terminar(true));
    socket.once('timeout', () => terminar(false));
    socket.once('error', () => terminar(false));
    socket.connect(port, ip);
  });
}

/**
 * Consulta el endpoint de informacion del televisor Samsung.
 *
 * Responde sin autenticacion en el 8001 (y en https por el 8002, con
 * certificado autofirmado). Es la mejor fuente de MAC y modelo que existe para
 * esta marca, y ademas dice si el modelo necesita token.
 */
export async function probeSamsung(ip: string, timeoutMs: number): Promise<SamsungInfo | undefined> {
  try {
    const res = await fetch(`http://${ip}:8001/api/v2/`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return undefined;
    const body: unknown = await res.json();
    protocolLog('samsung', 'rx', ip, body);
    return parseSamsungInfo(body);
  } catch (err) {
    logger.debug({ err, ip }, 'El sondeo Samsung no respondio');
    return undefined;
  }
}

export function parseSamsungInfo(body: unknown): SamsungInfo | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const root = body as Record<string, unknown>;
  const device = root['device'];
  if (typeof device !== 'object' || device === null) return undefined;
  const d = device as Record<string, unknown>;

  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined;

  const out: SamsungInfo = {};
  const name = str(d['name']) ?? str(root['name']);
  const modelName = str(d['modelName']);
  const model = str(d['model']);
  const wifiMac = str(d['wifiMac']);
  const udn = str(d['udn']) ?? str(d['duid']);
  const networkType = str(d['networkType']);

  if (name) out.name = name;
  if (modelName) out.modelName = modelName;
  if (model) {
    out.model = model;
    const year = samsungModelYear(model);
    if (year !== undefined) out.modelYear = year;
  }
  if (wifiMac) out.wifiMac = wifiMac.toLowerCase();
  if (udn) out.udn = udn.toLowerCase();
  if (networkType) out.networkType = networkType;

  const token = d['TokenAuthSupport'];
  if (token !== undefined) out.tokenAuthSupport = token === 'true' || token === true;

  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Samsung codifica el anio del modelo en los dos primeros digitos del campo
 * `model`: "20_KANTM_UHD" es 2020, "16_..." es 2016.
 *
 * Importa mucho porque el protocolo cambia con el anio:
 *   <= 2015  sin API de control por red
 *      2016  ws:// sin cifrar por el 8001, sin token
 *   >= 2017  wss:// por el 8002 con token y pop-up de autorizacion en pantalla
 */
export function samsungModelYear(model: string): number | undefined {
  const m = /^(\d{2})[_-]/.exec(model.trim());
  if (!m?.[1]) return undefined;
  const dosDigitos = Number(m[1]);
  if (Number.isNaN(dosDigitos) || dosDigitos < 10 || dosDigitos > 40) return undefined;
  return 2000 + dosDigitos;
}

export async function probeRoku(ip: string, timeoutMs: number): Promise<RokuInfo | undefined> {
  try {
    const res = await fetch(`http://${ip}:8060/query/device-info`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return undefined;
    const body = await res.text();
    protocolLog('roku', 'rx', ip, body.slice(0, 2000));
    return parseRokuInfo(body);
  } catch (err) {
    logger.debug({ err, ip }, 'El sondeo Roku no respondio');
    return undefined;
  }
}

export function parseRokuInfo(body: string): RokuInfo | undefined {
  let doc: unknown;
  try {
    doc = xml.parse(body);
  } catch {
    return undefined;
  }
  const info = (doc as Record<string, unknown>)?.['device-info'];
  if (typeof info !== 'object' || info === null) return undefined;
  const d = info as Record<string, unknown>;

  const str = (v: unknown): string | undefined => {
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
    return undefined;
  };

  const out: RokuInfo = {};
  const friendlyName = str(d['friendly-device-name']) ?? str(d['user-device-name']);
  const modelName = str(d['model-name']);
  const serialNumber = str(d['serial-number']);
  const wifiMac = str(d['wifi-mac']);
  const ethernetMac = str(d['ethernet-mac']);
  const powerMode = str(d['power-mode']);

  if (friendlyName) out.friendlyName = friendlyName;
  if (modelName) out.modelName = modelName;
  if (serialNumber) out.serialNumber = serialNumber;
  if (wifiMac) out.wifiMac = wifiMac.toLowerCase();
  if (ethernetMac) out.ethernetMac = ethernetMac.toLowerCase();
  if (powerMode) out.powerMode = powerMode;
  if (d['is-tv'] !== undefined) out.isTv = String(d['is-tv']) === 'true';

  return Object.keys(out).length > 0 ? out : undefined;
}

/** Sondea un host: primero los puertos, y solo consulta lo que dio abierto. */
export async function probeHost(ip: string, timeoutMs: number): Promise<ProbeResult> {
  // El tipo se anota a mano: Object.values().flat() infiere una union de
  // literales (8001 | 8002 | ...) y no un number[], que es lo que queremos.
  const puertos: number[] = [...new Set(Object.values(BRAND_PORTS).flat())];
  const abiertos = await Promise.all(
    puertos.map(
      async (p): Promise<number | null> => ((await tcpPing(ip, p, timeoutMs)) ? p : null),
    ),
  );
  const openPorts = abiertos.filter((p): p is number => p !== null).sort((a, b) => a - b);

  const result: ProbeResult = { ip, openPorts };

  const [samsung, roku] = await Promise.all([
    openPorts.some((p) => (BRAND_PORTS.samsung as readonly number[]).includes(p))
      ? probeSamsung(ip, timeoutMs)
      : Promise.resolve(undefined),
    openPorts.includes(8060) ? probeRoku(ip, timeoutMs) : Promise.resolve(undefined),
  ]);

  if (samsung) result.samsung = samsung;
  if (roku) result.roku = roku;
  return result;
}

/** Sondea varios hosts con concurrencia acotada, para no saturar la red. */
export async function probeHosts(
  ips: readonly string[],
  timeoutMs: number,
  concurrency = 16,
): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];
  const pendientes = [...ips];
  const workers = Array.from({ length: Math.min(concurrency, pendientes.length) }, async () => {
    for (;;) {
      const ip = pendientes.shift();
      if (ip === undefined) return;
      results.push(await probeHost(ip, timeoutMs));
    }
  });
  await Promise.all(workers);
  return results;
}
