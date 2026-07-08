// Создание организации и первой команды (для тренера/менеджера) — ТЗ 3.4

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ApiError, post } from '@/api/client';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { ScreenTitle } from '@/components/Typography';
import { colors, font, spacing } from '@/theme';

export default function OrgCreate() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [orgName, setOrgName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await post('/organizations', { name: orgName.trim(), locale: i18n.language });
      await post('/teams', { name: teamName.trim() });
      router.push('/(auth)/pin-setup');
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : t('common.retry'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <ScreenTitle>{t('onboarding.createOrg')}</ScreenTitle>
          <Field
            label={t('onboarding.orgNameLabel')}
            value={orgName}
            onChangeText={setOrgName}
            placeholder={t('onboarding.orgNamePlaceholder')}
            autoFocus
          />
          <Field
            label={t('onboarding.teamNameLabel')}
            value={teamName}
            onChangeText={setTeamName}
            placeholder={t('onboarding.teamNamePlaceholder')}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
        <View style={styles.footer}>
          <Button
            title={t('onboarding.continue')}
            onPress={() => void submit()}
            disabled={orgName.trim().length < 2 || teamName.trim().length < 2}
            loading={loading}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flex: 1, padding: spacing.screen, gap: spacing.l, justifyContent: 'center' },
  error: { fontFamily: font.medium, fontSize: 13, color: colors.risk },
  footer: { padding: spacing.screen },
});
