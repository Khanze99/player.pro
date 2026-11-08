export type LegalSpan = { text: string; bold?: boolean; href?: string };

export type LegalBlock =
  | { type: 'h'; spans: LegalSpan[] }
  | { type: 'p'; spans: LegalSpan[] }
  | { type: 'ul'; items: LegalSpan[][] };

export type LegalDocContent = {
  title: string;
  /** «Редакция от … Версия …» как на сайте. */
  meta: string;
  version: string;
  blocks: LegalBlock[];
};
