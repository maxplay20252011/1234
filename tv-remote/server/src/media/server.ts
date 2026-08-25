import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { spawn } from 'node:child_process';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { contentTypeFor } from './mime.js';
import { contentRangeHeader, parseRange, unsatisfiableHeader } from './range.js';
import { esVtt, srtToVtt, subtitleCandidates } from './subtitles.js';
import { verifyMediaToken } from './tokens.js';
import type { MediaLibrary } from './library.js';
import { logger } from '../logger.js';

/**
 * Cabeceras DLNA.
 *
 * DLNA.ORG_OP=01 declara que el servidor acepta busqueda por bytes. Sin esa
 * cabecera, varios televisores Samsung reproducen el archivo pero no dejan
 * adelantar, y algunos ni siquiera arrancan.
 */
const DLNA_FEATURES =
  'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000';

export type MediaServerDeps = {
  library: MediaLibrary;
  secret: string;
};

export function registerMediaRoutes(app: FastifyInstance, deps: MediaServerDeps): void {
  const { library, secret } = deps;

  /** Comprueba token y resuelve la ruta. Devuelve undefined si ya respondio. */
  const resolver = async (
    req: FastifyRequest<{ Params: { id: string }; Querystring: { t?: string } }>,
    reply: FastifyReply,
  ): Promise<string | undefined> => {
    const { id } = req.params;

    const resultado = verifyMediaToken(secret, id, req.query.t);
    if (resultado !== 'ok') {
      // 403 y no 404: el archivo existe, lo que no sirve es el enlace. Decirlo
      // ayuda a entender que hay que volver a enviarlo desde la aplicacion.
      void reply.code(403).send({
        error: resultado === 'expired' ? 'link_expired' : 'invalid_token',
        message:
          resultado === 'expired'
            ? 'Este enlace ya caduco. Volve a enviar el video desde la aplicacion.'
            : 'Enlace invalido.',
      });
      return undefined;
    }

    const ruta = library.pathFor(id);
    if (!ruta) {
      void reply.code(404).send({
        error: 'not_found',
        message: 'Ese archivo ya no esta disponible. Volve a elegirlo desde la aplicacion.',
      });
      return undefined;
    }
    return ruta;
  };

  const servirArchivo = async (
    req: FastifyRequest<{
      Params: { id: string };
      Querystring: { t?: string; start?: string; mode?: string };
    }>,
    reply: FastifyReply,
    soloCabeceras: boolean,
  ): Promise<FastifyReply | undefined> => {
    const ruta = await resolver(req, reply);
    if (!ruta) return reply;

    let info;
    try {
      info = await stat(ruta);
    } catch {
      return reply.code(404).send({
        error: 'not_found',
        message: 'El archivo ya no esta en el disco.',
      });
    }

    const contentType = contentTypeFor(ruta);

    // Modo conversion: el contenido se genera en vivo, asi que no hay bytes
    // fijos que ofrecer y no se puede responder un rango. Se declara
    // Accept-Ranges: none para que el cliente no lo intente.
    //
    // Se activa con mode=transcode explicito, no adivinando: quien decide es el
    // ControlService a partir del analisis de codecs.
    if (req.query.mode === 'transcode') {
      const inicio = Number(req.query.start ?? '0');
      return servirConversion(
        reply,
        ruta,
        contentType,
        Number.isFinite(inicio) && inicio > 0 ? inicio : 0,
        soloCabeceras,
      );
    }

    const rango = parseRange(req.headers.range, info.size);

    if (rango === 'unsatisfiable') {
      return reply
        .code(416)
        .header('Content-Range', unsatisfiableHeader(info.size))
        .header('Accept-Ranges', 'bytes')
        .send();
    }

    const comunes = {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'transferMode.dlna.org': 'Streaming',
      'contentFeatures.dlna.org': DLNA_FEATURES,
      'Cache-Control': 'no-store',
    };

    if (rango === null) {
      reply.headers({ ...comunes, 'Content-Length': String(info.size) }).code(200);
      if (soloCabeceras) return reply.send();
      return reply.send(createReadStream(ruta));
    }

    const largo = rango.end - rango.start + 1;
    reply
      .headers({
        ...comunes,
        'Content-Range': contentRangeHeader(rango, info.size),
        'Content-Length': String(largo),
      })
      .code(206);

    if (soloCabeceras) return reply.send();
    return reply.send(createReadStream(ruta, { start: rango.start, end: rango.end }));
  };

  app.get<{ Params: { id: string }; Querystring: { t?: string; start?: string; mode?: string } }>(
    '/media/:id',
    // Fastify genera un HEAD automatico para cada GET, pero ese ejecuta el
    // manejador entero y descarta el cuerpo: leeria el archivo completo para
    // no mandarlo. Se desactiva y se registra uno propio que solo arma las
    // cabeceras.
    { exposeHeadRoute: false },
    async (req, reply) => servirArchivo(req, reply, false),
  );

  // Los televisores mandan HEAD antes de reproducir para leer tamanio y tipo.
  app.head<{ Params: { id: string }; Querystring: { t?: string; start?: string; mode?: string } }>(
    '/media/:id',
    async (req, reply) => servirArchivo(req, reply, true),
  );

  /**
   * Subtitulos convertidos al vuelo.
   * Ni los televisores ni los receptores Cast leen SRT: piden WebVTT.
   */
  app.get<{ Params: { id: string; ext: string }; Querystring: { t?: string } }>(
    '/media/:id/subs.:ext',
    async (req, reply) => {
      const ruta = await resolver(req, reply);
      if (!ruta) return reply;

      const quiereSrt = req.params.ext.toLowerCase() === 'srt';

      const subtitulo = await library.findSubtitle(ruta, subtitleCandidates(basename(ruta)));
      if (!subtitulo) {
        return reply.code(404).send({
          error: 'no_subtitle',
          message: 'No se encontro ningun subtitulo junto a ese video.',
        });
      }

      let contenido: string;
      try {
        contenido = await readFile(subtitulo, 'utf8');
      } catch {
        return reply.code(404).send({
          error: 'no_subtitle',
          message: 'No se pudo leer el subtitulo.',
        });
      }

      // Samsung pide SRT por sec:CaptionInfoEx; los receptores Cast piden VTT.
      // Se sirve cada uno en su formato en vez de forzar un unico camino.
      if (quiereSrt) {
        if (esVtt(contenido)) {
          return reply.code(404).send({
            error: 'no_srt',
            message: 'El subtitulo encontrado esta en WebVTT y este televisor pide SRT.',
          });
        }
        return reply
          .header('Content-Type', 'application/x-subrip; charset=utf-8')
          .header('Access-Control-Allow-Origin', '*')
          .send(contenido);
      }

      return reply
        .header('Content-Type', 'text/vtt; charset=utf-8')
        .header('Access-Control-Allow-Origin', '*')
        .send(esVtt(contenido) ? contenido : srtToVtt(contenido));
    },
  );
}

/**
 * Sirve el archivo recodificado en vivo, arrancando en un segundo dado.
 *
 * Esta es la parte donde adelantar el video deja de ser exacto: el contenido se
 * genera sobre la marcha, no hay un archivo con posiciones conocidas, y la
 * unica forma de saltar es relanzar ffmpeg desde otro punto. La barra de
 * progreso del televisor va a quedar desfasada. Es un compromiso consciente:
 * la alternativa era no poder reproducir el archivo en absoluto.
 */
function servirConversion(
  reply: FastifyReply,
  ruta: string,
  contentTypeOriginal: string,
  desdeSegundos: number,
  soloCabeceras: boolean,
): FastifyReply {
  reply
    .headers({
      'Content-Type': 'video/mp4',
      // Sin longitud conocida y sin rangos: el contenido se genera en vivo.
      'Accept-Ranges': 'none',
      'transferMode.dlna.org': 'Streaming',
      'Cache-Control': 'no-store',
    })
    .code(200);

  if (soloCabeceras) return reply.send();

  logger.info({ ruta, desdeSegundos, contentTypeOriginal }, 'Recodificando en vivo');

  const ffmpeg = spawn('ffmpeg', [
    // -ss ANTES de -i hace la busqueda por keyframes: mucho mas rapido, a costa
    // de caer en el keyframe mas cercano en vez del segundo exacto.
    '-ss', String(desdeSegundos),
    '-i', ruta,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
    // frag_keyframe + empty_moov permiten reproducir un MP4 mientras se genera:
    // sin eso, el indice va al final y el televisor espera para siempre.
    '-movflags', 'frag_keyframe+empty_moov+faststart',
    '-f', 'mp4',
    'pipe:1',
  ]);

  ffmpeg.stderr.on('data', (d: Buffer) => {
    logger.debug({ ffmpeg: d.toString().trim().slice(0, 500) }, 'salida de ffmpeg');
  });

  ffmpeg.on('error', (err) => {
    logger.error({ err }, 'No se pudo ejecutar ffmpeg');
    ffmpeg.stdout.destroy();
  });

  // Si el televisor corta, hay que matar ffmpeg: si no, sigue quemando CPU
  // generando un video que nadie mira.
  reply.raw.on('close', () => {
    if (!ffmpeg.killed) ffmpeg.kill('SIGKILL');
  });

  return reply.send(ffmpeg.stdout);
}
