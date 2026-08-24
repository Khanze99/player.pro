// RPE после нагрузки (дизайн-ТЗ 5.4, v2 — стиль дневного опроса): шкалы-бары без эмодзи,
// обязательная привязка к завершённой сессии дня (длительность подтягивается из
// расписания — ТЗ 3.1), живой предпросмотр session load = RPE × мин.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ApiError } from '@/api/client';
import { todayISO, useRpeSessions, useSubmitRpe } from '@/api/hooks';
import { sessionLabel } from '@/api/sessions';
import type { RpeSession } from '@/api/types';
import { Button } from '@/components/Button';
import { OptionChips } from '@/components/OptionChips';
import { ScaleBar } from '@/components/ScaleBar';
import { Screen } from '@/components/Screen';
import { Stepper } from '@/components/Stepper';
import { useToast } from '@/components/Toast';
import { MicroLabel, ScreenTitle } from '@/components/Typography';
import { colors, font, spacing } from '@/theme';

export default function Rpe() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const toast = useToast((s) => s.show);
  const submit = useSubmitRpe();

  const today = todayISO();
  const sessions = useRpeSessions(today);
  // Оценивать можно только завершённые и ещё не оценённые сессии
  const pending = (sessions.data ?? []).filter((s) => s.finished && !s.rpe_submitted);

  const [exertion, setExertion] = useState<number | null>(null);
  const [performance, setPerformance] = useState<number | null>(null);
  const [duration, setDuration] = useState(60);
  const [eventId, setEventId] = useState<string | null>(null);
  const [autoPicked, setAutoPicked] = useState(false);

  const selectSession = (session: RpeSession) => {
    setEventId(session.event_id);
    // Длительность из расписания — можно скорректировать руками (ТЗ 3.1)
    setDuration(session.planned_duration_min);
  };

  // Сессия одна — выбирать не из чего, подставляем её сразу
  if (!autoPicked && pending.length === 1) {
    setAutoPicked(true);
    selectSession(pending[0]);
  }

  // Выбранную сессию успели оценить с другого устройства — снимаем выбор
  if (eventId !== null && sessions.data && !pending.some((s) => s.event_id === eventId)) {
    setEventId(null);
  }

  const sessionLoad = exertion !== null ? exertion * duration : null;
  // При расписании привязка обязательна, без него — свободный ввод (личный режим)
  const complete =
    exertion !== null && performance !== null && (pending.length === 0 || eventId !== null);

  const eventLabel = (id: string) => {
    const session = pending.find((s) => s.event_id === id);
    return session ? sessionLabel(session, i18n.language, t) : '';
  };

  const save = async () => {
    try {
      await submit.mutateAsync({
        date: todayISO(),
        exertion: exertion!,
        performance: performance!,
        duration_min: duration,
        event_id: eventId,
      });
      toast(t('common.saved'));
      router.back();
    } catch (e) {
      // Без сети экран не закрываем: оценка остаётся на месте, отправит кнопкой
      toast(e instanceof ApiError ? e.detail : t('common.noConnection'));
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenTitle style={{ marginBottom: spacing.xl }}>{t('rpe.title')}</ScreenTitle>

        <ScaleBar
          label={t('rpe.exertion')}
          lowLabel={t('rpe.exertionLow')}
          highLabel={t('rpe.exertionHigh')}
          value={exertion}
          onChange={setExertion}
        />

        <ScaleBar
          label={t('rpe.performance')}
          lowLabel={t('rpe.perfLow')}
          highLabel={t('rpe.perfHigh')}
          value={performance}
          onChange={setPerformance}
        />

        {pending.length > 1 && (
          <View style={styles.section}>
            <MicroLabel>{t('rpe.pickSession')}</MicroLabel>
            <OptionChips
              options={pending.map((s) => s.event_id)}
              value={eventId}
              onSelect={(id) => {
                const session = pending.find((s) => s.event_id === id);
                if (session) selectSession(session);
              }}
              labelFor={eventLabel}
            />
          </View>
        )}

        {pending.length === 1 && (
          <View style={styles.section}>
            <MicroLabel>{t('rpe.session')}</MicroLabel>
            <Text style={styles.session}>{sessionLabel(pending[0], i18n.language, t)}</Text>
          </View>
        )}

        <View style={styles.section}>
          <MicroLabel>{t('rpe.duration')}</MicroLabel>
          <Stepper value={duration} onChange={setDuration} />
        </View>

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
  section: { gap: spacing.s, marginBottom: spacing.xl },
  session: { fontFamily: font.medium, fontSize: 17, color: colors.text },
  preview: {
    fontFamily: font.semibold,
    fontSize: 18,
    color: colors.brand,
    textAlign: 'center',
  },
  footer: { padding: spacing.screen, paddingTop: spacing.m },
});
