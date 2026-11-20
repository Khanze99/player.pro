import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, post } from './client';
import type { AvailabilityNotes, AvailabilityPage, AvailabilityPayload, AvailabilitySaved, AvailabilityState } from './availability-types';

export function useAvailabilityState(athleteId: string) {
  return useQuery({
    queryKey: ['availability-state', athleteId],
    queryFn: () => api<AvailabilityState>(`/availability/athletes/${athleteId}/state`),
    retry: false,
  });
}

export function useAvailabilityHistory(athleteId: string, page: number, enabled: boolean) {
  return useQuery({
    queryKey: ['availability-history', athleteId, page], enabled, retry: false,
    queryFn: () => api<AvailabilityPage>(`/availability/athletes/${athleteId}/changes?page=${page}`),
  });
}

export function useAvailabilityNotes(athleteId: string, page: number, enabled: boolean) {
  return useQuery({
    queryKey: ['availability-notes', athleteId, page], enabled, retry: false,
    queryFn: () => api<AvailabilityNotes>(`/availability/athletes/${athleteId}/medical-notes?page=${page}`),
  });
}

export function useChangeAvailability() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: AvailabilityPayload) => post<AvailabilitySaved>('/availability/changes', payload),
    onSuccess: async saved => {
      client.setQueryData(['availability-state', saved.state.athlete_id], saved.state);
      await Promise.all(['availability', 'availability-state', 'availability-history', 'availability-notes', 'squad', 'team-summary', 'notifications'].map(key =>
        client.invalidateQueries({ queryKey: [key] }),
      ));
    },
  });
}
