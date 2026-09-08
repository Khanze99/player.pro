// Профиль (дизайн-ТЗ 5.6 + docs/plan-profile.md): фото, ФИО, контакты и роль
// на чтение, антропометрия и дата рождения на редактирование, язык, смена PIN,
// выход. Приглашение в клуб — админское действие, живёт здесь же.

import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ApiError, post } from '@/api/client';
import {
  useAvatar,
  useDeleteAvatar,
  useFeatures,
  useMe,
  useMyProfile,
  useUpdateMe,
  useUploadAvatar,
  useUpsertProfile,
} from '@/api/hooks';
import type { AthleteProfile, Sex } from '@/api/types';
import { getRefreshToken, session } from '@/auth/session';
import { TeamBadge } from '@/components/TeamBadge';
import { Field } from '@/components/Field';
import { ChevronIcon } from '@/components/Icons';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { useToast } from '@/components/Toast';
import { MicroLabel, ScreenTitle } from '@/components/Typography';
import type { AppLocale } from '@/i18n';
import { spacing, type Theme, useStyles, useTheme } from '@/theme';

const LOCALES: { code: AppLocale; label: string }[] = [
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
];

const SEX_OPTIONS: readonly Sex[] = ['female', 'male', 'not_specified'];

// birthdate на бэке — ISO YYYY-MM-DD, в поле показываем ДД.ММ.ГГГГ
const isoToDisplay = (iso: string | null): string => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}.${m}.${y}` : '';
};

const displayToIso = (value: string): string | null => {
  const m = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const date = new Date(`${y}-${mo}-${d}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date > new Date()) return null;
  return `${y}-${mo}-${d}`;
};

function Avatar({ url, name, onPick }: { url: string | null; name: string; onPick: () => void }) {
  const styles = useStyles(makeStyles);
  const avatar = useAvatar(url);
  const initials =
    name
      .split(' ')
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?';

  return (
    <Pressable onPress={onPick} accessibilityRole="button" style={styles.avatarWrap}>
      {avatar.data ? (
        <Image source={{ uri: avatar.data }} style={styles.avatarImg} contentFit="cover" transition={120} />
      ) : (
        <View style={[styles.avatarImg, styles.avatarFallback]}>
          <Text style={styles.avatarInitials}>{initials}</Text>
        </View>
      )}
    </Pressable>
  );
}

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
  const upsertProfile = useUpsertProfile();
  const uploadAvatar = useUploadAvatar();
  const deleteAvatar = useDeleteAvatar();

  const [fio, setFio] = useState({ last_name: '', first_name: '', middle_name: '' });
  const [serverFio, setServerFio] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ birthdate: string; position: string; height: string; weight: string }>({
    birthdate: '',
    position: '',
    height: '',
    weight: '',
  });
  const [serverDraft, setServerDraft] = useState<string | null>(null);

  // Синхронизация с сервером во время рендера (adjusting state on prop change)
  const meFio = me.data && {
    last_name: me.data.last_name,
    first_name: me.data.first_name,
    middle_name: me.data.middle_name,
  };
  if (meFio && JSON.stringify(meFio) !== serverFio) {
    setServerFio(JSON.stringify(meFio));
    setFio(meFio);
  }

  const p = profile.data;
  if (p) {
    const snapshot = JSON.stringify([p.birthdate, p.position, p.height_cm, p.weight_kg]);
    if (snapshot !== serverDraft) {
      setServerDraft(snapshot);
      setDraft({
        birthdate: isoToDisplay(p.birthdate),
        position: p.position ?? '',
        height: p.height_cm != null ? String(p.height_cm) : '',
        weight: p.weight_kg != null ? String(p.weight_kg) : '',
      });
    }
  }

  const isAdmin = me.data?.global_role === 'admin';
  // Приватность/согласия и антропометрия «под согласие» — только для игроков:
  // их данные (цикл, питание, рост/вес) кто-то из штаба может смотреть. У самого
  // штаба (админ/тренер/врач) таких потоков нет, экран согласий для них — пустой.
  const isPlayer = me.data?.global_role === 'player';

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

  const saveProfile = (patch: Partial<Omit<AthleteProfile, 'user_id'>>) =>
    upsertProfile.mutate(patch, {
      onSuccess: () => toast(t('common.saved')),
      onError: () => {
        setServerDraft(null); // откат черновика к серверному значению
        toast(t('common.error'));
      },
    });

  const saveBirthdate = () => {
    if (!p) return;
    const current = isoToDisplay(p.birthdate);
    if (draft.birthdate.trim() === current.trim()) return;
    if (draft.birthdate.trim() === '') {
      saveProfile({ birthdate: null });
      return;
    }
    const iso = displayToIso(draft.birthdate);
    if (iso === null) {
      toast(t('profile.birthdateInvalid'));
      setDraft((d) => ({ ...d, birthdate: current }));
      return;
    }
    saveProfile({ birthdate: iso });
  };

  const saveNumber = (field: 'height' | 'weight', min: number, max: number) => () => {
    if (!p) return;
    const key = field === 'height' ? 'height_cm' : 'weight_kg';
    const currentServer = p[key];
    const raw = draft[field].replace(',', '.').trim();
    if (raw === '') {
      if (currentServer != null) saveProfile({ [key]: null });
      return;
    }
    const num = field === 'height' ? parseInt(raw, 10) : parseFloat(raw);
    if (Number.isNaN(num) || num < min || num > max) {
      setDraft((d) => ({ ...d, [field]: currentServer != null ? String(currentServer) : '' }));
      return;
    }
    if (num !== currentServer) saveProfile({ [key]: num });
  };

  const savePosition = () => {
    if (!p) return;
    const value = draft.position.trim();
    if (value === (p.position ?? '')) return;
    saveProfile({ position: value === '' ? null : value });
  };

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (res.canceled) return;
    const asset = res.assets[0];
    // Бэкенд принимает только JPEG/PNG/WEBP. quality<1 на iOS уже отдаёт JPEG;
    // HEIC/HEIF или отсутствие типа — подменяем на image/jpeg, иначе Pillow не прочтёт.
    const ok = asset.mimeType && ['image/jpeg', 'image/png', 'image/webp'].includes(asset.mimeType);
    const type = ok ? asset.mimeType! : 'image/jpeg';
    const name =
      (asset.fileName ?? 'avatar').replace(/\.[^.]+$/, '') + (type === 'image/png' ? '.png' : '.jpg');

    const form = new FormData();
    // web: у ассета есть готовый File; натив: RN-часть { uri, name, type }
    // (её понимает XMLHttpRequest, на котором построен upload()).
    if (asset.file) form.append('file', asset.file, name);
    else form.append('file', { uri: asset.uri, name, type } as unknown as Blob);

    uploadAvatar.mutate(form, {
      onError: (e) => {
        if (e instanceof ApiError && e.status === 413) return toast(t('profile.photoTooLarge'));
        if (e instanceof ApiError && e.status === 400) return toast(t('profile.photoFormat'));
        const reason = e instanceof ApiError ? `${e.status}` : e instanceof Error ? e.message : String(e);
        toast(`${t('profile.photoError')}: ${reason}`);
      },
    });
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

  const fullName = me.data
    ? [me.data.last_name, me.data.first_name].filter(Boolean).join(' ')
    : '';
  const memberSince = me.data
    ? new Date(me.data.created_at).toLocaleDateString(i18n.language, { year: 'numeric', month: 'long' })
    : '';
  // Только роль: команда/организация в профиле не нужны
  const roleText = me.data
    ? me.data.teams.length > 0
      ? [...new Set(me.data.teams.map((tm) => t(`profile.teamRole.${tm.team_role}` as const)))].join(', ')
      : me.data.org_id
        ? t(`profile.globalRole.${me.data.global_role}` as const)
        : t('profile.personalAccount')
    : '';

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <ScreenTitle>{t('profile.title')}</ScreenTitle>
          <TeamBadge showPersonal />
        </View>

        <View style={styles.identity}>
          <Avatar url={me.data?.avatar_url ?? null} name={fullName} onPick={() => void pickAvatar()} />
          <View style={styles.identityText}>
            <Text style={styles.name} numberOfLines={2}>
              {fullName}
            </Text>
            <View style={styles.photoActions}>
              <Pressable onPress={() => void pickAvatar()} accessibilityRole="button">
                <Text style={styles.photoAction}>{t('profile.changePhoto')}</Text>
              </Pressable>
              {me.data?.avatar_url ? (
                <Pressable
                  onPress={() => deleteAvatar.mutate()}
                  accessibilityRole="button"
                >
                  <Text style={[styles.photoAction, { color: th.risk }]}>{t('profile.removePhoto')}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
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

        <View style={styles.infoCard}>
          {me.data?.email ? <InfoRow label={t('profile.email')} value={me.data.email} /> : null}
          {me.data?.phone ? <InfoRow label={t('profile.phone')} value={me.data.phone} /> : null}
          <InfoRow label={t('profile.role')} value={roleText} />
          <InfoRow
            label=""
            value={t('profile.memberSince', { date: memberSince })}
            muted
            last
          />
        </View>

        <View style={styles.section}>
          <MicroLabel>{t('profile.sex')}</MicroLabel>
          <Segmented
            options={SEX_OPTIONS}
            value={(p?.sex ?? 'not_specified') as Sex}
            onSelect={(value) => saveProfile({ sex: value })}
            labelFor={(value) => t(`profile.sexOption.${value}` as const)}
          />
        </View>

        <View style={styles.fio}>
          <Field
            label={t('profile.birthdate')}
            value={draft.birthdate}
            placeholder={t('profile.birthdatePlaceholder')}
            keyboardType="numbers-and-punctuation"
            onChangeText={(v) => setDraft((d) => ({ ...d, birthdate: v }))}
            onBlur={saveBirthdate}
          />
          <Field
            label={t('profile.position')}
            value={draft.position}
            onChangeText={(v) => setDraft((d) => ({ ...d, position: v }))}
            onBlur={savePosition}
          />
          <View style={styles.metricRow}>
            <View style={styles.metricCol}>
              <Field
                label={t('profile.height')}
                value={draft.height}
                keyboardType="number-pad"
                onChangeText={(v) => setDraft((d) => ({ ...d, height: v }))}
                onBlur={saveNumber('height', 100, 250)}
              />
            </View>
            <View style={styles.metricCol}>
              <Field
                label={t('profile.weight')}
                value={draft.weight}
                keyboardType="decimal-pad"
                onChangeText={(v) => setDraft((d) => ({ ...d, weight: v }))}
                onBlur={saveNumber('weight', 30, 250)}
              />
            </View>
          </View>
          {isPlayer ? (
            <Pressable onPress={() => router.push('/privacy')} accessibilityRole="button">
              <Text style={styles.metricsHint}>{t('profile.bodyMetricsHint')}</Text>
            </Pressable>
          ) : null}
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
          {/* Цикл скрыт фича-флагом с бэкенда и показывается только указавшим
              женский пол: иначе это шум в меню. Пол — самодекларация. */}
          {features.data?.cycle && p?.sex === 'female' ? (
            <Pressable style={styles.row} accessibilityRole="button" onPress={() => router.push('/cycle')}>
              <Text style={styles.rowText}>{t('profile.cycle')}</Text>
              <ChevronIcon color={th.textMuted} />
            </Pressable>
          ) : null}
          {isPlayer && (features.data?.cycle || features.data?.nutrition) ? (
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

function InfoRow({
  label,
  value,
  muted,
  last,
}: {
  label: string;
  value: string;
  muted?: boolean;
  last?: boolean;
}) {
  const styles = useStyles(makeStyles);
  return (
    <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
      {label ? <Text style={styles.infoLabel}>{label}</Text> : null}
      <Text style={[styles.infoValue, muted && styles.infoValueMuted]}>{value}</Text>
    </View>
  );
}

const makeStyles = (th: Theme) =>
  StyleSheet.create({
    content: { padding: spacing.screen, paddingBottom: 40, gap: spacing.xl },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    identity: { flexDirection: 'row', gap: spacing.l, alignItems: 'center' },
    identityText: { flex: 1, gap: spacing.s },
    name: { fontFamily: th.font.semibold, fontSize: 19, color: th.text },
    photoActions: { flexDirection: 'row', gap: spacing.l },
    photoAction: { fontFamily: th.font.medium, fontSize: 13, color: th.brandOn },
    avatarWrap: { width: 72, height: 72 },
    avatarImg: { width: 72, height: 72, borderRadius: 36, backgroundColor: th.surface2 },
    avatarFallback: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: th.border,
    },
    avatarInitials: { fontFamily: th.font.semibold, fontSize: 24, color: th.textMuted },
    section: { gap: spacing.s },
    fio: { gap: spacing.l },
    metricRow: { flexDirection: 'row', gap: spacing.l },
    metricCol: { flex: 1 },
    metricsHint: { fontFamily: th.font.regular, fontSize: 13, color: th.brandOn },
    infoCard: {
      backgroundColor: th.surface,
      borderWidth: 1,
      borderColor: th.border,
      borderRadius: th.radius.card,
      paddingHorizontal: spacing.xl,
    },
    infoRow: {
      minHeight: 52,
      paddingVertical: spacing.m,
      gap: 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: th.border,
    },
    infoLabel: {
      fontFamily: th.font.semibold,
      fontSize: 11,
      color: th.textMuted,
      letterSpacing: 1.4,
    },
    infoValue: { fontFamily: th.font.medium, fontSize: 16, color: th.text },
    infoValueMuted: { fontSize: 13, color: th.textMuted, fontFamily: th.font.regular },
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
