// Черновик шаблона тренировки, общий для конструктора (workout-edit.tsx) и
// выбора упражнений (exercise-picker.tsx). Выбор открывается модалкой поверх
// конструктора и складывает упражнения сюда, а не передаёт их параметрами
// маршрута: список может быть длинным, а карточка упражнения нужна целиком.
// Только в памяти: незаконченный черновик после перезапуска не восстанавливаем.

import { create } from 'zustand';

import { defaultMode } from './exercises';
import type { ExerciseShort, Workout, WorkoutItemMode, WorkoutPayload } from './types';

export interface DraftItem {
  /** Локальный ключ строки: одно упражнение можно добавить дважды */
  key: string;
  exercise: ExerciseShort;
  mode: WorkoutItemMode;
  /** null, пока поле стёрто при вводе; сохранить такой черновик нельзя */
  sets: number | null;
  reps: number | null;
  weight_kg: number | null;
  duration_sec: number | null;
  rest_sec: number | null;
}

export interface WorkoutDraftState {
  /** id шаблона при правке, null при создании */
  workoutId: string | null;
  name: string;
  notes: string;
  items: DraftItem[];
  /** Черновик изменён и не сохранён: закрытие спрашивает подтверждение */
  dirty: boolean;
  startNew: () => void;
  loadFrom: (workout: Workout) => void;
  setName: (name: string) => void;
  setNotes: (notes: string) => void;
  addExercises: (exercises: ExerciseShort[]) => void;
  updateItem: (key: string, patch: Partial<Omit<DraftItem, 'key' | 'exercise'>>) => void;
  removeItem: (key: string) => void;
  moveItem: (key: string, delta: -1 | 1) => void;
}

let seq = 0;
const nextKey = () => `item-${Date.now()}-${seq++}`;

const DEFAULT_SETS = 3;
const DEFAULT_REPS = 10;
const DEFAULT_DURATION_SEC = 30;
const DEFAULT_REST_SEC = 60;

const newItem = (exercise: ExerciseShort): DraftItem => {
  const mode = defaultMode(exercise);
  return {
    key: nextKey(),
    exercise,
    mode,
    sets: DEFAULT_SETS,
    reps: mode === 'reps' ? DEFAULT_REPS : null,
    weight_kg: null,
    duration_sec: mode === 'time' ? DEFAULT_DURATION_SEC : null,
    rest_sec: DEFAULT_REST_SEC,
  };
};

export const workoutDraftStore = create<WorkoutDraftState>((set) => ({
  workoutId: null,
  name: '',
  notes: '',
  items: [],
  dirty: false,
  startNew: () => set({ workoutId: null, name: '', notes: '', items: [], dirty: false }),
  loadFrom: (workout) =>
    set({
      workoutId: workout.id,
      name: workout.name,
      notes: workout.notes ?? '',
      items: workout.items.map((item) => ({
        key: nextKey(),
        exercise: item.exercise,
        mode: item.mode,
        sets: item.sets,
        reps: item.reps,
        weight_kg: item.weight_kg,
        duration_sec: item.duration_sec,
        rest_sec: item.rest_sec,
      })),
      dirty: false,
    }),
  setName: (name) => set({ name, dirty: true }),
  setNotes: (notes) => set({ notes, dirty: true }),
  addExercises: (exercises) =>
    set((state) => ({ items: [...state.items, ...exercises.map(newItem)], dirty: true })),
  updateItem: (key, patch) =>
    set((state) => ({
      items: state.items.map((item) => {
        if (item.key !== key) return item;
        const next = { ...item, ...patch };
        // Смена режима: поля другого режима сервер не примет (422)
        if (patch.mode === 'time') {
          next.reps = null;
          next.weight_kg = null;
          next.duration_sec = next.duration_sec ?? DEFAULT_DURATION_SEC;
        } else if (patch.mode === 'reps') {
          next.duration_sec = null;
          next.reps = next.reps ?? DEFAULT_REPS;
        }
        return next;
      }),
      dirty: true,
    })),
  removeItem: (key) => set((state) => ({ items: state.items.filter((i) => i.key !== key), dirty: true })),
  moveItem: (key, delta) =>
    set((state) => {
      const index = state.items.findIndex((i) => i.key === key);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= state.items.length) return state;
      const items = [...state.items];
      [items[index], items[target]] = [items[target], items[index]];
      return { items, dirty: true };
    }),
}));

export const MAX_ITEMS = 30; // столько же принимает бэкенд (WorkoutIn)

// Границы те же, что в app/schemas/workout.py: проверяем до отправки, чтобы
// показать ошибку у поля, а не общий 422 после нажатия «Сохранить».
export const LIMITS = {
  sets: [1, 20],
  reps: [1, 100],
  weight_kg: [0, 500],
  duration_sec: [5, 3600],
  rest_sec: [0, 600],
} as const;

type LimitedField = keyof typeof LIMITS;

const outOfRange = (field: LimitedField, value: number | null, required: boolean) => {
  if (value == null) return required;
  const [min, max] = LIMITS[field];
  return value < min || value > max;
};

/** Поля строки с ошибкой; пустой список, если строка валидна. */
export function invalidFields(item: DraftItem): LimitedField[] {
  const bad: LimitedField[] = [];
  if (outOfRange('sets', item.sets, true)) bad.push('sets');
  if (item.mode === 'reps') {
    if (outOfRange('reps', item.reps, true)) bad.push('reps');
    if (outOfRange('weight_kg', item.weight_kg, false)) bad.push('weight_kg');
  } else if (outOfRange('duration_sec', item.duration_sec, true)) {
    bad.push('duration_sec');
  }
  if (outOfRange('rest_sec', item.rest_sec, false)) bad.push('rest_sec');
  return bad;
}

export function draftToPayload(state: Pick<WorkoutDraftState, 'name' | 'notes' | 'items'>): WorkoutPayload {
  return {
    name: state.name.trim(),
    notes: state.notes.trim() || null,
    items: state.items.map((item) => ({
      exercise_id: item.exercise.id,
      mode: item.mode,
      sets: item.sets ?? 1, // null отсекает invalidFields до отправки
      reps: item.mode === 'reps' ? item.reps : null,
      weight_kg: item.mode === 'reps' ? item.weight_kg : null,
      duration_sec: item.mode === 'time' ? item.duration_sec : null,
      rest_sec: item.rest_sec,
    })),
  };
}
