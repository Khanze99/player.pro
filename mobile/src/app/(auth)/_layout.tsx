import { Stack } from 'expo-router';

import { useTheme } from '@/theme';


export default function AuthLayout() {
  const th = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: th.bg } }} />
  );
}
