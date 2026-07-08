// «Пульс готовности» v2 (дизайн-ТЗ 4.5): gauge с рисками, градиентной дугой
// и свечением зоны; лёгкая пульсация, уважает reduced motion.

import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Stop } from 'react-native-svg';

import { useAnimatedValue } from '../hooks/useAnimatedValue';
import { colors, font, readinessColor } from '../theme';

const SIZE = 250;
const STROKE = 12;
const R = (SIZE - STROKE) / 2 - 14;
const CIRCUMFERENCE = 2 * Math.PI * R;
const TICKS = 48;

interface Props {
  value: number | null; // 0–100, null — данных нет
  zone: string | null;
  label: string;
}

function Ticks({ color, progress }: { color: string; progress: number }) {
  const cx = SIZE / 2;
  const tickOuter = SIZE / 2 - 2;
  const tickInner = tickOuter - 7;
  return (
    <>
      {Array.from({ length: TICKS }, (_, i) => {
        // Дуга начинается сверху (−90°) и идёт по часовой
        const angle = (-90 + (i / TICKS) * 360) * (Math.PI / 180);
        const active = i / TICKS <= progress && progress > 0;
        return (
          <Line
            key={i}
            x1={cx + tickInner * Math.cos(angle)}
            y1={cx + tickInner * Math.sin(angle)}
            x2={cx + tickOuter * Math.cos(angle)}
            y2={cx + tickOuter * Math.sin(angle)}
            stroke={active ? color : colors.surface2}
            strokeOpacity={active ? 0.9 : 1}
            strokeWidth={2}
            strokeLinecap="round"
          />
        );
      })}
    </>
  );
}

export function ReadinessRing({ value, zone, label }: Props) {
  const color = value === null ? colors.low : readinessColor(zone);
  const progress = value === null ? 0 : value / 100;
  const scale = useAnimatedValue(1);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (reduceMotion || value === null) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.02, duration: 550, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 850, useNativeDriver: true }),
        Animated.delay(1400),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [reduceMotion, value, scale]);

  const dash = `${CIRCUMFERENCE * progress} ${CIRCUMFERENCE}`;
  const rotate = `rotate(-90 ${SIZE / 2} ${SIZE / 2})`;

  return (
    <Animated.View style={[styles.wrap, { transform: [{ scale }] }]}>
      <Svg width={SIZE} height={SIZE}>
        <Defs>
          <LinearGradient id="arc" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={color} stopOpacity={1} />
            <Stop offset="100%" stopColor={color} stopOpacity={0.55} />
          </LinearGradient>
        </Defs>
        <Ticks color={color} progress={progress} />
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={colors.surface2} strokeWidth={STROKE} fill="none" />
        {value !== null && (
          <>
            {/* Свечение под дугой */}
            <Circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              stroke={color}
              strokeOpacity={0.22}
              strokeWidth={STROKE + 10}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={dash}
              transform={rotate}
            />
            <Circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              stroke="url(#arc)"
              strokeWidth={STROKE}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={dash}
              transform={rotate}
            />
          </>
        )}
      </Svg>
      <View style={styles.center}>
        <Text style={[styles.value, { color: value === null ? colors.textMuted : colors.text }]}>
          {value ?? '—'}
        </Text>
        <Text style={styles.label}>{label.toUpperCase()}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', alignItems: 'center' },
  value: { fontFamily: font.display, fontSize: 62, lineHeight: 74 },
  label: {
    fontFamily: font.semibold,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 2.4,
    marginTop: -2,
  },
});
