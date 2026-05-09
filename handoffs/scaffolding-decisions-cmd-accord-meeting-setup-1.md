# Scaffolding Decisions · CMD-ACCORD-MEETING-SETUP-1

**Status:** Architect-operator dialogue locked 2026-05-09. Tomorrow's session reads this and drafts brief.

**Predecessor:** CMD-ACCORD-NRA-SURFACE-1 sealed
**Reference design:** `Accord_Meeting_Mockup_-_Primary_Architect__v5_.html`
**Doctrine canon at scaffold:** 39 ratified Iron Rules + IR58 amendment + Style Doctrine v1.8 §3.8

---

## §1 — Scope shape (Pass 1)

**Option B — Surface skeleton + shippable panes.** Substrate-derived intelligence (per-attendee patterns, prose synthesis, dissent-simmering detection) deferred to follow-on CMD (likely `CMD-ACCORD-MEETING-INTELLIGENCE-1`).

V5 panes commission as v1:
- Header (meeting metadata, workstream context, follow-up/first-ever toggle)
- Briefing column (mechanical default + operator override)
- Agenda center (threads, NRA-shape inference, time estimates)
- Anticipation column (names + roles only; pattern detection deferred)
- Carried references (attachments)
- Workstream timeline filmstrip (12 prior meetings, click-to-scrub)
- Footer (time budget gauge, connected status warnings, Save & invite, Begin meeting)
- Prior actions live status (action nodes from prior meetings with NRA badges)

**Deferred to follow-on CMDs:**
- Per-attendee pattern detection ("DISSENT SIMMERING", "OVERDUE PRESSURE", etc.)
- Prose synthesis in Briefing column
- "Pattern says" footer warnings (e.g., "Tom runs late")
- Auto-callouts in agenda ("you haven't queried Tom's dissent")
- "Pattern says X" intelligence text per-attendee

---

## §2 — Per-pane decisions (Pass 2)

| Pane | Decision | Notes |
|---|---|---|
| Briefing column | **(c) Hybrid** — mechanical default + operator override | New nullable text field on `accord_meetings`: `briefing_text`. If NULL, render mechanical view (substrate facts only). If populated, render operator's text. |
| Anticipation column | **(a) Names + roles only** | List attendees with resource_type role; no patterns, no status badges, no behavioral text. Pattern detection arrives in follow-on intelligence CMD. |
| Workstream timeline filmstrip | **(a) Ship full** | Read existing meetings substrate; render thumbnails with outcome rollup (decisions/actions/risks counts); click navigates to that meeting via existing transition path. |
| Prior actions live status | Ship as-is | Query action nodes from prior meetings in workstream + render with NRA badges. Substrate ready post-NRA-Surface-seal. |

---

## §3 — Render & edit decisions (Pass 3)

| Decision | Lock |
|---|---|
| Render trigger | **(a) Replace existing pre-meeting view.** Load any meeting in `state='draft'` or scheduled, render Meeting Setup. On "Begin Meeting" click, transition to Live Capture (existing surface). |
| Edit scope | **(b) Full editing within Meeting Setup.** Three primary edit paths: Add agenda item → creates `accord_nodes` rows with NRA hooks; Attach reference → creates attachment row; Edit briefing text → updates `meeting_briefing_text` field. |
| Substrate amendment required | One nullable text column on `accord_meetings`: `briefing_text`. Phase 1 of CMD authors migration. Small substrate amendment; not scope creep. |

---

## §4 — Footer & affordance decisions (Pass 4)

| Decision | Lock |
|---|---|
| Time budget gauge | **(a) Ship.** Sum of agenda item `~Nm` time estimates against meeting duration (scheduled_for + duration). Substrate-derived; cheap. |
| Status footer warnings | **(b) Ship connected status only.** "Tom unconnected" / "Amara off-substrate 14d" — queryable from calendar/invite substrate. "Pattern says he runs late" defers. |
| Pull-as-thread | **(b) Ship action without auto-callouts.** Operator can manually pull a prior dissent/decision as agenda item; substrate handles linking. Auto-detection callouts deferred to intelligence CMD. |

---

## §5 — Phase plan (anticipated; brief refines)

Hybrid CMD shape: one brief covers all v5 panes; phase-by-phase pane delivery with operator review checkpoints.

Anticipated phases:
1. **Phase 1** — Investigation (IR72 cross-module survey: meeting prep flow, calendar substrate, attachment patterns, transition path; IR64 verification of substrate assumptions; substrate amendment scoping for `briefing_text` field)
2. **Phase 2** — Substrate amendment + meeting setup shell (header + footer + chrome; replaces existing pre-meeting view)
3. **Phase 3** — Agenda center (thread rendering, NRA-shape inference, add/edit affordances, pull-as-thread action)
4. **Phase 4** — Briefing column (mechanical + override)
5. **Phase 5** — Anticipation column + prior actions live status
6. **Phase 6** — Carried references + workstream timeline filmstrip
7. **Phase 7** — Closure (full smoke + 8-archetype walkthrough + version pin + CMD seal)

**Total estimated effort:** Strategic CMD; 6-8 working sessions.

**Operator review checkpoints:** Each Phase close-out is a natural review point. Operator can adjust pane scope mid-CMD if visual surfaces don't land as expected.

---

## §6 — Substrate dependencies

**Already shipped:**
- `accord_workstreams` (workstream context for header)
- `accord_meetings` (meeting metadata, state machine)
- `accord_nodes` (agenda items, prior actions)
- `accord_nras` + helpers (NRA capture/display from NRA Surface)
- `accord_edges` (pull-as-thread linking)
- Calendar/invite substrate (connected status footer)
- Attachment substrate (carried references)

**Substrate amendments this CMD:**
- `accord_meetings.briefing_text TEXT NULL` — Phase 1 migration

**Substrate untouched:**
- All NRA infrastructure
- All identity primitives (firms/users/resources)
- CoC events (existing meeting/node events serve)

---

## §7 — Doctrine implications

- **IR67 (8-archetype test)** — applied Phase 1 + closure
- **IR68 (privacy-by-surface)** — Meeting Setup is operator-prep context (operator-private)
- **IR70 (substrate-derived intelligence)** — applied to time budget gauge, mechanical briefing default, prior actions live status
- **IR71 (state-mutation-before-invalidation)** — modal/edit lifecycle vigilance
- **IR72 (cross-module Phase 1 survey)** — mandatory Phase 1 deliverable
- **IR73 (state-aware UPDATE RLS)** — substrate amendment respects pattern (briefing_text is meeting-state-gated UPDATE)
- **Style Doctrine v1.8 §3.8** — Accord palette discipline

---

## §8 — Successor CMDs queued

After Meeting Setup seals:

1. **CMD-ACCORD-MEETING-INTELLIGENCE-1** — substrate-derived intelligence layer: per-attendee patterns, prose synthesis, dissent-simmering detection, auto-callouts
2. **CMD-ACCORD-MEETING-CANVAS-1** — view canvas pane with image filmstrip (queued from earlier)
3. **CMD-ACCORD-OFFLINE-THREAD-1** — "take it offline" black-hole substrate (queued from NRA scaffolding)
4. **CMD-ACCORD-NRA-OWNER-VISIBILITY-1** — owner-facing NRA visibility (queued from NRA Substrate)
5. **CMD-ACCORD-NODE-RESOLUTION-SUBSTRATE-1** — resolution semantic + deferred third NRA trigger (queued)

---

## §9 — Tomorrow's resume flow

1. Fresh conversation; read this scaffolding-decisions document first
2. Architect drafts brief from these locked decisions
3. Operator ratifies brief
4. Phase 1 commission to fresh agent

**No further dialogue passes required before brief drafting** — all design decisions captured here.

---

*End scaffolding decisions · CMD-ACCORD-MEETING-SETUP-1.*
