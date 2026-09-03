// Цикл (этап 1, docs/plan-women-health-nutrition.md).
//
// Экран принадлежит спортсменке: она отмечает дни, она же решает, кто это видит.
// Ссылка на приватность стоит прямо здесь, а не спрятана в настройках.
//
// Сознательно НЕ показывает рекомендаций по нагрузке на основе фазы: усреднённый
// эффект фазы на работоспособность тривиален при огромном разбросе между людьми,
// поэтому показываем её собственный паттерн, а вывод она делает сама.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  todayISO,
  useCycleInsights,
  useCycleLogs,
  useCycleSettings,
  useCycleState,
  useUpdateCycleSettings,
  useUpsertCycleLog,
} from '@/api/hooks';
import type { Contraception, CycleSymptomKey, FlowIntensity } from '@/api/types';
import { Button } from '@/components/Button';
import { CloseIcon } from '@/components/Icons';
import { OptionChips } from '@/components/OptionChips';
import { ScaleBar } from '@/components/ScaleBar';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { useToast } from '@/components/Toast';
import { MicroLabel, ScreenTitle } from '@/components/Typography';
import { readinessColor, spacing, type Theme, useStyles, useTheme } from '@/theme';

type Tab = 'today' | 'calendar' | 'insights';

const TABS: readonly Tab[] = ['today', 'calendar', 'insights'];
const FLOWS: readonly FlowIntensity[] = ['spotting', 'light', 'medium', 'heavy'];
const SYMPTOMS: readonly CycleSymptomKey[] = [
  'cramps',
  'headache',
  'back_pain',
  'bloating',
  'fatigue',
  'mood_swings',
  'nausea',
  'breast_tenderness',
  'insomnia',
];
const CONTRACEPTIONS: readonly Contraception[] = [
  'not_specified',
  'none',
  'combined_oc',
  'progestin_only',
  'hormonal_iud',
  'copper_iud',
  'implant',
  'injection',
];

const phaseColor = (phase: string, th: Theme) => {
  switch (phase) {
    case 'menstrual':
      return th.risk;
    case 'ovulation':
      return th.caution;
    case 'follicular':
      return th.good;
    case 'luteal':
      return th.brandOn;
    default:
      return th.low;
  }
};

function StateCard() {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t, i18n } = useTranslation();
  const state = useCycleState();
  if (!state.data) return null;
  const s = state.data;
  const color = phaseColor(s.phase, th);
  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' }) : '—';

  return (
    <View style={styles.card}>
      <View style={styles.stateHead}>
        <View>
          <Text style={[styles.phase, { color }]}>{t(`cycle.phase.${s.phase}`)}</Text>
          <Text style={styles.cardHint}>
            {s.cycle_day ? t('cycle.dayOfCycle', { n: s.cycle_day }) : t('cycle.noAnchor')}
          </Text>
        </View>
        <View style={[styles.phaseDot, { backgroundColor: color }]} />
      </View>

      {s.phase !== 'suppressed' ? (
        <View style={styles.factRow}>
          <View style={styles.fact}>
            <Text style={styles.factValue}>{fmt(s.next_period_predicted)}</Text>
            <Text style={styles.factLabel}>{t('cycle.nextPredicted')}</Text>
          </View>
          <View style={styles.fact}>
            <Text style={styles.factValue}>{s.observed_cycle_length ?? s.average_cycle_length}</Text>
            <Text style={styles.factLabel}>{t('cycle.cycleLength')}</Text>
          </View>
        </View>
      ) : (
        <Text style={styles.cardHint}>{t('cycle.suppressedHint')}</Text>
      )}

      {s.amenorrhea_flag ? (
        <View style={styles.alert}>
          <Text style={styles.alertText}>
            {t('cycle.amenorrhea', { n: s.days_since_last_period ?? 0 })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function TodayTab() {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const toast = useToast((s) => s.show);
  const logs = useCycleLogs(7);
  const upsert = useUpsertCycleLog();

  const today = todayISO();
  const existing = logs.data?.find((l) => l.date === today);

  const [periodStart, setPeriodStart] = useState<boolean | null>(null);
  const [flow, setFlow] = useState<FlowIntensity | null>(null);
  const [symptoms, setSymptoms] = useState<Record<string, number>>({});
  const [seeded, setSeeded] = useState(false);

  // Подставляем уже сохранённое за сегодня (паттерн adjusting state on prop change)
  if (existing && !seeded) {
    setSeeded(true);
    setPeriodStart(existing.period_start);
    setFlow(existing.flow);
    setSymptoms(Object.fromEntries(existing.symptoms.map((s) => [s.symptom, s.severity])));
  }

  const toggleSymptom = (key: CycleSymptomKey) =>
    setSymptoms((prev) => {
      const next = { ...prev };
      if (key in next) delete next[key];
      else next[key] = 5;
      return next;
    });

  const save = () => {
    upsert.mutate(
      {
        date: today,
        period_start: periodStart ?? false,
        flow,
        symptoms: Object.entries(symptoms).map(([symptom, severity]) => ({
          symptom: symptom as CycleSymptomKey,
          severity,
        })),
      },
      { onSuccess: () => toast(t('common.saved')) },
    );
  };

  return (
    <View style={styles.tabBody}>
      <StateCard />

      <View style={styles.card}>
        <MicroLabel>{t('cycle.markToday')}</MicroLabel>
        <Pressable
          onPress={() => setPeriodStart((v) => !v)}
          accessibilityRole="switch"
          accessibilityState={{ checked: !!periodStart }}
          style={[styles.bigToggle, periodStart && styles.bigToggleActive]}
        >
          {/* белый на статусной заливке: статусы темой не подменяются */}
          <Text style={[styles.bigToggleText, periodStart && { color: '#FFFFFF' }]}>
            {t('cycle.periodStart')}
          </Text>
        </Pressable>
        <Text style={styles.cardHint}>{t('cycle.periodStartHint')}</Text>

        <MicroLabel>{t('cycle.flow')}</MicroLabel>
        <OptionChips
          options={FLOWS}
          value={flow}
          onSelect={(v) => setFlow(v === flow ? null : v)}
          labelFor={(v) => t(`cycle.flowLevel.${v}`)}
        />
      </View>

      <View style={styles.card}>
        <MicroLabel>{t('cycle.symptoms')}</MicroLabel>
        <OptionChips
          options={SYMPTOMS}
          value={null}
          onSelect={(v) => v && toggleSymptom(v)}
          labelFor={(v) => `${t(`cycle.symptom.${v}`)}${v in symptoms ? ' ✓' : ''}`}
        />
        {Object.keys(symptoms).map((key) => (
          <View key={key} style={styles.severityRow}>
            <ScaleBar
              label={t(`cycle.symptom.${key}`)}
              value={symptoms[key]}
              onChange={(v) => setSymptoms((prev) => ({ ...prev, [key]: v }))}
              lowLabel={t('cycle.mild')}
              highLabel={t('cycle.severe')}
            />
          </View>
        ))}
      </View>

      <Button title={t('common.save')} onPress={save} loading={upsert.isPending} />
    </View>
  );
}

function CalendarTab() {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t, i18n } = useTranslation();
  const logs = useCycleLogs(90);

  if (!logs.data) return <Text style={styles.empty}>{t('common.loading')}</Text>;
  if (logs.data.length === 0) return <Text style={styles.empty}>{t('cycle.noLogs')}</Text>;

  return (
    <View style={styles.tabBody}>
      <View style={styles.card}>
        <MicroLabel>{t('cycle.history')}</MicroLabel>
        {[...logs.data].reverse().map((log) => (
          <View key={log.id} style={styles.logRow}>
            <View
              style={[
                styles.logDot,
                { backgroundColor: log.period_start ? th.risk : th.surface2 },
              ]}
            />
            <View style={styles.logMain}>
              <Text style={styles.logDate}>
                {new Date(log.date).toLocaleDateString(i18n.language, {
                  day: 'numeric',
                  month: 'long',
                })}
              </Text>
              <Text style={styles.cardHint} numberOfLines={1}>
                {[
                  log.period_start ? t('cycle.periodStart') : null,
                  log.flow ? t(`cycle.flowLevel.${log.flow}`) : null,
                  ...log.symptoms.map((s) => t(`cycle.symptom.${s.symptom}`)),
                ]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function InsightsTab() {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const insights = useCycleInsights();

  if (!insights.data) return <Text style={styles.empty}>{t('common.loading')}</Text>;
  const data = insights.data;

  if (!data.enough_data) {
    return (
      <View style={styles.tabBody}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('cycle.notEnoughData')}</Text>
          <Text style={styles.cardHint}>
            {t('cycle.notEnoughDataHint', { n: data.cycles_recorded })}
          </Text>
        </View>
      </View>
    );
  }

  const maxLoad = Math.max(...data.phases.map((p) => p.avg_load ?? 0), 1);

  return (
    <View style={styles.tabBody}>
      <View style={styles.card}>
        <MicroLabel>{t('cycle.byPhase')}</MicroLabel>
        <Text style={styles.cardHint}>{t('cycle.byPhaseHint')}</Text>
        {data.phases
          .filter((p) => p.phase !== 'unknown')
          .map((p) => (
            <View key={p.phase} style={styles.insightRow}>
              <View style={styles.insightHead}>
                <Text style={[styles.insightPhase, { color: phaseColor(p.phase, th) }]}>
                  {t(`cycle.phase.${p.phase}`)}
                </Text>
                <Text style={styles.cardHint}>{t('cycle.days', { n: p.days })}</Text>
              </View>
              <View style={styles.insightBars}>
                <View style={styles.insightMetric}>
                  <Text
                    style={[
                      styles.insightValue,
                      { color: readinessColor(p.avg_readiness === null ? null : 'green') },
                    ]}
                  >
                    {p.avg_readiness !== null ? Math.round(p.avg_readiness) : '—'}
                  </Text>
                  <Text style={styles.factLabel}>{t('cycle.avgReadiness')}</Text>
                </View>
                <View style={styles.insightMetric}>
                  <Text style={styles.insightValue}>
                    {p.avg_load !== null ? Math.round(p.avg_load) : '—'}
                  </Text>
                  <Text style={styles.factLabel}>{t('cycle.avgLoad')}</Text>
                </View>
                <View style={styles.loadTrack}>
                  <View
                    style={[styles.loadFill, { width: `${((p.avg_load ?? 0) / maxLoad) * 100}%` }]}
                  />
                </View>
              </View>
            </View>
          ))}
        <Text style={styles.disclaimer}>{t('cycle.disclaimer')}</Text>
      </View>
    </View>
  );
}

function SettingsCard() {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();
  const settings = useCycleSettings();
  const update = useUpdateCycleSettings();

  return (
    <View style={styles.card}>
      <MicroLabel>{t('cycle.settings')}</MicroLabel>
      <Text style={styles.cardHint}>{t('cycle.contraceptionHint')}</Text>
      <OptionChips
        options={CONTRACEPTIONS}
        value={settings.data?.contraception ?? 'not_specified'}
        onSelect={(v) => v && update.mutate({ contraception: v })}
        labelFor={(v) => t(`cycle.contraception.${v}`)}
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
  const [tab, setTab] = useState<Tab>('today');
  const settings = useCycleSettings();
  const update = useUpdateCycleSettings();

  const enabled = settings.data?.tracking_enabled ?? false;

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

        {!settings.isLoading && !enabled ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('cycle.enableTitle')}</Text>
            <Text style={styles.cardHint}>{t('cycle.enableHint')}</Text>
            <Button
              title={t('cycle.enable')}
              onPress={() => update.mutate({ tracking_enabled: true })}
              loading={update.isPending}
            />
            <Pressable style={styles.privacyLink} onPress={() => router.push('/privacy')}>
              <Text style={styles.privacyText}>{t('cycle.whoSees')}</Text>
            </Pressable>
          </View>
        ) : null}

        {enabled ? (
          <>
            <Segmented
              options={TABS}
              value={tab}
              onSelect={setTab}
              labelFor={(v) => t(`cycle.tab.${v}`)}
            />
            {tab === 'today' && <TodayTab />}
            {tab === 'calendar' && <CalendarTab />}
            {tab === 'insights' && <InsightsTab />}
            <SettingsCard />
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  content: { padding: spacing.screen, gap: spacing.l, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  close: { padding: spacing.xs },
  tabBody: { gap: spacing.l },

  card: {
    backgroundColor: th.surface,
    borderWidth: 1,
    borderColor: th.border,
    borderRadius: th.radius.card,
    padding: spacing.l,
    gap: spacing.m,
  },
  cardTitle: { fontFamily: th.font.bold, fontSize: 17, color: th.text },
  cardHint: { fontFamily: th.font.regular, fontSize: 13, color: th.textMuted, lineHeight: 18 },

  stateHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  phase: { fontFamily: th.font.display, fontSize: 22 },
  phaseDot: { width: 14, height: 14, borderRadius: 7, marginTop: spacing.s },
  factRow: { flexDirection: 'row', gap: spacing.m },
  fact: { flex: 1, backgroundColor: th.surface2, borderRadius: th.radius.chip, padding: spacing.m },
  factValue: { fontFamily: th.font.bold, fontSize: 15, color: th.text },
  factLabel: { fontFamily: th.font.regular, fontSize: 10, color: th.textMuted, letterSpacing: 0.4 },

  alert: {
    backgroundColor: '#FF5C5C1A',
    borderRadius: th.radius.chip,
    padding: spacing.m,
    borderWidth: 1,
    borderColor: th.risk,
  },
  alertText: { fontFamily: th.font.medium, fontSize: 13, color: th.risk, lineHeight: 18 },

  bigToggle: {
    paddingVertical: spacing.l,
    borderRadius: th.radius.control,
    backgroundColor: th.surface2,
    borderWidth: 1.5,
    borderColor: th.border,
    alignItems: 'center',
  },
  bigToggleActive: { backgroundColor: th.risk, borderColor: th.risk },
  bigToggleText: { fontFamily: th.font.semibold, fontSize: 15, color: th.text },

  severityRow: { gap: spacing.s, marginTop: spacing.s },
  severityLabel: { fontFamily: th.font.medium, fontSize: 13, color: th.text },

  logRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.m, paddingVertical: spacing.s },
  logDot: { width: 10, height: 10, borderRadius: 5 },
  logMain: { flex: 1, gap: 2 },
  logDate: { fontFamily: th.font.semibold, fontSize: 14, color: th.text },

  insightRow: { gap: spacing.s, paddingVertical: spacing.s },
  insightHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  insightPhase: { fontFamily: th.font.semibold, fontSize: 14 },
  insightBars: { flexDirection: 'row', alignItems: 'center', gap: spacing.m },
  insightMetric: { alignItems: 'center', minWidth: 56 },
  insightValue: { fontFamily: th.font.bold, fontSize: 16, color: th.text },
  loadTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: th.surface2,
    overflow: 'hidden',
  },
  loadFill: { height: 6, borderRadius: 3, backgroundColor: th.brand },
  disclaimer: {
    fontFamily: th.font.regular,
    fontSize: 11,
    color: th.low,
    lineHeight: 16,
    marginTop: spacing.s,
  },

  privacyLink: { paddingVertical: spacing.s },
  privacyText: { fontFamily: th.font.medium, fontSize: 13, color: th.brandOn },
  empty: { fontFamily: th.font.regular, fontSize: 14, color: th.textMuted, textAlign: 'center' },
});
