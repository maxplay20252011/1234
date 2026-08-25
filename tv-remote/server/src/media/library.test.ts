import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MediaLibrary } from './library.js';

describe('MediaLibrary', () => {
  let raiz: string;
  let permitida: string;
  let prohibida: string;
  let library: MediaLibrary;

  beforeAll(() => {
    raiz = mkdtempSync(join(tmpdir(), 'lib-test-'));
    permitida = join(raiz, 'videos');
    prohibida = join(raiz, 'privado');
    mkdirSync(permitida);
    mkdirSync(prohibida);
    mkdirSync(join(permitida, 'series'));

    writeFileSync(join(permitida, 'peli.mp4'), 'x');
    writeFileSync(join(permitida, 'notas.txt'), 'x');
    writeFileSync(join(permitida, '.oculto.mp4'), 'x');
    writeFileSync(join(permitida, 'series', 'cap1.mkv'), 'x');
    writeFileSync(join(prohibida, 'secreto.mp4'), 'x');

    library = new MediaLibrary([permitida]);
  });

  afterAll(() => rmSync(raiz, { recursive: true, force: true }));

  it('lista solo archivos reproducibles, con las carpetas primero', async () => {
    const { entries } = await library.browse();
    const nombres = entries.map((e) => e.name);
    expect(nombres).toEqual(['series', 'peli.mp4']);
    // notas.txt no es reproducible; el oculto es ruido.
    expect(nombres).not.toContain('notas.txt');
    expect(nombres).not.toContain('.oculto.mp4');
  });

  it('entra en las subcarpetas', async () => {
    const { entries } = await library.browse('series');
    expect(entries.map((e) => e.name)).toEqual(['cap1.mkv']);
  });

  it('NO deja salir de la carpeta permitida con ..', async () => {
    // El agujero clasico: sin esto, cualquiera en la red podria leer todo el disco.
    expect(await library.resolveInsideRoots(join(permitida, '..', 'privado', 'secreto.mp4')))
      .toBeUndefined();
    expect(await library.register(join(prohibida, 'secreto.mp4'))).toBeUndefined();
  });

  it('NO deja salir por un enlace simbolico', async () => {
    // Por eso la comprobacion se hace sobre la ruta REAL, no sobre la pedida:
    // un enlace dentro de la carpeta permitida puede apuntar a cualquier lado.
    const enlace = join(permitida, 'atajo.mp4');
    try {
      symlinkSync(join(prohibida, 'secreto.mp4'), enlace);
    } catch {
      return; // Sin permiso para crear enlaces: el test no aplica.
    }
    expect(await library.register(enlace)).toBeUndefined();
    rmSync(enlace);
  });

  it('no confunde una carpeta que comparte prefijo con la permitida', async () => {
    // /videos-privados NO esta dentro de /videos, aunque el texto empiece igual.
    const parecida = `${permitida}-privados`;
    mkdirSync(parecida, { recursive: true });
    writeFileSync(join(parecida, 'otro.mp4'), 'x');
    expect(await library.register(join(parecida, 'otro.mp4'))).toBeUndefined();
    rmSync(parecida, { recursive: true, force: true });
  });

  it('da el mismo id a la misma ruta, para que los enlaces sobrevivan reinicios', async () => {
    const a = await library.register(join(permitida, 'peli.mp4'));
    const b = await library.register(join(permitida, 'peli.mp4'));
    expect(a?.id).toBe(b?.id);
    expect(a?.id).toBe(MediaLibrary.idFor(join(permitida, 'peli.mp4')));
  });

  it('avisa que no hay nada configurado en vez de fingir una biblioteca vacia', () => {
    expect(new MediaLibrary([]).configured).toBe(false);
    expect(library.configured).toBe(true);
  });
});
