import { createHash, randomUUID } from 'node:crypto';
import { watch, mkdirSync, type FSWatcher } from 'node:fs';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Lang } from './osascript.js';

export type Param = { name: string; description?: string; required?: boolean };
export type Workflow = {
  name: string;
  description: string;
  lang: Lang;
  script: string;
  params: Param[];
  approvedHash: string;
  createdAt: string;
};
export type NewWorkflow = Omit<Workflow, 'approvedHash' | 'createdAt'>;

const NAME_RE = /^[a-z][a-z0-9_]{0,47}$/;
const PARAM_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,47}$/;

export const validName = (name: string): boolean => NAME_RE.test(name);

export function hashScript(lang: Lang, script: string): string {
  return createHash('sha256').update(`${lang}\n${script}`).digest('hex');
}

function assertName(name: string): void {
  if (!validName(name)) throw new Error(`Invalid workflow name "${name}": use lowercase letters, digits and _ (start with a letter, max 48 chars)`);
}

/** Map named inputs to positional argv in declaration order. */
export function argsFor(w: Workflow, input: Record<string, string>): string[] {
  return w.params.map((p) => {
    const v = input[p.name];
    if (v === undefined || v === null) {
      if (p.required) throw new Error(`Missing required parameter "${p.name}" for workflow "${w.name}"`);
      return '';
    }
    return String(v);
  });
}

export class WorkflowStore {
  private watcher?: FSWatcher;
  private timer?: NodeJS.Timeout;
  private listeners: (() => void)[] = [];

  constructor(readonly dir: string) {}

  private file(name: string): string {
    assertName(name);
    return join(this.dir, `${name}.json`);
  }

  async list(): Promise<Workflow[]> {
    let files: string[];
    try {
      files = await readdir(this.dir);
    } catch {
      return [];
    }
    const out: Workflow[] = [];
    for (const f of files.sort()) {
      if (!f.endsWith('.json') || !validName(f.slice(0, -5))) continue;
      const w = await this.get(f.slice(0, -5)).catch(() => undefined);
      if (w) out.push(w);
    }
    return out;
  }

  async get(name: string): Promise<Workflow | undefined> {
    const file = this.file(name);
    let raw: string;
    try {
      raw = await readFile(file, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw e;
    }
    const w = JSON.parse(raw) as Workflow;
    if (w.name !== name || typeof w.script !== 'string' || (w.lang !== 'applescript' && w.lang !== 'javascript'))
      throw new Error(`Malformed workflow file ${file}`);
    w.params = Array.isArray(w.params) ? w.params : [];
    w.description = typeof w.description === 'string' ? w.description : '';
    return w;
  }

  /** Persist a workflow whose script the user has just approved. */
  async save(input: NewWorkflow): Promise<Workflow> {
    const file = this.file(input.name);
    for (const p of input.params) if (!PARAM_RE.test(p.name)) throw new Error(`Invalid parameter name "${p.name}"`);
    const w: Workflow = { ...input, approvedHash: hashScript(input.lang, input.script), createdAt: new Date().toISOString() };
    await mkdir(this.dir, { recursive: true });
    await this.writeAtomic(file, w);
    this.emit();
    return w;
  }

  async delete(name: string): Promise<void> {
    await unlink(this.file(name));
    this.emit();
  }

  isApproved(w: Workflow): boolean {
    return w.approvedHash === hashScript(w.lang, w.script);
  }

  /**
   * Record approval of exactly the script the user was shown. Refuses if the
   * file changed again while the prompt was open, so an unseen script is never approved.
   */
  async reapprove(shown: Workflow): Promise<void> {
    const cur = await this.get(shown.name);
    if (!cur || cur.script !== shown.script || cur.lang !== shown.lang)
      throw new Error(`Workflow "${shown.name}" changed again while awaiting approval; run it again to review the new version.`);
    await this.writeAtomic(this.file(shown.name), { ...cur, approvedHash: hashScript(shown.lang, shown.script) });
  }

  private async writeAtomic(file: string, w: Workflow): Promise<void> {
    const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(w, null, 2) + '\n');
    await rename(tmp, file);
  }

  onChange(cb: () => void): void {
    this.listeners.push(cb);
    if (this.watcher) return;
    mkdirSync(this.dir, { recursive: true });
    this.watcher = watch(this.dir, () => this.emit());
    // e.g. directory deleted or permissions changed: stop watching rather than crash
    this.watcher.on('error', () => {
      this.watcher?.close();
      this.watcher = undefined;
    });
  }

  private emit(): void {
    if (!this.listeners.length) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.listeners.forEach((l) => l()), 200);
  }

  close(): void {
    this.watcher?.close();
    clearTimeout(this.timer);
  }
}
