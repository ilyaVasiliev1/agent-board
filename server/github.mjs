import { run as defaultRun, runJson as defaultRunJson } from './proc.mjs';

const PR_FIELDS = 'number,url,state,isDraft,body,mergedAt,updatedAt,title,headRefName,headRefOid';

// Результат проверки приводится к одному виду: у check run и у status поля называются по-разному.
const normalizeCheck = (c) => ({ name: c.name ?? c.context, result: (c.conclusion || c.status || c.state || '').toUpperCase() });

/** Тонкая обёртка над gh: вся работа с GitHub идёт через токен, уже выданный CLI на этом Маке. */
export class GitHub {
  #run;
  #runJson;

  constructor({ run = defaultRun, runJson = defaultRunJson } = {}) {
    this.#run = run;
    this.#runJson = runJson;
  }

  pullRequests(repo) {
    return this.#runJson('gh', ['pr', 'list', '-R', repo, '--state', 'all', '--limit', '100', '--json', PR_FIELDS]);
  }

  async details(repo, number) {
    const view = await this.#runJson('gh', ['pr', 'view', String(number), '-R', repo, '--json', 'comments,statusCheckRollup']);
    return {
      comments: view.comments.map((c) => ({ t: c.createdAt, body: c.body })),
      checks: (view.statusCheckRollup ?? []).map(normalizeCheck),
    };
  }

  async commits(repo, branch, since) {
    const query = `sha=${encodeURIComponent(branch)}&per_page=30${since ? `&since=${encodeURIComponent(since)}` : ''}`;
    const commits = await this.#runJson('gh', ['api', `repos/${repo}/commits?${query}`]);
    return commits.map((c) => ({ t: c.commit.author.date, text: c.commit.message.split('\n')[0] }));
  }

  merge(repo, number) {
    return this.#run('gh', ['pr', 'merge', String(number), '-R', repo, '--squash']);
  }

  close(repo, number) {
    return this.#run('gh', ['pr', 'close', String(number), '-R', repo, '--delete-branch']);
  }
}
