import type { BoardSnapshot, Config, Mode, Project, Task, TaskLog } from '@/types';
import { api } from './api';

/** Откуда интерфейс берёт данные: локальный сервер доски (управление) или опубликованные снимки (просмотр). */
export interface DataSource {
  mode: Mode;
  loadConfig(): Promise<Config>;
  loadState(): Promise<BoardSnapshot>;
  loadLog(id: number): Promise<TaskLog>;
}

/**
 * Режим определяет mode.json: локальный сервер доски отвечает «live» (страница управляет задачами), а на странице
 * просмотра лежит файл со значением «static» (она только показывает облачные задачи из снимков data/*.json).
 */
export async function detectMode(): Promise<Mode> {
  try {
    const response = await fetch('/mode.json', { cache: 'no-store' });
    const { mode } = (await response.json()) as { mode?: string };
    return mode === 'live' ? 'live' : 'static';
  } catch {
    return 'static';
  }
}

export const liveSource: DataSource = {
  mode: 'live',
  loadConfig: () => api<Config>('/config.json'),
  loadState: () => api<BoardSnapshot>('/api/state'),
  loadLog: (id) => api<TaskLog>(`/api/tasks/${id}/log`),
};

// Номера задач разных проектов не должны пересекаться: проект i получает диапазон i * SLOT.
const SLOT = 1_000_000;
const PLACEHOLDER: Project = { id: 'none', title: 'Пока нет данных', cloud: { mode: 'full', can: [], cannot: [], autoAllowed: false } };

interface Snapshot {
  repo: string;
  generatedAt: string;
  project: { id: string; title: string; stagingUrl?: string; prodUrl?: string };
  tasks: Task[];
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json() as Promise<T>;
}

/** Снимки лежат в data/*.json; список файлов отдаёт nginx (autoindex в формате JSON). */
async function readSnapshots(): Promise<Snapshot[]> {
  const listing = await getJson<{ name: string }[]>('data/');
  const names = listing.filter((f) => f.name.endsWith('.json')).map((f) => f.name).sort();
  const snapshots = await Promise.all(names.map((name) => getJson<Snapshot>(`data/${name}`).catch(() => null)));
  return snapshots.filter((s): s is Snapshot => s !== null);
}

export function fromSnapshots(snapshots: Snapshot[]): BoardSnapshot & { projects: Project[] } {
  const projects: Project[] = snapshots.map((s) => ({
    id: s.project.id, title: s.project.title, repo: s.repo, stagingUrl: s.project.stagingUrl, prodUrl: s.project.prodUrl,
    cloud: { mode: 'full', can: [], cannot: [], autoAllowed: false },
  }));
  const tasks = snapshots.flatMap((s, i) => s.tasks.map((t) => ({ ...t, id: (i + 1) * SLOT + (t.number ?? t.id) })));
  const generatedAt = snapshots.map((s) => s.generatedAt).sort().at(-1) ?? null;
  return { projects: projects.length ? projects : [PLACEHOLDER], tasks, generatedAt };
}

export function createStaticSource(): DataSource {
  let tasks = new Map<number, Task>();
  return {
    mode: 'static',
    async loadConfig() {
      const { projects } = fromSnapshots(await readSnapshots());
      return { models: [], efforts: [], defaultModel: null, defaultEffort: null, projects };
    },
    async loadState() {
      const result = fromSnapshots(await readSnapshots());
      tasks = new Map(result.tasks.map((t) => [t.id, t]));
      return result;
    },
    async loadLog(id) {
      const log = tasks.get(id)?.log;
      if (!log) throw new Error('Нет такой задачи.');
      return log;
    },
  };
}
