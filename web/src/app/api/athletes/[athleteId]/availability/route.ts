import { NextResponse } from "next/server";

import { api, ApiError } from "@/lib/api";
import { getAccessToken } from "@/lib/session";
import type { AvailabilityPayload } from "@/types/availability";

const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ athleteId: string }> };

export async function GET(request: Request, context: Context) {
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ detail: "Сессия истекла" }, { status: 401, headers });
  const { athleteId } = await context.params;
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? 1);
  if (!Number.isSafeInteger(page) || page < 1) return NextResponse.json({ detail: "Неверная страница" }, { status: 422, headers });
  try {
    const part = url.searchParams.get("part");
    const result = part === "history"
      ? await api.availabilityHistory(athleteId, token, page)
      : part === "notes"
        ? await api.availabilityNotes(athleteId, token, page)
        : await api.availabilityState(athleteId, token);
    return NextResponse.json(result, { headers });
  } catch (error) {
    if (error instanceof ApiError) return NextResponse.json({ detail: error.message }, { status: error.status, headers });
    throw error;
  }
}

export async function POST(request: Request, context: Context) {
  // nginx preserves Host and overwrites X-Forwarded-Proto (TLS terminates there).
  const requestUrl = new URL(request.url);
  const host = request.headers.get("host") ?? requestUrl.host;
  const protocol = request.headers.get("x-forwarded-proto") ?? requestUrl.protocol.slice(0, -1);
  if (!['http', 'https'].includes(protocol) || request.headers.get("origin") !== `${protocol}://${host}`) {
    return NextResponse.json({ detail: "Недопустимый источник запроса" }, { status: 403, headers });
  }
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ detail: "Сессия истекла" }, { status: 401, headers });
  const { athleteId } = await context.params;
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ detail: "Некорректный JSON" }, { status: 422, headers });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ detail: "Ожидается объект" }, { status: 422, headers });
  }
  try {
    // URL is authoritative; FastAPI validates fields and checks each role again.
    const result = await api.changeAvailability({ ...body, athlete_id: athleteId } as AvailabilityPayload, token);
    return NextResponse.json(result, { status: 201, headers });
  } catch (error) {
    if (error instanceof ApiError) return NextResponse.json({ detail: error.message }, { status: error.status, headers });
    throw error;
  }
}
