import { pino } from 'pino';

const level = process.env['LOG_LEVEL'] ?? 'info';
const pretty = process.env['NODE_ENV'] !== 'production';

export const logger = pino(
  pretty
    ? {
        level,
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : { level },
);

/**
 * Logger para trafico crudo de protocolo. Va siempre a nivel 'debug' para que
 * ponerlo en LOG_LEVEL=debug sea todo lo que hace falta para depurar un TV que
 * no responde, sin tener que tocar codigo.
 */
export function protocolLog(proto: string, direction: 'tx' | 'rx', peer: string, data: unknown): void {
  logger.debug({ proto, direction, peer, data }, `${proto} ${direction} ${peer}`);
}
