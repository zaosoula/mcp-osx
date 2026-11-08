import { describe, it, expect, vi } from 'vitest';
import { elicitMessage, nativeDialog, type ConfirmRequest } from '../src/confirm.js';
import type { Runner } from '../src/osascript.js';

const req: ConfirmRequest = { title: 'Run script?', script: 'do shell script "rm -rf ~/x"', lang: 'applescript', note: 'n' };
const runnerReturning = (stdout: string, code = 0) => vi.fn<Runner>(async () => ({ stdout, stderr: '', code }));

describe('elicitMessage', () => {
  it('carries the full script in a fence longer than any backtick run inside it', () => {
    const m = elicitMessage({ ...req, script: 'a ``` b' });
    expect(m).toContain('a ``` b');
    expect(m).toContain('````applescript');
  });
});

describe('nativeDialog', () => {
  it('passes script via argv, never in dialog source, and never truncates', async () => {
    const long = 'x'.repeat(50_000) + 'TAIL';
    const runner = runnerReturning('deny');
    await nativeDialog({ ...req, script: long }, runner, 5);
    const opts = runner.mock.calls[0][0];
    expect(opts.lang).toBe('javascript');
    expect(opts.script).not.toContain('TAIL');
    expect(opts.args!.some((a) => a.endsWith('TAIL') && a.length === long.length)).toBe(true);
    expect(opts.timeoutMs).toBe(5000);
  });
  it('dialog failure denies', async () => {
    expect(await nativeDialog(req, runnerReturning('allow'))).toBe(true);
    expect(await nativeDialog(req, runnerReturning('', -1))).toBe(false);
    expect(await nativeDialog(req, runnerReturning('allow', 1))).toBe(false);
    expect(await nativeDialog(req, vi.fn<Runner>(async () => { throw new Error('spawn failed'); }))).toBe(false);
  });
});
