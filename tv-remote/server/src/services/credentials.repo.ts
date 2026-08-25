import type { Db } from '../db/index.js';
import type { Credentials } from '../adapters/types.js';
import { decrypt, encrypt } from './crypto.js';
import { logger } from '../logger.js';

type CredentialRow = {
  device_id: string;
  brand: string;
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
};

/**
 * Credenciales de emparejamiento, cifradas en reposo.
 *
 * Nunca se loguea el contenido, ni siquiera en nivel debug: un token de Samsung
 * en un log es un token filtrado.
 */
export class CredentialsRepo {
  constructor(
    private readonly db: Db,
    private readonly key: Buffer,
  ) {}

  get(deviceId: string): Credentials | undefined {
    const row = this.db.prepare('SELECT * FROM credentials WHERE device_id = ?').get(deviceId) as
      | CredentialRow
      | undefined;
    if (!row) return undefined;

    try {
      return JSON.parse(
        decrypt(this.key, { ciphertext: row.ciphertext, iv: row.iv, tag: row.tag }),
      ) as Credentials;
    } catch {
      // Pasa si cambio ENCRYPTION_KEY. Se descarta para que el usuario pueda
      // volver a emparejar en vez de quedar trabado con un token ilegible.
      logger.warn(
        { deviceId },
        'No se pudieron descifrar las credenciales. Cambio ENCRYPTION_KEY? Hay que emparejar de nuevo.',
      );
      this.remove(deviceId);
      return undefined;
    }
  }

  save(deviceId: string, brand: string, credentials: Credentials): void {
    const { ciphertext, iv, tag } = encrypt(this.key, JSON.stringify(credentials));
    this.db
      .prepare(
        `INSERT INTO credentials (device_id, brand, ciphertext, iv, tag, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(device_id) DO UPDATE SET
           brand = excluded.brand, ciphertext = excluded.ciphertext,
           iv = excluded.iv, tag = excluded.tag, updated_at = excluded.updated_at`,
      )
      .run(deviceId, brand, ciphertext, iv, tag, new Date().toISOString());

    this.db.prepare('UPDATE devices SET paired = 1 WHERE id = ?').run(deviceId);
    logger.info({ deviceId, brand }, 'Credenciales guardadas (cifradas)');
  }

  remove(deviceId: string): void {
    this.db.prepare('DELETE FROM credentials WHERE device_id = ?').run(deviceId);
    this.db.prepare('UPDATE devices SET paired = 0 WHERE id = ?').run(deviceId);
  }

  has(deviceId: string): boolean {
    return (
      this.db.prepare('SELECT 1 FROM credentials WHERE device_id = ?').get(deviceId) !== undefined
    );
  }
}
