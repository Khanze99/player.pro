// Приватность и согласия (152-ФЗ, ст. 10 — специальные категории персданных).
//
// Три принципа, заданные на бэкенде и отражённые здесь:
//   · по умолчанию всё закрыто — «нет записи» значит запрет;
//   · уровни вложены: открыть тренеру = открыть и врачу, но не наоборот;
//   · отзыв в один тап и в любой момент.
// Экран доступен всем ролям — согласие даёт и отзывает только сам человек.

import { useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useMyConsents, useSetConsent } from '@/api/hooks';
import type { ConsentAudience, ConsentScope } from '@/api/types';
import { CloseIcon } from '@/components/Icons';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { useToast } from '@/components/Toast';
import { MicroLabel, ScreenTitle } from '@/components/Typography';
import { spacing, type Theme, useStyles, useTheme } from '@/theme';

const SCOPES: readonly ConsentScope[] = ['cycle', 'nutrition', 'body_metrics'];
const AUDIENCES: readonly ConsentAudience[] = ['none', 'medic', 'coach'];

export default function Privacy() {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast((s) => s.show);
  const consents = useMyConsents();
  const setConsent = useSetConsent();

  const audienceFor = (scope: ConsentScope): ConsentAudience =>
    consents.data?.consents.find((c) => c.scope === scope)?.audience ?? 'none';

  const change = (scope: ConsentScope, audience: ConsentAudience) => {
    setConsent.mutate(
      { scope, audience },
      { onSuccess: () => toast(t(audience === 'none' ? 'privacy.revoked' : 'privacy.granted')) },
    );
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <ScreenTitle>{t('privacy.title')}</ScreenTitle>
            <Pressable
              onPress={() => router.back()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              style={styles.close}
            >
              <CloseIcon color={th.textMuted} />
            </Pressable>
          </View>

          <Text style={styles.intro}>{t('privacy.intro')}</Text>

          {SCOPES.map((scope) => (
            <View key={scope} style={styles.card}>
              <MicroLabel>{t(`privacy.scope.${scope}`)}</MicroLabel>
              <Text style={styles.scopeHint}>{t(`privacy.scopeHint.${scope}`)}</Text>
              <Segmented
                options={AUDIENCES}
                value={audienceFor(scope)}
                onSelect={(audience) => change(scope, audience)}
                labelFor={(a) => t(`privacy.audience.${a}`)}
              />
              <Text style={styles.audienceHint}>
                {t(`privacy.audienceHint.${audienceFor(scope)}`)}
              </Text>
            </View>
          ))}

          <Text style={styles.legal}>{t('privacy.legal')}</Text>
          {consents.data ? (
            <Text style={styles.version}>
              {t('privacy.policyVersion')}: {consents.data.policy_version}
            </Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.screen, gap: spacing.l, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  close: { padding: spacing.xs },
  intro: { fontFamily: th.font.regular, fontSize: 14, color: th.textMuted, lineHeight: 20 },
  card: {
    backgroundColor: th.surface,
    borderWidth: 1,
    borderColor: th.border,
    borderRadius: th.radius.card,
    padding: spacing.l,
    gap: spacing.m,
  },
  scopeHint: { fontFamily: th.font.regular, fontSize: 13, color: th.textMuted, marginTop: -spacing.s },
  audienceHint: { fontFamily: th.font.medium, fontSize: 12, color: th.brandOn },
  legal: { fontFamily: th.font.regular, fontSize: 12, color: th.textMuted, lineHeight: 18 },
  version: { fontFamily: th.font.regular, fontSize: 11, color: th.low },
});
