import { z } from 'zod';
import { type Action, as, noArgs } from './types.js';
import { CL } from './helpers.js';

/** Keynote. Presenting and listing only: no export, passwords or edits. */
const NOT_RUNNING = 'if application "Keynote" is not running then return "Keynote is not running"';

export const keynoteActions: Action[] = [
  {
    name: 'keynote_slideshow',
    description: 'Control the Keynote slideshow of the front document: start (full screen), stop, next, previous.',
    schema: { command: z.enum(['start', 'stop', 'next', 'previous']) },
    build: ({ command }) => ({
      script: as([
        'on run argv',
        'set c to item 1 of argv',
        NOT_RUNNING,
        'tell application "Keynote"',
        '  if (count of documents) = 0 then return "no Keynote document open"',
        '  set d to front document',
        '  if c is "start" then',
        '    start d',
        '  else if c is "stop" then',
        '    stop d',
        '  else if c is "next" then',
        '    show next',
        '  else if c is "previous" then',
        '    show previous',
        '  end if',
        '  return c & " done" & tab & (name of d) & tab & "playing " & (playing as text)',
        'end tell',
        'end run',
      ]),
      args: [command],
    }),
  },
  {
    name: 'keynote_list_documents',
    description: 'List open Keynote documents, one per line. Returns tab-separated: name, slide_count, modified (true if unsaved changes).',
    schema: {},
    output: { columns: ['name', 'slide_count', 'modified'] },
    build: noArgs(as([
      ...CL,
      NOT_RUNNING,
      'set out to {}',
      'tell application "Keynote"',
      '  repeat with d in documents',
      '    set end of out to my cl(name of d) & tab & ((count of slides of d) as text) & tab & ((modified of d) as text)',
      '  end repeat',
      'end tell',
      'if (count of out) = 0 then return "no Keynote documents open"',
      "set AppleScript's text item delimiters to linefeed",
      'return out as text',
    ])),
  },
];
