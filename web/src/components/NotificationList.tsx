"use client";

// Строки уведомлений: общие для выпадашки в навбаре и страницы /notifications.

import Link from "next/link";

import {
  fmtNotificationTime,
  notificationAccent,
  notificationHref,
  notificationText,
} from "@/lib/notifications";
import type { AppNotification } from "@/types";

export function NotificationRows({
  items,
  onOpen,
}: {
  items: AppNotification[];
  onOpen: (n: AppNotification) => void;
}) {
  return (
    <ul className="divide-y divide-[var(--border)]">
      {items.map((n) => {
        const { title, body } = notificationText(n);
        const unread = n.read_at == null;
        const href = notificationHref(n);
        const inner = (
          <div className="flex items-start gap-3 px-4 py-3">
            <span
              className="mt-0.5 w-[3px] self-stretch rounded-full flex-none"
              style={{ backgroundColor: notificationAccent(n) }}
            />
            <div className="flex-1 min-w-0">
              <p
                className={`text-sm leading-snug ${unread ? "font-semibold text-[var(--text)]" : "text-[var(--text-muted)]"}`}
              >
                {title}
              </p>
              {body && <p className="text-xs text-[var(--text-muted)] mt-0.5">{body}</p>}
              <p className="text-[11px] text-[var(--text-faint)] mt-1">{fmtNotificationTime(n.created_at)}</p>
            </div>
            {unread && <span className="mt-1.5 w-2 h-2 rounded-full bg-[var(--accent)] flex-none" />}
          </div>
        );
        return (
          <li key={n.id} className="hover:bg-[var(--surface-muted)] transition-colors">
            {href ? (
              <Link href={href} onClick={() => onOpen(n)} className="block">
                {inner}
              </Link>
            ) : (
              <button type="button" onClick={() => onOpen(n)} className="block w-full text-left">
                {inner}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export async function markRead(n: AppNotification): Promise<void> {
  if (n.read_at != null) return;
  await fetch(`/api/notifications/${n.id}/read`, { method: "POST" }).catch(() => {});
}
