import { z } from 'zod';
import type { Config } from './config.js';
import type { Lang } from './osascript.js';

export type Built = { script: string; lang?: Lang; args: string[] };
export type ActionContext = { config: Config };
export type Action = {
  name: string;
  description: string;
  schema: z.ZodRawShape;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build(input: any, ctx: ActionContext): Built;
};

// Every script below is constant. Inputs only ever travel through argv.
const as = (lines: string[]) => lines.join('\n');
const noArgs = (script: string) => () => ({ script, args: [] });
const bool = (b: boolean) => (b ? 'true' : 'false');

const spotifyUri = z
  .string()
  .regex(/^(spotify:[a-z]+:[A-Za-z0-9:_-]+|https:\/\/open\.spotify\.com\/\S+)$/, 'Must be a spotify: URI or https://open.spotify.com link')
  .describe('spotify:track:…, spotify:playlist:…, spotify:album:… or an open.spotify.com link');

const PLAY_URI = as(['on run argv', 'tell application "Spotify" to play track (item 1 of argv)', 'end run']);
const appName = z.string().min(1).describe('Application name, e.g. "Safari"');

export const actions: Action[] = [
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
    name: 'safari_open_url',
    description: 'Open a URL in Safari (new tab in the front window by default).',
    schema: { url: z.string().url(), newWindow: z.boolean().optional() },
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
  {
    name: 'spotify_control',
    description: 'Control Spotify playback: play, pause, playpause, next, previous.',
    schema: { command: z.enum(['play', 'pause', 'playpause', 'next', 'previous']) },
    build: ({ command }) => ({
      script: as([
        'on run argv',
        'set c to item 1 of argv',
        'tell application "Spotify"',
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
        '  end if',
        '  return (player state as text)',
        'end tell',
        'end run',
      ]),
      args: [command],
    }),
  },
  {
    name: 'spotify_current_track',
    description: 'Return the current Spotify track, artist, album and player state.',
    schema: {},
    build: noArgs(as([
      'tell application "Spotify"',
      '  if player state is stopped then return "stopped"',
      '  set t to current track',
      '  return (name of t) & " — " & (artist of t) & " (" & (album of t) & ") [" & (player state as text) & "] " & (spotify url of t)',
      'end tell',
    ])),
  },
  {
    name: 'spotify_play',
    description: 'Play a Spotify track, album or playlist by URI.',
    schema: { uri: spotifyUri },
    build: ({ uri }) => ({ script: PLAY_URI, args: [uri] }),
  },
  {
    name: 'spotify_play_favorites',
    description: 'Play the favorites playlist configured as spotify.favorites in ~/.mcp-osx/config.json.',
    schema: {},
    build: (_input, { config }) => {
      const uri = config.spotify?.favorites;
      if (!uri || !spotifyUri.safeParse(uri).success)
        throw new Error('Set spotify.favorites in ~/.mcp-osx/config.json (e.g. {"spotify":{"favorites":"spotify:playlist:..."}}). In Spotify: right-click the playlist › Share › Copy link.');
      return { script: PLAY_URI, args: [uri] };
    },
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
    name: 'open_app',
    description: 'Launch (or bring forward) an application by name.',
    schema: { name: appName },
    build: ({ name }) => ({ script: 'on run argv\ntell application (item 1 of argv) to activate\nreturn "opened " & (item 1 of argv)\nend run', args: [name] }),
  },
  {
    name: 'activate_app',
    description: 'Bring a running application to the front.',
    schema: { name: appName },
    build: ({ name }) => ({ script: 'on run argv\ntell application (item 1 of argv) to activate\nreturn "activated " & (item 1 of argv)\nend run', args: [name] }),
  },
  {
    name: 'quit_app',
    description: 'Quit an application normally (it may ask to save unsaved work).',
    schema: { name: appName },
    build: ({ name }) => ({
      script: 'on run argv\nif application (item 1 of argv) is running then tell application (item 1 of argv) to quit\nreturn "quit " & (item 1 of argv)\nend run',
      args: [name],
    }),
  },
  {
    name: 'list_running_apps',
    description: 'List visible running applications.',
    schema: {},
    build: noArgs(as([
      'tell application "System Events" to set n to name of every application process whose background only is false',
      'set AppleScript\'s text item delimiters to linefeed',
      'return n as text',
    ])),
  },
  {
    name: 'frontmost_app',
    description: 'Return the name of the frontmost application.',
    schema: {},
    build: noArgs('tell application "System Events" to return name of first application process whose frontmost is true'),
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
