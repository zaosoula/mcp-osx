# Changelog

## v0.1.1

[compare changes](https://github.com/zaosoula/mcp-osx/compare/v0.1.0...v0.1.1)

### 🩹 Fixes

- Explicit tool annotations (local-only read tools, destructive script tools) ([035ec7c](https://github.com/zaosoula/mcp-osx/commit/035ec7c))

### 📖 Documentation

- Add mcprush badge, fix CI badge workflow ([b4aa804](https://github.com/zaosoula/mcp-osx/commit/b4aa804))

### 🏡 Chore

- Shorten MCP Registry description to meet its limit ([0ac6d15](https://github.com/zaosoula/mcp-osx/commit/0ac6d15))

### 🤖 CI

- Bump GitHub actions off the deprecated Node 20 runtime ([feb5d96](https://github.com/zaosoula/mcp-osx/commit/feb5d96))
- Wait for npm availability before registry publishing ([16f0504](https://github.com/zaosoula/mcp-osx/commit/16f0504))

### ❤️ Contributors

- Zao Soula ([@zaosoula](https://github.com/zaosoula))

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
