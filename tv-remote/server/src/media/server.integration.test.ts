import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MediaLibrary } from './library.js';
import { registerMediaRoutes } from './server.js';
import { createMediaToken } from './tokens.js';

const SECRETO = 'secreto-de-prueba';
/** Contenido reconocible: cada byte es su propio indice modulo 256. */
const CONTENIDO = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));

describe('MediaServer sirviendo un archivo real', () => {
  let dir: string;
  let app: FastifyInstance;
  let library: MediaLibrary;
  let fileId: string;
  let base: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'media-test-'));
    mkdirSync(join(dir, 'videos'));
    const video = join(dir, 'videos', 'peli.mp4');
    writeFileSync(video, CONTENIDO);
    writeFileSync(
      join(dir, 'videos', 'peli.srt'),
      '1\n00:00:01,000 --> 00:00:04,000\nHola, ¿qué tal?\n',
    );

    library = new MediaLibrary([join(dir, 'videos')]);
    const entrada = await library.register(video);
    if (!entrada) throw new Error('No se pudo registrar el archivo de prueba');
    fileId = entrada.id;

    app = Fastify();
    registerMediaRoutes(app, { library, secret: SECRETO });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const dirEscucha = app.server.address();
    const puerto = typeof dirEscucha === 'object' && dirEscucha !== null ? dirEscucha.port : 0;
    base = `http://127.0.0.1:${puerto}`;
  });

  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const token = (): string => createMediaToken(SECRETO, fileId, 3600);
  const url = (): string => `${base}/media/${fileId}?t=${encodeURIComponent(token())}`;

  it('sirve el archivo completo cuando no piden rango', async () => {
    const res = await fetch(url());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-length')).toBe('1000');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('content-type')).toBe('video/mp4');
    expect(Buffer.from(await res.arrayBuffer()).equals(CONTENIDO)).toBe(true);
  });

  it('anuncia las cabeceras DLNA que habilitan adelantar en los Samsung', async () => {
    const res = await fetch(url());
    expect(res.headers.get('contentfeatures.dlna.org')).toContain('DLNA.ORG_OP=01');
    expect(res.headers.get('transfermode.dlna.org')).toBe('Streaming');
  });

  it('responde 206 con los bytes exactos pedidos: esto es adelantar el video', async () => {
    const res = await fetch(url(), { headers: { Range: 'bytes=500-599' } });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 500-599/1000');
    expect(res.headers.get('content-length')).toBe('100');

    const cuerpo = Buffer.from(await res.arrayBuffer());
    expect(cuerpo).toHaveLength(100);
    // Verificacion real del contenido, no solo del tamanio: si el offset
    // estuviera mal, el largo daria igual y el video se veria corrupto.
    expect(cuerpo.equals(CONTENIDO.subarray(500, 600))).toBe(true);
  });

  it('sirve "desde N hasta el final", que es lo que piden los TVs al arrancar', async () => {
    const res = await fetch(url(), { headers: { Range: 'bytes=900-' } });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 900-999/1000');
    expect(Buffer.from(await res.arrayBuffer()).equals(CONTENIDO.subarray(900))).toBe(true);
  });

  it('sirve los ultimos N bytes, que es como leen el indice de un MP4', async () => {
    const res = await fetch(url(), { headers: { Range: 'bytes=-100' } });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 900-999/1000');
  });

  it('responde 416 con el tamanio real cuando el rango no existe', async () => {
    const res = await fetch(url(), { headers: { Range: 'bytes=5000-6000' } });
    expect(res.status).toBe(416);
    expect(res.headers.get('content-range')).toBe('bytes */1000');
  });

  it('responde HEAD con las mismas cabeceras y sin cuerpo', async () => {
    // Los televisores mandan HEAD antes de reproducir para leer tamanio y tipo.
    const res = await fetch(url(), { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-length')).toBe('1000');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect((await res.arrayBuffer()).byteLength).toBe(0);
  });

  it('convierte el subtitulo SRT a WebVTT al vuelo', async () => {
    const res = await fetch(`${base}/media/${fileId}/subs.vtt?t=${encodeURIComponent(token())}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/vtt');

    const texto = await res.text();
    expect(texto.startsWith('WEBVTT')).toBe(true);
    expect(texto).toContain('00:00:01.000 --> 00:00:04.000');
    expect(texto).toContain('Hola, ¿qué tal?');
  });

  it('sirve el subtitulo en SRT tal cual, que es lo que pide Samsung', async () => {
    const res = await fetch(`${base}/media/${fileId}/subs.srt?t=${encodeURIComponent(token())}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/x-subrip');
    expect(await res.text()).toContain('00:00:01,000 --> 00:00:04,000');
  });

  it('rechaza el pedido sin token', async () => {
    const res = await fetch(`${base}/media/${fileId}`);
    expect(res.status).toBe(403);
  });

  it('rechaza un token de otro archivo', async () => {
    const ajeno = createMediaToken(SECRETO, 'otro-archivo', 3600);
    const res = await fetch(`${base}/media/${fileId}?t=${encodeURIComponent(ajeno)}`);
    expect(res.status).toBe(403);
  });

  it('avisa en castellano cuando el enlace caduco', async () => {
    const vencido = createMediaToken(SECRETO, fileId, -10);
    const res = await fetch(`${base}/media/${fileId}?t=${encodeURIComponent(vencido)}`);
    expect(res.status).toBe(403);
    const cuerpo = (await res.json()) as { error: string; message: string };
    expect(cuerpo.error).toBe('link_expired');
    expect(cuerpo.message).toContain('caduco');
  });

  it('devuelve 404 para un id que no existe', async () => {
    const otro = 'a'.repeat(20);
    const res = await fetch(`${base}/media/${otro}?t=${encodeURIComponent(createMediaToken(SECRETO, otro, 3600))}`);
    expect(res.status).toBe(404);
  });
});
