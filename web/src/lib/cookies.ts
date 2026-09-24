// Общие константы и опции httpOnly-кук сессии (BFF, docs/plan-web-admin.md,
// раздел «Auth»). Браузерный JS их не читает — Secure/httpOnly/SameSite=Lax.

import { IS_PROD } from "@/lib/env";

export const COOKIE_DEVICE = "pp_device";
export const COOKIE_ACCESS = "pp_access";
export const COOKIE_REFRESH = "pp_refresh";
export const COOKIE_USER = "pp_user";

// Чуть меньше 15-минутного TTL access-JWT (backend/app/config.py:
// access_token_expire_minutes) — истекает на клиенте раньше, чем на сервере,
// иначе прокси мог бы отправить в FastAPI токен, который тот уже считает
// просроченным.
export const ACCESS_MAX_AGE = 14 * 60;
// backend/app/config.py: refresh_token_expire_days = 90
export const REFRESH_MAX_AGE = 90 * 24 * 60 * 60;
export const DEVICE_MAX_AGE = 365 * 24 * 60 * 60;

export const SESSION_COOKIE_NAMES = [COOKIE_ACCESS, COOKIE_REFRESH, COOKIE_USER] as const;

interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
}

export function sessionCookieOptions(maxAge: number): CookieOptions {
  return { httpOnly: true, secure: IS_PROD, sameSite: "lax", path: "/", maxAge };
}

// pp_user хранит JSON (кириллица, пробелы) — cookie-value по RFC 6265 такое не
// допускает как есть, поэтому кодируем перед set() и декодируем при чтении
// (см. lib/session.ts). access/refresh/device — уже opaque ASCII-строки без
// пробелов, их кодировать не нужно.
export function encodeCookieJson(value: unknown): string {
  return encodeURIComponent(JSON.stringify(value));
}

export function decodeCookieJson<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw)) as T;
  } catch {
    return null;
  }
}
