// Прокси для перевода игрока между командами (docs/plan-player-transfer.md):
// клиентский JS не видит access-токен (httpOnly-кука), сам напрямую в FastAPI
// сходить не может — только через собственный same-origin Route Handler, как и
// medical-exams/route.ts. Права (только admin, обе команды — его организации)
// целиком проверяет бэкенд (authz.require_org_admin_for_teams).

import { NextResponse } from "next/server";

import { api, ApiError } from "@/lib/api";
import { getAccessToken } from "@/lib/session";
import type { TransferPayload } from "@/types";

export async function POST(
  request: Request,
  context: { params: Promise<{ teamId: string; userId: string }> },
) {
  const token = await getAccessToken();
  if (!token) {
    return NextResponse.json({ detail: "Сессия истекла" }, { status: 401 });
  }

  const { teamId, userId } = await context.params;
  const data = (await request.json()) as TransferPayload;

  try {
    const member = await api.transferMember(teamId, userId, token, data);
    return NextResponse.json(member, { status: 200 });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ detail: err.message }, { status: err.status });
    }
    throw err;
  }
}
