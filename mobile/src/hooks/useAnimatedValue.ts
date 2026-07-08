import { useState } from 'react';
import { Animated } from 'react-native';

/**
 * Кроссплатформенная замена useAnimatedValue из react-native:
 * в react-native-web его нет. Инициализатор useState создаёт значение один раз
 * и не трогает refs в рендере (react-hooks/refs).
 */
export function useAnimatedValue(initial: number): Animated.Value {
  const [value] = useState(() => new Animated.Value(initial));
  return value;
}
