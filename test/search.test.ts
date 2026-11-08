import { describe, it, expect } from 'vitest';
import { actionGroups, actions, selectActions } from '../src/actions/index.js';
import { searchActions } from '../src/search.js';

describe('naming', () => {
  it('every action is prefixed with its app group', () => {
    for (const [group, list] of Object.entries(actionGroups))
      for (const a of list) expect(a.name.startsWith(`${group}_`), `${a.name} in ${group}`).toBe(true);
  });
  it('groups cover all actions', () => {
    expect(Object.values(actionGroups).flat().length).toBe(actions.length);
  });
});

describe('selectActions', () => {
  it('returns everything without a filter', () => {
    expect(selectActions(undefined).length).toBe(actions.length);
  });
  it('filters by app group', () => {
    const names = selectActions(['spotify', 'system']).map((a) => a.name);
    expect(names).toContain('spotify_control');
    expect(names).toContain('system_set_dark_mode');
    expect(names.some((n) => n.startsWith('music_'))).toBe(false);
  });
  it('rejects unknown groups', () => {
    expect(() => selectActions(['spotfy'])).toThrow(/Unknown app.*spotfy.*spotify/s);
  });
});

describe('searchActions', () => {
  const top = (q: string, n = 3) => searchActions(actions, q, n).map((a) => a.name);
  it('finds by intent words, not only names', () => {
    expect(top('pause song')).toEqual(expect.arrayContaining(['spotify_control']));
    expect(top('dark mode', 2).sort()).toEqual(['system_get_dark_mode', 'system_set_dark_mode']);
    expect(top('turn on dark mode')[0]).toBe('system_set_dark_mode');
    expect(top('open website in chrome')[0]).toBe('chromium_open_url');
    expect(top('calendar event create')[0]).toBe('calendar_create_event');
    expect(top('volume')).toEqual(expect.arrayContaining(['system_set_volume']));
    expect(top('clipboard copy')).toEqual(expect.arrayContaining(['system_get_clipboard']));
  });
  it('matches app names and is case-insensitive', () => {
    expect(top('SAFARI tabs')[0]).toBe('safari_list_tabs');
  });
  it('matches argument names and descriptions', () => {
    expect(top('seconds', 10)).toEqual(expect.arrayContaining(['lookaway_control']));
  });

  it('returns nothing for gibberish and respects limit', () => {
    expect(top('zzqqxx')).toEqual([]);
    expect(searchActions(actions, 'list', 2).length).toBe(2);
  });
});

describe('README', () => {
  it('documents every named action (run `npm run docs` after adding one)', async () => {
    const { readFileSync } = await import('node:fs');
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
    const missing = actions.map((a) => a.name).filter((n) => !readme.includes(`\`${n}\``));
    expect(missing).toEqual([]);
  });
});
