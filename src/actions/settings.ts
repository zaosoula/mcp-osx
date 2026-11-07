import { z } from 'zod';
import { type Action, noArgs } from './types.js';

/**
 * System Settings panes, mapped to their pane identifiers on macOS 26 (bundle IDs of the
 * /System/Library/ExtensionKit/Extensions/*.appex settings extensions). Opened through the
 * x-apple.systempreferences: URL scheme so System Settings needn't be scripted.
 */
const PANES = {
  wifi: 'com.apple.wifi-settings-extension',
  bluetooth: 'com.apple.BluetoothSettings',
  network: 'com.apple.Network-Settings.extension',
  notifications: 'com.apple.Notifications-Settings.extension',
  sound: 'com.apple.Sound-Settings.extension',
  focus: 'com.apple.Focus-Settings.extension',
  displays: 'com.apple.Displays-Settings.extension',
  wallpaper: 'com.apple.Wallpaper-Settings.extension',
  battery: 'com.apple.Battery-Settings.extension',
  privacy: 'com.apple.settings.PrivacySecurity.extension',
  accessibility: 'com.apple.Accessibility-Settings.extension',
  keyboard: 'com.apple.Keyboard-Settings.extension',
  trackpad: 'com.apple.Trackpad-Settings.extension',
  general: 'com.apple.systempreferences.GeneralSettings',
  appearance: 'com.apple.Appearance-Settings.extension',
  users: 'com.apple.Users-Groups-Settings.extension',
  desktop_dock: 'com.apple.Desktop-Settings.extension',
  control_center: 'com.apple.ControlCenter-Settings.extension',
  software_update: 'com.apple.Software-Update-Settings.extension',
  storage: 'com.apple.settings.Storage',
  about: 'com.apple.SystemProfiler.AboutExtension',
} as const;

type Pane = keyof typeof PANES;
const paneNames = Object.keys(PANES) as [Pane, ...Pane[]];

export const settingsActions: Action[] = [
  {
    name: 'settings_open_pane',
    description: 'Open a System Settings pane (visible window; changes nothing). See settings_list_panes.',
    schema: { pane: z.enum(paneNames) },
    build: ({ pane }: { pane: Pane }) => ({
      script: 'on run argv\nopen location "x-apple.systempreferences:" & (item 1 of argv)\nreturn "opened settings pane " & (item 2 of argv)\nend run',
      args: [PANES[pane], pane],
    }),
  },
  {
    name: 'settings_list_panes',
    description: 'List the pane names accepted by settings_open_pane, one per line.',
    schema: {},
    // Constant script returning a constant list; no input.
    build: noArgs(`return "${paneNames.join('\\n')}"`),
  },
];
