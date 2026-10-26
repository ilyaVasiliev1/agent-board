// Разбор мини-разметки отчётов агента в данные: из них компонент строит React-элементы, без HTML-строк и без dangerouslySetInnerHTML.
export type Inline =
  | { kind: 'text'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'strong'; value: string }
  | { kind: 'link'; label: string; href: string };

export type Block =
  | { kind: 'heading'; inlines: Inline[] }
  | { kind: 'paragraph'; inlines: Inline[] }
  | { kind: 'list'; items: Inline[][] };

const INLINE = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) out.push({ kind: 'text', value: text.slice(last, match.index) });
    if (match[1] !== undefined) out.push({ kind: 'code', value: match[1] });
    else if (match[2] !== undefined) out.push({ kind: 'strong', value: match[2] });
    else out.push({ kind: 'link', label: match[3] ?? '', href: match[4] ?? '' });
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', value: text.slice(last) });
  return out;
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let list: Inline[][] | null = null;
  for (const line of source.split('\n')) {
    const item = /^\s*(?:[-*]|- \[[ xX]\])\s+(.*)$/.exec(line);
    if (item) {
      if (!list) { list = []; blocks.push({ kind: 'list', items: list }); }
      list.push(parseInline(item[1] ?? ''));
      continue;
    }
    list = null;
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    if (heading) blocks.push({ kind: 'heading', inlines: parseInline(heading[1] ?? '') });
    else if (line.trim()) blocks.push({ kind: 'paragraph', inlines: parseInline(line) });
  }
  return blocks;
}
