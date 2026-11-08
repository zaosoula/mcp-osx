import { z } from 'zod';
import { type Action, as, noArgs } from './types.js';
import { CL } from './helpers.js';

/** TV.app. */
const NOT_RUNNING = 'if application "TV" is not running then return "TV is not running"';

export const tvActions: Action[] = [
  {
    name: 'tv_control',
    description: 'Control TV app playback (play, pause, playpause, next, previous, stop); returns the player state. play/playpause may launch TV.',
    schema: { command: z.enum(['play', 'pause', 'playpause', 'next', 'previous', 'stop']) },
    build: ({ command }) => ({
      script: as([
        'on run argv',
        'set c to item 1 of argv',
        'if c is not "play" and c is not "playpause" then',
        `  ${NOT_RUNNING}`,
        'end if',
        'tell application "TV"',
        '  if c is "play" then',
        '    play',
        '  else if c is "pause" then',
        '    pause',
        '  else if c is "playpause" then',
        '    playpause',
        '  else if c is "next" then',
        '    next track',
        '  else if c is "previous" then',
        '    previous track',
        '  else if c is "stop" then',
        '    stop',
        '  end if',
        '  return (player state as text)',
        'end tell',
        'end run',
      ]),
      args: [command],
    }),
  },
  {
    name: 'tv_current',
    description: 'Return what the TV app is playing. Returns tab-separated: name, show (empty for movies), position_s, duration_s (whole seconds), state; "stopped" when nothing plays.',
    schema: {},
    output: { columns: ['name', 'show', 'position_s', 'duration_s', 'state'] },
    build: noArgs(as([
      ...CL,
      NOT_RUNNING,
      'tell application "TV"',
      '  set pstate to player state as text',
      '  if pstate is "stopped" then return "stopped"',
      '  try',
      '    set t to current track',
      '  on error',
      '    return pstate & tab & "no current item"',
      '  end try',
      '  set sh to ""',
      '  try',
      '    set sh to show of t',
      '  end try',
      '  set pos to 0',
      '  try',
      '    set pos to round (player position) rounding down',
      '  end try',
      '  set dur to 0',
      '  try',
      '    set dur to round (duration of t) rounding down',
      '  end try',
      '  return my cl(name of t) & tab & my cl(sh) & tab & (pos as text) & tab & (dur as text) & tab & pstate',
      'end tell',
    ])),
  },
];
