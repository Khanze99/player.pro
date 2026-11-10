// Второстепенная кнопка: контур без заливки, рядом с основной Button.

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { spacing, type Theme, useStyles, useTheme } from '../theme';

interface Props {
  title: string;
  onPress: () => void;
  icon?: ReactNode;
  tone?: 'default' | 'risk';
  disabled?: boolean;
}

export function OutlineButton({ title, onPress, icon, tone = 'default', disabled }: Props) {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.wrap, disabled && styles.disabled, pressed && { opacity: 0.7 }]}
    >
      {icon}
      <Text style={[styles.text, tone === 'risk' && { color: th.risk }]}>{title}</Text>
    </Pressable>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  wrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s,
    minHeight: 52,
    paddingHorizontal: spacing.m,
    borderRadius: th.radius.control,
    borderWidth: 1,
    borderColor: th.border,
    backgroundColor: th.surface,
  },
  disabled: { opacity: 0.4 },
  text: { fontFamily: th.font.semibold, fontSize: 15, color: th.text },
});
