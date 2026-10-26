// Чистые функции без ввода-вывода: из них состоит вся логика состояний, и их проверяют тесты.
import { createHash } from 'node:crypto';

export const STATUS = Object.freeze({
  BACKLOG: 'backlog',
  RUNNING: 'running',
  REVIEW: 'review',
  FAILED: 'failed',
  DONE: 'done',
  CLOSED: 'closed',
});

export const hashText = (text) => createHash('sha1').update(text ?? '').digest('hex');

/** Заголовок карточки это первая непустая строка задачи без markdown-решёток. */
export function titleFromText(text) {
  const first = text.split('\n').find((line) => line.trim()) ?? text;
  return first.replace(/^#+\s*/, '').trim().slice(0, 100);
}

/** Текст, который уходит в облако: задача плюс контракт исполнителя. */
export function dispatchPrompt(task) {
  return [
    `Ты исполнитель доски задач. Задача #${task.id}:`,
    task.body || task.title,
    '',
    'Выполни протокол из .agent/PROTOCOL.md: draft PR сразу с заголовком «[#' + task.id + '] …», ход работы в теле PR, отчёт в конце.',
  ].join('\n');
}

export function reworkPrompt(task, text) {
  return `Доработка по задаче #${task.id}: ${text}\nВерни PR в draft, поправь, прогони тесты, обнови «## Отчёт» и снова сделай PR готовым к ревью.`;
}

/**
 * PR задачи находится по заголовку «[#N] …»: имя ветки облако назначает само.
 * Запасной признак для старых задач: ветка claude/task-N с любым хвостом.
 */
export function matchPullRequest(task, pullRequests) {
  const tag = `[#${task.id}]`;
  const legacy = `claude/task-${task.id}`;
  return pullRequests
    .filter((pr) => pr.title.startsWith(tag) || pr.headRefName === legacy || pr.headRefName.startsWith(`${legacy}-`))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
}

/** Ссылки из комментария workflow «## Превью» в PR. */
export function parsePreviewComment(body) {
  if (!body?.startsWith('## Превью')) return null;
  const pick = (label) => new RegExp(`${label}:\\s*(https?://\\S+)`).exec(body)?.[1];
  return {
    site: pick('Сайт'),
    report: pick('Отчёт тестов со скриншотами'),
    desktop: pick('Скриншот \\(компьютер\\)'),
    mobile: pick('Скриншот \\(телефон\\)'),
    tests: /Тесты в облаке: (\S+)/.exec(body)?.[1],
  };
}

/**
 * Состояние выводится из PR: draft и «Ход работы» значит агент работает, «## Отчёт» без draft значит
 * готово к проверке, «СБОЙ:» значит сбой. После доработки отчёт считается новым, только когда тело PR
 * изменилось (иначе вернулся бы прежний отчёт).
 */
export function deriveStatus(task, pr) {
  if (pr.mergedAt) return STATUS.DONE;
  if (pr.state === 'CLOSED') return STATUS.CLOSED;
  const hasReport = pr.body?.startsWith('## Отчёт') ?? false;
  if (hasReport && /(^|\n)СБОЙ:/.test(pr.body)) return STATUS.FAILED;
  const fresh = !task.reworkBodyHash || hashText(pr.body) !== task.reworkBodyHash;
  if (hasReport && !pr.isDraft && fresh) return STATUS.REVIEW;
  return STATUS.RUNNING;
}

export const TEST_RESULT = Object.freeze({ GREEN: 'зелёные', RED: 'КРАСНЫЕ' });

/** Режим «без проверки»: влив разрешён, только если задача его просила и тесты в облаке зелёные. */
export function autoDecision(task) {
  if (task.status !== STATUS.REVIEW || !task.auto) return 'none';
  if (task.links?.tests === TEST_RESULT.GREEN) return 'accept';
  if (task.links?.tests === TEST_RESULT.RED) return 'block';
  return 'wait';
}
