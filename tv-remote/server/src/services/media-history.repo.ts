import { randomUUID } from 'node:crypto';
import type { CastUrlRequest } from '@tv-remote/shared';
import type { Db } from '../db/index.js';

export type HistoryEntry = {
  id: string;
  deviceId: string;
  title: string | null;
  url: string;
  /** 'url' para contenido remoto, 'file' para un archivo del servidor. */
  kind: string;
  /** Referencia estable: la URL, o el id del archivo. Es con lo que se repite. */
  ref: string;
  playedAt: string;
};

/** Historial de lo casteado, para el boton de "reproducir de nuevo". */
export class MediaHistoryRepo {
  constructor(private readonly db: Db) {}

  /**
   * Guarda una reproduccion.
   *
   * `ref` es lo que identifica al contenido de forma estable. Para un archivo
   * local NO puede ser la URL: lleva un token efimero distinto en cada envio, y
   * deduplicar por ella acumularia una entrada por reproduccion, todas con
   * tokens que al poco tiempo dejan de servir.
   */
  add(deviceId: string, media: CastUrlRequest, kind = 'url', ref?: string): void {
    const referencia = ref ?? media.url;

    // Si ya se reprodujo esto en este dispositivo, se actualiza la fecha en vez
    // de acumular repetidos: el historial es para volver a algo, no un registro
    // de auditoria.
    const existente = this.db
      .prepare('SELECT id FROM media_history WHERE device_id = ? AND kind = ? AND ref = ?')
      .get(deviceId, kind, referencia) as { id: string } | undefined;

    if (existente) {
      this.db
        .prepare(
          'UPDATE media_history SET played_at = ?, title = COALESCE(?, title), url = ? WHERE id = ?',
        )
        .run(new Date().toISOString(), media.title ?? null, media.url, existente.id);
      return;
    }

    this.db
      .prepare(
        `INSERT INTO media_history (id, device_id, title, url, kind, ref, played_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        deviceId,
        media.title ?? null,
        media.url,
        kind,
        referencia,
        new Date().toISOString(),
      );
  }

  list(deviceId?: string, limit = 20): HistoryEntry[] {
    const filas = (
      deviceId
        ? this.db
            .prepare(
              'SELECT * FROM media_history WHERE device_id = ? ORDER BY played_at DESC LIMIT ?',
            )
            .all(deviceId, limit)
        : this.db
            .prepare('SELECT * FROM media_history ORDER BY played_at DESC LIMIT ?')
            .all(limit)
    ) as {
      id: string;
      device_id: string;
      title: string | null;
      url: string;
      kind: string;
      ref: string | null;
      played_at: string;
    }[];

    return filas.map((f) => ({
      id: f.id,
      deviceId: f.device_id,
      title: f.title,
      url: f.url,
      kind: f.kind,
      ref: f.ref ?? f.url,
      playedAt: f.played_at,
    }));
  }

  clear(deviceId: string): void {
    this.db.prepare('DELETE FROM media_history WHERE device_id = ?').run(deviceId);
  }
}
