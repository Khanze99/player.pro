// Общая типографика: заголовки экранов и микро-подписи (uppercase, letter-spacing —
// технический sport-стиль)

import type { ReactNode } from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { type Theme, useStyles } from '@/theme';

interface Props {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}

export function ScreenTitle({ children, style }: Props) {
  const styles = useStyles(makeStyles);
  return <Text style={[styles.title, style]}>{children}</Text>;
}

export function MicroLabel({ children, style }: Props) {
  const styles = useStyles(makeStyles);
  return <Text style={[styles.micro, style]}>{children}</Text>;
}

const makeStyles = (th: Theme) => StyleSheet.create({
  title: { fontFamily: th.font.bold, fontSize: 24, color: th.text, letterSpacing: -0.3 },
  micro: {
    fontFamily: th.font.semibold,
    fontSize: 11,
    color: th.textMuted,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
});
