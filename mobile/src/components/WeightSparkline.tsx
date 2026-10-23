// Спарклайн веса (docs/plan-weight-tracking.md). В отличие от ReadinessSparkline:
//   - шкала X — по реальной дате, не по индексу точки: разреженный ряд (вес
//     отмечают не каждый день) иначе визуально сжимал/растягивал бы интервалы;
//   - шкала Y — динамическая по min/max видимых точек, а не фикс 0–100;
//   - точки — видимые кружки + значение веса рядом (где есть место, иначе
//     подписи налезали бы друг на друга при частых отметках);
//   - по оси X — не просто первая/последняя дата, а подписи по месяцам
//     («авг 2026 · сент 2026 · окт 2026») с тонкими разделителями на границах.
// Все подписи — явный themed fill: SVG-текст по умолчанию чёрный, если fill не
// задан явно (ровно та придирка, из-за которой компонент и переписан).

import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Circle, Defs, Line, LinearGradient, Polygon, Polyline, Stop, Text as SvgText } from 'react-native-svg';

import type { WellnessEntry } from '@/api/types';
import { useTheme } from '@/theme';

const W = 300;
const H = 110;
const PAD_LEFT = 30; // место под подпись максимума/минимума по Y
const PAD_Y = 10;
const PAD_BOTTOM = 18; // место под подписи месяцев внизу графика
const MIN_LABEL_GAP = 34; // минимальный зазор между подписями точек, иначе налезают

interface Props {
  entries: WellnessEntry[]; // любой порядок, фильтруются и сортируются внутри
  color: string;
}

export function WeightSparkline({ entries, color }: Props) {
  const th = useTheme();
  const { i18n } = useTranslation();
  const points = entries
    .filter((e) => e.weight_kg !== null)
    .map((e) => ({ ts: Date.parse(e.date), weight: e.weight_kg as number }))
    .sort((a, b) => a.ts - b.ts);
  if (points.length < 2) return null;

  const plotW = W - PAD_LEFT;
  const plotH = H - PAD_BOTTOM;
  const minTs = points[0].ts;
  const maxTs = points[points.length - 1].ts;
  const tsSpan = maxTs - minTs || 1;
  const values = points.map((p) => p.weight);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const xOf = (ts: number) => PAD_LEFT + ((ts - minTs) / tsSpan) * plotW;
  const yOf = (v: number) => PAD_Y + (plotH - PAD_Y * 2) * (1 - (v - min) / span);
  const coords = points.map((p) => `${xOf(p.ts)},${yOf(p.weight)}`).join(' ');

  // Месяцы, пересекающие диапазон точек — метка стоит на середине пересечения
  // месяца с диапазоном (не на календарных границах): крайние месяцы иначе
  // подписывались бы за пределами графика или впритык к краю.
  const months = monthTicks(minTs, maxTs, i18n.language);

  // Подпись у точки — только если осталось минимум MIN_LABEL_GAP от предыдущей
  // подписанной точки: при частых отметках иначе цифры сливаются в кашу.
  // reduce() вместо внешнего mutable-счётчика — последняя подписанная точка
  // живёт в самом аккумуляторе, не в переменной рендера (react-hooks/immutability).
  const pointLabels = points
    .map((p) => ({ x: xOf(p.ts), y: yOf(p.weight), weight: p.weight }))
    .reduce<{ x: number; y: number; weight: number }[]>((acc, p) => {
      const prev = acc[acc.length - 1];
      if (prev && p.x - prev.x < MIN_LABEL_GAP) return acc;
      acc.push(p);
      return acc;
    }, []);

  return (
    <View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          <LinearGradient id="weightArea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>

        {/* Границы месяцев — тонкий пунктир, разделяет график на подписанные отрезки */}
        {months.map((m, i) =>
          i === 0 ? null : (
            <Line
              key={`div-${m.startTs}`}
              x1={xOf(m.startTs)}
              y1={PAD_Y - 4}
              x2={xOf(m.startTs)}
              y2={plotH}
              stroke={th.border}
              strokeWidth={1}
              strokeDasharray={[3, 3]}
            />
          ),
        )}

        <Polygon points={`${PAD_LEFT},${plotH} ${coords} ${W},${plotH}`} fill="url(#weightArea)" />
        <Polyline
          points={coords}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p) => (
          <Circle key={p.ts} cx={xOf(p.ts)} cy={yOf(p.weight)} r={2.6} fill={color} />
        ))}
        {pointLabels.map((p) => (
          <SvgText
            key={`lbl-${p.x}`}
            x={p.x}
            y={Math.max(p.y - 7, PAD_Y)}
            fontSize={8.5}
            fontWeight="600"
            fill={color}
            textAnchor="middle"
          >
            {p.weight}
          </SvgText>
        ))}

        {/* Шкала Y — максимум и минимум видимого диапазона, чтобы понимать,
            какой вес соответствует верху/низу линии, без подписи на каждой точке. */}
        <SvgText x={2} y={yOf(max) + 3} fontSize={9} fill={th.textMuted}>
          {max}
        </SvgText>
        <SvgText x={2} y={yOf(min) + 3} fontSize={9} fill={th.textMuted}>
          {min}
        </SvgText>

        {/* Подписи месяцев по оси времени */}
        {months.map((m) => (
          <SvgText
            key={`mo-${m.startTs}`}
            x={xOf(m.midTs)}
            y={H - 4}
            fontSize={9.5}
            fill={th.textMuted}
            textAnchor="middle"
          >
            {m.label}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

interface MonthTick {
  startTs: number; // начало месяца, либо начало диапазона точек, если месяц начался раньше
  midTs: number; // середина пересечения месяца с диапазоном — туда ставится подпись
  label: string;
}

function monthTicks(minTs: number, maxTs: number, locale: string): MonthTick[] {
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
      label: cursor.toLocaleDateString(locale, { month: 'short', year: 'numeric' }),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return ticks;
}
