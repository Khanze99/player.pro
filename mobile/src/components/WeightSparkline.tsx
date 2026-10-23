// Спарклайн веса (docs/plan-weight-tracking.md) — тот же приём, что
// ReadinessSparkline (полилиния + градиентная область + подпись последней
// точки), но без фиксированной шкалы 0–100: вес колеблется в узком диапазоне
// около текущего значения, своя шкала строится по min/max видимых точек.
// Разреженный ряд — точка есть только за дни, когда вес отмечали в опросе.

import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Defs, LinearGradient, Polygon, Polyline, Stop } from 'react-native-svg';

import type { WellnessEntry } from '@/api/types';
import { type Theme, useStyles } from '@/theme';

const W = 300;
const H = 64;
const PAD_Y = 8;

interface Props {
  entries: WellnessEntry[]; // любой порядок, фильтруются и сортируются внутри
  color: string;
}

export function WeightSparkline({ entries, color }: Props) {
  const styles = useStyles(makeStyles);
  const { i18n } = useTranslation();
  const points = entries
    .filter((e) => e.weight_kg !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (points.length < 2) return null;

  const values = points.map((p) => p.weight_kg as number);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // Полностью плоский ряд (один и тот же вес каждый день) — центрируем линию,
  // не делим на 0.
  const span = max - min || 1;

  const xOf = (i: number) => (i / (points.length - 1)) * W;
  const yOf = (v: number) => H - PAD_Y - ((v - min) / span) * (H - PAD_Y * 2);
  const coords = points.map((p, i) => `${xOf(i)},${yOf(p.weight_kg as number)}`).join(' ');

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });

  return (
    <View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          <LinearGradient id="weightArea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Polygon points={`0,${H} ${coords} ${W},${H}`} fill="url(#weightArea)" />
        <Polyline
          points={coords}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
      <View style={styles.axisRow}>
        <Text style={styles.axisLabel}>{fmtDate(points[0].date)}</Text>
        <Text style={styles.axisLabel}>{fmtDate(points[points.length - 1].date)}</Text>
      </View>
    </View>
  );
}

const makeStyles = (th: Theme) =>
  StyleSheet.create({
    axisRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
    axisLabel: { fontFamily: th.font.regular, fontSize: 10.5, color: th.textMuted },
  });
