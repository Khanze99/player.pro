// Выбор одного варианта из набора чипов (тип травмы/недомогания). Повторный тап снимает выбор.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, font, radius, spacing } from '../theme';

interface Props<T extends string> {
  options: readonly T[];
  value: T | null;
  onSelect: (value: T | null) => void;
  labelFor: (value: T) => string;
}

export function OptionChips<T extends string>({ options, value, onSelect, labelFor }: Props<T>) {
  return (
    <View style={styles.row}>
      {options.map((opt) => {
        const active = value === opt;
        return (
          <Pressable
            key={opt}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(active ? null : opt)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.text, active && styles.textActive]}>{labelFor(opt)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s },
  chip: {
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    borderRadius: radius.chip,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 40,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  text: { fontFamily: font.medium, fontSize: 14, color: colors.textMuted },
  textActive: { color: '#FFFFFF' },
});
