// Общая типографика: заголовки экранов и микро-подписи (uppercase, letter-spacing —
// технический sport-стиль)

import type { ReactNode } from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { colors, font } from '@/theme';

interface Props {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}

export function ScreenTitle({ children, style }: Props) {
  return <Text style={[styles.title, style]}>{children}</Text>;
}

export function MicroLabel({ children, style }: Props) {
  return <Text style={[styles.micro, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  title: { fontFamily: font.bold, fontSize: 24, color: colors.text, letterSpacing: -0.3 },
  micro: {
    fontFamily: font.semibold,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
});
