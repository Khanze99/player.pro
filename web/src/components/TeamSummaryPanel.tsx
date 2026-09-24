import { Card } from "@/components/ui/Card";
import { MetricTile } from "@/components/MetricTile";
import { formatDateTime } from "@/lib/format";
import type { TeamSummary } from "@/types";

export function TeamSummaryPanel({ summary }: { summary: TeamSummary }) {
  const { wellness } = summary;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile label="Готовность" gauge={summary.readiness} format={(v) => String(Math.round(v))} />
        <MetricTile label="Нагрузка (ACWR)" gauge={summary.load} format={(v) => v.toFixed(2)} />
        <MetricTile label="Перфоманс" gauge={summary.performance} format={(v) => v.toFixed(1)} />
        <MetricTile
          label="Доступность, 90 дн."
          gauge={summary.availability}
          format={(v) => `${Math.round(v)}%`}
        />
      </div>

      <Card>
        <h2 className="font-medium text-[var(--text)] mb-3">
          Утренний опрос · {wellness.filled}/{wellness.total} заполнили
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
          <Stat label="Сон" value={wellness.avg_sleep_quality} />
          <Stat label="Энергия" value={wellness.avg_energy} />
          <Stat label="Настроение" value={wellness.avg_mood} />
          <Stat label="Стресс" value={wellness.avg_stress} />
          <Stat label="Боль" value={wellness.avg_soreness} />
        </div>
        {(wellness.with_pain > 0 || wellness.with_injury_flag > 0 || wellness.with_symptom_flag > 0) && (
          <p className="text-xs text-[var(--text-muted)] mt-3 pt-3 border-t border-[var(--border)]">
            С болью: {wellness.with_pain} · с травмой: {wellness.with_injury_flag} · с недомоганием:{" "}
            {wellness.with_symptom_flag}
          </p>
        )}
        {wellness.missing.length > 0 && (
          <p className="text-xs text-[var(--text-faint)] mt-2">Не заполнили: {wellness.missing.join(", ")}</p>
        )}
      </Card>

      {(summary.past_events.length > 0 || summary.upcoming_events.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <h2 className="font-medium text-[var(--text)] mb-3">Прошедшие события</h2>
            {summary.past_events.length === 0 ? (
              <p className="text-sm text-[var(--text-faint)]">Нет</p>
            ) : (
              <ul className="space-y-2">
                {summary.past_events.map((ev) => (
                  <li key={ev.id} className="text-sm flex items-center justify-between">
                    <span className="text-[var(--text)]">{ev.title ?? ev.type}</span>
                    <span className="text-[var(--text-faint)] text-xs">
                      {formatDateTime(ev.planned_start)} · RPE {ev.rpe_filled}/{ev.present}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h2 className="font-medium text-[var(--text)] mb-3">Предстоящие события</h2>
            {summary.upcoming_events.length === 0 ? (
              <p className="text-sm text-[var(--text-faint)]">Нет</p>
            ) : (
              <ul className="space-y-2">
                {summary.upcoming_events.map((ev) => (
                  <li key={ev.id} className="text-sm flex items-center justify-between">
                    <span className="text-[var(--text)]">{ev.title ?? ev.type}</span>
                    <span className="text-[var(--text-faint)] text-xs">{formatDateTime(ev.planned_start)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <p className="text-[var(--text-faint)] text-xs">{label}</p>
      <p className="text-[var(--text)] font-medium tabular-nums">{value !== null ? value.toFixed(1) : "—"}</p>
    </div>
  );
}
