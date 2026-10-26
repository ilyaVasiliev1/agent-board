import { fileURLToPath } from 'node:url';
import { run as defaultRun } from './proc.mjs';

const PTY_SCRIPT = fileURLToPath(new URL('./pty-dispatch.py', import.meta.url));

export class TrustRequiredError extends Error {
  constructor(dir) {
    super(`Claude просит подтвердить доверие к папке: откройте в ней терминал, запустите claude и ответьте «Yes, I trust this folder».`);
    this.name = 'TrustRequiredError';
    this.dir = dir;
  }
}

export class CloudError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CloudError';
  }
}

/** Облачные сессии Claude Code. */
export class ClaudeCloud {
  #run;
  #script;

  constructor({ run = defaultRun, script = PTY_SCRIPT } = {}) {
    this.#run = run;
    this.#script = script;
  }

  /**
   * `claude --cloud` отказывается работать без интерактивного терминала, поэтому запуск идёт через pty-скрипт.
   * @returns {Promise<{sessionId: string, warning?: string}>}
   */
  async dispatch({ dir, prompt, model, effort }) {
    const out = JSON.parse(await this.#run('python3', [this.#script, dir, prompt, model, effort], { timeoutMs: 200_000 }));
    if (!out.ok) throw out.error === 'trust' ? new TrustRequiredError(dir) : new CloudError(`Сессия не стартовала: ${out.message}`);
    return { sessionId: out.session_id, warning: out.warning };
  }

  /** Сообщение в уже идущую облачную сессию: так уходит доработка. */
  async followUp(sessionId, message) {
    const out = JSON.parse(await this.#run('claude', ['-p', message, '--cloud', sessionId, '--output-format', 'json']));
    if (!out.ok) throw new CloudError(`Правка не доставлена: ${out.error ?? 'неизвестная ошибка'}`);
  }
}

export const sessionUrl = (sessionId) => `https://claude.ai/code/${sessionId}`;
