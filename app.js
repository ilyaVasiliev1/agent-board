// Состояние задачи живёт в метках issue; панель только читает и переключает их.
// backlog → st:queued → st:running → st:review → (принять: PR влит, issue закрыт) | (доработка: снова st:queued)
const API = 'https://api.github.com';
const COLUMNS = [
  { id: 'backlog', title: 'Очередь' },
  { id: 'running', title: 'В работе' },
  { id: 'review', title: 'На проверке' },
  { id: 'failed', title: 'Ошибка' },
  { id: 'done', title: 'Принято' },
];
const STATUS_LABELS = [
  { name: 'st:queued', color: 'c5def5' },
  { name: 'st:running', color: 'fbca04' },
  { name: 'st:review', color: '0e8a16' },
  { name: 'st:failed', color: 'b60205' },
  { name: 'st:accepted', color: '1d76db' },
  { name: 'engine:claude', color: 'd4c5f9' },
  { name: 'engine:hermes', color: 'd4c5f9' },
];
const POLL_MS = 15000;

const $ = (id) => document.getElementById(id);
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* приватный режим: работаем без памяти */ } },
};

let config;
let project;
let issues = [];
let openIssue = null;
let busy = false;

async function gh(path, { method = 'GET', body } = {}) {
  const token = store.get('board.token');
  if (!token) throw new Error('Нет токена: нажмите «Доступ».');
  const res = await fetch(API + path, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `GitHub ${res.status}`);
  return data;
}

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, 5000);
}

const labelsOf = (issue) => issue.labels.map((l) => l.name);
const engineOf = (issue) => labelsOf(issue).find((l) => l.startsWith('engine:'))?.slice(7) ?? null;
const fill = (tpl, n) => tpl.replace('{n}', n);

function columnOf(issue) {
  const l = labelsOf(issue);
  if (issue.state === 'closed') return l.includes('st:accepted') ? 'done' : null;
  if (l.includes('st:failed')) return 'failed';
  if (l.includes('st:review')) return 'review';
  if (l.includes('st:running') || l.includes('st:queued')) return 'running';
  return 'backlog';
}

function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...kids);
  return node;
}

function renderBoard() {
  const board = $('board');
  board.replaceChildren();
  for (const col of COLUMNS) {
    const items = issues.filter((i) => columnOf(i) === col.id);
    const column = el('section', { className: 'col' }, el('h2', {}, el('span', { textContent: col.title }), el('span', { textContent: String(items.length) })));
    if (!items.length) column.append(el('div', { className: 'empty', textContent: '—' }));
    for (const issue of items) {
      const engine = engineOf(issue);
      const running = col.id === 'running';
      const meta = el('div', { className: 'm' }, el('span', { textContent: `#${issue.number}` }));
      if (engine) meta.append(el('span', { className: 'badge' + (running ? ' run pulse' : ''), textContent: engine }));
      if (issue.labels.some((l) => l.name === 'st:queued')) meta.append(el('span', { className: 'badge', textContent: 'в очереди' }));
      const card = el('div', { className: 'card', tabIndex: 0 }, el('div', { className: 't', textContent: issue.title }), meta);
      card.addEventListener('click', () => showDrawer(issue.number));
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter') showDrawer(issue.number); });
      column.append(card);
    }
    board.append(column);
  }
}

async function load() {
  if (busy) return;
  try {
    const data = await gh(`/repos/${project.repo}/issues?state=all&per_page=100&sort=updated&direction=desc`);
    issues = data.filter((i) => !i.pull_request);
    renderBoard();
    $('sync').textContent = 'обновлено ' + new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (openIssue) refreshDrawer();
  } catch (e) {
    $('sync').textContent = 'ошибка синхронизации';
    toast(e.message);
  }
}

// Мини-разметка отчётов: экранируем всё, затем поднимаем только заголовки, списки, жирное и код.
function md(text) {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = esc.split('\n');
  let html = '';
  let inList = false;
  for (const raw of lines) {
    let line = raw
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    const item = /^\s*[-*]\s+(.*)$/.exec(line);
    if (item) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${item[1]}</li>`;
      continue;
    }
    if (inList) { html += '</ul>'; inList = false; }
    const h = /^#{1,4}\s+(.*)$/.exec(line);
    html += h ? `<h3>${h[1]}</h3>` : line.trim() ? `<p>${line}</p>` : '';
  }
  return html + (inList ? '</ul>' : '');
}

async function showDrawer(number) {
  openIssue = number;
  $('drawer').hidden = false;
  await refreshDrawer();
}

async function refreshDrawer() {
  const issue = issues.find((i) => i.number === openIssue);
  const body = $('drawer-body');
  if (!issue) { body.textContent = 'Задача не найдена.'; return; }
  const col = columnOf(issue);
  const engine = engineOf(issue);
  let comments = [];
  try {
    comments = await gh(`/repos/${project.repo}/issues/${issue.number}/comments?per_page=100`);
  } catch (e) { toast(e.message); }
  const lastWith = (prefix) => [...comments].reverse().find((c) => c.body.startsWith(prefix));
  const report = lastWith('## Отчёт');
  const preview = lastWith('## Превью');

  body.replaceChildren(el('h2', { textContent: issue.title }));
  body.append(el('div', { className: 'm', textContent: `#${issue.number} · ${COLUMNS.find((c) => c.id === col)?.title ?? 'закрыто'}${engine ? ' · ' + engine : ''}` }));
  if (issue.body) body.append(el('div', { className: 'report', innerHTML: md(issue.body) }));

  const links = el('div', { className: 'links' });
  const link = (text, href) => links.append(el('a', { textContent: text, href, target: '_blank', rel: 'noopener' }));
  link('Задача на GitHub', issue.html_url);
  if (preview) {
    link('Превью сайта', fill(project.previewUrl, issue.number));
    link('Отчёт тестов и скриншоты', fill(project.reportUrl, issue.number));
  }
  if (col === 'done') link('Бета', project.stagingUrl);
  body.append(links);

  if (report) {
    body.append(el('h3', { textContent: 'Отчёт исполнителя' }), el('div', { className: 'report', innerHTML: md(report.body) }));
  }
  if (preview) body.append(el('div', { className: 'report', innerHTML: md(preview.body) }));
  body.append(actionsFor(issue, col, engine));
}

const viaOf = (engine) => config.engines.find((e) => e.id === engine)?.via ?? 'api';
const shq = (s) => `'${s.replace(/'/g, `'\\''`)}'`;

async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Команда скопирована. Вставьте в терминал на Маке.'); } catch { toast(text); }
}

function actionsFor(issue, col, engine) {
  const box = el('div', { className: 'actions' });
  const run = (fn, ok) => async (e) => {
    e.target.disabled = true;
    busy = true;
    try { await fn(); if (ok) toast(ok); } catch (err) { toast(err.message); } finally { busy = false; await load(); }
  };
  const row = el('div', { className: 'row' });

  if (col === 'backlog' || col === 'failed') {
    const select = engineSelect(engine);
    const send = el('button', { className: 'primary', textContent: col === 'failed' ? 'Запустить снова' : 'Отправить на исполнение' });
    send.addEventListener('click', run(async () => {
      await queue(issue, select.value);
      if (viaOf(select.value) === 'cli') await copy(`${project.cli} send ${issue.number} ${select.value}`);
    }, viaOf(select.value) === 'cli' ? '' : 'Отправлено. Можно закрывать ноутбук.'));
    box.append(select, send);
    box.append(el('div', { className: 'hint', textContent: 'Для Claude панель копирует команду: облачная сессия запускается с Мака. Для Hermes запуск идёт сразу.' }));
  }
  if (col === 'review') {
    const accept = el('button', { className: 'primary', textContent: 'Принять' });
    accept.addEventListener('click', run(() => accept_(issue, engine), 'Влито в staging, бета обновится через минуту.'));
    const text = el('textarea', { rows: 3, placeholder: 'Что исправить' });
    const rework = el('button', { textContent: 'На доработку' });
    rework.addEventListener('click', run(async () => {
      const t = text.value.trim();
      if (!t) throw new Error('Напишите, что исправить.');
      if (viaOf(engine) === 'cli') await copy(`${project.cli} rework ${issue.number} ${shq(t)}`);
      else { await rework_(issue, t); toast('Отправлено на доработку.'); }
    }));
    row.append(accept);
    box.append(row, text, rework);
  }
  if (col !== 'done') {
    const close = el('button', { className: 'danger', textContent: 'Закрыть без выполнения' });
    close.addEventListener('click', run(() => gh(`/repos/${project.repo}/issues/${issue.number}`, { method: 'PATCH', body: { state: 'closed' } }), 'Закрыто.'));
    box.append(close);
  }
  return box;
}

function engineSelect(current) {
  const select = el('select');
  for (const e of config.engines) select.append(el('option', { value: e.id, textContent: e.title, selected: e.id === current }));
  return select;
}

async function dropLabel(number, name) {
  try { await gh(`/repos/${project.repo}/issues/${number}/labels/${encodeURIComponent(name)}`, { method: 'DELETE' }); } catch { /* метки уже нет */ }
}

async function queue(issue, engine) {
  for (const l of labelsOf(issue)) if (l.startsWith('engine:') || l === 'st:failed') await dropLabel(issue.number, l);
  // st:queued добавляется последним отдельным вызовом: диспетчер стартует по этой метке и должен видеть engine:*.
  await gh(`/repos/${project.repo}/issues/${issue.number}/labels`, { method: 'POST', body: { labels: [`engine:${engine}`] } });
  if (viaOf(engine) === 'api') await gh(`/repos/${project.repo}/issues/${issue.number}/labels`, { method: 'POST', body: { labels: ['st:queued'] } });
}

async function rework_(issue, text) {
  await gh(`/repos/${project.repo}/issues/${issue.number}/comments`, { method: 'POST', body: { body: `Доработка: ${text}` } });
  await dropLabel(issue.number, 'st:review');
  await gh(`/repos/${project.repo}/issues/${issue.number}/labels`, { method: 'POST', body: { labels: ['st:queued'] } });
}

async function accept_(issue, engine) {
  const owner = project.repo.split('/')[0];
  const prs = await gh(`/repos/${project.repo}/pulls?head=${owner}:${engine}/issue-${issue.number}&state=open`);
  if (!prs.length) throw new Error('Не нашёл открытый PR для этой задачи.');
  await gh(`/repos/${project.repo}/pulls/${prs[0].number}/merge`, { method: 'PUT', body: { merge_method: 'squash' } });
  await dropLabel(issue.number, 'st:review');
  await gh(`/repos/${project.repo}/issues/${issue.number}/labels`, { method: 'POST', body: { labels: ['st:accepted'] } });
  await gh(`/repos/${project.repo}/issues/${issue.number}`, { method: 'PATCH', body: { state: 'closed' } });
}

async function createTask(e) {
  const title = $('new-title').value.trim();
  const body = $('new-body').value.trim();
  const send = $('new-send').checked;
  const engine = $('new-engine').value;
  busy = true;
  try {
    const issue = await gh(`/repos/${project.repo}/issues`, { method: 'POST', body: { title, body } });
    if (send) await queue({ number: issue.number, labels: [] }, engine);
    if (send && viaOf(engine) === 'cli') await copy(`${project.cli} send ${issue.number} ${engine}`);
    else toast(send ? 'Задача отправлена. Можно закрывать ноутбук.' : 'Задача создана.');
  } catch (err) { toast(err.message); } finally { busy = false; await load(); }
}

async function prepareLabels() {
  for (const l of STATUS_LABELS) {
    try { await gh(`/repos/${project.repo}/labels`, { method: 'POST', body: l }); } catch { /* уже есть */ }
  }
  toast('Метки готовы.');
}

async function init() {
  config = await (await fetch('config.json')).json();
  const select = $('project');
  for (const p of config.projects) select.append(el('option', { value: p.id, textContent: p.title }));
  const saved = store.get('board.project');
  project = config.projects.find((p) => p.id === saved) ?? config.projects[0];
  select.value = project.id;
  select.addEventListener('change', () => {
    project = config.projects.find((p) => p.id === select.value);
    store.set('board.project', project.id);
    $('drawer').hidden = true;
    openIssue = null;
    load();
  });
  for (const e of config.engines) $('new-engine').append(el('option', { value: e.id, textContent: e.title }));

  $('new').addEventListener('click', () => { $('form-new').reset(); $('dlg-new').showModal(); });
  $('dlg-new').addEventListener('close', () => { if ($('dlg-new').returnValue === 'ok') createTask(); });
  $('settings').addEventListener('click', () => { $('token').value = store.get('board.token') ?? ''; $('dlg-settings').showModal(); });
  $('dlg-settings').addEventListener('close', () => {
    if ($('dlg-settings').returnValue === 'ok') { store.set('board.token', $('token').value.trim()); load(); }
  });
  $('prepare').addEventListener('click', async () => { store.set('board.token', $('token').value.trim()); await prepareLabels(); });
  for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => b.closest('dialog').close('cancel'));
  $('drawer-close').addEventListener('click', () => { $('drawer').hidden = true; openIssue = null; });

  if (!store.get('board.token')) $('dlg-settings').showModal(); else load();
  setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
}

init();
