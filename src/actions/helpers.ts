import { z } from 'zod';
import { as } from './types.js';

export const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/** Shared date parsing and AppleScript helper handlers for the PIM actions. */
export const isoDate = z
  .string()
  .regex(ISO_RE, 'Must be an ISO 8601 date or datetime')
  .describe('ISO 8601 date or datetime, e.g. 2026-11-08 or 2026-11-08T14:30 (local time unless an offset/Z is given)');

/** Local date parts of an ISO string. Date-only values are local midnight, or 23:59 when `endOfDay`. */
export function isoDateParts(s: string, endOfDay = false): Date {
  const m = ISO_RE.exec(s);
  if (!m) throw new Error(`Invalid ISO date: ${s}`);
  const [, y, mo, d, h, mi, tz] = m;
  let dt: Date;
  if (h === undefined) dt = endOfDay ? new Date(+y, +mo - 1, +d, 23, 59) : new Date(+y, +mo - 1, +d, 0, 0);
  else if (tz) dt = new Date(s);
  else dt = new Date(+y, +mo - 1, +d, +h, +mi);
  if (Number.isNaN(dt.getTime()) || (!tz && (dt.getMonth() !== +mo - 1 || dt.getDate() !== +d)))
    throw new Error(`Invalid ISO date: ${s}`);
  return dt;
}

/** A Date as five argv strings (year, month, day, hour, minute in local time), read by the `mkd` handler. */
export const dateArgs = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()].map(String);

/** Shared AppleScript handlers: mkd (date from argv parts), fmt (date to "YYYY-MM-DD HH:MM"), cl (one-line text), joinL. */
export const AS_HELPERS = [
  'on mkd(a, i)',
  '  set r to current date',
  '  set day of r to 1',
  '  set year of r to (item i of a) as integer',
  '  set month of r to (item (i + 1) of a) as integer',
  '  set day of r to (item (i + 2) of a) as integer',
  '  set time of r to ((item (i + 3) of a) as integer) * 3600 + ((item (i + 4) of a) as integer) * 60',
  '  return r',
  'end mkd',
  'on p2(n)',
  '  return text -2 thru -1 of ("0" & (n as integer))',
  'end p2',
  'on fmt(d)',
  '  if d is missing value then return ""',
  '  return ((year of d) as text) & "-" & my p2(month of d as integer) & "-" & my p2(day of d) & " " & my p2(hours of d) & ":" & my p2(minutes of d)',
  'end fmt',
  'on cl(t)',
  '  if t is missing value then return ""',
  '  set t to t as text',
  '  set AppleScript\'s text item delimiters to {tab, linefeed, return}',
  '  set p to text items of t',
  '  set AppleScript\'s text item delimiters to " "',
  '  set t to p as text',
  '  set AppleScript\'s text item delimiters to ""',
  '  return t',
  'end cl',
  'on joinL(l, s)',
  '  set AppleScript\'s text item delimiters to s',
  '  set t to l as text',
  '  set AppleScript\'s text item delimiters to ""',
  '  return t',
  'end joinL',
];
