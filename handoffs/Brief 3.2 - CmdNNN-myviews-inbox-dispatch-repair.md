# Brief — Mode A — MY VIEWS inbox row dispatch repair (Brief 3.2) — CMD[NNN]

**Mode:** A (Architectural — small bounded repair)
**Surface:** my-views.html (line 745 inbox renderer per agent re-diagnosis)
**Doctrine version locked at brief authorship:** Style Doctrine v1.7
**Brief author:** Architect
**Date:** 2026-04-29
**Predecessor:** Brief 3.1 closed (ReferenceError eliminated). Agent's smoke-test re-diagnosis surfaced a second layered defect: inbox rows still dispatch to note-opener instead of invitation-acknowledgement.
**Arc context:** Brief 3.2 is a follow-on emergency repair, second of two unblockers for Brief 3:
  - Brief 1, 1.5, 2, 2.5 — closed.
  - Brief 3 — in progress; halted at §3.1 setup.
  - Brief 3.1 — closed (ReferenceError fixed).
  - **Brief 3.2 (this brief):** Repair the inbox-row dispatch so invitation/removal rows route to the smart handler, not the note-opener.
  - Brief 3 resumes immediately after Brief 3.2 ships.

---

## §0 — Standing rules

- **Iron Rule 36** — terse hand-off (diff, smoke test, findings).
- **Iron Rule 37** — silent work-mode. **Recently reinforced and verified effective in Brief 1.5, 2.5, 3.1.** No mid-cycle narration. Open hand-off with "Per Iron Rule 37 — silent work-mode acknowledged."
- **Iron Rule 39** — input enumeration, output specification.
- **Iron Rule 40** — halt-on-missing-input, terse transcript, test instructions, dev-console-first debugging.
- **Style Doctrine §0.1** — agents do not modify or extend doctrine.

**Brief 3.2 specific:**

- **Smallest possible scope.** Modify the inbox renderer's emitted markup; do not restructure or rewrite dispatch logic.
- **Reuse existing dispatch.** The smart-routing handler at line ~765 (Path A in agent's re-diagnosis) already correctly inspects `note.entity_type` and routes to `_notesShowViewInviteDialog` for `view_invite` and the removal overlay for `view_removed`. This brief makes that handler reachable for inbox rows by emitting the data attributes it binds to.

---

## §1 — Purpose

Brief 2's MY VIEWS fork inherited an inbox renderer that emits `<div class="views-item" onclick="_notesOpenNote(...)">` for inbox rows. Brief 3.1 corrected the function name to `_viewsOpenNote`, eliminating the ReferenceError. But the underlying dispatch is wrong: `_viewsOpenNote` opens the row as a note tile, transferring the invitation's title into a window pane instead of raising the acknowledgement dialog.

A delegated handler at line ~765 already exists with the correct smart-routing logic — it inspects `note.entity_type` and dispatches to `_notesShowViewInviteDialog` for invitations and the removal overlay for removals. But the delegated handler binds to `.views-item[data-viewid]`, and the inbox renderer doesn't emit `data-viewid` (or `data-noteid`). Result: the inline `onclick` always wins and routes everything to `_viewsOpenNote`.

After Brief 3.2 ships:
1. Inbox rows emit `data-noteid` and `data-viewid` attributes.
2. The inline `onclick="_viewsOpenNote(...)"` on inbox rows is removed.
3. The existing delegated handler at line ~765 reaches inbox rows and routes them correctly.
4. Clicking a `view_invite` row in Angela's or Ron's inbox raises the acknowledgement dialog (`_notesShowViewInviteDialog`).
5. Clicking a `view_removed` row raises the removal overlay.
6. Brief 3 §3.4 acceptance flow can run.

---

## §2 — Architectural decisions locked

### §2.1 Reuse existing delegated handler — Option 1 from agent

Per architect adjudication of the agent's two proposed shapes: Option 1 (data attributes + reach the existing delegated handler) wins. The smart-routing logic at line ~765 already encodes the correct dispatch; the bug is the renderer emitting markup the handler can't bind to.

Option 2 (new `_viewsOpenInboxItem` function with inline dispatch) was rejected because it would create parallel dispatch infrastructure for inbox rows when single-source dispatch already exists.

### §2.2 Markup change is surgical

The agent emits `data-noteid="<id>" data-viewid="<viewId>"` on the inbox row's `<div class="views-item">` and removes the inline `onclick` attribute entirely. The agent does NOT modify the delegated handler, the inbox panel structure, or any other rendering code.

If the inbox row's data sources don't expose a `viewId` cleanly (e.g., for `view_removed` rows where the dashboard may have been deleted), the agent emits `data-viewid=""` or `data-viewid="null"` and confirms the delegated handler tolerates those values. If it doesn't, agent halts and reports — adapting the delegated handler is OUT of this brief's scope.

### §2.3 Tray chips remain on `_viewsOpenNote`

Line 1255 (the second `_viewsOpenNote` site Brief 3.1 patched) is the tray-chip renderer. Tray chips are NOT inbox rows — they're saved tile shortcuts on the dashboard's top strip. They legitimately open notes via `_viewsOpenNote`. Brief 3.2 does NOT modify tray chip behavior.

### §2.4 No regression on the delegated handler's existing surfaces

The delegated handler at line ~765 currently handles whatever `.views-item[data-viewid]` elements exist outside the inbox. Brief 3.2 does not change the handler. New inbox rows now satisfy its binding selector and receive the existing routing.

---

## §3 — Required changes

### §3.1 Modify inbox renderer markup at line 745

Find the `<div class="views-item" onclick="_viewsOpenNote(...)">` template string in `_notesRenderInbox()` (or whichever function emits inbox rows; agent confirms exact site).

Change:
- ADD `data-noteid="<note id>"` attribute (the same id currently passed to `_viewsOpenNote(...)`)
- ADD `data-viewid="<view id from note.entity_meta.viewId or equivalent>"` attribute
- REMOVE the `onclick="_viewsOpenNote(...)"` attribute entirely

Preserve all other attributes (className, style hooks, child markup, etc.).

### §3.2 Confirm delegated handler binds correctly

After deploy, the delegated handler at line ~765 should bind to the inbox rows because they now satisfy `.views-item[data-viewid]`. The agent statically verifies this is the case before declaring the brief complete.

If the delegated handler binding mechanism doesn't pick up dynamically rendered inbox rows (e.g., it binds once on page load and inbox rows render later), the agent halts and reports. Adapting the binding is OUT of scope; would require architect re-adjudication.

### §3.3 Verify smart-routing logic for both invitation types

The agent reads the delegated handler's smart-routing branches and confirms:
- `view_invite` rows route to `_notesShowViewInviteDialog`
- `view_removed` rows route to the removal overlay/handler
- Other note types still route to `_viewsOpenNote` for note-opening

If any branch is missing or routes incorrectly, the agent surfaces as a finding. Brief 3.2 does NOT add or rewrite routing branches.

### §3.4 Version bump

`js/version.js`: bump to `CMD[NNN]` (operator assigns at hand-off).

---

## §4 — Out of scope

- Tray chip renderer at line 1255 (legitimately opens notes via `_viewsOpenNote`)
- Any change to the delegated handler at line ~765
- Any change to `_notesShowViewInviteDialog` or the removal overlay handler
- Any change to MY NOTES code or the shared module
- Any change to `_viewsOpenNote` definition or exposure
- Adding new dispatch branches to the smart-routing logic
- Any inbox panel structural changes
- Any change to the inbox-row visual treatment

---

## §5 — Inputs

### §5.1 Files modified

- my-views.html (one edit at line 745 area — surgical markup change)
- js/version.js (CMD bump)

### §5.2 Files read for reference

- my-views.html (post-Brief-3.1 state — for renderer site and delegated handler)
- The shared module from Brief 2.5 (to confirm `_notesShowViewInviteDialog` exposure)
- my-notes.html (post-Brief-2.5 state, not modified)

### §5.3 Files / code agent must NOT modify

- my-notes.html
- The shared module from Brief 2.5
- compass.html
- mw-tabs.js, mw-core.js, hud-shell.js
- Any other my-views.html code outside the inbox row markup edit

### §5.4 Doctrine + reference

- Style Doctrine v1.7
- Iron Rules 36, 37, 39, 40 ratifications

### §5.5 Brief context

- Brief 2 hand-off (where the dispatch bug was introduced)
- Brief 3.1 hand-off (closed; predecessor of this brief)
- Brief 3 (in progress; resumes after this brief ships)
- Agent's re-diagnosis transcript (this session)

---

## §6 — Definition of done

Brief 3.2 is complete when:

- Inbox row markup at line 745 area emits `data-noteid` and `data-viewid` attributes
- Inline `onclick="_viewsOpenNote(...)"` is removed from inbox rows (tray chips at line 1255 retain their inline onclick)
- Delegated handler at line ~765 statically verified to bind to the new inbox row markup
- Smart-routing branches verified for `view_invite` and `view_removed`
- Smoke test (§7) passes
- `js/version.js` bumped
- No new CSS classes, color tokens, font sizes, or doctrine edits introduced
- No changes outside my-views.html and js/version.js
- Hand-off conforms to §8

---

## §7 — Smoke test

Operator runs after deploy:

1. **Hard reset Compass on Browser 2 (Angela / User P1).** DevTools console open.
2. **Click the pending invitation in Angela's inbox** (the one from Vaughn Staples).
3. **Expected:** Invitation acknowledgement dialog raises (NOT a note tile opening with the invitation title). Dialog presents Accept / Decline options.
4. **Click Decline first.** Dialog dismisses; verify in Supabase that `view_participants` row removed:
   ```sql
   SELECT * FROM view_participants
   WHERE view_id = '<Default UUID>'
     AND user_id = '<Angela's user_id>';
   ```
   Returns zero rows.
5. **On Browser 1 / User O / Vaughn**, re-share Default with Angela (re-issue invitation).
6. **Back on Browser 2, refresh Compass.** New invitation appears in Angela's inbox.
7. **Click invitation. Click Accept.** Verify in Supabase:
   ```sql
   SELECT accepted_at FROM view_participants
   WHERE view_id = '<Default UUID>'
     AND user_id = '<Angela's user_id>';
   ```
   Returns row with `accepted_at` populated.
8. **Repeat steps 1-3 on Browser 3 (Ron / User P2)** if Ron also has a pending invitation in his inbox. Click invitation, confirm acknowledgement dialog raises.
9. **Inbox click on a regular note (not invitation, if any exist) on Browser 1**: confirm it still opens as a note tile (regression test for non-invitation routing).
10. **Console cleanliness:** No `Uncaught ReferenceError`. No 500s. Heartbeat traffic clean.

If smoke test passes, Brief 3.2 closes and Brief 3 resumes from §3.1 setup verification (now confirmed truly clean).

---

## §8 — Hand-off format

Required output:

1. **Files modified** — one-liner per file.
2. **Diff** — unified diff for the inbox-row markup change.
3. **Delegated handler verification** — agent reports whether the handler at line ~765 statically appears to bind to the new markup. If concerns surface, halt instead of proceeding.
4. **Smart-routing branch verification** — agent confirms `view_invite` → `_notesShowViewInviteDialog` and `view_removed` → removal overlay branches exist and look correct.
5. **Smoke test result** — pass / fail / not run.
6. **Findings** — zero or more one-liners. Examples:
   - "Delegated handler binds via event delegation on document body — automatically picks up dynamically rendered inbox rows. Verified."
   - "Smart-routing branches for view_invite and view_removed both present at lines XYZ and ABC respectively."
   - "No data-viewid available for some view_removed rows where dashboard was deleted; emit empty string. Delegated handler tolerates."
7. **Test instructions** — verification steps for operator.

Per Iron Rule 37 — work silently. Open hand-off with "Per Iron Rule 37 — silent work-mode acknowledged."

---

## §9 — Reference materials

**Files modified:**
- my-views.html
- js/version.js

**Files read for reference:**
- my-views.html (post-Brief-3.1 state)
- The shared module from Brief 2.5
- my-notes.html (not modified)

**Doctrine:**
- Style Doctrine v1.7
- iron-rule-36-ratification.md
- iron-rule-37-ratification.md
- iron-rule-39-ratification.md
- iron-rule-40-ratification.md
- work-mode-classification-doctrine.md (v1.0)

**Brief context:**
- Brief 2 hand-off
- Brief 2.5 hand-off
- Brief 3.1 hand-off (closed)
- Brief 3 (in progress)
- Agent's re-diagnosis (this session)

---

## §10 — Narrative instruction block (paste-ready)

```
Apply brief-cmdNNN-myviews-inbox-dispatch-repair.md
(Brief 3.2 of the MY VIEWS persistence fork arc — second
emergency repair to unblock Brief 3).

Brief 3.1 (closed) eliminated the ReferenceError but did not
fix the inbox dispatch — your smoke test correctly re-diagnosed
the layered defect. Architect adjudicated: Option 1 (data
attributes + existing delegated handler) wins.

Surgical markup change in my-views.html inbox renderer at
line 745 area:
- ADD data-noteid="<id>" attribute
- ADD data-viewid="<id from note.entity_meta.viewId>"
  attribute
- REMOVE the inline onclick="_viewsOpenNote(...)" attribute

Tray chips at line 1255 are OUT of scope — they legitimately
use _viewsOpenNote. Do not modify.

Architectural decisions LOCKED in §2; do not re-litigate.
The delegated handler at line ~765 already routes correctly;
making it reachable is the entire fix.

Per §3.2: statically verify the delegated handler binds to
the new markup. If binding mechanism doesn't pick up
dynamically rendered rows, halt — adapting binding is OUT
of scope.

Per §3.3: verify view_invite and view_removed branches in
the smart-routing logic exist and route correctly. Surface
any gaps as findings; do NOT add new branches.

§5.3 lists files you must NOT modify.

§7 has a 10-step smoke test the operator runs:
- Click Angela's invitation → acknowledgement dialog raises
- Decline + re-issue + Accept round-trip
- Same on Browser 3 if Ron has pending
- Regression test on regular note (still opens as note)
- Console cleanliness final check

Per Iron Rule 37 — silent work-mode. Open hand-off with
"Per Iron Rule 37 — silent work-mode acknowledged."

Operator's user_id: 57b93738-6a2a-4098-ba12-bfffd1f7dd07.
Firm UUID: aaaaaaaa-0001-0001-0001-000000000001.

Operator will provide CMD number for version bump at
hand-off time.

Proceed.
```

---

*End of Brief — MY VIEWS inbox row dispatch repair (Brief 3.2).*
