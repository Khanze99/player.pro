// Справочник упражнений и шаблоны тренировок: всё, что зависит от языка и
// формата, в одном месте (docs/plan-workout-builder.md).

import type { TFunction } from 'i18next';

import type { Exercise, ExerciseShort, WorkoutItemMode } from './types';

type Lang = 'ru' | 'en' | 'es';

const langOf = (language: string): Lang =>
  language.startsWith('en') ? 'en' : language.startsWith('es') ? 'es' : 'ru';

/** Язык для сортировки поиска на бэкенде. */
export const searchLang = langOf;

export const exerciseName = (exercise: ExerciseShort, language: string): string =>
  exercise[`name_${langOf(language)}`];

export const exerciseSteps = (exercise: Exercise, language: string): string[] =>
  exercise[`steps_${langOf(language)}`];

/** Значения справочника (инвентарь, мышцы) переводятся ключами i18n;
 *  неизвестное значение (новое в датасете) показываем как есть. Целевая и
 *  вторичные мышцы в одном словаре: значения пересекаются. */
export const equipmentLabel = (value: string, t: TFunction) =>
  t(`exercise.equipment.${value}`, { defaultValue: value });

export const muscleLabel = (value: string, t: TFunction) =>
  t(`exercise.muscle.${value}`, { defaultValue: value });

export const targetLabel = muscleLabel;

/** Режим по умолчанию: кардио на время, остальное на повторы. */
export const defaultMode = (exercise: ExerciseShort): WorkoutItemMode =>
  exercise.body_part === 'cardio' ? 'time' : 'reps';

export interface TargetLike {
  mode: WorkoutItemMode;
  sets: number;
  reps?: number | null;
  weight_kg?: number | null;
  duration_sec?: number | null;
}

export const formatWeight = (kg: number) => (Number.isInteger(kg) ? String(kg) : kg.toFixed(1));

export const formatDuration = (sec: number, t: TFunction) =>
  sec >= 60 && sec % 60 === 0
    ? t('workouts.minutesShort', { n: sec / 60 })
    : sec > 60
      ? t('workouts.minSec', { m: Math.floor(sec / 60), s: sec % 60 })
      : t('workouts.secondsShort', { n: sec });

/** «3 × 10 × 40 кг», «3 × 10», «2 × 45 с». */
export function formatTarget(item: TargetLike, t: TFunction): string {
  if (item.mode === 'time') return `${item.sets} × ${formatDuration(item.duration_sec ?? 0, t)}`;
  const base = `${item.sets} × ${item.reps ?? 0}`;
  return item.weight_kg != null && item.weight_kg > 0
    ? `${base} × ${t('workouts.kg', { n: formatWeight(item.weight_kg) })}`
    : base;
}
