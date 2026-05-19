# Brief · CMD-ACCORD-KNOWLEDGE-BASE-1
## Knowledge Base — Workstream Detail Tab

**Track:** K (Knowledge Base)
**CMD:** K-01 · CMD-ACCORD-KNOWLEDGE-BASE-1
**Operator:** Vaughn Staples
**Architect:** Claude
**Status:** Awaiting operator ratification
**Reference mockup:** `accord_mockup_p7_knowledge_base.html` (locked 2026-05-19)

---

## §1 — Purpose

Build the Knowledge Base tab on the Workstream Detail page. The Knowledge Base
is a read-only aggregated view of all `accord_nodes` captured across all meetings
in a workstream, organized by `discipline` → `topic` → entry, with filter pills
for node type (All / Decisions / Action Items / Risks / Notes).

This is a **read surface only**. No node editing, no INSERT. The discipline and
topic columns are populated separately (future CMD). For now the surface renders
nodes grouped by `discipline` and `topic` values, with ungrouped fallback for
nodes where both are NULL.

---

## §2 — Entry point

The Knowledge Base is a **tab on the Workstream Detail page** — same page that
shows the meeting cards list. The tab bar sits between the workstream title row
and the stats tiles.

Tabs: **Meetings** (default, existing) · **Knowledge Base** (new)

Clicking Knowledge Base tab loads `AccordKnowledgeBase.render(workstreamId)`
into the center content area, replacing the meeting cards list.
Clicking Meetings tab restores the existing meeting cards view.

---

## §3 — Mockup summary

### Filter bar (top)
Pills: All · Decisions · Action Items · Risks · Notes
"All meetings ▾" dropdown (filter by specific meeting — v1 renders all)

### Workspace header
Workstream name · `Knowledge accumulated across N meetings · [date range]`
Stats row: Decisions count · Actions open count · Risk/Dissent count · Notes count

### Canvas — "All" view (default)
Discipline blocks — each is a collapsible card with colored left border:
- Electrical Engineering → blue (`--dec`)
- Vendor Management → purple (`--dcn`)
- Mechanical Engineering → amber (`--act`)
- Software Integration → green (`--nt`)
- **Ungrouped** → gray (nodes where `discipline IS NULL`)

Each discipline block header:
```
[▾] [Discipline name]    [N topics]  [N entries]  [last: date]
```

Within each discipline — topic rows (collapsible):
```
[▾] [Topic name]    [N entries]  [last: date]  [N meetings]
```

Within each topic — entry rows:
```
[date]  [badge]  [summary text]
               [author]  [meeting chip]
```

### Flat filter views (Decisions / Actions / Risks)
When a type filter is active: flat list of matching nodes across all disciplines,
grouped by status (Active / With dissent / Overdue / Open / Closed / Mitigated).
Each entry: `[badge]  [summary]  [author]  [date]  [meeting chip]  [status]`

### Status bar (bottom)
Meeting timeline chips — prior meetings in workstream as scrollable chip strip.
Active meeting highlighted.

---

## §4 — Substrate

All reads from `accord_nodes`:

```javascript
// Load all nodes for workstream
// SELECT n.node_id, n.seq_id, n.tag, n.summary, n.created_by,
//        n.created_at, n.meeting_id, n.discipline, n.topic,
//        n.due_date, n.status, n.body
// FROM accord_nodes n
// JOIN accord_meetings m ON n.meeting_id = m.meeting_id
// WHERE m.workstream_id = [workstream_id]
//   AND (n.status IS NULL OR n.status != 'deleted')
// ORDER BY n.created_at DESC
```

Additional queries:
- `accord_meetings WHERE workstream_id = [id] AND state IN ('closed','sealed')`
  for meeting chips + date range + count
- `resources WHERE id = in.(...)` for author name resolution
- `accord_meetings.title` for meeting chip labels

**`discipline` and `topic` are nullable** — nodes where both are NULL go into
an "Ungrouped" discipline block at the bottom of the All view.

**No writes.** No INSERT, UPDATE, or DELETE from this surface.

---

## §5 — Architectural constraints

- **`var` only** — no `let`/`const`
- **Iron Rules 36–73** — full force
- **IR47** — verify `accord_nodes.discipline` and `accord_nodes.topic` exist
  before querying (confirm in Phase 1)
- **No `setTimeout` for sequencing** — `.then()` chains only
- **Outfit font + Accord palette** — same vars as Live Capture
- **`--lo: #7a8a9a`** — Iron Rule typography minimum
- **Chevron sizes** — section: `10px`, sub-item: `9px`

---

## §6 — Phase plan

### Phase 1 — Investigation
**Deliverable:** Written findings only. No code.

1. Locate Workstream Detail page render in `accord-views.js` — find where
   meeting cards list renders and confirm tab injection point.
2. IR47: confirm `accord_nodes.discipline` and `accord_nodes.topic` columns exist.
3. Confirm `accord_nodes.status` valid values — specifically confirm `'deleted'`
   is used for soft deletes (per CMD-ACCORD-MINUTES-1 v2).
4. Confirm `accord_meetings.state` valid values for closed meeting filter.
5. Check whether a `resources` name resolution pattern is already established
   in `accord-views.js` for reuse.
6. Identify any CSS conflicts with the existing Workstream Detail page styles.

---

### Phase 2 — Shell + tab wiring + header
**Deliverable:** Knowledge Base tab appears. Header and stats render.

1. New module `accord-knowledge-base.js` — `AccordKnowledgeBase.render(wsId)`
2. Tab bar added to Workstream Detail page (`accord-views.js` — tab injection only)
3. Clicking Knowledge Base tab: hides meeting list, renders KB canvas
4. Clicking Meetings tab: restores meeting list, destroys KB canvas
5. Workspace header: workstream name, meeting count, date range, stats row
6. Stats row: load node counts by tag for the workstream
7. Filter pills render (non-functional this phase — All active, others disabled)
8. Status bar: meeting timeline chips from closed/sealed meetings

---

### Phase 3 — Discipline/topic hierarchy (All view)
**Deliverable:** Full hierarchical canvas renders with live data.

1. Load all nodes for workstream — group client-side by discipline → topic
2. Nodes where `discipline IS NULL` → "Ungrouped" block
3. Discipline blocks: colored left border per discipline, collapsible, sticky header
4. Topic rows: collapsible, entry count, last date, meeting count
5. Entry rows: date · badge · summary · author · meeting chip
6. Entry list: `3px` left bracket, `.40` opacity, discipline color, `border-radius:6px 0 0 6px`
7. Badge colors: DC=purple, NT=green, AX=amber, RK/DS=red, Q=purple
8. Meeting chip: meeting title truncated, links to that meeting (deferred — display only)
9. Collapse/expand all disciplines and topics independently

---

### Phase 4 — Flat filter views
**Deliverable:** Decisions / Action Items / Risks filter views render.

1. Filter pill click → switch from hierarchy view to flat list view
2. **Decisions:** grouped by Active / With dissent — DC nodes only
3. **Action Items:** grouped by Overdue / Open / Closed — AX nodes with
   owner (from body JSON), due date, status chip
4. **Risks:** grouped by Open / Mitigated — RK + DS nodes with severity chip
5. Notes pill: returns to All view filtered to NT nodes only (hierarchy remains)
6. "All meetings ▾" dropdown: filter all views to a single meeting

---

### Phase 5 — Closure
**Deliverable:** Smoke test, seal.

---

## §7 — Out of scope

- Writing `discipline` or `topic` values (future CMD)
- Clicking meeting chip navigates to meeting (display only in v1)
- Export or print
- Search within Knowledge Base (future CMD)
- Editing nodes from Knowledge Base

---

## §8 — Test plan (Phase 5 checklist)

- [ ] Knowledge Base tab appears on Workstream Detail page
- [ ] Clicking tab switches to KB view; clicking Meetings restores cards
- [ ] Workspace header: correct workstream name, meeting count, date range
- [ ] Stats row: correct counts per type
- [ ] IR47: discipline/topic columns confirmed
- [ ] Discipline blocks render with correct colors
- [ ] Ungrouped block renders for NULL discipline nodes
- [ ] Topics collapse/expand within each discipline
- [ ] Entry rows: date · badge · summary · author · meeting chip
- [ ] Entry list left bracket: `.40` opacity, discipline color, border-radius
- [ ] Decisions filter: flat list, Active/With dissent grouping
- [ ] Action Items filter: Overdue/Open/Closed grouping, owner + due date
- [ ] Risks filter: Open/Mitigated grouping, severity chip
- [ ] Status bar: meeting chips render, correct count
- [ ] No writes — surface is read-only
- [ ] Running/idle meetings unaffected — no regression
- [ ] `var` only — no `let`/`const`

---

*End of Brief · CMD-ACCORD-KNOWLEDGE-BASE-1*
*Operator: Vaughn Staples · Architect: Claude · 2026-05-19*
