import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAvailabilityHistory, useAvailabilityNotes, useAvailabilityState, useChangeAvailability } from './availability';
import type { AvailabilityPayload, AvailabilitySaved } from './availability-types';
import { api, post } from './client';

jest.mock('@tanstack/react-query', () => ({ useQuery: jest.fn(), useMutation: jest.fn(), useQueryClient: jest.fn() }));
jest.mock('./client', () => ({ api: jest.fn(), post: jest.fn() }));

type QueryOptions = { queryKey: unknown[]; enabled?: boolean; queryFn: () => Promise<unknown> };
type MutationOptions = { mutationFn: (payload: AvailabilityPayload) => Promise<unknown>; onSuccess: (saved: AvailabilitySaved) => Promise<void> };
const cache = { setQueryData: jest.fn(), invalidateQueries: jest.fn<() => Promise<void>>() };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useQueryClient).mockReturnValue(cache as unknown as ReturnType<typeof useQueryClient>);
  cache.invalidateQueries.mockResolvedValue(undefined);
});

function queryOptions() {
  return jest.mocked(useQuery).mock.calls.at(-1)![0] as unknown as QueryOptions;
}

describe('availability API hooks', () => {
  it('loads state without substituting full on the client', async () => {
    useAvailabilityState('athlete-id');
    await queryOptions().queryFn();
    expect(api).toHaveBeenCalledWith('/availability/athletes/athlete-id/state');
  });

  it('does not enable medical notes without detail permission', () => {
    useAvailabilityNotes('athlete-id', 1, false);
    expect(queryOptions().enabled).toBe(false);
  });

  it('requests the selected history and notes pages independently', async () => {
    useAvailabilityHistory('athlete-id', 2, true);
    await queryOptions().queryFn();
    expect(api).toHaveBeenCalledWith('/availability/athletes/athlete-id/changes?page=2');
    useAvailabilityNotes('athlete-id', 3, true);
    await queryOptions().queryFn();
    expect(api).toHaveBeenCalledWith('/availability/athletes/athlete-id/medical-notes?page=3');
  });

  it('sends direction, reason, concurrency version and stable request ID', async () => {
    useChangeAvailability();
    const options = jest.mocked(useMutation).mock.calls[0][0] as unknown as MutationOptions;
    const payload: AvailabilityPayload = {
      athlete_id: 'athlete-id', direction: 'medical', status: 'modified', date: '2026-11-19',
      comment: 'Synthetic reason', medical_note: 'Synthetic note', expected_version: 3, request_id: 'request-id',
    };
    await options.mutationFn(payload);
    expect(post).toHaveBeenCalledWith('/availability/changes', payload);
  });

  it('refreshes both team dashboards and athlete detail after a successful mutation', async () => {
    useChangeAvailability();
    const options = jest.mocked(useMutation).mock.calls[0][0] as unknown as MutationOptions;
    const saved = { state: { athlete_id: 'athlete-id', status: 'unavailable' } } as AvailabilitySaved;
    await options.onSuccess(saved);
    expect(cache.setQueryData).toHaveBeenCalledWith(['availability-state', 'athlete-id'], saved.state);
    for (const key of ['availability', 'availability-state', 'availability-history', 'availability-notes', 'squad', 'team-summary']) {
      expect(cache.invalidateQueries).toHaveBeenCalledWith({ queryKey: [key] });
    }
  });
});
