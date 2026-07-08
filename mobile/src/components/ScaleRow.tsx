// Шкала-сегменты 1–5 (дизайн-ТЗ 4.4): пять крупных тап-зон, эмодзи,
// подписи крайних значений. Одно касание = ответ.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, font, radius, spacing } from '../theme';

interface Props {
  label: string;
  emoji: string;
  lowLabel: string;
  highLabel: string;
  value: number | null;
  onChange: (value: number) => void;
}

export function ScaleRow({ label, emoji, lowLabel, highLabel, value, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.emoji}>{emoji}</Text>
        <Text style={styles.label}>{label}</Text>
      </View>
      <View style={styles.row}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            accessibilityRole="button"
            accessibilityState={{ selected: value === n }}
            style={[styles.segment, value === n && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, value === n && styles.segmentTextActive]}>{n}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.anchors}>
        <Text style={styles.anchor}>{lowLabel}</Text>
        <Text style={styles.anchor}>{highLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, marginBottom: spacing.m },
  emoji: { fontSize: 20 },
  label: { fontFamily: font.semibold, fontSize: 18, color: colors.text },
  row: { flexDirection: 'row', gap: spacing.s },
  segment: {
    flex: 1,
    minHeight: 56, // тап-зона ≥ 48 pt
    borderRadius: radius.control,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  segmentText: { fontFamily: font.semibold, fontSize: 18, color: colors.textMuted },
  segmentTextActive: { color: '#FFFFFF' },
  anchors: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  anchor: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted },
});
