# Changelog

## 0.1.0 — 2026-11-08

First release.

- 81 named actions across 19 app groups (system, settings, app, finder, safari, chromium, spotify, music, tv, vlc, quicktime, photos, keynote, calendar, reminders, notes, contacts, mail, lookaway). They are non-destructive, use constant scripts, and take inputs through argv only.
- `run_applescript` for any AppleScript or JXA, with user approval. Approval happens in the chat through MCP `input_required` with HMAC-signed state tied to the exact script, or in a native macOS dialog.
- Saved workflows (`workflow_<name>`) with SHA-256 approval hashes, re-approval after edits, and dynamic tool registration.
- `list_scriptable_apps` and `get_app_dictionary`: compact `sdef` summaries that include Apple's standard suites and parse the Keynote, Pages and Numbers dictionaries.
- Full mode for clients with tool search, and compact mode (`search_actions` / `run_action`, ~1.2k tokens). `MCP_OSX_APPS` filters which app groups are exposed.
- `structuredContent` with an `outputSchema` for 27 list and "current item" actions.
- Bundled MCP skills: `applescript-authoring` and `macos-routines`.
- Built on the MCP TypeScript SDK v2; `serveStdio` serves both 2025-era and 2026-07-28 clients.
