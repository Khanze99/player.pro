// Свой pull-to-refresh (docs/plan-pulse-loader.md, этап 2): нативный
// RefreshControl на iOS/Android красит только цвет OS-спиннера, форму
// поменять нельзя — здесь вместо него раскрывается PulseLoader.
//
// Жест — react-native-gesture-handler (Pan), активен только когда список
// проскроллен к самому верху (scrollY отслеживается тем же onScroll);
// позиционирование — react-native-reanimated. Обе библиотеки уже в
// зависимостях проекта, новых пакетов не добавлено. Только ios/android —
// на web (PWA) этот компонент не используется, экраны там оставляют
// нативный RefreshControl (план, решение «веб — без жеста»).
//
// Скролл — ScrollView из react-native-gesture-handler (не из react-native):
// обычный RN ScrollView и наш Pan-жест — разные системы распознавания
// жестов, и без .simultaneousWithExternalGesture Pan либо не получает тачи
// вообще (ScrollView их забирает первым), либо конфликтует с обычным
// скроллом. GH-шный ScrollView интегрирован с тем же gesture-handler'ом,
// что и наш Pan, поэтому simultaneousWithExternalGesture на него реально
// работает.

import { useCallback, useEffect, useRef, type ComponentRef, type ReactNode } from 'react';
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  ScrollView as GHScrollView,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { PulseLoader } from './PulseLoader';
import { useTheme } from '../theme';

const PULL_THRESHOLD = 70;
const REVEAL_HEIGHT = 64;

const AnimatedGHScrollView = Animated.createAnimatedComponent(GHScrollView);

interface Props {
  refreshing: boolean;
  onRefresh: () => void;
  contentContainerStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}

export function PullToRefresh({ refreshing, onRefresh, contentContainerStyle, children }: Props) {
  const th = useTheme();
  // Обычный React-ref (не useAnimatedRef) — simultaneousWithExternalGesture
  // ждёт именно RefObject<ComponentType>, типы useAnimatedRef с ним не совпадают.
  // Ref нужен только для привязки к жесту (simultaneity), scrollTo/measure через
  // него не дёргаем — scrollY идёт отдельным shared value из onScroll.
  const scrollRef = useRef<ComponentRef<typeof AnimatedGHScrollView>>(null);
  const scrollY = useSharedValue(0);
  const pull = useSharedValue(0);

  const triggerRefresh = useCallback(() => {
    onRefresh();
  }, [onRefresh]);

  // refreshing — обычный JS-проп (снаружи решает родитель, когда запрос
  // завершился, не наш жест). Заводим под него отдельный shared value,
  // мутируемый ровно в одном месте (этот эффект) — так react-hooks/
  // immutability не спотыкается об него.
  const refreshingSV = useSharedValue(refreshing);
  useEffect(() => {
    refreshingSV.value = refreshing;
  }, [refreshing, refreshingSV]);

  useAnimatedReaction(
    () => refreshingSV.value,
    (isRefreshing, wasRefreshing) => {
      if (!isRefreshing && wasRefreshing) {
        pull.value = withTiming(0);
      }
    },
  );

  const scrollHandler = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const pan = Gesture.Pan()
    // Штатный паттерн Gesture-билдера RNGH — конфиг собирается прямо в теле
    // рендера, ref не разыменовывается синхронно тут же, а передаётся внутрь
    // для привязки гестуры (резолвится самим RNGH при подключении). Эслинт
    // (экспериментальное react-compiler-правило react-hooks/refs) этого не
    // знает и видит просто «ref передали в функцию во время рендера».
    // eslint-disable-next-line react-hooks/refs
    .simultaneousWithExternalGesture(scrollRef)
    .activeOffsetY(12)
    .failOffsetX([-16, 16])
    // pull мутируется из нескольких мест (здесь и в onEnd ниже, и в реакции
    // выше) — react-hooks/immutability (экспериментальное правило
    // react-compiler-эслинта) местами требует «один shared value — одно
    // место мутации» и не понимает модель reanimated .value; это намеренное
    // расхождение с правилом, не баг.
    .onUpdate((e) => {
      if (scrollY.value <= 0 && e.translationY > 0) {
        // eslint-disable-next-line react-hooks/immutability
        pull.value = Math.min(e.translationY * 0.55, REVEAL_HEIGHT * 1.4);
      }
    })
    .onEnd(() => {
      if (pull.value > PULL_THRESHOLD) {
        runOnJS(triggerRefresh)();
        // eslint-disable-next-line react-hooks/immutability
        pull.value = withTiming(REVEAL_HEIGHT);
      } else {
        pull.value = withTiming(0);
      }
    });

  const revealStyle = useAnimatedStyle(() => {
    const height = refreshing ? REVEAL_HEIGHT : pull.value;
    return { height, opacity: Math.min(height / REVEAL_HEIGHT, 1) };
  });

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.flex}>
        <Animated.View style={[styles.reveal, revealStyle]}>
          <PulseLoader size={40} color={th.brand} />
        </Animated.View>
        <AnimatedGHScrollView
          ref={scrollRef}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          contentContainerStyle={contentContainerStyle}
        >
          {children}
        </AnimatedGHScrollView>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  reveal: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});

/**
 * Единая точка интеграции на экранах (index.tsx/dashboard.tsx/CoachHome.tsx):
 * на ios/android — жестовый PullToRefresh выше, на web (PWA, часто без
 * тачскрина) — как было раньше, обычный ScrollView + нативный RefreshControl
 * (план, решение «веб — без жеста»).
 */
export function RefreshableScroll(props: Props) {
  const th = useTheme();
  if (Platform.OS === 'web') {
    return (
      <ScrollView
        contentContainerStyle={props.contentContainerStyle}
        refreshControl={
          <RefreshControl refreshing={props.refreshing} onRefresh={props.onRefresh} tintColor={th.textMuted} />
        }
      >
        {props.children}
      </ScrollView>
    );
  }
  return <PullToRefresh {...props} />;
}
