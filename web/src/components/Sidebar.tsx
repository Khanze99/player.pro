"use client";

// Левый сайдбар админки (docs/plan-player-season-stats.md, «Веб-клиент») —
// первый сайдбар в кабинете, раньше был только Navbar. Пока два реальных
// пункта: «Команды» (уже существующий раздел) и «Статистика игроков»
// (паспорт игрока, новое) — остальное из референса (травмы/календарь/
// настройки) здесь не заводим, пока на вебе нет самих страниц: пункт без
// рабочей ссылки хуже отсутствующего пункта.

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Item {
  href: string;
  label: string;
  // Активен, если путь совпадает или начинается с href + "/" — но «Команды»
  // не должен подсвечиваться на .../stats (у статистики свой пункт), поэтому
  // каждый пункт сам решает через match, не общий startsWith.
  match: (path: string) => boolean;
  icon: React.ReactNode;
}

const ITEMS: Item[] = [
  {
    href: "/teams",
    label: "Команды",
    match: (p) => p.startsWith("/teams") && !p.includes("/stats"),
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    href: "/stats",
    label: "Статистика игроков",
    match: (p) => p === "/stats" || p.includes("/stats"),
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M12 3v18M3 12h18" stroke="currentColor" strokeWidth="1.6" opacity=".45" />
        <path d="M12 5.5 17 9l-2 7-6-.2-2-6.8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="w-16 flex-none border-r border-[var(--border)] bg-[var(--surface)] py-3 flex flex-col items-center gap-1.5">
      {ITEMS.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            aria-current={active ? "page" : undefined}
            className="w-10 h-10 flex items-center justify-center transition-colors"
            style={{
              backgroundColor: active ? "var(--accent)" : "transparent",
              color: active ? "#fff" : "var(--text-faint)",
            }}
          >
            {item.icon}
          </Link>
        );
      })}
    </nav>
  );
}
