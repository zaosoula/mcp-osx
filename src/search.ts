import type { Action } from './actions/types.js';

// Small built-in synonym map so intent words ("song", "website") reach the right actions.
const SYNONYMS: Record<string, string[]> = {
  song: ['track', 'music', 'spotify', 'playback'],
  songs: ['track', 'music', 'spotify'],
  website: ['url', 'tab', 'browser'],
  web: ['url', 'browser', 'search'],
  page: ['tab', 'url'],
  browser: ['safari', 'chromium', 'chrome', 'brave'],
  chrome: ['chromium'],
  brave: ['chromium'],
  sound: ['volume', 'audio'],
  audio: ['volume', 'sound'],
  copy: ['clipboard'],
  paste: ['clipboard'],
  email: ['mail'],
  emails: ['mail', 'messages'],
  meeting: ['calendar', 'event'],
  todo: ['reminders', 'reminder'],
  task: ['reminders', 'reminder'],
  file: ['finder'],
  files: ['finder', 'folder'],
  speak: ['say'],
  theme: ['dark', 'mode', 'appearance'],
  video: ['vlc', 'quicktime', 'tv'],
  stop: ['pause'],
};

const tokenize = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
const stem = (t: string) => t.replace(/(ing|es|s)$/, '');

/**
 * Rank actions for a free-text query, like the API's BM25 tool search: name tokens
 * weigh most, then description, argument names and argument descriptions. Prefix/stem matching tolerates plurals and verb forms.
 */
export function searchActions(list: Action[], query: string, limit = 5): Action[] {
  const q = tokenize(query);
  if (!q.length) return [];
  const terms = q.map((t) => ({ t, w: 1 })).concat(q.flatMap((t) => (SYNONYMS[t] ?? []).map((s) => ({ t: s, w: 0.5 }))));
  const scored = list.map((a) => {
    const name = tokenize(a.name);
    const argText = Object.entries(a.schema)
      .map(([k, t]) => `${k} ${(t as { description?: string }).description ?? ''}`)
      .join(' ');
    const desc = new Set(tokenize(`${a.description} ${argText}`));
    let score = 0;
    const hitTerms = new Set<string>();
    for (const { t, w } of terms) {
      const st = stem(t);
      let hit = 0;
      if (name.includes(t)) hit = 3;
      else if (name.some((n) => stem(n) === st)) hit = 2.5;
      else if ([...desc].some((d) => d === t || stem(d) === st || (st.length > 3 && d.startsWith(st)))) hit = 1;
      if (hit) {
        score += hit * w;
        if (w === 1) hitTerms.add(t);
      }
    }
    // reward covering more of the user's own words
    score *= 1 + hitTerms.size / q.length;
    return { a, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((x, y) => y.score - x.score || x.a.name.localeCompare(y.a.name))
    .slice(0, limit)
    .map((s) => s.a);
}
