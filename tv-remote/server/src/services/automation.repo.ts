import { randomUUID } from 'node:crypto';
import type { CreateGroupRequest, CreateSceneRequest, Group, Scene, SceneStep } from '@tv-remote/shared';
import type { Db } from '../db/index.js';

export class GroupsRepo {
  constructor(private readonly db: Db) {}

  list(): Group[] {
    const filas = this.db
      .prepare('SELECT id, name, created_at FROM groups ORDER BY name COLLATE NOCASE')
      .all() as { id: string; name: string; created_at: string }[];

    return filas.map((f) => ({
      id: f.id,
      name: f.name,
      deviceIds: this.deviceIds(f.id),
      createdAt: f.created_at,
    }));
  }

  get(id: string): Group | undefined {
    return this.list().find((g) => g.id === id);
  }

  create(req: CreateGroupRequest): Group {
    const id = randomUUID();
    const createdAt = new Date().toISOString();

    // En una transaccion: un grupo a medio crear seria peor que ninguno.
    this.db.transaction(() => {
      this.db.prepare('INSERT INTO groups (id, name, created_at) VALUES (?, ?, ?)').run(id, req.name, createdAt);
      this.setDevices(id, req.deviceIds);
    })();

    return { id, name: req.name, deviceIds: req.deviceIds, createdAt };
  }

  update(id: string, req: CreateGroupRequest): Group | undefined {
    if (!this.get(id)) return undefined;
    this.db.transaction(() => {
      this.db.prepare('UPDATE groups SET name = ? WHERE id = ?').run(req.name, id);
      this.setDevices(id, req.deviceIds);
    })();
    return this.get(id);
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM groups WHERE id = ?').run(id);
  }

  private deviceIds(groupId: string): string[] {
    return (
      this.db
        .prepare('SELECT device_id FROM group_devices WHERE group_id = ?')
        .all(groupId) as { device_id: string }[]
    ).map((f) => f.device_id);
  }

  private setDevices(groupId: string, deviceIds: readonly string[]): void {
    this.db.prepare('DELETE FROM group_devices WHERE group_id = ?').run(groupId);
    const insertar = this.db.prepare(
      'INSERT OR IGNORE INTO group_devices (group_id, device_id) VALUES (?, ?)',
    );
    for (const deviceId of deviceIds) insertar.run(groupId, deviceId);
  }
}

export class ScenesRepo {
  constructor(private readonly db: Db) {}

  list(): Scene[] {
    const filas = this.db
      .prepare('SELECT id, name, steps, created_at FROM scenes ORDER BY name COLLATE NOCASE')
      .all() as { id: string; name: string; steps: string; created_at: string }[];
    return filas.map((f) => ({
      id: f.id,
      name: f.name,
      steps: parseSteps(f.steps),
      createdAt: f.created_at,
    }));
  }

  get(id: string): Scene | undefined {
    const fila = this.db.prepare('SELECT id, name, steps, created_at FROM scenes WHERE id = ?').get(id) as
      | { id: string; name: string; steps: string; created_at: string }
      | undefined;
    if (!fila) return undefined;
    return { id: fila.id, name: fila.name, steps: parseSteps(fila.steps), createdAt: fila.created_at };
  }

  create(req: CreateSceneRequest): Scene {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    this.db
      .prepare('INSERT INTO scenes (id, name, steps, created_at) VALUES (?, ?, ?, ?)')
      .run(id, req.name, JSON.stringify(req.steps), createdAt);
    return { id, name: req.name, steps: req.steps, createdAt };
  }

  update(id: string, req: CreateSceneRequest): Scene | undefined {
    if (!this.get(id)) return undefined;
    this.db
      .prepare('UPDATE scenes SET name = ?, steps = ? WHERE id = ?')
      .run(req.name, JSON.stringify(req.steps), id);
    return this.get(id);
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM scenes WHERE id = ?').run(id);
  }
}

/** Si el JSON de una escena se corrompio, se devuelve vacia en vez de romper. */
function parseSteps(texto: string): SceneStep[] {
  try {
    const parsed: unknown = JSON.parse(texto);
    return Array.isArray(parsed) ? (parsed as SceneStep[]) : [];
  } catch {
    return [];
  }
}
