// Болевой порог месячных: 0-10, вербальная шкала (НЕ 1-10, как остальные шкалы
// опроса — 0 здесь содержательно означает «боли нет», это отдельный вопрос от
// Readiness-шкал). Метки шкалы заданы пользователем в обсуждении плана
// (docs/plan-women-health-nutrition.md, "Болевой порог").
// Тот же компонент используют экран цикла (TodayTab, правка дня в календаре)
// и блок про месячные в утреннем опросе.

import { useState } from 'react';
import {
  type GestureResponderEvent,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { spacing, type Theme, useStyles } from '../theme';

const MIN = 0;
const MAX = 10;

interface Props {
  label: string;
  value: number | null;
  onChange: (value: number) => void;
}

const clamp = (n: number) => Math.max(MIN, Math.min(MAX, n));

export function PainLevelScale({ label, value, onChange }: Props) {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const [trackWidth, setTrackWidth] = useState(0);
  const filled = value ?? 0;

  const onTrackPress = (e: GestureResponderEvent) => {
    if (trackWidth <= 0) return;
    const ratio = e.nativeEvent.locationX / trackWidth;
    onChange(clamp(Math.round(ratio * MAX)));
  };

  const onLayout = (e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, value === null && styles.valueEmpty]}>{value ?? '—'}</Text>
      </View>

      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} −`}
          onPress={() => onChange(clamp(filled - 1))}
          style={({ pressed }) => [styles.step, pressed && styles.stepPressed]}
        >
          <Text style={styles.stepText}>−</Text>
        </Pressable>

        <Pressable style={styles.track} onLayout={onLayout} onPress={onTrackPress}>
          <View style={[styles.fill, { width: (filled / MAX) * trackWidth }]} />
          {Array.from({ length: MAX - 1 }, (_, i) => (
            <View key={i} style={[styles.tick, { left: ((i + 1) / MAX) * trackWidth }]} />
          ))}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} +`}
          onPress={() => onChange(clamp(filled + 1))}
          style={({ pressed }) => [styles.step, pressed && styles.stepPressed]}
        >
          <Text style={styles.stepText}>+</Text>
        </Pressable>
      </View>

      <Text style={styles.current}>{t(`cycle.painScale.${value ?? 0}`)}</Text>
    </View>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  wrap: { marginBottom: spacing.xl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { fontFamily: th.font.semibold, fontSize: 17, color: th.text },
  value: {
    fontFamily: th.font.display,
    fontSize: 22,
    color: th.brandOn,
    fontVariant: ['tabular-nums'],
  },
  valueEmpty: { color: th.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.m, marginTop: spacing.m },
  step: {
    width: 46,
    height: 46,
    borderRadius: th.radius.control,
    backgroundColor: th.surface2,
    borderWidth: 1,
    borderColor: th.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepPressed: { backgroundColor: th.border },
  stepText: { fontFamily: th.font.semibold, fontSize: 26, color: th.text, lineHeight: 30 },
  track: {
    flex: 1,
    height: 18,
    borderRadius: 9,
    backgroundColor: th.surface2,
    borderWidth: 1,
    borderColor: th.border,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: th.risk,
    borderRadius: 9,
  },
  tick: { position: 'absolute', top: 4, bottom: 4, width: 1, backgroundColor: th.bg, opacity: 0.35 },
  current: {
    fontFamily: th.font.medium,
    fontSize: 13,
    color: th.textMuted,
    textAlign: 'center',
    marginTop: spacing.s,
  },
});
