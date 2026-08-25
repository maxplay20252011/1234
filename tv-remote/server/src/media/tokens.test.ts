import { describe, it, expect } from 'vitest';
import { createMediaToken, signMediaToken, verifyMediaToken } from './tokens.js';

const SECRETO = 'un-secreto-de-prueba';
const ID = 'abc123';

describe('tokens de media', () => {
  it('acepta un token recien creado', () => {
    expect(verifyMediaToken(SECRETO, ID, createMediaToken(SECRETO, ID, 3600))).toBe('ok');
  });

  it('rechaza un token vencido', () => {
    const vencido = signMediaToken(SECRETO, ID, 1000);
    expect(verifyMediaToken(SECRETO, ID, vencido, 2000)).toBe('expired');
  });

  it('rechaza un token de OTRO archivo', () => {
    // Sin esto, un enlace valido para un video serviria para leer cualquier otro.
    const token = createMediaToken(SECRETO, 'archivo-uno', 3600);
    expect(verifyMediaToken(SECRETO, 'archivo-dos', token)).toBe('invalid');
  });

  it('rechaza un token firmado con otra clave', () => {
    const token = createMediaToken('otra-clave', ID, 3600);
    expect(verifyMediaToken(SECRETO, ID, token)).toBe('invalid');
  });

  it('rechaza un token manipulado para durar mas', () => {
    // El caso obvio de ataque: cambiar la fecha del token. La firma la cubre.
    const original = signMediaToken(SECRETO, ID, 1000);
    const firma = original.slice(original.indexOf('.') + 1);
    const manipulado = `99999999999.${firma}`;
    expect(verifyMediaToken(SECRETO, ID, manipulado, 2000)).toBe('invalid');
  });

  it('rechaza basura y ausencia', () => {
    expect(verifyMediaToken(SECRETO, ID, undefined)).toBe('invalid');
    expect(verifyMediaToken(SECRETO, ID, '')).toBe('invalid');
    expect(verifyMediaToken(SECRETO, ID, 'sinpunto')).toBe('invalid');
    expect(verifyMediaToken(SECRETO, ID, '.abc')).toBe('invalid');
    expect(verifyMediaToken(SECRETO, ID, 'noesnumero.abc')).toBe('invalid');
  });
});
