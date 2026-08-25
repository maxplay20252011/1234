import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type FileCheck, type MediaEntry } from '../api.js';
import { useToast } from '../useToasts.js';
import { tap } from '../haptics.js';

/**
 * Explorador de la biblioteca de videos del servidor.
 *
 * Antes de enviar, analiza el archivo y avisa si va a hacer falta convertirlo:
 * es la diferencia entre "el video no arranca y no sé por qué" y "este archivo
 * tiene audio AC3, lo convierto pero va a consumir CPU".
 */
export function FileBrowser({
  deviceId,
  onClose,
  onCasted,
}: {
  deviceId: string;
  onClose: () => void;
  onCasted: () => void;
}): React.JSX.Element {
  const [entries, setEntries] = useState<MediaEntry[]>([]);
  const [path, setPath] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seleccionado, setSeleccionado] = useState<MediaEntry | null>(null);
  const [analisis, setAnalisis] = useState<FileCheck | null>(null);
  const [enviando, setEnviando] = useState(false);
  const toast = useToast();

  const explorar = useCallback(async (destino?: string): Promise<void> => {
    setCargando(true);
    setError(null);
    try {
      const res = await api.browse(destino);
      setEntries(res.entries);
      setPath(res.path);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo leer la carpeta.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void explorar();
  }, [explorar]);

  const elegir = async (entry: MediaEntry): Promise<void> => {
    tap();
    if (entry.isDirectory) {
      void explorar(entry.relativePath);
      return;
    }
    setSeleccionado(entry);
    setAnalisis(null);
    try {
      setAnalisis(await api.checkFile(entry.id));
    } catch {
      // Si el analisis falla se puede enviar igual: no vale bloquear por eso.
      setAnalisis(null);
    }
  };

  const enviar = async (): Promise<void> => {
    if (!seleccionado) return;
    setEnviando(true);
    try {
      await api.castFile(deviceId, seleccionado.id);
      onCasted();
      onClose();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'No se pudo enviar el archivo.');
    } finally {
      setEnviando(false);
    }
  };

  const subir = (): void => {
    const partes = path.split('/').filter(Boolean);
    partes.pop();
    void explorar(partes.join('/') || undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950">
      <header className="flex items-center gap-2 border-b border-neutral-800 px-4 py-3">
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="-ml-2 rounded-xl px-3 py-2 text-neutral-300 active:bg-neutral-800"
        >
          ‹
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Elegir un video</h2>
          <p className="truncate text-xs text-neutral-500">{path || 'Carpeta principal'}</p>
        </div>
        {path && (
          <button
            onClick={subir}
            className="rounded-xl bg-neutral-800 px-3 py-2 text-sm active:bg-neutral-700"
          >
            Subir
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {error ? (
          <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-200 ring-1 ring-amber-500/25">
            {error}
          </div>
        ) : cargando ? (
          <p className="py-10 text-center text-sm text-neutral-500">Leyendo...</p>
        ) : entries.length === 0 ? (
          <p className="py-10 text-center text-sm text-neutral-500">
            Esta carpeta no tiene videos.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {entries.map((e) => (
              <li key={e.id}>
                <button
                  onClick={() => void elegir(e)}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left active:bg-neutral-800 ${
                    seleccionado?.id === e.id ? 'bg-neutral-800 ring-1 ring-sky-500' : 'bg-neutral-900'
                  }`}
                >
                  <span className="shrink-0 text-neutral-500">{e.isDirectory ? '▸' : '·'}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{e.name}</span>
                  {!e.isDirectory && (
                    <span className="shrink-0 text-xs text-neutral-600">{formatearTamanio(e.size)}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {seleccionado && (
        <div className="border-t border-neutral-800 bg-neutral-900 px-4 py-4">
          <p className="truncate text-sm font-medium">{seleccionado.name}</p>

          {analisis ? (
            <>
              <ul className="mt-2 space-y-1">
                {analisis.compatibility.reasons.map((razon) => (
                  <li key={razon} className="text-xs text-neutral-400">
                    {razon}
                  </li>
                ))}
              </ul>
              {analisis.compatibility.warning && (
                <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  {analisis.compatibility.warning}
                </p>
              )}
              {analisis.hasSubtitles && (
                <p className="mt-2 text-xs text-emerald-400">Se encontró un subtítulo al lado.</p>
              )}
            </>
          ) : (
            <p className="mt-2 text-xs text-neutral-500">Analizando el archivo...</p>
          )}

          <button
            onClick={() => void enviar()}
            disabled={enviando}
            className="mt-3 w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-40 active:bg-sky-700"
          >
            {enviando ? 'Enviando...' : 'Reproducir en el televisor'}
          </button>
        </div>
      )}
    </div>
  );
}

function formatearTamanio(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
