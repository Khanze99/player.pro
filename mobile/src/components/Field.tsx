// Текстовое поле с микро-подписью — единый стиль форм

import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, font, radius, spacing } from '../theme';

interface Props extends TextInputProps {
  label?: string;
}

export function Field({ label, style, ...rest }: Props) {
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label.toUpperCase()}</Text> : null}
      <TextInput
        style={[styles.input, style]}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.s },
  label: {
    fontFamily: font.semibold,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1.4,
  },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    minHeight: 56,
    paddingHorizontal: spacing.l,
    color: colors.text,
    fontFamily: font.medium,
    fontSize: 17,
  },
});
