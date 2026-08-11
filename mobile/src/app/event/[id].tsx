// Карточка события: детали, посещаемость (штаб отмечает присутствие игроков — ТЗ 3.5),
// удаление менеджером события. Данные приходят параметрами из календаря.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAttendance, useDeleteEvent, useMe, useSetAttendance, useTeamMembers } from '@/api/hooks';
import type { AttendanceStatus, EventType } from '@/api/types';
import { Chip } from '@/components/Chip';
import { CloseIcon, TrashIcon } from '@/components/Icons';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { MicroLabel, ScreenTitle } from '@/components/Typography';
import { colors, eventTypeColor, font, radius, spacing } from '@/theme';

const STATUSES: readonly AttendanceStatus[] = ['present', 'absent', 'excused'];

function statusColor(status: AttendanceStatus): string {
  switch (status) {
    case 'present':
      return colors.good;
    case 'absent':
      return colors.risk;
    case 'excused':
      return colors.caution;
  }
}

export default function EventDetail() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const toast = useToast((s) => s.show);
  const params = useLocalSearchParams<{
    id: string;
    type: EventType;
    title: string;
    start: string;
    duration: string;
    teamId: string;
    createdBy: string;
  }>();

  const me = useMe();
  const isStaff = me.data != null && me.data.global_role !== 'player';
  const isTeamEvent = params.teamId !== '';
  const showAttendance = isTeamEvent && isStaff;
  const canManage = (isTeamEvent && isStaff) || (!isTeamEvent && me.data?.id === params.createdBy);

  const members = useTeamMembers(showAttendance ? params.teamId : null);
  const attendance = useAttendance(params.id, showAttendance);
  const setAttendance = useSetAttendance(params.id);
  const deleteEvent = useDeleteEvent();

  const athletes = (members.data ?? []).filter((m) => m.team_role === 'athlete');
  const statusByUser = new Map((attendance.data ?? []).map((a) => [a.user_id, a.status]));

  const start = new Date(params.start);
  const dateLabel = start
    .toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })
    .toUpperCase();
  const timeLabel = start.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });

  const confirmDelete = () => {
    Alert.alert(t('eventDetail.deleteTitle'), t('eventDetail.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('eventDetail.delete'),
        style: 'destructive',
        onPress: () =>
          deleteEvent.mutate(params.id, {
            onSuccess: () => {
              toast(t('eventDetail.deleted'));
              router.back();
            },
          }),
      },
    ]);
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerMain}>
            <Text style={styles.date}>{dateLabel}</Text>
            <ScreenTitle>{params.title || t(`calendar.types.${params.type}`)}</ScreenTitle>
          </View>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            style={styles.close}
          >
            <CloseIcon color={colors.textMuted} />
          </Pressable>
        </View>

        <View style={styles.meta}>
          <Chip label={t(`calendar.types.${params.type}`)} dotColor={eventTypeColor(params.type)} />
          <Text style={styles.metaText}>
            {timeLabel} · {t('calendar.durationMin', { min: params.duration })}
          </Text>
        </View>

        {showAttendance && (
          <View style={styles.section}>
            <MicroLabel>{t('eventDetail.attendance')}</MicroLabel>
            {athletes.length === 0 ? (
              <Text style={styles.emptyText}>{t('coach.empty')}</Text>
            ) : (
              <View style={styles.list}>
                {athletes.map((athlete, i) => {
                  const current = statusByUser.get(athlete.user_id);
                  return (
                    <View
                      key={athlete.user_id}
                      style={[styles.row, i === athletes.length - 1 && { borderBottomWidth: 0 }]}
                    >
                      <Text style={styles.rowName} numberOfLines={1}>
                        {athlete.name}
                      </Text>
                      <View style={styles.statusRow}>
                        {STATUSES.map((status) => {
                          const active = current === status;
                          const color = statusColor(status);
                          return (
                            <Pressable
                              key={status}
                              accessibilityRole="button"
                              accessibilityState={{ selected: active }}
                              onPress={() =>
                                setAttendance.mutate({ user_id: athlete.user_id, status })
                              }
                              style={[
                                styles.statusChip,
                                active && { backgroundColor: color, borderColor: color },
                              ]}
                            >
                              <Text style={[styles.statusText, active && styles.statusTextActive]}>
                                {t(`eventDetail.status.${status}`)}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {canManage && (
          <Pressable
            accessibilityRole="button"
            onPress={confirmDelete}
            style={({ pressed }) => [styles.deleteRow, pressed && { opacity: 0.7 }]}
          >
            <TrashIcon color={colors.risk} />
            <Text style={styles.deleteText}>{t('eventDetail.delete')}</Text>
          </Pressable>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.screen, gap: spacing.xl, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerMain: { flex: 1, paddingRight: spacing.m },
  date: {
    fontFamily: font.semibold,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  close: { padding: spacing.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.m },
  metaText: { fontFamily: font.medium, fontSize: 14, color: colors.textMuted },
  section: { gap: spacing.s },
  list: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
  },
  row: {
    gap: spacing.s,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowName: { fontFamily: font.semibold, fontSize: 15, color: colors.text },
  statusRow: { flexDirection: 'row', gap: spacing.s },
  statusChip: {
    flex: 1,
    paddingVertical: spacing.s,
    borderRadius: radius.chip,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  statusText: { fontFamily: font.medium, fontSize: 12, color: colors.textMuted },
  statusTextActive: { color: '#FFFFFF', fontFamily: font.semibold },
  emptyText: { fontFamily: font.regular, fontSize: 14, color: colors.textMuted },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s,
    minHeight: 52,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  deleteText: { fontFamily: font.semibold, fontSize: 15, color: colors.risk },
});
