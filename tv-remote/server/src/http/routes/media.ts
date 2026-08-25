import type { FastifyInstance } from 'fastify';
import type { MediaLibrary } from '../../media/library.js';
import type { ControlService } from '../../services/control.js';
import { hasFfmpeg } from '../../media/probe.js';

/**
 * Explorar la biblioteca de videos.
 *
 * Solo se listan las carpetas configuradas en MEDIA_DIRS. Si no hay ninguna, se
 * responde con instrucciones en vez de una lista vacia sin explicacion.
 */
export function registerLibraryRoutes(
  app: FastifyInstance,
  library: MediaLibrary,
  control: ControlService,
): void {
  app.get<{ Querystring: { path?: string } }>('/api/library', async (req, reply) => {
    if (!library.configured) {
      return reply.code(409).send({
        error: 'library_not_configured',
        message:
          'Todavia no configuraste ninguna carpeta de videos. Abri el archivo .env y agrega, por ejemplo, MEDIA_DIRS=/home/tu-usuario/Videos',
      });
    }

    try {
      return await library.browse(req.query.path);
    } catch {
      return reply.code(400).send({
        error: 'invalid_path',
        message: 'Esa carpeta no esta dentro de las carpetas permitidas.',
      });
    }
  });

  /** Analiza un archivo antes de enviarlo, para avisar si va a costar CPU. */
  app.get<{ Params: { fileId: string } }>('/api/library/:fileId/check', async (req, reply) => {
    const preparado = await control.inspectFile(req.params.fileId);
    if (!preparado) {
      return reply.code(404).send({
        error: 'not_found',
        message: 'No se encontro ese archivo. Proba explorar la carpeta de nuevo.',
      });
    }
    return {
      title: preparado.title,
      contentType: preparado.contentType,
      durationSeconds: preparado.durationSeconds,
      compatibility: preparado.compatibility,
      hasSubtitles: preparado.subtitleVttUrl !== undefined,
    };
  });

  app.get('/api/library/status', async () => ({
    configured: library.configured,
    roots: library.rootPaths,
    ffmpeg: await hasFfmpeg(),
  }));
}
