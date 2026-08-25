import { describe, it, expect } from 'vitest';
import { deriveKey, encrypt, decrypt } from './crypto.js';

const clave = deriveKey('una-clave-de-prueba');

describe('cifrado de credenciales', () => {
  it('recupera el texto original', () => {
    const token = JSON.stringify({ token: '12345678' });
    expect(decrypt(clave, encrypt(clave, token))).toBe(token);
  });

  it('produce un cifrado distinto cada vez con el mismo texto', () => {
    // El IV es aleatorio, asi que dos tokens iguales no se ven iguales en la
    // base. Si no, se podria deducir que dos televisores comparten credencial.
    const a = encrypt(clave, 'mismo-token');
    const b = encrypt(clave, 'mismo-token');
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect(a.iv.equals(b.iv)).toBe(false);
  });

  it('falla si alguien altero el dato cifrado', () => {
    // GCM autentica ademas de cifrar: un byte cambiado tiene que romper.
    const cifrado = encrypt(clave, 'token');
    cifrado.ciphertext[0] = (cifrado.ciphertext[0] ?? 0) ^ 0xff;
    expect(() => decrypt(clave, cifrado)).toThrow();
  });

  it('falla si alguien altero la etiqueta de autenticacion', () => {
    const cifrado = encrypt(clave, 'token');
    cifrado.tag[0] = (cifrado.tag[0] ?? 0) ^ 0xff;
    expect(() => decrypt(clave, cifrado)).toThrow();
  });

  it('falla con otra clave, en vez de devolver basura', () => {
    const cifrado = encrypt(clave, 'token');
    expect(() => decrypt(deriveKey('otra-clave'), cifrado)).toThrow();
  });

  it('deriva siempre la misma clave del mismo secreto', () => {
    expect(deriveKey('abc').equals(deriveKey('abc'))).toBe(true);
    expect(deriveKey('abc').equals(deriveKey('abd'))).toBe(false);
  });
});
