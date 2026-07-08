// Профиль (дизайн-ТЗ 5.6): имя, команда, язык RU/EN/ES, смена PIN, выход.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { post } from '@/api/client';
import { useMe, useMyTeams, useUpdateMe } from '@/api/hooks';
import { getRefreshToken, session } from '@/auth/session';
import { Chip } from '@/components/Chip';
import { Field } from '@/components/Field';
import { ChevronIcon } from '@/components/Icons';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { MicroLabel, ScreenTitle } from '@/components/Typography';
import type { AppLocale } from '@/i18n';
import { colors, font, radius, spacing } from '@/theme';

const LOCALES: { code: AppLocale; label: string }[] = [
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
];

export default function Profile() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const toast = useToast((s) => s.show);
  const me = useMe();
  const teams = useMyTeams();
  const updateMe = useUpdateMe();
  const [name, setName] = useState('');
  const [serverName, setServerName] = useState<string | null>(null);

  // Синхронизация с сервером — во время рендера (паттерн «adjusting state on prop change»)
  if (me.data && me.data.name !== serverName) {
    setServerName(me.data.name);
    setName(me.data.name);
  }

  const teamName = teams.data?.[0]?.name;

  const saveName = () => {
    const trimmed = name.trim();
    if (!me.data || trimmed === me.data.name) return;
    updateMe.mutate({ name: trimmed }, { onSuccess: () => toast(t('common.saved')) });
  };

  const changeLocale = (code: AppLocale) => {
    void i18n.changeLanguage(code);
    updateMe.mutate({ locale: code });
  };

  const logout = async () => {
    const refresh = await getRefreshToken();
    if (refresh) {
      try {
        await post('/auth/logout', { refresh_token: refresh });
      } catch {
        // офлайн — токен всё равно стирается локально
      }
    }
    session.getState().signOut();
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <ScreenTitle>{t('profile.title')}</ScreenTitle>
          <Chip
            label={teamName ?? t('home.personalMode')}
            dotColor={teamName ? colors.brand : colors.low}
          />
        </View>

        <Field label={t('profile.name')} value={name} onChangeText={setName} onBlur={saveName} />

        <View style={styles.section}>
          <MicroLabel>{t('profile.language')}</MicroLabel>
          <View style={styles.localeRow}>
            {LOCALES.map(({ code, label }) => {
              const active = i18n.language === code;
              return (
                <Pressable
                  key={code}
                  onPress={() => changeLocale(code)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[styles.localeChip, active && styles.localeChipActive]}
                >
                  <Text style={[styles.localeText, active && styles.localeTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.rows}>
          <Pressable
            style={styles.row}
            accessibilityRole="button"
            onPress={() => router.push('/(auth)/pin-setup')}
          >
            <Text style={styles.rowText}>{t('profile.changePin')}</Text>
            <ChevronIcon color={colors.textMuted} />
          </Pressable>
          <Pressable
            style={[styles.row, { borderBottomWidth: 0 }]}
            accessibilityRole="button"
            onPress={() => void logout()}
          >
            <Text style={[styles.rowText, { color: colors.risk }]}>{t('profile.logout')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.screen, paddingBottom: 40, gap: spacing.xl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  section: { gap: spacing.s },
  localeRow: { flexDirection: 'row', gap: spacing.s },
  localeChip: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.control,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  localeChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  localeText: { fontFamily: font.medium, fontSize: 15, color: colors.textMuted },
  localeTextActive: { color: '#FFFFFF' },
  rows: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowText: { fontFamily: font.medium, fontSize: 16, color: colors.text },
});
