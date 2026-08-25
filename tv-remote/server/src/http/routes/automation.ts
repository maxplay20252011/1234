import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  CreateGroupRequestSchema,
  CreateSceneRequestSchema,
  SendKeyRequestSchema,
  VolumeStepRequestSchema,
} from '@tv-remote/shared';
import { ControlError } from '../../adapters/errors.js';
import type { GroupsRepo, ScenesRepo } from '../../services/automation.repo.js';
import type { SceneRunner } from '../../services/scene-runner.js';
import { runOnGroup } from '../../services/scene-runner.js';
import type { ControlService } from '../../services/control.js';

export function registerAutomationRoutes(
  app: FastifyInstance,
  groups: GroupsRepo,
  scenes: ScenesRepo,
  runner: SceneRunner,
  control: ControlService,
): void {
  const ejecutar = async (reply: FastifyReply, accion: () => Promise<unknown>): Promise<unknown> => {
    try {
      return (await accion()) ?? { ok: true };
    } catch (err) {
      if (err instanceof ControlError) {
        return reply.code(err.status).send({ error: err.code, message: err.userMessage });
      }
      app.log.error({ err }, 'Fallo una accion de automatizacion');
      return reply
        .code(500)
        .send({ error: 'internal', message: 'Algo salio mal. Proba de nuevo.' });
    }
  };

  // ─── Grupos ────────────────────────────────────────────────────────────────

  app.get('/api/groups', async () => ({ groups: groups.list() }));

  app.post('/api/groups', async (req, reply) => {
    const parsed = CreateGroupRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: parsed.error.issues[0]?.message ?? 'Los datos del grupo no son validos.',
      });
    }
    return reply.code(201).send(groups.create(parsed.data));
  });

  app.put<{ Params: { id: string } }>('/api/groups/:id', async (req, reply) => {
    const parsed = CreateGroupRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: parsed.error.issues[0]?.message ?? 'Los datos del grupo no son validos.',
      });
    }
    const grupo = groups.update(req.params.id, parsed.data);
    if (!grupo) {
      return reply.code(404).send({ error: 'not_found', message: 'Ese grupo ya no existe.' });
    }
    return grupo;
  });

  app.delete<{ Params: { id: string } }>('/api/groups/:id', async (req, reply) => {
    groups.remove(req.params.id);
    return reply.code(204).send();
  });

  /**
   * Acciones en lote. Se responde SIEMPRE 200 con el detalle por dispositivo:
   * que un televisor este apagado no invalida la accion sobre los demas, y el
   * usuario tiene que poder ver cual fallo.
   */
  app.post<{ Params: { id: string } }>('/api/groups/:id/key', async (req, reply) => {
    const grupo = groups.get(req.params.id);
    if (!grupo) {
      return reply.code(404).send({ error: 'not_found', message: 'Ese grupo ya no existe.' });
    }
    const parsed = SendKeyRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: parsed.error.issues[0]?.message ?? 'Esa tecla no existe.',
      });
    }
    return {
      results: await runOnGroup(grupo.deviceIds, (id) => control.sendKey(id, parsed.data.key)),
    };
  });

  app.post<{ Params: { id: string } }>('/api/groups/:id/volume/step', async (req, reply) => {
    const grupo = groups.get(req.params.id);
    if (!grupo) {
      return reply.code(404).send({ error: 'not_found', message: 'Ese grupo ya no existe.' });
    }
    const parsed = VolumeStepRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: parsed.error.issues[0]?.message ?? 'El paso de volumen no es valido.',
      });
    }
    return {
      results: await runOnGroup(grupo.deviceIds, (id) => control.volumeStep(id, parsed.data.delta)),
    };
  });

  app.post<{ Params: { id: string; accion: 'on' | 'off' } }>(
    '/api/groups/:id/power/:accion',
    async (req, reply) => {
      const grupo = groups.get(req.params.id);
      if (!grupo) {
        return reply.code(404).send({ error: 'not_found', message: 'Ese grupo ya no existe.' });
      }
      const encender = req.params.accion === 'on';
      return {
        results: await runOnGroup(grupo.deviceIds, (id) =>
          encender ? control.powerOn(id) : control.powerOff(id),
        ),
      };
    },
  );

  // ─── Escenas ───────────────────────────────────────────────────────────────

  app.get('/api/scenes', async () => ({ scenes: scenes.list() }));

  app.post('/api/scenes', async (req, reply) => {
    const parsed = CreateSceneRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: parsed.error.issues[0]?.message ?? 'Los datos de la escena no son validos.',
      });
    }
    return reply.code(201).send(scenes.create(parsed.data));
  });

  app.put<{ Params: { id: string } }>('/api/scenes/:id', async (req, reply) => {
    const parsed = CreateSceneRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: parsed.error.issues[0]?.message ?? 'Los datos de la escena no son validos.',
      });
    }
    const escena = scenes.update(req.params.id, parsed.data);
    if (!escena) {
      return reply.code(404).send({ error: 'not_found', message: 'Esa escena ya no existe.' });
    }
    return escena;
  });

  app.delete<{ Params: { id: string } }>('/api/scenes/:id', async (req, reply) => {
    scenes.remove(req.params.id);
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string } }>('/api/scenes/:id/run', async (req, reply) => {
    const escena = scenes.get(req.params.id);
    if (!escena) {
      return reply.code(404).send({ error: 'not_found', message: 'Esa escena ya no existe.' });
    }
    return ejecutar(reply, () => runner.run(escena));
  });
}
