#!/usr/bin/env node
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { dataDir, loadConfig } from './config.js';
import { runOsa } from './osascript.js';
import { createServer } from './server.js';
import { loadBundledSkills } from './skills.js';
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
const skills = await loadBundledSkills();
const options = { runner: runOsa, store, config: loadConfig, version, mode, apps: apps?.length ? apps : undefined, skills } as const;

// Fail fast on a bad MCP_OSX_APPS value rather than on the first connection.
try {
  createServer(options);
} catch (e) {
  console.error(`mcp-osx: ${(e as Error).message}`);
  process.exit(1);
}

// serveStdio picks the protocol era from the opening exchange and pins one
// instance from this factory for the connection.
const handle = serveStdio(() => {
  const { server, sync } = createServer(options);
  void sync();
  store.onChange(() => void sync());
  return server;
});

const shutdown = () => {
  store.close();
  void handle.close();
  process.exit(0);
};
process.stdin.on('end', shutdown);
process.stdin.on('close', shutdown);
