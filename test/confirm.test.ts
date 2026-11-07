import { describe, it, expect, vi } from 'vitest';
import { confirm, nativeDialog, type ConfirmRequest } from '../src/confirm.js';
import type { Runner } from '../src/osascript.js';

const req: ConfirmRequest = { title: 'Run script?', script: 'do shell script "rm -rf ~/x"', lang: 'applescript', note: 'n' };
const runnerReturning = (stdout: string, code = 0) => vi.fn<Runner>(async () => ({ stdout, stderr: '', code }));

describe('confirm', () => {
  it('elicit accept approves without dialog', async () => {
    const runner = runnerReturning('deny');
    expect(await confirm(req, { elicit: async () => 'accept', runner })).toBe(true);
    expect(runner).not.toHaveBeenCalled();
  });
  it('elicit message carries the full script', async () => {
    const elicit = vi.fn(async () => 'decline' as const);
    expect(await confirm(req, { elicit, runner: runnerReturning('allow') })).toBe(false);
    expect(elicit.mock.calls[0][0]).toContain(req.script);
  });
  it('elicit cancel denies', async () => {
    expect(await confirm(req, { elicit: async () => 'cancel', runner: runnerReturning('allow') })).toBe(false);
  });
  it('elicit failure falls back to dialog', async () => {
    const elicit = async (): Promise<'accept'> => { throw new Error('unsupported'); };
    expect(await confirm(req, { elicit, runner: runnerReturning('allow') })).toBe(true);
  });
  it('no elicit uses dialog; deny denies', async () => {
    expect(await confirm(req, { elicit: undefined, runner: runnerReturning('deny') })).toBe(false);
    expect(await confirm(req, { elicit: undefined, runner: runnerReturning('allow') })).toBe(true);
  });
  it('dialog failure denies', async () => {
    expect(await confirm(req, { elicit: undefined, runner: runnerReturning('', -1) })).toBe(false);
    expect(await confirm(req, { elicit: undefined, runner: runnerReturning('allow', 1) })).toBe(false);
    const throwing = vi.fn<Runner>(async () => { throw new Error('spawn failed'); });
    expect(await confirm(req, { elicit: undefined, runner: throwing })).toBe(false);
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
});
