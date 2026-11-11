// Выполнение тренировки (docs/plan-workout-builder.md): упражнение за упражнением,
// подходы чек-листом с фактом, «прошлый раз», таймер отдыха после отметки подхода.
// Подходы уходят на сервер с дебаунсом: закрыл экран, открыл снова, всё на месте.
// Сохранения идут строго по очереди: следующее ждёт ответа на предыдущее, иначе
// на медленной сети ответы перемешиваются, а сервер получает параллельные PUT.
// «Завершить» дожимает несохранённое, закрывает сессию и ведёт в RPE с фактом.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
import { exerciseName, formatDuration, formatWeight, targetLabel } from '@/api/exercises';
import { invalidSetFields } from '@/api/workoutDraft';
import {
  useDiscardSession,
  useExercise,
  useFinishSession,
  useMe,
  useSaveSessionSets,
  useWorkoutSession,
} from '@/api/hooks';
import type { ExerciseShort, LastResult, SessionSet } from '@/api/types';
import { Button } from '@/components/Button';
import { confirmAction } from '@/components/confirm';
import { ExerciseThumb } from '@/components/ExerciseThumb';
import { CheckIcon, ChevronIcon, CloseIcon, PlusIcon, TrashIcon } from '@/components/Icons';
import { NumField } from '@/components/NumField';
import { OutlineButton } from '@/components/OutlineButton';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { MicroLabel, ScreenTitle } from '@/components/Typography';
import { spacing, type Theme, useStyles, useTheme } from '@/theme';

const SAVE_DEBOUNCE_MS = 800;
const MAX_SETS_PER_EXERCISE = 20; // столько же принимает бэкенд (SessionSetIn.set_index)

/** Черновик с полем вне границ: не отправляем, подсвечиваем поле. */
class InvalidSets extends Error {}

const nowMs = () => Date.now();

const clock = (totalSec: number) => {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

function LastTime({ result }: { result: LastResult | undefined }) {
  const styles = useStyles(makeStyles);
  const { t, i18n } = useTranslation();
  if (!result || result.sets.length === 0) return null;
  const date = new Date(`${result.date}T12:00:00`).toLocaleDateString(i18n.language, {
    day: 'numeric',
    month: 'short',
  });
  const sets = result.sets
    .map((s) =>
      s.duration_sec != null
        ? formatDuration(s.duration_sec, t)
        : s.weight_kg != null && s.weight_kg > 0
          ? `${s.reps ?? 0} × ${t('workouts.kg', { n: formatWeight(s.weight_kg) })}`
          : String(s.reps ?? 0),
    )
    .join(', ');
  return (
    <Text style={styles.lastTime}>
      {t('workoutRun.lastTime', { date })}: {sets}
    </Text>
  );
}

/** Картинка текущего упражнения: GIF, если он есть (карточку берём из кэша справочника). */
function CurrentMedia({ exercise }: { exercise: ExerciseShort }) {
  const full = useExercise(exercise.id);
  return <ExerciseThumb exercise={full.data ?? exercise} size={120} animated={full.data?.has_gif === true} />;
}

export default function WorkoutRun() {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const toast = useToast((s) => s.show);
  // athleteName: штаб открывает выполнение игрока из результатов командной тренировки
  const { id, athleteName } = useLocalSearchParams<{ id: string; athleteName?: string }>();
  const me = useMe();

  const session = useWorkoutSession(id);
  const save = useSaveSessionSets(id);
  const finish = useFinishSession(id);
  const discard = useDiscardSession();

  // Черновик подходов: берём с сервера один раз, дальше он главный (сервер его догоняет)
  // (привязан к id: роутер может отдать экрану другую сессию без перемонтирования).
  // Только из свежего ответа: кэш от прошлого открытия мог не дождаться последнего сохранения.
  const [draft, setDraft] = useState<{ id: string; sets: SessionSet[] } | null>(null);
  const fresh = session.data && session.data.id === id && session.isFetchedAfterMount && !session.isFetching;
  if (fresh && draft?.id !== id) setDraft({ id, sets: session.data!.sets });
  const sets = draft?.id === id ? draft.sets : null;
  const setSets = (next: SessionSet[]) => setDraft({ id, sets: next });

  const [current, setCurrent] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [restUntil, setRestUntil] = useState<number | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [closing, setClosing] = useState(false);

  // Версия черновика и последняя сохранённая: живут в ref, их читают только обработчики
  const setsRef = useRef<SessionSet[] | null>(null);
  const version = useRef(0);
  const savedVersion = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  /** Ставит сохранение текущего черновика в очередь за предыдущим. Невалидный
   *  черновик не отправляем: сервер отклонил бы весь список (422). */
  const saveNow = () => {
    const next = queue.current
      .catch(() => undefined)
      .then(async () => {
        const target = version.current;
        const snapshot = setsRef.current;
        if (!snapshot || target <= savedVersion.current) return;
        if (snapshot.some((x) => invalidSetFields(x).length > 0)) throw new InvalidSets();
        await save.mutateAsync(snapshot);
        savedVersion.current = Math.max(savedVersion.current, target);
        setSaveFailed(false);
      });
    queue.current = next;
    return next;
  };
  const saveNowRef = useRef(saveNow);
  useEffect(() => {
    saveNowRef.current = saveNow;
  });

  // Ушли с экрана жестом или навигацией, не дождавшись дебаунса: дожимаем
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        void saveNowRef.current().catch(() => undefined);
      }
    },
    [],
  );

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const flush = async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    await saveNow();
  };

  if (session.isPending || (session.data && sets === null)) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator color={th.textMuted} />
        </View>
      </Screen>
    );
  }

  if (session.isError || !session.data || !sets) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <Text style={styles.error}>{t('workoutRun.loadFailed')}</Text>
          <Pressable accessibilityRole="button" onPress={() => void session.refetch()}>
            <Text style={styles.link}>{t('common.retry')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.back()}>
            <Text style={styles.link}>{t('common.back')}</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const data = session.data;
  // Чужое выполнение (штаб смотрит результат игрока) только читаем
  const isOwner = me.data?.id === data.athlete_id;
  const readOnly = data.finished_at != null || !isOwner;
  const exerciseById = new Map(data.exercises.map((e) => [e.id, e]));
  const lastById = new Map(data.last_results.map((r) => [r.exercise_id, r]));
  const positions = [...new Set(sets.map((s) => s.position))].sort((a, b) => a - b);

  // По умолчанию открываем первое упражнение, где остались неотмеченные подходы
  const firstOpen = positions.findIndex((p) => sets.some((s) => s.position === p && !s.done));
  const index = Math.min(current ?? Math.max(firstOpen, 0), positions.length - 1);
  const position = positions[index];
  const posSets = sets
    .filter((s) => s.position === position)
    .sort((a, b) => a.set_index - b.set_index);
  const exercise = posSets[0] ? exerciseById.get(posSets[0].exercise_id) : undefined;
  const mode = posSets[0]?.mode ?? 'reps';
  const restSec = data.rest_sec_by_position[String(position)] ?? 0;

  const doneCount = sets.filter((s) => s.done).length;
  const elapsedSec = ((data.finished_at ? Date.parse(data.finished_at) : now) - Date.parse(data.started_at)) / 1000;
  const restLeft = restUntil != null ? (restUntil - now) / 1000 : 0;
  const resting = restUntil != null && restLeft > 0;

  const invalidCount = sets.filter((x) => invalidSetFields(x).length > 0).length;

  // Дебаунс сохранения: каждое изменение откладывает отправку
  const change = (next: SessionSet[]) => {
    setSets(next);
    setsRef.current = next;
    version.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      saveNow().catch((e) => setSaveFailed(!(e instanceof InvalidSets)));
    }, SAVE_DEBOUNCE_MS);
  };

  const patchSet = (s: SessionSet, patch: Partial<SessionSet>) =>
    change(
      sets.map((x) => (x.position === s.position && x.set_index === s.set_index ? { ...x, ...patch } : x)),
    );

  const toggleDone = (s: SessionSet) => {
    const done = !s.done;
    patchSet(s, { done });
    // Отдых после отмеченного подхода, кроме самого последнего во всей тренировке
    const remaining = sets.filter((x) => !x.done && !(x.position === s.position && x.set_index === s.set_index));
    if (done && restSec > 0 && remaining.length > 0) setRestUntil(nowMs() + restSec * 1000);
    if (!done) setRestUntil(null);
  };

  const addSet = () => {
    const last = posSets[posSets.length - 1];
    if (!last || last.set_index + 1 >= MAX_SETS_PER_EXERCISE) return;
    change([
      ...sets,
      {
        ...last,
        set_index: last.set_index + 1,
        planned_reps: null,
        planned_weight_kg: null,
        planned_duration_sec: null,
        done: false,
      },
    ]);
  };

  const go = (delta: -1 | 1) => setCurrent(Math.min(Math.max(index + delta, 0), positions.length - 1));

  const doFinish = async () => {
    if (invalidCount > 0) {
      toast(t('workoutRun.fixFields'));
      return;
    }
    setFinishing(true);
    try {
      await flush();
      const result = await finish.mutateAsync();
      router.replace({
        pathname: '/rpe',
        params: { eventId: result.event_id ?? '', duration: String(result.elapsed_min) },
      });
    } catch (e) {
      toast(e instanceof ApiError ? e.detail : t('common.noConnection'));
      setFinishing(false);
    }
  };

  const confirmFinish = () =>
    confirmAction({
      title: t('workoutRun.finishTitle'),
      message:
        doneCount < sets.length
          ? t('workoutRun.finishNotAll', { done: doneCount, total: sets.length })
          : t('workoutRun.finishMessage'),
      confirmLabel: t('workoutRun.finish'),
      cancelLabel: t('common.cancel'),
      onConfirm: () => void doFinish(),
    });

  const confirmDiscard = () =>
    confirmAction({
      title: t('workoutRun.discardTitle'),
      message: t('workoutRun.discardMessage'),
      confirmLabel: t('workoutRun.discard'),
      cancelLabel: t('common.cancel'),
      destructive: true,
      onConfirm: () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        discard.mutate(id, {
          onSuccess: () => router.back(),
          onError: (e) => toast(e instanceof ApiError ? e.detail : t('common.noConnection')),
        });
      },
    });

  // Закрыть = свернуть: тренировка остаётся активной, продолжить можно из списка или события
  // Ждём сохранение, чтобы при повторном открытии не собрать черновик без последней
  // правки. Не сохранилось (нет сети, неверное поле): всё равно закрываем, как и раньше.
  const close = () => {
    setClosing(true);
    void flush()
      .catch(() => undefined)
      .finally(() => router.back());
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.headerMain}>
              <Text style={styles.overline}>
                {data.finished_at != null ? t('workoutRun.finished') : t('workoutRun.inProgress')} · {clock(elapsedSec)}
              </Text>
              <ScreenTitle>{data.workout_name}</ScreenTitle>
              {!isOwner && athleteName ? <Text style={styles.hint}>{athleteName}</Text> : null}
            </View>
            <Pressable
              onPress={close}
              disabled={closing}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('workoutRun.minimize')}
              style={styles.close}
            >
              <CloseIcon color={th.textMuted} />
            </Pressable>
          </View>

          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, { width: `${sets.length ? (doneCount / sets.length) * 100 : 0}%` }]}
            />
          </View>
          <Text style={styles.hint}>
            {t('workoutRun.progress', { done: doneCount, total: sets.length })}
            {saveFailed && invalidCount === 0 ? ` · ${t('workoutRun.notSaved')}` : ''}
          </Text>
          {invalidCount > 0 ? <Text style={styles.error}>{t('workoutRun.fixFields')}</Text> : null}
          {isOwner && data.is_team_event ? <Text style={styles.hint}>{t('workoutRun.staffSees')}</Text> : null}

          {resting && !readOnly ? (
            <View style={styles.rest}>
              <View>
                <MicroLabel>{t('workoutRun.rest')}</MicroLabel>
                <Text style={styles.restClock}>{clock(restLeft)}</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={() => setRestUntil(null)} hitSlop={8}>
                <Text style={styles.link}>{t('workoutRun.skipRest')}</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.nav}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('workoutRun.prev')}
              disabled={index === 0}
              onPress={() => go(-1)}
              style={[styles.navButton, index === 0 && styles.dim]}
            >
              <View style={styles.flip}>
                <ChevronIcon color={th.text} />
              </View>
            </Pressable>
            <Text style={styles.navText}>
              {t('workoutRun.exerciseOf', { n: index + 1, total: positions.length })}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('workoutRun.next')}
              disabled={index === positions.length - 1}
              onPress={() => go(1)}
              style={[styles.navButton, index === positions.length - 1 && styles.dim]}
            >
              <ChevronIcon color={th.text} />
            </Pressable>
          </View>

          {exercise ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('exercise.details')}
              onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: exercise.id } })}
              style={styles.exercise}
            >
              <CurrentMedia exercise={exercise} />
              <View style={styles.exerciseText}>
                <Text style={styles.exerciseName}>{exerciseName(exercise, i18n.language)}</Text>
                <Text style={styles.hint}>
                  {targetLabel(exercise.target, t)}
                  {restSec > 0 ? ` · ${t('workoutRun.restBetween', { time: formatDuration(restSec, t) })}` : ''}
                </Text>
                <LastTime result={lastById.get(exercise.id)} />
              </View>
            </Pressable>
          ) : null}

          <View style={styles.card}>
            <View style={styles.setHead}>
              <Text style={[styles.colLabel, styles.colIndex]}>#</Text>
              {mode === 'reps' ? (
                <>
                  <Text style={styles.colLabel}>{t('workouts.reps')}</Text>
                  <Text style={styles.colLabel}>{t('workouts.weight')}</Text>
                </>
              ) : (
                <Text style={styles.colLabel}>{t('workouts.durationSec')}</Text>
              )}
              <View style={styles.colCheck} />
            </View>
            {posSets.map((s) => (
              <View key={`${s.position}-${s.set_index}`} style={styles.setRow}>
                <Text style={[styles.setIndex, styles.colIndex]}>{s.set_index + 1}</Text>
                {mode === 'reps' ? (
                  <>
                    <NumField
                      value={s.reps}
                      onChange={(reps) => patchSet(s, { reps })}
                      invalid={invalidSetFields(s).includes('reps')}
                      editable={!readOnly}
                    />
                    <NumField
                      value={s.weight_kg}
                      onChange={(weight_kg) => patchSet(s, { weight_kg })}
                      invalid={invalidSetFields(s).includes('weight_kg')}
                      decimal
                      editable={!readOnly}
                    />
                  </>
                ) : (
                  <NumField
                    value={s.duration_sec}
                    onChange={(duration_sec) => patchSet(s, { duration_sec })}
                    invalid={invalidSetFields(s).includes('duration_sec')}
                    editable={!readOnly}
                  />
                )}
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: s.done, disabled: readOnly }}
                  accessibilityLabel={t('workoutRun.setDone', { n: s.set_index + 1 })}
                  disabled={readOnly}
                  onPress={() => toggleDone(s)}
                  style={[styles.check, styles.colCheck, s.done && styles.checkOn]}
                  hitSlop={6}
                >
                  {s.done ? <CheckIcon color={th.onBrand} size={18} /> : null}
                </Pressable>
              </View>
            ))}
          </View>

          {!readOnly ? (
            <View style={styles.row}>
              <OutlineButton
                title={t('workoutRun.addSet')}
                icon={<PlusIcon color={th.text} size={18} />}
                onPress={addSet}
                disabled={(posSets[posSets.length - 1]?.set_index ?? 0) + 1 >= MAX_SETS_PER_EXERCISE}
              />
              {index < positions.length - 1 ? (
                <OutlineButton
                  title={posSets.every((s) => s.done) ? t('workoutRun.nextExercise') : t('workoutRun.skip')}
                  onPress={() => go(1)}
                />
              ) : null}
            </View>
          ) : null}

          {!readOnly ? (
            <Pressable accessibilityRole="button" onPress={confirmDiscard} style={styles.discard}>
              <TrashIcon color={th.risk} size={16} />
              <Text style={styles.discardText}>{t('workoutRun.discard')}</Text>
            </Pressable>
          ) : null}
        </ScrollView>
        {!readOnly ? (
          <View style={styles.footer}>
            <Button
              title={t('workoutRun.finish')}
              onPress={confirmFinish}
              loading={finishing}
              disabled={discard.isPending}
            />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.m },
  content: { padding: spacing.screen, gap: spacing.l, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerMain: { flex: 1, paddingRight: spacing.m },
  overline: {
    fontFamily: th.font.semibold,
    fontSize: 11,
    color: th.textMuted,
    letterSpacing: 1.4,
    marginBottom: 4,
    textTransform: 'uppercase',
    fontVariant: ['tabular-nums'],
  },
  close: { padding: spacing.xs },
  hint: { fontFamily: th.font.regular, fontSize: 13, color: th.textMuted },
  error: { fontFamily: th.font.medium, fontSize: 13, color: th.risk },
  link: { fontFamily: th.font.semibold, fontSize: 14, color: th.brandOn },
  row: { flexDirection: 'row', gap: spacing.m },

  progressTrack: { height: 6, borderRadius: 3, backgroundColor: th.surface2, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: th.brand },

  rest: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.l,
    borderRadius: th.radius.card,
    borderWidth: 1,
    borderColor: th.brandOn,
    backgroundColor: th.surface,
  },
  restClock: { fontFamily: th.font.bold, fontSize: 32, color: th.text, fontVariant: ['tabular-nums'] },

  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: th.radius.chip,
    borderWidth: 1,
    borderColor: th.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navText: { fontFamily: th.font.semibold, fontSize: 14, color: th.textMuted },
  flip: { transform: [{ rotate: '180deg' }] },
  dim: { opacity: 0.3 },

  exercise: { flexDirection: 'row', gap: spacing.l, alignItems: 'center' },
  exerciseText: { flex: 1, gap: spacing.xs },
  exerciseName: { fontFamily: th.font.semibold, fontSize: 18, color: th.text },
  lastTime: { fontFamily: th.font.medium, fontSize: 13, color: th.brandOn },

  card: {
    backgroundColor: th.surface,
    borderWidth: 1,
    borderColor: th.border,
    borderRadius: th.radius.card,
    padding: spacing.l,
    gap: spacing.s,
  },
  setHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  colLabel: {
    flex: 1,
    fontFamily: th.font.semibold,
    fontSize: 10,
    color: th.textMuted,
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  colIndex: { flex: 0, width: 24 },
  colCheck: { width: 44 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  setIndex: { fontFamily: th.font.semibold, fontSize: 15, color: th.textMuted, textAlign: 'center' },
  check: {
    height: 44,
    borderRadius: th.radius.chip,
    borderWidth: 1.5,
    borderColor: th.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: th.good, borderColor: th.good },

  discard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.s, padding: spacing.s },
  discardText: { fontFamily: th.font.medium, fontSize: 13, color: th.risk },
  footer: { padding: spacing.screen },
});
