// Онбординг, шаг 1: ФИО (отчество необязательно). Дальше — организация или PIN (дизайн-ТЗ 6.1).
// Амплуа здесь не спрашиваем: роль ещё неизвестна, а position — поле профиля атлета.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { api, patch } from '@/api/client';
import type { Me } from '@/api/types';
import { useMe } from '@/api/hooks';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { ScreenTitle } from '@/components/Typography';
import { spacing, type Theme, useStyles } from '@/theme';

export default function ProfileSetup() {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();
  const me = useMe();

  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [loading, setLoading] = useState(false);
  const [seeded, setSeeded] = useState(false);

  // Приглашённому админ мог уже задать ФИО — подставляем
  if (me.data && !seeded) {
    setSeeded(true);
    if (me.data.last_name) setLastName(me.data.last_name);
    if (me.data.first_name) setFirstName(me.data.first_name);
    if (me.data.middle_name) setMiddleName(me.data.middle_name);
  }

  const submit = async () => {
    setLoading(true);
    try {
      await patch('/users/me', {
        last_name: lastName.trim(),
        first_name: firstName.trim(),
        middle_name: middleName.trim(),
      });
      const fresh = await api<Me>('/auth/me');
      // В организации (по приглашению) — команда настроена, сразу к PIN
      router.push(fresh.org_id ? '/(auth)/pin-setup' : '/(auth)/org-choice');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <BackButton fallbackTo="/(auth)/consent" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <ScreenTitle>{t('onboarding.profileTitle')}</ScreenTitle>
          <Field
            label={t('onboarding.lastNameLabel')}
            value={lastName}
            onChangeText={setLastName}
            autoFocus
            autoComplete="name-family"
          />
          <Field
            label={t('onboarding.firstNameLabel')}
            value={firstName}
            onChangeText={setFirstName}
            autoComplete="name-given"
          />
          <Field
            label={t('onboarding.middleNameLabel')}
            value={middleName}
            onChangeText={setMiddleName}
            autoComplete="name-middle"
          />
        </View>
        <View style={styles.footer}>
          <Button
            title={t('onboarding.continue')}
            onPress={() => void submit()}
            disabled={lastName.trim().length < 2 || firstName.trim().length < 2}
            loading={loading}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  flex: { flex: 1 },
  content: { flex: 1, padding: spacing.screen, gap: spacing.l, justifyContent: 'center' },
  footer: { padding: spacing.screen },
});
