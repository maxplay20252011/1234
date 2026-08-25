import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Enlaces efimeros para los archivos.
 *
 * El MediaServer expone archivos del disco a toda la red local, asi que los
 * enlaces caducan: si alguien copia una URL, deja de servir sola. No es una
 * defensa contra un atacante dentro de la red (mientras el enlace vive, funciona
 * para cualquiera), sino contra dejar el disco expuesto indefinidamente.
 */

const SEPARADOR = '.';

export function signMediaToken(secret: string, id: string, expiresAtEpochSec: number): string {
  const firma = createHmac('sha256', secret)
    .update(`${id}${SEPARADOR}${expiresAtEpochSec}`)
    .digest('base64url');
  return `${expiresAtEpochSec}${SEPARADOR}${firma}`;
}

export function createMediaToken(secret: string, id: string, ttlSeconds: number): string {
  return signMediaToken(secret, id, Math.floor(Date.now() / 1000) + ttlSeconds);
}

export type TokenResult = 'ok' | 'expired' | 'invalid';

/**
 * Verifica un token.
 *
 * La comparacion es de tiempo constante: comparar firmas con === filtra, por el
 * tiempo que tarda, cuantos caracteres coincidieron.
 */
export function verifyMediaToken(
  secret: string,
  id: string,
  token: string | undefined,
  nowEpochSec = Math.floor(Date.now() / 1000),
): TokenResult {
  if (!token) return 'invalid';

  const corte = token.indexOf(SEPARADOR);
  if (corte <= 0) return 'invalid';

  const exp = Number(token.slice(0, corte));
  if (!Number.isInteger(exp)) return 'invalid';

  const esperado = signMediaToken(secret, id, exp);
  const a = Buffer.from(token);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return 'invalid';

  // La caducidad se verifica DESPUES de la firma: si no, un token con firma
  // invalida pero caducado revelaria que la fecha era legible.
  return exp < nowEpochSec ? 'expired' : 'ok';
}
