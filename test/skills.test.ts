import { describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createServer } from '../src/server.js';
import { WorkflowStore } from '../src/workflows.js';
import { loadBundledSkills } from '../src/skills.js';
import { z } from 'zod';
// 2025-era links carry no cache fields, so check only what matters here.
const ListSkillsResultSchema = z.looseObject({ skills: z.array(z.looseObject({})) });

describe('skills', () => {
  it('bundled skills load and are listed over MCP', async () => {
    const skills = await loadBundledSkills();
    const { server } = createServer({
      runner: async () => ({ stdout: '', stderr: '', code: 0 }),
      store: new WorkflowStore(await mkdtemp(join(tmpdir(), 'sk-'))),
      config: async () => ({}),
      skills,
    });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 't', version: '0' });
    await server.connect(a);
    await client.connect(b);
    const res: any = await (client as any).request({ method: 'skills/list', params: {} }, ListSkillsResultSchema);
    const names = res.skills.map((s: any) => s.frontmatter.name);
    expect(names).toEqual(expect.arrayContaining(['applescript-authoring', 'macos-routines']));
    expect(res.skills[0].uri).toMatch(/^skill:\/\//);
    await client.close();
  });
});
