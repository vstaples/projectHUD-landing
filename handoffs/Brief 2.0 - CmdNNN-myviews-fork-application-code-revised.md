# Brief — Mode A — MY VIEWS persistence fork: application code (Brief 2 of arc, REVISED) — CMD[NNN]

**Mode:** A (Architectural — application code fork)
**Surface:** my-views.html + my-notes.html (carved scope) + supporting JS modules
**Doctrine version locked at brief authorship:** Style Doctrine v1.7
**Brief author:** Architect
**Date:** 2026-04-29
**Revision date:** 2026-04-29 (post-fresh-agent halt; see §0.5)
**Predecessor:** Brief 1 of arc (schema fork) — closed and verified
**Arc context:** This is Brief 2 (revised) of a 3-brief arc:
  - **Brief 1 (closed):** Schema DDL — `compass_views` table created,
    `view_participants` rebuilt with `view_id` FK, RLS rewritten.
    Database is ready for application code to use.
  - **Brief 2 (this brief, revised):** Application code fork —
    my-views code rewritten to read/write `compass_views` instead
    of `notes_workspace.state.viewsWorkspace`. Includes auto-create
    default dashboard, Share UI fix, and updates to MY NOTES'
    `view_participants` call sites (post-Brief-1 schema conformance).
  - **Brief 3 (anticipated):** Verification — operator creates
    test dashboards across multiple browser sessions, verifies
    persistence, sharing, invitation notifications, MY NOTES
    non-regression.

---

## §0 — Standing rules + arc orientation (fresh agent)

This brief is being executed by a fresh agent with no prior
context on this arc. Read this section in full before any
investigation.

### §0.1 Iron Rules in force

- **Iron Rule 36** (hand-off terseness) — terse diff, smoke
  test, findings only.
- **Iron Rule 37** (silent work-mode) — no diagnostic
  narration; work silently.
- **Iron Rule 39** (architect briefing discipline) — input
  enumeration, output specification (this brief satisfies §2
  and §6).
- **Iron Rule 40** (agent execution discipline) —
  halt-on-missing-input, terse transcript, test instructions
  in hand-off, dev-console-first debugging.
- **Style Doctrine §0.1** — agents do not modify or extend
  doctrine. Halt and report on doctrine gaps.

### §0.2 Operating-practice lessons from this arc (consume before working)

Three lessons from earlier work in this arc you must honor:

1. **When this brief specifies operator-inspection gates
   between work steps, ship one step per deliverable round-
   trip. Do not bundle steps that span operator-decision
   gates.** Earlier in this arc, bundled SQL crossed an
   operator-inspection gate and triggered an integrity error
   the database caught.

2. **When soliciting operator authorization, present
   numbered options with concrete consequences ("Option 1:
   X, consequence Y / Option 2: A, consequence B"). Do not
   ask in natural-language templates.** Operator should
   choose, not improvise wording.

3. **Schema migrations have consumers beyond the surface
   being forked. When working post-schema-migration, treat
   every consumer of the changed schema as a potential
   work-site, regardless of which surface "owns" it.** This
   lesson cost a halt earlier in Brief 2 (the original
   draft) — MY NOTES' `view_participants` consumers were
   not enumerated and broke silently after Brief 1.

### §0.3 What this arc is solving

Compass MY VIEWS previously persisted dashboard data into
`notes_workspace.state.viewsWorkspace`, sharing a database
row with MY NOTES. Adjacent code paths silently overwrote
the operator's saved dashboards on 2026-04-29. The
architectural decision was made to fork the persistence
layer permanently — MY VIEWS gets dedicated tables, MY NOTES
keeps `notes_workspace`, and the two surfaces never share a
database row again.

Brief 1 created the dedicated tables and rebuilt
`view_participants` to support FK-based dashboard references.
Brief 2 (this brief) rewrites the application code on both
MY VIEWS (full fork) and MY NOTES (schema conformance only)
to use the new tables.

### §0.4 What this arc is NOT solving

- The `notes_workspace` table is forbidden territory — do
  not modify it. Any code that reads or writes
  `notes_workspace` for MY NOTES purposes is forbidden
  territory. (This carve-out is narrower than original
  Brief 2 — see §0.5.)
- The shared chrome (panel-geometry component, inbox
  component, header buttons like Save Template / Clone /
  View) is legitimately shared infrastructure used by both
  surfaces via parameterization. Do not duplicate it. Do
  not redesign it. Use it.
- Realtime publication is NOT being enabled. Last-write-wins
  behavior matches every other table.
- Hierarchical organization of dashboards is NOT in scope.
  Flat dashboard list per user is correct for this arc.

### §0.5 Why this brief was revised

The original Brief 2 carved "MY NOTES code is forbidden
territory" too broadly. A fresh agent investigation surfaced
that:

1. The Share dialog physically lives in `my-notes.html`
   (line 5432, exposed as `window._notesShowShareViewDialog`),
   even though it functions as shared chrome.
2. MY NOTES has multiple `view_participants` call sites
   (share dialog + at least 5 others) that were broken by
   Brief 1's schema change. The legacy columns those sites
   wrote (`workspace_owner_user_id`, `view_name`,
   `resource_id`) no longer exist.
3. Invitation notifications in this codebase use the `notes`
   table (`is_inbox = true`, `entity_type = 'view_invite'`),
   NOT a `notifications` table. The original Brief 2
   directed writes to the wrong table.

Brief 2 (revised) carves a narrow exception to "MY NOTES
forbidden" specifically for `view_participants` call sites
and the share dialog wiring. Other MY NOTES behavior
(notes-tree, block editor, chat, `notes_workspace.state`)
remains forbidden territory.

---

## §1 — Purpose

After Brief 2 (revised) ships:

1. MY VIEWS reads dashboard list from `compass_views` table
   filtered by `owner_user_id`.
2. MY VIEWS reads individual dashboard content from the
   corresponding `compass_views.state` jsonb column.
3. MY VIEWS writes dashboard creates / updates / renames /
   deletes to `compass_views` rows.
4. MY VIEWS writes participant additions / removals to
   `view_participants` rows linked via `view_id` FK.
5. New users opening MY VIEWS for the first time auto-receive
   one default empty dashboard named "Default".
6. MY NOTES' `view_participants` call sites are updated to
   match Brief 1's schema (use `view_id` FK, not legacy
   columns).
7. The Share modal correctly retains user selections,
   persists them to `view_participants`, renders accepted
   participants as colored pill-badges at the top of the
   workspace area, and creates invitation entries via the
   existing `notes`-as-inbox mechanism.
8. MY NOTES' core behavior (notes-tree, block editor, chat,
   `notes_workspace.state` content) continues to function
   unchanged.
9. Shared chrome continues to function for both surfaces.

---

## §2 — Architectural decisions locked

The architect locks these decisions before agent work begins.
The agent does not re-litigate them.

### §2.1 Single shared row → per-dashboard rows

Each dashboard a user creates becomes one row in
`compass_views`. The user's "list of dashboards" is a SELECT
filtered by `owner_user_id`. There is NO single "user
workspace" row containing all dashboards.

### §2.2 Dashboard identifier is `compass_views.id` (uuid)

Application code refers to dashboards by their UUID, not by
name. Renames update `view_name` without affecting
references.

### §2.3 Auto-create default dashboard on empty state

When a user opens MY VIEWS and the SELECT returns zero
`compass_views` rows for them, the application inserts one
row with `view_name = 'Default'` and `state = '{}'::jsonb`,
then proceeds as if that row was returned. Application-code
logic, runs at most once per user.

### §2.4 Share UI persistence target is `view_participants`

Share modal selections persist to `view_participants` rows
with:
- `view_id` = current dashboard's UUID (from `compass_views.id`)
- `user_id` = invited user's ID (resolved from selection)
- `view_role` = `viewer` (default) or operator-specified
- `firm_id` = current user's firm
- `color` = assigned per existing color-assignment logic
- `invited_at` = `now()`
- `accepted_at` = NULL (filled when invitee accepts)
- `tile_edit_overrides` = `'{}'::jsonb` (empty object —
  matches the new schema; existing code may have written `[]`
  array which is wrong post-Brief-1, but Brief 1's column
  type is jsonb so empty object is correct)

### §2.5 Pill-badge rendering at top of workspace

Accepted participants (`accepted_at IS NOT NULL`) render as
colored pill-badges at the top of the workspace area when
viewing a shared dashboard. Pending invites do NOT render
badges. Badge color = `view_participants.color`.

### §2.6 Invitation notification target — REVISED

Notifications for view invites are persisted to the **`notes`
table** (NOT a separate `notifications` table). This matches
the existing codebase pattern. The schema inventory's flagged
constraint at line 1231 (`notes.entity_type` CHECK
restricting to `view_invite` / `view_removed`) confirms this
is the de facto invitation persistence.

When a participant is added to a dashboard, the application
creates one row in the `notes` table with:

- `firm_id` = inviter's firm
- `owner_user_id` = invited user's ID (so it appears in
  invitee's inbox)
- `entity_type` = `view_invite`
- `entity_id` = either the `view_participants.id` or
  `compass_views.id` — agent inspects existing MY NOTES code
  for the prevailing convention and matches it
- `is_inbox` = true
- `title` = "[inviter name] invited you to [dashboard name]"
  (match existing convention)
- (Other fields per existing pattern — agent matches what
  MY NOTES' current share dialog already does, or did, before
  the schema break)

When a participant is removed (or the dashboard is deleted
and CASCADE removes the participant), a second `notes` row
with `entity_type = 'view_removed'` is created — same pattern.

The agent does NOT modify the `notes` table schema. It does
NOT modify the inbox component that displays these rows. New
`view_invite` / `view_removed` entries appear in the inbox
automatically once it queries the `notes` table.

### §2.7 Share UI fix scope

The Share modal currently fails to retain dropdown selections.
The operator's prior diagnosis: clicking a username in the
dropdown is supposed to populate the base form's selection
list; the click-callback wiring is broken.

The agent has TWO competing hypotheses to investigate:

- **Hypothesis A:** JavaScript click wiring is broken (event
  handler not bound, stale reference, event-bubbling issue,
  etc.). Always-existed bug independent of Brief 1.
- **Hypothesis B:** The click wiring works correctly, but
  the resulting `INSERT INTO view_participants` silently
  fails (in a try/catch or unhandled-rejection path) because
  the INSERT writes columns Brief 1 dropped. The dialog
  re-renders, sees no rows, displays empty.

Both could be true (two layered bugs). The agent investigates
empirically — reads the code's actual flow, runs the dropdown
click in a live environment if needed (per Iron Rule 40 §4
dev-console-first debugging). Reports which hypothesis(es)
held. Fixes accordingly.

### §2.8 Read paths consolidated to `compass_views` (MY VIEWS)

MY VIEWS reads ONLY from `compass_views`. The fallback to
`state.viewsWorkspace` and `state.views` is **severed** in
Brief 2.

The agent verifies via grep that no MY VIEWS code path
still references `state.viewsWorkspace` or `state.views`
post-rewrite.

### §2.9 Write paths consolidated to `compass_views` (MY VIEWS)

All MY VIEWS writes target `compass_views` and
`view_participants` rows. No write path touches
`notes_workspace`.

### §2.10 MY NOTES `view_participants` call sites — schema conformance

The agent updates every MY NOTES call site that reads or
writes `view_participants` to use Brief 1's schema:
- Writes use `view_id` (FK to `compass_views.id`); legacy
  columns (`workspace_owner_user_id`, `view_name`,
  `resource_id`) are removed from INSERT/UPDATE statements.
- Reads use `view_id` joins to `compass_views` for
  owner/name lookups.

The agent enumerates all such call sites (the fresh agent
already identified at least six: line 5432 share dialog;
705-729 read; 3551 rename; 3352 owner-row insert; 2782
template launch; `_notesLoadViewParticipants` [line TBD]).
Confirm exact lines as you go and add any additional call
sites surfaced by grep.

For MY NOTES, the **behavior** is preserved — same UX, same
sharing semantics, same dialog flow. Only the database
column names change.

### §2.11 MY NOTES non-regression (other behaviors)

After Brief 2, MY NOTES must continue to:
- Load and display the operator's existing notes hierarchy
- Allow creating, editing, deleting notes
- Show its inbox (same component, same data source — `notes`
  table where `is_inbox = true`)
- Use the same panel-geometry chrome as before
- Read and write `notes_workspace.state` for its own workspace
  state (FORBIDDEN territory for modifications)

The agent regression-tests MY NOTES as part of the smoke
test (per §7).

### §2.12 Share dialog physical location

The Share dialog stays in `my-notes.html` at line 5432. The
agent has explicit permission to modify:
- The dialog's wiring (event handlers, callbacks)
- The dialog's persistence calls (writes to
  `view_participants` and `notes`-as-inbox notifications)
- `_notesShowResourcePicker` (line 5092) if the dropdown
  failure traces there
- `_notesLoadViewParticipants` (line TBD; agent finds it)

The agent does NOT have permission to modify:
- MY NOTES' notes-tree rendering or hierarchy logic
- MY NOTES' block editor
- MY NOTES' chat/messaging logic
- Any read or write to `notes_workspace.state` (any path)
- Other notes-specific behavior outside the
  `view_participants` / share dialog scope

If the agent decides during execution that extracting the
share dialog to a separate file would be substantially
cleaner (e.g., `share-view-dialog.js`), they have
authorization to extract it AS LONG AS the extraction is
bounded — same DOM structure, same behavior, all callers
updated. If extraction surfaces a coupling that grows the
work, halt and report. Default disposition: leave the dialog
in `my-notes.html` unless extraction is clearly the smaller
path.

---

## §3 — Investigative discipline

This is a fix brief, but the agent's first move is
investigation. Three things must be true before any rewrite
proceeds.

### §3.1 Confirm the parameterization assumption

The arc planning assumed shared chrome (panel-geometry,
inbox, header buttons) is parameterized by data, not
hard-coded to specific tables.

The agent confirms this by reading the chrome components
and verifying:
- The panel-geometry component receives tile/layout data as
  parameters
- The inbox component reads from the `notes` table where
  `is_inbox = true` (confirm via the actual query in code)
- The Save Template / Clone / View buttons consume the
  active dashboard/note's identifier as a parameter

If any assumption is wrong, the agent halts and reports.

### §3.2 Identify all `view_participants` call sites

The agent enumerates every code path (in `my-views.html`,
`my-notes.html`, mw-tabs.js, and any other supporting files)
that:
- Reads from `view_participants`
- Writes to `view_participants`

The fresh agent's prior investigation identified at least six
sites in MY NOTES alone. Confirm those, find any additional
sites, and treat all of them as work targets.

### §3.3 Identify the my-views read/write paths

The agent enumerates every code path in MY VIEWS files that:
- Reads from `notes_workspace` (any column, any path)
- Writes to `notes_workspace` (any column, any path)
- References `state.viewsWorkspace` or `state.views`

Each is a candidate for replacement with `compass_views`
calls.

### §3.4 Investigate Share dialog dropdown failure empirically

Per §2.7, two hypotheses (click wiring broken, or silent
INSERT failure due to schema mismatch). Investigate both.
Report which held. Fix accordingly.

If the live environment is needed for empirical
investigation, instruct the operator to run dev-console
diagnostics per Iron Rule 40 §4 — do not improvise based on
inferred behavior.

### §3.5 Halt-on-missing-input

If the agent identifies an input file they need that wasn't
provided in §5, they halt per Iron Rule 40 §1.

---

## §4 — Required changes

### §4.1 MY VIEWS read path rewrite

Replace `notes_workspace.state.viewsWorkspace` reads with
`compass_views` queries:

- **Dashboard list:** `SELECT id, view_name, created_at,
  updated_at FROM compass_views WHERE owner_user_id =
  '<current_user_id>' ORDER BY created_at`
- **Active dashboard content:** `SELECT id, view_name, state
  FROM compass_views WHERE id = '<active_view_id>'`
- **Participants for active dashboard:** `SELECT vp.*, u.name
  FROM view_participants vp LEFT JOIN users u ON vp.user_id
  = u.id WHERE vp.view_id = '<active_view_id>'`

All queries respect Supabase RLS.

### §4.2 MY VIEWS write path rewrite

Replace `notes_workspace` UPDATEs with `compass_views`
operations:

- **Save dashboard content:** `UPDATE compass_views SET state
  = '<new_state>' WHERE id = '<active_view_id>'`
- **Create new dashboard:** `INSERT INTO compass_views
  (firm_id, owner_user_id, view_name, state) VALUES (...)
  RETURNING id`
- **Rename:** `UPDATE compass_views SET view_name =
  '<new_name>' WHERE id = '<id>'`
- **Delete:** `DELETE FROM compass_views WHERE id = '<id>'`

### §4.3 Auto-create default dashboard

In MY VIEWS load path, if dashboard list query returns zero
rows:

```sql
INSERT INTO compass_views (firm_id, owner_user_id, view_name, state)
VALUES (<firm_id>, <user_id>, 'Default', '{}'::jsonb)
RETURNING id, view_name, state;
```

Then proceed as if this row was the original SELECT result.
Set the new dashboard as active.

### §4.4 MY NOTES `view_participants` call site updates

Per §2.10, update every MY NOTES call site enumerated in
§3.2 to use Brief 1's schema:

- INSERTs use `view_id` instead of `(workspace_owner_user_id,
  view_name)` and any other dropped columns. The `view_id`
  resolves to the `compass_views.id` for the relevant
  dashboard.
- UPDATEs reference rows by `view_id` joined to
  `compass_views`.
- SELECTs join `view_participants` to `compass_views` via
  `view_id` to retrieve owner/name when needed.
- `tile_edit_overrides` writes use `'{}'::jsonb` not `[]`.

Behavior preservation: the MY NOTES share UX, sharing
semantics, and dialog flow are unchanged. Only the database
column references change. Operator should not notice any
difference in MY NOTES' sharing behavior post-deploy except
that it works again (whereas it has been silently broken
since Brief 1).

### §4.5 Share dialog wiring fix

Per §2.7 and §3.4 investigation, fix the dropdown
selection-retention issue. Specifics depend on which
hypothesis(es) held. Likely actions:
- If Hypothesis A: fix the click handler binding
- If Hypothesis B: fix the INSERT schema (already covered
  by §4.4)
- If both: fix both

Additional Share dialog requirements:
- Selection display in "PEOPLE WITH ACCESS" updates as
  selections are added/removed pre-Save
- Save Changes persists each selected user to
  `view_participants` per §2.4
- Notification entries created per §2.6 (writes to `notes`
  table, not `notifications` table)

### §4.6 Pill-badge rendering

At the top of the workspace area for the active dashboard,
render colored pill-badges for each accepted participant
(`accepted_at IS NOT NULL`). Use `view_participants.color`
for the badge.

Click behavior on the badge is OUT of scope.

### §4.7 Stale reference cleanup

The agent grep-checks the codebase for remaining references
to:
- `state.viewsWorkspace`
- `state.views` in MY VIEWS code paths only (MY NOTES
  legitimately uses `state.views` for its own workspace)

Any references in MY VIEWS code are removed. If found in
shared code that ALSO serves MY NOTES, halt and report.

### §4.8 Version bump

`js/version.js`: bump to `CMD[NNN]` (operator assigns).

---

## §5 — Inputs (Iron Rule 39 §2)

### §5.1 Files agent will read and modify

- `my-views.html` (the MY VIEWS surface)
- `my-notes.html` (carved scope per §2.12 — share dialog
  wiring, view_participants call sites only)
- `mw-tabs.js` (contains `loadMyViewsView`)
- `js/version.js` (CMD bump only)
- Any my-views support JS modules (agent identifies)

### §5.2 Files agent will read for reference

- `compass.html`
- `mw-core.js`
- `hud-shell.js` v1.2 + CMD100
- Brief 1 hand-off
- `projecthud-supabase-schema-inventory.md`

### §5.3 Files / code agent must NOT modify

- `notes_workspace`-targeting code in MY NOTES (any code
  that reads or writes the `notes_workspace` table for MY
  NOTES purposes)
- MY NOTES' notes-tree, block editor, chat, hierarchy logic
- Any MY NOTES behavior outside the `view_participants` /
  share dialog scope per §2.12
- The shared inbox component
- The shared panel-geometry component
- The shared header buttons (Save Template / Clone / View
  behavior is unchanged; the Share modal markup is modifiable
  for the wiring fix)
- `compass.html` Tier 2 dispatch
- `mw-core.js` canonical dispatch
- `hud-shell.js`

### §5.4 Database tables

- Read/write target: `compass_views`, `view_participants`,
  `notes` (notification creation only — table not modified)
- Read only: `users`, `firms`
- Forbidden: `notes_workspace` (any operation)

### §5.5 Doctrine + reference

- ProjectHUD Style Doctrine v1.7
- iron-rule-36-ratification.md
- iron-rule-37-ratification.md
- iron-rule-39-ratification.md
- iron-rule-40-ratification.md
- work-mode-classification-doctrine.md (v1.0)

### §5.6 Brief context

- Brief 1 hand-off (closed)
- This brief (revised)

---

## §6 — Definition of done

Brief 2 (revised) is complete when:

- All MY VIEWS read paths target `compass_views` (verified
  by grep — no `state.viewsWorkspace` or `state.views`
  references remain in MY VIEWS code)
- All MY VIEWS write paths target `compass_views` and
  `view_participants` (no `notes_workspace` writes from MY
  VIEWS code)
- Auto-create default dashboard logic works
- All MY NOTES `view_participants` call sites use Brief 1's
  schema (no references to dropped columns)
- Share modal correctly retains selections (verified by
  smoke test)
- Share modal correctly persists selections to
  `view_participants` with new schema
- Pill-badges render for accepted participants
- Invitation notifications written to `notes` table with
  `entity_type = 'view_invite'`, `is_inbox = true`
- MY NOTES inbox displays new `view_invite` rows correctly
- MY NOTES core behavior (notes-tree, block editor, chat,
  workspace) unchanged
- Shared chrome continues to function for both surfaces
- `js/version.js` bumped
- No new CSS classes, color tokens, font sizes, or doctrine
  edits introduced
- Hand-off conforms to §8

---

## §7 — Smoke test

Operator runs after deploy:

1. **Hard reset Compass.** New CMD number in console.

2. **MY VIEWS first load (auto-create):** Click MY VIEWS.
   Default dashboard appears in DASHBOARDS section. Workspace
   renders empty state.

3. **Add tiles to Default:** Use existing chrome (R1, Medium,
   +Add row) to add 2-3 tiles. Save (or wait for auto-save).

4. **Reload page.** Tiles persist.

5. **Open Share modal.** Click a user from dropdown. User
   appears in "PEOPLE WITH ACCESS" pre-Save. Save Changes.

6. **Verify view_participants:**
   ```sql
   SELECT id, view_id, user_id, view_role, color, invited_at
   FROM view_participants
   WHERE view_id = '<Default UUID>';
   ```
   Returns invited user(s).

7. **Verify invitation notification:**
   ```sql
   SELECT id, owner_user_id, entity_type, entity_id, title,
          is_inbox
   FROM notes
   WHERE entity_type = 'view_invite'
     AND owner_user_id = '<invited user's id>'
   ORDER BY created_at DESC LIMIT 1;
   ```
   Returns the invitation row.

8. **Switch to MY NOTES.** Notes-tree loads. Existing notes
   visible. Edit a note, save. Confirm save persists
   (regression test — `notes_workspace.state` write path).

9. **Open MY NOTES inbox.** Confirm prior inbox content
   intact. (If invited user is logged in elsewhere or you
   simulate, the new view_invite row appears here.)

10. **Test MY NOTES Share dialog (regression).** Open share
    on a note. Click a user. Save. Verify:
    ```sql
    SELECT * FROM view_participants
    WHERE view_id IS NULL OR view_id = ...;
    ```
    Wait — MY NOTES sharing now needs to reference
    `compass_views` too? No — MY NOTES sharing is for
    notes/dashboards, and after Brief 2 the same
    `view_participants` table serves both surfaces. The
    `view_id` for a note-share would point to... what?
    
    **HALT — this is a coupling the brief did not anticipate.**
    See §7.5 below.

### §7.5 Coupling discovered during smoke test design

The smoke test step 10 surfaces a coupling I missed during
brief authoring: MY NOTES' existing share dialog operates on
`view_participants`, which now requires a `view_id` FK to
`compass_views`. But MY NOTES is sharing notes, not
dashboards.

Two possibilities:

- **Possibility A:** MY NOTES' share dialog was always
  sharing dashboards (the "views" terminology in
  `view_participants` referred to MY VIEWS dashboards from
  the start, even when it lived in MY NOTES code), and the
  dialog was incorrectly invoked for note-sharing too. Brief
  2 fixes by routing only dashboard shares through
  `view_participants`; note-shares need a different
  mechanism (or didn't really work either).
- **Possibility B:** MY NOTES legitimately shares notes via
  `view_participants` with `view_id` pointing to a NOTE
  identifier (not a dashboard). The schema's `view_id` →
  `compass_views.id` FK is wrong for note-sharing.

Brief 2 (revised) cannot resolve this without operator and
architect adjudication. The agent halts on Step 10 of smoke
test if MY NOTES note-sharing breaks. Report findings.

If smoke test cannot be run live: agent reports static
analysis instead, and operator runs Step 10 post-deploy as
the gating verification.

---

## §8 — Hand-off format (Iron Rule 36 + Iron Rule 40 §3)

Required output:

1. **Files modified** — one-liner per file
2. **Diff** — unified diff per file
3. **Diagnosis summary** — one paragraph (3-5 sentences):
   confirm parameterization assumption (§3.1) held; report
   which Share dialog hypothesis(es) held (§3.4); report any
   unexpected couplings encountered (especially the §7.5
   note-sharing question if it surfaced).
4. **Smoke test result** — pass / fail / not run, with
   one-sentence explanation if not run.
5. **Findings** — zero or more one-liners. Examples:
   - "Parameterization assumption confirmed."
   - "Share dialog Hypothesis B confirmed (silent INSERT
     fail). Hypothesis A independent: click handler was
     correctly wired."
   - "Enumerated N view_participants call sites in MY NOTES
     (file:line list). All updated to use view_id."
   - "MY NOTES note-sharing surfaced §7.5 coupling. Halted
     per brief instructions; recommend Brief 2.5 to
     adjudicate note-sharing schema."
   - "Inbox component verified reads notes table where
     is_inbox = true."
   - "Share dialog left in my-notes.html; extraction not
     pursued."
6. **Test instructions** — explicit verification steps for
   operator post-deploy.

Do not transcribe reasoning beyond §8(3) diagnosis summary.

---

## §9 — Reference materials (Iron Rule 39 §2 — full enumeration)

**Files modified (anticipated):**
- my-views.html (and supporting JS modules)
- my-notes.html (carved scope per §2.12)
- mw-tabs.js
- js/version.js

**Files read for reference:**
- compass.html
- mw-core.js
- hud-shell.js (v1.2 + CMD100)
- Brief 1 hand-off
- projecthud-supabase-schema-inventory.md

**Doctrine + operating-discipline:**
- ProjectHUD Style Doctrine v1.7
- iron-rule-36-ratification.md
- iron-rule-37-ratification.md
- iron-rule-39-ratification.md
- iron-rule-40-ratification.md
- work-mode-classification-doctrine.md (v1.0)

**Brief context:**
- Brief 1 hand-off (closed)
- This brief (revised)

---

## §10 — Narrative instruction block (paste-ready)

Per Iron Rule 39 §1, the operator copy-pastes the following
block to the coding agent:

```
Apply brief-cmdNNN-myviews-fork-application-code-revised.md
(Brief 2, REVISED, of the MY VIEWS persistence fork arc).

You are a fresh agent OR the same agent who halted earlier.
Either way, read §0 in full — especially §0.5 explaining
why this brief was revised.

Brief 1 (closed, hand-off attached) established schema:
compass_views table, view_participants rebuilt with view_id
FK and dropped legacy columns, RLS rewritten.

Brief 2 (this revision) rewrites application code on BOTH
MY VIEWS (full fork from notes_workspace) AND MY NOTES
(carved-scope updates to view_participants call sites for
schema conformance).

Architectural decisions are LOCKED in §2; do not
re-litigate. Two specific corrections from original Brief 2:
- §2.6 — notifications go to the `notes` table (is_inbox =
  true, entity_type = 'view_invite'), NOT a `notifications`
  table.
- §2.10, §2.12 — MY NOTES has a carved exception for
  view_participants call sites and the share dialog at
  my-notes.html line 5432. All other MY NOTES code
  (notes-tree, block editor, chat, notes_workspace.state)
  remains forbidden.

§4 enumerates required changes.
§3 specifies investigative discipline.

§0.2 has three operating-practice lessons including the new
lesson about schema-migration consumer enumeration.

§5.3 lists files / code you must NOT modify.

§7.5 documents a coupling the architect could not resolve
without your investigation. If MY NOTES note-sharing breaks
during smoke test step 10, halt and report — do not
improvise.

Per Iron Rule 40 §1, halt on missing inputs.

Operator's user_id is `57b93738-6a2a-4098-ba12-bfffd1f7dd07`.
Firm UUID is `aaaaaaaa-0001-0001-0001-000000000001`.

Operator will provide CMD number for version bump at hand-off
time.

Proceed.
```

---

*End of Brief — MY VIEWS persistence fork: application code (Brief 2, REVISED).*
