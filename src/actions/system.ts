import { z } from 'zod';
import { type Action, as, noArgs, bool } from './types.js';

/** macOS system settings: appearance, audio, Wi-Fi, notifications. */
export const systemActions: Action[] = [
  {
    name: 'system_get_dark_mode',
    description: 'Return "true" if macOS dark mode is on, else "false".',
    schema: {},
    build: noArgs('tell application "System Events" to tell appearance preferences to return dark mode'),
  },
  {
    name: 'system_set_dark_mode',
    description: 'Turn macOS dark mode on or off.',
    schema: { enabled: z.boolean() },
    build: ({ enabled }) => ({
      script: as([
        'on run argv',
        'tell application "System Events" to tell appearance preferences',
        '  set dark mode to ((item 1 of argv) is "true")',
        '  return dark mode',
        'end tell',
        'end run',
      ]),
      args: [bool(enabled)],
    }),
  },
  {
    name: 'system_get_volume',
    description: 'Return output volume (0-100) and mute state.',
    schema: {},
    build: noArgs('set s to get volume settings\nreturn "volume " & (output volume of s) & ", muted " & (output muted of s)'),
  },
  {
    name: 'system_set_volume',
    description: 'Set output volume (0-100).',
    schema: { level: z.number().int().min(0).max(100) },
    build: ({ level }) => ({ script: 'on run argv\nset volume output volume ((item 1 of argv) as integer)\nend run', args: [String(level)] }),
  },
  {
    name: 'system_set_muted',
    description: 'Mute or unmute audio output.',
    schema: { muted: z.boolean() },
    build: ({ muted }) => ({ script: 'on run argv\nset volume output muted ((item 1 of argv) is "true")\nend run', args: [bool(muted)] }),
  },
  {
    name: 'system_wifi_status',
    description: 'Return Wi-Fi power state.',
    schema: {},
    build: noArgs(as([
      'set dev to do shell script "networksetup -listallhardwareports | awk \'/Wi-Fi|AirPort/{getline; print $2; exit}\'"',
      'if dev is "" then return "no Wi-Fi device"',
      'return do shell script "networksetup -getairportpower " & quoted form of dev',
    ])),
  },
  {
    name: 'system_set_wifi',
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
    name: 'system_notify',
    description: 'Show a macOS notification.',
    schema: { title: z.string(), message: z.string() },
    build: ({ title, message }) => ({
      script: 'on run argv\ndisplay notification (item 2 of argv) with title (item 1 of argv)\nend run',
      args: [title, message],
    }),
  },
  {
    name: 'system_get_clipboard',
    description: 'Return the clipboard as plain text (truncated to 10000 chars); non-text clipboards are reported, not returned.',
    schema: {},
    build: noArgs(as([
      'try',
      '  set t to the clipboard as text',
      'on error',
      '  return "clipboard has no text"',
      'end try',
      'if t is "" then return "clipboard is empty"',
      'set n to length of t',
      'if n > 10000 then return (text 1 thru 10000 of t) & linefeed & "[truncated: " & n & " chars total]"',
      'return t',
    ])),
  },
  {
    name: 'system_set_clipboard',
    description: 'Replace the clipboard contents with the given text.',
    schema: { text: z.string().max(100000) },
    build: ({ text }) => ({
      script: as(['on run argv', 'set the clipboard to (item 1 of argv)', 'return "clipboard set (" & (length of (item 1 of argv)) & " chars)"', 'end run']),
      args: [text],
    }),
  },
  {
    name: 'system_say',
    description: 'Speak text aloud with macOS text-to-speech (waits until done); optional voice name.',
    schema: {
      text: z.string().min(1).max(2000),
      voice: z.string().regex(/^[A-Za-z0-9 ()._-]{1,64}$/, 'Voice name, e.g. "Samantha"').optional().describe('Voice name, e.g. "Samantha"; system default if omitted'),
    },
    build: ({ text, voice }) => ({
      script: as([
        'on run argv',
        'if (item 2 of argv) is "" then',
        '  say (item 1 of argv)',
        'else',
        '  say (item 1 of argv) using (item 2 of argv)',
        'end if',
        'return "spoke " & (length of (item 1 of argv)) & " chars"',
        'end run',
      ]),
      args: [text, voice ?? ''],
    }),
  },
  {
    name: 'system_start_screensaver',
    description: 'Start the current screen saver.',
    schema: {},
    build: noArgs(as(['tell application "System Events" to start current screen saver', 'return "screen saver started"'])),
  },
  {
    name: 'system_sleep_display',
    description: 'Put the display(s) to sleep now (pmset displaysleepnow); the Mac stays awake.',
    schema: {},
    build: noArgs(as(['do shell script "pmset displaysleepnow"', 'return "display sleeping"'])),
  },
  {
    name: 'system_battery_status',
    description: 'Return battery charge, power source and charging state (pmset -g batt).',
    schema: {},
    build: noArgs('return do shell script "pmset -g batt"'),
  },
  {
    name: 'system_info',
    description: 'Return computer name, macOS version, user, CPU, memory and uptime.',
    schema: {},
    build: noArgs(as([
      'set s to system info',
      'set upt to do shell script "uptime"',
      'return "computer\\t" & (computer name of s) & linefeed & ¬',
      '  "macos\\t" & (system version of s) & linefeed & ¬',
      '  "user\\t" & (short user name of s) & " (" & (long user name of s) & ")" & linefeed & ¬',
      '  "cpu\\t" & (CPU type of s) & linefeed & ¬',
      '  "memory_mb\\t" & (physical memory of s) & linefeed & ¬',
      '  "uptime\\t" & upt',
    ])),
  },
];
