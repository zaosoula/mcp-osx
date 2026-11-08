import { z } from 'zod';
import { type Action, as, noArgs } from './types.js';

/** Generic application lifecycle (any app). */
const appName = z.string().min(1).describe('Application name, e.g. "Safari"');

export const appActions: Action[] = [
  {
    name: 'app_open',
    description: 'Launch (or bring forward) an application by name.',
    schema: { name: appName },
    build: ({ name }) => ({ script: 'on run argv\ntell application (item 1 of argv) to activate\nreturn "opened " & (item 1 of argv)\nend run', args: [name] }),
  },
  {
    name: 'app_activate',
    description: 'Bring a running application to the front.',
    schema: { name: appName },
    build: ({ name }) => ({ script: 'on run argv\ntell application (item 1 of argv) to activate\nreturn "activated " & (item 1 of argv)\nend run', args: [name] }),
  },
  {
    name: 'app_quit',
    description: 'Quit an application normally (it may ask to save unsaved work).',
    schema: { name: appName },
    build: ({ name }) => ({
      script: 'on run argv\nif application (item 1 of argv) is running then tell application (item 1 of argv) to quit\nreturn "quit " & (item 1 of argv)\nend run',
      args: [name],
    }),
  },
  {
    name: 'app_list_running',
    description: 'List visible running applications, one name per line. Returns: name.',
    schema: {},
    output: { columns: ['name'] },
    build: noArgs(as([
      'tell application "System Events" to set n to name of every application process whose background only is false',
      'set AppleScript\'s text item delimiters to linefeed',
      'return n as text',
    ])),
  },
  {
    name: 'app_frontmost',
    description: 'Return the name of the frontmost application.',
    schema: {},
    build: noArgs('tell application "System Events" to return name of first application process whose frontmost is true'),
  },
];
