#!/usr/bin/env node
// test-rules.mjs — DEV-ONLY tests. NOT loaded by Chrome.
//
// Validates the SHIPPED rules.json by simulating Chrome's
// declarativeNetRequest queryTransform.removeParams semantics and asserting the
// resulting URLs. This lets us prove the ruleset is correct without a browser.
//
// Run:  node --test tools/test-rules.mjs      (or: npm test)
//
// removeParams semantics we model (per Chrome MV3 DNR):
//   * A query param is dropped iff its KEY exactly matches a name in the list
//     (case-sensitive, no wildcards). All occurrences of that key are removed.
//   * The path, fragment, and every non-listed param are left untouched.
//   * If nothing changes, Chrome no-ops (no redirect) — we assert clean === input.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES = join(__dirname, '..', 'rules.json');

const rules = JSON.parse(readFileSync(RULES, 'utf8'));
const removeParams =
  rules[0]?.action?.redirect?.transform?.queryTransform?.removeParams ?? [];
const removeSet = new Set(removeParams);

// Model Chrome's removeParams: delete every listed key, keep everything else.
function clean(input) {
  const u = new URL(input);
  for (const key of [...u.searchParams.keys()]) {
    if (removeSet.has(key)) u.searchParams.delete(key);
  }
  return u.toString();
}

// ── Structural sanity of the shipped rule ──────────────────────────────────────
test('rules.json is a single well-formed main_frame redirect rule', () => {
  assert.equal(rules.length, 1, 'exactly one rule');
  const r = rules[0];
  assert.equal(r.action.type, 'redirect');
  assert.deepEqual(r.condition.resourceTypes, ['main_frame']);
  assert.ok(removeParams.length > 100, 'has a substantial param catalog');
});

test('removeParams has no duplicates and is sorted (case-insensitive)', () => {
  assert.equal(removeSet.size, removeParams.length, 'no duplicate param names');
  const sorted = [...removeParams].sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase()));
  assert.deepEqual(removeParams, sorted, 'params are sorted');
});

test('key tracker/newsletter params are present', () => {
  for (const p of [
    'utm', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    'fbclid', 'gclid', 'msclkid', 'mc_eid', 'igshid', 'ttclid', 'yclid',
    '_bhlid',            // beehiiv (Superhuman newsletter) — the reported gap
    'ck_subscriber_id',  // ConvertKit / Kit
  ]) {
    assert.ok(removeSet.has(p), `expected removeParams to include "${p}"`);
  }
});

test('common functional params are NOT stripped', () => {
  for (const p of [
    'id', 'page', 'q', 'query', 'search', 'color', 'size', 'sort', 'lang',
    'v', 'status', 'category', 'sku', 'code', 'token',
  ]) {
    assert.ok(!removeSet.has(p), `functional param "${p}" must NOT be stripped`);
  }
});

// ── End-to-end URL cases (data-driven) ─────────────────────────────────────────
// Each case: [name, inputURL, expectedCleanURL]. expected === input means no-op.
const CASES = [
  // The three real URLs the user reported still-dirty.
  [
    'x.com: utm_* + _bhlid all stripped, /status/<id> path kept',
    'https://x.com/jamesoniam/status/2077432470375731467?utm_source=superhuman&utm_medium=newsletter&utm_campaign=robotics-special-america-s-next-big-car-is-a-robot&_bhlid=f166669cd8bbbb2994f469b1b836fc4f7572ff36',
    'https://x.com/jamesoniam/status/2077432470375731467',
  ],
  [
    'reuters.com: _bhlid stripped, dated path kept',
    'https://www.reuters.com/business/media-telecom/nvidia-partners-with-japan-robotics-firms-ai-development-2026-07-16/?_bhlid=b70d68d952d4a32b1826155f2040fc53f41210b9',
    'https://www.reuters.com/business/media-telecom/nvidia-partners-with-japan-robotics-firms-ai-development-2026-07-16/',
  ],
  [
    'businesswire.com: _bhlid stripped, encoded path kept',
    'https://www.businesswire.com/news/home/20260715089377/en/Walden-Robotics-Launches-with-%24300-Million-to-Put-General-Purpose-Robots-to-Work-Today?_bhlid=c421358eac3c2b9e4abb64a94a6c6f2094ea3d47',
    'https://www.businesswire.com/news/home/20260715089377/en/Walden-Robotics-Launches-with-%24300-Million-to-Put-General-Purpose-Robots-to-Work-Today',
  ],

  // Mixed: strip trackers, keep the functional param.
  [
    'trackers removed, functional id kept',
    'https://example.com/page?utm_source=news&fbclid=abc123&id=keep',
    'https://example.com/page?id=keep',
  ],
  // No-op cases (Chrome does not redirect when nothing changes).
  [
    'clean URL with functional param is a no-op',
    'https://example.com/page?id=keep',
    'https://example.com/page?id=keep',
  ],
  [
    'URL with no query is a no-op',
    'https://example.com/path/to/thing',
    'https://example.com/path/to/thing',
  ],
  // Fragment must survive.
  [
    'fragment is preserved while trackers are stripped',
    'https://example.com/doc?utm_source=x&id=7#section-2',
    'https://example.com/doc?id=7#section-2',
  ],
  // Newsletter platform params added in this project.
  [
    'ConvertKit + Blueshift newsletter ids stripped',
    'https://example.com/a?ck_subscriber_id=99&bsft_uid=abc&keep=1',
    'https://example.com/a?keep=1',
  ],
];

for (const [name, input, expected] of CASES) {
  test(name, () => {
    const got = clean(input);
    assert.equal(got, expected);
    // Every tracker key we intended to remove is actually gone.
    const leftover = [...new URL(got).searchParams.keys()].filter((k) =>
      removeSet.has(k));
    assert.deepEqual(leftover, [], `no listed tracker keys should remain`);
  });
}
