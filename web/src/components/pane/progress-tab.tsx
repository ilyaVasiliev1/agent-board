import { Markdown } from '@/components/markdown';
import { ago, clock } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Task, TaskLog } from '@/types';

const STALL_MS = 30 * 60_000;
const section = 'mt-4 mb-2 text-[13px] font-semibold text-foreground/80 first:mt-0';

function Notice({ children, bad = false }: { children: string; bad?: boolean }) {
  return (
    <div className={cn('mb-3 rounded-lg border px-3 py-2.5 text-[13px]', bad ? 'border-state-fail/40 bg-state-fail/10' : 'border-state-review/40 bg-state-review/10')}>
      {children}
    </div>
  );
}

/** Ход работы: что агент уже сделал и что произошло с задачей, по времени. */
export function ProgressTab({ task, log, now }: { task: Task; log: TaskLog; now: number }) {
  const stalled = task.status === 'running' && !log.pr && task.sentAt && now - new Date(task.sentAt).getTime() > STALL_MS;
  const inProgress = log.pr?.body && !log.pr.body.startsWith('## Отчёт') ? log.pr.body : null;
  const rows = [
    ...log.events.map((e) => ({ t: e.t, text: e.text, commit: false })),
    ...log.commits.map((c) => ({ t: c.t, text: `коммит: ${c.text}`, commit: true })),
    ...log.comments.map((c) => ({ t: c.t, text: `комментарий в PR: ${c.body.split('\n')[0] ?? ''}`, commit: false })),
  ].sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());

  return (
    <>
      {stalled && task.sentAt && <Notice>{`PR не появился уже ${ago(task.sentAt, now)}. Откройте сессию Claude: возможно, она ждёт вашего ответа.`}</Notice>}
      {task.status === 'failed' && <Notice bad>{task.events.at(-1)?.text ?? 'Сбой.'}</Notice>}
      {task.syncError && <Notice>{`Не удаётся обновить данные из GitHub: ${task.syncError}`}</Notice>}
      {inProgress && (
        <>
          <h3 className={section}>Что делает агент</h3>
          <Markdown source={inProgress} className="rounded-lg border bg-muted px-3.5 pb-2 text-[13.5px] leading-relaxed" />
        </>
      )}
      <h3 className={section}>События</h3>
      <ul className="ml-1">
        {rows.map((row, i) => (
          <li key={`${row.t}-${i}`} className={cn('relative ml-[3px] border-l pb-3 pl-4 text-[13px]', i === rows.length - 1 ? 'border-transparent' : 'border-input')}>
            <span aria-hidden className={cn('absolute top-1.5 -left-1 size-[7px] rounded-full', row.commit ? 'bg-foreground' : 'bg-input')} />
            <time className="mr-2 text-xs text-muted-foreground tabular-nums">{clock(row.t)}</time>
            {row.text}
          </li>
        ))}
      </ul>
    </>
  );
}
