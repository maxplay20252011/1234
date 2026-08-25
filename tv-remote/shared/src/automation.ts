import { z } from 'zod';
import { RemoteKeySchema } from './remote.js';

export const GroupSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(60),
  deviceIds: z.array(z.string()),
  createdAt: z.string(),
});
export type Group = z.infer<typeof GroupSchema>;

export const CreateGroupRequestSchema = z.object({
  name: z.string().min(1, 'El grupo necesita un nombre.').max(60, 'El nombre es demasiado largo.'),
  deviceIds: z.array(z.string()).default([]),
});
export type CreateGroupRequest = z.infer<typeof CreateGroupRequestSchema>;

/**
 * Un paso de una escena.
 *
 * `wait` no es un adorno: un televisor recien encendido ignora los comandos
 * durante varios segundos, asi que sin esperas la escena "enciende y pone
 * HDMI2" enciende y no hace nada mas.
 */
export const SceneStepSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('powerOn'), deviceId: z.string() }),
  z.object({ type: z.literal('powerOff'), deviceId: z.string() }),
  z.object({ type: z.literal('setVolume'), deviceId: z.string(), level: z.number().int().min(0).max(100) }),
  z.object({ type: z.literal('setInput'), deviceId: z.string(), inputId: z.string() }),
  z.object({ type: z.literal('key'), deviceId: z.string(), key: RemoteKeySchema }),
  z.object({ type: z.literal('castUrl'), deviceId: z.string(), url: z.string() }),
  z.object({
    type: z.literal('wait'),
    seconds: z
      .number()
      .min(0.1, 'La espera tiene que ser de al menos una decima de segundo.')
      .max(120, 'Una espera de mas de dos minutos seguramente sea un error.'),
  }),
]);
export type SceneStep = z.infer<typeof SceneStepSchema>;

export const SceneSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(60),
  steps: z.array(SceneStepSchema),
  createdAt: z.string(),
});
export type Scene = z.infer<typeof SceneSchema>;

export const CreateSceneRequestSchema = z.object({
  name: z.string().min(1, 'La escena necesita un nombre.').max(60, 'El nombre es demasiado largo.'),
  steps: z.array(SceneStepSchema).min(1, 'La escena necesita al menos un paso.'),
});
export type CreateSceneRequest = z.infer<typeof CreateSceneRequestSchema>;

/** Resultado de cada paso. Una escena informa que salio bien y que no. */
export const SceneStepResultSchema = z.object({
  index: z.number().int(),
  ok: z.boolean(),
  error: z.string().optional(),
});
export type SceneStepResult = z.infer<typeof SceneStepResultSchema>;

export const RunSceneResultSchema = z.object({
  sceneId: z.string(),
  results: z.array(SceneStepResultSchema),
  /** true si TODOS los pasos salieron bien. */
  ok: z.boolean(),
});
export type RunSceneResult = z.infer<typeof RunSceneResultSchema>;
