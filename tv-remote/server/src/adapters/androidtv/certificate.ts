import { createSign, generateKeyPairSync, randomBytes, X509Certificate } from 'node:crypto';
import {
  bitString,
  contextExplicit,
  integer,
  nullValue,
  oid,
  sequence,
  set,
  utcTime,
  utf8String,
} from './asn1.js';

export type ClientCertificate = {
  /** PEM de la clave privada. Se guarda cifrada junto a las credenciales. */
  privateKeyPem: string;
  certificatePem: string;
};

const OID_SHA256_RSA = '1.2.840.113549.1.1.11';
const OID_COMMON_NAME = '2.5.4.3';

/**
 * Genera un certificado autofirmado para hablar con un Android TV.
 *
 * androidtvremote2 exige certificado de cliente: durante el emparejamiento, el
 * televisor guarda el nuestro y despues solo acepta conexiones que lo
 * presenten. Es la credencial del emparejamiento; si se pierde hay que volver
 * a emparejar.
 *
 * Se construye a mano porque Node no tiene API para crear certificados, y las
 * alternativas eran peores: node-forge es una dependencia grande, y exigir
 * openssl instalado deja afuera a casi cualquier Windows.
 */
export function generateClientCertificate(
  commonName = 'tv-remote',
  validityDays = 3650,
): ClientCertificate {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

  const spki = publicKey.export({ type: 'spki', format: 'der' });
  const algoritmoFirma = sequence(oid(OID_SHA256_RSA), nullValue());
  const nombre = sequence(set(sequence(oid(OID_COMMON_NAME), utf8String(commonName))));

  const desde = new Date();
  const hasta = new Date(desde.getTime() + validityDays * 24 * 60 * 60 * 1000);

  const tbs = sequence(
    // [0] EXPLICIT version; 2 significa v3.
    contextExplicit(0, integer(2)),
    integer(randomBytes(16)),
    algoritmoFirma,
    nombre, // Emisor: como es autofirmado, coincide con el sujeto.
    sequence(utcTime(desde), utcTime(hasta)),
    nombre,
    spki,
  );

  const firma = createSign('RSA-SHA256').update(tbs).sign(privateKey);
  const certificado = sequence(tbs, algoritmoFirma, bitString(firma));

  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    certificatePem: derToPem(certificado, 'CERTIFICATE'),
  };
}

export function derToPem(der: Buffer, etiqueta: string): string {
  const base64 = der.toString('base64');
  const lineas = base64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${etiqueta}-----\n${lineas.join('\n')}\n-----END ${etiqueta}-----\n`;
}

/**
 * Extrae modulo y exponente de la clave publica de un certificado.
 *
 * El emparejamiento los necesita: el codigo que muestra el televisor se
 * verifica calculando un hash sobre las claves de las dos puntas.
 */
export function publicKeyParts(certificatePem: string): { modulus: Buffer; exponent: Buffer } {
  const cert = new X509Certificate(certificatePem);
  const jwk = cert.publicKey.export({ format: 'jwk' }) as { n?: string; e?: string };
  if (!jwk.n || !jwk.e) throw new Error('El certificado no tiene una clave RSA utilizable');

  return {
    // JWK trae el modulo sin ceros a la izquierda, que es justo lo que se
    // necesita para el hash del emparejamiento.
    modulus: Buffer.from(jwk.n, 'base64url'),
    exponent: Buffer.from(jwk.e, 'base64url'),
  };
}
