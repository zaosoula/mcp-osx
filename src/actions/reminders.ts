import { z } from 'zod';
import { type Action, as, noArgs, bool } from './types.js';
import { AS_HELPERS, dateArgs, isoDate, isoDateParts } from './helpers.js';

/** Reminders. List, create and complete reminders. No delete. */

const LIST = as([
  ...AS_HELPERS,
  'on run argv',
  'set lName to item 1 of argv',
  'set incl to (item 2 of argv) is "true"',
  'set lim to (item 3 of argv) as integer',
  'set out to {}',
  'tell application "Reminders"',
  '  if lName is "" then',
  '    set ls to every list',
  '  else',
  '    set ls to (every list whose name is lName)',
  '    if (count of ls) = 0 then return "no list named " & lName',
  '  end if',
  '  repeat with l in ls',
  '    set ln to name of l',
  '    if incl then',
  '      set q to a reference to (every reminder of l)',
  '    else',
  '      set q to a reference to (every reminder of l whose completed is false)',
  '    end if',
  '    set ns to name of q',
  '    set ds to due date of q',
  '    set cs to completed of q',
  '    repeat with i from 1 to count of ns',
  '      if (count of out) >= lim then exit repeat',
  '      set end of out to my cl(item i of ns) & tab & my fmt(item i of ds) & tab & my cl(ln) & tab & (item i of cs as text)',
  '    end repeat',
  '    if (count of out) >= lim then exit repeat',
  '  end repeat',
  'end tell',
  'if (count of out) = 0 then return "no reminders"',
  'return my joinL(out, linefeed)',
  'end run',
]);

const CREATE = as([
  ...AS_HELPERS,
  'on run argv',
  'set ttl to item 1 of argv',
  'set lName to item 2 of argv',
  'set nts to item 3 of argv',
  'set hasDue to (item 4 of argv) is "true"',
  'tell application "Reminders"',
  '  if lName is "" then',
  '    set l to default list',
  '  else',
  '    set ls to (every list whose name is lName)',
  '    if (count of ls) = 0 then return "no list named " & lName',
  '    set l to item 1 of ls',
  '  end if',
  '  set props to {name:ttl}',
  '  if nts is not "" then set props to props & {body:nts}',
  '  if hasDue then set props to props & {due date:my mkd(argv, 5)}',
  '  set r to make new reminder at end of reminders of l with properties props',
  '  return "created " & my cl(name of r) & tab & my fmt(due date of r) & tab & my cl(name of l)',
  'end tell',
  'end run',
]);

const COMPLETE = as([
  'on run argv',
  'set lName to item 1 of argv',
  'set ttl to item 2 of argv',
  'tell application "Reminders"',
  '  set ls to (every list whose name is lName)',
  '  if (count of ls) = 0 then return "no list named " & lName',
  '  set rs to (every reminder of (item 1 of ls) whose name is ttl and completed is false)',
  '  if (count of rs) = 0 then return "no incomplete reminder named " & ttl & " in " & lName',
  '  set completed of (item 1 of rs) to true',
  'end tell',
  'return "completed " & ttl',
  'end run',
]);

export const remindersActions: Action[] = [
  {
    name: 'reminders_list_lists',
    description: 'List Reminders lists: account and list name, one per line.',
    schema: {},
    build: noArgs(as([
      'set out to {}',
      'tell application "Reminders"',
      '  repeat with a in every account',
      '    set an to name of a',
      '    repeat with n in (name of every list of a)',
      '      set end of out to an & tab & n',
      '    end repeat',
      '  end repeat',
      'end tell',
      'set AppleScript\'s text item delimiters to linefeed',
      'return out as text',
    ])),
  },
  {
    name: 'reminders_list',
    description: 'List reminders (incomplete only by default): name, due date, list, completed.',
    schema: {
      list: z.string().optional().describe('List name (default: all lists)'),
      includeCompleted: z.boolean().optional().describe('Include completed reminders (default false)'),
      limit: z.number().int().min(1).max(200).optional().describe('Max items (default 50, max 200)'),
    },
    build: ({ list, includeCompleted, limit }) => ({
      script: LIST,
      args: [list ?? '', bool(!!includeCompleted), String(limit ?? 50)],
    }),
  },
  {
    name: 'reminders_create',
    description: 'Create a reminder (in the default list unless one is given) and return its name, due date and list.',
    schema: {
      title: z.string().min(1),
      list: z.string().optional().describe('List name (default: the default list)'),
      due: isoDate.optional(),
      notes: z.string().optional(),
    },
    build: ({ title, list, due, notes }) => ({
      script: CREATE,
      args: [title, list ?? '', notes ?? '', bool(!!due), ...(due ? dateArgs(isoDateParts(due)) : ['0', '0', '0', '0', '0'])],
    }),
  },
  {
    name: 'reminders_complete',
    description: 'Mark the first incomplete reminder with this exact name in the given list as completed (reversible).',
    schema: { list: z.string().min(1).describe('List name'), title: z.string().min(1).describe('Exact reminder name') },
    build: ({ list, title }) => ({ script: COMPLETE, args: [list, title] }),
  },
];
