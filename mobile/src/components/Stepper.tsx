// Быстрый степпер для длительности (дизайн-ТЗ 5.4)

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, font, radius, spacing } from '../theme';

interface Props {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
}

export function Stepper({ value, onChange, step = 5, min = 5, max = 300 }: Props) {
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        onPress={() => onChange(Math.max(min, value - step))}
        style={styles.button}
      >
        <Text style={styles.buttonText}>−</Text>
      </Pressable>
      <Text style={styles.value}>{value}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => onChange(Math.min(max, value + step))}
        style={styles.button}
      >
        <Text style={styles.buttonText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.l },
  button: {
    width: 56,
    height: 56,
    borderRadius: radius.control,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontFamily: font.semibold, fontSize: 24, color: colors.text },
  value: {
    fontFamily: font.semibold,
    fontSize: 24,
    color: colors.text,
    minWidth: 64,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
