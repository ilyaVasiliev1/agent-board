import { CheckIcon, CircleIcon } from 'lucide-react';
import { Fragment } from 'react';
import { parseInline, parseMarkdown, type Inline } from '@/lib/markdown';

function Inlines({ items }: { items: Inline[] }) {
  return items.map((item, i) => {
    switch (item.kind) {
      case 'code': return <code key={i} className="rounded bg-border px-1.5 py-px font-mono text-[0.85em]">{item.value}</code>;
      case 'strong': return <strong key={i} className="font-semibold">{item.value}</strong>;
      case 'link': return <a key={i} href={item.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{item.label}</a>;
      default: return <Fragment key={i}>{item.value}</Fragment>;
    }
  });
}

/** Отчёты агента и тексты задач: безопасная мини-разметка, весь ввод остаётся текстом. */
export function Markdown({ source, className }: { source: string; className?: string }) {
  return (
    <div className={className}>
      {parseMarkdown(source).map((block, i) => {
        if (block.kind === 'heading') return <h3 key={i} className="mt-3.5 mb-1 text-sm font-semibold first:mt-1.5"><Inlines items={block.inlines} /></h3>;
        if (block.kind === 'list') {
          return (
            <ul key={i} className="my-1.5 space-y-0.5">
              {block.items.map((li, j) => (
                <li key={j} className={li.task ? 'flex items-start gap-2' : 'ml-5 list-disc'}>
                  {li.task === 'done' && <CheckIcon aria-label="сделано" className="mt-[3px] size-3.5 shrink-0 text-state-done" />}
                  {li.task === 'todo' && <CircleIcon aria-label="не сделано" className="mt-[3px] size-3.5 shrink-0 text-muted-foreground" />}
                  <span><Inlines items={li.inlines} /></span>
                </li>
              ))}
            </ul>
          );
        }
        return <p key={i} className="my-1.5"><Inlines items={block.inlines} /></p>;
      })}
    </div>
  );
}

export { parseInline };
