import { api } from './api.js';
import { createBoard } from './board.js';
import { createComposer } from './composer.js';
import { $, el } from './dom.js';
import { fillSelect } from './controls.js';
import { clock } from './format.js';
import { createPane } from './pane.js';
import { initSettings } from './settings.js';
import { isStatic, loadConfig, loadLog, loadState } from './source.js';
import { projectTasks, setConfig, setProject, state, taskById, updateSettings, visibleColumns } from './state.js';

const POLL_MS = isStatic ? 15_000 : 4_000;
let busy = 0;
state.readOnly = isStatic;

/** Страница просмотра: убираем всё, что нужно только для управления, и называем её по делу. */
if (isStatic) {
  for (const node of document.querySelectorAll('[data-live-only]')) node.remove();
  document.title = 'Облако: что сейчас делают агенты';
  $('brand-name').textContent = 'Облако';
  $('btn-settings').title = 'Вид';
}

function toast(text, bad = false) {
  const node = el('div', { className: `toast${bad ? ' bad' : ''}`, textContent: text });
  $('toasts').append(node);
  setTimeout(() => node.remove(), bad ? 7000 : 4500);
}

// ---------- загрузка ----------
async function load() {
  if (busy) return;
  try {
    const result = await loadState();
    state.tasks = result.tasks;
    if (isStatic) adoptProjects(result.projects);
    board.render();
    pane.render();
    $('sync').textContent = isStatic ? `данные от ${result.generatedAt ? clock(result.generatedAt) : '—'}` : `обновлено ${clock(new Date())}`;
    $('sync').classList.remove('off');
  } catch {
    $('sync').textContent = isStatic ? 'нет данных' : 'нет связи с доской';
    $('sync').classList.add('off');
  }
}

/** На странице просмотра список проектов приходит вместе со снимками и может пополняться. */
function adoptProjects(projects) {
  const same = projects.length === state.config.projects.length && projects.every((p, i) => p.id === state.config.projects[i].id);
  if (same) return;
  const keep = projects.find((p) => p.id === state.project.id) ?? projects[0];
  state.config.projects = projects;
  fillSelect($('project'), projects, keep.id);
  setProject(keep.id);
  board.reset();
  renderEnvironments();
}

/** Действие над задачей: сразу показывает ожидаемое состояние, затем сверяется с сервером; при ошибке вернёт как есть. */
async function act(task, { optimistic, request, done }) {
  if (optimistic) { task.status = optimistic; board.render(); }
  busy++;
  try {
    await request();
    if (done) toast(done);
  } catch (error) {
    toast(error.message, true);
  } finally {
    busy--;
    pane.invalidate();
    await load();
  }
}
const post = (task, action, body = {}) => api(`/api/tasks/${task.id}/${action}`, { method: 'POST', body });

// ---------- панель и доска ----------
function select(id) {
  state.selectedId = id;
  const task = taskById(id);
  state.tab = task?.status === 'running' || task?.status === 'failed' ? 'progress' : task?.status === 'backlog' ? 'task' : 'result';
  state.reworkOpen = false;
  pane.invalidate();
  board.render();
  pane.render();
}

const actions = {
  closePane() { state.selectedId = null; pane.render(); board.render(); },
  setTab(tab) { state.tab = tab; pane.render({ refresh: false }); },
  toggleRework(open) {
    state.reworkOpen = open;
    pane.render({ refresh: false });
    if (open) $('pane').querySelector('.p-actions textarea')?.focus();
  },
  send: (task, options) => act(task, { optimistic: 'running', request: () => post(task, 'send', options), done: 'Отправлено. Ноутбук можно закрыть.' }),
  rework(task, text) {
    if (!text.trim()) { toast('Напишите, что исправить.', true); state.reworkOpen = true; pane.render({ refresh: false }); return; }
    state.reworkOpen = false;
    return act(task, { optimistic: 'running', request: () => post(task, 'rework', { text }), done: 'Правка отправлена в облако.' });
  },
  accept: (task) => act(task, { optimistic: 'done', request: () => post(task, 'accept'), done: 'Принято: влито в staging.' }),
  discard: (task, done) => act(task, { optimistic: 'closed', request: () => post(task, 'close'), done }),
};

const board = createBoard({ container: $('board'), onSelect: select });
const pane = createPane({ container: $('pane'), loadLog, actions });

// Строка ввода есть только на странице с управлением; на странице просмотра её заменяет заглушка.
const idle = { init() {}, render() {}, clear() {}, restore() {}, setBusy() {}, focus() {}, setModel() {}, setEffort() {} };
const composer = isStatic ? idle : createComposer({ onSubmit: submitTask });

async function submitTask(input) {
  composer.clear();
  composer.setBusy(true);
  busy++;
  try {
    const task = await api('/api/tasks', { method: 'POST', body: { ...input, project: state.project.id } });
    updateSettings({ model: input.model, effort: input.effort });
    toast(input.send ? `Задача #${task.id} отправлена. Ноутбук можно закрыть.` : `Задача #${task.id} сохранена в идеях.`);
    busy--;
    await load();
    busy++;
    if (!input.send) select(task.id);
  } catch (error) {
    toast(error.message, true);
    composer.restore(input.text);
  } finally {
    busy--;
    composer.setBusy(false);
    await load();
  }
}

// ---------- клавиши ----------
function bindKeys() {
  document.addEventListener('keydown', (event) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
    if (event.key === 'Escape') { if (typing) document.activeElement.blur(); else actions.closePane(); return; }
    if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
    if ((event.key === 'n' || event.key === 'т') && !isStatic) { event.preventDefault(); composer.focus(); }
    else if (event.key === '?') $('dlg-help').showModal();
    else if (['j', 'k', 'о', 'л'].includes(event.key)) {
      const ids = visibleColumns().flatMap((c) => projectTasks().filter((t) => t.status === c.id).sort((a, b) => b.id - a.id)).map((t) => t.id);
      if (!ids.length) return;
      const index = ids.indexOf(state.selectedId);
      const down = event.key === 'j' || event.key === 'о';
      const next = down ? ids[Math.min(ids.length - 1, index + 1)] : ids[Math.max(0, index < 0 ? 0 : index - 1)];
      select(next);
      board.scrollTo(next);
    }
  });
}

function renderEnvironments() {
  const { stagingUrl, prodUrl } = state.project;
  $('env').replaceChildren(...[['Бета', stagingUrl], ['Прод', prodUrl]].filter(([, url]) => url)
    .map(([name, url]) => el('a', { href: url, target: '_blank', rel: 'noopener', textContent: `${name} ↗` })));
}

// ---------- запуск ----------
async function init() {
  setConfig(await loadConfig());
  fillSelect($('project'), state.config.projects, state.project.id);
  $('project').addEventListener('change', (event) => {
    setProject(event.target.value);
    state.selectedId = null;
    $('pane').hidden = true;
    board.reset();
    renderEnvironments();
    composer.render();
    board.render();
  });

  composer.init();
  initSettings({ onDefaultsChange: () => { if (state.settings.model) composer.setModel(state.settings.model); if (state.settings.effort) composer.setEffort(state.settings.effort); } });
  renderEnvironments();
  composer.render();
  bindKeys();
  await load();
  setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
}

init();
