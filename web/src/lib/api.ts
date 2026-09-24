// Server-only типизированная обёртка над FastAPI — вызывается только из Server
// Components/Route Handlers (никогда из клиентских компонентов: токен сюда не
// попадает, см. docs/plan-web-admin.md, раздел «Auth»). Один прямой повтор после
// 401 не делаем здесь намеренно: proxy.ts уже гарантирует свежий access-токен до
// рендера страницы — если 401 всё же дошёл сюда, это не «токен протух», а
// отозванный/невалидный refresh, и его чинит только повторный логин.

import { API_URL } from "@/lib/env";
import type {
  DailyMetric,
  Me,
  MedicalExamKind,
  MedicalExams,
  ReadinessBreakdown,
  ReadinessBreakdownAverage,
  RpeEntry,
  SquadStatus,
  Team,
  TeamSummary,
  WellnessEntry,
} from "@/types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init?.headers },
    // Отчёты за день — свежие данные важнее кэша Next.js между запросами разных
    // пользователей/моментов; DailyMetric и так обновляется асинхронно воркером
    // (см. docs/functionality.md, раздел 5), кэшировать поверх ещё один слой не нужно.
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // FastAPI/Pydantic на 422 отдаёт detail списком объектов ({loc, msg, ...}),
    // а не строкой — наш model_validator (MedicalExamIn) кладёт текст в msg
    // первого элемента; в остальных случаях detail уже строка (HTTPException).
    const detail = Array.isArray(body.detail) ? body.detail[0]?.msg : body.detail;
    throw new ApiError(res.status, detail ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

function post<T>(path: string, token: string, data: unknown): Promise<T> {
  return request<T>(path, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined);
  if (entries.length === 0) return "";
  return `?${new URLSearchParams(entries).toString()}`;
}

export const api = {
  me: (token: string) => request<Me>("/auth/me", token),

  teams: (token: string) => request<Team[]>("/teams", token),

  squadStatus: (teamId: string, token: string) =>
    request<SquadStatus>(`/dashboard/teams/${teamId}/squad-status`, token),

  teamSummary: (teamId: string, token: string) =>
    request<TeamSummary>(`/dashboard/teams/${teamId}/summary`, token),

  athleteMetrics: (athleteId: string, token: string, days = 28) =>
    request<DailyMetric[]>(`/analytics/athletes/${athleteId}/metrics${qs({ date_from: daysAgoISO(days) })}`, token),

  rpeHistory: (athleteId: string, token: string, days = 30) =>
    request<RpeEntry[]>(`/rpe/athletes/${athleteId}${qs({ date_from: daysAgoISO(days) })}`, token),

  // Тип WellnessEntry сознательно уже, чем реальный ответ (см. types/index.ts) —
  // мед. деталь (описания травм, карта боли, комментарий) бэкенд всё равно отдаёт,
  // но этот клиент её не типизирует и, соответственно, не рендерит.
  wellnessHistory: (athleteId: string, token: string, days = 30) =>
    request<WellnessEntry[]>(`/wellness/athletes/${athleteId}${qs({ date_from: daysAgoISO(days) })}`, token),

  readinessBreakdown: (athleteId: string, day: string, token: string) =>
    request<ReadinessBreakdown | null>(
      `/analytics/athletes/${athleteId}/readiness-breakdown${qs({ day })}`,
      token,
    ).catch((err) => {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }),

  readinessBreakdownAverage: (athleteId: string, token: string, days: number) =>
    request<ReadinessBreakdownAverage>(
      `/analytics/athletes/${athleteId}/readiness-breakdown/average${qs({ date_from: daysAgoISO(days) })}`,
      token,
    ),

  medicalExams: (athleteId: string, token: string) =>
    request<MedicalExams>(`/medical-exams/athletes/${athleteId}`, token),

  createMedicalExam: (
    athleteId: string,
    token: string,
    data: { kind: MedicalExamKind; passed_date: string; valid_until: string },
  ) => post(`/medical-exams/athletes/${athleteId}`, token, data),
};

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d.toISOString().slice(0, 10);
}
