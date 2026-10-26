import { execFile } from 'node:child_process';

export class CommandError extends Error {
  constructor(command, output, code) {
    super(output || `команда завершилась с кодом ${code}: ${command}`);
    this.name = 'CommandError';
    this.command = command;
    this.code = code;
  }
}

/**
 * Запускает программу без оболочки и возвращает stdout.
 * stdin закрывается сразу: иначе `claude -p` и `gh` могут ждать ввода до EOF.
 */
export function run(command, args = [], { cwd, env, timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      command,
      args,
      { cwd, env: env ? { ...process.env, ...env } : process.env, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (error) reject(new CommandError([command, ...args].join(' '), (stderr || stdout || '').trim(), error.code));
        else resolve(stdout);
      },
    );
    child.stdin?.end();
  });
}

/** То же, что run, но разбирает stdout как JSON. */
export async function runJson(command, args, options) {
  const out = await run(command, args, options);
  return out.trim() ? JSON.parse(out) : null;
}
