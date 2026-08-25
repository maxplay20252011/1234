import { useCallback, useEffect, useState } from 'react';
import type { Device, Group, Scene, SceneStep } from '@tv-remote/shared';
import { api, ApiError } from '../api.js';
import { useToast } from '../useToasts.js';
import { tap } from '../haptics.js';

/**
 * Grupos y escenas.
 *
 * Un grupo junta televisores de un mismo ambiente para actuar sobre todos a la
 * vez. Una escena es una secuencia con esperas: las esperas hacen falta porque
 * un televisor recien encendido ignora los comandos durante varios segundos.
 */
export function AutomationScreen({
  devices,
  onBack,
}: {
  devices: Device[];
  onBack: () => void;
}): React.JSX.Element {
  const [groups, setGroups] = useState<Group[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [creandoGrupo, setCreandoGrupo] = useState(false);
  const [creandoEscena, setCreandoEscena] = useState(false);
  const toast = useToast();

  const cargar = useCallback(async (): Promise<void> => {
    try {
      const [g, e] = await Promise.all([api.groups(), api.scenes()]);
      setGroups(g.groups);
      setScenes(e.scenes);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'No se pudo cargar.');
    }
  }, [toast]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const nombreDe = (id: string): string => devices.find((d) => d.id === id)?.name ?? id;

  /** Muestra el resultado por dispositivo: un TV apagado no invalida el resto. */
  const informarLote = (
    resultados: { deviceId: string; ok: boolean; error?: string }[],
  ): void => {
    const fallaron = resultados.filter((r) => !r.ok);
    if (fallaron.length === 0) {
      toast('Listo.', 'info');
      return;
    }
    toast(`No respondieron: ${fallaron.map((r) => nombreDe(r.deviceId)).join(', ')}`);
  };

  const correrEscena = async (scene: Scene): Promise<void> => {
    tap();
    try {
      const resultado = await api.runScene(scene.id);
      if (resultado.ok) {
        toast(`"${scene.name}" salió bien.`, 'info');
        return;
      }
      const fallidos = resultado.results.filter((r) => !r.ok);
      toast(`${fallidos.length} de ${resultado.results.length} pasos fallaron: ${fallidos[0]?.error ?? ''}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'No se pudo ejecutar la escena.');
    }
  };

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <button
            onClick={onBack}
            aria-label="Volver"
            className="-ml-2 rounded-xl px-3 py-2 text-neutral-300 active:bg-neutral-800"
          >
            ‹
          </button>
          <h1 className="text-lg font-semibold">Grupos y escenas</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-8 px-4 py-5">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm text-neutral-400">Grupos</h2>
            <button
              onClick={() => setCreandoGrupo(true)}
              className="text-sm text-sky-400 active:text-sky-300"
            >
              Nuevo
            </button>
          </div>

          {groups.length === 0 ? (
            <p className="rounded-xl bg-neutral-900 px-4 py-3 text-sm text-neutral-500 ring-1 ring-neutral-800">
              Sin grupos todavía. Un grupo junta los televisores de un ambiente para manejarlos
              juntos.
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.id} className="rounded-2xl bg-neutral-900 p-4 ring-1 ring-neutral-800">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-medium">{g.name}</h3>
                    <p className="truncate text-xs text-neutral-500">
                      {g.deviceIds.length === 0
                        ? 'Sin dispositivos'
                        : g.deviceIds.map(nombreDe).join(', ')}
                    </p>
                  </div>
                  <button
                    onClick={() => void api.deleteGroup(g.id).then(cargar)}
                    className="shrink-0 text-xs text-neutral-600 active:text-rose-400"
                  >
                    Borrar
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-4 gap-2">
                  <button
                    onClick={() => void api.groupPower(g.id, true).then((r) => informarLote(r.results))}
                    className="rounded-xl bg-neutral-800 px-2 py-2.5 text-xs active:bg-neutral-700"
                  >
                    Encender
                  </button>
                  <button
                    onClick={() => void api.groupPower(g.id, false).then((r) => informarLote(r.results))}
                    className="rounded-xl bg-neutral-800 px-2 py-2.5 text-xs active:bg-neutral-700"
                  >
                    Apagar
                  </button>
                  <button
                    onClick={() => void api.groupKey(g.id, 'volumeDown').then((r) => informarLote(r.results))}
                    className="rounded-xl bg-neutral-800 px-2 py-2.5 text-xs active:bg-neutral-700"
                  >
                    Vol −
                  </button>
                  <button
                    onClick={() => void api.groupKey(g.id, 'volumeUp').then((r) => informarLote(r.results))}
                    className="rounded-xl bg-neutral-800 px-2 py-2.5 text-xs active:bg-neutral-700"
                  >
                    Vol +
                  </button>
                </div>
              </div>
            ))
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm text-neutral-400">Escenas</h2>
            <button
              onClick={() => setCreandoEscena(true)}
              className="text-sm text-sky-400 active:text-sky-300"
            >
              Nueva
            </button>
          </div>

          {scenes.length === 0 ? (
            <p className="rounded-xl bg-neutral-900 px-4 py-3 text-sm text-neutral-500 ring-1 ring-neutral-800">
              Sin escenas todavía. Una escena encadena acciones con esperas, por ejemplo: encender,
              esperar 8 segundos, poner HDMI 2 y bajar el volumen.
            </p>
          ) : (
            scenes.map((s) => (
              <div key={s.id} className="rounded-2xl bg-neutral-900 p-4 ring-1 ring-neutral-800">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-medium">{s.name}</h3>
                    <p className="text-xs text-neutral-500">
                      {s.steps.length} paso{s.steps.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <button
                    onClick={() => void api.deleteScene(s.id).then(cargar)}
                    className="shrink-0 text-xs text-neutral-600 active:text-rose-400"
                  >
                    Borrar
                  </button>
                </div>
                <button
                  onClick={() => void correrEscena(s)}
                  className="mt-3 w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white active:bg-sky-700"
                >
                  Ejecutar
                </button>
              </div>
            ))
          )}
        </section>
      </main>

      {creandoGrupo && (
        <GroupDialog
          devices={devices}
          onClose={() => setCreandoGrupo(false)}
          onCreated={() => void cargar()}
        />
      )}
      {creandoEscena && (
        <SceneDialog
          devices={devices}
          onClose={() => setCreandoEscena(false)}
          onCreated={() => void cargar()}
        />
      )}
    </div>
  );
}

function GroupDialog({
  devices,
  onClose,
  onCreated,
}: {
  devices: Device[];
  onClose: () => void;
  onCreated: () => void;
}): React.JSX.Element {
  const [name, setName] = useState('');
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const toast = useToast();

  const crear = async (): Promise<void> => {
    try {
      await api.createGroup({ name: name.trim(), deviceIds: seleccion });
      onCreated();
      onClose();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'No se pudo crear el grupo.');
    }
  };

  return (
    <Dialog title="Nuevo grupo" onClose={onClose}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Living, Dormitorio..."
        className="w-full rounded-xl bg-neutral-950 px-4 py-3 ring-1 ring-neutral-800 outline-none focus:ring-2 focus:ring-sky-500"
      />
      <div className="mt-3 space-y-1.5">
        {devices.map((d) => (
          <label
            key={d.id}
            className="flex items-center gap-3 rounded-xl bg-neutral-950 px-4 py-3 text-sm"
          >
            <input
              type="checkbox"
              checked={seleccion.includes(d.id)}
              onChange={(e) =>
                setSeleccion((s) => (e.target.checked ? [...s, d.id] : s.filter((x) => x !== d.id)))
              }
              className="size-4 accent-sky-500"
            />
            <span className="truncate">{d.name}</span>
          </label>
        ))}
      </div>
      <button
        onClick={() => void crear()}
        disabled={name.trim().length === 0}
        className="mt-4 w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-40 active:bg-sky-700"
      >
        Crear grupo
      </button>
    </Dialog>
  );
}

function SceneDialog({
  devices,
  onClose,
  onCreated,
}: {
  devices: Device[];
  onClose: () => void;
  onCreated: () => void;
}): React.JSX.Element {
  const [name, setName] = useState('');
  const [steps, setSteps] = useState<SceneStep[]>([]);
  const [deviceId, setDeviceId] = useState(devices[0]?.id ?? '');
  const toast = useToast();

  const agregar = (step: SceneStep): void => setSteps((s) => [...s, step]);

  const crear = async (): Promise<void> => {
    try {
      await api.createScene({ name: name.trim(), steps });
      onCreated();
      onClose();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'No se pudo crear la escena.');
    }
  };

  const boton = 'rounded-lg bg-neutral-800 px-3 py-2 text-xs active:bg-neutral-700';

  return (
    <Dialog title="Nueva escena" onClose={onClose}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Modo peli"
        className="w-full rounded-xl bg-neutral-950 px-4 py-3 ring-1 ring-neutral-800 outline-none focus:ring-2 focus:ring-sky-500"
      />

      <select
        value={deviceId}
        onChange={(e) => setDeviceId(e.target.value)}
        className="mt-3 w-full rounded-xl bg-neutral-950 px-4 py-3 text-sm ring-1 ring-neutral-800 outline-none"
      >
        {devices.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => agregar({ type: 'powerOn', deviceId })} className={boton}>
          + Encender
        </button>
        <button onClick={() => agregar({ type: 'powerOff', deviceId })} className={boton}>
          + Apagar
        </button>
        <button onClick={() => agregar({ type: 'setVolume', deviceId, level: 15 })} className={boton}>
          + Volumen 15
        </button>
        <button onClick={() => agregar({ type: 'setInput', deviceId, inputId: 'hdmi2' })} className={boton}>
          + HDMI 2
        </button>
        <button onClick={() => agregar({ type: 'wait', seconds: 8 })} className={boton}>
          + Esperar 8 s
        </button>
      </div>

      {steps.length > 0 && (
        <ol className="mt-3 space-y-1">
          {steps.map((s, i) => (
            <li
              key={`${s.type}-${i}`}
              className="flex items-center justify-between rounded-lg bg-neutral-950 px-3 py-2 text-xs text-neutral-300"
            >
              <span>
                {i + 1}. {describir(s, devices)}
              </span>
              <button
                onClick={() => setSteps((prev) => prev.filter((_, idx) => idx !== i))}
                className="text-neutral-600 active:text-rose-400"
              >
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}

      <p className="mt-3 text-xs text-neutral-600">
        Las esperas importan: un televisor recién encendido ignora los comandos durante varios
        segundos.
      </p>

      <button
        onClick={() => void crear()}
        disabled={name.trim().length === 0 || steps.length === 0}
        className="mt-3 w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-40 active:bg-sky-700"
      >
        Crear escena
      </button>
    </Dialog>
  );
}

function describir(step: SceneStep, devices: Device[]): string {
  const nombre = (id: string): string => devices.find((d) => d.id === id)?.name ?? id;
  switch (step.type) {
    case 'wait':
      return `Esperar ${step.seconds} s`;
    case 'powerOn':
      return `Encender ${nombre(step.deviceId)}`;
    case 'powerOff':
      return `Apagar ${nombre(step.deviceId)}`;
    case 'setVolume':
      return `Volumen ${step.level} en ${nombre(step.deviceId)}`;
    case 'setInput':
      return `${step.inputId.toUpperCase()} en ${nombre(step.deviceId)}`;
    case 'key':
      return `Tecla ${step.key} en ${nombre(step.deviceId)}`;
    case 'castUrl':
      return `Reproducir en ${nombre(step.deviceId)}`;
  }
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-2xl bg-neutral-900 p-5 ring-1 ring-neutral-800"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-neutral-500 active:text-neutral-300">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
