import { useState } from 'react';
import { api, ApiError } from '../api.js';

/**
 * Alta manual por IP.
 *
 * Es la valvula de escape para las redes donde el multicast no llega: routers
 * con aislamiento de clientes, VLANs separadas, algunos sistemas mesh. Sin
 * esto, quien tenga esa configuracion se queda sin ninguna alternativa.
 */
export function AddDeviceDialog({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}): React.JSX.Element {
  const [ip, setIp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await api.addManualDevice(ip.trim());
      onAdded();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo agregar el dispositivo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void enviar(e)}
        className="w-full max-w-sm rounded-2xl bg-neutral-900 ring-1 ring-neutral-800 p-5"
      >
        <h2 className="text-lg font-semibold">Agregar por IP</h2>
        <p className="mt-1 text-sm text-neutral-400">
          Usalo si tu televisor no aparece solo. La IP la encontras en el menu de red del
          televisor.
        </p>

        <input
          autoFocus
          inputMode="decimal"
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          placeholder="192.168.1.42"
          className="mt-4 w-full rounded-xl bg-neutral-950 px-4 py-3 font-mono text-base ring-1 ring-neutral-800 outline-none focus:ring-2 focus:ring-sky-500"
        />

        {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-neutral-800 px-4 py-3 text-sm font-medium active:bg-neutral-700"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={enviando || ip.trim().length === 0}
            className="flex-1 rounded-xl bg-sky-600 px-4 py-3 text-sm font-medium disabled:opacity-40 active:bg-sky-700"
          >
            {enviando ? 'Buscando...' : 'Agregar'}
          </button>
        </div>
      </form>
    </div>
  );
}
