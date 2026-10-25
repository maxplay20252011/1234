import { describe, it, expect } from 'vitest';
import {
  buildSetCookie,
  createSessionToken,
  parseCookies,
  pinMatches,
  verifySessionToken,
} from './auth.js';
import { RateLimiter } from './rate-limit.js';

const SECRETO = 'un-secreto-de-prueba';

describe('sesiones', () => {
  it('acepta una sesion recien creada', () => {
    expect(verifySessionToken(SECRETO, createSessionToken(SECRETO))).toBe(true);
  });

  it('rechaza una sesion vencida', () => {
    const token = createSessionToken(SECRETO, 1);
    const dentroDeDosDias = Math.floor(Date.now() / 1000) + 2 * 24 * 60 * 60;
    expect(verifySessionToken(SECRETO, token, dentroDeDosDias)).toBe(false);
  });

  it('rechaza una sesion firmada con otra clave', () => {
    expect(verifySessionToken(SECRETO, createSessionToken('otra-clave'))).toBe(false);
  });

  it('rechaza una sesion manipulada para durar mas', () => {
    // El ataque obvio: estirar la fecha. La firma la cubre.
    const token = createSessionToken(SECRETO, 1);
    const [id, , firma] = token.split('.');
    expect(verifySessionToken(SECRETO, `${id}.99999999999.${firma}`)).toBe(false);
  });

  it('rechaza basura y ausencia', () => {
    expect(verifySessionToken(SECRETO, undefined)).toBe(false);
    expect(verifySessionToken(SECRETO, '')).toBe(false);
    expect(verifySessionToken(SECRETO, 'abc')).toBe(false);
    expect(verifySessionToken(SECRETO, 'a.b.c')).toBe(false);
  });

  it('cada sesion es distinta', () => {
    expect(createSessionToken(SECRETO)).not.toBe(createSessionToken(SECRETO));
  });
});

describe('pinMatches', () => {
  it('acepta el PIN correcto y rechaza el resto', () => {
    expect(pinMatches('1234', '1234')).toBe(true);
    expect(pinMatches('1234', '1235')).toBe(false);
    expect(pinMatches('1234', '123')).toBe(false);
    expect(pinMatches('1234', '12345')).toBe(false);
  });

  it('rechaza lo que no sea texto, sin romperse', () => {
    expect(pinMatches('1234', undefined)).toBe(false);
    expect(pinMatches('1234', 1234)).toBe(false);
    expect(pinMatches('1234', { pin: '1234' })).toBe(false);
    expect(pinMatches('1234', null)).toBe(false);
  });
});

describe('cookies', () => {
  it('parsea varias cookies', () => {
    const cookies = parseCookies('a=1; tv_remote_session=abc.123.xyz; b=2');
    expect(cookies['tv_remote_session']).toBe('abc.123.xyz');
    expect(cookies['a']).toBe('1');
  });

  it('no se rompe con cabecera ausente o malformada', () => {
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies('')).toEqual({});
    expect(parseCookies('sinigual; =sinnombre')).toEqual({});
  });

  it('la cookie es HttpOnly y SameSite', () => {
    // HttpOnly limita el robo por XSS; SameSite evita que otro sitio dispare
    // acciones aprovechando la sesion.
    const cookie = buildSetCookie('token', false);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('Secure solo con HTTPS: por http el navegador la descartaria', () => {
    expect(buildSetCookie('token', false)).not.toContain('Secure');
    expect(buildSetCookie('token', true)).toContain('Secure');
  });
});

describe('RateLimiter', () => {
  it('deja pasar hasta el limite y despues corta', () => {
    const limitador = new RateLimiter(3, 60_000);
    expect(limitador.check('ip').allowed).toBe(true);
    expect(limitador.check('ip').allowed).toBe(true);
    expect(limitador.check('ip').allowed).toBe(true);

    const cuarto = limitador.check('ip');
    expect(cuarto.allowed).toBe(false);
    expect(cuarto.retryAfterSeconds).toBeGreaterThan(0);
    limitador.stop();
  });

  it('cuenta por clave: una IP no afecta a otra', () => {
    const limitador = new RateLimiter(1, 60_000);
    expect(limitador.check('ip-a').allowed).toBe(true);
    expect(limitador.check('ip-a').allowed).toBe(false);
    expect(limitador.check('ip-b').allowed).toBe(true);
    limitador.stop();
  });

  it('vuelve a permitir cuando pasa la ventana', () => {
    const limitador = new RateLimiter(1, 1000);
    const ahora = Date.now();
    expect(limitador.check('ip', ahora).allowed).toBe(true);
    expect(limitador.check('ip', ahora + 500).allowed).toBe(false);
    expect(limitador.check('ip', ahora + 1500).allowed).toBe(true);
    limitador.stop();
  });

  it('acertar el PIN borra los intentos fallidos', () => {
    const limitador = new RateLimiter(2, 60_000);
    limitador.check('ip');
    limitador.reset('ip');
    expect(limitador.check('ip').allowed).toBe(true);
    expect(limitador.check('ip').allowed).toBe(true);
    limitador.stop();
  });
});
