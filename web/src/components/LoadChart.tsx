import { Card } from "@/components/ui/Card";
import { formatDate } from "@/lib/format";
import type { DailyMetric } from "@/types";

// Веб-версия mobile/src/components/LoadBars.tsx — те же уроки ясности (единицы AU,
// значение над каждым столбцом), белая палитра.
export function LoadChart({ metrics }: { metrics: DailyMetric[] }) {
  const week = metrics.slice(-7);
  const max = Math.max(...week.map((m) => m.daily_load), 1);

  return (
    <Card>
      <h2 className="font-medium text-[var(--text)]">Нагрузка за неделю</h2>
      <p className="text-xs text-[var(--text-faint)] mt-0.5 mb-4">AU — RPE × минуты тренировки</p>
      {week.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">Нет данных</p>
      ) : (
        <div className="flex items-end gap-2 h-36">
          {week.map((m) => (
            <div key={m.date} className="flex-1 flex flex-col items-center justify-end gap-1">
              <span className="text-[10px] text-[var(--text-faint)] tabular-nums">
                {Math.round(m.daily_load)}
              </span>
              <div
                className="w-full rounded"
                style={{
                  height: Math.max(4, (m.daily_load / max) * 96),
                  backgroundColor: m.daily_load > 0 ? "var(--accent)" : "var(--surface-muted)",
                }}
              />
              <span className="text-[11px] text-[var(--text-faint)] tabular-nums">{m.date.slice(8)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function ReadinessTrendChart({ metrics }: { metrics: DailyMetric[] }) {
  const points = metrics.filter((m) => m.readiness !== null).slice(-14);

  return (
    <Card>
      <h2 className="font-medium text-[var(--text)] mb-4">Тренд готовности</h2>
      {points.length < 2 ? (
        <p className="text-sm text-[var(--text-muted)]">Недостаточно данных — нужно хотя бы 2 опроса</p>
      ) : (
        <Sparkline points={points} />
      )}
    </Card>
  );
}

function Sparkline({ points }: { points: DailyMetric[] }) {
  const W = 560;
  const H = 100;
  const PAD_RIGHT = 34;
  const PAD_Y = 12;
  const plotW = W - PAD_RIGHT;

  const xOf = (i: number) => (i / (points.length - 1)) * plotW;
  const yOf = (m: DailyMetric) => H - PAD_Y - (m.readiness! / 100) * (H - PAD_Y * 2);
  const coords = points.map((m, i) => `${xOf(i)},${yOf(m)}`).join(" ");
  const last = points[points.length - 1];
  const lastX = xOf(points.length - 1);
  const lastY = yOf(last);
  const color = "var(--accent)";

  return (
    <div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <polyline points={coords} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <text x={lastX + 5} y={Math.min(Math.max(lastY + 4, 12), H - 4)} fontSize={13} fontWeight={600} fill={color}>
          {last.readiness}
        </text>
      </svg>
      <div className="flex justify-between text-[11px] text-[var(--text-faint)] mt-1">
        <span>{formatDate(points[0].date)}</span>
        <span>{formatDate(last.date)}</span>
      </div>
    </div>
  );
}
