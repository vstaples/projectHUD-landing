# Brief — Mode A — MY VIEWS surface-fork token sweep + shared module overlay fix (Brief 3.4) — CMD[NNN]

**Mode:** A (Architectural — bounded systematic sweep + one shared-module fix)
**Surface:** my-views.html (sweep + repair) + share-dialog.js (one targeted edit)
**Doctrine version locked at brief authorship:** Style Doctrine v1.7
**Brief author:** Architect
**Date:** 2026-04-29
**Predecessor:** Brief 3.3 closed (partial-pass on literal scope; `view_removed` overlay verified visible). Agent surfaced a third site (line 3221) and confirmed share-dialog.js `_notesShowViewInviteDialog` has the same overlay-class defect.
**Arc context:** Brief 3.4 is the systematic-sweep follow-on, fourth emergency repair in Brief 3's blocking chain:
  - Brief 1, 1.5, 2, 2.5 — closed.
  - Brief 3 — in progress; halted at §3.1 setup.
  - Brief 3.1, 3.2, 3.3 — closed.
  - **Brief 3.4 (this brief):** Systematic sweep of MY VIEWS for remaining surface-fork token references; targeted fix to the shared module's overlay class.
  - Brief 3.5 (anticipated): Investigation of inbox realtime/polling defect (D2) — distinct concern, separate brief.
  - Brief 3 protocol resumes after 3.4 + 3.5 close (or earlier if 3.5 reveals D2 is non-blocking).

---

## §0 — Standing rules

- **Iron Rule 36** — terse hand-off (diff, smoke test, findings).
- **Iron Rule 37** — silent work-mode. **Recently reinforced and verified effective in Brief 1.5, 2.5, 3.1, 3.2, 3.3.** Open hand-off with "Per Iron Rule 37 — silent work-mode acknowledged."
- **Iron Rule 39** — input enumeration, output specification.
- **Iron Rule 40** — halt-on-missing-input, terse transcript, test instructions, dev-console-first debugging.
- **Style Doctrine §0.1** — agents do not modify or extend doctrine.

**Brief 3.4 specific:**

- **Systematic sweep first.** Before any code edits, the agent enumerates every surface-fork token reference in MY VIEWS that could be the same class of defect.
- **Adjudication gate.** After enumeration, the agent reports findings to the architect and HALTS for adjudication on which sites get fixed in this brief. Do NOT auto-fix every match — some may be legitimate cross-surface references.
- **Targeted shared-module fix.** Once sweep is adjudicated, the agent ships fixes for the approved sites, including the shared-module overlay class fix that unblocks `view_invite`.

---

## §1 — Purpose

Brief 2's MY VIEWS fork copied MY NOTES code verbatim, including surface-specific identifiers in strings: function names (`_notesOpenNote`), CSS class names (`notes-invite-dialog-overlay`), possibly other tokens. Briefs 3.1, 3.2, and 3.3 fixed three instances of this defect class one at a time. Each fix surfaced another instance during the next smoke test. Whack-a-mole.

After Brief 3.4 ships:

1. MY VIEWS has been systematically swept for `_notes*` function references in JS strings, `notes-*` CSS class references in JS strings, and any other MY NOTES-prefixed identifiers in MY VIEWS code paths.
2. Each surfaced reference is classified as either (a) bug — should be MY VIEWS equivalent, fix in this brief, or (b) legitimate cross-surface link — call to MY NOTES function or class that's intentional.
3. All (a) instances are fixed.
4. The shared module's `_notesShowViewInviteDialog` overlay class is repaired (so `view_invite` dialogs raise visibly).
5. The line 3221 site identified by the agent in Brief 3.3 is fixed.
6. The `view_invite` acceptance flow works visually for Angela and Ron — Brief 3 §3.4 unblocked on D1.
7. D2 (realtime/polling inbox updates) is OUT of scope; addressed by anticipated Brief 3.5.

---

## §2 — Architectural decisions locked

### §2.1 Sweep scope

The sweep covers `my-views.html` only. NOT my-notes.html (where MY NOTES tokens are correct), NOT share-dialog.js (the shared module is treated separately per §2.4), NOT mw-tabs.js, mw-core.js, hud-shell.js, or any other shared infrastructure.

The sweep targets:
- `_notes*` function name references in inline event handlers, string literals, and JS code
- `notes-*` CSS class name string references in JS code (className assignments, string concatenation, querySelector targets)
- Any other MY NOTES-prefixed token that appears in MY VIEWS code

The agent runs `grep` or equivalent and reports complete enumeration in §3.1.

### §2.2 Adjudication gate at sweep midpoint

After enumeration, agent HALTS and reports to architect. Do NOT proceed to fixes without adjudication.

For each surfaced reference, the agent classifies:
- **Bug** — emits a MY NOTES identifier in MY VIEWS context where MY VIEWS has its own equivalent. Fix.
- **Cross-surface intentional** — calls a MY NOTES function or accesses a MY NOTES resource on purpose (e.g., shared dialog code that legitimately references MY NOTES). Leave as-is.
- **Ambiguous** — agent uncertain. Surface for architect call.

This gate is non-negotiable. Per the operating-practice lesson from earlier in this arc: agents do not auto-expand scope. Architect adjudicates which sites are fixed.

### §2.3 Targeted fixes after adjudication

For each adjudicated-as-bug site:
- Replace the `_notes*` reference with the MY VIEWS equivalent (most commonly `_views*` per the existing pattern at my-views.html:3342).
- Replace the `notes-*` class string with the MY VIEWS equivalent (`views-*`).
- Preserve all surrounding code verbatim.

Each fix is a one-line edit. Total fixes anticipated: 1-5 sites, including the line 3221 site already identified.

### §2.4 Shared module — targeted fix

The agent fixes one specific site in share-dialog.js: the overlay creation in `_notesShowViewInviteDialog` (line identified during Brief 3.3 investigation).

The fix shape: parameterize the className based on caller context, OR rename the class to a generic `.invite-dialog-overlay` (no surface prefix) and ensure both surfaces' CSS define the rule.

**Architect adjudication:** Use the **rename-to-generic** approach.

Rationale:
- Parameterizing the className adds caller-side complexity (every caller must pass the right value)
- Generic class name acknowledges the dialog is now genuinely shared (extracted in Brief 2.5 for exactly this reason)
- MY NOTES and MY VIEWS both define the rule (after this brief adds it to MY VIEWS if missing) — single source of truth per surface

Specific changes:
- In share-dialog.js: change `overlay.className = 'notes-invite-dialog-overlay'` to `overlay.className = 'invite-dialog-overlay'`
- In my-notes.html CSS: add `.invite-dialog-overlay` rule (or rename existing `.notes-invite-dialog-overlay` to `.invite-dialog-overlay`)
- In my-views.html CSS: add `.invite-dialog-overlay` rule (or alongside existing `.views-invite-dialog-overlay`)

If both surfaces' CSS define the same selector (`.invite-dialog-overlay`), the dialog renders correctly regardless of which surface invokes it.

### §2.5 CSS additions are permitted under this brief

Style Doctrine §0.1 says "agents do not modify or extend doctrine" — but adding a CSS rule that mirrors an existing rule (renaming or aliasing) is bounded selector-naming work, not new doctrine. The agent confirms in hand-off that the new rule is pure rename/alias, not new visual treatment.

If the agent finds the visual treatment differs between MY NOTES' `.notes-invite-dialog-overlay` and MY VIEWS' `.views-invite-dialog-overlay` (different positioning, different z-index, different styling), HALT and report. Architect adjudicates which canonical visual wins, or whether the dialog is truly shared at all.

### §2.6 D2 (realtime/polling) is out of scope

The inbox-not-updating-without-hard-refresh defect surfaced in Brief 3.3's smoke test results is a distinct concern. It's investigation-required and lives in different infrastructure (event propagation / realtime subscriptions). It will be Brief 3.5.

Brief 3.4 does NOT touch realtime, polling, subscriptions, or any inbox-update-propagation logic.

---

## §3 — Required changes

### §3.1 Sweep enumeration (operator-inspection gate)

Agent runs (or equivalent):
```bash
grep -nE "_notes[A-Z][A-Za-z0-9_]*" my-views.html
grep -nE "['\"]notes-[a-z][a-z0-9-]*" my-views.html
```

For each match, report:
- Line number
- Surrounding context (the relevant code snippet)
- Classification: bug / cross-surface intentional / ambiguous
- Proposed fix if classified as bug

Halt and ship enumeration to architect. Wait for adjudication before proceeding.

### §3.2 Architect adjudication round-trip

Architect reviews enumeration. Confirms or adjusts classifications. Ships back which sites get fixed.

### §3.3 Apply adjudicated fixes

Agent applies the architect-approved fixes. One-line edits each. Preserve surrounding code verbatim.

### §3.4 Shared-module overlay class repair

Agent fixes share-dialog.js per §2.4:
- Change overlay className from `'notes-invite-dialog-overlay'` to `'invite-dialog-overlay'`
- Confirm fix doesn't ripple to other functions in the module

### §3.5 CSS rule rename/aliasing

Agent ensures both surfaces' CSS files have a `.invite-dialog-overlay` rule:
- If the rule doesn't exist in my-notes.html, add it (clone of `.notes-invite-dialog-overlay`)
- If the rule doesn't exist in my-views.html, add it (clone of `.views-invite-dialog-overlay`)
- If both `.notes-invite-dialog-overlay` and `.views-invite-dialog-overlay` rules differ in their visual treatment, HALT and report per §2.5

If a surface already has the rule, no change needed.

### §3.6 Version bump

`js/version.js`: bump to `CMD[NNN]` (operator assigns at hand-off).

---

## §4 — Out of scope

- D2 — inbox realtime/polling (Brief 3.5)
- my-notes.html code changes beyond the optional `.invite-dialog-overlay` CSS rule addition
- Any change to the smart-routing handler logic at line ~765
- Any change to dialog accept/decline behavior
- Any change to dialog content or visual treatment beyond the class-name realignment
- compass.html, mw-tabs.js, mw-core.js, hud-shell.js
- Auto-expanding sweep scope to other files without architect adjudication
- Auto-fixing surfaced sites without architect classification

---

## §5 — Inputs

### §5.1 Files modified

- my-views.html (adjudicated bug-class sites; possibly CSS rule addition)
- share-dialog.js (one targeted edit per §3.4)
- my-notes.html (possibly CSS rule addition per §3.5; otherwise unmodified)
- js/version.js (CMD bump)

### §5.2 Files read for reference

- my-views.html (post-Brief-3.3 state — for sweep and edits)
- share-dialog.js (post-Brief-2.5 state)
- my-notes.html (for CSS reference and rule comparison)
- Brief 3.3 hand-off (for the line 3221 finding)

### §5.3 Files / code agent must NOT modify

- compass.html, mw-tabs.js, mw-core.js, hud-shell.js
- The smart-routing handler at line ~765
- Any dialog logic beyond class-name strings
- Any other files not explicitly named in §5.1

### §5.4 Doctrine + reference

- Style Doctrine v1.7
- Iron Rules 36, 37, 39, 40 ratifications

### §5.5 Brief context

- Briefs 2, 2.5, 3.1, 3.2, 3.3 hand-offs
- Agent's diagnostic transcript from Brief 3.3 (this session)
- This brief

---

## §6 — Definition of done

Brief 3.4 is complete when:

- §3.1 sweep enumeration shipped to architect; architect adjudicated
- All adjudicated-as-bug sites in my-views.html fixed
- share-dialog.js's `_notesShowViewInviteDialog` uses `'invite-dialog-overlay'`
- Both surfaces' CSS define `.invite-dialog-overlay` (added if missing; existing if present)
- No new visual treatment introduced (rename/alias only)
- Smoke test (§7) passes
- `js/version.js` bumped
- D2 untouched (deferred to Brief 3.5)
- Hand-off conforms to §8

---

## §7 — Smoke test

Operator runs after deploy:

1. **Hard reset Compass on Browser 2 (Angela / User P1).**
2. **Click `view_removed` notification (already verified in Brief 3.3).**
   **Expected:** Dialog raises visibly. (Regression test — should still work.)
3. **Click `view_invite` notification.**
   **Expected:** Acknowledgement dialog raises visibly with Accept/Decline buttons.
4. **Click Accept.** Dialog dismisses; verify in Supabase that `accepted_at` populated:
   ```sql
   SELECT accepted_at FROM view_participants
   WHERE view_id = '<Default UUID>'
     AND user_id = '<Angela's user_id>';
   ```
5. **Repeat steps 2-4 on Browser 3 (Ron / User P2)** if Ron has pending invitations.
6. **MY NOTES regression on Browser 1.** Click an inbox notification. Verify dialog raises (this exercises shared module + MY NOTES CSS).
7. **Test on a `view_removed` notification in Browser 1's MY NOTES inbox** (if any). Verify dialog raises.
8. **Console cleanliness:** No errors, no warnings related to overlay class names.

If smoke test passes, Brief 3.4 closes. Brief 3.5 (D2) follows.

If `view_invite` dialog is now visible but D2 still blocks (Vaughn issues invitation, doesn't appear in Angela's inbox until hard refresh), that's expected — D2 is Brief 3.5.

---

## §8 — Hand-off format

Required output:

1. **Sweep enumeration result** — full list of `_notes*` and `notes-*` references found in my-views.html, with classifications.
2. **Files modified** — one-liner per file.
3. **Diff** — unified diff per file.
4. **CSS rule status** — confirm both surfaces have `.invite-dialog-overlay`; report any visual-treatment divergence between the rules.
5. **Smoke test result** — pass / fail / not run.
6. **Findings** — zero or more one-liners.
7. **Test instructions** — verification steps for operator.

Per Iron Rule 37 — silent work-mode. Open hand-off with the standard acknowledgment.

---

## §9 — Reference materials

**Files modified:**
- my-views.html
- share-dialog.js
- my-notes.html (possibly, for CSS rule)
- js/version.js

**Files read for reference:**
- my-views.html (post-Brief-3.3)
- share-dialog.js (post-Brief-2.5)
- my-notes.html (post-Brief-2.5)

**Doctrine:**
- Style Doctrine v1.7
- iron-rule-36-ratification.md
- iron-rule-37-ratification.md
- iron-rule-39-ratification.md
- iron-rule-40-ratification.md
- work-mode-classification-doctrine.md (v1.0)

**Brief context:**
- Briefs 2, 2.5, 3.1, 3.2, 3.3 hand-offs
- Agent's diagnostic transcript

---

## §10 — Narrative instruction block (paste-ready)

```
Apply brief-cmdNNN-myviews-token-sweep-and-overlay-fix.md
(Brief 3.4 of the MY VIEWS persistence fork arc — systematic
sweep + targeted shared-module fix).

This brief has TWO PHASES with an OPERATOR-INSPECTION GATE
between them.

PHASE 1 — Sweep (§3.1):
- Enumerate all `_notes*` and `notes-*` references in
  my-views.html
- Classify each as: bug / cross-surface intentional /
  ambiguous
- HALT and ship enumeration to architect for adjudication

DO NOT proceed to fixes without architect approval.
Bundling the sweep deliverable with the fix deliverable
violates the brief's gating structure (per the operating-
practice lesson from this arc).

PHASE 2 — Apply adjudicated fixes:
- Fix only the architect-approved sites
- Fix share-dialog.js's `_notesShowViewInviteDialog`
  overlay class (rename to `invite-dialog-overlay`)
- Ensure both surfaces' CSS have `.invite-dialog-overlay`

D2 (inbox realtime/polling) is OUT of scope — Brief 3.5.

§5.3 lists files you must NOT modify.

§7 smoke test verifies: view_removed still works (regression),
view_invite NOW works visually, MY NOTES regression clean.

Per Iron Rule 37 — silent work-mode. Open hand-off with the
standard acknowledgment.

Operator's user_id: 57b93738-6a2a-4098-ba12-bfffd1f7dd07.
Firm UUID: aaaaaaaa-0001-0001-0001-000000000001.

Operator will provide CMD number for version bump at hand-off.

Proceed with Phase 1.
```

---

*End of Brief — MY VIEWS surface-fork token sweep + shared module overlay fix (Brief 3.4).*
