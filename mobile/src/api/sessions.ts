// Подпись сессии для карточки RPE и выбора события: «18:00 · Вечерняя».
// Одинаковая на главной и в форме RPE, поэтому живёт рядом с типами API.

import type { TFunction } from 'i18next';

import type { RpeSession } from './types';

export function sessionTime(session: RpeSession, locale: string): string {
  return new Date(session.planned_start).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function sessionEndTime(session: RpeSession, locale: string): string {
  return new Date(session.ends_at).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function sessionLabel(session: RpeSession, locale: string, t: TFunction): string {
  const title = session.title || t(`calendar.types.${session.type}`);
  return `${sessionTime(session, locale)} · ${title}`;
}
