import { McpServer, type CallToolResult, type InputRequiredResult, type RegisteredTool, type ServerContext } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { actionGroups, selectActions } from './actions/index.js';
import type { Action } from './actions/types.js';
import { searchActions } from './search.js';
import { outputSchemaFor, parseRecords } from './structured.js';
import type { Config } from './config.js';
import type { SkillsExtension } from '@modelcontextprotocol/server/ext/skills';
import { createApproval } from './approval.js';
import { nativeDialog, type Dialog } from './confirm.js';
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
  /** full: one MCP tool per named action (best with clients that defer/search tools).
   *  compact: search_actions + run_action instead (small up-front context). */
  mode?: 'full' | 'compact';
  /** Limit named actions to these app groups (see actionGroups). */
  apps?: string[];
  /** Skills (MCP skills extension) to publish, e.g. loadBundledSkills(). */
  skills?: SkillsExtension;
};

const ok = (text: string): CallToolResult => ({ content: [{ type: 'text', text: text === '' ? '(no output)' : text }] });
const fail = (text: string): CallToolResult => ({ content: [{ type: 'text', text }], isError: true });

/** Run a handler, turning thrown errors into MCP error results. */
type ToolReturn = CallToolResult | InputRequiredResult;
const guard =
  <A>(fn: (args: A, ctx: ServerContext) => Promise<ToolReturn>) =>
  async (args: A, ctx: ServerContext): Promise<ToolReturn> => {
    try {
      return await fn(args, ctx);
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
  let verifyState: ((state: string, ctx: ServerContext) => Promise<unknown>) | undefined;
  const server = new McpServer(
    { name: 'mcp-osx', version: deps.version ?? '0.0.0' },
    {
      requestState: { verify: (state, ctx) => verifyState!(state, ctx) },
      instructions: [
        'Control macOS through osascript.',
        `Named actions are prefixed by app: ${Object.keys(actionGroups).filter((g) => !deps.apps || deps.apps.includes(g)).map((g) => `${g}_*`).join(', ')}.`,
        (deps.mode ?? 'full') === 'compact'
          ? 'Find them with search_actions and call them with run_action. They run without confirmation.'
          : 'They run without confirmation. If your tools are deferred, search by app name or task words (e.g. "spotify", "calendar event").',
        'For anything else:',
        '1) list_scriptable_apps / get_app_dictionary to learn what an app supports,',
        '2) run_applescript (the user must approve each script; pass inputs via `args` and read them with `on run argv`),',
        '3) pass saveAs to keep an approved script as a reusable workflow_<name> tool.',
      ].join('\n'),
    },
  );

  const approval = createApproval({ runner, dialog, getServer: () => server });
  verifyState = approval.verifyState;
  const ask = approval.approve;

  const exec = async (script: string, lang: Lang | undefined, args: string[], timeoutMs?: number) => {
    const r = await runner({ script, lang, args, timeoutMs });
    return r.code === 0 ? { ok: true as const, out: r.stdout } : { ok: false as const, out: explainError(r.stderr || `osascript exited with ${r.code}`) };
  };

  // ---- named actions ----
  const selected = selectActions(deps.apps);
  const runNamed = async (a: Action, input: Record<string, unknown>): Promise<CallToolResult> => {
    const built = a.build(input, { config: await deps.config() });
    let r = await exec(built.script, built.lang, built.args, built.timeoutMs);
    // -600: the target app (often System Events, which quits when idle) was shutting down,
    // so the command was never delivered. Retrying once is safe.
    if (!r.ok && /\(-600\)/.test(r.out)) r = await exec(built.script, built.lang, built.args, built.timeoutMs);
    if (!r.ok) return fail(r.out);
    if (!a.output) return ok(r.out);
    return { ...ok(r.out), structuredContent: parseRecords(r.out, a.output.columns) };
  };

  if ((deps.mode ?? 'full') === 'full') {
    for (const a of selected) {
      server.registerTool(
        a.name,
        {
          description: a.description,
          inputSchema: z.object(a.schema),
          ...(a.output ? { outputSchema: outputSchemaFor(a.output.columns) } : {}),
          annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
        },
        guard(async (input: Record<string, unknown>) => runNamed(a, input)),
      );
    }
  } else {
    const byName = new Map(selected.map((a) => [a.name, a]));
    const groups = Object.keys(actionGroups).filter((g) => !deps.apps || deps.apps.includes(g));
    server.registerTool(
      'search_actions',
      {
        description:
          `Find named macOS actions (no confirmation needed) by keywords, e.g. "pause song", "dark mode", "open url chrome". ` +
          `Returns matching actions with full JSON input schemas; call them with run_action. ` +
          `Empty query lists every action name by app. Apps: ${groups.join(', ')}.`,
        inputSchema: z.object({ query: z.string().describe('Keywords describing what to do'), limit: z.number().int().min(1).max(20).optional().describe('Default 5') }),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      guard(async ({ query, limit }) => {
        if (!query.trim())
          return ok(groups.map((g) => `${g}: ${actionGroups[g].map((a) => a.name).join(', ')}`).join('\n'));
        const hits = searchActions(selected, query, limit ?? 5);
        if (!hits.length) return ok('No matching action. Try other words, search_actions with an empty query, or get_app_dictionary + run_applescript.');
        return ok(
          JSON.stringify(
            hits.map((a) => ({
              name: a.name,
              description: a.description,
              inputSchema: z.toJSONSchema(z.object(a.schema)),
              ...(a.output ? { outputSchema: z.toJSONSchema(outputSchemaFor(a.output.columns)) } : {}),
            })),
            null,
            1,
          ),
        );
      }),
    );
    server.registerTool(
      'run_action',
      {
        description: 'Run a named macOS action found with search_actions. args must match its inputSchema.',
        inputSchema: z.object({ name: z.string(), args: z.record(z.string(), z.unknown()).optional() }),
        annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      },
      guard(async ({ name, args }) => {
        const a = byName.get(name);
        if (!a) return fail(`Unknown action "${name}". Use search_actions to find one.`);
        const parsed = z.object(a.schema).safeParse(args ?? {});
        if (!parsed.success) return fail(`Invalid args for ${name}: ${z.prettifyError(parsed.error)}`);
        return runNamed(a, parsed.data);
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
        'Set saveAs to store the approved script as a reusable workflow_<saveAs> tool whose `params` map to argv in order. ' +
        'Example: {"script":"on run argv\\ntell application \\"Safari\\" to open location (\\"https://github.com/\\" & item 1 of argv)\\nend run",' +
        '"args":["anthropics"],"saveAs":"open_github","description":"Open a GitHub org or repo","params":[{"name":"path","required":true}]}',
      inputSchema: z.object({
        script: z.string().min(1),
        language: langSchema,
        args: z.array(z.string()).optional().describe('Values passed as argv'),
        timeoutMs: z.number().int().min(100).max(MAX_TIMEOUT_MS).optional().describe(`Default ${DEFAULT_TIMEOUT_MS}`),
        saveAs: z.string().optional().describe('Workflow name: lowercase letters, digits, _'),
        description: z.string().optional().describe('Workflow description (with saveAs)'),
        params: z.array(paramSchema).optional().describe('Workflow parameters (with saveAs)'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    guard(async ({ script, language, args = [], timeoutMs, saveAs, description, params = [] }, ctx) => {
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
      const decision = await ask({ title: 'Allow the agent to run this script?', script, lang, note: (note ?? '') + argNote || undefined }, ctx);
      if (typeof decision !== 'boolean') return decision;
      if (!decision) return fail('Denied by user. The script was not run.');
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
    { description: 'List installed apps that ship an AppleScript dictionary.', inputSchema: z.object({}), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
    guard(async () => ok((await listScriptableApps()).map((a) => `${a.name}\t${a.path}`).join('\n'))),
  );
  server.registerTool(
    'get_app_dictionary',
    {
      description: "Summarize an app's AppleScript dictionary (commands, classes, properties, enums). Use filter to narrow to a suite/command/class.",
      inputSchema: z.object({ app: z.string().describe('App name (e.g. "Spotify") or absolute .app path'), filter: z.string().optional() }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    guard(async ({ app, filter }) => ok(await getAppDictionary(app, filter))),
  );

  // ---- workflows ----
  const runWorkflow = async (name: string, input: Record<string, string>, ctx: ServerContext): Promise<CallToolResult | InputRequiredResult> => {
    const w = await store.get(name);
    if (!w) return fail(`No workflow named "${name}". Use list_workflows.`);
    const args = argsFor(w, input);
    if (!store.isApproved(w)) {
      const allowed = await ask({
        title: `Workflow "${name}" changed. Allow it to run?`,
        script: w.script,
        lang: w.lang,
        note: 'Script changed on disk since approval. Approving re-saves its approval.',
      }, ctx);
      if (typeof allowed !== 'boolean') return allowed;
      if (!allowed) return fail('Denied by user: the workflow script changed since it was approved.');
      await store.reapprove(w);
    }
    const r = await exec(w.script, w.lang, args);
    return r.ok ? ok(r.out) : fail(r.out);
  };

  server.registerTool(
    'list_workflows',
    { description: 'List saved workflows.', inputSchema: z.object({}), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
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
      inputSchema: z.object({ name: z.string(), params: z.record(z.string(), z.string()).optional() }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    guard(async ({ name, params }, ctx) => runWorkflow(name, params ?? {}, ctx)),
  );
  server.registerTool(
    'delete_workflow',
    { description: 'Delete a saved workflow (asks the user to confirm).', inputSchema: z.object({ name: z.string() }), annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false } },
    guard(async ({ name }, ctx) => {
      const w = await store.get(name);
      if (!w) return fail(`No workflow named "${name}".`);
      const decision = await ask({ title: `Delete workflow "${name}"?`, script: w.script, lang: w.lang, note: 'This removes the saved workflow below.' }, ctx);
      if (typeof decision !== 'boolean') return decision;
      if (!decision) return fail('Denied by user. Workflow kept.');
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
      {
        description: `Saved workflow: ${w.description || w.name}`,
        inputSchema: z.object(shape),
        annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
      },
      guard(async (input: Record<string, unknown>, ctx) => runWorkflow(w.name, input as Record<string, string>, ctx)),
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

  deps.skills?.attach(server);

  return { server, sync };
}
