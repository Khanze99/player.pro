// Вход по PIN (дизайн-ТЗ 5.1): 4 точки + крупная клавиатура,
// после 4-й цифры — мгновенно, без кнопки подтверждения.

import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAnimatedValue } from '../hooks/useAnimatedValue';

import { spacing, type Theme, useStyles } from '../theme';

interface Props {
  title: string;
  subtitle?: string;
  error?: string | null;
  /** Смена значения очищает ввод и трясёт точки (ошибка PIN). */
  shakeKey?: number;
  onComplete: (pin: string) => void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

export function PinPad({ title, subtitle, error, shakeKey = 0, onComplete }: Props) {
  const styles = useStyles(makeStyles);
  const [digits, setDigits] = useState('');
  const [seenShakeKey, setSeenShakeKey] = useState(shakeKey);
  const shake = useAnimatedValue(0);

  // Подстройка состояния при смене prop — во время рендера, не в эффекте
  if (shakeKey !== seenShakeKey) {
    setSeenShakeKey(shakeKey);
    setDigits('');
  }

  useEffect(() => {
    if (shakeKey === 0) return;
    Animated.sequence(
      [10, -10, 8, -8, 0].map((toValue) =>
        Animated.timing(shake, { toValue, duration: 50, useNativeDriver: true }),
      ),
    ).start();
  }, [shakeKey, shake]);

  const press = (key: string) => {
    if (key === '⌫') {
      setDigits((d) => d.slice(0, -1));
      return;
    }
    if (!key || digits.length >= 4) return;
    const next = digits + key;
    setDigits(next);
    if (next.length === 4) {
      onComplete(next);
      setTimeout(() => setDigits(''), 300);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <Animated.View style={[styles.dots, { transform: [{ translateX: shake }] }]}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.dot, i < digits.length && styles.dotFilled]} />
        ))}
      </Animated.View>
      <Text style={styles.error}>{error ?? ' '}</Text>
      <View style={styles.pad}>
        {KEYS.map((key, i) => (
          <Pressable
            key={i}
            onPress={() => press(key)}
            accessibilityRole="button"
            disabled={!key}
            style={({ pressed }) => [styles.key, pressed && key ? styles.keyPressed : null]}
          >
            <Text style={styles.keyText}>{key}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: spacing.xxl },
  title: { fontFamily: th.font.bold, fontSize: 24, color: th.text },
  subtitle: {
    fontFamily: th.font.regular,
    fontSize: 15,
    color: th.textMuted,
    marginTop: spacing.s,
    textAlign: 'center',
  },
  dots: { flexDirection: 'row', gap: spacing.l, marginTop: spacing.xxl },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: th.border,
    backgroundColor: 'transparent',
  },
  dotFilled: { backgroundColor: th.brand, borderColor: th.brandOn },
  error: { fontFamily: th.font.medium, fontSize: 13, color: th.risk, marginVertical: spacing.l },
  pad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 3 * 88 + 2 * spacing.m,
    gap: spacing.m,
    justifyContent: 'center',
  },
  key: {
    width: 88,
    height: 72, // зона большого пальца, ≥48pt
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPressed: { backgroundColor: th.surface2 },
  keyText: { fontFamily: th.font.medium, fontSize: 28, color: th.text },
});
