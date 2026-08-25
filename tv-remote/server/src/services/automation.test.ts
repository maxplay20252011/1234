import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../db/schema.js';
import { DevicesRepo } from '../db/devices.repo.js';
import { CredentialsRepo } from './credentials.repo.js';
import { deriveKey } from './crypto.js';
import { StateHub } from './state-hub.js';
import { ControlService } from './control.js';
import { MediaHistoryRepo } from './media-history.repo.js';
import { MediaCaster } from './media-caster.js';
import { MediaLibrary } from '../media/library.js';
import { GroupsRepo, ScenesRepo } from './automation.repo.js';
import { SceneRunner, runOnGroup } from './scene-runner.js';
import { AdapterRegistry } from '../adapters/types.js';
import { MockAdapter, buildMockDevice } from '../adapters/mock/index.js';

function montar() {
  const db = new Database(':memory:');
  for (const sql of MIGRATIONS) db.exec(sql);

  const devices = new DevicesRepo(db);
  const credentials = new CredentialsRepo(db, deriveKey('clave'));
  const hub = new StateHub();
  const registry = new AdapterRegistry();
  registry.register(new MockAdapter());

  const device = buildMockDevice();
  devices.upsert(device);

  const control = new ControlService(
    devices,
    credentials,
    registry,
    hub,
    new MediaHistoryRepo(db),
    new MediaCaster(new MediaLibrary([]), 'clave', 8099, 3600),
  );

  return {
    db,
    devices,
    control,
    deviceId: device.id,
    groups: new GroupsRepo(db),
    scenes: new ScenesRepo(db),
    runner: new SceneRunner(control),
  };
}

describe('GroupsRepo', () => {
  let ctx: ReturnType<typeof montar>;
  beforeEach(() => {
    ctx = montar();
  });

  it('crea un grupo con sus dispositivos', () => {
    const grupo = ctx.groups.create({ name: 'Living', deviceIds: [ctx.deviceId] });
    expect(grupo.name).toBe('Living');
    expect(ctx.groups.get(grupo.id)?.deviceIds).toEqual([ctx.deviceId]);
  });

  it('reemplaza la lista de dispositivos al actualizar, no la acumula', () => {
    const grupo = ctx.groups.create({ name: 'Living', deviceIds: [ctx.deviceId] });
    ctx.groups.update(grupo.id, { name: 'Living', deviceIds: [] });
    expect(ctx.groups.get(grupo.id)?.deviceIds).toEqual([]);
  });

  it('al borrar un dispositivo lo saca de los grupos', () => {
    // La clave foranea con ON DELETE CASCADE evita grupos con miembros fantasma.
    const grupo = ctx.groups.create({ name: 'Living', deviceIds: [ctx.deviceId] });
    ctx.db.prepare('DELETE FROM devices WHERE id = ?').run(ctx.deviceId);
    expect(ctx.groups.get(grupo.id)?.deviceIds).toEqual([]);
  });

  it('borrar un grupo no borra los dispositivos', () => {
    const grupo = ctx.groups.create({ name: 'Living', deviceIds: [ctx.deviceId] });
    ctx.groups.remove(grupo.id);
    expect(ctx.devices.get(ctx.deviceId)).toBeDefined();
  });
});

describe('SceneRunner', () => {
  let ctx: ReturnType<typeof montar>;
  beforeEach(async () => {
    ctx = montar();
    await ctx.control.refreshCapabilities(ctx.deviceId);
    await ctx.control.pair(ctx.deviceId);
  });

  it('ejecuta los pasos EN ORDEN y en serie', async () => {
    // Una escena "encender, esperar, poner HDMI2" no significa nada si los
    // pasos se pisan entre si.
    const escena = ctx.scenes.create({
      name: 'Modo peli',
      steps: [
        { type: 'setVolume', deviceId: ctx.deviceId, level: 30 },
        { type: 'setInput', deviceId: ctx.deviceId, inputId: 'hdmi2' },
        { type: 'setVolume', deviceId: ctx.deviceId, level: 15 },
      ],
    });

    const resultado = await ctx.runner.run(escena);

    expect(resultado.ok).toBe(true);
    expect(resultado.results.map((r) => r.index)).toEqual([0, 1, 2]);
    // El ultimo paso gana: prueba que corrieron en orden y no en paralelo.
    const estado = await ctx.control.refreshState(ctx.deviceId);
    expect(estado.volume).toBe(15);
    expect(estado.currentInput).toBe('hdmi2');
  });

  it('la espera de verdad espera', async () => {
    const escena = ctx.scenes.create({
      name: 'Con espera',
      steps: [{ type: 'wait', seconds: 0.3 }],
    });
    const inicio = Date.now();
    await ctx.runner.run(escena);
    expect(Date.now() - inicio).toBeGreaterThanOrEqual(280);
  });

  it('un paso que falla NO corta la escena', async () => {
    // Si el televisor del cuarto no responde, el del living igual tiene que
    // encenderse.
    const escena = ctx.scenes.create({
      name: 'Con un paso roto',
      steps: [
        { type: 'setVolume', deviceId: 'no-existe', level: 10 },
        { type: 'setVolume', deviceId: ctx.deviceId, level: 25 },
      ],
    });

    const resultado = await ctx.runner.run(escena);

    expect(resultado.ok).toBe(false);
    expect(resultado.results[0]?.ok).toBe(false);
    expect(resultado.results[0]?.error).toContain('dispositivo');
    // El segundo paso corrio igual.
    expect(resultado.results[1]?.ok).toBe(true);
    expect((await ctx.control.refreshState(ctx.deviceId)).volume).toBe(25);
  });

  it('informa el error de cada paso en castellano', async () => {
    const escena = ctx.scenes.create({
      name: 'Rota',
      steps: [{ type: 'key', deviceId: 'fantasma', key: 'up' }],
    });
    const resultado = await ctx.runner.run(escena);
    expect(resultado.results[0]?.error).toBeTruthy();
    expect(resultado.results[0]?.error).not.toContain('Error:');
  });

  it('una escena que se guardo corrupta no rompe: sale vacia', () => {
    const escena = ctx.scenes.create({ name: 'X', steps: [{ type: 'wait', seconds: 1 }] });
    ctx.db.prepare('UPDATE scenes SET steps = ? WHERE id = ?').run('{roto', escena.id);
    expect(ctx.scenes.get(escena.id)?.steps).toEqual([]);
  });
});

describe('runOnGroup', () => {
  it('sigue con los demas aunque uno falle, y dice cual fue', async () => {
    const resultados = await runOnGroup(['a', 'b', 'c'], async (id) => {
      if (id === 'b') throw new Error('roto');
      return id;
    });

    expect(resultados.map((r) => r.ok)).toEqual([true, false, true]);
    expect(resultados[1]?.deviceId).toBe('b');
    expect(resultados[1]?.error).toBeTruthy();
  });

  it('devuelve una lista vacia con un grupo sin dispositivos', async () => {
    expect(await runOnGroup([], async () => undefined)).toEqual([]);
  });
});
