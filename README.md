# mcp-osx

An MCP server that lets AI agents control macOS through `osascript`. It provides:

- **Named actions** for common tasks (dark mode, Safari, Spotify, volume, Wi-Fi, apps). These are safe, quick, and run without a prompt.
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

| Tool | What it does |
|------|--------------|
| `get_dark_mode`, `set_dark_mode` | Appearance |
| `get_volume`, `set_volume`, `set_muted` | Audio output |
| `wifi_status`, `set_wifi` | Wi-Fi power. Turning it off can cut the agent's own connection. |
| `notify` | Show a notification |
| `safari_open_url`, `safari_current_tab` | Safari |
| `spotify_control`, `spotify_current_track`, `spotify_play`, `spotify_play_favorites` | Spotify |
| `open_app`, `activate_app`, `quit_app`, `list_running_apps`, `frontmost_app` | Any application |
| `list_scriptable_apps`, `get_app_dictionary` | Discover what apps can be scripted to do (read-only) |
| `run_applescript` | Run any AppleScript or JXA **after approval**. Can save it as a workflow. |
| `list_workflows`, `run_workflow`, `delete_workflow`, `workflow_<name>` | Saved workflows |

The named actions are in `src/actions/`, one file per app. To add an app, create `src/actions/<app>.ts` and list it in `src/actions/index.ts`.

## Confirmation

Every `run_applescript` call, every deletion of a workflow, and every run of a workflow whose file changed must be approved:

1. If your MCP client supports **elicitation**, the script is shown in the chat and you approve it there.
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

```bash
npm test        # vitest; macOS-only tests run real osascript
npm run build
```
