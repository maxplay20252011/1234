import { useState } from 'react';
import { api, ApiError } from '../api.js';

/**
 * Pantalla de PIN.
 *
 * Solo aparece si configuraste AUTH_PIN. Dentro de casa normalmente no hace
 * falta; se vuelve imprescindible si el servidor es alcanzable desde afuera.
 */
export function LoginScreen({ onEntrar }: { onEntrar: () => void }): React.JSX.Element {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const entrar = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api.login(pin);
      onEntrar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo entrar.');
      setPin('');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <form onSubmit={(e) => void entrar(e)} className="w-full max-w-xs">
        <h1 className="text-center text-xl font-semibold">Mis televisores</h1>
        <p className="mt-1 text-center text-sm text-neutral-500">Ingresá tu PIN</p>

        <input
          autoFocus
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="mt-6 w-full rounded-xl bg-neutral-900 px-4 py-4 text-center font-mono text-2xl tracking-[0.5em] ring-1 ring-neutral-800 outline-none focus:ring-2 focus:ring-sky-500"
        />

        {error && <p className="mt-3 text-center text-sm text-rose-400">{error}</p>}

        <button
          type="submit"
          disabled={enviando || pin.length === 0}
          className="mt-4 w-full rounded-xl bg-sky-600 px-4 py-3 font-medium text-white disabled:opacity-40 active:bg-sky-700"
        >
          {enviando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
