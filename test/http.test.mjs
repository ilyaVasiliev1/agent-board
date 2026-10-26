import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { createHttpServer } from '../server/http.mjs';
import { DomainError } from '../server/tasks.mjs';

const calls = [];
const service = {
  list: () => [{ id: 1, title: 'a' }],
  create: async (body) => { if (!body.text) throw new DomainError('Опишите задачу.'); calls.push(['create', body]); return { id: 2 }; },
  dispatch: async (id, body) => { calls.push(['send', id, body]); return { id: Number(id) }; },
  rework: async (id, text) => { calls.push(['rework', id, text]); return { id: Number(id) }; },
  accept: async (id) => { calls.push(['accept', id]); return { id: Number(id) }; },
  close: async (id) => { calls.push(['close', id]); return { id: Number(id) }; },
  log: async (id) => ({ events: [], id }),
};

let server;
let port;
let webRoot;

const freePort = () => new Promise((resolve) => {
  const probe = createServer().listen(0, '127.0.0.1', () => { const { port: p } = probe.address(); probe.close(() => resolve(p)); });
});

function request(path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers: { host: `localhost:${port}`, ...headers } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, text: data, json: () => JSON.parse(data), type: res.headers['content-type'] }));
    });
    req.on('error', reject);
    req.end(body);
  });
}
const post = (path, payload, headers = { 'content-type': 'application/json' }) => request(path, { method: 'POST', headers, body: typeof payload === 'string' ? payload : JSON.stringify(payload) });

before(async () => {
  webRoot = mkdtempSync(join(tmpdir(), 'board-web-'));
  writeFileSync(join(webRoot, 'index.html'), '<h1>доска</h1>');
  mkdirSync(join(webRoot, 'js'));
  writeFileSync(join(webRoot, 'js', 'main.js'), 'export {};');
  port = await freePort();
  server = createHttpServer({ service, config: { projects: [] }, webRoot, port });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
});
after(() => server.close());

test('режим: сервер доски отвечает «live»', async () => {
  assert.deepEqual((await request('/mode.json')).json(), { mode: 'live' });
});

test('состояние и конфиг отдаются', async () => {
  assert.equal((await request('/api/state')).json().tasks[0].title, 'a');
  assert.deepEqual((await request('/config.json')).json(), { projects: [] });
});

test('статика: главная и модули с правильными типами', async () => {
  const index = await request('/');
  assert.equal(index.status, 200);
  assert.match(index.type, /text\/html/);
  assert.match((await request('/js/main.js')).type, /javascript/);
});

test('чужой Host отклоняется', async () => {
  const res = await request('/api/state', { headers: { host: 'evil.example:80' } });
  assert.equal(res.status, 403);
});

test('изменяющие запросы принимают только JSON', async () => {
  assert.equal((await post('/api/tasks', 'text=x', { 'content-type': 'application/x-www-form-urlencoded' })).status, 415);
  assert.equal((await post('/api/tasks', '{не json')).status, 400);
});

test('действия над задачей доходят до сервиса с параметрами', async () => {
  assert.equal((await post('/api/tasks', { text: 'Раф' })).status, 200);
  await post('/api/tasks/7/send', { model: 'opus' });
  await post('/api/tasks/7/rework', { text: 'правка' });
  await post('/api/tasks/7/accept', {});
  await post('/api/tasks/7/close', {});
  assert.deepEqual(calls.map((c) => c[0]), ['create', 'send', 'rework', 'accept', 'close']);
  assert.deepEqual(calls[1], ['send', '7', { model: 'opus' }]);
  assert.deepEqual(calls[2], ['rework', '7', 'правка']);
});

test('ошибки предметной области возвращаются как есть', async () => {
  const res = await post('/api/tasks', {});
  assert.equal(res.status, 400);
  assert.equal(res.json().error, 'Опишите задачу.');
});

test('нет такого адреса и нет выхода за каталог статики', async () => {
  assert.equal((await request('/api/missing')).status, 404);
  assert.equal((await request('/..%2f..%2fserver%2findex.mjs')).status, 404);
  assert.equal((await request('/%2e%2e/%2e%2e/etc/passwd')).status, 404);
  assert.equal((await post('/api/state', {})).status, 404);
});
