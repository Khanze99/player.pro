// Ежедневный опрос (дизайн-ТЗ 5.3): 5 шкал 1–5, часы сна, пульс покоя,
// тумблеры травма/недомогание. Цель — 60 секунд, без обязательного текста.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { ApiError } from '@/api/client';
import { todayISO, useSubmitWellness } from '@/api/hooks';
import { Button } from '@/components/Button';
import { ScaleRow } from '@/components/ScaleRow';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { ScreenTitle } from '@/components/Typography';
import { colors, font, radius, spacing } from '@/theme';

const SLEEP_HOURS = [5, 6, 7, 8, 9, 10];

export default function Wellness() {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast((s) => s.show);
  const submit = useSubmitWellness();

  const [sleep, setSleep] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [soreness, setSoreness] = useState<number | null>(null);
  const [stress, setStress] = useState<number | null>(null);
  const [mood, setMood] = useState<number | null>(null);
  const [sleepHours, setSleepHours] = useState<number | null>(null);
  const [restingHr, setRestingHr] = useState('');
  const [injury, setInjury] = useState(false);
  const [injuryDetails, setInjuryDetails] = useState('');
  const [symptom, setSymptom] = useState(false);
  const [symptomDetails, setSymptomDetails] = useState('');

  const scales = [sleep, energy, soreness, stress, mood];
  const done = scales.filter((v) => v !== null).length + (sleepHours !== null ? 1 : 0);
  const complete = scales.every((v) => v !== null);

  const save = async () => {
    try {
      const sent = await submit.mutateAsync({
        date: todayISO(),
        mood: mood!,
        energy: energy!,
        sleep_quality: sleep!,
        sleep_hours: sleepHours,
        stress: stress!,
        soreness: soreness!,
        injury,
        injury_details: injury && injuryDetails ? injuryDetails : null,
        symptom,
        symptom_details: symptom && symptomDetails ? symptomDetails : null,
        resting_hr: restingHr ? Number(restingHr) : null,
      });
      toast(sent ? t('common.saved') : t('common.offlineSaved'));
      router.back();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast(t('wellness.alreadyFilled'));
        router.back();
        return;
      }
      toast(e instanceof ApiError ? e.detail : t('common.retry'));
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <ScreenTitle>{t('wellness.title')}</ScreenTitle>
          <View style={styles.progressBadge}>
            <Text style={styles.progress}>{t('wellness.progress', { done, total: 6 })}</Text>
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <ScaleRow
            label={t('wellness.sleep')}
            emoji="😴"
            lowLabel={t('wellness.sleepLow')}
            highLabel={t('wellness.sleepHigh')}
            value={sleep}
            onChange={setSleep}
          />
          <ScaleRow
            label={t('wellness.energy')}
            emoji="⚡"
            lowLabel={t('wellness.energyLow')}
            highLabel={t('wellness.energyHigh')}
            value={energy}
            onChange={setEnergy}
          />
          <ScaleRow
            label={t('wellness.soreness')}
            emoji="💪"
            lowLabel={t('wellness.sorenessLow')}
            highLabel={t('wellness.sorenessHigh')}
            value={soreness}
            onChange={setSoreness}
          />
          <ScaleRow
            label={t('wellness.stress')}
            emoji="😮‍💨"
            lowLabel={t('wellness.stressLow')}
            highLabel={t('wellness.stressHigh')}
            value={stress}
            onChange={setStress}
          />
          <ScaleRow
            label={t('wellness.mood')}
            emoji="🙂"
            lowLabel={t('wellness.moodLow')}
            highLabel={t('wellness.moodHigh')}
            value={mood}
            onChange={setMood}
          />

          <Text style={styles.sectionLabel}>{t('wellness.sleepHours')}</Text>
          <View style={styles.hoursRow}>
            {SLEEP_HOURS.map((h) => (
              <Pressable
                key={h}
                onPress={() => setSleepHours(h)}
                accessibilityRole="button"
                style={[styles.hourChip, sleepHours === h && styles.hourChipActive]}
              >
                <Text style={[styles.hourText, sleepHours === h && styles.hourTextActive]}>{h}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sectionLabel}>{t('wellness.restingHr')}</Text>
          <TextInput
            style={styles.hrInput}
            value={restingHr}
            onChangeText={(v) => setRestingHr(v.replace(/\D/g, '').slice(0, 3))}
            keyboardType="number-pad"
            placeholder="—"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={t('wellness.restingHr')}
          />

          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>🩹 {t('wellness.injury')}</Text>
            <Switch
              value={injury}
              onValueChange={setInjury}
              trackColor={{ true: colors.risk, false: colors.surface2 }}
            />
          </View>
          {injury && (
            <TextInput
              style={styles.detailsInput}
              value={injuryDetails}
              onChangeText={setInjuryDetails}
              placeholder={t('wellness.details')}
              placeholderTextColor={colors.textMuted}
            />
          )}
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>🤒 {t('wellness.symptom')}</Text>
            <Switch
              value={symptom}
              onValueChange={setSymptom}
              trackColor={{ true: colors.caution, false: colors.surface2 }}
            />
          </View>
          {symptom && (
            <TextInput
              style={styles.detailsInput}
              value={symptomDetails}
              onChangeText={setSymptomDetails}
              placeholder={t('wellness.details')}
              placeholderTextColor={colors.textMuted}
            />
          )}
        </ScrollView>
        <View style={styles.footer}>
          <Button
            title={t('common.save')}
            onPress={() => void save()}
            disabled={!complete}
            loading={submit.isPending}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.screen,
    paddingBottom: spacing.m,
  },
  progressBadge: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.chip,
    paddingHorizontal: spacing.m,
    paddingVertical: 6,
  },
  progress: {
    fontFamily: font.semibold,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
  },
  content: { paddingHorizontal: spacing.screen, paddingBottom: spacing.xxl },
  sectionLabel: {
    fontFamily: font.semibold,
    fontSize: 18,
    color: colors.text,
    marginBottom: spacing.m,
  },
  hoursRow: { flexDirection: 'row', gap: spacing.s, marginBottom: spacing.xxl },
  hourChip: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.control,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hourChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  hourText: { fontFamily: font.semibold, fontSize: 16, color: colors.textMuted },
  hourTextActive: { color: '#FFFFFF' },
  hrInput: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    minHeight: 56,
    paddingHorizontal: spacing.l,
    color: colors.text,
    fontFamily: font.semibold,
    fontSize: 20,
    marginBottom: spacing.xxl,
    width: 120,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 48,
    marginBottom: spacing.s,
  },
  toggleLabel: { fontFamily: font.semibold, fontSize: 18, color: colors.text },
  detailsInput: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    minHeight: 48,
    paddingHorizontal: spacing.l,
    color: colors.text,
    fontFamily: font.regular,
    fontSize: 15,
    marginBottom: spacing.l,
  },
  footer: { padding: spacing.screen, paddingTop: spacing.m },
});
