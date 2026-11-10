// Лента уведомлений (docs/plan-notifications.md). Группы «Сегодня / Вчера / Ранее»,
// непрочитанные с акцентной точкой. Тап: отметить прочитанным и перейти туда,
// где с этим можно что-то сделать.

import { type Href, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '@/api/hooks';
import type { AppNotification } from '@/api/types';
import { BellIcon, CloseIcon } from '@/components/Icons';
import { RefreshableScroll } from '@/components/PullToRefresh';
import { Screen } from '@/components/Screen';
import { MicroLabel, ScreenTitle } from '@/components/Typography';
import { spacing, status as zone, type Theme, useStyles, useTheme } from '@/theme';

type Group = 'today' | 'yesterday' | 'earlier';

function groupOf(iso: string): Group {
  const day = new Date(iso);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (day.getTime() >= startOfToday) return 'today';
  if (day.getTime() >= startOfToday - 86_400_000) return 'yesterday';
  return 'earlier';
}

/** Куда ведёт уведомление. Событие открываем через календарь: экрану события
 *  нужны все поля из расписания, а в уведомлении только краткое описание. */
function targetOf(n: AppNotification): Href | null {
  switch (n.type) {
    case 'athlete_injury':
    case 'athlete_illness':
    case 'athlete_pain':
    case 'athlete_risk':
      return n.athlete ? { pathname: '/athlete/[id]', params: { id: n.athlete.id, name: n.athlete.name } } : null;
    case 'event_created':
    case 'event_updated':
    case 'event_cancelled':
      return '/(tabs)/calendar';
    case 'rpe_reminder':
      return '/rpe';
    case 'wellness_reminder':
      return '/wellness';
    case 'availability_changed':
      return '/(tabs)/profile';
    default:
      return null;
  }
}

/** Цвет полоски слева: красный для травмы и риска, жёлтый для боли и болезни,
 *  фирменный для расписания и напоминаний. */
function accentOf(n: AppNotification, th: Theme): string {
  if (n.type === 'athlete_injury' || n.type === 'athlete_risk') return zone.risk;
  if (n.type === 'athlete_pain' || n.type === 'athlete_illness') return zone.caution;
  if (n.type === 'event_cancelled') return th.textMuted;
  return th.brandOn;
}

export default function Notifications() {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const feed = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const [refreshing, setRefreshing] = useState(false);

  const items = useMemo(() => feed.data?.pages.flatMap((p) => p.items) ?? [], [feed.data]);
  const hasUnread = items.some((n) => n.read_at == null);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void feed.refetch().finally(() => setRefreshing(false));
  }, [feed]);

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
  const fmtEvent = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const textOf = (n: AppNotification): { title: string; body?: string } => {
    const name = n.athlete?.name || t('notifications.someone');
    const eventName = n.event ? n.event.title || t(`calendar.types.${n.event.type}`) : '';
    const when = n.event ? fmtEvent(n.event.planned_start) : '';
    switch (n.type) {
      case 'athlete_risk':
        return {
          title: t('notifications.type.athlete_risk', { name }),
          body: n.reasons.map((r) => t(`dashboard.reason.${r}`)).join(' · '),
        };
      case 'event_created':
      case 'event_updated':
      case 'event_cancelled':
      case 'rpe_reminder':
        return { title: t(`notifications.type.${n.type}`, { event: eventName }), body: when };
      case 'availability_changed':
        return {
          title: t('notifications.type.availability_changed'),
          body: n.status ? t(`coach.availability.${n.status}`) : undefined,
        };
      default:
        return { title: t(`notifications.type.${n.type}`, { name }) };
    }
  };

  const open = (n: AppNotification) => {
    if (n.read_at == null) markRead.mutate(n);
    const target = targetOf(n);
    if (target) router.push(target);
  };

  const groups: Group[] = ['today', 'yesterday', 'earlier'];

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.header}>
        <ScreenTitle>{t('notifications.title')}</ScreenTitle>
        <View style={styles.headerActions}>
          {hasUnread ? (
            <Pressable onPress={() => markAll.mutate()} hitSlop={8} accessibilityRole="button">
              <Text style={styles.readAll}>{t('notifications.readAll')}</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <CloseIcon color={th.textMuted} />
          </Pressable>
        </View>
      </View>

      {feed.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={th.brandOn} />
        </View>
      ) : feed.isError ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>{t('notifications.error')}</Text>
          <Pressable onPress={() => void feed.refetch()} hitSlop={8} accessibilityRole="button">
            <Text style={styles.readAll}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <ScrollView contentContainerStyle={styles.center}>
          <View style={styles.emptyIcon}>
            <BellIcon color={th.textMuted} size={28} />
          </View>
          <Text style={styles.emptyTitle}>{t('notifications.empty')}</Text>
          <Text style={styles.emptyHint}>{t('notifications.emptyHint')}</Text>
        </ScrollView>
      ) : (
        <RefreshableScroll refreshing={refreshing} onRefresh={onRefresh} contentContainerStyle={styles.content}>
          {groups.map((group) => {
            const inGroup = items.filter((n) => groupOf(n.created_at) === group);
            if (inGroup.length === 0) return null;
            return (
              <View key={group} style={styles.group}>
                <MicroLabel>{t(`notifications.group.${group}`)}</MicroLabel>
                <View style={styles.card}>
                  {inGroup.map((n, i) => {
                    const { title, body } = textOf(n);
                    const unread = n.read_at == null;
                    return (
                      <Pressable
                        key={n.id}
                        onPress={() => open(n)}
                        style={({ pressed }) => [
                          styles.row,
                          i < inGroup.length - 1 && styles.rowDivider,
                          pressed && styles.rowPressed,
                        ]}
                        accessibilityRole="button"
                      >
                        <View style={[styles.accent, { backgroundColor: accentOf(n, th) }]} />
                        <View style={styles.rowMain}>
                          <Text style={[styles.rowTitle, !unread && styles.rowTitleRead]} numberOfLines={2}>
                            {title}
                          </Text>
                          {body ? (
                            <Text style={styles.rowBody} numberOfLines={2}>
                              {body}
                            </Text>
                          ) : null}
                          <Text style={styles.rowTime}>{fmtTime(n.created_at)}</Text>
                        </View>
                        {unread ? <View style={styles.unreadDot} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
          {feed.hasNextPage ? (
            <Pressable
              onPress={() => void feed.fetchNextPage()}
              disabled={feed.isFetchingNextPage}
              style={styles.more}
              accessibilityRole="button"
            >
              {feed.isFetchingNextPage ? (
                <ActivityIndicator color={th.brandOn} />
              ) : (
                <Text style={styles.readAll}>{t('notifications.more')}</Text>
              )}
            </Pressable>
          ) : null}
        </RefreshableScroll>
      )}
    </Screen>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.screen,
    paddingBottom: spacing.m,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.l },
  readAll: { fontFamily: th.font.semibold, fontSize: 13, color: th.brandOn },
  content: { paddingHorizontal: spacing.screen, paddingBottom: 40, gap: spacing.l },
  group: { gap: spacing.s },
  card: {
    backgroundColor: th.surface,
    borderWidth: 1,
    borderColor: th.border,
    borderRadius: th.radius.card,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.m, paddingRight: spacing.l },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: th.border },
  rowPressed: { backgroundColor: th.surface2 },
  accent: { width: 3, alignSelf: 'stretch', borderRadius: 2, marginLeft: spacing.s, marginRight: spacing.m },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: th.font.semibold, fontSize: 14, color: th.text },
  rowTitleRead: { fontFamily: th.font.medium, color: th.textMuted },
  rowBody: { fontFamily: th.font.regular, fontSize: 13, color: th.textMuted },
  rowTime: { fontFamily: th.font.regular, fontSize: 11, color: th.low, marginTop: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: th.brandOn, marginLeft: spacing.s },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.s, padding: spacing.screen },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: th.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.s,
  },
  emptyTitle: { fontFamily: th.font.semibold, fontSize: 16, color: th.text, textAlign: 'center' },
  emptyHint: { fontFamily: th.font.regular, fontSize: 13, color: th.textMuted, textAlign: 'center' },
  more: { alignItems: 'center', paddingVertical: spacing.m },
});
