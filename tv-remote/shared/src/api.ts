import { z } from 'zod';
import { DeviceSchema } from './device.js';

export const ListDevicesResponseSchema = z.object({
  devices: z.array(DeviceSchema),
  /** null mientras no haya terminado nunca un escaneo. */
  lastScanAt: z.string().nullable(),
  scanning: z.boolean(),
});
export type ListDevicesResponse = z.infer<typeof ListDevicesResponseSchema>;

/**
 * Alta manual por IP. Es la valvula de escape para redes donde el multicast no
 * pasa: aislamiento de clientes en el AP, VLANs separadas, algunos mesh.
 * Sin esto, el usuario cuyo router bloquea multicast se queda sin nada.
 */
export const AddManualDeviceRequestSchema = z.object({
  ip: z
    .string()
    .regex(/^(\d{1,3}\.){3}\d{1,3}$/, 'Tiene que ser una IPv4, por ejemplo 192.168.1.42'),
  name: z.string().min(1).max(64).optional(),
});
export type AddManualDeviceRequest = z.infer<typeof AddManualDeviceRequestSchema>;

export const ApiErrorSchema = z.object({
  error: z.string(),
  /** Mensaje en castellano, listo para mostrarle al usuario tal cual. */
  message: z.string(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
