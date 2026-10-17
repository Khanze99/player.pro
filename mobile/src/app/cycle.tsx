// Цикл — минимальный трекинг (решение 2026-10-16, docs/plan-women-health-nutrition.md).
// Экран — только настройки (длина цикла, длина месячных) и ссылка «кто видит».
// Сама отметка «сегодня месячные» + болевой порог ставится в утреннем опросе
// (wellness.tsx), а не здесь — отдельного календаря на этом экране больше нет:
// отмеченные дни видны в основном календаре (неяркая красная подложка ячейки,
// см. MonthCalendar.periodDays), решение той же датой.
//
// Отдельного шага «включить трекинг» больше нет (решение 2026-10-17): трекинг
// всегда доступен, настройки показываются сразу — день либо отмечается, либо нет.

import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useCycleSettings, useUpdateCycleSettings } from '@/api/hooks';
import { CloseIcon } from '@/components/Icons';
import { Screen } from '@/components/Screen';
import { Stepper } from '@/components/Stepper';
import { MicroLabel, ScreenTitle } from '@/components/Typography';
import { spacing, type Theme, useStyles, useTheme } from '@/theme';

function SettingsCard() {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();
  const settings = useCycleSettings();
  const update = useUpdateCycleSettings();

  return (
    <View style={styles.card}>
      <MicroLabel>{t('cycle.settings')}</MicroLabel>

      <Text style={styles.cardHint}>{t('cycle.averageCycleLength')}</Text>
      <Stepper
        value={settings.data?.average_cycle_length ?? 28}
        onChange={(v) => update.mutate({ average_cycle_length: v })}
        step={1}
        min={21}
        max={45}
      />

      <Text style={styles.cardHint}>{t('cycle.averagePeriodLength')}</Text>
      <Stepper
        value={settings.data?.average_period_length ?? 5}
        onChange={(v) => update.mutate({ average_period_length: v })}
        step={1}
        min={1}
        max={10}
      />

      <Pressable style={styles.privacyLink} onPress={() => router.push('/privacy')}>
        <Text style={styles.privacyText}>{t('cycle.whoSees')}</Text>
      </Pressable>
    </View>
  );
}

export default function Cycle() {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <ScreenTitle>{t('cycle.title')}</ScreenTitle>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={styles.close}
          >
            <CloseIcon color={th.textMuted} />
          </Pressable>
        </View>

        <SettingsCard />
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  content: { padding: spacing.screen, gap: spacing.l, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  close: { padding: spacing.xs },

  card: {
    backgroundColor: th.surface,
    borderWidth: 1,
    borderColor: th.border,
    borderRadius: th.radius.card,
    padding: spacing.l,
    gap: spacing.m,
  },
  cardHint: { fontFamily: th.font.regular, fontSize: 13, color: th.textMuted, lineHeight: 18 },

  privacyLink: { paddingVertical: spacing.s },
  privacyText: { fontFamily: th.font.medium, fontSize: 13, color: th.brandOn },
});
