# Accord — Product Requirements Specification
**Version:** 1.0
**Date:** 2026-05-14
**Author:** Claude (Pluto), Architect
**Operator:** Vaughn Staples, Apex Consulting Group
**Platform:** ProjectHUD · Vercel + Supabase

---

## §1 — Vision

Accord is a **meeting intelligence platform** embedded in ProjectHUD. Its purpose
is to transform the meeting — historically the most information-rich and least
preserved moment in professional life — into permanent institutional memory.

Every meeting in Accord moves through three phases:

1. **Prepare** — the Setup shell surfaces everything relevant from prior meetings,
   pending actions, open risks, and attendee patterns before the meeting begins.
   The operator arrives prepared, not just scheduled.

2. **Capture** — the Live Capture surface records decisions, actions, notes, and
   risks in real time during the meeting. Capture is structured, not free-form.
   Every item is typed, owned, and dated at the moment it is stated.

3. **Record** — after the meeting, the permanent record surfaces the sealed
   decisions, action assignments, and meeting minutes. The Chain of Custody
   guarantees that nothing can be retroactively altered.

The platform's core philosophical position: **a decision that isn't sealed isn't
a decision — it's a conversation.** Accord makes the distinction irreversible.

---

## §2 — User profiles

### 2.1 — Vaughn (Organizer / Operator)
Primary user. Organizes workstreams, schedules meetings, runs the Setup shell,
drives Live Capture. Has full visibility into all meetings he organizes plus
meetings he has been invited to. The platform is designed first for this user.

### 2.2 — Angela (Internal Attendee)
ProjectHUD user invited to specific meetings. Sees only meetings she has been
invited to (post VISIBILITY-1 RLS). Uses My Meetings dashboard to see pending
invitations, live meetings to join, and upcoming calendar. Can RSVP inline.
May eventually organize her own workstreams and meetings.

### 2.3 — External Invitee
Person with no ProjectHUD account. Receives email invitation via Resend.
Accepts/declines via `meeting-rsvp.html` — no login required. Can join the
meeting via the video link (WHERE field in Setup shell). May view Accord Live
Capture as a read-only participant via token-based access (future).

### 2.4 — New Employee
Starts as an attendee. Has no organized workstreams. Sees the constellation
onboarding slideshow until they create their first workstream. Transitions
naturally to organizer role by creating a workstream — no admin action required.

### 2.5 — Ron (Cross-firm resource)
Resource row exists in the firm but `users.firm_id` does not match
`resources.firm_id`. `my_resource_id()` returns NULL. Sees no meetings.
Invitations to this user type are silently inert — Setup shell should surface
a validation warning (deferred to PIPELINE-1 follow-on).

---

## §3 — Product architecture

### 3.1 — Platform layers

```
ProjectHUD (Vercel)
  ├── Compass          — project/task management, work queue, My Dashboard
  ├── Cadence          — workflow engine, form certification
  ├── Accord           — meeting intelligence (THIS PLATFORM)
  └── CommandHUD       — Chris Staples (in development, not yet integrated)
```

### 3.2 — Accord module structure

```
accord.html                  — shell, token definitions, script loader
  ├── accord-core.js         — state, loadMeeting, setLevel, URL persistence
  ├── accord-rails.js        — left rail, workstream tree, tab bar
  ├── accord-views.js        — surface rendering, meeting state classes
  ├── accord-transitions.js  — level change handling, surface switching
  ├── accord-constellation.js — orbital workstream visualization
  ├── accord-workstreams.js  — workstream CRUD
  ├── accord-meeting-setup.js — Setup shell (C-01 through C-14)
  ├── accord-capture.js      — Live Capture (A-08, A-09, A-10, A-11, A-12)
  ├── accord-document.js     — Living Document surface
  ├── accord-ledger.js       — Decision Ledger surface
  ├── accord-digest.js       — Digest & Send surface
  ├── accord-minutes.js      — Minutes surface
  ├── accord-nra.js          — NRA surface (B-01 through B-04)
  ├── accord-my-meetings.js  — My Meetings tabbed rail dashboard
  ├── accord-slideshow.js    — New user onboarding slideshow
  ├── accord-dnd.js          — Drag and drop
  └── accord-rails.js        — Three-pane orchestrator
```

### 3.3 — Meeting lifecycle states

```
idle     → meeting exists, not yet started (Setup shell)
running  → meeting in progress (Live Capture)
closed   → meeting ended, sealed by trigger (Record surfaces)
```

The `accord_meeting_seal_fn()` trigger fires on `state → closed` and is
**irreversible**. Closed meetings cannot be reopened. This is by design —
Chain of Custody integrity.

---

## §4 — Setup shell — complete specification

### 4.1 — Layout

Three-column 5-zone CSS grid:
- **Left column:** Briefing (tabs: Briefing / Decisions / Risks)
- **Center column:** Agenda (tabs: Agenda / Minute Notes / Comments)
- **Right column:** Attendees + Action Items + Attachments (tabs)
- **Bottom zone:** Workstream Timeline filmstrip (drag-resize handle on top)
- **Header:** Meeting title, Stakes, breadcrumb, WHEN/WHERE/WORKSTREAM meta,
  FOLLOW-UP/FIRST-EVER badges, time budget gauge, BEGIN MEETING button

Columns have vertical drag-resize handles. Center zone expands as side
columns narrow. Width preferences persisted in localStorage.

### 4.2 — Temporal phases

| Phase | Trigger | Right column behavior |
|---|---|---|
| Prep | Default | Full intelligence — patterns, owed lines, urgency math |
| Gathering | 15 min before `scheduled_for` | Attendee names + conn-dots only. Intelligence hidden. |
| Imminent | 5 min before `scheduled_for` | 5-minute warning overlay. Shell tightens. |
| Live | `state = running` | Transitions to Live Capture surface |

**Rationale for intelligence hiding in Gathering:** attendees can see the
operator's screen. Surfacing "Tom · DISSENT SIMMERING · move now" while Tom
is logging in is socially disastrous. The intelligence layer must not be
visible to the room.

### 4.3 — Left column — Briefing

**Briefing tab (default):**
- AI-synthesized summary of what came before in this workstream
- Last meeting card: date, title, "No captures" or capture count, "Read full minutes →" link
- Prior actions: open action items from previous meetings in this workstream
- Prior decisions: sealed decisions from prior meetings relevant to today

**Decisions tab:**
- All sealed decisions from the workstream, most recent first
- Filter by attendee, date range

**Risks tab:**
- Open risk register items for this workstream
- Risk Register integration (future — see §10.3)

### 4.4 — Center column — Agenda

**Agenda tab (default):**
- Intended Outcomes — list of commitments (not a paragraph — one row per outcome)
  backed by `accord_meeting_outcomes` table
- Agenda items — NRA shape inference prompt below the input field
- Agenda items are typed: Decision · Action · Note · Risk · Question

**Minute Notes tab:**
- Activated by clicking a filmstrip card (prior meeting)
- Shows the Thread History for that meeting in the center pane
- Back button returns to Agenda

### 4.5 — Right column — Attendees / Actions / Attachments

**Attendees tab:**
- Reads from `accord_meeting_attendees` (NOT all firm resources)
- Top half (always visible): roster with conn-dots
- Bottom half (collapsible in Gathering mode): per-attendee intelligence
  - Behavioral patterns
  - Owed lines (commitments from prior meetings not yet delivered)
  - Urgency math
  - Role badge
- Click any attendee → percolate-by-person across all panels
- Expand icon on each card for detail view

**Action Items tab:**
- Two sibling sub-tabs: Kanban / Timeline
- Kanban columns: Pending · In Progress · Overdue · Complete
- Timeline: horizontal date axis, drag to reschedule
- Critical path overlay: amber spine on cards on the critical path
- Slack indicator: days of float, color-coded red/amber/green
- Click action → highlights originating agenda item + owner attendee card
  (cross-panel highlight mechanic — same as percolate-by-person)

**Attachments tab:** (A-10 scope — deferred)

### 4.6 — Filmstrip — Workstream Timeline

- Full-width zone at bottom of Setup shell
- Default height shows: meeting date, thumbnail with dot indicators
- Drag handle on TOP of zone — pull up to expand
- As height increases: more detail revealed (node lines, note counts,
  decision summaries, attendee thumbs)
- As height decreases: returns to thumbnail view
- Click a card → activates Minute Notes tab in center column with that meeting's thread

### 4.7 — Panel tab rotation

**Right column:** auto-rotates every 12–15 seconds between Attendees / Actions / Attachments
- Cursor entering the panel pauses rotation
- 3-second grace period after cursor leaves before rotation resumes
- Manual tab click: 60-second pause (explicit intent)
- Stepper: `< · · · >` glyph in column header — dots represent tabs, filled = current

**Left column:** Briefing pinned by default. Rotation into Decisions/Risks opt-in only.

**Center column:** Agenda pinned. No rotation. Minute Notes/Comments via filmstrip click only.

### 4.8 — 5-minute warning

When `scheduled_for - now() < 5 minutes`, the shell tightens:
- Time budget gauge becomes prominent
- Non-essential elements dim
- Footer shows explicit "Meeting starts in N minutes" warning
- Briefing column shifts to attendee readiness focus

### 4.9 — Intelligence mode

`Cmd+I` overlay:
- Full-screen dim
- Per-attendee private intelligence cards
- Operator-authored private notes (never visible to attendees)
- Urgency math and pattern analysis
- Dismissed by clicking outside or pressing Escape

---

## §5 — Live Capture surface — complete specification

### 5.1 — Layout

Three-pane layout on `accord.html` capture surface:
- **Left pane:** Agenda items + node capture composer
- **Center pane:** Capture stream (committed nodes) + Thread History
- **Right pane:** Coverage, Attendees, Team Chat

**Bottom zone:** Live filmstrip (transplanted from Setup shell — A-09)
Shows workstream timeline; click prior meeting card → filters Thread History tab

### 5.2 — Capture composer

- Free-text input
- Tag AS: Note (N) · Decision (D) · Action (A) · Risk (R) · Question (Q)
- Press tag key or click button to commit node
- Node is immediately sealed with timestamp, author, meeting_id

### 5.3 — Team Chat (A-08)

- Persistent chat subscribed to URL meeting
- Messages in `accord_chat_messages` table
- Realtime delivery via Supabase realtime channel
- Author name, timestamp, message bubble (right-aligned for current user)
- Archived (read-only) for closed meetings

### 5.4 — Live filmstrip (A-09)

- Verbatim clone of Setup shell filmstrip functions
- `_enrichFilmCards`, `_paintFilmCardContent`, `_initFilmCardTiers`, `_stopFilmCardTiers`
- Click card → filters Thread History tab (not scrub overlay)
- CSS in `accord-views.css` (verbatim from `accord-meeting-setup.css`)

### 5.5 — Attendees panel (A-12)

- Reads from `accord_meeting_attendees` for the URL meeting
- Presence overlay: green pulsing dot (active Aegis session) / gray outline (invited, absent)
- Organizer card shows no RSVP badge
- 30-second refresh timer re-renders with fresh presence map

### 5.6 — Attachment sidebar (A-10 — deferred)

- Right edge ATTACH handle opens attachment sidebar
- IMAGE CANVAS tab for screen-region capture (scissors tool)
- Attachment stored in `accord_attachments` table (pending)

### 5.7 — Node comments (A-11 — deferred)

- Click any node in the capture stream → opens inline comment thread
- Comments in `accord_node_comments` table (pending)

---

## §6 — Record surfaces

All surfaces read from sealed (closed) meeting substrate. No writes permitted
after seal. Chain of Custody enforced by `accord_meeting_seal_fn()` trigger.

### 6.1 — Living Document
Synthesized prose narrative of the meeting. AI-generated from captured nodes.

### 6.2 — Decision Ledger
All sealed decisions from this meeting. Immutable. Each decision shows:
author, timestamp, seq ID, Chain of Custody seal hash.

### 6.3 — Digest & Send
Formatted meeting summary for distribution. Operator reviews, edits, sends.
Recipients configurable. Integrates with Compass notification system.

### 6.4 — Minutes
Full meeting minutes surface. Structured by agenda item.
Action items with owner and due date. Decision list. Attendee list.

---

## §7 — NRA surface

**Next Required Action** — the substrate layer that connects meeting
decisions to forward commitments.

Every node commit can generate an NRA: "Given this decision/action, what
must happen next?" The NRA is typed, owned, and tracked to resolution.

NRAs display as badges on nodes across all surfaces. Badge variants:
- `declared external` — assigned to someone outside the meeting
- `declared internal-event` — triggered by a calendar/deadline event
- `declared internal-operator` — operator-declared
- `waived` — explicitly dismissed
- `deferred` — acknowledged, not yet scheduled
- `candidate` — substrate-detected resolution candidate
- `history-only` — carried from a prior meeting
- `grandfathered` — pre-Accord action now tracked

NRA resolution is detected by substrate patterns (follow-on meeting scheduled,
action marked complete) and surfaced to the operator for confirmation.

---

## §8 — Invitation pipeline

### 8.1 — Flow

```
Organizer adds attendee in Setup shell (C-04)
  → "Save & invite" button (X-02)
  → accord_invitation_tokens row created per pending attendee
  → notify-meeting-invitation Edge Function fires
  → Resend sends email with Accept / Decline buttons
  → Invitee clicks Accept
  → meeting-rsvp.html loads (no login required)
  → respond-meeting-rsvp Edge Function:
     → marks token used
     → PATCHes accord_meeting_attendees.rsvp_status
     → emails organizer notification
  → Setup shell detects RSVP change (10s poll)
  → ACCEPTED/DECLINED badge appears on attendee card
```

### 8.2 — Internal attendees (ProjectHUD users)

Work Queue item appears in My Dashboard → Work Queue → Requests tab.
Same 10-second poll picks up new invitation. Accept/Decline inline.
No token required — authenticated `API.patch` directly.

### 8.3 — RSVP status colors

| Status | Color |
|---|---|
| accepted | Green |
| pending | Amber |
| declined | Rose |
| (organizer) | No badge |

### 8.4 — Production prerequisite

Resend domain verification required before invitations reach non-verified emails.
Currently in sandbox mode — only `vstaples64@gmail.com` confirmed working.

---

## §9 — My Meetings dashboard

Tabbed left rail — two tabs: **WORKSTREAMS** (default) · **MY MEETINGS**

### MY MEETINGS tab — three zones:

**LIVE NOW**
- Running meetings the user is organizer of or invited to
- Green-bordered card: title + time elapsed + workstream + JOIN button
- JOIN button navigates to `accord.html?meeting=<id>`

**PENDING YOUR RESPONSE**
- Invitations with `rsvp_status = 'pending'`
- Card: title + date/time + "Invited by [name]" + ✓ Accept · ✕ Decline
- RSVP via authenticated `API.patch` — no token needed

**UPCOMING — next 14 days**
- Accepted meetings with `scheduled_for` in next 14 days
- Card: title + date + workstream + role (Organizer / Invited)
- Click → Setup shell (idle) or Live Capture (running)

30-second refresh timer. Pauses when tab not active.

---

## §10 — Future tracks — design intent

### 10.1 — Track D: Projection Engine

**What it is:** Forward scenario modeling. Given the current state of actions,
decisions, and workstream momentum — what does the future look like?

**Key capabilities:**
- Project forward from current action completion rates
- Model scenarios: "If these three actions slip, what is the downstream impact?"
- Counterfactual analysis: "What would have happened if we had decided differently
  at the May 8 meeting?"
- Probability-weighted outcome trees based on historical meeting patterns

**Design philosophy:** The projection engine doesn't predict the future —
it makes the operator's implicit assumptions explicit and testable.

**Dependencies:** Requires E-01 (Compass bridge) to have access to project
timelines and task completion data from the broader ProjectHUD substrate.

**CMDs:** D-01 · D-02 · D-03

---

### 10.2 — Track E: Cross-module Integration

**E-01 — Compass bridge:**
Connect Accord workstreams to Compass projects. An Accord workstream maps
to one or more Compass projects. Action items created in Accord can be
pushed to Compass task lists. Meeting minutes from Accord appear in
the Compass project activity stream.

**E-02 — Workstream → Project linkage:**
Bidirectional: tasks completed in Compass can resolve Accord action items.
NRA resolution detected from Compass task completion events.

**Design philosophy:** Accord is the meeting layer; Compass is the execution
layer. They share substrate but serve different moments in the work cycle.
The bridge should be seamless — not a manual export/import.

**CMDs:** E-01 · E-02

---

### 10.3 — Track F: CPM and PERT

**What it is:** Critical Path Method and Program Evaluation Review Technique
applied to the action item network across Accord meetings.

**Heavily discussed in earlier sessions.** Key design decisions:

- Action items form a directed acyclic graph (DAG) within a workstream
- Some actions block others — the critical path is the longest chain of
  dependencies that determines the minimum completion time
- PERT adds probabilistic duration estimates (optimistic / most likely / pessimistic)
  to each action, producing expected duration with variance

**CPM materializes in the Setup shell:**
- Action Items panel (right column) shows critical path overlay — thin amber
  spine on cards that are on the critical path
- Slack indicator shows days of float per action:
  red = 0–1 days, amber = 2–5, green = 6+
- "This action cannot slip" warning when a critical path item approaches its due date

**PERT materializes in the Projection Engine (Track D):**
- The probabilistic model feeds forward into scenario analysis
- "85% probability this workstream completes by [date]" derived from PERT estimates

**Substrate:** `accord_action_dependencies` table — simple predecessor/successor
FK pairs. CPM and PERT computed at render time, not stored.

**Dependencies:** Requires E-01 and E-02 for full cross-project critical path.
Intra-workstream critical path can ship independently.

**CMDs:** F-01 · F-02

---

### 10.4 — Track G: Resource and Schedule

**G-01 — Resource Heatmap:**
Visual representation of resource (person) utilization across all workstreams
and meetings over a rolling time window.

**Design intent from operator sessions:**
- X-axis: time (weeks or months)
- Y-axis: resources (people)
- Cell color: utilization density (cyan = light, amber = moderate, rose = overloaded)
- Click a cell → drill into which meetings/actions are driving that load
- Heatmap is the answer to: "Who is overloaded? When? On what?"

**Primary use case:** Vaughn preparing next quarter's meeting schedule.
Before scheduling a new meeting series, he checks the heatmap to see
which attendees are already overloaded in that window.

**G-02 — Schedule manipulation:**
Drag meetings in the heatmap view to reschedule. Propagates to
`accord_meetings.scheduled_for`. Conflict detection: if rescheduling
would stack two meetings for the same attendee, surface a warning.

**Substrate:** Reads from `accord_meetings`, `accord_meeting_attendees`,
`accord_action_items` (Compass bridge required for full picture).

**Dependencies:** E-01 for cross-project resource data. Can ship
with Accord-only data first (meetings + action items without Compass tasks).

**CMDs:** G-01 · G-02

---

### 10.5 — Track H: Daily Experience

**H-01 — Morning Brief:**
A daily AI-synthesized summary delivered to each ProjectHUD user at the
start of their workday. Contents:
- Meetings scheduled today with prep status (ready / not ready)
- Action items due today or overdue
- Decisions sealed yesterday that are relevant to their work
- NRAs that have become urgent since yesterday

Format: card-based summary in the Compass My Dashboard header (above the
existing KPI tiles). Not an email — an in-app surface that loads on sign-in.

**H-02 — Living Reference:**
A persistent, AI-maintained "state of the workstream" document that updates
after every meeting. Not meeting minutes — a rolling synthesis that answers:
"What is the current status of this workstream?" Always up to date. Always
one click away from the Setup shell.

**Design distinction:** Minutes are a record of what was said.
The Living Reference is a synthesis of what is true.

**H-03 — Identity unification:**
Accord currently has a split between `users.id` (auth UUID) and
`resources.id` (resource UUID). Several surfaces do joins to bridge this.
Identity unification creates a clean single identity layer that all surfaces
use consistently — no more dual-lookup patterns.

Also covers: the cross-firm resource problem (Ron's case). Invitations to
resources whose `firm_id` doesn't match `users.firm_id` should surface a
validation error in the Setup shell rather than silently failing.

**Dependencies:** H-01 requires Accord to be well-populated with meeting
data and NRAs — best shipped after Tracks A–F are mature.

**CMDs:** H-01 · H-02 · H-03

---

## §11 — Risk Register integration (deferred)

**Discussed in early sessions.** The Risk Register is a Compass concept —
project risks tracked with probability, impact, and mitigation plans.

**Accord's integration point:**
- Risks captured during Live Capture (tag type: Risk) feed into the
  workstream Risk Register
- The Risks subtab in the Setup shell left column surfaces the open risk
  register items for that workstream before the meeting
- Risk items can be escalated (increase severity), mitigated (add note),
  or closed (resolved) directly from the Setup shell

**Not yet designed in detail.** Requires a Risk Register substrate audit
to understand what already exists in Compass before designing the Accord
integration layer.

---

## §12 — Sentiment (deferred)

**Raised in operator sessions.** Sentiment analysis on meeting content —
not just what was decided but how it was said.

**Potential applications:**
- Meeting tone score (collaborative / tense / unresolved)
- Per-attendee sentiment trend over time
- Early warning signal: "Tom's tone in the last 3 meetings suggests increasing
  frustration with the DS-005 decision"

**Status:** No design decisions made. Flagged as a Track H candidate or
a standalone future track. Requires AI inference pipeline.

---

## §13 — CPM / PERT — substrate design

The following substrate tables are anticipated for Track F:

```sql
-- Action item dependencies (DAG edges)
CREATE TABLE accord_action_dependencies (
  dependency_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id        UUID NOT NULL,
  predecessor_id UUID NOT NULL REFERENCES accord_action_items(action_id),
  successor_id   UUID NOT NULL REFERENCES accord_action_items(action_id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PERT duration estimates
CREATE TABLE accord_action_pert (
  pert_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id        UUID NOT NULL,
  action_id      UUID NOT NULL REFERENCES accord_action_items(action_id),
  optimistic_d   INTEGER NOT NULL,  -- days
  likely_d       INTEGER NOT NULL,
  pessimistic_d  INTEGER NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

CPM computation: SQL recursive CTE over `accord_action_dependencies`.
PERT expected duration: `(O + 4M + P) / 6`. Variance: `((P - O) / 6)^2`.

---

## §14 — Iron Rules (complete list)

| IR | Rule |
|---|---|
| IR41 | Composer is local; only commit gestures broadcast |
| IR42 | Post-seal mutations rejected at DB; UI reflects closed-state |
| IR64 | IR64 verification mandatory before any code: confirm DOM, substrate, event chain |
| IR65 | Version bump is operator-managed — agents do not touch version.js |
| IR66 | Console-first debugging — diagnose via console/SQL before any file change |
| IR67 | File header version + date in every modified file before deploy |
| IR68 | One diagnostic at a time — never present two SQL/JS instructions if result of first changes second |
| IR69 | Test instructions mandatory and proactive, one step at a time after every deploy |
| IR70 | Minimum font sizes: rail labels 10px, card titles 12px, metadata 10px, mono 9px floor, buttons 10px |

---

## §15 — Alpha demo definition

**Target: end of May 2026**

**The demo flow:**
1. Vaughn opens Accord. Constellation shows his workstreams.
2. He clicks a workstream. Meetings listed.
3. He opens a scheduled meeting. Setup shell shows briefing, agenda, attendees.
4. He invites Angela from the Setup shell. She receives an email.
5. Angela clicks Accept in the email. Her RSVP badge turns green on Vaughn's screen.
6. Vaughn clicks BEGIN MEETING. Surface transitions to Live Capture.
7. He captures a decision, an action, a note during the mock meeting.
8. Angela joins on her session — sees the same meeting, same capture stream.
9. Both users chat in Team Chat. Messages appear in real time.
10. Vaughn ends the meeting. Surface shows sealed record.
11. Decision Ledger shows the sealed decision. Minutes show the action items.
12. Angela opens My Meetings. The meeting appears under completed.

**Minimum CMDs required for this demo:**
- ✅ All Setup shell CMDs (C-01 through C-14) — sealed
- ✅ Live Capture (A-08 chat, A-09 filmstrip) — sealed
- ✅ Invitation pipeline (PIPELINE-1) — sealed
- ✅ Meeting visibility RLS (VISIBILITY-1) — sealed
- ✅ My Meetings dashboard (MY-MEETINGS-2) — deployed
- 🔶 MY-MEETINGS-2 smoke tests 6–10 — pending
- 🔶 X-20 through X-23 — polish fixes

**Post-demo but important:**
- A-10 attachments
- CMD-ACCORD-SCHEDULE-1 calendar overlay
- Resend domain verification (F1)

---

## §16 — Architectural constants

- **Stack:** Vercel (frontend) + Supabase (substrate + Edge Functions)
- **Email:** Resend (via Edge Functions)
- **Auth:** Supabase Auth (`auth.uid()`)
- **Identity bridge:** `my_resource_id()` SQL function
- **Visibility gate:** `accord_meetings_select` RLS policy (organizer OR invited attendee)
- **Realtime:** Supabase realtime channels (postgres_changes)
- **APP_URL:** `https://project-hud-landing.vercel.app` (in Edge Function secrets)
- **Version pattern:** `v20260509-CMD-ACCORD-MEETING-SETUP-NNN` (IR65)
- **JS convention:** `var` only — no `let` or `const`
- **Click handlers:** `data-action` pattern — no anonymous `onclick`
- **Font:** Inter (UI) · IBM Plex Mono / SF Mono (mono) — per style doctrine
- **Token prefix:** `--ac-*` defined in `accord.html` `:root` block
- **Token source of truth:** deployed `accord-meeting-setup.css` (IR66)

---

*End Accord Product Requirements Specification v1.0 · 2026-05-14*
*Next update due after CMD-ACCORD-SCHEDULE-1 seals.*
