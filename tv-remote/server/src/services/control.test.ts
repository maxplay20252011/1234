import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../db/schema.js';
import { DevicesRepo } from '../db/devices.repo.js';
import { CredentialsRepo } from './credentials.repo.js';
import { deriveKey } from './crypto.js';
import { StateHub } from './state-hub.js';
import { ControlService } from './control.js';
import { MediaHistoryRepo } from './media-history.repo.js';
import { AdapterRegistry } from '../adapters/types.js';
import { MockAdapter, buildMockDevice } from '../adapters/mock/index.js';
import { ControlError } from '../adapters/errors.js';

/**
 * Ejercita el ControlService completo contra el televisor simulado.
 *
 * Es la unica forma de validar de punta a punta la verificacion de capacidades
 * y la persistencia de credenciales sin un televisor real delante.
 */
function montar() {
  const db = new Database(':memory:');
  for (const sql of MIGRATIONS) db.exec(sql);

  const devices = new DevicesRepo(db);
  const credentials = new CredentialsRepo(db, deriveKey('clave-de-prueba'));
  const hub = new StateHub();
  const registry = new AdapterRegistry();
  const mock = new MockAdapter();
  registry.register(mock);

  const history = new MediaHistoryRepo(db);

  const device = buildMockDevice();
  devices.upsert(device);

  return {
    db,
    devices,
    credentials,
    hub,
    history,
    control: new ControlService(devices, credentials, registry, hub, history),
    deviceId: device.id,
  };
}

describe('ControlService', () => {
  let ctx: ReturnType<typeof montar>;

  beforeEach(() => {
    ctx = montar();
  });

  it('guarda las capacidades que declara el adapter, no las que sugiere la marca', async () => {
    const caps = await ctx.control.refreshCapabilities(ctx.deviceId);
    expect(caps).toContain('volumeAbsolute');
    expect(ctx.devices.get(ctx.deviceId)?.capabilities).toEqual(caps);
  });

  it('rechaza el volumen absoluto si el dispositivo no lo declara', async () => {
    // Es el caso real de un Samsung que no contesta RenderingControl, o de
    // cualquier Roku: hay volumen por pasos pero no por valor.
    const device = ctx.devices.get(ctx.deviceId);
    if (!device) throw new Error('falta el dispositivo');
    ctx.devices.upsert({ ...device, capabilities: ['volume', 'dpad'] });

    await expect(ctx.control.setVolume(ctx.deviceId, 20)).rejects.toThrow(ControlError);
    await expect(ctx.control.setVolume(ctx.deviceId, 20)).rejects.toMatchObject({
      code: 'missing_capability',
      // El mensaje va tal cual a la pantalla del usuario.
      userMessage: expect.stringContaining('no permite'),
    });
  });

  it('deja usar el volumen por pasos aunque no haya volumen absoluto', async () => {
    const device = ctx.devices.get(ctx.deviceId);
    if (!device) throw new Error('falta el dispositivo');
    ctx.devices.upsert({ ...device, capabilities: ['volume'] });

    await ctx.control.pair(ctx.deviceId);
    await expect(ctx.control.volumeStep(ctx.deviceId, 2)).resolves.toBeUndefined();
  });

  it('exige emparejamiento antes de aceptar comandos', async () => {
    await expect(ctx.control.sendKey(ctx.deviceId, 'up')).rejects.toMatchObject({
      code: 'not_paired',
    });
  });

  it('guarda las credenciales cifradas y las reutiliza despues', async () => {
    const status = await ctx.control.pair(ctx.deviceId);
    expect(status.state).toBe('paired');

    // En la tabla no puede quedar nada legible.
    const fila = ctx.db
      .prepare('SELECT ciphertext FROM credentials WHERE device_id = ?')
      .get(ctx.deviceId) as { ciphertext: Buffer };
    expect(fila.ciphertext.toString('utf8')).not.toContain('token-simulado');

    expect(ctx.credentials.get(ctx.deviceId)?.token).toBe('token-simulado');
    expect(ctx.devices.get(ctx.deviceId)?.paired).toBe(true);
  });

  it('avisa con un mensaje util cuando la marca no tiene adapter', async () => {
    const device = ctx.devices.get(ctx.deviceId);
    if (!device) throw new Error('falta el dispositivo');
    ctx.devices.upsert({ ...device, brand: 'lg' });

    await expect(ctx.control.sendKey(ctx.deviceId, 'up')).rejects.toMatchObject({
      code: 'no_adapter',
      userMessage: expect.stringContaining('lg'),
    });
  });

  it('avisa cuando el dispositivo ya no existe', async () => {
    await expect(ctx.control.sendKey('no-existe', 'up')).rejects.toMatchObject({
      code: 'device_not_found',
      status: 404,
    });
  });

  it('difunde el cambio de estado al poner un volumen', async () => {
    await ctx.control.pair(ctx.deviceId);
    const recibidos: unknown[] = [];
    ctx.hub.on('message', (m) => recibidos.push(m));

    await ctx.control.setVolume(ctx.deviceId, 33);

    expect(recibidos).toContainEqual(
      expect.objectContaining({ type: 'state', deviceId: ctx.deviceId, volume: 33 }),
    );
  });
});

describe('StateHub', () => {
  it('no repite un mensaje si el estado no cambio', () => {
    const hub = new StateHub();
    const recibidos: unknown[] = [];
    hub.on('message', (m) => recibidos.push(m));

    hub.update('d1', { volume: 10 });
    hub.update('d1', { volume: 10 });
    hub.update('d1', { volume: 11 });

    expect(recibidos).toHaveLength(2);
  });

  it('difunde el cambio de video aunque no cambie nada mas', () => {
    // Regresion: la comparacion no miraba `media`, asi que cambiar de video se
    // descartaba como "sin novedad" y la interfaz seguia mostrando el titulo
    // anterior para siempre.
    const hub = new StateHub();
    const recibidos: unknown[] = [];

    hub.update('d1', { volume: 10, media: { playerState: 'PLAYING', title: 'Primero' } });
    hub.on('message', (m) => recibidos.push(m));
    hub.update('d1', { volume: 10, media: { playerState: 'PLAYING', title: 'Segundo' } });

    expect(recibidos).toContainEqual(
      expect.objectContaining({ media: expect.objectContaining({ title: 'Segundo' }) }),
    );
  });

  it('no difunde por variaciones de menos de un segundo en la posicion', () => {
    // La posicion llega con decimales; sin redondear, cada lectura pareceria un
    // cambio y difundiria sin parar.
    const hub = new StateHub();
    hub.update('d1', { media: { playerState: 'PLAYING', position: 10.1 } });

    const recibidos: unknown[] = [];
    hub.on('message', (m) => recibidos.push(m));
    hub.update('d1', { media: { playerState: 'PLAYING', position: 10.4 } });

    expect(recibidos).toHaveLength(0);
  });
});
