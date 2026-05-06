# Brief · Surface dependency audit · CMD-SURFACE-DEP-AUDIT-1

## §0 — Standing rules for fresh agent

Read before proceeding.

**Iron Rule 36, 37, 38, 39, 40** — base operating discipline.
**Iron Rule 51** — class-conditional treatments at construction time.
**Iron Rule 52 §4** — function-name and logical-concern collision check.
**Iron Rule 55** — architect-side canonical-source verification.
**Iron Rule 60** — first-caller hazard awareness.
**Iron Rule 64** — codebase-as-spec strictly applies. The canonical convention is `accord.html`'s static script-loading order. The audit measures every other surface HTML against that convention; missing dependencies are surfaced as findings, not silently fixed.
**Iron Rule 65** — render-version dual-pin applies only to template body changes. **This CMD does NOT modify any render template body bytes; `RENDER_VERSION` does NOT need to move. Bump only `js/version.js`.**

This is a small audit-and-fix CMD. Investigation pattern: survey first, surface findings, apply fix(es) only after architect confirms the diagnosis is correct. Two-phase work like CMD-AUTH-INIT-RACE.

---

## §1 — Purpose

Two prior CMDs surfaced the same bug class:

- **CMD-AUTH-INIT-RACE** — `aegis.html` was missing `<script src="/js/config.js">` and `<script src="/js/auth.js">` from its static loader, producing a fail-fast on cold load
- **CMD-AEGIS-PLAYBOOK-FOUNDATION F12** — `aegis.html` was *also* missing `<script src="/js/api.js">` and `<script src="/js/coc.js">` from its dynamic loader, causing CoC writes to silently no-op

Both bugs were the same pattern: a surface page didn't load a shared module that some downstream code depended on, with the failure surfacing only when downstream code tried to use the missing dependency.

The pattern arises because ProjectHUD has multiple surface HTML files (accord.html, compass.html, cadence.html, aegis.html, pipeline.html, dashboard.html, resource-requests.html, resources.html, users.html, plus possibly others) that each load shared modules independently. When a CMD adds a new shared dependency, it's possible — and demonstrated multiple times — for that dependency to land in some surfaces but not others.

After CMD-SURFACE-DEP-AUDIT-1 ships:

1. Every top-level surface HTML file in the project is audited for static-script-loading consistency
2. Every surface loads the canonical shared-module set (`config.js`, `auth.js`, `version.js`, plus any other modules whose absence would produce silent failures or cold-load fail-fasts)
3. Missing dependencies are surfaced as findings BEFORE fixing (so the architect can confirm the canonical set)
4. Fixes apply the canonical pattern uniformly across all surfaces
5. A finding documents which surfaces had which gaps, providing a baseline for future audits

This is a one-shot audit. The architectural concern (manual dependency propagation across surfaces is error-prone) is a longer-horizon question worth tracking but not solving in this CMD.

---

## §2 — Scope

### In scope

- Phase 1: enumerate all top-level surface HTML files in the project root (or wherever they live)
- Phase 1: for each surface HTML, list the static `<script src="...">` tags AND the dynamic loader's script-injection block (if any)
- Phase 1: identify the canonical shared-module set (using `accord.html` as the established reference per Iron Rule 64)
- Phase 1: produce a findings table — for each surface, which canonical modules are loaded statically, dynamically, or missing entirely
- Phase 1 HALT: surface findings to architect for diagnosis confirmation
- Phase 2 (after architect confirmation): apply fixes uniformly — add missing static script tags to surfaces lacking them
- Behavioral verification per §5
- Pin bump in `js/version.js` (no `RENDER_VERSION` change per Iron Rule 65)
- Hand-off per §8

### Out of scope

- Architectural refactor toward a shared script-loading manifest (e.g., server-side template, build-time include, runtime bootstrap loader). That's a future CMD if and when manual propagation becomes too error-prone.
- Any changes to the shared modules themselves (auth.js, config.js, api.js, coc.js, version.js) beyond what's needed to load them
- Any changes to surface module logic (accord-core.js, compass.js, etc.)
- Any changes to render templates, Edge Functions, schema, RLS, or CoC events
- Changes to the dynamic loader pattern itself (some surfaces use a dynamic loader; some don't; the audit doesn't refactor this)
- Aegis-specific fixes (those are already in place from CMD-AUTH-INIT-RACE and CMD-AEGIS-PLAYBOOK-FOUNDATION)

---

## §3 — Investigation requirements (Phase 1)

Before applying any fix, the agent surveys.

### §3.1 Enumerate surface HTML files

Locate every top-level HTML file in the project that serves as an operator-facing surface. Likely candidates per known references:

- `accord.html` — established reference (canonical pattern source)
- `aegis.html` — already fixed via CMD-AUTH-INIT-RACE Part 1 + CMD-AEGIS-PLAYBOOK-FOUNDATION
- `compass.html`
- `cadence.html`
- `pipeline.html`
- `dashboard.html`
- `resource-requests.html`
- `resources.html`
- `users.html`

The agent surveys the actual project structure. Surface-style HTML that has additional names (admin.html, settings.html, etc.) is in scope. Pure marketing / landing-page HTML or test fixtures are out of scope.

For each enumerated file, capture: file path, file size (line count), and primary purpose (one-line description).

### §3.2 Capture loading conventions per file

For each enumerated surface HTML, document:

- **Static script tags** — every `<script src="...">` tag in document order (typically in `<head>` or top of `<body>`), including which has `defer` / `async` and which is unmarked (parser-blocking)
- **Dynamic loader presence and contents** — if the file has an inline `<script>` block that injects further script tags via `document.createElement('script')`, document which scripts get injected and in what order
- **Inline boot scripts** — any inline `<script>` blocks that initialize HUDShell, surface modules, etc.

The agent uses grep/sed to extract these systematically; not by hand-reading.

### §3.3 Identify the canonical shared-module set

Using `accord.html` as the reference, identify the modules that the canonical surface loads. From prior CMDs we know this includes at least:

- `config.js`
- `auth.js`
- `version.js`
- `api.js` (per CMD-AEGIS-PLAYBOOK-FOUNDATION F12)
- `coc.js` (per CMD-AEGIS-PLAYBOOK-FOUNDATION F12)
- `ui.js`
- `notif.js`
- `sidebar.js`
- `cmd-center.js` (typically dynamic-loaded)

The agent confirms the actual set by reading `accord.html`. The canonical set is whatever accord.html loads — Iron Rule 64.

### §3.4 Build the findings table

For each surface × each canonical module, mark:

- **STATIC** — loaded via `<script src="...">` tag
- **DYNAMIC** — loaded via dynamic loader (`document.createElement` block)
- **MISSING** — not loaded at all

Output as a table sorted by surface, with one column per canonical module.

Surfaces that match accord.html's pattern have all entries STATIC or DYNAMIC (matching the appropriate canonical mechanism). Surfaces with MISSING entries are the bugs to fix.

### §3.5 Halt point — surface findings

After Phase 1 completes, the agent halts and surfaces:

1. The enumerated surface HTML list
2. The canonical shared-module set per accord.html
3. The findings table (surfaces × modules)
4. Specifically named MISSING entries with their failure-mode predictions (e.g., "compass.html missing api.js → CoC writes will silently no-op")
5. Any architectural surprises noticed during the survey (multiple dynamic-loader patterns? differing module ordering? defer/async usage divergence?)

The agent waits for architect confirmation of the diagnosis before proceeding to Phase 2.

---

## §4 — Fix specification (Phase 2, applies after architect confirmation)

The fix pattern applies uniformly: surfaces with MISSING entries get the missing script tags added in the same order and load mechanism (static vs dynamic) as accord.html uses.

Constraints on the fix:

- **Match accord.html's loading order exactly**. If accord.html loads config.js → auth.js → api.js → coc.js → ui.js → notif.js → version.js → (dynamic), other surfaces follow the same order. Iron Rule 64.
- **Preserve existing inline boot scripts** in target surfaces — they may have surface-specific initialization that runs after dependencies load. The fix adds dependencies; it doesn't reshape the existing boot logic.
- **No defer / async added** unless accord.html uses them on the same tags. Static parser-blocking is the canonical convention for these dependencies.
- **No new shared modules introduced** — this CMD adds existing modules to surfaces that lack them, nothing more.

If the architect's confirmation reveals additional concerns (e.g., one of the surfaces has surface-specific reasons it intentionally omits a module), the fix is scoped accordingly.

---

## §5 — Behavioral verification

### §5.1 Sentinel — code identity

1. Hard-refresh any modified surface. Console banner shows CMD-SURFACE-DEP-AUDIT-1.
2. Verify `_PROJECTHUD_VERSION` matches.
3. **PASS** = post-CMD code is loaded.

### §5.2 Static-script-loading consistency (DOCTRINAL FLOOR)

For each modified surface HTML:

1. Open the surface in fresh browser session (cleared cache).
2. Open dev console.
3. Verify NO errors of the form "X is not defined" or "Cannot read properties of undefined" related to canonical shared modules (Auth, API, CoC, etc.).
4. Verify `window.PHUD.FIRM_ID` populates (auth.js + config.js loading correctly).
5. Verify `window.API` and `window.CoC` are objects (api.js + coc.js loading correctly).
6. Verify the existing surface module initializes without auth-init-race diagnostic firing.
7. **PASS** = no missing-dependency errors on cold load.

### §5.3 Per-surface basic functionality regression

For each modified surface HTML, exercise its primary functionality once:

- accord.html — Live Capture, Living Document, Decision Ledger, Digest & Send, Minutes all load
- compass.html — surface loads; primary tabs work
- cadence.html — surface loads; primary tabs work
- pipeline.html — surface loads (if applicable)
- dashboard.html — surface loads (if applicable)
- resource-requests.html — surface loads (if applicable)
- resources.html — surface loads (if applicable)
- users.html — surface loads (if applicable)
- aegis.html — Aegis loads cleanly (already fixed via prior CMDs; regression check)

**PASS** = all surfaces load and exercise primary functionality without regression.

### §5.4 Cross-firm isolation regression

CMD-AEGIS-1's security fix is preserved:

1. Log in as firm A user; verify presence channel subscribes to firm A only.
2. (Optional, per Ron's firm_id status) Log in as firm B user; verify firm B isolation holds.
3. **PASS** = no fallback firm_id introduced; cross-firm isolation holds.

### §5.5 Existing CMD regression

1. End a meeting in Accord; verify auto-render fires correctly.
2. Run any verification playbook from Aegis Library; verify it executes.
3. Sibling surfaces all load.
4. **PASS** = no regression of prior CMD work.

---

## §6 — Consumer enumeration (Iron Rule 38)

Cannot fully specify until §3 investigation completes. Likely files:

| File | Likely effect |
|---|---|
| `compass.html` | Likely modified — possibly missing one or more canonical static script tags |
| `cadence.html` | Likely modified — same pattern |
| `pipeline.html` | Possibly modified |
| `dashboard.html` | Possibly modified |
| `resource-requests.html` | Possibly modified |
| `resources.html` | Possibly modified |
| `users.html` | Possibly modified |
| `accord.html` | Audited only; reference baseline |
| `aegis.html` | Audited only; already fixed |
| `js/version.js` | Pin bump to CMD-SURFACE-DEP-AUDIT-1 |

**No changes to:**
- Shared modules (auth.js, config.js, api.js, coc.js, etc.) — only how they're loaded
- Edge Functions
- Schema, RLS, CoC events
- Surface module logic (accord-core.js, etc.)

---

## §7 — Smoke test

After Phase 2 deploy:

1. Hard-refresh each modified surface in turn. Verify console banner shows CMD-SURFACE-DEP-AUDIT-1.
2. Open dev console on each. Verify no missing-dependency errors.
3. Spot-check primary functionality on 2-3 surfaces (e.g., open Compass, navigate to a tab; open Cadence, view a workflow; open Aegis, run a quick playbook).

---

## §8 — Hand-off format

Required output:

1. Files modified — one-liner per file.
2. **§3 investigation findings as a separate hand-off section** — the enumerated surface list, canonical module set, findings table, named MISSING entries with failure-mode predictions, and any architectural surprises. This section is presented BEFORE the fix is applied so the architect can confirm.
3. Diff — unified diff for each modified HTML file (the script-tag additions).
4. Smoke test result.
5. Behavioral verification results — per §5 subtest.
6. Findings — particularly:
   - The canonical module set as confirmed from accord.html
   - Which surfaces had which gaps
   - Whether any surface had a *surface-specific* reason for a gap that wasn't a bug (e.g., a surface that legitimately doesn't need auth)
   - Whether the audit revealed multiple dynamic-loader patterns or other inconsistencies worth tracking
   - Any architectural questions about long-term dependency-propagation discipline

If §5.2 (static-script-loading consistency) or §5.3 (per-surface basic functionality regression) fails on any modified surface, halt and surface — those are the doctrinal-floor checks.

---

## §9 — Reference materials

Required inputs (halt per Iron Rule 40 §1.1 if any are missing):

- This brief
- Current `accord.html` (the reference baseline)
- Current `aegis.html` (already-fixed reference; demonstrates the pattern post-fix)
- Every other surface HTML in the project root
- Brief CMD-AUTH-INIT-RACE (the CMD that established the script-loading pattern requirement)
- All Iron Rules ratifications 36-65

---

## §10 — Agent narrative instruction block

```
Apply brief-cmd-surface-dep-audit-1.md.

Two-phase audit-and-fix CMD. Pattern matches CMD-AUTH-INIT-RACE.

Phase 1 — Investigation (§3):
- Enumerate all top-level surface HTML files
- Capture each surface's static + dynamic script-loading conventions
- Identify the canonical shared-module set per accord.html (Iron 
  Rule 64; accord.html IS the spec)
- Build a findings table: surfaces × canonical modules, with 
  STATIC / DYNAMIC / MISSING per cell
- Surface findings to architect; HALT before applying any fix

Phase 2 — Fix (§4, §5):
After architect confirmation, add missing static script tags to 
surfaces lacking them. Match accord.html's loading order and 
mechanism exactly. No new modules introduced. Surface-specific 
boot logic preserved.

Constraints:
- No fallback firm_id introduced (CMD-AEGIS-1 security fix 
  preserved)
- No changes to shared modules themselves
- No refactor toward shared script-loading manifest 
  (architectural concern; out of scope)

Iron Rule 65 does NOT fire: no template body changes. Bump 
js/version.js only; RENDER_VERSION constant unchanged.

Iron Rule 64 strictly applies: accord.html is the canonical 
spec; surfaces match it. Do not invent loading patterns.

§5 specifies five behavioral verification subtests. §5.2 
(static-script-loading consistency) and §5.3 (per-surface basic 
functionality regression) are the doctrinal-floor checks.

Hand-off format per §8. The §3 investigation findings are 
surfaced as a SEPARATE section before fix is applied — wait 
for architect confirmation.

Halt on missing input. Halt after §3 investigation. Halt if 
§5.2 or §5.3 fails on any modified surface.

Proceed.
```

---

## §11 — A note on the longer-horizon architectural concern

The audit doesn't solve the underlying issue: ProjectHUD has multiple surface HTML files that each independently load shared modules, and there's no compile-time or runtime mechanism preventing dependency-propagation gaps. Every CMD that adds a shared dependency must remember to update every surface.

Long-term this argues for one of:
- **Server-side template** — a shared partial that renders the canonical script-loading block; surfaces include the partial
- **Build-time include** — a build step that injects the canonical block into every surface HTML
- **Runtime bootstrap loader** — a single tiny script that all surfaces load, which then loads everything else

None of these are urgent. The audit + this CMD's fixes give a clean baseline. If dependency-propagation gaps recur frequently, a future CMD can address the architectural concern.

For now: this audit is a one-shot cleanup. Future CMDs that add shared dependencies should explicitly include "audit all surface HTMLs" in their scope or commission a follow-up CMD-SURFACE-DEP-AUDIT-N if they don't.

---

*End of Brief — Surface dependency audit (CMD-SURFACE-DEP-AUDIT-1).*
