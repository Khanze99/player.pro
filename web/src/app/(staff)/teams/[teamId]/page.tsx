import Link from "next/link";

import { DailyReportTable } from "@/components/DailyReportTable";
import { TeamSummaryPanel } from "@/components/TeamSummaryPanel";
import { api } from "@/lib/api";
import { requireSession } from "@/lib/session";
import type { ReadinessBreakdown } from "@/types";

export default async function TeamPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const { token } = await requireSession();

  const squad = await api.squadStatus(teamId, token);

  // Разбивка по каждому игроку за сегодня — тот же эндпоинт, что у отчёта по
  // игроку (analytics/*/readiness-breakdown), просто дёргаем его на весь состав
  // разом: новый бэкенд-эндпоинт под плотную таблицу не заводим.
  const [summary, breakdownEntries] = await Promise.all([
    api.teamSummary(teamId, token),
    Promise.all(
      squad.players.map(
        async (p) => [p.athlete_id, await api.readinessBreakdown(p.athlete_id, squad.date, token)] as const,
      ),
    ),
  ]);
  const breakdowns: Record<string, ReadinessBreakdown | null> = Object.fromEntries(breakdownEntries);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-[var(--text-faint)] uppercase tracking-wide">{summary.team_name}</p>
          <h1 className="text-xl font-semibold text-[var(--text)]">Состав на сегодня</h1>
        </div>
        <Link href="/teams" className="text-sm text-[var(--accent)] hover:text-[var(--accent-hover)]">
          Сменить команду
        </Link>
      </div>

      <DailyReportTable teamId={teamId} players={squad.players} breakdowns={breakdowns} />

      <TeamSummaryPanel summary={summary} />
    </div>
  );
}
