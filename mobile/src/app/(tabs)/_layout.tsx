// Плоская навигация (дизайн-ТЗ, раздел 3): у каждой роли по 4 вкладки.
// Жёсткий гейт: пока сессия не активна, табы не рендерятся вовсе.
// Staff/админ видят Squad Status вместо игрового «Дома» и «Дашборд» вместо «Истории».

import { Redirect, Tabs } from 'expo-router';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useFeatures, useMe } from '@/api/hooks';
import { session } from '@/auth/session';
import { AppleIcon, CalendarIcon, ChartIcon, GridIcon, HomeIcon, UserIcon } from '@/components/Icons';
import { colors, font } from '@/theme';

export default function TabsLayout() {
  const { t } = useTranslation();
  const status = session((s) => s.status);
  const me = useMe(status === 'active');
  const features = useFeatures(status === 'active');
  const isStaff = me.data != null && me.data.global_role !== 'player';

  if (status === 'loading') return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (status === 'signedOut') return <Redirect href="/(auth)/welcome" />;
  if (status === 'onboarding') return <Redirect href="/(auth)/profile-setup" />;
  if (status === 'locked') return <Redirect href="/(auth)/pin" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 84,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontFamily: font.semibold, fontSize: 10, letterSpacing: 0.6 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: isStaff ? t('tabs.squad') : t('tabs.home'),
          tabBarIcon: ({ color }) => <HomeIcon color={String(color)} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: t('tabs.calendar'),
          tabBarIcon: ({ color }) => <CalendarIcon color={String(color)} />,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          href: isStaff ? undefined : null,
          title: t('tabs.dashboard'),
          tabBarIcon: ({ color }) => <GridIcon color={String(color)} />,
        }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{
          // Дневник — личный: у staff его нет. Плюс фича-флаг с сервера.
          href: !isStaff && features.data?.nutrition ? undefined : null,
          title: t('tabs.nutrition'),
          tabBarIcon: ({ color }) => <AppleIcon color={String(color)} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          href: isStaff ? null : undefined,
          title: t('tabs.history'),
          tabBarIcon: ({ color }) => <ChartIcon color={String(color)} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color }) => <UserIcon color={String(color)} />,
        }}
      />
    </Tabs>
  );
}
