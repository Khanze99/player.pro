import Link from "next/link";

import { Tag } from "@/components/ui/Tag";
import { reasonLabel } from "@/lib/reasons";
import { zoneFromNormalized } from "@/lib/wellness";
import { zoneColorVar } from "@/lib/zone";
import type { ReadinessBreakdown, ReadinessComponent, SquadPlayer } from "@/types";

// Плотная построчная сводка «что игрок сегодня записал» — не агрегаты, не тренды,
// а именно сырые значения опроса за день (раздел 6.4 ТЗ, 5 критериев Readiness),
// с подсветкой того, что тянет балл вниз. Клик по строке → отчёт по игроку с
// разбивкой/трендами (там уже усреднённая аналитика, здесь — только сегодня).

const COLUMNS: { key: ReadinessComponent["key"]; label: string }[] = [
  { key: "sleep_quality", label: "Сон" },
  { key: "energy", label: "Энергия" },
  { key: "mood", label: "Настрой" },
  { key: "stress", label: "Стресс" },
  { key: "soreness", label: "Боль" },
];

const GRID = "grid-cols-[5px_minmax(180px,1.4fr)_repeat(5,58px)_58px_56px]";

// То же деление на риск/внимание, что и в backend/app/services/dashboard_service.py
// (_alerts) — раньше это был отдельный блок «у кого что не так», теперь те же
// причины видны прямо в строке, отдельный список не нужен.
function loadZoneTag(loadZone: SquadPlayer["load_zone"]): { label: string; color: string } | null {
  if (loadZone === "high_risk") return { label: reasonLabel.high_load, color: "var(--risk)" };
  if (loadZone === "overreaching") return { label: reasonLabel.rising_load, color: "var(--caution)" };
  if (loadZone === "undertraining") return { label: reasonLabel.undertraining, color: "var(--caution)" };
  return null;
}

interface Props {
  teamId: string;
  players: SquadPlayer[];
  breakdowns: Record<string, ReadinessBreakdown | null>;
}

export function DailyReportTable({ teamId, players, breakdowns }: Props) {
  if (players.length === 0) {
    return <p className="text-[var(--text-muted)] py-8 text-center">В команде пока нет игроков.</p>;
  }

  return (
    <div className="border border-[var(--border)] bg-[var(--surface)]">
      <div className={`grid ${GRID} items-center text-[11px] text-[var(--text-faint)] uppercase tracking-wide border-b border-[var(--border)]`}>
        <div />
        <div className="px-3 py-2">Игрок</div>
        {COLUMNS.map((c) => (
          <div key={c.key} className="px-1 py-2 text-center">
            {c.label}
          </div>
        ))}
        <div className="px-1 py-2 text-center">Пульс</div>
        <div className="px-2 py-2 text-right">Балл</div>
      </div>

      {players.map((player) => {
        const breakdown = breakdowns[player.athlete_id];
        const byKey = new Map(breakdown?.components.map((c) => [c.key, c]));
        const stripeColor = zoneColorVar(player.readiness_zone);
        const loadTag = loadZoneTag(player.load_zone);

        return (
          <Link
            key={player.athlete_id}
            href={`/teams/${teamId}/athletes/${player.athlete_id}`}
            className={`grid ${GRID} items-stretch border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-muted)] transition-colors`}
          >
            <div style={{ backgroundColor: stripeColor }} />

            <div className="px-3 py-2 min-w-0">
              <p className="font-medium text-[var(--text)] truncate">{player.name}</p>
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                {player.position && (
                  <span className="text-[11px] text-[var(--text-faint)]">{player.position}</span>
                )}
                {!player.wellness_filled && <Tag color="var(--no-data)">{reasonLabel.no_survey}</Tag>}
                {player.active_injury && <Tag color="var(--risk)">{reasonLabel.injury}</Tag>}
                {player.availability === "unavailable" && (
                  <Tag color="var(--risk)">{reasonLabel.unavailable}</Tag>
                )}
                {loadTag && <Tag color={loadTag.color}>{loadTag.label}</Tag>}
              </div>
            </div>

            {COLUMNS.map((c) => {
              const comp = byKey.get(c.key);
              if (!comp) {
                return (
                  <div key={c.key} className="px-1 py-2 text-center text-sm text-[var(--text-faint)] tabular-nums">
                    —
                  </div>
                );
              }
              const zone = zoneFromNormalized(comp.normalized);
              const color = zoneColorVar(zone);
              return (
                <div
                  key={c.key}
                  className="px-1 py-2 text-center text-sm font-semibold tabular-nums"
                  style={{
                    color,
                    backgroundColor: zone === "red" ? "var(--risk-soft)" : undefined,
                  }}
                >
                  {comp.value}
                </div>
              );
            })}

            <div className="px-1 py-2 text-center">
              {player.hr_flag ? (
                <span
                  className="text-sm font-semibold tabular-nums"
                  style={{ color: "var(--caution)", backgroundColor: "var(--caution-soft)" }}
                >
                  ↑
                </span>
              ) : (
                <span className="text-sm text-[var(--text-faint)]">—</span>
              )}
            </div>

            <div className="px-2 py-2 text-right">
              <span className="text-base font-semibold tabular-nums" style={{ color: stripeColor }}>
                {player.readiness ?? "—"}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
