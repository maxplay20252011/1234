import type { Device } from '@tv-remote/shared';
import type { Db } from './index.js';

type DeviceRow = {
  id: string;
  name: string;
  brand: string;
  model: string | null;
  ip: string;
  mac: string | null;
  capabilities: string;
  paired: number;
  online: number;
  last_seen: string;
  unstable_id: number;
  sources: string;
  raw: string | null;
  manual: number;
  created_at: string;
};

export class DevicesRepo {
  constructor(private readonly db: Db) {}

  list(): Device[] {
    const rows = this.db
      .prepare('SELECT * FROM devices ORDER BY online DESC, name COLLATE NOCASE ASC')
      .all() as DeviceRow[];
    return rows.map(rowToDevice);
  }

  get(id: string): Device | undefined {
    const row = this.db.prepare('SELECT * FROM devices WHERE id = ?').get(id) as
      | DeviceRow
      | undefined;
    return row ? rowToDevice(row) : undefined;
  }

  /**
   * Inserta o actualiza por id.
   *
   * Actualiza la IP explicitamente: es el caso normal cuando el DHCP renueva
   * direcciones. Como el id no depende de la IP, el dispositivo sigue siendo el
   * mismo y conserva sus credenciales de emparejamiento.
   *
   * `paired` NO se pisa nunca desde el descubrimiento: lo maneja el flujo de
   * emparejamiento de cada adapter, que es quien sabe la verdad.
   */
  upsert(device: Device, manual = false): void {
    this.db
      .prepare(
        `INSERT INTO devices (id, name, brand, model, ip, mac, capabilities, paired, online,
                              last_seen, unstable_id, sources, raw, manual, created_at)
         VALUES (@id, @name, @brand, @model, @ip, @mac, @capabilities, 0, @online,
                 @last_seen, @unstable_id, @sources, @raw, @manual, @created_at)
         ON CONFLICT(id) DO UPDATE SET
           name         = excluded.name,
           brand        = excluded.brand,
           model        = COALESCE(excluded.model, devices.model),
           ip           = excluded.ip,
           mac          = COALESCE(excluded.mac, devices.mac),
           capabilities = excluded.capabilities,
           online       = excluded.online,
           last_seen    = excluded.last_seen,
           unstable_id  = excluded.unstable_id,
           sources      = excluded.sources,
           raw          = excluded.raw,
           manual       = MAX(devices.manual, excluded.manual)`,
      )
      .run({
        id: device.id,
        name: device.name,
        brand: device.brand,
        model: device.model ?? null,
        ip: device.ip,
        mac: device.mac ?? null,
        capabilities: JSON.stringify(device.capabilities),
        online: device.online ? 1 : 0,
        last_seen: device.lastSeen,
        unstable_id: device.unstableId ? 1 : 0,
        sources: JSON.stringify(device.sources),
        raw: device.raw ? JSON.stringify(device.raw) : null,
        manual: manual ? 1 : 0,
        created_at: new Date().toISOString(),
      });
  }

  /** Marca offline todo lo que no aparecio en el ultimo escaneo. */
  markOfflineExcept(idsVistos: readonly string[]): void {
    if (idsVistos.length === 0) {
      this.db.prepare('UPDATE devices SET online = 0').run();
      return;
    }
    const placeholders = idsVistos.map(() => '?').join(',');
    this.db
      .prepare(`UPDATE devices SET online = 0 WHERE id NOT IN (${placeholders})`)
      .run(...idsVistos);
  }

  addManualHost(ip: string, name?: string): void {
    this.db
      .prepare(
        `INSERT INTO manual_hosts (ip, name, created_at) VALUES (?, ?, ?)
         ON CONFLICT(ip) DO UPDATE SET name = COALESCE(excluded.name, manual_hosts.name)`,
      )
      .run(ip, name ?? null, new Date().toISOString());
  }

  listManualHosts(): { ip: string; name: string | null }[] {
    return this.db.prepare('SELECT ip, name FROM manual_hosts').all() as {
      ip: string;
      name: string | null;
    }[];
  }

  removeManualHost(ip: string): void {
    this.db.prepare('DELETE FROM manual_hosts WHERE ip = ?').run(ip);
  }
}

function rowToDevice(row: DeviceRow): Device {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand as Device['brand'],
    ...(row.model !== null ? { model: row.model } : {}),
    ip: row.ip,
    ...(row.mac !== null ? { mac: row.mac } : {}),
    capabilities: safeJson(row.capabilities, []) as Device['capabilities'],
    paired: row.paired === 1,
    online: row.online === 1,
    lastSeen: row.last_seen,
    unstableId: row.unstable_id === 1,
    sources: safeJson(row.sources, []) as Device['sources'],
    ...(row.raw !== null
      ? { raw: safeJson(row.raw, {}) as Record<string, unknown> }
      : {}),
  };
}

function safeJson(text: string, fallback: unknown): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}
