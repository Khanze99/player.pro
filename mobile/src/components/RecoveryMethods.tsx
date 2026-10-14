// Восстановительные процедуры вчера — мультивыбор из 4 фиксированных вариантов,
// деталь для medic/coach, на Readiness не влияет (как карта боли). Один компонент
// на опрос (интерактивно) и отчёт по дню (readOnly) — по образцу BodyMap.tsx.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { RecoveryMethod } from '@/api/types';
import { spacing, type Theme, useStyles } from '@/theme';

const METHODS: readonly RecoveryMethod[] = ['massage', 'compression', 'cryo_compression', 'physio'];

interface Props {
  value: RecoveryMethod[];
  onChange?: (next: RecoveryMethod[]) => void;
  readOnly?: boolean;
}

export function RecoveryMethods({ value, onChange, readOnly = false }: Props) {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();

  const toggle = (m: RecoveryMethod) => {
    if (readOnly) return;
    onChange?.(value.includes(m) ? value.filter((v) => v !== m) : [...value, m]);
  };

  // readOnly: ничего не выбрано — чипов нет, пустое состояние показывает экран-хозяин
  // (тем же паттерном, что dayDetail.noPain/noInjury/noSymptom для BodyMap рядом).
  const shown = readOnly ? METHODS.filter((m) => value.includes(m)) : METHODS;
  if (readOnly && shown.length === 0) return null;

  return (
    <View style={styles.row}>
      {shown.map((m) => {
        const active = value.includes(m);
        return (
          <Pressable
            key={m}
            disabled={readOnly}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => toggle(m)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.text, active && styles.textActive]}>
              {t(`wellness.recoveryMethod.${m}`)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s },
  chip: {
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    borderRadius: th.radius.chip,
    backgroundColor: th.surface2,
    borderWidth: 1,
    borderColor: th.border,
    minHeight: 40,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: th.brand, borderColor: th.brandOn },
  text: { fontFamily: th.font.medium, fontSize: 14, color: th.textMuted },
  textActive: { color: th.onBrand },
});
