# BRIEF — CMD-ACCORD-MEETING-CENTER-1: Meeting Center Surface

**Stamp target:** `v20260519-CMD-ACCORD-MEETING-CENTER-1` (operator confirms before delivery)  
**Predecessor:** CMD-ACCORD-MEETING-SETUP-1 (production-deployed 2026-05-16)  
**Scope:** New surface + nav restructure + two new substrate tables + `hud-shell.js` Accord Tier 1 registration.  
**Design authority:** `accord-today.html` (final mockup, operator-approved 2026-05-19). Do not redesign. Wire to substrate exactly as specified.

---

## §0. READING ORDER

Before writing a line of code:
1. `hud-ecosystem-protocol-v0_1.md`
2. `aegis-MASTER-handoff-2026-05-16.md`
3. This brief (complete)
4. Source files listed in §9

Do not read the broader codebase speculatively. Protocol + handoff + brief + listed sources are sufficient.

---

## §1. CHANGE SUMMARY

### What ships

| Deliverable | Type |
|---|---|
| `accord-today.html` | New surface — Meeting Center landing page |
| `accord-today.js` | New JS module — Meeting Center data wiring |
| `accord-today.css` | New CSS — surface-specific styles (Accord amber palette per §3.8) |
| `scratch_items` table | New substrate — Notes panel persistence |
| `scratch_shares` table | New substrate — Notes sharing (secretary model) |
| `hud-shell.js` | Modified — Accord Tier 1 tab registration + Accord logo swap |
| `accord.html` | Modified — remove MY MEETINGS rail entry + LIVE CONNECT button + MANAGE WORKSTREAMS link |

### What is retired

| Item | Replacement |
|---|---|
| MY MEETINGS rail entry | MEETING CENTER Tier 1 tab in header |
| LIVE CONNECT button | JOIN / REJOIN button in Meeting Center Live Card |
| MANAGE WORKSTREAMS link | Accessible inside WORKSTREAMS tab |
| `accord-my-meetings.js` | Absorbed into `accord-today.js` (LIVE NOW, PENDING, UPCOMING logic migrated) |

---

## §2. PHASE PLAN

### Phase 1 — Cross-module survey (IR72 mandatory)

Survey these before writing any code:

1. **`hud-shell.js`** — exact structure of Tier 1 tab registration. How other modules (Compass, Pipeline, Cadence, Aegis) register their Tier 1 tabs. What the click handler expects. How the logo/wordmark is currently rendered and what module-specific swaps (if any) already exist.
2. **`accord.html`** — exact markup for LIVE CONNECT button, MY MEETINGS rail entry, MANAGE WORKSTREAMS link. Note line numbers and surrounding context.
3. **`accord-my-meetings.js`** — document what logic is being retired (LIVE NOW / PENDING / UPCOMING query structure). Extract any reusable query patterns for `accord-today.js`.
4. **`accord-rails.js`** — how the rail handles level-changed events and surface routing. Meeting Center must not break existing workstream and constellation navigation.
5. **`coc.js` / `CoC.write()`** — confirm the actor resolution chain is correct before writing any CoC calls in this CMD.

Phase 1 deliverable: a written summary (in session chat) of the five survey findings before Phase 2 begins. Architect does not proceed to Phase 2 until operator acknowledges the survey.

---

### Phase 2 — Substrate (C-01)

Two new tables. Run migrations in order.

#### `scratch_items`

```sql
CREATE TABLE scratch_items (
  item_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id            UUID NOT NULL REFERENCES firms(id),
  owner_resource_id  UUID NOT NULL REFERENCES resources(id),
  author_resource_id UUID NOT NULL REFERENCES resources(id),
  body               TEXT NOT NULL CHECK (length(trim(body)) > 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  promoted_node_id   UUID REFERENCES accord_nodes(node_id), -- nullable; set on promote
  completed_at       TIMESTAMPTZ -- nullable; set when checked; cleared when unchecked
);

-- RLS
ALTER TABLE scratch_items ENABLE ROW LEVEL SECURITY;

-- Owner sees their own items
CREATE POLICY scratch_items_select_own ON scratch_items
  FOR SELECT USING (
    firm_id = my_firm_id()
    AND owner_resource_id = my_resource_id()
  );

-- Owner can insert items for themselves
CREATE POLICY scratch_items_insert_own ON scratch_items
  FOR INSERT WITH CHECK (
    firm_id = my_firm_id()
    AND owner_resource_id = my_resource_id()
    AND author_resource_id = my_resource_id()
  );

-- Authorized editors (via scratch_shares) can insert items for the owner
CREATE POLICY scratch_items_insert_shared ON scratch_items
  FOR INSERT WITH CHECK (
    firm_id = my_firm_id()
    AND author_resource_id = my_resource_id()
    AND EXISTS (
      SELECT 1 FROM scratch_shares
      WHERE scratch_shares.owner_resource_id = scratch_items.owner_resource_id
        AND scratch_shares.editor_resource_id = my_resource_id()
        AND scratch_shares.firm_id = my_firm_id()
    )
  );

-- Owner can delete their own items only
CREATE POLICY scratch_items_delete_own ON scratch_items
  FOR DELETE USING (
    firm_id = my_firm_id()
    AND owner_resource_id = my_resource_id()
  );

-- Owner can update (promote or check/uncheck) their own items
CREATE POLICY scratch_items_update_own ON scratch_items
  FOR UPDATE USING (
    firm_id = my_firm_id()
    AND owner_resource_id = my_resource_id()
  ) WITH CHECK (
    firm_id = my_firm_id()
    AND owner_resource_id = my_resource_id()
  );

-- Index
CREATE INDEX scratch_items_owner_created ON scratch_items (owner_resource_id, created_at ASC);

-- Realtime
ALTER TABLE scratch_items REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE scratch_items;
```

#### `scratch_shares`

```sql
CREATE TABLE scratch_shares (
  share_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id            UUID NOT NULL REFERENCES firms(id),
  owner_resource_id  UUID NOT NULL REFERENCES resources(id),
  editor_resource_id UUID NOT NULL REFERENCES resources(id),
  granted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_resource_id, editor_resource_id)
);

-- RLS
ALTER TABLE scratch_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY scratch_shares_select ON scratch_shares
  FOR SELECT USING (
    firm_id = my_firm_id()
    AND (
      owner_resource_id = my_resource_id()
      OR editor_resource_id = my_resource_id()
    )
  );

-- Only owner can grant/revoke access to their own Notes
CREATE POLICY scratch_shares_insert ON scratch_shares
  FOR INSERT WITH CHECK (
    firm_id = my_firm_id()
    AND owner_resource_id = my_resource_id()
  );

CREATE POLICY scratch_shares_delete ON scratch_shares
  FOR DELETE USING (
    firm_id = my_firm_id()
    AND owner_resource_id = my_resource_id()
  );
```

**SELECT-after-INSERT verification (IR54):** after each migration, run a SELECT via authenticated HTTP (not SQL editor — IR50) to confirm RLS allows the expected rows. Confirm `scratch_items` is visible to owner and invisible to unrelated users before proceeding.

---

### Phase 3 — `hud-shell.js`: Accord Tier 1 + Logo (C-02)

**Logo swap:**

`hud-shell.js` currently renders the ProjectHUD wordmark (Rajdhani, platform-level). When the active module is Accord (detected via URL path or module identifier), the header swaps to:
- The Accord icon SVG (`accord_icon_90x90.svg`, rendered at 32×32)
- Wordmark: `<span style="color:#ffffff">ACC</span><span style="color:#00d2ff">ORD</span>` at 22px, Syne, weight 700, letter-spacing .08em, text-transform uppercase
- The platform wordmark DOES NOT appear alongside the Accord logo — the swap is complete replacement, not addition

**Accord Tier 1 tab registration:**

Register three tabs for the Accord module in the Tier 1 strip:
1. `WORKSTREAMS` — routes to existing workstream view (no change to routing behavior)
2. `MEETING CENTER` — routes to `accord-today.html`
3. `KNOWLEDGE BASE` — routes to existing knowledge base surface (no change to routing behavior)

Tab strip inherits the existing Tier 1 visual treatment from `hud-shell.js`. Active tab uses Accord amber (`#ffaa00` / `var(--ac-amber)`) underline, not cyan. This is the Accord module palette (IR §3.8 — module-palette discipline; do not borrow cyan from Compass).

**Accord rail cleanup (in `accord.html`):**
- Remove LIVE CONNECT button entirely
- Remove MY MEETINGS rail entry
- Remove MANAGE WORKSTREAMS link from rail header
- WORKSTREAMS and KNOWLEDGE BASE entries remain unchanged

**CoC event:** write one CoC entry on Tier 1 tab switch:
```
event_type: 'accord.navigation.tier1_switched'
subject_type: 'surface'
subject_id: <tab_name>
summary: 'Operator navigated to Accord Tier 1: <tab_name>'
```

---

### Phase 4 — `accord-today.html` + `accord-today.js`: Static shell + Situation Strip (C-03)

Wire the page chrome. All five data panels remain loading-state in this phase — the goal is a correctly styled, correctly routed, correctly situated shell with one live data element.

**File structure:**

```
accord-today.html       — shell markup only; no inline styles; references accord-today.css
accord-today.css        — surface CSS; Accord amber palette throughout (not cyan)
accord-today.js         — IIFE-wrapped; boots on DOMContentLoaded
```

**The situation strip (one live data element this phase):**

The strip is the only element wired to real data in Phase 4. It reads:

```javascript
// Queries run in parallel via Promise.all
const [liveCount, todayCount, actionsOverdue, pendingRsvp, minutesNotReady] = await Promise.all([
  API.get('accord_meetings?state=eq.running&firm_id=eq.' + firmId + '&select=meeting_id'),
  API.get('accord_meetings?scheduled_for=gte.' + todayStart + '&scheduled_for=lt=' + tomorrowStart + '&firm_id=eq.' + firmId + '&select=meeting_id'),
  API.get('accord_nodes?tag=eq.action&due_date=lt=' + nowISO + '&firm_id=eq.' + firmId + '&select=node_id'),
  API.get('accord_meeting_attendees?rsvp_status=eq.pending&resource_id=eq.' + myResourceId + '&firm_id=eq.' + firmId + '&select=attendee_id'),
  API.get('accord_minutes_renders?status=neq.complete&firm_id=eq.' + firmId + '&select=render_id')
]);
```

Strip renders: `● N live now  |  N meetings today  |  N actions due  |  N need your response  |  N minutes not ready`

If `liveCount === 0`: pulse dot is hidden; "0 live now" is suppressed entirely (strip reads from meeting count onward).

**Layout:** two independent rows, each `flex: 1`. Each row has three cells with independent resize handles. CSS custom properties `--r1w1`, `--r1w2`, `--r2w1`, `--r2w2` per row. Resize handles are 4px wide, Accord amber on hover/drag. All per the locked mockup.

**Panel shells (loading state):** all six panels render their headers and a skeleton loading state. No data yet.

**Phase 4 smoke tests:**
- [ ] `accord-today.html` loads via MEETING CENTER tab
- [ ] Situation strip numbers are correct (verify against known substrate state)
- [ ] Resize handles on row 1 do not affect row 2 widths (and vice versa)
- [ ] Panel headers render at correct size with no descender clipping

---

### Phase 5 — Live Card + Today's Schedule (C-04)

**Live Card (`accord_meetings` where `state = 'running'`):**

If one or more meetings are running:
- Fetch the most recent `started_at` running meeting for `my_resource_id` (attendee or organizer)
- Render: meeting title, stakes (`briefing_text`), workstream name, `started_at` formatted as "Started: Tue May 19, 2026 · 10:22 AM", location
- Elapsed timer: `Math.floor((now - started_at) / 1000)` — computed client-side, ticks every second
- Remaining: if `duration_minutes` is set, render "Xm remaining"; otherwise silent
- Attendees: query `accord_meeting_attendees` for this `meeting_id`; render pills with conn-dot states (green = accepted/connected, amber = late/pending, dark = declined/absent)
- Four chips: Actions Due (overdue `accord_nodes` tag=action in workstream), Decisions Needed (`accord_agenda_items` item_type=DECIDE), Open Questions (`accord_agenda_items` item_type=QUESTION), Agenda Items (total `accord_agenda_items`)
- Verdict button: queries readiness conditions (see §3.1 of mockup spec). Opens popup on click. State-aware: GO (green) / GO WITH CAVEATS (amber) / NOT READY (red).
- JOIN button: navigates to the live meeting Setup shell for this `meeting_id`

If no meeting is running:
- Card shows NEXT MEETING instead: title, start time, countdown, readiness verdict
- Pulse dot is amber during countdown mode, hidden if no upcoming meeting today
- JOIN button becomes PREPARE → navigates to Setup shell for the upcoming meeting

**CoC event on JOIN:**
```
event_type: 'accord.meeting.joined_from_center'
subject_type: 'meeting'
subject_id: <meeting_id>
```

**Today's Schedule:**

Query `accord_meetings` where `scheduled_for::date = today AND firm_id = my_firm_id()`, ordered by `scheduled_for ASC`.

Render the vertical timeline exactly per the locked mockup:
- Done meetings (ended_at IS NOT NULL): 50% opacity, strikethrough title
- Live meeting (state = running): amber dot + amber axis line + amber left-edge block
- NOW marker: current time on axis, amber, ticks every minute
- Next meeting (soonest upcoming): cyan dot + cyan left-edge block
- Future meetings: muted dot, subtle block
- External meetings (`role_in_meeting = 'participant'` and organizer is from a different firm): violet left-edge + EXT pill
- Internal meetings: no pill (default)

**Phase 5 smoke tests:**
- [ ] Live card shows correct meeting when one is running
- [ ] Elapsed timer increments correctly (no negative values)
- [ ] TODAY's schedule lists all of today's meetings in correct order
- [ ] NOW marker appears between the correct meetings
- [ ] JOIN navigates to correct Setup shell
- [ ] Live card falls back to NEXT MEETING correctly when no meeting is running

---

### Phase 6 — Upcoming Meetings + Notes (C-05)

**Upcoming Meetings:**

Query `accord_meetings` where `state = 'idle' AND scheduled_for > now() AND scheduled_for < (today + 30 days)`.

Two tabs — THIS WEEK and THIS MONTH — filter by `scheduled_for` range client-side (data fetched once).

Per card:
- Title, verdict pill (same readiness computation as Live Card), date/time, type pill (External / Internal), workstream name, `briefing_text` (2-line clamp; silent if null)

**Notes panel:**

Reads from `scratch_items` where `owner_resource_id = my_resource_id()`, ordered by `created_at ASC`.

- Four-column grid: checkbox / body / timestamp / author badge
- Checkbox: PATCH `scratch_items` — set `completed_at = now()` on check, `completed_at = null` on uncheck. Load order: items with `completed_at IS NOT NULL` render checked. Checked items retain strikethrough styling but are never auto-deleted.
- Timestamp: `created_at` formatted as "May 19 · 9:14 AM"
- Author badge: shown when `author_resource_id ≠ owner_resource_id`. Shows initials from `resources.name`. Violet pill.
- Hover: timestamp and badge fade; → Action and × appear
- × → DELETE `scratch_items` where `item_id`
- → Action → workstream picker popup → on select: INSERT `accord_nodes` (tag=action, summary=item body, meeting_id=null, firm_id), then PATCH `scratch_items` (promoted_node_id), then remove row from UI
- `contenteditable` input at bottom — Enter commits: INSERT `scratch_items` (owner_resource_id=me, author_resource_id=me, body, firm_id)
- Realtime subscription on `scratch_items` table for `owner_resource_id=eq.<my_resource_id>` — new rows from secretary appear in real time without refresh

**Phase 6 smoke tests:**
- [ ] Upcoming Meetings tab switch works; This Week vs This Month correctly filtered
- [ ] Notes persist across page reload (Supabase-backed)
- [ ] Enter commits a new note; appears immediately
- [ ] × deletes correctly; count updates
- [ ] → Action creates `accord_nodes` row; item removed from Notes list
- [ ] Items authored by another resource show author badge with correct initials

---

### Phase 7 — Minutes + Needs Your Response (C-06)

**Minutes:**

Query:
```javascript
// All closed meetings where I was organizer or attendee, last 90 days
const meetings = await API.get(
  'accord_meetings?state=eq.closed&select=meeting_id,title,sealed_at,workstream_id(name)&order=sealed_at.desc'
);
// For each meeting, check accord_minutes_renders for a completed render
const renders = await API.get(
  'accord_minutes_renders?meeting_id=in.(' + meetingIds + ')&select=meeting_id,status,rendered_at'
);
```

Per row:
- Title (ellipsis overflow), sealed date formatted as "May 19", workstream name, age pill (Today / N days ago — green ≤3 / amber 4–9 / red 10+)
- Status badge: COMPLETE → (clickable, cyan, opens rendered minutes) if a render exists with `status = 'complete'`; NOT READY (red, non-clickable) if no render or render `status ≠ 'complete'`
- CoC event on COMPLETE click: `accord.minutes.opened_from_center`

**Needs Your Response:**

Two item types in one panel, interleaved by urgency:

*Type 1 — Pending RSVP:*
```javascript
API.get(
  'accord_meeting_attendees?rsvp_status=eq.pending&resource_id=eq.' + myResourceId +
  '&select=attendee_id,meeting_id(title,scheduled_for,organizer_id(name))'
)
```
- Title, invited-by name, scheduled date, overdue signal if `invited_at < now() - 48h`
- Accept → PATCH `rsvp_status = 'accepted'`; Decline → PATCH `rsvp_status = 'declined'`
- On action: row fades and removes; badge count decrements
- CoC event: `accord.rsvp.responded_from_center`

*Type 2 — Prep needed:*
```javascript
API.get(
  'accord_meetings?organizer_id=eq.' + myUserId +
  '&state=eq.idle&scheduled_for=gte.' + nowISO +
  '&select=meeting_id,title,scheduled_for,workstream_id(name)'
)
```
Filter client-side to meetings where readiness = NOT READY (same conditions as verdict computation). Render title, scheduled date, amber signal ("X decisions to ratify · prep packet not started"), Start prep → button navigating to Setup shell.

**Phase 7 smoke tests:**
- [ ] Minutes list shows correct meetings in chronological-descending order
- [ ] COMPLETE badge navigates to correct rendered minutes
- [ ] NOT READY badge is non-interactive
- [ ] Pending RSVP items appear; Accept / Decline fire correct PATCHes; items dismiss
- [ ] Prep needed items appear for organizer's unprepared upcoming meetings
- [ ] Badge count in header is correct (sum of both types)

---

### Phase 8 — Polish + Version Pin (C-07)

- All six panels show correct loading skeletons before data resolves
- Empty states: if no live meeting → NEXT MEETING mode; if no upcoming meetings → "No upcoming meetings this week" placeholder; if no Notes → cursor only (no empty state text); if no pending RSVPs or prep needed → panel shows "You're all clear" in muted mono
- Situation strip updates every 60 seconds via `setInterval`
- Realtime subscription on `accord_meetings` for `state` changes — if a meeting transitions to `running`, Live Card updates without refresh
- Version bump: operator-managed per IR65

**Phase 8 smoke tests (full page — 12 checks):**
- [ ] Page loads within 2s on fast connection (six parallel queries)
- [ ] Situation strip correct
- [ ] Live Card: correct meeting shown when running
- [ ] Live Card: correct fallback when no meeting running
- [ ] Timer ticks; remaining time correct
- [ ] Schedule: all today's meetings in order
- [ ] Upcoming: tab switch works; cards correct
- [ ] Notes: persist, add, delete, promote all work
- [ ] Minutes: order, COMPLETE, NOT READY all correct
- [ ] Needs Your Response: RSVP and prep items both appear; actions fire correctly
- [ ] Resize handles: row 1 and row 2 are fully independent
- [ ] Realtime: adding a Note in another tab appears without refresh

---

## §3. DESIGN AUTHORITY — LOCKED DECISIONS

Do not redesign. Wire exactly as specified.

- **Color palette:** Accord amber throughout (`#ffaa00`, `var(--ac-amber)`). Cyan (`#00d2ff`) is used ONLY for the ACCORD wordmark "ORD", the JOIN/REJOIN button, and the situation strip values. All hover states, active tabs, accent borders use amber. This is the Accord module palette (IR §3.8).
- **Typography:** Syne (UI font); JetBrains Mono (all mono elements — timestamps, labels, badges, counts). No Rajdhani (platform wordmark only, not in this surface).
- **Row structure:** two independent rows, each `flex: 1`, equal height. No 58/42 split — equal. `align-items: stretch`.
- **Resize handles:** 4px wide, amber on hover/drag (`rgba(240,160,32,.35)`). Per-row only — handle in row 1 never affects row 2.
- **Panel headers:** `panel-title` class, 15px Syne bold white, `padding: 11px 15px 13px` (extra bottom padding to prevent descender clipping on "g", "y", "p").
- **Live Card:** amber border `rgba(240,160,32,.22)`, radial warm wash, topbar with amber tint. Not the standard panel shell — it is `live-panel` class.
- **Notes input:** `contenteditable` div, not `<input>`. Background `var(--bg3)` — slightly lighter than panel body, no visible box.
- **Author badges:** violet (`#a855f7`) initials circle — only when `author_resource_id ≠ owner_resource_id`.
- **ACCORD logo in header:** icon at 32×32 + "ACC" white / "ORD" `#00d2ff` at 22px. No custom logo in `accord-today.html` — shell handles it.

---

## §4. SUBSTRATE GAPS DOCUMENTED (do not build — future CMDs)

| Gap | Impact | Future CMD |
|---|---|---|
| `accord_meeting_attendees.is_required` | Readiness check "no required attendee declined" cannot be computed | CMD-ACCORD-REQUIRED-ATTENDEES-1 |
| `accord_meeting_required_inputs` | Required inputs pre-condition check not possible | CMD-ACCORD-REQUIRED-INPUTS-1 |
| Pre-read substrate | External document references with per-attendee read-confirmation | CMD-ACCORD-PREREADS-1 |

| Urgency designation on substrate items | Pressure Report panel deferred — no urgency model exists | CMD-ACCORD-PRESSURE-REPORT-1 |

Write a gap note for each in the relevant readiness popup or panel empty state. Do not fake the data.

---

## §5. COC EVENT REGISTRY

All CoC events written by this CMD:

| event_type | subject_type | When |
|---|---|---|
| `accord.navigation.tier1_switched` | surface | Tier 1 tab click in shell |
| `accord.meeting.joined_from_center` | meeting | JOIN button click |
| `accord.minutes.opened_from_center` | meeting | COMPLETE badge click |
| `accord.rsvp.responded_from_center` | meeting | Accept or Decline |
| `accord.notes.promoted_to_action` | node | → Action selection |

All written via `CoC.write()` (IR58 amendment — defensive resolution chain, structured Error on failure).

---

## §6. WHAT THIS CMD DOES NOT BUILD

- Pressure Report panel — deferred; no urgency substrate
- Notes sharing UI (secretary grants/revokes access) — `scratch_shares` table is built; the management UI is not
- Calendar integration — CMD-ACCORD-CALENDAR-INTEGRATION-1 scope
- Counterfactual signals in the Live Card — CMD-COUNTERFACTUAL-POC scope
- CPM-annotated action items — CMD-CPM-SUBSTRATE-1 scope
- AI briefing synthesis in the Upcoming panel — X-08 scope

---

## §7. IRON RULES THAT APPLY

| Rule | Application |
|---|---|
| IR42 | No deletes from `accord_nodes` on promote — INSERT only |
| IR47 | Verify `node_id` (not `.id`) on all FK references to `accord_nodes` |
| IR48 | `extensions.digest()` — qualified schema call if hashing is used |
| IR50 | RLS verification via authenticated HTTP; SQL editor returns NULL for `my_firm_id()` |
| IR52 | Phase 1 survey before any shared-file edits (`hud-shell.js`) |
| IR54 | SELECT-after-INSERT on both new tables before Phase 3 |
| IR58 | `CoC.write()` with defensive resolution chain; no direct `API.post('coc_events')` |
| IR64 | Survey existing patterns before introducing new mechanisms |
| IR65 | Version bump is operator-managed; architect does not bump `version.js` |
| IR68 | Notes panel is private-by-default — `owner_resource_id` scoping enforced at RLS |
| IR70 | All intelligence is substrate-derived; no AI inference in v1 |
| IR71 | State mutation before DOM invalidation — no stale references after async |
| IR72 | Phase 1 cross-module survey is mandatory deliverable; operator acknowledges before Phase 2 |
| IR73 | New state machines (if any) use disjoint UPDATE RLS per transition |
| §3.8 | Accord amber palette throughout; no cyan borrows for UI elements |

---

## §8. TEST PLAN SUMMARY

**Smoke tests per phase:** C-01 (4), C-02 (3), C-03 (4), C-04 (6), C-05 (6), C-06 (6), C-07 (12)  
**Total gate checks: 41**

All 41 must pass before version bump and CMD seal. Operator confirms pass/fail on each check before next check. If any check fails, architect diagnoses via dev console before writing code (do not guess at root cause).

---

## §9. SOURCE FILES

Read before writing any code in the phase indicated:

| File | Phase | Purpose |
|---|---|---|
| `hud-shell.js` | P1 + C-02 | Tier 1 tab registration; logo swap; click handler |
| `accord.html` | P1 + C-02 | Rail structure; elements to remove |
| `accord-my-meetings.js` | P1 | Query patterns to migrate to accord-today.js |
| `accord-rails.js` | P1 | Level-changed routing; must not break |
| `coc.js` | P1 | CoC.write() — verify before calling |
| `api.js` | C-03 | API.get(), API.post(), API.rpc() — confirm .rpc() extension present |
| `accord-meeting-setup.js` | C-04 | Readiness computation pattern to replicate |
| `accord-core.js` | C-04 | my_resource_id(), presence heartbeat patterns |
| `accord_icon_90x90.svg` | C-02 | Accord logo — exact SVG content |
| `Accord_Page_7_-_Meeting_Center.html` | All phases | Locked design authority |

---

## §10. DEFINITION OF DONE

- [ ] All 41 smoke tests pass (operator-confirmed)
- [ ] MY MEETINGS rail entry absent from `accord.html`
- [ ] LIVE CONNECT button absent from `accord.html`
- [ ] MANAGE WORKSTREAMS link absent from rail header
- [ ] `accord-my-meetings.js` retired (or clearly marked deprecated pending removal)
- [ ] WORKSTREAMS · MEETING CENTER · KNOWLEDGE BASE appear as Tier 1 tabs in Accord header
- [ ] Accord logo + ACC/ORD treatment renders in header on all Accord surfaces
- [ ] `scratch_items` and `scratch_shares` tables confirmed live in production
- [ ] All five CoC event types fire correctly (verify via `coc_events` SELECT)
- [ ] Version bump applied by operator (IR65)
- [ ] Handoff document updated

**CMD is sealed when all items above are checked. No partial seal.**

---

*Brief authored: 2026-05-19*  
*Operator: Vaughn Staples*  
*Design authority: Accord_Page_7_-_Meeting_Center.html (operator-approved 2026-05-19)*

---

## §11. PHASE 9 — Display Tuning Panel (C-08)

**Scope:** Meeting Center–specific display tuning panel. Independent from the Setup shell's `localStorage('accord-display-tuning')`. Key: `localStorage('accord-mc-display-tuning')`.

### Trigger

☀ button in the Meeting Center situation strip (right side, before the clock). Opens `window.open()` popup — same pattern as Setup shell X-46. Can be moved to a second monitor. Closes independently.

### Controls

**GLOBAL**
- Brightness — CSS `filter: brightness()` on `.page` wrapper
- Contrast — CSS `filter: contrast()` on `.page` wrapper
- Saturation — CSS `filter: saturate()` on `.page` wrapper

**SPACING & SHAPE**
- Column gap — `gap` between cells and handles within each row
- Zone gap — `gap` between row 1 and row 2
- Corner radius — `border-radius` on all panels

**ROW HEIGHT RATIO** *(new — not in Setup shell)*
- Single slider: left = Row 1 dominant, center = equal (default), right = Row 2 dominant
- Maps to `flex` values on `.row-1` and `.row-2`
- Range: 35/65 → 50/50 (default) → 65/35
- Label updates live: "Row 1: 58% · Row 2: 42%" etc.
- This is the primary control for hero card emphasis experiments

**BACKGROUNDS**
- Hero card — independent color swatch; controls the live-panel background wash and border amber intensity (two CSS custom properties: `--mc-hero-bg`, `--mc-hero-border-opacity`)
- Panels — background color swatch for all non-hero panels (`--mc-panel-bg`)
- Situation strip — background swatch (`--mc-strip-bg`)

**ACCENT COLORS**
- Amber (actions / hero) — `--mc-amber`
- Cyan (decisions / wordmark) — `--mc-cyan`
- Red (overdue) — `--mc-red`
- Violet (external / author badges) — `--mc-violet`

**TEXT**
- Primary text — color swatch
- Muted text — color swatch
- Meta / mono text — color swatch

### Persistence and propagation

- All settings stored as JSON in `localStorage('accord-mc-display-tuning')`
- On save: `window.postMessage` + `storage` event listener in `accord-today.js` applies changes in real time without reload
- Export button: logs current JSON to main window console (operator copies and sends to architect to lock into CSS permanently)
- Reset button: clears `localStorage('accord-mc-display-tuning')` and reloads defaults

### Preset modes (top of panel)

Three preset buttons — **Dark** (default), **Medium**, **Bright** — matching the Setup shell X-46 pattern. Each preset sets a baseline for all sliders/swatches. User can then fine-tune from the preset.

| Preset | Brightness | Contrast | Saturation | Hero bg |
|---|---|---|---|---|
| Dark | 1.0 | 1.0 | 1.0 | `#0d1520` |
| Medium | 1.1 | 0.95 | 1.1 | `#111c2a` |
| Bright | 1.25 | 0.9 | 1.2 | `#162030` |

### CSS custom property tokens (new, scoped to Meeting Center)

```css
:root {
  --mc-hero-bg: #0d1520;
  --mc-hero-border-opacity: 0.22;
  --mc-panel-bg: #0d1520;
  --mc-strip-bg: #0a1119;
  --mc-amber: #f0a020;
  --mc-cyan: #00d2ff;
  --mc-red: #ff4d6d;
  --mc-violet: #a855f7;
  --mc-row1-flex: 1;
  --mc-row2-flex: 1;
}
.row-1 { flex: var(--mc-row1-flex); }
.row-2 { flex: var(--mc-row2-flex); }
.live-panel {
  border-color: rgba(240, 160, 32, var(--mc-hero-border-opacity));
  background: var(--mc-hero-bg);
}
```

The row height ratio slider maps the 35/65 → 65/35 range to `--mc-row1-flex` and `--mc-row2-flex` values (e.g., 35/65 → flex: 0.54 / 1.0; 65/35 → flex: 1.0 / 0.54).

### Phase 9 smoke tests

- [ ] ☀ button opens tuning panel popup
- [ ] Row height ratio slider visibly changes row proportions in real time
- [ ] Hero card background swatch changes independently from other panels
- [ ] Hero card border intensity slider affects amber glow strength
- [ ] All settings persist across page reload
- [ ] Export logs correct JSON to console
- [ ] Reset restores defaults
- [ ] Dark / Medium / Bright presets each produce visually distinct results
- [ ] Tuning does NOT affect Setup shell (separate localStorage key confirmed)

**Total gate checks with C-08: 41 + 9 = 50**

---
