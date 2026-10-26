import { ExternalLinkIcon } from 'lucide-react';
import { Markdown } from '@/components/markdown';
import { buttonVariants } from '@/components/ui/button';
import { useBoard } from '@/hooks/board';
import { cn } from '@/lib/utils';
import type { Task, TaskLog } from '@/types';

const CHECK_LABEL: Record<string, string> = { SUCCESS: 'успешно', FAILURE: 'провал', ERROR: 'ошибка', IN_PROGRESS: 'идёт', QUEUED: 'в очереди' };
const section = 'mt-4 mb-2 text-[13px] font-semibold text-foreground/80 first:mt-0';

function LinkButton({ href, children, primary = false }: { href: string; children: string; primary?: boolean }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: primary ? 'default' : 'outline', size: 'default' }), 'h-8 gap-1.5')}>
      {children}
      <ExternalLinkIcon className="size-3.5 opacity-60" aria-hidden />
    </a>
  );
}

/** Результат работы: ссылки, скриншоты, проверки и отчёт агента. */
export function ResultTab({ task, log }: { task: Task; log: TaskLog }) {
  const { project } = useBoard();
  const report = log.pr?.body?.startsWith('## Отчёт') ? log.pr.body : null;
  // После слияния или закрытия превью задачи удаляется с сайта: ссылки и скриншоты на него уже не показываем.
  const previewAlive = task.status !== 'done' && task.status !== 'closed';
  const shots = previewAlive ? [task.links?.desktop, task.links?.mobile].filter((s): s is string => Boolean(s)) : [];
  const site = previewAlive ? task.links?.site : undefined;
  const testReport = previewAlive ? task.links?.report : undefined;
  const hasContent = Boolean(site || log.pr || task.sessionUrl || shots.length || log.checks.length || report);

  if (!hasContent) {
    return <p className="text-[13px] text-muted-foreground">{task.status === 'running' ? 'Результата пока нет: агент ещё работает. Ход работы смотрите на соседней вкладке.' : 'Результата пока нет.'}</p>;
  }
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {site && <LinkButton href={site} primary>Открыть превью сайта</LinkButton>}
        {testReport && <LinkButton href={testReport}>Отчёт тестов</LinkButton>}
        {log.pr && <LinkButton href={log.pr.url}>{`PR #${log.pr.number}`}</LinkButton>}
        {task.sessionUrl && <LinkButton href={task.sessionUrl}>Сессия Claude</LinkButton>}
        {task.status === 'done' && project.stagingUrl && <LinkButton href={project.stagingUrl}>Бета</LinkButton>}
        {task.status === 'done' && project.prodUrl && <LinkButton href={project.prodUrl}>Прод</LinkButton>}
      </div>

      {shots.length > 0 && (
        <>
          <h3 className={section}>Как выглядит страница</h3>
          <div className="grid grid-cols-[2fr_1fr] items-start gap-2.5">
            {shots.map((src, i) => (
              <a key={src} href={src} target="_blank" rel="noopener noreferrer" title={i ? 'Телефон' : 'Компьютер'} className="block overflow-hidden rounded-lg border bg-muted">
                <img src={src} alt={i ? 'Скриншот на телефоне' : 'Скриншот на компьютере'} loading="lazy" className="block h-auto w-full" />
              </a>
            ))}
          </div>
        </>
      )}

      {log.checks.length > 0 && (
        <>
          <h3 className={section}>Проверки</h3>
          <div className="flex flex-wrap gap-1.5">
            {log.checks.map((check, i) => (
              <span
                key={`${check.name}-${i}`}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs',
                  check.result === 'SUCCESS' && 'border-state-done/40 text-state-done',
                  ['FAILURE', 'ERROR'].includes(check.result) && 'border-state-fail/40 text-state-fail',
                )}
              >
                {check.name}: {CHECK_LABEL[check.result] ?? check.result.toLowerCase()}
              </span>
            ))}
          </div>
        </>
      )}

      {report && (
        <>
          <h3 className={section}>Отчёт агента</h3>
          <Markdown source={report} className="rounded-lg border bg-muted px-3.5 pb-2 text-[13.5px] leading-relaxed" />
        </>
      )}
    </>
  );
}
