import { useEffect, useRef, useState } from 'react';
import type { Device, MediaState, ServerMessage } from '@tv-remote/shared';

/**
 * El `| undefined` explicito es necesario con exactOptionalPropertyTypes: este
 * estado se arma por difusion (spread) de mensajes parciales, y sin el una
 * propiedad ausente no encaja con una declarada opcional.
 */
export type LiveState = {
  powered?: boolean | undefined;
  volume?: number | undefined;
  muted?: boolean | undefined;
  currentApp?: string | undefined;
  currentInput?: string | undefined;
  media?: MediaState | undefined;
};

export type LiveData = {
  states: Record<string, LiveState>;
  devices: Device[] | null;
  scanning: boolean;
  connected: boolean;
};

/**
 * Estado en vivo por WebSocket.
 *
 * Reemplaza al sondeo de la Fase 1: el servidor avisa cuando algo cambia. Si el
 * socket se cae reconecta con esperas crecientes, porque el caso normal es que
 * se haya caido el servidor y no tiene sentido martillarlo.
 */
export function useLiveState(): LiveData {
  const [states, setStates] = useState<Record<string, LiveState>>({});
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [connected, setConnected] = useState(false);
  const reintentos = useRef(0);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let timer: number | undefined;
    let cancelado = false;

    const conectar = (): void => {
      if (cancelado) return;
      const protocolo = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${protocolo}//${window.location.host}/api/ws`);

      ws.onopen = () => {
        reintentos.current = 0;
        setConnected(true);
      };

      ws.onmessage = (evento) => {
        let mensaje: ServerMessage;
        try {
          mensaje = JSON.parse(String(evento.data)) as ServerMessage;
        } catch {
          return;
        }

        switch (mensaje.type) {
          case 'state': {
            const { type: _t, deviceId, updatedAt: _u, ...estado } = mensaje;
            setStates((previo) => ({ ...previo, [deviceId]: { ...previo[deviceId], ...estado } }));
            break;
          }
          case 'devices':
            setDevices(mensaje.devices as Device[]);
            break;
          case 'scanning':
            setScanning(mensaje.scanning);
            break;
          default:
            break;
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (cancelado) return;
        // Espera creciente hasta 10 segundos: si el servidor se cayo, insistir
        // cada 100 ms no lo levanta y llena la consola de errores.
        const espera = Math.min(10_000, 500 * 2 ** reintentos.current);
        reintentos.current += 1;
        timer = window.setTimeout(conectar, espera);
      };

      ws.onerror = () => ws?.close();
    };

    conectar();
    return () => {
      cancelado = true;
      if (timer) window.clearTimeout(timer);
      ws?.close();
    };
  }, []);

  return { states, devices, scanning, connected };
}
