import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { run as defaultRun } from './proc.mjs';

/**
 * Отдельный клон проекта, из которого запускаются облачные сессии. `claude --cloud` берёт ветку из папки,
 * в которой запущен, поэтому рабочая папка разработчика не используется: её ветку и правки доска не трогает.
 */
export class DispatchWorkspace {
  #root;
  #run;

  constructor({ root, run = defaultRun }) {
    this.#root = root;
    this.#run = run;
  }

  dirOf(project) {
    return join(this.#root, project.id);
  }

  async prepare(project) {
    const dir = this.dirOf(project);
    const base = project.baseBranch ?? 'staging';
    if (!existsSync(join(dir, '.git'))) {
      await this.#run('gh', ['repo', 'clone', project.repo, dir, '--', '--branch', base]);
    } else {
      const git = (...args) => this.#run('git', ['-C', dir, ...args]);
      await git('fetch', '--quiet', 'origin');
      await git('checkout', '--quiet', base);
      await git('reset', '--quiet', '--hard', `origin/${base}`);
    }
    return dir;
  }
}
