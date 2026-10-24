// Кастомный рендер таббара (docs/plan-home-tab-fab.md): вкладка «Дом»/«Состав»
// (index) — приподнятый круг с акцентной заливкой, а не рядовая иконка в сетке.
// Полностью заменяет собой react-navigation's BottomTabBar, поэтому берёт на
// себя всё, что раньше делал Tabs.screenOptions (фон бара, цвета табов,
// высоту с учётом insets) — эти опции в _layout.tsx больше не читаются.

import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Tabs } from 'expo-router';

import { spacing, type Theme, useStyles, useTheme } from '../theme';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];
type RouteItem = TabBarProps['state']['routes'][number];

// См. комментарий у старого TAB_BAR_BASE_HEIGHT в _layout.tsx: это высота
// содержимого бара без нижнего safe-area, insets.bottom прибавляем сами.
const BASE_HEIGHT = 60;
const FAB_SIZE = 58;
const FAB_LIFT = 14;

export function HomeTabBar({ state, descriptors, navigation, insets }: TabBarProps) {
  const th = useTheme();
  const styles = useStyles(makeStyles);

  const homeIndex = state.routes.findIndex((r) => r.name === 'index');
  const homeRoute = state.routes[homeIndex];
  // href: null у Tabs.Screen превращается не в исключение маршрута из
  // state.routes, а в tabBarItemStyle: {display:'none'} (см. TabsClient.js) —
  // это читает только дефолтный BottomTabBar, который мы здесь не используем,
  // так что скрытые вкладки нужно отфильтровать по этому же признаку самим.
  const visible = state.routes.filter((r) => {
    if (r.key === homeRoute?.key) return false;
    const flat = StyleSheet.flatten(descriptors[r.key].options.tabBarItemStyle);
    return flat?.display !== 'none';
  });
  const mid = Math.ceil(visible.length / 2);
  const left = visible.slice(0, mid);
  const right = visible.slice(mid);

  const go = (route: RouteItem) => {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true } as never);
    if (!(event as { defaultPrevented?: boolean }).defaultPrevented) {
      navigation.navigate(route.name as never);
    }
  };

  const renderItem = (route: RouteItem) => {
    const { options } = descriptors[route.key];
    const focused = state.routes[state.index]?.key === route.key;
    const color = focused ? th.brandOn : th.textMuted;
    return (
      <Pressable
        key={route.key}
        onPress={() => go(route)}
        accessibilityRole="button"
        accessibilityState={focused ? { selected: true } : {}}
        accessibilityLabel={typeof options.title === 'string' ? options.title : route.name}
        style={styles.item}
      >
        {options.tabBarIcon?.({ color, focused, size: 24 })}
        <Text style={[styles.label, { color }]} numberOfLines={1}>
          {options.title}
        </Text>
      </Pressable>
    );
  };

  if (!homeRoute) return null;
  const homeOptions = descriptors[homeRoute.key].options;
  const homeFocused = state.index === homeIndex;
  const homeLabel = typeof homeOptions.title === 'string' ? homeOptions.title : homeRoute.name;

  return (
    <View style={[styles.bar, { height: BASE_HEIGHT + insets.bottom, paddingBottom: insets.bottom }]}>
      <View style={styles.side}>{left.map(renderItem)}</View>
      <View style={styles.centerGap} />
      <View style={styles.side}>{right.map(renderItem)}</View>

      <View style={styles.fabSlot} pointerEvents="box-none">
        <Pressable
          onPress={() => go(homeRoute)}
          accessibilityRole="button"
          accessibilityState={homeFocused ? { selected: true } : {}}
          accessibilityLabel={homeLabel}
          style={({ pressed }) => [styles.fabWrap, pressed && styles.fabPressed]}
        >
          {homeFocused ? (
            <LinearGradient
              colors={th.gradients.brand}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.fab}
            >
              {homeOptions.tabBarIcon?.({ color: th.onBrand, focused: true, size: 26 })}
            </LinearGradient>
          ) : (
            <View style={[styles.fab, styles.fabInactive]}>
              {homeOptions.tabBarIcon?.({ color: th.textMuted, focused: false, size: 26 })}
            </View>
          )}
        </Pressable>
        <Text style={[styles.label, { color: homeFocused ? th.brand : th.textMuted }]} numberOfLines={1}>
          {homeLabel}
        </Text>
      </View>
    </View>
  );
}

const makeStyles = (th: Theme) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      backgroundColor: th.surface,
      borderTopWidth: 1,
      borderTopColor: th.border,
      paddingTop: 8,
    },
    side: { flex: 1, flexDirection: 'row', justifyContent: 'space-evenly' },
    centerGap: { width: FAB_SIZE + spacing.m },
    item: { alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 48 },
    label: { fontFamily: th.font.semibold, fontSize: 10, letterSpacing: 0.6 },
    fabSlot: {
      position: 'absolute',
      top: -FAB_LIFT,
      left: 0,
      right: 0,
      alignItems: 'center',
      gap: 4,
    },
    fabWrap: {
      borderRadius: FAB_SIZE / 2,
      shadowColor: th.brand,
      shadowOpacity: 0.35,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    fabPressed: { transform: [{ scale: 0.96 }] },
    fab: {
      width: FAB_SIZE,
      height: FAB_SIZE,
      borderRadius: FAB_SIZE / 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fabInactive: {
      backgroundColor: th.surface2,
      borderWidth: 1,
      borderColor: th.border,
    },
  });
