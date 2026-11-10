"use client";

// Колокольчик в навбаре (docs/plan-notifications.md). Есть непрочитанные: красный
// кружок с числом («9+» сверх девяти), нет: просто колокольчик. Счётчик
// опрашивается раз в минуту и только пока вкладка видима.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { markRead, NotificationRows } from "@/components/NotificationList";
import type { AppNotification, NotificationPage } from "@/types";

const POLL_MS = 60_000;

export function NotificationBell() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(async () => {
    const res = await fetch("/api/notifications/unread-count").catch(() => null);
    if (res?.ok) setCount(((await res.json()) as { count: number }).count);
  }, []);

  const loadItems = useCallback(async () => {
    setError(false);
    const res = await fetch("/api/notifications?limit=10").catch(() => null);
    if (!res?.ok) {
      setError(true);
      return;
    }
    setItems(((await res.json()) as NotificationPage).items);
  }, []);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void refreshCount();
    };
    // Первый запрос тоже через таймер: счётчик не блокирует первый рендер навбара.
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshCount();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshCount]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) void loadItems();
  }

  async function onOpen(n: AppNotification) {
    setOpen(false);
    await markRead(n);
    void refreshCount();
  }

  async function readAll() {
    await fetch("/api/notifications/read-all", { method: "POST" }).catch(() => {});
    setItems((prev) => prev?.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })) ?? null);
    setCount(0);
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={count > 0 ? `Уведомления, непрочитанных: ${count}` : "Уведомления"}
        aria-expanded={open}
        className="relative w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-muted)] transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2H4.5l1.5-2Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path d="M10 20.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {count > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-[var(--risk)] border-2 border-[var(--surface)] text-[9px] leading-none font-bold text-white flex items-center justify-center">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[360px] max-h-[480px] flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
            <span className="text-sm font-semibold text-[var(--text)]">Уведомления</span>
            {items?.some((n) => n.read_at == null) && (
              <button type="button" onClick={readAll} className="text-xs font-medium text-[var(--accent)] hover:underline">
                Прочитать все
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {error ? (
              <p className="px-4 py-8 text-sm text-center text-[var(--text-muted)]">Не удалось загрузить уведомления</p>
            ) : items == null ? (
              <p className="px-4 py-8 text-sm text-center text-[var(--text-muted)]">Загрузка…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-sm text-center text-[var(--text-muted)]">Новых уведомлений нет</p>
            ) : (
              <NotificationRows items={items} onOpen={onOpen} />
            )}
          </div>
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-xs font-medium text-center text-[var(--accent)] border-t border-[var(--border)] hover:bg-[var(--surface-muted)]"
          >
            Все уведомления
          </Link>
        </div>
      )}
    </div>
  );
}
