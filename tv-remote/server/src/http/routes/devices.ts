import type { FastifyInstance } from 'fastify';
import { AddManualDeviceRequestSchema, type ListDevicesResponse } from '@tv-remote/shared';
import type { DevicesRepo } from '../../db/devices.repo.js';
import type { DiscoveryService } from '../../discovery/service.js';
import { logger } from '../../logger.js';

export function registerDeviceRoutes(
  app: FastifyInstance,
  repo: DevicesRepo,
  discovery: DiscoveryService,
): void {
  app.get('/api/devices', async (): Promise<ListDevicesResponse> => {
    return {
      devices: repo.list(),
      lastScanAt: discovery.lastScanAt,
      scanning: discovery.scanning,
    };
  });

  /** Dispara un escaneo a pedido. Responde enseguida: el escaneo sigue de fondo. */
  app.post('/api/discovery/scan', async (_req, reply) => {
    if (discovery.scanning) {
      return reply.code(409).send({
        error: 'scan_in_progress',
        message: 'Ya hay un escaneo en curso. Espera a que termine.',
      });
    }
    void discovery.scan();
    return reply.code(202).send({ started: true });
  });

  /**
   * Alta manual por IP, para redes donde el multicast no pasa.
   * El host queda guardado y se sondea en cada escaneo, aunque nunca conteste
   * a SSDP ni a mDNS.
   */
  app.post('/api/devices/manual', async (req, reply) => {
    const parsed = AddManualDeviceRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: parsed.error.issues[0]?.message ?? 'La direccion IP no es valida.',
      });
    }

    const { ip, name } = parsed.data;
    if (!esIpv4Valida(ip)) {
      return reply.code(400).send({
        error: 'invalid_ip',
        message: `"${ip}" no es una direccion IP valida. Tiene que ser algo como 192.168.1.42`,
      });
    }

    repo.addManualHost(ip, name);
    logger.info({ ip }, 'Host agregado a mano');
    void discovery.scan();
    return reply.code(202).send({ ip, scanning: true });
  });

  app.delete<{ Params: { ip: string } }>('/api/devices/manual/:ip', async (req, reply) => {
    repo.removeManualHost(req.params.ip);
    return reply.code(204).send();
  });

  app.get('/api/health', async () => ({
    ok: true,
    lastScanAt: discovery.lastScanAt,
    scanning: discovery.scanning,
  }));
}

/** El regex del schema deja pasar 999.999.999.999: aca se validan los rangos. */
function esIpv4Valida(ip: string): boolean {
  const partes = ip.split('.');
  if (partes.length !== 4) return false;
  return partes.every((p) => {
    if (!/^\d{1,3}$/.test(p)) return false;
    const n = Number(p);
    return n >= 0 && n <= 255;
  });
}
