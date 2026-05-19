# Brief · CMD-ACCORD-MINUTES-1 (Revised)
## Minutes — Review Mode Extension of Live Capture

**Track:** M (Minutes)
**CMD:** M-01 · CMD-ACCORD-MINUTES-1
**Revision:** v2 — 2026-05-19
**Operator:** Vaughn Staples
**Architect:** Claude
**Status:** Awaiting operator ratification
**Supersedes:** CMD-ACCORD-MINUTES-1 v1 (separate surface approach — abandoned)

---

## §1 — Design decision

Minutes is not a separate surface. It is **Live Capture in review mode.**

When END MEETING fires and `accord_meetings.state` transitions to `closed`,
the Live Capture shell remains mounted. The transition is a **sidebar swap**:
- Live Attendees + Team Chat → Review Checklist + Sections + Recipients
- LIVE pill → "Under Review" state badge
- Timer stops
- END MEETING button → disabled
- All capture capabilities remain: + Add, reclassify, expand/collapse, exclude

The operator reviews the record in the same environment where it was captured.
At any point they can click Preview to see the clean outbound document.
When the checklist is complete, Route + Send distributes the record.

`accord-minutes.js` is abandoned. All work extends `accord-live-capture.js`.

---

## §2 — Reference

Left screenshot: Live Capture running state (P6 Live Capture shell).
Right screenshot: same shell in review mode — sidebar swapped, state badge
changed, all canvas content identical.

---

## §3 — What changes on END MEETING

### Topbar
- LIVE pill → state badge: "Under Review" (amber) / "Ready to Send" (green) /
  "Sent · [time]" (blue)
- Timer → stops, shows final elapsed time
- END MEETING button → disabled (`opacity:.35; pointer-events:none`)
- Preview → button → enabled (was disabled during live)
- Route + Send ↑ button → appears (was not present during live)

### Sidebar — swaps entirely
Live mode sidebar (Sections nav + Live Attendees + Team Chat) is hidden.
Review mode sidebar renders in its place:

**REVIEW CHECKLIST** (same 11px/700/--hi label style)
Six items with circular toggles:
1. Meeting header
2. Attendance confirmed
3. Outcomes reviewed
4. Agenda entries checked
5. Decisions verified
6. Actions confirmed
All 6 checked → Route + Send enables + badge → "Ready to Send"

**SECTIONS** (same nav as Live Capture sections nav)
Jump links: Agenda · Decisions · Action Items · Risks & Issues · Parking Lot
Active state tracks canvas scroll position (same IntersectionObserver pattern).

**RECIPIENTS**
Load from `accord_meeting_attendees WHERE meeting_id = [current]`.
Resolve names via `resources?id=in.(...)`.
Each row: avatar + name + checkbox (checked by default).
`+ Add external recipient…` link.

### Canvas — unchanged
All sections remain exactly as captured. No content locked or hidden.
All existing affordances remain:
- Section collapse/expand
- + Add in each section
- × soft-delete on nodes
- Exclude toggle on agenda entries
- Reclassify popup on badges
- Sections nav highlighting

---

## §4 — New capabilities added in review mode

### Preview
Clicking Preview → opens a modal or right-panel overlay showing the clean
outbound document — formatted minutes without review chrome (no checklist,
no sidebar, no exclude buttons). Excluded nodes omitted.
Preview is read-only. Close returns to review mode.
**v1 scope:** render from current in-memory data. No PDF generation.

### Route + Send modal
Same spec as CMD-ACCORD-MINUTES-1 v1 Phase 5:
- Recipient list (pre-populated from sidebar, toggleable)
- External email input (comma-separated, validated)
- Excluded entries count note
- Send Minutes ↑ → `_getOrCreateRender()` → INSERT `accord_minutes_recipients`
  per recipient → success state

---

## §5 — Substrate

Same as v1 — no changes. `accord_minutes_renders` and `accord_minutes_recipients`
confirmed in Phase 2 migrations (CMD-ACCORD-LIVE-CAPTURE-1).

`accord_minutes_renders` INSERT approach (Phase 1 finding disposition):
Read existing render record by `meeting_id` first. If found, use it.
If not found, INSERT stub with `status='pending'`.

`accord_meeting_outcomes.status` valid values:
`open | achieved | partial | carried | abandoned`
Display mapping: achieved=Met · partial=Partial · abandoned=Unmet

No INSERT into `accord_meeting_outcomes` from review mode (trigger blocks it
on closed meetings — Phase 3 finding).

---

## §6 — Architectural constraints

- **`var` only** — no `let`/`const`
- **Iron Rules 36–73** — full force
- **IR47** — verify all column names before use
- **IR71** — no optimistic state mutation on PATCHes
- **IR73** — all `accord_nodes` PATCHes include `AND meeting_id = [current]`
- **No `setTimeout` for sequencing** — `.then()` chains only (Phase 3 finding)
- **Chevron sizes** — section: `10px`, sub-item: `9px` (Live Capture standard)
- **Outfit font + Accord palette** — already in Live Capture shell

---

## §7 — Phase plan

### Phase 1 — Review mode transition (sidebar swap + topbar)
Extend `accord-live-capture.js`:
- `_enterReviewMode()` — called from END MEETING confirm flow
- Sidebar swap: hide live sidebar, render review sidebar
- Topbar updates: stop timer, swap badge, enable Preview, add Route + Send
- Load recipients from `accord_meeting_attendees`
- Wire checklist toggle → Route + Send gate
- Wire sections nav (reuse existing scroll behavior)

### Phase 2 — Preview
- Preview button click → render clean document from in-memory data
- Modal or right-panel overlay, read-only, excluded nodes omitted
- Close returns to review mode

### Phase 3 — Route + Send flow
- Send modal: recipient list, external email, excluded entries note
- `_getOrCreateRender()` → INSERT `accord_minutes_recipients`
- Success state: badge → "Sent · [time]", button → "Sent ✓" disabled

### Phase 4 — Closure
- Smoke test, 8-archetype walkthrough, version pin, CMD seal

---

## §8 — Test plan (Phase 4 checklist)

- [ ] END MEETING confirm → review mode renders (sidebar swapped, same canvas)
- [ ] LIVE pill → "Under Review" badge (amber)
- [ ] Timer stops at final elapsed time
- [ ] END MEETING button disabled
- [ ] Preview button enabled
- [ ] Route + Send button present but disabled
- [ ] Review Checklist: all 6 items toggle correctly
- [ ] All 6 checked → Route + Send enables, badge → "Ready to Send"
- [ ] Sections nav jump-to works
- [ ] Recipients loaded from accord_meeting_attendees with resolved names
- [ ] All existing canvas affordances work: + Add, ×, Exclude, reclassify
- [ ] Preview modal opens, shows clean document, excluded nodes absent
- [ ] Preview close returns to review mode
- [ ] Send modal: recipient list pre-populated, toggles work
- [ ] External email validates on send
- [ ] Send confirm: render record read or created, recipients inserted
- [ ] Badge → "Sent · [time]", button → "Sent ✓" disabled
- [ ] Running meeting (LIVE state) unaffected — no regression
- [ ] `var` only — no `let`/`const`

---

## §9 — Successor CMDs

After M-01 seals:
1. **CMD-ACCORD-KNOWLEDGE-BASE-1**
2. **CMD-ACCORD-MY-MEETINGS-1**
3. **CMD-ACCORD-MINUTES-EMAIL-1** — actual email delivery

---

*End of Brief · CMD-ACCORD-MINUTES-1 v2*
*Operator: Vaughn Staples · Architect: Claude · 2026-05-19*
