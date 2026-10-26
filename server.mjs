// Локальная доска: задачи хранятся здесь (data/tasks.json), в облако уходит текст задачи,
// результат и ход работы читаются с GitHub через gh. Слушает только 127.0.0.1.
import http from 'node:http';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA = join(ROOT, 'data', 'tasks.json');
const PORT = Number(process.env.PORT ?? 5194);
const SYNC_MS = 20000;
const config = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf8'));
const dirOf = (p) => p.dir.replace(/^~/, os.homedir());
const modelOk = (m) => config.models.some((x) => x.id === m);
const effortOk = (e) => config.efforts.some((x) => x.id === e);
const projectOf = (id) => config.projects.find((p) => p.id === id) ?? config.projects[0];

let tasks = existsSync(DATA) ? JSON.parse(readFileSync(DATA, 'utf8')) : [];
const save = () => { mkdirSync(dirname(DATA), { recursive: true }); writeFileSync(DATA, JSON.stringify(tasks, null, 2)); };
const now = () => new Date().toISOString();
const find = (id) => tasks.find((t) => t.id === Number(id));
const event = (task, text) => { task.events.push({ t: now(), text }); save(); };
const hash = (s) => createHash('sha1').update(s ?? '').digest('hex');

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { maxBuffer: 20 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).trim()));
      else resolve(stdout);
    });
    // claude -p ждёт stdin до EOF.
    child.stdin?.end();
  });
}
const gh = async (args) => JSON.parse((await run('gh', args)) || 'null');

function prompt(task, extra = '') {
  return [
    `Ты исполнитель доски задач. Задача #${task.id}: ${task.title}`,
    task.body ? `\nОписание:\n${task.body}` : '',
    `\nВетка claude/task-${task.id}. Выполни протокол из .agent/PROTOCOL.md: draft PR сразу, ход работы в теле PR, отчёт в конце.`,
    extra,
  ].join('\n');
}

async function prepareCheckout(task) {
  const dir = dirOf(projectOf(task.project));
  // claude --cloud клонирует ветку, на которой стоит папка, поэтому нужен свежий staging.
  await run('git', ['-C', dir, 'fetch', '-q', 'origin']);
  await run('git', ['-C', dir, 'switch', '-q', 'staging']);
  await run('git', ['-C', dir, 'merge', '-q', '--ff-only', 'origin/staging']);
  const dirty = (await run('git', ['-C', dir, 'status', '--porcelain'])).trim();
  if (dirty) event(task, 'В папке проекта есть незакоммиченные правки: облако их не увидит.');
  return dir;
}

async function dispatch(task) {
  task.status = 'running';
  task.sentAt = now();
  task.branch = `claude/task-${task.id}`;
  event(task, `Отправка в облако, модель: ${task.model}, усилие: ${task.effort}…`);
  try {
    const dir = await prepareCheckout(task);
    const out = JSON.parse(await run('python3', [join(ROOT, 'dispatch.py'), dir, prompt(task), task.model, task.effort]));
    if (!out.ok) {
      task.status = 'failed';
      event(task, out.error === 'trust'
        ? 'Claude просит подтвердить доверие к папке проекта: откройте терминал в ней, запустите claude и ответьте «Yes, I trust».'
        : `Сессия не стартовала: ${out.message}`);
      return;
    }
    task.sessionId = out.session_id;
    task.sessionUrl = `https://claude.ai/code/${out.session_id}`;
    event(task, `Облачная сессия запущена: ${task.sessionUrl}${out.warning ? ' · ' + out.warning : ''}`);
  } catch (e) {
    task.status = 'failed';
    event(task, `Не удалось отправить: ${e.message}`);
  }
}

async function rework(task, text) {
  event(task, `Доработка: ${text}`);
  task.status = 'running';
  task.bodyAtRework = hash(task.pr?.body);
  const message = `Доработка по задаче #${task.id}: ${text}\nВерни PR в draft, поправь, прогони тесты, обнови ## Отчёт и снова сделай gh pr ready.`;
  try {
    if (task.sessionId) {
      await run('claude', ['-p', message, '--cloud', task.sessionId, '--output-format', 'json']);
      event(task, 'Правка отправлена в ту же облачную сессию.');
    } else {
      await dispatch(task);
    }
  } catch (e) {
    task.status = 'failed';
    event(task, `Правка не ушла: ${e.message}`);
  }
}

async function accept(task) {
  const project = projectOf(task.project);
  await run('gh', ['pr', 'merge', String(task.pr.number), '-R', project.repo, '--squash']);
  task.status = 'done';
  event(task, 'PR влит в staging, бета обновится через минуту.');
}

async function close(task) {
  const project = projectOf(task.project);
  if (task.pr?.state === 'OPEN') await run('gh', ['pr', 'close', String(task.pr.number), '-R', project.repo, '--delete-branch']).catch(() => {});
  task.status = 'closed';
  event(task, 'Закрыто без выполнения.');
}

// Состояние задачи выводится из PR: draft и «Ход работы» — идёт работа, «## Отчёт» без draft — готово к проверке.
async function syncTask(task) {
  const project = projectOf(task.project);
  // Облако дописывает к имени ветки случайный хвост (claude/task-5-bxeue1), поэтому PR ищется по префиксу.
  const prs = await gh(['pr', 'list', '-R', project.repo, '--state', 'all', '--limit', '50',
    '--json', 'number,url,state,isDraft,body,mergedAt,updatedAt,title,headRefName']);
  const base = `claude/task-${task.id}`;
  const pr = prs.filter((p) => p.headRefName === base || p.headRefName.startsWith(`${base}-`))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!pr) return;
  task.pr = pr;
  task.branch = pr.headRefName;
  if (pr.mergedAt) { if (task.status !== 'done') { task.status = 'done'; event(task, 'PR влит.'); } return; }
  if (pr.state === 'CLOSED') { if (task.status !== 'closed') { task.status = 'closed'; event(task, 'PR закрыт.'); } return; }
  const hasReport = pr.body?.startsWith('## Отчёт');
  const fresh = !task.bodyAtRework || hash(pr.body) !== task.bodyAtRework;
  let next = 'running';
  if (hasReport && pr.body.includes('СБОЙ:')) next = 'failed';
  else if (hasReport && !pr.isDraft && fresh) next = 'review';
  if (next !== task.status) {
    task.status = next;
    if (next === 'review') delete task.bodyAtRework;
    event(task, { review: 'Готово к проверке: PR открыт для ревью.', failed: 'Агент сообщил о сбое.', running: 'Работа продолжается.' }[next]);
  } else save();
}

let syncing = false;
async function syncAll() {
  if (syncing) return;
  syncing = true;
  try {
    for (const t of tasks.filter((x) => ['running', 'review'].includes(x.status) && x.branch)) {
      try { await syncTask(t); } catch (e) { t.syncError = e.message; }
    }
  } finally { syncing = false; }
}

async function logOf(task) {
  const project = projectOf(task.project);
  const out = { events: task.events, pr: task.pr ?? null, commits: [], comments: [], checks: [] };
  if (!task.branch) return out;
  try {
    const q = task.sentAt ? `&since=${encodeURIComponent(task.sentAt)}` : '';
    const commits = await gh(['api', `repos/${project.repo}/commits?sha=${encodeURIComponent(task.branch)}&per_page=30${q}`]);
    out.commits = commits.map((c) => ({ t: c.commit.author.date, text: c.commit.message.split('\n')[0] }));
  } catch { /* ветки ещё нет */ }
  if (task.pr) {
    try {
      const view = await gh(['pr', 'view', String(task.pr.number), '-R', project.repo, '--json', 'comments,statusCheckRollup']);
      out.comments = view.comments.map((c) => ({ t: c.createdAt, body: c.body }));
      out.checks = (view.statusCheckRollup ?? []).map((c) => ({ name: c.name ?? c.context, status: c.status ?? c.state, conclusion: c.conclusion ?? '' }));
    } catch { /* PR недоступен */ }
  }
  return out;
}

// У задач, созданных до появления выбора, полей model и effort нет: показываем значения по умолчанию.
const view = (t) => ({ ...t, model: t.model ?? config.defaultModel, effort: t.effort ?? config.defaultEffort, project: undefined, projectId: t.project });

function body(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 1e6) reject(new Error('слишком большой запрос')); });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } });
  });
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const STATIC = new Set(['/', '/index.html', '/app.js', '/style.css', '/config.json']);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
  // Защита от запросов с чужих сайтов: проверка Host (DNS rebinding) и обязательный JSON для изменений.
  if (![`localhost:${PORT}`, `127.0.0.1:${PORT}`].includes(req.headers.host)) return send(403, { error: 'host' });
  try {
    if (req.method === 'GET' && STATIC.has(url.pathname)) {
      const file = url.pathname === '/' ? '/index.html' : url.pathname;
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'text/plain' });
      return res.end(await readFile(join(ROOT, file)));
    }
    if (!url.pathname.startsWith('/api/')) return send(404, { error: 'not found' });
    if (req.method !== 'GET' && !String(req.headers['content-type']).startsWith('application/json')) return send(415, { error: 'json only' });

    const parts = url.pathname.split('/').filter(Boolean); // api, tasks, id, action
    if (req.method === 'GET' && parts[1] === 'state') return send(200, { tasks: tasks.map(view), at: now() });
    if (req.method === 'GET' && parts[1] === 'tasks' && parts[3] === 'log') {
      const t = find(parts[2]); if (!t) return send(404, { error: 'нет задачи' });
      return send(200, await logOf(t));
    }
    if (req.method === 'POST' && parts[1] === 'tasks' && !parts[2]) {
      const b = await body(req);
      if (!b.title?.trim()) return send(400, { error: 'нужен заголовок' });
      const task = { id: Math.max(0, ...tasks.map((t) => t.id)) + 1, project: b.project ?? config.projects[0].id, title: b.title.trim(), body: (b.body ?? '').trim(), model: modelOk(b.model) ? b.model : config.defaultModel, effort: effortOk(b.effort) ? b.effort : config.defaultEffort, status: 'backlog', createdAt: now(), events: [] };
      tasks.push(task); event(task, 'Задача создана.');
      if (b.send) await dispatch(task);
      return send(200, view(task));
    }
    if (req.method === 'POST' && parts[1] === 'tasks' && parts[2] && parts[3]) {
      const t = find(parts[2]); if (!t) return send(404, { error: 'нет задачи' });
      const b = await body(req);
      if (parts[3] === 'send') { if (modelOk(b.model)) t.model = b.model; if (effortOk(b.effort)) t.effort = b.effort; await dispatch(t); }
      else if (parts[3] === 'rework') { if (!b.text?.trim()) return send(400, { error: 'нужен текст правки' }); await rework(t, b.text.trim()); }
      else if (parts[3] === 'accept') await accept(t);
      else if (parts[3] === 'close') await close(t);
      else return send(404, { error: 'нет действия' });
      return send(200, view(t));
    }
    return send(404, { error: 'not found' });
  } catch (e) {
    return send(500, { error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Доска: http://localhost:${PORT}`);
  syncAll();
  setInterval(syncAll, SYNC_MS);
});
