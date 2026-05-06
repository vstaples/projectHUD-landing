# Iron Rule 65 — Ratification

**Status:** ratified 2026-05-06 (third attestation)
**Authority:** operator + architect
**Scope:** every CMD that modifies a render template's body bytes

---

## Rule

**When a CMD modifies the rendered output of an Edge Function (the template body bytes that produce the served artifact), both the front-end `js/version.js` pin AND the Edge Function's internal `RENDER_VERSION` constant must move together.** They are distinct artifacts deployed to distinct surfaces; missing either leaves a partial deploy invisible to verification. The dual-pin requirement applies specifically to template-body changes; CMDs that change only client-side surface code do not require Edge Function `RENDER_VERSION` movement.

---

## Why this rule exists

Three consecutive shipping incidents reinforced the same pattern:

**CMD-A7-POLISH-1 (first attestation)** — the polish CMD modified the render template body inside `render-minutes/index.ts`. Both `js/version.js` and `RENDER_VERSION` were bumped. Verification passed. The pattern was first noted in the hand-off but classified as too-narrow for ratification (single incident).

**CMD-MINUTES-PRINT-FLOW (second attestation)** — the print-flow CMD added `@media print` CSS to the render template body, requiring template-body changes. Both pins moved. The hand-off F3 finding surfaced explicit nuance: dual-pin applies when template bytes change, not when client surface code changes. The candidate was held one more cycle for clarity on this nuance.

**CMD-PROJECTION-ENGINE-2 (third attestation)** — the rename + new template addition CMD modified the template registry and added a new template body. Both pins moved. The hand-off confirmed the nuance held: client-only changes (e.g., picker UI adjustments) do not trigger the requirement; template-body changes do.

Three attestations across three CMDs, with the nuance from incident #2 confirmed by incident #3, is sufficient evidence base for ratification.

The rule's purpose is structural: when a deploy moves both surfaces but the version pin only updates on one, browser caches and Edge Function caches can serve mismatched artifacts. The cache-bust query string on script tags (per Iron Rule 61) handles browser-side invalidation; the `RENDER_VERSION` constant in the Edge Function ensures server-side rendered artifacts carry the correct version stamp for audit-trail and verification purposes.

---

## §1 — What the rule requires

For every CMD that modifies render template body bytes:

1. **Bump `js/version.js`** to the CMD's pin value (e.g., `v20260506-CMD-X`)
2. **Bump the Edge Function's internal `RENDER_VERSION` constant** to match
3. **Verify both moved during smoke test** by:
   - Hard-refresh of the application; console banner shows new version
   - Triggering a render; rendered HTML's footer shows new `RENDER_VERSION`
4. **Confirm in hand-off** that both pins moved together

The two values must match exactly, including any mid-cycle suffixes (e.g., `v20260506-CMD-X-b` if mid-cycle bumps occurred during execution).

---

## §2 — When the rule does NOT fire

The dual-pin requirement applies **only** when the CMD modifies the rendered output bytes. Specifically:

- **Client-only changes** (UI adjustments, surface module logic, picker UI, toast messaging, routing logic): bump `js/version.js` only; `RENDER_VERSION` does not need to move
- **Schema migrations** that don't affect rendering: bump neither pin (migrations are versioned independently via timestamp filenames)
- **CoC event additions** that don't affect rendered output: bump only the pin corresponding to where the change lives (`js/version.js` for client-side EVENT_META; neither for server-side CoC writes that don't touch the template)
- **RLS or storage policy changes**: bump neither pin

The diagnostic question for every CMD: *"Does this change alter the bytes the Edge Function produces when it renders an artifact?"* If yes, dual-pin. If no, single-pin or none.

---

## §3 — Cross-module application

Applies to every Edge Function across ProjectHUD that serves rendered artifacts:

- `render-minutes` — currently the only Edge Function carrying a `RENDER_VERSION` constant
- Future render Edge Functions (CMD-COUNTERFACTUAL-POC will likely produce one; CMD-CPM-DERIVED may produce one for schedule projections) — inherit the dual-pin discipline
- Future projection-engine extensions that introduce additional Edge Functions — inherit

The pattern: every Edge Function whose output carries a version stamp in its rendered artifact must expose its `RENDER_VERSION` constant to dual-pin discipline. The constant is the audit-trail anchor; the front-end pin is the deploy signal.

---

## §4 — Architect-side application

When drafting a CMD brief that touches render template bytes:

- The brief explicitly names both pins in §10 Consumer Enumeration
- The brief's §6 (or equivalent) verification subtest names both pin checks
- The brief's hand-off requirements include explicit confirmation that both pins moved

When the dual-pin requirement does NOT apply (client-only CMDs):

- The brief states explicitly: "Render template body unchanged; `RENDER_VERSION` constant does not need to move"
- This prevents the agent from mid-CMD speculation about whether the rule applies

---

## §5 — Rule pairing

Iron Rule 65 pairs naturally with:

- **Iron Rule 61** (cache-bust query strings derive from global `_PROJECTHUD_VERSION`) — ensures browser-side invalidation when `js/version.js` moves
- **Iron Rule 36** (hand-off terseness) — both pins are named explicitly in the consumer enumeration table
- **Iron Rule 64** (codebase-as-spec) — `RENDER_VERSION` is the established audit-trail mechanism in the codebase; future renders inherit the pattern

Together these rules establish a complete deploy-versioning discipline:

- Application versioning (`js/version.js`) → cache-bust on browsers (Rule 61)
- Render artifact versioning (`RENDER_VERSION`) → audit-trail on rendered bytes (Rule 65)
- Both move together when render bytes change (Rule 65)
- Either moves alone when only its surface changes (Rule 65 §2 nuance)

---

*Iron Rule 65 ratified 2026-05-06.*
