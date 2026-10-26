import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';
import { BoardProvider } from '@/hooks/board';
import type { DataSource } from '@/lib/source';
import type { Config, Task } from '@/types';

export const CONFIG: Config = {
  models: [{ id: 'sonnet', title: 'Sonnet 5.5' }, { id: 'opus', title: 'Opus 5.5' }],
  efforts: [{ id: 'low', title: 'Низкий' }, { id: 'high', title: 'Высокий' }],
  defaultModel: 'sonnet',
  defaultEffort: 'high',
  projects: [{ id: 'p', title: 'Проект', cloud: { mode: 'full', can: [], cannot: [], autoAllowed: true } }],
};

export const LOCAL_ONLY: Config = {
  ...CONFIG,
  projects: [{ id: 'p', title: 'Проект', cloud: { mode: 'local', summary: 'Только локально: нужен Xcode.', can: [], cannot: [], autoAllowed: false } }],
};

export function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: 1, projectId: 'p', title: 'Добавить Раф', body: 'Добавить Раф', status: 'backlog', model: 'sonnet', effort: 'high', auto: false,
    createdAt: '2026-10-26T10:00:00Z', events: [{ t: '2026-10-26T10:00:00Z', text: 'Задача создана.' }], ...over,
  };
}

export function stubSource(tasks: Task[], mode: 'live' | 'static' = 'live', config: Config = CONFIG): DataSource {
  return {
    mode,
    loadConfig: async () => config,
    loadState: async () => ({ tasks, generatedAt: '2026-10-26T12:00:00Z' }),
    loadLog: async (id) => {
      const task = tasks.find((t) => t.id === id);
      return task?.log ?? { events: task?.events ?? [], commits: [], comments: [], checks: [], pr: task?.pr ?? null };
    },
  };
}

/** Рисует компонент внутри тех же провайдеров, что и приложение. */
export function renderWithBoard(ui: ReactElement, options: { tasks?: Task[]; mode?: 'live' | 'static'; config?: Config } = {}) {
  const { tasks = [], mode = 'live', config = CONFIG } = options;
  return render(
    <Toaster>
      <TooltipProvider>
        <BoardProvider source={stubSource(tasks, mode, config)} initialConfig={config}>{ui}</BoardProvider>
      </TooltipProvider>
    </Toaster>,
  );
}
