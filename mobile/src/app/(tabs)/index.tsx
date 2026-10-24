// «Дом»: игроку — личная готовность (дизайн-ТЗ 5.2), тренеру/админу — Squad Status.
// Экраны игрока (опрос/RPE/история) для staff-ролей не показываются.

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import type { TFunction } from 'i18next';
import { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { ApiError } from '@/api/client';
import {
  todayISO,
  useMe,
  useMetrics,
  useMyProfile,
  useMyWeightGoal,
  useRpeHistory,
  useRpeSessions,
  useSetWeightGoal,
  useStreaks,
  useWellnessHistory,
} from '@/api/hooks';
import { sessionEndTime, sessionLabel } from '@/api/sessions';
import type { AthleteProfile, RpeEntry, RpeSession, WeightGoal, WellnessEntry } from '@/api/types';
import { ActionCard } from '@/components/ActionCard';
import { ActivityHeatmap } from '@/components/ActivityHeatmap';
import { Button } from '@/components/Button';
import { TeamBadge } from '@/components/TeamBadge';
import { CoachHome } from '@/components/CoachHome';
import { Guide } from '@/components/Guide';
import { BoltIcon, SunIcon } from '@/components/Icons';
import { ReadinessRing } from '@/components/ReadinessRing';
import { Screen } from '@/components/Screen';
import { StatTile } from '@/components/StatTile';
import { useToast } from '@/components/Toast';
import { WeightSparkline } from '@/components/WeightSparkline';
import {
  bmiZoneColor,
  loadZoneColor,
  readinessColor,
  spacing,
  type Theme,
  useStyles,
  useTheme,
} from '@/theme';

/** Подсказка карточки RPE: ждём конца тренировки / какую сессию оценить / сколько их. */
function rpeCardHint({
  locked,
  nextSession,
  pending,
  t,
  locale,
}: {
  locked: boolean;
  nextSession: RpeSession | undefined;
  pending: RpeSession[];
  t: TFunction;
  locale: string;
}): string {
  if (locked) {
    return nextSession
      ? t('home.rateLoadAfter', { time: sessionEndTime(nextSession, locale) })
      : t('home.rateLoadHint');
  }
  if (pending.length > 1) return t('home.rateLoadPending', { count: pending.length });
  if (pending.length === 1) return sessionLabel(pending[0], locale, t);
  return t('home.rateLoadHint');
}

/** Карточка «Вес» (docs/plan-weight-tracking.md) — под карточками опроса/RPE.
 * Пусто (ни одной отметки) — приглашение заполнить, не молчащая пустая карточка.
 * Цель (docs/plan-weight-tracking.md, «Дополнение: цель веса») — своя кнопка/
 * чип + модалка ввода, фичу читает сама (не тащим её в пропы PlayerHome). */
function goalChipText(t: TFunction, goal: WeightGoal): string {
  const n = goal.target_weight_kg;
  if (goal.target_weight_kg < goal.start_weight_kg) return t('weightGoal.lossChip', { n });
  if (goal.target_weight_kg > goal.start_weight_kg) return t('weightGoal.gainChip', { n });
  return t('weightGoal.sameChip', { n });
}

function WeightGoalModal({
  visible,
  onClose,
  value,
  onChangeValue,
}: {
  visible: boolean;
  onClose: () => void;
  value: string;
  onChangeValue: (v: string) => void;
}) {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const toast = useToast((s) => s.show);
  const setGoal = useSetWeightGoal();

  const save = () => {
    const n = Number(value);
    if (!value || Number.isNaN(n) || n < 30 || n > 250) {
      toast(t('weightGoal.invalid'));
      return;
    }
    setGoal.mutate(n, {
      onSuccess: () => {
        toast(t('common.saved'));
        onClose();
      },
      onError: (e) => toast(e instanceof ApiError ? e.detail : t('common.retry')),
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{t('weightGoal.modalTitle')}</Text>
          <Text style={styles.sheetHint}>{t('weightGoal.staffNotice')}</Text>
          <Text style={styles.weightTitle}>{t('weightGoal.targetLabel')}</Text>
          <TextInput
            style={styles.goalInput}
            value={value}
            onChangeText={(v) => onChangeValue(v.replace(/[^\d.]/g, '').replace(/^(\d*\.\d).*$/, '$1'))}
            keyboardType="decimal-pad"
            placeholder="—"
            placeholderTextColor={th.textMuted}
            autoFocus
          />
          <Button title={t('common.save')} onPress={save} loading={setGoal.isPending} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function WeightCard({
  profile,
  history,
}: {
  profile: AthleteProfile | undefined;
  history: WellnessEntry[];
}) {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const weightPoints = history.filter((w) => w.weight_kg !== null).length;
  const bmi = profile?.bmi ?? null;
  const goal = useMyWeightGoal();
  const [modalOpen, setModalOpen] = useState(false);
  const [draftTarget, setDraftTarget] = useState('');

  // Значение поля выставляем в момент открытия (клик), не в эффекте по
  // изменению visible — тот же приём, что у шторки severity в BodyMap.
  const openGoalModal = () => {
    setDraftTarget(goal.data ? String(goal.data.target_weight_kg) : '');
    setModalOpen(true);
  };

  if (weightPoints === 0) {
    return (
      <View style={styles.weightCard}>
        <Text style={styles.weightTitle}>{t('home.weightTitle')}</Text>
        <View style={styles.weightEmpty}>
          <Text style={styles.weightEmptyText}>{t('home.weightEmptyNudge')}</Text>
        </View>
      </View>
    );
  }

  const color = bmiZoneColor(profile?.bmi_zone);
  return (
    <View style={styles.weightCard}>
      <View style={styles.weightHead}>
        <View>
          <Text style={styles.weightTitle}>{t('home.weightTitle')}</Text>
          <View style={styles.weightNow}>
            <Text style={[styles.weightValue, { color }]}>{profile?.weight_kg ?? '—'}</Text>
            <Text style={styles.weightUnit}>кг</Text>
          </View>
        </View>
        <View style={styles.weightHeadRight}>
          {bmi != null && (
            <Text style={[styles.bmiPill, { backgroundColor: `${color}24`, color }]}>
              {t('athleteReport.weight.bmi')} {bmi.toFixed(1)} · {t(`bmi.zone.${profile!.bmi_zone}`)}
            </Text>
          )}
          <Pressable onPress={openGoalModal} accessibilityRole="button">
            {goal.data ? (
              <Text style={styles.goalChip}>{goalChipText(t, goal.data)}</Text>
            ) : (
              <Text style={styles.goalSetButton}>{t('weightGoal.setButton')}</Text>
            )}
          </Pressable>
        </View>
      </View>
      {weightPoints >= 2 ? (
        <WeightSparkline
          entries={history}
          color={color}
          start={goal.data?.start_weight_kg}
          target={goal.data?.target_weight_kg}
        />
      ) : (
        <Text style={styles.weightEmptyText}>{t('home.weightNeedMore')}</Text>
      )}
      {bmi != null && profile!.bmi_zone !== 'normal' && (
        <Text style={styles.weightNote}>{t(`bmi.note.${profile!.bmi_zone}`)}</Text>
      )}
      <WeightGoalModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        value={draftTarget}
        onChangeValue={setDraftTarget}
      />
    </View>
  );
}

/** Карта активности (docs/plan-activity-heatmap.md) — тап по клетке даёт тост
 * с датой и фактами, без шторки/модалки: та же простота, что у остальных
 * мелких подсказок на этом экране. */
function ActivityCard({ wellness, rpe }: { wellness: WellnessEntry[]; rpe: RpeEntry[] }) {
  const styles = useStyles(makeStyles);
  const { t, i18n } = useTranslation();
  const toast = useToast((s) => s.show);
  const wellnessDates = new Set(wellness.map((w) => w.date));
  const rpeDates = new Set(rpe.map((r) => r.date));

  const onCellPress = (date: string, hasSurvey: boolean, hasRpe: boolean) => {
    const label = new Date(date).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });
    const fact = hasSurvey && hasRpe
      ? t('activity.cellBoth')
      : hasSurvey
        ? t('activity.cellSurvey')
        : hasRpe
          ? t('activity.cellRpe')
          : t('activity.cellNone');
    toast(`${label}: ${fact}`);
  };

  return (
    <View style={styles.weightCard}>
      <Text style={styles.weightTitle}>{t('home.activityTitle')}</Text>
      <Text style={styles.activitySubtitle}>{t('home.activitySubtitle')}</Text>
      <View style={styles.activityGrid}>
        <ActivityHeatmap wellnessDates={wellnessDates} rpeDates={rpeDates} onCellPress={onCellPress} />
      </View>
    </View>
  );
}

export default function Home() {
  const me = useMe();
  // Пока роль неизвестна (первый запрос) — показываем игровой «Дом» как основной случай
  if (me.data && me.data.global_role !== 'player') return <CoachHome />;
  return <PlayerHome />;
}

function PlayerHome() {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const me = useMe();
  const metrics = useMetrics(28);
  const streaks = useStreaks();
  const wellnessToday = useWellnessHistory(1);
  const rpeToday = useRpeHistory(1);
  // 90 дней (3 месяца) — под месячную разметку WeightSparkline, шире, чем
  // остальные карточки экрана: вес меняется медленно, короткое окно мало
  // покажет на графике.
  const weightHistory = useWellnessHistory(90);
  const profile = useMyProfile();
  // 365 дней — карта активности (docs/plan-activity-heatmap.md), отдельное
  // окно от всего остального на экране: это не тренд, а годовой обзор.
  const yearWellness = useWellnessHistory(365);
  const yearRpe = useRpeHistory(365);

  const today = todayISO();
  const sessions = useRpeSessions(today);

  const todayMetric = metrics.data?.find((m) => m.date === today);
  const surveyDone = (wellnessToday.data?.length ?? 0) > 0;

  // RPE привязан к сессии: карточка ждёт окончания тренировки, а «выполнено» —
  // когда оценены все прошедшие. Без расписания остаётся свободный ввод.
  const daySessions = sessions.data ?? [];
  const finished = daySessions.filter((s) => s.finished);
  const pending = finished.filter((s) => !s.rpe_submitted);
  const nextSession = daySessions.find((s) => !s.finished);
  const rpeLocked = daySessions.length > 0 && finished.length === 0;
  const rpeDone =
    daySessions.length > 0
      ? finished.length > 0 && pending.length === 0
      : (rpeToday.data?.length ?? 0) > 0;
  const wellnessStreak = streaks.data?.find((s) => s.type === 'wellness')?.count ?? 0;
  const loadZone = todayMetric?.load_zone ?? 'no_data';

  // Здороваемся по имени, а не по display-name «Фамилия Имя»
  const firstName = me.data?.first_name || undefined;
  const dateLabel = new Date()
    .toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })
    .toUpperCase();

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void qc.invalidateQueries().finally(() => setRefreshing(false));
  }, [qc]);

  const zoneColor = readinessColor(todayMetric?.readiness_zone);
  const rpeHint = rpeCardHint({ locked: rpeLocked, nextSession, pending, t, locale: i18n.language });

  return (
    <Screen glowColor={todayMetric?.readiness != null ? zoneColor : th.brand}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={th.textMuted} />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.date}>{dateLabel}</Text>
            <Text style={styles.greeting}>
              {firstName ? t('home.greeting', { name: firstName }) : t('home.greetingNoName')}
            </Text>
          </View>
          <TeamBadge />
        </View>

        <View style={styles.ringWrap}>
          <ReadinessRing
            value={todayMetric?.readiness ?? null}
            zone={todayMetric?.readiness_zone ?? null}
            label={t('home.readiness')}
          />
          {todayMetric?.readiness == null && (
            <Text style={styles.emptyHint}>{t('home.noReadiness')}</Text>
          )}
        </View>

        <View style={styles.tiles}>
          <StatTile
            label={t('home.todayLoad')}
            value={String(Math.round(todayMetric?.daily_load ?? 0))}
            accent={th.brandOn}
          />
          <StatTile
            label="ACWR"
            value={todayMetric?.acwr != null ? todayMetric.acwr.toFixed(2) : '—'}
            accent={loadZoneColor(loadZone)}
          />
          <StatTile
            label={t('home.streakLabel')}
            value={String(wellnessStreak)}
            accent={th.caution}
          />
        </View>

        <View style={styles.actions}>
          <ActionCard
            icon={<SunIcon color={surveyDone ? th.brandOn : th.onBrand} />}
            title={t('home.fillSurvey')}
            hint={t('home.fillSurveyHint')}
            primary={!surveyDone}
            done={surveyDone}
            doneLabel={t('home.surveyDone')}
            onPress={() => router.push('/wellness')}
          />
          <ActionCard
            icon={<BoltIcon color={th.brandOn} />}
            title={t('home.rateLoad')}
            hint={rpeHint}
            done={rpeDone}
            doneLabel={t('home.rpeDone')}
            disabled={rpeLocked}
            onPress={() => router.push('/rpe')}
          />
        </View>

        <WeightCard profile={profile.data} history={weightHistory.data ?? []} />
        <ActivityCard wellness={yearWellness.data ?? []} rpe={yearRpe.data ?? []} />
      </ScrollView>
      <Guide />
    </Screen>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  content: { padding: spacing.screen, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  date: {
    fontFamily: th.font.semibold,
    fontSize: 11,
    color: th.textMuted,
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  greeting: { fontFamily: th.font.bold, fontSize: 24, color: th.text, letterSpacing: -0.3 },
  ringWrap: { alignItems: 'center', marginVertical: spacing.xl },
  emptyHint: {
    fontFamily: th.font.regular,
    fontSize: 14,
    color: th.textMuted,
    textAlign: 'center',
    marginTop: spacing.m,
    maxWidth: 260,
  },
  tiles: { flexDirection: 'row', gap: spacing.s },
  actions: { gap: spacing.m, marginTop: spacing.xl },
  weightCard: {
    marginTop: spacing.m,
    padding: spacing.l,
    borderRadius: th.radius.card,
    backgroundColor: th.surface,
    borderWidth: 1,
    borderColor: th.border,
  },
  weightHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  weightTitle: {
    fontFamily: th.font.semibold,
    fontSize: 11,
    color: th.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  weightNow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  weightValue: { fontFamily: th.font.display, fontSize: 24, color: th.text },
  weightUnit: { fontFamily: th.font.regular, fontSize: 12, color: th.textMuted },
  bmiPill: {
    fontFamily: th.font.semibold,
    fontSize: 11.5,
    paddingHorizontal: spacing.s,
    paddingVertical: 4,
    borderRadius: th.radius.chip,
    overflow: 'hidden',
  },
  weightEmpty: {
    marginTop: spacing.s,
    paddingVertical: spacing.l,
    borderRadius: th.radius.control,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: th.border,
    alignItems: 'center',
  },
  weightEmptyText: {
    fontFamily: th.font.regular,
    fontSize: 12.5,
    color: th.textMuted,
    textAlign: 'center',
    maxWidth: 220,
  },
  weightNote: {
    fontFamily: th.font.regular,
    fontSize: 11.5,
    color: th.textMuted,
    marginTop: spacing.s,
    lineHeight: 16,
  },
  weightHeadRight: { alignItems: 'flex-end', gap: spacing.xs },
  goalSetButton: {
    fontFamily: th.font.semibold,
    fontSize: 11,
    color: th.brand,
    paddingHorizontal: spacing.s,
    paddingVertical: 4,
  },
  goalChip: {
    fontFamily: th.font.medium,
    fontSize: 11,
    color: th.brand,
    paddingHorizontal: spacing.s,
    paddingVertical: 3,
    borderRadius: th.radius.chip,
    borderWidth: 1,
    borderColor: th.brand,
  },
  backdrop: { flex: 1, backgroundColor: '#0009' },
  sheet: {
    backgroundColor: th.surface,
    borderWidth: 1,
    borderColor: th.border,
    borderTopLeftRadius: th.radius.card,
    borderTopRightRadius: th.radius.card,
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.l,
    paddingBottom: spacing.xl,
    gap: spacing.m,
  },
  sheetTitle: { fontFamily: th.font.display, fontSize: 17, color: th.text },
  sheetHint: { fontFamily: th.font.regular, fontSize: 12.5, color: th.textMuted, marginTop: -spacing.s },
  goalInput: {
    backgroundColor: th.surface2,
    borderWidth: 1,
    borderColor: th.border,
    borderRadius: th.radius.control,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    fontFamily: th.font.regular,
    fontSize: 17,
    color: th.text,
  },
  activitySubtitle: { fontFamily: th.font.regular, fontSize: 12, color: th.textMuted },
  activityGrid: { marginTop: spacing.s },
});
