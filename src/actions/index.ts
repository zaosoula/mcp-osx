import { appActions } from './apps.js';
import { calendarActions } from './calendar.js';
import { chromiumActions } from './chromium.js';
import { contactsActions } from './contacts.js';
import { finderActions } from './finder.js';
import { keynoteActions } from './keynote.js';
import { lookawayActions } from './lookaway.js';
import { mailActions } from './mail.js';
import { musicActions } from './music.js';
import { notesActions } from './notes.js';
import { photosActions } from './photos.js';
import { quicktimeActions } from './quicktime.js';
import { remindersActions } from './reminders.js';
import { safariActions } from './safari.js';
import { settingsActions } from './settings.js';
import { spotifyActions } from './spotify.js';
import { systemActions } from './system.js';
import { tvActions } from './tv.js';
import type { Action } from './types.js';
import { vlcActions } from './vlc.js';

export type { Action, ActionContext, Built } from './types.js';

/**
 * Named actions grouped by app. Every action name starts with `<group>_`.
 * Add an app by creating `src/actions/<app>.ts` and listing it here.
 */
export const actionGroups: Record<string, Action[]> = {
  system: systemActions,
  settings: settingsActions,
  app: appActions,
  finder: finderActions,
  safari: safariActions,
  chromium: chromiumActions,
  spotify: spotifyActions,
  music: musicActions,
  tv: tvActions,
  vlc: vlcActions,
  quicktime: quicktimeActions,
  photos: photosActions,
  keynote: keynoteActions,
  calendar: calendarActions,
  reminders: remindersActions,
  notes: notesActions,
  contacts: contactsActions,
  mail: mailActions,
  lookaway: lookawayActions,
};

export const actions: Action[] = Object.values(actionGroups).flat();

/** Actions for the given app groups (all when undefined). Throws on unknown groups. */
export function selectActions(apps: string[] | undefined): Action[] {
  if (!apps) return actions;
  const unknown = apps.filter((a) => !(a in actionGroups));
  if (unknown.length)
    throw new Error(`Unknown app group(s): ${unknown.join(', ')}. Known: ${Object.keys(actionGroups).join(', ')}`);
  return apps.flatMap((a) => actionGroups[a]);
}
