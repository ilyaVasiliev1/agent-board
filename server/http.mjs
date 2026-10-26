import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { DomainError } from './tasks.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json',
};
const MAX_BODY = 1_000_000;

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new DomainError('Слишком большой запрос.', 413);
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new DomainError('Некорректный JSON.');
  }
}

/**
 * HTTP-слой: маршруты, защита и статика. Слушает только 127.0.0.1.
 * Защита от чужих сайтов: проверка Host (DNS rebinding) и обязательный JSON в изменяющих запросах,
 * который браузер не отправит с чужой страницы без предварительного запроса, а CORS здесь не разрешён.
 */
export function createHttpServer({ service, config, webRoot, port }) {
  const hosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
  const root = resolve(webRoot);

  const routes = [
    ['GET', /^\/api\/state$/, async () => ({ tasks: service.list(), at: new Date().toISOString() })],
    ['GET', /^\/config\.json$/, async () => config],
    ['POST', /^\/api\/tasks$/, async ({ body }) => service.create(body)],
    ['GET', /^\/api\/tasks\/(\d+)\/log$/, async ({ params }) => service.log(params[0])],
    ['POST', /^\/api\/tasks\/(\d+)\/(send|rework|accept|close)$/, async ({ params, body }) => {
      const [id, action] = params;
      if (action === 'send') return service.dispatch(id, body);
      if (action === 'rework') return service.rework(id, body.text);
      if (action === 'accept') return service.accept(id);
      return service.close(id);
    }],
  ];

  async function serveStatic(pathname, res) {
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = resolve(join(root, relative));
    if (file !== root && !file.startsWith(root + sep)) throw new DomainError('Нет такого файла.', 404);
    try {
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    } catch {
      throw new DomainError('Нет такого файла.', 404);
    }
  }

  return http.createServer(async (req, res) => {
    const json = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    };
    try {
      if (!hosts.has(req.headers.host)) throw new DomainError('Неверный адрес обращения.', 403);
      const { pathname } = new URL(req.url, 'http://localhost');
      for (const [method, pattern, handler] of routes) {
        const match = method === req.method && pattern.exec(pathname);
        if (!match) continue;
        if (method !== 'GET' && !String(req.headers['content-type']).startsWith('application/json')) {
          throw new DomainError('Тело запроса должно быть JSON.', 415);
        }
        const body = method === 'GET' ? {} : await readJson(req);
        return json(200, await handler({ params: match.slice(1), body }));
      }
      if (req.method === 'GET' && !pathname.startsWith('/api/')) return await serveStatic(pathname, res);
      throw new DomainError('Нет такого адреса.', 404);
    } catch (error) {
      if (error instanceof DomainError) return json(error.status, { error: error.message });
      console.error(error);
      return json(500, { error: error.message });
    }
  });
}
