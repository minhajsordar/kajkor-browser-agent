// HTTP entry-point guards: which origins may talk to this backend, and how many
// unauthenticated attempts one address gets.
//
// PURE module (no express, no DB, no clock of its own) for the same reason as
// `todos.js` / `lessons.js` / `app-commands.js`: `require('./server.js')` boots
// Mongo and calls app.listen, so anything that needs deterministic tests cannot
// live in there. These two decisions are security-relevant, which is exactly the
// kind of logic that must be covered by tests rather than eyeballed.

// A blanket `Access-Control-Allow-Origin: *` let ANY page the user happened to be
// browsing read from this backend — and this backend hands back every record ever
// collected and can create tasks that act on the user's logged-in accounts. So
// the allowed origins are enumerated:
//   - NO Origin header (the extension's own fetch, curl, the packaged Electron
//     renderer loading over file://). There is no browsing context to protect,
//     and rejecting it would break every current caller.
//   - chrome-extension:// / moz-extension:// — the executor. An unpacked
//     extension's id changes per install, so the SCHEME is what can be pinned.
//   - loopback http(s) on any port — the electron-vite dev server.
// Anything else has to be named in CORS_ALLOWED_ORIGINS.
const LOOPBACK_ORIGIN_RX = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const EXTENSION_ORIGIN_RX = /^(chrome|moz)-extension:\/\//i;

function originAllowed(origin, extraOrigins = []) {
  if (!origin) return true;
  if (EXTENSION_ORIGIN_RX.test(origin)) return true;
  if (LOOPBACK_ORIGIN_RX.test(origin)) return true;
  return extraOrigins.includes(origin);
}

// Parse the CORS_ALLOWED_ORIGINS env value. Comma-separated; blanks dropped so a
// trailing comma or an empty variable cannot allow an empty origin.
function parseAllowedOrigins(raw) {
  return String(raw || '').split(',').map((s) => s.trim()).filter(Boolean);
}

// Fixed-window throttle, expressed as a pure state transition so the window
// arithmetic is testable without waiting on a real clock. `state` is whatever
// this function last returned for the key (or undefined/null the first time).
// Returns { allowed, state } — the caller stores `state` and honours `allowed`.
function throttleDecision(state, now, { windowMs, max }) {
  if (!state || now > state.resetAt) {
    return { allowed: true, state: { count: 1, resetAt: now + windowMs } };
  }
  const count = state.count + 1;
  return { allowed: count <= max, state: { count, resetAt: state.resetAt } };
}

module.exports = {
  LOOPBACK_ORIGIN_RX,
  EXTENSION_ORIGIN_RX,
  originAllowed,
  parseAllowedOrigins,
  throttleDecision,
};
