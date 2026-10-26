import { useState } from 'react';
import { OptionSelect } from '@/components/option-select';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useBoard } from '@/hooks/board';
import type { Task } from '@/types';

// Набранная правка не пропадает, пока человек переключает вкладки и обновляются данные.
const drafts = new Map<number, string>();

/** Действия над задачей зависят от её состояния. На странице просмотра действий нет. */
export function PaneActions({ task }: { task: Task }) {
  const { readOnly, config, project, prefs, actions, reworkOpen, setReworkOpen } = useBoard();
  const [model, setModel] = useState(task.model ?? prefs.model ?? config.defaultModel ?? '');
  const [effort, setEffort] = useState(task.effort ?? prefs.effort ?? config.defaultEffort ?? '');
  const [draft, setDraft] = useState(() => drafts.get(task.id) ?? '');
  const [pending, setPending] = useState(false);

  if (readOnly) return null;
  const cloudOk = project.cloud.mode !== 'local';
  const act = async (step: () => Promise<void>) => { setPending(true); try { await step(); } finally { setPending(false); } };
  const updateDraft = (value: string) => { setDraft(value); drafts.set(task.id, value); };

  if (task.status === 'backlog' || task.status === 'failed') {
    return (
      <div className="flex flex-col gap-2.5 border-t p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <OptionSelect prefix="Модель" label="Модель" value={model} onChange={setModel} options={config.models} />
          <OptionSelect prefix="Усилие" label="Уровень усилий" value={effort} onChange={setEffort} options={config.efforts} />
          <span className="flex-1" />
          <Button disabled={!cloudOk || pending} onClick={() => act(() => actions.send(task, { model, effort }))}>
            {task.status === 'failed' ? 'Отправить снова' : 'Отправить в облако'}
          </Button>
        </div>
        {!cloudOk && <p className="text-xs text-muted-foreground">{project.cloud.summary ?? 'Для этого проекта облако недоступно.'}</p>}
        <div>
          <Button variant="destructive" disabled={pending} onClick={() => act(() => actions.discard(task, 'Закрыто.'))}>
            {task.status === 'failed' ? 'Закрыть' : 'Удалить из идей'}
          </Button>
        </div>
      </div>
    );
  }

  if (task.status === 'review' && reworkOpen) {
    const submit = () => {
      const text = draft.trim();
      if (!text) return;
      drafts.delete(task.id);
      setReworkOpen(false);
      return act(() => actions.rework(task, text));
    };
    return (
      <div className="flex flex-col gap-2.5 border-t p-3.5">
        <Textarea
          autoFocus
          rows={3}
          value={draft}
          onChange={(e) => updateDraft(e.target.value)}
          placeholder="Что исправить? Опишите, как для человека: правка уйдёт в ту же облачную сессию."
          aria-label="Что исправить"
        />
        <div className="flex gap-2">
          <Button disabled={!draft.trim() || pending} onClick={submit}>Отправить правку</Button>
          <Button variant="outline" onClick={() => setReworkOpen(false)}>Отмена</Button>
        </div>
      </div>
    );
  }

  if (task.status === 'review') {
    return (
      <div className="flex items-center gap-2 border-t p-3.5">
        <Button disabled={pending} title="Влить в staging" onClick={() => act(() => actions.accept(task))}>Принять</Button>
        <Button variant="outline" disabled={pending} onClick={() => setReworkOpen(true)}>Доработать</Button>
        <span className="flex-1" />
        <Button variant="destructive" disabled={pending} title="Закрыть PR и удалить ветку" onClick={() => act(() => actions.discard(task, 'Отклонено: PR закрыт, ветка удалена.'))}>
          Отклонить
        </Button>
      </div>
    );
  }

  if (task.status === 'running') {
    return (
      <div className="flex items-center gap-2 border-t p-3.5">
        <p className="text-xs text-muted-foreground">Облако работает. Ноутбук можно закрыть: результат появится в GitHub.</p>
        <span className="flex-1" />
        <Button variant="destructive" disabled={pending} onClick={() => act(() => actions.discard(task, 'Закрыто. Облачная сессия могла продолжить работу: остановите её на claude.ai.'))}>
          Закрыть без выполнения
        </Button>
      </div>
    );
  }
  return null;
}
