// Шкала RPE 1–10 (CR10): градиент зелёный→красный, текстовые якоря (дизайн-ТЗ 4.4)

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, font, radius, spacing } from '../theme';

// Ступени градиента зелёный → жёлтый → красный
const STEP_COLORS = [
  '#2FD27A',
  '#4FCD6B',
  '#7BC95A',
  '#A8C34A',
  '#D2BC3C',
  '#FFB02E',
  '#FF9A38',
  '#FF8243',
  '#FF6E4F',
  '#FF5C5C',
];

interface Props {
  value: number | null;
  onChange: (value: number) => void;
  lowLabel: string;
  highLabel: string;
}

export function RpeScale({ value, onChange, lowLabel, highLabel }: Props) {
  return (
    <View>
      <View style={styles.grid}>
        {STEP_COLORS.map((color, i) => {
          const n = i + 1;
          const active = value === n;
          return (
            <Pressable
              key={n}
              onPress={() => onChange(n)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[
                styles.cell,
                { borderColor: color },
                active && { backgroundColor: color },
              ]}
            >
              <Text style={[styles.cellText, active && styles.cellTextActive]}>{n}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.anchors}>
        <Text style={styles.anchor}>{lowLabel}</Text>
        <Text style={styles.anchor}>{highLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s },
  cell: {
    width: '17.6%',
    minHeight: 56,
    borderRadius: radius.control,
    borderWidth: 2,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: { fontFamily: font.semibold, fontSize: 18, color: colors.text },
  cellTextActive: { color: '#0C0F16' },
  anchors: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.s },
  anchor: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted },
});
