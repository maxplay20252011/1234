/**
 * Vibracion al tocar un boton.
 *
 * Safari en iOS no soporta navigator.vibrate y nunca lo va a soportar desde una
 * pagina web, asi que se comprueba antes de llamarla. Sin esta guarda, iOS
 * lanza una excepcion y rompe el manejador del toque entero.
 */
export function tap(ms = 8): void {
  if (typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(ms);
  } catch {
    // Algunos navegadores la exponen pero la bloquean por politica de permisos.
  }
}
