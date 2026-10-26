// Общее состояние клиента и всё, что выводится из конфигурации проекта.
export const COLUMNS = [
  { id: 'backlog', title: 'Идеи', empty: 'Запишите задачу сверху. Она подождёт здесь, пока вы не отправите её в облако.', liveOnly: true },
  { id: 'running', title: 'В работе', empty: 'Здесь задачи, которые сейчас делает облако.' },
  { id: 'review', title: 'На проверке', empty: 'Готовые результаты появятся здесь: можно принять, доработать или отклонить.', emptyReadOnly: 'Готовые результаты появятся здесь.' },
  { id: 'failed', title: 'Ошибка', empty: '' },
  { id: 'done', title: 'Принято', empty: '' },
];
export const STATE_NAME = { backlog: 'Идея', running: 'В работе', review: 'На проверке', failed: 'Ошибка', done: 'Принято', closed: 'Закрыто' };
export const STATE_COLOR = { backlog: 'idea', running: 'run', review: 'review', failed: 'fail', done: 'done' };

const SETTINGS_KEY = 'board.settings';
const PROJECT_KEY = 'board.project';

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* приватный режим: работаем без памяти */ }
}

/** Колонки, которые есть в текущем режиме: на странице просмотра идей нет, они живут только на Маке. */
export const visibleColumns = () => COLUMNS.filter((c) => !(state.readOnly && c.liveOnly));
export const emptyText = (column) => (state.readOnly ? column.emptyReadOnly ?? column.empty : column.empty);

export const state = {
  config: null,
  project: null,
  tasks: [],
  selectedId: null,
  tab: 'result',
  reworkOpen: false,
  settings: read(SETTINGS_KEY, {}),
  readOnly: false,
};

export function setConfig(config) {
  state.config = config;
  state.project = config.projects.find((p) => p.id === read(PROJECT_KEY, null)) ?? config.projects[0];
}
export function setProject(id) {
  state.project = state.config.projects.find((p) => p.id === id);
  write(PROJECT_KEY, id);
}
export function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  write(SETTINGS_KEY, state.settings);
}

export const defaults = () => ({
  model: state.settings.model ?? state.config.defaultModel,
  effort: state.settings.effort ?? state.config.defaultEffort,
});
export const modelName = (id) => state.config.models.find((m) => m.id === id)?.title ?? id;
export const effortName = (id) => (state.config.efforts.find((e) => e.id === id)?.title ?? id).toLowerCase();
/** Номер задачи для показа: у снимков с сервера id синтетический, настоящий номер лежит в number. */
export const taskNumber = (t) => t.number ?? t.id;
export const cloudProfile = () => state.project.cloud;
export const isCloudAllowed = () => cloudProfile().mode !== 'local';
export const projectTasks = () => state.tasks.filter((t) => t.projectId === state.project.id);
export const selectedTask = () => state.tasks.find((t) => t.id === state.selectedId) ?? null;
export const taskById = (id) => state.tasks.find((t) => t.id === id) ?? null;
