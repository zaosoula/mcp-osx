import { nativeDialog } from './dialog.js';
import type { Lang } from './osascript.js';

export { nativeDialog };
export type ConfirmRequest = { title: string; script: string; lang: Lang; note?: string };
export type Dialog = typeof nativeDialog;

export function elicitMessage(req: ConfirmRequest): string {
  const fence = '`'.repeat(Math.max(3, ...[...req.script.matchAll(/`+/g)].map((m) => m[0].length + 1)));
  return [req.title, req.note, '', `${fence}${req.lang}`, req.script, fence].filter((l) => l !== undefined).join('\n');
}
