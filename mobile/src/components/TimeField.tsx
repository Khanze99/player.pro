// Ввод времени: своя «пилюля» в стиле приложения + нативный пикер часов.
// Android открывает системный диалог (пикер монтируется только на время показа),
// iOS показывает колесо в нижней панели — inline-вариант рисуется светлой
// системной плашкой и выбивался бы из тёмной темы.

import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { spacing, type Theme, useStyles, useTheme } from '../theme';

interface Props {
  label: string;
  value: Date;
  onChange: (value: Date) => void;
}

export function TimeField({ label, value, onChange }: Props) {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  const text = value.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });

  const picker = (onPick: (date: Date) => void) => (
    <DateTimePicker
      mode="time"
      value={open ? draft : value}
      is24Hour
      accentColor={th.brandOn}
      onValueChange={(_event, date) => onPick(date)}
      onDismiss={() => setOpen(false)}
    />
  );

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${text}`}
        onPress={() => {
          setDraft(value);
          setOpen(true);
        }}
        style={styles.pill}
      >
        <Text style={styles.value}>{text}</Text>
      </Pressable>

      {/* Android: пикер сам по себе диалог, поэтому монтируем его только открытым */}
      {open && Platform.OS === 'android'
        ? picker((date) => {
            setOpen(false);
            onChange(date);
          })
        : null}

      {Platform.OS === 'ios' ? (
        <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{label}</Text>
            {picker(setDraft)}
            <Pressable
              accessibilityRole="button"
              style={styles.done}
              onPress={() => {
                setOpen(false);
                onChange(draft);
              }}
            >
              <Text style={styles.doneText}>{t('common.done')}</Text>
            </Pressable>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontFamily: th.font.medium, fontSize: 15, color: th.textMuted },
  pill: {
    minWidth: 104,
    paddingVertical: spacing.s,
    paddingHorizontal: spacing.m,
    borderRadius: th.radius.control,
    backgroundColor: th.surface2,
    borderWidth: 1,
    borderColor: th.border,
    alignItems: 'center',
  },
  value: {
    fontFamily: th.font.display,
    fontSize: 22,
    color: th.text,
    fontVariant: ['tabular-nums'],
  },
  backdrop: { flex: 1, backgroundColor: '#0009' },
  sheet: {
    backgroundColor: th.surface,
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.l,
    paddingBottom: spacing.xl,
    borderTopLeftRadius: th.radius.card,
    borderTopRightRadius: th.radius.card,
    gap: spacing.m,
  },
  sheetTitle: { fontFamily: th.font.semibold, fontSize: 17, color: th.text, textAlign: 'center' },
  done: {
    paddingVertical: spacing.m,
    borderRadius: th.radius.control,
    backgroundColor: th.brand,
    alignItems: 'center',
  },
  doneText: { fontFamily: th.font.semibold, fontSize: 16, color: th.bg },
});
