import { nativeDialog } from './dialog.js';
import type { Lang, Runner } from './osascript.js';

export { nativeDialog };
export type ConfirmRequest = { title: string; script: string; lang: Lang; note?: string };
export type ElicitOutcome = 'accept' | 'decline' | 'cancel';
export type Elicit = ((message: string) => Promise<ElicitOutcome>) | undefined;
export type Dialog = typeof nativeDialog;

export function elicitMessage(req: ConfirmRequest): string {
  const fence = '`'.repeat(Math.max(3, ...[...req.script.matchAll(/`+/g)].map((m) => m[0].length + 1)));
  return [req.title, req.note, '', `${fence}${req.lang}`, req.script, fence].filter((l) => l !== undefined).join('\n');
}

/**
 * Ask the user to approve a script. Uses MCP elicitation when available,
 * otherwise (or if elicitation fails) the native macOS dialog. Fails closed.
 */
export async function confirm(req: ConfirmRequest, deps: { elicit: Elicit; runner: Runner; dialog?: Dialog }): Promise<boolean> {
  const dialog = deps.dialog ?? nativeDialog;
  try {
    if (deps.elicit) {
      try {
        return (await deps.elicit(elicitMessage(req))) === 'accept';
      } catch {
        // client advertised elicitation but it failed: fall back to the dialog
      }
    }
    return await dialog(req, deps.runner);
  } catch {
    return false;
  }
}
