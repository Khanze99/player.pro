// Тексты в приложении собираются из landing/*.html (scripts/build-legal.js).
// Правка html без `make legal` оставила бы в приложении старую редакцию.
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';

import { resolveLegalLink } from '.';
import { LEGAL_CONTENT } from './content.generated';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { build, OUT } = require('../../scripts/build-legal');

describe('юридические тексты', () => {
  it('content.generated.ts совпадает с landing/*.html (иначе: make legal)', () => {
    expect(readFileSync(OUT, 'utf8')).toBe(build());
  });

  it('версии совпадают с серверными (backend/app/config.py)', () => {
    const config = readFileSync(`${__dirname}/../../../backend/app/config.py`, 'utf8');
    const version = (name: string) => config.match(new RegExp(`${name}: str = "([\\d-]+)"`))?.[1];
    expect(LEGAL_CONTENT.terms.version).toBe(version('terms_policy_version'));
    expect(LEGAL_CONTENT.privacy.version).toBe(version('health_consent_policy_version'));
  });

  it('каждая ссылка в тексте ведёт на экран приложения или наружу по mailto', () => {
    for (const doc of Object.values(LEGAL_CONTENT)) {
      const spans = doc.blocks.flatMap((b) => (b.type === 'ul' ? b.items.flat() : b.spans));
      for (const s of spans.filter((x) => x.href)) {
        const target = resolveLegalLink(s.href!);
        if (target.kind === 'external') expect(target.url).toMatch(/^mailto:/);
      }
    }
  });
});
