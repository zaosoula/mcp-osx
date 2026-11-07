import { z } from 'zod';
import { type Action, as } from './types.js';

/** QuickTime Player. Playback only: no recording, export or trim. */
export const quicktimeActions: Action[] = [
  {
    name: 'quicktime_control',
    description: 'Control playback of the front QuickTime Player document: play, pause, stop, step_forward, step_backward; returns its name, position and playing state.',
    schema: { command: z.enum(['play', 'pause', 'stop', 'step_forward', 'step_backward']) },
    build: ({ command }) => ({
      script: as([
        'on run argv',
        'set c to item 1 of argv',
        'if application "QuickTime Player" is not running then return "QuickTime Player is not running"',
        'tell application "QuickTime Player"',
        '  if (count of documents) = 0 then return "no QuickTime document open"',
        '  set d to front document',
        '  if c is "play" then',
        '    play d',
        '  else if c is "pause" then',
        '    pause d',
        '  else if c is "stop" then',
        '    stop d',
        '  else if c is "step_forward" then',
        '    step forward d',
        '  else if c is "step_backward" then',
        '    step backward d',
        '  end if',
        '  set pos to ""',
        '  try',
        '    set pos to ((round (current time of d) rounding down) as text) & "/" & ((round (duration of d) rounding down) as text) & "s"',
        '  end try',
        '  return (name of d) & tab & pos & tab & "playing " & ((playing of d) as text)',
        'end tell',
        'end run',
      ]),
      args: [command],
    }),
  },
  {
    name: 'quicktime_open_url',
    description: 'Open an http(s) media URL in QuickTime Player (opens a visible player window).',
    schema: {
      url: z.string().url().refine((u) => /^https?:\/\//i.test(u), 'Only http(s) URLs are allowed').describe('http(s) media URL'),
    },
    build: ({ url }) => ({
      script: as([
        'on run argv',
        'set u to item 1 of argv',
        'tell application "QuickTime Player"',
        '  activate',
        '  open URL u',
        'end tell',
        'return "opened " & u',
        'end run',
      ]),
      args: [url],
    }),
  },
];
