// Next.js 16: файл называется proxy.ts, не middleware.ts (middleware
// переименован и объявлен deprecated — см. web/node_modules/next/dist/docs/01-app/
// 03-api-reference/03-file-conventions/proxy.md). Гейт сессии для защищённых
// страниц + прозрачный рефреш access-токена без повторного OTP.
//
// pp_access живёt maxAge=14 мин (короче 15-мин TTL access-JWT на бэкенде) — когда
// кука истекла, но pp_refresh жив, рефрешим здесь и молча продолжаем; если и
// refresh невалиден — на /login. /login и /api/auth/* исключены matcher'ом ниже,
// иначе войти было бы неоткуда.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { ACCESS_MAX_AGE, COOKIE_ACCESS, COOKIE_DEVICE, COOKIE_REFRESH, SESSION_COOKIE_NAMES } from "@/lib/cookies";
import { API_URL, IS_PROD } from "@/lib/env";

export async function proxy(request: NextRequest) {
  const refresh = request.cookies.get(COOKIE_REFRESH)?.value;
  const device = request.cookies.get(COOKIE_DEVICE)?.value;

  if (!refresh || !device) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (request.cookies.get(COOKIE_ACCESS)?.value) {
    return NextResponse.next();
  }

  try {
    const res = await fetch(`${API_URL}/api/v1/auth/token/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh, device_id: device }),
    });
    if (!res.ok) throw new Error(`refresh ${res.status}`);
    const { access_token } = (await res.json()) as { access_token: string };

    const response = NextResponse.next();
    response.cookies.set(COOKIE_ACCESS, access_token, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: "lax",
      path: "/",
      maxAge: ACCESS_MAX_AGE,
    });
    return response;
  } catch {
    const response = NextResponse.redirect(new URL("/login", request.url));
    for (const name of SESSION_COOKIE_NAMES) response.cookies.delete(name);
    return response;
  }
}

export const config = {
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
