import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  ACCESS_MAX_AGE,
  COOKIE_ACCESS,
  COOKIE_REFRESH,
  COOKIE_USER,
  REFRESH_MAX_AGE,
  encodeCookieJson,
  sessionCookieOptions,
} from "@/lib/cookies";
import { getOrCreateDeviceId } from "@/lib/device";
import { API_URL } from "@/lib/env";
import type { Me } from "@/types";

export async function POST(request: Request) {
  const { identifier, code } = await request.json();
  const deviceId = await getOrCreateDeviceId();

  const verifyRes = await fetch(`${API_URL}/api/v1/auth/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, code, device_id: deviceId }),
  });
  if (!verifyRes.ok) {
    const err = await verifyRes.json().catch(() => ({}));
    return NextResponse.json(err, { status: verifyRes.status });
  }
  const tokens = (await verifyRes.json()) as { access_token: string; refresh_token: string };

  const meRes = await fetch(`${API_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!meRes.ok) {
    return NextResponse.json({ detail: "Не удалось получить профиль" }, { status: 502 });
  }
  const me = (await meRes.json()) as Me;

  // Игрок — не аудитория этого интерфейса (docs/plan-web-admin.md, «Доступ»).
  // Сессию для него не заводим вообще, не только гейтим экраны.
  if (me.global_role === "player") {
    return NextResponse.json(
      { detail: "Этот кабинет — для тренеров и врачей. Данные игрока смотрите в мобильном приложении." },
      { status: 403 },
    );
  }

  // require_consented (backend/app/api/deps.py) гейтит буквально все рабочие
  // эндпоинты (teams/dashboard/analytics/…), кроме /auth/*. Онбординг с этим
  // согласием — только в мобильном приложении (docs/plan-web-admin.md: «не
  // строим параллельный онбординг»), поэтому здесь — не пускаем в кабинет
  // заранее, а не роняем первую же страницу необработанным исключением.
  if (!me.terms_accepted || !me.health_consent_accepted) {
    return NextResponse.json(
      {
        detail:
          "Нужно принять пользовательское соглашение в мобильном приложении — зайдите там один раз, " +
          "затем возвращайтесь сюда.",
      },
      { status: 403 },
    );
  }

  const store = await cookies();
  store.set(COOKIE_ACCESS, tokens.access_token, sessionCookieOptions(ACCESS_MAX_AGE));
  store.set(COOKIE_REFRESH, tokens.refresh_token, sessionCookieOptions(REFRESH_MAX_AGE));
  store.set(
    COOKIE_USER,
    encodeCookieJson({
      id: me.id,
      name: [me.last_name, me.first_name].filter(Boolean).join(" "),
      role: me.global_role,
    }),
    sessionCookieOptions(REFRESH_MAX_AGE),
  );

  return NextResponse.json({ ok: true });
}
