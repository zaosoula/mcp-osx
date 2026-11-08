#!/usr/bin/env node
// Copies package.json's version into server.json (MCP Registry metadata).
import { readFileSync, writeFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const url = new URL('../server.json', import.meta.url);
const server = JSON.parse(readFileSync(url, 'utf8'));
server.version = version;
for (const p of server.packages ?? []) p.version = version;
writeFileSync(url, JSON.stringify(server, null, 2) + '\n');
console.log(`server.json -> ${version}`);
