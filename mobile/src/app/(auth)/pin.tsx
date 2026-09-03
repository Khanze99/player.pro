// Вход по PIN (дизайн-ТЗ 5.1): локальная проверка → обмен refresh на access.
// После N неудач или мёртвого refresh-токена — откат на OTP (ТЗ 5.3).

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { api, refreshAccessToken } from '@/api/client';
import type { Me } from '@/api/types';
import { session, verifyPin } from '@/auth/session';
import { PinPad } from '@/components/PinPad';
import { Screen } from '@/components/Screen';
import { spacing, type Theme, useStyles } from '@/theme';

export default function Pin() {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);

  const onComplete = async (pin: string) => {
    const attemptsLeft = await verifyPin(pin);
    if (attemptsLeft === null) {
      const access = await refreshAccessToken();
      if (!access) {
        session.getState().signOut(); // refresh отозван/истёк → OTP
        return;
      }
      // PIN уже стоял на устройстве — это возвращающийся пользователь, не онбординг.
      // Но обязательные согласия (docs/plan-onboarding-consent.md) могли появиться
      // после того, как он в последний раз входил на этом устройстве: сервер и так
      // отклонит любой запрос без них (require_consented), но без этой проверки
      // клиент молча покажет пустые экраны вместо экрана согласия.
      try {
        const me = await api<Me>('/auth/me');
        if (!me.terms_accepted || !me.health_consent_accepted) {
          router.replace({ pathname: '/(auth)/consent', params: { next: 'active' } });
          return;
        }
      } catch {
        // сеть недоступна — не блокируем вход; сервер всё равно защищён require_consented
      }
      session.getState().setStatus('active');
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

const makeStyles = (th: Theme) => StyleSheet.create({
  fallback: { alignItems: 'center', padding: spacing.xl },
  fallbackText: { fontFamily: th.font.medium, fontSize: 15, color: th.brandOn },
});
