import { useCallback, useEffect, useState } from 'react';
import type { App, Device, Input, PairingStatus, RemoteKey } from '@tv-remote/shared';
import { api, ApiError } from '../api.js';
import { useToast } from '../useToasts.js';
import { tap } from '../haptics.js';
import type { LiveState } from '../useLiveState.js';
import { DPad } from './DPad.js';
import { VolumeControl } from './VolumeControl.js';
import { PairingPanel } from './PairingPanel.js';
import { CastPanel } from './CastPanel.js';
import { Power } from './icons.js';

export function ControlScreen({
  device,
  live,
  onBack,
}: {
  device: Device;
  live: LiveState | undefined;
  onBack: () => void;
}): React.JSX.Element {
  const toast = useToast();
  const [pairing, setPairing] = useState<PairingStatus | null>(null);
  const [inputs, setInputs] = useState<Input[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  /**
   * Cambios aplicados en pantalla antes de que el televisor confirme.
   * Se limpian cuando llega el estado real por WebSocket, o al instante si el
   * comando falla: la interfaz es optimista, pero no miente.
   */
  const [optimista, setOptimista] = useState<LiveState>({});

  const can = (c: string): boolean => device.capabilities.includes(c as never);
  const estado: LiveState = { ...live, ...optimista };
  const bloqueado = pairing !== null && pairing.state !== 'paired' && pairing.state !== 'not_required';

  useEffect(() => {
    setOptimista({});
  }, [live]);

  const cargar = useCallback(async (): Promise<void> => {
    try {
      setPairing(await api.pairingStatus(device.id));
    } catch {
      // Si falla, se muestra el control igual: puede ser un aparato sin emparejamiento.
    }
    if (device.capabilities.includes('input')) {
      try {
        setInputs((await api.listInputs(device.id)).inputs);
      } catch {
        setInputs([]);
      }
    }
    if (device.capabilities.includes('launchApp')) {
      try {
        setApps((await api.listApps(device.id)).apps);
      } catch {
        setApps([]);
      }
    }
  }, [device.id, device.capabilities]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Ejecuta un comando mostrando el cambio al instante y revirtiendo si falla. */
  const ejecutar = useCallback(
    async (accion: () => Promise<unknown>, previsto?: LiveState): Promise<void> => {
      if (previsto) setOptimista((o) => ({ ...o, ...previsto }));
      try {
        await accion();
      } catch (err) {
        setOptimista({});
        toast(
          err instanceof ApiError
            ? err.message
            : 'El televisor no respondió. ¿Está encendido y en la red?',
        );
      }
    },
    [toast],
  );

  const enviarTecla = useCallback(
    (key: RemoteKey) => void ejecutar(() => api.sendKey(device.id, key)),
    [device.id, ejecutar],
  );

  const pasoVolumen = useCallback(
    (delta: number) =>
      void ejecutar(
        () => api.volumeStep(device.id, delta),
        estado.volume !== undefined
          ? { volume: Math.max(0, Math.min(100, estado.volume + delta)) }
          : undefined,
      ),
    [device.id, ejecutar, estado.volume],
  );

  const alternarMute = useCallback(
    () => void ejecutar(() => api.setMute(device.id, !estado.muted), { muted: !estado.muted }),
    [device.id, ejecutar, estado.muted],
  );

  // Atajos de teclado para usarlo desde la computadora.
  useEffect(() => {
    if (bloqueado) return;

    const alPresionar = (e: KeyboardEvent): void => {
      const destino = e.target as HTMLElement | null;
      // No secuestrar el teclado mientras se escribe en un campo.
      if (destino && /input|textarea|select/i.test(destino.tagName)) return;

      const mapa: Record<string, RemoteKey> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
        Enter: 'ok',
        Escape: 'back',
        Backspace: 'back',
        h: 'home',
      };

      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        pasoVolumen(1);
        return;
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        pasoVolumen(-1);
        return;
      }
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        alternarMute();
        return;
      }

      const tecla = mapa[e.key];
      if (tecla) {
        e.preventDefault();
        enviarTecla(tecla);
      }
    };

    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [bloqueado, enviarTecla, pasoVolumen, alternarMute]);

  const secundario =
    'rounded-xl bg-neutral-800 px-3 py-3 text-sm text-neutral-200 active:bg-neutral-700 ' +
    'disabled:opacity-30 transition-colors select-none';

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
          <button
            onClick={onBack}
            aria-label="Volver"
            className="-ml-2 rounded-xl px-3 py-2 text-neutral-300 active:bg-neutral-800"
          >
            ‹
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-semibold">{device.name}</h1>
            <p className="truncate text-xs text-neutral-500">
              {estado.powered === false ? 'apagado' : device.ip}
            </p>
          </div>
          {can('power') && (
            <button
              aria-label="Encender o apagar"
              onClick={() => {
                tap(15);
                void ejecutar(
                  () =>
                    estado.powered === false ? api.powerOn(device.id) : api.powerOff(device.id),
                  { powered: estado.powered === false },
                );
              }}
              className="flex items-center rounded-xl bg-neutral-800 px-4 py-2.5 text-neutral-200 active:bg-neutral-700"
            >
              <Power className="size-5" />
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-6 px-4 py-5">
        {pairing && (
          <PairingPanel
            deviceId={device.id}
            status={pairing}
            onPaired={() => void cargar()}
          />
        )}

        {can('castUrl') && !can('power') && (
          <p className="rounded-xl bg-neutral-900 px-4 py-3 text-xs text-neutral-400 ring-1 ring-neutral-800">
            Este es un dispositivo de casteo, no el televisor: no se puede encender ni apagar la
            pantalla desde acá. Al enviarle un video, el televisor suele encenderse solo por HDMI-CEC.
          </p>
        )}

        {estado.powered === false && (
          <p className="rounded-xl bg-neutral-900 px-4 py-3 text-sm text-neutral-400 ring-1 ring-neutral-800">
            El televisor figura apagado.
            {can('wakeOnLan')
              ? ' Probá el botón de encendido: usa Wake-on-LAN, que tiene que estar habilitado en el televisor.'
              : ' Este dispositivo no se puede encender de forma remota.'}
          </p>
        )}

        {can('volume') && (
          <VolumeControl
            volume={estado.volume}
            muted={estado.muted}
            canSetAbsolute={can('volumeAbsolute')}
            disabled={bloqueado}
            onStep={pasoVolumen}
            onSet={(level) =>
              void ejecutar(() => api.setVolume(device.id, level), { volume: level })
            }
            onToggleMute={alternarMute}
          />
        )}

        {can('dpad') && (
          <section className="space-y-3">
            <DPad onKey={enviarTecla} disabled={bloqueado} />
            <div className="grid grid-cols-4 gap-2">
              <button disabled={bloqueado} onClick={() => enviarTecla('back')} className={secundario}>
                Atrás
              </button>
              <button disabled={bloqueado} onClick={() => enviarTecla('home')} className={secundario}>
                Inicio
              </button>
              <button disabled={bloqueado} onClick={() => enviarTecla('source')} className={secundario}>
                Fuente
              </button>
              <button disabled={bloqueado} onClick={() => enviarTecla('exit')} className={secundario}>
                Salir
              </button>
            </div>
          </section>
        )}

        {can('input') && inputs.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm text-neutral-400">Entrada</h2>
            <div className="grid grid-cols-3 gap-2">
              {inputs.map((i) => (
                <button
                  key={i.id}
                  disabled={bloqueado}
                  onClick={() => {
                    tap();
                    void ejecutar(() => api.setInput(device.id, i.id), { currentInput: i.id });
                  }}
                  className={`${secundario} ${
                    estado.currentInput === i.id ? 'ring-1 ring-sky-500' : ''
                  }`}
                >
                  {i.name}
                </button>
              ))}
            </div>
          </section>
        )}

        {can('castUrl') && (
          <CastPanel
            deviceId={device.id}
            media={estado.media}
            /* No hace falta releer nada: el estado baja solo por WebSocket. */
            onChanged={() => setOptimista({})}
          />
        )}

        {/* Un Chromecast no tiene cruceta, pero si controla la reproduccion. */}
        {can('castUrl') && !can('dpad') && estado.media?.playerState !== undefined && (
          <section className="grid grid-cols-3 gap-2">
            <button disabled={bloqueado} onClick={() => enviarTecla('play')} className={secundario}>
              Reproducir
            </button>
            <button disabled={bloqueado} onClick={() => enviarTecla('pause')} className={secundario}>
              Pausa
            </button>
            <button disabled={bloqueado} onClick={() => enviarTecla('stop')} className={secundario}>
              Detener
            </button>
          </section>
        )}

        {can('launchApp') && (
          <section className="space-y-2">
            <h2 className="text-sm text-neutral-400">Aplicaciones</h2>
            {apps.length === 0 ? (
              <p className="rounded-xl bg-neutral-900 px-4 py-3 text-xs text-neutral-500 ring-1 ring-neutral-800">
                No se pudo obtener la lista de aplicaciones. Varios modelos Samsung del 2020 en
                adelante dejaron de publicarla.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {apps.map((a) => (
                  <button
                    key={a.id}
                    disabled={bloqueado}
                    onClick={() => {
                      tap();
                      void ejecutar(() => api.launchApp(device.id, a.id), { currentApp: a.id });
                    }}
                    className={`${secundario} ${
                      estado.currentApp === a.id ? 'ring-1 ring-sky-500' : ''
                    }`}
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        <p className="pt-2 text-center text-xs text-neutral-600">
          Desde la computadora: flechas para navegar, Enter acepta, Esc vuelve,
          <br />+ y − el volumen, M silencia.
        </p>
      </main>
    </div>
  );
}
