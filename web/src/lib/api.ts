// Server-only типизированная обёртка над FastAPI — вызывается только из Server
// Components/Route Handlers (никогда из клиентских компонентов: токен сюда не
// попадает, см. docs/plan-web-admin.md, раздел «Auth»). Один прямой повтор после
// 401 не делаем здесь намеренно: proxy.ts уже гарантирует свежий access-токен до
// рендера страницы — если 401 всё же дошёл сюда, это не «токен протух», а
// отозванный/невалидный refresh, и его чинит только повторный логин.

import { API_URL } from "@/lib/env";
import type {
  AthleteProfile,
  Branding,
  CycleStaffView,
  DailyMetric,
  Me,
  MedicalExamKind,
  MedicalExams,
  ReadinessBreakdown,
  ReadinessBreakdownAverage,
  RpeEntry,
  SeasonStat,
  SeasonStatPayload,
  TeamBenchmark,
  SportMetricDef,
  SquadStatus,
  Team,
  TeamMember,
  TeamSummary,
  TransferPayload,
  WeightGoal,
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
  // DELETE -> 204 без тела (season-stats и т.п.) — res.json() бросил бы
  // SyntaxError на пустую строку.
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function post<T>(path: string, token: string, data: unknown): Promise<T> {
  return request<T>(path, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

function patch<T>(path: string, token: string, data: unknown): Promise<T> {
  return request<T>(path, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

function del(path: string, token: string): Promise<void> {
  return request<void>(path, token, { method: "DELETE" });
}

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined);
  if (entries.length === 0) return "";
  return `?${new URLSearchParams(entries).toString()}`;
}

export const api = {
  me: (token: string) => request<Me>("/auth/me", token),

  teams: (token: string) => request<Team[]>("/teams", token),

  // Лого в шапке (docs/design-player-passport-theme.md) — без org_id/без
  // темы бэкенд сам отдаёт org_name=null/logo_url=null, одна форма ответа.
  branding: (token: string) => request<Branding>("/branding", token),

  // Состав + перевод (docs/plan-player-transfer.md) — пишущие ручки доступны
  // только admin, бэкенд сам отдаёт 403/404 остальным и на чужую организацию.
  teamMembers: (teamId: string, token: string) =>
    request<TeamMember[]>(`/teams/${teamId}/members`, token),

  transferMember: (fromTeamId: string, userId: string, token: string, data: TransferPayload) =>
    post<TeamMember>(`/teams/${fromTeamId}/members/${userId}/transfer`, token, data),

  squadStatus: (teamId: string, token: string) =>
    request<SquadStatus>(`/dashboard/teams/${teamId}/squad-status`, token),

  teamSummary: (teamId: string, token: string) =>
    request<TeamSummary>(`/dashboard/teams/${teamId}/summary`, token),

  athleteMetrics: (athleteId: string, token: string, days = 28) =>
    request<DailyMetric[]>(`/analytics/athletes/${athleteId}/metrics${qs({ date_from: daysAgoISO(days) })}`, token),

  rpeHistory: (athleteId: string, token: string, days = 30) =>
    request<RpeEntry[]>(`/rpe/athletes/${athleteId}${qs({ date_from: daysAgoISO(days) })}`, token),

  // WellnessEntry зеркалит WellnessOut целиком, включая мед. деталь (карта боли,
  // описания травмы/недомогания, комментарий) — docs/plan-web-day-detail.md,
  // доступ не разграничен по роли (как и в мобилке).
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

  // Цикл — спецкатегория (ensure_can_view_sensitive), а не ensure_can_view_athlete,
  // как у остального wellness: нет согласия → 403, секция молча не рисуется (не
  // вызов notFound() и не проброс ошибки на всю страницу), см. docs/
  // plan-women-health-nutrition.md. Форма ответа зависит от роли смотрящего.
  cycleAthleteState: (athleteId: string, token: string) =>
    request<CycleStaffView>(`/cycle/athletes/${athleteId}/state`, token).catch((err) => {
      if (err instanceof ApiError && err.status === 403) return null;
      throw err;
    }),

  // Вес/ИМТ (docs/plan-weight-tracking.md) — height_cm/weight_kg/bmi уже null
  // в ответе, если нет согласия body_metrics (ensure_can_view_sensitive внутри
  // роута). 404 — профиль ещё не заполнен, нормальное состояние нового игрока,
  // не ошибка страницы (как cycleAthleteState молча не рисует секцию на 403).
  athleteProfile: (athleteId: string, token: string) =>
    request<AthleteProfile>(`/users/athletes/${athleteId}/profile`, token).catch((err) => {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }),

  // Цель по весу — только чтение (штаб не ставит цель, PUT нет), null уже
  // приходит с бэкенда и на «нет согласия», и на «цели не существует»
  // (docs/plan-weight-tracking.md).
  athleteWeightGoal: (athleteId: string, token: string) =>
    request<WeightGoal | null>(`/users/athletes/${athleteId}/weight-goal`, token),

  medicalExams: (athleteId: string, token: string) =>
    request<MedicalExams>(`/medical-exams/athletes/${athleteId}`, token),

  createMedicalExam: (
    athleteId: string,
    token: string,
    data: { kind: MedicalExamKind; passed_date: string; valid_until: string },
  ) => post(`/medical-exams/athletes/${athleteId}`, token, data),

  // Паспорт игрока (docs/plan-player-season-stats.md) — каталог метрик
  // спорта — публичный справочник для любого авторизованного, без catch:
  // 404 здесь означало бы опечатку в коде, не штатный случай.
  seasonStatMetrics: (sport: string, token: string) =>
    request<SportMetricDef[]>(`/season-stats/sports/${sport}/metrics`, token),

  athleteSeasonStats: (athleteId: string, token: string) =>
    request<SeasonStat[]>(`/season-stats/athletes/${athleteId}`, token),

  createSeasonStat: (athleteId: string, token: string, data: SeasonStatPayload) =>
    post<SeasonStat>("/season-stats", token, { ...data, athlete_id: athleteId }),

  updateSeasonStat: (statId: string, token: string, data: Partial<SeasonStatPayload>) =>
    patch<SeasonStat>(`/season-stats/${statId}`, token, data),

  deleteSeasonStat: (statId: string, token: string) => del(`/season-stats/${statId}`, token),

  teamSeasonBenchmark: (teamId: string, season: string, token: string) =>
    request<TeamBenchmark>(
      `/season-stats/teams/${teamId}/benchmark?season=${encodeURIComponent(season)}`,
      token,
    ),
};

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d.toISOString().slice(0, 10);
}
