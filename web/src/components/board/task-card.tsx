import type { KeyboardEvent, MouseEvent } from 'react';
import { ago } from '@/lib/format';
import { STATE_BG, taskNumber } from '@/lib/status';
import { cn } from '@/lib/utils';
import type { Config, Task } from '@/types';

const nameOf = (options: Config['models'], id: string | null) => (id ? options.find((o) => o.id === id)?.title ?? id : null);
const stop = (event: MouseEvent) => event.stopPropagation();

const pill = 'rounded-full border border-input px-2.5 py-0.5 text-xs font-semibold text-foreground no-underline hover:bg-muted';

export function TaskCard({ task, config, selected, now, onSelect }: { task: Task; config: Config; selected: boolean; now: number; onSelect(id: number): void }) {
  const model = nameOf(config.models, task.model);
  const effort = task.effort ? (nameOf(config.efforts, task.effort) ?? task.effort).toLowerCase() : null;
  const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Enter') onSelect(task.id); };

  return (
    <div
      role="listitem"
      tabIndex={0}
      data-task-id={task.id}
      aria-current={selected || undefined}
      onClick={() => onSelect(task.id)}
      onKeyDown={onKeyDown}
      className={cn(
        'relative flex-none cursor-pointer rounded-md border bg-card py-2.5 pr-3 pl-4 outline-none transition-colors hover:border-input focus-visible:ring-3 focus-visible:ring-ring/50',
        selected && 'border-foreground ring-1 ring-foreground hover:border-foreground',
      )}
    >
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-[3px] rounded-l-md', STATE_BG[task.status])} />
      <div className="line-clamp-3 text-sm leading-snug font-semibold">{task.title}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
        {task.status === 'running' && (
          <>
            <span className="inline-flex items-center gap-1.5 font-semibold text-state-run">
              <span aria-hidden className="size-1.5 animate-[breathe_1.8s_ease-in-out_infinite] rounded-full bg-current" />
              {task.pr ? 'пишет код' : 'запускается'}
            </span>
            {task.sentAt && <span>{ago(task.sentAt, now)}</span>}
          </>
        )}
        <b className="font-semibold text-foreground/80 tabular-nums">#{taskNumber(task)}</b>
        {model && <span>{model}</span>}
        {effort && <span>{effort}</span>}
        {task.auto && <span>без проверки</span>}
      </div>
      {task.status === 'review' && task.links?.desktop && (
        <img src={task.links.desktop} alt="" loading="lazy" className="mt-2 block h-[74px] w-full rounded border bg-muted object-cover object-top" />
      )}
      {task.status === 'review' && task.links?.site && (
        <div className="mt-2 flex gap-1.5">
          <a href={task.links.site} target="_blank" rel="noopener noreferrer" onClick={stop} className={pill}>Сайт</a>
          {task.links.report && <a href={task.links.report} target="_blank" rel="noopener noreferrer" onClick={stop} className={pill}>Отчёт</a>}
        </div>
      )}
      {task.status === 'failed' && <div className="mt-1.5 line-clamp-3 text-xs text-destructive">{task.events.at(-1)?.text ?? ''}</div>}
    </div>
  );
}
