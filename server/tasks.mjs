import { CloudError, TrustRequiredError, sessionUrl } from './claude.mjs';
import { findProject, isCloudAllowed } from './config.mjs';
import {
  STATUS, autoDecision, deriveStatus, dispatchPrompt, hashText, matchPullRequest, parsePreviewComment, reworkPrompt, titleFromText,
} from './derive.mjs';

/** Ошибка, которую можно показать пользователю как есть. status это HTTP-код ответа. */
export class DomainError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'DomainError';
    this.status = status;
  }
}

const ACTIVE = new Set([STATUS.RUNNING, STATUS.REVIEW]);
const FINISHED = new Set([STATUS.DONE, STATUS.CLOSED]);
const CLOUD_UNAVAILABLE = 'Для этого проекта облако недоступно: задача остаётся в идеях.';
const TRANSITION_NOTE = {
  [STATUS.REVIEW]: 'Готово к проверке: PR открыт для ревью.',
  [STATUS.FAILED]: 'Агент сообщил о сбое.',
  [STATUS.RUNNING]: 'Работа продолжается.',
  [STATUS.DONE]: 'PR влит.',
  [STATUS.CLOSED]: 'PR закрыт.',
};

const view = ({ project, ...task }) => ({ ...task, projectId: project });
const pick = (items, id, fallback) => (items.some((i) => i.id === id) ? id : fallback);

function describeFailure(error) {
  if (error instanceof TrustRequiredError) return `${error.message} Папка: ${error.dir}`;
  if (error instanceof CloudError) return error.message;
  return `Не удалось отправить: ${error.message}`;
}

/**
 * Жизненный цикл задач: backlog → running → review → done (или failed, closed).
 * Действия пользователя и синхронизация с GitHub идут через замок на задачу, поэтому не перебивают друг друга.
 * Долгие операции (запуск облачной сессии, доставка правки) выполняются в фоне: ответ приходит сразу,
 * итог попадает в задачу, когда готов.
 */
export class TaskService {
  #store;
  #github;
  #cloud;
  #workspace;
  #config;
  #locks = new Map();
  #pending = new Set();

  constructor({ store, github, cloud, workspace, config }) {
    this.#store = store;
    this.#github = github;
    this.#cloud = cloud;
    this.#workspace = workspace;
    this.#config = config;
  }

  list() {
    return this.#store.list().map(view);
  }

  /** Ждёт завершения фоновых операций (нужно тестам и корректному выходу). */
  async idle() {
    await Promise.allSettled([...this.#pending]);
  }

  async create({ project: projectId, text, model, effort, auto = false, send = false }) {
    const project = findProject(this.#config, projectId ?? this.#config.projects[0].id);
    if (!project) throw new DomainError('Проект не найден.', 404);
    const body = String(text ?? '').trim();
    if (!body) throw new DomainError('Опишите задачу.');
    if (send && !isCloudAllowed(project)) throw new DomainError(CLOUD_UNAVAILABLE, 409);

    const task = this.#store.create({
      project: project.id,
      title: titleFromText(body),
      body,
      model: pick(this.#config.models, model, this.#config.defaultModel),
      effort: pick(this.#config.efforts, effort, this.#config.defaultEffort),
      auto: Boolean(auto) && project.cloud.autoAllowed,
      status: STATUS.BACKLOG,
    });
    this.#store.event(task, 'Задача создана.');
    if (send) this.#startDispatch(task);
    return view(task);
  }

  dispatch(id, { model, effort } = {}) {
    return this.#lock(id, () => {
      const task = this.#task(id);
      if (task.status !== STATUS.BACKLOG && task.status !== STATUS.FAILED) throw new DomainError('Отправить можно задачу из идей или с ошибкой.', 409);
      if (!isCloudAllowed(this.#project(task))) throw new DomainError(CLOUD_UNAVAILABLE, 409);
      task.model = pick(this.#config.models, model, task.model);
      task.effort = pick(this.#config.efforts, effort, task.effort);
      this.#startDispatch(task);
      return view(task);
    });
  }

  rework(id, text) {
    return this.#lock(id, () => {
      const task = this.#task(id);
      if (task.status !== STATUS.REVIEW) throw new DomainError('Доработка возможна только для задачи на проверке.', 409);
      const note = String(text ?? '').trim();
      if (!note) throw new DomainError('Напишите, что исправить.');
      if (!task.sessionId) throw new DomainError('У задачи нет облачной сессии для правки: отправьте её заново.', 409);
      task.reworkBodyHash = hashText(task.pr?.body);
      delete task.autoBlocked;
      task.status = STATUS.RUNNING;
      this.#store.event(task, `Доработка: ${note}`);
      this.#track(this.#deliverRework(task.id, note));
      return view(task);
    });
  }

  accept(id) {
    return this.#lock(id, async () => {
      const task = this.#task(id);
      if (task.status !== STATUS.REVIEW) throw new DomainError('Принять можно только задачу на проверке.', 409);
      await this.#merge(task);
      return view(task);
    });
  }

  close(id) {
    return this.#lock(id, async () => {
      const task = this.#task(id);
      if (FINISHED.has(task.status)) throw new DomainError('Задача уже закрыта.', 409);
      if (task.pr?.state === 'OPEN') {
        try {
          await this.#github.close(this.#project(task).repo, task.pr.number);
        } catch (error) {
          this.#store.event(task, `PR закрыть не удалось: ${error.message}`);
        }
      }
      task.status = STATUS.CLOSED;
      this.#store.event(task, 'Закрыто без выполнения.');
      return view(task);
    });
  }

  /** Ход работы: события доски, коммиты ветки, комментарии и проверки PR. */
  async log(id) {
    const task = this.#task(id);
    const out = { events: task.events, commits: [], comments: [], checks: [], pr: task.pr ?? null };
    if (!task.branch) return out;
    const repo = this.#project(task).repo;
    const [commits, details] = await Promise.allSettled([
      this.#github.commits(repo, task.branch, task.sentAt),
      task.pr ? this.#github.details(repo, task.pr.number) : Promise.resolve(null),
    ]);
    if (commits.status === 'fulfilled') out.commits = commits.value;
    if (details.status === 'fulfilled' && details.value) Object.assign(out, details.value);
    return out;
  }

  /** Подтягивает состояние задач из GitHub: один запрос списка PR на репозиторий. */
  async syncAll() {
    const active = this.#store.list().filter((t) => ACTIVE.has(t.status));
    const lists = new Map();
    for (const task of active) {
      const repo = findProject(this.#config, task.project)?.repo;
      if (repo && !lists.has(repo)) lists.set(repo, await this.#github.pullRequests(repo).catch((error) => error));
    }
    for (const task of active) {
      const project = findProject(this.#config, task.project);
      const prs = lists.get(project?.repo);
      if (!Array.isArray(prs)) {
        if (prs) task.syncError = prs.message;
        continue;
      }
      await this.#lock(task.id, () => this.#sync(task, project, prs));
    }
  }

  // ---------- внутреннее ----------

  #task(id) {
    const task = this.#store.get(id);
    if (!task) throw new DomainError('Задача не найдена.', 404);
    return task;
  }

  #project(task) {
    const project = findProject(this.#config, task.project);
    if (!project) throw new DomainError(`Проект «${task.project}» не найден в config.json.`, 409);
    return project;
  }

  #lock(id, fn) {
    const previous = this.#locks.get(id) ?? Promise.resolve();
    const next = previous.then(fn);
    this.#locks.set(id, next.catch(() => {}));
    return next;
  }

  #track(promise) {
    const tracked = promise.catch(() => {}).finally(() => this.#pending.delete(tracked));
    this.#pending.add(tracked);
  }

  #startDispatch(task) {
    for (const key of ['sessionId', 'sessionUrl', 'pr', 'links', 'branch', 'reworkBodyHash', 'autoBlocked']) delete task[key];
    task.status = STATUS.RUNNING;
    task.sentAt = new Date().toISOString();
    this.#store.event(task, `Отправка в облако, модель: ${task.model}, усилие: ${task.effort}…`);
    this.#track(this.#launch(task.id));
  }

  async #launch(id) {
    const task = this.#task(id);
    let session;
    let failure;
    try {
      const dir = await this.#workspace.prepare(this.#project(task));
      session = await this.#cloud.dispatch({ dir, prompt: dispatchPrompt(task), model: task.model, effort: task.effort });
    } catch (error) {
      failure = error;
    }
    await this.#lock(id, () => {
      if (task.status !== STATUS.RUNNING) {
        if (session) this.#store.event(task, `Облачная сессия ${sessionUrl(session.sessionId)} запущена, но задача уже закрыта: остановите сессию на claude.ai.`);
        return;
      }
      if (failure) {
        task.status = STATUS.FAILED;
        this.#store.event(task, describeFailure(failure));
        return;
      }
      task.sessionId = session.sessionId;
      task.sessionUrl = sessionUrl(session.sessionId);
      this.#store.event(task, `Облачная сессия запущена: ${task.sessionUrl}${session.warning ? ` (${session.warning})` : ''}`);
    });
  }

  async #deliverRework(id, note) {
    const task = this.#task(id);
    try {
      await this.#cloud.followUp(task.sessionId, reworkPrompt(task, note));
      this.#store.event(task, 'Правка отправлена в ту же облачную сессию.');
    } catch (error) {
      await this.#lock(id, () => {
        task.status = STATUS.FAILED;
        this.#store.event(task, describeFailure(error));
      });
    }
  }

  async #merge(task) {
    if (!task.pr) throw new DomainError('У задачи нет PR.', 409);
    try {
      await this.#github.merge(this.#project(task).repo, task.pr.number);
    } catch (error) {
      throw new DomainError(`GitHub не принял слияние: ${error.message}`, 409);
    }
    task.status = STATUS.DONE;
    this.#store.event(task, 'PR влит в staging.');
  }

  async #sync(task, project, prs) {
    if (!ACTIVE.has(task.status)) return;
    const pr = matchPullRequest(task, prs);
    if (!pr) return;

    const changed = task.pr?.updatedAt !== pr.updatedAt;
    task.pr = pr;
    task.branch = pr.headRefName;
    delete task.syncError;
    if (changed || !task.links) await this.#refreshLinks(task, project);

    const next = deriveStatus(task, pr);
    if (next !== task.status) {
      task.status = next;
      if (next === STATUS.REVIEW) delete task.reworkBodyHash;
      this.#store.event(task, TRANSITION_NOTE[next]);
    } else {
      this.#store.save();
    }
    await this.#applyAutoPolicy(task);
  }

  async #refreshLinks(task, project) {
    try {
      const { comments } = await this.#github.details(project.repo, task.pr.number);
      const links = [...comments].reverse().map((c) => parsePreviewComment(c.body)).find(Boolean);
      if (links) task.links = links;
    } catch {
      // комментарий появится позже: повторим на следующем цикле
    }
  }

  async #applyAutoPolicy(task) {
    const decision = autoDecision(task);
    if (decision === 'accept') {
      this.#store.event(task, 'Режим «без проверки»: тесты зелёные, вливаю в staging.');
      try {
        await this.#merge(task);
      } catch (error) {
        task.auto = false;
        this.#store.event(task, `${error.message} Автоматический влив отключён, нужна ваша проверка.`);
      }
    } else if (decision === 'block' && !task.autoBlocked) {
      task.autoBlocked = true;
      this.#store.event(task, 'Тесты красные: автоматический влив отменён, нужна ваша проверка.');
    }
  }
}
