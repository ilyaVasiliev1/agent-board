import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSnapshot, modelOf, progressOf } from '../server/snapshot.mjs';

const pr = (n, over = {}) => ({
  number: n, url: `https://github.com/o/r/pull/${n}`, title: `[#${n}] Задача ${n}`, state: 'OPEN', isDraft: true, mergedAt: null, closedAt: null,
  createdAt: '2026-10-26T10:00:00Z', updatedAt: `2026-10-26T10:0${n}:00Z`, headRefName: 'claude/x', body: '## Ход работы\n- [x] ветка\n- [ ] тесты', ...over,
});

test('из тела PR берутся пункты хода работы и модель', () => {
  assert.deepEqual(progressOf('- [x] ветка\n- [ ] тесты'), [{ text: 'ветка', done: true }, { text: 'тесты', done: false }]);
  assert.equal(modelOf('## Отчёт\nМодель: claude-sonnet-5-5 (Sonnet 5.5)\nготово'), 'Sonnet 5.5');
  assert.equal(modelOf('Модель: claude-sonnet-5-5'), 'Sonnet 5.5');
  assert.equal(modelOf('Модель: Opus 5.5'), 'Opus 5.5');
  assert.equal(modelOf('Модель: в тело не вписываю по правилам сессии'), null);
  assert.equal(modelOf('без модели'), null);
});

test('снимок: активные задачи первыми, PR без тега игнорируются, состояния выводятся из PR', () => {
  const prs = [
    pr(1, { mergedAt: '2026-10-26T11:00:00Z', state: 'MERGED', isDraft: false, body: '## Отчёт\nok' }),
    pr(2),
    pr(3, { isDraft: false, body: '## Отчёт\nМодель: x (Opus 5.5)\nготово\nhttps://claude.ai/code/session_ABC' }),
    { ...pr(4), title: 'просто PR без тега' },
  ];
  const extras = new Map([[3, { comments: [{ t: 'x', body: '## Превью\n- Сайт: https://h/p/preview/task-3/\n- Тесты в облаке: зелёные' }], checks: [], commits: [{ t: 'x', text: 'коммит' }] }]]);
  const snap = buildSnapshot({ repo: 'o/r', prs, extras, now: new Date('2026-10-26T12:00:00Z'), meta: { stagingUrl: 'http://s:8080/' } });

  assert.equal(snap.project.id, 'r');
  assert.equal(snap.project.stagingUrl, 'http://s:8080/');
  assert.deepEqual(snap.tasks.map((t) => [t.id, t.status]), [[3, 'review'], [2, 'running'], [1, 'done']]);
  const t3 = snap.tasks[0];
  assert.equal(t3.model, 'Opus 5.5');
  assert.equal(t3.sessionUrl, 'https://claude.ai/code/session_ABC');
  assert.equal(t3.links.site, 'https://h/p/preview/task-3/');
  assert.equal(t3.links.tests, 'зелёные');
  assert.equal(t3.log.commits.length, 1);
  assert.equal(snap.tasks[1].progress.length, 2);
});

test('история ограничена, активные не вытесняются', () => {
  const finished = Array.from({ length: 12 }, (_, i) => pr(i + 10, { state: 'CLOSED', isDraft: false }));
  const snap = buildSnapshot({ repo: 'o/r', prs: [pr(1), ...finished], extras: new Map(), historyLimit: 5 });
  assert.equal(snap.tasks.length, 6);
  assert.equal(snap.tasks[0].id, 1);
});
