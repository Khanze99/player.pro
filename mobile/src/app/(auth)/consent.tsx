// Онбординг: гейт согласий (152-ФЗ, ст. 9 + ст. 10 — данные о здоровье отдельно).
// Встаёт сразу после OTP, до имени: соглашаться нужно раньше, чем что-либо вводить.
// Показывается всем ролям без исключения — роль на этом шаге ещё не выбрана
// (org-choice идёт позже). docs/plan-onboarding-consent.md.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { usePolicyConsents, useSetPolicyConsent } from '@/api/hooks';
import { session } from '@/auth/session';
import { Button } from '@/components/Button';
import { CheckIcon } from '@/components/Icons';
import { Screen } from '@/components/Screen';
import { ScreenTitle } from '@/components/Typography';
import { spacing, type Theme, useStyles, useTheme } from '@/theme';

export default function Consent() {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();
  // next=active — сюда попал уже онбордившийся пользователь по PIN-входу
  // (mobile/src/app/(auth)/pin.tsx), которому обновление добавило обязательное
  // согласие: профиль и PIN у него уже есть, после согласия — сразу в приложение,
  // а не по шагам первичного онбординга.
  const { next } = useLocalSearchParams<{ next?: string }>();
  const status = usePolicyConsents();
  const setConsent = useSetPolicyConsent();

  const [terms, setTerms] = useState(false);
  const [health, setHealth] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [seeded, setSeeded] = useState(false);

  // Уже частично согласился раньше (например, вернулся на этот шаг) — подставляем
  if (status.data && !seeded) {
    setSeeded(true);
    if (status.data.terms.granted) setTerms(true);
    if (status.data.health_data.granted) setHealth(true);
  }

  const continueOnboarding = async () => {
    setSubmitting(true);
    try {
      await Promise.all([
        setConsent.mutateAsync({ kind: 'terms', granted: true }),
        setConsent.mutateAsync({ kind: 'health_data', granted: true }),
      ]);
      if (next === 'active') {
        session.getState().setStatus('active');
      } else {
        // push, не replace: profile-setup показывает кнопку «назад» — она ведёт
        // сюда же, к пересмотру согласий (без стека canGoBack() всегда false)
        router.push('/(auth)/profile-setup');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <View style={styles.content}>
        <ScreenTitle>{t('consent.title')}</ScreenTitle>
        <Text style={styles.intro}>{t('consent.intro')}</Text>

        <View style={styles.list}>
          <ConsentRow checked={terms} onToggle={() => setTerms((v) => !v)}>
            <Text style={styles.rowText}>
              {t('consent.termsPrefix')}
              <Text style={styles.link} onPress={() => router.push('/terms')}>
                {t('consent.termsLink')}
              </Text>
              {t('consent.termsMiddle')}
              <Text style={styles.link} onPress={() => router.push('/privacy-policy')}>
                {t('consent.privacyLink')}
              </Text>
              {t('consent.termsSuffix')}
            </Text>
          </ConsentRow>

          <ConsentRow checked={health} onToggle={() => setHealth((v) => !v)}>
            <Text style={styles.rowText}>{t('consent.health')}</Text>
          </ConsentRow>
        </View>
      </View>
      <View style={styles.footer}>
        <Button
          title={t('consent.continue')}
          onPress={() => void continueOnboarding()}
          disabled={!terms || !health}
          loading={submitting}
        />
      </View>
    </Screen>
  );
}

function ConsentRow({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <Pressable style={styles.row} onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked }}>
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked ? <CheckIcon color={th.onBrand} size={14} /> : null}
      </View>
      <View style={styles.rowBody}>{children}</View>
    </Pressable>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  content: { flex: 1, padding: spacing.screen, gap: spacing.l, justifyContent: 'center' },
  intro: { fontFamily: th.font.regular, fontSize: 14, color: th.textMuted, lineHeight: 20, marginTop: -spacing.s },
  list: { gap: spacing.m, marginTop: spacing.s },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.m },
  rowBody: { flex: 1 },
  rowText: { fontFamily: th.font.regular, fontSize: 14, color: th.text, lineHeight: 20 },
  link: { fontFamily: th.font.medium, color: th.brandOn, textDecorationLine: 'underline' },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: th.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  boxChecked: { backgroundColor: th.brand, borderColor: th.brand },
  footer: { padding: spacing.screen },
});
