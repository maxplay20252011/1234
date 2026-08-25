import { z } from 'zod';

const EnvSchema = z.object({
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8099),
  DISCOVERY_INTERVAL_SECONDS: z.coerce.number().int().min(30).default(300),
  SSDP_TIMEOUT_MS: z.coerce.number().int().min(500).default(4000),
  PROBE_TIMEOUT_MS: z.coerce.number().int().min(200).default(1200),
  AUTH_PIN: z.string().default(''),
  ENCRYPTION_KEY: z.string().default(''),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  DATA_DIR: z.string().default('data'),
  /**
   * Agrega un televisor simulado a la lista. Sirve para probar toda la
   * interfaz sin hardware: MOCK_DEVICE=1 npm start
   */
  MOCK_DEVICE: z.coerce.boolean().default(false),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const detalle = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Hay un problema en tu archivo .env:\n${detalle}`);
  }
  return parsed.data;
}
