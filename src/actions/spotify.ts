import { z } from 'zod';
import { type Action, as, noArgs } from './types.js';

/** Spotify. */
const spotifyUri = z
  .string()
  .regex(/^(spotify:[a-z]+:[A-Za-z0-9:_-]+|https:\/\/open\.spotify\.com\/\S+)$/, 'Must be a spotify: URI or https://open.spotify.com link')
  .describe('spotify:track:…, spotify:playlist:…, spotify:album:… or an open.spotify.com link');

const PLAY_URI = as(['on run argv', 'tell application "Spotify" to play track (item 1 of argv)', 'end run']);

export const spotifyActions: Action[] = [
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
];
