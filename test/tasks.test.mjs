import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { CloudError, TrustRequiredError } from '../server/claude.mjs';
import { hashText } from '../server/derive.mjs';
import { TaskStore } from '../server/store.mjs';
import { DomainError, TaskService } from '../server/tasks.mjs';

const PREVIEW = (tests = 'зелёные') => `## Превью\n- Сайт: https://h/p/preview/task-1/\n- Отчёт тестов со скриншотами: https://h/p/preview/task-1-report/\n- Тесты в облаке: ${tests}`;

function setup({ mode = 'full', autoAllowed = true } = {}) {
  const store = new TaskStore(join(mkdtempSync(join(tmpdir(), 'board-svc-')), 'tasks.json'));
  const calls = { dispatch: [], followUp: [], merge: [], close: [] };
  const github = {
    prs: [],
    comments: [],
    mergeError: null,
    async pullRequests() { return this.prs; },
    async details() { return { comments: this.comments, checks: [] }; },
    async commits() { return []; },
    async merge(repo, number) { calls.merge.push([repo, number]); if (this.mergeError) throw new Error(this.mergeError); },
    async close(repo, number) { calls.close.push([repo, number]); },
  };
  const cloud = {
    failure: null,
    gate: null,
    async dispatch(args) { calls.dispatch.push(args); await this.gate; if (this.failure) throw this.failure; return { sessionId: 'session_ABC' }; },
    async followUp(id, message) { calls.followUp.push([id, message]); },
  };
  const config = {
    models: [{ id: 'sonnet' }, { id: 'opus' }],
    efforts: [{ id: 'low' }, { id: 'high' }],
    defaultModel: 'sonnet',
    defaultEffort: 'high',
    projects: [{ id: 'p', title: 'P', repo: 'o/p', dir: '/x', cloud: { mode, autoAllowed, can: [], cannot: [] } }],
  };
  const service = new TaskService({ store, github, cloud, workspace: { prepare: async () => '/ws' }, config });
  return { service, store, github, cloud, calls };
}

const openPr = (over = {}) => ({ number: 3, url: 'u', title: '[#1] Раф', headRefName: 'claude/x', state: 'OPEN', isDraft: true, mergedAt: null, body: '## Ход работы\n- [x] ветка', updatedAt: '2026-10-26T10:00:00Z', ...over });
const reviewPr = (over = {}) => openPr({ isDraft: false, body: '## Отчёт\nГотово', updatedAt: '2026-10-26T10:05:00Z', ...over });

async function sendTask(ctx, extra = {}) {
  const task = await ctx.service.create({ text: 'Раф за 290', send: true, ...extra });
  await ctx.service.idle();
  return task.id;
}
const get = (ctx, id) => ctx.service.list().find((t) => t.id === id);

test('создание проверяет текст и подставляет допустимые значения', async () => {
  const ctx = setup({ autoAllowed: false });
  await assert.rejects(() => ctx.service.create({ text: '  ' }), DomainError);
  const task = await ctx.service.create({ text: 'Заголовок\nдетали', model: 'нет такой', effort: 'low', auto: true });
  assert.equal(task.title, 'Заголовок');
  assert.equal(task.model, 'sonnet');
  assert.equal(task.effort, 'low');
  assert.equal(task.auto, false, 'авторежим игнорируется, если проект его не разрешает');
  assert.equal(task.status, 'backlog');
});

test('отправка уходит в фон: ответ сразу «в работе», сессия появляется позже', async () => {
  const ctx = setup();
  let release;
  ctx.cloud.gate = new Promise((resolve) => { release = resolve; });
  const task = await ctx.service.create({ text: 'Раф', send: true });
  assert.equal(task.status, 'running');
  assert.equal(get(ctx, task.id).sessionId, undefined);
  release();
  await ctx.service.idle();
  assert.equal(get(ctx, task.id).sessionUrl, 'https://claude.ai/code/session_ABC');
  assert.match(ctx.calls.dispatch[0].prompt, /\[#1\]/);
});

test('в проекте только для локальной работы отправка в облако отказывает, а идея сохраняется', async () => {
  const ctx = setup({ mode: 'local' });
  await assert.rejects(() => ctx.service.create({ text: 'iOS', send: true }), (e) => e.status === 409);
  const idea = await ctx.service.create({ text: 'iOS' });
  await assert.rejects(() => ctx.service.dispatch(idea.id), (e) => e.status === 409);
  assert.equal(get(ctx, idea.id).status, 'backlog');
});

test('сбой запуска переводит задачу в «ошибка» с понятным текстом, повторная отправка возможна', async () => {
  const ctx = setup();
  ctx.cloud.failure = new TrustRequiredError('/ws');
  const id = await sendTask(ctx);
  assert.equal(get(ctx, id).status, 'failed');
  assert.match(get(ctx, id).events.at(-1).text, /Yes, I trust/);

  ctx.cloud.failure = new CloudError('Сессия не стартовала: сеть');
  await ctx.service.dispatch(id);
  await ctx.service.idle();
  assert.match(get(ctx, id).events.at(-1).text, /сеть/);

  ctx.cloud.failure = null;
  await ctx.service.dispatch(id, { model: 'opus', effort: 'low' });
  await ctx.service.idle();
  assert.equal(get(ctx, id).sessionId, 'session_ABC');
  assert.equal(get(ctx, id).model, 'opus');
});

test('синхронизация: draft-PR значит «в работе», отчёт без draft значит «на проверке», ссылки берутся из комментария', async () => {
  const ctx = setup();
  const id = await sendTask(ctx);
  ctx.github.prs = [openPr()];
  await ctx.service.syncAll();
  assert.equal(get(ctx, id).status, 'running');
  assert.equal(get(ctx, id).pr.number, 3);

  ctx.github.prs = [reviewPr()];
  ctx.github.comments = [{ t: 'x', body: PREVIEW() }];
  await ctx.service.syncAll();
  assert.equal(get(ctx, id).status, 'review');
  assert.equal(get(ctx, id).links.site, 'https://h/p/preview/task-1/');
});

test('доработка: возможна только на проверке, прежний отчёт не возвращает задачу в «на проверке»', async () => {
  const ctx = setup();
  const id = await sendTask(ctx);
  await assert.rejects(() => ctx.service.rework(id, 'правка'), (e) => e.status === 409);

  ctx.github.prs = [reviewPr()];
  await ctx.service.syncAll();
  await assert.rejects(() => ctx.service.rework(id, '  '), DomainError);

  await ctx.service.rework(id, 'цена 300');
  await ctx.service.idle();
  assert.equal(get(ctx, id).status, 'running');
  assert.equal(ctx.calls.followUp[0][0], 'session_ABC');
  assert.match(ctx.calls.followUp[0][1], /цена 300/);

  await ctx.service.syncAll();
  assert.equal(get(ctx, id).status, 'running', 'тот же отчёт не принимается за результат доработки');

  ctx.github.prs = [reviewPr({ body: '## Отчёт\nЦена 300', updatedAt: '2026-10-26T10:10:00Z' })];
  await ctx.service.syncAll();
  assert.equal(get(ctx, id).status, 'review');
});

test('принять: слияние через GitHub; при отказе задача остаётся на проверке', async () => {
  const ctx = setup();
  const id = await sendTask(ctx);
  ctx.github.prs = [reviewPr()];
  await ctx.service.syncAll();

  ctx.github.mergeError = 'есть конфликты';
  await assert.rejects(() => ctx.service.accept(id), (e) => e.status === 409 && /конфликты/.test(e.message));
  assert.equal(get(ctx, id).status, 'review');

  ctx.github.mergeError = null;
  await ctx.service.accept(id);
  assert.equal(get(ctx, id).status, 'done');
  assert.deepEqual(ctx.calls.merge.at(-1), ['o/p', 3]);
});

test('отклонить: PR закрывается, повторное закрытие отказывает', async () => {
  const ctx = setup();
  const id = await sendTask(ctx);
  ctx.github.prs = [reviewPr()];
  await ctx.service.syncAll();
  await ctx.service.close(id);
  assert.equal(get(ctx, id).status, 'closed');
  assert.deepEqual(ctx.calls.close, [['o/p', 3]]);
  await assert.rejects(() => ctx.service.close(id), (e) => e.status === 409);
});

test('закрытие во время запуска: поздняя сессия не оживляет задачу', async () => {
  const ctx = setup();
  let release;
  ctx.cloud.gate = new Promise((resolve) => { release = resolve; });
  const task = await ctx.service.create({ text: 'Раф', send: true });
  await ctx.service.close(task.id);
  release();
  await ctx.service.idle();
  assert.equal(get(ctx, task.id).status, 'closed');
  assert.match(get(ctx, task.id).events.at(-1).text, /остановите сессию/);
});

test('«без проверки»: зелёные тесты вливают сами, красные останавливают один раз', async () => {
  const green = setup();
  const g = await sendTask(green, { auto: true });
  green.github.prs = [reviewPr()];
  green.github.comments = [{ t: 'x', body: PREVIEW('зелёные') }];
  await green.service.syncAll();
  assert.equal(get(green, g).status, 'done');
  assert.equal(green.calls.merge.length, 1);

  const red = setup();
  const r = await sendTask(red, { auto: true });
  red.github.prs = [reviewPr()];
  red.github.comments = [{ t: 'x', body: PREVIEW('КРАСНЫЕ') }];
  await red.service.syncAll();
  await red.service.syncAll();
  assert.equal(get(red, r).status, 'review');
  assert.equal(red.calls.merge.length, 0);
  assert.equal(get(red, r).events.filter((e) => /красные/.test(e.text)).length, 1);
});

test('задача без «без проверки» не вливается сама даже при зелёных тестах', async () => {
  const ctx = setup();
  const id = await sendTask(ctx);
  ctx.github.prs = [reviewPr()];
  ctx.github.comments = [{ t: 'x', body: PREVIEW('зелёные') }];
  await ctx.service.syncAll();
  assert.equal(get(ctx, id).status, 'review');
  assert.equal(ctx.calls.merge.length, 0);
});

test('сбой GitHub при синхронизации запоминается и не ломает остальное', async () => {
  const ctx = setup();
  const id = await sendTask(ctx);
  ctx.github.pullRequests = async () => { throw new Error('нет сети'); };
  await ctx.service.syncAll();
  assert.equal(get(ctx, id).syncError, 'нет сети');
  assert.equal(get(ctx, id).status, 'running');
});

test('отчёт со «СБОЙ:» переводит задачу в «ошибка»', async () => {
  const ctx = setup();
  const id = await sendTask(ctx);
  ctx.github.prs = [openPr({ body: '## Отчёт\nСБОЙ: нет доступа к репозиторию', isDraft: true })];
  await ctx.service.syncAll();
  assert.equal(get(ctx, id).status, 'failed');
});

test('хеш тела PR фиксируется при доработке', async () => {
  const ctx = setup();
  const id = await sendTask(ctx);
  ctx.github.prs = [reviewPr()];
  await ctx.service.syncAll();
  await ctx.service.rework(id, 'правка');
  assert.equal(ctx.service.list().find((t) => t.id === id).reworkBodyHash, hashText('## Отчёт\nГотово'));
});
