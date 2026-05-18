# HANDOFF — CMD-ACCORD-LIVE-CAPTURE-1 · Phase 5: Decisions, Actions, Risks, Parking Lot

**Date:** 2026-05-17
**CMD:** L-01 · CMD-ACCORD-LIVE-CAPTURE-1
**Operator:** Vaughn Staples
**Phase:** 5 of 7 — Four consolidated canvas sections wired to live data.

---

## §0 — PRE-FLIGHT

Read `Brief_CMD-ACCORD-LIVE-CAPTURE-1.md` end-to-end before proceeding.
Read Phase 1 findings and Phase 4 close-out findings in full — both carry forward.
Iron Rules 36, 40 §1, 47, 64, 71, 72, 73 apply.
Terse output discipline. Deliver in §6 file order, then §7 checklist verbatim. Stop.

---

## §1 — CARRY-FORWARD

**Phase 4 close-out findings — architect dispositions:**

1. **Status constraint** — `accord_agenda_items.status` CHECK allows
   `pending`, `in_progress`, `complete` only. `discussed`/`skipped` do not exist.
   Confirmed mapping (no migration): `complete` = discussed, `in_progress` = skipped.
   This is canonical. Document in Phase 7 seal. Do not add new constraint values.

2. **Assignee field** — must use `window.PersonPicker.show()` not plain text input.
   `person-picker.js` is loaded. Use this for all assignee fields this phase.

3. **Due date field** — calendar picker widget on click. Use the platform date
   picker if available; otherwise `<input type="date">` styled to match shell.

4. **`Prefer: return=representation`** — IR47 item: confirm this header is present
   in the API layer before any PATCH that reads the response body. Surface finding
   in delivery.

5. **Popup defaults** — all reclassify/edit opens must pre-populate fields from
   existing node data (tag, summary, assignee, due_date, severity etc.).

**Phase 1 carry-forward:**
- `accord.node.committed` must be broadcast on every node INSERT
- `accord:remote-node` must update the correct canvas section when received
- `Prefer: return=representation` needed for seq_id on PATCH response
- `var` only — no `let`/`const`

---

## §2 — INPUTS

Request the following files from the operator:

| File | Purpose |
|------|---------|
| `accord-live-capture.js` | Phase 4 output — extend with 4 new sections |
| `person-picker.js` | PersonPicker API — read before wiring assignee fields |
| `accord-capture.js` | Confirm `accord.node.committed` broadcast pattern |

---

## §3 — DELIVERABLES

1. `accord-live-capture.js` — extended with all four consolidated sections
2. Operator review checkpoint

---

## §4 — BUILD SPEC

All four sections follow the same structural pattern as Agenda:
- Sticky section header: colored left bar · label · count badge · collapse chevron
- Collapsed by default (Agenda is the primary working surface)
- Sections nav in sidebar now live — clicking a link scrolls to section and
  briefly highlights the header
- Live add input at the bottom of each section body

### 4.1 — Shared INSERT pattern

All node INSERTs this phase:
```javascript
{
  firm_id:        Accord.state.firm.id,
  meeting_id:     Accord.state.meeting.meeting_id,
  agenda_item_id: null,          // consolidated sections are not agenda-scoped
  thread_id:      null,
  tag:            '[section tag]',
  summary:        [input value],
  body:           null,          // section-specific fields go here as JSON
  created_by:     Accord.state.resource.id
  // discipline, topic: do NOT write — leave NULL
}
```

After INSERT: append returned node to section list (use INSERT response, not re-query).
Broadcast `accord.node.committed` to meeting channel.

On `accord:remote-node`: route to correct section by `tag` field.
If section is collapsed: increment count badge only. Do not auto-expand.

**IR47:** Confirm `Prefer: return=representation` header before any INSERT/PATCH
that reads the response body. Surface finding explicitly in delivery.

---

### 4.2 — Decisions section

**Header:** purple (`--dcn`) left bar · `DECISIONS` · `[N] recorded` badge

**List row layout:**
```
[DC-018 badge]  [decision text]                    [author · time]
```
- Badge: purple background, `border-radius: 2px`, click opens edit popup
- Text: `font-size: 13px`, `color: var(--hi)`, wraps if long
- Author + time: right-aligned, `font-size: 11px`, `color: var(--lo)`

**Add input row** (bottom of section, always visible when expanded):
```
[text input: "Describe a decision made in this meeting…"]  [Record → button]
```
Enter key or button click: INSERT with `tag: 'decision'`.

**Edit popup** (click badge):
- Pre-populate: `summary` field
- Fields: Decision text (textarea) · Effective date (date picker, optional)
- PATCH: `summary`, `effective_date` (if set)
- Badge updates to `updated.seq_id` from PATCH response

---

### 4.3 — Action Items section

**Header:** amber (`--act`) left bar · `ACTION ITEMS` · `[N] assigned · [X] overdue` badge
Overdue badge: red (`--rsk`) background when X > 0.

**Table layout:**
```
Owner    |  Task                              |  Due       |  Status
---------|------------------------------------|-----------|---------
[av] VS  |  Execute NDA with Nimbletronics…   |  May 22    |  [Open ●]
```
- `Owner` col: avatar initials + name, resolved via `accord_meeting_attendees`
- `Due` col: formatted date or "—"
- `Status` chip: Open (amber) · Overdue (red) · Done (green)
- Overdue = `due_date < today AND status != 'closed'`

**Add row** (below table):
```
[task input]  [PersonPicker: Assignee]  [date picker: Due]  [+ Assign button]
```
- Assignee: `window.PersonPicker.show()` — on select, display avatar + name
- Due date: `<input type="date">` with calendar picker on click
- INSERT: `tag: 'action'`, `body: JSON.stringify({ assignee_resource_id, assignee_name })`,
  `due_date: [selected date]`

**Edit popup** (click badge):
- Pre-populate: summary, assignee (from body JSON), due_date, status
- Fields: Task text · Assignee (PersonPicker) · Due date · Status (Open/Done)
- PATCH: `summary`, `body`, `due_date`, `status`

---

### 4.4 — Risks & Issues section

**Header:** red (`--rsk`) left bar · `RISKS & ISSUES` · `[N] flagged` badge

**List row:**
```
[RK-005 badge]  [risk text]                          [severity chip]  [author]
```
- Severity chip: Low (amber) · Medium (amber) · High (red)
- Dissent nodes (`tag: 'dissent'`) also appear here with `[DS-005]` badge

**Add row:**
```
[text input: "Describe a risk or issue…"]  [severity select: Low/Med/High]  [+ Flag button]
```
- INSERT: `tag: 'risk'`, `body: JSON.stringify({ severity })`

**Edit popup:**
- Pre-populate: summary, severity (from body JSON)
- Fields: Risk text · Severity (Low / Medium / High select)
- PATCH: `summary`, `body`

---

### 4.5 — Parking Lot section

**Header:** purple (`#9478e0`) left bar · `PARKING LOT` · `[N] deferred` badge

**List row:**
```
[● dot]  [item text]                                [source agenda item]
```
- Dot: purple `#9478e0`
- Source: if `agenda_item_id` is set, show the agenda item title in dim text

**Add row:**
```
[text input: "Defer an item to the parking lot…"]  [+ Defer button]
```
- INSERT: `tag: 'question'` (parking lot uses question tag per schema)
- `agenda_item_id`: null (parking lot items are meeting-level, not agenda-scoped)

**Edit popup:**
- Pre-populate: summary
- Fields: Item text only
- PATCH: `summary`

---

### 4.6 — Sections nav activation

Sidebar sections nav links (from Phase 3) now scroll to section on click.
Use `element.scrollIntoView({ behavior: 'smooth', block: 'start' })`.
Add brief highlight pulse (100ms background flash) on the section header after scroll.

Active nav link: highlight the link whose section header is nearest the top
of the canvas viewport. Use `IntersectionObserver` on all five section headers.

---

### 4.7 — Count badge updates

Each section header count badge must update in real-time:
- On local INSERT: increment count immediately
- On `accord:remote-node`: increment count for correct section
- On PATCH that changes `status` to closed: decrement open count in Action Items

Overdue recalculation: run on section expand and on `accord:remote-node`.
Do not poll — calculate from existing loaded data only.

---

## §5 — IRON RULE REMINDERS

**IR47:**
1. Confirm `Prefer: return=representation` header in API layer — surface finding.
2. Confirm `tag: 'question'` is a valid `accord_nodes.tag` constraint value for
   parking lot before INSERT. Run:
   ```sql
   SELECT conname, consrc FROM pg_constraint
   WHERE conrelid = 'accord_nodes'::regclass AND contype = 'c';
   ```
   Surface finding explicitly.

**IR71:** No optimistic status updates on Action Item status PATCH.
Wait for server confirmation before updating status chip.

**IR72:** `accord.node.committed` must broadcast for every INSERT across all
four sections. Pattern from `accord-capture.js:450`.

**IR73:** All `accord_nodes` PATCHes must include `AND meeting_id = [current]`
in the WHERE clause.

**`var` only** — no `let`/`const`.

---

## §6 — FILE ORDER

1. `accord-live-capture.js` — full file with all four sections added

Then: operator review note (what to confirm before Phase 6).
Then: §7 checklist verbatim. Stop.

---

## §7 — PHASE 5 CHECKLIST

- [ ] IR47: `Prefer: return=representation` header confirmed and surfaced
- [ ] IR47: `tag: 'question'` constraint value verified for parking lot INSERT
- [ ] Decisions section renders, collapsed by default, sticky header
- [ ] Decisions list rows: badge · text · author/time
- [ ] Decisions add row: text input + Record button, Enter key fires
- [ ] Decision INSERT writes `tag: 'decision'`, broadcasts `accord.node.committed`
- [ ] Decision edit popup pre-populates summary + effective_date
- [ ] Decision PATCH updates badge seq_id from response
- [ ] Action Items section renders with table layout
- [ ] Action Items add row: PersonPicker for assignee, date picker for due date
- [ ] Action Items INSERT writes correct fields including body JSON
- [ ] Action Items overdue calculation correct (due_date < today, status != closed)
- [ ] Action Items overdue count badge shows red when X > 0
- [ ] Action Items edit popup pre-populates all fields including assignee + due date
- [ ] Action Items status PATCH waits for server confirmation (IR71)
- [ ] Risks section renders with severity chips
- [ ] Risks add row: text + severity select + Flag button
- [ ] Risks INSERT writes `tag: 'risk'` with body JSON severity
- [ ] Risks edit popup pre-populates summary + severity
- [ ] Parking Lot renders with purple dot rows
- [ ] Parking Lot INSERT writes `tag: 'question'`
- [ ] Parking Lot edit popup pre-populates summary
- [ ] All four section count badges update on local INSERT
- [ ] All four sections update on `accord:remote-node` (count badge if collapsed)
- [ ] Sections nav scrolls to correct section on click with highlight pulse
- [ ] `accord.node.committed` broadcast on all INSERTs (IR72)
- [ ] All PATCHes include `AND meeting_id = [current]` (IR73)
- [ ] `var` only — no `let`/`const` in new code
- [ ] Agenda section no regression

---

**Ship it.**
