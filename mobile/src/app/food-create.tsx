// Свой продукт: домашняя еда, новинка с рынка, блюдо из столовой.
//
// Продукт приватный — виден только автору. Пометка custom_kind нужна не для
// красоты: домашний рецепт в общий каталог не поднимают, а новинку с рынка
// имеет смысл проверить и добавить всем.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { ApiError } from '@/api/client';
import { useCreateFood } from '@/api/hooks';
import type { CustomFoodKind, FoodCategory } from '@/api/types';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { CloseIcon } from '@/components/Icons';
import { OptionChips } from '@/components/OptionChips';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { MicroLabel, ScreenTitle } from '@/components/Typography';
import { colors, font, radius, spacing } from '@/theme';

const KINDS: readonly CustomFoodKind[] = ['homemade', 'new_product', 'restaurant', 'other'];
const CATEGORIES: readonly FoodCategory[] = [
  'dish',
  'meat',
  'fish',
  'dairy',
  'eggs',
  'grain',
  'vegetable',
  'fruit',
  'nuts',
  'sweets',
  'drinks',
  'supplements',
  'other',
];

const num = (value: string) => {
  // Пользователи вводят и запятую, и точку
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export default function FoodCreate() {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast((s) => s.show);
  const create = useCreateFood();
  const { name: initialName } = useLocalSearchParams<{ name?: string }>();

  const [name, setName] = useState(initialName ?? '');
  const [kind, setKind] = useState<CustomFoodKind>('homemade');
  const [category, setCategory] = useState<FoodCategory>('dish');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [carbs, setCarbs] = useState('');
  const [error, setError] = useState<string | null>(null);

  const kcalValue = num(kcal);
  const canSave = name.trim().length >= 2 && kcalValue !== null && kcal.trim() !== '';

  const submit = () => {
    if (!canSave || kcalValue === null) return;
    setError(null);
    create.mutate(
      {
        name: name.trim(),
        category,
        custom_kind: kind,
        kcal_100g: kcalValue,
        protein_100g: num(protein) ?? 0,
        fat_100g: num(fat) ?? 0,
        carbs_100g: num(carbs) ?? 0,
      },
      {
        onSuccess: () => {
          toast(t('foodCreate.created'));
          router.back();
        },
        onError: (e) => setError(e instanceof ApiError ? e.detail : t('common.retry')),
      },
    );
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <ScreenTitle>{t('foodCreate.title')}</ScreenTitle>
            <Pressable
              onPress={() => router.back()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
              style={styles.close}
            >
              <CloseIcon color={colors.textMuted} />
            </Pressable>
          </View>

          <Field
            label={t('foodCreate.nameLabel')}
            value={name}
            onChangeText={setName}
            placeholder={t('foodCreate.namePlaceholder')}
            autoFocus
          />

          <View style={styles.section}>
            <MicroLabel>{t('foodCreate.kindLabel')}</MicroLabel>
            <OptionChips
              options={KINDS}
              value={kind}
              onSelect={(v) => v && setKind(v)}
              labelFor={(v) => t(`foodCreate.kind.${v}`)}
            />
          </View>

          <View style={styles.section}>
            <MicroLabel>{t('foodCreate.categoryLabel')}</MicroLabel>
            <OptionChips
              options={CATEGORIES}
              value={category}
              onSelect={(v) => v && setCategory(v)}
              labelFor={(v) => t(`foodCreate.category.${v}`)}
            />
          </View>

          <View style={styles.section}>
            <MicroLabel>{t('foodCreate.per100g')}</MicroLabel>
            <Field
              label={t('foodCreate.kcal')}
              value={kcal}
              onChangeText={setKcal}
              keyboardType="decimal-pad"
              placeholder="0"
            />
            <View style={styles.macroRow}>
              {(
                [
                  ['protein', protein, setProtein],
                  ['fat', fat, setFat],
                  ['carbs', carbs, setCarbs],
                ] as const
              ).map(([key, value, setter]) => (
                <View key={key} style={styles.macroCell}>
                  <Field
                    label={t(`foodCreate.${key}`)}
                    value={value}
                    onChangeText={setter}
                    keyboardType="decimal-pad"
                    placeholder="0"
                  />
                </View>
              ))}
            </View>
            <Text style={styles.hint}>{t('foodCreate.macroHint')}</Text>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            title={t('foodCreate.submit')}
            onPress={submit}
            disabled={!canSave}
            loading={create.isPending}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.screen, gap: spacing.l, paddingBottom: spacing.l },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  close: { padding: spacing.xs },
  section: { gap: spacing.s },
  macroRow: { flexDirection: 'row', gap: spacing.s },
  macroCell: { flex: 1 },
  hint: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted },
  error: { fontFamily: font.medium, fontSize: 13, color: colors.risk },
  footer: {
    padding: spacing.screen,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
  },
});
