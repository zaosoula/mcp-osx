#!/usr/bin/env node
// Starts the built server over stdio and checks it answers like a real client expects.
// Needs no macOS permissions: only initialize, tools/list and skills/list are called.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = mkdtempSync(join(tmpdir(), 'mcp-osx-smoke-'));
const child = spawn(process.execPath, [new URL('../dist/index.js', import.meta.url).pathname], {
  env: { ...process.env, MCP_OSX_HOME: home },
  stdio: ['pipe', 'pipe', 'inherit'],
});
const send = (m) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n');
const fail = (msg) => {
  console.error(`smoke: FAIL ${msg}`);
  child.kill();
  process.exit(1);
};
const timer = setTimeout(() => fail('timed out'), 15_000);

const got = {};
let buf = '';
child.stdout.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const msg = JSON.parse(buf.slice(0, i));
    buf = buf.slice(i + 1);
    if (msg.id) got[msg.id] = msg;
    if (got[1] && got[2] && got[3]) check();
  }
});

send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } } });
send({ method: 'notifications/initialized' });
send({ id: 2, method: 'tools/list' });
send({ id: 3, method: 'skills/list', params: {} });

function check() {
  clearTimeout(timer);
  const tools = got[2].result?.tools ?? [];
  const skills = got[3].result?.skills ?? [];
  if (got[1].result?.serverInfo?.name !== 'mcp-osx') fail('bad serverInfo');
  if (tools.length < 80) fail(`only ${tools.length} tools`);
  for (const t of ['run_applescript', 'get_app_dictionary', 'system_set_dark_mode']) if (!tools.some((x) => x.name === t)) fail(`missing ${t}`);
  if (skills.length < 2) fail(`only ${skills.length} skills`);
  console.log(`smoke: OK (${tools.length} tools, ${skills.length} skills)`);
  child.kill();
  process.exit(0);
}
