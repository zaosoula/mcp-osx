---
name: macos-routines
description: Ready-made sequences of mcp-osx named actions for common requests. Covers focus mode, presentation mode, starting the workday, end of day, and "what's on my plate". Use this when the user asks for a multi-step Mac routine instead of one action.
---

# macOS routines

Each routine uses only named actions, so nothing asks the user for approval. Run the steps in order. If one step fails, report it and continue, unless later steps depend on it. Tell the user what changed.

## Focus mode
1. `system_set_dark_mode` with `enabled: true`. Skip this if `system_get_dark_mode` already returns true.
2. `spotify_control` with `pause` or `music_control` with `pause`, whichever player is running.
3. `system_set_muted` with `muted: false` and `system_set_volume` with `level: 25`, if the user wants background music. Otherwise leave the audio as it is.
4. `settings_open_pane` with `pane: "focus"`, so the user can turn on a Focus mode. Changing Focus modes isn't scriptable.
5. If the user asked for music: `spotify_play_favorites`.

## Presentation mode
1. `system_set_muted` with `muted: true`.
2. Pause whichever player is running: `spotify_control` with `pause`, `music_control` with `pause`.
3. `keynote_slideshow` with `start`, if a Keynote document is open (`keynote_list_documents`).

## Start the workday
1. `calendar_list_events` for today. Summarize the meetings, with times and locations.
2. `reminders_list`, showing incomplete reminders due today or overdue.
3. `mail_unread_count` (only if Mail is running).
4. Offer to open the links you found with `safari_open_url` or `chromium_open_url`. Don't open them without asking.

## End of day
1. `calendar_list_events` with `from` set to tomorrow and `to` set to tomorrow, as a preview.
2. `reminders_list`: list what's still open, and offer to move due dates. That needs `run_applescript`, so the user approves it.
3. `system_set_dark_mode` only if the user asks.

## What's on my plate
Combine `calendar_list_events` (next 7 days), `reminders_list` and `mail_list_messages` with `unreadOnly: true` and `limit: 10`. Group the results by urgency. Keep the answer short.

## Notes
- Calendar queries over many calendars can take up to a minute. Pass `calendar` when you know which one.
- Mail actions need Mail to be running already.
- Don't change Wi-Fi in a routine. Turning it off can cut your own connection.
