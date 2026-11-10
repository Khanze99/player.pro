// Выбор упражнений из справочника для конструктора (docs/plan-workout-builder.md).
// Множественный выбор: отмеченные складываются в черновик (workoutDraft.ts),
// конструктор под модалкой видит их сразу после закрытия.

import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { equipmentLabel, exerciseName, searchLang, targetLabel } from '@/api/exercises';
import { useExerciseFacets, useExerciseSearch } from '@/api/hooks';
import type { ExerciseBodyPart, ExerciseShort } from '@/api/types';
import { MAX_ITEMS, workoutDraftStore } from '@/api/workoutDraft';
import { Button } from '@/components/Button';
import { ExerciseThumb } from '@/components/ExerciseThumb';
import { Field } from '@/components/Field';
import { CheckIcon, CloseIcon } from '@/components/Icons';
import { OptionChips } from '@/components/OptionChips';
import { Screen } from '@/components/Screen';
import { MicroLabel, ScreenTitle } from '@/components/Typography';
import { spacing, type Theme, useStyles, useTheme } from '@/theme';

const SEARCH_DEBOUNCE_MS = 300;

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

function ExerciseRow({
  exercise,
  selected,
  onToggle,
  onInfo,
}: {
  exercise: ExerciseShort;
  selected: boolean;
  onToggle: () => void;
  onInfo: () => void;
}) {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t, i18n } = useTranslation();
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onInfo}
        accessibilityRole="button"
        accessibilityLabel={t('exercise.details')}
      >
        <ExerciseThumb exercise={exercise} />
      </Pressable>
      <Pressable
        style={styles.rowMain}
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
      >
        <View style={styles.rowText}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {exerciseName(exercise, i18n.language)}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {targetLabel(exercise.target, t)} · {equipmentLabel(exercise.equipment, t)}
          </Text>
        </View>
        <View style={[styles.check, selected && styles.checkOn]}>
          {selected ? <CheckIcon color={th.onBrand} size={16} /> : null}
        </View>
      </Pressable>
    </View>
  );
}

export default function ExercisePicker() {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t, i18n } = useTranslation();
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [bodyPart, setBodyPart] = useState<ExerciseBodyPart | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [showEquipment, setShowEquipment] = useState(false);
  const [selected, setSelected] = useState<ExerciseShort[]>([]);

  const debouncedQuery = useDebounced(query, SEARCH_DEBOUNCE_MS);
  const facets = useExerciseFacets();
  const search = useExerciseSearch({
    query: debouncedQuery,
    bodyPart,
    equipment,
    lang: searchLang(i18n.language),
  });

  const alreadyInDraft = workoutDraftStore((s) => s.items.length);
  const room = MAX_ITEMS - alreadyInDraft;
  const items = search.data?.pages.flatMap((page) => page.items) ?? [];
  const total = search.data?.pages[0]?.total ?? 0;
  const selectedIds = new Set(selected.map((e) => e.id));

  const toggle = (exercise: ExerciseShort) => {
    if (selectedIds.has(exercise.id)) {
      setSelected((prev) => prev.filter((e) => e.id !== exercise.id));
    } else if (selected.length < room) {
      setSelected((prev) => [...prev, exercise]);
    }
  };

  const submit = () => {
    workoutDraftStore.getState().addExercises(selected);
    router.back();
  };

  const header = (
    <View style={styles.headerBlock}>
      <View style={styles.header}>
        <ScreenTitle>{t('exercise.pickTitle')}</ScreenTitle>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
          style={styles.close}
        >
          <CloseIcon color={th.textMuted} />
        </Pressable>
      </View>

      <Field
        value={query}
        onChangeText={setQuery}
        placeholder={t('exercise.searchPlaceholder')}
        autoCorrect={false}
        returnKeyType="search"
      />

      <OptionChips
        options={(facets.data?.body_parts ?? []).map((f) => f.value as ExerciseBodyPart)}
        value={bodyPart}
        onSelect={setBodyPart}
        labelFor={(v) => t(`exercise.bodyPart.${v}`)}
      />

      <Pressable
        accessibilityRole="button"
        onPress={() => setShowEquipment((v) => !v)}
        style={styles.equipmentToggle}
      >
        <MicroLabel>
          {t('exercise.equipmentLabel')}
          {equipment ? `: ${equipmentLabel(equipment, t)}` : ''}
        </MicroLabel>
        <Text style={styles.link}>{showEquipment ? t('exercise.hide') : t('exercise.show')}</Text>
      </Pressable>
      {showEquipment ? (
        <OptionChips
          options={(facets.data?.equipment ?? []).map((f) => f.value)}
          value={equipment}
          onSelect={setEquipment}
          labelFor={(v) => equipmentLabel(v, t)}
        />
      ) : null}

      {search.isSuccess ? (
        <Text style={styles.hint}>{t('exercise.found', { count: total })}</Text>
      ) : null}
      {room <= 0 ? <Text style={styles.error}>{t('workouts.limitReached', { n: MAX_ITEMS })}</Text> : null}
    </View>
  );

  // Пустые состояния явные: пустой список без объяснения читается как «сломалось»
  const empty = search.isPending ? (
    <ActivityIndicator color={th.textMuted} style={styles.state} />
  ) : search.isError ? (
    <View style={styles.state}>
      <Text style={styles.error}>{t('exercise.loadFailed')}</Text>
      <Pressable accessibilityRole="button" onPress={() => void search.refetch()}>
        <Text style={styles.link}>{t('common.retry')}</Text>
      </Pressable>
    </View>
  ) : (
    <Text style={[styles.hint, styles.state]}>{t('exercise.nothingFound')}</Text>
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        renderItem={({ item }) => (
          <ExerciseRow
            exercise={item}
            selected={selectedIds.has(item.id)}
            onToggle={() => toggle(item)}
            onInfo={() => router.push({ pathname: '/exercise/[id]', params: { id: item.id } })}
          />
        )}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (search.hasNextPage && !search.isFetchingNextPage) void search.fetchNextPage();
        }}
        ListFooterComponent={
          <View style={styles.footerInfo}>
            {search.isFetchingNextPage ? <ActivityIndicator color={th.textMuted} /> : null}
            {/* Условие лицензии Gym Visual: указывать источник рядом с медиа */}
            {items.length > 0 ? <Text style={styles.credit}>{t('exercise.mediaCredit')}</Text> : null}
          </View>
        }
      />
      <View style={styles.footer}>
        <Button
          title={
            selected.length > 0
              ? t('exercise.addSelected', { count: selected.length })
              : t('exercise.selectHint')
          }
          onPress={submit}
          disabled={selected.length === 0}
        />
      </View>
    </Screen>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  content: { paddingHorizontal: spacing.screen, paddingBottom: spacing.xl },
  headerBlock: { gap: spacing.m, paddingTop: spacing.screen, paddingBottom: spacing.m },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  close: { padding: spacing.xs },
  equipmentToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { fontFamily: th.font.semibold, fontSize: 13, color: th.brandOn },
  hint: { fontFamily: th.font.regular, fontSize: 12, color: th.textMuted },
  error: { fontFamily: th.font.medium, fontSize: 13, color: th.risk },
  state: { paddingVertical: spacing.xxl, alignItems: 'center', gap: spacing.s, textAlign: 'center' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    paddingVertical: spacing.s,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: th.border,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.m },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: th.font.semibold, fontSize: 14, color: th.text },
  rowMeta: { fontFamily: th.font.regular, fontSize: 12, color: th.textMuted },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: th.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: th.brand, borderColor: th.brand },

  footerInfo: { paddingVertical: spacing.l, gap: spacing.s, alignItems: 'center' },
  credit: { fontFamily: th.font.regular, fontSize: 11, color: th.textMuted, textAlign: 'center' },
  footer: { paddingHorizontal: spacing.screen, paddingVertical: spacing.m },
});
