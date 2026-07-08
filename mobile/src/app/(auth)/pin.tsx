// Вход по PIN (дизайн-ТЗ 5.1): локальная проверка → обмен refresh на access.
// После N неудач или мёртвого refresh-токена — откат на OTP (ТЗ 5.3).

import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { refreshAccessToken } from '@/api/client';
import { session, verifyPin } from '@/auth/session';
import { PinPad } from '@/components/PinPad';
import { Screen } from '@/components/Screen';
import { colors, font, spacing } from '@/theme';

export default function Pin() {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);

  const onComplete = async (pin: string) => {
    const attemptsLeft = await verifyPin(pin);
    if (attemptsLeft === null) {
      const access = await refreshAccessToken();
      if (access) session.getState().setStatus('active');
      else session.getState().signOut(); // refresh отозван/истёк → OTP
      return;
    }
    if (attemptsLeft === 0) {
      session.getState().signOut(); // локальная блокировка PIN → откат на OTP
      return;
    }
    setError(t('auth.pinError', { count: attemptsLeft }));
    setShakeKey((k) => k + 1);
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <PinPad
        title={t('auth.pinTitle')}
        error={error}
        shakeKey={shakeKey}
        onComplete={(pin) => void onComplete(pin)}
      />
      <Pressable onPress={() => session.getState().signOut()} style={styles.fallback}>
        <Text style={styles.fallbackText}>{t('auth.pinFallback')}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', padding: spacing.xl },
  fallbackText: { fontFamily: font.medium, fontSize: 15, color: colors.brand },
});
