import { z } from 'zod';

export type Records = { items: Record<string, string>[]; notes: string[] };

/**
 * Parse tab-separated stdout into records. Only lines with exactly
 * `columns.length` fields are records (single-column: every non-empty line);
 * anything else (status messages, "N more not shown") is kept as a note.
 */
export function parseRecords(stdout: string, columns: string[]): Records {
  const items: Record<string, string>[] = [];
  const notes: string[] = [];
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    const fields = line.split('\t');
    if (fields.length === columns.length && (columns.length > 1 || !/^[(…]/.test(line))) {
      items.push(Object.fromEntries(columns.map((c, i) => [c, fields[i]])));
    } else notes.push(line);
  }
  return { items, notes };
}

export function outputSchemaFor(columns: string[]) {
  return z.object({
    items: z.array(z.object(Object.fromEntries(columns.map((c) => [c, z.string()])))),
    notes: z.array(z.string()).describe('Status or truncation messages that are not records'),
  });
}
