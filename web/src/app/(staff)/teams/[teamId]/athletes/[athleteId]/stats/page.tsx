import Link from "next/link";
import { notFound } from "next/navigation";

import { SeasonStatsSection } from "@/components/SeasonStatsSection";
import { api, ApiError } from "@/lib/api";
import { sportText } from "@/lib/seasonStatLabels";
import { requireSession } from "@/lib/session";
import type { Me, SeasonStat, SportMetricDef, SquadStatus, Team, TeamBenchmark } from "@/types";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

// Паспорт игрока — отдельный модуль (docs/plan-player-season-stats.md,
// «отменено 2026-11-05»), не вкладка на отчёте: свой маршрут, перелинкован
// с .../athletes/[athleteId] в обе стороны, не переключатель на одном экране.
export default async function AthleteStatsPage({
  params,
}: {
  params: Promise<{ teamId: string; athleteId: string }>;
}) {
  const { teamId, athleteId } = await params;
  const { token } = await requireSession();

  let squad: SquadStatus;
  let teams: Team[];
  let entries: SeasonStat[];
  let me: Me;
  try {
    [squad, teams, entries, me] = await Promise.all([
      api.squadStatus(teamId, token),
      api.teams(token),
      api.athleteSeasonStats(athleteId, token),
      api.me(token),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const player = squad.players.find((p) => p.athlete_id === athleteId);
  // Team.sport сейчас определяет каталог метрик для НОВЫХ записей; у уже
  // существующих записей sport зафиксирован на момент создания (entry.sport),
  // поэтому для отображения тянем справочник под каждый встретившийся спорт,
  // а не только под текущий спорт команды — см. services/season_stats_service.py.
  const currentSport = teams.find((t) => t.id === teamId)?.sport ?? null;
  const sportsNeeded = new Set(entries.map((e) => e.sport));
  if (currentSport) sportsNeeded.add(currentSport);

  // Медиана команды по каждому сезону игрока (сезонов единицы). Ориентир
  // вспомогательный: если не загрузился (нет прав, сбой), паспорт рисуется
  // без него, а не падает целиком.
  const seasons = [...new Set(entries.map((e) => e.season))];
  const [defsEntries, benchmarkEntries] = await Promise.all([
    Promise.all(
      [...sportsNeeded].map(async (sport) => [sport, await api.seasonStatMetrics(sport, token)] as const),
    ),
    Promise.all(
      seasons.map(async (season) => {
        try {
          return [season, await api.teamSeasonBenchmark(teamId, season, token)] as const;
        } catch (err) {
          if (err instanceof ApiError) return [season, null] as const;
          throw err;
        }
      }),
    ),
  ]);
  const defsBySport: Record<string, SportMetricDef[]> = Object.fromEntries(defsEntries);
  const benchmarkBySeason: Record<string, TeamBenchmark | null> = Object.fromEntries(benchmarkEntries);
  const teamName = teams.find((t) => t.id === teamId)?.name ?? null;
  const playerName = player?.name ?? "Игрок";

  const canEdit =
    me.global_role === "admin" ||
    me.teams.some((t) => t.team_id === teamId && (t.team_role === "head_coach" || t.team_role === "coach"));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/teams/${teamId}/athletes/${athleteId}`}
          className="text-sm text-[var(--accent)] hover:text-[var(--accent-hover)]"
        >
          ← К отчёту игрока
        </Link>
        <div className="mt-3 flex items-center gap-4">
          <div className="w-14 h-14 shrink-0 grid place-items-center bg-[var(--accent-soft)] border border-[var(--accent)] text-[var(--accent)] text-lg font-semibold">
            {initials(playerName)}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-faint)]">
              Паспорт игрока
            </p>
            <h1 className="text-2xl font-semibold text-[var(--text)] leading-tight truncate">{playerName}</h1>
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
              {[player?.position, teamName, currentSport && sportText(currentSport)]
                .filter(Boolean)
                .map((chip) => (
                  <span
                    key={chip as string}
                    className="px-2 py-0.5 border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]"
                  >
                    {chip}
                  </span>
                ))}
            </div>
          </div>
        </div>
      </div>

      <SeasonStatsSection
        athleteId={athleteId}
        sport={currentSport}
        addFormDefs={currentSport ? (defsBySport[currentSport] ?? []) : []}
        defsBySport={defsBySport}
        entries={entries}
        benchmarkBySeason={benchmarkBySeason}
        canEdit={canEdit}
      />
    </div>
  );
}
