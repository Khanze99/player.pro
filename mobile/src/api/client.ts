// REST-клиент: Bearer access-JWT, авто-refresh по 401 (раздел 5 ТЗ)

import Constants from 'expo-constants';

import { getDeviceId, getRefreshToken, session } from '../auth/session';

const API_PORT = 8000;
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * В разработке адрес бэкенда выводим из хоста dev-сервера Expo: и симулятор, и
 * телефон в Expo Go ходят на ту же машину, что раздаёт бандл. Прибитый в .env IP
 * протухает при каждой смене сети (Wi-Fi → хотспот), и запросы молча висят.
 * Явный EXPO_PUBLIC_API_URL приоритетнее — для стенда и прода.
 */
function resolveApiUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit;
  const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${devHost ?? 'localhost'}:${API_PORT}`;
}

export const API_URL = resolveApiUrl();

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail);
  }
}

/** Сетевая ошибка: соединения нет — экран сообщает об этом и ждёт повтора. */
export class NetworkError extends Error {}

async function rawRequest(path: string, init: RequestInit): Promise<Response> {
  // Без таймаута недоступный хост даёт ~75 с TCP-ретраев: экран стоит без ошибки,
  // и это выглядит как «приложение не переключает экран», а не как отказ сети.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${API_URL}/api/v1${path}`, { ...init, signal: controller.signal });
  } catch {
    throw new NetworkError('offline');
  } finally {
    clearTimeout(timer);
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
