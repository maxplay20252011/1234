import type { Device } from '@tv-remote/shared';

const ETIQUETAS_MARCA: Record<Device['brand'], string> = {
  lg: 'LG webOS',
  samsung: 'Samsung Tizen',
  roku: 'Roku',
  chromecast: 'Chromecast',
  androidtv: 'Android TV / Google TV',
  dlna: 'DLNA',
  vizio: 'Vizio SmartCast',
  unknown: 'Sin identificar',
};

const COLORES_MARCA: Record<Device['brand'], string> = {
  lg: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  samsung: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  roku: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
  chromecast: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  androidtv: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  dlna: 'bg-teal-500/15 text-teal-300 ring-teal-500/30',
  vizio: 'bg-indigo-500/15 text-indigo-300 ring-indigo-500/30',
  unknown: 'bg-neutral-500/15 text-neutral-400 ring-neutral-500/30',
};

export function DeviceCard({ device }: { device: Device }): React.JSX.Element {
  return (
    <article className="rounded-2xl bg-neutral-900 ring-1 ring-neutral-800 p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold truncate">{device.name}</h2>
          {device.model && (
            <p className="text-sm text-neutral-400 truncate">{device.model}</p>
          )}
        </div>
        <span
          className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            device.online
              ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
              : 'bg-neutral-800 text-neutral-500 ring-1 ring-neutral-700'
          }`}
        >
          <span
            className={`size-1.5 rounded-full ${device.online ? 'bg-emerald-400' : 'bg-neutral-600'}`}
          />
          {device.online ? 'en linea' : 'sin conexion'}
        </span>
      </header>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span
          className={`rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${COLORES_MARCA[device.brand]}`}
        >
          {ETIQUETAS_MARCA[device.brand]}
        </span>
        {device.sources.map((s) => (
          <span
            key={s}
            className="rounded-md bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400 ring-1 ring-neutral-700"
          >
            {s}
          </span>
        ))}
      </div>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-neutral-500">IP</dt>
        <dd className="font-mono text-neutral-300">{device.ip}</dd>
        <dt className="text-neutral-500">MAC</dt>
        <dd className="font-mono text-neutral-300">
          {device.mac ?? <span className="text-amber-400/80 font-sans">sin detectar</span>}
        </dd>
      </dl>

      {!device.mac && (
        <p className="mt-2 text-xs text-amber-400/80">
          Sin MAC no se puede encender el televisor por Wake-on-LAN.
        </p>
      )}

      {device.unstableId && (
        <p className="mt-2 text-xs text-amber-400/80">
          No se consiguio un identificador estable. Si le cambia la IP, puede aparecer duplicado.
        </p>
      )}

      {/* Honestidad ante todo: sin adapter implementado no hay nada que controlar. */}
      {device.capabilities.length === 0 && (
        <p className="mt-3 rounded-lg bg-neutral-800/60 px-3 py-2 text-xs text-neutral-400">
          Detectado, pero todavia sin control: el adapter de esta marca se implementa en la
          proxima fase.
        </p>
      )}
    </article>
  );
}
