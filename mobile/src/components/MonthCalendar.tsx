// Месячная сетка календаря: точки-события по типам, выбор дня, листание месяцев.
// Неделя с понедельника, все даты — локальные (см. toLocalISO).

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { toLocalISO } from '@/api/dates';
import { ChevronIcon } from '@/components/Icons';
import { colors, font, radius, spacing } from '@/theme';

interface Props {
  month: Date; // любой день нужного месяца
  selected: string; // локальная ISO-дата
  marks: Record<string, string[]>; // дата → цвета точек (до 3 рисуем)
  onSelectDay: (iso: string) => void;
  onChangeMonth: (delta: 1 | -1) => void;
}

export function MonthCalendar({ month, selected, marks, onSelectDay, onChangeMonth }: Props) {
  const { i18n } = useTranslation();
  const todayIso = toLocalISO(new Date());

  const { title, weekdays, cells } = useMemo(() => {
    const year = month.getFullYear();
    const monthIdx = month.getMonth();
    const first = new Date(year, monthIdx, 1);
    const offset = (first.getDay() + 6) % 7; // понедельник — первый
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();

    const dayCells: ({ day: number; iso: string } | null)[] = [
      ...Array.from({ length: offset }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => ({
        day: i + 1,
        iso: toLocalISO(new Date(year, monthIdx, i + 1)),
      })),
    ];
    while (dayCells.length % 7 !== 0) dayCells.push(null);

    // Понедельник 2026-01-05 — опорная неделя для локализованных сокращений дней
    const names = Array.from({ length: 7 }, (_, i) =>
      new Date(2026, 0, 5 + i)
        .toLocaleDateString(i18n.language, { weekday: 'short' })
        .replace('.', '')
        .toUpperCase(),
    );

    return {
      title: first.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' }).toUpperCase(),
      weekdays: names,
      cells: dayCells,
    };
  }, [month, i18n.language]);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={() => onChangeMonth(-1)}
          hitSlop={10}
          accessibilityRole="button"
          style={styles.navButton}
        >
          <View style={{ transform: [{ rotate: '180deg' }] }}>
            <ChevronIcon color={colors.textMuted} />
          </View>
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <Pressable
          onPress={() => onChangeMonth(1)}
          hitSlop={10}
          accessibilityRole="button"
          style={styles.navButton}
        >
          <ChevronIcon color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.week}>
        {weekdays.map((name, i) => (
          <Text key={i} style={styles.weekday}>
            {name}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell, i) => {
          if (!cell) return <View key={i} style={styles.cell} />;
          const isSelected = cell.iso === selected;
          const isToday = cell.iso === todayIso;
          const dots = marks[cell.iso]?.slice(0, 3) ?? [];
          return (
            <Pressable
              key={i}
              style={styles.cell}
              onPress={() => onSelectDay(cell.iso)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
            >
              <View style={[styles.dayWrap, isSelected && styles.daySelected]}>
                <Text
                  style={[
                    styles.day,
                    isToday && !isSelected && { color: colors.brand },
                    isSelected && styles.dayTextSelected,
                  ]}
                >
                  {cell.day}
                </Text>
                <View style={styles.dots}>
                  {dots.map((dotColor, j) => (
                    <View key={j} style={[styles.dot, { backgroundColor: dotColor }]} />
                  ))}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing.m,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.m,
  },
  navButton: { padding: spacing.s },
  title: { fontFamily: font.semibold, fontSize: 13, color: colors.text, letterSpacing: 1.2 },
  week: { flexDirection: 'row', marginBottom: spacing.s },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontFamily: font.semibold,
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 0.8,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 },
  dayWrap: {
    width: 40,
    height: 44,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  daySelected: { backgroundColor: colors.brand },
  day: { fontFamily: font.medium, fontSize: 14, color: colors.text },
  dayTextSelected: { color: '#FFFFFF', fontFamily: font.semibold },
  dots: { flexDirection: 'row', gap: 3, height: 4 },
  dot: { width: 4, height: 4, borderRadius: 2 },
});
