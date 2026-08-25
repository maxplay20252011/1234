import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Config } from '../config.js';
import type { DevicesRepo } from '../db/devices.repo.js';
import type { DiscoveryService } from '../discovery/service.js';
import { registerDeviceRoutes } from './routes/devices.js';
import { registerControlRoutes } from './routes/control.js';
import { registerStateSocket } from './ws.js';
import type { ControlService } from '../services/control.js';
import type { StateHub } from '../services/state-hub.js';
import type { MediaHistoryRepo } from '../services/media-history.repo.js';
import { logger } from '../logger.js';

export async function buildServer(
  config: Config,
  repo: DevicesRepo,
  discovery: DiscoveryService,
  control: ControlService,
  hub: StateHub,
  history: MediaHistoryRepo,
): Promise<FastifyInstance> {
  const app = Fastify({
    // El tipo Logger de pino es mas estricto que FastifyBaseLogger (exige
    // msgPrefix). Sin este cast, Fastify parametriza toda la instancia con ese
    // generico y las rutas dejan de encajar con el FastifyInstance por defecto.
    loggerInstance: logger as FastifyBaseLogger,
    disableRequestLogging: config.LOG_LEVEL !== 'debug',
  });

  await app.register(fastifyWebsocket);
  registerDeviceRoutes(app, repo, discovery);
  registerControlRoutes(app, control, history);
  registerStateSocket(app, hub);

  // En produccion el backend sirve el build de la interfaz, asi todo vive en un
  // unico puerto y el usuario tiene una sola direccion que recordar.
  const webDist = resolve(join(dirname(fileURLToPath(import.meta.url)), '../../../web/dist'));
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    // Cualquier ruta que no sea /api cae en el index: la interfaz es una SPA.
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api')) {
        return reply.code(404).send({ error: 'not_found', message: 'Esa ruta no existe.' });
      }
      return reply.sendFile('index.html');
    });
    logger.debug({ webDist }, 'Sirviendo la interfaz compilada');
  } else {
    logger.warn(
      'No hay build de la interfaz todavia. Para desarrollo usa "npm run dev:web" en otra terminal; ' +
        'para produccion corre "npm run build".',
    );
  }

  return app;
}
