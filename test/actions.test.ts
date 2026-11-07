import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { actions } from '../src/actions.js';
import { runOsa } from '../src/osascript.js';

const S = 'ZZ_SENTINEL';

function sentinelInput(shape: z.ZodRawShape): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, t] of Object.entries(shape)) {
    const base = t instanceof z.ZodOptional ? t.unwrap() : t;
    if (base instanceof z.ZodString) out[k] = k === 'url' ? `https://example.com/${S}` : k === 'uri' ? `spotify:track:${S}` : S;
    else if (base instanceof z.ZodBoolean) out[k] = true;
    else if (base instanceof z.ZodNumber) out[k] = 42;
    else if (base instanceof z.ZodEnum) out[k] = base.options[0];
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
    for (const n of ['get_dark_mode', 'set_dark_mode', 'safari_open_url', 'safari_current_tab', 'spotify_control',
      'spotify_current_track', 'spotify_play', 'spotify_play_favorites', 'get_volume', 'set_volume', 'set_muted',
      'wifi_status', 'set_wifi', 'open_app', 'quit_app', 'activate_app', 'list_running_apps', 'frontmost_app', 'notify'])
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

  it.runIf(process.platform === 'darwin')('get_dark_mode runs', async () => {
    const a = actions.find((x) => x.name === 'get_dark_mode')!;
    const r = await runOsa(a.build({}, { config: {} }));
    expect(r.stdout).toMatch(/^(true|false)$/);
  });
});
