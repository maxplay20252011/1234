/**
 * Tipos MIME por extension.
 *
 * El televisor elige el decodificador segun el Content-Type que le mandamos.
 * Si mandamos application/octet-stream, muchos ni intentan reproducir.
 */
const TIPOS: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.ts': 'video/mp2t',
  '.m2ts': 'video/mp2t',
  '.mpg': 'video/mpeg',
  '.mpeg': 'video/mpeg',
  '.m3u8': 'application/x-mpegurl',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.srt': 'application/x-subrip',
  '.vtt': 'text/vtt',
};

export const VIDEO_EXTENSIONS = [
  '.mp4', '.m4v', '.mov', '.mkv', '.webm', '.avi', '.ts', '.m2ts', '.mpg', '.mpeg',
] as const;

export const AUDIO_EXTENSIONS = [
  '.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.opus',
] as const;

export function contentTypeFor(fileName: string): string {
  const punto = fileName.lastIndexOf('.');
  if (punto < 0) return 'application/octet-stream';
  return TIPOS[fileName.slice(punto).toLowerCase()] ?? 'application/octet-stream';
}

export function esReproducible(fileName: string): boolean {
  const punto = fileName.lastIndexOf('.');
  if (punto < 0) return false;
  const ext = fileName.slice(punto).toLowerCase();
  return (
    (VIDEO_EXTENSIONS as readonly string[]).includes(ext) ||
    (AUDIO_EXTENSIONS as readonly string[]).includes(ext)
  );
}
