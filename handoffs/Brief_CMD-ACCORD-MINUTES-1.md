# Brief · CMD-ACCORD-MINUTES-1
## Minutes Surface — Review, Edit, Route + Send

**Track:** M (Minutes)
**CMD:** M-01 · CMD-ACCORD-MINUTES-1
**Operator:** Vaughn Staples
**Architect:** Claude
**Status:** Awaiting operator ratification
**Reference mockup:** `accord_mockup_p8_minutes.html` (locked 2026-05-19)

---

## §1 — Purpose

Build the Minutes surface for closed meetings. The surface allows the
organizer to review, edit, and distribute the meeting record after a
meeting transitions to `state='closed'`.

The Minutes surface replaces the existing "Minutes" tab in the 5-tab
closed-meeting shell. It is the primary post-meeting deliverable surface.

---

## §2 — Reference mockup summary

The locked mockup (`accord_mockup_p8_minutes.html`) defines:

### Topbar (persistent)
- `accord.` logo · state badge (Under Review / Ready to Send / Sent) ·
  meeting title + "· Minutes"
- Preview → button (read-only render, deferred)
- Route + Send ↑ button — disabled until all checklist items checked;
  enabled when ready; transitions to Sent state after confirm

### Sidebar (fixed width 240px)
Three sections, all labels identical size (11px / font-weight:700 / --hi):

**Review Checklist** (6 items):
1. Meeting header
2. Attendance confirmed
3. Agenda entries checked
4. Outcomes reviewed
5. Decisions verified
6. Actions confirmed

All 6 must be checked for Route + Send to enable.

**Sections** — jump nav to canvas sections (scroll-to on click):
Meeting Header · Intended Outcomes · Agenda & Captures · Decisions ·
Action Items · Risks & Dissents · Parking Lot

**Recipients** — attendee list with checkboxes (pre-populated from
`accord_meeting_attendees`); + Add external recipient link

### Canvas (scrollable document)
- Meeting title (`26px / font-weight:600`) — always persistent above
  "Meeting Details" collapse
- **Meeting Details** — collapsible section: stakes · date · duration ·
  organizer · workstream · attended chips · absent chips · Edit button
- **Intended Outcomes** — collapsible; + Add button; each row:
  status flag (✓ Met / Partial / Unmet) · text · owner; × delete on hover
- **Agenda & Captures** — collapsible; each agenda item independently
  collapsible with amber + Add button; entries show tag badge · text ·
  author · time; Exclude button on hover (strikes entry from send)
- **Decisions** — collapsible; + Add button; rows: DC badge · text ·
  author/time; × delete on hover; click entry to edit
- **Action Items** — collapsible; + Add button; rows: AX badge · text ·
  owner · due; × delete on hover; click entry to edit
- **Risks & Dissents** — collapsible; + Add button; rows: RK/DS badge ·
  text · status
- **Parking Lot** — collapsible; + Add button; rows: text · source

**Route + Send modal:**
- Recipient list (pre-populated, toggleable)
- External email input
- Note about excluded entries
- Send Minutes ↑ button → writes `accord_minutes_recipients` rows,
  updates `accord_minutes_renders` status

---

## §3 — Entry point

The Minutes surface renders when `accord_meetings.state = 'closed'`.

**Current routing:** `accord-views.js:renderMeetingView()` at the state
branch — same swap point used by Live Capture for `state='running'`.
The `state='closed'` branch currently renders the 5-tab closed shell.
This CMD replaces that branch with the new Minutes surface.

The swap is a single additional branch at `accord-views.js:~394` —
same pattern as Live Capture Phase 3.

---

## §4 — Substrate

### 4.1 — Existing tables (read)
- `accord_meetings` — title, stakes, scheduled_for, duration_minutes,
  organizer_id, workstream_id, state
- `accord_meeting_outcomes` — verb, description, owner_resource_id, status
- `accord_agenda_items` — title, position, status
- `accord_nodes` — tag, summary, seq_id, created_by, created_at,
  agenda_item_id, due_date, body (for assignee), effective_date
- `accord_meeting_attendees` — resource_id, rsvp_status
- `resources` — name (for display)

### 4.2 — Write targets
- `accord_nodes` — PATCH (edit summary, tag) + INSERT (+ Add in any section)
- `accord_meeting_outcomes` — PATCH (status) + INSERT (+ Add outcome)
- `accord_minutes_renders` — INSERT on Route + Send (render record)
- `accord_minutes_recipients` — INSERT per recipient on Route + Send
  (append-only send log — added CMD-ACCORD-LIVE-CAPTURE-1 Phase 2)

### 4.3 — IR47 verifications required (Phase 1)
1. `accord_minutes_renders` columns — confirm exact schema before INSERT
2. `accord_minutes_recipients` columns — confirm exact schema before INSERT
3. `accord_meeting_outcomes.status` CHECK constraint — confirm valid values
   before PATCH
4. `accord_nodes.tag` constraint — confirm all tag values before INSERT
   from Minutes surface

---

## §5 — Architectural constraints

- **`var` only** — no `let`/`const`
- **Iron Rules 36–73** — full force
- **IR47** — verify all FK targets and column names before using
- **IR71** — no optimistic state mutation; all edits wait for server confirm
- **IR72** — Minutes surface must not break any event contracts from
  Live Capture; no new events required
- **IR73** — all node PATCHes include `AND meeting_id = [current]`
- **Outfit font** — Minutes surface uses Outfit (same as Live Capture)
- **Style Doctrine v1.8 §3.8** — Accord palette
- **`--lo: #7a8a9a`** — Iron Rule (typography minimum); no readable text
  below this color

---

## §6 — Phase plan

### Phase 1 — Investigation
**Deliverable:** Written findings only. No code.

1. Locate `accord-views.js:renderMeetingView()` closed-state branch.
   Confirm swap point — same pattern as Live Capture.
2. Confirm `accord_minutes_renders` exact column list (IR47).
3. Confirm `accord_minutes_recipients` exact column list (IR47).
4. Confirm `accord_meeting_outcomes.status` CHECK constraint values.
5. Confirm `accord_nodes.tag` constraint values (cross-check with
   Live Capture Phase 4 finding: `note|decision|action|risk|question|dissent`).
6. Confirm `accord_meeting_attendees` columns for recipient pre-population.
7. IR72 survey: does any module subscribe to `state='closed'` transition
   events that the new surface must continue to honor?
8. Confirm whether `accord_minutes_renders` INSERT requires a PDF render
   or whether a simple record row is sufficient for v1.
9. Identify any CSS token conflicts between Minutes palette and existing
   closed-meeting shell.

Halt-and-surface if: `accord_minutes_renders` requires a PDF generation
pipeline not yet built; or if the closed-state branch has undocumented
dependencies beyond the 5-tab shell.

---

### Phase 2 — Shell + topbar + sidebar
**Deliverable:** Minutes shell renders for closed meetings. Topbar and
sidebar wired to live data.

1. New shell module `accord-minutes.js` — `AccordMinutes.render(meeting)`
2. Branch in `accord-views.js` for `state='closed'` → `AccordMinutes.render()`
3. Topbar: state badge, meeting title, Preview (disabled), Route + Send
   (disabled until checklist complete)
4. Sidebar: Review Checklist (all 6 items, toggleable); Sections nav
   (jump-to only this phase); Recipients list from `accord_meeting_attendees`
5. Checklist → Route + Send gate: all 6 checked enables button, updates
   state badge to "Ready to Send"
6. `AccordMinutes.destroy()` — teardown on `accord:level-changed`

Operator review checkpoint before Phase 3.

---

### Phase 3 — Canvas: Meeting Header + Outcomes + Agenda
**Deliverable:** Top three canvas sections render with live data and
inline editing.

1. Meeting title (persistent, always visible above Meeting Details)
2. Meeting Details collapsible — stakes, date/time, duration, organizer,
   workstream, attended/absent chips; Edit button (deferred — display only)
3. Intended Outcomes — collapsible; load from `accord_meeting_outcomes`;
   status flags (Met/Partial/Unmet) from `outcome.status`; + Add (INSERT);
   × delete on hover; click-to-edit (inline contenteditable)
4. Agenda & Captures — collapsible; per-item sub-collapsible with amber
   + Add button; entries from `accord_nodes` WHERE `agenda_item_id` matches;
   Exclude toggle (strikes entry, excludes from send); tag badges per type
5. Sections nav in sidebar now live (scroll-to + highlight)

Operator review checkpoint before Phase 4.

---

### Phase 4 — Canvas: Decisions + Actions + Risks + Parking Lot
**Deliverable:** Four consolidated sections with edit and add.

1. **Decisions** — load `accord_nodes WHERE tag='decision' AND meeting_id=current`;
   DC badge · text · author/time; + Add (INSERT); × delete on hover;
   click-to-edit (PATCH summary)
2. **Action Items** — AX badge · text · owner · due; + Add (INSERT with
   assignee + due date); × delete; click-to-edit
3. **Risks & Dissents** — RK/DS badge · text · severity; + Add; × delete;
   click-to-edit
4. **Parking Lot** — text · source agenda item; + Add; × delete; click-to-edit
5. All × deletes: soft delete (status='deleted' PATCH) not hard DELETE
6. All INSERTs: `meeting_id`, `firm_id`, `created_by`, correct `tag`,
   `discipline`/`topic` left NULL

Operator review checkpoint before Phase 5.

---

### Phase 5 — Route + Send flow
**Deliverable:** Full send flow wired end-to-end.

1. Route + Send modal: recipient list (pre-populated, toggleable),
   external email input, excluded entries note
2. On Send confirm:
   - INSERT `accord_minutes_renders` (render record)
   - INSERT `accord_minutes_recipients` per recipient (append-only)
   - State badge → "Sent · [timestamp]"
   - Route + Send button → "Sent ✓" (disabled)
3. IR47: verify both table schemas before INSERT
4. External recipient validation: basic email format check before INSERT
5. Excluded entries: tracked client-side; not written to DB; excluded
   `node_id` list passed to render record as JSON in `template_id` or
   equivalent field (confirm column in Phase 1)

---

### Phase 6 — Closure
**Deliverable:** Smoke test, 8-archetype walkthrough, version pin, seal.

1. Full smoke test (checklist in §9)
2. 8-archetype walkthrough
3. IR65: operator notified to bump `version.js`
4. CMD seal

---

## §7 — Out of scope

- PDF generation / actual email delivery (v1 records intent; email
  delivery infrastructure is a separate CMD)
- Preview mode (button renders but is disabled)
- Minutes for meetings in `state='running'` or `state='idle'`
- NRA display in Minutes canvas
- `discipline`/`topic` assignment (Knowledge Base CMD scope)
- Outcome ratification state machine (CMD-ACCORD-OUTCOME-RATIFICATION-1)

---

## §8 — Successor CMDs

After M-01 seals:
1. **CMD-ACCORD-KNOWLEDGE-BASE-1** — Knowledge Base tab on Workstream Detail
2. **CMD-ACCORD-MY-MEETINGS-1** — My Meetings center canvas (P2)
3. **CMD-ACCORD-MINUTES-EMAIL-1** — Actual email delivery infrastructure

---

## §9 — Test plan (Phase 6 checklist)

- [ ] Closed meeting routes to Minutes surface (not 5-tab shell)
- [ ] Running/idle meetings unaffected — no regression
- [ ] Topbar: state badge, title, Preview (disabled), Route + Send (disabled)
- [ ] Checklist: all 6 items toggle correctly
- [ ] All 6 checked → Route + Send enables, badge → "Ready to Send"
- [ ] Sections nav scrolls to correct section on click
- [ ] Recipients loaded from `accord_meeting_attendees`
- [ ] Meeting title persistent above Meeting Details
- [ ] Meeting Details collapses/expands
- [ ] Intended Outcomes load from `accord_meeting_outcomes`
- [ ] Status flags correct (Met/Partial/Unmet)
- [ ] Outcome + Add inserts row, appears without re-query
- [ ] Outcome × delete soft-deletes, disappears from canvas
- [ ] Agenda items load in position order, each independently collapsible
- [ ] Agenda entries load per item from `accord_nodes`
- [ ] Exclude toggle strikes entry; excluded entry omitted from send
- [ ] Decisions section loads DC nodes for meeting
- [ ] Decision + Add inserts, seq_id appears from server response
- [ ] Decision × delete soft-deletes
- [ ] Click decision → inline edit → PATCH fires on blur/confirm
- [ ] Action Items load AX nodes with owner and due date
- [ ] Action + Add with assignee + due date inserts correctly
- [ ] Risks load RK/DS nodes with severity
- [ ] Parking Lot loads question nodes
- [ ] Route + Send modal opens when button enabled
- [ ] Recipient toggles work; unchecked recipient excluded from INSERT
- [ ] External email field accepts valid email
- [ ] Send confirm: `accord_minutes_renders` INSERT fires
- [ ] Send confirm: `accord_minutes_recipients` INSERT per recipient
- [ ] Badge → "Sent · [timestamp]"; button → "Sent ✓" disabled
- [ ] `AccordMinutes.destroy()` fires on level-changed
- [ ] `var` only — no `let`/`const`

---

*End of Brief · CMD-ACCORD-MINUTES-1*
*Operator: Vaughn Staples · Architect: Claude · 2026-05-19*
