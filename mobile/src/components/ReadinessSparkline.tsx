// Спарклайн Readiness за последние 14 дней — общий для своего прогресса
// (history.tsx) и карточки игрока у тренера/врача (athlete/[id].tsx).
// Подписи дат по краям + значение последней точки — иначе непонятно, что за
// график и по каким дням (шкала сама по себе — 0–100, раздел 6.4 ТЗ).

import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Defs, LinearGradient, Polygon, Polyline, Stop, Text as SvgText } from 'react-native-svg';

import type { DailyMetric } from '@/api/types';
import { readinessColor, type Theme, useStyles } from '@/theme';

const W = 300;
const H = 72;
const PAD_RIGHT = 28; // место под подпись последнего значения (до 3 цифр) — не обрезается
const PAD_Y = 10;

export function ReadinessSparkline({ metrics }: { metrics: DailyMetric[] }) {
  const styles = useStyles(makeStyles);
  const { i18n } = useTranslation();
  const points = metrics.filter((m) => m.readiness !== null).slice(-14);
  if (points.length < 2) return null;

  const plotW = W - PAD_RIGHT;
  const xOf = (i: number) => (i / (points.length - 1)) * plotW;
  const yOf = (m: DailyMetric) => H - PAD_Y - (m.readiness! / 100) * (H - PAD_Y * 2);
  const coords = points.map((m, i) => `${xOf(i)},${yOf(m)}`).join(' ');
  const last = points[points.length - 1];
  const lastX = xOf(points.length - 1);
  const lastY = yOf(last);
  const color = readinessColor(last.readiness_zone);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });

  return (
    <View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Polygon points={`0,${H} ${coords} ${plotW},${H}`} fill="url(#area)" />
        <Polyline
          points={coords}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Прямая подпись конечной точки (раздел «Labels»: линия → значение в конце) */}
        <SvgText
          x={lastX + 5}
          y={Math.min(Math.max(lastY + 4, 10), H - 4)}
          fontSize={11}
          fontWeight="600"
          fill={color}
        >
          {last.readiness}
        </SvgText>
      </Svg>
      <View style={styles.axisRow}>
        <Text style={styles.axisLabel}>{fmtDate(points[0].date)}</Text>
        <Text style={styles.axisLabel}>{fmtDate(last.date)}</Text>
      </View>
    </View>
  );
}

const makeStyles = (th: Theme) =>
  StyleSheet.create({
    axisRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
    axisLabel: { fontFamily: th.font.regular, fontSize: 10.5, color: th.textMuted },
  });
