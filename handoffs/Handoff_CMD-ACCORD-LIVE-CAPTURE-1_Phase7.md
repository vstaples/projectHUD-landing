# HANDOFF — CMD-ACCORD-LIVE-CAPTURE-1 · Phase 7: Closure

**Date:** 2026-05-18
**CMD:** L-01 · CMD-ACCORD-LIVE-CAPTURE-1
**Operator:** Vaughn Staples
**Phase:** 7 of 7 — Smoke test, 8-archetype walkthrough, deferred item re-verification, version pin, CMD seal.

---

## §0 — PRE-FLIGHT

Read `Brief_CMD-ACCORD-LIVE-CAPTURE-1.md` end-to-end before proceeding.
Session protocol: terse mode; begin by testing Claude in Chrome; debug via Chrome before console pastes; Test Mode after each fix — one checklist item at a time.
Iron Rules 36, 40 §1, 47, 64, 65, 67, 72, 73 apply.
No new features. No scope additions. Fix only what the checklist surfaces.
Deliver in §6 file order, then §7 checklist verbatim. Stop.

---

## §1 — DEFERRED ITEMS FROM PHASE 6

These three items were code-verified but not live-tested. Must be verified in a running meeting before CMD seals:

| Item | Description |
|------|-------------|
| 14 | Status bar loaded with prior workstream meetings (non-blocking) |
| 15 | Current meeting chip highlighted in status bar |
| 16 | Decision/action count badges on chips where counts > 0 |

Use the cloned meeting `e8606d7e-9a49-447a-a2eb-5f32e1759d3c` (C-11 Percolate Smoke Test Meeting (Clone)) for live verification. Start the meeting, confirm items 14-16, then proceed to full smoke test.

---

## §2 — INPUTS

Request the following files from the operator:

| File | Purpose |
|------|---------|
| `accord-live-capture.js` | Phase 6 output — fix only if smoke test surfaces issues |
| `accord-core.js` | Reference only — do not modify unless smoke test requires |

---

## §3 — DELIVERABLES

1. `accord-live-capture.js` — patched only if smoke test surfaces defects
2. Full smoke test results (pass/fail per item)
3. 8-archetype walkthrough results
4. CMD seal declaration

---

## §4 — SMOKE TEST SEQUENCE

Run in order. One item at a time. Confirm pass/fail before proceeding.
Use the cloned meeting for all live tests.

**Shell + topbar:**
1. Navigate to cloned meeting → start → Live Capture shell renders (not 5-tab shell)
2. Topbar: logo, LIVE pill, meeting title, progress bar, timer, END MEETING visible
3. Timer counting up from `started_at`
4. Meeting Setup shell (idle state) still renders correctly — no regression

**Sidebar:**
5. Sidebar renders with resize handle; drag resizes correctly
6. Sections nav renders all 5 links
7. Live attendees loaded with presence dots
8. Team chat: history loads, send works (Enter + button), incoming messages appear

**Agenda section:**
9. Agenda section renders with sticky header and collapse toggle
10. Prior meeting action items strip renders (collapsible)
11. Agenda items render as accordion in position order
12. Active item (first pending) shows Active badge
13. Expand item → History sub-section collapsed by default
14. History entries render: date · badge · text
15. "No prior history" shown when thread_id is NULL
16. Add Note zone: amber tint, Shift+Enter and + ADD both commit
17. NT node INSERT: seq_id appears on committed badge
18. `accord.node.committed` broadcast (second participant sees node appear)
19. Reclassify popup: opens on badge click, all 5 types listed
20. Reclassify to AX: assignee + due date fields present, PATCH fires
21. Reclassify to DC: effective date field present, PATCH fires
22. Reclassify to RK: severity field present, PATCH fires
23. Mark discussed (complete): progress bar updates, next item becomes active
24. Skip item (in_progress): item shows skipped state
25. `accord.agenda.changed` broadcast on status PATCH

**Consolidated sections:**
26. Decisions section: renders collapsed, sticky header, count badge
27. Decision INSERT via add row: badge appears with seq_id
28. Action Items: table layout, PersonPicker for assignee, date picker for due
29. Action INSERT: row appears with correct owner + due date
30. Overdue calculation correct (due_date < today, status != closed)
31. Risks section: renders, severity chip on entries
32. Risk INSERT: row appears
33. Parking Lot: renders, INSERT fires with tag='question'
34. Sections nav: clicking link scrolls to section + highlights nav item
35. Clicking child item (agenda item, action row) highlights correct nav item
36. Remote node routes to correct section on receipt

**Status bar (deferred items 14-16):**
37. Prior workstream meetings appear as chips in status bar
38. Current meeting chip highlighted (cyan border)
39. Decision/action count badges on chips where counts > 0

**End Meeting:**
40. END MEETING button enabled and visible
41. Click → confirmation modal appears
42. Cancel → modal closes, no state change
43. Confirm → PATCH fires, state transitions to closed
44. `accord:level-changed` dispatched → closed shell renders
45. `destroy()` fires → filmstrip hide style tag removed
46. Progress bar shows all segments filled on confirm

**Regressions:**
47. No 5-tab shell visible during running state
48. `accord-capture.js:178` does not throw on `accord:meeting-loaded`

---

## §5 — 8-ARCHETYPE WALKTHROUGH (IR67)

After smoke test passes, walk through these 8 archetypes. Each must reach the Add Note zone and commit at least one node without error:

| # | Archetype | Scenario |
|---|-----------|---------|
| 1 | Solo organizer | Single attendee, 1 agenda item, commit NT, mark discussed, end meeting |
| 2 | Two attendees | Organizer + 1 participant; remote node appears for organizer |
| 3 | No prior history | Fresh thread_id=NULL item — "No prior history" renders |
| 4 | Prior history | Agenda item with thread_id — history entries load |
| 5 | All node types | Commit NT, reclassify to DC, AX, RK, parking lot in sequence |
| 6 | Overdue actions | Prior meeting with overdue AX — strip renders with red pill |
| 7 | Skip + discussed mix | Mark item 1 discussed, skip item 2, end meeting |
| 8 | Chat active | Send 3 chat messages during capture; messages persist |

Archetypes 2 and 6 require test data. If not available, mark as "data not available — deferred" and note in seal.

---

## §6 — STATUS CONSTRAINT DOCUMENTATION (Phase 4 close-out)

Per Phase 4 finding: `accord_agenda_items.status` CHECK allows `pending`, `in_progress`, `complete` only.
Brief specified `discussed`/`skipped` — these do not exist.
Confirmed canonical mapping: `complete` = discussed, `in_progress` = skipped.
**Document this explicitly in the CMD seal note.** No migration required.

---

## §7 — CMD SEAL

After all smoke test items pass and 8-archetype walkthrough completes:

1. Document any deferred items with rationale
2. Document status constraint mapping (§6 above)
3. IR65: notify operator to bump `version.js` — operator-managed
4. Declare CMD sealed with date

Seal declaration format:
```
CMD-ACCORD-LIVE-CAPTURE-1 — SEALED [date]
Operator: Vaughn Staples
Phases: 1–7 complete
Deferred: [list any items deferred with CMD reference]
Status constraint: accord_agenda_items complete=discussed, in_progress=skipped (no migration)
Version pin: operator-managed (IR65)
Successor CMDs: CMD-ACCORD-MINUTES-1 · CMD-ACCORD-KNOWLEDGE-BASE-1 · CMD-ACCORD-MY-MEETINGS-1
```

---

## §8 — FILE ORDER

1. `accord-live-capture.js` — patched file if any defects found, otherwise "no changes required"

Then: smoke test results summary (pass count / total / deferred).
Then: 8-archetype results.
Then: CMD seal declaration.
Then: §7 checklist verbatim. Stop.

---

## §9 — PHASE 7 CHECKLIST

- [ ] Claude in Chrome connection tested at session start
- [ ] Deferred items 14-16 verified in live running meeting
- [ ] All 48 smoke test items pass or explicitly deferred with rationale
- [ ] 8-archetype walkthrough complete (unavailable archetypes noted)
- [ ] Status constraint mapping documented in seal note
- [ ] No new features added this phase
- [ ] IR65: operator notified to bump version.js
- [ ] CMD seal declaration written in correct format
- [ ] Successor CMDs listed in seal

---

**Ship it.**
