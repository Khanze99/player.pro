import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, patch, post } from './client';
import type {
  AthleteProfile,
  Attendance,
  CycleInsights,
  CycleLog,
  CycleLogPayload,
  CycleSettings,
  CycleState,
  Features,
  FoodItem,
  FoodItemPayload,
  FoodLogPayload,
  NutritionDay,
  NutritionTarget,
  Consent,
  ConsentAudience,
  ConsentList,
  ConsentScope,
  AttendanceStatus,
  AvailabilitySummary,
  CalendarEvent,
  DailyMetric,
  EventPayload,
  Invitation,
  InvitePayload,
  Me,
  RpeEntry,
  RpeSession,
  RpePayload,
  SquadStatus,
  Streak,
  TeamInjuries,
  TeamMember,
  TeamSummary,
  WellnessEntry,
  WellnessPayload,
} from './types';
import { daysAgoISO, localDayBounds, todayISO, tzOffsetMin } from './dates';
import { flushQueue, postOrQueue } from '../offline/queue';

export { todayISO };

export const useMe = (enabled = true) =>
  useQuery({ queryKey: ['me'], enabled, queryFn: () => api<Me>('/auth/me') });

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

/** Сессии дня для карточки RPE: что уже закончилось и что уже оценено. */
export const useRpeSessions = (dayISO: string) =>
  useQuery({
    queryKey: ['rpe-sessions', dayISO],
    // Сутки режет сервер, но по локальному дню игрока — иначе после полуночи
    // в UTC+3 в «сегодня» попадали бы вчерашние тренировки
    queryFn: () => api<RpeSession[]>(`/rpe/sessions?day=${dayISO}&tz_offset_min=${tzOffsetMin()}`),
  });

export const useSquadStatus = (teamId: string | undefined) =>
  useQuery({
    queryKey: ['squad', teamId],
    enabled: !!teamId,
    queryFn: () => api<SquadStatus>(`/dashboard/teams/${teamId}/squad-status`),
  });

export const useTeamSummary = (teamId: string | undefined) =>
  useQuery({
    queryKey: ['team-summary', teamId],
    enabled: !!teamId,
    queryFn: () => api<TeamSummary>(`/dashboard/teams/${teamId}/summary`),
  });

export const useTeamInjuries = (teamId: string | undefined) =>
  useQuery({
    queryKey: ['team-injuries', teamId],
    enabled: !!teamId,
    queryFn: () => api<TeamInjuries>(`/dashboard/teams/${teamId}/injuries`),
  });

export const useMyConsents = () =>
  useQuery({ queryKey: ['consents'], queryFn: () => api<ConsentList>('/consents/me') });

export function useSetConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { scope: ConsentScope; audience: ConsentAudience }) =>
      api<Consent>('/consents/me', { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consents'] }),
  });
}

export const useMyProfile = () =>
  useQuery({ queryKey: ['profile'], queryFn: () => api<AthleteProfile>('/users/me/profile') });

export const useCycleSettings = () =>
  useQuery({ queryKey: ['cycle-settings'], queryFn: () => api<CycleSettings>('/cycle/me/settings') });

export function useUpdateCycleSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<CycleSettings>) =>
      api<CycleSettings>('/cycle/me/settings', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cycle-settings'] });
      void qc.invalidateQueries({ queryKey: ['cycle-state'] });
    },
  });
}

export const useCycleState = (enabled = true) =>
  useQuery({ queryKey: ['cycle-state'], enabled, queryFn: () => api<CycleState>('/cycle/me/state') });

export const useCycleLogs = (days = 90, enabled = true) =>
  useQuery({
    queryKey: ['cycle-logs', days],
    enabled,
    queryFn: () =>
      api<CycleLog[]>(`/cycle/me/logs?date_from=${daysAgoISO(days - 1)}&date_to=${todayISO()}`),
  });

export const useCycleInsights = (enabled = true) =>
  useQuery({
    queryKey: ['cycle-insights'],
    enabled,
    queryFn: () => api<CycleInsights>('/cycle/me/insights'),
  });

export function useUpsertCycleLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CycleLogPayload) =>
      api<CycleLog>('/cycle/me/logs', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cycle-logs'] });
      void qc.invalidateQueries({ queryKey: ['cycle-state'] });
      void qc.invalidateQueries({ queryKey: ['cycle-insights'] });
    },
  });
}

/** Гейтить по активной сессии обязательно: эндпоинт требует токена, а закэшенная
 *  ошибка 401 до логина оставила бы фича-вкладки скрытыми после входа. */
export const useFeatures = (enabled = true) =>
  useQuery({ queryKey: ['features'], enabled, queryFn: () => api<Features>('/features') });

export const useNutritionDay = (day: string) =>
  useQuery({
    queryKey: ['nutrition-day', day],
    queryFn: () => api<NutritionDay>(`/nutrition/me/day?day=${day}`),
  });

export const useFoodSearch = (query: string) =>
  useQuery({
    queryKey: ['food-search', query],
    enabled: query.trim().length >= 2,
    queryFn: () => api<FoodItem[]>(`/nutrition/foods/search?q=${encodeURIComponent(query.trim())}`),
  });

export const useRecentFoods = () =>
  useQuery({ queryKey: ['food-recent'], queryFn: () => api<FoodItem[]>('/nutrition/foods/recent') });

export function useLookupBarcode() {
  return useMutation({
    mutationFn: (barcode: string) => api<FoodItem>(`/nutrition/foods/barcode/${barcode}`),
  });
}

function useInvalidateNutrition() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['nutrition-day'] });
    void qc.invalidateQueries({ queryKey: ['food-recent'] });
  };
}

export function useCreateFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: FoodItemPayload) => post<FoodItem>('/nutrition/foods', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['food-search'] }),
  });
}

export function useAddFoodEntry() {
  const invalidate = useInvalidateNutrition();
  return useMutation({
    mutationFn: (payload: FoodLogPayload) => post<unknown>('/nutrition/me/entries', payload),
    onSuccess: invalidate,
  });
}

export function useDeleteFoodEntry() {
  const invalidate = useInvalidateNutrition();
  return useMutation({
    mutationFn: (entryId: string) => api<void>(`/nutrition/me/entries/${entryId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export function useCopyMeal() {
  const invalidate = useInvalidateNutrition();
  return useMutation({
    mutationFn: (p: { source_day: string; target_day: string; meal: string }) =>
      api<{ copied: number }>(
        `/nutrition/me/copy-meal?source_day=${p.source_day}&target_day=${p.target_day}&meal=${p.meal}`,
        { method: 'POST' },
      ),
    onSuccess: invalidate,
  });
}

export function useSetNutritionTarget() {
  const invalidate = useInvalidateNutrition();
  return useMutation({
    mutationFn: (body: { kcal: number }) =>
      api<NutritionTarget>('/nutrition/me/target', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: invalidate,
  });
}

export function useCreateInvite() {
  return useMutation({
    mutationFn: (payload: InvitePayload) => post<Invitation>('/organizations/invites', payload),
  });
}

export const useTeamMembers = (teamId: string | null | undefined) =>
  useQuery({
    queryKey: ['members', teamId],
    enabled: !!teamId,
    queryFn: () => api<TeamMember[]>(`/teams/${teamId}/members`),
  });

/** События команд пользователя + индивидуальные за окно дат (границы — UTC-сутки). */
export const useMyEvents = (fromISO: string, toISO: string) =>
  useQuery({
    queryKey: ['events', fromISO, toISO],
    queryFn: () => {
      // fromISO/toISO — локальные даты, эндпоинт фильтрует по моменту времени
      const { from, to } = localDayBounds(fromISO, toISO);
      return api<CalendarEvent[]>(`/events/me?date_from=${from}&date_to=${to}`);
    },
  });

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: EventPayload) => post<CalendarEvent>('/events', payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['events'] }),
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => api<void>(`/events/${eventId}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['events'] }),
  });
}

/** Посещаемость видит только штаб — включать по роли. */
export const useAttendance = (eventId: string, enabled: boolean) =>
  useQuery({
    queryKey: ['attendance', eventId],
    enabled,
    queryFn: () => api<Attendance[]>(`/events/${eventId}/attendance`),
  });

export function useSetAttendance(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { user_id: string; status: AttendanceStatus }) =>
      api<Attendance>(`/events/${eventId}/attendance`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['attendance', eventId] }),
  });
}

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
    void qc.invalidateQueries({ queryKey: ['rpe-sessions'] });
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
    mutationFn: (body: {
      last_name?: string;
      first_name?: string;
      middle_name?: string;
      locale?: string;
    }) => patch<Me>('/users/me', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['me'] }),
  });
}

export { flushQueue };
