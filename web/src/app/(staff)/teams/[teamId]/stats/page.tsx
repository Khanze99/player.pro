import Link from "next/link";

import { api } from "@/lib/api";
import { requireSession } from "@/lib/session";

// Паспорт игрока сам по себе — запись по конкретному athlete_id, этот экран
// просто выбор игрока внутри команды (тот же состав, что на дневном отчёте),
// docs/plan-player-season-stats.md, «Открытые вопросы».
export default async function TeamStatsPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const { token } = await requireSession();
  const squad = await api.squadStatus(teamId, token);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-[var(--text-faint)] uppercase tracking-wide">Статистика игроков</p>
        <h1 className="text-xl font-semibold text-[var(--text)]">Выберите игрока</h1>
      </div>

      {squad.players.length === 0 ? (
        <p className="text-[var(--text-muted)] py-8 text-center">В команде пока нет игроков.</p>
      ) : (
        <div className="border border-[var(--border)] bg-[var(--surface)]">
          {squad.players.map((player) => (
            <Link
              key={player.athlete_id}
              href={`/teams/${teamId}/athletes/${player.athlete_id}/stats`}
              className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-muted)] transition-colors"
            >
              <div>
                <p className="font-medium text-[var(--text)]">{player.name}</p>
                {player.position && <p className="text-xs text-[var(--text-faint)] mt-0.5">{player.position}</p>}
              </div>
              <span className="text-[var(--text-faint)]">→</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
