# mcp-osx — Design

Date: 2026-11-08
Status: Draft, awaiting approval (builder check done)

## Intent

A local MCP server that lets AI agents control macOS through `osascript`: change system settings and drive apps. The user wants to type requests like "turn on dark mode, open Safari to GitHub, pause Spotify, play my favorite tracks" and have the agent do them.

Agents get two kinds of capability:

1. **Named actions**: curated, safe, fast tools for common tasks. They run without asking.
2. **Raw AppleScript**: the agent writes any script it wants, and the user must approve that exact script before it runs. An approved script can be saved as a **workflow**, a reusable named tool that runs later without asking again.

Prior art the user pointed to: m0rvayne/mcp-osascript, MayCXC/osa-mcp, joshrutkowski/applescript-mcp, FradSer/mcp-server-osascript, SuperCrazyKaizen/macos-automator-mcp, peakmojo/applescript-mcp.

## Goals

- Named actions for the user's examples, working out of the box:
  - Appearance: get/set dark mode.
  - Safari: open a URL (new tab or window), get the current tab URL and title.
  - Spotify: play, pause, toggle, next, previous, current track, play a URI or playlist, play "favorites".
- A broader first batch of named actions (the builder's call, but at least): output volume get/set/mute, Wi-Fi on/off/status, open/quit/activate an app, list running apps, get the frontmost app, show a notification.
- `run_applescript` (and JavaScript for Automation (JXA) via `osascript -l JavaScript`) with mandatory user confirmation.
- A way to save an approved script as a workflow, and to list, run and delete workflows.
- Saved workflows appear in the agent's tool list.
- **Dictionary discovery** (requested by the user): the agent can learn what any installed app can do through AppleScript, then write scripts for apps that have no named action. This is the path to supporting new apps dynamically: discover the dictionary, write a raw script (confirmed), then save it as a workflow.
  - `list_scriptable_apps`: installed apps that ship a scripting dictionary, i.e. apps whose `Info.plist` has `OSAScriptingDefinition` or `NSAppleScriptEnabled`, found with Spotlight (`mdfind`) plus a scan of `/Applications`, `/System/Applications`, and `/System/Library/CoreServices`. Duplicate copies such as cached Chrome-for-Testing builds are collapsed or filtered.
  - `get_app_dictionary(app, filter?)`: runs `sdef <app path>` and returns a **compact summary** (suites, commands with parameters, classes with properties and elements, enumerations), not the raw XML. Finder's raw dictionary is about 42 KB. An optional filter narrows it to one suite, command, or class. Results are cached per app path and version.
  - Both tools are read-only, so they need no confirmation.

## Anti-goal (the one that matters most)

**A destructive or arbitrary script must never run without the user explicitly approving it first.** Concretely:

- Named actions must be non-destructive by construction: no file deletion, sending messages, or emptying the Trash. If an action could be destructive, it is not a named action.
- An agent must not be able to bypass confirmation for a raw script. Saving a workflow is the only path to running without a prompt, and it applies only to scripts the user has already approved.
- If confirmation can't be obtained (no client support, dialog error, timeout, user closes the dialog), the answer is **deny**. Never default to allow.
- If a saved workflow's script changes on disk after approval (hand edit, another process), it must be re-approved before it runs. Store a content hash at approval time and compare it before every run.
- Inputs interpolated into scripts (URLs, app names, workflow parameters) must be escaped or passed as `osascript` arguments (`on run argv`), never concatenated into script source. Otherwise a parameter could inject code into an approved workflow.

## Non-goals

- Pixel-level computer use, screenshots or OCR.
- Remote or networked operation. The server runs locally over stdio only.
- Reading a Spotify library through the Spotify Web API. AppleScript only.
- Cross-platform support. The server is macOS-only.

## Decided by the user

- **Both** named actions and raw scripts; raw scripts need confirmation.
- **Confirmation UX:** use MCP elicitation when the connected client supports it, and fall back to a **native macOS dialog** otherwise. The dialog shows the full script and has Allow / Deny buttons. An "accept" through elicitation counts as the user's approval. The user chose this over always requiring the native dialog, so trust in the client's prompt is accepted.
- **Threat model:** the server guards only its own interface. A plain `approvedHash` stored in the workflow file is enough. Protecting against an agent that can write files directly (one that could edit a workflow and recompute its hash) is explicitly out of scope; the user chose this over Keychain-signed approvals. The README must say plainly that the hash catches accidental or out-of-band edits, not a malicious agent with file access, and that any agent with a shell can run `osascript` directly anyway.
- **Approved custom scripts can be saved inside the server as reusable workflows.**
- Saved workflows:
  - run later without confirmation (they were already approved);
  - are stored as human-readable files the user can inspect and edit, in a folder such as `~/.mcp-osx/workflows/`;
  - can take simple parameters;
  - appear to the agent as tools.

## Decided by me (user may override)

- **Stack:** TypeScript, Node 20+, official `@modelcontextprotocol/sdk`, `zod` for schemas. Distributed via `npx` (package name to be chosen; `mcp-osx` if available).
- **Transport:** stdio.
- **Execution:** spawn `osascript` with `execFile` (no shell). Pass the script via `-e` or stdin and pass parameters as argv. Default timeout around 30 s, configurable per call within a cap.
- **Spotify "favorites":** AppleScript can't read the library, so favorites come from a URI in a config file (`~/.mcp-osx/config.json`, e.g. `{"spotify": {"favorites": "spotify:playlist:..."}}`). If it isn't set, the tool returns a clear error explaining how to set it.
- **Workflow file format:** one JSON file per workflow: `name`, `description`, `language` (`applescript` or `javascript`), `script`, `params` (name, type, description, required), `approvedHash` (SHA-256 of script and language), `createdAt`.
- **Saving flow:** `run_applescript` accepts an optional `saveAs` (plus `description` and `params`). The confirmation dialog states that the script will also be saved as a workflow. One approval covers both the run and the save. A separate `save_workflow` tool that takes new script text is **not** allowed, because it would let an agent store unapproved code. If saving is offered after the run, it must reference the exact approved script by an ID the server issued, not resent text.
- **Dynamic tools:** each workflow is registered as a tool named `workflow_<name>`. The server sends `notifications/tools/list_changed` when workflows are added or removed. Generic `list_workflows`, `run_workflow`, and `delete_workflow` tools also exist for clients that ignore list changes. Deleting a workflow needs confirmation too.
- **Errors:** return `osascript` stderr verbatim with a short hint for common failures. The main case is macOS Automation/Accessibility permission (`-1743` "Not authorized to send Apple events"), and the hint tells the user which System Settings pane to open.

## Constraints

- macOS 14+ (target machine runs macOS 26). On first use, macOS asks for Automation permission once per target app, attributed to the host process (the terminal or MCP client). The README must explain this.
- The native dialog must work when the server runs as a stdio child of a GUI client or a terminal. `display dialog` through `osascript` works from both, but it needs a timeout (`giving up after`), and a give-up counts as deny.
- **The user must always be able to see the entire script before approving it. Never truncate.** `display dialog` can't show long text, so the native dialog is a JXA/AppKit `NSAlert` with a scrollable, read-only, monospaced text view showing the full script. Its buttons are Allow / Deny, the default button is Deny, and it has a timeout that counts as deny. (My call, from the builder check.)

## Left to the builder

- The exact named-action list beyond the minimum above, as long as every action is non-destructive.
- Module layout, test strategy (unit-test escaping, hashing, confirmation logic, and workflow storage with a mocked runner; macOS integration tests may be opt-in), and README structure.
- Whether named actions use AppleScript or JXA internally.
- Workflow name validation rules (they must be safe as filenames and tool names).
