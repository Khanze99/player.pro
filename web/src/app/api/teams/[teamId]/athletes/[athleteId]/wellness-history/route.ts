import { NextResponse } from "next/server";

import { api, ApiError } from "@/lib/api";
import { getAccessToken } from "@/lib/session";

const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ teamId: string; athleteId: string }> };

export async function GET(request: Request, context: Context) {
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ detail: "Сессия истекла" }, { status: 401, headers });
  const { teamId, athleteId } = await context.params;
  const query = new URL(request.url).searchParams;
  try {
    const result = await api.wellnessHistorySeries(
      teamId, athleteId, token, query.get("date_from") ?? undefined, query.get("date_to") ?? undefined,
    );
    return NextResponse.json(result, { headers });
  } catch (error) {
    if (error instanceof ApiError) return NextResponse.json({ detail: error.message }, { status: error.status, headers });
    return NextResponse.json({ detail: "Не удалось загрузить историю состояния" }, { status: 502, headers });
  }
}
