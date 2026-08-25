import { randomUUID } from 'node:crypto';
import type { CastUrlRequest } from '@tv-remote/shared';
import type { Db } from '../db/index.js';

export type HistoryEntry = {
  id: string;
  deviceId: string;
  title: string | null;
  url: string;
  kind: string;
  playedAt: string;
};

/** Historial de lo casteado, para el boton de "reproducir de nuevo". */
export class MediaHistoryRepo {
  constructor(private readonly db: Db) {}

  add(deviceId: string, media: CastUrlRequest, kind = 'url'): void {
    // Si la misma URL ya se reprodujo en este dispositivo, se actualiza la
    // fecha en vez de acumular repetidos: el historial es para volver a algo,
    // no un registro de auditoria.
    const existente = this.db
      .prepare('SELECT id FROM media_history WHERE device_id = ? AND url = ?')
      .get(deviceId, media.url) as { id: string } | undefined;

    if (existente) {
      this.db
        .prepare('UPDATE media_history SET played_at = ?, title = COALESCE(?, title) WHERE id = ?')
        .run(new Date().toISOString(), media.title ?? null, existente.id);
      return;
    }

    this.db
      .prepare(
        `INSERT INTO media_history (id, device_id, title, url, kind, played_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), deviceId, media.title ?? null, media.url, kind, new Date().toISOString());
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
      played_at: string;
    }[];

    return filas.map((f) => ({
      id: f.id,
      deviceId: f.device_id,
      title: f.title,
      url: f.url,
      kind: f.kind,
      playedAt: f.played_at,
    }));
  }

  clear(deviceId: string): void {
    this.db.prepare('DELETE FROM media_history WHERE device_id = ?').run(deviceId);
  }
}
