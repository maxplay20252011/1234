import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { openDatabase } from './db/index.js';
import { DevicesRepo } from './db/devices.repo.js';
import { DiscoveryService } from './discovery/service.js';
import { buildServer } from './http/server.js';
import { listLanInterfaces, primaryLanAddress } from './net/interfaces.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = openDatabase(config.DATA_DIR);
  const repo = new DevicesRepo(db);

  const discovery = new DiscoveryService(
    {
      ssdpTimeoutMs: config.SSDP_TIMEOUT_MS,
      probeTimeoutMs: config.PROBE_TIMEOUT_MS,
      intervalSeconds: config.DISCOVERY_INTERVAL_SECONDS,
    },
    (result) => {
      for (const device of result.devices) repo.upsert(device);
      repo.markOfflineExcept(result.devices.map((d) => d.id));
    },
    // Los hosts cargados a mano se resondean en cada escaneo.
    () => repo.listManualHosts().map((h) => h.ip),
  );

  const app = await buildServer(config, repo, discovery);
  await app.listen({ host: config.HOST, port: config.PORT });

  const lan = primaryLanAddress();
  logger.info(`Servidor escuchando en el puerto ${config.PORT}`);
  if (lan) {
    logger.info(`Abri  http://${lan}:${config.PORT}  desde el celular o la compu`);
  } else {
    logger.warn('No se detecto una IP de red local: solo vas a poder entrar desde esta maquina.');
  }
  if (config.HOST === '0.0.0.0' && listLanInterfaces().length > 0) {
    logger.info(
      'Recordatorio de seguridad: NO abras este puerto en el router. ' +
        'Mientras no lo hagas, el servidor solo es accesible desde tu red local.',
    );
  }

  discovery.start();

  const cerrar = async (senal: string): Promise<void> => {
    logger.info({ senal }, 'Cerrando');
    discovery.stop();
    await app.close();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void cerrar('SIGINT'));
  process.on('SIGTERM', () => void cerrar('SIGTERM'));
}

main().catch((err: unknown) => {
  logger.error({ err }, 'El servidor no pudo arrancar');
  process.exit(1);
});
