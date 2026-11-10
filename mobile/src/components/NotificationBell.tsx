// Колокольчик в правом верхнем углу главного экрана (docs/plan-notifications.md).
// Есть непрочитанные: красный кружок с числом («9+» сверх девяти). Нет: просто
// колокольчик, без отметок.

import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useUnreadCount } from '@/api/hooks';
import { BellIcon } from '@/components/Icons';
import { type Theme, useStyles, useTheme } from '@/theme';

export function NotificationBell() {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();
  const unread = useUnreadCount();
  const { refetch } = unread;

  // В React Native «фокус окна» сам не приходит: возврат из фона ловим вручную.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refetch();
    });
    return () => sub.remove();
  }, [refetch]);

  const count = unread.data?.count ?? 0;
  const label = count > 0 ? t('notifications.bellUnread', { count }) : t('notifications.title');

  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.bell}
    >
      <BellIcon color={count > 0 ? th.text : th.textMuted} size={22} />
      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 9 ? '9+' : String(count)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  bell: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: th.risk,
    borderWidth: 2,
    borderColor: th.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: th.font.bold, fontSize: 9, color: '#fff', lineHeight: 11 },
});
