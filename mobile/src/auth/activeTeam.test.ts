import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { activeTeamStore, hydrateActiveTeam } from './activeTeam';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

beforeEach(async () => {
  await AsyncStorage.clear();
  activeTeamStore.setState({ activeTeamId: null, hydrated: false });
});

describe('activeTeamStore', () => {
  test('setActiveTeam обновляет стейт и сохраняет в AsyncStorage', async () => {
    activeTeamStore.getState().setActiveTeam('team-1');
    expect(activeTeamStore.getState().activeTeamId).toBe('team-1');
    await Promise.resolve(); // AsyncStorage.setItem — fire-and-forget
    expect(await AsyncStorage.getItem('pp_active_team_id')).toBe('team-1');
  });

  test('clearActiveTeam сбрасывает стейт и чистит AsyncStorage', async () => {
    activeTeamStore.getState().setActiveTeam('team-1');
    await Promise.resolve();
    activeTeamStore.getState().clearActiveTeam();
    expect(activeTeamStore.getState().activeTeamId).toBeNull();
    await Promise.resolve();
    expect(await AsyncStorage.getItem('pp_active_team_id')).toBeNull();
  });
});

describe('hydrateActiveTeam', () => {
  test('сохранённое значение подхватывается, hydrated становится true', async () => {
    await AsyncStorage.setItem('pp_active_team_id', 'team-saved');
    await hydrateActiveTeam();
    expect(activeTeamStore.getState()).toMatchObject({ activeTeamId: 'team-saved', hydrated: true });
  });

  test('пусто в хранилище → activeTeamId null, hydrated true (не блокирует гейт навсегда)', async () => {
    await hydrateActiveTeam();
    expect(activeTeamStore.getState()).toMatchObject({ activeTeamId: null, hydrated: true });
  });
});
