import type { Brand, Device, DiscoverySource } from '@tv-remote/shared';
import { extractUdn, type SsdpResponse } from './ssdp.js';
import type { MdnsService } from './mdns.js';
import type { ProbeResult } from './probe.js';
import type { UpnpDescription } from './upnp.js';
import { normalizeMac } from '../net/arp.js';

/** Todo lo que sabemos de UNA ip, juntado de todas las vias de descubrimiento. */
export type Evidence = {
  ip: string;
  ssdp: SsdpResponse[];
  upnp: UpnpDescription[];
  mdns: MdnsService[];
  probe?: ProbeResult;
  /** MAC leida de la tabla ARP del sistema operativo. */
  arpMac?: string;
  manual?: boolean;
};

export function detectBrand(ev: Evidence): Brand {
  // 1. Lo que el propio aparato contesto a una consulta especifica de marca:
  //    es la evidencia mas fuerte que hay.
  if (ev.probe?.samsung) return 'samsung';
  if (ev.probe?.roku) return 'roku';

  // 2. mDNS. Si anuncia androidtvremote2 corre Android TV / Google TV, aunque
  //    tambien anuncie googlecast. El orden aca no es negociable: un Chromecast
  //    con Google TV anuncia LOS DOS, y llamarlo 'chromecast' nos haria perder
  //    el D-pad, el encendido y las apps.
  const tiposMdns = new Set(ev.mdns.map((s) => s.type));
  if (tiposMdns.has('androidtvremote2')) return 'androidtv';
  if (tiposMdns.has('googlecast')) return 'chromecast';

  // 3. SSDP: Roku usa un search target propio.
  if (ev.ssdp.some((r) => r.st?.toLowerCase().includes('roku'))) return 'roku';

  // 4. Fabricante declarado en la descripcion UPnP.
  const texto = [
    ...ev.upnp.map((d) => `${d.manufacturer ?? ''} ${d.modelName ?? ''} ${d.friendlyName ?? ''}`),
    ...ev.ssdp.map((r) => r.server ?? ''),
  ]
    .join(' ')
    .toLowerCase();

  if (/\blg\b|webos/.test(texto)) return 'lg';
  if (/samsung/.test(texto)) return 'samsung';
  if (/vizio/.test(texto)) return 'vizio';
  if (/roku/.test(texto)) return 'roku';

  // 5. Puertos. Debil por definicion, asi que solo se acepta la combinacion
  //    3000 + 3001 juntos, que es bastante caracteristica de webOS. Un unico
  //    puerto 3000 abierto es mas probable que sea un servidor de desarrollo.
  const puertos = new Set(ev.probe?.openPorts ?? []);
  if (puertos.has(3000) && puertos.has(3001)) return 'lg';

  // 6. Habla DLNA. No sabemos la marca, pero sabemos que reproduce media.
  if (ev.upnp.some((d) => d.deviceType?.includes('MediaRenderer'))) return 'dlna';
  if (ev.ssdp.some((r) => r.st?.includes('MediaRenderer'))) return 'dlna';

  return 'unknown';
}

/**
 * Resuelve el id estable del dispositivo.
 *
 * Regla de oro del proyecto: el id NUNCA se deriva solo de la IP, porque el
 * DHCP la cambia y perderiamos las credenciales de emparejamiento del televisor
 * (que costaron un pop-up y un pin). Se usa lo mas estable disponible, en este
 * orden, y recien como ultimo recurso se cae a la IP marcando `unstableId`.
 */
export function resolveDeviceId(ev: Evidence, brand: Brand): { id: string; unstable: boolean } {
  // 1. Id de Chromecast por mDNS: un uuid propio del aparato, estable de fabrica.
  const castId = ev.mdns.find((s) => s.type === 'googlecast')?.txt['id'];
  if (castId) return { id: `cast:${castId.toLowerCase()}`, unstable: false };

  // 2. UDN de UPnP.
  const udn = ev.upnp.find((d) => d.udn)?.udn ?? extractUdn(ev.ssdp.find((r) => r.usn)?.usn);
  if (udn) return { id: `udn:${udn}`, unstable: false };

  // 3. Numero de serie de Roku.
  const rokuSerial = ev.probe?.roku?.serialNumber;
  if (rokuSerial) return { id: `roku:${rokuSerial.toLowerCase()}`, unstable: false };

  // 4. MAC declarada por el propio televisor (Samsung y Roku la publican).
  const macDeclarada =
    ev.probe?.samsung?.wifiMac ??
    ev.probe?.roku?.ethernetMac ??
    ev.probe?.roku?.wifiMac ??
    ev.upnp.find((d) => d.macAddress)?.macAddress;
  if (macDeclarada) return { id: `mac:${normalizeMac(macDeclarada)}`, unstable: false };

  // 5. MAC de la tabla ARP del sistema.
  if (ev.arpMac) return { id: `mac:${normalizeMac(ev.arpMac)}`, unstable: false };

  // 6. Ultimo recurso. Se marca como inestable para que la interfaz avise que
  //    este dispositivo puede duplicarse si le cambia la IP.
  return { id: `ip:${brand}:${ev.ip}`, unstable: true };
}

export function resolveMac(ev: Evidence): string | undefined {
  const candidata =
    ev.probe?.samsung?.wifiMac ??
    ev.probe?.roku?.ethernetMac ??
    ev.probe?.roku?.wifiMac ??
    ev.upnp.find((d) => d.macAddress)?.macAddress ??
    ev.arpMac;
  return candidata ? normalizeMac(candidata) : undefined;
}

export function resolveName(ev: Evidence, brand: Brand): string {
  const candidatos = [
    ev.mdns.find((s) => s.type === 'googlecast')?.txt['fn'],
    ev.probe?.samsung?.name,
    ev.probe?.roku?.friendlyName,
    ev.upnp.find((d) => d.friendlyName)?.friendlyName,
    ev.mdns[0]?.name,
  ];
  const nombre = candidatos.find((c): c is string => typeof c === 'string' && c.trim().length > 0);
  return nombre?.trim() ?? `${brandLabel(brand)} (${ev.ip})`;
}

export function resolveModel(ev: Evidence): string | undefined {
  const samsung = ev.probe?.samsung;
  if (samsung?.modelName) {
    // El anio es el dato que decide el protocolo, asi que va a la vista.
    return samsung.modelYear ? `${samsung.modelName} (${samsung.modelYear})` : samsung.modelName;
  }
  return (
    ev.probe?.roku?.modelName ??
    ev.mdns.find((s) => s.type === 'googlecast')?.txt['md'] ??
    ev.upnp.find((d) => d.modelName)?.modelName
  );
}

export function brandLabel(brand: Brand): string {
  const etiquetas: Record<Brand, string> = {
    lg: 'LG webOS',
    samsung: 'Samsung Tizen',
    roku: 'Roku',
    chromecast: 'Chromecast',
    androidtv: 'Android TV / Google TV',
    dlna: 'Dispositivo DLNA',
    vizio: 'Vizio SmartCast',
    unknown: 'Dispositivo sin identificar',
  };
  return etiquetas[brand];
}

/**
 * Convierte la evidencia cruda en un Device.
 *
 * `capabilities` sale vacio a proposito. En la Fase 1 no hay ningun adapter
 * implementado, asi que declarar que un televisor "puede" subir el volumen
 * seria justamente el adapter falso que el proyecto no quiere: lo llena el
 * AdapterRegistry a partir de la Fase 2, cuando haya codigo que lo respalde.
 */
export function buildDevice(ev: Evidence, now = new Date()): Device {
  const brand = detectBrand(ev);
  const { id, unstable } = resolveDeviceId(ev, brand);
  const mac = resolveMac(ev);
  const model = resolveModel(ev);

  const sources: DiscoverySource[] = [];
  if (ev.manual) sources.push('manual');
  if (ev.ssdp.length > 0) sources.push('ssdp');
  if (ev.mdns.length > 0) sources.push('mdns');
  if (ev.probe && ev.probe.openPorts.length > 0) sources.push('probe');

  return {
    id,
    name: resolveName(ev, brand),
    brand,
    ...(model !== undefined ? { model } : {}),
    ip: ev.ip,
    ...(mac !== undefined ? { mac } : {}),
    capabilities: [],
    paired: false,
    online: true,
    lastSeen: now.toISOString(),
    unstableId: unstable,
    sources,
    raw: {
      ssdp: ev.ssdp.map((r) => ({ st: r.st, usn: r.usn, server: r.server, location: r.location })),
      mdns: ev.mdns.map((s) => ({ type: s.type, name: s.name, port: s.port, txt: s.txt })),
      upnp: ev.upnp,
      openPorts: ev.probe?.openPorts ?? [],
      ...(ev.probe?.samsung ? { samsung: ev.probe.samsung } : {}),
      ...(ev.probe?.roku ? { roku: ev.probe.roku } : {}),
    },
  };
}
