// Создание события (ТЗ 3.1/3.5): тренер — командное (тренировка/матч),
// игрок — индивидуальное (личная тренировка, кардио). Дата приходит из календаря.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ApiError } from '@/api/client';
import { toLocalISO } from '@/api/dates';
import { useCreateEvent, useFeatures, useMe, useMyTeams, useMyWorkouts, useUpdateEvent } from '@/api/hooks';
import type { EventType } from '@/api/types';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { CloseIcon } from '@/components/Icons';
import { OptionChips } from '@/components/OptionChips';
import { Screen } from '@/components/Screen';
import { TimeField } from '@/components/TimeField';
import { useToast } from '@/components/Toast';
import { MicroLabel, ScreenTitle } from '@/components/Typography';
import { spacing, type Theme, useStyles, useTheme } from '@/theme';

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
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const toast = useToast((s) => s.show);
  const params = useLocalSearchParams<{
    date?: string;
    // Присутствуют, только когда экран открыт на правку (event/[id].tsx) —
    // те же поля, что уже передаёт карточка события, второго запроса не нужно
    id?: string;
    type?: EventType;
    title?: string;
    start?: string;
    duration?: string;
    teamId?: string;
    /** Шаблон тренировки: из карточки события при правке или из конструктора */
    workoutId?: string;
  }>();
  const isEdit = !!params.id;
  const prefillStart = params.start ? new Date(params.start) : null;

  const me = useMe();
  const teams = useMyTeams();
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent(params.id ?? '');

  const isStaff = me.data != null && me.data.global_role !== 'player';
  const types = isStaff ? TEAM_TYPES : PERSONAL_TYPES;
  // Шаблон ставится только на личное событие (docs/plan-workout-builder.md)
  const isPersonal = isEdit ? !params.teamId : !isStaff;
  const features = useFeatures();
  const workoutsEnabled = features.data?.workouts === true && isPersonal;
  const workouts = useMyWorkouts(workoutsEnabled);

  const day = prefillStart ? toLocalISO(prefillStart) : (params.date ?? toLocalISO(new Date()));

  const [type, setType] = useState<EventType>(params.type ?? (isStaff ? 'training' : 'individual'));
  const [title, setTitle] = useState(params.title ?? '');
  const [teamId, setTeamId] = useState<string | null>(params.teamId || null);
  const [start, setStart] = useState(() => prefillStart ?? atTime(day, DEFAULT_START_HOUR, 0));
  const [end, setEnd] = useState(() =>
    prefillStart && params.duration
      ? addMinutes(prefillStart, Number(params.duration))
      : addMinutes(atTime(day, DEFAULT_START_HOUR, 0), DEFAULT_DURATION_MIN),
  );
  const [error, setError] = useState<string | null>(null);
  const [workoutId, setWorkoutId] = useState<string | null>(params.workoutId || null);

  /** Выбор шаблона подставляет его оценку длительности: обычно её и планируют. */
  const pickWorkout = (id: string | null) => {
    setWorkoutId(id);
    const estimate = workouts.data?.find((w) => w.id === id)?.est_duration_min;
    if (estimate) setEnd(addMinutes(start, Math.min(estimate, MAX_DURATION_MIN)));
  };

  // Открыто из конструктора: длительность из шаблона, как только придёт список
  const prefilledFromWorkout = useRef(false);
  useEffect(() => {
    if (prefilledFromWorkout.current || isEdit || !params.workoutId || !workouts.data) return;
    prefilledFromWorkout.current = true;
    pickWorkout(params.workoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workouts.data]);

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
    const onSettled = {
      onSuccess: () => {
        toast(t('common.saved'));
        router.back();
      },
      onError: (e: unknown) => setError(e instanceof ApiError ? e.detail : t('common.retry')),
    };
    if (isEdit) {
      // team_id не передаём — EventUpdateIn его не принимает, команду события не меняют
      updateEvent.mutate(
        {
          type,
          title: title.trim() || null,
          planned_start: start.toISOString(),
          planned_duration_min: duration,
          // null снимает шаблон; у командного события поле не трогаем
          ...(isPersonal && workoutsEnabled ? { workout_id: workoutId } : {}),
        },
        onSettled,
      );
      return;
    }
    createEvent.mutate(
      {
        team_id: isStaff ? activeTeamId : null,
        type,
        title: title.trim() || null,
        planned_start: start.toISOString(),
        planned_duration_min: duration,
        workout_id: workoutsEnabled ? workoutId : null,
      },
      onSettled,
    );
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View>
            <Text style={styles.date}>{dateLabel}</Text>
            <ScreenTitle>{t(isEdit ? 'eventCreate.editTitle' : 'eventCreate.title')}</ScreenTitle>
          </View>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            style={styles.close}
          >
            <CloseIcon color={th.textMuted} />
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

        {/* Команду события не меняют (EventUpdateIn её не принимает) — переключатель только при создании */}
        {!isEdit && isStaff && (teams.data?.length ?? 0) > 1 && (
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

        {workoutsEnabled && (workouts.data?.length ?? 0) > 0 ? (
          <View style={styles.section}>
            <MicroLabel>{t('eventCreate.workoutLabel')}</MicroLabel>
            <OptionChips
              options={workouts.data?.map((w) => w.id) ?? []}
              value={workoutId}
              onSelect={pickWorkout}
              labelFor={(id) => workouts.data?.find((w) => w.id === id)?.name ?? ''}
            />
          </View>
        ) : null}

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
          title={t(isEdit ? 'common.save' : 'eventCreate.submit')}
          onPress={submit}
          disabled={!canSubmit}
          loading={isEdit ? updateEvent.isPending : createEvent.isPending}
        />
      </View>
    </Screen>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  content: { padding: spacing.screen, gap: spacing.l },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  date: {
    fontFamily: th.font.semibold,
    fontSize: 11,
    color: th.textMuted,
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  close: { padding: spacing.xs },
  section: { gap: spacing.s },
  hint: { fontFamily: th.font.medium, fontSize: 13, color: th.textMuted },
  error: { fontFamily: th.font.medium, fontSize: 13, color: th.risk },
  footer: { padding: spacing.screen },
});
