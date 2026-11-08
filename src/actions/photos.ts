import { z } from 'zod';
import { type Action, as } from './types.js';
import { CL } from './helpers.js';

/** Photos. Read and slideshow only: no import, export, add or delete. */
const NOT_RUNNING = 'if application "Photos" is not running then return "Photos is not running"';

export const photosActions: Action[] = [
  {
    name: 'photos_list_albums',
    description: 'List Photos albums, one per line (default 20, max 200). Returns tab-separated: name, item_count.',
    schema: { limit: z.number().int().min(1).max(200).optional().describe('Max albums to return (default 20)') },
    output: { columns: ['name', 'item_count'] },
    build: ({ limit }) => ({
      script: as([
        'on run argv',
        'set lim to (item 1 of argv) as integer',
        NOT_RUNNING,
        'set out to {}',
        'tell application "Photos"',
        '  set als to albums',
        '  set n to count of als',
        '  repeat with i from 1 to n',
        '    if i > lim then exit repeat',
        '    set a to item i of als',
        '    set end of out to my cl(name of a) & tab & ((count of media items of a) as text)',
        '  end repeat',
        'end tell',
        'if n > lim then set end of out to "(" & ((n - lim) as text) & " more not shown)"',
        "set AppleScript's text item delimiters to linefeed",
        'return out as text',
        'end run',
        ...CL,
      ]),
      args: [String(limit ?? 20)],
    }),
  },
  {
    name: 'photos_slideshow',
    description: 'Control a Photos slideshow: start (needs album; launches Photos, full screen), stop, next, previous, pause, resume.',
    schema: {
      command: z.enum(['start', 'stop', 'next', 'previous', 'pause', 'resume']),
      album: z.string().min(1).optional().describe('Album name; required for start'),
    },
    build: ({ command, album }) => {
      if (command === 'start' && !album) throw new Error('photos_slideshow start needs an album name');
      return {
        script: as([
          'on run argv',
          'set c to item 1 of argv',
          'set al to item 2 of argv',
          'if c is "start" then',
          '  tell application "Photos"',
          '    if not (exists album al) then return "no album named " & al',
          '    start slideshow using (media items of album al)',
          '  end tell',
          '  return "slideshow started: " & al',
          'end if',
          NOT_RUNNING,
          'tell application "Photos"',
          '  if not slideshow running then return "no slideshow running"',
          '  if c is "stop" then',
          '    stop slideshow',
          '  else if c is "next" then',
          '    next slide',
          '  else if c is "previous" then',
          '    previous slide',
          '  else if c is "pause" then',
          '    pause slideshow',
          '  else if c is "resume" then',
          '    resume slideshow',
          '  end if',
          'end tell',
          'return "slideshow " & c',
          'end run',
        ]),
        args: [command, album ?? ''],
      };
    },
  },
];
