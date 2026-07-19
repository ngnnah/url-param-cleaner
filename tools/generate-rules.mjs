#!/usr/bin/env node
// generate-rules.mjs — DEV-ONLY, one-time tooling. NOT loaded by Chrome.
//
// Produces ../rules.json: a single static declarativeNetRequest rule whose
// queryTransform.removeParams is a flat list of LITERAL tracking/affiliate
// param names.
//
// Why a generator: ClearURLs' catalog (data.min.json) stores rules as REGEXES
// (e.g. "(?:%3F)?mc_(?:eid|cid|tc)"), but DNR's removeParams is EXACT-MATCH
// only. So we expand the safe subset of those regexes into literal names.
//
// Design choices (security/safety first):
//   * We seed ONLY from the `globalRules` provider — the params ClearURLs
//     applies site-agnostically. Per-site rules (e.g. Amazon `qid`, `keywords`)
//     are deliberately skipped: stripping them globally risks breaking
//     unrelated sites and adds little for the email-link use case.
//   * Open-ended regex families (utm_*, ga_*, ...) are expanded via an explicit
//     table below, so every shipped param is auditable.
//   * Anything we can't reduce to safe literals is SKIPPED and logged.
//   * A curated CROSS_SITE_EXTRAS list adds well-known trackers/affiliate params
//     not fully covered by the catalog. Affiliate params are grouped separately
//     because they are the most likely to occasionally over-strip — trim freely.
//
// Usage:  node tools/generate-rules.mjs
// Source: https://raw.githubusercontent.com/ClearURLs/Rules/master/data.min.json
//         (falls back to ./data.min.json next to this script if offline)

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'rules.json');
const LOCAL = join(__dirname, 'data.min.json');
const CATALOG_URL =
  'https://raw.githubusercontent.com/ClearURLs/Rules/master/data.min.json';

// ── Explicit expansions for open-ended regex families in globalRules ──────────
// Keyed by the raw catalog entry (after the leading "(?:%3F)?" prefix is
// stripped). Each maps to the concrete literal member params we ship.
const FAMILY_EXPANSIONS = {
  // NOTE: DNR removeParams is exact-match (no wildcards), so the open-ended
  // `utm_*` namespace must be enumerated. `utm_` is tracking by convention
  // (Urchin), so any real variant we observe is safe to add here.
  'utm(?:_[a-z_]*)?': [
    'utm', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term',
    'utm_content', 'utm_id', 'utm_name', 'utm_cid', 'utm_reader',
    'utm_referrer', 'utm_social', 'utm_social-type', 'utm_brand',
    'utm_source_platform', 'utm_creative_format', 'utm_marketing_tactic',
    'utm_placement', 'utm_pubreferrer', 'utm_swu',
  ],
  'mtm(?:_[a-z_]*)?': [
    'mtm_source', 'mtm_medium', 'mtm_campaign', 'mtm_keyword',
    'mtm_content', 'mtm_cid', 'mtm_group', 'mtm_placement',
  ],
  'ga_[a-z_]+': [
    'ga_source', 'ga_medium', 'ga_term', 'ga_content', 'ga_campaign', 'ga_place',
  ],
  'otm_[a-z_]*': [
    'otm_source', 'otm_medium', 'otm_campaign', 'otm_term', 'otm_content',
  ],
};

// globalRules entries that are too broad to safely reduce to literals — skipped
// on purpose (e.g. "[a-z]?mc" would match many innocent params).
const KNOWN_BROAD_SKIP = new Set(['wt_?z?mc', '[a-z]?mc', 'vn(?:_[a-z]*)+']);

// ── Curated additions: well-known cross-site trackers not fully in the catalog ─
const CROSS_SITE_EXTRAS = [
  // Google
  'gbraid', 'wbraid', 'gclsrc',
  // HubSpot
  '_hsmi',
  // Instagram / TikTok / Snapchat / Reddit / Pinterest
  'igshid', 'ttclid', 'ScCid', 'rdt_cid', 'epik',
  // Matomo / Piwik
  'pk_campaign', 'pk_kwd', 'pk_source', 'pk_medium', 'pk_content',
  'piwik_campaign', 'piwik_kwd',
  // Adobe / Marketo / Klaviyo
  's_kwcid', 'ef_id', '_kx',
];

// Affiliate/referral params — most likely to occasionally over-strip on sites
// that use these names functionally. Kept in their own group so they are easy
// to trim. (`ref`/`ref_`/`referrer` also come from globalRules.referralMarketing.)
const AFFILIATE_EXTRAS = [
  'tag', 'ascsubtag',                     // Amazon
  'mkevt', 'mkcid', 'mkrid', 'campid', 'toolid', 'customid', // eBay
  'affiliate_id', 'aff_id', 'affid',
];

// ── Newsletter / email-platform link-tracking IDs ──────────────────────────────
// Params that email service providers append to OUTBOUND links so a click can be
// traced back to an individual subscriber/send. These are the ones that survive
// past the destination site (unlike ESP redirect-domain internals) and are the
// gap the email-link use case cares about most. Every name here is a namespaced,
// subscriber/link identifier — never a functional param — so global stripping is
// safe. Only names confirmed against vendor docs and/or the AdGuard TrackParam
// filter are listed; UTM-based ESPs (Substack, Constant Contact, Campaign Monitor,
// Brevo/Sendinblue, ActiveCampaign, Iterable, Braze) need nothing here because
// their tracking rides on utm_* which FAMILY_EXPANSIONS already covers.
// Note: several ESP params are ALREADY shipped elsewhere and intentionally not
// duplicated here — Mailchimp mc_cid/mc_eid/mc_tc, HubSpot _hsenc/_hsmi/__hs*,
// Klaviyo _kx, Marketo mkt_tok, Vero vero_*, MailerLite ml_subscriber*,
// Drip __s, Omeda/Olytics oly_*/rb_clickid (all via catalog or CROSS_SITE_EXTRAS).
const NEWSLETTER_EXTRAS = [
  // beehiiv — "_bhlid" = beehiiv link ID, unique per subscriber+link.
  // (Superhuman's newsletter and many others run on beehiiv.)
  // Confirmed: beehiiv docs + AdGuard TrackParam ("email subscription system").
  '_bhlid',
  // ConvertKit / Kit — "?ck_subscriber_id=<id>" auto-appended to broadcast &
  // sequence email links. Confirmed: Kit Help Center (Global advanced tracking).
  'ck_subscriber_id',
  // Blueshift — cross-channel email/link tracking IDs.
  // Confirmed: AdGuard TrackParam ("email subscription tracking").
  'bsft_clkid', 'bsft_eid', 'bsft_mid', 'bsft_uid', 'bsft_aaid', 'bsft_ek',
];

// ── Expander ──────────────────────────────────────────────────────────────────
const PREFIX = '(?:%3F)?';
const LITERAL_RE = /^[A-Za-z0-9_.-]+$/;
// stem(?:a|b|c)suffix  — a single non-capturing alternation group.
const SINGLE_ALT_RE = /^([A-Za-z0-9_.-]*)\(\?:([A-Za-z0-9_|-]+)\)([A-Za-z0-9_.-]*)$/;

function expandEntry(rawIn, skipped) {
  let raw = rawIn.startsWith(PREFIX) ? rawIn.slice(PREFIX.length) : rawIn;

  if (FAMILY_EXPANSIONS[raw]) return FAMILY_EXPANSIONS[raw];
  if (KNOWN_BROAD_SKIP.has(raw)) { skipped.push(rawIn); return []; }
  if (LITERAL_RE.test(raw)) return [raw];

  // ref_?  →  ref, ref_   (trailing single optional char)
  if (/^[A-Za-z0-9_.-]+\?$/.test(raw)) {
    const base = raw.slice(0, -1);
    return [base.slice(0, -1), base];
  }

  const m = raw.match(SINGLE_ALT_RE);
  if (m) {
    const [, stem, alts, suffix] = m;
    return alts.split('|').map((a) => `${stem}${a}${suffix}`);
  }

  skipped.push(rawIn); // anything still regexy is dropped, on purpose
  return [];
}

// ── Load catalog ──────────────────────────────────────────────────────────────
async function loadCatalog() {
  try {
    const res = await fetch(CATALOG_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log(`Fetched catalog from ${CATALOG_URL}`);
    return await res.json();
  } catch (e) {
    if (existsSync(LOCAL)) {
      console.log(`Fetch failed (${e.message}); using local ${LOCAL}`);
      return JSON.parse(readFileSync(LOCAL, 'utf8'));
    }
    throw new Error(`Could not fetch catalog and no local fallback: ${e.message}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
const data = await loadCatalog();
const gr = data.providers?.globalRules;
if (!gr) throw new Error('globalRules provider missing from catalog');

const skipped = [];
const params = new Set();

for (const entry of [...(gr.rules || []), ...(gr.referralMarketing || [])]) {
  for (const p of expandEntry(entry, skipped)) if (p) params.add(p);
}
for (const p of [...CROSS_SITE_EXTRAS, ...AFFILIATE_EXTRAS, ...NEWSLETTER_EXTRAS]) params.add(p);

const removeParams = [...params].sort((a, b) =>
  a.toLowerCase().localeCompare(b.toLowerCase()));

const rules = [
  {
    id: 1,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: { transform: { queryTransform: { removeParams } } },
    },
    // main_frame = top-level navigations (the links you click). Not sub-resources.
    condition: { urlFilter: '*', resourceTypes: ['main_frame'] },
  },
];

writeFileSync(OUT, JSON.stringify(rules, null, 2) + '\n');

console.log(`\nWrote ${OUT}`);
console.log(`Params shipped: ${removeParams.length}`);
console.log(`Skipped (too broad / unparseable): ${skipped.length}`);
if (skipped.length) console.log('  ' + skipped.join('  '));
