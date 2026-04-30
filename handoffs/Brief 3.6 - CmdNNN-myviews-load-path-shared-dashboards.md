# Brief — Mode A — MY VIEWS load path: shared dashboards on hard refresh (Brief 3.6) — CMD[NNN]

**Mode:** A (Architectural — investigation-then-fix, two phases with operator-inspection gate)
**Surface:** my-views.html (likely; agent confirms during Phase 1)
**Doctrine version locked at brief authorship:** Style Doctrine v1.7
**Brief author:** Architect
**Date:** 2026-04-30
**Predecessor:** Brief 3.5 closed (D2 + D3 fixed). Brief 3 protocol §3.4 surfaced D6: accepted shared dashboards do not appear in invitee's DASHBOARDS list after hard refresh.
**Arc context:** Brief 3.6 is the sixth emergency repair brief in Brief 3's chain:
  - Brief 1, 1.5, 2, 2.5 — closed.
  - Brief 3 — in progress; halted at §3.4.
  - Brief 3.1, 3.2, 3.3, 3.4, 3.5 — closed.
  - **Brief 3.6 (this brief):** Fix MY VIEWS' load path to query and render shared dashboards (where the current user is an accepted participant), not just owned dashboards.
  - Brief 3 protocol resumes after Brief 3.6 closes.

---

## §0 — Standing rules

- **Iron Rule 36** — terse hand-off (diff, smoke test, findings).
- **Iron Rule 37** — silent work-mode. **Reinforced and verified effective in Briefs 1.5, 2.5, 3.1-3.5.** Open hand-off with "Per Iron Rule 37 — silent work-mode acknowledged."
- **Iron Rule 39** — input enumeration, output specification.
- **Iron Rule 40** — halt-on-missing-input, terse transcript, test instructions, dev-console-first debugging.
- **Style Doctrine §0.1** — agents do not modify or extend doctrine.

**Brief 3.6 specific:**

- **Two phases with operator-inspection gate.** Phase 1: investigate MY VIEWS' load path for shared dashboards; surface root cause and proposed fix shape. HALT at gate. Phase 2: apply approved fix.
- **No bundling beyond D6.** If Phase 1 surfaces additional load-path gaps, they are findings for follow-on briefs, not Brief 3.6 work.
- **Compare against MY NOTES' equivalent** during investigation. Brief 3.5 established that MY VIEWS' fork omitted some MY NOTES infrastructure; same pattern likely applies here.

---

## §1 — Purpose

When a user accepts an invitation to a MY VIEWS dashboard, `view_participants.accepted_at` populates correctly and `_notesSwitchToSharedView` immediately renders the shared dashboard for them. But after a hard refresh, the shared dashboard disappears from their DASHBOARDS list.

DB state confirmed correct (operator verified):
- `view_participants` row exists with `accepted_at` populated
- `compass_views` row for the shared dashboard exists
- The accept transaction worked end-to-end

The defect is in MY VIEWS' load path. On hard refresh, the function that hydrates a user's DASHBOARDS list queries only `compass_views` WHERE `owner_user_id = current_user` — it does not query `view_participants` for accepted shares. The load path is incomplete relative to its specification: dashboards the user has been granted access to (and accepted) should also load.

**Demo impact.** Without this fix, Angela accepts an invitation, sees Vaughn's dashboard while the session is live, but loses access on next session. The demo's headline persistence value is broken.

After Brief 3.6 ships:

1. On hard refresh, MY VIEWS' load path queries both owned dashboards (`compass_views` WHERE `owner_user_id`) AND accepted shared dashboards (`view_participants` JOIN `compass_views` WHERE `user_id` AND `accepted_at IS NOT NULL`).
2. Both sets render in the DASHBOARDS list with appropriate visual distinction (active vs. shared).
3. Angela accepts an invitation → hard refresh → Vaughn's Dashboard remains in her DASHBOARDS list.
4. Brief 3 protocol §3.4 acceptance flow can complete past hard refresh.

---

## §2 — Architectural decisions locked

### §2.1 Phase 1 is investigation-only

Phase 1 produces a written diagnosis of D6's mechanism. No code changes ship in Phase 1.

The agent investigates:
- Where does MY VIEWS' load path query `compass_views`? (Likely in or near `_notesLoadWorkspace`.)
- Does it currently include any join to or query against `view_participants`?
- How does MY NOTES handle the same concern? Does MY NOTES query for accepted shares on load? If so, where?
- What's the data shape returned? How is it merged with owned dashboards into the DASHBOARDS list?
- Does the existing `_notesRestoreSharedViews` function (per Brief 2's design) handle this concern? Is it invoked on load?

### §2.2 Phase 1 deliverable

Diagnosis report identifying:
- The load-path function(s) responsible for hydrating DASHBOARDS list
- The current query shape (owned only, vs. owned + shared)
- The proposed fix — single query with UNION/JOIN, or parallel query, or activation of an existing dormant code path

If Phase 1 reveals D6 is small (e.g., MY NOTES has the right pattern; MY VIEWS just needs a parallel call), Phase 2 proceeds directly.

If Phase 1 reveals D6 requires substantial new infrastructure (e.g., a new dedicated query function, RLS implications, render-path coordination across surfaces), HALT and surface to architect. Brief 3.6 may be cancelled in favor of dedicated brief.

### §2.3 RLS posture

Brief 1's RLS rewrite for `view_participants` (Brief 1.5) supports SELECT for accepted participants on their own rows, and for owners on their dashboards. Querying `view_participants` joined to `compass_views` for the current user's accepted shares should work under existing RLS without additional policy changes.

The agent verifies this empirically: the proposed query should run successfully under RLS for the operator's user_id. If RLS blocks the query, that's a Brief 1.5-territory concern that re-opens Brief 1.5 — out of Brief 3.6 scope.

### §2.4 Render-path treatment

The DASHBOARDS list rendering (in MY VIEWS' left rail) currently handles owned dashboards. It must now handle shared dashboards too. Two render-path questions:

1. **Visual distinction.** Should shared dashboards visually differ from owned ones (e.g., different icon, "shared by Vaughn" annotation, color tint)? Brief 2 may have specified; agent reads.

2. **Active-state semantics.** When Angela's active dashboard is Vaughn's shared dashboard, what's the active-view tracking? The current `_workspace.activeView` is name-keyed; for shared dashboards, the key may need to be the shared-key prefix used by `_notesSwitchToSharedView` (e.g., `__shared__<owner>__<viewName>`).

The agent reports current-state implementation. If the existing render path already handles shared dashboards in some form (e.g., from the `_notesSwitchToSharedView` runtime path), Phase 2 may only need to add the load-time query. If render-path infrastructure is also missing, Phase 2 scope expands and architect re-adjudicates.

### §2.5 Accepted shares only

Phase 2 only renders dashboards where `view_participants.accepted_at IS NOT NULL`. Pending invitations remain in the inbox; they do NOT render in the DASHBOARDS list. (This is consistent with Brief 2 §4.6 pill-badge rendering rules: only accepted participants count.)

---

## §3 — Phase 1: Investigation

### §3.1 Locate MY VIEWS' load-path query

Find the function that hydrates the DASHBOARDS list on MY VIEWS load. Likely candidates per Brief 2's design:
- `_notesLoadWorkspace` (Brief 2 modified this to read from `compass_views`)
- A function called by `_notesLoadWorkspace` or by MY VIEWS' init code
- A separate `_notesRestoreSharedViews` function (Brief 2 mentions this)

Report the function name, file, line numbers, and the current query shape.

### §3.2 Compare to MY NOTES' equivalent

Find MY NOTES' equivalent load-path function. Determine:
- Does MY NOTES query for accepted shares on load?
- If yes: what's the query shape? What render path consumes the results?
- If no: D6 is a pre-existing defect MY NOTES also has; the fix shape may differ.

### §3.3 Inspect `_notesRestoreSharedViews`

If this function exists per Brief 2's design, inspect it:
- Is it currently invoked on MY VIEWS load? Or only on demand?
- What does it query?
- Does it handle the post-Brief-1 schema (where `view_participants.view_id` is the FK)?

If `_notesRestoreSharedViews` is dormant (defined but never called on load), activating it may be the entire fix.

### §3.4 Verify RLS permits the proposed query

Sketch the proposed query (e.g., `SELECT cv.* FROM compass_views cv JOIN view_participants vp ON cv.id = vp.view_id WHERE vp.user_id = auth.uid() AND vp.accepted_at IS NOT NULL`). Verify it would run under post-Brief-1.5 RLS. If RLS blocks it, halt and report.

### §3.5 Identify Phase 2 fix shape

Based on §3.1-§3.4, propose:
- The query addition (or activation of existing dormant code)
- The render-path integration (how the new results merge with owned dashboards in the DASHBOARDS list)
- Files affected
- Estimated complexity (one-line activation vs. several-line addition vs. larger)
- Regression risk on MY NOTES (should be zero if MY VIEWS only is touched)

Numbered options if multiple paths viable. Per the operating-practice lesson: numbered options with concrete consequences, not natural-language templates.

### §3.6 Halt-on-missing-input

If the agent identifies an input file they need that wasn't provided in §6, they halt per Iron Rule 40 §1.

### §3.7 Phase 1 hand-off

Phase 1 ends with diagnosis + proposed fix (or numbered options). Architect reviews and approves Phase 2 to proceed.

### §3.8 Operator-inspection gate

Phase 1 ships, halts, awaits architect approval. Phase 2 does NOT auto-execute.

---

## §4 — Phase 2: Apply fix

After architect approval of Phase 1 findings:

### §4.1 D6 fix per approved Phase 1 proposal

Apply the architect-approved fix. Specifics depend on Phase 1 diagnosis.

### §4.2 Verify smoke test

Run §7 smoke test before declaring complete.

### §4.3 Version bump

`js/version.js`: bump to `CMD[NNN]` (operator assigns at hand-off).

---

## §5 — Out of scope

- D4 (declined-invite UI persistence) — already deferred to post-arc cleanup
- D2 inverse / revocation auto-propagation without hard refresh — already deferred to post-arc cleanup
- Pill-badge rendering on Vaughn's session (separate concern, possibly related; flagged for follow-on adjudication if surfaced)
- Any changes to MY NOTES core behavior
- Any RLS modifications (re-opens Brief 1.5 territory)
- Any changes to `_notesSwitchToSharedView` runtime path (it works correctly for live-session accept)
- Any additional load-path gaps beyond D6 (findings only)
- compass.html, mw-tabs.js, mw-core.js, hud-shell.js
- Cosmetic naming inconsistencies (post-arc cleanup)

---

## §6 — Inputs

### §6.1 Files agent will read and possibly modify

- my-views.html (post-Brief-3.5 state) — likely modified in Phase 2
- share-dialog.js (post-Brief-3.5 state) — possibly read during investigation
- my-notes.html (post-Brief-3.5 state) — read for comparison; likely not modified
- js/version.js — modified in Phase 2

### §6.2 Files read for reference

- All prior brief hand-offs in the arc (especially Brief 2 for `_notesRestoreSharedViews` mentions)

### §6.3 Files / code agent must NOT modify

- compass.html, mw-tabs.js, mw-core.js, hud-shell.js
- MY NOTES core behavior beyond load-path comparison
- `_notesSwitchToSharedView` (works correctly; not the bug site)
- RLS policies (Brief 1.5 territory)
- Any class names or DOM IDs

### §6.4 Doctrine + reference

- Style Doctrine v1.7
- Iron Rules 36, 37, 39, 40 ratifications

### §6.5 Brief context

- Briefs 1, 1.5, 2, 2.5, 3.1-3.5 hand-offs
- Operator's D6 verification (this session): hard refresh of accepted-participant's session loses shared dashboard from DASHBOARDS list; underlying DB state is correct (`view_participants.accepted_at` populated, `compass_views` row exists)
- Operator's user_id: 57b93738-6a2a-4098-ba12-bfffd1f7dd07
- Angela's user_id: 0db33955-f6a0-49ae-ad4b-c5cdfacf34c8
- Vaughn's Dashboard view_id: c3de2de8-a38c-455e-82c2-c4eae1adf5fe

---

## §7 — Smoke test

Operator runs after Phase 2 deploys:

### §7.1 D6 verification (the headline fix)

1. Hard reset Compass on Browser 2 (Angela). Console open.
2. **Pre-conditions check:** Confirm Angela has accepted at least one share from Vaughn (verify in Supabase: `view_participants` row with `accepted_at` populated). If not, run a quick share+accept cycle first.
3. With Angela's accepted share present in DB, hard refresh Browser 2.
4. Open MY VIEWS.
5. **Expected:** Vaughn's Dashboard appears in the DASHBOARDS list alongside Angela's own Default. Visual distinction (per Brief 2 §4.6 if specified) appropriate.
6. Click Vaughn's Dashboard.
7. **Expected:** Dashboard renders with Vaughn's tile content (or empty stubs for tile types Angela doesn't have access to render).

### §7.2 Multiple shares persistence

1. From Vaughn's session, share Vaughn's Dashboard with Ron also.
2. Ron accepts (on Browser 3).
3. Ron hard-refreshes.
4. **Expected:** Vaughn's Dashboard in Ron's DASHBOARDS list.

### §7.3 Owned dashboards regression

1. Angela's session.
2. Confirm Angela's own Default dashboard still appears in her DASHBOARDS list alongside Vaughn's shared dashboard.
3. Click between them — both load correctly.
4. Edit Angela's Default — saves to her own `compass_views.state`, not to Vaughn's row.

### §7.4 Revocation on hard refresh

1. From Vaughn's session, revoke Angela's access (× in Share dialog).
2. Angela hard-refreshes.
3. **Expected:** Vaughn's Dashboard NO LONGER appears in Angela's DASHBOARDS list. (This was the deferred half of D2 §8.2; D6 fix may transitively address it because the load query only returns accepted shares, and the revoked row is deleted.)

### §7.5 MY NOTES non-regression

1. Browser 1 (Vaughn). Switch to MY NOTES.
2. Confirm notes-tree, block editor, save behavior all functional.
3. No regression.

If smoke test passes, Brief 3.6 closes. Brief 3 protocol resumes from §3.5 (pill-badge verification on Vaughn's session — D7 if it surfaces, addressed separately).

---

## §8 — Hand-off format

### Phase 1 hand-off

Required output:

1. **Investigation findings** — root cause, file/line evidence
2. **MY NOTES comparison** — does MY NOTES handle this correctly? If yes, what pattern does it use?
3. **Status of `_notesRestoreSharedViews`** — exists? invoked? does what?
4. **Proposed Phase 2 fix shape** — concrete proposal or numbered options
5. **RLS verification** — does the proposed query run under post-Brief-1.5 RLS?
6. **Files Phase 2 expects to modify**
7. **Findings adjacent to D6** — additional defects surfaced; recommendations for follow-on
8. **Awaiting architect approval to proceed to Phase 2**

Per Iron Rule 37 — silent investigation. Open with "Per Iron Rule 37 — silent work-mode acknowledged."

### Phase 2 hand-off (after architect approval)

Required output:

1. **Files modified** — one-liner per file
2. **Diff** — unified diff per file
3. **Smoke test result** — pass / fail / not run
4. **Findings** — zero or more one-liners
5. **Test instructions** — verification steps for operator

---

## §9 — Reference materials

**Files modified (anticipated):**
- my-views.html (D6 fix scope-dependent)
- js/version.js
- Possibly share-dialog.js depending on Phase 1 findings (if a shared module helper is needed)

**Files read for reference:**
- All prior brief hand-offs in arc
- Operator session context (this brief's §6.5)

**Doctrine:**
- Style Doctrine v1.7
- iron-rule-36-ratification.md
- iron-rule-37-ratification.md
- iron-rule-39-ratification.md
- iron-rule-40-ratification.md
- work-mode-classification-doctrine.md (v1.0)

**Brief context:**
- Briefs 1, 1.5, 2, 2.5, 3.1-3.5 hand-offs
- Operator D6 verification report from current session

---

## §10 — Narrative instruction block (paste-ready)

```
Apply brief-cmdNNN-myviews-load-path-shared-dashboards.md
(Brief 3.6 of the MY VIEWS persistence fork arc — sixth
emergency repair before Brief 3 protocol resumes).

This brief has TWO PHASES with an OPERATOR-INSPECTION GATE
between them.

PHASE 1 — Investigation only (§3):
- Locate MY VIEWS' load-path function for hydrating
  DASHBOARDS list
- Compare to MY NOTES' equivalent
- Inspect _notesRestoreSharedViews if it exists
- Verify RLS permits the proposed query
- Propose Phase 2 fix shape (numbered options if multiple)
- HALT and ship Phase 1 hand-off to architect

DO NOT proceed to Phase 2 without architect approval.

PHASE 2 — Apply approved fix (§4):
- Add query for accepted shared dashboards (or activate
  dormant code per Phase 1 findings)
- Render in DASHBOARDS list alongside owned dashboards
- Visual distinction per Brief 2 §4.6 if specified

§2.5: Accepted shares only — pending invitations remain in
inbox; do NOT render in DASHBOARDS list.

§5: Out of scope — D4, D2 revocation propagation, pill-badge
rendering, RLS changes, MY NOTES core behavior. If Phase 1
surfaces additional defects beyond D6, surface as findings
not Phase 2 work.

§7 smoke test verifies D6 (hard refresh persists shared
dashboard), multiple-shares persistence, owned dashboards
regression, revocation on hard refresh, MY NOTES
non-regression.

Per Iron Rule 37 — silent work-mode (verified effective
Briefs 1.5 and 2.5-3.5). Open hand-off with the standard
acknowledgment.

Operator's user_id: 57b93738-6a2a-4098-ba12-bfffd1f7dd07.
Angela's user_id: 0db33955-f6a0-49ae-ad4b-c5cdfacf34c8.
Vaughn's Dashboard view_id: c3de2de8-a38c-455e-82c2-c4eae1adf5fe.
Firm UUID: aaaaaaaa-0001-0001-0001-000000000001.

Operator will provide CMD number for version bump at hand-off.

Proceed with Phase 1.
```

---

*End of Brief — MY VIEWS load path: shared dashboards on hard refresh (Brief 3.6).*
