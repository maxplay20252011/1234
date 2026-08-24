import { XMLParser } from 'fast-xml-parser';
import { logger, protocolLog } from '../logger.js';

export type UpnpDescription = {
  friendlyName?: string;
  manufacturer?: string;
  modelName?: string;
  modelNumber?: string;
  udn?: string;
  deviceType?: string;
  /** MAC, cuando el fabricante la incluye (Samsung lo hace en algunos modelos). */
  macAddress?: string;
};

const parser = new XMLParser({
  ignoreAttributes: true,
  // Los fabricantes usan prefijos distintos (sec:, dlna:, pnpx:). Sacarlos deja
  // los nombres de tag comparables entre marcas.
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

/**
 * Baja y parsea el XML de descripcion que anuncia el header LOCATION de SSDP.
 *
 * Es la unica fuente confiable del UDN y del nombre real del dispositivo: los
 * headers de SSDP traen poco y mienten seguido (el campo SERVER suele decir el
 * sistema operativo, no el modelo).
 */
export async function fetchUpnpDescription(
  location: string,
  timeoutMs: number,
): Promise<UpnpDescription | undefined> {
  const control = AbortSignal.timeout(timeoutMs);
  try {
    const res = await fetch(location, { signal: control });
    if (!res.ok) return undefined;
    const xml = await res.text();
    protocolLog('upnp', 'rx', location, xml.slice(0, 2000));
    return parseUpnpDescription(xml);
  } catch (err) {
    logger.debug({ err, location }, 'No se pudo leer la descripcion UPnP');
    return undefined;
  }
}

export function parseUpnpDescription(xml: string): UpnpDescription | undefined {
  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch {
    return undefined;
  }

  const device = findDeviceNode(doc);
  if (!device) return undefined;

  const str = (v: unknown): string | undefined => {
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
    return undefined;
  };

  const out: UpnpDescription = {};
  const friendlyName = str(device['friendlyName']);
  const manufacturer = str(device['manufacturer']);
  const modelName = str(device['modelName']);
  const modelNumber = str(device['modelNumber']);
  const udn = str(device['UDN']) ?? str(device['udn']);
  const deviceType = str(device['deviceType']);
  const macAddress = str(device['MacAddress']) ?? str(device['macAddress']);

  if (friendlyName) out.friendlyName = friendlyName;
  if (manufacturer) out.manufacturer = manufacturer;
  if (modelName) out.modelName = modelName;
  if (modelNumber) out.modelNumber = modelNumber;
  if (udn) out.udn = udn.toLowerCase();
  if (deviceType) out.deviceType = deviceType;
  if (macAddress) out.macAddress = macAddress;

  return Object.keys(out).length > 0 ? out : undefined;
}

/** Busca el primer nodo <device> del arbol, sin importar cuan anidado este. */
function findDeviceNode(node: unknown): Record<string, unknown> | undefined {
  if (typeof node !== 'object' || node === null) return undefined;
  const obj = node as Record<string, unknown>;
  if ('friendlyName' in obj || 'UDN' in obj) return obj;
  for (const value of Object.values(obj)) {
    const found = findDeviceNode(Array.isArray(value) ? value[0] : value);
    if (found) return found;
  }
  return undefined;
}
