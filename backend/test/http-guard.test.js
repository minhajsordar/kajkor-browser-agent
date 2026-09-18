// Unit suite for backend/http-guard.js — the CORS origin policy and the
// unauthenticated-request throttle. These are security decisions, so the point
// of this file is that a future "just allow it, the extension broke" change has
// to delete an explicit assertion rather than quietly widen the policy.
const g = require('../http-guard');
const { eq, ok } = require('./helpers');

// --- origins that MUST keep working (every current caller) ---
ok('no Origin header is allowed (extension fetch / curl / file:// renderer)', g.originAllowed(undefined) === true);
ok('empty Origin is allowed', g.originAllowed('') === true);
ok('chrome extension origin allowed (id varies per install)', g.originAllowed('chrome-extension://abcdefghijklmnopabcdefghijklmnop') === true);
ok('firefox extension origin allowed', g.originAllowed('moz-extension://1234-5678') === true);
ok('electron-vite dev server allowed', g.originAllowed('http://localhost:5173') === true);
ok('loopback IP allowed', g.originAllowed('http://127.0.0.1:34730') === true);
ok('loopback IPv6 allowed', g.originAllowed('http://[::1]:34730') === true);
ok('https loopback allowed', g.originAllowed('https://localhost') === true);

// --- origins that MUST be refused ---
// This is the whole reason the policy exists: any page the user was browsing
// could otherwise read every record the agent ever collected.
ok('a random website is refused', g.originAllowed('https://evil.example') === false);
ok('a site that merely CONTAINS localhost is refused', g.originAllowed('http://localhost.evil.example') === false);
ok('a subdomain-prefixed loopback is refused', g.originAllowed('http://127.0.0.1.evil.example') === false);
ok('an http site on a loopback-looking port is refused', g.originAllowed('http://evil.example:34730') === false);
ok('a non-extension scheme is refused', g.originAllowed('file://') === false);

// --- the explicit escape hatch ---
const extra = ['https://agent.internal.example'];
ok('an explicitly allowed origin passes', g.originAllowed('https://agent.internal.example', extra) === true);
ok('and only that exact origin', g.originAllowed('https://other.internal.example', extra) === false);

// --- parsing the env var ---
eq('parse: comma separated', g.parseAllowedOrigins('https://a.example, https://b.example'), ['https://a.example', 'https://b.example']);
eq('parse: blanks dropped so a trailing comma cannot allow ""', g.parseAllowedOrigins('https://a.example,,'), ['https://a.example']);
eq('parse: unset is empty', g.parseAllowedOrigins(undefined), []);
ok('an empty allowlist does NOT mean "allow everything"', g.originAllowed('https://evil.example', g.parseAllowedOrigins('')) === false);

// --- throttle window arithmetic ---
const opts = { windowMs: 1000, max: 3 };
let s = g.throttleDecision(undefined, 0, opts);
ok('throttle: first attempt allowed', s.allowed === true);
eq('throttle: window opens', s.state, { count: 1, resetAt: 1000 });
s = g.throttleDecision(s.state, 10, opts);
ok('throttle: second allowed', s.allowed === true);
s = g.throttleDecision(s.state, 20, opts);
ok('throttle: third allowed (at the max)', s.allowed === true);
eq('throttle: count reached max', s.state.count, 3);
s = g.throttleDecision(s.state, 30, opts);
ok('throttle: fourth refused', s.allowed === false);
eq('throttle: resetAt does NOT slide on a refusal (fixed window, not sliding)', s.state.resetAt, 1000);
// Hammering inside the window must not push the window out, or an attacker
// could keep it open forever.
s = g.throttleDecision(s.state, 999, opts);
ok('throttle: still refused inside the window', s.allowed === false);
eq('throttle: window end unchanged', s.state.resetAt, 1000);
// Past the window it starts over.
s = g.throttleDecision(s.state, 1001, opts);
ok('throttle: allowed again after the window', s.allowed === true);
eq('throttle: fresh window', s.state, { count: 1, resetAt: 2001 });
