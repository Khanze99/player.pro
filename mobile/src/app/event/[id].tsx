// Карточка события: детали, посещаемость (штаб отмечает присутствие игроков — ТЗ 3.5),
// удаление менеджером события. Данные приходят параметрами из календаря.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ApiError } from '@/api/client';
import { useAttendance, useDeleteEvent, useMe, useSetAttendance, useTeamMembers } from '@/api/hooks';
import type { AttendanceStatus, EventType } from '@/api/types';
import { Chip } from '@/components/Chip';
import { CloseIcon, EditIcon, TrashIcon } from '@/components/Icons';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { MicroLabel, ScreenTitle } from '@/components/Typography';
import { eventTypeColor, spacing, type Theme, useStyles, useTheme } from '@/theme';

const STATUSES: readonly AttendanceStatus[] = ['present', 'absent', 'excused'];

function statusColor(status: AttendanceStatus, th: Theme): string {
  switch (status) {
    case 'present':
      return th.good;
    case 'absent':
      return th.risk;
    case 'excused':
      return th.caution;
  }
}

export default function EventDetail() {
  const th = useTheme();
  const styles = useStyles(makeStyles);
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

  const runDelete = () => {
    deleteEvent.mutate(params.id, {
      onSuccess: () => {
        toast(t('eventDetail.deleted'));
        router.back();
      },
      // Раньше тут не было onError — ошибка (в т.ч. прежний баг с FK на
      // отметках посещаемости/RPE) проходила молча, выглядело как
      // «не удаляется», хотя запрос реально падал.
      onError: (e) => toast(e instanceof ApiError ? e.detail : t('common.noConnection')),
    });
  };

  const confirmDelete = () => {
    // react-native-web (0.21) не реализует Alert.alert — пустая функция,
    // без диалога и без колбэка. На вебе кнопка «Удалить» внутри Alert
    // просто никогда не существовала — запрос не уходил вообще, не только
    // молча падал. window.confirm — штатный веб-паттерн, не редизайн.
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(t('eventDetail.deleteConfirm'))) runDelete();
      return;
    }
    Alert.alert(t('eventDetail.deleteTitle'), t('eventDetail.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('eventDetail.delete'), style: 'destructive', onPress: runDelete },
    ]);
  };

  const editEvent = () => {
    router.push({
      pathname: '/event-create',
      params: {
        id: params.id,
        type: params.type,
        title: params.title,
        start: params.start,
        duration: params.duration,
        teamId: params.teamId,
      },
    });
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
            <CloseIcon color={th.textMuted} />
          </Pressable>
        </View>

        <View style={styles.meta}>
          <Chip label={t(`calendar.types.${params.type}`)} dotColor={eventTypeColor(params.type, th)} />
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
                          const color = statusColor(status, th);
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
          <View style={styles.manageRow}>
            <Pressable
              accessibilityRole="button"
              onPress={editEvent}
              style={({ pressed }) => [styles.manageButton, pressed && { opacity: 0.7 }]}
            >
              <EditIcon color={th.text} />
              <Text style={styles.editText}>{t('eventDetail.edit')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={confirmDelete}
              style={({ pressed }) => [styles.manageButton, pressed && { opacity: 0.7 }]}
            >
              <TrashIcon color={th.risk} />
              <Text style={styles.deleteText}>{t('eventDetail.delete')}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  content: { padding: spacing.screen, gap: spacing.xl, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerMain: { flex: 1, paddingRight: spacing.m },
  date: {
    fontFamily: th.font.semibold,
    fontSize: 11,
    color: th.textMuted,
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  close: { padding: spacing.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.m },
  metaText: { fontFamily: th.font.medium, fontSize: 14, color: th.textMuted },
  section: { gap: spacing.s },
  list: {
    backgroundColor: th.surface,
    borderWidth: 1,
    borderColor: th.border,
    borderRadius: th.radius.card,
  },
  row: {
    gap: spacing.s,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: th.border,
  },
  rowName: { fontFamily: th.font.semibold, fontSize: 15, color: th.text },
  statusRow: { flexDirection: 'row', gap: spacing.s },
  statusChip: {
    flex: 1,
    paddingVertical: spacing.s,
    borderRadius: th.radius.chip,
    backgroundColor: th.surface2,
    borderWidth: 1,
    borderColor: th.border,
    alignItems: 'center',
  },
  statusText: { fontFamily: th.font.medium, fontSize: 12, color: th.textMuted },
  // заливка чипа — статусный цвет, а он темой не подменяется
  statusTextActive: { color: '#FFFFFF', fontFamily: th.font.semibold },
  emptyText: { fontFamily: th.font.regular, fontSize: 14, color: th.textMuted },
  manageRow: { flexDirection: 'row', gap: spacing.m },
  manageButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s,
    minHeight: 52,
    borderRadius: th.radius.control,
    borderWidth: 1,
    borderColor: th.border,
    backgroundColor: th.surface,
  },
  editText: { fontFamily: th.font.semibold, fontSize: 15, color: th.text },
  deleteText: { fontFamily: th.font.semibold, fontSize: 15, color: th.risk },
});
