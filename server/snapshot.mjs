// Снимок облачных задач репозитория для доски только для чтения на сервере.
// Источник один: PR с заголовком «[#N] …» (так их открывает облачный агент). Запуск в GitHub Actions:
//   node server/snapshot.mjs <владелец/репозиторий> > status.json
import { GitHub } from './github.mjs';
import { STATUS, deriveStatus, parsePreviewComment } from './derive.mjs';

const TAG = /^\[#(\d+)\]\s*/;
const SESSION_URL = /https:\/\/claude\.ai\/code\/session_\w+/;

/** Пункты «Ход работы»: что агент уже сделал. */
export function progressOf(body) {
  return [...(body ?? '').matchAll(/^\s*- \[([ xX])\]\s*(.+)$/gm)].map(([, mark, text]) => ({ text: text.trim(), done: mark.toLowerCase() === 'x' }));
}

const MODEL_ID = /claude-(opus|sonnet|haiku|fable)-(\d+)-(\d+)/i;
const capitalize = (word) => word[0].toUpperCase() + word.slice(1).toLowerCase();

/**
 * Модель из отчёта агента. Агент пишет её по-разному: «Модель: claude-sonnet-5-5 (Sonnet 5.5)»,
 * «Модель: claude-sonnet-5-5», «Модель: Sonnet 5.5». Всё приводится к виду «Sonnet 5.5»; если узнать не удалось, null.
 */
export function modelOf(body) {
  const line = /Модель:\s*(.+)/.exec(body ?? '')?.[1]?.trim();
  if (!line) return null;
  const named = /\b(Opus|Sonnet|Haiku|Fable)\s+(\d+(?:\.\d+)?)/i.exec(line);
  if (named) return `${capitalize(named[1])} ${named[2]}`;
  const id = MODEL_ID.exec(line);
  return id ? `${capitalize(id[1])} ${id[2]}.${id[3]}` : null;
}

function taskOf(pr, extra, projectId) {
  const number = Number(TAG.exec(pr.title)[1]);
  const status = deriveStatus({}, pr);
  const links = [...(extra.comments ?? [])].reverse().map((c) => parsePreviewComment(c.body)).find(Boolean);
  const events = [{ t: pr.createdAt, text: 'PR открыт: агент начал работу.' }];
  if (pr.mergedAt) events.push({ t: pr.mergedAt, text: 'PR влит в staging.' });
  else if (pr.state === 'CLOSED') events.push({ t: pr.closedAt ?? pr.updatedAt, text: 'PR закрыт без слияния.' });
  const prInfo = { number: pr.number, url: pr.url, state: pr.state, updatedAt: pr.updatedAt, body: pr.body, isDraft: pr.isDraft };

  return {
    id: number,
    number,
    projectId,
    title: pr.title.replace(TAG, ''),
    body: '',
    status,
    model: modelOf(pr.body),
    effort: null,
    auto: false,
    createdAt: pr.createdAt,
    sentAt: pr.createdAt,
    events,
    branch: pr.headRefName,
    pr: prInfo,
    links: links ?? null,
    sessionUrl: SESSION_URL.exec(pr.body ?? '')?.[0] ?? null,
    progress: progressOf(pr.body),
    log: { events, commits: extra.commits ?? [], comments: extra.comments ?? [], checks: extra.checks ?? [], pr: prInfo },
  };
}

/**
 * Чистая сборка: список PR и подробности по ним → снимок. Закрытые и влитые задачи входят в хвост истории.
 * @param {{repo: string, prs: object[], extras: Map<number, object>, meta?: object, now?: Date, historyLimit?: number}} input
 */
export function buildSnapshot({ repo, prs, extras, meta = {}, now = new Date(), historyLimit = 8 }) {
  const projectId = repo.split('/')[1];
  const tagged = prs.filter((pr) => TAG.test(pr.title)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const active = tagged.filter((pr) => deriveStatus({}, pr) !== STATUS.DONE && deriveStatus({}, pr) !== STATUS.CLOSED);
  const finished = tagged.filter((pr) => !active.includes(pr)).slice(0, historyLimit);
  const tasks = [...active, ...finished].map((pr) => taskOf(pr, extras.get(pr.number) ?? {}, projectId));
  return { generatedAt: now.toISOString(), repo, project: { id: projectId, title: meta.title ?? projectId, stagingUrl: meta.stagingUrl, prodUrl: meta.prodUrl }, tasks };
}

async function main() {
  const repo = process.argv[2];
  if (!repo?.includes('/')) throw new Error('Использование: node server/snapshot.mjs <владелец/репозиторий>');
  const github = new GitHub();
  const prs = await github.pullRequests(repo);
  const extras = new Map();
  const interesting = prs.filter((pr) => TAG.test(pr.title)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 14);
  for (const pr of interesting) {
    const [details, commits] = await Promise.allSettled([github.details(repo, pr.number), github.commits(repo, pr.headRefName, pr.createdAt)]);
    extras.set(pr.number, { ...(details.value ?? {}), commits: commits.value ?? [] });
  }
  const meta = { title: process.env.PROJECT_TITLE, stagingUrl: process.env.STAGING_URL, prodUrl: process.env.PROD_URL };
  process.stdout.write(`${JSON.stringify(buildSnapshot({ repo, prs, extras, meta }), null, 1)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
