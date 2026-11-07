import { execFile } from 'node:child_process';

export type Lang = 'applescript' | 'javascript';
export type OsaResult = { stdout: string; stderr: string; code: number };
export type RunOptions = { script: string; lang?: Lang; args?: string[]; timeoutMs?: number };
export type Runner = (opts: RunOptions) => Promise<OsaResult>;

export const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_TIMEOUT_MS = 120_000;

/**
 * Run a script through osascript. The script is fed over stdin and inputs are
 * passed as argv (`on run argv` / `function run(argv)`), never spliced into source.
 * Never rejects: failures are reported through `code` and `stderr`.
 */
export const runOsa: Runner = ({ script, lang = 'applescript', args = [], timeoutMs = DEFAULT_TIMEOUT_MS }) =>
  new Promise((resolve) => {
    const timeout = Math.min(Math.max(timeoutMs, 1), MAX_TIMEOUT_MS);
    const osaLang = lang === 'javascript' ? 'JavaScript' : 'AppleScript';
    const child = execFile(
      'osascript',
      ['-l', osaLang, '-', ...args],
      { timeout, killSignal: 'SIGKILL', maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' },
      (err, stdout, stderr) => {
        if (err && (err as NodeJS.ErrnoException & { killed?: boolean }).killed) {
          resolve({ stdout, stderr: `${stderr}osascript timed out after ${timeout} ms`.trim(), code: -1 });
          return;
        }
        const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
        resolve({
          stdout: stdout.replace(/\n$/, ''),
          stderr: err && !stderr ? String(err.message) : stderr.trim(),
          code,
        });
      },
    );
    child.stdin?.end(script);
  });
