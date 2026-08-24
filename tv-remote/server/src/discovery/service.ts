import { EventEmitter } from 'node:events';
import type { Device } from '@tv-remote/shared';
import { logger } from '../logger.js';
import { readArpTable } from '../net/arp.js';
import { scanSsdp, type SsdpResponse } from './ssdp.js';
import { scanMdns, type MdnsService } from './mdns.js';
import { fetchUpnpDescription, type UpnpDescription } from './upnp.js';
import { probeHosts, type ProbeResult } from './probe.js';
import { buildDevice, type Evidence } from './identify.js';

export type DiscoveryOptions = {
  ssdpTimeoutMs: number;
  probeTimeoutMs: number;
  /** IPs a sondear siempre, aunque no hayan contestado a SSDP ni mDNS. */
  extraHosts?: readonly string[];
};

export type DiscoveryResult = {
  devices: Device[];
  startedAt: string;
  finishedAt: string;
  /** Crudo, para el CLI de diagnostico. */
  rawSsdp: SsdpResponse[];
  rawMdns: MdnsService[];
  rawProbes: ProbeResult[];
};

/**
 * Corre un escaneo completo: SSDP + mDNS + sondeo de puertos + ARP.
 *
 * El orden importa. El sondeo de puertos va DESPUES del descubrimiento (usa sus
 * resultados como lista de candidatos) y la tabla ARP se lee AL FINAL, porque
 * el propio sondeo es lo que fuerza al sistema operativo a resolver las MAC de
 * esos hosts. Leer ARP antes devolveria una tabla casi vacia.
 */
export async function runDiscovery(options: DiscoveryOptions): Promise<DiscoveryResult> {
  const startedAt = new Date().toISOString();
  logger.info('Escaneando la red...');

  const [rawSsdp, rawMdns] = await Promise.all([
    scanSsdp({ timeoutMs: options.ssdpTimeoutMs }),
    scanMdns(options.ssdpTimeoutMs),
  ]);
  logger.info(
    { ssdp: rawSsdp.length, mdns: rawMdns.length },
    'Respuestas recibidas de SSDP y mDNS',
  );

  const candidatos = new Set<string>(options.extraHosts ?? []);
  for (const r of rawSsdp) candidatos.add(r.address);
  for (const s of rawMdns) for (const a of s.addresses) candidatos.add(a);

  // Las descripciones UPnP se bajan una sola vez por URL: un mismo televisor
  // anuncia el mismo LOCATION en varios search targets.
  const locations = [...new Set(rawSsdp.map((r) => r.location).filter((l): l is string => !!l))];
  const descripciones = new Map<string, UpnpDescription>();
  await Promise.all(
    locations.map(async (loc) => {
      const desc = await fetchUpnpDescription(loc, options.probeTimeoutMs * 2);
      if (desc) descripciones.set(loc, desc);
    }),
  );

  const ips = [...candidatos];
  const rawProbes = await probeHosts(ips, options.probeTimeoutMs);
  const arp = await readArpTable();

  const porId = new Map<string, Device>();
  for (const ip of ips) {
    const ssdpDeEsteHost = rawSsdp.filter((r) => r.address === ip);
    const evidence: Evidence = {
      ip,
      ssdp: ssdpDeEsteHost,
      upnp: ssdpDeEsteHost
        .map((r) => (r.location ? descripciones.get(r.location) : undefined))
        .filter((d): d is UpnpDescription => d !== undefined),
      mdns: rawMdns.filter((s) => s.addresses.includes(ip)),
      ...(rawProbes.find((p) => p.ip === ip) !== undefined
        ? { probe: rawProbes.find((p) => p.ip === ip) as ProbeResult }
        : {}),
      ...(arp.get(ip) !== undefined ? { arpMac: arp.get(ip) as string } : {}),
      ...(options.extraHosts?.includes(ip) ? { manual: true } : {}),
    };

    const device = buildDevice(evidence);
    // Si dos IPs resuelven al mismo id (doble interfaz, cable y wifi), gana la
    // que trajo mas evidencia.
    const previo = porId.get(device.id);
    if (!previo || device.sources.length > previo.sources.length) porId.set(device.id, device);
  }

  const devices = [...porId.values()];
  logger.info({ encontrados: devices.length }, 'Escaneo terminado');

  return {
    devices,
    startedAt,
    finishedAt: new Date().toISOString(),
    rawSsdp,
    rawMdns,
    rawProbes,
  };
}

export type DiscoveryServiceEvents = {
  devices: [Device[]];
  scanning: [boolean];
};

/**
 * Corre el descubrimiento al arrancar y despues cada `intervalSeconds`.
 * Nunca deja dos escaneos superpuestos: si uno tarda mas que el intervalo, el
 * siguiente se saltea en vez de encimarse.
 */
export class DiscoveryService extends EventEmitter<DiscoveryServiceEvents> {
  private timer: NodeJS.Timeout | undefined;
  private enCurso = false;
  private ultimoEscaneo: string | null = null;

  constructor(
    private readonly options: DiscoveryOptions & { intervalSeconds: number },
    private readonly onResult: (result: DiscoveryResult) => void,
    private readonly extraHostsProvider: () => readonly string[] = () => [],
  ) {
    super();
  }

  get lastScanAt(): string | null {
    return this.ultimoEscaneo;
  }

  get scanning(): boolean {
    return this.enCurso;
  }

  start(): void {
    void this.scan();
    this.timer = setInterval(() => void this.scan(), this.options.intervalSeconds * 1000);
    // No mantener el proceso vivo solo por este timer.
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async scan(): Promise<DiscoveryResult | undefined> {
    if (this.enCurso) {
      logger.debug('Ya hay un escaneo en curso, se saltea este');
      return undefined;
    }
    this.enCurso = true;
    this.emit('scanning', true);
    try {
      const result = await runDiscovery({
        ssdpTimeoutMs: this.options.ssdpTimeoutMs,
        probeTimeoutMs: this.options.probeTimeoutMs,
        extraHosts: [...(this.options.extraHosts ?? []), ...this.extraHostsProvider()],
      });
      this.ultimoEscaneo = result.finishedAt;
      this.onResult(result);
      this.emit('devices', result.devices);
      return result;
    } catch (err) {
      logger.error({ err }, 'El escaneo fallo');
      return undefined;
    } finally {
      this.enCurso = false;
      this.emit('scanning', false);
    }
  }
}
