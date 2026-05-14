




## Iron Rule 70 — Minimum readable font sizes
**Ratified:** 2026-05-13
**Authority:** Vaughn Staples (Operator)

No label, heading, or body text in any Accord surface may use a font size
below these minimums:

- Rail labels / zone headers: 10px minimum
- Card titles: 12px minimum
- Card metadata / secondary text: 10px minimum
- Monospace labels (seq IDs, tags, timestamps): 9px minimum (floor for mono only)
- Button text: 10px minimum

Agents must not use 8px or smaller for any visible text. When in doubt,
go larger — readability always wins over compactness.

---
## Iron Rule 69 — Test instructions are mandatory and sequential
**Ratified:** 2026-05-13
**Authority:** Vaughn Staples (Operator)

After deploying any code change, the agent must proactively provide test
instructions without being asked. Test instructions must be delivered one
step at a time — present step 1, wait for the operator's result, then
present step 2. Never present a full test sequence in a single response.

Each step must state the expected result so the operator knows immediately
whether to proceed or halt.

Required format per step:
  Step N: [What to do]
  Expected: [What you should see if it worked]
  If not: [What to tell me]

---
## Iron Rule 68 — One diagnostic at a time
**Ratified:** 2026-05-13
**Authority:** Vaughn Staples (Operator)

A coding agent must issue only one SQL or JavaScript diagnostic instruction
per response, unless:
(a) the second instruction is explicitly a confirmation of the first result, or
(b) the two instructions are entirely unrelated with no data dependency between them.

An agent must never present a primary instruction followed by a corrective
"or run this instead" in the same response. Wait for the operator's result
before issuing the next instruction.

**The test:** Would the result of instruction 1 change what instruction 2 asks?
If yes — they must be in separate responses.

---
## Iron Rule 67 — File header version discipline
**Ratified:** 2026-05-13
**Authority:** Vaughn Staples (Operator)

Every JS, CSS, and HTML file modified by a coding agent must have its header
comment updated to include the current version string and modification date
before deployment. The version string must match the version.js pin (IR65).

**Required JS/HTML format:**
```
// Version: v20260509-CMD-ACCORD-MEETING-SETUP-XXX
// Modified: YYYY-MM-DD
```

**Required CSS format:**
```
/* Version: v20260509-CMD-ACCORD-MEETING-SETUP-XXX
   Modified: YYYY-MM-DD */
```

Any commission close-out that does not confirm updated headers in every
modified file is incomplete. The agent must show the updated header in
the close-out manifest.

---
## Iron Rule 66 — Console-first debugging doctrine
**Ratified:** 2026-05-13
**Authority:** Vaughn Staples (Operator)

All debugging and diagnostic work must be conducted via browser console (JavaScript)
or Supabase SQL editor before any code file is modified. A coding agent must exhaust
console-based diagnosis — confirming root cause with evidence — before proposing a
file change. File changes are only permitted after the root cause is confirmed and
the fix is known. Guessing via repeated file edits is not permitted.

**Exception:** When the required diagnostic is architecturally impossible from the
console (e.g. Edge Function internals, server-side trigger source inspection), the
agent must explicitly state why console diagnosis is insufficient before requesting
a file upload or modification.

**Enforcement:** Every commission brief must include the following agent instruction:
"IR66 is in effect. Diagnose via console or SQL first. Confirm root cause with
evidence before modifying any file."

---
# Accord CMD Development Registry
## Compiled: 2026-05-10 · Through C-09 (C-09 drag visual pending)

This document is the authoritative CMD registry for the Accord platform module.
Intended audience: incoming architect. Read before any session work.

---

## Architecture overview

Accord is a meeting intelligence platform built on top of ProjectHUD/Supabase. The build
is structured as a series of numbered CMDs (Commission Documents), each with a coding agent
as the executor and the architect as design authority. CMDs chain — each seals before the
next is commissioned.

The CMD naming convention evolved mid-build:
- **Early CMDs** used long-form names: `CMD-ACCORD-NRA-SUBSTRATE-1`
- **Current CMDs** use short-form track+number codes: `C-01` through `C-13`


## Master CMD Registry — All Tracks

| Track | # | CMD | Status |
|---|---|---|---|
| **A — Accord Core** | A-01 | CMD-A1 — Substrate foundation (6 tables, CoC, seal trigger) | SEALED |
| | A-02 | CMD-A2 — URI resolver edge function | SEALED |
| | A-03 | CMD-A3 — Living Document surface | SEALED |
| | A-04 | CMD-A4 — Living Document + Decision Ledger nav | SEALED |
| | A-05 | CMD-A5 — Decision Ledger surface | SEALED |
| | A-06 | CMD-A6 — Digest & Send placeholder | SEALED |
| | A-07 | CMD-A7 — Minutes render engine | SEALED |
| | A-07.1 | CMD-A7-POLISH-1 — Minutes editorial register | SEALED |
| | A-07.2 | CMD-A1.6 — Broadened seal scope | SEALED |
| **B — NRA** | B-01 | CMD-ACCORD-NRA-SUBSTRATE-1 | SEALED |
| | B-02 | CMD-ACCORD-WORKSTREAMS-SUBSTRATE-1 | SEALED |
| | B-03 | CMD-ACCORD-CONSTELLATION-ENTRY-1 | SEALED |
| | B-04 | CMD-ACCORD-NRA-SURFACE-1 (Phases 1–5) | SEALED |
| **C — Meeting Setup · Wave 1** | C-01 | CMD-ACCORD-SETUP-LAYOUT-1 | SEALED |
| | C-02 | CMD-ACCORD-SETUP-HEADER-1 | SEALED |
| | C-03 | CMD-ACCORD-SETUP-OUTCOMES-1 | SEALED |
| | C-04 | CMD-ACCORD-SETUP-ATTENDEES-1 | SEALED |
| | C-05 | CMD-ACCORD-SETUP-FILMSTRIP-2 | SEALED |
| **C — Meeting Setup · Wave 2** | C-06 | CMD-ACCORD-SETUP-BRIEFING-TABS-1 | SEALED |
| | C-07 | CMD-ACCORD-SETUP-AGENDA-ENHANCED-1 | SEALED |
| | C-08 | CMD-ACCORD-SETUP-INTELLIGENCE-1 | SEALED |
| | C-09 | CMD-ACCORD-SETUP-ACTION-KANBAN-1 | IN PROGRESS |
| | C-10 | CMD-ACCORD-SETUP-SLIDESHOW-1 | SEALED |
| **C — Wave 4** | C-14 | CMD-ACCORD-SETUP-FILMSTRIP-CARDS-1 — Progressive card info density | SEALED |
| **C — Meeting Setup · Wave 3** | C-11 | CMD-ACCORD-SETUP-PERCOLATE-1 | QUEUED |
| | C-12 | CMD-ACCORD-SETUP-GATHERING-1 | SEALED |
| | C-13 | CMD-ACCORD-SETUP-VERDICT-1 | SEALED |
| **D — Projection Engine** | D-01 | CMD-PROJECTION-ENGINE-1 | QUEUED |
| | D-02 | CMD-SUBSTRATE-COUNTERFACTUAL-MIN | QUEUED |
| | D-03 | CMD-COUNTERFACTUAL-POC | QUEUED |
| **E — Cross-module Integration** | E-01 | CMD-COMPASS-BRIDGE | QUEUED |
| | E-02 | CMD-SUBSTRATE-CPM-MIN | QUEUED |
| **F — CPM and PERT** | F-01 | CMD-CPM-DERIVED | QUEUED |
| | F-02 | CMD-PERT-EXTENSION | QUEUED |
| **G — Resource and Schedule** | G-01 | CMD-RESOURCE-HEATMAP | QUEUED |
| | G-02 | CMD-SCHEDULE-MANIPULATION | QUEUED |
| **H — Daily Experience** | H-01 | CMD-MORNING-BRIEF | QUEUED |
| | H-02 | CMD-LIVING-REFERENCE | QUEUED |
| | H-03 | CMD-IDENTITY-UNIFICATION | QUEUED |
| **X — Ancillary** | X-01 | CMD-ACCORD-MEETING-ATTACHMENTS-1 | QUEUED |
| | X-02 | CMD-ACCORD-MEETING-INVITATIONS-1 | QUEUED |
| | X-03 | CMD-ACCORD-OUTCOME-RATIFICATION-1 | QUEUED |
| | X-04 | CMD-ACCORD-NRA-BRIEFING-PACK-1 | QUEUED |
| | X-05 | CMD-ACCORD-NODE-RESOLUTION-SUBSTRATE-1 | QUEUED |
| | X-06 | CMD-ACCORD-NEWMEETING-ROUTING-FIX-1 | SEALED |
| | X-07 | CMD-ACCORD-CAPTURE-CONTROLS-FIX-1 | QUEUED |
| | X-08 | CMD-BRIEFING-SYNTHESIS-1 (AI) | QUEUED |
| | X-09 | CMD-ATTENDEE-PATTERNS-1 (AI) | QUEUED |
| | X-10 | CMD-ACCORD-GRID-TIMEZONE-FIX-1 — Grid date parse UTC bug | RESOLVED (inline C-11) |
| | X-11 | CMD-ACCORD-BRIEFING-EDIT-FIX-1 — "Write one" click targets wrong field | SEALED |
| | X-12 | CMD-ACCORD-SETUP-DURATION-EDIT-1 — Inline duration edit in header WHEN row | SEALED |
| | X-13 | CMD-ACCORD-SETUP-TRANSITIONS-FIX-1 — startMeeting level-changed not firing from Setup shell | RESOLVED (accord-core.js inline) |
| | X-14 | CMD-ACCORD-SETUP-WHEN-PICKER-1 — Date/time picker for scheduled_for on WHEN row | SEALED |

**Total CMDs:** ~51 · **Sealed:** 30 · **In Progress:** 0 · **Queued:** ~17 · **Wave 2 closed · Wave 3 closed · Setup Shell complete · Begin Meeting live**

---

---

## Track A — NRA Substrate (SEALED)

### CMD-ACCORD-NRA-SUBSTRATE-1 · SEALED

The foundational NRA (Next Required Action) substrate. All subsequent Accord work
depends on this.

**Delivered:**
- `accord_nras` table (the core NRA record)
- `accord_nras_current` view — one row per node, current NRA state
- 7 RLS policies (disjoint per-transition per IR73)
- 6 indexes
- 5 helper functions: `declare_nra`, `waive_nra`, `defer_nra`, `resolve_nra`, `supersede_nra`
- 2 trigger functions: meeting-INSERT trigger (candidate detection) + meeting-seal trigger
- 6 CoC EVENT_META entries

**State machine:** `declared → resolved | superseded | deferred` · `deferred → declared` · `waived` (terminal for UPDATE, not insert-blocking — see doctrine)

**Key finding confirmed:** waived NRAs are UPDATE-terminal (IR73) but not insert-blocking. `declare_nra` over a waived row inserts a fresh current NRA; waived row preserved in history.

---

### CMD-ACCORD-WORKSTREAMS-SUBSTRATE-1 · SEALED

Added the `workstreams` table to the substrate.

**Delivered:**
- `workstreams` table with `workstream_id UUID PK`, `firm_id`, `name`, `state` (active|archived), `created_at`
- Note: `project_id` column was added later during C-07 (see Track C below)

---

## Track B — NRA Surface (SEALED)

### CMD-ACCORD-NRA-SURFACE-1 · SEALED (5 phases, 2026-05-09)

The operator-facing NRA surface. Wired into 3 existing surfaces via `wireBadgesIn`.

**Phase 1 — Investigation:** IR72 cross-module survey of 6 surfaces. 8-archetype walkthrough. Substrate verification. Halt-and-surface with Phase 2 entry recommendation.

**Phase 2 — Modal + badge components:**
- `AccordNRAModal` — capture + edit modal (declare / waive / defer / update modes)
- `AccordNRABadge` — 8 variants: declared-external, declared-internal-event, declared-internal-operator, waived, deferred (color-aged), resolution-candidate, history-only, grandfathered
- `AccordNRAHistoryPanel` — side panel, vertical timeline newest-first

**Phase 3 — Surface wiring: node-creation paths:**
- `accord-capture.js` wired
- `accord-document.js` wired
- `accord-ledger.js` wired

**Phase 4 — Surface wiring: display paths:**
- `fetchBadgeData(nodeIds)` — batched GET, two PostgREST round-trips regardless of node count
- `wireBadgesIn(container, lookup)` — per-surface helper; installs + returns `refresh()`
- `accord-capture.js`, `accord-document.js`, `accord-ledger.js` all call `wireBadgesIn`
- Cross-surface reactivity via 6 `accord:nra-*` CustomEvents

**Phase 5 — Closure:**
- State-aware update dispatch: `_waivedRegionHtml()` — waived block with "Declare a new NRA" affordance
- All 11 smoke tests passed
- CMD sealed

**Files shipped:** `accord-nra.js` (1020 lines), `accord-nra.css` (~370 lines)

**Queued from this CMD:**
- `CMD-ACCORD-NRA-BRIEFING-PACK-1` — briefing-pack integration (overdue NRA surfacing, deferred-aging escalation)
- `CMD-ACCORD-NODE-RESOLUTION-SUBSTRATE-1` — `accord_nodes` resolution semantic + deferred third NRA trigger
- `CMD-ACCORD-NRA-OWNER-VISIBILITY-1` — owner-facing NRA visibility
- Waived-region CSS — `.nra-waived-*` classes unstyled; absorb into BRIEFING-PACK or standalone micro-CMD

---

## Track C — Meeting Setup Shell (IN PROGRESS)

The Meeting Setup Shell CMD was originally `CMD-ACCORD-MEETING-SETUP-1` (multi-phase).
It was refactored into individual commission briefs (C-01 through C-13) for tighter
agent control. The C-xx series is the current active build sequence.

### CMD-ACCORD-MEETING-SETUP-1 (ancestor CMD) · Superseded by C-xx chain

**Phase 1 — Investigation (sealed):**
- Confirmed no dedicated pre-meeting view existed; unified meeting-level tab shell served all states
- Locked Option β: whole-surface swap on `state='idle'`, not a 6th tab
- Confirmed production state enum: `idle | running | closed` (`idle` = draft-equivalent)
- Resolved `accord_meetings.organizer_id` column name (not `organized_by_user_id`)
- Deferred: Carried References (no substrate), footer connected-status, pull-as-thread linkage design

**Phase 2 (absorbed into C-01 + C-02):**
- Substrate: `briefing_text` column + state-gate trigger on `accord_meetings`
- Setup shell chrome: 3-column layout, filmstrip zone, footer with Begin Meeting

---

## C-01 through C-13 — Commission Brief Chain

### C-01 · SETUP-LAYOUT-1 · SEALED

**Scope:** 4-zone CSS grid layout. Full-page mechanism. Rails hide/show.

**Key findings:**
- Rails: `.ac-rail-left` and `.ac-rail-right` — both must be hidden when setup shell is active
- Parent: `MAIN.ac-center`

---

### C-02 · SETUP-HEADER-1 · SEALED

**Scope:** Header zone — meeting title (contenteditable), stakes field, location field, FOLLOW-UP / FIRST-EVER toggle.

**Substrate additions:**
- `accord_meetings.stakes TEXT NULL`
- `accord_meetings.location TEXT NULL`
- `accord_meetings.duration_minutes INT NULL`
- Trigger: `accord_meetings_field_gate_trg` (BEFORE UPDATE) — gates `briefing_text`, `stakes`, `location`; immutable once `state <> 'idle'`; organizer-only for `briefing_text` and `stakes`

**Note:** The old trigger name `accord_meetings_briefing_text_gate_trg` was dropped and replaced by `accord_meetings_field_gate_trg`. Any document referencing the old name is stale.

---

### C-03 · SETUP-OUTCOMES-1 · SEALED

**Scope:** Intended Outcomes block in center column tabbody.

**Substrate additions:**
- `accord_meeting_outcomes` table (PK: `outcome_id`)
- Columns: `firm_id`, `meeting_id` (CASCADE DELETE), `verb` (CHECK: RESOLVE|SEAL|DECIDE|ASSIGN|DEFER|INFORM), `description`, `owner_resource_id` (FK→resources), `condition`, `status` (CHECK: open|achieved|partial|carried|abandoned; DEFAULT 'open'), `position`, `resolved_at`, `created_at`, `created_by`
- Trigger: `accord_meeting_outcomes_state_gate_trg` — rejects INSERT/UPDATE if parent meeting `state <> 'idle'`
- IR73 note: disjoint per-transition UPDATE policies for outcome ratification deferred to X-03

---

### C-04 · SETUP-ATTENDEES-1 · SEALED

**Scope:** Attendees panel in right column.

**Substrate additions:**
- `accord_meeting_attendees` table (PK: `attendee_id`)
- Columns: `firm_id`, `meeting_id` (CASCADE DELETE), `resource_id` (FK→resources), `role_in_meeting` (CHECK: organizer|lead|participant|observer; DEFAULT 'participant'), `rsvp_status` (CHECK: pending|accepted|declined|tentative; DEFAULT 'pending'), `invited_at`, `created_at`
- UNIQUE constraint: `(meeting_id, resource_id)`
- Organizer auto-seeded at Setup shell render if absent

**Critical identity resolution confirmed:**
- `accord_meeting_attendees.resource_id` → `resources.id` (NOT `auth.users.id`)
- `accord_meetings.organizer_id` → `auth.users.id`
- Join pattern: `users.id → resources.user_id → resources.id`

---

### C-05 · SETUP-FILMSTRIP-2 · SEALED

**Scope:** Full-width filmstrip strip + scrub overlay for prior meeting capture review.

**Defects resolved:**
- Duplicate `_renderFilmstrip` from Phase 6 of earlier work — deleted
- `isConnected` guard for double-`setLevel` from `accord-rails.js:331`

---

### C-06 · SETUP-BRIEFING-TABS-1 · SEALED

**Scope:** Left column tab bar — Briefing / Decisions / Risks tabs.

**Key V6 finding:** `workstreams.project_id` did not exist at time of build → Risks tab showed empty state. Fixed by C-07 substrate addition.

---

### C-07 · SETUP-AGENDA-ENHANCED-1 · SEALED

**Scope:** Center column tab bar (Agenda / Minute Notes stepper) + full agenda list with drag-to-reorder, item type pills, time estimates, add-item row, prep prompt.

**Substrate additions:**
- `accord_agenda_items.item_type TEXT NULL` (CHECK: DECIDE|ASSIGN|INFORM|RISK|QUESTION)
- `accord_agenda_items.duration_minutes_estimate INT NULL`
- `workstreams.project_id UUID NULL` (FK→projects; enables Risks tab join)

**Defects resolved (6 total):**
- `ac-col-placeholder` blocking agenda container — removed on first render
- `agendaContainer` captured reference detached by second render — fixed with IR71 re-query
- Position collision on INSERT — fixed with `max(position) + 1`
- Position collision on drag swap — fixed with three-step swap via temp position -1
- Drag not firing — fixed with `data-drag-handle` attribute on handle, static `draggable="true"`
- Minute Notes / Agenda tab conflict — three-state center column design implemented

**Three-state center column (canonical):**
- No scrub + Agenda tab → idle meeting agenda
- Scrub active + Agenda tab → prior meeting agenda items
- Scrub active + Minute Notes tab → prior meeting captured nodes

---

### C-08 · SETUP-INTELLIGENCE-1 · SEALED

**Scope:** Cmd+I Intelligence Mode overlay (private layer) + attendee card behavioral status enrichment.

**Substrate additions:**
- `accord_meeting_intel_notes` table (PK: `note_id`)
- Columns: `firm_id`, `meeting_id` (CASCADE DELETE), `author_resource_id` (FK→resources), `body`, `is_private BOOLEAN DEFAULT TRUE`, `created_at`, `updated_at`
- RLS: author-only SELECT/INSERT/UPDATE/DELETE via `resources.user_id = auth.uid()` subquery
- Index: `(meeting_id, author_resource_id)`

**Intelligence derivation thresholds (v1, substrate-only, no AI):**
- DISSENT·SIMMERING: dissent age ≥ 14 days
- OVERDUE·PRESSURE: 2+ overdue actions (due_date < now())
- QUIET·RE-ONBOARD: zero nodes authored, zero actions
- ENGAGED·STEADY: default
- Urgency "move now" suffix: dissent age ≥ 20 days

**Known environment issue:** `Cmd+I` (Mac) / `Ctrl+I` (Win) — works. `Ctrl+Shift+I` fallback was retracted; it conflicts with browser DevTools.

---

### C-09 · SETUP-ACTION-KANBAN-1 · IN PROGRESS (drag visual issue pending)

**Scope:** Right column tab bar (Attendees / Action Items) + time-anchored kanban + calendar grid view.

**Right column tab bar:** Attendees / Action Items. `_rightActiveTab` persists across re-renders.

**Kanban columns:** Past Due · Mon · Tue · Wed · Thu · Fri · Next Week · Unscheduled (8 columns total)

**Substrate fix during C-09:**
- `accord_meeting_seal_fn()` was propagating `sealed_at` to ALL child `accord_nodes` including action nodes — wrong. Fixed by adding `AND tag <> 'action'` to the seal loop and Merkle root computation.
- All existing action nodes unsealed: `UPDATE accord_nodes SET sealed_at = NULL WHERE tag = 'action'`
- Doctrine candidate: *"Action nodes are forward-looking workstream commitments, not meeting transcript content. The seal trigger must exclude tag='action'. Action nodes remain mutable across the workstream lifecycle."*

**Drag-to-reschedule status:**
- PATCH fires correctly: `accord_nodes.due_date` updated, RLS permits (gated on `sealed_at IS NULL`)
- Data persists correctly: verified via Supabase query
- **Remaining issue:** browser shows visual snap-back animation after drop despite successful PATCH
- Root cause: `setDragImage` with off-screen `div` — Chrome currently not accepting drag initiation
- **Recommended disposition:** Accept cosmetic snap-back as known issue, seal C-09, address in Wave 3 polish CMD. Drag is functionally correct.

**Smoke test results:**
- Tests 1–5: PASS
- Test 6 (drag-to-reschedule): substrate PASS, visual PENDING
- Test 7 (cross-substrate highlight): PASS

---

### C-10 · SETUP-SLIDESHOW-1 · SEALED

**Scope:** Auto-rotation tabs (left and right columns). Spec: Requirements v1.1 §9.2.

Left column: Briefing pinned; rotation opt-in (toggle AUTO·MANUAL); Decisions + Risks at 15s intervals.
Right column: Full auto-rotation by default; Attendees → Action Items → Attachments at 15s; cursor pause; 3s grace; 60s pause on manual click.
Progress indicator: 1px draining line at bottom of column header.

---

### C-11 · SETUP-PERCOLATE-1 · QUEUED

**Scope:** Click-to-percolate-by-person. Clicking any person reference rises their items, fades others to 0.35 opacity, shows "Filtered: [Name] · ✕" pill.

---

### C-12 · SETUP-GATHERING-1 · QUEUED

**Scope:** Gathering mode — auto-engages 15 min before `scheduled_for`. Right column collapses to roster + conn-dots. 5-min warning.

---

### C-13 · SETUP-VERDICT-1 · QUEUED

**Scope:** Footer verdict pill (GO / GO WITH CAVEATS / NOT READY) + Begin Meeting wiring. Closes Wave 3. Also consumes `accord_agenda_items.duration_minutes_estimate` for time budget bar.

---

## Ancillary / follow-on CMDs queued

| CMD | Type | Notes |
|---|---|---|
| CMD-ACCORD-NRA-BRIEFING-PACK-1 | Feature | NRA signals in operator-prep context. Commission after Meeting Setup is established. |
| CMD-ACCORD-NODE-RESOLUTION-SUBSTRATE-1 | Substrate | `accord_nodes` resolution semantic + deferred third NRA trigger. |
| CMD-ACCORD-NRA-OWNER-VISIBILITY-1 | Feature | Owner-facing NRA visibility. |
| CMD-ACCORD-MEETING-ATTACHMENTS-1 | Substrate + surface | `accord_meeting_attachments` table. Enables Carried References pane. |
| CMD-ACCORD-OUTCOME-RATIFICATION-1 (X-03) | Substrate | Disjoint per-transition UPDATE RLS for `accord_meeting_outcomes.status`. |
| CMD-ACCORD-CAPTURE-CONTROLS-FIX-1 | Defect fix | Tag buttons + captureInput disabled despite meeting=running on level-changed transition path. |

---

## Iron Rules summary (coding agent must know these)

| Rule | Constraint |
|---|---|
| `var` only | No `let` or `const` — ever |
| onclick pattern | Zero-arg onclick handlers; `data-action` on every interactive element |
| Font floor | Arial ≥12pt in all rendered text; mono ≥14pt |
| Version badge | Orange console badge on every version bump (operator-managed via IR65) |
| DB naming | `snake_case` throughout |
| No enums | `text` columns + CHECK constraints only |
| Every table | `firm_id UUID` + `created_at TIMESTAMPTZ` + UUID PKs |
| No hardcoded firm data | Always filter by `my_firm_id()` |
| Cache-busting | Version-string in script/link tags for Vercel deploys |
| IR64 | Verify schema before writing any code. Halt-and-surface on mismatches. |
| IR65 | Version pin bump on surface changes — operator-managed |
| IR67 | 8-archetype walkthrough on every surface CMD |
| IR68 | Privacy-by-surface: operator-private content never leaks to non-organizers |
| IR71 | State-mutation-before-invalidation: re-query DOM after async; never use stale references |
| IR72 | Cross-module survey mandatory at Phase 1 of multi-surface CMDs |
| IR73 | State-machine substrates use disjoint per-transition UPDATE RLS WITH CHECK |

---

## Schema inventory

See `accord-schema-inventory-v1.2.md` for confirmed column names, RLS policies, triggers, and identity resolution patterns.

**Most important section:** §3 — Identity resolution. `resources.id` vs `auth.users.id` confusion is the #1 source of silent bugs across the build.

---

## Operator note

Read the handoff document (`architect-handoff-2026-05-10.md`) alongside this registry.
The handoff covers communication style, what's strained, and the active C-09 drag debugging state.

---

*End Accord CMD Registry · 2026-05-10 · Through C-09*
