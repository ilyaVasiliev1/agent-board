import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * @typedef {object} Task
 * @property {number} id
 * @property {string} project
 * @property {string} title
 * @property {string} body          весь текст, написанный пользователем
 * @property {string} model
 * @property {string} effort
 * @property {boolean} auto         влить без проверки при зелёных тестах
 * @property {'backlog'|'running'|'review'|'failed'|'done'|'closed'} status
 * @property {string} createdAt
 * @property {{t: string, text: string}[]} events
 */

// Задачи, созданные ранними версиями доски, приводятся к текущей форме при загрузке.
function normalize(task) {
  const out = { auto: false, events: [], ...task };
  if ('bodyAtRework' in out) {
    out.reworkBodyHash = out.bodyAtRework;
    delete out.bodyAtRework;
  }
  return out;
}

export class TaskStore {
  #file;
  #tasks;

  constructor(file) {
    this.#file = file;
    this.#tasks = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).map(normalize) : [];
  }

  list() {
    return this.#tasks;
  }

  get(id) {
    return this.#tasks.find((t) => t.id === Number(id)) ?? null;
  }

  create(fields) {
    const id = Math.max(0, ...this.#tasks.map((t) => t.id)) + 1;
    const task = normalize({ id, createdAt: new Date().toISOString(), ...fields });
    this.#tasks.push(task);
    this.save();
    return task;
  }

  event(task, text) {
    task.events.push({ t: new Date().toISOString(), text });
    this.save();
  }

  /** Запись через временный файл и переименование: сбой посреди записи не портит tasks.json. */
  save() {
    mkdirSync(dirname(this.#file), { recursive: true });
    const tmp = `${this.#file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.#tasks, null, 2));
    renameSync(tmp, this.#file);
  }
}
