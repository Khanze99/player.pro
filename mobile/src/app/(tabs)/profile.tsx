// Профиль (дизайн-ТЗ 5.6): ФИО, команда, язык RU/EN/ES, смена PIN, выход.
// Здесь же приглашение в клуб — админское действие над организацией, ему не место
// на «доме» тренера рядом с ежедневным состоянием состава.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { post } from '@/api/client';
import { useFeatures, useMe, useMyProfile, useUpdateMe } from '@/api/hooks';
import { getRefreshToken, session } from '@/auth/session';
import { TeamBadge } from '@/components/TeamBadge';
import { Field } from '@/components/Field';
import { ChevronIcon } from '@/components/Icons';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { MicroLabel, ScreenTitle } from '@/components/Typography';
import type { AppLocale } from '@/i18n';
import { spacing, type Theme, useStyles, useTheme } from '@/theme';

const LOCALES: { code: AppLocale; label: string }[] = [
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
];

export default function Profile() {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const toast = useToast((s) => s.show);
  const me = useMe();
  const profile = useMyProfile();
  const features = useFeatures();
  const updateMe = useUpdateMe();
  const [fio, setFio] = useState({ last_name: '', first_name: '', middle_name: '' });
  const [serverFio, setServerFio] = useState<string | null>(null);

  // Синхронизация с сервером — во время рендера (паттерн «adjusting state on prop change»)
  const meFio = me.data && {
    last_name: me.data.last_name,
    first_name: me.data.first_name,
    middle_name: me.data.middle_name,
  };
  if (meFio && JSON.stringify(meFio) !== serverFio) {
    setServerFio(JSON.stringify(meFio));
    setFio(meFio);
  }

  const isAdmin = me.data?.global_role === 'admin';

  // Фамилию и имя не даём стереть: сервер соберёт из них name для ростера
  const savePart = (field: keyof typeof fio) => () => {
    const server = me.data;
    const value = fio[field].trim();
    if (!server || value === server[field]) return;
    if (value === '' && field !== 'middle_name') {
      setFio((prev) => ({ ...prev, [field]: server[field] }));
      return;
    }
    updateMe.mutate({ [field]: value }, { onSuccess: () => toast(t('common.saved')) });
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
          <TeamBadge showPersonal />
        </View>

        <View style={styles.fio}>
          <Field
            label={t('profile.lastName')}
            value={fio.last_name}
            onChangeText={(v) => setFio((prev) => ({ ...prev, last_name: v }))}
            onBlur={savePart('last_name')}
            autoComplete="name-family"
          />
          <Field
            label={t('profile.firstName')}
            value={fio.first_name}
            onChangeText={(v) => setFio((prev) => ({ ...prev, first_name: v }))}
            onBlur={savePart('first_name')}
            autoComplete="name-given"
          />
          <Field
            label={t('profile.middleName')}
            value={fio.middle_name}
            onChangeText={(v) => setFio((prev) => ({ ...prev, middle_name: v }))}
            onBlur={savePart('middle_name')}
            autoComplete="name-middle"
          />
        </View>

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
          {isAdmin ? (
            <Pressable style={styles.row} accessibilityRole="button" onPress={() => router.push('/invite')}>
              <Text style={styles.rowText}>{t('profile.invite')}</Text>
              <ChevronIcon color={th.textMuted} />
            </Pressable>
          ) : null}
          <Pressable
            style={styles.row}
            accessibilityRole="button"
            onPress={() => router.push('/(auth)/pin-setup')}
          >
            <Text style={styles.rowText}>{t('profile.changePin')}</Text>
            <ChevronIcon color={th.textMuted} />
          </Pressable>
          {/* Питание живёт отдельной вкладкой, здесь его нет.
              Цикл скрыт фича-флагом с бэкенда и показывается только указавшим
              женский пол: иначе это шум в меню. Пол — самодекларация. */}
          {features.data?.cycle && profile.data?.sex === 'female' ? (
            <Pressable style={styles.row} accessibilityRole="button" onPress={() => router.push('/cycle')}>
              <Text style={styles.rowText}>{t('profile.cycle')}</Text>
              <ChevronIcon color={th.textMuted} />
            </Pressable>
          ) : null}
          {features.data?.cycle || features.data?.nutrition ? (
            <Pressable style={styles.row} accessibilityRole="button" onPress={() => router.push('/privacy')}>
              <Text style={styles.rowText}>{t('profile.privacy')}</Text>
              <ChevronIcon color={th.textMuted} />
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.row, { borderBottomWidth: 0 }]}
            accessibilityRole="button"
            onPress={() => void logout()}
          >
            <Text style={[styles.rowText, { color: th.risk }]}>{t('profile.logout')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  content: { padding: spacing.screen, paddingBottom: 40, gap: spacing.xl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  section: { gap: spacing.s },
  fio: { gap: spacing.l },
  localeRow: { flexDirection: 'row', gap: spacing.s },
  localeChip: {
    flex: 1,
    minHeight: 48,
    borderRadius: th.radius.control,
    backgroundColor: th.surface2,
    borderWidth: 1,
    borderColor: th.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  localeChipActive: { backgroundColor: th.brand, borderColor: th.brandOn },
  localeText: { fontFamily: th.font.medium, fontSize: 15, color: th.textMuted },
  localeTextActive: { color: th.onBrand },
  rows: {
    backgroundColor: th.surface,
    borderWidth: 1,
    borderColor: th.border,
    borderRadius: th.radius.card,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: th.border,
  },
  rowText: { fontFamily: th.font.medium, fontSize: 16, color: th.text },
});
