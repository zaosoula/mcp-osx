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

/** All named actions. Add an app by creating `src/actions/<app>.ts` and listing it here. */
export const actions: Action[] = [
  ...systemActions,
  ...settingsActions,
  ...appActions,
  ...finderActions,
  ...safariActions,
  ...chromiumActions,
  ...spotifyActions,
  ...musicActions,
  ...tvActions,
  ...vlcActions,
  ...quicktimeActions,
  ...photosActions,
  ...keynoteActions,
  ...calendarActions,
  ...remindersActions,
  ...notesActions,
  ...contactsActions,
  ...mailActions,
  ...lookawayActions,
];
