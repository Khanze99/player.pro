// Плоская навигация — 3 вкладки (дизайн-ТЗ, раздел 3).
// Жёсткий гейт: пока сессия не активна, табы не рендерятся вовсе.

import { Redirect, Tabs } from 'expo-router';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { session } from '@/auth/session';
import { ChartIcon, HomeIcon, UserIcon } from '@/components/Icons';
import { colors, font } from '@/theme';

export default function TabsLayout() {
  const { t } = useTranslation();
  const status = session((s) => s.status);

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
          title: t('tabs.home'),
          tabBarIcon: ({ color }) => <HomeIcon color={String(color)} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
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
