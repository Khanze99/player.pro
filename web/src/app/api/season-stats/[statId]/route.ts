import { NextResponse } from "next/server";

import { api, ApiError } from "@/lib/api";
import { getAccessToken } from "@/lib/session";
import type { SeasonStatPayload } from "@/types";

export async function PATCH(request: Request, context: { params: Promise<{ statId: string }> }) {
  const token = await getAccessToken();
  if (!token) {
    return NextResponse.json({ detail: "Сессия истекла" }, { status: 401 });
  }

  const { statId } = await context.params;
  const data = (await request.json()) as Partial<SeasonStatPayload>;

  try {
    const entry = await api.updateSeasonStat(statId, token, data);
    return NextResponse.json(entry);
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ detail: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ statId: string }> }) {
  const token = await getAccessToken();
  if (!token) {
    return NextResponse.json({ detail: "Сессия истекла" }, { status: 401 });
  }

  const { statId } = await context.params;

  try {
    await api.deleteSeasonStat(statId, token);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ detail: err.message }, { status: err.status });
    }
    throw err;
  }
}
