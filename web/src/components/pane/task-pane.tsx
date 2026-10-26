import { XIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBoard, type PaneTab } from '@/hooks/board';
import { useNow } from '@/hooks/use-now';
import { useTaskLog } from '@/hooks/use-task-log';
import { STATE_BORDER, STATE_NAME, STATE_TEXT, taskNumber } from '@/lib/status';
import { cn } from '@/lib/utils';
import type { Task } from '@/types';
import { PaneActions } from './pane-actions';
import { ProgressTab } from './progress-tab';
import { ResultTab } from './result-tab';
import { TaskTab } from './task-tab';

const tabPanel = 'min-h-0 flex-1 overflow-y-auto px-4.5 py-3.5';

/** Панель выбранной задачи: закреплена справа, доска остаётся видимой. */
export function TaskPane({ task }: { task: Task }) {
  const { config, tab, setTab, select } = useBoard();
  const log = useTaskLog(task);
  const now = useNow(60_000);
  const model = task.model ? config.models.find((m) => m.id === task.model)?.title ?? task.model : null;
  const effort = task.effort ? (config.efforts.find((e) => e.id === task.effort)?.title ?? task.effort).toLowerCase() : null;

  return (
    <aside aria-label="Задача" className="flex min-h-0 w-[min(480px,40vw)] shrink-0 animate-[pane-in_0.18s_ease-out] flex-col rounded-xl border bg-card shadow-lg max-md:w-full max-md:shrink">
      <header className="relative border-b px-4.5 pt-4 pb-3">
        <h2 className="mr-9 mb-2 text-[17px] leading-snug font-semibold tracking-tight">{task.title}</h2>
        <Button variant="ghost" size="icon-sm" className="absolute top-2.5 right-2.5 text-muted-foreground" aria-label="Закрыть панель" title="Закрыть (Esc)" onClick={() => select(null)}>
          <XIcon />
        </Button>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={cn('h-5 bg-transparent', STATE_TEXT[task.status], STATE_BORDER[task.status], 'border-current/40')}>{STATE_NAME[task.status]}</Badge>
          <Badge variant="outline" className="tabular-nums">#{taskNumber(task)}</Badge>
          {model && <Badge variant="outline">{model}</Badge>}
          {effort && <Badge variant="outline">усилие {effort}</Badge>}
          {task.auto && <Badge variant="outline">без проверки</Badge>}
        </div>
      </header>

      <Tabs value={tab} onValueChange={(value) => setTab(value as PaneTab)} className="min-h-0 flex-1 gap-0">
        <TabsList variant="line" className="h-10 w-full justify-start rounded-none border-b px-3">
          <TabsTrigger value="result" className="flex-none px-3">Результат</TabsTrigger>
          <TabsTrigger value="progress" className="flex-none px-3">Ход работы</TabsTrigger>
          <TabsTrigger value="task" className="flex-none px-3">Задача</TabsTrigger>
        </TabsList>
        <TabsContent value="result" className={tabPanel}><ResultTab task={task} log={log} /></TabsContent>
        <TabsContent value="progress" className={tabPanel}><ProgressTab task={task} log={log} now={now} /></TabsContent>
        <TabsContent value="task" className={tabPanel}><TaskTab task={task} /></TabsContent>
      </Tabs>

      <PaneActions key={`${task.id}-${task.status}`} task={task} />
    </aside>
  );
}
