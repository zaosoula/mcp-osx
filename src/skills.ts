import { fileURLToPath } from 'node:url';
import type { SkillCatalog } from '@modelcontextprotocol/server/ext/skills';
import { loadSkills } from '@modelcontextprotocol/server/ext/skills/node';

/** The skills shipped in this package's `skills/` folder (sibling of `src/` and `dist/`). */
export const BUNDLED_SKILLS_DIR = fileURLToPath(new URL('../skills/', import.meta.url));

export function loadBundledSkills(): Promise<SkillCatalog> {
  return loadSkills(BUNDLED_SKILLS_DIR, { strict: true });
}
