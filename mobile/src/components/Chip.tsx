// Чип статуса v2: угловатый, uppercase, точка со свечением;
// статус дублируется текстом, не только цветом

import { StyleSheet, Text, View } from 'react-native';

import { colors, font, radius, spacing } from '../theme';

interface Props {
  label: string;
  dotColor: string;
}

export function Chip({ label, dotColor }: Props) {
  return (
    <View style={styles.chip}>
      <View
        style={[
          styles.dot,
          { backgroundColor: dotColor, shadowColor: dotColor },
        ]}
      />
      <Text style={styles.label}>{label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.chip,
    paddingHorizontal: spacing.m,
    paddingVertical: 7,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    shadowOpacity: 0.9,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  label: { fontFamily: font.semibold, fontSize: 10.5, color: colors.text, letterSpacing: 1 },
});
