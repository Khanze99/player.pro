import { Card } from "@/components/ui/Card";
import { formatDate } from "@/lib/format";
import { bmiZoneColorVar } from "@/lib/zone";
import type { AthleteProfile, DailyMetric, WellnessEntry } from "@/types";

const BMI_ZONE_LABEL: Record<AthleteProfile["bmi_zone"], string> = {
  no_data: "Нет данных",
  underweight: "Дефицит массы",
  normal: "Норма",
  overweight: "Избыток",
  obese: "Ожирение",
};

const BMI_ZONE_NOTE: Partial<Record<AthleteProfile["bmi_zone"], string>> = {
  underweight: "Низкий ИМТ. Есть смысл обсудить с врачом команды.",
  overweight:
    "Повышенный ИМТ. Для спортсмена с развитой мышечной массой ИМТ может завышать риск — ориентир, а не диагноз. Есть смысл обсудить с врачом команды.",
  obese: "Высокий ИМТ. Рекомендуем консультацию врача команды.",
};

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

// Вес и ИМТ (docs/plan-weight-tracking.md) — спецкатегория body_metrics, та же
// видимость, что рост/вес профиля: по согласию игрока. «Недостаточно данных» —
// одна формулировка для «нет согласия» и «правда нечего показывать» (тренер не
// должен видеть, кто отказался делиться), ровно как у CycleCard.
export function WeightCard({
  profile,
  wellness,
}: {
  profile: AthleteProfile | null;
  wellness: WellnessEntry[];
}) {
  const points = wellness
    .filter((w): w is WellnessEntry & { weight_kg: number } => w.weight_kg !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const bmi = profile?.bmi ?? null;

  return (
    <Card>
      <h2 className="font-medium text-[var(--text)] mb-1">Вес и ИМТ</h2>
      <p className="text-xs text-[var(--text-faint)] mb-4">по согласию игрока (body_metrics)</p>
      {bmi == null && points.length < 2 ? (
        <p className="text-sm text-[var(--text-muted)]">Недостаточно данных</p>
      ) : (
        <>
          {bmi != null && profile && (
            <div className="flex items-baseline gap-3 mb-2">
              <span className="text-2xl font-semibold text-[var(--text)] tabular-nums">
                {profile.weight_kg} <span className="text-xs text-[var(--text-muted)]">кг</span>
              </span>
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${bmiZoneColorVar(profile.bmi_zone)}1a`, color: bmiZoneColorVar(profile.bmi_zone) }}
              >
                ИМТ {bmi.toFixed(1)} · {BMI_ZONE_LABEL[profile.bmi_zone]}
              </span>
            </div>
          )}
          {points.length >= 2 && (
            <WeightSparkline points={points} color={bmiZoneColorVar(profile?.bmi_zone)} />
          )}
          {profile && BMI_ZONE_NOTE[profile.bmi_zone] && (
            <p className="text-xs text-[var(--text-muted)] mt-2">{BMI_ZONE_NOTE[profile.bmi_zone]}</p>
          )}
        </>
      )}
    </Card>
  );
}

// Шкала X — по реальной дате, не по индексу точки (ряд разреженный, вес
// отмечают не каждый день), шкала Y — динамическая по min/max видимых точек.
// Точки — видимые кружки + значение рядом, где есть место (иначе подписи
// налезают при частых отметках); по оси — подписи месяцев с разделителями,
// не просто первая/последняя дата. Все подписи — явный fill, у SVG-текста он
// по умолчанию чёрный, если не задать явно.
function WeightSparkline({
  points,
  color,
}: {
  points: (WellnessEntry & { weight_kg: number })[];
  color: string;
}) {
  const W = 560;
  const H = 110;
  const PAD_LEFT = 36;
  const PAD_Y = 10;
  const PAD_BOTTOM = 20;
  const MIN_LABEL_GAP = 48;
  const plotW = W - PAD_LEFT;
  const plotH = H - PAD_BOTTOM;

  const series = points
    .map((p) => ({ ts: new Date(`${p.date}T12:00:00`).getTime(), weight: p.weight_kg }))
    .sort((a, b) => a.ts - b.ts);
  const minTs = series[0].ts;
  const maxTs = series[series.length - 1].ts;
  const tsSpan = maxTs - minTs || 1;
  const values = series.map((p) => p.weight);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const xOf = (ts: number) => PAD_LEFT + ((ts - minTs) / tsSpan) * plotW;
  const yOf = (v: number) => PAD_Y + (plotH - PAD_Y * 2) * (1 - (v - min) / span);
  const coords = series.map((p) => `${xOf(p.ts)},${yOf(p.weight)}`).join(" ");

  const months = monthTicks(minTs, maxTs);
  const pointLabels = series
    .map((p) => ({ x: xOf(p.ts), y: yOf(p.weight), weight: p.weight }))
    .reduce<{ x: number; y: number; weight: number }[]>((acc, p) => {
      const prev = acc[acc.length - 1];
      if (prev && p.x - prev.x < MIN_LABEL_GAP) return acc;
      acc.push(p);
      return acc;
    }, []);

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      {months.map((m) => (
        <line
          key={`div-${m.startTs}`}
          x1={xOf(m.startTs)}
          y1={PAD_Y - 4}
          x2={xOf(m.startTs)}
          y2={plotH}
          stroke={color}
          strokeOpacity={0.35}
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      ))}
      <polyline
        points={coords}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {series.map((p) => (
        <circle key={p.ts} cx={xOf(p.ts)} cy={yOf(p.weight)} r={2.6} fill={color} />
      ))}
      {pointLabels.map((p) => (
        <text
          key={`lbl-${p.x}`}
          x={p.x}
          y={Math.max(p.y - 7, PAD_Y)}
          fontSize={9}
          fontWeight={600}
          fill={color}
          textAnchor="middle"
        >
          {p.weight}
        </text>
      ))}
      <text x={2} y={yOf(max) + 3} fontSize={10} fill="var(--text-faint)">
        {max}
      </text>
      <text x={2} y={yOf(min) + 3} fontSize={10} fill="var(--text-faint)">
        {min}
      </text>
      {months.map((m) => (
        <text
          key={`mo-${m.startTs}`}
          x={xOf(m.midTs)}
          y={H - 5}
          fontSize={10.5}
          fill="var(--text-faint)"
          textAnchor="middle"
        >
          {m.label}
        </text>
      ))}
    </svg>
  );
}

interface MonthTick {
  startTs: number;
  midTs: number;
  label: string;
}

function monthTicks(minTs: number, maxTs: number): MonthTick[] {
  const ticks: MonthTick[] = [];
  const cursor = new Date(minTs);
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= maxTs) {
    const startTs = Math.max(cursor.getTime(), minTs);
    const next = new Date(cursor);
    next.setMonth(next.getMonth() + 1);
    const endTs = Math.min(next.getTime() - 1, maxTs);
    ticks.push({
      startTs,
      midTs: (startTs + endTs) / 2,
      label: cursor.toLocaleDateString("ru-RU", { month: "short", year: "numeric" }),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return ticks;
}
