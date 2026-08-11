// «Дом»: игроку — личная готовность (дизайн-ТЗ 5.2), тренеру/админу — Squad Status.
// Экраны игрока (опрос/RPE/история) для staff-ролей не показываются.

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import type { TFunction } from 'i18next';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  todayISO,
  useMe,
  useMetrics,
  useMyTeams,
  useRpeHistory,
  useRpeSessions,
  useStreaks,
  useWellnessHistory,
} from '@/api/hooks';
import { sessionEndTime, sessionLabel } from '@/api/sessions';
import type { RpeSession } from '@/api/types';
import { ActionCard } from '@/components/ActionCard';
import { Chip } from '@/components/Chip';
import { CoachHome } from '@/components/CoachHome';
import { Guide } from '@/components/Guide';
import { BoltIcon, SunIcon } from '@/components/Icons';
import { ReadinessRing } from '@/components/ReadinessRing';
import { Screen } from '@/components/Screen';
import { StatTile } from '@/components/StatTile';
import { colors, font, loadZoneColor, readinessColor, spacing } from '@/theme';

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

export default function Home() {
  const me = useMe();
  // Пока роль неизвестна (первый запрос) — показываем игровой «Дом» как основной случай
  if (me.data && me.data.global_role !== 'player') return <CoachHome />;
  return <PlayerHome />;
}

function PlayerHome() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const me = useMe();
  const teams = useMyTeams();
  const metrics = useMetrics(28);
  const streaks = useStreaks();
  const wellnessToday = useWellnessHistory(1);
  const rpeToday = useRpeHistory(1);

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
  const teamName = teams.data?.[0]?.name;

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
    <Screen glowColor={todayMetric?.readiness != null ? zoneColor : colors.brand}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.date}>{dateLabel}</Text>
            <Text style={styles.greeting}>
              {firstName ? t('home.greeting', { name: firstName }) : t('home.greetingNoName')}
            </Text>
          </View>
          <Chip
            label={teamName ?? t('home.personalMode')}
            dotColor={teamName ? colors.brand : colors.low}
          />
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
            accent={colors.brand}
          />
          <StatTile
            label="ACWR"
            value={todayMetric?.acwr != null ? todayMetric.acwr.toFixed(2) : '—'}
            accent={loadZoneColor(loadZone)}
          />
          <StatTile
            label={t('home.streakLabel')}
            value={String(wellnessStreak)}
            accent={colors.caution}
          />
        </View>

        <View style={styles.actions}>
          <ActionCard
            icon={<SunIcon color={surveyDone ? colors.brand : '#FFFFFF'} />}
            title={t('home.fillSurvey')}
            hint={t('home.fillSurveyHint')}
            primary={!surveyDone}
            done={surveyDone}
            doneLabel={t('home.surveyDone')}
            onPress={() => router.push('/wellness')}
          />
          <ActionCard
            icon={<BoltIcon color={colors.brand} />}
            title={t('home.rateLoad')}
            hint={rpeHint}
            done={rpeDone}
            doneLabel={t('home.rpeDone')}
            disabled={rpeLocked}
            onPress={() => router.push('/rpe')}
          />
        </View>
      </ScrollView>
      <Guide />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.screen, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  date: {
    fontFamily: font.semibold,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  greeting: { fontFamily: font.bold, fontSize: 24, color: colors.text, letterSpacing: -0.3 },
  ringWrap: { alignItems: 'center', marginVertical: spacing.xl },
  emptyHint: {
    fontFamily: font.regular,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.m,
    maxWidth: 260,
  },
  tiles: { flexDirection: 'row', gap: spacing.s },
  actions: { gap: spacing.m, marginTop: spacing.xl },
});
