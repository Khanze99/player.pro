// Столбики дневной нагрузки за последнюю неделю — общие для своего прогресса
// (history.tsx) и карточки игрока у тренера/врача (athlete/[id].tsx).
// Подпись единиц + значение на каждом столбце — иначе непонятно, что за числа
// (AU = RPE × минуты, раздел 6.1 ТЗ).

import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { DailyMetric } from '@/api/types';
import { spacing, type Theme, useStyles, useTheme } from '@/theme';

export function LoadBars({ metrics }: { metrics: DailyMetric[] }) {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const week = metrics.slice(-7);
  const max = Math.max(...week.map((m) => m.daily_load), 1);

  return (
    <View>
      <Text style={styles.caption}>{t('history.weekLoadUnit')}</Text>
      <View style={styles.barsRow}>
        {week.map((m) => (
          <View key={m.date} style={styles.barCell}>
            <Text style={styles.barValue} numberOfLines={1}>
              {Math.round(m.daily_load)}
            </Text>
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
    </View>
  );
}

const makeStyles = (th: Theme) =>
  StyleSheet.create({
    caption: { fontFamily: th.font.regular, fontSize: 11, color: th.textMuted, marginBottom: spacing.s },
    barsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.s, height: 138 },
    barCell: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: spacing.xs },
    bar: { width: '70%', borderRadius: 5 },
    barValue: {
      fontFamily: th.font.medium,
      fontSize: 10,
      color: th.textMuted,
      fontVariant: ['tabular-nums'],
    },
    barLabel: {
      fontFamily: th.font.regular,
      fontSize: 11,
      color: th.textMuted,
      fontVariant: ['tabular-nums'],
    },
  });
