// Ежедневный опрос (дизайн-ТЗ 5.3, v3): 5 шкал 1–10 (бар с −/+), карта боли,
// часы сна, пульс покоя, травма/недомогание с типом, комментарий. Цель — ~60 секунд.

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
import type { InjuryType, PainPoint, SymptomType } from '@/api/types';
import { BodyMap } from '@/components/BodyMap';
import { Button } from '@/components/Button';
import { OptionChips } from '@/components/OptionChips';
import { ScaleBar } from '@/components/ScaleBar';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { MicroLabel, ScreenTitle } from '@/components/Typography';
import { colors, font, radius, spacing } from '@/theme';

const SLEEP_HOURS = [5, 6, 7, 8, 9, 10];
const INJURY_TYPES: readonly InjuryType[] = [
  'muscle',
  'joint',
  'ligament',
  'tendon',
  'bone',
  'bruise',
  'other',
];
const SYMPTOM_TYPES: readonly SymptomType[] = [
  'illness',
  'fever',
  'cough',
  'sore_throat',
  'headache',
  'gastro',
  'fatigue',
  'other',
];

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
  const [painPoints, setPainPoints] = useState<PainPoint[]>([]);
  const [injury, setInjury] = useState(false);
  const [injuryType, setInjuryType] = useState<InjuryType | null>(null);
  const [symptom, setSymptom] = useState(false);
  const [symptomType, setSymptomType] = useState<SymptomType | null>(null);
  const [comment, setComment] = useState('');

  const scales = [sleep, energy, soreness, stress, mood];
  const done = scales.filter((v) => v !== null).length + (sleepHours !== null ? 1 : 0);
  const complete = scales.every((v) => v !== null);

  const save = async () => {
    try {
      await submit.mutateAsync({
        date: todayISO(),
        mood: mood!,
        energy: energy!,
        sleep_quality: sleep!,
        sleep_hours: sleepHours,
        stress: stress!,
        soreness: soreness!,
        injury,
        injury_type: injury ? injuryType : null,
        symptom,
        symptom_type: symptom ? symptomType : null,
        resting_hr: restingHr ? Number(restingHr) : null,
        comment: comment.trim() ? comment.trim() : null,
        pain_points: painPoints,
      });
      toast(t('common.saved'));
      router.back();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast(t('wellness.alreadyFilled'));
        router.back();
        return;
      }
      // Без сети экран не закрываем: ответы остаются на месте, отправит кнопкой
      toast(e instanceof ApiError ? e.detail : t('common.noConnection'));
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
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ScaleBar
            label={t('wellness.sleep')}
            lowLabel={t('wellness.sleepLow')}
            highLabel={t('wellness.sleepHigh')}
            value={sleep}
            onChange={setSleep}
          />
          <ScaleBar
            label={t('wellness.energy')}
            lowLabel={t('wellness.energyLow')}
            highLabel={t('wellness.energyHigh')}
            value={energy}
            onChange={setEnergy}
          />
          <ScaleBar
            label={t('wellness.soreness')}
            lowLabel={t('wellness.sorenessLow')}
            highLabel={t('wellness.sorenessHigh')}
            value={soreness}
            onChange={setSoreness}
          />
          <ScaleBar
            label={t('wellness.stress')}
            lowLabel={t('wellness.stressLow')}
            highLabel={t('wellness.stressHigh')}
            value={stress}
            onChange={setStress}
          />
          <ScaleBar
            label={t('wellness.mood')}
            lowLabel={t('wellness.moodLow')}
            highLabel={t('wellness.moodHigh')}
            value={mood}
            onChange={setMood}
          />

          <MicroLabel style={styles.section}>{t('wellness.painMapTitle')}</MicroLabel>
          <BodyMap value={painPoints} onChange={setPainPoints} severity={soreness ?? 5} />

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
            <Text style={styles.toggleLabel}>{t('wellness.injury')}</Text>
            <Switch
              value={injury}
              onValueChange={setInjury}
              trackColor={{ true: colors.risk, false: colors.surface2 }}
            />
          </View>
          {injury && (
            <>
              <Text style={styles.subLabel}>{t('wellness.injuryTypeLabel')}</Text>
              <OptionChips
                options={INJURY_TYPES}
                value={injuryType}
                onSelect={setInjuryType}
                labelFor={(v) => t(`wellness.injuryType.${v}`)}
              />
            </>
          )}

          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t('wellness.symptom')}</Text>
            <Switch
              value={symptom}
              onValueChange={setSymptom}
              trackColor={{ true: colors.caution, false: colors.surface2 }}
            />
          </View>
          {symptom && (
            <>
              <Text style={styles.subLabel}>{t('wellness.symptomTypeLabel')}</Text>
              <OptionChips
                options={SYMPTOM_TYPES}
                value={symptomType}
                onSelect={setSymptomType}
                labelFor={(v) => t(`wellness.symptomType.${v}`)}
              />
            </>
          )}

          <Text style={styles.sectionLabel}>{t('wellness.comment')}</Text>
          <TextInput
            style={styles.commentInput}
            value={comment}
            onChangeText={setComment}
            placeholder={t('wellness.commentPlaceholder')}
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={1000}
          />
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
  section: { marginBottom: spacing.m },
  sectionLabel: {
    fontFamily: font.semibold,
    fontSize: 18,
    color: colors.text,
    marginTop: spacing.xl,
    marginBottom: spacing.m,
  },
  subLabel: {
    fontFamily: font.medium,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: spacing.s,
    marginBottom: spacing.s,
  },
  hoursRow: { flexDirection: 'row', gap: spacing.s },
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
    width: 120,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 48,
    marginTop: spacing.l,
  },
  toggleLabel: { fontFamily: font.semibold, fontSize: 18, color: colors.text },
  commentInput: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    minHeight: 80,
    paddingHorizontal: spacing.l,
    paddingTop: spacing.m,
    color: colors.text,
    fontFamily: font.regular,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  footer: { padding: spacing.screen, paddingTop: spacing.m },
});
