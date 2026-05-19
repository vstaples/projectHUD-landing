# HANDOFF — CMD-ACCORD-MINUTES-1 · Phase 3: Canvas — Meeting Header + Outcomes + Agenda

**Date:** 2026-05-19
**CMD:** M-01 · CMD-ACCORD-MINUTES-1
**Operator:** Vaughn Staples
**Phase:** 3 of 6 — Top three canvas sections wired to live data with inline editing.

---

## §0 — PRE-FLIGHT

Read `Brief_CMD-ACCORD-MINUTES-1.md` end-to-end before proceeding.
Read Phase 1 and Phase 2 findings in full — both carry forward.
Session protocol: terse mode; test Chrome connection first; Test Mode after
each code update — one checklist item at a time.
Iron Rules 36, 40 §1, 47, 64, 71, 72, 73 apply.
`var` only — no `let`/`const`.
Deliver in §6 file order, then operator review note, then §7 checklist. Stop.

---

## §1 — CARRY-FORWARD

**Outcome status mapping (Phase 1):**
Surface → DB: Met = `achieved` · Partial = `partial` · Unmet = `abandoned`
Valid status values: `open | achieved | partial | carried | abandoned`

**Chevron size (corrected from brief):**
Section chevrons: `font-size:10px` — matching Live Capture `ac-lc-sec-chevron`.
Sub-item chevrons: `font-size:9px` — matching `ac-lc-item-chevron`.
Do NOT use 20px. The brief spec was incorrect.

**`accord_nodes.tag` values:** `note|decision|action|risk|question|dissent`

**`accord_meeting_attendees`:** Two-query pattern for name resolution.
`resources.name` confirmed (C-03 V1).

---

## §2 — INPUTS

| File | Purpose |
|------|---------|
| `accord-minutes.js` | Phase 2 output — extend with canvas sections |
| `accord-live-capture.js` | Reference — node rendering patterns, badge styles |

---

## §3 — DELIVERABLES

1. `accord-minutes.js` — extended with Meeting Header, Outcomes, Agenda sections
2. Operator review checkpoint before Phase 4

---

## §4 — BUILD SPEC

### 4.1 — Meeting title + stakes (persistent, above all sections)

```
[26px / font-weight:600 / --hi]  C-11 Percolate Smoke Test Meeting
[13px / italic / --md / border-left:3px solid var(--b2)]  Stakes text
```

Always visible. Never collapses. Sourced from `meeting.title` and
`meeting.stakes`. If `stakes` is null, omit the stakes line entirely.

---

### 4.2 — Meeting Details section (collapsible)

**Header:**
```
[4px var(--md) bar]  MEETING DETAILS    [Edit]    [▾ 10px]
```
Edit button: renders, disabled for now (`opacity:.5; pointer-events:none`).
Deferred to a future CMD.

**Body (collapsed by default):**

```
Date        Saturday, May 17, 2026
Duration    60 minutes · 1:28 PM – 2:31 PM
Organizer   Vaughn Staples
Workstream  C-11 Test Workstream
```

Meta grid: `display:grid; grid-template-columns:auto 1fr; gap:4px 16px`
Labels (`date`, `duration`, `organizer`, `workstream`):
`font-size:12px; color:var(--lo); font-weight:600`
Values: `font-size:13px; color:var(--hi)`

**Attended chips:**
Label: `ATTENDED` (`11px / uppercase / --lo`)
Avatar chips: `border-radius:20px; background:var(--raised); border:1px solid var(--b1)`
Avatar: `20px` circle, initials from `resources.name`
Name: `12px / --hi`
Role suffix (organizer only): `· Organizer` (`11px / --lo`)

**Absent chips:**
Label: `INVITED · DID NOT JOIN`
Same chip style at `opacity:.45`

**Data sources:**
- `meeting.scheduled_for` → format as `DayOfWeek, Month DD, YYYY`
- `meeting.duration_minutes` → `N minutes`
- `meeting.started_at` + `meeting.ended_at` → `H:MM AM – H:MM AM`
  If `ended_at` null: omit time range
- `meeting.organizer_id` → resolve via `resources WHERE user_id = organizer_id`
  (organizer_id is auth.users FK — confirmed C-04)
- `meeting.workstream_id` → resolve via `workstreams WHERE workstream_id = [id]`
- `accord_meeting_attendees` already loaded in Phase 2 — reuse

---

### 4.3 — Intended Outcomes section (collapsible)

**Header:**
```
[4px var(--dec) bar]  INTENDED OUTCOMES    [+ Add]    [▾ 10px]
```
Count badge: `N set · N met` (compute from outcomes array).

**Load:**
```javascript
// SELECT outcome_id, verb, description, owner_resource_id, status, position
// FROM accord_meeting_outcomes
// WHERE meeting_id = [current]
// ORDER BY position ASC
```
Resolve `owner_resource_id` names from already-loaded attendee resource map.

**Each outcome row:**
```
[status flag]  [description text]    [owner name]  [× on hover]
```

Status flag chip:
- `achieved` → `✓ Met` (green: `var(--nt-bg) / var(--nt) / var(--nt-bd)`)
- `partial` → `Partial` (amber: `var(--act-bg) / var(--act) / var(--act-bd)`)
- `abandoned` → `Unmet` (red: `var(--rsk-bg) / var(--rsk) / var(--rsk-bd)`)
- `open` → `Open` (dim: `var(--raised) / var(--md) / var(--b1)`)
- `carried` → `Carried` (dim same as open)

Description text: `font-size:13px; color:var(--hi); flex:1`
Inline edit: `contenteditable="true"` on description span.
On blur: if text changed, PATCH `accord_meeting_outcomes.description`.

Owner name: `font-size:11px; color:var(--lo); flex-shrink:0`

**× delete (hover reveal):**
Appears on row hover. Click → PATCH `status='abandoned'` (soft delete —
do not hard DELETE). Row fades to `opacity:.35` and description gets
`text-decoration:line-through`. Does not remove from DOM.

**+ Add outcome:**
```
[text input: "Describe an intended outcome…"]  [Add →]
```
INSERT `accord_meeting_outcomes`:
```javascript
{
  firm_id:           Accord.state.firm.id,
  meeting_id:        _meeting.meeting_id,
  description:       [input value],
  verb:              'INFORM',   // default; editable later
  status:            'open',
  position:          [max position + 1],
  created_by:        Accord.state.resource && Accord.state.resource.id
}
```
**IR47:** Confirm `created_by` column exists on `accord_meeting_outcomes`
before INSERT. Schema inventory shows it as nullable FK → users(id).
If missing from actual schema, omit it.

After INSERT: append row to outcomes list. Do not re-query.

---

### 4.4 — Agenda & Captures section (collapsible)

**Header:**
```
[4px var(--md) bar]  AGENDA & CAPTURES    [+ Add item (amber)]    [▾ 10px]
```
+ Add item button: amber (`var(--act-bg)/var(--act)/var(--act-bd)`) — deferred,
renders but disabled this phase. Phase 4 scope.

**Load agenda items:**
```javascript
// SELECT agenda_item_id, title, position, status
// FROM accord_agenda_items
// WHERE meeting_id = [current]
// ORDER BY position ASC
```

**Per agenda item — collapsed:**
```
[▶ 9px]  [N]  [item title]              [+ Add (amber, disabled)]
```
Item number: `width:24px; height:24px; border-radius:50%; background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.13); font-size:12px; color:var(--hi)`
Title: `font-size:14px; font-weight:500; color:var(--hi)`

**Per agenda item — expanded:**
Load entries:
```javascript
// SELECT node_id, seq_id, tag, summary, created_by, created_at
// FROM accord_nodes
// WHERE meeting_id = [current]
//   AND agenda_item_id = [this item's id]
// ORDER BY created_at ASC
```

Each captured entry row:
```
[tag badge]  [summary text]    [author name]  [time]  [Exclude on hover]
```

Tag badge: `font-size:10px; font-weight:700; padding:0 5px; border-radius:2px; border:1px solid; line-height:1.5`
Colors by tag:
- note → green (`var(--nt-bg)/var(--nt)/var(--nt-bd)`)
- decision → purple (`var(--dcn-bg)/var(--dcn)/var(--dcn-bd)`)
- action → amber (`var(--act-bg)/var(--act)/var(--act-bd)`)
- risk/dissent → red (`var(--rsk-bg)/var(--rsk)/var(--rsk-bd)`)
- question → purple (`var(--dcn-bg)/var(--dcn)/var(--dcn-bd)`)

Summary: `font-size:13px; color:var(--hi); flex:1`
Author: `font-size:11px; color:var(--lo)`
Time: `font-size:11px; color:var(--lo)` — format as `H:MM AM`

**Exclude toggle (hover reveal):**
Button label: `Exclude` (red, small).
On click: toggle excluded state on the entry.
Excluded state: `opacity:.35; text-decoration:line-through on summary`.
Exclusion is client-side only — tracked in a local `_excludedNodeIds` Set.
Not written to DB. Passed to Route + Send flow in Phase 5.

**+ Add capture (per agenda item):**
Amber button `+ Add` in item header — disabled this phase (Phase 4 scope).

**Sections nav count update:**
After loading agenda items, update the Agenda nav count badge with total
item count.

---

## §5 — IRON RULE REMINDERS

**IR47:** Confirm `accord_meeting_outcomes.created_by` column exists before
INSERT. If absent, omit from INSERT payload.

**IR71:** All PATCHes wait for server confirmation before updating DOM.
Exception: Exclude toggle is client-side only — no PATCH.

**IR73:** All `accord_meeting_outcomes` PATCHes include
`AND meeting_id = [current]` in the filter.

---

## §6 — FILE ORDER

1. `accord-minutes.js` — full file with Meeting Header, Outcomes, Agenda added

Then: operator review note.
Then: §7 checklist verbatim. Stop.

---

## §7 — PHASE 3 CHECKLIST

- [ ] Meeting title renders at 26px / font-weight:600 / --hi, always visible
- [ ] Stakes line renders italic / --md / left border; absent if null
- [ ] Meeting Details section collapses/expands with 10px chevron
- [ ] Date formatted correctly from scheduled_for
- [ ] Duration formatted correctly from duration_minutes
- [ ] Started_at / ended_at time range renders; omitted if ended_at null
- [ ] Organizer name resolved from resources via user_id
- [ ] Workstream name resolved from workstreams table
- [ ] Attended chips render with avatar initials + name + Organizer suffix
- [ ] Absent chips render at opacity:.45
- [ ] Intended Outcomes section collapses/expands with 10px chevron
- [ ] Outcomes load from accord_meeting_outcomes in position order
- [ ] Status flags correct: achieved=Met(green), partial=Partial(amber), abandoned=Unmet(red), open=Open(dim)
- [ ] Owner name resolves from resource map
- [ ] Description contenteditable — blur triggers PATCH if changed
- [ ] IR47: created_by presence confirmed before outcome INSERT
- [ ] Outcome + Add inserts with correct fields, row appears without re-query
- [ ] Outcome × (hover) soft-deletes via status PATCH, row fades + strikethrough
- [ ] Agenda & Captures section collapses/expands with 10px chevron
- [ ] Agenda items load in position order
- [ ] Each item independently collapses/expands with 9px chevron
- [ ] Captured entries load per item from accord_nodes
- [ ] Tag badges correct color per type
- [ ] Author and time render correctly
- [ ] Exclude toggle: click strikes/restores entry (client-side only)
- [ ] Excluded node IDs tracked in _excludedNodeIds Set
- [ ] Sections nav Outcomes and Agenda counts update after load
- [ ] IR73: outcome PATCHes include meeting_id filter
- [ ] `var` only — no `let`/`const`

---

**Ship it.**
