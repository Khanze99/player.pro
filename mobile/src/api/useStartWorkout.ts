// Старт тренировки из конструктора («Начать сейчас») и из карточки события
// («Начать»). Конфликты 409 сервер отдаёт структурой (WorkoutConflict):
// незавершённую тренировку предлагаем продолжить, а не стартовать вторую.

import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { confirmAction } from '@/components/confirm';
import { useToast } from '@/components/Toast';

import { ApiError } from './client';
import { type StartSessionPayload, useStartSession } from './hooks';
import type { WorkoutConflict } from './types';

const conflictOf = (e: unknown): WorkoutConflict | null =>
  e instanceof ApiError && e.status === 409 && e.payload && typeof e.payload === 'object'
    ? (e.payload as WorkoutConflict)
    : null;

export function useStartWorkout() {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast((s) => s.show);
  const start = useStartSession();

  const open = (id: string) => router.push({ pathname: '/workout-run', params: { id } });

  const run = (body: StartSessionPayload) =>
    start.mutate(body, {
      onSuccess: (session) => open(session.id),
      onError: (e) => {
        const conflict = conflictOf(e);
        if (conflict?.session_id && conflict.code === 'active_session') {
          confirmAction({
            title: t('workoutRun.activeTitle'),
            message: t('workoutRun.activeMessage'),
            confirmLabel: t('workoutRun.continue'),
            cancelLabel: t('common.cancel'),
            onConfirm: () => open(conflict.session_id!),
          });
        } else if (conflict?.session_id && conflict.code === 'event_has_session') {
          open(conflict.session_id);
        } else {
          toast(e instanceof ApiError ? e.detail : t('common.noConnection'));
        }
      },
    });

  return { run, open, isPending: start.isPending };
}
