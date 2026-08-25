import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  CastUrlRequestSchema,
  LaunchAppRequestSchema,
  PairRequestSchema,
  SendKeyRequestSchema,
  SetMuteRequestSchema,
  SetVolumeRequestSchema,
  VolumeStepRequestSchema,
} from '@tv-remote/shared';
import type { z } from 'zod';
import { ControlError } from '../../adapters/errors.js';
import type { ControlService } from '../../services/control.js';
import type { MediaHistoryRepo } from '../../services/media-history.repo.js';

type ParamsConId = { id: string };

export function registerControlRoutes(
  app: FastifyInstance,
  control: ControlService,
  history: MediaHistoryRepo,
): void {
  /**
   * Envoltorio comun de todas las acciones.
   *
   * Traduce los errores del dominio al mensaje en castellano que la interfaz
   * muestra tal cual. La regla es que nunca llegue un "Error" generico: si el
   * televisor esta apagado hay que decir eso.
   */
  const ejecutar = async (reply: FastifyReply, accion: () => Promise<unknown>): Promise<unknown> => {
    try {
      const resultado = await accion();
      return resultado ?? { ok: true };
    } catch (err) {
      if (err instanceof ControlError) {
        return reply.code(err.status).send({ error: err.code, message: err.userMessage });
      }
      app.log.error({ err }, 'Fallo un comando de control');
      return reply.code(500).send({
        error: 'internal',
        message: 'Algo salio mal al hablar con el televisor. Proba de nuevo.',
      });
    }
  };

  /** Valida el body y responde 400 con el mensaje del schema si no cierra. */
  const parse = <T extends z.ZodType>(
    schema: T,
    body: unknown,
    reply: FastifyReply,
  ): z.infer<T> | undefined => {
    const parsed = schema.safeParse(body);
    if (parsed.success) return parsed.data;
    void reply.code(400).send({
      error: 'invalid_request',
      message: parsed.error.issues[0]?.message ?? 'Los datos enviados no son validos.',
    });
    return undefined;
  };

  app.get<{ Params: ParamsConId }>('/api/devices/:id/state', async (req, reply) =>
    ejecutar(reply, () => control.refreshState(req.params.id)),
  );

  app.post<{ Params: ParamsConId }>('/api/devices/:id/capabilities', async (req, reply) =>
    ejecutar(reply, async () => ({ capabilities: await control.refreshCapabilities(req.params.id) })),
  );

  app.get<{ Params: ParamsConId }>('/api/devices/:id/pairing', async (req, reply) =>
    ejecutar(reply, () => control.pairingStatus(req.params.id)),
  );

  app.post<{ Params: ParamsConId }>('/api/devices/:id/pair', async (req, reply) => {
    const body = parse(PairRequestSchema, req.body ?? {}, reply);
    if (!body) return reply;
    return ejecutar(reply, () => control.pair(req.params.id, body.pin));
  });

  app.post<{ Params: ParamsConId }>('/api/devices/:id/key', async (req, reply) => {
    const body = parse(SendKeyRequestSchema, req.body, reply);
    if (!body) return reply;
    return ejecutar(reply, () => control.sendKey(req.params.id, body.key));
  });

  app.post<{ Params: ParamsConId }>('/api/devices/:id/volume/step', async (req, reply) => {
    const body = parse(VolumeStepRequestSchema, req.body, reply);
    if (!body) return reply;
    return ejecutar(reply, () => control.volumeStep(req.params.id, body.delta));
  });

  app.post<{ Params: ParamsConId }>('/api/devices/:id/volume', async (req, reply) => {
    const body = parse(SetVolumeRequestSchema, req.body, reply);
    if (!body) return reply;
    return ejecutar(reply, () => control.setVolume(req.params.id, body.level));
  });

  app.post<{ Params: ParamsConId }>('/api/devices/:id/mute', async (req, reply) => {
    const body = parse(SetMuteRequestSchema, req.body, reply);
    if (!body) return reply;
    return ejecutar(reply, () => control.setMute(req.params.id, body.muted));
  });

  app.post<{ Params: ParamsConId }>('/api/devices/:id/power/on', async (req, reply) =>
    ejecutar(reply, () => control.powerOn(req.params.id)),
  );

  app.post<{ Params: ParamsConId }>('/api/devices/:id/power/off', async (req, reply) =>
    ejecutar(reply, () => control.powerOff(req.params.id)),
  );

  app.get<{ Params: ParamsConId }>('/api/devices/:id/inputs', async (req, reply) =>
    ejecutar(reply, async () => ({ inputs: await control.listInputs(req.params.id) })),
  );

  app.post<{ Params: ParamsConId; Body: { inputId?: unknown } }>(
    '/api/devices/:id/input',
    async (req, reply) => {
      const inputId = req.body?.inputId;
      if (typeof inputId !== 'string' || inputId.length === 0) {
        return reply.code(400).send({ error: 'invalid_request', message: 'Falta la entrada.' });
      }
      return ejecutar(reply, () => control.setInput(req.params.id, inputId));
    },
  );

  app.get<{ Params: ParamsConId }>('/api/devices/:id/apps', async (req, reply) =>
    ejecutar(reply, async () => ({ apps: await control.listApps(req.params.id) })),
  );

  app.post<{ Params: ParamsConId }>('/api/devices/:id/app', async (req, reply) => {
    const body = parse(LaunchAppRequestSchema, req.body, reply);
    if (!body) return reply;
    return ejecutar(reply, () => control.launchApp(req.params.id, body.appId, body.deepLink));
  });

  // ─── Casteo ────────────────────────────────────────────────────────────────

  app.post<{ Params: ParamsConId }>('/api/devices/:id/cast', async (req, reply) => {
    const body = parse(CastUrlRequestSchema, req.body, reply);
    if (!body) return reply;
    return ejecutar(reply, () => control.castUrl(req.params.id, body));
  });

  app.post<{ Params: ParamsConId }>('/api/devices/:id/cast/stop', async (req, reply) =>
    ejecutar(reply, () => control.stopCast(req.params.id)),
  );

  app.post<{ Params: ParamsConId; Body: { fileId?: unknown } }>(
    '/api/devices/:id/cast/file',
    async (req, reply) => {
      const fileId = req.body?.fileId;
      if (typeof fileId !== 'string' || fileId.length === 0) {
        return reply
          .code(400)
          .send({ error: 'invalid_request', message: 'Falta indicar que archivo enviar.' });
      }
      return ejecutar(reply, () => control.castFile(req.params.id, fileId));
    },
  );

  app.get<{ Params: ParamsConId }>('/api/devices/:id/history', async (req, reply) =>
    ejecutar(reply, async () => ({ history: history.list(req.params.id) })),
  );

  app.delete<{ Params: ParamsConId }>('/api/devices/:id/history', async (req, reply) => {
    history.clear(req.params.id);
    return reply.code(204).send();
  });
}
