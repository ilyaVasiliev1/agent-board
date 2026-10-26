import { useEffect, useState } from 'react';
import { useBoard } from '@/hooks/board';
import type { Task, TaskLog } from '@/types';

/**
 * Журнал задачи: сначала то, что уже известно (события доски, встроенный журнал снимка), затем свежий с сервера.
 * Перезапрашивается, когда задача изменилась (состояние, обновление PR, новые события).
 */
export function useTaskLog(task: Task): TaskLog {
  const { loadLog } = useBoard();
  const [fetched, setFetched] = useState<{ id: number; log: TaskLog } | null>(null);
  const changed = `${task.status}|${task.pr?.updatedAt ?? ''}|${task.events.length}`;

  useEffect(() => {
    if (!task.branch || task.status === 'backlog') return;
    let alive = true;
    loadLog(task.id).then((log) => { if (alive) setFetched({ id: task.id, log }); }).catch(() => {});
    return () => { alive = false; };
  }, [task.id, task.branch, task.status, changed, loadLog]);

  const base = task.log ?? { events: task.events, commits: [], comments: [], checks: [], pr: task.pr ?? null };
  const log = fetched?.id === task.id ? fetched.log : base;
  return { ...log, events: task.events };
}
