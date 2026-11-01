// Шкала с прогресс-баром, кнопками −/+ по бокам и тапом по треку (дизайн-ТЗ 4.4, v3).
// По умолчанию 1–10 (Ликерт-шкалы опроса), но диапазон/шаг настраиваются — тем же
// компонентом закрыт, например, бар часов сна. Без эмодзи; направление задают
// текстовые якоря снизу.

import { useState } from 'react';
import {
  type GestureResponderEvent,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { spacing, type Theme, useStyles } from '../theme';

interface Props {
  label: string;
  lowLabel: string;
  highLabel: string;
  value: number | null;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  formatValue?: (value: number) => string;
}

export function ScaleBar({
  label,
  lowLabel,
  highLabel,
  value,
  onChange,
  min = 1,
  max = 10,
  step = 1,
  formatValue,
}: Props) {
  const styles = useStyles(makeStyles);
  const [trackWidth, setTrackWidth] = useState(0);
  const range = max - min;
  const filled = value ?? min;
  const roundToStep = (n: number) => Math.round(n / step) * step;
  const clamp = (n: number) => Math.max(min, Math.min(max, roundToStep(n)));

  const onTrackPress = (e: GestureResponderEvent) => {
    if (trackWidth <= 0) return;
    const ratio = e.nativeEvent.locationX / trackWidth;
    onChange(clamp(min + ratio * range));
  };

  const onLayout = (e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width);

  const tickCount = Math.round(range / step) - 1;
  const displayValue = value === null ? null : formatValue ? formatValue(value) : value;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, value === null && styles.valueEmpty]}>{displayValue ?? '—'}</Text>
      </View>

      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} −`}
          onPress={() => onChange(clamp(filled - step))}
          style={({ pressed }) => [styles.step, pressed && styles.stepPressed]}
        >
          <Text style={styles.stepText}>−</Text>
        </Pressable>

        <Pressable style={styles.track} onLayout={onLayout} onPress={onTrackPress}>
          <View style={[styles.fill, { width: ((filled - min) / range) * trackWidth }]} />
          {Array.from({ length: tickCount }, (_, i) => (
            <View
              key={i}
              style={[styles.tick, { left: (((i + 1) * step) / range) * trackWidth }]}
            />
          ))}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} +`}
          onPress={() => onChange(clamp(filled + step))}
          style={({ pressed }) => [styles.step, pressed && styles.stepPressed]}
        >
          <Text style={styles.stepText}>+</Text>
        </Pressable>
      </View>

      <View style={styles.anchors}>
        <Text style={styles.anchor}>{lowLabel}</Text>
        <Text style={styles.anchor}>{highLabel}</Text>
      </View>
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
    backgroundColor: th.brand,
    borderRadius: 9,
  },
  tick: { position: 'absolute', top: 4, bottom: 4, width: 1, backgroundColor: th.bg, opacity: 0.35 },
  anchors: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.s },
  anchor: { fontFamily: th.font.regular, fontSize: 13, color: th.textMuted },
});
