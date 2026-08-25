import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { extname } from 'node:path';
import { logger } from '../logger.js';

const exec = promisify(execFile);

export type StreamInfo = {
  type: 'video' | 'audio' | 'subtitle' | 'other';
  codec: string;
  /** Formato de pixel, p.ej. yuv420p o yuv420p10le. Delata los 10 bits. */
  pixelFormat?: string;
  profile?: string;
  language?: string;
  channels?: number;
};

export type MediaInfo = {
  durationSeconds?: number;
  container?: string;
  streams: StreamInfo[];
};

/** Que hacer con el archivo antes de mandarlo al televisor. */
export type Plan = 'direct' | 'remux' | 'transcode' | 'unknown';

export type Compatibility = {
  plan: Plan;
  /** Explicaciones en castellano, listas para mostrar. */
  reasons: string[];
  /** Advertencia visible cuando el plan cuesta CPU. */
  warning?: string;
};

let ffmpegDisponible: boolean | undefined;

/** Comprueba una sola vez si estan ffmpeg y ffprobe en el sistema. */
export async function hasFfmpeg(): Promise<boolean> {
  if (ffmpegDisponible !== undefined) return ffmpegDisponible;
  try {
    await Promise.all([
      exec('ffprobe', ['-version'], { timeout: 5000 }),
      exec('ffmpeg', ['-version'], { timeout: 5000 }),
    ]);
    ffmpegDisponible = true;
  } catch {
    ffmpegDisponible = false;
    logger.info(
      'ffmpeg no esta instalado: los archivos se sirven tal cual, sin analisis de codec ni conversion.',
    );
  }
  return ffmpegDisponible;
}

/** Solo para tests: olvida el resultado cacheado. */
export function resetFfmpegCache(): void {
  ffmpegDisponible = undefined;
}

export async function probeFile(path: string): Promise<MediaInfo | undefined> {
  if (!(await hasFfmpeg())) return undefined;
  try {
    const { stdout } = await exec(
      'ffprobe',
      ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', path],
      { timeout: 20_000, maxBuffer: 8 * 1024 * 1024 },
    );
    return parseFfprobeOutput(stdout);
  } catch (err) {
    logger.debug({ err, path }, 'ffprobe no pudo analizar el archivo');
    return undefined;
  }
}

export function parseFfprobeOutput(json: string): MediaInfo | undefined {
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (typeof doc !== 'object' || doc === null) return undefined;
  const raiz = doc as Record<string, unknown>;

  const info: MediaInfo = { streams: [] };

  const format = raiz['format'];
  if (typeof format === 'object' && format !== null) {
    const f = format as Record<string, unknown>;
    const duracion = Number(f['duration']);
    if (Number.isFinite(duracion)) info.durationSeconds = duracion;
    if (typeof f['format_name'] === 'string') info.container = f['format_name'];
  }

  const streams = raiz['streams'];
  if (Array.isArray(streams)) {
    for (const item of streams) {
      if (typeof item !== 'object' || item === null) continue;
      const s = item as Record<string, unknown>;
      const tipo = s['codec_type'];
      const stream: StreamInfo = {
        type:
          tipo === 'video' || tipo === 'audio' || tipo === 'subtitle'
            ? tipo
            : 'other',
        codec: typeof s['codec_name'] === 'string' ? s['codec_name'] : 'desconocido',
      };
      if (typeof s['pix_fmt'] === 'string') stream.pixelFormat = s['pix_fmt'];
      if (typeof s['profile'] === 'string') stream.profile = s['profile'];
      if (typeof s['channels'] === 'number') stream.channels = s['channels'];

      const tags = s['tags'];
      if (typeof tags === 'object' && tags !== null) {
        const lang = (tags as Record<string, unknown>)['language'];
        if (typeof lang === 'string') stream.language = lang;
      }
      info.streams.push(stream);
    }
  }

  return info;
}

/** Contenedores que cualquier televisor acepta sin chistar. */
const CONTENEDORES_SEGUROS = ['.mp4', '.m4v', '.mov'];
const VIDEO_SEGURO = ['h264', 'avc1', 'mpeg4'];
const AUDIO_SEGURO = ['aac', 'mp3'];
/** Se decodifican en muchos televisores modernos, pero no en todos. */
const AUDIO_RIESGOSO = ['ac3', 'eac3', 'dts', 'truehd', 'flac', 'opus', 'vorbis'];

/**
 * Decide que hacer con un archivo.
 *
 * Es una heuristica, no una certeza: el unico juez real es el televisor. Se
 * eligio pecar de conservador, porque un archivo servido directo que no se ve
 * deja al usuario sin ninguna pista, mientras que una conversion innecesaria
 * solo cuesta CPU.
 */
export function evaluateCompatibility(fileName: string, info: MediaInfo | undefined): Compatibility {
  if (!info) {
    return {
      plan: 'unknown',
      reasons: [
        'No se pudo analizar el archivo (ffmpeg no esta instalado). Se envia tal cual.',
      ],
    };
  }

  const ext = extname(fileName).toLowerCase();
  const contenedorSeguro = CONTENEDORES_SEGUROS.includes(ext);
  const razones: string[] = [];

  const video = info.streams.find((s) => s.type === 'video');
  const audio = info.streams.find((s) => s.type === 'audio');

  let videoOk = true;
  if (video) {
    const codec = video.codec.toLowerCase();
    const diezBits = video.pixelFormat?.includes('10le') || video.pixelFormat?.includes('10be');

    if (diezBits) {
      videoOk = false;
      razones.push(`El video es de 10 bits (${video.pixelFormat}), que muchos televisores no decodifican.`);
    } else if (VIDEO_SEGURO.includes(codec)) {
      razones.push(`Video en ${codec}: compatible con casi todo.`);
    } else if (codec === 'hevc' || codec === 'h265') {
      videoOk = false;
      razones.push('Video en HEVC (H.265): algunos televisores lo reproducen y otros no.');
    } else {
      videoOk = false;
      razones.push(`Video en ${codec}: poco habitual, puede no reproducirse.`);
    }
  }

  let audioOk = true;
  if (audio) {
    const codec = audio.codec.toLowerCase();
    if (AUDIO_SEGURO.includes(codec)) {
      razones.push(`Audio en ${codec}: compatible.`);
    } else if (AUDIO_RIESGOSO.includes(codec)) {
      audioOk = false;
      razones.push(`Audio en ${codec}: es probable que se vea la imagen pero no se escuche nada.`);
    } else {
      audioOk = false;
      razones.push(`Audio en ${codec}: poco habitual, puede no escucharse.`);
    }
  }

  if (videoOk && audioOk && contenedorSeguro) {
    razones.push('Se envia tal cual, sin convertir: vas a poder adelantar y retroceder con precision.');
    return { plan: 'direct', reasons: razones };
  }

  // Si los codecs sirven y solo molesta el envase, alcanza con recontenerizar:
  // es copiar, no recodificar, asi que es rapido y no pierde calidad.
  if (videoOk && audioOk && !contenedorSeguro) {
    razones.push(`El envase ${ext} no lo aceptan todos los televisores, pero los codecs si.`);
    return {
      plan: 'remux',
      reasons: razones,
      warning:
        'Se va a recontenerizar sin recodificar: es rapido y no pierde calidad, pero adelantar el video va a ser aproximado.',
    };
  }

  return {
    plan: 'transcode',
    reasons: razones,
    warning:
      'Hay que recodificar, lo que consume bastante CPU y puede entrecortarse en equipos lentos. Adelantar el video va a ser aproximado.',
  };
}
