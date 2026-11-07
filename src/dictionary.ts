import { execFile } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';

export type Exec = (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string; code: number }>;
export type AppInfo = { name: string; path: string };

export const execCmd: Exec = (cmd, args) =>
  new Promise((resolve) => {
    execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024, timeout: 30_000, encoding: 'utf8' }, (err, stdout, stderr) =>
      resolve({ stdout, stderr, code: err ? (typeof err.code === 'number' ? err.code : 1) : 0 }),
    );
  });

const SEARCH_DIRS = () => ['/Applications', '/System/Applications', '/System/Library/CoreServices', join(homedir(), 'Applications')];
const EXCLUDE = /\/Library\/Caches\/|\/\.cache\//;

/** Find .app bundles up to `depth` levels below dir (not descending into bundles). */
async function findApps(dir: string, depth: number): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  await Promise.all(
    entries.map(async (e) => {
      const p = join(dir, e.name);
      if (!e.isDirectory() && !e.isSymbolicLink()) return;
      if (e.name.endsWith('.app')) out.push(p);
      else if (depth > 0) out.push(...(await findApps(p, depth - 1)));
    }),
  );
  return out;
}

/**
 * Binary and XML plists both store dictionary keys as plain ASCII, so a byte
 * search finds the scripting keys without spawning plutil per bundle.
 */
async function isScriptable(appPath: string): Promise<boolean> {
  try {
    const buf = await readFile(join(appPath, 'Contents', 'Info.plist'));
    return buf.includes('OSAScriptingDefinition') || buf.includes('NSAppleScriptEnabled');
  } catch {
    return false;
  }
}

let appCache: { at: number; apps: AppInfo[] } | undefined;

/** Installed apps that ship an AppleScript dictionary, deduped by name and sorted. */
export async function listScriptableApps(): Promise<AppInfo[]> {
  if (appCache && Date.now() - appCache.at < 60_000) return appCache.apps;
  const paths = (await Promise.all(SEARCH_DIRS().map((d) => findApps(d, 2)))).flat().filter((p) => !EXCLUDE.test(p));
  const flags = await Promise.all(paths.map(isScriptable));
  const byName = new Map<string, AppInfo>();
  paths.forEach((path, i) => {
    if (!flags[i]) return;
    const name = basename(path, '.app');
    if (!byName.has(name.toLowerCase())) byName.set(name.toLowerCase(), { name, path });
  });
  const apps = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  appCache = { at: Date.now(), apps };
  return apps;
}

async function isDir(p: string): Promise<boolean> {
  return stat(p).then((s) => s.isDirectory(), () => false);
}

/** Resolve an app name ("Spotify") or absolute bundle path to a bundle path. */
export async function resolveApp(nameOrPath: string): Promise<string> {
  const q = nameOrPath.trim();
  if (q.startsWith('/') && q.endsWith('.app')) return q;
  if (!q || q.includes('/')) throw new Error(`App not found: ${nameOrPath}`);
  const bare = q.replace(/\.app$/i, '');
  const hit = (await listScriptableApps()).find((a) => a.name.toLowerCase() === bare.toLowerCase());
  if (hit) return hit.path;
  for (const d of SEARCH_DIRS()) {
    for (const p of [join(d, `${bare}.app`), join(d, 'Utilities', `${bare}.app`)]) if (await isDir(p)) return p;
  }
  throw new Error(`App not found: ${nameOrPath}. Use list_scriptable_apps to see available apps, or pass an absolute .app path.`);
}

// ---------- sdef summarizing ----------

type Node = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ARRAYS = new Set(['suite', 'command', 'parameter', 'class', 'class-extension', 'property', 'element', 'enumeration', 'enumerator', 'type', 'record-type', 'value-type', 'responds-to']);
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', isArray: (name, _path, _leaf, isAttribute) => !isAttribute && ARRAYS.has(name) });

function typeOf(n: Node | undefined): string {
  if (!n) return '';
  const types: string[] = [];
  if (n.type && typeof n.type === 'string') types.push(n.list === 'yes' ? `list of ${n.type}` : n.type);
  for (const t of (Array.isArray(n.type) ? n.type : []) as Node[]) types.push(t.list === 'yes' ? `list of ${t.type}` : t.type);
  return types.join(' | ') || 'any';
}

const desc = (n: Node) => (n.description ? `  — ${n.description}` : '');

function renderCommand(c: Node): string {
  const parts: string[] = [];
  const dp = c['direct-parameter'];
  if (dp) parts.push(`${typeOf(dp)}${dp.optional === 'yes' ? '?' : ''}`);
  const named = ((c.parameter ?? []) as Node[]).map((p) => `${p.name}: ${typeOf(p)}${p.optional === 'yes' ? '?' : ''}`);
  const sig = parts.length && named.length ? `${parts.join('')}; ${named.join(', ')}` : [...parts, ...named].join(', ');
  const res = c.result ? ` -> ${typeOf(c.result)}` : '';
  return `  cmd ${c.name}(${sig})${res}${desc(c)}`;
}

function renderClass(c: Node, ext = false): string {
  const head = ext ? `  extends ${c.extends}` : `  class ${c.name}${c.inherits ? ` inherits ${c.inherits}` : ''}${desc(c)}`;
  const lines = [head];
  const props = ((c.property ?? []) as Node[]).map((p) => `${p.name}: ${typeOf(p)}${p.access === 'r' ? ' [r]' : ''}`);
  if (props.length) lines.push(`    props ${props.join(', ')}`);
  const els = ((c.element ?? []) as Node[]).map((e) => e.type);
  if (els.length) lines.push(`    elements ${els.join(', ')}`);
  return lines.join('\n');
}

/** Turn raw sdef XML into a compact, agent-friendly summary. */
export function summarizeSdef(xml: string, filter?: string): string {
  const doc = parser.parse(xml) as Node;
  const suites = (doc.dictionary?.suite ?? []) as Node[];
  const f = filter?.trim().toLowerCase();
  const match = (name?: string) => !f || (name ?? '').toLowerCase().includes(f);
  const out: string[] = [];
  for (const s of suites) {
    const suiteHit = !!f && match(s.name);
    const keep = (n?: string) => !f || suiteHit || match(n);
    const lines: string[] = [];
    for (const c of (s.command ?? []) as Node[]) if (keep(c.name)) lines.push(renderCommand(c));
    for (const c of (s.class ?? []) as Node[]) if (keep(c.name)) lines.push(renderClass(c));
    for (const c of (s['class-extension'] ?? []) as Node[]) if (keep(c.extends)) lines.push(renderClass(c, true));
    for (const e of (s.enumeration ?? []) as Node[])
      if (keep(e.name)) lines.push(`  enum ${e.name}: ${((e.enumerator ?? []) as Node[]).map((x) => x.name).join('|')}`);
    if (lines.length) out.push(`suite ${s.name}${desc(s)}`, ...lines);
  }
  if (!out.length) return f ? `No matches for "${filter}".` : 'Dictionary is empty.';
  return out.join('\n');
}

const dictCache = new Map<string, string>();

/** Compact scripting dictionary for an app (by name or bundle path). */
export async function getAppDictionary(app: string, filter?: string, exec: Exec = execCmd): Promise<string> {
  const path = await resolveApp(app);
  const mtime = await stat(path).then((s) => s.mtimeMs, () => 0);
  const key = `${path}@${mtime}`;
  let xml = dictCache.get(key);
  if (!xml) {
    const r = await exec('sdef', [path]);
    if (r.code !== 0 || !r.stdout.trim()) throw new Error(`${app} has no scripting dictionary${r.stderr ? ` (${r.stderr.trim()})` : ''}`);
    xml = r.stdout;
    if (exec === execCmd) dictCache.set(key, xml);
  }
  return `${basename(path, '.app')} (${path})\n${summarizeSdef(xml, filter)}`;
}
