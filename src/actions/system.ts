import { z } from 'zod';
import { type Action, as, noArgs, bool } from './types.js';

/** macOS system settings: appearance, audio, Wi-Fi, notifications. */
export const systemActions: Action[] = [
  {
    name: 'get_dark_mode',
    description: 'Return "true" if macOS dark mode is on, else "false".',
    schema: {},
    build: noArgs('tell application "System Events" to tell appearance preferences to return dark mode'),
  },
  {
    name: 'set_dark_mode',
    description: 'Turn macOS dark mode on or off.',
    schema: { enabled: z.boolean() },
    build: ({ enabled }) => ({
      script: as(['on run argv', 'tell application "System Events" to tell appearance preferences to set dark mode to ((item 1 of argv) is "true")', 'return dark mode of appearance preferences of application "System Events"', 'end run']),
      args: [bool(enabled)],
    }),
  },
  {
    name: 'get_volume',
    description: 'Return output volume (0-100) and mute state.',
    schema: {},
    build: noArgs('set s to get volume settings\nreturn "volume " & (output volume of s) & ", muted " & (output muted of s)'),
  },
  {
    name: 'set_volume',
    description: 'Set output volume (0-100).',
    schema: { level: z.number().int().min(0).max(100) },
    build: ({ level }) => ({ script: 'on run argv\nset volume output volume ((item 1 of argv) as integer)\nend run', args: [String(level)] }),
  },
  {
    name: 'set_muted',
    description: 'Mute or unmute audio output.',
    schema: { muted: z.boolean() },
    build: ({ muted }) => ({ script: 'on run argv\nset volume output muted ((item 1 of argv) is "true")\nend run', args: [bool(muted)] }),
  },
  {
    name: 'wifi_status',
    description: 'Return Wi-Fi power state.',
    schema: {},
    build: noArgs(as([
      'set dev to do shell script "networksetup -listallhardwareports | awk \'/Wi-Fi|AirPort/{getline; print $2; exit}\'"',
      'if dev is "" then return "no Wi-Fi device"',
      'return do shell script "networksetup -getairportpower " & quoted form of dev',
    ])),
  },
  {
    name: 'set_wifi',
    description: 'Turn Wi-Fi on or off. Warning: turning it off may cut the agent\'s own network connection.',
    schema: { enabled: z.boolean() },
    build: ({ enabled }) => ({
      script: as([
        'on run argv',
        'set dev to do shell script "networksetup -listallhardwareports | awk \'/Wi-Fi|AirPort/{getline; print $2; exit}\'"',
        'if dev is "" then error "no Wi-Fi device"',
        'do shell script "networksetup -setairportpower " & quoted form of dev & " " & quoted form of (item 1 of argv)',
        'return "wifi " & (item 1 of argv)',
        'end run',
      ]),
      args: [enabled ? 'on' : 'off'],
    }),
  },
  {
    name: 'notify',
    description: 'Show a macOS notification.',
    schema: { title: z.string(), message: z.string() },
    build: ({ title, message }) => ({
      script: 'on run argv\ndisplay notification (item 2 of argv) with title (item 1 of argv)\nend run',
      args: [title, message],
    }),
  },
];
