// Карточка упражнения: анимация, мышцы, техника по шагам, мои прошлые результаты
// (docs/plan-workout-builder.md). Справочник открыт всем, история только под
// флагом конструктора: без флага её эндпоинт отдаёт 404.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  equipmentLabel,
  exerciseName,
  exerciseSteps,
  formatDuration,
  formatWeight,
  muscleLabel,
} from '@/api/exercises';
import { useExercise, useExerciseHistory, useFeatures } from '@/api/hooks';
import type { ExerciseHistory } from '@/api/types';
import { ExerciseThumb } from '@/components/ExerciseThumb';
import { CloseIcon } from '@/components/Icons';
import { Screen } from '@/components/Screen';
import { MicroLabel, ScreenTitle } from '@/components/Typography';
import { spacing, type Theme, useStyles, useTheme } from '@/theme';

const MAX_MEDIA = 360;

function HistoryRow({ entry }: { entry: ExerciseHistory }) {
  const styles = useStyles(makeStyles);
  const { t, i18n } = useTranslation();
  const date = new Date(`${entry.date}T12:00:00`).toLocaleDateString(i18n.language, {
    day: 'numeric',
    month: 'short',
  });
  const done = entry.sets.filter((s) => s.done);
  const sets = done
    .map((s) =>
      entry.mode === 'time'
        ? formatDuration(s.duration_sec ?? 0, t)
        : s.weight_kg != null && s.weight_kg > 0
          ? `${s.reps ?? 0} × ${t('workouts.kg', { n: formatWeight(s.weight_kg) })}`
          : String(s.reps ?? 0),
    )
    .join(', ');
  return (
    <View style={styles.historyRow}>
      <View style={styles.historyHead}>
        <Text style={styles.historyDate}>{date}</Text>
        <Text style={styles.historyName} numberOfLines={1}>
          {entry.workout_name}
        </Text>
      </View>
      <Text style={styles.historySets}>{sets || t('exercise.noSetsDone')}</Text>
    </View>
  );
}

export default function ExerciseCard() {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();

  const exercise = useExercise(id);
  const features = useFeatures();
  const history = useExerciseHistory(id, features.data?.workouts === true);

  const mediaSize = Math.min(width - spacing.screen * 2, MAX_MEDIA);
  const ex = exercise.data;

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerMain}>
            {ex ? <ScreenTitle>{exerciseName(ex, i18n.language)}</ScreenTitle> : null}
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

        {exercise.isPending ? (
          <ActivityIndicator color={th.textMuted} />
        ) : exercise.isError || !ex ? (
          <View style={styles.section}>
            <Text style={styles.error}>{t('exercise.loadFailed')}</Text>
            <Pressable accessibilityRole="button" onPress={() => void exercise.refetch()}>
              <Text style={styles.link}>{t('common.retry')}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {ex.has_gif || ex.has_image ? (
              <View style={styles.media}>
                <ExerciseThumb exercise={ex} size={mediaSize} animated={ex.has_gif} />
                <Text style={styles.credit}>{ex.attribution ?? t('exercise.mediaCredit')}</Text>
              </View>
            ) : null}

            <View style={styles.facts}>
              <Fact label={t('exercise.targetLabel')} value={muscleLabel(ex.target, t)} />
              <Fact label={t('exercise.bodyPartLabel')} value={t(`exercise.bodyPart.${ex.body_part}`)} />
              <Fact label={t('exercise.equipmentLabel')} value={equipmentLabel(ex.equipment, t)} />
            </View>

            {ex.secondary_muscles.length > 0 ? (
              <View style={styles.section}>
                <MicroLabel>{t('exercise.secondaryLabel')}</MicroLabel>
                <Text style={styles.body}>
                  {ex.secondary_muscles.map((m) => muscleLabel(m, t)).join(', ')}
                </Text>
              </View>
            ) : null}

            {exerciseSteps(ex, i18n.language).length > 0 ? (
              <View style={styles.section}>
                <MicroLabel>{t('exercise.stepsLabel')}</MicroLabel>
                <View style={styles.card}>
                  {exerciseSteps(ex, i18n.language).map((step, i) => (
                    <View key={i} style={styles.step}>
                      <Text style={styles.stepNum}>{i + 1}</Text>
                      <Text style={[styles.body, styles.stepText]}>{step}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {features.data?.workouts ? (
              <View style={styles.section}>
                <MicroLabel>{t('exercise.historyLabel')}</MicroLabel>
                <View style={styles.card}>
                  {history.isPending ? (
                    <ActivityIndicator color={th.textMuted} />
                  ) : history.isError ? (
                    <Text style={styles.error}>{t('exercise.loadFailed')}</Text>
                  ) : (history.data?.length ?? 0) === 0 ? (
                    <Text style={styles.hint}>{t('exercise.noHistory')}</Text>
                  ) : (
                    history.data?.map((entry) => <HistoryRow key={entry.session_id} entry={entry} />)
                  )}
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.fact}>
      <MicroLabel>{label}</MicroLabel>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  content: { padding: spacing.screen, gap: spacing.xl, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerMain: { flex: 1, paddingRight: spacing.m },
  close: { padding: spacing.xs },
  media: { alignItems: 'center', gap: spacing.s },
  credit: { fontFamily: th.font.regular, fontSize: 11, color: th.textMuted, textAlign: 'center' },
  facts: { flexDirection: 'row', gap: spacing.s },
  fact: {
    flex: 1,
    gap: spacing.xs,
    padding: spacing.m,
    backgroundColor: th.surface,
    borderWidth: 1,
    borderColor: th.border,
    borderRadius: th.radius.control,
  },
  factValue: { fontFamily: th.font.semibold, fontSize: 14, color: th.text },
  section: { gap: spacing.s },
  card: {
    backgroundColor: th.surface,
    borderWidth: 1,
    borderColor: th.border,
    borderRadius: th.radius.card,
    padding: spacing.l,
    gap: spacing.m,
  },
  body: { fontFamily: th.font.regular, fontSize: 14, lineHeight: 20, color: th.text },
  step: { flexDirection: 'row', gap: spacing.m },
  stepNum: { fontFamily: th.font.bold, fontSize: 14, color: th.brandOn, minWidth: 18 },
  stepText: { flex: 1 },
  hint: { fontFamily: th.font.regular, fontSize: 13, color: th.textMuted },
  error: { fontFamily: th.font.medium, fontSize: 13, color: th.risk },
  link: { fontFamily: th.font.semibold, fontSize: 13, color: th.brandOn },
  historyRow: { gap: 2 },
  historyHead: { flexDirection: 'row', gap: spacing.s, alignItems: 'baseline' },
  historyDate: { fontFamily: th.font.semibold, fontSize: 13, color: th.text },
  historyName: { flex: 1, fontFamily: th.font.regular, fontSize: 12, color: th.textMuted },
  historySets: { fontFamily: th.font.medium, fontSize: 14, color: th.text, fontVariant: ['tabular-nums'] },
});
