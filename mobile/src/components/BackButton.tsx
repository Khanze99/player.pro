// Кнопка «назад» для стека без нативного заголовка (онбординг).
// Без `fallbackTo` рендерится только если в стеке есть куда возвращаться.
// С `fallbackTo` — видна всегда: экран мог быть открыт через `replace`
// (например, восстановление сессии на середине онбординга), тогда в стеке
// реально возвращаться некуда, но у шага всё равно есть логический «назад».

import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { spacing, type Theme, useStyles, useTheme } from '@/theme';

interface Props {
  fallbackTo?: Href;
}

export function BackButton({ fallbackTo }: Props = {}) {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const canGoBack = router.canGoBack();

  if (!canGoBack && !fallbackTo) return null;

  const onPress = () => {
    if (canGoBack) router.back();
    else if (fallbackTo) router.replace(fallbackTo);
  };

  return (
    <Pressable
      // Отступ считаем от реальных safe-area insets, а не полагаемся на то, что
      // родительский SafeAreaView прокинет их в padding для абсолютного дочернего
      // элемента — на практике это давало кнопку под статус-баром/чёлкой и, из-за
      // перекрытия соседями без zIndex, нерабочий тап.
      style={({ pressed }) => [styles.button, { top: insets.top + spacing.s }, pressed && styles.pressed]}
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
    >
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Path
          d="m14.5 5-7 7 7 7"
          stroke={th.text}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Pressable>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  button: {
    position: 'absolute',
    left: spacing.screen,
    zIndex: 10,
    elevation: 10, // без этого Android не применяет zIndex к порядку хит-теста между сиблингами
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: th.surface2,
    borderWidth: 1.5,
    borderColor: th.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
});
