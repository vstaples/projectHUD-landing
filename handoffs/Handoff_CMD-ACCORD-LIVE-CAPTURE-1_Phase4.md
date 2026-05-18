# HANDOFF — CMD-ACCORD-LIVE-CAPTURE-1 · Phase 4: Agenda Canvas Section

**Date:** 2026-05-17
**CMD:** L-01 · CMD-ACCORD-LIVE-CAPTURE-1
**Operator:** Vaughn Staples
**Phase:** 4 of 7 — Agenda section wired to live data. Capture, history, reclassify.

---

## §0 — PRE-FLIGHT

Read `Brief_CMD-ACCORD-LIVE-CAPTURE-1.md` end-to-end before proceeding.
Read Phase 1 findings and Phase 3 operator review in full — both carry forward.
Iron Rules 36, 40 §1, 47, 64, 71, 72, 73 apply.
Terse output discipline. Deliver in §6 file order, then §7 checklist verbatim. Stop.

---

## §1 — CARRY-FORWARD

**Phase 1:**
- `accord-capture.js:_doCommit()` — INSERT fields: `firm_id`, `thread_id`, `meeting_id`,
  `agenda_item_id`, `tag`, `summary`, `body`, `created_by`, `effective_date`,
  `due_date`, `effective_date_basis`. `seq_id` is server-side only.
- `accord-capture.js:178` throws on `accord:meeting-loaded` — pre-existing, legacy DOM
  write. Resolve this phase by guarding or refactoring the DOM write path.
- `accord:remote-node` — dispatched by `accord-core.js:547`; `accord-capture.js:105`
  currently appends remote nodes to legacy stream. New shell must handle this event.
- `accord:remote-agenda` — dispatched by `accord-core.js:547`; `accord-capture.js:123`
  reloads agenda items. New shell must reload its agenda item list on this event.
- `accord.node.committed` — broadcast to channel on INSERT; all participants receive.
- `accord.agenda.changed` — broadcast on agenda item status change.
- Node `seq_id` format: `NT-032`, `DC-018` etc. Assigned by `allocate_node_seq()` trigger.
- `discussed`/`skipped` agenda item status transitions: **not yet implemented
  client-side**. Build from scratch this phase.

**Phase 2:**
- `accord_nodes.discipline` and `accord_nodes.topic` columns now exist (nullable).
  Do NOT write them from Live Capture — leave NULL. Knowledge Base CMD writes them.

**Phase 3 — known issue to resolve:**
- `accord-capture.js:178` throws on `accord:meeting-loaded` because it tries to write
  to legacy DOM elements that don't exist in the new shell. Fix this phase by adding
  a guard: check for element existence before writing, or scope the legacy path
  to only run when the 5-tab shell is active. Do not delete the legacy path —
  Meeting Setup (idle state) still uses it.

---

## §2 — INPUTS

Request the following files from the operator:

| File | Purpose |
|------|---------|
| `accord-live-capture.js` | Shell from Phase 3 — extend with agenda canvas |
| `accord-capture.js` | Full file — fix :178 throw; read commit and remote-node paths |
| `accord-views.js` | Confirm agenda item query pattern for this meeting |
| `accord-core.js` | Confirm `accord:remote-node` and `accord:remote-agenda` dispatch |

---

## §3 — DELIVERABLES

1. `accord-live-capture.js` — extended with full Agenda canvas section
2. `accord-capture.js` — `:178` guard fixed; legacy DOM writes scoped
3. Operator review checkpoint at end of phase before Phase 5

---

## §4 — BUILD SPEC

### 4.1 — Agenda section in canvas

Add to `AccordLiveCapture` render below the sidebar. The canvas already exists
from Phase 3 — append the Agenda section as the first content block.

**Section header** (sticky, matches mockup):
```
[blue bar] AGENDA   [3 items · Item 2 active]   [▾]
```
- Sticky `top: topbar-height` (confirm px value from Phase 3 topbar)
- Collapse/expand toggles section body
- Item count and active item label update as items change state

**Action items strip** (prior meeting, collapsible):
```javascript
// Query: accord_nodes WHERE meeting_id = [PRIOR meeting] AND tag IN ('action')
// AND status != 'closed' ORDER BY created_at ASC
// Prior meeting = most recent closed meeting in same workstream
// Fields: seq_id, summary, status, created_by
```
Render as collapsible amber strip above agenda items.
Pills: overdue count (red), open count (amber).
Overdue = due_date < today AND status != 'closed'.

**Per-agenda-item accordion:**

Load agenda items:
```javascript
// SELECT agenda_item_id, title, position, status
// FROM accord_agenda_items
// WHERE meeting_id = [current meeting_id]
// ORDER BY position ASC
```

For each item, render:

```
[chevron] [number] [title]                    [Active badge if current]
```

**Collapsed:** title row only.
**Expanded:** three sub-sections stacked:

**Sub-section 1 — History** (collapsible, default collapsed):
```javascript
// SELECT n.seq_id, n.tag, n.summary, n.created_at, m.title as meeting_title
// FROM accord_nodes n
// JOIN accord_meetings m ON n.meeting_id = m.meeting_id
// WHERE n.thread_id = [agenda_item.thread_id]     -- thread_id links across meetings
//   AND n.meeting_id != [current meeting_id]       -- prior meetings only
// ORDER BY n.created_at DESC
```
If `agenda_item.thread_id` is NULL (first meeting on this topic): render
"No prior history" pill, no toggle.

Each history entry: single row — `[date] [seq_id badge] [summary text]`
Badge color by tag: DC=purple, NT=green, AX=amber, RK=red, DS=red.
No second line. Long text wraps inline.
Header: `HISTORY` (bold, 11px, uppercase) · `N entries · N meetings` (right).

**Sub-section 2 — Captured this meeting** (label, always visible when items exist):
```javascript
// SELECT seq_id, tag, summary, created_at, created_by
// FROM accord_nodes
// WHERE meeting_id = [current] AND agenda_item_id = [this item]
// ORDER BY created_at ASC
```
Single-row entries matching history style.
Label "Captured this meeting" appears only when entries exist.
Updates in real-time via `accord:remote-node` event (see §4.3).

**Sub-section 3 — Add Note zone** (always visible when item is expanded):
- Amber-tinted textarea (`background: rgba(232,148,48,.025)`,
  `border: 1px solid rgba(232,148,48,.28)`)
- Min 4 rows
- Placeholder: `"Type a note, observation, or follow-up…"`
- Highlights on focus (brighter amber background + border)
- `+ ADD` button anchored bottom-right (green)
- Shift+Enter commits; Enter = normal newline
- On commit: INSERT node (see §4.2), clear textarea, append to captured list

### 4.2 — Node INSERT from Add Note zone

```javascript
// INSERT into accord_nodes:
{
  firm_id:        Accord.state.firm.id,
  meeting_id:     Accord.state.meeting.meeting_id,
  agenda_item_id: [this agenda item's id],
  thread_id:      [agenda item's thread_id — NULL if first meeting],
  tag:            'note',         // default; reclassify changes this
  summary:        [textarea value],
  body:           null,
  created_by:     Accord.state.resource.id
  // discipline, topic: do NOT write — leave NULL
  // seq_id: server-assigned, returned in response
}
```

After INSERT: append the returned node (with seq_id) to the captured list
for this agenda item. Do NOT re-query — use the INSERT response.

Broadcast `accord.node.committed` to meeting channel (match pattern in
`accord-capture.js:450`).

### 4.3 — Reclassify popup

Clicking any captured entry's badge opens the reclassify popup.

**Types:** Note · Decision · Action Item · Risk · Parking Lot

**Conditional fields per type:**
- Action Item: Assignee (text input, default current user name) + Due date (text input)
- Decision: Effective date (text input, optional)
- Risk: Severity (text input: Low / Medium / High)
- Note, Parking Lot: no additional fields

**On confirm:**
```javascript
// PATCH accord_nodes SET tag = [new_tag], [conditional fields] WHERE node_id = [id]
// Additional fields map:
// Action Item → body = JSON.stringify({ assignee, due_date })
//               due_date column = due_date value
// Decision    → effective_date column = effective_date value
// Risk        → body = JSON.stringify({ severity })
```
Update badge color and entry styling in DOM after PATCH.
Do not re-query; patch DOM directly from PATCH response.

**IR73:** PATCH must use disjoint per-tag UPDATE RLS if it exists.
Verify in `information_schema` before PATCHing. If RLS blocks cross-tag
PATCH, use a SECURITY DEFINER helper function (IR47 verify first).

### 4.4 — Agenda item status transitions (build from scratch)

Per Phase 1: `discussed` and `skipped` are valid `accord_agenda_items.status`
values but have no client-side implementation.

**IR47:** Before writing any PATCH, run:
```sql
SELECT conname, consrc FROM pg_constraint
WHERE conrelid = 'accord_agenda_items'::regclass
AND contype = 'c';
```
Confirm `discussed` and `skipped` are valid constraint values.
Surface finding in delivery — do not assume.

**Transition rules:**
- Organizer only (confirm via `Accord.state.resource.id` === meeting organizer)
- Clicking the active agenda item header offers: "Mark discussed" → PATCH status='discussed'
- Active item = first item WHERE status='pending' ORDER BY position
- After marking discussed: next pending item becomes active; progress bar updates
- "Skip item" available on any pending item: PATCH status='skipped'

```javascript
// PATCH accord_agenda_items
// SET status = 'discussed' (or 'skipped')
// WHERE agenda_item_id = [id]
// AND meeting_id = [current]   ← IR73 disjoint guard
```

Broadcast `accord.agenda.changed` to meeting channel after PATCH.
On `accord:remote-agenda` event: reload agenda item statuses and re-render
active item badge and progress bar.

### 4.5 — Fix accord-capture.js:178 throw

The throw occurs because `accord-capture.js` writes to legacy DOM elements
on `accord:meeting-loaded`, which don't exist in the new Live Capture shell.

**Fix:** Add element existence guard before each legacy DOM write:
```javascript
// Before: document.getElementById('ac-capture-host').innerHTML = ...
// After:
var host = document.getElementById('ac-capture-host');
if (host) { host.innerHTML = ...; }
```

Apply this pattern to every DOM write in the `accord:meeting-loaded` handler
in `accord-capture.js`. Do not delete the write paths — Meeting Setup (idle)
still needs them.

Scope of fix: `accord:meeting-loaded` handler only. Do not touch other
handlers this phase.

### 4.6 — Remote node handling

On `accord:remote-node` event (node captured by another participant):
- Identify which agenda item the node belongs to (`agenda_item_id`)
- If that agenda item is currently expanded: append to its captured list
- If collapsed: increment a "N new" counter badge on the item header
- Clear counter badge when item is expanded

On `accord:remote-agenda` event (agenda item status changed by organizer):
- Reload `accord_agenda_items` statuses for current meeting
- Re-render active item badge and progress bar segments

---

## §5 — IRON RULE REMINDERS

**IR47:** Verify `discussed`/`skipped` constraint values before PATCHing.
Verify reclassify PATCH RLS before confirming. Surface findings explicitly.

**IR71:** Do not mutate node state before PATCH confirms. Optimistic UI
is permitted for append-only operations (new node appears immediately)
but tag/status changes wait for server confirmation before DOM update.

**IR72:** `accord.node.committed` and `accord.agenda.changed` must
continue to be broadcast on all relevant actions — other participants
depend on them.

**IR73:** All `accord_agenda_items` status PATCHes must include
`AND meeting_id = [current]` in the WHERE clause to satisfy disjoint
per-transition RLS if present.

**`var` only** — no `let`/`const` in new JS.

---

## §6 — FILE ORDER

1. `accord-live-capture.js` — full file with Agenda section added
2. `accord-capture.js` — diff showing :178 guard fix only

Then: operator review note (what to visually confirm and functionally test).
Then: §7 checklist verbatim. Stop.

---

## §7 — PHASE 4 CHECKLIST

- [ ] IR47: `discussed`/`skipped` constraint values verified and surfaced in delivery
- [ ] IR47: Reclassify PATCH RLS verified before confirming PATCH approach
- [ ] Agenda section renders with sticky header, collapse toggle, item count
- [ ] Action items strip renders prior meeting open/overdue nodes (collapsible)
- [ ] All agenda items render as accordion rows in position order
- [ ] Active item (first pending) shows Active badge
- [ ] Expanding item shows History sub-section (collapsed by default)
- [ ] History entries: single row, date · badge · text, correct badge colors
- [ ] "No prior history" shown when thread_id is NULL
- [ ] "Captured this meeting" label and entries render when nodes exist
- [ ] Add Note zone: amber tint, 4-row min, highlights on focus
- [ ] Shift+Enter and + ADD button both commit note
- [ ] NT node INSERT writes correct fields (discipline/topic left NULL)
- [ ] seq_id returned from server appears on committed node badge
- [ ] `accord.node.committed` broadcast on INSERT
- [ ] Reclassify popup opens on badge click, correct types listed
- [ ] Conditional fields render per type (AX: assignee+due; DC: effective date; RK: severity)
- [ ] PATCH updates tag, badge color, entry style without re-query
- [ ] `discussed`/`skipped` PATCH correct (IR73 WHERE guard present)
- [ ] `accord.agenda.changed` broadcast on status PATCH
- [ ] `accord:remote-node` appends to expanded item or increments counter
- [ ] `accord:remote-agenda` reloads statuses and updates active badge + progress bar
- [ ] `accord-capture.js:178` no longer throws (existence guard applied)
- [ ] Meeting Setup (idle) still renders correctly — no regression from :178 fix
- [ ] `var` only — no `let`/`const` in new code

---

**Ship it.**
