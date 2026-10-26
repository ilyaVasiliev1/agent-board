import type { Status, Task } from '@/types';

export interface ColumnSpec {
  id: Exclude<Status, 'closed'>;
  title: string;
  /** Подсказка пустой колонки. */
  empty: string;
  /** На странице просмотра подсказка другая (управления там нет). */
  emptyReadOnly?: string;
  /** Колонка есть только в режиме управления: идеи живут на Маке, в GitHub их нет. */
  liveOnly?: boolean;
}

export const COLUMNS: ColumnSpec[] = [
  { id: 'backlog', title: 'Идеи', empty: 'Запишите задачу сверху. Она подождёт здесь, пока вы не отправите её в облако.', liveOnly: true },
  { id: 'running', title: 'В работе', empty: 'Здесь задачи, которые сейчас делает облако.' },
  { id: 'review', title: 'На проверке', empty: 'Готовые результаты появятся здесь: можно принять, доработать или отклонить.', emptyReadOnly: 'Готовые результаты появятся здесь.' },
  { id: 'failed', title: 'Ошибка', empty: '' },
  { id: 'done', title: 'Принято', empty: '' },
];

export const STATE_NAME: Record<Status, string> = {
  backlog: 'Идея', running: 'В работе', review: 'На проверке', failed: 'Ошибка', done: 'Принято', closed: 'Закрыто',
};

/** Классы цвета состояния (Tailwind знает их по токенам --state-*). */
export const STATE_TEXT: Record<Status, string> = {
  backlog: 'text-state-idea', running: 'text-state-run', review: 'text-state-review', failed: 'text-state-fail', done: 'text-state-done', closed: 'text-state-idea',
};
export const STATE_BG: Record<Status, string> = {
  backlog: 'bg-state-idea', running: 'bg-state-run', review: 'bg-state-review', failed: 'bg-state-fail', done: 'bg-state-done', closed: 'bg-state-idea',
};
export const STATE_BORDER: Record<Status, string> = {
  backlog: 'border-state-idea', running: 'border-state-run', review: 'border-state-review', failed: 'border-state-fail', done: 'border-state-done', closed: 'border-state-idea',
};

export const visibleColumns = (readOnly: boolean): ColumnSpec[] => COLUMNS.filter((c) => !(readOnly && c.liveOnly));
export const emptyText = (column: ColumnSpec, readOnly: boolean): string => (readOnly ? column.emptyReadOnly ?? column.empty : column.empty);
export const taskNumber = (task: Task): number => task.number ?? task.id;
