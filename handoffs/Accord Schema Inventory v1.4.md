# ProjectHUD — Accord Schema Inventory (Living Document)
## Last updated: 2026-05-10 · Through C-07 · CMD-ACCORD-SETUP-AGENDA-ENHANCED-1

This document is the authoritative schema reference for the Accord module substrate.
Updated after every CMD that touches the database. Future architects: read this before
querying `information_schema`. Do not guess column names — they are confirmed here.

---

## §1 — Confirmed tables and columns

### `accord_meetings`
**PK:** `meeting_id UUID`
**Canonical select list (as of C-07):**
`meeting_id, firm_id, title, workstream_id, scheduled_for, created_at, sealed_at, state, organizer_id, briefing_text, duration_minutes, stakes, location`

| Column | Type | Notes |
|---|---|---|
| `meeting_id` | uuid | PK |
| `firm_id` | uuid | FK → firms(id) |
| `project_id` | uuid | FK → projects(id) — nullable |
| `title` | text | contenteditable in Setup shell |
| `organizer_id` | uuid | FK → **auth.users(id)** NOT resources(id) — confirmed C-04 |
| `scheduled_for` | timestamptz | |
| `duration_minutes` | integer | nullable — added C-02 (MEETING-SETUP-1 Phase 7) |
| `state` | text | CHECK: `idle \| running \| closed` — confirmed C-02 |
| `started_at` | timestamptz | |
| `ended_at` | timestamptz | |
| `sealed_at` | timestamptz | |
| `merkle_root` | text | |
| `agenda_locked` | boolean | |
| `workstream_id` | uuid | FK → workstreams; nullable (parking-lot meetings) |
| `briefing_text` | text | nullable — added MEETING-SETUP-1 Phase 2 |
| `stakes` | text | nullable — added C-02 |
| `location` | text | nullable — added C-02 |
| `created_at` | timestamptz | |

**Triggers:**
- `accord_meetings_field_gate_trg` (BEFORE UPDATE) — gates `briefing_text`, `stakes`, `location`; immutable once `state <> 'idle'`; organizer-only for `briefing_text` and `stakes`

**RLS policies (confirmed C-02):**
- SELECT: `firm_id = my_firm_id()`
- INSERT: `firm_id = my_firm_id() AND organizer_id = auth.uid()`
- UPDATE: `firm_id = my_firm_id()` (permissive; field-level gates via trigger)
- DELETE: `firm_id = my_firm_id() AND organizer_id = auth.uid() AND sealed_at IS NULL`

---

### `accord_nodes`
**PK:** `node_id UUID`

| Column | Type | Notes |
|---|---|---|
| `node_id` | uuid | PK |
| `firm_id` | uuid | FK → firms |
| `thread_id` | uuid | |
| `meeting_id` | uuid | FK → accord_meetings |
| `agenda_item_id` | uuid | FK → accord_agenda_items; nullable |
| `tag` | text | `note \| decision \| action \| risk \| question \| dissent` — confirmed C-05 |
| `summary` | text | |
| `body` | text | |
| `attachments` | jsonb | |
| `created_at` | timestamptz | |
| `created_by` | uuid | FK → **auth.users(id)** NOT resources(id) — confirmed C-04 V5 |
| `sealed_at` | timestamptz | |
| `status` | text | |
| `declared_belief_at_commit` | integer | |
| `declared_need` | text | |
| `success_criteria` | text | |
| `validation_due` | date | |
| `declared_addresses_need` | integer | |
| `compass_action_ref` | text | |
| `prev_node_hash` | text | |
| `node_hash` | text | |
| `seq_class` | character | |
| `seq_number` | integer | |
| `seq_id` | text | e.g. DC-014, AX-091 |
| `dissented_by` | uuid | FK → auth.users(id); populated on dissent nodes |
| `dissent_rationale` | text | |
| `dissent_predicted_outcome` | text | |
| `dissent_recorded_at` | timestamptz | |
| `effective_date` | date | |
| `due_date` | date | populated on action nodes |

**Tag canonical display order:** Note (N) · Decision (D) · Action (A) · Risk (R) · Question (Q) · Dissent (Di)
*Locked 2026-05-09 per MEETING-SETUP-1 Phase 6 close-out*

---

### `accord_agenda_items`
**PK:** `agenda_item_id UUID`

| Column | Type | Notes |
|---|---|---|
| `agenda_item_id` | uuid | PK |
| `firm_id` | uuid | FK → firms |
| `meeting_id` | uuid | FK → accord_meetings |
| `position` | integer | sort order |
| `title` | text | |
| `status` | text | CHECK: `pending \| discussed \| skipped` (confirmed C-03) |
| `sealed_at` | timestamptz | |
| `created_at` | timestamptz | |
| `pulled_from_node_id` | uuid | nullable — FK → accord_nodes; added MEETING-SETUP-1 Phase 3 |
| `pulled_from_tag` | text | nullable — added MEETING-SETUP-1 Phase 4 |
| `item_type` | text | nullable — CHECK: `DECIDE\|ASSIGN\|INFORM\|RISK\|QUESTION`; added C-07 |
| `duration_minutes_estimate` | integer | nullable — added C-07; feeds C-13 budget bar |

---

### `accord_nras`
**PK:** `nra_id UUID`

State machine: `declared → resolved \| superseded \| deferred`; `deferred → declared`; `waived` (terminal for UPDATE; not insert-blocking)

**UPDATE RLS:** disjoint per-transition policies per IR73 (5 policies — confirmed CMD-ACCORD-NRA-SUBSTRATE-1)

**Views:** `accord_nras_current` — returns the current NRA for each node (confirmed C-06 V5 carry-forward)

---

### `accord_meeting_outcomes`
**PK:** `outcome_id UUID`
*Added C-03 · CMD-ACCORD-SETUP-OUTCOMES-1*

| Column | Type | Notes |
|---|---|---|
| `outcome_id` | uuid | PK |
| `firm_id` | uuid | FK → firms |
| `meeting_id` | uuid | FK → accord_meetings ON DELETE CASCADE |
| `verb` | text | CHECK: `RESOLVE\|SEAL\|DECIDE\|ASSIGN\|DEFER\|INFORM` |
| `description` | text | |
| `owner_resource_id` | uuid | nullable FK → resources(id) |
| `condition` | text | nullable — for DEFER type |
| `status` | text | CHECK: `open\|achieved\|partial\|carried\|abandoned`; DEFAULT 'open' |
| `position` | integer | |
| `resolved_at` | timestamptz | nullable |
| `created_at` | timestamptz | |
| `created_by` | uuid | nullable FK → users(id) |

**Triggers:** `accord_meeting_outcomes_state_gate_trg` (BEFORE INSERT OR UPDATE) — rejects if parent meeting `state <> 'idle'`

**IR73 note:** UPDATE policy currently gates on `status='open'` only (pre-meeting prep phase). Disjoint per-transition UPDATE policies for ratification (open→achieved etc.) are deferred to X-03 (CMD-ACCORD-OUTCOME-RATIFICATION-1).

---

### `accord_meeting_attendees`
**PK:** `attendee_id UUID`
*Added C-04 · CMD-ACCORD-SETUP-ATTENDEES-1*

| Column | Type | Notes |
|---|---|---|
| `attendee_id` | uuid | PK |
| `firm_id` | uuid | FK → firms |
| `meeting_id` | uuid | FK → accord_meetings ON DELETE CASCADE |
| `resource_id` | uuid | FK → resources(id) |
| `role_in_meeting` | text | CHECK: `organizer\|lead\|participant\|observer`; DEFAULT 'participant' |
| `rsvp_status` | text | CHECK: `pending\|accepted\|declined\|tentative`; DEFAULT 'pending' |
| `invited_at` | timestamptz | DEFAULT now() |
| `created_at` | timestamptz | |

**UNIQUE constraint:** `(meeting_id, resource_id)` — one row per attendee per meeting

**Organizer auto-seeded** at Setup shell render if absent.

---

### `accord_meeting_intel_notes`
**PK:** `note_id UUID`
*Added C-08 · CMD-ACCORD-SETUP-INTELLIGENCE-1*

| Column | Type | Notes |
|---|---|---|
| `note_id` | uuid | PK |
| `firm_id` | uuid | FK → firms |
| `meeting_id` | uuid | FK → accord_meetings ON DELETE CASCADE |
| `author_resource_id` | uuid | FK → resources(id) |
| `body` | text | DEFAULT '' |
| `is_private` | boolean | DEFAULT TRUE — never surfaced in minutes or shared records |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**RLS:** author-only SELECT/INSERT/UPDATE/DELETE. Policy uses `resources.user_id = auth.uid()` subquery.
**Index:** `(meeting_id, author_resource_id)`

---

### `accord_edges`
**PK:** `edge_id UUID`

| Column | Type | Notes |
|---|---|---|
| `edge_id` | uuid | PK |
| `firm_id` | uuid | FK → firms |
| `from_node_id` | uuid | FK → accord_nodes |
| `to_node_id` | uuid | FK → accord_nodes; nullable |
| `to_external_ref` | text | nullable — for external cross-references |
| `edge_type` | text | e.g. `precedence`, `supports`, `contradicts` |
| `rationale` | text | |
| `declared_at` | timestamptz | |
| `declared_by` | uuid | FK → auth.users(id) |
| `sealed_at` | timestamptz | |
| `edge_hash` | text | |

*Confirmed C-07 V6 — 2026-05-10*

---

### `accord_belief_adjustments`
**PK:** `adjustment_id UUID`

| Column | Type | Notes |
|---|---|---|
| `adjustment_id` | uuid | PK |
| `firm_id` | uuid | |
| `target_node_id` | uuid | FK → accord_nodes (decision nodes) — confirmed C-06 V3 |
| `delta` | integer | positive = belief strengthened; negative = weakened |
| `rationale` | text | |
| `declared_at` | timestamptz | |
| `declared_by` | uuid | FK → **auth.users(id)** — confirmed C-06 V3 |
| `linked_evidence_node_id` | uuid | nullable |
| `sealed_at` | timestamptz | |
| `adjustment_hash` | text | |

---

### `accord_workstreams` (= `workstreams`)
**Note:** table is named `workstreams` in queries, not `accord_workstreams`
**Confirmed from:** accord-views.js line 47 `workstreams?state=eq.active`

| Column | Type | Notes |
|---|---|---|
| `workstream_id` | uuid | PK |
| `firm_id` | uuid | |
| `name` | text | |
| `state` | text | `active \| archived` |
| `project_id` | uuid | nullable FK → projects(id) — **added C-07**; enables Risks tab |
| `created_at` | timestamptz | |

---

### `accord_minutes_renders`
| Column | Type | Notes |
|---|---|---|
| `render_id` | uuid | PK |
| `firm_id` | uuid | |
| `meeting_id` | uuid | FK → accord_meetings |
| `rendered_at` | timestamptz | |
| `rendered_by` | uuid | |
| `render_version` | text | |
| `storage_path` | text | |
| `content_hash` | text | |
| `merkle_root_at_render` | text | |
| `status` | text | |
| `failure_reason` | text | |
| `byte_size` | bigint | |
| `page_count` | integer | |
| `template_id` | text | |

---

## §2 — Adjacent tables (non-Accord, referenced by Accord surface)

### `resources`
**PK:** `resources.id UUID` *(confirmed C-03 V1)*
**Name column:** `resources.name` *(confirmed C-03 V1)*
**User link:** `resources.user_id` → auth.users(id) *(confirmed C-04 V4)*

Used for: attendee display names, action ownership, outcome owner chips, organizer seed.

### `risk_register`
**PK:** `risk_register.id UUID` *(confirmed C-06 V1)*
**Score column:** `weighted_score` *(confirmed C-06 V1)*
**Description columns:** `description` with `title` as fallback *(confirmed C-06 V1)*
**Status column:** `status` (USER-DEFINED type — valid values TBD) *(C-06 V1)*
**FK:** `project_id` → projects(id) *(confirmed C-06 V1)*
**RLS:** `risk_register_internal` — ALL cmd, firm-scoped + `NOT is_client()` *(confirmed C-06 V2)*

**Join path to workstream:** `workstreams.project_id → projects.id ← risk_register.project_id`
*This join path was missing until C-07 added `workstreams.project_id`. Now active once populated.*

### `projects`
Referenced by `risk_register.project_id` and `workstreams.project_id`.

### `firms`
**Referenced everywhere.** `my_firm_id()` is a Supabase function returning the current user's firm.

---

## §3 — Critical identity resolution pattern

**This is the most common source of defects across CMDs. Read carefully.**

| Field | Type | Table |
|---|---|---|
| `auth.uid()` | users.id | auth.users |
| `accord_meetings.organizer_id` | users.id | auth.users |
| `accord_nodes.created_by` | users.id | auth.users |
| `accord_nodes.dissented_by` | users.id | auth.users |
| `accord_belief_adjustments.declared_by` | users.id | auth.users |
| `accord_edges.declared_by` | users.id | auth.users |
| `accord_meeting_attendees.resource_id` | resources.id | resources |
| `accord_meeting_outcomes.owner_resource_id` | resources.id | resources |

**Join pattern:** `users.id → resources.user_id → resources.id`

When matching node ownership to attendees, you must traverse this join. Direct comparison of `created_by` (users.id) to `resource_id` (resources.id) will always fail silently.

*Confirmed C-04 V4, C-05 V5*

---

## §4 — RLS function reference

| Function | Returns | Used in |
|---|---|---|
| `my_firm_id()` | uuid | All RLS policies — firm-scoping |
| `auth.uid()` | uuid (users.id) | Organizer gates, owner checks |
| `is_client()` | boolean | risk_register RLS |

---

## §5 — Trigger inventory

| Table | Trigger name | Event | Function | Purpose |
|---|---|---|---|---|
| `accord_meetings` | `accord_meetings_field_gate_trg` | BEFORE UPDATE | `accord_meetings_field_gate()` | Gates `briefing_text`, `stakes`, `location` — immutable once `state <> 'idle'` |
| `accord_meeting_outcomes` | `accord_meeting_outcomes_state_gate_trg` | BEFORE INSERT OR UPDATE | `accord_meeting_outcomes_state_gate()` | Rejects if parent meeting `state <> 'idle'` |
| `accord_nras` | (5 RLS policies, no triggers) | — | — | State-machine via disjoint UPDATE RLS per IR73 |

**Note:** `accord_meetings_briefing_text_gate_trg` was the original trigger name — **it was dropped and replaced by `accord_meetings_field_gate_trg` in C-02**. If you see the old name in any document, it is stale.

---

## §6 — Open substrate gaps

| Gap | Impact | Target CMD |
|---|---|---|
| `workstreams.project_id` requires manual population | Risks tab shows empty state until populated | Operator-managed; no CMD needed |
| `risk_register.status` valid values unknown | Risks tab cannot filter by status | C-08 or follow-on |
| `accord_meeting_intel_notes` table not yet created | Intelligence Mode has no private notes substrate | C-08 |
| Disjoint UPDATE RLS for `accord_meeting_outcomes.status` transitions | Outcome ratification cannot update status | X-03 |
| No `accord_meetings.summary` column | Last meeting block in Briefing tab uses `briefing_text` as fallback | Future CMD if needed |
| Double `setLevel` from `accord-rails.js:331` | Rail flash on NEXT navigation | Pre-C-13 micro-fix |

---

## §8 — C-07 additional findings


**`accord_nras_current` columns confirmed (C-08 V2):** `node_id`, `state`, `deferred_at` present. `declared_at` absent — use `created_at` for age derivation.

**`accord_nodes.status` for action nodes:** value `committed` only. Overdue detection must use `due_date < now()` exclusively — status-based detection not applicable.

**Intelligence derivation thresholds (C-08, configurable constants):**
- DISSENT·SIMMERING: dissent age ≥ 14 days
- OVERDUE·PRESSURE: 2+ overdue actions (due_date < now())
- QUIET·RE-ONBOARD: zero nodes authored, zero actions
- ENGAGED·STEADY: default
- Urgency "move now" suffix: dissent age ≥ 20 days

**Position collision on INSERT:** `accord_agenda_items.position` must use `max(position) + 1` at insert time, not `items.length`. Items may have non-contiguous positions after reorders. *Fixed C-07.*

**Drag-to-reorder position swap:** requires three-step swap via temp position `-1` to avoid UNIQUE constraint collision when two rows swap values. Sequential PATCHes: set A→-1, set B→A's old value, set A→B's old value. *Fixed C-07.*

**`accord_edges` ref chips:** `from_node_id`, `to_node_id`, `edge_type` confirmed. Ref chips on agenda items deferred to follow-on CMD — low priority in v1.

**`accord_agenda_items.status` valid values:** `pending | discussed | skipped` *(confirmed C-03, carry-forward)*

---



### `accord_chat_messages`
**PK:** `message_id UUID`
*Added A-08 · CMD-ACCORD-CAPTURE-CHAT-1*

| Column | Type | Notes |
|---|---|---|
| `message_id` | uuid | PK |
| `firm_id` | uuid | FK → firms |
| `meeting_id` | uuid | FK → accord_meetings ON DELETE CASCADE |
| `author_resource_id` | uuid | FK → resources(id) |
| `body` | text | CHECK length(trim(body)) > 0 |
| `created_at` | timestamptz | DEFAULT now() |

**RLS:** SELECT: all firm members. INSERT: author_resource_id must match caller. UPDATE/DELETE: not permitted — messages are immutable.
**Index:** `(meeting_id, created_at ASC)`
**Realtime:** REPLICA IDENTITY FULL + added to supabase_realtime publication — required for filtered channel subscriptions.

---

## §9 — C-13 and X-series findings


**Supabase realtime table pattern (A-08, canonical):**
Any table requiring realtime INSERT/UPDATE/DELETE events must:
1. `ALTER TABLE <table> REPLICA IDENTITY FULL;`
2. `ALTER PUBLICATION supabase_realtime ADD TABLE <table>;`
Both steps required — omitting either causes silent subscription failure.
Filter pattern: `meeting_id=eq.<uuid>` on the channel subscription.

**`accord_meetings.duration_minutes` edit path (X-12):** No UI path existed to set
`duration_minutes` from the Setup shell prior to X-12. The column exists and is confirmed
in the canonical select list. X-12 adds inline edit via the WHEN row in the header.
Column confirmed nullable — `null` means no duration set; budget bar shows empty state.

**`accord_meeting_seal_fn()` — action node exclusion (C-09, confirmed C-13):**
The seal trigger now excludes `tag = 'action'` from both the node-seal loop and the
Merkle root computation. Action nodes have `sealed_at = NULL` permanently. The UPDATE
RLS on `accord_nodes` gates on `sealed_at IS NULL` — this is intentional and correct
for action nodes. Any future CMD touching the seal trigger must preserve this exclusion.

**`accord_meetings.state` transition confirmed live (X-13):**
`startMeeting()` PATCHes `state` from `idle` → `running` and sets `started_at`.
The surface transition is triggered by dispatching `accord:level-changed` on `window`
after the PATCH resolves — not by `loadMeeting()` or `switchSurface()`.
accord-rails listens for `accord:level-changed` and re-routes accordingly.

**`accord_nodes.status` for action nodes:** Value `committed` is set by the seal trigger
for non-action nodes. Action nodes retain `committed` from their original capture but
`sealed_at` is now null. Do not use `status` to determine seal state for action nodes —
use `sealed_at IS NULL` exclusively.

---

## §7 — Version history

| Version | Date | Changes |
|---|---|---|
| v1.0 | 2026-05-10 | Initial inventory. Consolidates IR64 findings from C-01 through C-07. |
| v1.4 | 2026-05-11 | Added accord_chat_messages (A-08); Supabase realtime pattern documented. |
| v1.3 | 2026-05-11 | Added §9: C-13/X-series findings — duration_minutes edit path, seal trigger action exclusion confirmed, startMeeting transition mechanism, action node status clarification. |
| v1.2 | 2026-05-10 | Added accord_meeting_intel_notes table (C-08); accord_nras_current columns; action node status value; intelligence derivation thresholds. |
| v1.1 | 2026-05-10 | Added §8 C-07 findings: position collision pattern, drag swap three-step, edges confirmation, agenda item status values. |

---

*Maintained by: Architect (Pluto) · Operator: Vaughn Staples*
*File in project knowledge. Update after every CMD that touches substrate.*
