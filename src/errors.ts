const HINTS: [RegExp, string][] = [
  [/-1743|Not authorized to send Apple events/i,
    'macOS blocked Automation. Open System Settings › Privacy & Security › Automation and allow the host app (terminal or MCP client) to control the target app.'],
  [/-25211|-1719|assistive access|accessibility/i,
    'UI scripting needs Accessibility permission. Open System Settings › Privacy & Security › Accessibility and enable the host app (terminal or MCP client).'],
  [/-600|isn.t running/i, 'The target application is not running. Launch it first (e.g. with open_app).'],
  [/-1728|Can.t get/i, 'The referenced object does not exist. Check names/indexes; use get_app_dictionary to inspect what the app exposes.'],
];

/** Return stderr plus a short remediation hint for well-known osascript failures. */
export function explainError(stderr: string): string {
  const hit = HINTS.find(([re]) => re.test(stderr));
  return hit ? `${stderr}\nHint: ${hit[1]}` : stderr;
}
