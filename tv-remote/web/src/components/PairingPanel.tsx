import { useState } from 'react';
import type { PairingStatus } from '@tv-remote/shared';
import { api, ApiError } from '../api.js';
import { useToast } from '../useToasts.js';

/**
 * Emparejamiento guiado.
 *
 * Cada marca pide algo distinto y el usuario no tiene por que saberlo, asi que
 * el mensaje sale del propio adapter y dice exactamente que va a pasar en la
 * pantalla del televisor.
 */
export function PairingPanel({
  deviceId,
  status,
  onPaired,
}: {
  deviceId: string;
  status: PairingStatus;
  onPaired: () => void;
}): React.JSX.Element | null {
  const [pin, setPin] = useState('');
  const [emparejando, setEmparejando] = useState(false);
  /**
   * Algunas marcas necesitan un paso previo: hay que conectarse para que el
   * televisor muestre el codigo. Hasta que eso pase no tiene sentido pedirle
   * al usuario que escriba nada.
   */
  const [codigoEnPantalla, setCodigoEnPantalla] = useState(
    status.state === 'waiting_for_user',
  );
  const toast = useToast();

  if (status.state === 'paired' || status.state === 'not_required') return null;

  /** Paso 1: conectar para que el televisor muestre el codigo. */
  const empezar = async (): Promise<void> => {
    setEmparejando(true);
    try {
      const nuevo = await api.beginPairing(deviceId);
      if (nuevo.state === 'waiting_for_user') {
        setCodigoEnPantalla(true);
      } else if (nuevo.state === 'paired' || nuevo.state === 'not_required') {
        onPaired();
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'No se pudo iniciar el emparejamiento.');
    } finally {
      setEmparejando(false);
    }
  };

  /** Paso 2 (o unico paso, si la marca no pide codigo). */
  const emparejar = async (): Promise<void> => {
    setEmparejando(true);
    try {
      await api.pair(deviceId, status.needsPin ? pin : undefined);
      toast('Emparejado correctamente.', 'info');
      onPaired();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'No se pudo emparejar.');
    } finally {
      setEmparejando(false);
    }
  };

  // Marcas que piden codigo: primero hay que hacer que aparezca en la pantalla.
  const faltaMostrarCodigo = status.needsPin && !codigoEnPantalla;

  return (
    <div className="rounded-2xl bg-amber-500/10 p-4 ring-1 ring-amber-500/25">
      <h2 className="font-semibold text-amber-200">Falta emparejar</h2>
      <p className="mt-1 text-sm text-amber-100/80">{status.message}</p>

      {status.needsPin && codigoEnPantalla && (
        <input
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={6}
          placeholder="Código que muestra el televisor"
          className="mt-3 w-full rounded-xl bg-neutral-950 px-4 py-3 text-center font-mono text-lg tracking-[0.4em] ring-1 ring-neutral-800 outline-none focus:ring-2 focus:ring-amber-500"
        />
      )}

      {faltaMostrarCodigo ? (
        <button
          onClick={() => void empezar()}
          disabled={emparejando}
          className="mt-3 w-full rounded-xl bg-amber-600 px-4 py-3 font-medium text-white disabled:opacity-40 active:bg-amber-700"
        >
          {emparejando ? 'Conectando con el televisor...' : 'Emparejar'}
        </button>
      ) : (
        <button
          onClick={() => void emparejar()}
          disabled={emparejando || (status.needsPin && pin.trim().length < 4)}
          className="mt-3 w-full rounded-xl bg-amber-600 px-4 py-3 font-medium text-white disabled:opacity-40 active:bg-amber-700"
        >
          {emparejando ? 'Mirá la pantalla del televisor...' : 'Confirmar'}
        </button>
      )}
    </div>
  );
}
