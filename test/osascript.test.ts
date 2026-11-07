import { describe, it, expect } from 'vitest';
import { runOsa } from '../src/osascript.js';
import { explainError } from '../src/errors.js';

const mac = process.platform === 'darwin';

describe.runIf(mac)('runOsa', () => {
  it('passes args literally via argv', async () => {
    const r = await runOsa({ script: 'on run argv\nreturn item 1 of argv\nend run', args: ['a "b"\n'] });
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('a "b"\n');
  });
  it('runs JXA', async () => {
    const r = await runOsa({ script: 'function run(argv){return argv.length}', lang: 'javascript', args: ['x', 'y'] });
    expect(r.stdout).toBe('2');
  });
  it('reports script errors without rejecting', async () => {
    const r = await runOsa({ script: 'error "boom"' });
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('boom');
  });
  it('times out', async () => {
    const r = await runOsa({ script: 'delay 5', timeoutMs: 200 });
    expect(r.code).toBe(-1);
    expect(r.stderr).toMatch(/timed out/);
  });
});

describe('explainError', () => {
  it('hints Automation permission for -1743', () => {
    expect(explainError('execution error: Not authorized to send Apple events to Finder. (-1743)')).toContain('Automation');
  });
  it('hints Accessibility', () => {
    expect(explainError('System Events got an error: osascript is not allowed assistive access. (-25211)')).toContain('Accessibility');
  });
  it('passes unknown errors through', () => {
    expect(explainError('weird')).toBe('weird');
  });
});
