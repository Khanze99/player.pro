#!/usr/bin/env node
// Генератор src/legal/content.generated.ts из landing/{terms,privacy}.html.
//
// Источник текста юридических документов один: страницы на лендинге (их же URL
// указаны в карточках сторов). Приложение показывает тот же текст нативным экраном,
// без сети. После правки html: `make legal` и релиз приложения. Тест
// src/legal/content.test.ts падает, если сгенерированный файл отстал от html.
//
// Разбор рассчитан на разметку этих страниц: внутри <article> после <p class="meta">
// идут блоки <h2>, <p>, <ul><li>, внутри них только <strong>, <em>, <a href>.

const fs = require('fs');
const path = require('path');

const LANDING = path.resolve(__dirname, '../../landing');
const OUT = path.resolve(__dirname, '../src/legal/content.generated.ts');
const DOCS = { terms: 'terms.html', privacy: 'privacy.html' };

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m]);

/** Инлайн-разметка в спаны: {text, bold?, href?}. */
function inline(html) {
  const spans = [];
  const re = /<(strong|em)>(.*?)<\/\1>|<a href="([^"]+)">(.*?)<\/a>|([^<]+)/g;
  let m;
  let consumed = 0;
  while ((m = re.exec(html)) !== null) {
    if (m.index !== consumed) throw new Error(`Неожиданная разметка: ${html.slice(consumed, consumed + 60)}`);
    consumed = re.lastIndex;
    if (m[1]) spans.push({ text: decode(m[2]), bold: true });
    else if (m[3]) spans.push({ text: decode(m[4]), href: m[3] });
    else spans.push({ text: decode(m[5]) });
  }
  if (consumed !== html.length) throw new Error(`Неожиданная разметка: ${html.slice(consumed, consumed + 60)}`);
  return spans;
}

function parseDoc(file) {
  const html = fs.readFileSync(path.join(LANDING, file), 'utf8');
  const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/);
  if (!article) throw new Error(`${file}: нет <article>`);
  const title = article[1].match(/<h1>(.*?)<\/h1>/)[1];
  const meta = article[1].match(/<p class="meta">(.*?)<\/p>/)[1];
  const version = (meta.match(/Версия (\d{4}-\d{2}-\d{2})/) || [])[1];
  if (!version) throw new Error(`${file}: в meta нет «Версия YYYY-MM-DD»`);
  const body = article[1].slice(article[1].indexOf(meta) + meta.length + '</p>'.length);

  const blocks = [];
  const re = /<h2>(.*?)<\/h2>|<p>(.*?)<\/p>|<ul>(.*?)<\/ul>|(\S[\s\S]*?)(?=<|$)/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    if (m[4] !== undefined) throw new Error(`${file}: неожиданный фрагмент: ${m[4].slice(0, 60)}`);
    if (m[1] !== undefined) blocks.push({ type: 'h', spans: inline(m[1]) });
    else if (m[2] !== undefined) blocks.push({ type: 'p', spans: inline(m[2]) });
    else {
      const items = [...m[3].matchAll(/<li>(.*?)<\/li>/g)].map((li) => inline(li[1]));
      blocks.push({ type: 'ul', items });
    }
  }
  return { title: decode(title), meta: decode(meta), version, blocks };
}

function build() {
  const docs = Object.fromEntries(Object.entries(DOCS).map(([key, file]) => [key, parseDoc(file)]));
  return (
    '// Сгенерировано mobile/scripts/build-legal.js из landing/*.html. Не править руками:\n' +
    '// правка в html, затем `make legal` из mobile/.\n\n' +
    "import type { LegalDocContent } from './types';\n\n" +
    `export const LEGAL_CONTENT: Record<'terms' | 'privacy', LegalDocContent> = ${JSON.stringify(docs, null, 2)};\n`
  );
}

module.exports = { build, OUT };

if (require.main === module) {
  fs.writeFileSync(OUT, build());
  console.log(`Записано: ${path.relative(process.cwd(), OUT)}`);
}
