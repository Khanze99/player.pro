// Радар по оси сезона (docs/plan-player-season-stats.md): те же per-90/%, что
// в списке метрик рядом (один источник чисел). Потолок оси задаёт каталог
// (radar_max), не персентиль среди игроков (см. «Открытые вопросы» плана).
//
// Второй контур, пунктир: медиана команды за сезон (TeamBenchmark), чтобы
// цифра игрока читалась относительно своего состава, а не сама по себе.
// Правила dataviz-скилла: серия игрока одна цветом акцента, ориентир
// нейтральным пунктиром без заливки; подписи осей в тоне текста; значение у
// вершины; легенда в шапке карточки, не внутри SVG.

import { radarAxisText } from "@/lib/seasonStatLabels";
import type { SeasonStat, SportMetricDef, TeamBenchmark } from "@/types";

export interface RadarAxis {
  key: string;
  value: number;
  max: number;
  // Процент форматируется как "50%", счётчик как число (per-90). Нужен
  // настоящий unit метрики, не угадывание по потолку оси: у xG radar_max=1,
  // но это не процент (xG=1.01 иначе показывался как «101%»).
  isPercent: boolean;
  // Медиана команды по этой оси; null, если ориентира нет
  benchmark: number | null;
}

export const MIN_RADAR_AXES = 3;

// defs должны прийти уже упорядоченными (orderDefs): порядок осей по
// часовой стрелке = порядок категорий, иначе соседние оси из разных
// категорий перемешиваются и форма многоугольника ничего не говорит.
// onRadarKeys: выбор показателей на эту сессию просмотра («Показатели N из
// M»), чисто client-state, каталог (on_radar_default) не трогаем.
export function computeRadarAxes(
  entry: SeasonStat,
  defs: SportMetricDef[],
  onRadarKeys: Set<string>,
  benchmark: TeamBenchmark | null,
): RadarAxis[] {
  const metricsByKey = new Map(entry.metrics.map((m) => [m.key, m]));
  const benchByKey = new Map((benchmark?.metrics ?? []).map((m) => [m.key, m]));
  const axes: RadarAxis[] = [];
  for (const def of defs) {
    if (!onRadarKeys.has(def.key) || !def.radar_max) continue;
    const metric = metricsByKey.get(def.key);
    if (!metric) continue;
    const isPercent = def.unit === "percent";
    const value = isPercent ? metric.pct : metric.per_90;
    if (value === null || value === undefined) continue;
    const bench = benchByKey.get(def.key);
    axes.push({
      key: def.key,
      value,
      max: def.radar_max,
      isPercent,
      benchmark: (isPercent ? bench?.pct : bench?.per_90) ?? null,
    });
  }
  return axes;
}

export function formatAxisValue(value: number, isPercent: boolean): string {
  return isPercent ? `${Math.round(value * 100)}%` : value.toFixed(2);
}

// Широкий холст: длинные подписи слева/справа («Прогр. действия») не должны
// уходить за край viewBox
const W = 640;
const H = 480;
const CX = W / 2;
const CY = H / 2 + 4;
const R = 158;

export function SeasonStatRadar({ axes, dimmed = false }: { axes: RadarAxis[]; dimmed?: boolean }) {
  if (axes.length < MIN_RADAR_AXES) return null;

  const n = axes.length;
  const angleFor = (i: number) => -Math.PI / 2 + i * ((2 * Math.PI) / n);
  const pt = (i: number, frac: number): [number, number] => {
    const a = angleFor(i);
    return [CX + frac * R * Math.cos(a), CY + frac * R * Math.sin(a)];
  };
  const clamp = (v: number, max: number) => Math.max(0, Math.min(1, v / max));
  const poly = (fracs: number[]) => fracs.map((f, i) => pt(i, f).join(",")).join(" ");

  const rings = [1, 0.75, 0.5, 0.25];
  const playerFracs = axes.map((a) => clamp(a.value, a.max));
  const hasBench = axes.some((a) => a.benchmark !== null);
  const benchFracs = axes.map((a) => (a.benchmark === null ? 0 : clamp(a.benchmark, a.max)));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      role="img"
      aria-label={`Радар игрока по ${n} показателям`}
    >
      <defs>
        <radialGradient id="pp-radar-fill" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style={{ stopColor: "var(--accent)", stopOpacity: 0.08 }} />
          <stop offset="100%" style={{ stopColor: "var(--accent)", stopOpacity: 0.38 }} />
        </radialGradient>
      </defs>

      {/* Кольца: полосы чуть разной плотности дают глубину без лишних линий */}
      {rings.map((frac, k) => (
        <polygon
          key={frac}
          points={poly(axes.map(() => frac))}
          fill={k % 2 === 0 ? "var(--surface-muted)" : "var(--surface)"}
          fillOpacity={0.55}
          stroke="var(--border)"
          strokeWidth={1}
        />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="var(--border)" strokeWidth={1} />;
      })}

      {hasBench && (
        <polygon
          points={poly(benchFracs)}
          fill="none"
          stroke="var(--text-muted)"
          strokeWidth={1.5}
          strokeDasharray="5 4"
          strokeLinejoin="round"
        />
      )}

      <g opacity={dimmed ? 0.45 : 1}>
        <polygon
          points={poly(playerFracs)}
          fill="url(#pp-radar-fill)"
          stroke="var(--accent)"
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
        {playerFracs.map((f, i) => {
          const [x, y] = pt(i, f);
          return <circle key={i} cx={x} cy={y} r={4.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />;
        })}
      </g>

      {axes.map((axis, i) => {
        const [lx, ly] = pt(i, 1.2);
        const cos = Math.cos(angleFor(i));
        const sin = Math.sin(angleFor(i));
        const anchor = cos > 0.25 ? "start" : cos < -0.25 ? "end" : "middle";
        // Верхняя подпись поднимается, нижняя опускается: блок из 2-3 строк
        // не должен наезжать на кольцо
        const top = ly + (sin < -0.6 ? -18 : sin > 0.6 ? 6 : -8);
        return (
          <g key={axis.key}>
            <text x={lx} y={top} textAnchor={anchor} fontSize={14} fontWeight={500} fill="var(--text-muted)">
              {radarAxisText(axis.key)}
            </text>
            <text
              x={lx}
              y={top + 21}
              textAnchor={anchor}
              fontSize={19}
              fontWeight={700}
              fill="var(--text)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {formatAxisValue(axis.value, axis.isPercent)}
            </text>
            {axis.benchmark !== null && (
              <text
                x={lx}
                y={top + 39}
                textAnchor={anchor}
                fontSize={12.5}
                fill="var(--text-faint)"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                команда {formatAxisValue(axis.benchmark, axis.isPercent)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
