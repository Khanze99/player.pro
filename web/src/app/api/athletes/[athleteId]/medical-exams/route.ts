// Прокси для формы добавления УМО/ТМО (только врач — бэкенд сам отдаёт 403
// остальным, см. docs/plan-medical-exams.md): клиентский JS не видит access-
// токен (httpOnly-кука), сам напрямую в FastAPI сходить не может — только
// через собственный same-origin Route Handler, как и readiness-breakdown.

import { NextResponse } from "next/server";

import { api, ApiError } from "@/lib/api";
import { getAccessToken } from "@/lib/session";
import type { MedicalExamKind } from "@/types";

export async function POST(request: Request, context: { params: Promise<{ athleteId: string }> }) {
  const token = await getAccessToken();
  if (!token) {
    return NextResponse.json({ detail: "Сессия истекла" }, { status: 401 });
  }

  const { athleteId } = await context.params;
  const data = (await request.json()) as { kind: MedicalExamKind; passed_date: string; valid_until: string };

  try {
    const exam = await api.createMedicalExam(athleteId, token, data);
    return NextResponse.json(exam, { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ detail: err.message }, { status: err.status });
    }
    throw err;
  }
}
