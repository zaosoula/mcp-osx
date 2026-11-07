import { z } from 'zod';
import { type Action, as, bool } from './types.js';

/**
 * Chromium browsers (Google Chrome, Brave Browser). Both share the Chromium dictionary with identical
 * four-char codes, so scripts compile against Chrome's terms and are sent to whichever app is in argv.
 */
const browser = z.enum(['Google Chrome', 'Brave Browser']).optional().describe('Chromium browser to control (default Google Chrome)');
const httpUrl = z.string().url().refine((u) => /^https?:\/\//i.test(u), 'Only http(s) URLs are allowed').describe('http(s) URL');
const index = (what: string) => z.number().int().min(1).max(1000).describe(`${what} index, 1-based (see chromium_list_tabs)`);
const pick = (b?: string) => b ?? 'Google Chrome';

/** Wrap body lines in `on run argv` + Chrome terms + a tell to the argv browser. `b` holds the app name. */
const script = (body: string[], opts: { requireRunning?: boolean } = {}) => as([
  'on run argv',
  'set b to item 1 of argv',
  ...(opts.requireRunning === false ? [] : ['if not (application b is running) then return b & " is not running"']),
  'set TB to character id 9',
  'using terms from application "Google Chrome"',
  '  tell application b',
  ...body.map((l) => '    ' + l),
  '  end tell',
  'end using terms from',
  'end run',
]);

const NO_WINDOW = 'if (count of windows) = 0 then return "no " & b & " window open"';

export const chromiumActions: Action[] = [
  {
    name: 'chromium_open_url',
    description: 'Open an http(s) URL in Chrome or Brave (new tab in the front window by default); launches the browser if needed.',
    schema: { url: httpUrl, newWindow: z.boolean().optional(), browser },
    build: ({ url, newWindow, browser: b }) => ({
      script: script([
        'set u to item 2 of argv',
        'activate',
        'if (item 3 of argv) is "true" or (count of windows) = 0 then',
        '  set w to make new window',
        '  set URL of active tab of w to u',
        'else',
        '  make new tab at end of tabs of front window with properties {URL:u}',
        'end if',
        'return "opened " & u & " in " & b',
      ], { requireRunning: false }),
      args: [pick(b), url, bool(!!newWindow)],
    }),
  },
  {
    name: 'chromium_list_tabs',
    description: 'List open Chrome/Brave tabs, one per line: window index, tab index, "*" if active tab, title, URL (cut at 300 chars).',
    schema: {
      browser,
      limit: z.number().int().min(1).max(500).optional().describe('max tabs to return (default 100)'),
    },
    build: ({ browser: b, limit }) => ({
      script: script([
        'set lim to (item 2 of argv) as integer',
        NO_WINDOW,
        'set out to {}',
        'set n to 0',
        'set total to 0',
        'repeat with wi from 1 to count of windows',
        '  set w to window wi',
        '  set ai to active tab index of w',
        '  set ts to tabs of w',
        '  repeat with ti from 1 to count of ts',
        '    set total to total + 1',
        '    if n < lim then',
        '      set t to item ti of ts',
        '      if ti = ai then',
        '        set m to "*"',
        '      else',
        '        set m to ""',
        '      end if',
        '      set u to URL of t',
        '      if (count of u) > 300 then set u to (text 1 thru 300 of u) & "…"',
        '      set end of out to (wi as text) & TB & (ti as text) & TB & m & TB & (title of t) & TB & u',
        '      set n to n + 1',
        '    end if',
        '  end repeat',
        'end repeat',
        'if total > n then set end of out to "… " & ((total - n) as text) & " more tabs not shown"',
        'set AppleScript\'s text item delimiters to linefeed',
        'return out as text',
      ]),
      args: [pick(b), String(limit ?? 100)],
    }),
  },
  {
    name: 'chromium_current_tab',
    description: 'Return the URL and title of the active tab in the front Chrome/Brave window.',
    schema: { browser },
    build: ({ browser: b }) => ({
      script: script([
        NO_WINDOW,
        'tell active tab of front window to return (URL as text) & linefeed & (title as text)',
      ]),
      args: [pick(b)],
    }),
  },
  {
    name: 'chromium_activate_tab',
    description: 'Bring a Chrome/Brave tab to the front by window and tab index (from chromium_list_tabs); returns its title.',
    schema: { window: index('Window'), tab: index('Tab'), browser },
    build: ({ window: w, tab: t, browser: b }) => ({
      script: script([
        'set wi to (item 2 of argv) as integer',
        'set ti to (item 3 of argv) as integer',
        'if wi > (count of windows) then return "no window " & wi',
        'set w to window wi',
        'if ti > (count of tabs of w) then return "no tab " & ti & " in window " & wi',
        'set active tab index of w to ti',
        'set index of w to 1',
        'activate',
        'return "activated " & (title of active tab of w)',
      ]),
      args: [pick(b), String(w), String(t)],
    }),
  },
  {
    name: 'chromium_reload',
    description: 'Reload the active tab in the front Chrome/Brave window.',
    schema: { browser },
    build: ({ browser: b }) => ({
      script: script([
        NO_WINDOW,
        'set t to active tab of front window',
        'reload t',
        'return "reloaded " & (URL of t)',
      ]),
      args: [pick(b)],
    }),
  },
  {
    name: 'chromium_go',
    description: 'Go back or forward in the active tab of the front Chrome/Brave window.',
    schema: { direction: z.enum(['back', 'forward']), browser },
    build: ({ direction, browser: b }) => ({
      script: script([
        NO_WINDOW,
        'set t to active tab of front window',
        'if (item 2 of argv) is "back" then',
        '  go back t',
        'else',
        '  go forward t',
        'end if',
        'return "went " & (item 2 of argv)',
      ]),
      args: [pick(b), direction],
    }),
  },
];
