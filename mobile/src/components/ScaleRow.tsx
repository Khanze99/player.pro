// Шкала 1–10 в режиме чтения — пара к интерактивной ScaleBar (опрос), но для
// отчётов (athlete/[id]/day/[date].tsx): без -/+ и трека-тапа, только значение.

import { StyleSheet, Text, View } from 'react-native';

import { spacing, type Theme, useStyles, useTheme } from '../theme';

interface Props {
  label: string;
  value: number;
  /** Стресс/боль: высокое значение — это плохо, цвет считается в обратную сторону. */
  highIsGood?: boolean;
}

export function ScaleRow({ label, value, highIsGood = true }: Props) {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const effective = highIsGood ? value : 11 - value;
  const color = effective >= 7 ? th.good : effective >= 4 ? th.caution : th.risk;

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${value * 10}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.value, { color }]}>{value}</Text>
    </View>
  );
}

const makeStyles = (th: Theme) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.m, marginBottom: spacing.s },
    label: { width: 78, fontFamily: th.font.regular, fontSize: 13, color: th.textMuted },
    track: { flex: 1, height: 7, borderRadius: 4, backgroundColor: th.border, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 4 },
    value: { width: 22, textAlign: 'right', fontFamily: th.font.display, fontSize: 14 },
  });
