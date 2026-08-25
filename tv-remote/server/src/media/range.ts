/**
 * Peticiones de rango de HTTP (RFC 7233).
 *
 * Sin esto los televisores no pueden adelantar el video, y muchos directamente
 * no arrancan: piden los primeros bytes para leer la cabecera del archivo, y si
 * el servidor les manda el archivo entero se cuelgan.
 */

export type ParsedRange =
  | { start: number; end: number }
  /** El rango pedido no existe dentro del archivo: hay que responder 416. */
  | 'unsatisfiable'
  /** Sin rango, o rango que no entendemos: se responde el archivo completo. */
  | null;

/**
 * Interpreta la cabecera Range contra el tamanio real del archivo.
 *
 * Solo se admite UN rango. Los pedidos de varios rangos a la vez requeririan
 * una respuesta multipart que ningun televisor pide; se responde el archivo
 * completo, que siempre es valido.
 */
export function parseRange(header: string | undefined, size: number): ParsedRange {
  if (!header) return null;

  const limpio = header.trim();
  if (!limpio.toLowerCase().startsWith('bytes=')) return null;

  const spec = limpio.slice(6).trim();
  // Varios rangos: no los soportamos, se cae al archivo completo.
  if (spec.includes(',')) return null;

  const guion = spec.indexOf('-');
  if (guion < 0) return null;

  const textoInicio = spec.slice(0, guion).trim();
  const textoFin = spec.slice(guion + 1).trim();

  // Un archivo vacio no puede satisfacer ningun rango.
  if (size <= 0) return 'unsatisfiable';

  // Forma "-N": los ultimos N bytes.
  if (textoInicio === '') {
    if (textoFin === '') return null;
    const ultimos = Number(textoFin);
    if (!Number.isInteger(ultimos) || ultimos < 0) return null;
    if (ultimos === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - ultimos), end: size - 1 };
  }

  const start = Number(textoInicio);
  if (!Number.isInteger(start) || start < 0) return null;
  if (start >= size) return 'unsatisfiable';

  // Forma "S-": desde S hasta el final.
  if (textoFin === '') return { start, end: size - 1 };

  const finPedido = Number(textoFin);
  if (!Number.isInteger(finPedido) || finPedido < 0) return null;
  if (finPedido < start) return 'unsatisfiable';

  // Un fin mas alla del archivo se recorta, no es un error.
  return { start, end: Math.min(finPedido, size - 1) };
}

export function contentRangeHeader(range: { start: number; end: number }, size: number): string {
  return `bytes ${range.start}-${range.end}/${size}`;
}

/** Cabecera para el 416: le dice al cliente cual es el tamanio real. */
export function unsatisfiableHeader(size: number): string {
  return `bytes */${size}`;
}
