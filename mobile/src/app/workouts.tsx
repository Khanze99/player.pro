// Мои тренировки: шаблоны личного режима (docs/plan-workout-builder.md).
// Вход из профиля под флагом features.workouts; без флага экран не показываем
// и бэкенд всё равно ответит 404.

import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useActiveSession, useFeatures, useMyWorkouts } from '@/api/hooks';
import { Button } from '@/components/Button';
import { ChevronIcon, CloseIcon } from '@/components/Icons';
import { Screen } from '@/components/Screen';
import { ScreenTitle } from '@/components/Typography';
import { spacing, type Theme, useStyles, useTheme } from '@/theme';

export default function Workouts() {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();

  const features = useFeatures();
  const enabled = features.data?.workouts === true;
  const workouts = useMyWorkouts(enabled);
  const active = useActiveSession(enabled);

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <ScreenTitle>{t('workouts.title')}</ScreenTitle>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            style={styles.close}
          >
            <CloseIcon color={th.textMuted} />
          </Pressable>
        </View>

        {active.data ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/workout-run', params: { id: active.data!.id } })}
            style={({ pressed }) => [styles.active, pressed && { opacity: 0.8 }]}
          >
            <View style={styles.rowMain}>
              <Text style={styles.activeLabel}>{t('workoutRun.activeBanner')}</Text>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {active.data.workout_name}
              </Text>
            </View>
            <Text style={styles.link}>{t('workoutRun.continue')}</Text>
          </Pressable>
        ) : null}

        {features.isPending || (enabled && workouts.isPending) ? (
          <ActivityIndicator color={th.textMuted} />
        ) : !enabled ? (
          <Text style={styles.hint}>{t('workouts.unavailable')}</Text>
        ) : workouts.isError ? (
          <View style={styles.state}>
            <Text style={styles.error}>{t('workouts.loadFailed')}</Text>
            <Pressable accessibilityRole="button" onPress={() => void workouts.refetch()}>
              <Text style={styles.link}>{t('common.retry')}</Text>
            </Pressable>
          </View>
        ) : (workouts.data?.length ?? 0) === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{t('workouts.emptyTitle')}</Text>
            <Text style={styles.hint}>{t('workouts.emptyText')}</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {workouts.data?.map((w, i, all) => (
              <Pressable
                key={w.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/workout-edit', params: { id: w.id } })}
                style={({ pressed }) => [
                  styles.row,
                  i === all.length - 1 && { borderBottomWidth: 0 },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {w.name}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {t('workouts.exercisesCount', { count: w.items_count })} ·{' '}
                    {t('workouts.aboutMin', { n: w.est_duration_min })}
                  </Text>
                </View>
                <ChevronIcon color={th.textMuted} />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
      {enabled ? (
        <View style={styles.footer}>
          <Button title={t('workouts.create')} onPress={() => router.push('/workout-edit')} />
        </View>
      ) : null}
    </Screen>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  content: { padding: spacing.screen, gap: spacing.l, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  close: { padding: spacing.xs },
  hint: { fontFamily: th.font.regular, fontSize: 14, color: th.textMuted, lineHeight: 20 },
  error: { fontFamily: th.font.medium, fontSize: 13, color: th.risk },
  link: { fontFamily: th.font.semibold, fontSize: 13, color: th.brandOn },
  state: { gap: spacing.s },
  empty: {
    gap: spacing.s,
    padding: spacing.xl,
    backgroundColor: th.surface,
    borderWidth: 1,
    borderColor: th.border,
    borderRadius: th.radius.card,
  },
  active: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    padding: spacing.l,
    borderRadius: th.radius.card,
    borderWidth: 1,
    borderColor: th.brandOn,
    backgroundColor: th.surface,
  },
  activeLabel: {
    fontFamily: th.font.semibold,
    fontSize: 11,
    color: th.brandOn,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  emptyTitle: { fontFamily: th.font.semibold, fontSize: 16, color: th.text },
  list: {
    backgroundColor: th.surface,
    borderWidth: 1,
    borderColor: th.border,
    borderRadius: th.radius.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: th.border,
  },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: th.font.semibold, fontSize: 15, color: th.text },
  rowMeta: { fontFamily: th.font.regular, fontSize: 12, color: th.textMuted },
  footer: { padding: spacing.screen },
});
