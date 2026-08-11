// Добавление продукта в дневник: поиск, недавние, сканер штрихкода.
//
// Скорость ввода здесь решает всё: если это дольше 40 секунд, дневник никто вести
// не будет. Отсюда «недавние» первым экраном и порция, подставленная по умолчанию.

import { CameraView, useCameraPermissions } from 'expo-camera';
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

import { useAddFoodEntry, useFoodSearch, useLookupBarcode, useRecentFoods } from '@/api/hooks';
import type { FoodItem, MealType } from '@/api/types';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { CloseIcon } from '@/components/Icons';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { useToast } from '@/components/Toast';
import { MicroLabel, ScreenTitle } from '@/components/Typography';
import { colors, font, radius, spacing } from '@/theme';

type Mode = 'search' | 'recent' | 'scan';
const MODES: readonly Mode[] = ['search', 'recent', 'scan'];

function FoodRow({ item, onPick }: { item: FoodItem; onPick: (item: FoodItem) => void }) {
  return (
    <Pressable style={styles.foodRow} onPress={() => onPick(item)} accessibilityRole="button">
      <View style={styles.foodMain}>
        <Text style={styles.foodName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.cardHint} numberOfLines={1}>
          {[item.brand, `${Math.round(item.kcal_100g)} ккал / 100 г`].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {item.verified ? <Text style={styles.verified}>✓</Text> : null}
    </Pressable>
  );
}

function Scanner({ onFound }: { onFound: (item: FoodItem) => void }) {
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const lookup = useLookupBarcode();
  const toast = useToast((s) => s.show);
  const [scanned, setScanned] = useState<string | null>(null);

  if (!permission) return <Text style={styles.cardHint}>{t('common.loading')}</Text>;

  if (!permission.granted) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardHint}>{t('nutrition.cameraNeeded')}</Text>
        <Button title={t('nutrition.allowCamera')} onPress={() => void requestPermission()} />
      </View>
    );
  }

  return (
    <View style={styles.scannerWrap}>
      <CameraView
        style={styles.scanner}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
        onBarcodeScanned={({ data }) => {
          // Камера шлёт кадры непрерывно — повторный запрос по тому же коду не нужен
          if (data === scanned || lookup.isPending) return;
          setScanned(data);
          lookup.mutate(data, {
            onSuccess: onFound,
            onError: () => {
              toast(t('nutrition.barcodeNotFound'));
              setScanned(null);
            },
          });
        }}
      />
      <Text style={styles.scannerHint}>{t('nutrition.scanHint')}</Text>
    </View>
  );
}

export default function FoodAdd() {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast((s) => s.show);
  const { day, meal } = useLocalSearchParams<{ day: string; meal: MealType }>();

  const [mode, setMode] = useState<Mode>('search');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<FoodItem | null>(null);
  const [grams, setGrams] = useState('100');

  const search = useFoodSearch(query);
  const recent = useRecentFoods();
  const addEntry = useAddFoodEntry();

  const pick = (item: FoodItem) => {
    setPicked(item);
    setGrams(String(item.serving_size_g ?? 100));
  };

  const submit = () => {
    if (!picked) return;
    const value = Number(grams);
    if (!Number.isFinite(value) || value <= 0) return;
    addEntry.mutate(
      { date: day, meal, food_item_id: picked.id, grams: value },
      {
        onSuccess: () => {
          toast(t('nutrition.added'));
          router.back();
        },
      },
    );
  };

  const kcalPreview = picked ? Math.round((picked.kcal_100g * Number(grams || 0)) / 100) : 0;

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <ScreenTitle>{t(`nutrition.meal.${meal}`)}</ScreenTitle>
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

          {picked ? (
            <View style={styles.card}>
              <MicroLabel>{t('nutrition.portion')}</MicroLabel>
              <Text style={styles.foodName}>{picked.name}</Text>
              <Field
                label={t('nutrition.grams')}
                value={grams}
                onChangeText={setGrams}
                keyboardType="number-pad"
                autoFocus
              />
              <Text style={styles.preview}>{t('nutrition.willAdd', { n: kcalPreview })}</Text>
              <Button title={t('nutrition.addToDiary')} onPress={submit} loading={addEntry.isPending} />
              <Pressable onPress={() => setPicked(null)}>
                <Text style={styles.copyText}>{t('nutrition.pickAnother')}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Segmented
                options={MODES}
                value={mode}
                onSelect={setMode}
                labelFor={(m) => t(`nutrition.mode.${m}`)}
              />

              {mode === 'search' ? (
                <>
                  <Field
                    label={t('nutrition.searchLabel')}
                    value={query}
                    onChangeText={setQuery}
                    placeholder={t('nutrition.searchPlaceholder')}
                    autoFocus
                  />
                  <View style={styles.card}>
                    {/* Состояния показываем явно: пустая карточка без объяснения
                        читается как «поиск сломан», а не как «ничего не найдено» */}
                    {query.trim().length < 2 ? (
                      <Text style={styles.cardHint}>{t('nutrition.typeToSearch')}</Text>
                    ) : search.isPending ? (
                      <Text style={styles.cardHint}>{t('nutrition.searching')}</Text>
                    ) : search.isError ? (
                      <Text style={styles.error}>{t('nutrition.searchFailed')}</Text>
                    ) : (search.data?.length ?? 0) === 0 ? (
                      <>
                        <Text style={styles.cardHint}>{t('nutrition.nothingFound')}</Text>
                        <Button
                          title={t('nutrition.createOwn')}
                          onPress={() =>
                            router.push({ pathname: '/food-create', params: { name: query.trim() } })
                          }
                        />
                      </>
                    ) : (
                      search.data?.map((item) => (
                        <FoodRow key={item.id} item={item} onPick={pick} />
                      ))
                    )}
                  </View>
                </>
              ) : null}

              {mode === 'recent' ? (
                <View style={styles.card}>
                  {(recent.data ?? []).map((item) => (
                    <FoodRow key={item.id} item={item} onPick={pick} />
                  ))}
                  {(recent.data?.length ?? 0) === 0 ? (
                    <Text style={styles.cardHint}>{t('nutrition.noRecent')}</Text>
                  ) : null}
                </View>
              ) : null}

              {mode !== 'scan' ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/food-create', params: {} })}
                >
                  <Text style={styles.createLink}>{t('nutrition.createOwn')}</Text>
                </Pressable>
              ) : null}

              {mode === 'scan' ? <Scanner onFound={pick} /> : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.screen, gap: spacing.l, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  close: { padding: spacing.xs },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing.l,
    gap: spacing.m,
  },
  cardHint: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted },

  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    paddingVertical: spacing.s,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  foodMain: { flex: 1, gap: 2 },
  foodName: { fontFamily: font.semibold, fontSize: 14, color: colors.text },
  verified: { fontFamily: font.bold, fontSize: 13, color: colors.good },

  preview: { fontFamily: font.medium, fontSize: 13, color: colors.brand },
  error: { fontFamily: font.medium, fontSize: 13, color: colors.risk },
  createLink: {
    fontFamily: font.semibold,
    fontSize: 13,
    color: colors.brand,
    textAlign: 'center',
    paddingVertical: spacing.s,
  },
  copyText: { fontFamily: font.medium, fontSize: 13, color: colors.textMuted, textAlign: 'center' },

  scannerWrap: { gap: spacing.m },
  scanner: { height: 280, borderRadius: radius.card, overflow: 'hidden' },
  scannerHint: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted, textAlign: 'center' },
});
