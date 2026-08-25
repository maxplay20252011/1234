import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '../logger.js';

const ALGORITMO = 'aes-256-gcm';
const SAL = 'tv-remote/v1';

export type Cifrado = { ciphertext: Buffer; iv: Buffer; tag: Buffer };

/**
 * Cifrado de los tokens de emparejamiento.
 *
 * Alcance honesto de lo que protege: la clave vive en la misma maquina que la
 * base, asi que esto NO defiende de alguien con acceso a esa maquina. Sirve
 * para que el token no quede legible si el archivo .db termina en un backup, en
 * un repositorio o en un adjunto por error, que es como se filtran de verdad.
 */
export function deriveKey(secret: string): Buffer {
  return scryptSync(secret, SAL, 32);
}

/**
 * Devuelve la clave de ENCRYPTION_KEY, o genera una y la guarda en data/.
 * Se genera sola para que el usuario no tenga que inventar una clave a mano,
 * que es como termina apareciendo "1234" en produccion.
 */
export function loadOrCreateSecret(dataDir: string, fromEnv: string): string {
  if (fromEnv.trim().length > 0) return fromEnv.trim();

  const archivo = join(dataDir, '.encryption-key');
  if (existsSync(archivo)) return readFileSync(archivo, 'utf8').trim();

  const generada = randomBytes(32).toString('hex');
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(archivo, generada, { encoding: 'utf8', mode: 0o600 });
  try {
    chmodSync(archivo, 0o600);
  } catch {
    // Windows no siempre respeta los permisos POSIX. No es fatal.
  }
  logger.info(
    'Se genero una clave de cifrado en data/.encryption-key. No la subas a ningun repositorio.',
  );
  return generada;
}

export function encrypt(key: Buffer, plaintext: string): Cifrado {
  // IV de 12 bytes: es el tamanio recomendado para GCM y nunca se reutiliza.
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITMO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag() };
}

/** Lanza si el dato fue alterado: GCM verifica la integridad, no solo cifra. */
export function decrypt(key: Buffer, datos: Cifrado): string {
  const decipher = createDecipheriv(ALGORITMO, key, datos.iv);
  decipher.setAuthTag(datos.tag);
  return Buffer.concat([decipher.update(datos.ciphertext), decipher.final()]).toString('utf8');
}
