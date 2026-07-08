import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, patch } from './client';
import type {
  AvailabilitySummary,
  DailyMetric,
  Me,
  RpeEntry,
  RpePayload,
  Streak,
  WellnessEntry,
  WellnessPayload,
} from './types';
import { flushQueue, postOrQueue } from '../offline/queue';

export const todayISO = () => new Date().toISOString().slice(0, 10);

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/auth/me') });

export const useMyTeams = () =>
  useQuery({
    queryKey: ['teams'],
    queryFn: () => api<{ id: string; name: string }[]>('/teams'),
  });

export const useMetrics = (days = 28) =>
  useQuery({
    queryKey: ['metrics', days],
    queryFn: () =>
      api<DailyMetric[]>(`/analytics/me/metrics?date_from=${daysAgoISO(days - 1)}&date_to=${todayISO()}`),
  });

export const useStreaks = () =>
  useQuery({ queryKey: ['streaks'], queryFn: () => api<Streak[]>('/analytics/me/streaks') });

export const useWellnessHistory = (days = 30) =>
  useQuery({
    queryKey: ['wellness', days],
    queryFn: () =>
      api<WellnessEntry[]>(`/wellness/me?date_from=${daysAgoISO(days - 1)}&date_to=${todayISO()}`),
  });

export const useRpeHistory = (days = 30) =>
  useQuery({
    queryKey: ['rpe', days],
    queryFn: () => api<RpeEntry[]>(`/rpe/me?date_from=${daysAgoISO(days - 1)}&date_to=${todayISO()}`),
  });

export const useAvailabilitySummary = (athleteId: string | undefined) =>
  useQuery({
    queryKey: ['availability', athleteId],
    enabled: !!athleteId,
    queryFn: () => api<AvailabilitySummary>(`/availability/athletes/${athleteId}/summary`),
  });

/** После любой записи данные пересчитываются на сервере — сбрасываем всё связанное. */
function useInvalidateAthleteData() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['metrics'] });
    void qc.invalidateQueries({ queryKey: ['streaks'] });
    void qc.invalidateQueries({ queryKey: ['wellness'] });
    void qc.invalidateQueries({ queryKey: ['rpe'] });
  };
}

/** true — отправлено, false — сохранено офлайн. */
export function useSubmitWellness() {
  const invalidate = useInvalidateAthleteData();
  return useMutation({
    mutationFn: (payload: WellnessPayload) => postOrQueue('/wellness', payload),
    onSuccess: invalidate,
  });
}

export function useSubmitRpe() {
  const invalidate = useInvalidateAthleteData();
  return useMutation({
    mutationFn: (payload: RpePayload) => postOrQueue('/rpe', payload),
    onSuccess: invalidate,
  });
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; locale?: string }) => patch<Me>('/users/me', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['me'] }),
  });
}

export { flushQueue };
