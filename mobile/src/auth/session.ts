// Сессия и локальный PIN. PIN хранится только на устройстве хэшом (раздел 5 ТЗ),
// refresh-токен — в secure-store; access-JWT живёт в памяти.

import * as Crypto from 'expo-crypto';
import { create } from 'zustand';

import { secureStorage } from './storage';

const KEYS = {
  refresh: 'pp_refresh_token',
  pinHash: 'pp_pin_hash',
  deviceId: 'pp_device_id',
  pinAttempts: 'pp_pin_attempts',
} as const;

export const MAX_PIN_ATTEMPTS = 5;

export type SessionStatus =
  | 'loading' // читаем secure-store при старте
  | 'signedOut' // нет refresh-токена → OTP-флоу
  | 'onboarding' // вошли по OTP: имя/организация/PIN ещё не настроены
  | 'locked' // есть refresh + PIN → экран PIN
  | 'active'; // access-JWT получен

interface SessionState {
  status: SessionStatus;
  accessToken: string | null;
  setStatus: (s: SessionStatus) => void;
  setAccessToken: (t: string) => void;
  signOut: () => void;
}

export const session = create<SessionState>((set) => ({
  status: 'loading',
  accessToken: null,
  setStatus: (status) => set({ status }),
  setAccessToken: (accessToken) => set({ accessToken, status: 'active' }),
  signOut: () => {
    void clearSession();
    set({ status: 'signedOut', accessToken: null });
  },
}));

export async function getDeviceId(): Promise<string> {
  let id = await secureStorage.get(KEYS.deviceId);
  if (!id) {
    id = Crypto.randomUUID();
    await secureStorage.set(KEYS.deviceId, id);
  }
  return id;
}

export const getRefreshToken = () => secureStorage.get(KEYS.refresh);
export const saveRefreshToken = (token: string) => secureStorage.set(KEYS.refresh, token);

async function hashPin(pin: string): Promise<string> {
  const deviceId = await getDeviceId(); // соль — чтобы хэш не переносился между устройствами
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${deviceId}:${pin}`);
}

export async function savePin(pin: string): Promise<void> {
  await secureStorage.set(KEYS.pinHash, await hashPin(pin));
  await secureStorage.set(KEYS.pinAttempts, '0');
}

export const hasPin = async () => (await secureStorage.get(KEYS.pinHash)) !== null;

/** null — верный PIN; число — осталось попыток; 0 — попытки кончились (откат на OTP). */
export async function verifyPin(pin: string): Promise<number | null> {
  const stored = await secureStorage.get(KEYS.pinHash);
  if (stored !== null && (await hashPin(pin)) === stored) {
    await secureStorage.set(KEYS.pinAttempts, '0');
    return null;
  }
  const attempts = Number((await secureStorage.get(KEYS.pinAttempts)) ?? '0') + 1;
  await secureStorage.set(KEYS.pinAttempts, String(attempts));
  return Math.max(0, MAX_PIN_ATTEMPTS - attempts);
}

export async function clearSession(): Promise<void> {
  await secureStorage.delete(KEYS.refresh);
  await secureStorage.delete(KEYS.pinHash);
  await secureStorage.delete(KEYS.pinAttempts);
}

/** Определяет стартовое состояние при запуске приложения. */
export async function bootstrapSession(): Promise<void> {
  try {
    const refresh = await getRefreshToken();
    if (!refresh) {
      session.getState().setStatus('signedOut');
      return;
    }
    session.getState().setStatus((await hasPin()) ? 'locked' : 'onboarding');
  } catch {
    session.getState().setStatus('signedOut'); // хранилище недоступно — начинаем с нуля
  }
}
