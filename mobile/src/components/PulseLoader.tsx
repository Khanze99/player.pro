// Брендовый лоадер (docs/plan-pulse-loader.md): та же линия зигзага, что в
// логотипе (assets/images/icon.png), статичный приглушённый трек + яркий
// сегмент, бегущий по нему в цикле — анимация кардиомонитора вместо
// нейтрального OS-спиннера. Используется на кнопке входа (Button.tsx),
// паузе после сплэша (_layout.tsx) и в PullToRefresh.
//
// Путь — чистые отрезки (M/L), длина посчитана вручную по координатам: у
// react-native-svg нормализация strokeDasharray/Offset через pathLength есть
// только в веб-рендерере (src/web/utils), на native её нет — ниже всё в
// реальных юнитах viewBox.

import { useEffect } from 'react';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '../theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

const VIEW_W = 120;
const VIEW_H = 40;
const D = 'M0 20 H26 L34 4 L44 36 L52 14 L60 20 H120';
// Сумма длин отрезков пути выше (√dx²+dy² на каждом L/H) — см. docstring плана
const PATH_LENGTH = 170.824;
const DASH = 28;
const SWEEP_DURATION_MS = 1400;

interface Props {
  size?: number;
  /** Цвет бегущего сегмента. На кнопке — th.onBrand, по умолчанию — th.brand. */
  color?: string;
}

export function PulseLoader({ size = 32, color }: Props) {
  const th = useTheme();
  const sweepColor = color ?? th.brand;
  const offset = useSharedValue(PATH_LENGTH);

  useEffect(() => {
    offset.value = withRepeat(
      withTiming(-DASH, { duration: SWEEP_DURATION_MS, easing: Easing.linear }),
      -1,
      false,
    );
  }, [offset]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: offset.value,
  }));

  return (
    <Svg width={size} height={(size * VIEW_H) / VIEW_W} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
      <Path
        d={D}
        fill="none"
        stroke={sweepColor}
        strokeOpacity={0.18}
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <AnimatedPath
        d={D}
        fill="none"
        stroke={sweepColor}
        strokeWidth={3.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={`${DASH} ${PATH_LENGTH}`}
        animatedProps={animatedProps}
      />
    </Svg>
  );
}
