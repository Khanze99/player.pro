// Стат-тайл: цветовая метка-линия сверху, крупное число (Unbounded),
// микро-подпись — «приборная панель» спортсмена.

import { StyleSheet, Text, View } from 'react-native';

import { colors, font, radius, spacing } from '../theme';

interface Props {
  label: string;
  value: string;
  unit?: string;
  accent?: string;
}

export function StatTile({ label, value, unit, accent = colors.brand }: Props) {
  return (
    <View style={styles.tile}>
      <View style={[styles.accent, { backgroundColor: accent }]} />
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <View style={styles.valueRow}>
        <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingHorizontal: spacing.m,
    paddingBottom: spacing.m,
    paddingTop: spacing.m + 4,
    overflow: 'hidden',
  },
  accent: { position: 'absolute', top: 0, left: 0, right: 0, height: 2.5, opacity: 0.9 },
  label: { fontFamily: font.semibold, fontSize: 10, color: colors.textMuted, letterSpacing: 1.2 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: spacing.s },
  value: { fontFamily: font.display, fontSize: 20, color: colors.text },
  unit: { fontFamily: font.medium, fontSize: 11, color: colors.textMuted },
});
