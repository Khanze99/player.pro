// Карта боли (дизайн-ТЗ 5.3): манекен из скрина приложения. Тап по зоне открывает
// карточку: тяжесть этой ТОЧКИ (не общий балл боли) + необязательный комментарий,
// что болит и как. Данные: деталь для medic/coach; на Readiness НЕ влияют
// (за боль в формуле отвечает единственный балл soreness).

import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { ClipPath, Defs, Path } from 'react-native-svg';

import type { BodyRegion, BodySide, PainPoint } from '@/api/types';
import { Button } from '@/components/Button';
import { ScaleBar } from '@/components/ScaleBar';
import { spacing, type Theme, useStyles, useTheme } from '@/theme';
import {
  MANNEQUIN_DIVIDERS_BACK,
  MANNEQUIN_DIVIDERS_FRONT,
  MANNEQUIN_SIL,
  MANNEQUIN_ZONES,
} from './mannequinPaths';

interface Props {
  value: PainPoint[];
  onChange?: (points: PainPoint[]) => void;
  /** Тяжесть по умолчанию для НОВОЙ точки (обычно текущий общий балл боли). Каждая
   *  отмеченная точка после этого редактируется своей тяжестью независимо. */
  severity?: number;
  /** Режим отчёта (тренер/врач, athlete/[id]/day/[date].tsx): тап по зоне не
   *  открывает шторку, только просмотр. onChange не обязателен в этом режиме. */
  readOnly?: boolean;
}

function severityColor(th: Theme, v: number): string {
  if (v >= 7) return th.risk;
  if (v >= 4) return th.caution;
  return th.good;
}

/** Точки на спине есть, спереди — нет (или наоборот) → открыть сразу тот вид,
 *  где реально есть что показать, вместо дефолтного «спереди» вхолостую. */
function initialView(value: PainPoint[]): 'front' | 'back' {
  if (value.length === 0) return 'front';
  const zoneView = (region: BodyRegion, side: BodySide) =>
    MANNEQUIN_ZONES.find((z) => z.region === region && z.side === side)?.view;
  const hasFront = value.some((p) => zoneView(p.region, p.side) === 'front');
  const hasBack = value.some((p) => zoneView(p.region, p.side) === 'back');
  return !hasFront && hasBack ? 'back' : 'front';
}

export function BodyMap({ value, onChange, severity = 5, readOnly = false }: Props) {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const [view, setView] = useState<'front' | 'back'>(() => initialView(value));
  const [sheetTarget, setSheetTarget] = useState<{ region: BodyRegion; side: BodySide } | null>(
    null,
  );
  const [draftSeverity, setDraftSeverity] = useState(severity);
  const [draftNote, setDraftNote] = useState('');

  const pointFor = (region: BodyRegion, side: BodySide) =>
    value.find((p) => p.region === region && p.side === side);

  const openSheet = (region: BodyRegion, side: BodySide) => {
    if (readOnly) return;
    const existing = pointFor(region, side);
    setDraftSeverity(existing?.severity ?? severity);
    setDraftNote(existing?.note ?? '');
    setSheetTarget({ region, side });
  };

  const closeSheet = () => setSheetTarget(null);

  const save = () => {
    if (!sheetTarget) return;
    const { region, side } = sheetTarget;
    const note = draftNote.trim() || null;
    const next = pointFor(region, side)
      ? value.map((p) =>
          p.region === region && p.side === side ? { ...p, severity: draftSeverity, note } : p,
        )
      : [...value, { region, side, severity: draftSeverity, note }];
    onChange?.(next);
    closeSheet();
  };

  const remove = () => {
    if (!sheetTarget) return;
    const { region, side } = sheetTarget;
    onChange?.(value.filter((p) => !(p.region === region && p.side === side)));
    closeSheet();
  };

  const zones = MANNEQUIN_ZONES.filter((z) => z.view === view);
  const dividers = view === 'front' ? MANNEQUIN_DIVIDERS_FRONT : MANNEQUIN_DIVIDERS_BACK;
  const sheetPoint = sheetTarget ? pointFor(sheetTarget.region, sheetTarget.side) : undefined;

  return (
    <View>
      <View style={styles.viewTabs}>
        <Pressable
          onPress={() => setView('front')}
          accessibilityRole="button"
          accessibilityLabel={t('wellness.bodyMap.viewFront')}
          style={[styles.viewTab, view === 'front' && styles.viewTabActive]}
        >
          <Text style={[styles.viewTabText, view === 'front' && styles.viewTabTextActive]}>
            {t('wellness.bodyMap.viewFront')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setView('back')}
          accessibilityRole="button"
          accessibilityLabel={t('wellness.bodyMap.viewBack')}
          style={[styles.viewTab, view === 'back' && styles.viewTabActive]}
        >
          <Text style={[styles.viewTabText, view === 'back' && styles.viewTabTextActive]}>
            {t('wellness.bodyMap.viewBack')}
          </Text>
        </Pressable>
      </View>

      <View style={styles.labels}>
        <Text style={styles.label}>{t('wellness.bodyMap.left')}</Text>
        <Text style={styles.label}>{t('wellness.bodyMap.right')}</Text>
      </View>

      <Svg width="100%" height={360} viewBox="0 0 300 600">
        <Defs>
          <ClipPath id="mannequinSil">
            <Path d={MANNEQUIN_SIL} />
          </ClipPath>
        </Defs>

        <Path
          d={MANNEQUIN_SIL}
          fill="#3A4150"
          stroke="#8AA0BF"
          strokeWidth={1.4}
          strokeOpacity={0.85}
        />

        {/* Заливки-зоны текущего вида (тап-цели), обрезаны по силуэту. Цвет берётся
            из тяжести ЭТОЙ точки, не фиксированный brand (у каждой точки своя тяжесть). */}
        {zones.map((z) => {
          const point = pointFor(z.region, z.side);
          return (
            <Path
              key={`${z.region}:${z.side}`}
              d={z.d}
              clipPath="url(#mannequinSil)"
              fill={point ? severityColor(th, point.severity) : th.brand}
              fillOpacity={point ? 0.82 : 0}
              onPress={readOnly ? undefined : () => openSheet(z.region, z.side)}
            />
          );
        })}

        {/* Плавные пунктирные линии-разделители: координаты ровно границ зон
            текущего вида (mannequinPaths.ts), заливка никогда не выходит за них */}
        {dividers.map((d, i) => (
          <Path
            key={`div-${view}-${i}`}
            d={d}
            clipPath="url(#mannequinSil)"
            fill="none"
            stroke="#9FB2CC"
            strokeOpacity={0.7}
            strokeWidth={1.3}
            strokeDasharray={[5, 4]}
          />
        ))}
      </Svg>

      <Modal visible={!!sheetTarget} transparent animationType="slide" onRequestClose={closeSheet}>
        <Pressable style={styles.backdrop} onPress={closeSheet} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            {sheetTarget && (
              <>
                <View style={styles.sheetHead}>
                  <View style={styles.sheetHeadText}>
                    <Text style={styles.sheetRegion}>
                      {t(`wellness.bodyMap.region.${sheetTarget.region}`)}
                    </Text>
                    <Text style={styles.sheetSide}>
                      {t(`wellness.bodyMap.side.${sheetTarget.side}`)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={closeSheet}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.cancel')}
                  >
                    <Text style={styles.sheetClose}>✕</Text>
                  </Pressable>
                </View>

                <ScaleBar
                  label={t('wellness.bodyMap.severityLabel')}
                  lowLabel={t('wellness.sorenessLow')}
                  highLabel={t('wellness.sorenessHigh')}
                  value={draftSeverity}
                  onChange={setDraftSeverity}
                />

                <TextInput
                  style={styles.note}
                  value={draftNote}
                  onChangeText={setDraftNote}
                  placeholder={t('wellness.bodyMap.notePlaceholder')}
                  placeholderTextColor={th.textMuted}
                  multiline
                  maxLength={256}
                />

                <View style={styles.sheetActions}>
                  {sheetPoint && (
                    <Pressable onPress={remove} accessibilityRole="button" style={styles.removeBtn}>
                      <Text style={styles.removeText}>{t('wellness.bodyMap.remove')}</Text>
                    </Pressable>
                  )}
                  <View style={styles.saveBtn}>
                    <Button title={t('common.save')} onPress={save} />
                  </View>
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  viewTabs: { flexDirection: 'row', gap: spacing.s, marginBottom: spacing.m },
  viewTab: {
    flex: 1,
    minHeight: 40,
    borderRadius: th.radius.chip,
    backgroundColor: th.surface2,
    borderWidth: 1,
    borderColor: th.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewTabActive: { backgroundColor: th.brand, borderColor: th.brandOn },
  viewTabText: { fontFamily: th.font.semibold, fontSize: 13, color: th.textMuted },
  viewTabTextActive: { color: th.onBrand },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.l,
    marginBottom: spacing.xs,
  },
  label: { fontFamily: th.font.medium, fontSize: 12, color: th.textMuted, letterSpacing: 1 },
  backdrop: { flex: 1, backgroundColor: '#0009' },
  sheet: {
    backgroundColor: th.surface,
    borderWidth: 1,
    borderColor: th.border,
    borderTopLeftRadius: th.radius.card,
    borderTopRightRadius: th.radius.card,
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.l,
    paddingBottom: spacing.xl,
    gap: spacing.l,
  },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  sheetHeadText: { gap: 2 },
  sheetRegion: { fontFamily: th.font.display, fontSize: 17, color: th.text },
  sheetSide: { fontFamily: th.font.regular, fontSize: 13, color: th.textMuted },
  sheetClose: { fontFamily: th.font.regular, fontSize: 18, color: th.textMuted, padding: spacing.xs },
  note: {
    backgroundColor: th.surface2,
    borderWidth: 1,
    borderColor: th.border,
    borderRadius: th.radius.control,
    minHeight: 64,
    paddingHorizontal: spacing.l,
    paddingTop: spacing.m,
    color: th.text,
    fontFamily: th.font.regular,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  sheetActions: { flexDirection: 'row', gap: spacing.m, alignItems: 'stretch' },
  removeBtn: {
    paddingHorizontal: spacing.l,
    borderRadius: th.radius.control,
    borderWidth: 1,
    borderColor: th.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { fontFamily: th.font.semibold, fontSize: 14, color: th.risk },
  saveBtn: { flex: 1 },
});
