import { randomUUID } from 'expo-crypto';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAvailabilityState, useChangeAvailability } from '@/api/availability';
import { ApiError } from '@/api/client';
import type { AvailabilityDirection, AvailabilityState, AvailabilityStatus } from '@/api/availability-types';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { spacing, type Theme, useStyles, useTheme } from '@/theme';


const statuses = ['full', 'modified', 'unavailable'] as const;
const marks = { full: '✓', modified: '!', unavailable: '−' } as const;
type AvailabilityDraft = { status: AvailabilityStatus; day: string; comment: string; note: string };

function restrictionSource(state: AvailabilityState) {
  const medical = state.medical?.status === 'modified' || state.medical?.status === 'unavailable';
  const coaching = state.coaching?.status === 'modified' || state.coaching?.status === 'unavailable';
  if (medical && coaching) return 'restrictedByBoth';
  if (medical) return 'restrictedByMedical';
  if (coaching) return 'restrictedByCoaching';
  return null;
}

function statusColor(status: AvailabilityStatus | null | undefined, theme: Theme): string {
  if (status === 'full') return theme.good;
  if (status === 'modified') return theme.caution;
  if (status === 'unavailable') return theme.risk;
  return theme.low;
}

function StatusBadge({ status }: { status: AvailabilityStatus | null | undefined }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const color = statusColor(status, theme);
  return <View style={[styles.badge, { backgroundColor: `${color}18` }]}>
    <Text accessible={false} style={[styles.mark, { color, borderColor: color }]}>{status ? marks[status] : '−'}</Text>
    <Text style={[styles.badgeText, { color }]}>{t(`availabilityEditor.${status ?? 'unknown'}`)}</Text>
  </View>;
}

export function AvailabilityCard({ athleteId }: { athleteId: string }) {
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  const state = useAvailabilityState(athleteId);
  const [editing, setEditing] = useState<AvailabilityDirection | null>(null);
  const [notice, setNotice] = useState('');
  const data = state.data;
  const restriction = data ? restrictionSource(data) : null;
  return <View style={styles.card}>
    <View style={styles.cardHead}>
      <Text style={styles.cardHeadText}>{t('availabilityEditor.title')}</Text>
    </View>
    <View style={styles.cardBody}>
    {data && !state.isError && <StatusBadge status={data.status} />}
    {state.isPending && <Text style={styles.text}>{t('common.loading')}</Text>}
    {state.isError && <>
      <Text accessibilityRole="alert" style={styles.error}>{t('common.error')}</Text>
      <Action title={t('common.retry')} onPress={() => void state.refetch()} />
    </>}
    {data && !state.isError && <>
      {data.status !== 'full' && restriction && <Text style={styles.hint}>{t(`availabilityEditor.${restriction}`)}</Text>}
      {data.editable_directions.length > 0 && <Action title={t('availabilityEditor.editStatus')} onPress={() => { setEditing(data.editable_directions[0]); setNotice(''); }} />}
      {!!notice && <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text>}
      {editing && <EditForm state={data} direction={editing} onDirectionChange={setEditing} onClose={() => setEditing(null)} onSaved={saved => {
        setEditing(null);
        setNotice(t('availabilityEditor.saved', { status: t(`availabilityEditor.${saved.status ?? 'unknown'}`) }));
      }} />}
    </>}
    </View>
  </View>;
}

function Action({ title, onPress, disabled, secondary = false }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  const styles = useStyles(makeStyles);
  return <Pressable
    accessibilityRole="button"
    accessibilityState={{ disabled: !!disabled }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [styles.action, secondary ? styles.secondaryAction : styles.primaryAction, disabled && styles.disabled, pressed && !disabled && { opacity: 0.8 }]}
  >
    <Text style={[styles.actionText, secondary ? styles.secondaryText : styles.primaryText]}>{title}</Text>
  </Pressable>;
}

function StatusOptions({ value, onChange, disabled }: { value: AvailabilityStatus; onChange: (status: AvailabilityStatus) => void; disabled: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  return <View accessibilityRole="radiogroup" accessibilityLabel={t('availabilityEditor.status')} style={styles.options}>
    {statuses.map(status => {
      const selected = value === status;
      const color = statusColor(status, theme);
      return <Pressable
        key={status}
        accessibilityRole="radio"
        accessibilityState={{ checked: selected, disabled }}
        disabled={disabled}
        onPress={() => onChange(status)}
        style={({ pressed }) => [styles.option, selected && { borderColor: color, backgroundColor: `${color}18` }, disabled && styles.disabled, pressed && !disabled && { opacity: 0.8 }]}
      >
        <Text accessible={false} style={[styles.optionMark, { borderColor: color, color }]}>{marks[status]}</Text>
        <View style={styles.optionContent}>
          <Text style={[styles.optionTitle, { color }]}>{t(`availabilityEditor.${status}`)}</Text>
          <Text style={styles.hint}>{t(`availabilityEditor.${status}Hint`)}</Text>
        </View>
        <View style={[styles.radio, selected && { borderColor: color }]}>{selected && <View style={[styles.radioDot, { backgroundColor: color }]} />}</View>
      </Pressable>;
    })}
  </View>;
}

function EditForm({ state, direction, onDirectionChange, onClose, onSaved }: { state: AvailabilityState; direction: AvailabilityDirection; onDirectionChange: (direction: AvailabilityDirection) => void; onClose: () => void; onSaved: (state: AvailabilityState) => void }) {
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  const mutation = useChangeAvailability();
  const [version, setVersion] = useState(state.version);
  const current = useAvailabilityState(state.athlete_id);
  const [conflict, setConflict] = useState(false);
  const [drafts, setDrafts] = useState<Record<AvailabilityDirection, AvailabilityDraft>>(() => ({
    medical: { status: state.medical?.status ?? 'full', day: state.today, comment: '', note: '' },
    coaching: { status: state.coaching?.status ?? 'full', day: state.today, comment: '', note: '' },
  }));
  const { status, day, comment, note } = drafts[direction];
  const updateDraft = (patch: Partial<AvailabilityDraft>) => setDrafts(previous => ({ ...previous, [direction]: { ...previous[direction], ...patch } }));
  const otherDirection = direction === 'medical' ? 'coaching' : 'medical';
  const otherRestricted = state[otherDirection]?.status === 'modified' || state[otherDirection]?.status === 'unavailable';
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const retry = useRef({ signature: '', id: '' });
  async function save() {
    setError('');
    setNotice('');
    if (mutation.isPending || conflict) return;
    if (!comment.trim()) { setError(t('availabilityEditor.required')); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < (state.start_date ?? '') || day > state.today) {
      setError(t('availabilityEditor.invalidDate', { start: state.start_date, end: state.today })); return;
    }
    const payload = { athlete_id: state.athlete_id, direction, status, date: day, comment: comment.trim(), expected_version: version, ...(direction === 'medical' ? { medical_note: note.trim() } : {}) };
    const signature = JSON.stringify(payload);
    if (retry.current.signature !== signature) retry.current = { signature, id: randomUUID() };
    try { const saved = await mutation.mutateAsync({ ...payload, request_id: retry.current.id }); onSaved(saved.state); }
    catch (err) {
      setConflict(err instanceof ApiError && err.status === 409);
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }
  return <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!mutation.isPending) onClose(); }}>
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>{t('availabilityEditor.edit', { direction: t(`availabilityEditor.${direction}`) })}</Text>
            <Text style={styles.hint}>{t('availabilityEditor.formHint')}</Text>
            <StatusBadge status={status} />
          </View>
          {state.editable_directions.length > 1 && <View style={styles.formSection}>
            <Text style={styles.fieldTitle}>{t('availabilityEditor.direction')}</Text>
            <View accessibilityRole="radiogroup" accessibilityLabel={t('availabilityEditor.direction')} style={styles.directionOptions}>
              {state.editable_directions.map(value => <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ checked: direction === value, disabled: mutation.isPending || conflict }}
                disabled={mutation.isPending || conflict}
                onPress={() => onDirectionChange(value)}
                style={[styles.directionOption, direction === value && styles.directionSelected, (mutation.isPending || conflict) && styles.disabled]}
              ><Text style={styles.secondaryText}>{t(`availabilityEditor.${value}`)}</Text></Pressable>)}
            </View>
          </View>}
          <View style={styles.formSection}>
            <Text style={styles.fieldTitle}>{t('availabilityEditor.status')}</Text>
            <StatusOptions value={status} onChange={value => updateDraft({ status: value })} disabled={mutation.isPending} />
          </View>
          {status === 'full' && otherRestricted && <Text style={styles.notice}>
            {t(`availabilityEditor.${otherDirection === 'medical' ? 'otherMedicalRemains' : 'otherCoachingRemains'}`)}
          </Text>}
          <View style={styles.formSection}>
            <Field label={t('availabilityEditor.date')} value={day} onChangeText={value => updateDraft({ day: value })} maxLength={10} editable={!mutation.isPending} />
            <Field label={t('availabilityEditor.comment')} value={comment} onChangeText={value => updateDraft({ comment: value })} placeholder={t('availabilityEditor.commentPlaceholder')} multiline maxLength={1000} editable={!mutation.isPending} style={styles.multiline} />
          </View>
          {direction === 'medical' && <View style={styles.formSection}>
            <Text style={styles.hint}>{t('availabilityEditor.optional')}</Text>
            <Field label={t('availabilityEditor.diagnosis')} value={note} onChangeText={value => updateDraft({ note: value })} placeholder={t('availabilityEditor.diagnosisPlaceholder')} multiline maxLength={2000} editable={!mutation.isPending} style={styles.multiline} />
            <Text style={styles.hint}>{t('availabilityEditor.audience')}</Text>
          </View>}
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          {!!notice && <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text>}
          {conflict && <Action title={t('availabilityEditor.refresh')} secondary disabled={current.isFetching} onPress={() => {
            void current.refetch().then(result => {
              if (result.isError || !result.data) return;
              setVersion(result.data.version); setConflict(false); setError('');
              setNotice(t('availabilityEditor.refreshed'));
            });
          }} />}
        </ScrollView>
        <View style={styles.footer}>
          <Button title={t('availabilityEditor.save')} loading={mutation.isPending} disabled={conflict || !comment.trim() || !state.editable_directions.includes(direction)} onPress={() => void save()} />
          <Action title={t('common.cancel')} secondary disabled={mutation.isPending} onPress={onClose} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  </Modal>;
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  flex: { flex: 1 },
  card: { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: theme.radius.card, overflow: 'hidden' },
  cardHead: { paddingHorizontal: spacing.xl, paddingTop: spacing.m, paddingBottom: spacing.s, backgroundColor: theme.surface2, borderBottomWidth: 2, borderBottomColor: theme.brandDark },
  cardHeadText: { fontFamily: theme.font.semibold, color: theme.text, fontSize: 14 },
  cardBody: { padding: spacing.xl, gap: spacing.m },

  text: { fontFamily: theme.font.regular, color: theme.text, fontSize: 14, lineHeight: 22 },
  hint: { fontFamily: theme.font.regular, color: theme.textMuted, fontSize: 12, lineHeight: 18 },
  fieldTitle: { fontFamily: theme.font.semibold, color: theme.text, fontSize: 13 },
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: spacing.s, borderRadius: 10, paddingHorizontal: spacing.m, paddingVertical: spacing.s, maxWidth: '100%' },
  badgeText: { fontFamily: theme.font.semibold, fontSize: 12, flexShrink: 1 },
  mark: { fontFamily: theme.font.bold, fontSize: 12, lineHeight: 18, width: 20, height: 20, borderWidth: 1, borderRadius: 10, textAlign: 'center', overflow: 'hidden' },

  notice: { fontFamily: theme.font.regular, color: theme.text, backgroundColor: theme.surface2, padding: spacing.m, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: theme.brandOn, fontSize: 13, lineHeight: 20 },
  error: { fontFamily: theme.font.regular, color: theme.risk, backgroundColor: `${theme.risk}15`, padding: spacing.m, borderRadius: 10, fontSize: 13, lineHeight: 20 },
  action: { minHeight: 48, paddingHorizontal: spacing.l, paddingVertical: spacing.m, borderRadius: theme.radius.control, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  primaryAction: { backgroundColor: theme.brand, borderColor: theme.brand },
  secondaryAction: { backgroundColor: theme.surface2, borderColor: theme.borderBright },
  actionText: { fontFamily: theme.font.semibold, fontSize: 14, textAlign: 'center' },
  primaryText: { color: theme.onBrand },
  secondaryText: { color: theme.text },
  disabled: { opacity: 0.45 },
  form: { padding: spacing.screen, gap: spacing.l },
  formHeader: { padding: spacing.l, backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.brandOn, borderRadius: theme.radius.card, gap: spacing.m },
  formTitle: { fontFamily: theme.font.semibold, color: theme.text, fontSize: 21 },
  formSection: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius.card, padding: spacing.l, gap: spacing.l },
  directionOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s },
  directionOption: { minHeight: 44, paddingHorizontal: spacing.l, paddingVertical: spacing.m, borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius.control, backgroundColor: theme.surface2 },
  directionSelected: { borderColor: theme.brandOn },
  options: { gap: spacing.s },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.m, padding: spacing.m, minHeight: 78, borderWidth: 2, borderColor: theme.border, borderRadius: theme.radius.control, backgroundColor: theme.surface2 },
  optionContent: { flex: 1, gap: spacing.xs },
  optionTitle: { fontFamily: theme.font.semibold, fontSize: 14 },
  optionMark: { width: 28, height: 28, lineHeight: 25, textAlign: 'center', borderWidth: 1.5, borderRadius: 14, fontFamily: theme.font.bold, fontSize: 16, overflow: 'hidden' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: theme.textMuted, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  footer: { padding: spacing.screen, gap: spacing.m, borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: theme.surface },
  multiline: { minHeight: 110, textAlignVertical: 'top', paddingTop: spacing.m, fontSize: 15, lineHeight: 22 },
});
