// Тексты колокольчика: сервер отдаёт только type и коды (docs/plan-notifications.md),
// формулировки те же, что в mobile/src/i18n/ru.ts (notifications.*).

import { reasonLabel } from "@/lib/reasons";
import type { AlertReason, AppNotification } from "@/types";

const eventTypeLabel: Record<string, string> = {
  training: "Тренировка",
  match: "Матч",
  individual: "Личная тренировка",
  other: "Событие",
};

const availabilityLabel: Record<string, string> = {
  full: "В строю",
  modified: "Ограничен",
  unavailable: "Недоступен",
};

function fmtEvent(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function notificationText(n: AppNotification): { title: string; body?: string } {
  const name = n.athlete?.name || "Игрок";
  const event = n.event ? n.event.title || eventTypeLabel[n.event.type] || "Событие" : "";
  const when = n.event ? fmtEvent(n.event.planned_start) : undefined;
  switch (n.type) {
    case "athlete_injury":
      return { title: `${name}: отмечена травма` };
    case "athlete_illness":
      return { title: `${name}: отмечено недомогание` };
    case "athlete_pain":
      return { title: `${name}: отмечена сильная боль` };
    case "athlete_risk":
      return {
        title: `${name} в зоне риска`,
        body: n.reasons.map((r) => reasonLabel[r as AlertReason] ?? r).join(" · "),
      };
    case "event_created":
      return { title: `Новое событие: ${event}`, body: when };
    case "event_updated":
      return { title: `Изменено: ${event}`, body: when };
    case "event_cancelled":
      return { title: `Отменено: ${event}`, body: when };
    case "rpe_reminder":
      return { title: `Оцени нагрузку: ${event}`, body: when };
    case "wellness_reminder":
      return { title: "Заполни самочувствие за сегодня" };
    case "availability_changed":
      return {
        title: "Изменён твой статус доступности",
        body: n.status ? availabilityLabel[n.status] : undefined,
      };
  }
}

/** Паспорт игрока для штабных уведомлений; у остальных в вебе перехода нет. */
export function notificationHref(n: AppNotification): string | null {
  if (n.athlete && n.team_id) return `/teams/${n.team_id}/athletes/${n.athlete.id}`;
  return null;
}

/** Цвет полоски слева: красный для травмы и риска, жёлтый для боли и болезни. */
export function notificationAccent(n: AppNotification): string {
  if (n.type === "athlete_injury" || n.type === "athlete_risk") return "var(--risk)";
  if (n.type === "athlete_pain" || n.type === "athlete_illness") return "var(--caution)";
  return "var(--accent)";
}

export function fmtNotificationTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
