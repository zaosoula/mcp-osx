import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { actions } from '../src/actions/index.js';
import { runOsa } from '../src/osascript.js';

const S = 'ZZ_SENTINEL';

const CANDIDATES = [S, `https://example.com/${S}`, `spotify:track:${S}`, `/tmp/${S}`, `${S.toLowerCase()}@example.com`];
// date fields are validated ISO strings that travel as numeric argv parts; end must follow start
const DATE_KEYS: Record<string, string> = { from: '2026-01-02T03:04', to: '2026-01-03T03:04', start: '2026-01-02T03:04', end: '2026-01-02T05:04', due: '2026-01-02T03:04', date: '2026-01-02' };
const unwrap = (t: z.ZodType): z.ZodType => {
  let cur: any = t;
  while (cur instanceof z.ZodOptional || cur instanceof z.ZodDefault || cur instanceof z.ZodNullable) cur = cur.unwrap();
  return cur;
};

function sentinelInput(shape: z.ZodRawShape): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, t] of Object.entries(shape)) {
    const base = unwrap(t as z.ZodType);
    if (base instanceof z.ZodString && DATE_KEYS[k]) out[k] = DATE_KEYS[k];
    else if (base instanceof z.ZodString) {
      const hit = CANDIDATES.find((c) => base.safeParse(c).success);
      out[k] = hit ?? (base.safeParse('2026-01-02T03:04:00').success ? '2026-01-02T03:04:00' : undefined);
    } else if (base instanceof z.ZodBoolean) out[k] = true;
    else if (base instanceof z.ZodNumber) out[k] = base.safeParse(1).success ? 1 : 42;
    else if (base instanceof z.ZodEnum) out[k] = base.options[0];
    else if (base instanceof z.ZodArray) out[k] = [CANDIDATES.find((c) => (base as any).element.safeParse(c).success) ?? S];
  }
  return out;
}

describe('actions', () => {
  it('names are unique snake_case', () => {
    const names = actions.map((a) => a.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^[a-z_]+$/);
  });

  it('covers the required minimum', () => {
    const names = actions.map((a) => a.name);
    for (const n of ['system_get_dark_mode', 'system_set_dark_mode', 'safari_open_url', 'safari_current_tab', 'spotify_control',
      'spotify_current_track', 'spotify_play', 'spotify_play_favorites', 'system_get_volume', 'system_set_volume', 'system_set_muted',
      'system_wifi_status', 'system_set_wifi', 'app_open', 'app_quit', 'app_activate', 'app_list_running', 'app_frontmost', 'system_notify'])
      expect(names).toContain(n);
  });

  it('never splices input into script source', () => {
    const ctx = { config: { spotify: { favorites: `spotify:playlist:${S}` } } };
    for (const a of actions) {
      const input = z.object(a.schema).parse(sentinelInput(a.schema));
      const built = a.build(input, ctx);
      expect(built.script, a.name).not.toContain(S);
      const hasStringInput = Object.values(input).some((v) => typeof v === 'string' && v.includes(S));
      if (hasStringInput || a.name === 'spotify_play_favorites') expect(built.args.join('|'), a.name).toContain(S);
    }
  });

  it('spotify_play_favorites without config explains how to set it', () => {
    const a = actions.find((x) => x.name === 'spotify_play_favorites')!;
    expect(() => a.build({}, { config: {} })).toThrow(/spotify\.favorites/);
  });

  it('spotify_play rejects non-spotify uris', () => {
    const a = actions.find((x) => x.name === 'spotify_play')!;
    expect(z.object(a.schema).safeParse({ uri: 'file:///etc/passwd' }).success).toBe(false);
  });

  // needs Automation permission for System Events, which CI runners can't grant
  it.runIf(process.platform === 'darwin' && !process.env.CI)('get_dark_mode runs', async () => {
    const a = actions.find((x) => x.name === 'system_get_dark_mode')!;
    const r = await runOsa(a.build({}, { config: {} }));
    expect(r.stdout).toMatch(/^(true|false)$/);
  });
});

// Commands that must never appear in an unconfirmed named action (spec anti-goal).
const FORBIDDEN = [
  /\bsend\b/i, /\bdelete\b/i, /\bdo JavaScript\b/i, /\bexecute\b/i, /\bdo script\b/i, /\bempty\b/i,
  /\berase\b/i, /\beject\b/i, /\bshut down\b/i, /\brestart\b/i, /\blog out\b/i, /\bexport\b/i,
  /\bforward\b/i, /\breply\b/i, /\bredirect\b/i, /\bbounce\b/i, /\bpassword\b/i, /rm -/, /\bsave\b/i,
];

describe('safety', () => {
  const ctx = { config: { spotify: { favorites: 'spotify:playlist:x' } } };
  const built = () => actions.map((a) => ({ a, b: a.build(z.object(a.schema).parse(sentinelInput(a.schema)), ctx) }));

  it('no named action script uses a destructive or code-executing command', () => {
    // reviewed exceptions: the word is a harmless, app-specific command here
    const allow: Record<string, RegExp[]> = {
      chromium_go: [/\bforward\b/i], // browser history navigation
      vlc_control: [/\bforward\b/i], // `step forward` playback
      quicktime_control: [/\bforward\b/i], // `step forward` playback
      notes_read: [/\bpassword\b/i], // reads `password protected` to refuse locked notes
      lookaway_control: [/\brestart\b/i], // `restart lookaway` only resets break timers
    };
    for (const { a, b } of built()) {
      expect(b.script, `${a.name} must not hide commands behind raw event codes`).not.toMatch(/«event/);
      const script = b.script.replace(/"[^"]*"/g, '""'); // ignore string literals
      for (const re of FORBIDDEN) {
        if ((allow[a.name] ?? []).some((x) => x.source === re.source)) continue;
        expect(script, `${a.name} matches ${re}`).not.toMatch(re);
      }
    }
  });

  it.runIf(process.platform === 'darwin')('every named action script compiles (when its apps are installed)', async () => {
    const { execFileSync } = await import('node:child_process');
    const { existsSync } = await import('node:fs');
    const { homedir } = await import('node:os');
    // osacompile needs the target app's dictionary; CI runners lack Spotify, VLC, Keynote...
    const dirs = ['/Applications', '/Applications/Setapp', '/System/Applications', '/System/Applications/Utilities', '/System/Library/CoreServices', `${homedir()}/Applications`];
    const installed = (app: string) => dirs.some((d) => existsSync(`${d}/${app}.app`));
    const failures: string[] = [];
    const skipped: string[] = [];
    for (const { a, b } of built()) {
      const apps = [...b.script.matchAll(/application "([^"]+)"/g)].map((m) => m[1]);
      const missing = apps.filter((x) => !installed(x));
      if (missing.length) {
        skipped.push(`${a.name} (${[...new Set(missing)].join(', ')} not installed)`);
        continue;
      }
      try {
        execFileSync('osacompile', ['-l', b.lang === 'javascript' ? 'JavaScript' : 'AppleScript', '-o', '/dev/null', '-'], { input: b.script, stdio: ['pipe', 'ignore', 'pipe'] });
      } catch (e) {
        failures.push(`${a.name}: ${String((e as any).stderr).trim()}`);
      }
    }
    if (skipped.length) console.warn(`compile check skipped ${skipped.length}: ${skipped.join('; ')}`);
    expect(failures).toEqual([]);
  }, 120_000);
});

describe('review fixes', () => {
  it('safari_open_url only accepts http(s)', () => {
    const a = actions.find((x) => x.name === 'safari_open_url')!;
    const p = (url: string) => z.object(a.schema).safeParse({ url }).success;
    expect(p('https://github.com')).toBe(true);
    expect(p('http://localhost:3000')).toBe(true);
    for (const u of ['shortcuts://run-shortcut?name=x', 'file:///etc/passwd', 'javascript:alert(1)', 'ssh://host'])
      expect(p(u), u).toBe(false);
  });
});
