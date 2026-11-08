# Changelog

## v0.1.1


### 🚀 Enhancements

- Osascript runner ([113ed2a](https://github.com/zaosoula/mcp-osx/commit/113ed2a))
- Named actions ([52dbb63](https://github.com/zaosoula/mcp-osx/commit/52dbb63))
- Confirmation via elicitation or native dialog ([597f778](https://github.com/zaosoula/mcp-osx/commit/597f778))
- Workflow store ([a40676f](https://github.com/zaosoula/mcp-osx/commit/a40676f))
- App dictionary discovery ([8f85110](https://github.com/zaosoula/mcp-osx/commit/8f85110))
- Mcp server with workflows, confirmation, dictionary tools ([3d3686c](https://github.com/zaosoula/mcp-osx/commit/3d3686c))
- Named actions for 18 apps (media, browsers, PIM, Finder, settings), safety + compile tests, per-action timeouts ([032a162](https://github.com/zaosoula/mcp-osx/commit/032a162))
- App-prefixed action names, compact mode (search_actions/run_action), MCP_OSX_APPS filter, tool-search-friendly instructions ([cce1136](https://github.com/zaosoula/mcp-osx/commit/cce1136))
- Migrate to MCP TypeScript SDK v2 (serveStdio, per-request elicitation), examples in tricky tools, README modes ([d4abcc2](https://github.com/zaosoula/mcp-osx/commit/d4abcc2))
- Approvals via MCP inputRequired with HMAC-signed state bound to the exact script; native dialog fallback ([fc41ed6](https://github.com/zaosoula/mcp-osx/commit/fc41ed6))
- Publish bundled skills (applescript-authoring, macos-routines); structured output plumbing ([0c5ba1f](https://github.com/zaosoula/mcp-osx/commit/0c5ba1f))
- Typed structuredContent for 27 list/current actions; intent-friendly playback descriptions; README ([de12952](https://github.com/zaosoula/mcp-osx/commit/de12952))

### 🩹 Fixes

- Approve only the shown workflow script, warn about saved params, http(s)-only Safari URLs, survive watcher errors ([a2a6269](https://github.com/zaosoula/mcp-osx/commit/a2a6269))
- **dictionary:** Parse DOCTYPE internal subsets, inline xi:include suites ([3594ccd](https://github.com/zaosoula/mcp-osx/commit/3594ccd))

### 💅 Refactors

- Split named actions into per-app modules ([b49bb8b](https://github.com/zaosoula/mcp-osx/commit/b49bb8b))

### 📖 Documentation

- Design spec and implementation plan ([773d6d2](https://github.com/zaosoula/mcp-osx/commit/773d6d2))
- Readme ([a3d11f7](https://github.com/zaosoula/mcp-osx/commit/a3d11f7))

### 🏡 Chore

- Action.output column declaration ([cfbdca2](https://github.com/zaosoula/mcp-osx/commit/cfbdca2))
- Prepare for distribution (npm metadata, LICENSE, CHANGELOG, MCP Registry server.json, CI/publish workflows, generated tool reference, README rewrite); retry named actions once on -600 ([667cd89](https://github.com/zaosoula/mcp-osx/commit/667cd89))

### ✅ Tests

- Skip osacompile check for apps missing on the machine (CI runners) ([2133c8a](https://github.com/zaosoula/mcp-osx/commit/2133c8a))

### 🤖 CI

- Run on main ([579a7ab](https://github.com/zaosoula/mcp-osx/commit/579a7ab))
- Automated releases (changelogen, npm trusted publishing, MCP Registry), smoke-tested dist ([09dafb5](https://github.com/zaosoula/mcp-osx/commit/09dafb5))
- Run changelogen via npx on linux jobs (package is darwin-only) ([0c3a7d1](https://github.com/zaosoula/mcp-osx/commit/0c3a7d1))

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
