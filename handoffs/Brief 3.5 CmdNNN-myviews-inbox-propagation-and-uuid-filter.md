# Brief — Mode A — MY VIEWS inbox propagation + synthetic ID query repair (Brief 3.5) — CMD[NNN]

**Mode:** A (Architectural — investigation-then-fix, two phases with operator-inspection gate)
**Surface:** my-views.html (likely; agent confirms during Phase 1)
**Doctrine version locked at brief authorship:** Style Doctrine v1.7
**Brief author:** Architect
**Date:** 2026-04-29
**Predecessor:** Brief 3.4 closed (surface-fork token sweep + shared module overlay fix). Two defects remain, both surfaced during Brief 3 protocol verification.
**Arc context:** Brief 3.5 is the fifth and final emergency repair brief in Brief 3's blocking chain:
  - Brief 1, 1.5, 2, 2.5 — closed.
  - Brief 3 — in progress; halted at §3.1 setup.
  - Brief 3.1, 3.2, 3.3, 3.4 — closed.
  - **Brief 3.5 (this brief):** Investigate D2 (inbox doesn't refresh in recipient's session without hard reload). Fix D3 (synthetic IDs passed to UUID-typed notes query produce 400).
  - Brief 3 protocol resumes after Brief 3.5 closes.

---

## §0 — Standing rules

- **Iron Rule 36** — terse hand-off (diff, smoke test, findings).
- **Iron Rule 37** — silent work-mode. **Reinforced and verified effective in Briefs 1.5, 2.5, 3.1, 3.2, 3.3, 3.4.** Open hand-off with "Per Iron Rule 37 — silent work-mode acknowledged."
- **Iron Rule 39** — input enumeration, output specification.
- **Iron Rule 40** — halt-on-missing-input, terse transcript, test instructions, dev-console-first debugging.
- **Style Doctrine §0.1** — agents do not modify or extend doctrine.

**Brief 3.5 specific:**

- **Two phases with operator-inspection gate.** Phase 1: investigate D2; surface root cause and proposed fix shape. HALT at gate. Phase 2: apply fixes for both D2 (per architect-approved Phase 1 finding) and D3 (per known one-line fix).
- **D3 has a known fix shape.** Phase 2 ships it directly. Phase 1 investigation is for D2 only.
- **No bundling beyond these two defects.** If Phase 1 surfaces additional defects in the inbox propagation path, they are findings for follow-on, not Brief 3.5 work.

---

## §1 — Purpose

Two defects remain after Briefs 3.1-3.4 shipped:

**D2 — Inbox doesn't refresh without hard reload.** When Vaughn issues an invitation to Angela, Angela's inbox does NOT show the new invitation until she manually hard-refreshes her browser. Same behavior for invitation revocation: Vaughn revokes access, Angela's inbox doesn't update until she refreshes. The DB row is created/deleted correctly; the recipient's UI doesn't see the change.

Brief 3.4 surfaced `window._notesStartInboxPoll` at my-views.html:541 as a likely starting investigation point. The polling mechanism appears to exist in some form; the question is whether it runs in MY VIEWS context, whether it's polling the right table/query, and whether it's invoking the correct render path on update.

**D3 — Synthetic ID query 400.** When Angela accepts an invitation, the post-accept reload at my-views.html line 3399-3406 (`_notesSwitchToSharedView`) constructs a query like:

```
GET /notes?id=in.(wt-1777469469070-00jkdm,wt-..., ph-...)&limit=50
```

The synthetic IDs (`wt-` widget-tile and `ph-` placeholder prefixes) are not UUIDs. Postgres rejects the entire query with 400 Bad Request because the `notes.id` column is UUID-typed. The query is wrapped in `.catch(() => [])` so it doesn't break the user-facing flow, but it produces noise in the console and silently drops content (any real-UUID notes in the same `in.()` list also return nothing because the entire query rejects).

The previous agent (Brief 3.4 investigation) traced the bug exactly. The fix is a one-line filter to exclude synthetic-prefix IDs before query construction.

After Brief 3.5 ships:

1. Vaughn issues an invitation to Angela. Angela's inbox shows the new invitation within a few seconds **without** Angela manually refreshing.
2. Vaughn revokes Angela's access. Angela's inbox updates accordingly **without** manual refresh.
3. The synthetic ID 400 in console is gone. The post-accept notes query only includes real UUIDs.
4. Brief 3 protocol §3.4 (multi-session invitation flow) can complete without manual intervention or console errors.

---

## §2 — Architectural decisions locked

### §2.1 Phase 1 is investigation-only

Phase 1 produces a written diagnosis of D2's mechanism. No code changes ship in Phase 1.

The agent investigates:
- Does `window._notesStartInboxPoll` exist? Where defined?
- Is it called from MY VIEWS' load path? Where?
- What does it poll for? (Query against `notes` table for is_inbox=true rows? Realtime subscription? Something else?)
- Does it execute correctly in MY VIEWS context?
- If polling, what's the interval and what does it do with results?
- What render function does it invoke when new rows arrive?
- What's broken — is the poll never started, started but not invoked correctly, started and invoked but rendering not refreshing, or something else?

### §2.2 Phase 1 deliverable: diagnosis + proposed fix shape

The agent's Phase 1 hand-off identifies the root cause and proposes a fix shape. The architect reviews and either approves Phase 2 to proceed with the proposed fix, or escalates if the fix surfaces architectural complexity.

If Phase 1 reveals D2 is more architectural than expected (e.g., requires Realtime publication on `notes` table, requires significant new infrastructure), HALT and surface to architect. Phase 2 of Brief 3.5 may be cancelled in favor of a separate dedicated brief.

If Phase 1 reveals D2 is a small fix (e.g., poll initialization missing in MY VIEWS' load path; a single missing function call), Phase 2 proceeds directly.

### §2.3 D3 fix is locked

Phase 2 includes a one-line edit to my-views.html line 3399 (per Brief 3.4 investigation):

```javascript
// Before:
const tileNoteIds = (ownerView.tiles || []).map(t => t.noteId).filter(Boolean);

// After:
const tileNoteIds = (ownerView.tiles || [])
  .map(t => t.noteId)
  .filter(id => id && !id.startsWith('ph-') && !id.startsWith('wt-'));
```

This matches the canonical pattern documented elsewhere in the codebase (per Brief 3.4 finding: my-notes.html:581, 857, 1261, 4378, 4559, 4628, 5210; my-views.html:944, 3903, 4155, 4167).

### §2.4 No bundling of additional defects

If Phase 1 investigation surfaces additional defects in the inbox propagation infrastructure beyond D2 itself (e.g., poll runs but updates wrong section, refresh runs but breaks dashboard rendering, etc.), they are FINDINGS for follow-on briefs, not Brief 3.5 work.

The agent surfaces such findings in Phase 1's hand-off; architect adjudicates whether to expand Brief 3.5's Phase 2 scope or carve to subsequent briefs.

### §2.5 Realtime publication is OUT of scope

Brief 1 §2.6 explicitly decided not to add `compass_views` to the Realtime publication. That decision applies to MY VIEWS dashboard data. The `notes` table (where inbox rows live) is separate.

If Phase 1 reveals D2's correct fix is "enable Realtime on `notes` table," that's an architectural decision requiring its own brief, not bundled into Brief 3.5. Realtime infrastructure has subscription, conflict-resolution, and reconnection concerns that Brief 3.5 cannot bound.

If Phase 1 reveals D2's correct fix is polling-based (the existing `_notesStartInboxPoll` infrastructure just needs to be invoked in MY VIEWS context), Phase 2 ships that fix.

---

## §3 — Phase 1: Investigation

### §3.1 Locate `_notesStartInboxPoll`

Find the function. Report:
- File and line number where defined
- Function signature and parameters
- What it polls (table name, query shape, frequency)
- What it does with results (which render function does it invoke?)

If the function doesn't exist, report that. The function name was identified by the previous agent at my-views.html:541 as `window._notesStartInboxPoll`. Verify whether it's defined in my-views.html, share-dialog.js (post-Brief-2.5), or my-notes.html.

### §3.2 Trace MY VIEWS' inbox load path

Find where MY VIEWS hydrates its inbox on load. Specifically:
- The function that calls `window._notesStartInboxPoll` (if any) on MY VIEWS' load
- The function that initially populates the inbox content
- The function that re-renders the inbox when notification rows change

Report the chain. If polling is supposed to be initiated on MY VIEWS' load and isn't, that's likely the D2 root cause.

### §3.3 Compare to MY NOTES' inbox handling

If MY NOTES' inbox correctly refreshes without hard reload (operator can verify, or static analysis suggests it does), compare MY NOTES' load path to MY VIEWS' load path. The delta is the bug.

If MY NOTES' inbox ALSO doesn't refresh without hard reload (i.e., D2 is a pre-existing defect that was never tested cross-user before), surface as a finding. The fix shape may be different in that case.

### §3.4 Identify Phase 2 fix shape

Based on §3.1-§3.3 findings, propose the fix:
- Smallest change that resolves D2
- Files affected
- Estimated complexity (one-line vs. several-line vs. architectural)
- Any regression risk on MY NOTES

Present as numbered options if multiple paths are viable. Per the operating-practice lesson: numbered options with concrete consequences, not natural-language templates.

### §3.5 Halt-on-missing-input

If the agent identifies an input file they need that wasn't provided in §5, they halt per Iron Rule 40 §1.

### §3.6 Phase 1 hand-off

Phase 1 ends with a hand-off to architect containing:
- Root cause diagnosis
- Proposed fix shape (or numbered options)
- Findings (additional defects surfaced; cross-references to existing code patterns)
- Files agent expects to modify in Phase 2

Architect reviews and either approves Phase 2 to proceed (with which option, if multiple), or escalates D2 to a separate dedicated brief if scope expands.

### §3.7 Operator-inspection gate

Per the operating-practice lesson from earlier in this arc: agents do not bundle deliverables across operator-inspection gates. Phase 1 ships, halts, awaits architect review and approval. Phase 2 does NOT auto-execute.

---

## §4 — Phase 2: Apply fixes

After architect approval of Phase 1 findings:

### §4.1 D2 fix per approved Phase 1 proposal

Apply the architect-approved fix from Phase 1. Specifics depend on Phase 1 diagnosis.

### §4.2 D3 fix at my-views.html:3399

Apply the one-line filter per §2.3 to exclude synthetic-prefix IDs from the notes query.

### §4.3 Version bump

`js/version.js`: bump to `CMD[NNN]` (operator assigns at hand-off).

---

## §5 — Out of scope

- Realtime publication on `notes` table (architectural decision; separate brief if Phase 1 reveals it's needed)
- Any additional defects surfaced in Phase 1 investigation (findings only)
- Any change to the share dialog flow itself
- Any change to MY NOTES core behavior (notes-tree, block editor, chat, notes_workspace.state)
- Any change to compass.html, mw-tabs.js, mw-core.js, hud-shell.js
- Cosmetic naming inconsistencies (deferred to post-arc cleanup per Brief 3.4 adjudication)

---

## §6 — Inputs

### §6.1 Files agent will read and possibly modify

- my-views.html (post-Brief-3.4 state) — likely modified in Phase 2 for D2 fix and definitely for D3 fix
- share-dialog.js (post-Brief-3.4 state) — possibly read during investigation; modification depends on Phase 1 findings
- my-notes.html (post-Brief-3.4 state) — read for comparison; not modified by default
- js/version.js — modified in Phase 2

### §6.2 Files read for reference

- Brief 3.4 hand-off (for the prior agent's investigation findings on `_notesStartInboxPoll`)
- Other prior brief hand-offs

### §6.3 Files / code agent must NOT modify

- compass.html, mw-tabs.js, mw-core.js, hud-shell.js
- MY NOTES code beyond what Phase 1 investigation requires reading
- Any dialog or accept/decline behavior
- The smart-routing handler at line ~765 (already correct post-Brief-3.2)
- Any class names or DOM IDs (already swept in Brief 3.4)

### §6.4 Doctrine + reference

- Style Doctrine v1.7
- Iron Rules 36, 37, 39, 40 ratifications

### §6.5 Brief context

- Briefs 1, 1.5, 2, 2.5, 3.1, 3.2, 3.3, 3.4 hand-offs
- Operator's D2 verification (current session): confirmed inbox does not update without hard refresh
- Operator's D3 confirmation (current session): synthetic ID 400 still firing post-accept

---

## §7 — Definition of done

Brief 3.5 is complete when:

- Phase 1 diagnosis report shipped to architect; architect approved Phase 2
- Phase 2 D2 fix applied (per approved approach)
- Phase 2 D3 fix applied at my-views.html line 3399
- Smoke test (§8) passes
- `js/version.js` bumped
- No new CSS classes, color tokens, font sizes, or doctrine edits introduced
- No changes to out-of-scope files per §5
- Hand-off conforms to §9

---

## §8 — Smoke test

Operator runs after Phase 2 deploys:

### §8.1 D2 verification

1. Hard reset Compass on Browser 2 (Angela / User P1). Console open.
2. Confirm Angela's inbox is empty (or contains only post-Brief-3.5 invitations).
3. **DO NOT REFRESH Angela's session for the rest of this test.**
4. On Browser 1 (Vaughn), open Share dialog on Vaughn's Dashboard.
5. Invite Angela.
6. **Watch Angela's Browser 2 without touching it.** Within ~5 seconds (or whatever the polling interval is), the new invitation appears in Angela's inbox.
   **Expected:** Invitation visible automatically. NO hard refresh required.
7. Click the invitation in Angela's inbox. Acknowledgement form raises.
8. Click Accept.
9. **Without refreshing Angela's session**, observe: invitation row disappears from Angela's inbox, Vaughn's Dashboard appears in Angela's DASHBOARDS list.

### §8.2 D2 inverse verification (revocation)

1. With Angela's accepted access from §8.1 still active.
2. **DO NOT REFRESH Angela's session.**
3. On Browser 1, open Share dialog on Vaughn's Dashboard.
4. Click the × to remove Angela.
5. **Watch Angela's Browser 2.** Within ~5 seconds, Vaughn's Dashboard disappears from Angela's DASHBOARDS list. A `view_removed` notification may appear in her inbox.
   **Expected:** Removal reflected automatically. NO hard refresh required.

### §8.3 D3 verification

1. With Angela having accepted an invitation in §8.1.
2. Open DevTools console on Browser 2.
3. Hard reset Compass. (This time we WANT a fresh session to exercise the post-accept reload path cleanly.)
4. Click on Vaughn's Dashboard in Angela's DASHBOARDS list (the shared dashboard).
5. **Expected console:** No `400 (Bad Request)` errors on `notes?id=in.(...)` queries. The post-accept reload still runs but only queries real UUIDs.

### §8.4 MY NOTES regression

1. On Browser 1 (Vaughn), switch to MY NOTES.
2. Notes-tree loads. Existing notes visible.
3. Edit a note, save. Confirm save persists (refresh; note content intact).
4. Confirm MY NOTES inbox still works (no regression in inbox display from D2 fix).

If smoke test passes, Brief 3.5 closes and Brief 3 protocol resumes from §3.1 setup.

---

## §9 — Hand-off format

### Phase 1 hand-off

Required output:

1. **Investigation findings** — root cause, file/line evidence
2. **Proposed Phase 2 fix shape** — concrete proposal or numbered options
3. **Files Phase 2 expects to modify**
4. **Findings adjacent to D2** (zero or more) — additional defects surfaced; recommendations for follow-on
5. **Awaiting architect approval to proceed to Phase 2**

Per Iron Rule 37 — silent investigation. Open with "Per Iron Rule 37 — silent work-mode acknowledged."

### Phase 2 hand-off (after architect approval)

Required output:

1. **Files modified** — one-liner per file
2. **Diff** — unified diff per file
3. **Smoke test result** — pass / fail / not run
4. **Findings** — zero or more one-liners
5. **Test instructions** — verification steps for operator

---

## §10 — Reference materials

**Files modified (anticipated):**
- my-views.html (D2 fix scope-dependent; D3 fix one-line)
- js/version.js
- Possibly share-dialog.js or my-notes.html depending on Phase 1 findings

**Files read for reference:**
- Brief 3.4 hand-off
- All prior brief hand-offs

**Doctrine:**
- Style Doctrine v1.7
- iron-rule-36-ratification.md
- iron-rule-37-ratification.md
- iron-rule-39-ratification.md
- iron-rule-40-ratification.md
- work-mode-classification-doctrine.md (v1.0)

**Brief context:**
- Briefs 1, 1.5, 2, 2.5, 3.1, 3.2, 3.3, 3.4 hand-offs
- Operator verification reports from current session

---

## §11 — Narrative instruction block (paste-ready)

```
Apply brief-cmdNNN-myviews-inbox-propagation-and-uuid-filter.md
(Brief 3.5 of the MY VIEWS persistence fork arc — final
emergency repair before Brief 3 protocol resumes).

This brief has TWO PHASES with an OPERATOR-INSPECTION GATE
between them.

PHASE 1 — Investigation only (§3):
- Locate window._notesStartInboxPoll
- Trace MY VIEWS' inbox load path
- Compare to MY NOTES' inbox handling
- Propose Phase 2 fix shape (numbered options if multiple)
- HALT and ship Phase 1 hand-off to architect for approval

DO NOT proceed to Phase 2 fixes without architect approval.
Bundling violates the brief's gating structure (per the
operating-practice lesson from this arc).

PHASE 2 — Apply fixes (§4) after architect approval:
- D2 fix per approved Phase 1 proposal
- D3 fix one-line filter at my-views.html:3399 to exclude
  wt- and ph- prefixed IDs from the notes query

§2.5: Realtime publication on notes table is OUT of scope.
If Phase 1 reveals D2's correct fix is Realtime, halt and
surface — separate brief required.

§5: Out-of-scope includes additional defects surfaced in
Phase 1 investigation (findings only, not Phase 2 work).

§8 smoke test verifies D2 (without hard refresh!), D2 inverse
(revocation propagation), D3 (no 400 errors), MY NOTES
non-regression.

Per Iron Rule 37 — silent work-mode. Open hand-off with
"Per Iron Rule 37 — silent work-mode acknowledged."

Operator's user_id: 57b93738-6a2a-4098-ba12-bfffd1f7dd07.
Angela's user_id: 0db33955-f6a0-49ae-ad4b-c5cdfacf34c8.
Vaughn's Dashboard view_id: c3de2de8-a38c-455e-82c2-c4eae1adf5fe.
Firm UUID: aaaaaaaa-0001-0001-0001-000000000001.

Operator will provide CMD number for version bump at hand-off.

Proceed with Phase 1.
```

---

*End of Brief — MY VIEWS inbox propagation + synthetic ID query repair (Brief 3.5).*
