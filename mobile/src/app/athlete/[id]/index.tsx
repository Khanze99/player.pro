// Отчёт по игроку для тренера/врача: одна страница целиком — нагрузка, тренд
// готовности, разбивка Readiness по критериям и полная детализация последнего
// заполненного дня (опрос, карта боли, травма/недомогание, восстановительные
// процедуры, комментарий, RPE),
// без урезания — coach и medic видят одинаково (ensure_can_view_athlete).
// Открывается тапом по строке игрока в CoachHome.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAthleteMetrics, useAthleteRpeHistory, useAthleteWellnessHistory } from '@/api/hooks';
import { BodyMap } from '@/components/BodyMap';
import { Chip } from '@/components/Chip';
import { CloseIcon } from '@/components/Icons';
import { LoadBars } from '@/components/LoadBars';
import { ReadinessBreakdownSection } from '@/components/ReadinessBreakdownSection';
import { ReadinessSparkline } from '@/components/ReadinessSparkline';
import { RecoveryMethods } from '@/components/RecoveryMethods';
import { RpeDayCard } from '@/components/RpeDayCard';
import { ScaleRow } from '@/components/ScaleRow';
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
  const wellness = useAthleteWellnessHistory(params.id, 28);
  const data = metrics.data ?? [];
  const latestWithLoad = [...data].reverse().find((m) => m.load_zone !== 'no_data');
  const accumulating = !latestWithLoad || latestWithLoad.acwr === null;
  const latestWithReadiness = [...data].reverse().find((m) => m.readiness !== null);
  const dayEntry = wellness.data?.find((w) => w.date === latestWithReadiness?.date);

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
          <View style={styles.cardHead}>
            <Text style={styles.cardHeadText}>{t('athleteReport.summary')}</Text>
          </View>
          <View style={styles.cardBody}>
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
        </View>

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardHeadText}>{t('history.weekLoad')}</Text>
          </View>
          <View style={styles.cardBody}>
            {data.length > 0 ? (
              <LoadBars metrics={data} />
            ) : (
              <Text style={styles.empty}>{t('history.empty')}</Text>
            )}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardHeadText}>{t('history.readinessTrend')}</Text>
          </View>
          <View style={styles.cardBody}>
            {data.filter((m) => m.readiness !== null).length >= 2 ? (
              <ReadinessSparkline metrics={data} />
            ) : (
              <Text style={styles.hint}>{t('history.accumulatingHint')}</Text>
            )}
          </View>
        </View>

        <ReadinessBreakdownSection metrics={data} athleteId={params.id} />

        {dayEntry && (
          <>
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.cardHeadText}>{t('dayDetail.wellness')}</Text>
              </View>
              <View style={styles.cardBody}>
                <ScaleRow label={t('wellness.sleep')} value={dayEntry.sleep_quality} />
                <ScaleRow label={t('wellness.energy')} value={dayEntry.energy} />
                <ScaleRow label={t('wellness.mood')} value={dayEntry.mood} />
                <ScaleRow label={t('wellness.stress')} value={dayEntry.stress} highIsGood={false} />
                <ScaleRow label={t('wellness.soreness')} value={dayEntry.soreness} highIsGood={false} />
                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaCap}>{t('dayDetail.sleepHours')}</Text>
                    <Text style={styles.metaValue}>{dayEntry.sleep_hours ?? '—'}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaCap}>{t('dayDetail.restingHr')}</Text>
                    <Text style={styles.metaValue}>{dayEntry.resting_hr ?? '—'}</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.cardHeadText}>{t('dayDetail.painMap')}</Text>
              </View>
              <View style={styles.cardBody}>
                <BodyMap value={dayEntry.pain_points} readOnly />
                {dayEntry.pain_points.length === 0 ? (
                  <Text style={styles.empty}>{t('dayDetail.noPain')}</Text>
                ) : (
                  <View style={styles.painList}>
                    {dayEntry.pain_points.map((p, i) => (
                      <View key={`${p.region}:${p.side}:${i}`} style={styles.painItem}>
                        <View style={styles.painItemHead}>
                          <Text style={styles.painRegion}>
                            {t(`wellness.bodyMap.region.${p.region}`)}
                            <Text style={styles.painSide}> · {t(`wellness.bodyMap.side.${p.side}`)}</Text>
                          </Text>
                          <Text
                            style={[
                              styles.painSeverity,
                              { color: p.severity >= 7 ? th.risk : p.severity >= 4 ? th.caution : th.good },
                            ]}
                          >
                            {p.severity} / 10
                          </Text>
                        </View>
                        {!!p.note && <Text style={styles.painNote}>«{p.note}»</Text>}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.cardHeadText}>{t('dayDetail.injurySymptom')}</Text>
              </View>
              <View style={styles.cardBody}>
                <View style={styles.badgeItem}>
                  {dayEntry.injury ? (
                    <Chip
                      label={
                        dayEntry.injury_type
                          ? t(`wellness.injuryType.${dayEntry.injury_type}`)
                          : t('wellness.injury')
                      }
                      dotColor={th.risk}
                    />
                  ) : (
                    <Chip label={t('dayDetail.noInjury')} dotColor={th.low} />
                  )}
                  {!!dayEntry.injury_details && (
                    <Text style={styles.badgeDetails}>{dayEntry.injury_details}</Text>
                  )}
                </View>
                <View style={styles.badgeItem}>
                  {dayEntry.symptom ? (
                    <Chip
                      label={
                        dayEntry.symptom_type
                          ? t(`wellness.symptomType.${dayEntry.symptom_type}`)
                          : t('wellness.symptom')
                      }
                      dotColor={th.caution}
                    />
                  ) : (
                    <Chip label={t('dayDetail.noSymptom')} dotColor={th.low} />
                  )}
                  {!!dayEntry.symptom_details && (
                    <Text style={styles.badgeDetails}>{dayEntry.symptom_details}</Text>
                  )}
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.cardHeadText}>{t('dayDetail.recovery')}</Text>
              </View>
              <View style={styles.cardBody}>
                {dayEntry.recovery_methods.length === 0 ? (
                  <Text style={styles.empty}>{t('dayDetail.noRecovery')}</Text>
                ) : (
                  <RecoveryMethods value={dayEntry.recovery_methods} readOnly />
                )}
              </View>
            </View>

            {!!dayEntry.comment && (
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardHeadText}>{t('dayDetail.comment')}</Text>
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.comment}>{dayEntry.comment}</Text>
                </View>
              </View>
            )}
          </>
        )}

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardHeadText}>{t('dayDetail.rpe')}</Text>
          </View>
          <View style={styles.cardBody}>
            <RpeDayCard date={latestWithReadiness?.date} entries={rpe.data ?? []} />
          </View>
        </View>
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
    // overflow:hidden: все внутренние прямые углы (где хедер стыкуется с телом)
    // обрезаются по скруглению самой карточки, без отдельного border-radius на
    // хедере и без острых стыков на углах.
    card: {
      backgroundColor: th.surface,
      borderWidth: 1,
      borderColor: th.border,
      borderRadius: th.radius.card,
      overflow: 'hidden',
    },
    summaryRow: { flexDirection: 'row', gap: spacing.xl },
    summaryItem: { gap: spacing.xs },
    summaryValue: { fontFamily: th.font.display, fontSize: 30 },
    hint: { fontFamily: th.font.regular, fontSize: 13, color: th.textMuted },
    empty: { fontFamily: th.font.regular, fontSize: 15, color: th.textMuted },
    // Заголовок-полоса — брендинг организации (theme.brand/brandDark уже меняется
    // по клубу, GET /branding): едва темнее тела карточки + линия снизу там, где
    // заголовок заканчивается. Один и тот же стиль на все карточки страницы.
    cardHead: {
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.m,
      paddingBottom: spacing.s,
      backgroundColor: th.surface2,
      borderBottomWidth: 2,
      borderBottomColor: th.brandDark,
    },
    cardHeadText: { fontFamily: th.font.semibold, fontSize: 14, color: th.text },
    cardBody: { padding: spacing.xl, gap: spacing.m },
    metaRow: {
      flexDirection: 'row',
      gap: spacing.xl,
      marginTop: spacing.s,
      paddingTop: spacing.m,
      borderTopWidth: 1,
      borderTopColor: th.border,
    },
    metaItem: { gap: 2 },
    metaCap: {
      fontFamily: th.font.regular,
      fontSize: 11,
      color: th.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    metaValue: { fontFamily: th.font.display, fontSize: 16, color: th.text },
    painList: { gap: spacing.m },
    painItem: { gap: 2 },
    painItemHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    painRegion: { fontFamily: th.font.medium, fontSize: 13, color: th.text },
    painSide: { fontFamily: th.font.regular, fontSize: 12, color: th.textMuted },
    painSeverity: { fontFamily: th.font.display, fontSize: 13 },
    painNote: { fontFamily: th.font.regular, fontStyle: 'italic', fontSize: 12.5, color: th.textMuted },
    badgeItem: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.s },
    badgeDetails: { fontFamily: th.font.regular, fontSize: 13, color: th.textMuted, flexShrink: 1 },
    comment: { fontFamily: th.font.regular, fontStyle: 'italic', fontSize: 14, color: th.text, lineHeight: 20 },
  });
