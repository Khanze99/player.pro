// Онбординг-вход (дизайн-ТЗ 6.1): телефон/почта → код. Без пароля.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ApiError, post } from '@/api/client';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { colors, font, spacing } from '@/theme';

export default function Welcome() {
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
      setError(e instanceof ApiError ? e.detail : t('common.offlineSaved'));
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
            <Text style={[styles.logo, { color: colors.brand }]}>PRO</Text>
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
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: spacing.screen, gap: spacing.l },
  brand: { flexDirection: 'row', justifyContent: 'center', marginBottom: spacing.s },
  logo: { fontFamily: font.display, fontSize: 30, color: colors.text, letterSpacing: 2 },
  subtitle: {
    fontFamily: font.regular,
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.l,
  },
  error: { fontFamily: font.medium, fontSize: 13, color: colors.risk, textAlign: 'center' },
});
