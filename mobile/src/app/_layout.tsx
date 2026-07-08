import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { Unbounded_600SemiBold } from '@expo-google-fonts/unbounded';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

import '@/i18n';
import { refreshAccessToken } from '@/api/client';
import { flushQueue } from '@/api/hooks';
import { bootstrapSession, session } from '@/auth/session';
import { ToastHost } from '@/components/Toast';
import { colors } from '@/theme';

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function AuthGate() {
  const status = session((s) => s.status);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    void bootstrapSession();
  }, []);

  // Офлайн-очередь: пробуем отправить накопленное при возврате в приложение
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && session.getState().status === 'active') void flushQueue();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (status === 'loading') return;
    void SplashScreen.hideAsync();
    const inAuth = segments[0] === '(auth)';
    if (status === 'active') {
      if (inAuth) router.replace('/');
      return;
    }
    if (status === 'signedOut') {
      router.replace('/(auth)/welcome');
    } else if (status === 'onboarding') {
      // Приложение перезапустили посреди онбординга: access-токена в памяти нет
      if (!session.getState().accessToken) void refreshAccessToken();
      router.replace('/(auth)/profile-setup');
    } else {
      router.replace('/(auth)/pin');
    }
    // segments намеренно не в зависимостях: реагируем только на смену статуса сессии
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return null;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Unbounded_600SemiBold,
  });

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <QueryClientProvider client={queryClient}>
        <AuthGate />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="wellness" options={{ presentation: 'modal' }} />
          <Stack.Screen name="rpe" options={{ presentation: 'modal' }} />
        </Stack>
        <ToastHost />
        <StatusBar style="light" />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
