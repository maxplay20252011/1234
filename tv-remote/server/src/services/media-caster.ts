import { basename } from 'node:path';
import { contentTypeFor } from '../media/mime.js';
import { createMediaToken } from '../media/tokens.js';
import { evaluateCompatibility, probeFile, type Compatibility } from '../media/probe.js';
import { subtitleCandidates } from '../media/subtitles.js';
import type { MediaLibrary } from '../media/library.js';
import { primaryLanAddress } from '../net/interfaces.js';
import { logger } from '../logger.js';

export type PreparedMedia = {
  /** URL que va a pedir el televisor. Siempre con IP de la red local. */
  url: string;
  subtitleVttUrl?: string;
  subtitleSrtUrl?: string;
  title: string;
  contentType: string;
  durationSeconds?: number;
  compatibility: Compatibility;
};

/**
 * Prepara un archivo local para mandarselo a un televisor.
 *
 * El televisor no lee el disco del servidor: va a buscar el archivo por HTTP a
 * la direccion que le pasemos. Por eso la URL se construye con la IP real de la
 * red local; con localhost o 127.0.0.1 el televisor se estaria buscando a si
 * mismo y no encontraria nada.
 */
export class MediaCaster {
  constructor(
    private readonly library: MediaLibrary,
    private readonly secret: string,
    private readonly port: number,
    private readonly linkTtlSeconds: number,
  ) {}

  /** Direccion base con la que el televisor puede alcanzarnos. */
  baseUrl(): string | undefined {
    const ip = primaryLanAddress();
    return ip ? `http://${ip}:${this.port}` : undefined;
  }

  async prepare(fileId: string, startSeconds = 0): Promise<PreparedMedia | undefined> {
    const ruta = this.library.pathFor(fileId);
    if (!ruta) return undefined;

    const base = this.baseUrl();
    if (!base) {
      logger.warn('No se detecto una IP de red local: no se puede armar la URL para el televisor.');
      return undefined;
    }

    const info = await probeFile(ruta);
    const compatibility = evaluateCompatibility(ruta, info);
    const token = createMediaToken(this.secret, fileId, this.linkTtlSeconds);

    const parametros = new URLSearchParams({ t: token });
    // Solo se pide conversion cuando el analisis dice que hace falta. En
    // 'direct' y en 'unknown' se sirve el archivo tal cual, con rangos, y
    // adelantar el video funciona con precision.
    if (compatibility.plan === 'transcode' || compatibility.plan === 'remux') {
      parametros.set('mode', 'transcode');
      if (startSeconds > 0) parametros.set('start', String(Math.floor(startSeconds)));
    }

    const preparado: PreparedMedia = {
      url: `${base}/media/${fileId}?${parametros.toString()}`,
      title: basename(ruta),
      contentType:
        compatibility.plan === 'transcode' || compatibility.plan === 'remux'
          ? 'video/mp4'
          : contentTypeFor(ruta),
      compatibility,
    };
    if (info?.durationSeconds !== undefined) preparado.durationSeconds = info.durationSeconds;

    const subtitulo = await this.library.findSubtitle(ruta, subtitleCandidates(basename(ruta)));
    if (subtitulo) {
      const t = new URLSearchParams({ t: token }).toString();
      preparado.subtitleVttUrl = `${base}/media/${fileId}/subs.vtt?${t}`;
      if (subtitulo.toLowerCase().endsWith('.srt')) {
        preparado.subtitleSrtUrl = `${base}/media/${fileId}/subs.srt?${t}`;
      }
    }

    return preparado;
  }
}
