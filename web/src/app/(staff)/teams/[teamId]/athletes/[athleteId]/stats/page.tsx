import Link from "next/link";
import { notFound } from "next/navigation";

import { SeasonStatsSection } from "@/components/SeasonStatsSection";
import { api, ApiError } from "@/lib/api";
import { requireSession } from "@/lib/session";
import type { Me, SeasonStat, SportMetricDef, SquadStatus, Team } from "@/types";

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

  const defsEntries = await Promise.all(
    [...sportsNeeded].map(async (sport) => [sport, await api.seasonStatMetrics(sport, token)] as const),
  );
  const defsBySport: Record<string, SportMetricDef[]> = Object.fromEntries(defsEntries);

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
        <h1 className="text-xl font-semibold text-[var(--text)] mt-1">{player?.name ?? "Игрок"}</h1>
        <p className="text-sm text-[var(--text-muted)]">
          {player?.position ?? "Паспорт игрока"}
          {currentSport && ` · ${currentSport}`}
        </p>
      </div>

      <SeasonStatsSection
        athleteId={athleteId}
        sport={currentSport}
        addFormDefs={currentSport ? (defsBySport[currentSport] ?? []) : []}
        defsBySport={defsBySport}
        entries={entries}
        canEdit={canEdit}
      />
    </div>
  );
}
