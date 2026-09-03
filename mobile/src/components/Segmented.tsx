// Сегментированный переключатель разделов. Знакомый паттерн, без изобретений
// (дизайн-ТЗ 1.4) — используется и для разделов дашборда, и для вкладок внутри «Статуса».

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { spacing, type Theme, useStyles } from '../theme';

interface Props<T extends string> {
  options: readonly T[];
  value: T;
  onSelect: (value: T) => void;
  labelFor: (value: T) => string;
  /** Много вариантов — прокручиваем, иначе делим ширину поровну */
  scrollable?: boolean;
}

export function Segmented<T extends string>({
  options,
  value,
  onSelect,
  labelFor,
  scrollable = false,
}: Props<T>) {
  const styles = useStyles(makeStyles);
  const items = options.map((option) => {
    const active = option === value;
    return (
      <Pressable
        key={option}
        onPress={() => onSelect(option)}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        style={[styles.item, !scrollable && styles.itemFlex, active && styles.itemActive]}
      >
        <Text style={[styles.text, active && styles.textActive]} numberOfLines={1}>
          {labelFor(option)}
        </Text>
      </Pressable>
    );
  });

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollTrack}
      >
        {items}
      </ScrollView>
    );
  }
  return <View style={styles.track}>{items}</View>;
}

const makeStyles = (th: Theme) => StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: th.surface2,
    borderRadius: th.radius.control,
    padding: 3,
    gap: 3,
  },
  scrollTrack: { flexDirection: 'row', gap: spacing.s, paddingRight: spacing.screen },
  item: {
    paddingVertical: spacing.s,
    paddingHorizontal: spacing.m,
    borderRadius: th.radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemFlex: { flex: 1 },
  itemActive: { backgroundColor: th.brand },
  text: { fontFamily: th.font.semibold, fontSize: 13, color: th.textMuted },
  textActive: { color: th.onBrand },
});
