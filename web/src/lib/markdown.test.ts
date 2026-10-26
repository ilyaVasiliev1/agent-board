import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown } from './markdown';

describe('parseInline', () => {
  it('разбирает код, жирное и ссылки', () => {
    expect(parseInline('a `b` **c** [d](https://e.test)')).toEqual([
      { kind: 'text', value: 'a ' }, { kind: 'code', value: 'b' }, { kind: 'text', value: ' ' },
      { kind: 'strong', value: 'c' }, { kind: 'text', value: ' ' }, { kind: 'link', label: 'd', href: 'https://e.test' },
    ]);
  });

  it('не делает ссылок из не-http адресов', () => {
    expect(parseInline('[x](javascript:alert(1))')).toEqual([{ kind: 'text', value: '[x](javascript:alert(1))' }]);
  });
});

describe('parseMarkdown', () => {
  it('собирает заголовки, списки и абзацы', () => {
    const blocks = parseMarkdown('## Отчёт\nГотово\n- [x] ветка\n- [ ] тесты\n\nПосле');
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph', 'list', 'paragraph']);
    expect(blocks[2]).toMatchObject({ kind: 'list' });
    expect((blocks[2] as { items: unknown[] }).items).toHaveLength(2);
  });
});
