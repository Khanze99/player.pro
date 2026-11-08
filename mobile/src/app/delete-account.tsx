// Удаление аккаунта (Apple 5.1.1(v), Google Play Account deletion, 152-ФЗ ст. 21).
// Открывается из профиля и с экрана согласий («Не согласен, удалить аккаунт»), поэтому
// лежит в корне, а не в (tabs)/(auth): на экране согласий пользователь ещё в онбординге.
// Сам экран и есть подтверждение: что удалится, что останется, необратимость.
// Сервер: DELETE /api/v1/account (без гейта согласий), docs/plan-legal-texts.md.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ApiError, api } from '@/api/client';
import { session } from '@/auth/session';
import { CloseIcon } from '@/components/Icons';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { ScreenTitle } from '@/components/Typography';
import { spacing, type Theme, useStyles, useTheme } from '@/theme';

export default function DeleteAccount() {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast((s) => s.show);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const runDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await api<void>('/account', { method: 'DELETE' });
    } catch (e) {
      setDeleting(false);
      // 409: единственный админ организации с участниками, передать права можно
      // только через поддержку. Текст свой, не detail сервера: тот только на ru.
      setError(e instanceof ApiError && e.status === 409 ? t('deleteAccount.lastAdmin') : t('deleteAccount.error'));
      return;
    }
    // Refresh-токен на сервере уже удалён; signOut чистит secure-store (refresh, PIN),
    // активную команду и кэш запросов. AuthGate по смене статуса уведёт на welcome.
    session.getState().signOut();
    toast(t('deleteAccount.done'));
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <ScreenTitle style={styles.title}>{t('deleteAccount.title')}</ScreenTitle>
          <Pressable
            onPress={close}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={styles.close}
          >
            <CloseIcon color={th.textMuted} />
          </Pressable>
        </View>

        <Text style={styles.lead}>{t('deleteAccount.lead')}</Text>

        <View style={styles.block}>
          <Text style={styles.heading}>{t('deleteAccount.whatTitle')}</Text>
          <Text style={styles.body}>{t('deleteAccount.what')}</Text>
        </View>
        <View style={styles.block}>
          <Text style={styles.heading}>{t('deleteAccount.keptTitle')}</Text>
          <Text style={styles.body}>{t('deleteAccount.kept')}</Text>
        </View>
        <Text style={styles.body}>{t('deleteAccount.backups')}</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={() => void runDelete()}
          disabled={deleting}
          accessibilityRole="button"
          accessibilityState={{ disabled: deleting, busy: deleting }}
          style={({ pressed }) => [styles.danger, (pressed || deleting) && styles.dangerPressed]}
        >
          <Text style={styles.dangerText}>{deleting ? t('deleteAccount.deleting') : t('deleteAccount.confirm')}</Text>
        </Pressable>
        <Pressable onPress={close} accessibilityRole="button" style={styles.cancel} disabled={deleting}>
          <Text style={styles.cancelText}>{t('deleteAccount.cancel')}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const makeStyles = (th: Theme) =>
  StyleSheet.create({
    content: { padding: spacing.screen, gap: spacing.l, paddingBottom: 24 },
    header: { flexDirection: 'row', alignItems: 'center' },
    title: { flexShrink: 1 },
    close: { padding: spacing.xs, marginLeft: 'auto' },
    lead: {
      fontFamily: th.font.medium,
      fontSize: 15,
      color: th.text,
      lineHeight: 22,
    },
    block: { gap: spacing.xs },
    heading: { fontFamily: th.font.semibold, fontSize: 15, color: th.text },
    body: {
      fontFamily: th.font.regular,
      fontSize: 14,
      color: th.textMuted,
      lineHeight: 20,
    },
    error: {
      fontFamily: th.font.medium,
      fontSize: 14,
      color: th.risk,
      lineHeight: 20,
    },
    footer: { padding: spacing.screen, gap: spacing.s },
    danger: {
      minHeight: 56,
      borderRadius: th.radius.control,
      borderWidth: 1.5,
      borderColor: th.risk,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
    },
    dangerPressed: { opacity: 0.6 },
    dangerText: { fontFamily: th.font.semibold, fontSize: 17, color: th.risk },
    cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
    cancelText: {
      fontFamily: th.font.medium,
      fontSize: 15,
      color: th.textMuted,
    },
  });
