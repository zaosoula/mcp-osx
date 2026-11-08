---
name: applescript-authoring
description: How to automate a macOS app that has no named action through mcp-osx. Covers reading the app's dictionary, writing an AppleScript or JXA script that takes its inputs through argv, getting it approved, and saving it as a reusable workflow. Use this before calling run_applescript.
---

# Writing AppleScript for mcp-osx

Use this skill when no named action does what you need. In compact mode, run `search_actions` first; in full mode, look for an `<app>_*` tool first.

## Workflow

1. **Find the app.** Call `list_scriptable_apps` to get the exact name of an app that ships a scripting dictionary.
2. **Read its dictionary.** `get_app_dictionary(app, filter)` returns commands, classes and properties. Use `filter` to stay small, e.g. `get_app_dictionary("Music", "playlist")`. Script only with terms from the dictionary.
3. **Write the script so its inputs travel through argv.** Don't put user values into the script text. Pass them in `args` and read them inside the script:

   ```applescript
   on run argv
     set q to item 1 of argv
     tell application "Music"
       set hits to (search library playlist 1 for q)
       if hits is {} then return "no match"
       play item 1 of hits
       return name of item 1 of hits
     end tell
   end run
   ```

   Call it with `run_applescript({ script, args: ["daft punk"] })`. The user must approve each script, and they see the full text and the argv values.
4. **Return plain, compact text.** Put one record per line with tab-separated fields, and truncate long values. That output goes back into your context.
5. **Save it if it will be reused.** Pass `saveAs`, a `description` and `params` (which map to argv in order). After the user approves, it becomes a `workflow_<name>` tool that runs without asking again. The approval prompt warns the user that later runs can pass any value for those params, so keep params narrow.

## Rules

- **Read-only first.** If you only need to look, write a script that only reads.
- **Never launch an app just to read from it.** Check `if application "X" is running` and return a message if it isn't.
- **Don't ask for destructive scripts lightly.** Sending, deleting or overwriting is possible, but say clearly in your message what the script will do. The user approves exactly what you show them.
- **Keep scripts short.** Approval is easier when the script fits on one screen.

See `references/pitfalls.md` for errors that come up often and how to fix them.
