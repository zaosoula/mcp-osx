import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkflowStore, argsFor, hashScript, validName } from '../src/workflows.js';

let dir: string;
let store: WorkflowStore;
const wf = { name: 'hello', description: 'say hi', lang: 'applescript' as const, script: 'on run argv\nreturn item 1 of argv\nend run', params: [{ name: 'who', required: true }, { name: 'extra' }] };

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mcp-osx-wf-'));
  store = new WorkflowStore(dir);
});

describe('WorkflowStore', () => {
  it('round-trips and detects tampering', async () => {
    await store.save(wf);
    const got = (await store.get('hello'))!;
    expect(got.script).toBe(wf.script);
    expect(got.approvedHash).toBe(hashScript('applescript', wf.script));
    expect(store.isApproved(got)).toBe(true);
    const file = join(dir, 'hello.json');
    const raw = JSON.parse(await readFile(file, 'utf8'));
    raw.script = 'do shell script "evil"';
    await writeFile(file, JSON.stringify(raw));
    const tampered = (await store.get('hello'))!;
    expect(store.isApproved(tampered)).toBe(false);
    await store.reapprove('hello');
    expect(store.isApproved((await store.get('hello'))!)).toBe(true);
  });

  it('lang change also invalidates approval', async () => {
    await store.save(wf);
    const w = (await store.get('hello'))!;
    expect(store.isApproved({ ...w, lang: 'javascript' })).toBe(false);
  });

  it('rejects bad names', async () => {
    for (const n of ['../x', 'A', 'has space', '', 'x'.repeat(49)]) {
      expect(validName(n)).toBe(false);
      await expect(store.save({ ...wf, name: n })).rejects.toThrow(/name/i);
      await expect(store.get(n)).rejects.toThrow(/name/i);
    }
    expect(await readdir(dir)).toEqual([]);
  });

  it('delete removes; list ignores junk', async () => {
    await store.save(wf);
    await writeFile(join(dir, 'junk.json'), '{nope');
    await writeFile(join(dir, 'Bad Name.json'), JSON.stringify(wf));
    expect((await store.list()).map((w) => w.name)).toEqual(['hello']);
    await store.delete('hello');
    expect(await store.list()).toEqual([]);
    expect(await store.get('hello')).toBeUndefined();
  });

  it('get of missing returns undefined', async () => {
    expect(await store.get('nope')).toBeUndefined();
  });

  it('onChange fires after save', async () => {
    let fired = 0;
    store.onChange(() => fired++);
    await store.save(wf);
    await new Promise((r) => setTimeout(r, 400));
    expect(fired).toBeGreaterThan(0);
    store.close();
  });
});

describe('argsFor', () => {
  it('params passed as argv untouched', () => {
    const w = { ...wf, approvedHash: '', createdAt: '' };
    const evil = '"; do shell script "rm -rf ~';
    expect(argsFor(w, { who: evil })).toEqual([evil, '']);
    expect(argsFor(w, { who: 'a', extra: 'b' })).toEqual(['a', 'b']);
  });
  it('missing required param throws', () => {
    expect(() => argsFor({ ...wf, approvedHash: '', createdAt: '' }, {})).toThrow(/who/);
  });
});
