"use client";

// Полная лента на странице /notifications: первая страница с сервера, дальше курсором.

import { useState } from "react";

import { markRead, NotificationRows } from "@/components/NotificationList";
import type { AppNotification, NotificationPage } from "@/types";

export function NotificationFeed({ initial }: { initial: NotificationPage }) {
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.next_cursor);
  const [loading, setLoading] = useState(false);

  async function more() {
    if (!cursor) return;
    setLoading(true);
    const res = await fetch(`/api/notifications?limit=30&cursor=${encodeURIComponent(cursor)}`).catch(() => null);
    if (res?.ok) {
      const page = (await res.json()) as NotificationPage;
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.next_cursor);
    }
    setLoading(false);
  }

  async function readAll() {
    await fetch("/api/notifications/read-all", { method: "POST" }).catch(() => {});
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
  }

  function onOpen(n: AppNotification) {
    void markRead(n);
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 py-16 text-center">
        <p className="text-base font-semibold text-[var(--text)]">Новых уведомлений нет</p>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Здесь появятся сигналы о травмах, боли и зоне риска игроков ваших команд
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.some((n) => n.read_at == null) && (
        <div className="flex justify-end">
          <button type="button" onClick={readAll} className="text-sm font-medium text-[var(--accent)] hover:underline">
            Прочитать все
          </button>
        </div>
      )}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
        <NotificationRows items={items} onOpen={onOpen} />
      </div>
      {cursor && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={more}
            disabled={loading}
            className="text-sm font-medium text-[var(--accent)] hover:underline disabled:opacity-50"
          >
            {loading ? "Загрузка…" : "Показать ещё"}
          </button>
        </div>
      )}
    </div>
  );
}
