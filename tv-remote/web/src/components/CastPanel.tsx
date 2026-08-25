import { useCallback, useEffect, useState } from 'react';
import type { MediaState } from '@tv-remote/shared';
import { api, ApiError, type HistoryEntry } from '../api.js';
import { useToast } from '../useToasts.js';
import { tap } from '../haptics.js';

/**
 * Enviar contenido al televisor.
 *
 * Acepta una URL directa a un archivo de video. NO acepta la pagina de un
 * servicio: el receptor espera un stream, no HTML. Se avisa antes de mandar,
 * asi el usuario no descubre la limitacion por un error del aparato.
 */
export function CastPanel({
  deviceId,
  media,
  onChanged,
}: {
  deviceId: string;
  media: MediaState | undefined;
  onChanged: () => void;
}): React.JSX.Element {
  const [url, setUrl] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [historial, setHistorial] = useState<HistoryEntry[]>([]);
  const toast = useToast();

  const cargarHistorial = useCallback(async (): Promise<void> => {
    try {
      setHistorial((await api.history(deviceId)).history);
    } catch {
      setHistorial([]);
    }
  }, [deviceId]);

  useEffect(() => {
    void cargarHistorial();
  }, [cargarHistorial]);

  const castear = async (direccion: string): Promise<void> => {
    const limpia = direccion.trim();
    if (limpia.length === 0) return;

    setEnviando(true);
    try {
      await api.castUrl(deviceId, { url: limpia });
      setUrl('');
      onChanged();
      void cargarHistorial();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'No se pudo enviar el video.');
    } finally {
      setEnviando(false);
    }
  };

  const cortar = async (): Promise<void> => {
    try {
      await api.stopCast(deviceId);
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'No se pudo cortar la reproducción.');
    }
  };

  const reproduciendo = media?.playerState !== undefined && media.playerState !== 'IDLE';

  return (
    <section className="space-y-3">
      <h2 className="text-sm text-neutral-400">Enviar contenido</h2>

      {reproduciendo && (
        <div className="rounded-2xl bg-neutral-900 p-4 ring-1 ring-neutral-800">
          <p className="truncate text-sm font-medium">{media?.title ?? 'Reproduciendo'}</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {etiquetaEstado(media?.playerState)}
            {media?.duration ? ` · ${formatearTiempo(media.duration)}` : ''}
          </p>
          {media?.duration ? (
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full bg-sky-500 transition-[width]"
                style={{ width: `${Math.min(100, ((media.position ?? 0) / media.duration) * 100)}%` }}
              />
            </div>
          ) : null}
          <button
            onClick={() => {
              tap();
              void cortar();
            }}
            className="mt-3 w-full rounded-xl bg-neutral-800 px-4 py-2.5 text-sm active:bg-neutral-700"
          >
            Cortar
          </button>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void castear(url);
        }}
        className="space-y-2"
      >
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="https://.../video.mp4"
          className="w-full rounded-xl bg-neutral-950 px-4 py-3 text-sm ring-1 ring-neutral-800 outline-none focus:ring-2 focus:ring-sky-500"
        />
        <button
          type="submit"
          disabled={enviando || url.trim().length === 0}
          className="w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-40 active:bg-sky-700"
        >
          {enviando ? 'Enviando...' : 'Reproducir en el televisor'}
        </button>
        <p className="text-xs text-neutral-600">
          Tiene que ser un enlace directo a un archivo de video, del tipo que termina en
          <code className="mx-1 text-neutral-500">.mp4</code>. Un enlace de YouTube o de Netflix
          no funciona acá: son páginas, no videos.
        </p>
      </form>

      {historial.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs text-neutral-500">Reproducido antes</h3>
            <button
              onClick={() => {
                void api.clearHistory(deviceId).then(cargarHistorial);
              }}
              className="text-xs text-neutral-600 active:text-neutral-400"
            >
              Borrar
            </button>
          </div>
          {historial.map((h) => (
            <button
              key={h.id}
              onClick={() => {
                tap();
                void castear(h.url);
              }}
              className="w-full truncate rounded-xl bg-neutral-900 px-4 py-2.5 text-left text-xs text-neutral-300 ring-1 ring-neutral-800 active:bg-neutral-800"
            >
              {h.title ?? h.url}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function etiquetaEstado(playerState: string | undefined): string {
  const etiquetas: Record<string, string> = {
    PLAYING: 'Reproduciendo',
    PAUSED: 'En pausa',
    BUFFERING: 'Cargando',
    IDLE: 'Detenido',
  };
  return etiquetas[playerState ?? ''] ?? (playerState ?? '');
}

function formatearTiempo(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = Math.floor(segundos % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
