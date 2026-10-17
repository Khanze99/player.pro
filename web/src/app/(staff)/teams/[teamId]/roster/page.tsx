import Link from "next/link";
import { notFound } from "next/navigation";

import { RosterTable } from "@/components/RosterTable";
import { api } from "@/lib/api";
import { requireSession } from "@/lib/session";

// Состав команды + перевод игрока в другую команду организации
// (docs/plan-player-transfer.md). Только admin: пишущие ручки на бэкенде и так
// требуют authz.require_org_admin_for_teams, но до формы с чужими данными
// остальные роли вообще не должны долистать — notFound(), а не 403-страница
// (тот же приём, что у отсутствующего игрока — см. (staff)/not-found.tsx).
export default async function RosterPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const { token, user } = await requireSession();
  if (user.role !== "admin") {
    notFound();
  }

  const teams = await api.teams(token);
  const team = teams.find((t) => t.id === teamId);
  if (!team) {
    notFound();
  }

  const members = await api.teamMembers(teamId, token);
  const otherTeams = teams.filter((t) => t.id !== teamId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-[var(--text-faint)] uppercase tracking-wide">{team.name}</p>
          <h1 className="text-xl font-semibold text-[var(--text)]">Состав и переводы</h1>
        </div>
        <Link
          href={`/teams/${teamId}`}
          className="text-sm text-[var(--accent)] hover:text-[var(--accent-hover)]"
        >
          ← К дашборду
        </Link>
      </div>

      {otherTeams.length === 0 && (
        <p className="text-sm text-[var(--text-muted)]">
          В организации пока только одна команда — перевод станет доступен, когда появится вторая.
        </p>
      )}

      <RosterTable teamId={teamId} members={members} otherTeams={otherTeams} />
    </div>
  );
}
