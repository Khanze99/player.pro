// Выбор одного варианта из набора чипов (тип травмы/недомогания). Повторный тап снимает выбор.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { spacing, type Theme, useStyles } from '../theme';

interface Props<T extends string> {
  options: readonly T[];
  value: T | null;
  onSelect: (value: T | null) => void;
  labelFor: (value: T) => string;
}

export function OptionChips<T extends string>({ options, value, onSelect, labelFor }: Props<T>) {
  const styles = useStyles(makeStyles);
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

const makeStyles = (th: Theme) => StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s },
  chip: {
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    borderRadius: th.radius.chip,
    backgroundColor: th.surface2,
    borderWidth: 1,
    borderColor: th.border,
    minHeight: 40,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: th.brand, borderColor: th.brandOn },
  text: { fontFamily: th.font.medium, fontSize: 14, color: th.textMuted },
  textActive: { color: th.onBrand },
});
