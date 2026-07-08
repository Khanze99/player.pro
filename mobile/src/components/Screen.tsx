// Обёртка экрана: градиентный фон + радиальное брендовое свечение сверху —
// единый sport-tech задник для всех экранов.

import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView, type Edges } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { colors, gradients } from '@/theme';

interface Props {
  children: ReactNode;
  edges?: Edges;
  glowColor?: string;
}

export function Screen({ children, edges = ['top'], glowColor = colors.brand }: Props) {
  return (
    <View style={styles.root}>
      <LinearGradient colors={gradients.screen} style={StyleSheet.absoluteFill} />
      <Svg style={styles.glow} width="100%" height={320} pointerEvents="none">
        <Defs>
          <RadialGradient id="halo" cx="50%" cy="0%" rx="65%" ry="100%">
            <Stop offset="0%" stopColor={glowColor} stopOpacity={0.16} />
            <Stop offset="70%" stopColor={glowColor} stopOpacity={0.04} />
            <Stop offset="100%" stopColor={glowColor} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx="50%" cy="0" rx="60%" ry="320" fill="url(#halo)" />
      </Svg>
      <SafeAreaView style={styles.safe} edges={edges}>
        {children}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  glow: { position: 'absolute', top: 0, left: 0, right: 0 },
  safe: { flex: 1 },
});
