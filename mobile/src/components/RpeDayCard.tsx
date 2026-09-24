// Детальная карточка RPE за конкретный день (раздел 6.1 ТЗ) — до сих пор в
// приложении была только сумма нагрузки (LoadBars, AU за неделю), не сами оценки.
// День может быть многосессийным (двухразовая тренировка) — показываем каждую
// запись отдельно. Общая с ReadinessBreakdownSection логика выбора дня: та же
// «последняя дата с опросом», что приходит родительским экраном.

import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { RpeEntry } from '@/api/types';
import { MicroLabel } from '@/components/Typography';
import { spacing, type Theme, useStyles, useTheme } from '@/theme';

interface Props {
  date: string | null | undefined;
  entries: RpeEntry[];
}

export function RpeDayCard({ date, entries }: Props) {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();

  const dayEntries = date ? entries.filter((e) => e.date === date) : [];

  return (
    <View style={styles.card}>
      <MicroLabel>{t('history.rpeDay')}</MicroLabel>
      {dayEntries.length === 0 ? (
        <Text style={styles.empty}>{t('history.rpeDayEmpty')}</Text>
      ) : (
        <View>
          {dayEntries.map((entry, i) => (
            <View
              key={entry.id}
              style={[styles.row, i === dayEntries.length - 1 && { borderBottomWidth: 0 }]}
            >
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle}>
                  {t('history.rpeEntry', {
                    exertion: entry.exertion,
                    duration: entry.duration_min,
                    load: entry.session_load,
                  })}
                </Text>
                <Text style={styles.rowSub}>{t('history.rpePerformance', { value: entry.performance })}</Text>
              </View>
              {entry.is_late && <Text style={[styles.late, { color: th.caution }]}>{t('history.rpeLate')}</Text>}
            </View>
          ))}
        </View>
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
    empty: { fontFamily: th.font.regular, fontSize: 14, color: th.textMuted },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.s,
      paddingVertical: spacing.s,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: th.border,
    },
    rowMain: { flex: 1, gap: 2 },
    rowTitle: { fontFamily: th.font.medium, fontSize: 14, color: th.text },
    rowSub: { fontFamily: th.font.regular, fontSize: 12, color: th.textMuted },
    late: { fontFamily: th.font.semibold, fontSize: 10, letterSpacing: 0.8 },
  });
