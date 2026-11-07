import { z } from 'zod';
import { type Action, as } from './types.js';

/** LookAway (break reminder, /Applications/Setapp/LookAway.app). `open settings` is not exposed. */
const COMMANDS = [
  'start', 'stop', 'reset', 'start_next_break', 'start_long_break', 'start_break',
  'pause', 'pause_temporarily', 'postpone_break', 'resume',
] as const;
const NEEDS_SECONDS = new Set(['start_break', 'pause_temporarily', 'postpone_break']);

export const lookawayActions: Action[] = [
  {
    name: 'lookaway_control',
    description:
      'Control LookAway: start/stop it, reset timers, start a (next/long/custom) break, pause, pause temporarily, postpone the break, resume.',
    schema: {
      command: z.enum(COMMANDS),
      seconds: z.number().int().min(1).max(86400).optional().describe('Duration in seconds; required for start_break, pause_temporarily, postpone_break'),
      message: z.string().max(200).optional().describe('Break message, start_break only'),
    },
    build: ({ command, seconds, message }) => {
      if (NEEDS_SECONDS.has(command) && seconds === undefined) throw new Error(`lookaway_control ${command} requires seconds`);
      return {
        script: as([
          'on run argv',
          'set c to item 1 of argv',
          'set secs to (item 2 of argv) as integer',
          'set msg to item 3 of argv',
          'if c is not "start" and application "LookAway" is not running then return "LookAway is not running"',
          'tell application "LookAway"',
          '  if c is "start" then',
          '    start lookaway',
          '  else if c is "stop" then',
          '    stop lookaway',
          '  else if c is "reset" then',
          '    restart lookaway',
          '  else if c is "start_next_break" then',
          '    start next break',
          '  else if c is "start_long_break" then',
          '    start long break',
          '  else if c is "start_break" then',
          '    if msg is "" then',
          '      start break for secs',
          '    else',
          '      start break for secs with message msg',
          '    end if',
          '  else if c is "pause" then',
          '    pause',
          '  else if c is "pause_temporarily" then',
          '    pause temporarily for secs',
          '  else if c is "postpone_break" then',
          '    postpone break by secs',
          '  else if c is "resume" then',
          '    resume',
          '  end if',
          'end tell',
          'return "lookaway " & c',
          'end run',
        ]),
        args: [command, String(seconds ?? 0), message ?? ''],
      };
    },
  },
];
