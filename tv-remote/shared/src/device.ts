import { z } from 'zod';

/**
 * Marcas soportadas. 'unknown' es para lo que se descubre pero no se identifica:
 * el dispositivo igual se lista, para que el usuario vea que EXISTE en la red
 * aunque todavia no podamos controlarlo.
 */
export const BrandSchema = z.enum([
  'lg',
  'samsung',
  'roku',
  'chromecast',
  'androidtv',
  'dlna',
  'vizio',
  'unknown',
]);
export type Brand = z.infer<typeof BrandSchema>;

/**
 * Lo que un dispositivo sabe hacer de verdad. Se declara por dispositivo, no
 * por marca, porque dentro de una misma marca cambia (un Roku TV tiene volumen,
 * un Roku stick no; un Samsung 2016 habla por 8001 y uno de 2020 por 8002).
 *
 * 'volume'         -> subir/bajar por pasos
 * 'volumeAbsolute' -> fijar un nivel exacto. Roku NO lo tiene, Samsung solo por
 *                     UPnP RenderingControl y segun modelo. Ver CLAUDE.md.
 */
export const CapabilitySchema = z.enum([
  'power',
  'wakeOnLan',
  'volume',
  'volumeAbsolute',
  'mute',
  'input',
  'dpad',
  'launchApp',
  'castUrl',
  'castFile',
]);
export type Capability = z.infer<typeof CapabilitySchema>;

/** Como llegamos a conocer este dispositivo. Sirve para depurar descubrimiento. */
export const DiscoverySourceSchema = z.enum(['ssdp', 'mdns', 'probe', 'manual']);
export type DiscoverySource = z.infer<typeof DiscoverySourceSchema>;

export const DeviceSchema = z.object({
  /**
   * Estable entre reinicios y entre cambios de IP. NUNCA derivado de la IP sola:
   * el DHCP la cambia y perderiamos las credenciales de emparejamiento.
   * Ver resolveDeviceId() en server/src/discovery/identify.ts.
   */
  id: z.string().min(1),
  name: z.string().min(1),
  brand: BrandSchema,
  model: z.string().optional(),
  ip: z.string().min(1),
  mac: z.string().optional(),
  capabilities: z.array(CapabilitySchema),
  paired: z.boolean(),
  online: z.boolean(),
  lastSeen: z.string(),
  /** true cuando el id se derivo de la IP por no haber nada mejor: es fragil. */
  unstableId: z.boolean(),
  sources: z.array(DiscoverySourceSchema),
  /** Datos crudos del descubrimiento. Solo para diagnostico, no para logica. */
  raw: z.record(z.string(), z.unknown()).optional(),
});
export type Device = z.infer<typeof DeviceSchema>;

export const DeviceStateSchema = z.object({
  deviceId: z.string(),
  powered: z.boolean().optional(),
  volume: z.number().int().min(0).max(100).optional(),
  muted: z.boolean().optional(),
  currentApp: z.string().optional(),
  currentInput: z.string().optional(),
  updatedAt: z.string(),
});
export type DeviceState = z.infer<typeof DeviceStateSchema>;
