import { Bonjour, type Service } from 'bonjour-service';
import { logger, protocolLog } from '../logger.js';

export type MdnsService = {
  /** 'googlecast' | 'androidtvremote2' | 'airplay' */
  type: string;
  name: string;
  host?: string;
  port: number;
  addresses: string[];
  txt: Record<string, string>;
};

/**
 * Servicios mDNS que nos interesan.
 *
 * `androidtvremote2` es clave y no solo para el adapter de Android TV: si una
 * misma IP anuncia googlecast Y androidtvremote2, entonces ese aparato corre
 * Android TV / Google TV y SI tiene D-pad, encendido y apps. Un Chromecast
 * pelado anuncia solo googlecast. Es la forma confiable de distinguirlos, mucho
 * mejor que leer el campo de modelo, que repite "Chromecast" en ambos casos.
 */
export const MDNS_SERVICE_TYPES = ['googlecast', 'androidtvremote2', 'airplay'] as const;

export function scanMdns(timeoutMs: number): Promise<MdnsService[]> {
  return new Promise((resolve) => {
    const found = new Map<string, MdnsService>();
    let bonjour: Bonjour;

    try {
      bonjour = new Bonjour();
    } catch (err) {
      logger.debug({ err }, 'No se pudo iniciar mDNS');
      resolve([]);
      return;
    }

    const onUp = (type: string) => (service: Service) => {
      const addresses = (service.addresses ?? []).filter((a) => a.includes('.'));
      if (addresses.length === 0) return;
      const txt = normalizeTxt(service.txt);
      protocolLog('mdns', 'rx', addresses[0] ?? service.name, { type, name: service.name, txt });
      found.set(`${type}|${service.name}`, {
        type,
        name: service.name,
        ...(service.host !== undefined ? { host: service.host } : {}),
        port: service.port,
        addresses,
        txt,
      });
    };

    const browsers = MDNS_SERVICE_TYPES.map((type) => {
      const browser = bonjour.find({ type, protocol: 'tcp' });
      browser.on('up', onUp(type));
      return browser;
    });

    setTimeout(() => {
      for (const browser of browsers) {
        try {
          browser.stop();
        } catch {
          // Ya detenido.
        }
      }
      try {
        bonjour.destroy();
      } catch {
        // Nada que hacer.
      }
      resolve([...found.values()]);
    }, timeoutMs);
  });
}

function normalizeTxt(txt: unknown): Record<string, string> {
  if (typeof txt !== 'object' || txt === null) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(txt as Record<string, unknown>)) {
    if (typeof v === 'string') out[k.toLowerCase()] = v;
    else if (Buffer.isBuffer(v)) out[k.toLowerCase()] = v.toString('utf8');
  }
  return out;
}
