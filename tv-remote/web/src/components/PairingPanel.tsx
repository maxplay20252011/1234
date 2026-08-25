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
  const toast = useToast();

  if (status.state === 'paired' || status.state === 'not_required') return null;

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

  return (
    <div className="rounded-2xl bg-amber-500/10 p-4 ring-1 ring-amber-500/25">
      <h2 className="font-semibold text-amber-200">Falta emparejar</h2>
      <p className="mt-1 text-sm text-amber-100/80">{status.message}</p>

      {status.needsPin && (
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          inputMode="numeric"
          placeholder="PIN que aparece en el televisor"
          className="mt-3 w-full rounded-xl bg-neutral-950 px-4 py-3 font-mono ring-1 ring-neutral-800 outline-none focus:ring-2 focus:ring-amber-500"
        />
      )}

      <button
        onClick={() => void emparejar()}
        disabled={emparejando || (status.needsPin && pin.trim().length === 0)}
        className="mt-3 w-full rounded-xl bg-amber-600 px-4 py-3 font-medium text-white disabled:opacity-40 active:bg-amber-700"
      >
        {emparejando ? 'Mirá la pantalla del televisor...' : 'Emparejar'}
      </button>
    </div>
  );
}
