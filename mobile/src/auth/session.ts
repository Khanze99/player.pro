// Сессия: статус, access-JWT в памяти, флаг «новый пользователь».
// Секреты (refresh-токен, PIN) — в ./vault (нативный secure-store / веб-шифрование
// ключом от PIN). Идентификатор устройства — в ./device.

import { create } from 'zustand';

import { secureStorage } from './storage';
import { clearVault, hasPin, hasStoredSession } from './vault';

export { getDeviceId } from './device';
export {
  MAX_PIN_ATTEMPTS,
  getRefreshToken,
  hasPin,
  savePin,
  saveRefreshToken,
  verifyPin,
} from './vault';

const KEYS = {
  newUser: 'pp_new_user',
} as const;

export type SessionStatus =
  | 'loading' // читаем хранилище при старте
  | 'signedOut' // нечего разблокировать → OTP-флоу
  | 'onboarding' // вошли по OTP: имя/организация/PIN ещё не настроены
  | 'locked' // есть сохранённая сессия + PIN → экран PIN
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

/**
 * Регистрация это или вход в существующий аккаунт — решает сервер (`is_new_user`
 * в ответе на верификацию OTP). Флаг переживает перезапуск: онбординг могут
 * прервать на любом шаге, а угадывать «новизну» по пустому профилю нельзя —
 * у давнего аккаунта ФИО тоже может быть не заполнено.
 */
export const setNewUser = (isNew: boolean) =>
  secureStorage.set(KEYS.newUser, isNew ? '1' : '0');

/** Неизвестно (флага нет) — считаем вход повторным: лишняя регистрация хуже. */
export const isNewUser = async () => (await secureStorage.get(KEYS.newUser)) === '1';

export const clearNewUser = () => secureStorage.delete(KEYS.newUser);

export async function clearSession(): Promise<void> {
  await clearVault();
  await secureStorage.delete(KEYS.newUser);
}

/** Определяет стартовое состояние при запуске приложения. */
export async function bootstrapSession(): Promise<void> {
  try {
    if (!(await hasStoredSession())) {
      session.getState().setStatus('signedOut');
      return;
    }
    session.getState().setStatus((await hasPin()) ? 'locked' : 'onboarding');
  } catch {
    session.getState().setStatus('signedOut'); // хранилище недоступно — начинаем с нуля
  }
}
