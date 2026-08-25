import type { RemoteKey } from '@tv-remote/shared';
import { tap } from '../haptics.js';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from './icons.js';

/**
 * Cruceta tactil.
 *
 * Los botones son grandes a proposito: se usa a oscuras, con una mano y sin
 * mirar la pantalla del celular.
 */
export function DPad({
  onKey,
  disabled,
}: {
  onKey: (key: RemoteKey) => void;
  disabled?: boolean;
}): React.JSX.Element {
  const pulsar = (key: RemoteKey) => () => {
    tap();
    onKey(key);
  };

  const flecha =
    'flex items-center justify-center bg-neutral-800 text-neutral-200 ' +
    'active:bg-neutral-700 disabled:opacity-30 transition-colors select-none';

  return (
    <div className="mx-auto grid aspect-square w-full max-w-[17rem] grid-cols-3 grid-rows-3 gap-1.5">
      <div />
      <button
        aria-label="Arriba"
        disabled={disabled}
        onClick={pulsar('up')}
        className={`${flecha} rounded-t-3xl rounded-b-lg`}
      >
        <ChevronUp className="size-7 fill-current" />
      </button>
      <div />

      <button
        aria-label="Izquierda"
        disabled={disabled}
        onClick={pulsar('left')}
        className={`${flecha} rounded-l-3xl rounded-r-lg`}
      >
        <ChevronLeft className="size-7 fill-current" />
      </button>
      <button
        aria-label="Aceptar"
        disabled={disabled}
        onClick={pulsar('ok')}
        className="flex items-center justify-center rounded-2xl bg-sky-600 text-sm font-semibold text-white active:bg-sky-700 disabled:opacity-30 transition-colors select-none"
      >
        OK
      </button>
      <button
        aria-label="Derecha"
        disabled={disabled}
        onClick={pulsar('right')}
        className={`${flecha} rounded-r-3xl rounded-l-lg`}
      >
        <ChevronRight className="size-7 fill-current" />
      </button>

      <div />
      <button
        aria-label="Abajo"
        disabled={disabled}
        onClick={pulsar('down')}
        className={`${flecha} rounded-b-3xl rounded-t-lg`}
      >
        <ChevronDown className="size-7 fill-current" />
      </button>
      <div />
    </div>
  );
}
