import type {
  App,
  CastUrlRequest,
  Input,
  ListDevicesResponse,
  PairingStatus,
  RemoteKey,
} from '@tv-remote/shared';

export type HistoryEntry = {
  id: string;
  deviceId: string;
  title: string | null;
  url: string;
  kind: string;
  playedAt: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Los mensajes de error que llegan al usuario son concretos y en castellano.
 * Nunca un "Error" pelado: si el televisor no contesta hay que decir eso, para
 * que la persona sepa que hacer.
 */
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError(
      'No se pudo hablar con el servidor. Fijate que siga corriendo y que estes en la misma red.',
      0,
    );
  }

  if (!res.ok) {
    const cuerpo: unknown = await res.json().catch(() => null);
    const mensaje =
      typeof cuerpo === 'object' && cuerpo !== null && 'message' in cuerpo
        ? String((cuerpo as { message: unknown }).message)
        : `El servidor respondio ${res.status}.`;
    throw new ApiError(mensaje, res.status);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  listDevices: () => request<ListDevicesResponse>('/api/devices'),

  startScan: () => request<{ started: boolean }>('/api/discovery/scan', { method: 'POST' }),

  addManualDevice: (ip: string, name?: string) =>
    request<{ ip: string }>('/api/devices/manual', {
      method: 'POST',
      body: JSON.stringify(name ? { ip, name } : { ip }),
    }),

  removeManualDevice: (ip: string) =>
    request<void>(`/api/devices/manual/${encodeURIComponent(ip)}`, { method: 'DELETE' }),

  // ─── Control ──────────────────────────────────────────────────────────────

  pairingStatus: (id: string) => request<PairingStatus>(`/api/devices/${id}/pairing`),

  pair: (id: string, pin?: string) =>
    request<PairingStatus>(`/api/devices/${id}/pair`, {
      method: 'POST',
      body: JSON.stringify(pin ? { pin } : {}),
    }),

  sendKey: (id: string, key: RemoteKey) =>
    request<void>(`/api/devices/${id}/key`, { method: 'POST', body: JSON.stringify({ key }) }),

  volumeStep: (id: string, delta: number) =>
    request<void>(`/api/devices/${id}/volume/step`, {
      method: 'POST',
      body: JSON.stringify({ delta }),
    }),

  setVolume: (id: string, level: number) =>
    request<void>(`/api/devices/${id}/volume`, {
      method: 'POST',
      body: JSON.stringify({ level }),
    }),

  setMute: (id: string, muted: boolean) =>
    request<void>(`/api/devices/${id}/mute`, { method: 'POST', body: JSON.stringify({ muted }) }),

  powerOn: (id: string) => request<void>(`/api/devices/${id}/power/on`, { method: 'POST' }),
  powerOff: (id: string) => request<void>(`/api/devices/${id}/power/off`, { method: 'POST' }),

  listInputs: (id: string) => request<{ inputs: Input[] }>(`/api/devices/${id}/inputs`),

  setInput: (id: string, inputId: string) =>
    request<void>(`/api/devices/${id}/input`, {
      method: 'POST',
      body: JSON.stringify({ inputId }),
    }),

  listApps: (id: string) => request<{ apps: App[] }>(`/api/devices/${id}/apps`),

  launchApp: (id: string, appId: string) =>
    request<void>(`/api/devices/${id}/app`, { method: 'POST', body: JSON.stringify({ appId }) }),

  // ─── Casteo ───────────────────────────────────────────────────────────────

  castUrl: (id: string, media: CastUrlRequest) =>
    request<void>(`/api/devices/${id}/cast`, { method: 'POST', body: JSON.stringify(media) }),

  stopCast: (id: string) => request<void>(`/api/devices/${id}/cast/stop`, { method: 'POST' }),

  history: (id: string) => request<{ history: HistoryEntry[] }>(`/api/devices/${id}/history`),

  clearHistory: (id: string) =>
    request<void>(`/api/devices/${id}/history`, { method: 'DELETE' }),
};
