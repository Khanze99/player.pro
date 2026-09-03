import AsyncStorage from '@react-native-async-storage/async-storage';
import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';

import { type BrandingResponse, toTheme, useBranding } from '@/api/branding';
import { session } from '@/auth/session';

import { type Theme, defaultTheme } from './index';

const ThemeContext = createContext<Theme>(defaultTheme);

// Тема — не секрет, поэтому обычное хранилище, а не secure-store. При выходе не
// чистится: следующий вход того же клуба сразу в его цветах.
const CACHE_KEY = 'branding:last';

export function ThemeProvider({ theme, children }: { theme?: Theme; children: ReactNode }) {
  const status = session((s) => s.status);
  const active = status === 'active';
  const [cached, setCached] = useState<Theme | null>(null);

  // Кэш нужен, чтобы после логина клубные цвета появились сразу, а не через
  // секунду синего: запрос темы идёт параллельно и молча уточняет её.
  useEffect(() => {
    void AsyncStorage.getItem(CACHE_KEY).then((raw) => {
      if (!raw) return;
      try {
        setCached(toTheme(JSON.parse(raw) as BrandingResponse));
      } catch {
        void AsyncStorage.removeItem(CACHE_KEY); // формат сменился — кэш неактуален
      }
    });
  }, []);

  const { data } = useBranding();

  useEffect(() => {
    if (data) void AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
  }, [data]);

  const value = useMemo(() => {
    if (theme) return theme; // явно переданная тема (тесты, превью)
    // До логина организация неизвестна — красить нечем
    if (!active) return defaultTheme;
    return data ? toTheme(data) : (cached ?? defaultTheme);
  }, [theme, active, data, cached]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

// Стили считаются один раз на пару «тема + фабрика»: StyleSheet.create на каждый
// рендер сводил бы на нет смысл StyleSheet. WeakMap отпускает кэш вместе с темой.
const cache = new WeakMap<Theme, Map<object, unknown>>();

/** Тематизированные стили: `const styles = useStyles(makeStyles)`. */
export function useStyles<T>(factory: (t: Theme) => T): T {
  const t = useTheme();
  return useMemo(() => {
    let byFactory = cache.get(t);
    if (!byFactory) {
      byFactory = new Map();
      cache.set(t, byFactory);
    }
    const hit = byFactory.get(factory);
    if (hit) return hit as T;
    const created = factory(t);
    byFactory.set(factory, created);
    return created;
  }, [t, factory]);
}
