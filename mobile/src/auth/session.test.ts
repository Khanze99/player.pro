import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { bootstrapSession, clearSession, session } from './session';
import * as vault from './vault';

// Секреты и устройство — заглушки: тестируем только логику bootstrap/clear в session.
// (jest.mock поднимается babel-jest выше импортов; фабрики видят mock-переменные.)
const mockSecureStore = new Map<string, string>();

jest.mock('./vault', () => ({
  MAX_PIN_ATTEMPTS: 5,
  hasStoredSession: jest.fn(),
  hasPin: jest.fn(),
  clearVault: jest.fn(() => Promise.resolve()),
  getRefreshToken: jest.fn(),
  saveRefreshToken: jest.fn(),
  savePin: jest.fn(),
  verifyPin: jest.fn(),
}));
jest.mock('./device', () => ({ getDeviceId: jest.fn(() => Promise.resolve('dev-1')) }));
const mockClearActiveTeam = jest.fn();
jest.mock('./activeTeam', () => ({
  activeTeamStore: { getState: () => ({ clearActiveTeam: mockClearActiveTeam }) },
}));
const mockQueryClientClear = jest.fn();
jest.mock('@/api/queryClient', () => ({
  // Чтение mockQueryClientClear отложено внутрь вложенной функции (как в моке
  // ./activeTeam выше) — иначе babel-jest-hoist поднимает jest.mock() раньше
  // объявления const, и тело фабрики падает в TDZ ещё до начала тестов.
  queryClient: { clear: () => mockQueryClientClear() },
}));
jest.mock('./storage', () => ({
  secureStorage: {
    get: (k: string) => Promise.resolve(mockSecureStore.has(k) ? mockSecureStore.get(k)! : null),
    set: (k: string, v: string) => {
      mockSecureStore.set(k, v);
      return Promise.resolve();
    },
    delete: (k: string) => {
      mockSecureStore.delete(k);
      return Promise.resolve();
    },
  },
}));

const mockVault = vault as jest.Mocked<typeof vault>;

beforeEach(() => {
  jest.clearAllMocks();
  mockSecureStore.clear();
  session.setState({ status: 'loading', accessToken: null });
});

describe('bootstrapSession', () => {
  test('нет сохранённой сессии → signedOut', async () => {
    mockVault.hasStoredSession.mockResolvedValue(false);
    await bootstrapSession();
    expect(session.getState().status).toBe('signedOut');
  });

  test('сессия есть, PIN установлен → locked', async () => {
    mockVault.hasStoredSession.mockResolvedValue(true);
    mockVault.hasPin.mockResolvedValue(true);
    await bootstrapSession();
    expect(session.getState().status).toBe('locked');
  });

  test('сессия есть, PIN не установлен → onboarding', async () => {
    mockVault.hasStoredSession.mockResolvedValue(true);
    mockVault.hasPin.mockResolvedValue(false);
    await bootstrapSession();
    expect(session.getState().status).toBe('onboarding');
  });

  test('сбой хранилища → signedOut (начинаем с нуля)', async () => {
    mockVault.hasStoredSession.mockRejectedValue(new Error('storage unavailable'));
    await bootstrapSession();
    expect(session.getState().status).toBe('signedOut');
  });
});

describe('clearSession / signOut', () => {
  test('clearSession зовёт clearVault и стирает флаг newUser', async () => {
    mockSecureStore.set('pp_new_user', '1');
    await clearSession();
    expect(mockVault.clearVault).toHaveBeenCalledTimes(1);
    expect(mockSecureStore.has('pp_new_user')).toBe(false);
  });

  test('signOut переводит в signedOut и роняет accessToken', async () => {
    session.setState({ status: 'active', accessToken: 'access-jwt' });
    session.getState().signOut();
    expect(session.getState().status).toBe('signedOut');
    expect(session.getState().accessToken).toBeNull();
    await Promise.resolve(); // clearSession — fire-and-forget
    expect(mockVault.clearVault).toHaveBeenCalled();
  });

  test('signOut сбрасывает выбранную команду — не протекает в следующий аккаунт на устройстве', () => {
    session.setState({ status: 'active', accessToken: 'access-jwt' });
    session.getState().signOut();
    expect(mockClearActiveTeam).toHaveBeenCalledTimes(1);
  });

  test('signOut чистит кэш react-query — иначе следующий вход на устройстве', () => {
    // видит me/teams/… ПРЕДЫДУЩЕГО аккаунта, пока не истечёт staleTime.
    session.setState({ status: 'active', accessToken: 'access-jwt' });
    session.getState().signOut();
    expect(mockQueryClientClear).toHaveBeenCalledTimes(1);
  });
});
