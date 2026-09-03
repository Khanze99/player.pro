// Онбординг-вход (дизайн-ТЗ 6.1): телефон/почта → код. Без пароля.

import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ApiError, post } from '@/api/client';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { spacing, type Theme, useStyles, useTheme } from '@/theme';

export default function Welcome() {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    setLoading(true);
    setError(null);
    try {
      await post('/auth/otp/request', { identifier: identifier.trim() });
      router.push({ pathname: '/(auth)/otp', params: { identifier: identifier.trim() } });
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : t('common.noConnection'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <View style={styles.brand}>
            <Text style={styles.logo}>PLAYER</Text>
            <Text style={[styles.logo, { color: th.brandOn }]}>PRO</Text>
          </View>
          <Text style={styles.subtitle}>{t('auth.welcomeSubtitle')}</Text>
          <Field
            value={identifier}
            onChangeText={setIdentifier}
            placeholder={t('auth.identifierPlaceholder')}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            title={t('auth.sendCode')}
            onPress={() => void sendCode()}
            disabled={identifier.trim().length < 3}
            loading={loading}
          />
        </View>
        <Text style={styles.version}>v{Constants.expoConfig?.version ?? '—'}</Text>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: spacing.screen, gap: spacing.l },
  brand: { flexDirection: 'row', justifyContent: 'center', marginBottom: spacing.s },
  logo: { fontFamily: th.font.display, fontSize: 30, color: th.text, letterSpacing: 2 },
  subtitle: {
    fontFamily: th.font.regular,
    fontSize: 15,
    color: th.textMuted,
    textAlign: 'center',
    marginBottom: spacing.l,
  },
  error: { fontFamily: th.font.medium, fontSize: 13, color: th.risk, textAlign: 'center' },
  // Версию показываем на входе: тестировщику надо назвать её, не роясь в настройках.
  version: {
    fontFamily: th.font.regular,
    fontSize: 12,
    color: th.textMuted,
    textAlign: 'center',
    paddingBottom: spacing.l,
  },
});
