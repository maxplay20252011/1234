import { describe, it, expect } from 'vitest';
import { X509Certificate, createPrivateKey } from 'node:crypto';
import { generateClientCertificate, publicKeyParts } from './certificate.js';
import { encodeLength, oid, integer } from './asn1.js';

describe('generateClientCertificate', () => {
  // Generar RSA de 2048 bits tarda; se hace una sola vez para todo el bloque.
  const cert = generateClientCertificate('tv-remote-test', 30);

  it('produce un certificado que Node puede parsear de verdad', () => {
    // Es la verificacion que importa: si el DER estuviera mal construido,
    // X509Certificate lanzaria. No alcanza con que "parezca" un PEM.
    const parsed = new X509Certificate(cert.certificatePem);
    expect(parsed.subject).toContain('tv-remote-test');
  });

  it('es autofirmado: emisor y sujeto coinciden', () => {
    const parsed = new X509Certificate(cert.certificatePem);
    expect(parsed.issuer).toBe(parsed.subject);
  });

  it('la clave privada se puede cargar', () => {
    expect(() => createPrivateKey(cert.privateKeyPem)).not.toThrow();
  });

  it('la firma verifica contra su propia clave publica', () => {
    const parsed = new X509Certificate(cert.certificatePem);
    expect(parsed.verify(parsed.publicKey)).toBe(true);
  });

  it('vale desde ahora y por los dias pedidos', () => {
    const parsed = new X509Certificate(cert.certificatePem);
    const desde = new Date(parsed.validFrom).getTime();
    const hasta = new Date(parsed.validTo).getTime();
    const dias = (hasta - desde) / (24 * 60 * 60 * 1000);
    expect(dias).toBeGreaterThan(29);
    expect(dias).toBeLessThan(31);
    expect(desde).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('cada certificado tiene un numero de serie distinto', () => {
    const otro = generateClientCertificate('otro', 30);
    expect(new X509Certificate(cert.certificatePem).serialNumber).not.toBe(
      new X509Certificate(otro.certificatePem).serialNumber,
    );
  });
});

describe('publicKeyParts', () => {
  const cert = generateClientCertificate('partes', 30);

  it('devuelve un modulo de 2048 bits sin ceros a la izquierda', () => {
    const { modulus, exponent } = publicKeyParts(cert.certificatePem);
    expect(modulus).toHaveLength(256);
    // Sin el cero de signo que agrega DER: el hash del emparejamiento lo quiere
    // asi, y un byte de mas cambia el resultado entero.
    expect(modulus[0]).not.toBe(0x00);
    // 65537, el exponente habitual.
    expect([...exponent]).toEqual([0x01, 0x00, 0x01]);
  });
});

describe('codificacion DER', () => {
  it('usa un byte para longitudes cortas y forma larga para el resto', () => {
    expect([...encodeLength(10)]).toEqual([10]);
    expect([...encodeLength(127)]).toEqual([127]);
    expect([...encodeLength(128)]).toEqual([0x81, 128]);
    expect([...encodeLength(300)]).toEqual([0x82, 0x01, 0x2c]);
  });

  it('codifica los OID combinando los dos primeros componentes', () => {
    // sha256WithRSAEncryption. 40*1+2 = 42 = 0x2a.
    expect([...oid('1.2.840.113549.1.1.11')]).toEqual([
      0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b,
    ]);
    // commonName: 40*2+5 = 85 = 0x55.
    expect([...oid('2.5.4.3')]).toEqual([0x06, 0x03, 0x55, 0x04, 0x03]);
  });

  it('antepone 0x00 cuando el entero tendria el bit de signo prendido', () => {
    // Sin esto, DER lo leeria como negativo y el certificado seria invalido.
    expect([...integer(Buffer.from([0xff, 0x01]))]).toEqual([0x02, 0x03, 0x00, 0xff, 0x01]);
    expect([...integer(Buffer.from([0x7f, 0x01]))]).toEqual([0x02, 0x02, 0x7f, 0x01]);
  });
});
