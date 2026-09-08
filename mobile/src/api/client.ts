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
  } catch (e) {
    // Сохраняем причину: «offline» одинаково маскирует и отсутствие сети, и
    // таймаут — на этапе отладки это мешает.
    throw new NetworkError(e instanceof Error ? e.message : String(e));
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

/**
 * Тянет бинарный ресурс под токеном и отдаёт data-URI. Нужен для аватара:
 * `GET /users/{id}/avatar` закрыт авторизацией, а <Image> с заголовками не умеет
 * авто-refresh по 401. XHR (не fetch): RN-овский blob совместим с FileReader,
 * а expo/fetch отдаёт свой формат.
 */
export function apiBlobUri(path: string, retried = false): Promise<string> {
  const access = session.getState().accessToken;

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', `${API_URL}/api/v1${path}`);
    xhr.responseType = 'blob';
    xhr.timeout = REQUEST_TIMEOUT_MS;
    if (access) xhr.setRequestHeader('Authorization', `Bearer ${access}`);
    xhr.onerror = () => reject(new NetworkError('request failed'));
    xhr.ontimeout = () => reject(new NetworkError('timeout'));
    xhr.onload = () => {
      if (xhr.status === 401 && !retried) {
        refreshAccessToken().then((newAccess) => {
          if (newAccess) apiBlobUri(path, true).then(resolve, reject);
          else {
            session.getState().signOut();
            reject(new ApiError(401, 'unauthorized'));
          }
        }, reject);
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new ApiError(xhr.status, `HTTP ${xhr.status}`));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new NetworkError('avatar read failed'));
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(xhr.response as Blob);
    };
    xhr.send();
  });
}

/**
 * Загрузка файла (multipart) — через XMLHttpRequest, НЕ fetch.
 *
 * В Expo SDK 57 глобальный `fetch` подменён на `expo/fetch`, а он не умеет
 * RN-часть FormData вида `{ uri, name, type }` — падает с «Unsupported FormDataPart
 * implementation» ещё до отправки (см. expo/src/winter/fetch/convertFormData).
 * RN-овский XHR такие части обрабатывает нативно и boundary проставляет сам.
 * Авто-refresh по 401 повторяем один раз, как в `api`.
 */
export function upload<T>(path: string, form: FormData, method = 'PUT', retried = false): Promise<T> {
  const access = session.getState().accessToken;

  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, `${API_URL}/api/v1${path}`);
    xhr.timeout = 30_000; // фото по мобильной сети не укладывается в общие 10 с
    if (access) xhr.setRequestHeader('Authorization', `Bearer ${access}`);
    xhr.onerror = () => reject(new NetworkError('request failed'));
    xhr.ontimeout = () => reject(new NetworkError('timeout'));
    xhr.onload = () => {
      const status = xhr.status;
      if (status === 401 && !retried) {
        refreshAccessToken().then((newAccess) => {
          if (newAccess) upload<T>(path, form, method, true).then(resolve, reject);
          else {
            session.getState().signOut();
            reject(new ApiError(401, 'unauthorized'));
          }
        }, reject);
        return;
      }
      if (status < 200 || status >= 300) {
        let detail: unknown = `HTTP ${status}`;
        try {
          detail = JSON.parse(xhr.responseText).detail ?? detail;
        } catch {
          // тело не JSON — оставляем статус
        }
        reject(new ApiError(status, typeof detail === 'string' ? detail : `HTTP ${status}`));
        return;
      }
      if (status === 204 || !xhr.responseText) return resolve(undefined as T);
      try {
        resolve(JSON.parse(xhr.responseText) as T);
      } catch (e) {
        reject(new NetworkError(e instanceof Error ? e.message : 'bad response'));
      }
    };
    xhr.send(form);
  });
}
