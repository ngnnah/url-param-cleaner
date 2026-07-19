# Privacy Policy — bareURL

_Last updated: 2026-07-19_

**Short version: bareURL collects nothing, stores nothing, and sends
nothing anywhere. It has no servers, no analytics, and no account.**

## What the extension does

bareURL removes known tracking, affiliate, and referral query
parameters (such as `utm_source`, `fbclid`, `gclid`, `mc_eid`) from the URLs of
pages you navigate to. It does this using Chrome's built-in
`declarativeNetRequest` API and a **static list of rules** bundled inside the
extension (`rules.json`).

## Data collection: none

- The extension contains **no JavaScript that runs at browse time** — only static
  declarative rules that Chrome itself applies.
- It does **not** read, log, store, or transmit your browsing history, the pages
  you visit, the URLs you open, your IP address, or any personal information.
- It makes **no network requests** of its own. There is no backend server.
- It uses **no analytics, telemetry, cookies, or tracking** of any kind.
- It has **no options page and no storage** — there is nothing to sync or export.

Because the rules are enforced by the browser via `declarativeNetRequest`, the
extension's code never even receives the URLs it cleans.

## Permissions and why they exist

- **`declarativeNetRequest`** — lets the extension supply Chrome with the static
  URL-rewriting rules that strip tracking parameters.
- **`host_permissions: <all_urls>`** — Chrome requires host access before a
  `redirect` rule may modify a request. Tracking parameters can appear on links
  to *any* website, so the rules must be allowed to apply everywhere. This
  permission is used **only** to let Chrome apply the bundled rules; the
  extension has no content scripts and cannot read page content or traffic.

## Changes to this policy

If this policy ever changes, the updated version will be published in the
extension's public repository alongside the source code.

## Contact

Questions: open an issue on the project's GitHub repository.
