import { api } from './api.js';

/**
 * Режим определяется по месту запуска: если отвечает локальный сервер доски, страница управляет задачами;
 * иначе (страница на сервере, рядом лежат снимки data/*.json) она только показывает облачные задачи.
 */
async function probeLiveServer() {
  try {
    const response = await fetch('/api/state', { headers: { Accept: 'application/json' } });
    return response.ok && (response.headers.get('content-type') ?? '').includes('json');
  } catch {
    return false;
  }
}
export const isStatic = !(await probeLiveServer());

const SLOT = 1_000_000; // номера задач разных проектов не должны пересекаться: проект i получает диапазон i*SLOT
const PLACEHOLDER = { id: 'none', title: 'Пока нет данных', cloud: { mode: 'full', can: [], cannot: [], autoAllowed: false } };

const getJson = async (url) => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
};

let staticTasks = new Map();

/** Снимки лежат в data/*.json; список файлов отдаёт nginx (autoindex в формате JSON). */
async function readSnapshots() {
  const listing = await getJson('data/');
  const files = listing.filter((f) => f.name.endsWith('.json')).map((f) => f.name).sort();
  const snapshots = await Promise.all(files.map((name) => getJson(`data/${name}`).catch(() => null)));
  return snapshots.filter(Boolean);
}

function fromSnapshots(snapshots) {
  const projects = snapshots.map((s) => ({
    id: s.project.id, title: s.project.title, repo: s.repo, stagingUrl: s.project.stagingUrl, prodUrl: s.project.prodUrl,
    cloud: { mode: 'full', can: [], cannot: [], autoAllowed: false },
  }));
  const tasks = snapshots.flatMap((s, i) => s.tasks.map((t) => ({ ...t, id: (i + 1) * SLOT + t.number })));
  const generatedAt = snapshots.map((s) => s.generatedAt).sort().at(-1) ?? null;
  return { projects: projects.length ? projects : [PLACEHOLDER], tasks, generatedAt };
}

export async function loadConfig() {
  if (!isStatic) return api('/config.json');
  const { projects } = fromSnapshots(await readSnapshots());
  return { models: [], efforts: [], defaultModel: null, defaultEffort: null, projects };
}

export async function loadState() {
  if (!isStatic) return api('/api/state');
  const result = fromSnapshots(await readSnapshots());
  staticTasks = new Map(result.tasks.map((t) => [t.id, t]));
  return result;
}

export async function loadLog(id) {
  if (!isStatic) return api(`/api/tasks/${id}/log`);
  const task = staticTasks.get(id);
  if (!task) throw new Error('Нет такой задачи.');
  return task.log;
}
