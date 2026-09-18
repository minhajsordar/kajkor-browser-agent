// Chat as the app's control plane — phase 1: explicit `/todo` and `/routine`.
// Plan: plans/partially-done/chat-app-control.md
//
// PURE module (no DB, no network, NO model) so the parse is unit-testable and
// deterministic. That is the whole point of phase 1: a prefix cannot be
// misclassified, whereas a natural-language detector can — and this project has
// already paid for that twice (`feedbackTriage.isCorrectionMessage` was made
// pure and strict after two misfires, and a meta-request mis-routed to `browse`
// has re-run a posting flow against a live account).
//
// The model is NOT consulted here. It fills payloads in phase 2, never decides
// whether a message is a command about the app.

// `/todo …` = one item on today's list. `/routine …` = repeatable work.
// Aliases exist because the user will reach for whichever word is in their head.
const APP_CMD_RX = /^\/(todos?|routines?|repeat)\b[:\s]*/i;

const KIND_BY_WORD = {
  todo: 'todo.add', todos: 'todo.add',
  routine: 'routine.create', routines: 'routine.create', repeat: 'routine.create',
};

// A trailing "…and add this as a todo" is how the user naturally ends the
// sentence, and they may type it AFTER the prefix too. It is instruction to US,
// not to the agent, so it is stripped from what gets stored — an instruction
// that still says "add this as a todo" would tell the browser agent to go and
// look for a todo button somewhere.
const SAVE_CLAUSE_RX =
  // Note the separator class excludes `.` — eating it would strip the previous
  // sentence's full stop ("do the thing. also add this as a todo" → "do the thing").
  /[\s,;]*\b(?:and|then|also)?\s*(?:please\s+)?(?:add|save|keep|store|put|make|create)\s+(?:this|it|that|the)?\s*(?:task|instruction|flow|thing)?\s*(?:as|to|in|into)?\s+(?:a\s+|my\s+|the\s+)?(?:new\s+)?(?:todo|to-do|to do|routine|schedule|daily task)s?(?:\s+list)?[\s.!]*$/i;

function stripSaveClause(text) {
  const s = String(text || '').trim();
  const out = s.replace(SAVE_CLAUSE_RX, '').trim();
  // Never strip everything: if the clause WAS the whole message, keep the
  // original so the caller can complain about a missing instruction rather than
  // silently creating an empty todo.
  return out || s;
}

// A short human name. The user renames it in the Todos page; this only has to
// be recognisable in a list.
function deriveName(instruction) {
  const first = String(instruction || '').split(/[\n.!?]/)[0].trim();
  const s = (first || String(instruction || '')).trim();
  return (s.length > 60 ? `${s.slice(0, 57)}…` : s) || 'Untitled';
}

// Parse an explicit app command. Returns null when the message is NOT one, so
// the caller falls through to ordinary chat routing untouched.
//
// Supported shapes:
//   /todo <instruction>
//   /routine <instruction>
//   /routine "My name" <instruction>      — leading quoted name
function parseAppCommand(message) {
  const raw = String(message == null ? '' : message);
  const m = raw.match(APP_CMD_RX);
  if (!m) return null;

  const word = m[1].toLowerCase();
  const kind = KIND_BY_WORD[word];
  if (!kind) return null;

  let rest = raw.slice(m[0].length).trim();
  let name = '';
  const quoted = rest.match(/^["“']([^"”']{1,80})["”']\s*(.*)$/s);
  if (quoted && quoted[2].trim()) {
    name = quoted[1].trim();
    rest = quoted[2].trim();
  }

  const instruction = stripSaveClause(rest);
  if (!instruction) {
    return {
      kind, error: kind === 'todo.add'
        ? 'Say what the todo should do — e.g. `/todo open chrome and check my orders`.'
        : 'Say what the routine should do — e.g. `/routine post today\'s deal to facebook`.',
    };
  }
  return { kind, name: name || deriveName(instruction), instruction, error: '' };
}

// What the approval card says. Deliberately states the CONSEQUENCE ("nothing
// runs until you press play") — the whole reason the card exists is that "do
// this and save it as a todo" is ambiguous, and guessing "run it" posts live.
function describeCommand(cmd) {
  if (cmd.kind === 'todo.add') {
    return {
      summary: `Add a todo — “${cmd.name}”`,
      detail: `${cmd.instruction}\n\nIt goes on today's list. Nothing runs until you press ▶ (here or on the Todos page).`,
    };
  }
  return {
    summary: `Save a routine — “${cmd.name}”`,
    detail: `${cmd.instruction}\n\nSaved as a MANUAL routine: it builds a list only when you ask it to, and nothing runs on a schedule until you turn one on.`,
  };
}

module.exports = { APP_CMD_RX, parseAppCommand, stripSaveClause, deriveName, describeCommand };
