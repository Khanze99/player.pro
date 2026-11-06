// Радар по оси сезона (docs/plan-player-season-stats.md) — те же per-90/%,
// что в текстовом списке рядом (один источник чисел). Потолок оси — заданный
// каталогом radar_max (разумный фиксированный максимум, не персентиль среди
// игроков — см. «Открытые вопросы» плана). Правила dataviz-скилла для одной
// серии: без легенды (подписывает заголовок карточки), подписи осей в тоне
// текста, не цветом серии; значение прямо у вершины.

import { radarAxisText } from "@/lib/seasonStatLabels";
import type { SeasonStat, SportMetricDef } from "@/types";

export interface RadarAxis {
  key: string;
  value: number;
  max: number;
  // Процент форматируется как "50%", счётчик — как число (per-90). Раньше
  // выводился из `max <= 1`, что ломалось на xG: radar_max=1 у него выбран
  // просто потому что xG/90 обычно меньше единицы, а не потому что это
  // процент — xG=1.01 показывался как «101%». Нужен настоящий unit метрики,
  // не угадывание по потолку оси.
  isPercent: boolean;
}

const MIN_AXES = 3;

// onRadarKeys — выбор показателей на эту сессию просмотра (docs/design-
// player-passport-theme.md, «Показатели N из M»): чисто client-state,
// каталог (SportMetricDef.on_radar_default) при этом не трогаем и никуда не
// пишем — это не редактирование каталога через UI, а предпочтение экрана,
// которое не переживает переключение сезона/перезагрузку.
export function computeRadarAxes(
  entry: SeasonStat,
  defs: SportMetricDef[],
  onRadarKeys?: Set<string>,
): RadarAxis[] {
  const metricsByKey = new Map(entry.metrics.map((m) => [m.key, m]));
  const axes: RadarAxis[] = [];
  for (const def of defs) {
    const onRadar = onRadarKeys ? onRadarKeys.has(def.key) : def.on_radar_default;
    if (!onRadar || !def.radar_max) continue;
    const metric = metricsByKey.get(def.key);
    if (!metric) continue;
    const isPercent = def.unit === "percent";
    const value = isPercent ? metric.pct : metric.per_90;
    if (value === null || value === undefined) continue;
    axes.push({ key: def.key, value, max: def.radar_max, isPercent });
  }
  return axes;
}

export function SeasonStatRadar({ axes }: { axes: RadarAxis[] }) {
  if (axes.length < MIN_AXES) return null;

  const size = 380;
  const cx = size / 2;
  const cy = size / 2 - 8;
  const r = 128;
  const n = axes.length;
  const angleFor = (i: number) => -Math.PI / 2 + i * ((2 * Math.PI) / n);
  const pt = (i: number, frac: number): [number, number] => {
    const a = angleFor(i);
    return [cx + frac * r * Math.cos(a), cy + frac * r * Math.sin(a)];
  };

  const rings = [0.25, 0.5, 0.75, 1];
  const fracs = axes.map((a) => Math.max(0, Math.min(1, a.value / a.max)));
  const dataPoints = axes.map((_, i) => pt(i, fracs[i]));

  return (
    <svg width="100%" height={size} viewBox={`0 0 ${size} ${size}`} overflow="visible">
      {rings.map((frac) => (
        <polygon
          key={frac}
          points={axes.map((_, i) => pt(i, frac).join(",")).join(" ")}
          fill="none"
          stroke="var(--border)"
          strokeWidth={1}
        />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" strokeWidth={1} />;
      })}

      <polygon
        points={dataPoints.map((p) => p.join(",")).join(" ")}
        // --accent-soft — непрозрачный пастельный токен (чипы/плашки), тут не
        // годится: полотно радара должно пропускать сетку колец под собой,
        // поэтому заливка — сам --accent с явной fillOpacity, не готовый soft-токен.
        fill="var(--accent)"
        fillOpacity={0.22}
        stroke="var(--accent)"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {dataPoints.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
      ))}

      {axes.map((axis, i) => {
        const [lx, ly] = pt(i, 1.22);
        const angle = angleFor(i);
        const cos = Math.cos(angle);
        const anchor = cos > 0.25 ? "start" : cos < -0.25 ? "end" : "middle";
        const display = axis.isPercent ? `${Math.round(axis.value * 100)}%` : axis.value.toFixed(2);
        return (
          <g key={axis.key}>
            <text x={lx} y={ly - 6} textAnchor={anchor} fontSize={12} fontWeight={600} fill="var(--text-muted)">
              {radarAxisText(axis.key)}
            </text>
            <text x={lx} y={ly + 11} textAnchor={anchor} fontSize={15} fontWeight={700} fill="var(--text)">
              {display}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
