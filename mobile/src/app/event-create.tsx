// Создание события (ТЗ 3.1/3.5): тренер — командное (тренировка/матч),
// игрок — индивидуальное (личная тренировка, кардио). Дата приходит из календаря.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { api, ApiError } from '@/api/client';
import { toLocalISO } from '@/api/dates';
import { exerciseName, formatTarget } from '@/api/exercises';
import {
  useCreateEvent,
  useCreateWorkout,
  useDeleteWorkout,
  useFeatures,
  useMe,
  useMyTeams,
  useMyWorkouts,
  useReplaceWorkout,
  useUpdateEvent,
  useWorkout,
} from '@/api/hooks';
import type { EventType, Workout } from '@/api/types';
import { draftToPayload, eventPlanStore, invalidFields, MAX_ITEMS, workoutDraftStore } from '@/api/workoutDraft';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { CloseIcon, PlusIcon } from '@/components/Icons';
import { OptionChips } from '@/components/OptionChips';
import { OutlineButton } from '@/components/OutlineButton';
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
    /** План события при правке (карточка события) или шаблон из конструктора («В календарь») */
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
    // duration без start: из конструктора («В календарь»), оценка длительности шаблона
    addMinutes(
      prefillStart ?? atTime(day, DEFAULT_START_HOUR, 0),
      params.duration ? Math.min(Number(params.duration), MAX_DURATION_MIN) : DEFAULT_DURATION_MIN,
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Упражнения события (docs/plan-workout-builder.md): свой список у каждой
  // тренировки. Шаблон только источник: его упражнения копируются сюда и дальше
  // правятся независимо. Список живёт в сторе, потому что правит его конструктор.
  const qc = useQueryClient();
  const plan = eventPlanStore();
  const createPlan = useCreateWorkout();
  const replacePlan = useReplaceWorkout(plan.planId ?? '');
  const deletePlan = useDeleteWorkout();
  const source = useWorkout(workoutsEnabled && params.workoutId ? params.workoutId : undefined);
  useEffect(() => {
    eventPlanStore.getState().reset();
    return () => eventPlanStore.getState().reset();
  }, []);
  // Правка события или «В календарь» из шаблона: подхватываем список, когда он придёт
  // Один раз: повторный ответ запроса (фокус, инвалидация) не должен затирать правки
  const loadedSource = useRef<string | null>(null);
  useEffect(() => {
    if (!source.data || loadedSource.current === source.data.id) return;
    loadedSource.current = source.data.id;
    eventPlanStore.getState().load(source.data);
  }, [source.data]);

  /** «Взять из шаблона»: упражнения добавляются в конец списка события. */
  const takeTemplate = async (templateId: string) => {
    try {
      const template = await qc.fetchQuery({
        queryKey: ['workout', templateId],
        queryFn: () => api<Workout>(`/workouts/${templateId}`),
      });
      const wasEmpty = eventPlanStore.getState().items.length === 0;
      const added = eventPlanStore.getState().appendTemplate(template);
      if (added === 0) {
        toast(t('eventCreate.exercisesTooMany', { n: MAX_ITEMS }));
        return;
      }
      toast(t('eventCreate.templateAdded', { count: added }));
      // Пустая тренировка целиком из шаблона: время подставляем по его оценке
      if (wasEmpty) setEnd(addMinutes(start, Math.min(template.est_duration_min, MAX_DURATION_MIN)));
    } catch (e) {
      toast(e instanceof ApiError ? e.detail : t('common.noConnection'));
    }
  };

  /** Конструктор в режиме события: берёт текущий список, по «Готово» кладёт обратно. */
  const openPlanEditor = () => {
    workoutDraftStore.setState({
      workoutId: null,
      name: '',
      notes: '',
      items: [...eventPlanStore.getState().items],
      dirty: false,
    });
    router.push({ pathname: '/workout-edit', params: { mode: 'event' } });
  };

  // Упражнения бывают только у личной тренировки: у «Другое» блока нет, и список не уходит
  const planAllowed = workoutsEnabled && type === 'individual';

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
  const canSubmit = (!isStaff || activeTeamId != null) && timeError === null && !saving;

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

  /** Сначала список упражнений (свой Workout события), потом само событие со ссылкой на него. */
  const savePlan = async (): Promise<{ id: string | null; created: boolean }> => {
    if (!planAllowed || plan.items.length === 0) return { id: null, created: false };
    if (plan.planId && !plan.dirty) return { id: plan.planId, created: false };
    const payload = {
      ...draftToPayload({
        name: plan.name || title.trim() || t('calendar.types.individual'),
        notes: '',
        items: plan.items,
      }),
      is_template: false,
    };
    if (plan.planId) {
      await replacePlan.mutateAsync(payload);
      return { id: plan.planId, created: false };
    }
    return { id: (await createPlan.mutateAsync(payload)).id, created: true };
  };

  const submit = async () => {
    setError(null);
    setSaving(true);
    let planResult: { id: string | null; created: boolean } = { id: null, created: false };
    try {
      planResult = await savePlan();
      const base = {
        type,
        title: title.trim() || null,
        planned_start: start.toISOString(),
        planned_duration_min: duration,
      };
      if (isEdit) {
        // team_id не передаём: EventUpdateIn его не принимает, команду события не меняют.
        // null снимает список (сервер его удаляет); у командного события поле не трогаем
        await updateEvent.mutateAsync({
          ...base,
          ...(isPersonal && workoutsEnabled ? { workout_id: planResult.id } : {}),
        });
      } else {
        await createEvent.mutateAsync({
          ...base,
          team_id: isStaff ? activeTeamId : null,
          workout_id: planResult.id,
        });
      }
      toast(t('common.saved'));
      router.back();
    } catch (e) {
      // Событие не сохранилось, а новый список уже на сервере: убираем, чтобы не висел
      if (planResult.created && planResult.id) deletePlan.mutate(planResult.id);
      setError(e instanceof ApiError ? e.detail : t('common.retry'));
    } finally {
      setSaving(false);
    }
  };

  const planInvalid = plan.items.some((item) => invalidFields(item).length > 0);

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

        {planAllowed ? (
          <View style={styles.section}>
            <MicroLabel>{t('eventCreate.exercisesLabel')}</MicroLabel>
            {isEdit && params.workoutId && source.isPending ? (
              <Text style={styles.hint}>…</Text>
            ) : plan.items.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={openPlanEditor}
                style={({ pressed }) => [styles.planList, pressed && { opacity: 0.8 }]}
              >
                {plan.items.map((item, i) => (
                  <View key={item.key} style={styles.planRow}>
                    <Text style={styles.planIndex}>{i + 1}</Text>
                    <Text style={styles.planName} numberOfLines={1}>
                      {exerciseName(item.exercise, i18n.language)}
                    </Text>
                    <Text style={styles.planTarget}>{formatTarget({ ...item, sets: item.sets ?? 0 }, t)}</Text>
                  </View>
                ))}
              </Pressable>
            ) : null}
            <OutlineButton
              title={t(plan.items.length > 0 ? 'eventCreate.editExercises' : 'workouts.addExercises')}
              icon={plan.items.length > 0 ? undefined : <PlusIcon color={th.text} size={18} />}
              onPress={openPlanEditor}
            />
            {planInvalid ? <Text style={styles.error}>{t('workouts.invalidTarget')}</Text> : null}

            {(workouts.data?.length ?? 0) > 0 ? (
              <>
                <MicroLabel>{t('eventCreate.fromTemplate')}</MicroLabel>
                <OptionChips
                  options={workouts.data?.map((w) => w.id) ?? []}
                  value={null}
                  onSelect={(id) => id && void takeTemplate(id)}
                  labelFor={(id) => workouts.data?.find((w) => w.id === id)?.name ?? ''}
                />
              </>
            ) : workouts.isSuccess ? (
              <Text style={styles.hint}>{t('eventCreate.templatesHint')}</Text>
            ) : null}
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
          onPress={() => void submit()}
          disabled={!canSubmit || (planAllowed && planInvalid)}
          loading={saving}
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
  planList: {
    backgroundColor: th.surface,
    borderWidth: 1,
    borderColor: th.border,
    borderRadius: th.radius.card,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.s,
  },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.m, paddingVertical: spacing.s },
  planIndex: { width: 18, fontFamily: th.font.semibold, fontSize: 13, color: th.textMuted },
  planName: { flex: 1, fontFamily: th.font.medium, fontSize: 15, color: th.text },
  planTarget: { fontFamily: th.font.regular, fontSize: 13, color: th.textMuted, fontVariant: ['tabular-nums'] },
  footer: { padding: spacing.screen },
});
