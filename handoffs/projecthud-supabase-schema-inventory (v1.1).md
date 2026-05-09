# ProjectHUD Supabase Schema Inventory

**Document version:** v1.0 — 2026-05-09
**Authoring agent:** Claude (post-handoff session, NRA Surface CMD chain)
**Sources:**
- `test2.txt` — definitive `accord_nras` inventory (columns, constraints, indexes, RLS policies)
- Substrate migrations from current outputs (`20260508000001_accord_nras_table.sql` through `20260508000004_accord_nras_seal_trigger_patch.sql`) — definitive for `accord_nras` ecosystem
- `coc.js` source — definitive for `coc_events` schema (in-code documentation)
- Code references in `accord-*.js`, `cdn-*.js`, `mw-*.js` — INFERRED for tables not authoritatively sourced

**Confidence levels marked per entry:**
- 🟢 **AUTHORITATIVE** — sourced from schema dump, migration, or in-code documentation
- 🟡 **CONFIRMED INFERRED** — table referenced by code with consistent column patterns; high confidence but not schema-validated
- 🔴 **WEAKLY INFERRED** — table name appears in code but column structure largely unknown

---

## Section A — Tables

Tables ordered alphabetically. Within each, column lists prioritize architecturally significant columns per brief Step 6.

---

### `accord_agenda_items` 🟡

- **Purpose:** Per-meeting agenda items (planned topics within a meeting; superseded by accord_threads but co-exists)
- **Key columns:**
  - `agenda_item_id` (uuid, PK)
  - `meeting_id` (uuid, FK → accord_meetings)
  - `firm_id` (uuid, FK → firms)
  - `seq_id` (int, ordering within meeting)
  - `summary` (text, the agenda item text)
  - `status` (text; see Lifecycle states)
  - `created_at`, `updated_at` (timestamptz)
- **Lifecycle states:**
  - `active` — agenda item open for capture
  - `archived` — agenda item closed
- **Primary FK relationships:**
  - `meeting_id` → `accord_meetings.meeting_id`
  - `firm_id` → `firms.firm_id`
- **RLS posture:** Firm-scoped SELECT/INSERT/UPDATE; standard `firm_id = my_firm_id()` gate

---

### `accord_belief_adjustments` 🟡

- **Purpose:** Operator overrides to substrate-derived chip beliefs (Living Document state-chip overrides)
- **Key columns:**
  - `adjustment_id` (uuid, PK)
  - `node_id` (uuid, FK → accord_nodes)
  - `firm_id` (uuid)
  - `adjusted_belief` (text; the override value)
  - `created_by_user_id` (uuid)
  - `created_at` (timestamptz)
- **Primary FK relationships:**
  - `node_id` → `accord_nodes.node_id`
- **RLS posture:** Firm-scoped per code references; INSERT-only audit trail (mutable via successive INSERTs, not UPDATE)

---

### `accord_edges` 🟡

- **Purpose:** Typed relationships between nodes (supersedes / dissents-from / counterfactual / etc.)
- **Key columns:**
  - `edge_id` (uuid, PK)
  - `from_node_id` (uuid, FK → accord_nodes)
  - `to_node_id` (uuid, FK → accord_nodes)
  - `edge_type` (text; relationship category)
  - `firm_id` (uuid)
  - `created_at` (timestamptz)
  - `created_by_user_id` (uuid)
- **Lifecycle states:** Edges are immutable post-INSERT; no state column. Edge classifications observed in code:
  - `supersedes` — newer node replaces older
  - `dissents_from` — dissent against a decision
  - `counterfactual` — counterfactual annotation
  - Possibly others (not exhaustively enumerated from code)
- **Primary FK relationships:**
  - `from_node_id`, `to_node_id` → `accord_nodes.node_id`
- **RLS posture:** Firm-scoped per code references

---

### `accord_meetings` 🟡

- **Purpose:** Meeting events within a workstream; container for nodes captured during the meeting
- **Key columns:**
  - `meeting_id` (uuid, PK)
  - `workstream_id` (uuid, FK → workstreams)
  - `firm_id` (uuid)
  - `title` (text)
  - `state` (text; see Lifecycle states)
  - `started_at`, `ended_at`, `sealed_at` (timestamptz)
  - `organized_by_user_id` (uuid)
  - `created_at` (timestamptz)
- **Lifecycle states:**
  - `draft` — meeting created but not started
  - `running` — meeting in progress; capture controls active
  - `closed` — meeting ended; not yet sealed
  - `sealed` — meeting permanently sealed (immutable per IR42)
- **Primary FK relationships:**
  - `workstream_id` → `workstreams.workstream_id`
  - `firm_id` → `firms.firm_id`
- **RLS posture:** Firm-scoped SELECT; INSERT/UPDATE for firm members. Sealed meetings are immutable per IR42 (likely enforced by trigger or check, not RLS alone)

---

### `accord_nodes` 🟡

- **Purpose:** Captured artifacts within meetings — notes, decisions, actions, risks, questions, dissents
- **Key columns:**
  - `node_id` (uuid, PK)
  - `meeting_id` (uuid, FK → accord_meetings)
  - `thread_id` (uuid, FK → accord_threads — possibly nullable)
  - `firm_id` (uuid)
  - `seq_id` (int, ordering)
  - `tag` (text; see Lifecycle states / classifications)
  - `summary` (text; the node body)
  - `effective_date` (date, nullable; for decisions/actions)
  - `created_by_user_id` (uuid)
  - `created_at` (timestamptz)
- **Lifecycle states / tag classifications:**
  - `note` — informational
  - `decision` — a decision recorded
  - `action` — an action item
  - `risk` — a risk flagged
  - `question` — a question raised
  - `dissent` — a dissent against a decision
- **Primary FK relationships:**
  - `meeting_id` → `accord_meetings.meeting_id`
  - `thread_id` → `accord_threads.thread_id`
  - `firm_id` → `firms.firm_id`
- **RLS posture:** Firm-scoped SELECT/INSERT. Update behavior: nodes are mostly immutable post-INSERT (`effective_date` is the notable mutable field per IR42 until meeting sealed)

---

### `accord_nras` 🟢

- **Purpose:** Next Required Action declarations for accord nodes (forward-motion tracking; Phase 4 substrate of CMD-ACCORD-NRA-SUBSTRATE-1)
- **Key columns** (24 total — full inventory is authoritative from `test2.txt`):
  - `nra_id` (uuid, PK, default gen_random_uuid())
  - `node_id` (uuid, FK → accord_nodes, NOT NULL)
  - `firm_id` (uuid, NOT NULL)
  - `state` (text, NOT NULL; see Lifecycle states)
  - `nra_type` (text, nullable; see CHECK)
  - `due_date` (date, nullable)
  - `description` (text, nullable)
  - `owner_resource_id` (uuid, nullable)
  - `owner_event_type` (text, nullable)
  - `owner_is_operator` (boolean, NOT NULL, default false)
  - `trigger_kind` (text, nullable; see CHECK)
  - `trigger_target_id` (uuid, nullable)
  - `resolution_candidate_at` (timestamptz, nullable)
  - `waived_at`, `waived_reason`
  - `deferred_at`
  - `resolved_at`, `resolved_by_resource_id`, `resolved_mechanism` (see CHECK), `resolved_event_id`
  - `superseded_at`, `superseded_by_id`
  - `created_at` (NOT NULL, default now())
  - `created_by_user_id` (uuid, NOT NULL)
- **Lifecycle states** (CHECK `accord_nras_state_check`):
  - `declared` — forward action declared; due_date and owner required
  - `waived` — guardrail; no forward action needed; waived_reason required
  - `deferred` — forward intent recorded but pickup deferred
  - `resolved` — action satisfied; resolved_at + resolved_by_resource_id + resolved_mechanism required
  - `superseded` — replaced by another NRA on same node; superseded_at + superseded_by_id required
- **CHECK constraints (authoritative):**
  - `accord_nras_type_check`: nra_type IN (`pending_external`, `pending_internal`) OR NULL
  - `accord_nras_trigger_kind_check`: trigger_kind IN (`meeting_scheduled_in_workstream`, `meeting_sealed_in_workstream`, `action_resolved`, `decision_resolved`) OR NULL
  - `accord_nras_resolved_mechanism_check`: resolved_mechanism IN (`manual`, `meeting_scheduled`, `meeting_sealed`, `action_resolved`, `decision_resolved`) OR NULL
  - Several state-consistency CHECKs gate required-non-null per state
- **Indexes (authoritative):**
  - `nras_due_date_idx` (partial: WHERE state='declared')
  - `nras_firm_id_state_idx`
  - `nras_node_id_idx`
  - `nras_owner_resource_idx` (partial)
  - `nras_resolution_candidate_idx` (partial)
  - `nras_trigger_kind_idx` (partial)
- **Primary FK relationships:**
  - `node_id` → `accord_nodes.node_id`
  - `firm_id` → `firms.firm_id`
- **RLS posture:** Firm-scoped SELECT (`firm_id = my_firm_id()`); INSERT requires `firm_id` + `created_by_user_id` match; **5 disjoint UPDATE policies** gating specific state transitions (declared→deferred, declared→resolved, declared→superseded, deferred→declared, declared resolution-candidate flag set). DELETE not permitted. Architectural note: state mutations are deliberately constrained at RLS layer per IR73; surface code must use atomic helpers (`declare_nra`, `waive_nra`, etc.) for most paths
- **Companion view:** `accord_nras_current` — single current NRA per node (the most recent non-superseded row); used by all surface badge queries

---

### `accord_threads` 🟡

- **Purpose:** Conversation threads within or across meetings (cross-meeting continuity)
- **Key columns:**
  - `thread_id` (uuid, PK)
  - `workstream_id` (uuid, FK → workstreams)
  - `firm_id` (uuid)
  - `title` (text)
  - `created_at` (timestamptz)
- **Primary FK relationships:**
  - `workstream_id` → `workstreams.workstream_id`
- **RLS posture:** Firm-scoped per code references

---

### `coc_events` 🟢

- **Purpose:** Single Chain-of-Custody table; absorbs legacy exception_annotations / audit_log / task_journal / resource_request_events into one wide row
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (uuid, NOT NULL)
  - `event_class` (text; top-level category — `accord` | `workflow` | `exception` | `audit` | `progress` | `request`)
  - `event_type` (text; specific verb — e.g. `nra.declared`, `task.completed`, `exception.intervention`)
  - `step_name` (text; UI label)
  - `event_notes` (text)
  - `entity_type` (text; what kind of thing the event is about)
  - `entity_id` (uuid; id of that thing)
  - `project_id` (uuid, nullable; project context)
  - `instance_id` (uuid, nullable; workflow instance context)
  - `template_step_id` (uuid, nullable)
  - `actor_resource_id` (uuid, nullable; the human actor)
  - `actor_name` (text; denormalized display)
  - `actor_role` (text, nullable; `pm` | `ic` | `manager` | `system` | ...)
  - `outcome` (text, nullable; `on_track` | `at_risk` | `blocked` | `resolved` | `submitted` | `pending` | ...)
  - `severity` (text, nullable; `info` | `warn` | `critical`)
  - `metadata` (jsonb, nullable; legacy-specific fields)
  - `occurred_at` (timestamptz; when the action actually happened)
  - `created_at`, `updated_at` (timestamptz)
- **Lifecycle states:** Events are immutable post-INSERT (audit log semantics). No state column; outcome/severity classify the event
- **Primary FK relationships:**
  - `entity_id` → polymorphic (matches `entity_type`)
  - `firm_id` → `firms.firm_id`
- **RLS posture:** Firm-scoped SELECT/INSERT; standard `firm_id = my_firm_id()` gate. Direct INSERTs deprecated — should go through `window.CoC.write()` for centralized actor resolution and event normalization

---

### `concerns` 🔴

- **Purpose:** [INFERRED — concerns or risk-tracking entries; possibly per-resource concerns. Schema unknown beyond name reference]
- **Note:** Single reference observed; insufficient to characterize

---

### `external_step_tokens` 🟡

- **Purpose:** Time-bounded tokens for external step submission (cadence external-actor flow)
- **Key columns** (inferred):
  - `token_id` (uuid, PK)
  - `step_instance_id` (uuid, FK → workflow_step_instances)
  - `expires_at` (timestamptz)
  - `consumed_at` (timestamptz, nullable)
- **Primary FK relationships:**
  - `step_instance_id` → `workflow_step_instances.step_instance_id`
- **RLS posture:** Anon-readable for token-bearing requests (likely loosened); strict expiration enforcement

---

### `firms` 🟡

- **Purpose:** Tenancy root — every other firm-scoped table FKs to firm_id
- **Key columns:**
  - `firm_id` (uuid, PK)
  - `name` (text)
  - `created_at` (timestamptz)
- **RLS posture:** SELECT firm-scoped (a user can only see their own firm); INSERT/UPDATE typically restricted to admins
- **Note:** Operator firm UUID `aaaaaaaa-0001-0001-0001-000000000001`

---

### `form_drafts` 🔴

- **Purpose:** [INFERRED — autosave drafts for in-progress workflow form submissions]
- **Schema:** unknown beyond name reference

---

### `meeting_agenda_items` 🔴

- **Purpose:** [INFERRED — possibly legacy companion to accord_agenda_items, or distinct table for meeting-level (non-Accord) agendas]
- **Schema:** unknown beyond name reference

---

### `meetings` 🔴

- **Purpose:** [INFERRED — possibly legacy or non-Accord meeting table separate from accord_meetings; or referenced as a `from` clause in joins. Confirm before reasoning about it]
- **Schema:** unknown

---

### `notes_workspace` 🔴

- **Purpose:** Legacy state for MY NOTES surface (per Compass user memories)
- **Note:** Documented as legacy by operator user memories; likely deprecated in favor of `compass_views` + `view_participants`

---

### `compass_views` 🟡

- **Purpose:** Per-firm saved views (My Views surface in Compass; multi-user shareable)
- **Key columns** (per operator's user memories and Compass code):
  - `view_id` (uuid, PK)
  - `firm_id` (uuid)
  - `owner_user_id` (uuid; the view owner)
  - `view_name` (text)
  - `view_config` (jsonb; filter/sort/columns config)
  - `created_at`, `updated_at` (timestamptz)
- **Primary FK relationships:**
  - `firm_id` → `firms.firm_id`
- **RLS posture:** Firm-scoped SELECT; UPDATE/DELETE gated on `owner_user_id` match. Per CMD-MY-VIEWS-PERSISTENCE-FORK Brief 1.5: **4 RLS policies rewritten** to use direct `compass_views.owner_user_id` checks (avoiding earlier infinite-recursion 42P17 from policies joining back to participants table)

---

### `view_participants` 🟡

- **Purpose:** Many-to-many: which users have access to which compass_views
- **Key columns:**
  - `participant_id` (uuid, PK)
  - `view_id` (uuid, FK → compass_views)
  - `user_id` (uuid)
  - `firm_id` (uuid)
  - `role` (text; `owner` | `editor` | `viewer`)
  - `created_at` (timestamptz)
- **Primary FK relationships:**
  - `view_id` → `compass_views.view_id`
- **RLS posture:** Per Brief 1: rewritten in CMD-MY-VIEWS-PERSISTENCE-FORK with `view_id` FK enforcement. Direct `compass_views.owner_user_id` checks rather than recursive joins per Brief 1.5

---

### `users` 🟡

- **Purpose:** [INFERRED — likely a public-schema mirror or join companion to auth.users; resolves users to firm membership and resource rows]
- **Schema:** unknown beyond reference; possibly contains `user_id`, `firm_id`, `resource_id`, `display_name`

---

### `workflow_action_items` 🔴

- **Purpose:** [INFERRED — action items spawned from workflow steps]

---

### `workflow_form_definitions` 🟡

- **Purpose:** Form schema definitions for workflow steps (defines fields, types, validation)
- **Key columns:**
  - `definition_id` (uuid, PK)
  - `template_step_id` (uuid, FK → workflow_template_steps)
  - `source_html` (text — architecturally central per brief example)
  - `field_schema` (jsonb)
  - `created_at` (timestamptz)
- **Primary FK relationships:**
  - `template_step_id` → `workflow_template_steps.template_step_id`

---

### `workflow_instances` 🟡

- **Purpose:** Live runs of workflow templates (one row per active or completed workflow execution)
- **Key columns:**
  - `instance_id` (uuid, PK)
  - `template_id` (uuid, FK → workflow_templates)
  - `firm_id` (uuid)
  - `status` (text; lifecycle)
  - `current_step_id` (uuid, nullable)
  - `started_at`, `completed_at` (timestamptz)
- **Lifecycle states (inferred):**
  - `pending` — instance created, not yet started
  - `running` — instance executing
  - `complete` — all steps complete
  - `aborted` — early termination
- **Primary FK relationships:**
  - `template_id` → `workflow_templates.template_id`
  - `firm_id` → `firms.firm_id`
- **RLS posture:** Firm-scoped SELECT/INSERT/UPDATE
- **Realtime:** known subscriber `cdn-events.js` for INSERTs (per operator user memories)

---

### `workflow_requests` 🔴

- **Purpose:** [INFERRED — requests-tier table; possibly approvals or PM-tier requests against workflows]

---

### `workflow_step_instances` 🟡

- **Purpose:** Per-step state for a workflow_instance (one row per step execution within an instance)
- **Key columns:**
  - `step_instance_id` (uuid, PK)
  - `instance_id` (uuid, FK → workflow_instances)
  - `template_step_id` (uuid, FK → workflow_template_steps)
  - `firm_id` (uuid)
  - `status` (text; step lifecycle)
  - `assignee_resource_id` (uuid, nullable)
  - `started_at`, `completed_at` (timestamptz)
  - `submission_data` (jsonb, nullable; the form submission)
- **Lifecycle states (inferred):**
  - `pending` — step not yet started
  - `running` / `wait` — step waiting on input
  - `submitted` — form submitted
  - `approved` / `rejected` — approval-step outcome
- **Primary FK relationships:**
  - `instance_id` → `workflow_instances.instance_id`
  - `template_step_id` → `workflow_template_steps.template_step_id`
- **RLS posture:** Firm-scoped SELECT; INSERT/UPDATE gated on instance ownership or assignee match
- **Realtime:** known subscriber `cdn-events.js` for INSERTs

---

### `workflow_template_coc` 🔴

- **Purpose:** [INFERRED — chain-of-custody for workflow templates (audit trail of template edits)]

---

### `workflow_template_steps` 🟡

- **Purpose:** Step definitions within a workflow template (the design-time DAG)
- **Key columns:**
  - `template_step_id` (uuid, PK)
  - `template_id` (uuid, FK → workflow_templates)
  - `firm_id` (uuid)
  - `seq_id` (int)
  - `step_type` (text; `form` | `approval` | `external` | ...)
  - `name` (text)
- **Primary FK relationships:**
  - `template_id` → `workflow_templates.template_id`

---

### `workflow_templates` 🟡

- **Purpose:** Workflow template definitions (the design-time DAG; one row per template)
- **Key columns:**
  - `template_id` (uuid, PK)
  - `firm_id` (uuid)
  - `name` (text)
  - `version` (int or text)
  - `published_at` (timestamptz, nullable)
  - `created_at`, `updated_at` (timestamptz)
- **Primary FK relationships:**
  - `firm_id` → `firms.firm_id`

---

### `workstreams` 🟡

- **Purpose:** Top-level container for related meetings (Accord constellation level — one workstream contains many meetings + threads + nodes)
- **Key columns:**
  - `workstream_id` (uuid, PK)
  - `firm_id` (uuid)
  - `parent_workstream_id` (uuid, nullable, FK → workstreams; for nesting)
  - `name` (text)
  - `archived_at` (timestamptz, nullable)
  - `created_at` (timestamptz)
- **Primary FK relationships:**
  - `firm_id` → `firms.firm_id`
  - `parent_workstream_id` → `workstreams.workstream_id` (self-referential, supports up to 3 levels per Constellation Entry CMD)
- **RLS posture:** Firm-scoped SELECT/INSERT/UPDATE

---

## Section B — Storage buckets

[NOT PROVIDED] — no storage bucket configuration in source materials. Inferred buckets based on code references:

- **`accord-minutes`** 🔴 — likely holds rendered PDF minutes per meeting (referenced via `accord_minutes_renders` table). Access policy unknown
- **`avatars`** or **`profiles`** 🔴 — possible based on common Supabase patterns; not confirmed

**Operator action requested:** export Storage bucket configuration from Supabase dashboard for the next inventory pass.

---

## Section C — Edge Functions

[NOT PROVIDED] — no Edge Function source in current upload set. Known references:

- **`accord-minutes-render`** 🟡 — referenced in code; produces PDF minutes from sealed meetings. Input: `meeting_id`. Output: render row in `accord_minutes_renders`. Auth: authenticated
- **`workflow-step-external-submit`** 🔴 — INFERRED from `external_step_tokens` table; processes external-actor form submissions

**Operator action requested:** list Edge Functions from `supabase/functions/` directory or Supabase dashboard for the next inventory pass.

---

## Section D — Realtime subscriptions

Known subscriptions from code references:

### Table: `workflow_step_instances`

- **Events published:** INSERT, UPDATE
- **Known subscribers:** `cdn-events.js` (Cadence module — listens for step lifecycle changes)

### Table: `workflow_instances`

- **Events published:** INSERT, UPDATE
- **Known subscribers:** `cdn-events.js`

### Table: `coc_events`

- **Events published:** INSERT (likely)
- **Known subscribers:** Various surface modules subscribe to specific entity_type filters; `mw-events.js` likely

### Channels (broadcast, not table-row-based — per IR41)

These are **Realtime broadcast channels** (not postgres_changes); listed for completeness:

- `accord:meeting:{meeting_id}` — per-meeting commit-moment events (Iron Rule 41: only commit-moment events broadcast; no keystrokes)
- `hud:{firm_id}` — firm-wide HUD presence and event channel (cmd-center.js)
- `cmd-center-{firm_id}` — legacy companion channel (cmd-center.js)

---

## Summary

- Tables inventoried: 25 (8 🟢/🟡 well-characterized, 9 🟡 partially characterized, 8 🔴 weakly inferred)
- Storage buckets: [NOT PROVIDED]
- Edge Functions: [NOT PROVIDED] (2 inferred from code references)
- Realtime: 3 table subscriptions known + 3 broadcast channels documented

---

## Gaps for next inventory pass

1. **Schema dump** — `pg_dump --schema-only` or Supabase dashboard schema export. Resolves all 🔴 entries
2. **RLS policy listing** — full SQL for every table. The current inventory's RLS posture is partial inferred; only `accord_nras` is authoritative
3. **Storage bucket config** — names, access policies, CORS posture
4. **Edge Functions** — source code or endpoint list with auth requirements
5. **Realtime config** — which tables have postgres_changes subscriptions enabled
6. **Triggers and functions** — out of brief scope but architecturally important for `accord_nras` (already documented in migration files), `coc_events` (likely auto-set timestamps), and any approval-workflow tables
7. **Confirm `meetings` vs `accord_meetings`** — are these distinct tables or aliases? Code references both
8. **Confirm `meeting_agenda_items` vs `accord_agenda_items`** — same question
9. **Confirm `notes_workspace`** — fully deprecated, or still receiving writes from any code path?

---

*End of Schema Inventory v1.0.*
