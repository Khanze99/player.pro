// Онбординг, шаг 2: пол. Обязательный экран — дальше не пройти, не выбрав вариант,
// но «Предпочитаю не указывать» (not_specified) — допустимый выбор: пол
// самодекларируется и никогда не навязывается (docs/plan-profile.md).
//
// Существующих пользователей этот шаг не касается — они задают пол в профиле.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { api } from '@/api/client';
import type { Me, Sex } from '@/api/types';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { ScreenTitle } from '@/components/Typography';
import { spacing, type Theme, useStyles } from '@/theme';

const OPTIONS: { value: Sex; key: 'sexFemale' | 'sexMale' | 'sexSkip' }[] = [
  { value: 'female', key: 'sexFemale' },
  { value: 'male', key: 'sexMale' },
  { value: 'not_specified', key: 'sexSkip' },
];

export default function SexSelect() {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();

  const [choice, setChoice] = useState<Sex | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (choice === null) return;
    setLoading(true);
    try {
      await api('/users/me/profile', { method: 'PUT', body: JSON.stringify({ sex: choice }) });
      const fresh = await api<Me>('/auth/me');
      router.push(fresh.org_id ? '/(auth)/pin-setup' : '/(auth)/org-choice');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <BackButton fallbackTo="/(auth)/profile-setup" />
      <View style={styles.content}>
        <ScreenTitle>{t('onboarding.sexTitle')}</ScreenTitle>
        <Text style={styles.hint}>{t('onboarding.sexSubtitle')}</Text>
        <View style={styles.options}>
          {OPTIONS.map(({ value, key }) => {
            const active = choice === value;
            return (
              <Pressable
                key={value}
                onPress={() => setChoice(value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={[styles.option, active && styles.optionActive]}
              >
                <Text style={[styles.optionText, active && styles.optionTextActive]}>
                  {t(`onboarding.${key}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={styles.footer}>
        <Button
          title={t('onboarding.continue')}
          onPress={() => void submit()}
          disabled={choice === null}
          loading={loading}
        />
      </View>
    </Screen>
  );
}

const makeStyles = (th: Theme) =>
  StyleSheet.create({
    content: { flex: 1, padding: spacing.screen, gap: spacing.l, justifyContent: 'center' },
    hint: { fontFamily: th.font.regular, fontSize: 15, color: th.textMuted, lineHeight: 21 },
    options: { gap: spacing.s, marginTop: spacing.s },
    option: {
      minHeight: 56,
      borderRadius: th.radius.control,
      backgroundColor: th.surface2,
      borderWidth: 1,
      borderColor: th.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionActive: { backgroundColor: th.brand, borderColor: th.brandOn },
    optionText: { fontFamily: th.font.medium, fontSize: 16, color: th.text },
    optionTextActive: { color: th.onBrand },
    footer: { padding: spacing.screen },
  });
