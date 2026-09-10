// Веб-вариант TimeField. Нативный @expo/ui datetime-picker в браузере недоступен
// (модуль без web-реализации, бандл на нём падает), поэтому берём штатный
// <input type="time"> — он даёт системный пикер часов, в том числе на iOS Safari.

import type { ChangeEvent } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { spacing, type Theme, useStyles, useTheme } from '../theme';

interface Props {
  label: string;
  value: Date;
  onChange: (value: Date) => void;
}

const pad = (n: number) => String(n).padStart(2, '0');
const toHM = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function TimeField({ label, value, onChange }: Props) {
  const th = useTheme();
  const styles = useStyles(makeStyles);

  const handle = (e: ChangeEvent<HTMLInputElement>) => {
    const [h, m] = e.target.value.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    const next = new Date(value);
    next.setHours(h, m, 0, 0);
    onChange(next);
  };

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <input
        type="time"
        value={toHM(value)}
        onChange={handle}
        aria-label={label}
        style={{
          minWidth: 104,
          padding: `${spacing.s}px ${spacing.m}px`,
          borderRadius: th.radius.control,
          background: th.surface2,
          border: `1px solid ${th.border}`,
          color: th.text,
          fontFamily: th.font.display,
          fontSize: 22,
          textAlign: 'center',
          colorScheme: 'dark',
        }}
      />
    </View>
  );
}

const makeStyles = (th: Theme) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    label: { fontFamily: th.font.medium, fontSize: 15, color: th.textMuted },
  });
