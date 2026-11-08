#!/usr/bin/env node
// Regenerates the tool reference in README.md (between the tools markers) from dist/.
import { readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { actionGroups } from '../dist/actions/index.js';

const START = '<!-- tools:start -->';
const END = '<!-- tools:end -->';

const argsOf = (schema) => {
  const json = z.toJSONSchema(z.object(schema));
  const req = new Set(json.required ?? []);
  return Object.keys(json.properties ?? {})
    .map((k) => `\`${k}${req.has(k) ? '' : '?'}\``)
    .join(', ') || '—';
};
const esc = (s) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

const sections = Object.entries(actionGroups).map(([group, list]) => {
  const rows = list.map((a) => `| \`${a.name}\` | ${argsOf(a.schema)} | ${esc(a.description)} |`).join('\n');
  return `<details>\n<summary><b>${group}</b> — ${list.length} action${list.length === 1 ? '' : 's'}</summary>\n\n| Tool | Args | Description |\n|---|---|---|\n${rows}\n\n</details>`;
});
const total = Object.values(actionGroups).flat().length;
const block = `${START}\n_${total} named actions, generated from the source by \`npm run docs\`._\n\n${sections.join('\n\n')}\n${END}`;

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const i = readme.indexOf(START);
const j = readme.indexOf(END);
if (i < 0 || j < 0) throw new Error('README.md is missing the tools markers');
writeFileSync(new URL('../README.md', import.meta.url), readme.slice(0, i) + block + readme.slice(j + END.length));
console.log(`README tool reference updated (${total} actions).`);
