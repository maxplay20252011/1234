import { describe, it, expect } from 'vitest';
import { parseRange, contentRangeHeader, unsatisfiableHeader } from './range.js';

const TAMANIO = 1000;

describe('parseRange', () => {
  it('devuelve null sin cabecera: hay que responder el archivo entero', () => {
    expect(parseRange(undefined, TAMANIO)).toBeNull();
    expect(parseRange('', TAMANIO)).toBeNull();
  });

  it('interpreta un rango completo', () => {
    expect(parseRange('bytes=0-499', TAMANIO)).toEqual({ start: 0, end: 499 });
    expect(parseRange('bytes=500-999', TAMANIO)).toEqual({ start: 500, end: 999 });
  });

  it('interpreta "desde N hasta el final", que es lo que piden los TVs al arrancar', () => {
    expect(parseRange('bytes=0-', TAMANIO)).toEqual({ start: 0, end: 999 });
    expect(parseRange('bytes=900-', TAMANIO)).toEqual({ start: 900, end: 999 });
  });

  it('interpreta el sufijo "-N": los ultimos N bytes', () => {
    // Los televisores lo usan para leer el indice de un MP4, que va al final.
    expect(parseRange('bytes=-500', TAMANIO)).toEqual({ start: 500, end: 999 });
    expect(parseRange('bytes=-1', TAMANIO)).toEqual({ start: 999, end: 999 });
  });

  it('recorta un fin mas alla del archivo en vez de fallar', () => {
    // Lo exige el RFC, y varios televisores piden de mas a proposito.
    expect(parseRange('bytes=0-99999', TAMANIO)).toEqual({ start: 0, end: 999 });
  });

  it('recorta un sufijo mas grande que el archivo', () => {
    expect(parseRange('bytes=-99999', TAMANIO)).toEqual({ start: 0, end: 999 });
  });

  it('marca como no satisfacible lo que cae fuera del archivo', () => {
    expect(parseRange('bytes=1000-', TAMANIO)).toBe('unsatisfiable');
    expect(parseRange('bytes=5000-6000', TAMANIO)).toBe('unsatisfiable');
    expect(parseRange('bytes=500-100', TAMANIO)).toBe('unsatisfiable');
    expect(parseRange('bytes=-0', TAMANIO)).toBe('unsatisfiable');
  });

  it('ningun rango sirve en un archivo vacio', () => {
    expect(parseRange('bytes=0-', 0)).toBe('unsatisfiable');
  });

  it('cae al archivo completo cuando piden varios rangos', () => {
    // Requeriria una respuesta multipart que ningun televisor pide.
    expect(parseRange('bytes=0-50, 100-150', TAMANIO)).toBeNull();
  });

  it('ignora unidades que no sean bytes', () => {
    expect(parseRange('items=0-10', TAMANIO)).toBeNull();
  });

  it('no se rompe con basura', () => {
    expect(parseRange('bytes=abc-def', TAMANIO)).toBeNull();
    expect(parseRange('bytes=', TAMANIO)).toBeNull();
    expect(parseRange('bytes=-', TAMANIO)).toBeNull();
    expect(parseRange('bytes=1.5-3', TAMANIO)).toBeNull();
    expect(parseRange('bytes=-5-10', TAMANIO)).toBeNull();
  });

  it('acepta espacios y mayusculas, que algunos clientes mandan', () => {
    expect(parseRange('  BYTES=0-99  ', TAMANIO)).toEqual({ start: 0, end: 99 });
  });
});

describe('cabeceras', () => {
  it('arma el Content-Range del 206', () => {
    expect(contentRangeHeader({ start: 0, end: 499 }, 1000)).toBe('bytes 0-499/1000');
  });

  it('arma el Content-Range del 416, que informa el tamanio real', () => {
    expect(unsatisfiableHeader(1000)).toBe('bytes */1000');
  });
});
