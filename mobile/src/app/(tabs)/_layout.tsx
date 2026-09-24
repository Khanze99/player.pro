// Плоская навигация (дизайн-ТЗ, раздел 3): у каждой роли по 4 вкладки.
// Жёсткий гейт: пока сессия не активна, табы не рендерятся вовсе.
// Staff/админ видят Squad Status вместо игрового «Дома» и «Дашборд» вместо «Истории».

import { Redirect, Tabs } from 'expo-router';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';
import { useFeatures, useMe } from '@/api/hooks';
import { session } from '@/auth/session';
import { AppleIcon, CalendarIcon, ChartIcon, GridIcon, HomeIcon, UserIcon } from '@/components/Icons';

// Базовая высота содержимого бара (иконка + подпись + внутренние отступы),
// без учёта нижнего safe-area. На нативе react-navigation сам добавляет
// insets.bottom к паддингу контента, но только если высота бара не задана
// числом жёстко — а нам это нужно, чтобы контролировать дизайн. Поэтому
// insets.bottom прибавляем к базовой высоте сами, иначе на вебе (Safari
// на iPhone без Home-кнопки, где safe-area-inset-bottom может включать ещё
// и панель браузера) подпись выталкивается за пределы фиксированной высоты
// и остаётся видна только иконка.
const TAB_BAR_BASE_HEIGHT = 60;

export default function TabsLayout() {
  const th = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const status = session((s) => s.status);
  const me = useMe(status === 'active');
  const features = useFeatures(status === 'active');
  const isStaff = me.data != null && me.data.global_role !== 'player';

  if (status === 'loading') return <View style={{ flex: 1, backgroundColor: th.bg }} />;
  if (status === 'signedOut') return <Redirect href="/(auth)/welcome" />;
  if (status === 'onboarding') return <Redirect href="/(auth)/profile-setup" />;
  if (status === 'locked') return <Redirect href="/(auth)/pin" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: th.surface,
          borderTopColor: th.border,
          height: TAB_BAR_BASE_HEIGHT + insets.bottom,
          paddingTop: 8,
        },
        tabBarActiveTintColor: th.brandOn,
        tabBarInactiveTintColor: th.textMuted,
        tabBarLabelStyle: { fontFamily: th.font.semibold, fontSize: 10, letterSpacing: 0.6 },
        sceneStyle: { backgroundColor: th.bg },
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
