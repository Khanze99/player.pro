// Конструктор шаблона тренировки (docs/plan-workout-builder.md): название,
// упражнения по порядку, цель на каждое (подходы × повторы × вес или время),
// отдых. Черновик живёт в workoutDraft.ts, выбор упражнений пишет туда же.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { ApiError } from '@/api/client';
import { todayISO } from '@/api/dates';
import { equipmentLabel, exerciseName, targetLabel } from '@/api/exercises';
import { useCreateWorkout, useDeleteWorkout, useReplaceWorkout, useWorkout } from '@/api/hooks';
import { useStartWorkout } from '@/api/useStartWorkout';
import type { WorkoutItemMode } from '@/api/types';
import {
  type DraftItem,
  draftToPayload,
  invalidFields,
  eventPlanStore,
  MAX_ITEMS,
  workoutDraftStore,
} from '@/api/workoutDraft';
import { Button } from '@/components/Button';
import { confirmAction } from '@/components/confirm';
import { ExerciseThumb } from '@/components/ExerciseThumb';
import { Field } from '@/components/Field';
import { NumField } from '@/components/NumField';
import { CalendarIcon, ChevronIcon, CloseIcon, PlusIcon, TrashIcon } from '@/components/Icons';
import { OutlineButton } from '@/components/OutlineButton';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { useToast } from '@/components/Toast';
import { MicroLabel, ScreenTitle } from '@/components/Typography';
import { spacing, type Theme, useStyles, useTheme } from '@/theme';

const MODES: readonly WorkoutItemMode[] = ['reps', 'time'];

function ItemCard({ item, index, count }: { item: DraftItem; index: number; count: number }) {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { updateItem, removeItem, moveItem } = workoutDraftStore.getState();
  const bad = new Set(invalidFields(item));

  return (
    <View style={styles.card}>
      <View style={styles.itemHead}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('exercise.details')}
          onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: item.exercise.id } })}
        >
          <ExerciseThumb exercise={item.exercise} size={48} />
        </Pressable>
        <View style={styles.itemTitle}>
          <Text style={styles.itemName} numberOfLines={2}>
            {index + 1}. {exerciseName(item.exercise, i18n.language)}
          </Text>
          <Text style={styles.itemMeta} numberOfLines={1}>
            {targetLabel(item.exercise.target, t)} · {equipmentLabel(item.exercise.equipment, t)}
          </Text>
        </View>
      </View>

      <Segmented
        options={MODES}
        value={item.mode}
        onSelect={(mode) => updateItem(item.key, { mode })}
        labelFor={(m) => t(`workouts.mode.${m}`)}
      />

      {/* key по режиму: при смене режима поля монтируются заново с новыми значениями */}
      <View style={styles.numRow} key={item.mode}>
        <NumField
          label={t('workouts.sets')}
          value={item.sets}
          onChange={(sets) => updateItem(item.key, { sets })}
          invalid={bad.has('sets')}
        />
        {item.mode === 'reps' ? (
          <>
            <NumField
              label={t('workouts.reps')}
              value={item.reps}
              onChange={(reps) => updateItem(item.key, { reps })}
              invalid={bad.has('reps')}
            />
            <NumField
              label={t('workouts.weight')}
              value={item.weight_kg}
              onChange={(weight_kg) => updateItem(item.key, { weight_kg })}
              decimal
              invalid={bad.has('weight_kg')}
            />
          </>
        ) : (
          <NumField
            label={t('workouts.durationSec')}
            value={item.duration_sec}
            onChange={(duration_sec) => updateItem(item.key, { duration_sec })}
            invalid={bad.has('duration_sec')}
          />
        )}
        <NumField
          label={t('workouts.restSec')}
          value={item.rest_sec}
          onChange={(rest_sec) => updateItem(item.key, { rest_sec })}
          invalid={bad.has('rest_sec')}
        />
      </View>
      {bad.size > 0 ? <Text style={styles.error}>{t('workouts.invalidTarget')}</Text> : null}

      <View style={styles.itemActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('workouts.moveUp')}
          disabled={index === 0}
          onPress={() => moveItem(item.key, -1)}
          style={[styles.iconButton, index === 0 && styles.dim]}
          hitSlop={4}
        >
          <View style={styles.up}>
            <ChevronIcon color={th.text} size={18} />
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('workouts.moveDown')}
          disabled={index === count - 1}
          onPress={() => moveItem(item.key, 1)}
          style={[styles.iconButton, index === count - 1 && styles.dim]}
          hitSlop={4}
        >
          <View style={styles.down}>
            <ChevronIcon color={th.text} size={18} />
          </View>
        </Pressable>
        <View style={styles.flex} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('workouts.removeExercise')}
          onPress={() => removeItem(item.key)}
          style={styles.iconButton}
          hitSlop={4}
        >
          <TrashIcon color={th.risk} size={18} />
        </Pressable>
      </View>
    </View>
  );
}

export default function WorkoutEdit() {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast((s) => s.show);
  // mode=event: список упражнений конкретного события (event-create.tsx). Черновик
  // туда кладёт само событие; «Готово» возвращает его обратно, на сервер ничего не уходит.
  // Название, заметки, старт и календарь здесь не нужны: это не шаблон.
  const params = useLocalSearchParams<{ id?: string; mode?: string }>();
  const forEvent = params.mode === 'event';

  const draft = workoutDraftStore();
  const workout = useWorkout(params.id);
  const createWorkout = useCreateWorkout();
  const replaceWorkout = useReplaceWorkout(draft.workoutId ?? '');
  const deleteWorkout = useDeleteWorkout();
  const [error, setError] = useState<string | null>(null);
  const startWorkout = useStartWorkout();

  // Черновик загружаем, когда в сторе не этот шаблон. Повторный ответ запроса
  // (фокус, инвалидация) его не затирает: id уже совпадает. На закрытии экрана
  // стор сбрасываем, чтобы следующее открытие не подхватило брошенные правки.
  const ready = !params.id || draft.workoutId === params.id;
  useEffect(() => {
    if (params.id && workout.data && workoutDraftStore.getState().workoutId !== params.id) {
      workoutDraftStore.getState().loadFrom(workout.data);
    }
  }, [params.id, workout.data]);
  useEffect(() => () => workoutDraftStore.getState().startNew(), []);

  const isEdit = draft.workoutId != null;
  const hasInvalid = draft.items.some((item) => invalidFields(item).length > 0);
  // У события список может стать пустым: значит, тренировка без упражнений
  const canSave = forEvent
    ? !hasInvalid
    : draft.name.trim().length > 0 && draft.items.length > 0 && !hasInvalid;
  const saving = createWorkout.isPending || replaceWorkout.isPending;

  const close = () => {
    if (!draft.dirty) {
      router.back();
      return;
    }
    confirmAction({
      title: t('workouts.discardTitle'),
      message: t('workouts.discardMessage'),
      confirmLabel: t('workouts.discard'),
      cancelLabel: t('common.cancel'),
      destructive: true,
      onConfirm: () => router.back(),
    });
  };

  const save = () => {
    setError(null);
    if (forEvent) {
      eventPlanStore.getState().setItems(draft.items);
      router.back();
      return;
    }
    const payload = draftToPayload(draft);
    const handlers = {
      onSuccess: (saved: Parameters<typeof draft.loadFrom>[0]) => {
        workoutDraftStore.getState().loadFrom(saved);
        toast(t('common.saved'));
      },
      onError: (e: unknown) => setError(e instanceof ApiError ? e.detail : t('common.noConnection')),
    };
    if (isEdit) replaceWorkout.mutate(payload, handlers);
    else createWorkout.mutate(payload, handlers);
  };

  const schedule = () => {
    if (!draft.workoutId) return;
    router.push({
      pathname: '/event-create',
      params: {
        date: todayISO(),
        workoutId: draft.workoutId,
        ...(workout.data ? { duration: String(workout.data.est_duration_min) } : {}),
      },
    });
  };

  const remove = () => {
    const id = draft.workoutId;
    if (!id) return;
    confirmAction({
      title: t('workouts.deleteTitle'),
      message: t('workouts.deleteMessage'),
      confirmLabel: t('workouts.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
      onConfirm: () =>
        deleteWorkout.mutate(id, {
          onSuccess: () => {
            toast(t('workouts.deleted'));
            router.back();
          },
          onError: (e) => toast(e instanceof ApiError ? e.detail : t('common.noConnection')),
        }),
    });
  };

  if (!ready) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={styles.centered}>
          {workout.isError ? (
            <>
              <Text style={styles.error}>{t('workouts.loadFailed')}</Text>
              <Pressable accessibilityRole="button" onPress={() => router.back()}>
                <Text style={styles.link}>{t('common.cancel')}</Text>
              </Pressable>
            </>
          ) : (
            <ActivityIndicator color={th.textMuted} />
          )}
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <ScreenTitle>
              {t(forEvent ? 'workouts.eventPlanTitle' : isEdit ? 'workouts.editTitle' : 'workouts.newTitle')}
            </ScreenTitle>
            <Pressable
              onPress={close}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
              style={styles.close}
            >
              <CloseIcon color={th.textMuted} />
            </Pressable>
          </View>

          {!forEvent ? (
            <Field
              label={t('workouts.nameLabel')}
              value={draft.name}
              onChangeText={draft.setName}
              placeholder={t('workouts.namePlaceholder')}
              maxLength={100}
            />
          ) : null}

          <View style={styles.section}>
            <MicroLabel>{t('workouts.exercisesLabel', { count: draft.items.length, max: MAX_ITEMS })}</MicroLabel>
            {draft.items.length === 0 ? (
              <Text style={styles.hint}>{t('workouts.noExercises')}</Text>
            ) : (
              draft.items.map((item, i) => (
                <ItemCard key={item.key} item={item} index={i} count={draft.items.length} />
              ))
            )}
            <OutlineButton
              title={t('workouts.addExercises')}
              icon={<PlusIcon color={th.text} size={18} />}
              onPress={() => router.push('/exercise-picker')}
              disabled={draft.items.length >= MAX_ITEMS}
            />
          </View>

          {!forEvent ? (
            <Field
              label={t('workouts.notesLabel')}
              value={draft.notes}
              onChangeText={draft.setNotes}
              placeholder={t('workouts.notesPlaceholder')}
              multiline
              maxLength={2000}
              style={styles.notes}
            />
          ) : null}

          {isEdit ? (
            <Button
              title={t('workoutRun.startNow')}
              onPress={() => draft.workoutId && startWorkout.run({ workout_id: draft.workoutId, date: todayISO() })}
              disabled={draft.dirty}
              loading={startWorkout.isPending}
            />
          ) : null}
          {isEdit ? (
            <View style={styles.row}>
              <OutlineButton
                title={t('workouts.schedule')}
                icon={<CalendarIcon color={th.text} size={18} />}
                onPress={schedule}
                disabled={draft.dirty}
              />
              <OutlineButton
                title={t('workouts.delete')}
                icon={<TrashIcon color={th.risk} size={18} />}
                tone="risk"
                onPress={remove}
              />
            </View>
          ) : null}
          {isEdit && draft.dirty ? <Text style={styles.hint}>{t('workouts.saveFirst')}</Text> : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>
        <View style={styles.footer}>
          {forEvent ? (
            <Button title={t('workouts.done')} onPress={save} disabled={!canSave} />
          ) : (
            <Button title={t('common.save')} onPress={save} disabled={!canSave || !draft.dirty} loading={saving} />
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.m },
  content: { padding: spacing.screen, gap: spacing.l, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  close: { padding: spacing.xs },
  section: { gap: spacing.m },
  row: { flexDirection: 'row', gap: spacing.m },
  hint: { fontFamily: th.font.regular, fontSize: 13, color: th.textMuted },
  error: { fontFamily: th.font.medium, fontSize: 13, color: th.risk },
  link: { fontFamily: th.font.semibold, fontSize: 13, color: th.brandOn },
  notes: { minHeight: 88, textAlignVertical: 'top', paddingTop: spacing.m },
  footer: { padding: spacing.screen },

  card: {
    backgroundColor: th.surface,
    borderWidth: 1,
    borderColor: th.border,
    borderRadius: th.radius.card,
    padding: spacing.l,
    gap: spacing.m,
  },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.m },
  itemTitle: { flex: 1, gap: 2 },
  itemName: { fontFamily: th.font.semibold, fontSize: 15, color: th.text },
  itemMeta: { fontFamily: th.font.regular, fontSize: 12, color: th.textMuted },

  numRow: { flexDirection: 'row', gap: spacing.s },

  itemActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: th.radius.chip,
    borderWidth: 1,
    borderColor: th.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { opacity: 0.3 },
  up: { transform: [{ rotate: '-90deg' }] },
  down: { transform: [{ rotate: '90deg' }] },
});
