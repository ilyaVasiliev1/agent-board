import { useEffect } from 'react';
import { useBoard } from '@/hooks/board';
import { visibleColumns } from '@/lib/status';

const TYPING = /^(INPUT|TEXTAREA|SELECT)$/;

/** Клавиши: N новая задача, J/K соседние карточки (и русская раскладка), Esc закрыть панель, ? подсказка. */
export function useShortcuts({ composerId, onHelp }: { composerId: string; onHelp(): void }): void {
  const { readOnly, projectTasks, selected, select } = useBoard();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const typing = Boolean(active && (TYPING.test(active.tagName) || active.isContentEditable));
      if (event.key === 'Escape') {
        if (typing) active?.blur();
        else select(null);
        return;
      }
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

      if ((event.key === 'n' || event.key === 'т') && !readOnly) {
        event.preventDefault();
        document.getElementById(composerId)?.focus();
      } else if (event.key === '?') {
        onHelp();
      } else if (['j', 'k', 'о', 'л'].includes(event.key)) {
        const ids = visibleColumns(readOnly)
          .flatMap((column) => projectTasks.filter((t) => t.status === column.id).sort((a, b) => b.id - a.id))
          .map((t) => t.id);
        if (!ids.length) return;
        const index = selected ? ids.indexOf(selected.id) : -1;
        const down = event.key === 'j' || event.key === 'о';
        const next = down ? ids[Math.min(ids.length - 1, index + 1)] : ids[Math.max(0, index < 0 ? 0 : index - 1)];
        if (next !== undefined) {
          select(next);
          document.querySelector(`[data-task-id="${next}"]`)?.scrollIntoView({ block: 'nearest' });
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [composerId, onHelp, projectTasks, readOnly, select, selected]);
}
