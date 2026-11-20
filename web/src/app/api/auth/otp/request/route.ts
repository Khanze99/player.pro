import { NextResponse } from "next/server";

import { getOrCreateDeviceId } from "@/lib/device";
import { API_URL } from "@/lib/env";

export async function POST(request: Request) {
  // device_id понадобится на шаге verify — заводим его сразу, чтобы оба шага
  // логина точно ссылались на одно и то же устройство.
  await getOrCreateDeviceId();

  const { identifier } = await request.json();
  const res = await fetch(`${API_URL}/api/v1/auth/otp/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier }),
  });
  const data = await res.json().catch(() => ({}));
  // Never expose OTPs to the browser, even if the backend has DEBUG enabled.
  const body = res.ok
    ? { sent: data.sent === true }
    : { detail: data.detail ?? "Не удалось отправить код" };
  return NextResponse.json(body, {
    status: res.status,
    headers: { "Cache-Control": "no-store" },
  });
}
