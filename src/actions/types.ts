import type { z } from 'zod';
import type { Config } from '../config.js';
import type { Lang } from '../osascript.js';

/** timeoutMs: override the default osascript timeout for slow apps (capped by the runner). */
export type Built = { script: string; lang?: Lang; args: string[]; timeoutMs?: number };
export type ActionContext = { config: Config };
export type Action = {
  name: string;
  description: string;
  schema: z.ZodRawShape;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build(input: any, ctx: ActionContext): Built;
};

// Every action script is constant. Inputs only ever travel through argv.
export const as = (lines: string[]) => lines.join('\n');
export const noArgs = (script: string) => () => ({ script, args: [] });
export const bool = (b: boolean) => (b ? 'true' : 'false');
