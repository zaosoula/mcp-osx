import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { getAppDictionary, listScriptableApps, resolveApp, resolveIncludes, summarizeSdef, type Exec } from '../src/dictionary.js';

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

describe('real-world sdef quirks', () => {
  it('parses DOCTYPE with an internal subset and parameter entities (Keynote/Pages/Numbers)', () => {
    const x = `<?xml version="1.0"?>
<!DOCTYPE dictionary SYSTEM "file://localhost/System/Library/DTDs/sdef.dtd"
[
    <!ELEMENT class (cocoa?, type?)>
    <!ENTITY % common.attrib
        "xmlns:xi   CDATA   #FIXED 'http://www.w3.org/2001/XInclude'">
]>
<dictionary><suite name="K"><command name="start"/></suite></dictionary>`;
    expect(summarizeSdef(x)).toContain('cmd start()');
  });

  it('inlines xi:include suites and honours excluded command names', async () => {
    const { mkdtemp, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const d = await mkdtemp(join(tmpdir(), 'sdef-'));
    const std = join(d, 'Std.sdef');
    await writeFile(std, '<dictionary><suite name="Standard Suite"><command name="count"/><command name="delete"/><command name="make"/></suite></dictionary>');
    const app = `<dictionary xmlns:xi="http://www.w3.org/2001/XInclude"><suite name="Standard Suite"><xi:include href="file://localhost${std}" xpointer="xpointer(/dictionary/suite/node()[not(self::command and ((@name = 'delete')))])"/></suite><suite name="App"><command name="go"/></suite></dictionary>`;
    const s = summarizeSdef(await resolveIncludes(app));
    expect(s).toContain('suite Standard Suite');
    expect(s).toContain('cmd count()');
    expect(s).toContain('cmd make()');
    expect(s).not.toContain('cmd delete()');
    expect(s).toContain('cmd go()');
  });

  it('leaves unreadable includes out without failing', async () => {
    const app = `<dictionary><xi:include href="file:///nope/x.sdef" xpointer="xpointer(/dictionary/suite)"/><suite name="App"><command name="go"/></suite></dictionary>`;
    expect(summarizeSdef(await resolveIncludes(app))).toContain('cmd go()');
  });
});
