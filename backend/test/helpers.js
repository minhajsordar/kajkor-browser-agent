// Test helpers for the pure backend modules.
//
// These suites started life as `.scratch-*-test.js` files with a hand-rolled
// pass/fail counter. The assertions were good; what was missing was a RUNNER, so
// nothing re-ran them and a regression could land unnoticed. `eq`/`ok` keep the
// exact call shape the scratch suites used — `eq(name, actual, expected)` — so
// converting them was a header swap, not a rewrite of every case.
//
// `eq` compares JSON.stringify output rather than using deepStrictEqual, on
// purpose: that is what the original assertions meant, and switching comparison
// semantics while converting would have turned a port into a behaviour change.

const test = require('node:test');
const assert = require('node:assert');

function eq(name, actual, expected) {
  test(name, () => {
    assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected));
  });
}

function ok(name, cond, extra) {
  test(name, () => {
    assert.ok(cond, extra == null ? undefined : String(extra));
  });
}

module.exports = { eq, ok };
