// Бублик метрики (дизайн-ТЗ 4.1: цвет = состояние, число = детали).
// Общий для готовности, нагрузки, перфоманса и доступности — шкала и цвет приходят с сервера.

import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors, font, radius, spacing } from '../theme';

const SIZE = 72;
const STROKE = 7;
const R = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

interface Props {
  value: number | null;
  scaleMax: number;
  color: string;
  label: string;
  caption: string;
  /** Число под дугой: у ACWR два знака, у остальных — целое */
  digits?: number;
}

export function Donut({ value, scaleMax, color, label, caption, digits = 0 }: Props) {
  const hasValue = value !== null;
  const progress = hasValue ? Math.max(0, Math.min(1, value / scaleMax)) : 0;
  const dash = CIRCUMFERENCE * progress;

  return (
    <View style={styles.wrap}>
      <View style={styles.ring}>
        <Svg width={SIZE} height={SIZE}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            stroke={colors.surface2}
            strokeWidth={STROKE}
            fill="none"
          />
          {hasValue && (
            <Circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              stroke={color}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
              // Дуга стартует сверху, как у кольца готовности игрока
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
              fill="none"
            />
          )}
        </Svg>
        <View style={styles.center} pointerEvents="none">
          <Text style={styles.value}>{hasValue ? value.toFixed(digits) : '—'}</Text>
        </View>
      </View>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.caption, { color: hasValue ? color : colors.textMuted }]} numberOfLines={2}>
        {caption}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    // Не flex:1 — иначе внутри flexWrap все четыре ужимаются в одну строку
    // и SVG фиксированной ширины вылезает за карточку. Basis < 50% даёт сетку 2×2.
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 0,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    paddingVertical: spacing.l,
    paddingHorizontal: spacing.s,
    gap: 2,
  },
  ring: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { fontFamily: font.display, fontSize: 18, color: colors.text },
  label: {
    fontFamily: font.semibold,
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 1.1,
    marginTop: spacing.s,
    textTransform: 'uppercase',
  },
  caption: { fontFamily: font.medium, fontSize: 12, textAlign: 'center' },
});
