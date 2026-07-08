// RPE после события (дизайн-ТЗ 5.4): шкала CR10, самооценка 1–5, длительность,
// живой предпросмотр session load = RPE × мин.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ApiError } from '@/api/client';
import { todayISO, useSubmitRpe } from '@/api/hooks';
import { Button } from '@/components/Button';
import { RpeScale } from '@/components/RpeScale';
import { ScaleRow } from '@/components/ScaleRow';
import { Screen } from '@/components/Screen';
import { Stepper } from '@/components/Stepper';
import { useToast } from '@/components/Toast';
import { ScreenTitle } from '@/components/Typography';
import { colors, font, spacing } from '@/theme';

export default function Rpe() {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast((s) => s.show);
  const submit = useSubmitRpe();

  const [exertion, setExertion] = useState<number | null>(null);
  const [performance, setPerformance] = useState<number | null>(null);
  const [duration, setDuration] = useState(60);

  const sessionLoad = exertion !== null ? exertion * duration : null;
  const complete = exertion !== null && performance !== null;

  const save = async () => {
    try {
      const sent = await submit.mutateAsync({
        date: todayISO(),
        exertion: exertion!,
        performance: performance!,
        duration_min: duration,
      });
      toast(sent ? t('common.saved') : t('common.offlineSaved'));
      router.back();
    } catch (e) {
      toast(e instanceof ApiError ? e.detail : t('common.retry'));
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenTitle style={{ marginBottom: spacing.xl }}>{t('rpe.title')}</ScreenTitle>

        <Text style={styles.sectionLabel}>{t('rpe.exertion')}</Text>
        <RpeScale
          value={exertion}
          onChange={setExertion}
          lowLabel={t('rpe.exertionLow')}
          highLabel={t('rpe.exertionHigh')}
        />

        <View style={{ height: spacing.xxl }} />
        <ScaleRow
          label={t('rpe.performance')}
          emoji="🎯"
          lowLabel={t('rpe.perfLow')}
          highLabel={t('rpe.perfHigh')}
          value={performance}
          onChange={setPerformance}
        />

        <Text style={styles.sectionLabel}>{t('rpe.duration')}</Text>
        <Stepper value={duration} onChange={setDuration} />

        <Text style={styles.preview}>
          {sessionLoad !== null ? t('rpe.sessionLoad', { load: sessionLoad }) : ' '}
        </Text>
      </ScrollView>
      <View style={styles.footer}>
        <Button
          title={t('common.save')}
          onPress={() => void save()}
          disabled={!complete}
          loading={submit.isPending}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.screen },
  sectionLabel: {
    fontFamily: font.semibold,
    fontSize: 18,
    color: colors.text,
    marginBottom: spacing.m,
  },
  preview: {
    fontFamily: font.semibold,
    fontSize: 18,
    color: colors.brand,
    marginTop: spacing.xl,
    textAlign: 'center',
  },
  footer: { padding: spacing.screen, paddingTop: spacing.m },
});
