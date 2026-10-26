import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STATUS, autoDecision, deriveStatus, dispatchPrompt, hashText, matchPullRequest, parsePreviewComment, titleFromText } from '../server/derive.mjs';

const pr = (over = {}) => ({ title: '[#6] Раф', headRefName: 'claude/menu-raf-x1', state: 'OPEN', isDraft: false, mergedAt: null, body: '## Отчёт\nГотово', updatedAt: '2026-10-26T10:00:00Z', ...over });

test('заголовок карточки это первая непустая строка без решёток', () => {
  assert.equal(titleFromText('\n\n## Раздел «О нас»\nподробности'), 'Раздел «О нас»');
  assert.equal(titleFromText('x'.repeat(300)).length, 100);
});

test('промпт содержит номер задачи, текст и контракт заголовка PR', () => {
  const text = dispatchPrompt({ id: 7, title: 'Заг', body: 'Заг\nподробности' });
  assert.match(text, /Задача #7/);
  assert.match(text, /подробности/);
  assert.match(text, /\[#7\]/);
});

test('PR находится по заголовку, имя ветки не важно', () => {
  const prs = [pr({ title: '[#5] Другое', updatedAt: 'a' }), pr({ title: '[#6] Раф', updatedAt: 'b' })];
  assert.equal(matchPullRequest({ id: 6 }, prs).title, '[#6] Раф');
  assert.equal(matchPullRequest({ id: 9 }, prs), null);
});

test('из нескольких PR берётся последний обновлённый, а [#1] не путается с [#10]', () => {
  const prs = [pr({ title: '[#10] x', updatedAt: '2' }), pr({ title: '[#1] y', updatedAt: '1' })];
  assert.equal(matchPullRequest({ id: 1 }, prs).title, '[#1] y');
});

test('запасной поиск по ветке claude/task-N с хвостом', () => {
  const prs = [pr({ title: 'без тега', headRefName: 'claude/task-4-ab12' })];
  assert.ok(matchPullRequest({ id: 4 }, prs));
  assert.equal(matchPullRequest({ id: 40 }, prs), null);
});

test('состояние выводится из PR', () => {
  const task = {};
  assert.equal(deriveStatus(task, pr({ mergedAt: '2026-10-26' })), STATUS.DONE);
  assert.equal(deriveStatus(task, pr({ state: 'CLOSED' })), STATUS.CLOSED);
  assert.equal(deriveStatus(task, pr({ body: '## Ход работы\n- [x] код', isDraft: true })), STATUS.RUNNING);
  assert.equal(deriveStatus(task, pr({ body: '## Отчёт\nСБОЙ: нет доступа' })), STATUS.FAILED);
  assert.equal(deriveStatus(task, pr({ isDraft: true })), STATUS.RUNNING);
  assert.equal(deriveStatus(task, pr()), STATUS.REVIEW);
});

test('после доработки прежний отчёт не считается готовым результатом', () => {
  const body = '## Отчёт\nПервая версия';
  const task = { reworkBodyHash: hashText(body) };
  assert.equal(deriveStatus(task, pr({ body })), STATUS.RUNNING);
  assert.equal(deriveStatus(task, pr({ body: '## Отчёт\nИсправлено' })), STATUS.REVIEW);
});

test('комментарий превью разбирается на ссылки', () => {
  const links = parsePreviewComment([
    '## Превью',
    '- Сайт: https://x.github.io/app/preview/task-6/',
    '- Отчёт тестов со скриншотами: https://x.github.io/app/preview/task-6-report/',
    '- Скриншот (компьютер): https://x.github.io/app/preview/task-6-shots/desktop.png',
    '- Скриншот (телефон): https://x.github.io/app/preview/task-6-shots/mobile.png',
    '- Тесты в облаке: зелёные',
  ].join('\n'));
  assert.equal(links.site, 'https://x.github.io/app/preview/task-6/');
  assert.equal(links.mobile, 'https://x.github.io/app/preview/task-6-shots/mobile.png');
  assert.equal(links.tests, 'зелёные');
  assert.equal(parsePreviewComment('просто комментарий'), null);
});

test('режим «без проверки» решает по тестам', () => {
  const base = { status: STATUS.REVIEW, auto: true };
  assert.equal(autoDecision({ ...base, links: { tests: 'зелёные' } }), 'accept');
  assert.equal(autoDecision({ ...base, links: { tests: 'КРАСНЫЕ' } }), 'block');
  assert.equal(autoDecision({ ...base }), 'wait');
  assert.equal(autoDecision({ ...base, auto: false, links: { tests: 'зелёные' } }), 'none');
  assert.equal(autoDecision({ status: STATUS.RUNNING, auto: true, links: { tests: 'зелёные' } }), 'none');
});
