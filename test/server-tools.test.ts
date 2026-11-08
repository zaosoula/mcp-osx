import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createServer } from '../src/server.js';
import { WorkflowStore } from '../src/workflows.js';
import type { Runner } from '../src/osascript.js';

let store: WorkflowStore;
let runner: ReturnType<typeof vi.fn<Runner>>;
let dialog: ReturnType<typeof vi.fn>;
let client: Client;
let answer: boolean;

async function connect(opts: { elicit?: (approve: boolean) => void; mode?: 'full' | 'compact'; apps?: string[] } = {}) {
  const { server, sync } = createServer({ runner, store, config: async () => ({}), dialog: dialog as never, mode: opts.mode, apps: opts.apps });
  await sync();
  const [a, b] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 't', version: '0' }, { capabilities: opts.elicit ? { elicitation: { form: {} } } : {} });
  if (opts.elicit)
    client.setRequestHandler('elicitation/create', async () => ({ action: 'accept', content: { approve: answer } }));
  await server.connect(a);
  await client.connect(b);
  return sync;
}

const text = (r: any) => r.content.map((c: any) => c.text).join('');

beforeEach(async () => {
  store = new WorkflowStore(await mkdtemp(join(tmpdir(), 'mcp-osx-srv-')));
  runner = vi.fn<Runner>(async () => ({ stdout: 'ran', stderr: '', code: 0 }));
  answer = true;
  dialog = vi.fn(async () => answer);
});
afterEach(async () => {
  await client?.close();
  store.close();
});

describe('server', () => {
  it('lists core tools', async () => {
    await connect();
    const names = (await client.listTools()).tools.map((t) => t.name);
    for (const n of ['system_set_dark_mode', 'spotify_play_favorites', 'run_applescript', 'get_app_dictionary', 'list_scriptable_apps', 'list_workflows', 'run_workflow', 'delete_workflow'])
      expect(names).toContain(n);
  });

  it('instructions name the app groups for tool search', async () => {
    await connect();
    const ins = client.getInstructions() ?? '';
    for (const g of ['system', 'spotify', 'calendar', 'chromium']) expect(ins).toContain(g);
  });

  it('named action runs without confirmation', async () => {
    await connect();
    const r = await client.callTool({ name: 'system_set_volume', arguments: { level: 20 } });
    expect(r.isError).toBeFalsy();
    expect(dialog).not.toHaveBeenCalled();
    expect(runner.mock.calls[0][0].args).toEqual(['20']);
  });

  it('slow named actions get their own timeout', async () => {
    await connect();
    await client.callTool({ name: 'calendar_list_events', arguments: {} });
    expect(runner.mock.calls[0][0].timeoutMs).toBe(120_000);
  });

  it('named action error carries hint', async () => {
    runner.mockResolvedValueOnce({ stdout: '', stderr: 'Not authorized to send Apple events to Spotify. (-1743)', code: 1 });
    await connect();
    const r = await client.callTool({ name: 'spotify_control', arguments: { command: 'pause' } });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('Automation');
  });

  it('missing favorites config is a clear error', async () => {
    await connect();
    const r = await client.callTool({ name: 'spotify_play_favorites', arguments: {} });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('spotify.favorites');
    expect(runner).not.toHaveBeenCalled();
  });

  it('run_applescript denied never runs', async () => {
    answer = false;
    await connect();
    const r = await client.callTool({ name: 'run_applescript', arguments: { script: 'beep' } });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/denied/i);
    expect(runner).not.toHaveBeenCalled();
  });

  it('run_applescript approved via elicitation', async () => {
    await connect({ elicit: () => {} });
    const r = await client.callTool({ name: 'run_applescript', arguments: { script: 'beep' } });
    expect(text(r)).toBe('ran');
    expect(dialog).not.toHaveBeenCalled();
  });

  it('elicitation approve:false denies', async () => {
    answer = false;
    await connect({ elicit: () => {} });
    const r = await client.callTool({ name: 'run_applescript', arguments: { script: 'beep' } });
    expect(r.isError).toBe(true);
    expect(runner).not.toHaveBeenCalled();
  });

  it('bad saveAs rejected before confirmation', async () => {
    await connect();
    const r = await client.callTool({ name: 'run_applescript', arguments: { script: 'beep', saveAs: '../evil' } });
    expect(r.isError).toBe(true);
    expect(dialog).not.toHaveBeenCalled();
  });

  it('saveAs creates a workflow tool that runs without confirmation', async () => {
    await connect();
    const r = await client.callTool({
      name: 'run_applescript',
      arguments: { script: 'on run argv\nreturn item 1 of argv\nend run', args: ['x'], saveAs: 'hello', description: 'Say hello', params: [{ name: 'who', required: true }] },
    });
    expect(r.isError).toBeFalsy();
    expect(dialog).toHaveBeenCalledTimes(1);
    expect(dialog.mock.calls[0][0].note).toContain('hello');
    expect(dialog.mock.calls[0][0].note).toMatch(/ANY value for: who \(argv 1\)/);
    const tools = (await client.listTools()).tools;
    const t = tools.find((x) => x.name === 'workflow_hello')!;
    expect(t.description).toContain('Say hello');
    expect((t.inputSchema as any).required).toEqual(['who']);
    dialog.mockClear();
    const r2 = await client.callTool({ name: 'workflow_hello', arguments: { who: '"; beep' } });
    expect(r2.isError).toBeFalsy();
    expect(dialog).not.toHaveBeenCalled();
    expect(runner.mock.calls.at(-1)![0].args).toEqual(['"; beep']);
    const listed = text(await client.callTool({ name: 'list_workflows', arguments: {} }));
    expect(listed).toContain('hello');
  });

  it('failed run is not saved', async () => {
    runner.mockResolvedValueOnce({ stdout: '', stderr: 'boom', code: 1 });
    await connect();
    await client.callTool({ name: 'run_applescript', arguments: { script: 'error', saveAs: 'bad' } });
    expect(await store.get('bad')).toBeUndefined();
  });

  it('tampered workflow reconfirms', async () => {
    await store.save({ name: 'w', description: 'd', lang: 'applescript', script: 'beep', params: [] });
    const file = join(store.dir, 'w.json');
    const raw = JSON.parse(await readFile(file, 'utf8'));
    raw.script = 'do shell script "evil"';
    await writeFile(file, JSON.stringify(raw));
    answer = false;
    await connect();
    const r = await client.callTool({ name: 'workflow_w', arguments: {} });
    expect(r.isError).toBe(true);
    expect(dialog).toHaveBeenCalledTimes(1);
    expect(dialog.mock.calls[0][0].note).toMatch(/changed on disk/i);
    expect(runner).not.toHaveBeenCalled();
    answer = true;
    const r2 = await client.callTool({ name: 'run_workflow', arguments: { name: 'w' } });
    expect(r2.isError).toBeFalsy();
    expect(runner).toHaveBeenCalledTimes(1);
    expect(store.isApproved((await store.get('w'))!)).toBe(true);
  });

  it('delete_workflow confirms and removes the tool', async () => {
    await store.save({ name: 'gone', description: 'd', lang: 'applescript', script: 'beep', params: [] });
    const sync = await connect();
    answer = false;
    expect((await client.callTool({ name: 'delete_workflow', arguments: { name: 'gone' } })).isError).toBe(true);
    expect(await store.get('gone')).toBeDefined();
    answer = true;
    await client.callTool({ name: 'delete_workflow', arguments: { name: 'gone' } });
    await sync();
    expect((await client.listTools()).tools.map((t) => t.name)).not.toContain('workflow_gone');
  });

  it('save prompt warns even without params that it runs unprompted later', async () => {
    await connect();
    await client.callTool({ name: 'run_applescript', arguments: { script: 'beep', saveAs: 'np' } });
    expect(dialog.mock.calls[0][0].note).toMatch(/WITHOUT asking/);
  });

  it('unknown workflow errors', async () => {
    await connect();
    const r = await client.callTool({ name: 'run_workflow', arguments: { name: 'nope' } });
    expect(r.isError).toBe(true);
  });

  describe('compact mode', () => {
    it('exposes core tools only', async () => {
      await connect({ mode: 'compact' });
      const names = (await client.listTools()).tools.map((t) => t.name);
      expect(names).toEqual(expect.arrayContaining(['search_actions', 'run_action', 'run_applescript', 'get_app_dictionary']));
      expect(names).not.toContain('spotify_control');
      expect(names.length).toBeLessThan(15);
    });
    it('search_actions returns full JSON schemas', async () => {
      await connect({ mode: 'compact' });
      const r = await client.callTool({ name: 'search_actions', arguments: { query: 'set volume' } });
      const hits = JSON.parse(text(r));
      const vol = hits.find((h: any) => h.name === 'system_set_volume');
      expect(vol.inputSchema.properties.level.maximum).toBe(100);
      expect(vol.description).toBeTruthy();
    });
    it('search_actions with empty query lists names by app', async () => {
      await connect({ mode: 'compact' });
      const t = text(await client.callTool({ name: 'search_actions', arguments: { query: '' } }));
      expect(t).toMatch(/^spotify: .*spotify_control/m);
    });
    it('run_action validates and runs', async () => {
      await connect({ mode: 'compact' });
      const bad = await client.callTool({ name: 'run_action', arguments: { name: 'system_set_volume', args: { level: 500 } } });
      expect(bad.isError).toBe(true);
      expect(runner).not.toHaveBeenCalled();
      const good = await client.callTool({ name: 'run_action', arguments: { name: 'system_set_volume', args: { level: 30 } } });
      expect(good.isError).toBeFalsy();
      expect(runner.mock.calls[0][0].args).toEqual(['30']);
      const unknown = await client.callTool({ name: 'run_action', arguments: { name: 'nope', args: {} } });
      expect(text(unknown)).toMatch(/search_actions/);
    });
  });

  it('app filter limits named tools', async () => {
    await connect({ apps: ['spotify'] });
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain('spotify_control');
    expect(names).not.toContain('music_control');
    expect(names).toContain('run_applescript');
  });
});
