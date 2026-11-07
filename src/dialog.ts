import type { Runner } from './osascript.js';

/**
 * JXA NSAlert with a scrollable, read-only, monospaced view of the FULL script.
 * argv: [title, note, script]. Prints "allow" or "deny". Deny is the default
 * (first) button, so Return/Escape never approve by accident.
 */
export const DIALOG_JXA = `
ObjC.import('AppKit');
function run(argv) {
  var app = $.NSApplication.sharedApplication;
  app.setActivationPolicy($.NSApplicationActivationPolicyAccessory);
  var alert = $.NSAlert.alloc.init;
  alert.alertStyle = $.NSAlertStyleWarning;
  alert.messageText = argv[0];
  alert.informativeText = argv[1];
  alert.addButtonWithTitle('Deny');
  alert.addButtonWithTitle('Allow');
  var w = 720, h = 380;
  var scroll = $.NSScrollView.alloc.initWithFrame($.NSMakeRect(0, 0, w, h));
  scroll.hasVerticalScroller = true;
  scroll.hasHorizontalScroller = true;
  scroll.borderType = $.NSBezelBorder;
  var text = $.NSTextView.alloc.initWithFrame($.NSMakeRect(0, 0, w, h));
  text.editable = false;
  text.selectable = true;
  text.font = $.NSFont.monospacedSystemFontOfSizeWeight(12, 0);
  text.string = argv[2];
  scroll.documentView = text;
  alert.accessoryView = scroll;
  alert.window.level = $.NSFloatingWindowLevel;
  app.activateIgnoringOtherApps(true);
  var r = alert.runModal;
  return r == $.NSAlertSecondButtonReturn ? 'allow' : 'deny';
}
`;

export type DialogRequest = { title: string; script: string; lang: string; note?: string };

/** Show the native approval dialog. Anything other than an explicit Allow is a deny. */
export async function nativeDialog(req: DialogRequest, runner: Runner, timeoutSec = 120): Promise<boolean> {
  const lines = req.script.split('\n').length;
  const note = [req.note, `${req.lang === 'javascript' ? 'JavaScript (JXA)' : 'AppleScript'}, ${lines} line${lines === 1 ? '' : 's'}. Scroll to review the entire script.`, `Auto-denies after ${timeoutSec}s.`]
    .filter(Boolean)
    .join('\n');
  try {
    const r = await runner({ script: DIALOG_JXA, lang: 'javascript', args: [req.title, note, req.script], timeoutMs: timeoutSec * 1000 });
    return r.code === 0 && r.stdout.trim() === 'allow';
  } catch {
    return false;
  }
}
