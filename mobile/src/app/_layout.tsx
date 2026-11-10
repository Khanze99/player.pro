import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { Unbounded_600SemiBold } from '@expo-google-fonts/unbounded';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

import { ThemeProvider, useTheme } from '@/theme';
import '@/i18n';
import { api, refreshAccessToken } from '@/api/client';
import { queryClient } from '@/api/queryClient';
import type { Me } from '@/api/types';
import { hydrateActiveTeam } from '@/auth/activeTeam';
import { bootstrapSession, isNewUser, session } from '@/auth/session';
import { PulseLoader } from '@/components/PulseLoader';
import { ToastHost } from '@/components/Toast';

void SplashScreen.preventAutoHideAsync();

type OnboardingTarget = '/(auth)/consent' | '/(auth)/profile-setup' | '/(auth)/sex-select' | '/(auth)/pin-setup';

function AuthGate() {
  const status = session((s) => s.status);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    void bootstrapSession();
    void hydrateActiveTeam();
  }, []);

  useEffect(() => {
    if (status === 'loading') return;
    const inAuth = segments[0] === '(auth)';
    // replace из корневого лейаута пересоздаёт его целиком (expo-router 57), гейт
    // монтируется заново и снова видит тот же статус. Без этой проверки он бы
    // бесконечно заменял экран сам на себя: «Maximum update depth exceeded».
    const current = `/${segments.join('/')}`;
    const go = (target: '/(auth)/welcome' | '/(auth)/pin' | OnboardingTarget) => {
      if (current !== target) router.replace(target);
    };
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
      let target: OnboardingTarget = '/(auth)/pin-setup';
      if (await isNewUser()) {
        // Безопасный дефолт для нового пользователя — самый ранний незавершённый шаг:
        // без обоих согласий (152-ФЗ, docs/plan-onboarding-consent.md) дальше пускать нельзя,
        // сервер и сам это отклонит на любом эндпоинте кроме auth/consents.
        target = '/(auth)/consent';
        try {
          const me = await api<Me>('/auth/me');
          if (me.terms_accepted && me.health_consent_accepted) {
            // Согласия даны. Приглашённому админ мог задать ФИО — тогда пропускаем
            // шаг имени, но не шаг пола: он обязателен для всех новых (docs/plan-profile.md).
            target = me.last_name && me.first_name ? '/(auth)/sex-select' : '/(auth)/profile-setup';
          }
        } catch {
          // сеть недоступна — оставляем самый ранний шаг
        }
      }
      // Статус мог смениться, пока ждали сеть (например, signOut по 401)
      if (session.getState().status === 'onboarding') go(target);
    };

    if (status === 'signedOut') {
      go('/(auth)/welcome');
    } else if (status === 'onboarding') {
      void routeOnboarding();
    } else {
      go('/(auth)/pin');
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

  // На вебе не ждём шрифты отдельно: системный фолбэк в теме уже покрывает
  // первый кадр, а Google-шрифты подтягиваются следом.
  const fontsReady = fontsLoaded || Platform.OS === 'web';

  return (
    // GestureDetector (PullToRefresh.tsx) требует предка GestureHandlerRootView
    // во всём дереве — без него жесты не распознаются вообще (не только pull-to-refresh).
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AppStack fontsReady={fontsReady} />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Тема организации приезжает с сервера после логина (docs/plan-org-branding.md,
// этап 2); пока провайдер отдаёт тему продукта по умолчанию.
//
// Сплэш (docs/plan-pulse-loader.md) отдаём сразу на первом рендере этого
// дерева — не ждём ни шрифты, ни статус сессии, как раньше. Нативную
// картинку сплэша анимировать нельзя (это системная картинка, не RN-дерево),
// поэтому дальше паузу рисуем сами: пока не готовы шрифты или не решён
// статус сессии (bootstrapSession в AuthGate), вместо Stack показываем
// полноэкранный PulseLoader на фоне темы.
function AppStack({ fontsReady }: { fontsReady: boolean }) {
  const th = useTheme();
  const status = session((s) => s.status);
  const ready = fontsReady && status !== 'loading';

  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <>
      <AuthGate />
      {ready ? (
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
          <Stack.Screen name="notifications" options={{ presentation: 'modal' }} />
          <Stack.Screen name="delete-account" options={{ presentation: 'modal' }} />
          <Stack.Screen name="legal/[doc]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="cycle" options={{ presentation: 'modal' }} />
          <Stack.Screen name="workouts" options={{ presentation: 'modal' }} />
          <Stack.Screen name="workout-edit" options={{ presentation: 'modal' }} />
          <Stack.Screen name="exercise-picker" options={{ presentation: 'modal' }} />
          <Stack.Screen name="exercise/[id]" options={{ presentation: 'modal' }} />
        </Stack>
      ) : (
        <View style={[styles.loading, { backgroundColor: th.bg }]}>
          <PulseLoader size={96} />
        </View>
      )}
      <ToastHost />
      <StatusBar style="light" />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
