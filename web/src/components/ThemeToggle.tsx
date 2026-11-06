"use client";

// Тумблер светлая/тёмная (docs/design-player-passport-theme.md) — явный выбор
// пользователя, не автослежение за prefers-color-scheme: светлая остаётся
// задокументированным дефолтом CLAUDE.md, тёмная — опция, не тихая подмена.
// Состояние — localStorage (per-browser), не БД: это предпочтение устройства,
// не данные пользователя. Блокирующий скрипт в app/layout.tsx читает тот же
// ключ до гидратации, чтобы страница не мигала светлым при тёмном выборе.
//
// useSyncExternalStore, не useState+useEffect: data-theme на <html> — внешнее
// по отношению к React состояние (его же выставляет blocking-скрипт до
// гидратации), getServerSnapshot отдаёт "light" для совпадения с серверным
// HTML, без ручного setState в эффекте и лишнего ре-рендера.

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "pp-theme";
const EVENT = "pp-theme-change";

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  return () => window.removeEventListener(EVENT, callback);
}

function getSnapshot(): "light" | "dark" {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function getServerSnapshot(): "light" | "dark" {
  return "light";
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // приватный режим/заблокировано — тема просто не переживёт перезагрузку
    }
    window.dispatchEvent(new Event(EVENT));
  }

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-1.5 h-[30px] px-2.5 border border-[var(--border-strong)] bg-[var(--surface-muted)] text-[var(--text-muted)] text-xs font-medium hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors"
    >
      {theme === "dark" ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-6.66 1.41-1.41M5.93 18.07l1.41-1.41m0-9.32L5.93 5.93m12.14 12.14 1.41 1.41"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
          <path
            d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {theme === "dark" ? "Светлая тема" : "Тёмная тема"}
    </button>
  );
}
