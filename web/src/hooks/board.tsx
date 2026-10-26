import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useToast } from '@/components/ui/toaster';
import { api } from '@/lib/api';
import { readPrefs, writePrefs, type Prefs } from '@/lib/prefs';
import type { DataSource } from '@/lib/source';
import type { Config, NewTaskInput, Project, Status, Task, TaskLog } from '@/types';

export type PaneTab = 'result' | 'progress' | 'task';

const POLL_MS = { live: 4_000, static: 15_000 } as const;

export interface BoardActions {
  create(input: NewTaskInput): Promise<void>;
  send(task: Task, options: { model: string; effort: string }): Promise<void>;
  rework(task: Task, text: string): Promise<void>;
  accept(task: Task): Promise<void>;
  /** Закрыть задачу (идея, отклонённый результат, отмена); message показывается после успеха. */
  discard(task: Task, message: string): Promise<void>;
}

export interface BoardValue {
  readOnly: boolean;
  config: Config;
  projects: Project[];
  project: Project;
  setProject(id: string): void;
  tasks: Task[];
  projectTasks: Task[];
  selected: Task | null;
  select(id: number | null): void;
  tab: PaneTab;
  setTab(tab: PaneTab): void;
  reworkOpen: boolean;
  setReworkOpen(open: boolean): void;
  prefs: Prefs;
  updatePrefs(patch: Partial<Prefs>): void;
  /** Время сборки данных (страница просмотра) или последней успешной загрузки. */
  updatedAt: string | null;
  online: boolean;
  actions: BoardActions;
  loadLog(id: number): Promise<TaskLog>;
}

const BoardContext = createContext<BoardValue | null>(null);

export function useBoard(): BoardValue {
  const value = useContext(BoardContext);
  if (!value) throw new Error('useBoard вне BoardProvider');
  return value;
}

/** Вкладка по умолчанию зависит от состояния: что человеку нужно увидеть первым. */
const defaultTab = (status: Status | undefined): PaneTab =>
  status === 'running' || status === 'failed' ? 'progress' : status === 'backlog' ? 'task' : 'result';

export function BoardProvider({ source, initialConfig, children }: { source: DataSource; initialConfig: Config; children: ReactNode }) {
  const toast = useToast();
  const readOnly = source.mode === 'static';
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const [projects, setProjects] = useState<Project[]>(initialConfig.projects);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tab, setTab] = useState<PaneTab>('result');
  const [reworkOpen, setReworkOpen] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const busy = useRef(0);

  const config = useMemo<Config>(() => ({ ...initialConfig, projects }), [initialConfig, projects]);
  const project = projects.find((p) => p.id === prefs.project) ?? projects[0]!;

  const updatePrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefs((previous) => {
      const next = { ...previous, ...patch };
      writePrefs(next);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    if (busy.current > 0) return;
    try {
      const snapshot = await source.loadState();
      setTasks(snapshot.tasks);
      if (snapshot.projects) setProjects((previous) => (sameProjects(previous, snapshot.projects!) ? previous : snapshot.projects!));
      setUpdatedAt(snapshot.generatedAt ?? new Date().toISOString());
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, [source]);

  useEffect(() => {
    void load();
    const id = setInterval(() => { if (!document.hidden) void load(); }, POLL_MS[source.mode]);
    return () => clearInterval(id);
  }, [load, source.mode]);

  const select = useCallback((id: number | null) => {
    setSelectedId(id);
    setReworkOpen(false);
    if (id !== null) setTab(defaultTab(tasks.find((t) => t.id === id)?.status));
  }, [tasks]);

  /** Действие над задачей: сразу показывает ожидаемое состояние, затем сверяется с сервером; при ошибке вернёт как есть. */
  const run = useCallback(async (task: Task, step: { optimistic?: Status; request: () => Promise<unknown>; done?: string }) => {
    busy.current++;
    if (step.optimistic) setTasks((previous) => previous.map((t) => (t.id === task.id ? { ...t, status: step.optimistic! } : t)));
    try {
      await step.request();
      if (step.done) toast.success(step.done);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось выполнить действие.');
    } finally {
      busy.current--;
      await load();
    }
  }, [load, toast]);

  const actions = useMemo<BoardActions>(() => {
    const post = (task: Task, action: string, body: unknown = {}) => api(`/api/tasks/${task.id}/${action}`, { method: 'POST', body });
    return {
      async create(input) {
        busy.current++;
        let created: Task;
        try {
          created = await api<Task>('/api/tasks', { method: 'POST', body: { ...input, project: project.id } });
        } catch (error) {
          busy.current--;
          toast.error(error instanceof Error ? error.message : 'Не удалось создать задачу.');
          throw error;
        }
        updatePrefs({ model: input.model, effort: input.effort });
        toast.success(input.send ? `Задача #${created.id} отправлена. Ноутбук можно закрыть.` : `Задача #${created.id} сохранена в идеях.`);
        busy.current--;
        await load();
        if (!input.send) setSelectedId(created.id), setTab('task'), setReworkOpen(false);
      },
      send: (task, options) => run(task, { optimistic: 'running', request: () => post(task, 'send', options), done: 'Отправлено. Ноутбук можно закрыть.' }),
      rework: (task, text) => run(task, { optimistic: 'running', request: () => post(task, 'rework', { text }), done: 'Правка отправлена в облако.' }),
      accept: (task) => run(task, { optimistic: 'done', request: () => post(task, 'accept'), done: 'Принято: влито в staging.' }),
      discard: (task, message) => run(task, { optimistic: 'closed', request: () => post(task, 'close'), done: message }),
    };
  }, [load, project.id, run, toast, updatePrefs]);

  const projectTasks = useMemo(() => tasks.filter((t) => t.projectId === project.id), [tasks, project.id]);
  const selected = useMemo(() => tasks.find((t) => t.id === selectedId) ?? null, [tasks, selectedId]);

  const value: BoardValue = {
    readOnly, config, projects, project,
    setProject: (id) => { updatePrefs({ project: id }); setSelectedId(null); },
    tasks, projectTasks, selected, select, tab, setTab, reworkOpen, setReworkOpen,
    prefs, updatePrefs, updatedAt, online, actions, loadLog: source.loadLog,
  };
  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}

const sameProjects = (a: Project[], b: Project[]) => a.length === b.length && a.every((p, i) => p.id === b[i]?.id);
