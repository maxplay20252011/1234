import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { openDatabase } from './db/index.js';
import { DevicesRepo } from './db/devices.repo.js';
import { DiscoveryService } from './discovery/service.js';
import { buildServer } from './http/server.js';
import { listLanInterfaces, primaryLanAddress } from './net/interfaces.js';
import { AdapterRegistry } from './adapters/types.js';
import { SamsungAdapter } from './adapters/samsung/index.js';
import { MockAdapter, buildMockDevice } from './adapters/mock/index.js';
import { ChromecastAdapter } from './adapters/chromecast/index.js';
import { CredentialsRepo } from './services/credentials.repo.js';
import { deriveKey, loadOrCreateSecret } from './services/crypto.js';
import { StateHub } from './services/state-hub.js';
import { ControlService } from './services/control.js';
import { MediaHistoryRepo } from './services/media-history.repo.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = openDatabase(config.DATA_DIR);
  const repo = new DevicesRepo(db);

  const key = deriveKey(loadOrCreateSecret(config.DATA_DIR, config.ENCRYPTION_KEY));
  const credentials = new CredentialsRepo(db, key);
  const hub = new StateHub();

  const registry = new AdapterRegistry();
  // El adapter guarda el token apenas el televisor lo entrega: es la unica vez
  // que se puede, y perderlo obliga a emparejar de nuevo.
  registry.register(
    new SamsungAdapter((deviceId, token) => {
      const device = repo.get(deviceId);
      if (device) credentials.save(deviceId, device.brand, { token });
    }),
  );
  // El mismo adapter para las dos marcas: un Chromecast con Google TV habla
  // castv2 igual que uno pelado. Lo que lo distingue es que ADEMAS habla
  // androidtvremote2, que es la cruceta y el encendido de la Fase 5.
  registry.register(new ChromecastAdapter('chromecast'));
  registry.register(new ChromecastAdapter('androidtv'));
  if (config.MOCK_DEVICE) registry.register(new MockAdapter());

  const history = new MediaHistoryRepo(db);
  const control = new ControlService(repo, credentials, registry, hub, history);

  const discovery = new DiscoveryService(
    {
      ssdpTimeoutMs: config.SSDP_TIMEOUT_MS,
      probeTimeoutMs: config.PROBE_TIMEOUT_MS,
      intervalSeconds: config.DISCOVERY_INTERVAL_SECONDS,
    },
    (result) => {
      const devices = config.MOCK_DEVICE ? [...result.devices, buildMockDevice()] : result.devices;
      for (const device of devices) repo.upsert(device);
      repo.markOfflineExcept(devices.map((d) => d.id));

      // Se recalculan las capacidades de lo que tenga adapter. Es lo que decide
      // que controles muestra la interfaz, y hay que preguntarselo al aparato,
      // no deducirlo de la marca.
      for (const device of devices) {
        if (!registry.get(device.brand)) continue;
        void control.refreshCapabilities(device.id).catch((err: unknown) => {
          logger.debug({ err, deviceId: device.id }, 'No se pudieron leer las capacidades');
        });
      }
      hub.devices(repo.list());
    },
    () => repo.listManualHosts().map((h) => h.ip),
  );

  discovery.on('scanning', (scanning) => hub.scanning(scanning));

  const app = await buildServer(config, repo, discovery, control, hub, history);
  await app.listen({ host: config.HOST, port: config.PORT });

  const lan = primaryLanAddress();
  logger.info(`Servidor escuchando en el puerto ${config.PORT}`);
  if (lan) {
    logger.info(`Abri  http://${lan}:${config.PORT}  desde el celular o la compu`);
  } else {
    logger.warn('No se detecto una IP de red local: solo vas a poder entrar desde esta maquina.');
  }
  if (config.MOCK_DEVICE) {
    logger.warn('MOCK_DEVICE activo: hay un televisor simulado en la lista. No es real.');
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
