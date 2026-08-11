// Кнопка «назад» для стека без нативного заголовка (онбординг).
// Рендерится только если в стеке есть куда возвращаться.

import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Path } from 'react-native-svg';

import { colors, spacing } from '@/theme';

export function BackButton() {
  const { t } = useTranslation();
  const router = useRouter();

  if (!router.canGoBack()) return null;

  return (
    <Pressable
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      onPress={() => router.back()}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
    >
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Path
          d="m14.5 5-7 7 7 7"
          stroke={colors.text}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    top: spacing.s,
    left: spacing.screen,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
});
