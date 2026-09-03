// Текстовое поле с микро-подписью — единый стиль форм

import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { spacing, type Theme, useStyles, useTheme } from '../theme';

interface Props extends TextInputProps {
  label?: string;
}

export function Field({ label, style, ...rest }: Props) {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label.toUpperCase()}</Text> : null}
      <TextInput
        style={[styles.input, style]}
        placeholderTextColor={th.textMuted}
        accessibilityLabel={label}
        {...rest}
      />
    </View>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  wrap: { gap: spacing.s },
  label: {
    fontFamily: th.font.semibold,
    fontSize: 11,
    color: th.textMuted,
    letterSpacing: 1.4,
  },
  input: {
    backgroundColor: th.surface2,
    borderWidth: 1,
    borderColor: th.border,
    borderRadius: th.radius.control,
    minHeight: 56,
    paddingHorizontal: spacing.l,
    color: th.text,
    fontFamily: th.font.medium,
    fontSize: 17,
  },
});
