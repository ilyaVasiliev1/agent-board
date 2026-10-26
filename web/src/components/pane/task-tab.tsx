import { Markdown } from '@/components/markdown';
import type { Task } from '@/types';

export function TaskTab({ task }: { task: Task }) {
  return (
    <>
      <h3 className="mb-2 text-[13px] font-semibold text-foreground/80">Текст задачи</h3>
      <Markdown source={task.body || task.title} className="rounded-lg border bg-muted px-3.5 pb-2 text-[13.5px] leading-relaxed" />
      <h3 className="mt-4 mb-2 text-[13px] font-semibold text-foreground/80">Создана</h3>
      <p className="text-[13px]">{new Date(task.createdAt).toLocaleString('ru-RU')}</p>
    </>
  );
}
