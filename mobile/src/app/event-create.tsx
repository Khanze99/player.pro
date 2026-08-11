// Создание события (ТЗ 3.1/3.5): тренер — командное (тренировка/матч),
// игрок — индивидуальное (личная тренировка, кардио). Дата приходит из календаря.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ApiError } from '@/api/client';
import { toLocalISO } from '@/api/dates';
import { useCreateEvent, useMe, useMyTeams } from '@/api/hooks';
import type { EventType } from '@/api/types';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { CloseIcon } from '@/components/Icons';
import { OptionChips } from '@/components/OptionChips';
import { Screen } from '@/components/Screen';
import { Stepper } from '@/components/Stepper';
import { useToast } from '@/components/Toast';
import { MicroLabel, ScreenTitle } from '@/components/Typography';
import { colors, font, spacing } from '@/theme';

const TEAM_TYPES: readonly EventType[] = ['training', 'match', 'other'];
const PERSONAL_TYPES: readonly EventType[] = ['individual', 'other'];
const MINUTES = ['00', '15', '30', '45'] as const;

export default function EventCreate() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const toast = useToast((s) => s.show);
  const { date } = useLocalSearchParams<{ date?: string }>();

  const me = useMe();
  const teams = useMyTeams();
  const createEvent = useCreateEvent();

  const isStaff = me.data != null && me.data.global_role !== 'player';
  const types = isStaff ? TEAM_TYPES : PERSONAL_TYPES;

  const [type, setType] = useState<EventType>(isStaff ? 'training' : 'individual');
  const [title, setTitle] = useState('');
  const [teamId, setTeamId] = useState<string | null>(null);
  const [hour, setHour] = useState(18);
  const [minute, setMinute] = useState(0);
  const [duration, setDuration] = useState(90);
  const [error, setError] = useState<string | null>(null);

  const day = date ?? toLocalISO(new Date());
  const activeTeamId = teamId ?? teams.data?.[0]?.id ?? null;
  const canSubmit = !isStaff || activeTeamId != null;

  const dateLabel = new Date(`${day}T12:00:00`)
    .toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })
    .toUpperCase();

  const submit = () => {
    setError(null);
    const [y, m, d] = day.split('-').map(Number);
    const start = new Date(y, m - 1, d, hour, minute);
    createEvent.mutate(
      {
        team_id: isStaff ? activeTeamId : null,
        type,
        title: title.trim() || null,
        planned_start: start.toISOString(),
        planned_duration_min: duration,
      },
      {
        onSuccess: () => {
          toast(t('common.saved'));
          router.back();
        },
        onError: (e) => setError(e instanceof ApiError ? e.detail : t('common.retry')),
      },
    );
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View>
            <Text style={styles.date}>{dateLabel}</Text>
            <ScreenTitle>{t('eventCreate.title')}</ScreenTitle>
          </View>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            style={styles.close}
          >
            <CloseIcon color={colors.textMuted} />
          </Pressable>
        </View>

        <View style={styles.section}>
          <MicroLabel>{t('eventCreate.typeLabel')}</MicroLabel>
          <OptionChips
            options={types}
            value={type}
            onSelect={(v) => v && setType(v)}
            labelFor={(v) => t(`calendar.types.${v}`)}
          />
        </View>

        {isStaff && (teams.data?.length ?? 0) > 1 && (
          <View style={styles.section}>
            <MicroLabel>{t('invite.teamLabel')}</MicroLabel>
            <OptionChips
              options={teams.data?.map((team) => team.id) ?? []}
              value={activeTeamId}
              onSelect={(v) => v && setTeamId(v)}
              labelFor={(id) => teams.data?.find((team) => team.id === id)?.name ?? ''}
            />
          </View>
        )}

        <Field
          label={t('eventCreate.titleLabel')}
          value={title}
          onChangeText={setTitle}
          placeholder={t('eventCreate.titlePlaceholder')}
        />

        <View style={styles.section}>
          <MicroLabel>{t('eventCreate.timeLabel')}</MicroLabel>
          <View style={styles.timeRow}>
            <Stepper value={hour} onChange={setHour} step={1} min={5} max={23} />
            <Text style={styles.timePreview}>
              {`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`}
            </Text>
          </View>
          <OptionChips
            options={MINUTES}
            value={String(minute).padStart(2, '0') as (typeof MINUTES)[number]}
            onSelect={(v) => v && setMinute(Number(v))}
            labelFor={(v) => `:${v}`}
          />
        </View>

        <View style={styles.section}>
          <MicroLabel>{t('eventCreate.durationLabel')}</MicroLabel>
          <Stepper value={duration} onChange={setDuration} step={15} min={15} max={240} />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
      <View style={styles.footer}>
        <Button
          title={t('eventCreate.submit')}
          onPress={submit}
          disabled={!canSubmit}
          loading={createEvent.isPending}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.screen, gap: spacing.l },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  date: {
    fontFamily: font.semibold,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  close: { padding: spacing.xs },
  section: { gap: spacing.s },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.s,
  },
  timePreview: {
    fontFamily: font.display,
    fontSize: 22,
    color: colors.brand,
    fontVariant: ['tabular-nums'],
  },
  error: { fontFamily: font.medium, fontSize: 13, color: colors.risk },
  footer: { padding: spacing.screen },
});
