import type {
  App,
  CastUrlRequest,
  CreateGroupRequest,
  CreateSceneRequest,
  Group,
  RunSceneResult,
  Scene,
  Input,
  ListDevicesResponse,
  PairingStatus,
  RemoteKey,
} from '@tv-remote/shared';

export type MediaEntry = {
  id: string;
  name: string;
  relativePath: string;
  size: number;
  contentType: string;
  isDirectory: boolean;
};

export type Compatibility = {
  plan: 'direct' | 'remux' | 'transcode' | 'unknown';
  reasons: string[];
  warning?: string;
};

export type FileCheck = {
  title: string;
  contentType: string;
  durationSeconds?: number;
  compatibility: Compatibility;
  hasSubtitles: boolean;
};

export type LibraryStatus = { configured: boolean; roots: string[]; ffmpeg: boolean };

export type HistoryEntry = {
  id: string;
  deviceId: string;
  title: string | null;
  url: string;
  /** 'url' para contenido remoto, 'file' para un archivo del servidor. */
  kind: string;
  /** Referencia estable con la que se vuelve a reproducir. */
  ref: string;
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

  /** Primer paso: el televisor muestra el codigo en pantalla. */
  beginPairing: (id: string) =>
    request<PairingStatus>(`/api/devices/${id}/pair/begin`, { method: 'POST' }),

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

  // ─── Biblioteca de archivos ───────────────────────────────────────────────

  libraryStatus: () => request<LibraryStatus>('/api/library/status'),

  browse: (path?: string) =>
    request<{ path: string; entries: MediaEntry[] }>(
      `/api/library${path ? `?path=${encodeURIComponent(path)}` : ''}`,
    ),

  checkFile: (fileId: string) => request<FileCheck>(`/api/library/${fileId}/check`),

  castFile: (deviceId: string, fileId: string) =>
    request<void>(`/api/devices/${deviceId}/cast/file`, {
      method: 'POST',
      body: JSON.stringify({ fileId }),
    }),

  // ─── Grupos y escenas ─────────────────────────────────────────────────────

  groups: () => request<{ groups: Group[] }>('/api/groups'),

  createGroup: (body: CreateGroupRequest) =>
    request<Group>('/api/groups', { method: 'POST', body: JSON.stringify(body) }),

  deleteGroup: (id: string) => request<void>(`/api/groups/${id}`, { method: 'DELETE' }),

  groupKey: (id: string, key: RemoteKey) =>
    request<{ results: { deviceId: string; ok: boolean; error?: string }[] }>(
      `/api/groups/${id}/key`,
      { method: 'POST', body: JSON.stringify({ key }) },
    ),

  groupPower: (id: string, encender: boolean) =>
    request<{ results: { deviceId: string; ok: boolean; error?: string }[] }>(
      `/api/groups/${id}/power/${encender ? 'on' : 'off'}`,
      { method: 'POST' },
    ),

  scenes: () => request<{ scenes: Scene[] }>('/api/scenes'),

  createScene: (body: CreateSceneRequest) =>
    request<Scene>('/api/scenes', { method: 'POST', body: JSON.stringify(body) }),

  deleteScene: (id: string) => request<void>(`/api/scenes/${id}`, { method: 'DELETE' }),

  runScene: (id: string) => request<RunSceneResult>(`/api/scenes/${id}/run`, { method: 'POST' }),
};
