import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { type Action, as, noArgs } from './types.js';
import { CL } from './helpers.js';

/** Finder: reveal, open folders, read selection and folder listings. Nothing that moves, deletes or ejects. */
const fsPath = z
  .string()
  .min(1)
  .max(1024)
  .refine((p) => p.startsWith('/') || p.startsWith('~/'), 'Path must be absolute (start with / or ~/)')
  .describe('Absolute POSIX path, or ~/… for the home folder');

const expand = (p: string) => (p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p);

// Resolves argv item 1 to an alias, with a clear error when it does not exist.
const RESOLVE = [
  'set p to item 1 of argv',
  'try',
  '  set a to (POSIX file p) as alias',
  'on error',
  '  error "path does not exist: " & p',
  'end try',
];

export const finderActions: Action[] = [
  {
    name: 'finder_reveal',
    description: 'Reveal (select) a file or folder in Finder and bring Finder to the front.',
    schema: { path: fsPath },
    build: ({ path: p }) => ({
      script: as([
        'on run argv',
        ...RESOLVE,
        'tell application "Finder"',
        '  reveal a',
        '  activate',
        'end tell',
        'return "revealed " & p',
        'end run',
      ]),
      args: [expand(p)],
    }),
  },
  {
    name: 'finder_open_folder',
    description: 'Open a folder in a new Finder window and bring Finder to the front; errors if the path is missing or not a folder.',
    schema: { path: fsPath },
    build: ({ path: p }) => ({
      script: as([
        'on run argv',
        ...RESOLVE,
        'tell application "Finder"',
        '  if class of (item a) is not in {folder, disk} then error "not a folder: " & p',
        '  make new Finder window to a',
        '  activate',
        'end tell',
        'return "opened " & p',
        'end run',
      ]),
      args: [expand(p)],
    }),
  },
  {
    name: 'finder_selection',
    description: 'Return the POSIX paths of the items selected in Finder, one per line (max 200).',
    schema: {},
    build: noArgs(as([
      'if application "Finder" is not running then return "Finder is not running"',
      'tell application "Finder" to set sel to selection as alias list',
      'set n to count of sel',
      'if n = 0 then return "nothing selected"',
      'set out to {}',
      'repeat with i from 1 to n',
      '  if i > 200 then',
      '    set end of out to "[truncated: " & n & " items selected]"',
      '    exit repeat',
      '  end if',
      '  set end of out to POSIX path of (item i of sel)',
      'end repeat',
      'set AppleScript\'s text item delimiters to linefeed',
      'return out as text',
    ])),
  },
  {
    name: 'finder_front_window_path',
    description: 'Return the POSIX path of the folder shown in the frontmost Finder window.',
    schema: {},
    build: noArgs(as([
      'if application "Finder" is not running then return "Finder is not running"',
      'tell application "Finder"',
      '  if (count of Finder windows) = 0 then return "no Finder window open"',
      '  try',
      '    set t to (target of front Finder window) as alias',
      '  on error',
      '    return "front Finder window has no folder target"',
      '  end try',
      'end tell',
      'return POSIX path of t',
    ])),
  },
  {
    name: 'finder_list_folder',
    description: 'List visible items in a folder, one per line (default 50, max 200). Read-only. Returns tab-separated: name, kind (folder/package/file).',
    schema: { path: fsPath, limit: z.number().int().min(1).max(200).optional().describe('Max items (default 50)') },
    output: { columns: ['name', 'kind'] },
    build: ({ path: p, limit }) => ({
      script: as([
        'on run argv',
        ...RESOLVE,
        'set lim to (item 2 of argv) as integer',
        '-- POSIX path of an alias resolves symlinks (/etc, /tmp) and ends with "/" for folders',
        'set rp to POSIX path of a',
        'if rp does not end with "/" then error "not a folder: " & p',
        'tell application "System Events"',
        '  set f to folder rp',
        '  set ns to name of every disk item of f',
        '  set vs to visible of every disk item of f',
        '  set ks to class of every disk item of f',
        'set out to {}',
        'set shown to 0',
        'set total to 0',
        'repeat with i from 1 to count of ns',
        '  if item i of vs then',
        '    set total to total + 1',
        '    if shown < lim then',
        '      set c to item i of ks',
        '      if c is folder then',
        '        set k to "folder"',
        '      else if c is file package then',
        '        set k to "package"',
        '      else',
        '        set k to "file"',
        '      end if',
        '      set end of out to my cl(item i of ns) & tab & k',
        '      set shown to shown + 1',
        '    end if',
        '  end if',
        'end repeat',
        'end tell',
        'if total = 0 then return "folder is empty"',
        'if total > shown then set end of out to "[truncated: " & shown & " of " & total & " items]"',
        'set AppleScript\'s text item delimiters to linefeed',
        'return out as text',
        'end run',
        ...CL,
      ]),
      args: [expand(p), String(limit ?? 50)],
    }),
  },
];
