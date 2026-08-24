import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { MIGRATIONS } from './schema.js';
import { logger } from '../logger.js';

export type Db = Database.Database;

export function openDatabase(dataDir: string): Db {
  const file = resolve(join(dataDir, 'devices.db'));
  mkdirSync(dirname(file), { recursive: true });

  const db = new Database(file);
  // WAL: permite leer mientras se escribe. Sin esto, el escaneo periodico traba
  // las consultas de la interfaz cada cinco minutos.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  migrate(db);
  logger.debug({ file }, 'Base de datos abierta');
  return db;
}

function migrate(db: Db): void {
  const actual = Number((db.pragma('user_version', { simple: true }) as number | bigint) ?? 0);
  for (let i = actual; i < MIGRATIONS.length; i++) {
    const sql = MIGRATIONS[i];
    if (!sql) continue;
    logger.info(`Aplicando migracion ${i + 1} de ${MIGRATIONS.length}`);
    db.exec(sql);
    db.pragma(`user_version = ${i + 1}`);
  }
}
