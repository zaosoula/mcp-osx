#!/usr/bin/env node
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { dataDir, loadConfig } from './config.js';
import { runOsa } from './osascript.js';
import { createServer } from './server.js';
import { WorkflowStore } from './workflows.js';

if (process.platform !== 'darwin') {
  console.error('mcp-osx only runs on macOS.');
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
const dir = join(dataDir(), 'workflows');
mkdirSync(dir, { recursive: true });

const store = new WorkflowStore(dir);
const mode = process.env.MCP_OSX_MODE === 'compact' ? 'compact' : 'full';
const apps = process.env.MCP_OSX_APPS?.split(',').map((s) => s.trim()).filter(Boolean);
const { server, sync } = createServer({ runner: runOsa, store, config: loadConfig, version, mode, apps: apps?.length ? apps : undefined });
await sync();
store.onChange(() => void sync());
const shutdown = () => {
  store.close();
  process.exit(0);
};
process.stdin.on('end', shutdown);
process.stdin.on('close', shutdown);
server.server.onclose = shutdown;
await server.connect(new StdioServerTransport());
