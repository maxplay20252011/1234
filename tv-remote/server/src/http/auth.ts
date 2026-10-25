import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { RateLimiter } from './rate-limit.js';
import { logger } from '../logger.js';

const COOKIE = 'tv_remote_session';
const SESSION_TTL_DAYS = 30;

/**
 * Autenticacion por PIN con sesion en cookie.
 *
 * Opcional y apagada por defecto: dentro de tu casa no hace falta. Se vuelve
 * obligatoria en cuanto el servidor sea alcanzable desde afuera, porque sin
 * ella cualquiera que de con la direccion controla los televisores Y puede
 * navegar y descargar los archivos de MEDIA_DIRS.
 *
 * Decision importante: la autenticacion NO se aplica a /media/*. Esas URLs las
 * pide el TELEVISOR, que no tiene cookies ni forma de iniciar sesion. Esa ruta
 * ya tiene su propia proteccion: enlaces firmados que caducan. Si se le
 * exigiera sesion, el casteo dejaria de funcionar por completo.
 */
export type AuthConfig = {
  /** Vacio = sin autenticacion. */
  pin: string;
  /** La misma clave con la que se cifran las credenciales. */
  secret: string;
};

export function hashSession(secret: string, id: string, expEpochSec: number): string {
  return createHmac('sha256', secret).update(`${id}.${expEpochSec}`).digest('base64url');
}

export function createSessionToken(secret: string, ttlDays = SESSION_TTL_DAYS): string {
  const id = randomBytes(16).toString('hex');
  const exp = Math.floor(Date.now() / 1000) + ttlDays * 24 * 60 * 60;
  return `${id}.${exp}.${hashSession(secret, id, exp)}`;
}

export function verifySessionToken(
  secret: string,
  token: string | undefined,
  nowEpochSec = Math.floor(Date.now() / 1000),
): boolean {
  if (!token) return false;

  const partes = token.split('.');
  if (partes.length !== 3) return false;

  const [id, expTexto, firma] = partes as [string, string, string];
  const exp = Number(expTexto);
  if (!Number.isInteger(exp)) return false;

  const esperada = hashSession(secret, id, exp);
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  // Comparacion de tiempo constante: con === se filtra, por el tiempo que
  // tarda, cuantos caracteres coincidieron.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  return exp > nowEpochSec;
}

/** Compara el PIN sin filtrar por tiempo cuantos digitos acerto. */
export function pinMatches(esperado: string, recibido: unknown): boolean {
  if (typeof recibido !== 'string') return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const salida: Record<string, string> = {};
  for (const parte of header.split(';')) {
    const corte = parte.indexOf('=');
    if (corte <= 0) continue;
    const nombre = parte.slice(0, corte).trim();
    const valor = parte.slice(corte + 1).trim();
    if (nombre) salida[nombre] = decodeURIComponent(valor);
  }
  return salida;
}

export function buildSetCookie(token: string, seguro: boolean, ttlDays = SESSION_TTL_DAYS): string {
  const partes = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly', // No accesible desde JavaScript: limita el robo por XSS.
    'SameSite=Lax', // Evita que otro sitio dispare acciones con tu sesion.
    `Max-Age=${ttlDays * 24 * 60 * 60}`,
  ];
  // Secure solo con HTTPS: en una direccion de LAN por http el navegador
  // descartaria la cookie y no se podria entrar nunca.
  if (seguro) partes.push('Secure');
  return partes.join('; ');
}

export function registerAuth(app: FastifyInstance, config: AuthConfig): void {
  const activa = config.pin.trim().length > 0;

  // Agresivo a proposito: un PIN de cuatro digitos son 10 000 combinaciones,
  // que sin limite se prueban en segundos.
  const limitadorLogin = new RateLimiter(5, 5 * 60_000);
  // Holgado: es para frenar un bucle descontrolado, no al usuario.
  const limitadorControl = new RateLimiter(120, 60_000);

  app.addHook('onClose', async () => {
    limitadorLogin.stop();
    limitadorControl.stop();
  });

  const ip = (req: FastifyRequest): string => req.ip;

  app.get('/api/auth/status', async () => ({ required: activa }));

  app.post<{ Body: { pin?: unknown } }>('/api/auth/login', async (req, reply) => {
    if (!activa) return { ok: true, required: false };

    const limite = limitadorLogin.check(ip(req));
    if (!limite.allowed) {
      logger.warn({ ip: ip(req) }, 'Demasiados intentos de PIN');
      return reply
        .code(429)
        .header('Retry-After', String(limite.retryAfterSeconds))
        .send({
          error: 'too_many_attempts',
          message: `Demasiados intentos. Espera ${Math.ceil(limite.retryAfterSeconds / 60)} minutos.`,
        });
    }

    if (!pinMatches(config.pin, req.body?.pin)) {
      return reply.code(401).send({ error: 'bad_pin', message: 'El PIN no es correcto.' });
    }

    limitadorLogin.reset(ip(req));
    const seguro = (req.headers['x-forwarded-proto'] ?? req.protocol) === 'https';
    return reply
      .header('Set-Cookie', buildSetCookie(createSessionToken(config.secret), seguro))
      .send({ ok: true });
  });

  app.post('/api/auth/logout', async (_req, reply) =>
    reply
      .header('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
      .send({ ok: true }),
  );

  if (!activa) {
    logger.info('Sin PIN configurado: la aplicacion no pide autenticacion.');
    return;
  }

  logger.info('PIN activo: la aplicacion va a pedir autenticacion.');

  app.addHook('preHandler', async (req, reply) => {
    const ruta = req.url.split('?')[0] ?? '';

    // /media/* queda afuera a proposito: esas URLs las pide el televisor, que
    // no tiene cookies. Ya estan protegidas con enlaces firmados que caducan.
    if (!ruta.startsWith('/api/')) return;
    if (ruta.startsWith('/api/auth/')) return;

    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (!verifySessionToken(config.secret, token)) {
      return reply.code(401).send({
        error: 'unauthorized',
        message: 'Hay que ingresar el PIN para usar la aplicación.',
      });
    }

    // El limite de control va DESPUES de validar la sesion: si fuera antes,
    // cualquiera sin sesion podria agotarle la cuota al usuario legitimo.
    const limite = limitadorControl.check(ip(req));
    if (!limite.allowed) {
      return reply
        .code(429)
        .header('Retry-After', String(limite.retryAfterSeconds))
        .send({
          error: 'rate_limited',
          message: 'Demasiadas acciones seguidas. Espera unos segundos.',
        });
    }
    return;
  });
}
