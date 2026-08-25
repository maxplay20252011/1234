import { useCallback, useEffect, useState } from 'react';
import type { Device } from '@tv-remote/shared';
import { api, ApiError } from './api.js';
import { useLiveState } from './useLiveState.js';
import { DeviceCard } from './components/DeviceCard.js';
import { AddDeviceDialog } from './components/AddDeviceDialog.js';
import { InstallHint } from './components/InstallHint.js';
import { ControlScreen } from './components/ControlScreen.js';

export function App(): React.JSX.Element {
  const [devices, setDevices] = useState<Device[]>([]);
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);

  const live = useLiveState();

  const refrescar = useCallback(async (): Promise<void> => {
    try {
      const res = await api.listDevices();
      setDevices(res.devices);
      setLastScanAt(res.lastScanAt);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar la lista.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void refrescar();
  }, [refrescar]);

  // El WebSocket avisa cuando termina un escaneo. Ya no hace falta sondear.
  useEffect(() => {
    if (live.devices) {
      setDevices(live.devices);
      setLastScanAt(new Date().toISOString());
    }
  }, [live.devices]);

  const escanear = async (): Promise<void> => {
    try {
      await api.startScan();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar el escaneo.');
    }
  };

  const actual = devices.find((d) => d.id === seleccionado);
  if (actual) {
    return (
      <ControlScreen
        device={actual}
        live={live.states[actual.id]}
        onBack={() => setSeleccionado(null)}
      />
    );
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold">Mis televisores</h1>
            <p className="truncate text-xs text-neutral-500">
              {live.scanning
                ? 'Buscando en la red...'
                : !live.connected
                  ? 'Sin conexión con el servidor'
                  : lastScanAt
                    ? `Último escaneo ${new Date(lastScanAt).toLocaleTimeString('es-AR')}`
                    : 'Sin escanear todavía'}
            </p>
          </div>
          <button
            onClick={() => void escanear()}
            disabled={live.scanning}
            className="shrink-0 rounded-xl bg-neutral-800 px-4 py-2 text-sm font-medium disabled:opacity-40 active:bg-neutral-700"
          >
            {live.scanning ? 'Buscando' : 'Buscar'}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-4">
        <InstallHint />

        {error && (
          <div className="mb-4 rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-300 ring-1 ring-rose-500/25">
            {error}
          </div>
        )}

        {cargando ? (
          <p className="py-12 text-center text-sm text-neutral-500">Cargando...</p>
        ) : devices.length === 0 ? (
          <EmptyState scanning={live.scanning} />
        ) : (
          <div className="grid gap-3">
            {devices.map((d) => (
              <DeviceCard
                key={d.id}
                device={d}
                state={live.states[d.id]}
                onOpen={() => setSeleccionado(d.id)}
              />
            ))}
          </div>
        )}

        <button
          onClick={() => setMostrarAlta(true)}
          className="mt-4 w-full rounded-2xl border border-dashed border-neutral-800 px-4 py-4 text-sm text-neutral-400 active:bg-neutral-900"
        >
          No aparece mi televisor: agregarlo por IP
        </button>
      </main>

      {mostrarAlta && (
        <AddDeviceDialog onClose={() => setMostrarAlta(false)} onAdded={() => void refrescar()} />
      )}
    </div>
  );
}

function EmptyState({ scanning }: { scanning: boolean }): React.JSX.Element {
  return (
    <div className="rounded-2xl bg-neutral-900 px-5 py-8 text-center ring-1 ring-neutral-800">
      <p className="font-medium">
        {scanning ? 'Buscando dispositivos...' : 'Todavía no encontramos nada'}
      </p>
      {!scanning && (
        <ul className="mx-auto mt-4 max-w-sm space-y-2 text-left text-sm text-neutral-400">
          <li>1. El televisor tiene que estar encendido.</li>
          <li>2. Tiene que estar en la misma red que esta computadora.</li>
          <li>
            3. Ojo con las redes de invitados y con el aislamiento de clientes del router: bloquean
            el descubrimiento automático.
          </li>
          <li>
            4. Desde la terminal, <code className="text-neutral-300">npm run discover -- --raw</code>{' '}
            muestra qué está pasando en detalle.
          </li>
        </ul>
      )}
    </div>
  );
}
