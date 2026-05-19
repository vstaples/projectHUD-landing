# Brief · CMD-ACCORD-MY-MEETINGS-1
## My Meetings — Cross-Workstream Personal Dashboard

**Track:** MM (My Meetings)
**CMD:** MM-01 · CMD-ACCORD-MY-MEETINGS-1
**Operator:** Vaughn Staples
**Architect:** Claude
**Status:** Awaiting operator ratification
**Reference mockup:** `accord_mockup_p2_my_meetings.html` (locked 2026-05-17)

---

## §1 — Purpose

Build the My Meetings tab on the Accord landing page. This is a personal
cross-workstream view showing all meetings the authenticated user is
organizer or attendee of, sorted by upcoming first, with signals
(RSVP status, open actions, dissents, preparation state).

This is the second tab on the Accord landing page alongside Workstreams.
The locked mockup (`accord_mockup_p2_my_meetings.html`) defines the visual
spec. The existing MY MEETINGS tab stub already exists in the nav — this
CMD wires it.

---

## §2 — Reference mockup summary

### Two-column layout
Left rail: Workstreams tree (existing — unchanged)
Center canvas: My Meetings card list

### Tab bar (top of center canvas)
**WORKSTREAMS** · **MY MEETINGS** (with badge count of upcoming meetings)

### Card list
Cards sorted: Preparing → Pending RSVPs → Closed (most recent first)

Each card — two-column grid:

**Left (meeting info):**
- State badge: `Preparing` (amber) / `Pending RSVPs` (red) / `Closed` (dim)
- Meeting title
- Stakes line (italic, colored left border — amber for Preparing, red for Pending)
- Signals row: outcome count · agenda item count · open actions · dissents ·
  RSVP acceptance status

**Right (schedule + attendance):**
- Date/time + duration
- Organizer avatar + name
- Attendee avatar stack
- RSVP summary row (Pending state only): N accepted · N pending · N declined
- "Resend to pending" link (Pending state only)
- Countdown chip (e.g., "in 2 days") for upcoming meetings

### Card left border accent
- Preparing: amber (`--act`)
- Pending RSVPs: red (`--rsk`)
- Closed: dim (`--b2`)

---

## §3 — Entry point

The MY MEETINGS tab is already in the Accord left-rail nav. Clicking it
currently does nothing or renders a stub. This CMD wires it to load the
`AccordMyMeetings.render(host)` surface.

Entry point in `accord-views.js` or `accord-constellation.js` —
Phase 1 confirms which file handles the MY MEETINGS tab click.

---

## §4 — Substrate

```javascript
// Load all meetings where current user is organizer or attendee
// SELECT m.meeting_id, m.title, m.stakes, m.scheduled_for,
//        m.duration_minutes, m.state, m.organizer_id,
//        m.workstream_id
// FROM accord_meetings m
// WHERE m.firm_id = my_firm_id()
//   AND (
//     m.organizer_id = auth.uid()
//     OR EXISTS (
//       SELECT 1 FROM accord_meeting_attendees a
//       WHERE a.meeting_id = m.meeting_id
//         AND a.resource_id = [my_resource_id]
//     )
//   )
// ORDER BY m.scheduled_for DESC
```

Additional loads:
- `accord_meeting_attendees` per meeting — for RSVP chips and avatar stack
- `accord_nodes` counts per meeting — for signals row (decisions, actions, risks)
- `resources` — for attendee name/avatar resolution
- `workstreams` — for workstream name display on each card

**Performance note:** load meeting list first, render immediately, then
load signals and attendees in a second pass. Do not block card render
waiting for node counts.

---

## §5 — Architectural constraints

- **`var` only** — no `let`/`const`
- **Iron Rules 36–73** — full force
- **IR47** — verify `accord_meetings.organizer_id` type before querying
  (is it `auth.users.id` UUID or `resources.id`? Confirm in Phase 1)
- **No `setTimeout` for sequencing** — `.then()` chains only
- **Outfit font + Accord palette** — already loaded globally
- **`--lo: #7a8a9a`** — Iron Rule typography minimum
- **No writes** — My Meetings is read-only in v1

---

## §6 — Phase plan

### Phase 1 — Investigation
**Deliverable:** Written findings only. No code.

1. Locate the MY MEETINGS tab click handler in `accord-views.js` or
   `accord-constellation.js`. Confirm entry point and host element.
2. IR47: confirm `accord_meetings.organizer_id` type — is it `auth.uid()`
   comparable or `resource_id`? This controls the self-filter query.
3. Confirm `accord_meeting_attendees.resource_id` matches `resources.id`
   (not `auth.users.id`) — needed for attendee avatar resolution.
4. Confirm `accord_meetings.stakes` column exists (added CMD-ACCORD-SETUP-HEADER-1).
5. Confirm existing MY MEETINGS tab behavior — does it render anything today,
   or is it a dead stub?
6. Check whether `accord-my-meetings.js` already exists in the codebase.

---

### Phase 2 — Shell + card list (first pass)
**Deliverable:** Card list renders. First-pass cards without signals.

1. New module `accord-my-meetings.js` — `AccordMyMeetings.render(host)`
2. Wire MY MEETINGS tab click to `AccordMyMeetings.render()`
3. Load meetings query — render cards immediately with title, state badge,
   date/time, organizer, attendee avatars
4. Sort: Preparing first, Pending RSVPs second, Closed last (most recent first
   within each group)
5. Card left border color per state
6. Stakes line per card (if not null)
7. Countdown chip for upcoming meetings (scheduled_for > now)
8. Empty state: "No meetings found" if query returns nothing

---

### Phase 3 — Signals + RSVP details
**Deliverable:** Signal chips and RSVP rows wired.

1. Second-pass load: node counts per meeting (decisions, open actions, dissents)
2. Signals row: `N outcomes set` · `N agenda items` · `N actions open` ·
   `N unresolved dissents` · RSVP acceptance
3. RSVP row for Pending cards: N accepted · N pending · N declined
   with colored dots
4. RSVP rings on attendee avatars (green/amber/red per status)
5. "Resend to pending" link (display only — no email send in v1)

---

### Phase 4 — Closure
**Deliverable:** Smoke test, seal.

---

## §7 — Out of scope

- Sending actual RSVP resend emails (display only)
- Creating meetings from My Meetings view
- Filtering/sorting controls beyond the default sort
- Meeting search

---

## §8 — Test plan (Phase 4 checklist)

- [ ] MY MEETINGS tab click renders the card list
- [ ] All meetings where user is organizer or attendee appear
- [ ] Cards sorted: Preparing → Pending → Closed
- [ ] Card left border color correct per state
- [ ] State badge correct per state
- [ ] Meeting title, stakes line, date/time render correctly
- [ ] Organizer name resolves correctly
- [ ] Attendee avatar stack renders
- [ ] Countdown chip shows for upcoming meetings
- [ ] Signals row: outcome count, agenda count, open actions, dissents
- [ ] RSVP row renders for Pending cards
- [ ] RSVP rings on avatars for Pending cards
- [ ] "Resend to pending" link renders (non-functional)
- [ ] Empty state renders when no meetings
- [ ] Workstreams tab still works — no regression
- [ ] `var` only — no `let`/`const`

---

*End of Brief · CMD-ACCORD-MY-MEETINGS-1*
*Operator: Vaughn Staples · Architect: Claude · 2026-05-19*
