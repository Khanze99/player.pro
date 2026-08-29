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
import { TimeField } from '@/components/TimeField';
import { useToast } from '@/components/Toast';
import { MicroLabel, ScreenTitle } from '@/components/Typography';
import { colors, font, spacing } from '@/theme';

const TEAM_TYPES: readonly EventType[] = ['training', 'match', 'other'];
const PERSONAL_TYPES: readonly EventType[] = ['individual', 'other'];

const DEFAULT_START_HOUR = 18;
const DEFAULT_DURATION_MIN = 90;
const MAX_DURATION_MIN = 600; // столько же принимает бэкенд (EventCreateIn)

const atTime = (dayISO: string, hour: number, minute: number) => {
  const [y, m, d] = dayISO.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute);
};

const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000);

const minutesBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 60_000);

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

  const day = date ?? toLocalISO(new Date());

  const [type, setType] = useState<EventType>(isStaff ? 'training' : 'individual');
  const [title, setTitle] = useState('');
  const [teamId, setTeamId] = useState<string | null>(null);
  const [start, setStart] = useState(() => atTime(day, DEFAULT_START_HOUR, 0));
  const [end, setEnd] = useState(() =>
    addMinutes(atTime(day, DEFAULT_START_HOUR, 0), DEFAULT_DURATION_MIN),
  );
  const [error, setError] = useState<string | null>(null);

  const activeTeamId = teamId ?? teams.data?.[0]?.id ?? null;
  const duration = minutesBetween(start, end);
  // Пикер отдаёт только часы и минуты, так что «до» раньше «от» — это тот же день,
  // а не переход через полночь: событий на две даты в MVP нет
  const timeError =
    duration < 1
      ? t('eventCreate.endBeforeStart')
      : duration > MAX_DURATION_MIN
        ? t('eventCreate.tooLong')
        : null;
  const canSubmit = (!isStaff || activeTeamId != null) && timeError === null;

  const durationText = [
    Math.floor(duration / 60) > 0 ? `${Math.floor(duration / 60)} ${t('eventCreate.hoursShort')}` : '',
    duration % 60 > 0 ? `${duration % 60} ${t('eventCreate.minutesShort')}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  /** Дату берём из календаря, из пикера — только часы и минуты. */
  const onDay = (value: Date) => atTime(day, value.getHours(), value.getMinutes());

  /** Сдвиг начала тянет конец за собой: длительность обычно уже правильная. */
  const changeStart = (value: Date) => {
    const next = onDay(value);
    if (duration >= 1) setEnd(addMinutes(next, duration));
    setStart(next);
  };

  const dateLabel = new Date(`${day}T12:00:00`)
    .toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })
    .toUpperCase();

  const submit = () => {
    setError(null);
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
          <TimeField label={t('eventCreate.startLabel')} value={start} onChange={changeStart} />
          <TimeField
            label={t('eventCreate.endLabel')}
            value={end}
            onChange={(value) => setEnd(onDay(value))}
          />
          <Text style={timeError ? styles.error : styles.hint}>
            {timeError ?? t('eventCreate.durationHint', { text: durationText })}
          </Text>
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
  hint: { fontFamily: font.medium, fontSize: 13, color: colors.textMuted },
  error: { fontFamily: font.medium, fontSize: 13, color: colors.risk },
  footer: { padding: spacing.screen },
});
