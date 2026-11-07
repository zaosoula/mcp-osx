import { McpServer, type RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { actions } from './actions/index.js';
import type { Config } from './config.js';
import { confirm, nativeDialog, type ConfirmRequest, type Dialog, type Elicit } from './confirm.js';
import { getAppDictionary, listScriptableApps } from './dictionary.js';
import { explainError } from './errors.js';
import { DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS, type Lang, type Runner } from './osascript.js';
import { argsFor, validName, type Workflow, type WorkflowStore } from './workflows.js';

export type ServerDeps = {
  runner: Runner;
  store: WorkflowStore;
  config: () => Promise<Config>;
  dialog?: Dialog;
  version?: string;
};

const ok = (text: string): CallToolResult => ({ content: [{ type: 'text', text: text === '' ? '(no output)' : text }] });
const fail = (text: string): CallToolResult => ({ content: [{ type: 'text', text }], isError: true });

/** Run a handler, turning thrown errors into MCP error results. */
const guard =
  <A>(fn: (args: A) => Promise<CallToolResult>) =>
  async (args: A): Promise<CallToolResult> => {
    try {
      return await fn(args);
    } catch (e) {
      return fail((e as Error).message);
    }
  };

const langSchema = z.enum(['applescript', 'javascript']).optional().describe('Script language; default applescript. "javascript" = JXA.');
const paramSchema = z.object({
  name: z.string().describe('Parameter name; maps to argv position in declaration order'),
  description: z.string().optional(),
  required: z.boolean().optional(),
});

export function createServer(deps: ServerDeps): { server: McpServer; sync: () => Promise<void> } {
  const { runner, store } = deps;
  const dialog = deps.dialog ?? nativeDialog;
  const server = new McpServer(
    { name: 'mcp-osx', version: deps.version ?? '0.0.0' },
    {
      instructions: [
        'Control macOS through osascript.',
        'Prefer the named tools (dark mode, Safari, Spotify, volume, Wi-Fi, apps). For anything else:',
        '1) list_scriptable_apps / get_app_dictionary to learn what an app supports,',
        '2) run_applescript (the user must approve each script; pass inputs via `args` and read them with `on run argv`),',
        '3) pass saveAs to keep an approved script as a reusable workflow_<name> tool.',
      ].join('\n'),
    },
  );

  const elicit: Elicit = async (message) => {
    if (!server.server.getClientCapabilities()?.elicitation) throw new Error('no elicitation');
    const r = await server.server.elicitInput({
      message,
      requestedSchema: {
        type: 'object',
        properties: { approve: { type: 'boolean', title: 'Approve', description: 'Check to allow this action' } },
        required: ['approve'],
      },
    });
    return r.action === 'accept' && r.content?.approve === true ? 'accept' : r.action === 'cancel' ? 'cancel' : 'decline';
  };
  const ask = (req: ConfirmRequest) =>
    confirm(req, { elicit: server.server.getClientCapabilities()?.elicitation ? elicit : undefined, runner, dialog });

  const exec = async (script: string, lang: Lang | undefined, args: string[], timeoutMs?: number) => {
    const r = await runner({ script, lang, args, timeoutMs });
    return r.code === 0 ? { ok: true as const, out: r.stdout } : { ok: false as const, out: explainError(r.stderr || `osascript exited with ${r.code}`) };
  };

  // ---- named actions ----
  for (const a of actions) {
    server.registerTool(
      a.name,
      { description: a.description, inputSchema: a.schema, annotations: { destructiveHint: false, openWorldHint: false } },
      guard(async (input: Record<string, unknown>) => {
        const built = a.build(input, { config: await deps.config() });
        const r = await exec(built.script, built.lang, built.args, built.timeoutMs);
        return r.ok ? ok(r.out) : fail(r.out);
      }),
    );
  }

  // ---- raw scripts ----
  server.registerTool(
    'run_applescript',
    {
      description:
        'Run an arbitrary AppleScript (or JXA) after the user approves it in a confirmation prompt. ' +
        'Pass dynamic values via `args` (read with `on run argv` / `function run(argv)`) instead of embedding them. ' +
        'Set saveAs to store the approved script as a reusable workflow_<saveAs> tool whose `params` map to argv in order.',
      inputSchema: {
        script: z.string().min(1),
        language: langSchema,
        args: z.array(z.string()).optional().describe('Values passed as argv'),
        timeoutMs: z.number().int().min(100).max(MAX_TIMEOUT_MS).optional().describe(`Default ${DEFAULT_TIMEOUT_MS}`),
        saveAs: z.string().optional().describe('Workflow name: lowercase letters, digits, _'),
        description: z.string().optional().describe('Workflow description (with saveAs)'),
        params: z.array(paramSchema).optional().describe('Workflow parameters (with saveAs)'),
      },
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    guard(async ({ script, language, args = [], timeoutMs, saveAs, description, params = [] }) => {
      const lang: Lang = language ?? 'applescript';
      if (saveAs !== undefined && !validName(saveAs)) return fail(`Invalid workflow name "${saveAs}": use lowercase letters, digits and _ (start with a letter, max 48 chars)`);
      const existing = saveAs ? await store.get(saveAs) : undefined;
      const paramNote = params.length
        ? ` Future runs may pass ANY value for: ${params.map((p, i) => `${p.name} (argv ${i + 1})`).join(', ')}.`
        : '';
      const note = saveAs
        ? `If it succeeds it will be saved as workflow "${saveAs}"${existing ? ' (replacing the existing one)' : ''} and can then run WITHOUT asking.${paramNote}`
        : undefined;
      const argNote = args.length ? `\nargv: ${JSON.stringify(args)}` : '';
      if (!(await ask({ title: 'Allow the agent to run this script?', script, lang, note: (note ?? '') + argNote || undefined })))
        return fail('Denied by user. The script was not run.');
      const r = await exec(script, lang, args, timeoutMs);
      if (!r.ok) return fail(r.out + (saveAs ? '\nNot saved as a workflow because it failed.' : ''));
      if (saveAs) {
        await store.save({ name: saveAs, description: description ?? '', lang, script, params });
        await sync();
        return ok(`${r.out || '(no output)'}\nSaved as workflow_${saveAs}.`);
      }
      return ok(r.out);
    }),
  );

  // ---- dictionary discovery ----
  server.registerTool(
    'list_scriptable_apps',
    { description: 'List installed apps that ship an AppleScript dictionary.', inputSchema: {}, annotations: { readOnlyHint: true } },
    guard(async () => ok((await listScriptableApps()).map((a) => `${a.name}\t${a.path}`).join('\n'))),
  );
  server.registerTool(
    'get_app_dictionary',
    {
      description: "Summarize an app's AppleScript dictionary (commands, classes, properties, enums). Use filter to narrow to a suite/command/class.",
      inputSchema: { app: z.string().describe('App name (e.g. "Spotify") or absolute .app path'), filter: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    guard(async ({ app, filter }) => ok(await getAppDictionary(app, filter))),
  );

  // ---- workflows ----
  const runWorkflow = async (name: string, input: Record<string, string>): Promise<CallToolResult> => {
    const w = await store.get(name);
    if (!w) return fail(`No workflow named "${name}". Use list_workflows.`);
    const args = argsFor(w, input);
    if (!store.isApproved(w)) {
      const allowed = await ask({
        title: `Workflow "${name}" changed. Allow it to run?`,
        script: w.script,
        lang: w.lang,
        note: 'Script changed on disk since approval. Approving re-saves its approval.',
      });
      if (!allowed) return fail('Denied by user: the workflow script changed since it was approved.');
      await store.reapprove(w);
    }
    const r = await exec(w.script, w.lang, args);
    return r.ok ? ok(r.out) : fail(r.out);
  };

  server.registerTool(
    'list_workflows',
    { description: 'List saved workflows.', inputSchema: {}, annotations: { readOnlyHint: true } },
    guard(async () => {
      const ws = await store.list();
      if (!ws.length) return ok('No saved workflows. Save one with run_applescript saveAs.');
      return ok(ws.map((w) => `${w.name}(${w.params.map((p) => p.name + (p.required ? '' : '?')).join(', ')})${store.isApproved(w) ? '' : ' [changed, needs re-approval]'} — ${w.description}`).join('\n'));
    }),
  );
  server.registerTool(
    'run_workflow',
    {
      description: 'Run a saved workflow by name (same as calling workflow_<name>).',
      inputSchema: { name: z.string(), params: z.record(z.string(), z.string()).optional() },
    },
    guard(async ({ name, params }) => runWorkflow(name, params ?? {})),
  );
  server.registerTool(
    'delete_workflow',
    { description: 'Delete a saved workflow (asks the user to confirm).', inputSchema: { name: z.string() }, annotations: { destructiveHint: true } },
    guard(async ({ name }) => {
      const w = await store.get(name);
      if (!w) return fail(`No workflow named "${name}".`);
      if (!(await ask({ title: `Delete workflow "${name}"?`, script: w.script, lang: w.lang, note: 'This removes the saved workflow below.' })))
        return fail('Denied by user. Workflow kept.');
      await store.delete(name);
      await sync();
      return ok(`Deleted workflow ${name}.`);
    }),
  );

  // ---- dynamic workflow_<name> tools ----
  const registered = new Map<string, { key: string; tool: RegisteredTool }>();
  const register = (w: Workflow) => {
    const shape: Record<string, z.ZodType<string | undefined>> = {};
    for (const p of w.params) {
      const s = p.description ? z.string().describe(p.description) : z.string();
      shape[p.name] = p.required ? s : s.optional();
    }
    return server.registerTool(
      `workflow_${w.name}`,
      { description: `Saved workflow: ${w.description || w.name}`, inputSchema: shape },
      guard(async (input: Record<string, unknown>) => runWorkflow(w.name, input as Record<string, string>)),
    );
  };
  let syncing: Promise<void> = Promise.resolve();
  const sync = (): Promise<void> =>
    (syncing = syncing.then(async () => {
      const ws = await store.list();
      const seen = new Set<string>();
      for (const w of ws) {
        seen.add(w.name);
        const key = JSON.stringify([w.description, w.params]);
        const cur = registered.get(w.name);
        if (cur?.key === key) continue;
        cur?.tool.remove();
        registered.set(w.name, { key, tool: register(w) });
      }
      for (const [name, { tool }] of registered) if (!seen.has(name)) (tool.remove(), registered.delete(name));
    }).catch(() => {}));

  return { server, sync };
}
