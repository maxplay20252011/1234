import { createHash } from 'node:crypto';
import { readdir, realpath, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { contentTypeFor, esReproducible } from './mime.js';
import { logger } from '../logger.js';

export type MediaEntry = {
  /** Estable: derivado de la ruta absoluta, sobrevive reinicios. */
  id: string;
  name: string;
  /** Ruta relativa a su raiz, para mostrar en la interfaz. */
  relativePath: string;
  size: number;
  contentType: string;
  isDirectory: boolean;
};

/**
 * Biblioteca de archivos locales.
 *
 * Solo se sirve lo que este dentro de las carpetas configuradas en MEDIA_DIRS.
 * La comprobacion se hace sobre la ruta REAL (resuelta con realpath), no sobre
 * la que pidio el cliente: si no, un enlace simbolico dentro de la carpeta
 * permitida podria apuntar a cualquier parte del disco y quedaria expuesto a
 * toda la red.
 */
export class MediaLibrary {
  /** id -> ruta absoluta real. Se llena al explorar. */
  private readonly conocidos = new Map<string, string>();

  constructor(private readonly roots: readonly string[]) {}

  get configured(): boolean {
    return this.roots.length > 0;
  }

  get rootPaths(): readonly string[] {
    return this.roots;
  }

  static idFor(absolutePath: string): string {
    return createHash('sha256').update(absolutePath).digest('hex').slice(0, 20);
  }

  /**
   * Comprueba que una ruta este realmente dentro de alguna raiz permitida.
   * Devuelve la ruta real o undefined.
   */
  async resolveInsideRoots(candidate: string): Promise<string | undefined> {
    let real: string;
    try {
      real = await realpath(candidate);
    } catch {
      return undefined;
    }

    for (const root of this.roots) {
      let rootReal: string;
      try {
        rootReal = await realpath(root);
      } catch {
        continue;
      }
      // El separador final evita que /media-privado pase por estar dentro de
      // /media: comparar prefijos de texto sin el separador es un agujero clasico.
      if (real === rootReal || real.startsWith(rootReal + sep)) return real;
    }
    return undefined;
  }

  /** Lista una carpeta. Sin argumento, lista las raices configuradas. */
  async browse(relative?: string): Promise<{ path: string; entries: MediaEntry[] }> {
    if (!relative || relative === '/' || relative === '') {
      // Con una sola raiz se entra directo: un nivel con un unico elemento no
      // aporta nada y obliga a un toque de mas.
      if (this.roots.length === 1) {
        const unica = this.roots[0] as string;
        return { path: '', entries: await this.listDirectory(unica, '') };
      }
      const entries: MediaEntry[] = [];
      for (const root of this.roots) {
        entries.push({
          id: MediaLibrary.idFor(root),
          name: basename(root) || root,
          relativePath: basename(root) || root,
          size: 0,
          contentType: 'inode/directory',
          isDirectory: true,
        });
        this.conocidos.set(MediaLibrary.idFor(root), root);
      }
      return { path: '', entries };
    }

    const absoluto = await this.absolutoDesdeRelativo(relative);
    if (!absoluto) throw new Error('Esa carpeta no esta dentro de las carpetas permitidas.');
    return { path: relative, entries: await this.listDirectory(absoluto, relative) };
  }

  /** Ruta absoluta de un id ya visto al explorar. */
  pathFor(id: string): string | undefined {
    return this.conocidos.get(id);
  }

  /** Registra una ruta para poder servirla despues. Valida que este permitida. */
  async register(absolutePath: string): Promise<MediaEntry | undefined> {
    const real = await this.resolveInsideRoots(absolutePath);
    if (!real) return undefined;

    let info;
    try {
      info = await stat(real);
    } catch {
      return undefined;
    }
    if (!info.isFile()) return undefined;

    const id = MediaLibrary.idFor(real);
    this.conocidos.set(id, real);
    return {
      id,
      name: basename(real),
      relativePath: basename(real),
      size: info.size,
      contentType: contentTypeFor(real),
      isDirectory: false,
    };
  }

  /** Busca un subtitulo al lado del video, probando nombres habituales. */
  async findSubtitle(videoPath: string, candidatos: readonly string[]): Promise<string | undefined> {
    const carpeta = dirname(videoPath);
    for (const nombre of candidatos) {
      const ruta = join(carpeta, nombre);
      const real = await this.resolveInsideRoots(ruta);
      if (!real) continue;
      try {
        if ((await stat(real)).isFile()) return real;
      } catch {
        continue;
      }
    }
    return undefined;
  }

  private async absolutoDesdeRelativo(relative: string): Promise<string | undefined> {
    for (const root of this.roots) {
      // Con una sola raiz, las rutas relativas cuelgan directo de ella.
      const candidatos =
        this.roots.length === 1
          ? [resolve(root, relative)]
          : [resolve(root, relative), resolve(dirname(root), relative)];
      for (const candidato of candidatos) {
        const real = await this.resolveInsideRoots(candidato);
        if (real) return real;
      }
    }
    return undefined;
  }

  private async listDirectory(absoluto: string, relative: string): Promise<MediaEntry[]> {
    let nombres: string[];
    try {
      nombres = await readdir(absoluto);
    } catch (err) {
      logger.debug({ err, absoluto }, 'No se pudo leer la carpeta');
      return [];
    }

    const entries: MediaEntry[] = [];
    for (const nombre of nombres) {
      if (nombre.startsWith('.')) continue; // Ocultos: ruido.

      const rutaAbs = join(absoluto, nombre);
      let info;
      try {
        info = await stat(rutaAbs);
      } catch {
        continue; // Enlace roto o sin permisos.
      }

      const esCarpeta = info.isDirectory();
      if (!esCarpeta && !esReproducible(nombre)) continue;

      const id = MediaLibrary.idFor(rutaAbs);
      this.conocidos.set(id, rutaAbs);
      entries.push({
        id,
        name: nombre,
        relativePath: relative ? `${relative}/${nombre}` : nombre,
        size: esCarpeta ? 0 : info.size,
        contentType: esCarpeta ? 'inode/directory' : contentTypeFor(nombre),
        isDirectory: esCarpeta,
      });
    }

    // Carpetas primero, despues por nombre. Es como espera cualquiera.
    return entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name, 'es');
    });
  }
}
