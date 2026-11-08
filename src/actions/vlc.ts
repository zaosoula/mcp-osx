import { z } from 'zod';
import { type Action, as, noArgs } from './types.js';
import { CL } from './helpers.js';

/** VLC. */
const NOT_RUNNING = 'if application "VLC" is not running then return "VLC is not running"';

export const vlcActions: Action[] = [
  {
    name: 'vlc_control',
    description: 'Control VLC: play (toggles play/pause; may launch VLC), stop, next, previous, mute (toggle), fullscreen (toggle), volume_up/down, step_forward/backward.',
    schema: {
      command: z.enum(['play', 'stop', 'next', 'previous', 'mute', 'fullscreen', 'volume_up', 'volume_down', 'step_forward', 'step_backward']),
    },
    build: ({ command }) => ({
      script: as([
        'on run argv',
        'set c to item 1 of argv',
        'if c is not "play" then',
        `  ${NOT_RUNNING}`,
        'end if',
        'tell application "VLC"',
        '  if c is "play" then',
        '    play',
        '  else if c is "stop" then',
        '    stop',
        '  else if c is "next" then',
        '    next',
        '  else if c is "previous" then',
        '    previous',
        '  else if c is "mute" then',
        '    mute',
        '  else if c is "fullscreen" then',
        '    fullscreen',
        '  else if c is "volume_up" then',
        '    volumeUp',
        '  else if c is "volume_down" then',
        '    volumeDown',
        '  else if c is "step_forward" then',
        '    step forward',
        '  else if c is "step_backward" then',
        '    step backward',
        '  end if',
        '  return c & " done" & tab & "playing " & (playing as text)',
        'end tell',
        'end run',
      ]),
      args: [command],
    }),
  },
  {
    name: 'vlc_now_playing',
    description: 'Return the current VLC item. Returns tab-separated: name, position_s, duration_s (seconds), playing (true/false).',
    schema: {},
    output: { columns: ['name', 'position_s', 'duration_s', 'playing'] },
    build: noArgs(as([
      ...CL,
      NOT_RUNNING,
      'tell application "VLC"',
      '  set p to playing',
      '  set n to missing value',
      '  try',
      '    set n to name of current item',
      '  end try',
      // `name of current item` yields no value at all when nothing is loaded, leaving n undefined
      '  try',
      '    n',
      '  on error',
      '    set n to missing value',
      '  end try',
      '  if n is missing value or n is "" then return "nothing loaded" & tab & "playing " & (p as text)',
      '  set ct to 0',
      '  set d to 0',
      '  try',
      '    set ct to current time',
      '    set d to duration of current item',
      '  end try',
      '  return my cl(n) & tab & (ct as text) & tab & (d as text) & tab & (p as text)',
      'end tell',
    ])),
  },
  {
    name: 'vlc_open_url',
    description: 'Open a media stream URL (http, https, rtsp, rtmp) in VLC and start playing it; launches VLC if needed.',
    schema: {
      url: z.string().url().refine((u) => /^(https?|rtsp|rtmp):\/\//i.test(u), 'Only http(s), rtsp and rtmp URLs are allowed').describe('http(s)/rtsp/rtmp media URL'),
    },
    build: ({ url }) => ({
      script: as([
        'on run argv',
        'set u to item 1 of argv',
        'tell application "VLC"',
        '  OpenURL u',
        'end tell',
        'return "opened " & u',
        'end run',
      ]),
      args: [url],
    }),
  },
];
