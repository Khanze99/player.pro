// Компактное числовое поле (цели в конструкторе, факт подхода в выполнении).
// Текст держим локально: «12,» или пустое поле в процессе ввода не должны
// превращаться в число и прыгать под пальцем. Внешнее значение подхватываем,
// только когда оно меняется не от этого поля (например, «как в прошлый раз»).

import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { spacing, type Theme, useStyles, useTheme } from '../theme';

interface Props {
  label?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  decimal?: boolean;
  invalid?: boolean;
  editable?: boolean;
}

const asText = (value: number | null) => (value == null ? '' : String(value));

export function NumField({ label, value, onChange, decimal = false, invalid = false, editable = true }: Props) {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const [text, setText] = useState(asText(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    const parsed = text === '' ? null : Number(text);
    if (parsed !== value) setText(asText(value));
  }
  return (
    <View style={styles.wrap}>
      {label ? (
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
      <TextInput
        style={[styles.input, invalid && { borderColor: th.risk }, !editable && styles.readOnly]}
        value={text}
        editable={editable}
        onChangeText={(raw) => {
          const cleaned = decimal ? raw.replace(',', '.').replace(/[^0-9.]/g, '') : raw.replace(/\D/g, '');
          setText(cleaned);
          const parsed = cleaned === '' ? null : Number(cleaned);
          const next = parsed != null && Number.isFinite(parsed) ? parsed : null;
          setLastValue(next);
          onChange(next);
        }}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        accessibilityLabel={label}
        selectTextOnFocus
        maxLength={decimal ? 6 : 4}
      />
    </View>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  wrap: { flex: 1, gap: spacing.xs },
  label: { fontFamily: th.font.semibold, fontSize: 10, color: th.textMuted, letterSpacing: 0.8 },
  input: {
    minHeight: 44,
    borderRadius: th.radius.chip,
    borderWidth: 1,
    borderColor: th.border,
    backgroundColor: th.surface2,
    color: th.text,
    fontFamily: th.font.semibold,
    fontSize: 16,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  readOnly: { backgroundColor: 'transparent' },
});
