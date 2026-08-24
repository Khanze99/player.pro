// Ввод OTP-кода: 6 ячеек, автопроверка после последней цифры (раздел 5 ТЗ)

import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { post } from '@/api/client';
import { getDeviceId, saveRefreshToken, session, setNewUser } from '@/auth/session';
import { BackButton } from '@/components/BackButton';
import { Screen } from '@/components/Screen';
import { ScreenTitle } from '@/components/Typography';
import { colors, font, radius, spacing } from '@/theme';

interface TokenPair {
  access_token: string;
  refresh_token: string;
  is_new_user: boolean;
}

export default function Otp() {
  const { t } = useTranslation();
  const { identifier } = useLocalSearchParams<{ identifier: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const verify = async (fullCode: string) => {
    try {
      const tokens = await post<TokenPair>('/auth/otp/verify', {
        identifier,
        code: fullCode,
        device_id: await getDeviceId(),
      });
      await saveRefreshToken(tokens.refresh_token);
      await setNewUser(tokens.is_new_user === true);
      // Новый аккаунт — онбординг: имя → организация → PIN (дизайн-ТЗ 6.1).
      // Существующий — только PIN на этом устройстве, регистрацию не повторяем.
      session.setState({ accessToken: tokens.access_token, status: 'onboarding' });
    } catch {
      setError(true);
      setCode('');
      inputRef.current?.focus();
    }
  };

  const onChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    setError(false);
    if (digits.length === 6) void verify(digits);
  };

  return (
    <Screen>
      <BackButton />
      <View style={styles.content}>
        <ScreenTitle style={styles.center}>{t('auth.otpTitle')}</ScreenTitle>
        <Text style={styles.subtitle}>{t('auth.otpSubtitle', { identifier })}</Text>

        <Pressable style={styles.cells} onPress={() => inputRef.current?.focus()}>
          {Array.from({ length: 6 }, (_, i) => {
            const filled = i < code.length;
            const current = i === code.length;
            return (
              <View
                key={i}
                style={[
                  styles.cell,
                  filled && styles.cellFilled,
                  current && styles.cellCurrent,
                  error && styles.cellError,
                ]}
              >
                <Text style={styles.cellText}>{code[i] ?? ''}</Text>
              </View>
            );
          })}
        </Pressable>
        <TextInput
          ref={inputRef}
          style={styles.hiddenInput}
          value={code}
          onChangeText={onChange}
          keyboardType="number-pad"
          autoFocus
          maxLength={6}
          textContentType="oneTimeCode"
          accessibilityLabel={t('auth.otpTitle')}
        />
        <Text style={styles.error}>{error ? t('auth.otpInvalid') : ' '}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: 'center', padding: spacing.screen, gap: spacing.m },
  center: { textAlign: 'center' },
  subtitle: { fontFamily: font.regular, fontSize: 15, color: colors.textMuted, textAlign: 'center' },
  cells: { flexDirection: 'row', gap: spacing.s, justifyContent: 'center', marginTop: spacing.l },
  cell: {
    width: 48,
    height: 60,
    borderRadius: radius.control,
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellFilled: { borderColor: colors.brand },
  cellCurrent: { borderColor: colors.brand, backgroundColor: colors.surface },
  cellError: { borderColor: colors.risk },
  cellText: { fontFamily: font.display, fontSize: 24, color: colors.text },
  hiddenInput: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  error: { fontFamily: font.medium, fontSize: 13, color: colors.risk, textAlign: 'center' },
});
