// Тост — короткое подтверждение действия, 2 сек, снизу (дизайн-ТЗ 4.4)

import { useEffect } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { create } from 'zustand';

import { useAnimatedValue } from '../hooks/useAnimatedValue';

import { spacing, type Theme, useStyles } from '../theme';

interface ToastState {
  message: string | null;
  show: (message: string) => void;
  hide: () => void;
}

export const useToast = create<ToastState>((set) => ({
  message: null,
  show: (message) => set({ message }),
  hide: () => set({ message: null }),
}));

export function ToastHost() {
  const styles = useStyles(makeStyles);
  const { message, hide } = useToast();
  const opacity = useAnimatedValue(0);

  useEffect(() => {
    if (!message) return;
    Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => hide());
    }, 2000);
    return () => clearTimeout(timer);
  }, [message, opacity, hide]);

  if (!message) return null;
  return (
    <Animated.View style={[styles.toast, { opacity }]} pointerEvents="none">
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    backgroundColor: th.surface2,
    borderColor: th.border,
    borderWidth: 1,
    borderRadius: th.radius.control,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    maxWidth: '85%',
  },
  text: { color: th.text, fontFamily: th.font.medium, fontSize: 15, textAlign: 'center' },
});
