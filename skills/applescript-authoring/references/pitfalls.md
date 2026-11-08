# AppleScript pitfalls (seen while building mcp-osx)

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Expected end of line, etc. but found identifier (-2741)` | A term such as `dark mode` was used outside the `tell` block of the app that defines it | Put the line inside the right `tell application …` / `tell … preferences` block |
| `Can't set up to …` | `up` is a reserved word | Rename the variable (e.g. `upt`) |
| Terms don't resolve when the app name comes from argv | `tell application (item 1 of argv)` can't load terminology when the script compiles | Wrap it in `using terms from application "Google Chrome"` (any app with the same dictionary) |
| `tab` returns a tab *object* | Inside a browser `tell` block, `tab` is a class | Use `character id 9`, or set a variable to `tab` before the `tell` block |
| `Not authorized to send Apple events … (-1743)` | macOS Automation permission was denied | Ask the user to allow it in System Settings › Privacy & Security › Automation |
| `… is not allowed assistive access (-25211)` | UI scripting through System Events needs Accessibility | Ask the user to enable the host app in System Settings › Privacy & Security › Accessibility |
| `Can't get …` (-1728) | The object doesn't exist (wrong index or name) | List the objects first, and use the indexes or names you get back |
| `Application isn't running` (-600) | The target app quit | Use `app_open` first, or check `is running` |
| The script hangs for 30s and then times out | Usually a pending Automation consent prompt, or the app is busy | Tell the user to look for a permission prompt. Big Calendar queries are slow, so narrow the date range |
| `do shell script` fails inside a `tell` block | The command goes to the target app | Move `do shell script` outside every `tell` block |
| Dates parse differently depending on locale | `date "…"` uses the system locale | Build dates from parts: `set d to current date`, then set the year, month, day and time |

## JXA (JavaScript for Automation)

Use `language: "javascript"` and `function run(argv) { … }`. JXA is easier for JSON-shaped data:

```javascript
function run(argv) {
  const Safari = Application('Safari');
  return JSON.stringify(Safari.windows().map(w => w.tabs().map(t => t.url())));
}
```
