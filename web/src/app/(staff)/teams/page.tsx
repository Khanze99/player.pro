import Link from "next/link";
import { redirect } from "next/navigation";

import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";
import { requireSession } from "@/lib/session";

export default async function TeamsPage() {
  const { token } = await requireSession();
  const teams = await api.teams(token);

  if (teams.length === 1) {
    redirect(`/teams/${teams[0].id}`);
  }

  if (teams.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-[var(--text-muted)]">Пока нет ни одной команды.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-[var(--text)] mb-6">Выберите команду</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((team) => (
          <Link key={team.id} href={`/teams/${team.id}`}>
            <Card className="hover:border-[var(--accent)] transition-colors cursor-pointer">
              <p className="font-medium text-[var(--text)]">{team.name}</p>
              {team.sport && <p className="text-sm text-[var(--text-muted)] mt-1">{team.sport}</p>}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
