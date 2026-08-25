import type { RemoteKey } from '@tv-remote/shared';

/**
 * Traduccion de las teclas abstractas a los codigos de Samsung.
 *
 * Solo estan las que tienen equivalente real. Si una tecla no figura aca, el
 * adapter falla con un mensaje claro en vez de mandar un codigo inventado.
 */
export const SAMSUNG_KEYS: Partial<Record<RemoteKey, string>> = {
  up: 'KEY_UP',
  down: 'KEY_DOWN',
  left: 'KEY_LEFT',
  right: 'KEY_RIGHT',
  ok: 'KEY_ENTER',
  back: 'KEY_RETURN',
  home: 'KEY_HOME',
  menu: 'KEY_MENU',
  source: 'KEY_SOURCE',
  exit: 'KEY_EXIT',
  info: 'KEY_INFO',
  volumeUp: 'KEY_VOLUP',
  volumeDown: 'KEY_VOLDOWN',
  mute: 'KEY_MUTE',
  channelUp: 'KEY_CHUP',
  channelDown: 'KEY_CHDOWN',
  play: 'KEY_PLAY',
  pause: 'KEY_PAUSE',
  stop: 'KEY_STOP',
  rewind: 'KEY_REWIND',
  fastForward: 'KEY_FF',
  power: 'KEY_POWER',
};
