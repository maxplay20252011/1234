/**
 * Migraciones. Se aplican en orden y se registra cual fue la ultima con
 * `PRAGMA user_version`, asi actualizar el proyecto nunca pierde datos ni
 * credenciales de emparejamiento.
 *
 * Regla: no editar una migracion ya publicada. Agregar una nueva al final.
 */
export const MIGRATIONS: readonly string[] = [
  // 1 ─ Esquema inicial.
  `
  CREATE TABLE IF NOT EXISTS devices (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    brand         TEXT NOT NULL,
    model         TEXT,
    ip            TEXT NOT NULL,
    mac           TEXT,
    capabilities  TEXT NOT NULL DEFAULT '[]',
    paired        INTEGER NOT NULL DEFAULT 0,
    online        INTEGER NOT NULL DEFAULT 0,
    last_seen     TEXT NOT NULL,
    unstable_id   INTEGER NOT NULL DEFAULT 0,
    sources       TEXT NOT NULL DEFAULT '[]',
    raw           TEXT,
    manual        INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_devices_ip ON devices(ip);

  -- Hosts agregados a mano. Se guardan aparte de devices porque sobreviven
  -- aunque el sondeo falle: es la valvula de escape para redes donde el
  -- multicast no pasa (aislamiento de clientes en el AP, VLANs, algunos mesh).
  CREATE TABLE IF NOT EXISTS manual_hosts (
    ip         TEXT PRIMARY KEY,
    name       TEXT,
    created_at TEXT NOT NULL
  );

  -- Tokens de emparejamiento (client-key de LG, token de Samsung). Cifrados en
  -- reposo con AES-256-GCM. NUNCA guardar el texto plano ni loguearlo.
  CREATE TABLE IF NOT EXISTS credentials (
    device_id  TEXT PRIMARY KEY,
    brand      TEXT NOT NULL,
    ciphertext BLOB NOT NULL,
    iv         BLOB NOT NULL,
    tag        BLOB NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS groups (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS group_devices (
    group_id  TEXT NOT NULL,
    device_id TEXT NOT NULL,
    PRIMARY KEY (group_id, device_id),
    FOREIGN KEY (group_id)  REFERENCES groups(id)  ON DELETE CASCADE,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
  );

  -- steps es un JSON con la secuencia de acciones y sus esperas. Los delays
  -- hacen falta porque un televisor recien encendido ignora comandos por varios
  -- segundos.
  CREATE TABLE IF NOT EXISTS scenes (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    steps      TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS media_history (
    id         TEXT PRIMARY KEY,
    device_id  TEXT NOT NULL,
    title      TEXT,
    url        TEXT NOT NULL,
    kind       TEXT NOT NULL,
    played_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_media_history_played ON media_history(played_at DESC);
  `,
];
