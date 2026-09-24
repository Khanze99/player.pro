// Отчёт по игроку для тренера/врача: та же картина, что в своей истории (нагрузка,
// тренд готовности, разбивка Readiness по критериям) — но для чужого игрока, доступ
// по ensure_can_view_athlete (та же матрица, что у Squad Status). Открывается тапом
// по строке игрока в CoachHome.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAthleteMetrics, useAthleteRpeHistory } from '@/api/hooks';
import { Chip } from '@/components/Chip';
import { CloseIcon } from '@/components/Icons';
import { LoadBars } from '@/components/LoadBars';
import { ReadinessBreakdownSection } from '@/components/ReadinessBreakdownSection';
import { ReadinessSparkline } from '@/components/ReadinessSparkline';
import { RpeDayCard } from '@/components/RpeDayCard';
import { Screen } from '@/components/Screen';
import { MicroLabel, ScreenTitle } from '@/components/Typography';
import { loadZoneColor, readinessColor, spacing, type Theme, useStyles, useTheme } from '@/theme';

export default function AthleteReport() {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; name: string }>();

  const metrics = useAthleteMetrics(params.id, 28);
  const rpe = useAthleteRpeHistory(params.id, 28);
  const data = metrics.data ?? [];
  const latestWithLoad = [...data].reverse().find((m) => m.load_zone !== 'no_data');
  const accumulating = !latestWithLoad || latestWithLoad.acwr === null;
  const latestWithReadiness = [...data].reverse().find((m) => m.readiness !== null);

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerMain}>
            <MicroLabel>{t('athleteReport.title')}</MicroLabel>
            <ScreenTitle>{params.name}</ScreenTitle>
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

        <View style={styles.card}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <MicroLabel>{t('home.readiness')}</MicroLabel>
              <Text
                style={[
                  styles.summaryValue,
                  { color: readinessColor(latestWithReadiness?.readiness_zone) },
                ]}
              >
                {latestWithReadiness?.readiness ?? '—'}
              </Text>
            </View>
            <View style={styles.summaryItem}>
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
          </View>
        </View>

        <View style={styles.card}>
          <MicroLabel>{t('history.weekLoad')}</MicroLabel>
          {data.length > 0 ? (
            <LoadBars metrics={data} />
          ) : (
            <Text style={styles.empty}>{t('history.empty')}</Text>
          )}
        </View>

        <View style={styles.card}>
          <MicroLabel>{t('history.readinessTrend')}</MicroLabel>
          {data.filter((m) => m.readiness !== null).length >= 2 ? (
            <ReadinessSparkline metrics={data} />
          ) : (
            <Text style={styles.hint}>{t('history.accumulatingHint')}</Text>
          )}
        </View>

        <ReadinessBreakdownSection metrics={data} athleteId={params.id} />

        <RpeDayCard date={latestWithReadiness?.date} entries={rpe.data ?? []} />
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (th: Theme) =>
  StyleSheet.create({
    content: { padding: spacing.screen, gap: spacing.m, paddingBottom: 40 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    headerMain: { flex: 1, paddingRight: spacing.m, gap: 4 },
    close: { padding: spacing.xs },
    card: {
      backgroundColor: th.surface,
      borderWidth: 1,
      borderColor: th.border,
      borderRadius: th.radius.card,
      padding: spacing.xl,
      gap: spacing.m,
    },
    summaryRow: { flexDirection: 'row', gap: spacing.xl },
    summaryItem: { gap: spacing.xs },
    summaryValue: { fontFamily: th.font.display, fontSize: 30 },
    hint: { fontFamily: th.font.regular, fontSize: 13, color: th.textMuted },
    empty: { fontFamily: th.font.regular, fontSize: 15, color: th.textMuted },
  });
