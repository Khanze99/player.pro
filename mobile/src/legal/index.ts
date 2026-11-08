// Юридические документы (docs/plan-legal-texts.md). Источник текста один: страницы
// лендинга, их URL указаны в карточках App Store / Google Play / RuStore и менять их
// нельзя. Приложение показывает тот же текст своим экраном (app/legal/[doc].tsx) из
// src/legal/content.generated.ts, который собирается из html командой `make legal`.

import type { Href } from 'expo-router';

export const LEGAL_URLS = {
  terms: 'https://player-pro.ru/terms',
  privacy: 'https://player-pro.ru/privacy',
  deleteAccount: 'https://player-pro.ru/delete-account',
} as const;

/** Документы, у которых есть экран в приложении. Удаление аккаунта в приложении
 *  не страница, а действие: экран app/delete-account.tsx. */
export type LegalDoc = 'terms' | 'privacy';

export const isLegalDoc = (value: unknown): value is LegalDoc => value === 'terms' || value === 'privacy';

export const legalDocHref = (doc: LegalDoc): Href => ({ pathname: '/legal/[doc]', params: { doc } });

/** Ссылка внутри текста документа: свои документы и удаление открываются экранами
 *  приложения, остальное (mailto) уходит наружу. */
export function resolveLegalLink(href: string): { kind: 'route'; href: Href } | { kind: 'external'; url: string } {
  if (href === '/terms' || href === '/privacy') return { kind: 'route', href: legalDocHref(href.slice(1) as LegalDoc) };
  if (href === '/delete-account') return { kind: 'route', href: '/delete-account' };
  if (href.startsWith('/')) return { kind: 'external', url: `https://player-pro.ru${href}` };
  return { kind: 'external', url: href };
}
