import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { getAppDictionary, listScriptableApps, resolveApp, summarizeSdef, type Exec } from '../src/dictionary.js';

const xml = readFileSync(new URL('./fixtures/mini.sdef', import.meta.url), 'utf8');
const mac = process.platform === 'darwin';

describe('summarizeSdef', () => {
  it('renders commands, classes, enums compactly', () => {
    const s = summarizeSdef(xml);
    expect(s).toContain('suite Mini Suite');
    expect(s).toContain('cmd play track(text; in context: text?)');
    expect(s).toContain('— Start playback of a track.');
    expect(s).toContain('cmd count tracks(matching: list of text) -> integer');
    expect(s).toContain('class track inherits item');
    expect(s).toContain('name: text [r]');
    expect(s).toContain('starred: boolean');
    expect(s).toContain('elements artwork');
    expect(s).toContain('extends application');
    expect(s).toContain('current track: track [r]');
    expect(s).toContain('enum ePlS: stopped|playing');
  });
  it('filter narrows output', () => {
    const s = summarizeSdef(xml, 'TRACK');
    expect(s).toContain('cmd play track');
    expect(s).toContain('class track');
    expect(s).not.toContain('cmd pause');
  });
  it('filter with no match says so', () => {
    expect(summarizeSdef(xml, 'zzz')).toMatch(/no matches/i);
  });
});

describe('getAppDictionary', () => {
  it('sdef failure gives error', async () => {
    const exec: Exec = async () => ({ stdout: '', stderr: 'sdef: error', code: 1 });
    await expect(getAppDictionary('/Applications/Nope.app', undefined, exec)).rejects.toThrow(/no scripting dictionary/);
  });
  it('uses sdef output', async () => {
    const exec: Exec = async (cmd, args) => ({ stdout: cmd === 'sdef' && args[0] === '/X/Mini.app' ? xml : '', stderr: '', code: 0 });
    expect(await getAppDictionary('/X/Mini.app', 'pause', exec)).toContain('cmd pause');
  });
  it('unknown app name errors clearly', async () => {
    await expect(resolveApp('Definitely Not An App 123')).rejects.toThrow(/App not found/);
  });
  it('rejects names with slashes that are not absolute .app paths', async () => {
    await expect(resolveApp('../../etc')).rejects.toThrow(/App not found/);
  });
});

describe.runIf(mac)('on macOS', () => {
  it('lists Finder and dedupes', async () => {
    const apps = await listScriptableApps();
    const names = apps.map((a) => a.name);
    expect(names).toContain('Finder');
    expect(new Set(names).size).toBe(names.length);
    expect(apps.some((a) => a.path.includes('/Library/Caches/'))).toBe(false);
  });
  it('reads a real dictionary by name', async () => {
    expect(await resolveApp('finder')).toMatch(/Finder\.app$/);
    expect(await getAppDictionary('Finder', 'empty')).toContain('cmd empty');
  });
});
