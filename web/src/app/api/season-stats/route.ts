// Прокси для формы паспорта игрока (docs/plan-player-season-stats.md) — тот
// же приём, что у medical-exams: клиентский JS не видит access-токен
// (httpOnly-кука), сам напрямую в FastAPI сходить не может.

import { NextResponse } from "next/server";

import { api, ApiError } from "@/lib/api";
import { getAccessToken } from "@/lib/session";
import type { SeasonStatPayload } from "@/types";

export async function POST(request: Request) {
  const token = await getAccessToken();
  if (!token) {
    return NextResponse.json({ detail: "Сессия истекла" }, { status: 401 });
  }

  const body = (await request.json()) as SeasonStatPayload & { athlete_id: string };
  const { athlete_id, ...data } = body;

  try {
    const entry = await api.createSeasonStat(athlete_id, token, data);
    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ detail: err.message }, { status: err.status });
    }
    throw err;
  }
}
