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
import { AndroidTvAdapter } from './adapters/androidtv/index.js';
import { CompositeAdapter } from './adapters/composite.js';
import { CredentialsRepo } from './services/credentials.repo.js';
import { deriveKey, loadOrCreateSecret } from './services/crypto.js';
import { StateHub } from './services/state-hub.js';
import { ControlService } from './services/control.js';
import { MediaHistoryRepo } from './services/media-history.repo.js';
import { MediaCaster } from './services/media-caster.js';
import { MediaLibrary } from './media/library.js';
import { GroupsRepo, ScenesRepo } from './services/automation.repo.js';
import { SceneRunner } from './services/scene-runner.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = openDatabase(config.DATA_DIR);
  const repo = new DevicesRepo(db);

  const secret = loadOrCreateSecret(config.DATA_DIR, config.ENCRYPTION_KEY);
  const key = deriveKey(secret);
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
  registry.register(new ChromecastAdapter('chromecast'));

  // Un Chromecast con Google TV habla los DOS protocolos: castv2 para
  // reproducir y volumen, androidtvremote2 para cruceta y encendido. Ninguno
  // solo alcanza, asi que se combinan en un adapter que los presenta como uno.
  registry.register(
    new CompositeAdapter('androidtv', new AndroidTvAdapter(), new ChromecastAdapter('androidtv')),
  );
  if (config.MOCK_DEVICE) registry.register(new MockAdapter());

  const history = new MediaHistoryRepo(db);

  // Carpetas de video. Solo se sirve lo que este adentro: es el limite de lo
  // que queda expuesto a la red local.
  const mediaRoots = config.MEDIA_DIRS.split(',')
    .map((d) => d.trim())
    .filter((d) => d.length > 0);
  const library = new MediaLibrary(mediaRoots);
  const caster = new MediaCaster(
    library,
    secret,
    config.PORT,
    config.MEDIA_LINK_TTL_SECONDS,
  );

  const control = new ControlService(repo, credentials, registry, hub, history, caster);

  const groups = new GroupsRepo(db);
  const scenes = new ScenesRepo(db);
  const runner = new SceneRunner(control);

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

  const app = await buildServer(config, repo, discovery, control, hub, history, library, secret, {
    groups,
    scenes,
    runner,
  });
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
  if (library.configured) {
    logger.info({ carpetas: mediaRoots }, 'Carpetas de video habilitadas');
  } else {
    logger.info(
      'Sin carpetas de video configuradas. Para enviar archivos de tu disco, agrega MEDIA_DIRS al archivo .env',
    );
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
