// Дневник питания (этап 2, docs/plan-women-health-nutrition.md).
//
// Вкладка «Питание» — только для игрока и пользователя без организации.
// Дневник строго личный: витрин для тренера и врача нет ни на клиенте, ни на бэке.
// Вкладка скрыта фича-флагом с сервера — включается без релиза в сторы.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  todayISO,
  useCopyMeal,
  useDeleteFoodEntry,
  useNutritionDay,
  useSetNutritionTarget,
} from '@/api/hooks';
import { toLocalISO } from '@/api/dates';
import type { MacroTotals, MealGroup, MealType } from '@/api/types';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { PlusIcon } from '@/components/Icons';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { MicroLabel, ScreenTitle } from '@/components/Typography';
import { colors, font, radius, spacing } from '@/theme';

const MEALS: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const shiftDay = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`); // без времени строка парсится как UTC-полночь
  d.setDate(d.getDate() + days);
  return toLocalISO(d);
};

function MacroBar({ totals, targetKcal }: { totals: MacroTotals; targetKcal: number | null }) {
  const { t } = useTranslation();
  const progress = targetKcal ? Math.min(1, totals.kcal / targetKcal) : 0;
  const left = targetKcal ? Math.round(targetKcal - totals.kcal) : null;

  return (
    <View style={styles.card}>
      <View style={styles.kcalRow}>
        <View>
          <Text style={styles.kcalValue}>{Math.round(totals.kcal)}</Text>
          <Text style={styles.cardHint}>
            {targetKcal ? t('nutrition.ofTarget', { n: targetKcal }) : t('nutrition.noTarget')}
          </Text>
        </View>
        {left !== null ? (
          <View style={styles.leftBox}>
            {/* Перерасход показываем нейтрально: цель — ориентир, а не запрет */}
            <Text style={styles.leftValue}>{left > 0 ? left : Math.abs(left)}</Text>
            <Text style={styles.factLabel}>
              {left > 0 ? t('nutrition.left') : t('nutrition.over')}
            </Text>
          </View>
        ) : null}
      </View>

      {targetKcal ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
      ) : null}

      <View style={styles.macroRow}>
        {(
          [
            ['protein', totals.protein],
            ['fat', totals.fat],
            ['carbs', totals.carbs],
          ] as const
        ).map(([key, value]) => (
          <View key={key} style={styles.macroCell}>
            <Text style={styles.macroValue}>{Math.round(value)} г</Text>
            <Text style={styles.factLabel}>{t(`nutrition.macro.${key}`)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function MealCard({ group, day }: { group: MealGroup; day: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast((s) => s.show);
  const remove = useDeleteFoodEntry();
  const copy = useCopyMeal();

  return (
    <View style={styles.card}>
      <View style={styles.mealHead}>
        <MicroLabel>{t(`nutrition.meal.${group.meal}`)}</MicroLabel>
        <Text style={styles.mealKcal}>{Math.round(group.totals.kcal)} ккал</Text>
      </View>

      {group.entries.map((entry) => (
        <Pressable
          key={entry.id}
          onLongPress={() =>
            remove.mutate(entry.id, { onSuccess: () => toast(t('nutrition.removed')) })
          }
          accessibilityRole="button"
          accessibilityHint={t('nutrition.removeHint')}
          style={styles.entryRow}
        >
          <View style={styles.entryMain}>
            <Text style={styles.entryName} numberOfLines={1}>
              {entry.name}
            </Text>
            <Text style={styles.cardHint}>
              {Math.round(entry.grams)} г · {t('nutrition.macroShort', {
                p: Math.round(entry.protein),
                f: Math.round(entry.fat),
                c: Math.round(entry.carbs),
              })}
            </Text>
          </View>
          <Text style={styles.entryKcal}>{Math.round(entry.kcal)}</Text>
        </Pressable>
      ))}

      <View style={styles.mealActions}>
        <Pressable
          style={styles.addButton}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/food-add', params: { day, meal: group.meal } })}
        >
          <PlusIcon color={colors.brand} size={18} />
          <Text style={styles.addText}>{t('nutrition.add')}</Text>
        </Pressable>
        {group.entries.length === 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              copy.mutate(
                { source_day: shiftDay(day, -1), target_day: day, meal: group.meal },
                {
                  onSuccess: (r) =>
                    toast(
                      r.copied > 0
                        ? t('nutrition.copied', { n: r.copied })
                        : t('nutrition.nothingToCopy'),
                    ),
                },
              )
            }
          >
            <Text style={styles.copyText}>{t('nutrition.repeatYesterday')}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function TargetCard({ current }: { current: number | null }) {
  const { t } = useTranslation();
  const toast = useToast((s) => s.show);
  const setTarget = useSetNutritionTarget();
  const [value, setValue] = useState(String(current ?? ''));
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const kcal = Number(value);
    if (!Number.isFinite(kcal) || kcal <= 0) {
      setError(t('nutrition.targetInvalid'));
      return;
    }
    setError(null);
    setTarget.mutate({ kcal }, { onSuccess: () => toast(t('common.saved')) });
  };

  return (
    <View style={styles.card}>
      <MicroLabel>{t('nutrition.targetTitle')}</MicroLabel>
      <Text style={styles.cardHint}>{t('nutrition.targetHint')}</Text>
      <Field
        label={t('nutrition.targetLabel')}
        value={value}
        onChangeText={setValue}
        keyboardType="number-pad"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title={t('common.save')} onPress={save} loading={setTarget.isPending} />
    </View>
  );
}

export default function Nutrition() {
  const { t, i18n } = useTranslation();
  const [day, setDay] = useState(todayISO());
  const nutritionDay = useNutritionDay(day);

  const dateLabel = new Date(day).toLocaleDateString(i18n.language, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  });

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenTitle>{t('nutrition.title')}</ScreenTitle>

        <View style={styles.dayNav}>
          <Pressable
            onPress={() => setDay(shiftDay(day, -1))}
            accessibilityRole="button"
            accessibilityLabel={t('nutrition.prevDay')}
            style={styles.navButton}
          >
            <Text style={styles.navText}>←</Text>
          </Pressable>
          <Text style={styles.dayLabel}>{dateLabel}</Text>
          <Pressable
            onPress={() => setDay(shiftDay(day, 1))}
            disabled={day >= todayISO()}
            accessibilityRole="button"
            accessibilityLabel={t('nutrition.nextDay')}
            style={[styles.navButton, day >= todayISO() && styles.navDisabled]}
          >
            <Text style={styles.navText}>→</Text>
          </Pressable>
        </View>

        {nutritionDay.data ? (
          <>
            <MacroBar
              totals={nutritionDay.data.totals}
              targetKcal={nutritionDay.data.target?.kcal ?? null}
            />
            {MEALS.map((meal) => {
              const group = nutritionDay.data.meals.find((m) => m.meal === meal);
              return group ? <MealCard key={meal} group={group} day={day} /> : null;
            })}
            <TargetCard current={nutritionDay.data.target?.kcal ?? null} />
          </>
        ) : (
          <Text style={styles.empty}>{t('common.loading')}</Text>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.screen, gap: spacing.l, paddingBottom: 40 },
  dayNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: radius.control,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navDisabled: { opacity: 0.35 },
  navText: { fontFamily: font.semibold, fontSize: 18, color: colors.text },
  dayLabel: { fontFamily: font.semibold, fontSize: 15, color: colors.text },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing.l,
    gap: spacing.m,
  },
  cardHint: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted },
  error: { fontFamily: font.medium, fontSize: 13, color: colors.risk },

  kcalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  kcalValue: { fontFamily: font.display, fontSize: 32, color: colors.text },
  leftBox: { alignItems: 'flex-end' },
  leftValue: { fontFamily: font.bold, fontSize: 20, color: colors.brand },
  factLabel: { fontFamily: font.regular, fontSize: 10, color: colors.textMuted, letterSpacing: 0.4 },

  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surface2, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: colors.brand },

  macroRow: { flexDirection: 'row', gap: spacing.s },
  macroCell: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderRadius: radius.chip,
    paddingVertical: spacing.s,
    alignItems: 'center',
  },
  macroValue: { fontFamily: font.bold, fontSize: 14, color: colors.text },

  mealHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mealKcal: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    paddingVertical: spacing.s,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  entryMain: { flex: 1, gap: 2 },
  entryName: { fontFamily: font.medium, fontSize: 14, color: colors.text },
  entryKcal: { fontFamily: font.bold, fontSize: 14, color: colors.text },

  mealActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.l },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  addText: { fontFamily: font.semibold, fontSize: 13, color: colors.brand },
  copyText: { fontFamily: font.medium, fontSize: 13, color: colors.textMuted },

  empty: { fontFamily: font.regular, fontSize: 14, color: colors.textMuted, textAlign: 'center' },
});
