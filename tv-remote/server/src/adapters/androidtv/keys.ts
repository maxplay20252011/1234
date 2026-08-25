import type { RemoteKey } from '@tv-remote/shared';

/**
 * Codigos de tecla de Android.
 *
 * Son las constantes publicas de android.view.KeyEvent, no ingenieria inversa:
 * es la parte mas solida de este adapter.
 */
export const ANDROID_KEYCODES: Partial<Record<RemoteKey, number>> = {
  home: 3, // KEYCODE_HOME
  back: 4, // KEYCODE_BACK
  up: 19, // KEYCODE_DPAD_UP
  down: 20, // KEYCODE_DPAD_DOWN
  left: 21, // KEYCODE_DPAD_LEFT
  right: 22, // KEYCODE_DPAD_RIGHT
  ok: 23, // KEYCODE_DPAD_CENTER
  volumeUp: 24, // KEYCODE_VOLUME_UP
  volumeDown: 25, // KEYCODE_VOLUME_DOWN
  power: 26, // KEYCODE_POWER
  menu: 82, // KEYCODE_MENU
  stop: 86, // KEYCODE_MEDIA_STOP
  rewind: 89, // KEYCODE_MEDIA_REWIND
  fastForward: 90, // KEYCODE_MEDIA_FAST_FORWARD
  play: 126, // KEYCODE_MEDIA_PLAY
  pause: 127, // KEYCODE_MEDIA_PAUSE
  mute: 164, // KEYCODE_VOLUME_MUTE
  info: 165, // KEYCODE_INFO
  channelUp: 166, // KEYCODE_CHANNEL_UP
  channelDown: 167, // KEYCODE_CHANNEL_DOWN
  source: 178, // KEYCODE_TV_INPUT
};

/** 'exit' no tiene equivalente en Android: se resuelve con 'back'. */
export const SIN_EQUIVALENTE: readonly RemoteKey[] = ['exit'];
