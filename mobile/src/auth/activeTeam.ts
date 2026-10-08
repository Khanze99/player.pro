// Активная команда тренера/врача/админа (docs/plan-team-selector.md). Отдельный
// стор от session.ts: конкерн «какая команда выбрана» не про авторизацию — не
// секрет, обычный AsyncStorage, а не secure-store. Ключ не привязан к userId:
// устройство через PIN держит одного активного пользователя одновременно.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const STORAGE_KEY = 'pp_active_team_id';

interface ActiveTeamState {
  activeTeamId: string | null;
  /** Успела ли прочитаться сохранённая команда из AsyncStorage при старте. Гейт
   *  в (tabs)/_layout.tsx ждёт true, иначе на первом рендере решит, что команда
   *  не выбрана, и мигнёт экраном выбора раньше, чем значение подъедет. */
  hydrated: boolean;
  setActiveTeam: (id: string) => void;
  clearActiveTeam: () => void;
}

export const activeTeamStore = create<ActiveTeamState>((set) => ({
  activeTeamId: null,
  hydrated: false,
  setActiveTeam: (activeTeamId) => {
    set({ activeTeamId });
    void AsyncStorage.setItem(STORAGE_KEY, activeTeamId);
  },
  clearActiveTeam: () => {
    set({ activeTeamId: null });
    void AsyncStorage.removeItem(STORAGE_KEY);
  },
}));

/** Читает сохранённый выбор при старте — вызывать один раз, рядом с bootstrapSession(). */
export async function hydrateActiveTeam(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    activeTeamStore.setState({ activeTeamId: stored, hydrated: true });
  } catch {
    activeTeamStore.setState({ hydrated: true }); // хранилище недоступно — считаем, что выбора нет
  }
}
