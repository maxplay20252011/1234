import type { ListDevicesResponse } from '@tv-remote/shared';

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
};
