// Прокси для лого организации в шапке — тот же BFF-принцип, что у остальных
// Route Handler'ов: браузер в FastAPI напрямую не ходит (infra/nginx/admin.conf,
// в проде API_URL — внутренний docker-хост, снаружи недостижим), поэтому даже
// статичную картинку отдаёт сам Next.js, подтягивая байты с бэкенда на сервере.

import { NextResponse } from "next/server";

import { api } from "@/lib/api";
import { API_URL } from "@/lib/env";
import { getAccessToken } from "@/lib/session";

export async function GET() {
  const token = await getAccessToken();
  if (!token) {
    return new NextResponse(null, { status: 401 });
  }

  const branding = await api.branding(token);
  if (!branding.logo_url) {
    return new NextResponse(null, { status: 404 });
  }

  const res = await fetch(`${API_URL}${branding.logo_url}`, { cache: "no-store" });
  if (!res.ok) {
    return new NextResponse(null, { status: 502 });
  }

  return new NextResponse(res.body, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "image/png",
      "Cache-Control": "private, max-age=300",
    },
  });
}
