// Карточка разбивки Readiness с переключателем день/7д/28д — общая для своего
// прогресса (history.tsx) и карточки игрока у тренера/врача (athlete/[id].tsx).
// athleteId не задан → свои данные (/me); задан → чужие, по ensure_can_view_athlete.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useReadinessBreakdown, useReadinessBreakdownAverage } from '@/api/hooks';
import type { DailyMetric } from '@/api/types';
import { ReadinessBreakdownCard } from '@/components/ReadinessBreakdownCard';
import { MicroLabel } from '@/components/Typography';
import { spacing, type Theme, useStyles } from '@/theme';

const WINDOWS = ['day', 7, 28] as const;
type Window = (typeof WINDOWS)[number];

interface Props {
  metrics: DailyMetric[];
  athleteId?: string;
}

export function ReadinessBreakdownSection({ metrics, athleteId }: Props) {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const [windowSize, setWindowSize] = useState<Window>('day');

  const latestDate = [...metrics].reverse().find((m) => m.readiness !== null)?.date;
  const dayBreakdown = useReadinessBreakdown(athleteId, windowSize === 'day' ? latestDate : undefined);
  const avgBreakdown = useReadinessBreakdownAverage(
    athleteId,
    typeof windowSize === 'number' ? windowSize : 7,
    windowSize !== 'day',
  );

  if (!latestDate) return null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <MicroLabel>{t('breakdown.title')}</MicroLabel>
        {/* Свой ряд под заголовком, чипы делят ширину карточки поровну — на любой
            локали (en-заголовок длиннее ru) не вылезает за границы поля. */}
        <View style={styles.windowRow}>
          {WINDOWS.map((w) => (
            <Pressable
              key={w}
              onPress={() => setWindowSize(w)}
              accessibilityRole="button"
              accessibilityState={{ selected: windowSize === w }}
              style={[styles.windowChip, windowSize === w && styles.windowChipActive]}
            >
              <Text style={[styles.windowChipText, windowSize === w && styles.windowChipTextActive]}>
                {w === 'day' ? t('breakdown.windowDay') : t('breakdown.windowDays', { count: w })}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      {windowSize === 'day' ? (
        dayBreakdown.data ? (
          <ReadinessBreakdownCard
            components={dayBreakdown.data.components}
            score={dayBreakdown.data.score}
            zone={dayBreakdown.data.zone}
            hrModifier={dayBreakdown.data.hr_modifier}
            hrFlag={dayBreakdown.data.hr_flag}
            injury={dayBreakdown.data.injury}
            symptom={dayBreakdown.data.symptom}
          />
        ) : (
          <Text style={styles.hint}>{t('breakdown.empty')}</Text>
        )
      ) : avgBreakdown.data && avgBreakdown.data.days_with_data > 0 ? (
        <ReadinessBreakdownCard
          components={avgBreakdown.data.components}
          score={avgBreakdown.data.avg_score}
        />
      ) : (
        <Text style={styles.hint}>{t('history.accumulatingHint')}</Text>
      )}
    </View>
  );
}

const makeStyles = (th: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: th.surface,
      borderWidth: 1,
      borderColor: th.border,
      borderRadius: th.radius.card,
      padding: spacing.xl,
      gap: spacing.m,
    },
    header: { gap: spacing.s },
    windowRow: { flexDirection: 'row', gap: spacing.xs },
    windowChip: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 6,
      borderRadius: th.radius.chip,
      backgroundColor: th.surface2,
    },
    windowChipActive: { backgroundColor: th.brand },
    windowChipText: { fontFamily: th.font.semibold, fontSize: 11, color: th.textMuted },
    windowChipTextActive: { color: th.onBrand },
    hint: { fontFamily: th.font.regular, fontSize: 13, color: th.textMuted },
  });
