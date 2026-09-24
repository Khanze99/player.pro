import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { COOKIE_DEVICE, COOKIE_REFRESH, SESSION_COOKIE_NAMES } from "@/lib/cookies";
import { API_URL } from "@/lib/env";

export async function POST() {
  const store = await cookies();
  const refresh = store.get(COOKIE_REFRESH)?.value;

  if (refresh) {
    await fetch(`${API_URL}/api/v1/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
      // Бэкенд недоступен — всё равно чистим локальную сессию, не блокируем выход.
    }).catch(() => {});
  }

  for (const name of [...SESSION_COOKIE_NAMES, COOKIE_DEVICE]) store.delete(name);
  return NextResponse.json({ ok: true });
}
