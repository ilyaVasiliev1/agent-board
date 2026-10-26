import { useBoard } from '@/hooks/board';
import { useNow } from '@/hooks/use-now';
import { emptyText, STATE_BG, visibleColumns } from '@/lib/status';
import { cn } from '@/lib/utils';
import { TaskCard } from './task-card';

/** Колонки по состояниям. Пустые колонки без подсказки сворачиваются, а при открытой панели все становятся уже. */
export function Board() {
  const { readOnly, config, projectTasks, selected, select } = useBoard();
  const now = useNow(30_000);

  return (
    <div role="list" aria-label="Задачи" className="flex min-w-0 flex-1 gap-3 overflow-x-auto max-md:flex-none max-md:flex-col">
      {visibleColumns(readOnly).map((column) => {
        const items = projectTasks.filter((t) => t.status === column.id).sort((a, b) => b.id - a.id);
        const hint = emptyText(column, readOnly);
        const quiet = items.length === 0 && !hint;
        return (
          <section
            key={column.id}
            data-column={column.id}
            className={cn(
              'flex min-h-0 min-w-0 flex-col',
              quiet ? 'flex-[0_0_130px] opacity-60' : selected ? 'min-w-[170px] flex-[1_1_190px]' : 'min-w-[210px] flex-[1_1_250px]',
              'max-md:min-w-0 max-md:flex-none',
            )}
          >
            <h2 className="flex items-center gap-2 px-1 pt-0.5 pb-2 text-[13px] font-semibold text-foreground/80">
              <span aria-hidden className={cn('size-2 rounded-full', STATE_BG[column.id])} />
              {column.title}
              {items.length > 0 && <span className="font-medium text-muted-foreground tabular-nums">{items.length}</span>}
            </h2>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-0.5 pb-3">
              {items.map((task) => (
                <TaskCard key={task.id} task={task} config={config} selected={selected?.id === task.id} now={now} onSelect={select} />
              ))}
              {items.length === 0 && hint && <p className="max-w-[30ch] px-1 py-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{hint}</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
