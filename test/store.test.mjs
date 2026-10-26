import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { TaskStore } from '../server/store.mjs';

const tmp = () => join(mkdtempSync(join(tmpdir(), 'board-store-')), 'tasks.json');

test('задачи переживают перезапуск и нумеруются подряд', () => {
  const file = tmp();
  const store = new TaskStore(file);
  const a = store.create({ project: 'p', title: 'a', status: 'backlog' });
  const b = store.create({ project: 'p', title: 'b', status: 'backlog' });
  store.event(b, 'событие');
  assert.deepEqual([a.id, b.id], [1, 2]);

  const again = new TaskStore(file);
  assert.equal(again.list().length, 2);
  assert.equal(again.get(2).events[0].text, 'событие');
});

test('запись идёт через временный файл и не оставляет его', () => {
  const file = tmp();
  new TaskStore(file).create({ project: 'p', title: 'a', status: 'backlog' });
  assert.ok(existsSync(file));
  assert.ok(!existsSync(`${file}.tmp`));
  assert.doesNotThrow(() => JSON.parse(readFileSync(file, 'utf8')));
});

test('задачи старой формы приводятся к текущей', () => {
  const file = tmp();
  writeFileSync(file, JSON.stringify([{ id: 3, project: 'p', title: 't', status: 'running', bodyAtRework: 'abc' }]));
  const task = new TaskStore(file).get(3);
  assert.equal(task.reworkBodyHash, 'abc');
  assert.equal(task.bodyAtRework, undefined);
  assert.deepEqual(task.events, []);
  assert.equal(task.auto, false);
});
