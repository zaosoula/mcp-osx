import { appActions } from './apps.js';
import { safariActions } from './safari.js';
import { spotifyActions } from './spotify.js';
import { systemActions } from './system.js';
import type { Action } from './types.js';

export type { Action, ActionContext, Built } from './types.js';

/** All named actions. Add a new app by creating `src/actions/<app>.ts` and listing it here. */
export const actions: Action[] = [...systemActions, ...safariActions, ...spotifyActions, ...appActions];
