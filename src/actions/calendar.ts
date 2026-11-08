import { z } from 'zod';
import { type Action, as, noArgs } from './types.js';

/** Calendar. Read events, create events (never with attendees), navigate the UI. */


import { AS_HELPERS, dateArgs, isoDate, isoDateParts } from './helpers.js';

const limit = (def: number) => z.number().int().min(1).max(200).optional().describe(`Max items (default ${def}, max 200)`);

const LIST_EVENTS = as([
  ...AS_HELPERS,
  'on run argv',
  'set f to my mkd(argv, 1)',
  'set t to my mkd(argv, 6)',
  'set calName to item 11 of argv',
  'set lim to (item 12 of argv) as integer',
  'set out to {}',
  'tell application "Calendar"',
  '  if calName is "" then',
  '    set cs to every calendar',
  '  else',
  '    set cs to (every calendar whose name is calName)',
  '    if (count of cs) = 0 then return "no calendar named " & calName',
  '  end if',
  '  repeat with c in cs',
  '    set cn to name of c',
  // One `whose` query per calendar (the slow part); then a few cheap property reads per matching event.
  '    set es to (every event of c whose start date >= f and start date <= t)',
  '    repeat with e in es',
  '      set end of out to my fmt(start date of e) & tab & my fmt(end date of e) & tab & my cl(summary of e) & tab & my cl(location of e) & tab & my cl(cn)',
  '    end repeat',
  '    if (count of out) >= 500 then exit repeat',
  '  end repeat',
  'end tell',
  'set n to count of out',
  'if n = 0 then return "no events"',
  // Insertion sort by line (lines start with a sortable start date).
  'repeat with i from 2 to n',
  '  set v to item i of out',
  '  set j to i - 1',
  '  repeat while j >= 1',
  '    if item j of out > v then',
  '      set item (j + 1) of out to item j of out',
  '      set j to j - 1',
  '    else',
  '      exit repeat',
  '    end if',
  '  end repeat',
  '  set item (j + 1) of out to v',
  'end repeat',
  'if n > lim then',
  '  return my joinL(items 1 thru lim of out, linefeed) & linefeed & "(" & (n - lim) & " more not shown)"',
  'end if',
  'return my joinL(out, linefeed)',
  'end run',
]);

const CREATE_EVENT = as([
  ...AS_HELPERS,
  'on run argv',
  'set sd to my mkd(argv, 1)',
  'set ed to my mkd(argv, 6)',
  'set ttl to item 11 of argv',
  'set calName to item 12 of argv',
  'set loc to item 13 of argv',
  'set nts to item 14 of argv',
  'tell application "Calendar"',
  '  if calName is "" then',
  '    set cs to (every calendar whose writable is true)',
  '    if (count of cs) = 0 then return "no writable calendar"',
  '    set c to item 1 of cs',
  '  else',
  '    set cs to (every calendar whose name is calName)',
  '    if (count of cs) = 0 then return "no calendar named " & calName',
  '    set c to item 1 of cs',
  '  end if',
  '  set props to {summary:ttl, start date:sd, end date:ed}',
  '  if loc is not "" then set props to props & {location:loc}',
  '  if nts is not "" then set props to props & {description:nts}',
  '  set e to make new event at end of events of c with properties props',
  '  return "created " & my cl(summary of e) & tab & my fmt(start date of e) & tab & my fmt(end date of e) & tab & my cl(name of c)',
  'end tell',
  'end run',
]);

const SHOW_DATE = as([
  ...AS_HELPERS,
  'on run argv',
  'set d to my mkd(argv, 1)',
  'set v to item 6 of argv',
  'tell application "Calendar"',
  '  activate',
  '  if v is "day" then',
  '    switch view to day view',
  '  else if v is "week" then',
  '    switch view to week view',
  '  else if v is "month" then',
  '    switch view to month view',
  '  end if',
  '  view calendar at d',
  'end tell',
  'return "showing " & my fmt(d)',
  'end run',
]);

export const calendarActions: Action[] = [
  {
    name: 'calendar_list_calendars',
    description: 'List Calendar calendars: name and writable flag, one per line.',
    schema: {},
    build: noArgs(as([
      'tell application "Calendar"',
      '  set ns to name of every calendar',
      '  set ws to writable of every calendar',
      'end tell',
      'set out to {}',
      'repeat with i from 1 to count of ns',
      '  set end of out to (item i of ns) & tab & (item i of ws as text)',
      'end repeat',
      'set AppleScript\'s text item delimiters to linefeed',
      'return out as text',
    ])),
  },
  {
    name: 'calendar_list_events',
    description: 'List Calendar events starting in a range (default today to 7 days ahead), sorted: start, end, summary, location, calendar. Recurring events show only their first occurrence.',
    schema: {
      from: isoDate.optional(),
      to: isoDate.optional(),
      calendar: z.string().optional().describe('Calendar name (default: all calendars)'),
      limit: limit(50),
    },
    build: ({ from, to, calendar, limit: lim }) => {
      const now = new Date();
      const f = from ? isoDateParts(from) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const t = to ? isoDateParts(to, true) : new Date(f.getFullYear(), f.getMonth(), f.getDate() + 7, 23, 59);
      // Calendar's `whose start date` queries are slow on big calendars (~70s seen for 18 calendars)
      return { script: LIST_EVENTS, args: [...dateArgs(f), ...dateArgs(t), calendar ?? '', String(lim ?? 50)], timeoutMs: 120_000 };
    },
  },
  {
    name: 'calendar_create_event',
    description: 'Create a Calendar event (no attendees, no invitations sent) and return its summary, start, end and calendar. Example: {"title":"Dentist","start":"2026-11-12T14:30","end":"2026-11-12T15:15","calendar":"Personnel","location":"12 rue X"}',
    schema: {
      title: z.string().min(1),
      start: isoDate,
      end: isoDate,
      calendar: z.string().optional().describe('Calendar name (default: first writable calendar)'),
      location: z.string().optional(),
      notes: z.string().optional(),
    },
    build: ({ title, start, end, calendar, location, notes }) => {
      const s = isoDateParts(start);
      const e = isoDateParts(end);
      if (e.getTime() <= s.getTime()) throw new Error('end must be after start');
      return { script: CREATE_EVENT, args: [...dateArgs(s), ...dateArgs(e), title, calendar ?? '', location ?? '', notes ?? ''] };
    },
  },
  {
    name: 'calendar_show_date',
    description: 'Bring Calendar to the front and show the given date, optionally in day, week or month view.',
    schema: { date: isoDate, view: z.enum(['day', 'week', 'month']).optional() },
    build: ({ date, view }) => ({ script: SHOW_DATE, args: [...dateArgs(isoDateParts(date)), view ?? ''] }),
  },
];
