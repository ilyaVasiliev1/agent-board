// Локальная доска агентов. Запуск: node server/index.mjs (порт 5194 или PORT).
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClaudeCloud } from './claude.mjs';
import { loadConfig } from './config.mjs';
import { GitHub } from './github.mjs';
import { createHttpServer } from './http.mjs';
import { TaskStore } from './store.mjs';
import { TaskService } from './tasks.mjs';
import { DispatchWorkspace } from './workspace.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.PORT ?? 5194);
const SYNC_INTERVAL_MS = 20_000;

const config = loadConfig(ROOT);
const WEB_ROOT = join(ROOT, 'dist');
if (!existsSync(join(WEB_ROOT, 'index.html'))) console.warn('Интерфейс не собран: выполните npm run build (или запускайте через npm start).');
const service = new TaskService({
  store: new TaskStore(join(ROOT, 'data', 'tasks.json')),
  github: new GitHub(),
  cloud: new ClaudeCloud(),
  workspace: new DispatchWorkspace({ root: join(ROOT, 'data', 'dispatch') }),
  config,
});
const server = createHttpServer({ service, config, webRoot: WEB_ROOT, port: PORT });

// Синхронизация идёт цепочкой таймеров, а не интервалом: следующий цикл не начнётся, пока не закончился предыдущий.
let timer;
async function syncLoop() {
  try {
    await service.syncAll();
  } catch (error) {
    console.error('Синхронизация с GitHub не удалась:', error.message);
  }
  timer = setTimeout(syncLoop, SYNC_INTERVAL_MS);
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Доска: http://localhost:${PORT}`);
  syncLoop();
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    clearTimeout(timer);
    server.close();
    await service.idle();
    process.exit(0);
  });
}
