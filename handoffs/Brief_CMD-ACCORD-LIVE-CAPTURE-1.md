# Brief · CMD-ACCORD-LIVE-CAPTURE-1
## Live Capture Surface — Running Meeting Shell Replacement

**Track:** L (Live Capture)
**CMD:** L-01 · CMD-ACCORD-LIVE-CAPTURE-1
**Operator:** Vaughn Staples
**Architect:** Claude
**Status:** Awaiting operator ratification
**Reference mockup:** `live_capture_hybrid.html` (locked 2026-05-17)

---

## §1 — Purpose

Replace the existing production running-meeting 5-tab shell with the Live Capture surface
designed in the 2026-05-17 design session. The new surface is a two-column layout
(sidebar + scrollable document canvas) built on Outfit font, matching the Meeting Setup
visual language. It is the primary capture surface during a running meeting.

This is a **surface replacement**, not an additive feature. The existing 5-tab shell is
retired when this CMD seals.

---

## §2 — Reference mockup summary

The locked mockup defines the following structure:

### Topbar (persistent)
- Accord logo · Live pill (pulsing) · Meeting title
- Progress bar: 3 agenda segments (done / active / todo)
- Elapsed timer (live, counting from `started_at`)
- End Meeting button → triggers `state: running → closed`

### Sidebar (resizable — Iron Rule)
- **Sections nav** — jump links to canvas sections (Agenda, Decisions, Actions, Risks, Parking Lot)
- **Live Attendees** — presence dots (on/off) + avatar + name + "you" tag; Ron White "not joined" at .45 opacity
- **Team Chat** — bubble-style, sunken viewport (`rgba(72,170,136,.025)` background, green border), left bubbles for others, right blue bubbles for self; Enter sends

### Canvas (scrollable document)
Sticky section headers with colored left bar + collapse chevron + count badge.

**Agenda section:**
- Action items strip (prior meeting open/overdue, collapsible)
- Per agenda item accordion:
  - Collapsed: title + chevron + Active badge (current item only)
  - Expanded: History (collapsible, all node types from prior meetings) + "Captured this meeting" label + entry list + Add Note zone
  - History entries: single row — date · tag badge · text
  - Captured entries: single row — tag badge · text · author · time
  - Add Note zone: amber-tinted textarea (4 lines min), highlights on focus, Shift+Enter or + ADD button commits as NT, badge click → reclassify popup
  - Reclassify popup: Note / Decision / Action / Risk / Parking Lot with conditional fields

**Decisions section** (collapsed by default, sticky header)
**Action Items section** (collapsed by default, table layout)
**Risks & Issues section** (collapsed by default)
**Parking Lot section** (collapsed by default)

Each section has a live add input at the bottom.

### Status bar (persistent)
Prior meeting chips from workstream filmstrip.

---

## §3 — Substrate changes required

### 3.1 — New columns (migrations this CMD)

| Table | Column | Type | Purpose |
|---|---|---|---|
| `accord_nodes` | `discipline` | `TEXT NULL` | Knowledge Base top-level grouping (Option A; free text) |
| `accord_nodes` | `topic` | `TEXT NULL` | Knowledge Base sub-topic grouping (Option A; free text) |
| `accord_meetings` | `cloned_from_meeting_id` | `UUID NULL FK → accord_meetings(meeting_id)` | Composer clone mechanic (deferred surface; substrate ships here) |

### 3.2 — New table

```sql
accord_minutes_recipients (
  recipient_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id         UUID NOT NULL FK → firms(id),
  render_id       UUID NOT NULL FK → accord_minutes_renders(render_id),
  resource_id     UUID NULL FK → resources(id),   -- internal recipient
  external_email  TEXT NULL,                        -- external recipient
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_one_recipient CHECK (
    (resource_id IS NOT NULL) != (external_email IS NOT NULL)
  )
)
```

RLS: SELECT/INSERT firm_id = my_firm_id(). No UPDATE or DELETE (send log is append-only).

### 3.3 — Existing substrate confirmed sufficient

- `accord_nodes` (tag, summary, body, seq_id, agenda_item_id, thread_id, created_by, due_date, status, sealed_at)
- `accord_agenda_items` (status: pending|discussed|skipped, position, pulled_from_node_id)
- `accord_meetings` (state: idle|running|closed, started_at, ended_at)
- `accord_meeting_attendees` (resource_id, rsvp_status — for live presence)
- `accord_nras` + `accord_nras_current` (NRA badges on nodes)
- `workstreams` (for filmstrip status bar)

---

## §4 — Architectural constraints

- **`var` only** — no `let`/`const` in surface JavaScript (existing project convention)
- **Iron Rules 36–73** — full force
- **IR47** — verify all FK targets via `information_schema` before declaring; do not trust inventory
- **IR65** — version pin bump at CMD seal; operator-managed
- **IR71** — no state mutation before invalidation; DOM re-queried after async
- **IR73** — disjoint per-transition UPDATE RLS where state machines apply
- **Outfit font** — surface uses Outfit (matches Meeting Setup shell; distinct from 5-tab production palette)
- **Style Doctrine v1.8 §3.8** — Accord palette discipline; Live surface uses production amber/signal palette

---

## §5 — Phase plan

### Phase 1 — Investigation
**Deliverable:** Written findings only. No code.

1. Locate and read the existing running-meeting shell: entry point, file(s), DOM structure, JS event model, how `Accord.startMeeting()` transitions to it.
2. Inventory all JS that touches `accord_nodes` INSERT during a running meeting (capture sites).
3. Confirm `accord_agenda_items` status transition path (pending → discussed trigger).
4. Confirm `accord_meeting_attendees` query pattern for live presence (how presence is currently derived).
5. Confirm team chat substrate — is there a dedicated table or is it an `accord_nodes` tag variant?
6. IR72 cross-module survey: does any other module subscribe to running-meeting events that the new surface must continue to emit?
7. IR47 verification: confirm `accord_nodes` columns `discipline` and `topic` do NOT yet exist (pre-migration confirmation).
8. Identify any CSS token conflicts between the 5-tab shell palette and the Outfit/Live Capture palette.
9. Surface any traps specific to replacing (vs. augmenting) the existing shell.

Halt-and-surface if: existing shell has undocumented state machines, the chat substrate doesn't exist (requires new table), or `Accord.startMeeting()` is entangled with the 5-tab shell in ways that require transition path surgery.

---

### Phase 2 — Substrate migrations
**Deliverable:** Migration SQL + RLS policies for §3.1 and §3.2.

1. `accord_nodes.discipline TEXT NULL` — migration + `COMMENT ON COLUMN`
2. `accord_nodes.topic TEXT NULL` — migration + `COMMENT ON COLUMN`
3. `accord_meetings.cloned_from_meeting_id UUID NULL` — migration + FK + `COMMENT ON COLUMN`
4. `accord_minutes_recipients` — full table + RLS (SELECT/INSERT firm-scoped, append-only)
5. IR47 verification queries included in migration file as comments
6. No surface changes this phase

---

### Phase 3 — Shell skeleton + topbar + sidebar
**Deliverable:** New running-meeting shell renders. Topbar and sidebar wired to live data.

1. New shell file/component registered at `Accord.startMeeting()` transition point
2. Topbar: logo, live pill, meeting title (from `accord_meetings.title`), progress bar (3 segments from agenda item statuses), elapsed timer (from `accord_meetings.started_at`), End Meeting button (disabled until Phase 6)
3. Sidebar: sections nav (jump-to anchors, not yet live), live attendees from `accord_meeting_attendees` (presence dot = rsvp_status='accepted'; absent = invited but not present), "you" tag via `auth.uid()` match
4. Team chat: bubble UI, message send wired (substrate path per Phase 1 finding)
5. Sidebar resize handle — Iron Rule

Operator review checkpoint before Phase 4.

---

### Phase 4 — Agenda canvas section
**Deliverable:** Agenda section renders with live capture, history, and reclassify.

1. Sticky section header (Agenda, colored bar, collapse chevron, item count)
2. Action items strip — prior meeting open/overdue nodes, collapsible
3. Per-agenda-item accordion:
   - Header: title, chevron, Active badge for current item
   - History toggle: queries `accord_nodes` WHERE `thread_id` matches prior meetings, all tags, single-row entries
   - "Captured this meeting" label + entries from `accord_nodes` WHERE `meeting_id = current` AND `agenda_item_id = this item`
   - Add Note zone: amber textarea, Shift+Enter or + ADD commits NT node INSERT
   - Reclassify popup: reclassify via PATCH `accord_nodes.tag` with conditional field capture (assignee/due_date for AX, effective_date for DC, severity for RK)
4. Node seq_id display: `NT-032`, `DC-018` etc. from `accord_nodes.seq_id`
5. NRA badge on nodes where `accord_nras_current` returns a live NRA

Operator review checkpoint before Phase 5.

---

### Phase 5 — Decisions, Actions, Risks, Parking Lot sections
**Deliverable:** All four consolidated sections render below Agenda with live add.

1. **Decisions** — list of `accord_nodes` WHERE `tag='decision'` AND `meeting_id=current`; collapsed default; sticky header; + Record input at bottom
2. **Action Items** — table layout: Owner · Task · Due · Status; rows from `accord_nodes` WHERE `tag='action'` AND `meeting_id=current`; + Assign input row at bottom
3. **Risks & Issues** — list of `accord_nodes` WHERE `tag='risk' OR tag='dissent'` AND `meeting_id=current`; + Flag input
4. **Parking Lot** — list of `accord_nodes` WHERE `tag='question'` AND `meeting_id=current` (parking lot uses question tag per schema); + Defer input
5. All section adds INSERT to `accord_nodes` with correct `tag`, `meeting_id`, `firm_id`, `created_by`
6. Sections nav in sidebar now live (scroll-to on click)

---

### Phase 6 — End Meeting flow + status bar
**Deliverable:** Full meeting lifecycle closure. Status bar wired.

1. End Meeting button enabled; click → confirmation modal → `accord_meetings.state` PATCH to `'closed'`, `ended_at` = now()
2. Post-close transition: route to Minutes surface (CMD-ACCORD-MINUTES-1 scope; for now, route to workstream detail)
3. Status bar: prior meetings from workstream as chip strip — `accord_meetings` WHERE `workstream_id = current` AND `state = 'closed'` ORDER BY `sealed_at` DESC
4. Progress bar: live-updating from `accord_agenda_items.status` (pending=todo, discussed=done, skipped=dim)

---

### Phase 7 — Closure
**Deliverable:** Full smoke test, 8-archetype walkthrough (IR67), version pin.

1. Full smoke: start meeting → capture NT/DC/AX/RK → reclassify → expand history → end meeting
2. 8-archetype walkthrough (IR67)
3. Verify no regressions in Meeting Setup shell transition
4. IR65: version pin bump (operator-managed)
5. CMD seal

---

## §6 — Test plan (Phase 7 checklist)

- [ ] `Accord.startMeeting()` renders Live Capture shell (not 5-tab shell)
- [ ] Topbar timer increments from `started_at`
- [ ] Live attendees reflect `accord_meeting_attendees` rsvp_status
- [ ] Team chat sends and receives
- [ ] Sidebar resize handle functional
- [ ] Agenda items expand/collapse independently
- [ ] History entries show all node types from prior meetings via thread_id
- [ ] NT node inserts via Add Note zone with Shift+Enter and + ADD button
- [ ] Reclassify popup patches `accord_nodes.tag` correctly for all 5 types
- [ ] AX node captures assignee in `accord_nodes.body` / `due_date`
- [ ] DC node inserts with `effective_date` where provided
- [ ] Decisions section renders meeting's DC nodes
- [ ] Action Items table renders meeting's AX nodes
- [ ] Risks section renders meeting's RK/DS nodes
- [ ] Parking Lot renders meeting's question nodes
- [ ] End Meeting patches `accord_meetings.state = 'closed'`, sets `ended_at`
- [ ] Status bar chips show prior workstream meetings
- [ ] `accord_nodes.discipline` and `accord_nodes.topic` columns exist (Phase 2 migration confirmed)
- [ ] `accord_minutes_recipients` table exists with correct RLS (append-only)
- [ ] No 5-tab shell remnants visible

---

## §7 — Out of scope

- Minutes surface (CMD-ACCORD-MINUTES-1; separate CMD)
- Knowledge Base surface (CMD-ACCORD-KNOWLEDGE-BASE-1; separate CMD)
- AI-powered briefing or node synthesis (Track X)
- `discipline`/`topic` UI in Live Capture (columns ship, UI deferred to Knowledge Base CMD)
- `cloned_from_meeting_id` UI (column ships, Composer clone UI deferred)
- NRA declaration from within Live Capture (NRA surface already ships separately; integration deferred)

---

## §8 — Successor CMDs

After L-01 seals:
1. **CMD-ACCORD-MINUTES-1** — Minutes surface (Review + Route + Send)
2. **CMD-ACCORD-KNOWLEDGE-BASE-1** — Knowledge Base tab on Workstream Detail
3. **CMD-ACCORD-MY-MEETINGS-1** — My Meetings center canvas (P2)

---

*End of Brief · CMD-ACCORD-LIVE-CAPTURE-1*
*Operator: Vaughn Staples · Architect: Claude · 2026-05-17*
