// Онбординг, шаг 2 (без приглашения): личный режим или своя организация (ТЗ 2.3)

import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ActionCard } from '@/components/ActionCard';
import { BackButton } from '@/components/BackButton';
import { BoltIcon, UserIcon } from '@/components/Icons';
import { Screen } from '@/components/Screen';
import { ScreenTitle } from '@/components/Typography';
import { colors, font, spacing } from '@/theme';

export default function OrgChoice() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Screen>
      <BackButton />
      <View style={styles.content}>
        <ScreenTitle>{t('onboarding.orgTitle')}</ScreenTitle>
        <Text style={styles.hint}>{t('onboarding.orgSubtitle')}</Text>
        <View style={styles.cards}>
          <ActionCard
            icon={<UserIcon color="#FFFFFF" />}
            title={t('onboarding.personalMode')}
            hint={t('onboarding.personalModeHint')}
            primary
            onPress={() => router.push('/(auth)/pin-setup')}
          />
          <ActionCard
            icon={<BoltIcon color={colors.brand} />}
            title={t('onboarding.createOrg')}
            hint={t('onboarding.createOrgHint')}
            onPress={() => router.push('/(auth)/org-create')}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, padding: spacing.screen, justifyContent: 'center', gap: spacing.l },
  hint: {
    fontFamily: font.regular,
    fontSize: 15,
    color: colors.textMuted,
    marginTop: -spacing.s,
  },
  cards: { gap: spacing.m, marginTop: spacing.l },
});
