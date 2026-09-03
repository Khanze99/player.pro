// Карточка-действие v2: первичная — брендовый градиент со свечением,
// вторичная — поверхность; выполненная сворачивается в строку с галочкой.

import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CheckIcon, ChevronIcon } from './Icons';
import { spacing, type Theme, useStyles, useTheme } from '../theme';

interface Props {
  title: string;
  hint?: string;
  icon: ReactNode;
  primary?: boolean;
  done?: boolean;
  doneLabel?: string;
  /** Действие ещё недоступно (например, тренировка не закончилась) — карточка приглушена */
  disabled?: boolean;
  onPress: () => void;
}

export function ActionCard({
  title,
  hint,
  icon,
  primary,
  done,
  doneLabel,
  disabled,
  onPress,
}: Props) {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  if (done) {
    return (
      <View style={[styles.card, styles.doneCard]}>
        <View style={styles.doneIcon}>
          <CheckIcon color={th.good} size={16} />
        </View>
        <Text style={styles.doneText}>{doneLabel ?? title}</Text>
      </View>
    );
  }

  const inner = (
    <>
      <View style={[styles.iconBox, primary ? styles.iconBoxPrimary : null]}>{icon}</View>
      <View style={styles.body}>
        <Text style={[styles.title, primary && { color: th.onBrand }]}>{title}</Text>
        {hint ? <Text style={[styles.hint, primary && { color: th.onBrand, opacity: 0.75 }]}>{hint}</Text> : null}
      </View>
      {disabled ? null : <ChevronIcon color={primary ? th.onBrand : th.textMuted} />}
    </>
  );

  if (disabled) {
    return (
      <View
        style={[styles.card, styles.secondary, styles.disabled]}
        accessibilityState={{ disabled: true }}
      >
        {inner}
      </View>
    );
  }

  if (primary) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [styles.primaryWrap, pressed && { transform: [{ scale: 0.985 }] }]}
      >
        <LinearGradient
          colors={th.gradients.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.card, { borderWidth: 0 }]}
        >
          {inner}
        </LinearGradient>
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, styles.secondary, pressed && { opacity: 0.85 }]}
    >
      {inner}
    </Pressable>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  primaryWrap: {
    borderRadius: th.radius.card,
    shadowColor: th.brand,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: th.radius.card,
    padding: spacing.l,
    minHeight: 80,
    gap: spacing.l,
  },
  secondary: { backgroundColor: th.surface, borderWidth: 1, borderColor: th.border },
  disabled: { opacity: 0.5 },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: th.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxPrimary: { backgroundColor: 'rgba(255,255,255,0.18)' },
  body: { flex: 1 },
  title: { fontFamily: th.font.semibold, fontSize: 17, color: th.text },
  hint: { fontFamily: th.font.regular, fontSize: 13, color: th.textMuted, marginTop: 2 },
  doneCard: {
    backgroundColor: th.surface,
    borderWidth: 1,
    borderColor: th.border,
    minHeight: 54,
    paddingVertical: spacing.m,
  },
  doneIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(47,210,122,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { color: th.textMuted, fontFamily: th.font.medium, fontSize: 15 },
});
