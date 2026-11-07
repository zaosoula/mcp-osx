import { z } from 'zod';
import { type Action, as, noArgs } from './types.js';
import { AS_HELPERS } from './helpers.js';

/** Notes. List, read and create notes. No delete, no move. */

const MAX_TEXT = 4000;

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Plain text to Notes HTML: escaped, one <div> per line, empty lines kept. */
const toNoteHtml = (s: string) =>
  s.split(/\r\n|\r|\n/).map((l) => `<div>${l === '' ? '<br>' : escapeHtml(l)}</div>`).join('');

const LIST = as([
  ...AS_HELPERS,
  'on run argv',
  'set fName to item 1 of argv',
  'set lim to (item 2 of argv) as integer',
  'tell application "Notes"',
  '  if fName is "" then',
  '    set q to a reference to every note',
  '  else',
  '    set fs to (every folder whose name is fName)',
  '    if (count of fs) = 0 then return "no folder named " & fName',
  '    set q to a reference to every note of (item 1 of fs)',
  '  end if',
  '  set ns to name of q',
  '  set ms to modification date of q',
  'end tell',
  'set n to count of ns',
  'if n = 0 then return "no notes"',
  'set out to {}',
  'repeat with i from 1 to n',
  '  if i > lim then exit repeat',
  '  set end of out to my cl(item i of ns) & tab & my fmt(item i of ms)',
  'end repeat',
  'set r to my joinL(out, linefeed)',
  'if n > lim then set r to r & linefeed & "(" & (n - lim) & " more not shown)"',
  'return r',
  'end run',
]);

const READ = as([
  ...AS_HELPERS,
  'on run argv',
  'set nName to item 1 of argv',
  'set fName to item 2 of argv',
  'set mx to (item 3 of argv) as integer',
  'tell application "Notes"',
  '  if fName is "" then',
  '    set ns to (every note whose name is nName)',
  '  else',
  '    set fs to (every folder whose name is fName)',
  '    if (count of fs) = 0 then return "no folder named " & fName',
  '    set ns to (every note of (item 1 of fs) whose name is nName)',
  '  end if',
  '  if (count of ns) = 0 then return "no note named " & nName',
  '  set nt to item 1 of ns',
  '  if password protected of nt then return "note " & nName & " is password protected"',
  '  set fn to fName',
  '  try',
  '    set fn to name of (container of nt)',
  '  end try',
  '  set hdr to my cl(name of nt) & tab & my fmt(modification date of nt) & tab & my cl(fn)',
  '  set t to plaintext of nt',
  'end tell',
  'if (length of t) > mx then return hdr & linefeed & (text 1 thru mx of t) & linefeed & "[truncated: " & (length of t) & " chars total, showing first " & mx & "]"',
  'return hdr & linefeed & t',
  'end run',
]);

const CREATE = as([
  'on run argv',
  'set html to item 1 of argv',
  'set fName to item 2 of argv',
  'tell application "Notes"',
  '  if fName is "" then',
  '    set f to default folder of default account',
  '  else',
  '    set fs to (every folder whose name is fName)',
  '    if (count of fs) = 0 then return "no folder named " & fName',
  '    set f to item 1 of fs',
  '  end if',
  '  set nt to make new note at f with properties {body:html}',
  '  return "created " & (name of nt) & " in " & (name of f)',
  'end tell',
  'end run',
]);

export const notesActions: Action[] = [
  {
    name: 'notes_list_folders',
    description: 'List Notes folders: account, folder name and note count, one per line.',
    schema: {},
    build: noArgs(as([
      'set out to {}',
      'tell application "Notes"',
      '  repeat with a in every account',
      '    set an to name of a',
      '    repeat with f in every folder of a',
      '      set end of out to an & tab & (name of f) & tab & ((count of notes of f) as text)',
      '    end repeat',
      '  end repeat',
      'end tell',
      'set AppleScript\'s text item delimiters to linefeed',
      'return out as text',
    ])),
  },
  {
    name: 'notes_list',
    description: 'List notes (optionally in one folder): name and modification date, one per line.',
    schema: {
      folder: z.string().optional().describe('Folder name (default: all folders)'),
      limit: z.number().int().min(1).max(200).optional().describe('Max items (default 20, max 200)'),
    },
    build: ({ folder, limit }) => ({ script: LIST, args: [folder ?? '', String(limit ?? 20)] }),
  },
  {
    name: 'notes_read',
    description: `Return a note's name, modification date, folder and plaintext (truncated to ${MAX_TEXT} chars).`,
    schema: { name: z.string().min(1).describe('Exact note name'), folder: z.string().optional().describe('Folder name') },
    build: ({ name, folder }) => ({ script: READ, args: [name, folder ?? '', String(MAX_TEXT)] }),
  },
  {
    name: 'notes_create',
    description: 'Create a note from a title and plain-text body (in the default folder unless one is given); returns its name.',
    schema: {
      title: z.string().min(1),
      body: z.string().describe('Plain text; newlines are kept'),
      folder: z.string().optional().describe('Folder name (default: default folder of the default account)'),
    },
    build: ({ title, body, folder }) => ({
      script: CREATE,
      args: [`<div><h1>${escapeHtml(title)}</h1></div>${toNoteHtml(body)}`, folder ?? ''],
    }),
  },
];
