import { z } from 'zod';

/**
 * Teclas del control remoto, en abstracto. Cada adapter las traduce a lo que
 * hable su marca. Deliberadamente NO incluye teclas que solo existan en una
 * marca: lo especifico de cada una va por launchApp o por sendRawKey.
 */
export const RemoteKeySchema = z.enum([
  'up',
  'down',
  'left',
  'right',
  'ok',
  'back',
  'home',
  'menu',
  'source',
  'exit',
  'info',
  'volumeUp',
  'volumeDown',
  'mute',
  'channelUp',
  'channelDown',
  'play',
  'pause',
  'stop',
  'rewind',
  'fastForward',
  'power',
]);
export type RemoteKey = z.infer<typeof RemoteKeySchema>;

export const AppSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string().optional(),
});
export type App = z.infer<typeof AppSchema>;

export const InputSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type Input = z.infer<typeof InputSchema>;

// ─── Peticiones de control ───────────────────────────────────────────────────

export const SendKeyRequestSchema = z.object({
  key: z.enum(RemoteKeySchema.options, { error: 'Esa tecla no existe en el control remoto.' }),
});
export type SendKeyRequest = z.infer<typeof SendKeyRequestSchema>;

/** Pasos de volumen. Es lo unico que soportan todas las marcas. */
export const VolumeStepRequestSchema = z.object({
  delta: z
    .number({ error: 'El paso de volumen tiene que ser un numero.' })
    .int('El paso de volumen tiene que ser un numero entero.')
    .min(-10, 'No se pueden bajar mas de 10 pasos de una vez.')
    .max(10, 'No se pueden subir mas de 10 pasos de una vez.')
    .refine((d) => d !== 0, 'El paso de volumen no puede ser cero.'),
});
export type VolumeStepRequest = z.infer<typeof VolumeStepRequestSchema>;

/** Volumen absoluto. Solo para dispositivos que declaren 'volumeAbsolute'. */
export const SetVolumeRequestSchema = z.object({
  level: z
    .number({ error: 'El volumen tiene que ser un numero.' })
    .int('El volumen tiene que ser un numero entero.')
    .min(0, 'El volumen tiene que estar entre 0 y 100.')
    .max(100, 'El volumen tiene que estar entre 0 y 100.'),
});
export type SetVolumeRequest = z.infer<typeof SetVolumeRequestSchema>;

export const SetMuteRequestSchema = z.object({
  muted: z.boolean({ error: 'Hay que indicar si se silencia o no.' }),
});
export type SetMuteRequest = z.infer<typeof SetMuteRequestSchema>;

export const LaunchAppRequestSchema = z.object({
  appId: z.string().min(1, 'Falta indicar que aplicacion abrir.'),
  deepLink: z.string().optional(),
});
export type LaunchAppRequest = z.infer<typeof LaunchAppRequestSchema>;

// ─── Emparejamiento ──────────────────────────────────────────────────────────

/**
 * Estado del emparejamiento. La interfaz lo usa para guiar al usuario: cada
 * marca pide algo distinto y hay que decirle exactamente que va a pasar en la
 * pantalla del televisor.
 */
export const PairingStateSchema = z.enum([
  'not_required',
  'required',
  'waiting_for_user',
  'paired',
  'rejected',
  'failed',
]);
export type PairingState = z.infer<typeof PairingStateSchema>;

export const PairingStatusSchema = z.object({
  deviceId: z.string(),
  state: PairingStateSchema,
  /** Instrucciones en castellano, listas para mostrar tal cual. */
  message: z.string(),
  /** true si el flujo de esta marca pide un PIN escrito por el usuario. */
  needsPin: z.boolean(),
});
export type PairingStatus = z.infer<typeof PairingStatusSchema>;

export const PairRequestSchema = z.object({ pin: z.string().optional() });
export type PairRequest = z.infer<typeof PairRequestSchema>;

// ─── Mensajes del WebSocket de estado ────────────────────────────────────────

export const ServerMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('devices'), devices: z.array(z.unknown()) }),
  z.object({
    type: z.literal('state'),
    deviceId: z.string(),
    powered: z.boolean().optional(),
    volume: z.number().optional(),
    muted: z.boolean().optional(),
    currentApp: z.string().optional(),
    currentInput: z.string().optional(),
    updatedAt: z.string(),
  }),
  z.object({ type: z.literal('scanning'), scanning: z.boolean() }),
  z.object({ type: z.literal('pairing'), status: PairingStatusSchema }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
