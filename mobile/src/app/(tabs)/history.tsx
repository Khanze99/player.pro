// История / прогресс (дизайн-ТЗ 5.5): стрик, нагрузка за неделю, тренд готовности,
// доступность за 90 дней, последние записи. Мало данных — «накопление», не пустота.

import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Defs, LinearGradient, Polygon, Polyline, Stop } from 'react-native-svg';

import {
  useAvailabilitySummary,
  useMe,
  useMetrics,
  useRpeHistory,
  useStreaks,
  useWellnessHistory,
} from '@/api/hooks';
import type { DailyMetric } from '@/api/types';
import { TeamBadge } from '@/components/TeamBadge';
import { Chip } from '@/components/Chip';
import { BoltIcon, FlameIcon, SunIcon } from '@/components/Icons';
import { Screen } from '@/components/Screen';
import { MicroLabel, ScreenTitle } from '@/components/Typography';
import { loadZoneColor, readinessColor, spacing, type Theme, useStyles, useTheme } from '@/theme';

function LoadBars({ metrics }: { metrics: DailyMetric[] }) {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const week = metrics.slice(-7);
  const max = Math.max(...week.map((m) => m.daily_load), 1);
  return (
    <View style={styles.barsRow}>
      {week.map((m) => (
        <View key={m.date} style={styles.barCell}>
          <View
            style={[
              styles.bar,
              {
                height: Math.max(4, (m.daily_load / max) * 96),
                backgroundColor: m.daily_load > 0 ? th.brand : th.surface2,
              },
            ]}
          />
          <Text style={styles.barLabel}>{m.date.slice(8)}</Text>
        </View>
      ))}
    </View>
  );
}

function ReadinessSparkline({ metrics }: { metrics: DailyMetric[] }) {
  const points = metrics.filter((m) => m.readiness !== null).slice(-14);
  if (points.length < 2) return null;
  const W = 300;
  const H = 72;
  const xy = (m: DailyMetric, i: number) =>
    `${(i / (points.length - 1)) * W},${H - 6 - (m.readiness! / 100) * (H - 12)}`;
  const coords = points.map(xy).join(' ');
  const last = points[points.length - 1];
  const color = readinessColor(last.readiness_zone);
  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Polygon points={`0,${H} ${coords} ${W},${H}`} fill="url(#area)" />
      <Polyline
        points={coords}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function History() {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t, i18n } = useTranslation();
  const me = useMe();
  const metrics = useMetrics(28);
  const streaks = useStreaks();
  const wellness = useWellnessHistory(30);
  const rpe = useRpeHistory(30);
  const availability = useAvailabilitySummary(me.data?.id);

  const data = metrics.data ?? [];
  const wellnessStreak = streaks.data?.find((s) => s.type === 'wellness')?.count ?? 0;
  const latestWithLoad = [...data].reverse().find((m) => m.load_zone !== 'no_data');
  const accumulating = !latestWithLoad || latestWithLoad.acwr === null;

  const avail = availability.data;
  const availTotal = avail ? avail.full_days + avail.modified_days + avail.unavailable_days : 0;

  const recent = [
    ...(wellness.data ?? []).map((w) => ({
      key: `w-${w.id}`,
      date: w.date,
      label: t('history.wellnessEntry'),
      kind: 'wellness' as const,
    })),
    ...(rpe.data ?? []).map((r) => ({
      key: `r-${r.id}`,
      date: r.date,
      label: t('history.rpeEntry', {
        exertion: r.exertion,
        duration: r.duration_min,
        load: r.session_load,
      }),
      kind: 'rpe' as const,
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <ScreenTitle>{t('history.title')}</ScreenTitle>
          <TeamBadge />
        </View>

        <View style={styles.card}>
          <MicroLabel>{t('history.streak')}</MicroLabel>
          <View style={styles.streakRow}>
            <FlameIcon color={th.caution} size={30} />
            <Text style={styles.streakValue}>{wellnessStreak}</Text>
            <Text style={styles.streakUnit}>{t('history.days')}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <MicroLabel>{t('history.weekLoad')}</MicroLabel>
          {data.length > 0 ? (
            <LoadBars metrics={data} />
          ) : (
            <Text style={styles.empty}>{t('history.empty')}</Text>
          )}
          <View style={styles.acwrRow}>
            <MicroLabel>{t('history.acwr')}</MicroLabel>
            {accumulating ? (
              <Chip label={t('history.accumulating')} dotColor={th.low} />
            ) : (
              <Chip
                label={`${latestWithLoad!.acwr!.toFixed(2)} · ${t(`home.loadZone.${latestWithLoad!.load_zone}`)}`}
                dotColor={loadZoneColor(latestWithLoad!.load_zone)}
              />
            )}
          </View>
          {accumulating && <Text style={styles.hint}>{t('history.accumulatingHint')}</Text>}
        </View>

        <View style={styles.card}>
          <MicroLabel>{t('history.readinessTrend')}</MicroLabel>
          {data.filter((m) => m.readiness !== null).length >= 2 ? (
            <ReadinessSparkline metrics={data} />
          ) : (
            <Text style={styles.hint}>{t('history.accumulatingHint')}</Text>
          )}
        </View>

        {avail && availTotal > 0 && (
          <View style={styles.card}>
            <MicroLabel>
              {t('history.availability')}
              {avail.availability_percent !== null ? ` · ${Math.round(avail.availability_percent)}%` : ''}
            </MicroLabel>
            <View style={styles.availBar}>
              <View style={{ flex: avail.full_days, backgroundColor: th.good }} />
              <View style={{ flex: avail.modified_days, backgroundColor: th.caution }} />
              <View style={{ flex: avail.unavailable_days, backgroundColor: th.risk }} />
            </View>
            <View style={styles.availLegend}>
              <Chip label={`${t('history.availFull')} ${avail.full_days}`} dotColor={th.good} />
              <Chip label={`${t('history.availModified')} ${avail.modified_days}`} dotColor={th.caution} />
              <Chip
                label={`${t('history.availUnavailable')} ${avail.unavailable_days}`}
                dotColor={th.risk}
              />
            </View>
          </View>
        )}

        <View style={styles.card}>
          <MicroLabel>{t('history.recent')}</MicroLabel>
          {recent.length === 0 ? (
            <Text style={styles.empty}>{t('history.empty')}</Text>
          ) : (
            recent.map((item) => (
              <View key={item.key} style={styles.entryRow}>
                <View style={styles.entryIcon}>
                  {item.kind === 'wellness' ? (
                    <SunIcon color={th.brandOn} size={16} />
                  ) : (
                    <BoltIcon color={th.caution} size={16} />
                  )}
                </View>
                <Text style={styles.entryLabel} numberOfLines={1}>
                  {item.label}
                </Text>
                <Text style={styles.entryDate}>{fmtDate(item.date)}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  content: { padding: spacing.screen, paddingBottom: 40, gap: spacing.m },
  card: {
    backgroundColor: th.surface,
    borderWidth: 1,
    borderColor: th.border,
    borderRadius: th.radius.card,
    padding: spacing.xl,
    gap: spacing.m,
  },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.m },
  streakValue: { fontFamily: th.font.display, fontSize: 38, color: th.text },
  streakUnit: { fontFamily: th.font.regular, fontSize: 15, color: th.textMuted },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.s, height: 120 },
  barCell: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: spacing.xs },
  bar: { width: '70%', borderRadius: 5 },
  barLabel: {
    fontFamily: th.font.regular,
    fontSize: 11,
    color: th.textMuted,
    fontVariant: ['tabular-nums'],
  },
  acwrRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hint: { fontFamily: th.font.regular, fontSize: 13, color: th.textMuted },
  empty: { fontFamily: th.font.regular, fontSize: 15, color: th.textMuted },
  availBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: th.surface2,
  },
  availLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.m, minHeight: 42 },
  entryIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: th.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryLabel: { flex: 1, fontFamily: th.font.regular, fontSize: 15, color: th.text },
  entryDate: { fontFamily: th.font.medium, fontSize: 12, color: th.textMuted },
});
