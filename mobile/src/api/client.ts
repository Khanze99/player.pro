// REST-клиент: Bearer access-JWT, авто-refresh по 401 (раздел 5 ТЗ)

import { getDeviceId, getRefreshToken, session } from '../auth/session';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail);
  }
}

/** Сетевая ошибка (нет соединения) — сигнал для офлайн-очереди. */
export class NetworkError extends Error {}

async function rawRequest(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_URL}/api/v1${path}`, init);
  } catch {
    throw new NetworkError('offline');
  }
}

export async function refreshAccessToken(): Promise<string | null> {
  const refresh = await getRefreshToken();
  if (!refresh) return null;
  const resp = await rawRequest('/auth/token/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refresh, device_id: await getDeviceId() }),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  // Только токен, без смены статуса: активацию решает вызывающий (PIN-экран/гейт)
  session.setState({ accessToken: data.access_token as string });
  return data.access_token as string;
}

export async function api<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const access = session.getState().accessToken;
  const resp = await rawRequest(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
      ...init.headers,
    },
  });

  if (resp.status === 401 && !retried) {
    const newAccess = await refreshAccessToken();
    if (newAccess) return api<T>(path, init, true);
    session.getState().signOut();
    throw new ApiError(401, 'unauthorized');
  }
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      detail = (await resp.json()).detail ?? detail;
    } catch {
      // тело не JSON — оставляем statusText
    }
    throw new ApiError(resp.status, detail);
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

export const post = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const patch = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
