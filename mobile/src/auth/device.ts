// Идентификатор устройства: генерируется один раз, живёт в secure-store (на вебе —
// в localStorage через тот же фолбэк). Отдельный лист-модуль, чтобы им могли
// пользоваться и session, и vault без циклических импортов.

import * as Crypto from 'expo-crypto';

import { secureStorage } from './storage';

const DEVICE_ID_KEY = 'pp_device_id';

export async function getDeviceId(): Promise<string> {
  let id = await secureStorage.get(DEVICE_ID_KEY);
  if (!id) {
    id = Crypto.randomUUID();
    await secureStorage.set(DEVICE_ID_KEY, id);
  }
  return id;
}
