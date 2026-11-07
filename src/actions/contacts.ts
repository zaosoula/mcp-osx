import { z } from 'zod';
import { type Action, as } from './types.js';
import { AS_HELPERS } from './helpers.js';

/** Contacts. Read-only search. */

const SEARCH = as([
  ...AS_HELPERS,
  'on run argv',
  'set qy to item 1 of argv',
  'set lim to (item 2 of argv) as integer',
  'set out to {}',
  'tell application "Contacts"',
  '  set ps to (every person whose name contains qy or organization contains qy)',
  '  set n to count of ps',
  '  repeat with i from 1 to n',
  '    if i > lim then exit repeat',
  '    set p to item i of ps',
  '    set es to value of every email of p',
  '    set ph to value of every phone of p',
  '    set end of out to my cl(name of p) & tab & my cl(my joinL(es, ", ")) & tab & my cl(my joinL(ph, ", ")) & tab & my cl(organization of p)',
  '  end repeat',
  'end tell',
  'if n = 0 then return "no contacts matching " & qy',
  'set r to my joinL(out, linefeed)',
  'if n > lim then set r to r & linefeed & "(" & (n - lim) & " more not shown)"',
  'return r',
  'end run',
]);

export const contactsActions: Action[] = [
  {
    name: 'contacts_search',
    description: 'Search Contacts by name or organization (read-only): name, emails, phones, organization, one per line.',
    schema: {
      query: z.string().min(1).describe('Text contained in the name or organization'),
      limit: z.number().int().min(1).max(200).optional().describe('Max results (default 20, max 200)'),
    },
    build: ({ query, limit }) => ({ script: SEARCH, args: [query, String(limit ?? 20)] }),
  },
];
