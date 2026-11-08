# mcp-osx

An MCP server that lets AI agents control macOS through `osascript`. It provides:

- **87 named actions across 19 app groups**: system settings, Finder, Safari, Chrome and Brave, Spotify, Music, TV, VLC, QuickTime, Photos, Keynote, Calendar, Reminders, Notes, Contacts, Mail, LookAway and more. They are non-destructive and run without a prompt.
- **`run_applescript`**, which runs any AppleScript or JXA the agent writes, but only after **you approve the exact script**.
- **Workflows**: an approved script can be saved as a reusable `workflow_<name>` tool.
- **Dictionary discovery**: the agent can read any app's AppleScript dictionary (`sdef`) to learn what the app supports. This lets it script apps that have no named action.

macOS only. Requires Node 20 or later.

## Install

Claude Code:

```bash
claude mcp add osx -- npx -y mcp-osx
```

Claude Desktop or any other MCP client (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "osx": { "command": "npx", "args": ["-y", "mcp-osx"] }
  }
}
```

From source:

```bash
npm install && npm run build
```

Then point your client at `node /path/to/mcp-osx/dist/index.js`.

## Tools

**Named actions** are prefixed by app group. Each group lives in `src/actions/<group>.ts`.

| Group | Examples |
|-------|----------|
| `system` | dark mode, volume, mute, Wi-Fi, clipboard, `say`, notification, screensaver, display sleep, battery, system info |
| `settings` | open a System Settings pane |
| `app` | open, activate, quit, list running, frontmost |
| `finder` | reveal, open folder, selection, front window path, list folder |
| `safari`, `chromium` | open URL, list/activate tabs, current tab, search, reading list (Safari); reload, back/forward (Chrome/Brave) |
| `spotify`, `music`, `tv`, `vlc`, `quicktime` | playback control, now playing, playlists, open stream URL |
| `photos`, `keynote` | albums, slideshow and presentation control |
| `calendar`, `reminders`, `notes`, `contacts` | list, read and search; create events, reminders and notes (never with attendees) |
| `mail` | accounts, unread count, list/read messages, check mail, **open a draft (never sends)** |
| `lookaway` | break-reminder control |

**Always available:**

| Tool | What it does |
|------|--------------|
| `run_applescript` | Run any AppleScript or JXA **after approval**. Can save it as a workflow. |
| `list_scriptable_apps`, `get_app_dictionary` | Discover what any app can be scripted to do (read-only) |
| `list_workflows`, `run_workflow`, `delete_workflow`, `workflow_<name>` | Saved workflows |
| `search_actions`, `run_action` | Find and run named actions (compact mode only) |

Some actions are deliberately missing. Anything that sends (Mail, Messages), deletes, empties, erases, runs code (JavaScript in browsers, Terminal `do script`, Shortcuts), writes files (export, save) or records is not a named action. The agent can still do it through `run_applescript`, which asks you first. A test enforces this for every named action, along with an `osacompile` check that every action script compiles.

To add an app, create `src/actions/<group>.ts`, prefix every action name with `<group>_`, and register the file in `actionGroups` in `src/actions/index.ts`.

## Context size: full vs compact mode

Every MCP tool definition counts against the agent's context.

| Mode | Tools listed | Up-front cost | Best for |
|------|--------------|---------------|----------|
| `full` (default) | 87 named actions + core tools | ~11k tokens if all loaded | Clients with **tool search**, such as Claude Code. They defer tools and load them on demand, so only the names cost tokens. |
| `compact` | `search_actions`, `run_action` + core tools | ~1.2k tokens | Clients that load every tool definition up front |

In compact mode, `search_actions("pause song")` returns the matching actions with their full JSON input schemas, and `run_action` validates the arguments against those schemas before running.

```json
{ "mcpServers": { "osx": { "command": "npx", "args": ["-y", "mcp-osx"], "env": { "MCP_OSX_MODE": "compact" } } } }
```

Limit the named actions to the app groups you use, in either mode:

```json
"env": { "MCP_OSX_APPS": "system,app,safari,spotify,calendar" }
```

An unknown group name stops the server at startup with the list of valid groups.

**Calling the Claude API directly with the MCP connector?** An MCP server can't mark its own tools as deferred; the API caller sets that. Defer everything and keep the core tools loaded:

```json
{
  "type": "mcp_toolset",
  "mcp_server_name": "osx",
  "default_config": { "defer_loading": true },
  "configs": {
    "run_applescript": { "defer_loading": false },
    "get_app_dictionary": { "defer_loading": false },
    "list_workflows": { "defer_loading": false }
  }
}
```

Add a `tool_search_tool_bm25_20251119` tool to the same request. Tool names are prefixed by app and descriptions use everyday task words, so searches such as "spotify" or "calendar event" find the right tools.

## Confirmation

Every `run_applescript` call, every deletion of a workflow, and every run of a workflow whose file changed must be approved:

1. If your MCP client supports **elicitation** (protocol 2025-era), the script is shown in the chat and you approve it there.
2. Otherwise, a **native macOS dialog** shows the full script in a scrollable view. **Deny** is the default button, and the dialog denies automatically after 120 seconds.

Anything other than an explicit approval, such as an error, timeout, or closed dialog, counts as **deny**.

## Workflows

Pass `saveAs` (plus optional `description` and `params`) to `run_applescript`. If you approve the script and it succeeds, it is stored at `~/.mcp-osx/workflows/<name>.json` and becomes a `workflow_<name>` tool. Later runs **don't ask again**.

Parameters map to `argv` in the order they are declared. Values are always passed as arguments and never inserted into the script, so a parameter can't inject code:

```applescript
on run argv
  tell application "Safari" to open location ("https://github.com/" & item 1 of argv)
end run
```

Each workflow file stores a SHA-256 hash of the script it was approved with. If the script is edited afterwards, the next run asks for approval again.

## Config

`~/.mcp-osx/config.json` (you can override the directory with `MCP_OSX_HOME`):

```json
{ "spotify": { "favorites": "spotify:playlist:37i9dQZF1DXcBWIGoYBM5M" } }
```

`spotify_play_favorites` plays this URI. Spotify's AppleScript interface can't read your library, so the URI has to be set here. To get it, right-click a playlist and choose **Share › Copy link**. A `spotify:` URI and an `open.spotify.com` link both work.

## macOS permissions

The first time the server controls an app, macOS asks whether the **host process** (your terminal or MCP client) may control it. If you click "Don't Allow", errors include `-1743`. To fix this, open **System Settings › Privacy & Security › Automation**.

Scripts that click UI elements through System Events also need **Accessibility** permission for the host process.

## Security model

- Named actions are non-destructive, and inputs reach them only as `argv`.
- Arbitrary code runs only after you approve that exact script.
- The workflow hash catches **accidental or out-of-band edits**. It does **not** protect against a malicious agent that can write files: such an agent could edit a workflow and recompute its hash.
- More generally, any agent with shell access can run `osascript` itself. This server only controls access through its own interface.

## Development

Built on the MCP TypeScript SDK v2 (`@modelcontextprotocol/server`). `serveStdio` serves both 2025-era and 2026-07-28 clients. Clients on the 2026-07-28 protocol get the native dialog for confirmations, because push-style elicitation isn't available there yet.


```bash
npm test        # vitest; macOS-only tests run real osascript
npm run build
```
