// Прокси для клиентского переключателя День/7д/28д в ReadinessBreakdownPanel:
// клиентский JS не видит access-токен (httpOnly-кука), поэтому сам напрямую в
// FastAPI сходить не может — только через собственный same-origin Route Handler,
// который достаёт токен из сессии на сервере (docs/plan-web-admin.md, «Auth»).

import { NextResponse } from "next/server";

import { api, ApiError } from "@/lib/api";
import { getAccessToken } from "@/lib/session";

export async function GET(request: Request, context: { params: Promise<{ athleteId: string }> }) {
  const token = await getAccessToken();
  if (!token) {
    return NextResponse.json({ detail: "Сессия истекла" }, { status: 401 });
  }

  const { athleteId } = await context.params;
  const { searchParams } = new URL(request.url);
  const days = searchParams.get("days");
  const day = searchParams.get("day");

  try {
    if (days) {
      return NextResponse.json(await api.readinessBreakdownAverage(athleteId, token, Number(days)));
    }
    if (day) {
      return NextResponse.json(await api.readinessBreakdown(athleteId, day, token));
    }
    return NextResponse.json({ detail: "Нужен параметр day или days" }, { status: 400 });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ detail: err.message }, { status: err.status });
    }
    throw err;
  }
}
