# HANDOFF — CMD-ACCORD-MINUTES-1 · Phase 4: Canvas — Decisions + Actions + Risks + Parking Lot

**Date:** 2026-05-19
**CMD:** M-01 · CMD-ACCORD-MINUTES-1
**Operator:** Vaughn Staples
**Phase:** 4 of 6 — Four consolidated sections with add, edit, and soft delete.

---

## §0 — PRE-FLIGHT

Read `Brief_CMD-ACCORD-MINUTES-1.md` end-to-end before proceeding.
Read Phase 1, 2, and 3 findings in full — all carry forward.
Session protocol: terse mode; test Chrome connection first; Test Mode after
each code update — one checklist item at a time.
Iron Rules 36, 40 §1, 47, 64, 71, 72, 73 apply.
`var` only — no `let`/`const`.
Deliver in §6 file order, then operator review note, then §7 checklist. Stop.

---

## §1 — CARRY-FORWARD

**Phase 3 close-out — architect disposition:**
`accord_meeting_outcomes` INSERT is blocked by DB trigger on closed meetings.
Outcomes section is **read-only** in Minutes. No + Add button on outcomes.
Do not attempt to INSERT into `accord_meeting_outcomes` from any Minutes path.

**`accord_nodes.tag` values:** `note|decision|action|risk|question|dissent`

**Soft delete pattern:** PATCH `status='deleted'`on `accord_nodes`.
Do NOT hard DELETE. Row fades to `opacity:.35` + `text-decoration:line-through`.
Does not remove from DOM.

**IR73:** All `accord_nodes` PATCHes must include `AND meeting_id = [current]`.

**`_excludedNodeIds` Set:** established in Phase 3 for Agenda entries.
Extend the same Set to cover entries excluded from all four sections.

**Chevron sizes:** section = `10px`, sub-item = `9px`. No exceptions.

**Promise chain pattern (Phase 3 fix):** no `setTimeout` for sequencing.
All dependent data loads use `.then()` chains off actual fetch promises.

---

## §2 — INPUTS

| File | Purpose |
|------|---------|
| `accord-minutes.js` | Phase 3 output — extend with 4 sections |
| `accord-live-capture.js` | Reference — section patterns, badge styles |

---

## §3 — DELIVERABLES

1. `accord-minutes.js` — extended with all four consolidated sections
2. Operator review checkpoint before Phase 5

---

## §4 — BUILD SPEC

### 4.0 — Shared node row pattern

All four sections share the same row structure:

```
[badge]  [summary text]    [meta]    [× on hover]
```

**Badge:** `font-size:10px; font-weight:700; padding:0 5px; border-radius:2px; border:1px solid; line-height:1.5; flex-shrink:0; margin-top:3px`

**Summary:** `font-size:13px; color:var(--hi); flex:1; line-height:1.5`
Inline edit: `contenteditable="true"`.
On blur: if changed → PATCH `accord_nodes.summary` + `AND meeting_id=[current]` (IR73).
Wait for server confirm before any DOM update (IR71).

**× delete (hover reveal):**
`font-size:11px; opacity:0; transition:opacity .12s`
Row hover → `opacity:1`.
Click → PATCH `accord_nodes.status='deleted'` (IR73 WHERE guard).
On confirm: row `opacity:.35`, summary `text-decoration:line-through`.

**+ Add row (bottom of each section body, always visible):**
```
[text input]  [+ button]
```
Enter key or button click → INSERT (see per-section spec below).
After INSERT: append row to list from INSERT response. Do not re-query.
Clear input on success.

---

### 4.1 — Decisions section

**Header:**
```
[4px var(--dcn) bar]  DECISIONS    [+ Add]    [▾ 10px]
```

**Load:**
```javascript
// SELECT node_id, seq_id, tag, summary, created_by, created_at, effective_date
// FROM accord_nodes
// WHERE meeting_id = [current] AND tag = 'decision'
//   AND (status IS NULL OR status != 'deleted')
// ORDER BY created_at ASC
```

**Row layout:**
```
[DC-018 badge]  [summary]    [author · time]  [×]
```
Badge: purple (`var(--dcn-bg)/var(--dcn)/var(--dcn-bd)`)
Meta: `font-size:11px; color:var(--lo)` — author name + formatted time

**+ Add INSERT:**
```javascript
{
  firm_id:        Accord.state.firm.id,
  meeting_id:     _meeting.meeting_id,
  agenda_item_id: null,
  thread_id:      null,
  tag:            'decision',
  summary:        [input value],
  body:           null,
  created_by:     Accord.state.resource.id,
  discipline:     null,
  topic:          null
}
```
Badge shows `seq_id` from INSERT response.

---

### 4.2 — Action Items section

**Header:**
```
[4px var(--act) bar]  ACTION ITEMS    [+ Add]    [▾ 10px]
```
Count badge: `N assigned · X overdue` — overdue badge red if X > 0.

**Load:**
```javascript
// SELECT node_id, seq_id, tag, summary, body, created_by, created_at, due_date, status
// FROM accord_nodes
// WHERE meeting_id = [current] AND tag = 'action'
//   AND (status IS NULL OR status != 'deleted')
// ORDER BY created_at ASC
```
Parse `body` as JSON for `{ assignee_name, assignee_resource_id }`.

**Row layout:**
```
[AX-011 badge]  [summary]    [owner chip]  [due date]  [status chip]  [×]
```
Badge: amber (`var(--act-bg)/var(--act)/var(--act-bd)`)
Owner chip: `font-size:11px; color:var(--lo)` — from body JSON `assignee_name`
  or "Unassigned" if null
Due date: `font-size:11px; color:var(--act)` if future; `color:var(--rsk)` if overdue
Status chip: Open (amber) · Overdue (red) · Done (green `var(--nt)`)
  Overdue = `due_date < today AND status != 'closed'`

**Click-to-edit popup (on row click, not badge):**
Small inline popup below row:
- Task text (pre-populated from `summary`)
- Assignee: `window.PersonPicker.show()` — pre-populated from body JSON
- Due date: `<input type="date">` — pre-populated from `due_date`
- Status select: Open / Done
On confirm: PATCH `summary`, `body` (JSON), `due_date`, `status` (IR73).

**+ Add INSERT:**
```javascript
{
  firm_id:        Accord.state.firm.id,
  meeting_id:     _meeting.meeting_id,
  agenda_item_id: null,
  thread_id:      null,
  tag:            'action',
  summary:        [input value],
  body:           null,   // assignee added via edit popup after add
  created_by:     Accord.state.resource.id,
  discipline:     null,
  topic:          null
}
```

---

### 4.3 — Risks & Dissents section

**Header:**
```
[4px var(--rsk) bar]  RISKS & DISSENTS    [+ Add]    [▾ 10px]
```

**Load:**
```javascript
// SELECT node_id, seq_id, tag, summary, body, created_by, created_at
// FROM accord_nodes
// WHERE meeting_id = [current] AND tag IN ('risk', 'dissent')
//   AND (status IS NULL OR status != 'deleted')
// ORDER BY created_at ASC
```
Parse `body` as JSON for `{ severity }`.

**Row layout:**
```
[RK-005 / DS-005 badge]  [summary]    [severity chip]  [author]  [×]
```
RK badge: red (`var(--rsk-bg)/var(--rsk)/var(--rsk-bd)`)
DS badge: same red
Severity chip: Low (amber) · Medium (amber) · High (red) — from body JSON.
  Omit chip if severity null.

**+ Add INSERT:**
```javascript
{
  firm_id:        Accord.state.firm.id,
  meeting_id:     _meeting.meeting_id,
  agenda_item_id: null,
  thread_id:      null,
  tag:            'risk',
  summary:        [input value],
  body:           null,
  created_by:     Accord.state.resource.id,
  discipline:     null,
  topic:          null
}
```

---

### 4.4 — Parking Lot section

**Header:**
```
[4px #9478e0 bar]  PARKING LOT    [+ Add]    [▾ 10px]
```

**Load:**
```javascript
// SELECT node_id, seq_id, tag, summary, created_by, created_at, agenda_item_id
// FROM accord_nodes
// WHERE meeting_id = [current] AND tag = 'question'
//   AND (status IS NULL OR status != 'deleted')
// ORDER BY created_at ASC
```

**Row layout:**
```
[● dot]  [summary]    [source item if agenda_item_id set]  [×]
```
Dot: `width:6px; height:6px; border-radius:50%; background:#9478e0; flex-shrink:0`
Source: if `agenda_item_id` is non-null, show the agenda item title in dim text
  (`font-size:11px; color:var(--lo)`). Resolve title from already-loaded agenda items.

**+ Add INSERT:**
```javascript
{
  firm_id:        Accord.state.firm.id,
  meeting_id:     _meeting.meeting_id,
  agenda_item_id: null,
  thread_id:      null,
  tag:            'question',
  summary:        [input value],
  body:           null,
  created_by:     Accord.state.resource.id,
  discipline:     null,
  topic:          null
}
```

---

### 4.5 — Sections nav count updates

After loading each section, update the corresponding sidebar nav count badge:
- Decisions: count of DC nodes loaded
- Action Items: `N assigned · X overdue` (X = overdue count)
- Risks & Dissents: count of RK + DS nodes
- Parking Lot: count of question nodes

---

### 4.6 — IR47 verification

Before any INSERT into `accord_nodes` from this phase, confirm
`discipline` and `topic` columns exist (added CMD-ACCORD-LIVE-CAPTURE-1 Phase 2).
Run once at module init:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'accord_nodes'
AND column_name IN ('discipline', 'topic');
```
Expected: 2 rows. If 0 rows, omit those fields from all INSERTs.
Surface finding in delivery.

---

## §5 — IRON RULE REMINDERS

**IR47:** Verify `discipline`/`topic` columns on `accord_nodes` before INSERT.

**IR71:** All PATCHes wait for server confirm. No optimistic DOM mutation
except: append new row on INSERT (append-only, safe).

**IR73:** Every `accord_nodes` PATCH includes `AND meeting_id = [current]`
in the filter clause.

**No INSERT into `accord_meeting_outcomes`** — trigger blocks it on closed meetings.

---

## §6 — FILE ORDER

1. `accord-minutes.js` — full file with all four sections added

Then: operator review note.
Then: §7 checklist verbatim. Stop.

---

## §7 — PHASE 4 CHECKLIST

- [ ] IR47: discipline/topic columns verified and finding surfaced
- [ ] Decisions section renders, collapses/expands, 10px chevron
- [ ] Decisions load DC nodes filtered by meeting_id, excluding deleted
- [ ] Decision row: badge (purple) · summary · author/time · × on hover
- [ ] Decision summary contenteditable — blur PATCHes (IR73)
- [ ] Decision × soft-deletes via status PATCH — row fades + strikethrough
- [ ] Decision + Add inserts, seq_id appears from server response
- [ ] Action Items section renders, collapses/expands, 10px chevron
- [ ] Action Items load AX nodes with overdue calculation
- [ ] Overdue count badge red when X > 0
- [ ] Action row: badge (amber) · summary · owner · due · status chip · ×
- [ ] Due date red if overdue, amber if future
- [ ] Action click-to-edit popup: pre-populated summary, assignee, due, status
- [ ] Action edit PATCH fires on confirm (IR71, IR73)
- [ ] Action + Add inserts correctly
- [ ] Risks & Dissents section renders, collapses/expands, 10px chevron
- [ ] Risks load RK + DS nodes
- [ ] Risk row: correct badge per tag · severity chip if present · ×
- [ ] Risk + Add inserts with tag='risk'
- [ ] Parking Lot section renders, collapses/expands, 10px chevron
- [ ] Parking Lot loads question nodes
- [ ] Source agenda item title shows when agenda_item_id set
- [ ] Parking Lot + Add inserts with tag='question'
- [ ] All four section nav counts update after load
- [ ] No INSERT attempted on accord_meeting_outcomes
- [ ] _excludedNodeIds Set covers all four sections (Exclude available)
- [ ] `var` only — no `let`/`const`

---

**Ship it.**
