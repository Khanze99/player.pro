import Link from "next/link";
import { notFound } from "next/navigation";

import { LoadChart, ReadinessTrendChart } from "@/components/LoadChart";
import { MedicalExamsCard } from "@/components/MedicalExamsCard";
import { ReadinessBreakdownPanel } from "@/components/ReadinessBreakdownPanel";
import { RpeHistoryTable } from "@/components/RpeHistoryTable";
import { Card } from "@/components/ui/Card";
import { WellnessHistoryTable } from "@/components/WellnessHistoryTable";
import { api, ApiError } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { zoneColorVar } from "@/lib/zone";
import type { DailyMetric, MedicalExams, Me, RpeEntry, SquadStatus, WellnessEntry } from "@/types";

const HISTORY_DAYS = 90;

export default async function AthletePage({
  params,
}: {
  params: Promise<{ teamId: string; athleteId: string }>;
}) {
  const { teamId, athleteId } = await params;
  const { token } = await requireSession();

  // Имя/позиция игрока — из той же строки Squad Status, отдельного /users/{id}
  // эндпоинта на бэкенде для этого нет, а дублировать его ради ярлыка не нужно.
  let squad: SquadStatus;
  let metrics: DailyMetric[];
  let wellnessHistory: WellnessEntry[];
  let rpeHistory: RpeEntry[];
  let medicalExams: MedicalExams;
  let me: Me;
  try {
    [squad, metrics, wellnessHistory, rpeHistory, medicalExams, me] = await Promise.all([
      api.squadStatus(teamId, token),
      api.athleteMetrics(athleteId, token, 28),
      api.wellnessHistory(athleteId, token, HISTORY_DAYS),
      api.rpeHistory(athleteId, token, HISTORY_DAYS),
      api.medicalExams(athleteId, token),
      api.me(token),
    ]);
  } catch (err) {
    // Игрок мог быть удалён/выведен из состава (или ссылка просто устарела —
    // напр. после пересидирования демо-данных, ID меняются) — вежливое 404,
    // а не необработанное падение страницы.
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const player = squad.players.find((p) => p.athlete_id === athleteId);
  const latestWithReadiness = [...metrics].reverse().find((m) => m.readiness !== null);
  const canEditMedicalExams = me.teams.some((t) => t.team_id === teamId && t.team_role === "medic");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/teams/${teamId}`} className="text-sm text-[var(--accent)] hover:text-[var(--accent-hover)]">
            ← К составу
          </Link>
          <h1 className="text-xl font-semibold text-[var(--text)] mt-1">{player?.name ?? "Игрок"}</h1>
          {player?.position && <p className="text-sm text-[var(--text-muted)]">{player.position}</p>}
        </div>
        {player && (
          <div className="text-right">
            <p className="text-3xl font-semibold" style={{ color: zoneColorVar(player.readiness_zone) }}>
              {player.readiness ?? "—"}
            </p>
            <p className="text-xs text-[var(--text-faint)]">готовность сегодня</p>
          </div>
        )}
      </div>

      <MedicalExamsCard athleteId={athleteId} data={medicalExams} canEdit={canEditMedicalExams} />

      <div className="grid gap-6 lg:grid-cols-2">
        <LoadChart metrics={metrics} />
        <ReadinessTrendChart metrics={metrics} />
      </div>

      <ReadinessBreakdownPanel athleteId={athleteId} latestDate={latestWithReadiness?.date ?? null} />

      <div>
        <h2 className="font-medium text-[var(--text)] mb-3">История записей · {HISTORY_DAYS} дн.</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="text-sm text-[var(--text-muted)] mb-2">Утренний опрос</h3>
            <WellnessHistoryTable entries={wellnessHistory} />
          </Card>
          <Card>
            <h3 className="text-sm text-[var(--text-muted)] mb-2">RPE после нагрузки</h3>
            <RpeHistoryTable entries={rpeHistory} />
          </Card>
        </div>
      </div>
    </div>
  );
}
