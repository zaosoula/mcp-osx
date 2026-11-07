import { z } from 'zod';
import { type Action, as, noArgs, bool } from './types.js';

/** Safari. */
export const safariActions: Action[] = [
  {
    name: 'safari_open_url',
    description: 'Open a URL in Safari (new tab in the front window by default).',
    schema: { url: z.string().url().refine((u) => /^https?:\/\//i.test(u), 'Only http(s) URLs are allowed').describe('http(s) URL'), newWindow: z.boolean().optional() },
    build: ({ url, newWindow }) => ({
      script: as([
        'on run argv',
        'set u to item 1 of argv',
        'tell application "Safari"',
        '  activate',
        '  if (item 2 of argv) is "true" or (count of windows) = 0 then',
        '    make new document with properties {URL:u}',
        '  else',
        '    tell front window to set current tab to (make new tab with properties {URL:u})',
        '  end if',
        'end tell',
        'return "opened " & u',
        'end run',
      ]),
      args: [url, bool(!!newWindow)],
    }),
  },
  {
    name: 'safari_current_tab',
    description: 'Return the URL and title of the current Safari tab.',
    schema: {},
    build: noArgs(as([
      'tell application "Safari"',
      '  if (count of windows) = 0 then return "no Safari window open"',
      '  tell current tab of front window to return (URL as text) & linefeed & (name as text)',
      'end tell',
    ])),
  },
];
