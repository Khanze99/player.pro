// device_id — обязателен для /auth/otp/verify и /auth/token/refresh
// (backend/app/schemas/auth.py). Генерируется один раз на браузер/сессию и живёт
// в httpOnly-куке — обычный JS его не видит и не может подделать более-менее
// осмысленно (не то чтобы это критично: device_id — не секрет, просто ключ
// привязки RefreshToken, сервер всё равно доверяет только refresh_token).

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

import { COOKIE_DEVICE, DEVICE_MAX_AGE, sessionCookieOptions } from "@/lib/cookies";

/** Только внутри Route Handler — cookies().set() не работает при рендере страницы. */
export async function getOrCreateDeviceId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE_DEVICE)?.value;
  if (existing) return existing;

  const id = `web-${randomUUID()}`;
  store.set(COOKIE_DEVICE, id, sessionCookieOptions(DEVICE_MAX_AGE));
  return id;
}
