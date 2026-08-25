/**
 * Conversion de SRT a WebVTT.
 *
 * Los televisores y los receptores Cast no leen SRT: piden WebVTT. Los dos
 * formatos son casi iguales, pero las diferencias son suficientes para que un
 * SRT servido tal cual se ignore sin dar ningun error.
 */

/**
 * Convierte un subtitulo SRT a WebVTT.
 *
 * Diferencias que hay que salvar:
 *  - WebVTT necesita la linea "WEBVTT" al principio o se descarta entero.
 *  - Los milisegundos van con punto, no con coma.
 *  - Las horas son opcionales en WebVTT pero obligatorias en SRT; se dejan.
 *  - El BOM de UTF-8 al inicio rompe la deteccion de la cabecera.
 */
export function srtToVtt(srt: string): string {
  const sinBom = srt.replace(/^﻿/, '');
  const normalizado = sinBom.replace(/\r\n?/g, '\n');

  const convertido = normalizado
    // 00:00:01,000 --> 00:00:04,000  se vuelve  00:00:01.000 --> 00:00:04.000
    .replace(
      /(\d{1,2}:\d{2}:\d{2}),(\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}),(\d{1,3})/g,
      (_m, ini: string, msIni: string, fin: string, msFin: string) =>
        `${ini}.${msIni.padEnd(3, '0')} --> ${fin}.${msFin.padEnd(3, '0')}`,
    );

  return `WEBVTT\n\n${convertido.trim()}\n`;
}

/** true si el contenido ya es WebVTT y no hay que tocarlo. */
export function esVtt(contenido: string): boolean {
  return contenido.replace(/^﻿/, '').trimStart().startsWith('WEBVTT');
}

/**
 * Nombres de archivo de subtitulo que acompanian a un video.
 * Se prueban en orden: primero el nombre exacto, despues las variantes de
 * idioma que usan los sitios de descarga.
 */
export function subtitleCandidates(videoFileName: string): string[] {
  const base = videoFileName.replace(/\.[^.]+$/, '');
  const sufijos = ['', '.es', '.spa', '.spanish', '.en', '.eng', '.forced'];
  const extensiones = ['.srt', '.vtt'];
  const nombres: string[] = [];
  for (const ext of extensiones) {
    for (const sufijo of sufijos) nombres.push(`${base}${sufijo}${ext}`);
  }
  return nombres;
}
