// Хранилище секретов сессии (нативное). refresh-токен лежит в secure-store в
// открытом виде (Keychain/Keystore), PIN — хэшом SHA-256 с солью из device_id
// (раздел 5 ТЗ). Веб-вариант — vault.web.ts: там refresh шифруется ключом,
// производным от PIN, и в localStorage нет ни токена, ни хэша.

import * as Crypto from 'expo-crypto';

import { getDeviceId } from './device';
import { secureStorage } from './storage';

const KEYS = {
  refresh: 'pp_refresh_token',
  pinHash: 'pp_pin_hash',
  pinAttempts: 'pp_pin_attempts',
} as const;

export const MAX_PIN_ATTEMPTS = 5;

export const getRefreshToken = (): Promise<string | null> => secureStorage.get(KEYS.refresh);
export const saveRefreshToken = (token: string): Promise<void> =>
  secureStorage.set(KEYS.refresh, token);

async function hashPin(pin: string): Promise<string> {
  const deviceId = await getDeviceId(); // соль — чтобы хэш не переносился между устройствами
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${deviceId}:${pin}`);
}

export async function savePin(pin: string): Promise<void> {
  await secureStorage.set(KEYS.pinHash, await hashPin(pin));
  await secureStorage.set(KEYS.pinAttempts, '0');
}

export const hasPin = async (): Promise<boolean> =>
  (await secureStorage.get(KEYS.pinHash)) !== null;

/** Есть ли что разблокировать/продолжать при старте: на нативе — наличие refresh. */
export const hasStoredSession = async (): Promise<boolean> =>
  (await getRefreshToken()) !== null;

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

export async function clearVault(): Promise<void> {
  await secureStorage.delete(KEYS.refresh);
  await secureStorage.delete(KEYS.pinHash);
  await secureStorage.delete(KEYS.pinAttempts);
}
