// Разбивка Readiness по критериям (раздел 6.4 ТЗ) — почему именно такой балл.
// Бар пропорционален normalized (0–100, уже приведено к единой шкале «длиннее =
// лучше») — НЕ сырому значению 1–10: у сна/энергии/настроения 10 лучшее, у
// стресса/боли лучшее — 1, и если гнать бар по сырому value, «Сон: 10» и
// «Стресс: 1» (оба — хороший результат) выглядели бы одинаково коротким баром.
// Цвет — та же светофорная логика 75/55, что у итогового балла. Порядок строк
// (не бар!) отвечает «что сильнее всего тянет вниз» — сортировка по deficit
// приходит уже готовая с бэкенда (учитывает вес критерия, не только его норму).

import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ReadinessComponent } from '@/api/types';
import { MicroLabel } from '@/components/Typography';
import { readinessColor, spacing, type Theme, useStyles, useTheme } from '@/theme';

function componentZone(normalized: number): 'green' | 'yellow' | 'red' {
  if (normalized >= 75) return 'green';
  if (normalized >= 55) return 'yellow';
  return 'red';
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function ComponentRow({ component }: { component: ReadinessComponent }) {
  const styles = useStyles(makeRowStyles);
  const { t } = useTranslation();
  const color = readinessColor(componentZone(component.normalized));
  const width = Math.max(4, component.normalized);

  return (
    <View style={styles.row}>
      <Text style={styles.label} numberOfLines={1}>
        {t(`breakdown.${component.key}`)}
      </Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${width}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.value, { color }]}>{formatValue(component.value)}</Text>
    </View>
  );
}

interface Props {
  components: ReadinessComponent[];
  score?: number | null;
  zone?: 'green' | 'yellow' | 'red' | null;
  hrModifier?: number;
  hrFlag?: boolean;
  injury?: boolean;
  symptom?: boolean;
  emptyHint?: string;
}

export function ReadinessBreakdownCard({
  components,
  score = null,
  zone,
  hrModifier,
  hrFlag,
  injury,
  symptom,
  emptyHint,
}: Props) {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();

  if (components.length === 0) {
    return <Text style={styles.empty}>{emptyHint ?? t('breakdown.empty')}</Text>;
  }

  const badges: string[] = [];
  if (injury) badges.push(t('breakdown.injury'));
  if (symptom) badges.push(t('breakdown.symptom'));

  return (
    <View style={styles.container}>
      {(score !== null || badges.length > 0) && (
        <View style={styles.scoreRow}>
          {score !== null && (
            <Text style={[styles.score, { color: readinessColor(zone) }]}>{Math.round(score)}</Text>
          )}
          {badges.length > 0 && (
            <View style={styles.badges}>
              {badges.map((label) => (
                <Text key={label} style={[styles.badge, { color: th.risk }]}>
                  {label.toUpperCase()}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}
      {components.map((component) => (
        <ComponentRow key={component.key} component={component} />
      ))}
      {!!hrFlag && (
        <View style={styles.hrRow}>
          <MicroLabel>{t('breakdown.hrModifier')}</MicroLabel>
          <Text style={[styles.hrValue, { color: th.caution }]}>{hrModifier}</Text>
        </View>
      )}
    </View>
  );
}

const makeStyles = (th: Theme) =>
  StyleSheet.create({
    container: { gap: spacing.s },
    scoreRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.xs,
    },
    score: { fontFamily: th.font.display, fontSize: 30 },
    badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s, flexShrink: 1 },
    badge: { fontFamily: th.font.semibold, fontSize: 10, letterSpacing: 0.8 },
    hrRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: spacing.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: th.border,
      marginTop: spacing.xs,
    },
    hrValue: { fontFamily: th.font.semibold, fontSize: 13, fontVariant: ['tabular-nums'] },
    empty: { fontFamily: th.font.regular, fontSize: 14, color: th.textMuted },
  });

const makeRowStyles = (th: Theme) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
    label: { width: 78, fontFamily: th.font.medium, fontSize: 13, color: th.textMuted },
    track: {
      flex: 1,
      height: 8,
      borderRadius: 4,
      backgroundColor: th.surface2,
      overflow: 'hidden',
    },
    fill: { height: '100%', borderRadius: 4 },
    value: {
      width: 32,
      textAlign: 'right',
      fontFamily: th.font.semibold,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
    },
  });
