// Интерфейс локальной доски. Данные только из своего сервера (server.mjs), токены GitHub не нужны: он ходит через gh.
const COLUMNS = [
  { id: 'backlog', title: 'Очередь' },
  { id: 'running', title: 'В работе' },
  { id: 'review', title: 'На проверке' },
  { id: 'failed', title: 'Ошибка' },
  { id: 'done', title: 'Принято' },
];
const POLL_MS = 4000;

const $ = (id) => document.getElementById(id);
let config;
let project;
let tasks = [];
let openId = null;
let busy = false;

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: method !== 'GET' ? { 'Content-Type': 'application/json' } : {},
    body: method !== 'GET' ? JSON.stringify(body ?? {}) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
  return data;
}

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, 6000);
}

function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...kids);
  return node;
}

const fill = (tpl, n) => tpl.replace('{n}', n);
const time = (iso) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const ago = (iso) => {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  return m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч ${m % 60} мин`;
};

// Мини-разметка: всё экранируем, поднимаем только заголовки, списки, жирное, код и ссылки.
function md(text) {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let html = '';
  let inList = false;
  for (const raw of esc.split('\n')) {
    const line = raw
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    const item = /^\s*(?:[-*]|- \[[ x]\])\s+(.*)$/.exec(line);
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

const modelTitle = (id) => config.models.find((m) => m.id === id)?.title ?? id;
function modelSelect(current) {
  const select = el('select');
  for (const m of config.models) select.append(el('option', { value: m.id, textContent: m.title, defaultSelected: m.id === (current ?? config.defaultModel) }));
  return select;
}

const effortTitle = (id) => config.efforts.find((e) => e.id === id)?.title ?? id;
function effortSelect(current) {
  const select = el('select');
  for (const e of config.efforts) select.append(el('option', { value: e.id, textContent: e.title, defaultSelected: e.id === (current ?? config.defaultEffort) }));
  return select;
}

const mine = () => tasks.filter((t) => t.projectId === project.id);

function renderBoard() {
  const board = $('board');
  board.replaceChildren();
  for (const col of COLUMNS) {
    const items = mine().filter((t) => t.status === col.id).sort((a, b) => b.id - a.id);
    const column = el('section', { className: 'col' }, el('h2', {}, el('span', { textContent: col.title }), el('span', { textContent: String(items.length) })));
    if (!items.length) column.append(el('div', { className: 'empty', textContent: '—' }));
    for (const t of items) {
      const meta = el('div', { className: 'm' }, el('span', { textContent: `#${t.id}` }), el('span', { className: 'badge', textContent: modelTitle(t.model) }), el('span', { className: 'badge', textContent: effortTitle(t.effort).toLowerCase() }));
      if (col.id === 'running') meta.append(el('span', { className: 'badge run pulse', textContent: t.pr ? 'идёт работа' : 'в облаке' }), el('span', { textContent: ago(t.sentAt) }));
      if (col.id === 'review' && t.pr) meta.append(el('span', { className: 'badge', textContent: 'PR #' + t.pr.number }));
      const card = el('div', { className: 'card', tabIndex: 0 }, el('div', { className: 't', textContent: t.title }), meta);
      if (t.links?.site && col.id === 'review') {
        const chips = el('div', { className: 'chips' });
        for (const [text, href] of [['Сайт', t.links.site], ['Отчёт', t.links.report]]) {
          if (!href) continue;
          const a = el('a', { className: 'chip', textContent: text, href, target: '_blank', rel: 'noopener' });
          a.addEventListener('click', (e) => e.stopPropagation());
          chips.append(a);
        }
        card.append(chips);
      }
      card.addEventListener('click', () => openDrawer(t.id));
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter') openDrawer(t.id); });
      column.append(card);
    }
    board.append(column);
  }
}

async function load() {
  if (busy) return;
  try {
    ({ tasks } = await api('/api/state'));
    renderBoard();
    $('sync').textContent = 'обновлено ' + time(new Date());
    if (openId) refreshDrawer();
  } catch {
    $('sync').textContent = 'нет связи с сервером доски';
  }
}

function openDrawer(id) {
  openId = id;
  $('drawer').hidden = false;
  refreshDrawer();
}

function closeDrawer() {
  openId = null;
  $('drawer').hidden = true;
}

async function refreshDrawer() {
  const t = tasks.find((x) => x.id === openId);
  const body = $('drawer-body');
  if (!t) { body.textContent = 'Задача не найдена.'; return; }
  let log = { events: t.events, commits: [], comments: [], checks: [], pr: t.pr };
  try { log = await api(`/api/tasks/${t.id}/log`); } catch { /* показываем локальные события */ }
  // Перерисовываем только при изменении данных: иначе мигают скриншоты и пропадает набранная правка.
  const sig = JSON.stringify([t.id, t.status, t.events.length, t.links, log.commits.length, log.comments.length, log.pr?.updatedAt, log.pr?.body, log.checks]);
  if (body.dataset.sig === sig) return;
  body.dataset.sig = sig;

  body.replaceChildren(el('h2', { textContent: t.title }));
  body.append(el('div', { className: 'm', textContent: `#${t.id} · ${COLUMNS.find((c) => c.id === t.status)?.title ?? t.status} · ${modelTitle(t.model)} · усилие: ${effortTitle(t.effort).toLowerCase()}` }));
  if (t.body && t.body !== t.title) body.append(el('div', { className: 'report', innerHTML: md(t.body) }));

  const links = el('div', { className: 'links' });
  const link = (text, href) => links.append(el('a', { textContent: text, href, target: '_blank', rel: 'noopener' }));
  if (t.sessionUrl) link('Сессия Claude (полный лог)', t.sessionUrl);
  if (log.pr) link(`PR #${log.pr.number}`, log.pr.url);
  // Ссылки сервер берёт из комментария workflow в PR: имя ветки задачи может нести хвост от облака.
  if (t.links?.site) link('Превью сайта', t.links.site);
  if (t.links?.report) link('Отчёт тестов', t.links.report);
  if (t.status === 'done') link('Бета (staging)', project.stagingUrl);
  body.append(links);
  if (t.links?.desktop && t.status !== 'done') {
    const shots = el('div', { className: 'shots' });
    for (const [label, src] of [['Компьютер', t.links.desktop], ['Телефон', t.links.mobile]]) {
      if (!src) continue;
      const a = el('a', { href: src, target: '_blank', rel: 'noopener', title: label }, el('img', { src, alt: `Скриншот: ${label}`, loading: 'lazy' }));
      shots.append(a);
    }
    body.append(el('h3', { textContent: 'Скриншоты страницы' }), shots);
  }

  if (log.pr?.body) {
    const heading = log.pr.body.startsWith('## Отчёт') ? 'Отчёт исполнителя' : 'Ход работы (из PR)';
    body.append(el('h3', { textContent: heading }), el('div', { className: 'report', innerHTML: md(log.pr.body) }));
  }
  if (log.checks.length) {
    const checks = el('div', { className: 'checks' });
    for (const c of log.checks) {
      const result = (c.conclusion || c.status || '').toUpperCase();
      const cls = result === 'SUCCESS' ? 'check-ok' : ['FAILURE', 'ERROR'].includes(result) ? 'check-bad' : '';
      checks.append(el('span', { className: `badge ${cls}`, textContent: `${c.name}: ${result.toLowerCase()}` }));
    }
    body.append(el('h3', { textContent: 'Проверки' }), checks);
  }

  const rows = [
    ...log.events.map((e) => ({ t: e.t, text: e.text })),
    ...log.commits.map((c) => ({ t: c.t, text: `коммит: ${c.text}`, commit: true })),
    ...log.comments.map((c) => ({ t: c.t, text: `комментарий в PR: ${c.body.split('\n')[0]}` })),
  ].sort((a, b) => new Date(a.t) - new Date(b.t));
  const timeline = el('ul', { className: 'timeline' });
  for (const r of rows) timeline.append(el('li', { className: r.commit ? 'commit' : '' }, el('time', { textContent: time(r.t) }), r.text));
  body.append(el('h3', { textContent: 'Лента событий' }), timeline);
  if (t.status === 'running' && !t.pr && t.sentAt && Date.now() - new Date(t.sentAt) > 30 * 60000) {
    body.append(el('div', { className: 'hint stalled', textContent: `PR не появился уже ${ago(t.sentAt)}. Откройте сессию Claude по ссылке: возможно, она ждёт вашего ответа.` }));
  }
  body.append(actionsFor(t));
}

function actionsFor(t) {
  const box = el('div', { className: 'actions' });
  const act = (fn, ok) => async (e) => {
    e.target.disabled = true;
    busy = true;
    try { await fn(); if (ok) toast(ok); } catch (err) { toast(err.message); } finally { busy = false; await load(); }
  };
  const post = (action, payload = {}) => api(`/api/tasks/${t.id}/${action}`, { method: 'POST', body: payload });

  if (t.status === 'backlog' || t.status === 'failed') {
    const model = modelSelect(t.model);
    const effort = effortSelect(t.effort);
    const send = el('button', { className: 'primary', textContent: t.status === 'failed' ? 'Отправить снова' : 'Отправить в облако' });
    send.addEventListener('click', act(() => post('send', { model: model.value, effort: effort.value }), 'Отправлено. Можно закрывать ноутбук: результат появится в GitHub.'));
    box.append(el('label', { className: 'hint', textContent: 'Модель' }), model, el('label', { className: 'hint', textContent: 'Уровень усилий' }), effort, send);
  }
  if (t.status === 'review') {
    const accept = el('button', { className: 'primary', textContent: 'Принять' });
    accept.addEventListener('click', act(() => post('accept'), 'Влито в staging, бета обновится через минуту.'));
    const text = el('textarea', { rows: 3, placeholder: 'Что исправить' });
    const rework = el('button', { textContent: 'На доработку' });
    rework.addEventListener('click', act(async () => {
      if (!text.value.trim()) throw new Error('Напишите, что исправить.');
      await post('rework', { text: text.value });
    }, 'Правка отправлена в облако.'));
    box.append(accept, text, rework);
  }
  if (t.status !== 'done' && t.status !== 'closed') {
    const close = el('button', { className: 'danger', textContent: t.status === 'review' ? 'Отклонить (закрыть PR)' : 'Закрыть без выполнения' });
    close.addEventListener('click', act(() => post('close'), t.status === 'review' ? 'Отклонено: PR закрыт, ветка удалена.' : 'Закрыто.'));
    box.append(close);
  }
  return box;
}

async function init() {
  config = await (await fetch('config.json')).json();
  const select = $('project');
  $('new-model').replaceWith(Object.assign(modelSelect(), { id: 'new-model' }));
  $('new-effort').replaceWith(Object.assign(effortSelect(), { id: 'new-effort' }));
  for (const p of config.projects) select.append(el('option', { value: p.id, textContent: p.title }));
  project = config.projects[0];
  select.addEventListener('change', () => { project = config.projects.find((p) => p.id === select.value); closeDrawer(); renderBoard(); });

  $('new').addEventListener('click', () => { $('form-new').reset(); $('dlg-new').showModal(); });
  for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => b.closest('dialog').close('cancel'));
  $('dlg-new').addEventListener('close', async () => {
    if ($('dlg-new').returnValue !== 'ok') return;
    busy = true;
    const send = $('new-send').checked;
    try {
      await api('/api/tasks', { method: 'POST', body: { project: project.id, text: $('new-text').value, model: $('new-model').value, effort: $('new-effort').value, send } });
      toast(send ? 'Задача создана и отправлена.' : 'Задача создана.');
    } catch (e) { toast(e.message); } finally { busy = false; await load(); }
  });
  $('drawer-close').addEventListener('click', closeDrawer);

  load();
  setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
}

init();
