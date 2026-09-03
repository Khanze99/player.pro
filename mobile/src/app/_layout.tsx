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
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

import { ThemeProvider, useTheme } from '@/theme';
import '@/i18n';
import { api, refreshAccessToken } from '@/api/client';
import type { Me } from '@/api/types';
import { bootstrapSession, isNewUser, session } from '@/auth/session';
import { ToastHost } from '@/components/Toast';

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

  useEffect(() => {
    if (status === 'loading') return;
    void SplashScreen.hideAsync();
    const inAuth = segments[0] === '(auth)';
    if (status === 'active') {
      if (inAuth) router.replace('/');
      return;
    }
    // Регистрацию (имя → организация) показываем только тому, у кого аккаунта
    // до этого не было: «новизну» сообщает сервер в ответе на верификацию OTP.
    // Возвращающийся — ставит PIN на этом устройстве и идёт в приложение, даже
    // если ФИО у него не заполнено: это правка профиля, а не повторный вход.
    const routeOnboarding = async () => {
      // Приложение перезапустили посреди онбординга: access-токена в памяти нет
      if (!session.getState().accessToken) await refreshAccessToken();
      let target: '/(auth)/consent' | '/(auth)/profile-setup' | '/(auth)/pin-setup' = '/(auth)/pin-setup';
      if (await isNewUser()) {
        // Безопасный дефолт для нового пользователя — самый ранний незавершённый шаг:
        // без обоих согласий (152-ФЗ, docs/plan-onboarding-consent.md) дальше пускать нельзя,
        // сервер и сам это отклонит на любом эндпоинте кроме auth/consents.
        target = '/(auth)/consent';
        try {
          const me = await api<Me>('/auth/me');
          if (me.terms_accepted && me.health_consent_accepted) {
            // Согласия уже даны — приглашённому админ мог задать ФИО, тогда спрашивать нечего
            target = me.last_name && me.first_name ? '/(auth)/pin-setup' : '/(auth)/profile-setup';
          }
        } catch {
          // сеть недоступна — оставляем самый ранний шаг
        }
      }
      // Статус мог смениться, пока ждали сеть (например, signOut по 401)
      if (session.getState().status === 'onboarding') router.replace(target);
    };

    if (status === 'signedOut') {
      router.replace('/(auth)/welcome');
    } else if (status === 'onboarding') {
      void routeOnboarding();
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
        <ThemeProvider>
          <AppStack />
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

// Тема организации приезжает с сервера после логина (docs/plan-org-branding.md,
// этап 2); пока провайдер отдаёт тему продукта по умолчанию.
function AppStack() {
  const th = useTheme();

  return (
    <>
      <AuthGate />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: th.bg },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="wellness" options={{ presentation: 'modal' }} />
        <Stack.Screen name="rpe" options={{ presentation: 'modal' }} />
        <Stack.Screen name="invite" options={{ presentation: 'modal' }} />
        <Stack.Screen name="event-create" options={{ presentation: 'modal' }} />
        <Stack.Screen name="event/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="food-add" options={{ presentation: 'modal' }} />
        <Stack.Screen name="food-create" options={{ presentation: 'modal' }} />
        <Stack.Screen name="privacy" options={{ presentation: 'modal' }} />
        <Stack.Screen name="terms" options={{ presentation: 'modal' }} />
        <Stack.Screen name="privacy-policy" options={{ presentation: 'modal' }} />
        <Stack.Screen name="cycle" options={{ presentation: 'modal' }} />
      </Stack>
      <ToastHost />
      <StatusBar style="light" />
    </>
  );
}
