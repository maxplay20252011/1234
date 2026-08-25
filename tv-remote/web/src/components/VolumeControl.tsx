import { useRef } from 'react';
import { tap } from '../haptics.js';
import { SpeakerOn, SpeakerMuted } from './icons.js';

/**
 * Volumen: botones y gesto vertical.
 *
 * El deslizamiento manda pasos, no un valor absoluto, porque los pasos los
 * soporta cualquier televisor. El control deslizante de valor exacto solo
 * aparece si el dispositivo declaro 'volumeAbsolute'.
 */
export function VolumeControl({
  volume,
  muted,
  canSetAbsolute,
  disabled,
  onStep,
  onSet,
  onToggleMute,
}: {
  volume: number | undefined;
  muted: boolean | undefined;
  canSetAbsolute: boolean;
  disabled?: boolean;
  onStep: (delta: number) => void;
  onSet: (level: number) => void;
  onToggleMute: () => void;
}): React.JSX.Element {
  const inicioY = useRef<number | null>(null);
  const acumulado = useRef(0);

  const alTocar = (e: React.TouchEvent): void => {
    inicioY.current = e.touches[0]?.clientY ?? null;
    acumulado.current = 0;
  };

  const alMover = (e: React.TouchEvent): void => {
    if (inicioY.current === null || disabled) return;
    const y = e.touches[0]?.clientY ?? 0;
    const delta = inicioY.current - y;
    // Un paso cada 24 px de recorrido: suficiente para que no se dispare solo
    // al apoyar el dedo, y poco como para que el gesto se sienta directo.
    const pasos = Math.trunc(delta / 24) - acumulado.current;
    if (pasos !== 0) {
      acumulado.current += pasos;
      tap();
      onStep(pasos > 0 ? 1 : -1);
    }
  };

  const boton =
    'flex-1 rounded-2xl bg-neutral-800 py-5 text-2xl font-medium text-neutral-100 ' +
    'active:bg-neutral-700 disabled:opacity-30 transition-colors select-none';

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-neutral-400">Volumen</span>
        <span className="font-mono text-neutral-300">
          {muted ? 'silenciado' : (volume ?? '--')}
        </span>
      </div>

      <div
        className="flex gap-2 touch-none"
        onTouchStart={alTocar}
        onTouchMove={alMover}
        onTouchEnd={() => (inicioY.current = null)}
      >
        <button
          aria-label="Bajar volumen"
          disabled={disabled}
          onClick={() => {
            tap();
            onStep(-1);
          }}
          className={boton}
        >
          −
        </button>
        <button
          aria-label={muted ? 'Quitar silencio' : 'Silenciar'}
          disabled={disabled}
          onClick={() => {
            tap();
            onToggleMute();
          }}
          className={`flex w-20 items-center justify-center rounded-2xl py-5 transition-colors select-none disabled:opacity-30 ${
            muted
              ? 'bg-rose-600 text-white active:bg-rose-700'
              : 'bg-neutral-800 text-neutral-100 active:bg-neutral-700'
          }`}
        >
          {muted ? <SpeakerMuted /> : <SpeakerOn />}
        </button>
        <button
          aria-label="Subir volumen"
          disabled={disabled}
          onClick={() => {
            tap();
            onStep(1);
          }}
          className={boton}
        >
          +
        </button>
      </div>

      <p className="text-center text-xs text-neutral-600">
        Tambien podés deslizar hacia arriba o abajo sobre los botones
      </p>

      {canSetAbsolute && (
        <input
          type="range"
          min={0}
          max={100}
          value={volume ?? 0}
          disabled={disabled}
          onChange={(e) => onSet(Number(e.target.value))}
          aria-label="Volumen exacto"
          className="w-full accent-sky-500 disabled:opacity-30"
        />
      )}
    </section>
  );
}
