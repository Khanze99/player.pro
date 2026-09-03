// Календарь (ТЗ 3.5): командное расписание + индивидуальные события.
// Месячная сетка с точками по типам, агенда выбранного дня, создание по «+».

import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useMyEvents } from '@/api/hooks';
import type { CalendarEvent } from '@/api/types';
import { TeamBadge } from '@/components/TeamBadge';
import { PlusIcon } from '@/components/Icons';
import { toLocalISO } from '@/api/dates';
import { MonthCalendar } from '@/components/MonthCalendar';
import { Screen } from '@/components/Screen';
import { ScreenTitle } from '@/components/Typography';
import { eventTypeColor, spacing, type Theme, useStyles, useTheme } from '@/theme';

function timeLabel(iso: string, locale: string): string {
  return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

export default function Calendar() {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState(() => toLocalISO(new Date()));

  // Окно месяца ± день — чтобы таймзона не съедала события на границах
  const { fromISO, toISO } = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    first.setDate(first.getDate() - 1);
    last.setDate(last.getDate() + 1);
    return { fromISO: toLocalISO(first), toISO: toLocalISO(last) };
  }, [month]);

  const events = useMyEvents(fromISO, toISO);

  const { marks, byDay } = useMemo(() => {
    const dayMarks: Record<string, string[]> = {};
    const grouped: Record<string, CalendarEvent[]> = {};
    for (const event of events.data ?? []) {
      const day = toLocalISO(new Date(event.planned_start));
      (grouped[day] ??= []).push(event);
      (dayMarks[day] ??= []).push(eventTypeColor(event.type, th));
    }
    return { marks: dayMarks, byDay: grouped };
  }, [events.data, th]);

  const dayEvents = byDay[selected] ?? [];

  const changeMonth = (delta: 1 | -1) => {
    setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const openEvent = (event: CalendarEvent) => {
    router.push({
      pathname: '/event/[id]',
      params: {
        id: event.id,
        type: event.type,
        title: event.title ?? '',
        start: event.planned_start,
        duration: String(event.planned_duration_min),
        teamId: event.team_id ?? '',
        createdBy: event.created_by,
      },
    });
  };

  const selectedLabel = new Date(`${selected}T12:00:00`)
    .toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })
    .toUpperCase();

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <ScreenTitle>{t('calendar.title')}</ScreenTitle>
          <TeamBadge />
        </View>

        <MonthCalendar
          month={month}
          selected={selected}
          marks={marks}
          onSelectDay={setSelected}
          onChangeMonth={changeMonth}
        />

        <Text style={styles.dayLabel}>{selectedLabel}</Text>

        {dayEvents.length > 0 ? (
          <View style={styles.list}>
            {dayEvents.map((event, i) => (
              <Pressable
                key={event.id}
                accessibilityRole="button"
                onPress={() => openEvent(event)}
                style={[styles.row, i === dayEvents.length - 1 && { borderBottomWidth: 0 }]}
              >
                <View style={[styles.typeBar, { backgroundColor: eventTypeColor(event.type, th) }]} />
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {event.title || t(`calendar.types.${event.type}`)}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {t(`calendar.types.${event.type}`)}
                    {event.team_id ? '' : ` · ${t('calendar.personal')}`}
                  </Text>
                </View>
                <View style={styles.rowSide}>
                  <Text style={styles.rowTime}>{timeLabel(event.planned_start, i18n.language)}</Text>
                  <Text style={styles.rowDuration}>
                    {t('calendar.durationMin', { min: event.planned_duration_min })}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>{t('calendar.empty')}</Text>
        )}
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('calendar.create')}
        onPress={() => router.push({ pathname: '/event-create', params: { date: selected } })}
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
      >
        <PlusIcon color={th.onBrand} />
      </Pressable>
    </Screen>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.l,
  },
  content: { padding: spacing.screen, paddingBottom: 120 },
  dayLabel: {
    fontFamily: th.font.semibold,
    fontSize: 11,
    color: th.textMuted,
    letterSpacing: 1.4,
    marginTop: spacing.xl,
    marginBottom: spacing.m,
  },
  list: {
    backgroundColor: th.surface,
    borderWidth: 1,
    borderColor: th.border,
    borderRadius: th.radius.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: th.border,
  },
  typeBar: { width: 4, height: 36, borderRadius: 2 },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: th.font.semibold, fontSize: 15, color: th.text },
  rowMeta: { fontFamily: th.font.regular, fontSize: 12, color: th.textMuted },
  rowSide: { alignItems: 'flex-end', gap: 2 },
  rowTime: { fontFamily: th.font.semibold, fontSize: 15, color: th.text, fontVariant: ['tabular-nums'] },
  rowDuration: { fontFamily: th.font.regular, fontSize: 12, color: th.textMuted },
  empty: {
    fontFamily: th.font.regular,
    fontSize: 14,
    color: th.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.xxl,
  },
  fab: {
    position: 'absolute',
    right: spacing.screen,
    bottom: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: th.brand,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: th.brand,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
