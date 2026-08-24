import { networkInterfaces } from 'node:os';

export type LanInterface = {
  name: string;
  address: string;
  netmask: string;
  /** Broadcast de la subred, p.ej. 192.168.1.255. Lo usa Wake-on-LAN. */
  broadcast: string;
  cidr: string;
};

/**
 * Interfaces IPv4 locales, sin loopback ni virtuales.
 *
 * Por que importa: en una notebook con VPN, WSL o Docker instalado hay varias
 * interfaces, y un M-SEARCH mandado por la equivocada no llega a ningun TV.
 * Es la causa numero uno de "no aparece mi televisor". Por eso el escaner de
 * SSDP manda por TODAS y no intenta adivinar cual es la buena.
 */
export function listLanInterfaces(): LanInterface[] {
  const result: LanInterface[] = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      if (isLikelyVirtual(name)) continue;
      result.push({
        name,
        address: addr.address,
        netmask: addr.netmask,
        broadcast: broadcastAddress(addr.address, addr.netmask),
        cidr: addr.cidr ?? `${addr.address}/${maskToPrefix(addr.netmask)}`,
      });
    }
  }
  return result;
}

/**
 * Interfaces que casi nunca son la LAN de casa. No las excluimos del
 * descubrimiento (mejor de mas que de menos), solo las despriorizamos al
 * elegir la IP que se le muestra al televisor en las URLs de casting.
 */
function isLikelyVirtual(name: string): boolean {
  return /^(vEthernet|docker|br-|veth|vmnet|virbr|utun|tun|tap|ZeroTier|Tailscale|wg)/i.test(name);
}

export function maskToPrefix(netmask: string): number {
  return netmask
    .split('.')
    .map((o) => (Number(o).toString(2).match(/1/g) ?? []).length)
    .reduce((a, b) => a + b, 0);
}

export function broadcastAddress(address: string, netmask: string): string {
  const a = address.split('.').map(Number);
  const m = netmask.split('.').map(Number);
  return a.map((octet, i) => (octet | (~(m[i] ?? 0) & 0xff)) >>> 0).join('.');
}

/** True si `ip` cae dentro de la subred de `iface`. */
export function isInSubnet(ip: string, iface: LanInterface): boolean {
  const toInt = (s: string) =>
    s.split('.').reduce((acc, o) => ((acc << 8) | Number(o)) >>> 0, 0);
  const mask = toInt(iface.netmask);
  return (toInt(ip) & mask) === (toInt(iface.address) & mask);
}

/**
 * La IP con la que el servidor se anuncia a los televisores. Nunca localhost:
 * el TV tiene que poder alcanzarla desde la red. Se usara en la Fase 4 para
 * construir las URLs del MediaServer.
 */
export function primaryLanAddress(): string | undefined {
  const ifaces = listLanInterfaces();
  const preferida = ifaces.find((i) => /^(en|eth|wl|Wi-Fi|Ethernet)/i.test(i.name));
  return (preferida ?? ifaces[0])?.address;
}
