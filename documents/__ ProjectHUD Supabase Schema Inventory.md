# ProjectHUD Supabase schema inventory

**Scope:** Phase 1 architecture documentation inventory of the ProjectHUD
Supabase backend.

**Source materials provided:**

- `information_schema.columns` dump for the `public` schema (188 tables and views)
- `information_schema.key_column_usage` + `constraint_column_usage` — foreign keys
- `information_schema.check_constraints` — check constraints and lifecycle enums
- `pg_policies` — 180+ RLS policy rows for the `public` schema
- `pg_tables.rowsecurity` flags — which tables have RLS actually enabled
- `pg_policies` against `storage.objects` — storage bucket policies
- `storage.buckets` — bucket configuration
- Edge Function list from Supabase Dashboard (11 functions)
- Edge Function source for: `ai-briefing`, `ai-form-vision`, `create-user`,
  `update-user`, `delete-user`, `notify-form-review`, `notify-step-activated`,
  `process-form-decision`, `respond-step`, `dynamic-function`, `hyper-task`
- `pg_publication_tables` — Realtime publication contents (empty)

**Source materials NOT provided (marked explicitly below):**

- CORS configuration for storage buckets (Project Settings level)
- Supabase Auth configuration (which auth providers, JWT claims, etc.)
- Definitions of RLS helper functions (`my_firm_id()`, `current_firm_id()`,
  `my_project_ids()`, `is_client()`, `is_admin()`) — referenced pervasively
  in policies but their source wasn't captured in this pass
- Postgres enum type definitions (columns shown as `USER-DEFINED` in the
  schema dump are enum-backed; valid enum values for those that don't have
  a matching CHECK constraint are unknown)
- Frontend code references to identify Realtime subscribers
  (moot because Realtime publishes no tables; see Section D)

---

## Summary counts

- **Tables (Section A):** 131 base tables + 13 views = 144 total objects in
  `public` schema
- **Storage buckets (Section B):** 5 buckets
- **Edge Functions (Section C):** 11 deployed functions (9 implemented,
  2 unimplemented default templates)
- **Realtime subscriptions (Section D):** 0 tables published. Realtime is
  not enabled on any table.

---

## Section A — Tables

Entries listed alphabetically.

Each table's **RLS posture** falls into one of four categories, since
this distinction is architecturally significant and not uniform:

- **Firm-isolated (real):** RLS enabled, policies use `my_firm_id()` or
  `current_firm_id()` helper functions to scope rows to the caller's
  firm. Real multi-tenant enforcement.
- **Hardcoded single-firm:** RLS enabled, policies use a literal firm
  UUID (`aaaaaaaa-0001-0001-0001-000000000001`). No multi-tenant safety —
  effectively single-tenant.
- **Open (authenticated):** RLS enabled, policies use `USING (true)` or
  `auth.role() = 'authenticated'`. Any authenticated user can access
  any row.
- **RLS disabled:** `rowsecurity = false`. Any policies defined on the
  table are **inactive**. Access governed only by Postgres role grants,
  which for Supabase means any authenticated user typically has full
  access.

---

### `action_item_comments`

- **Purpose:** Threaded comments on workflow action items, with reply
  nesting.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (uuid, FK → `firms.id` — note: FK not declared)
  - `action_item_id` (uuid, FK → `workflow_action_items.id`)
  - `parent_comment_id` (uuid, FK → self, for reply threading)
  - `author_resource_id` (uuid)
  - `body` (text, NOT NULL)
  - `created_at` (timestamptz)
- **Primary FK relationships:**
  - `action_item_id` → `workflow_action_items.id`
  - `parent_comment_id` → `action_item_comments.id`
- **RLS posture:** Hardcoded single-firm. Policy `firm_isolation`
  restricts all operations to the literal firm UUID.

### `action_items`

- **Purpose:** Project-level action items, assignable and trackable, with
  links to meetings, tasks, and workflow contexts.
- **Key columns:**
  - `id` (uuid, PK)
  - `project_id` (uuid, FK → `projects.id`, NOT NULL)
  - `firm_id` (uuid, FK → `firms.id`, NOT NULL)
  - `submitted_by` (uuid, FK → `users.id`)
  - `responsible` (uuid, FK → `users.id`)
  - `priority` (enum `action_item_priority`)
  - `status` (enum `action_item_status`)
  - `source` (enum `action_item_source`)
  - `notification_status` (enum `notif_status`)
  - `meeting_id`, `meeting_agenda_item_id`, `task_id` (uuid FKs)
  - `description`, `deliverable`, `assigned_date`, `target_date`
- **Lifecycle states:** `status` is enum-backed (`action_item_status`);
  enum values not captured (would require `pg_enum` query).
- **Primary FK relationships:**
  - `project_id` → `projects.id`
  - `firm_id` → `firms.id`
  - `responsible` / `submitted_by` → `users.id`
  - `meeting_id` → `meetings.id`
  - `task_id` → `tasks.id`
- **RLS posture:** Firm-isolated (real), with internal/client split.
  Internal users: full CRUD on their firm's items. Clients: SELECT and
  INSERT only on items where `source = 'client_request'` for their
  accessible projects. DELETE open to any authenticated user (a separate
  permissive policy — likely overly broad).

### `activity_participants`

- **Purpose:** Joins internal resources or external contacts to sales
  prospect activities (calls, meetings).
- **Key columns:**
  - `id` (uuid, PK)
  - `activity_id` (uuid, FK → `prospect_activities.id`, NOT NULL)
  - `resource_id` (uuid, FK → `resources.id`, nullable)
  - `contact_id` (uuid, FK → `contacts.id`, nullable)
- **Check constraint:** Exactly one of `resource_id` or `contact_id`
  must be non-null (XOR).
- **Primary FK relationships:**
  - `activity_id` → `prospect_activities.id`
  - `resource_id` → `resources.id`
  - `contact_id` → `contacts.id`
- **RLS posture:** RLS disabled. Policy `p_activity_participants` exists
  scoping via parent prospect firm, but `rowsecurity = false` means it
  is inactive. Any authenticated user can access any row.

### `ai_org_briefings`

- **Purpose:** AI-generated organizational briefings at firm, department,
  project, or individual scope.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (uuid, FK → `firms.id`)
  - `generated_by` (uuid, FK → `users.id`)
  - `scope` (text; see Lifecycle states)
  - `scope_id` (uuid — refers to firm/dept/project/individual per scope)
  - `briefing_text` (text, NOT NULL)
  - `model_version`, `token_count`
  - `acknowledged_by`, `acknowledged_at` (arrays)
- **Lifecycle states (scope):**
  - `firm` — firm-wide briefing
  - `department` — department-scoped briefing
  - `project` — project-scoped briefing
  - `individual` — person-scoped briefing
- **Primary FK relationships:**
  - `firm_id` → `firms.id`
  - `generated_by` → `users.id`
- **RLS posture:** Open (authenticated). Policies allow any
  authenticated role to read and write regardless of firm.

### `approval_thresholds`

- **Purpose:** Firm-level configuration of monetary thresholds that
  determine which roles are required to approve a SOW.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (uuid, FK → `firms.id`, NOT NULL)
  - `threshold_min` (numeric, NOT NULL)
  - `threshold_max` (numeric, nullable)
  - `required_roles` (array, NOT NULL)
  - `sort_order` (integer, NOT NULL)
- **Primary FK relationships:** `firm_id` → `firms.id`
- **RLS posture:** RLS disabled. Policy `p_approval_thresholds` scopes
  to `current_firm_id()` but is inactive.

### `bist_certificates`

- **Purpose:** Conformance certificates issued from BIST
  (Built-In Self-Test) runs against workflow templates; tracks coverage
  and assertion counts, validity, and revocation.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (uuid, FK → `firms.id`, NOT NULL)
  - `template_id` (uuid, FK → `workflow_templates.id`)
  - `certificate_number` (text, NOT NULL)
  - `version_hash` (text)
  - `paths_covered`, `paths_total`, `assertions_passed`, `assertions_total`
  - `status` (text, default `valid`)
  - `certified_by` (uuid, FK → `resources.id`)
  - `issued_at`, `expires_at`, `revoked_at`, `revoke_reason`
- **Lifecycle states:** `status` default `valid`; other possible values
  (e.g. `revoked`, `expired`) implied but not constrained by CHECK.
- **Primary FK relationships:**
  - `template_id` → `workflow_templates.id`
  - `certified_by` → `resources.id`
- **RLS posture:** RLS disabled. No policies captured. Open by default
  role grants.

### `bist_coverage_paths`

- **Purpose:** Enumerates the execution paths of a workflow template
  that BIST tests must cover; tracks which scripts cover which paths.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (uuid, FK → `firms.id`, NOT NULL)
  - `template_id` (uuid, FK → `workflow_templates.id`)
  - `path_name` (text, NOT NULL)
  - `step_sequence` (jsonb)
  - `coverage_status` (text, default `uncovered`)
  - `covering_script_id` (uuid, FK → `bist_test_scripts.id`)
- **Lifecycle states (coverage_status):** default `uncovered`. Other
  values (e.g. `covered`) implied but not CHECK-constrained.
- **Primary FK relationships:**
  - `template_id` → `workflow_templates.id`
  - `covering_script_id` → `bist_test_scripts.id`
- **RLS posture:** RLS disabled.

### `bist_fixtures`

- **Purpose:** Reusable test data fixtures stored in Supabase Storage
  for BIST runs.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (uuid, FK → `firms.id`, NOT NULL)
  - `name` (text, NOT NULL)
  - `storage_path` (text, NOT NULL)
  - `file_size` (integer)
- **RLS posture:** Hardcoded single-firm. Policy `firm access`
  restricts all operations to the literal firm UUID.

### `bist_runs`

- **Purpose:** Records individual BIST test script executions, outcomes,
  failure details, and acknowledgement state.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (uuid, FK → `firms.id`, NOT NULL)
  - `script_id` (uuid, FK → `bist_test_scripts.id`)
  - `status` (text; see Lifecycle states)
  - `steps_passed`, `steps_failed`
  - `failure_step`, `failure_reason`, `failure_assertion` (jsonb)
  - `instance_id` (uuid — likely `workflow_instances.id`, FK not declared)
  - `duration_ms`
  - `run_by` (uuid, FK → `resources.id`)
  - `script_snapshot` (jsonb)
  - `acknowledged_by`, `acknowledged_at`
- **Lifecycle states (status):**
  - `running` — in progress
  - `passed` — all assertions passed
  - `failed` — one or more assertions failed
  - `error` — infrastructure failure (not an assertion failure)
- **Primary FK relationships:**
  - `script_id` → `bist_test_scripts.id`
  - `run_by`, `acknowledged_by` → `resources.id`
- **RLS posture:** Hardcoded single-firm.

### `bist_suites`

- **Purpose:** Groups BIST test scripts into named suites for batch
  execution.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (uuid, FK → `firms.id`, NOT NULL)
  - `name` (text, NOT NULL)
  - `script_ids` (array, NOT NULL)
- **RLS posture:** Hardcoded single-firm.

### `bist_test_scripts`

- **Purpose:** Authored BIST test scripts, each associated with a
  workflow template and version.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (uuid, FK → `firms.id`, NOT NULL)
  - `template_id` (uuid, FK → `workflow_templates.id`)
  - `template_version` (text)
  - `name` (text, NOT NULL)
  - `script` (jsonb, NOT NULL)
  - `created_by` (uuid, FK → `resources.id`)
- **Primary FK relationships:**
  - `template_id` → `workflow_templates.id`
  - `created_by` → `resources.id`
- **RLS posture:** Hardcoded single-firm.

### `calendar_events`

- **Purpose:** Per-resource calendar entries (meetings, PTO, holidays,
  ad-hoc blocks) with optional recurrence.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (uuid, FK → `firms.id`, NOT NULL)
  - `resource_id` (uuid, FK → `resources.id`, NOT NULL)
  - `event_date`, `start_time`, `end_time`, `duration_hours`
  - `event_type` (text; see Lifecycle states)
  - `source` (text; default `manual`)
  - `is_recurring`, `recurrence_rule`
- **Lifecycle states (event_type):**
  - `meeting` — scheduled meeting
  - `pto` — time off
  - `holiday` — firm-wide holiday
  - `other` — catch-all
- **Primary FK relationships:** `resource_id` → `resources.id`
- **RLS posture:** Open (authenticated). All policies `USING (true)`.

### `change_log`

- **Purpose:** Project-level change requests with impact assessment,
  approval workflow, and before/after state records.
- **Key columns:**
  - `id` (uuid, PK)
  - `project_id`, `firm_id` (uuid, NOT NULL)
  - `change_number` (integer)
  - `title` (text, NOT NULL)
  - `change_type` (enum `change_type`)
  - `status` (enum `change_status`)
  - `requested_by`, `reviewed_by`, `approved_by` (uuid FKs → `users.id`)
  - `impact_schedule_days`, `impact_cost`, `impact_description`
  - `before_state`, `after_state`
- **Lifecycle states:** `status` uses enum `change_status` (values not
  captured in CHECK output); default `draft`.
- **Primary FK relationships:**
  - `project_id` → `projects.id`
  - `requested_by`, `reviewed_by`, `approved_by` → `users.id`
- **RLS posture:** Firm-isolated (internal only). Single policy
  `change_log_internal`: all ops allowed for internal users in the
  firm; clients have no access.

### `classifications`

- **Purpose:** Firm-scoped labor/role classifications with standard
  rates (e.g. billing rate cards).
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (uuid, FK → `firms.id`, NOT NULL)
  - `title` (text, NOT NULL)
  - `standard_rate` (numeric)
  - `is_active` (boolean)
- **RLS posture:** Firm-isolated (real). SELECT to any user in the firm.
  INSERT restricted to admins.

### `coc_events`

- **Purpose:** Chain-of-custody event log — append-only audit trail of
  significant actions across entities (projects, instances, tasks, etc).
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (uuid, FK → `firms.id`)
  - `entity_id`, `entity_type` (NOT NULL) — polymorphic reference
  - `event_type`, `event_class`, `severity`
  - `step_name`, `event_notes`, `outcome`
  - `actor_resource_id` (uuid, FK → `resources.id`)
  - `actor_name`, `actor_role`
  - `project_id`, `instance_id`, `template_step_id` (uuid)
  - `metadata` (jsonb)
  - `occurred_at`, `created_at`
- **Primary FK relationships:**
  - `actor_resource_id` → `resources.id`
  - Polymorphic `entity_id` — no FK declared
- **RLS posture:** RLS disabled. Policies exist (including `service_all`
  for service_role and open INSERT/SELECT/UPDATE to all users) but are
  inactive.

### `companies`

- **Purpose:** External companies the firm does business with (clients,
  vendors, prospects).
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (uuid, FK → `firms.id`, NOT NULL)
  - `name` (text, NOT NULL)
  - `industry`, `website`, `country`, `city`
  - `is_client` (bool, NOT NULL)
  - `is_active` (bool, NOT NULL)
- **RLS posture:** RLS disabled. Policy `p_companies` scopes to
  `current_firm_id()` but is inactive.

### `compass_awards`

- **Purpose:** Internal recognition awards (quarterly or annual) with
  narratives and profile data.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (uuid, FK → `firms.id`, NOT NULL)
  - `resource_id` (uuid, FK → `resources.id`)
  - `recipient_name` (text, NOT NULL)
  - `award_type` (text; see Lifecycle states)
  - `quarter` (integer, 1–4)
  - `year` (integer, NOT NULL)
  - `narrative`, `profile_data` (jsonb), `announced_at`
- **Lifecycle states (award_type):** `quarterly`, `annual`.
- **RLS posture:** RLS enabled but no policies captured — effectively
  locked (no one can read/write via RLS; service_role bypasses).

### `concern_comments`

- **Purpose:** Threaded comments + lifecycle events on project concerns.
- **Key columns:**
  - `id` (uuid, PK)
  - `concern_id` (uuid, FK → `concerns.id`, NOT NULL)
  - `firm_id` (uuid, FK → `firms.id`, NOT NULL)
  - `author_resource_id` (uuid, FK → `resources.id`)
  - `body` (text, NOT NULL)
  - `event_type` (text, NOT NULL; see Lifecycle states)
  - `parent_id` (uuid, FK → self)
- **Lifecycle states (event_type):**
  - `comment` — user comment
  - `acknowledgement` — formal acknowledgement action
  - `escalation` — escalation action
  - `status_change` — status transition event
  - `resolution` — resolution action
- **RLS posture:** Open. Policy `concern_comments_all` with
  `USING (true)` / `WITH CHECK (true)`.

### `concerns`

- **Purpose:** Project-level concerns raised by resources, with
  priority, visibility scope, and a full status lifecycle.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (uuid, FK → `firms.id`, NOT NULL)
  - `raiser_resource_id` (uuid, FK → `resources.id`)
  - `project_id` (uuid, FK → `projects.id`)
  - `title` (text, NOT NULL)
  - `status`, `priority`, `visibility` (text; see Lifecycle states)
  - `phase`, `addressed_to`
  - `raised_at`, `acknowledged_at`, `resolved_at`
- **Lifecycle states (status):**
  - `unread`
  - `acknowledged`
  - `in_progress`
  - `resolved`
  - `rejected`
- **Lifecycle states (priority):** `low`, `medium`, `high`, `critical`
- **Lifecycle states (visibility):** `pm`, `management`, `all`
- **RLS posture:** Open. Policy `concerns_all` with `USING (true)` /
  `WITH CHECK (true)`.

### `conformance_exceptions`

- **Purpose:** Tracks BIST conformance exceptions — deviations between a
  run outcome and what a certificate requires, with severity and
  resolution workflow.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (uuid, FK → `firms.id`, NOT NULL)
  - `template_id`, `instance_id`, `cert_id` (uuid FKs)
  - `step_event_id` (uuid)
  - `step_seq` (integer)
  - `outcome`, `actor_name`
  - `status` (text; see Lifecycle states)
  - `severity` (text; see Lifecycle states)
  - `resolution_note`, `resolved_by`, `resolved_at`, `escalated_at`
- **Lifecycle states (status):**
  `open`, `acknowledged`, `resolved`, `escalated`
- **Lifecycle states (severity):**
  `info`, `warning`, `critical`
- **Primary FK relationships:**
  - `template_id` → `workflow_templates.id`
  - `instance_id` → `workflow_instances.id`
  - `cert_id` → `bist_certificates.id`
  - `resolved_by` → `resources.id`
- **RLS posture:** RLS enabled but no policies captured — locked.

### `contacts`

- **Purpose:** Individual people at external companies.
- **Key columns:**
  - `id` (uuid, PK)
  - `company_id` (uuid, FK → `companies.id`, NOT NULL)
  - `first_name`, `last_name` (NOT NULL)
  - `title`, `email`, `phone`
  - `preferred_contact` (text — `email`/`phone`/`video`)
  - `is_primary` (bool, NOT NULL)
- **RLS posture:** RLS disabled. Policy `p_contacts` scopes via parent
  company's firm but is inactive.

### `departments`

- **Purpose:** Firm's internal organizational departments.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (uuid, FK → `firms.id`, NOT NULL)
  - `name` (text, NOT NULL)
  - `is_active` (bool)
- **RLS posture:** Firm-isolated (real). SELECT for any user in firm;
  INSERT for admins only.

### `discussion_threads`

- **Purpose:** Threaded discussions attached to projects or meetings,
  with up to 5 levels of reply nesting.
- **Key columns:**
  - `id` (uuid, PK)
  - `project_id`, `firm_id` (uuid, NOT NULL)
  - `meeting_id` (uuid, FK → `meetings.id`)
  - `parent_id` (uuid, FK → self)
  - `author_id` (uuid, FK → `users.id`)
  - `body` (text, NOT NULL)
  - `depth` (integer, 0–4 enforced by check)
- **Primary FK relationships:**
  - `project_id` → `projects.id`
  - `meeting_id` → `meetings.id`
  - `parent_id` → `discussion_threads.id`
- **RLS posture:** Firm-isolated with internal/client split. INSERT
  restricted to firm. SELECT: internal users see firm; clients see only
  threads on their accessible projects.

### `discussion_topics`

- **Purpose:** Structured discussion topics raised on a project, with
  meeting-scheduling state.
- **Key columns:**
  - `id` (uuid, PK)
  - `project_id`, `firm_id` (uuid, NOT NULL)
  - `title` (text, NOT NULL)
  - `priority` (enum `action_item_priority`)
  - `status` (enum `topic_status`, default `pending`)
  - `raised_by` (uuid, FK → `users.id`)
  - `scheduled_meeting_id` (uuid, FK → `meetings.id`)
- **Lifecycle states:** `status` enum-backed (`topic_status`);
  enum values not captured.
- **RLS posture:** Firm-isolated (internal only) via
  `discussion_topics_internal`.

### `documents`

- **Purpose:** Project document storage records referencing Supabase
  Storage paths; supports client-visibility flag.
- **Key columns:**
  - `id` (uuid, PK)
  - `project_id`, `firm_id` (uuid, NOT NULL)
  - `uploaded_by` (uuid, FK → `users.id`)
  - `file_name` (text, NOT NULL)
  - `storage_path` (text, NOT NULL) — path within storage bucket
  - `client_visible` (bool)
  - `file_size_kb`, `file_type`
- **RLS posture:** Firm-isolated with internal/client split. Internal
  users: full access in firm. Clients: SELECT only where
  `client_visible = true` and project is accessible. INSERT internal
  only.

### `expenditures`

- **Purpose:** Project expense records with full procurement lifecycle
  timestamps (forecast → requested → approved → ordered → received).
- **Key columns:**
  - `id` (uuid, PK)
  - `project_id`, `firm_id` (uuid, NOT NULL)
  - `description` (text, NOT NULL)
  - `vendor`, `category`, `amount`, `phase`, `type`
  - `forecast_date`, `requested_date`, `approved_date`, `ordered_date`,
    `received_date`
  - `part_number`, `qty`, `vendor_pn`, `po_number`, `unit_price`
- **Lifecycle states (type):**
  `Materials`, `Rental`, `Capital`, `Shipping`, `Travel`, `Service`,
  `Other`
- **RLS posture:** Firm-isolated (internal only) via
  `expenditures_internal`.

### `external_contacts`

- **Purpose:** External contacts associated with a firm or project
  (vendors, clients, consultants) — similar to `contacts` but
  project-scoped and richer.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (uuid, NOT NULL)
  - `project_id` (uuid, FK → `projects.id`, nullable)
  - `first_name`, `last_name` (NOT NULL)
  - `contact_type` (enum `contact_type`, default `vendor`)
  - `email`, `phone_office`, `phone_cell`, `phone_toll_free`
  - Full mailing address columns
- **RLS posture:** Firm-isolated (internal only) via
  `external_contacts_internal`.

### `external_response_tokens`

- **Purpose:** Single-use tokens for external (non-logged-in) users to
  submit workflow step responses. Paired with workflow step instances.
- **Key columns:**
  - `id` (uuid, PK)
  - `token` (text, NOT NULL; default `gen_random_uuid()::text`)
  - `instance_id` (uuid, FK → `workflow_instances.id`, NOT NULL)
  - `template_step_id` (uuid, FK → `workflow_template_steps.id`, NOT NULL)
  - `firm_id` (uuid, NOT NULL)
  - `assignee_email` (text, NOT NULL)
  - `expires_at` (timestamptz, NOT NULL; default now + 7 days)
  - `used_at` (timestamptz)
- **Primary FK relationships:**
  - `instance_id` → `workflow_instances.id`
  - `template_step_id` → `workflow_template_steps.id`
- **RLS posture:** Open. Policy `token holder access` allows SELECT
  with `USING (true)` — intentional (external bearer-token access).

### `external_step_tokens`

- **Purpose:** Richer variant of `external_response_tokens`, with full
  metadata snapshot (step name, instructions, PM contact, template name)
  and HMAC-validated token. The `respond-step` Edge Function operates
  on this table.
- **Key columns:**
  - `id` (uuid, PK)
  - `step_instance_id` (uuid, FK → `workflow_step_instances.id`)
  - `firm_id` (uuid)
  - `token_hash`, `token`, `token_hmac` (text)
  - `recipient_email`, `recipient_name`, `recipient_org`
  - `expires_at`, `issued_at`, `opened_at`, `submitted_at`, `expired_at`
  - `ip_at_open`, `user_agent_at_open`, `ip_at_submit`, `user_agent_at_submit`
  - `outcome`, `outcome_notes`, `outcomes_json`, `used_outcome`
  - Snapshot fields: `step_name`, `step_instructions`, `instance_title`,
    `template_name`, `pm_email`, `pm_name`
- **Relationship to `external_response_tokens`:** These appear to be
  two generations of the same concept. `respond-step` Edge Function
  uses `external_step_tokens`; whether `external_response_tokens` is
  still actively used is unclear from the schema alone.
- **RLS posture:** Open. Separate policies for `INSERT` (authenticated)
  and `SELECT` (anon + authenticated) — anonymous reads permitted for
  token-holder access.

### `firm_modules`

- **Purpose:** Tracks which modules/features each firm has enabled.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (uuid, FK → `firms.id`, NOT NULL)
  - `modules` (text array, NOT NULL, default `{}`)
- **RLS posture:** Firm-isolated via JWT claim. Policy reads
  `(auth.jwt() ->> 'firm_id')::uuid`. SELECT only; no write policies
  captured.

### `firms`

- **Purpose:** Tenant/organization root. Each firm is a customer or
  internal organization.
- **Key columns:**
  - `id` (uuid, PK)
  - `name` (text, NOT NULL)
  - `is_internal` (bool)
  - `logo_path`, `logo_url`
  - Full mailing address
  - Chief contact fields
  - `is_active`
- **RLS posture:** RLS disabled. Policy `firms_select` exists with
  complex logic (union of internal-user access, own firm, and client
  projects' firms) but is inactive. Effectively open to any
  authenticated user.

### `form_annotations`

- **Purpose:** Reviewer pins/regions on workflow form definitions with
  percentage-based coordinates for positioning over the form image.
- **Key columns:**
  - `id` (uuid, PK)
  - `form_def_id` (uuid, FK → `workflow_form_definitions.id`, NOT NULL)
  - `reviewer_id`, `reviewer_name`
  - `page` (integer, default 1)
  - `type` (text: `pin` / `region` — CHECK constrained)
  - `x_pct`, `y_pct`, `w_pct`, `h_pct` (double precision — coordinates)
  - `comment` (text, NOT NULL)
  - `resolved` (bool, NOT NULL)
- **RLS posture:** Open. Policy `firm_isolation` with `USING (true)` /
  `WITH CHECK (true)` (misleadingly named — no actual firm isolation).

### `form_categories`

- **Purpose:** Organizational categories for form templates, with per-
  category reviewer and approver assignments and versioning format.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (uuid, FK → `firms.id`, NOT NULL)
  - `name` (text, NOT NULL)
  - `reviewer_ids` (uuid array, NOT NULL)
  - `approver_id` (uuid)
  - `version_format` (text; see Lifecycle states)
- **Lifecycle states (version_format):** `semver`, `rev_letter`, `integer`
- **RLS posture:** Hardcoded single-firm.

### `form_drafts`

- **Purpose:** Per-user autosave drafts of in-progress form fills.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (uuid, NOT NULL)
  - `user_id` (uuid, NOT NULL)
  - `form_def_id` (uuid, NOT NULL)
  - `form_data` (jsonb)
- **RLS posture:** Hardcoded single-firm.

### `form_instance_records`

- **Purpose:** Filled form content (the "Lifecycle 2" instance of a
  form definition), with full review/approval state, reviewer tracking,
  review rounds, and evidence PDF linkage.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (uuid, NOT NULL)
  - `form_def_id` (uuid, FK → `workflow_form_definitions.id`, NOT NULL)
  - `instance_id` (uuid — workflow instance), `step_id` (uuid — step)
  - `assignee_id` (uuid)
  - `content_state` (text; see Lifecycle states)
  - `reviewer_ids`, `reviewed_by` (uuid arrays)
  - `approver_id`, `approved_by`, `approved_at`
  - `review_note`, `review_round`, `response_rounds` (jsonb)
  - `evidence_pdf_path`, `evidence_pdf_url`
  - `submitted_at`
- **Lifecycle states (content_state):**
  - `open` — in progress
  - `submitted` — submitted for review
  - `in_review` — at least one reviewer has acted
  - `reviewed` — all reviewers approved, awaiting approver
  - `approved` — content approver approved
  - `rejected_review` — rejected by a reviewer
  - `rejected_approval` — rejected by approver
- **RLS posture:** Firm-isolated via resource lookup. SELECT: firm
  match via resources table. ALL: assignee can write their own records.
  service_role has full access via `service_role_form_instance_records`
  policy.

### `form_review_tokens`

- **Purpose:** Bearer tokens for reviewers and approvers to sign off
  on forms (both definition-level and instance-level) without logging
  in. Consumed by `process-form-decision` Edge Function.
- **Key columns:**
  - `id` (uuid, PK)
  - `form_def_id` (uuid, FK → `workflow_form_definitions.id`, NOT NULL)
  - `reviewer_id`, `reviewer_email`, `reviewer_name`
  - `token` (text, NOT NULL; default `gen_random_uuid()::text`)
  - `role` (text; `reviewer` or `approver` — CHECK constrained)
  - `context` (text; `definition` or `instance` — CHECK constrained)
  - `instance_id`, `response_id`, `record_id` (uuids)
  - `expires_at` (default now + 7 days), `used_at`
- **Lifecycle states (role):** `reviewer`, `approver`
- **Lifecycle states (context):** `definition`, `instance`
- **RLS posture:** Open. Policy `firm_isolation` with
  `USING (true)` / `WITH CHECK (true)`.

### `form_templates`

- **Purpose:** Uploaded source forms (PDF/DOCX) being absorbed/converted
  into workflow form definitions. Populated by `ai-form-vision` Edge
  Function output.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (uuid)
  - `name` (text, NOT NULL)
  - `source_file_url`, `source_file_type`
    (`pdf`/`docx`/`manual` — CHECK)
  - `extracted_fields`, `field_assignments`, `conditional_rules`
    (jsonb)
  - `routing_order` (array)
  - `form_html` (text)
  - `absorption_confidence` (numeric, 0–1)
  - `status` (text; see Lifecycle states)
  - `created_by` (uuid, FK → `users.id`)
- **Lifecycle states (status):**
  - `absorbing` — AI extraction in progress
  - `review_required` — needs human review
  - `active` — in use
  - `archived` — retired
- **RLS posture:** Open (authenticated). Policy
  `firm_access_form_templates` with `USING (true)` for `authenticated`
  role.

### `health_scores`

- **Purpose:** Firm-level composite health scores with per-domain
  breakdowns, stored as snapshots. Likely feeds a dashboard.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (uuid, FK → `firms.id`, NOT NULL)
  - `composite_score` (numeric, NOT NULL)
  - `domain_scores`, `domain_details`, `threshold_config` (jsonb)
  - `triggered_by`, `calculated_at`
- **RLS posture:** RLS disabled.

### `hud_role_categories`

- **Purpose:** Categorization groups for HUD roles (e.g. Engineering,
  Management, Quality).
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (uuid, FK → `firms.id`)
  - `name` (text, NOT NULL)
  - `sort_order` (integer)
- **RLS posture:** Read-all (public). Writes require authenticated role.

### `hud_role_levels`

- **Purpose:** Per-role level definitions with hourly overhead rates.
- **Key columns:**
  - `id` (uuid, PK)
  - `role_id` (uuid, FK → `hud_roles.id`)
  - `level` (text; see Lifecycle states)
  - `overhead_rate_per_hour` (numeric, NOT NULL)
- **Lifecycle states (level):**
  `junior`, `staff`, `senior`, `principal`
- **RLS posture:** Read-all (public); writes require authenticated.

### `hud_roles`

- **Purpose:** Named HUD roles (e.g. "Mechanical Engineer",
  "Project Manager") scoped to a firm and category.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (uuid, FK → `firms.id`)
  - `category_id` (uuid, FK → `hud_role_categories.id`)
  - `name` (text, NOT NULL)
  - `abbreviation`, `is_active`, `sort_order`
- **RLS posture:** Read-all (public); writes require authenticated.

### `hud_skill_categories`

- **Purpose:** Top-level skill categories (e.g. Software, Mechanical).
- **Key columns:** `id`, `firm_id`, `name` (NOT NULL), `icon`,
  `sort_order`
- **RLS posture:** Read-all; writes authenticated.

### `hud_skill_domains`

- **Purpose:** Industry/domain classifications (e.g. "Medical Devices",
  "Aerospace") for resource experience tracking.
- **Key columns:** `id`, `firm_id`, `name` (NOT NULL), `industry`,
  `description`
- **RLS posture:** Read-all; writes authenticated.

### `hud_skills`

- **Purpose:** Named skills that resources can possess (e.g. "CAD",
  "PCB Design", "Regulatory Submissions").
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (uuid, FK → `firms.id`)
  - `category_id` (uuid, FK → `hud_skill_categories.id`)
  - `name` (text, NOT NULL)
  - `aliases` (array)
  - `is_technical`, `is_active`
- **RLS posture:** Read-all; writes authenticated.

### `interventions`

- **Purpose:** Records management interventions (reassignments,
  meetings convened, escalations, process changes) triggered by project
  signals, with expected-effect and measured-outcome tracking.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (uuid, NOT NULL)
  - `project_id`, `instance_id` (uuids)
  - `trigger_signal_type`, `trigger_signal_ref` (uuid)
  - `action_type` (text; see Lifecycle states)
  - `action_description` (text, NOT NULL)
  - `expected_effect`, `outcome`, `outcome_notes`
  - `measurement_window_hours`
  - `escalation_recommended` (bool)
- **Lifecycle states (action_type):**
  - `resource_reassignment`
  - `meeting_convened`
  - `action_item_created`
  - `template_redesign`
  - `escalation`
  - `process_change`
  - `external_intervention`
- **Lifecycle states (outcome):**
  `pending` (default), `positive`, `negative`
- **RLS posture:** Firm-isolated via resource lookup.

### `invoice_line_items`

- **Purpose:** Line items on invoices, linked to tasks and users, with
  hours/rate/amount.
- **Key columns:**
  - `id` (uuid, PK)
  - `invoice_id` (uuid, FK → `invoices.id`, NOT NULL)
  - `user_id` (uuid, FK → `users.id`)
  - `task_id` (uuid, FK → `tasks.id`)
  - `legacy_task_journal_id`, `coc_event_id` (uuids)
  - `description` (NOT NULL)
  - `hours`, `rate`, `amount` (numeric, NOT NULL;
    `amount >= 0`, `hours > 0` by check)
  - `sequence_order` (integer, NOT NULL)
- **RLS posture:** Firm-isolated (real). SELECT gated by parent
  invoice firm + `NOT is_client()`. INSERT/DELETE gated by parent
  invoice's draft status AND admin role.

### `invoices`

- **Purpose:** Client invoices with periods, invoice type, billing
  period frequency, totals, and status lifecycle.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id`, `client_id` (uuid FKs → `firms.id`, NOT NULL)
  - `project_id` (uuid, FK → `projects.id`, NOT NULL)
  - `invoice_number` (text, NOT NULL)
  - `invoice_type` (enum `invoice_type`, default `simple`, NOT NULL)
  - `billing_period` (enum `billing_period`, default `monthly`,
    NOT NULL)
  - `period_start`, `period_end` (date, NOT NULL; ordering enforced
    by check)
  - `status` (enum `invoice_status`, default `draft`)
  - `subtotal`, `tax_rate`, `tax_amount`, `total` (numeric)
  - `sent_at`, `paid_at`
- **Lifecycle states:** `status` is enum-backed; values include at
  least `draft` (used by RLS policies on `invoice_line_items`).
- **RLS posture:** Firm-isolated (real). SELECT internal users only.
  INSERT/UPDATE admin only. DELETE admin only and invoice must be
  `draft`.

### `issue_report_messages`

- **Purpose:** Messages/replies on issue reports (bug reports, feedback).
- **Key columns:**
  - `id` (uuid, PK)
  - `issue_report_id` (uuid, FK → `issue_reports.id`, NOT NULL)
  - `author_id` (uuid, FK → `users.id`)
  - `message_type` (enum `message_type`, default `reply`)
  - `body` (NOT NULL)
- **RLS posture:** Firm-isolated through parent issue report.
  Visibility: admins + original reporter only.

### `issue_reports`

- **Purpose:** Bug reports and feedback from users, with automatic
  browser info capture and screenshot attachments.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (uuid, FK → `firms.id`, NOT NULL)
  - `project_id` (uuid, FK → `projects.id`)
  - `reported_by` (uuid, FK → `users.id`)
  - `report_type` (enum `report_type`, NOT NULL)
  - `title` (NOT NULL)
  - `severity` (enum)
  - `recent_activity_log`, `browser_info`, `attachments` (jsonb)
  - `auto_screenshot_path` (text)
  - `status` (enum `issue_status`, default `submitted`)
  - `fixed_in_version`
- **Lifecycle states:** `status` enum; values not captured.
- **RLS posture:** Firm-isolated. SELECT: admins see all in firm,
  reporter sees own. UPDATE admin only.

### `journal_replies`

- **Purpose:** Replies on journal entries (the pre-workflow comment
  system; parent types: `journal` or `reply`).
- **Key columns:**
  - `id` (uuid, PK)
  - `parent_id`, `parent_type` (NOT NULL)
  - `task_id`, `project_id` (uuid FKs)
  - `author_id` (uuid, FK → `users.id`)
  - `body` (NOT NULL, non-empty by check)
- **Lifecycle states (parent_type):** `journal`, `reply`
- **RLS posture:** Firm-scoped via project firm OR
  `user_project_access`. Authors can update/delete own replies.

### `labor_costs`

- **Purpose:** Budgeted vs. actual labor costs per project/phase/
  resource.
- **Key columns:** `id`, `project_id`, `firm_id`, `resource_id`,
  `phase`, `budgeted_hours`, `actual_hours`, `rate`, `budgeted_cost`,
  `actual_cost`
- **RLS posture:** Firm-isolated (internal only).

### `material_line_items`

- **Purpose:** Material/procurement line items on projects or proposals,
  with status lifecycle and ordering/receipt dates.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (uuid, FK → `firms.id`, NOT NULL)
  - `project_id`, `proposal_id` (uuid FKs)
  - `name` (NOT NULL), `supplier`, `currency` (default `JPY`)
  - `budgeted_cost`, `actual_cost`, `quantity`, `unit`
  - `status` (text; see Lifecycle states)
  - `ordered_at`, `eta`, `received_at`, `approved_at`
  - `blocking_step_id`, `blocking_step_name`
- **Lifecycle states (status):**
  `planned`, `ordered`, `in_transit`, `received`, `approved`, `cancelled`
- **RLS posture:** Firm-isolated via resource lookup.

### `material_rework_events`

- **Purpose:** Records material rework incidents with original vs.
  reorder cost deltas.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (NOT NULL)
  - `material_line_id` (uuid, FK → `material_line_items.id`, NOT NULL)
  - `reason` (NOT NULL)
  - `original_cost`, `reorder_cost`, `cost_delta`
  - `source_event_id`, `instance_id` (uuids)
- **RLS posture:** Firm-isolated via resource lookup.

### `meeting_action_items`

- **Purpose:** Action items captured during meetings (older pattern,
  parallel to the `action_items` table).
- **Key columns:**
  - `id` (uuid, PK)
  - `meeting_id` (uuid, FK → `meetings.id`, NOT NULL)
  - `agenda_item_id` (uuid, FK → `meeting_agenda_items.id`)
  - `description` (NOT NULL)
  - `assigned_to_resource`, `assigned_to_contact` (uuid FKs)
  - `due_date`, `include_in_minutes` (bool, NOT NULL)
  - `status` (text; see Lifecycle states)
- **Lifecycle states (status):**
  `open`, `in_progress`, `complete`, `cancelled`
- **RLS posture:** RLS disabled.

### `meeting_agenda_items`

- **Purpose:** Individual agenda line items for a meeting.
- **Key columns:**
  - `id` (uuid, PK)
  - `meeting_id` (uuid, FK → `meetings.id`, NOT NULL)
  - `title` (NOT NULL), `description`, `presenter_id`
  - `duration_minutes`, `sequence_order` (integer, NOT NULL)
  - `department_id` (uuid, FK → `departments.id`)
  - `notes_captured`, `is_flagged`, `include_in_minutes`
- **RLS posture:** RLS disabled.

### `meeting_attendees`

- **Purpose:** Attendance records for a meeting — polymorphic across
  internal users, stakeholders, and external contacts (exactly one of
  the three IDs must be set per row).
- **Key columns:**
  - `id` (uuid, PK)
  - `meeting_id` (uuid, FK → `meetings.id`, NOT NULL)
  - `user_id` (uuid, FK → `users.id`)
  - `stakeholder_id` (uuid, FK → `stakeholders.id`)
  - `external_contact_id` (uuid, FK → `external_contacts.id`)
  - `attendance_status` (enum `attendance_status`, default `invited`)
  - `is_required`, `notified_at`
- **Check constraint:** Exactly one of `user_id`, `stakeholder_id`,
  `external_contact_id` must be set.
- **RLS posture:** RLS disabled.

### `meeting_comments`

- **Purpose:** Discussion comments on meetings.
- **Key columns:** `id`, `firm_id`, `meeting_id` (NOT NULL),
  `parent_id`, `author_resource_id`, `author_name` (NOT NULL), `body`
- **RLS posture:** Hardcoded single-firm.

### `meeting_decisions`

- **Purpose:** Formal decisions recorded during a meeting, with impact
  area and links to change requests.
- **Key columns:**
  - `id` (uuid, PK)
  - `meeting_id` (uuid, FK → `meetings.id`, NOT NULL)
  - `decision_text` (NOT NULL)
  - `decided_by` (uuid, FK → `users.id`)
  - `impact_area` (enum `impact_area`, default `other`)
  - `related_change_request_id` (uuid, FK → `change_log.id`)
- **RLS posture:** RLS disabled.

### `meeting_minutes`

- **Purpose:** Meeting minutes document — summary, discussion notes,
  decisions, send/distribution state.
- **Key columns:**
  - `id` (uuid, PK)
  - `meeting_id` (uuid, FK → `meetings.id`, NOT NULL)
  - `recorded_by`, `prepared_by` (uuid FKs)
  - `summary`, `discussion_notes`, `decisions_made`
  - `status` (enum `minutes_status`, default `draft`)
  - `email_subject`, `email_message`, `sent_at`, `sent_by`
  - `cc_recipients` (array)
- **RLS posture:** RLS disabled.

### `meeting_ratings`

- **Purpose:** Per-attendee ratings and accuracy feedback on meetings
  and their minutes.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id`, `meeting_id` (NOT NULL)
  - `rater_resource_id`, `rater_user_id` (uuid)
  - `rating` (integer, 1–5)
  - `minutes_accurate` (bool)
  - `correction_text`, `correction_accepted`
  - `nudge_sent`, `no_response`, `responded_at`
- **RLS posture:** RLS enabled but no policies captured — locked.

### `meetings`

- **Purpose:** Meetings — scheduled events with project/prospect
  context, organizer, attendee list, and meeting-chain tracking via
  `prior_meeting_id`.
- **Key columns:**
  - `id` (uuid, PK)
  - `project_id`, `prospect_id`, `client_id` (uuid FKs)
  - `firm_id` (NOT NULL)
  - `title` (NOT NULL)
  - `meeting_type` (enum `meeting_type`, default `status`)
  - `scheduled_date` (NOT NULL), `scheduled_duration_minutes`
  - `status` (enum `meeting_status`, default `scheduled`)
  - `organizer_id`, `prior_meeting_id`
  - `purpose`, `outcome`, `work_stream`, `is_recurring`
- **Lifecycle states (outcome):**
  `closed`, `deferred`, `partial`, `upcoming`, `draft`
- **RLS posture:** RLS disabled. Policies exist (internal/client split
  similar to `projects`) but are inactive.

### `messages`

- **Purpose:** Project-scoped direct messages, with attachment support.
- **Key columns:**
  - `id` (uuid, PK)
  - `project_id`, `firm_id` (NOT NULL)
  - `sender_id` (uuid, FK → `users.id`)
  - `content` (NOT NULL), `has_attachment`, `attachment_path`
- **RLS posture:** Firm-isolated with internal/client split. Internal:
  firm match. Clients: on their accessible projects only.

### `milestones`

- **Purpose:** Project milestones with target/actual dates and status.
- **Key columns:**
  - `id` (uuid, PK)
  - `project_id`, `firm_id` (NOT NULL)
  - `phase`, `description` (NOT NULL), `name`
  - `responsible` (uuid, FK → `users.id`)
  - `initial_target_date`, `current_target_date`, `target_date`,
    `actual_date`
  - `status` (enum `milestone_status`, default `not_started`)
  - `sequence_order`, `sort_order`
- **RLS posture:** RLS disabled. Policies exist (internal/client split)
  but are inactive.

### `minutes_recipients`

- **Purpose:** Meeting-minutes distribution list — resources, contacts,
  or email-only overrides.
- **Key columns:**
  - `id` (uuid, PK)
  - `minutes_id` (uuid, FK → `meeting_minutes.id`, NOT NULL)
  - `resource_id`, `contact_id` (uuid FKs)
  - `email_override` (text)
- **Check constraint:** At least one of `resource_id`, `contact_id`, or
  `email_override` must be set.
- **RLS posture:** RLS enabled but no policies captured — locked.

### `morning_briefs`

- **Purpose:** Daily AI-generated "morning brief" per resource, with
  role-tier targeting and delta-from-prior tracking.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (NOT NULL)
  - `resource_id` (uuid, FK → `resources.id`)
  - `role_tier` (text; see Lifecycle states)
  - `brief_date` (NOT NULL)
  - `content_json` (jsonb, NOT NULL, default `{}`)
  - `delta_from_prior`, `annotations` (jsonb)
  - `instance_ids`, `project_ids` (arrays)
- **Lifecycle states (role_tier):** `pm`, `manager`, `executive`
- **RLS posture:** Firm-isolated via resource lookup.

### `mrb_cases`

- **Purpose:** Material Review Board cases for handling non-conforming
  materials (NCMRs).
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (NOT NULL)
  - `ncmr_id` (uuid, FK → `ncmrs.id`)
  - `status`, `disposition`
- **RLS posture:** RLS disabled.

### `ncmrs`

- **Purpose:** Non-Conforming Material Reports, with supplier and
  classification.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (NOT NULL)
  - `supplier_id` (uuid, FK → `suppliers.id`)
  - `ncmr_number` (NOT NULL)
  - `status`, `classification`, `material_value`, `days_on_hold`
- **RLS posture:** RLS disabled.

### `note_blocks`

- **Purpose:** Content blocks inside a note (body text and embedded
  entity cards).
- **Key columns:**
  - `id` (uuid, PK)
  - `note_id` (uuid, FK → `notes.id`, NOT NULL)
  - `author_user_id` (NOT NULL)
  - `block_type` (text: `text` or `card` — CHECK constrained)
  - `content`, `entity_type`, `entity_id`
  - `sort_order` (NOT NULL)
- **RLS posture:** RLS disabled.

### `note_messages`

- **Purpose:** Chat-style messages attached to a collaborative note.
- **Key columns:** `id`, `note_id` (NOT NULL), `author_user_id` (NOT NULL),
  `author_name`, `body` (NOT NULL)
- **RLS posture:** RLS disabled.

### `note_participants`

- **Purpose:** Who is invited/joined to a collaborative note, with
  cursor/presence color tracking.
- **Key columns:**
  - `id` (uuid, PK)
  - `note_id` (uuid, FK → `notes.id`, NOT NULL)
  - `user_id` (NOT NULL), `resource_id`
  - `role` (text: `owner` or `participant` — CHECK constrained)
  - `color`, `invited_at`, `accepted_at`, `last_seen_at`
- **RLS posture:** RLS disabled.

### `notes`

- **Purpose:** Collaborative notes — user-owned notebook with hierarchy,
  optional entity linkage, and workspace views.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (NOT NULL)
  - `owner_user_id` (NOT NULL)
  - `title`, `content`
  - `entity_id`, `entity_type` (polymorphic)
  - `parent_note_id` (uuid, FK → self)
  - `hierarchy_path` (default `'Inbox'`)
  - `is_inbox` (bool)
  - `content_blocks` (jsonb)
- **Note on constraint:** `entity_type` CHECK currently restricts to
  `view_invite` or `view_removed` — unusually narrow; may be a
  mis-named constraint or indicate this table is used for view
  invitations only in practice.
- **RLS posture:** RLS disabled.

### `notes_workspace`

- **Purpose:** Per-user workspace state JSON for the notes UI.
- **Key columns:** `id`, `firm_id` (NOT NULL), `user_id` (NOT NULL),
  `state` (jsonb, NOT NULL)
- **RLS posture:** RLS disabled.

### `notifications`

- **Purpose:** Per-user in-app notifications, referencing a source
  table/row.
- **Key columns:**
  - `id` (uuid, PK)
  - `user_id` (NOT NULL), `firm_id` (NOT NULL)
  - `notification_type` (enum)
  - `reference_table`, `reference_id` (polymorphic)
  - `title` (NOT NULL), `body`
  - `status` (enum `notif_status`, default `unread`)
  - `read_at`
- **RLS posture:** Per-user. `notifications_own`: SELECT/UPDATE only
  where `user_id = auth.uid()`.

### `phase_templates`

- **Purpose:** Templates for project phases (e.g. standard PMI lifecycle
  stages), cloneable into new projects.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (NOT NULL)
  - `template_name` (NOT NULL)
  - `is_standard_pmi`, `is_active`
  - `created_by` (uuid, FK → `users.id`)
- **RLS posture:** Firm-isolated (real). SELECT for any firm user;
  full CRUD for admins.

### `project_daily_snapshots`

- **Purpose:** Daily snapshot metrics per project — CPI, SPI, TCPI,
  earned value, task counts, billable hours, revenue.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id`, `project_id`, `snapshot_date` (NOT NULL)
  - `cpi`, `spi`, `tcpi`, `ev_pct`, `actual_hrs`, `slip_days`, `p50_date`
  - `total_tasks`, `complete_tasks`, `overdue_tasks`, `blocked_tasks`,
    `in_progress_tasks`
  - `billable_hrs_today`, `billable_hrs_week_to_date`,
    `billable_hrs_month_to_date`
  - `revenue_today`, `revenue_week_to_date`, `revenue_month_to_date`
  - `open_requests`
- **RLS posture:** Hardcoded single-firm.

### `projects`

- **Purpose:** Central project table — the core unit of work with
  budget, schedule, PM, and phase state.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (NOT NULL), `client_id` (uuid, FK → `firms.id`)
  - `company_id` (uuid, FK → `companies.id`)
  - `source_proposal_id` (uuid, FK → `proposals.id`)
  - `pm_resource_id` (uuid, FK → `resources.id`)
  - `name` (NOT NULL)
  - `status` (enum `project_status`, default `planning`)
  - `phase`
  - `start_date`, `target_date`, `actual_end_date`
  - `budget_baseline_hours`, `current_budget_hours`,
    `budget_baseline_locked`
  - `expense_budget_baseline`, `current_expense_budget`
  - `contingency_reserve`, `management_reserve`, `materials_budget`
- **Lifecycle states:** `status` enum-backed; default `planning`.
- **RLS posture:** Firm-isolated with internal/client split. Internal:
  firm match. Clients: only projects in `my_project_ids()`. INSERT
  admin-only. UPDATE internal-only.

### `proposals`

- **Purpose:** Sales proposals to prospects — version, status, labor
  and material cost rollups, reserves.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (NOT NULL), `prospect_id` (FK → `prospects.id`, NOT NULL)
  - `title` (NOT NULL), `version` (NOT NULL, default `'1.0'`)
  - `status` (text; see Lifecycle states)
  - `sent_date`, `approved_date`, `expiry_date`
  - `total_labor_cost`, `total_material_cost`, `total_cost`
  - `contingency_reserve`, `management_reserve`
  - `created_by` (uuid, FK → `resources.id`)
- **Lifecycle states (status):**
  `draft`, `in_review`, `sent`, `approved`, `rejected`, `expired`
- **RLS posture:** RLS disabled. Policy `p_proposals` scopes via
  `current_firm_id()` but is inactive.

### `prospect_action_items`

- **Purpose:** Action items on sales prospects.
- **Key columns:**
  - `id` (uuid, PK)
  - `prospect_id` (uuid, FK → `prospects.id`, NOT NULL)
  - `activity_id` (uuid, FK → `prospect_activities.id`)
  - `description` (NOT NULL)
  - `assigned_to`, `created_by` (uuid FKs → `resources.id`)
  - `due_date`, `completed_at`
  - `status` (text; `open`/`in_progress`/`complete`/`cancelled`)
- **Lifecycle states (status):**
  `open`, `in_progress`, `complete`, `cancelled`
- **RLS posture:** RLS disabled.

### `prospect_activities`

- **Purpose:** Activity log on a sales prospect (calls, emails,
  meetings, stage changes).
- **Key columns:**
  - `id` (uuid, PK)
  - `prospect_id` (NOT NULL, FK → `prospects.id`)
  - `type` (text; see Lifecycle states)
  - `date` (NOT NULL), `duration_minutes`
  - `summary`, `findings_summary`
  - `stage_from`, `stage_to`
  - `created_by` (uuid, FK → `resources.id`)
- **Lifecycle states (type):**
  `call`, `video_call`, `email`, `in_person`, `note`, `stage_change`
- **RLS posture:** RLS disabled.

### `prospect_contact_links`

- **Purpose:** Joins prospects to contacts (stakeholder mapping) with
  role and influence scoring.
- **Key columns:**
  - `id` (uuid, PK)
  - `prospect_id`, `contact_id` (NOT NULL FKs)
  - `stakeholder_role` (text; see Lifecycle states)
  - `influence_score` (integer, 1–10)
- **Lifecycle states (stakeholder_role):**
  `decision_maker`, `technical_authority`, `budget_holder`, `champion`,
  `blocker`, `technical`, `other`
- **RLS posture:** RLS disabled.

### `prospect_findings`

- **Purpose:** Discovery findings on a prospect — categorized insights
  with sentiment.
- **Key columns:**
  - `id` (uuid, PK)
  - `prospect_id` (NOT NULL), `activity_id` (uuid)
  - `category` (text; see Lifecycle states)
  - `content` (NOT NULL)
  - `sentiment` (text; `positive`/`neutral`/`flag`)
  - `created_by` (FK → `resources.id`)
- **Lifecycle states (category):**
  `technical`, `commercial`, `stakeholder`, `risk`, `regulatory`, `other`
- **Lifecycle states (sentiment):**
  `positive`, `neutral`, `flag`
- **RLS posture:** RLS disabled.

### `prospects`

- **Purpose:** Sales pipeline records — CRM-style prospects with stage,
  value estimate, and follow-up tracking.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id`, `company_id` (NOT NULL)
  - `title` (NOT NULL)
  - `stage` (text; see Lifecycle states)
  - `priority` (text; `low`/`medium`/`high`)
  - `source`, `industry_tag`
  - `assigned_to` (uuid, FK → `resources.id`)
  - `budget_range_low`, `budget_range_high`
  - `timeline_urgency` (text; see Lifecycle states)
  - `est_value`, `next_follow_up_date`, `next_follow_up_type`,
    `next_steps`
- **Lifecycle states (stage):**
  `prospect`, `qualifying`, `discovery`, `proposal`, `review`,
  `approved`, `declined`
- **Lifecycle states (timeline_urgency):**
  `exploring`, `within_6_months`, `within_3_months`, `immediate`
- **RLS posture:** RLS disabled.

### `resource_allocations`

- **Purpose:** Time-bounded allocation of a resource to a project
  (percentage + dates).
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id`, `resource_id`, `project_id` (NOT NULL FKs)
  - `start_date`, `end_date` (NOT NULL)
  - `allocation_pct` (numeric, NOT NULL, 0 < x <= 100)
  - `created_by` (uuid, FK → `resources.id`)
- **RLS posture:** Open. Policy `firm isolation` with `USING (true)`
  (misleadingly named).

### `resource_calendars`

- **Purpose:** Per-resource PTO, training, and travel calendar entries,
  with firm-wide holiday support.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id`, `resource_id` (uuid)
  - `date` (NOT NULL), `available_hours` (NOT NULL)
  - `calendar_type` (text; see Lifecycle states)
  - `is_firm_wide` (bool), `note`
- **Lifecycle states (calendar_type):**
  `holiday`, `pto`, `training`, `travel`, `other`
- **RLS posture:** Read-all (public); writes authenticated.

### `resource_domain_experience`

- **Purpose:** Resource's domain/industry experience (e.g. "Class II
  Medical Devices, 5 years at Company X").
- **Key columns:**
  - `id` (uuid, PK)
  - `resource_id` (NOT NULL)
  - `domain_id` (uuid, FK → `hud_skill_domains.id`)
  - `domain_name`, `subsystem`, `regulatory_class`
  - `years_experience`, `context`, `company_context`
- **Lifecycle states (regulatory_class):**
  `Class I`, `Class II`, `Class III`, `De Novo`, `PMA`, `510(k)`, `N/A`
- **RLS posture:** Read-all (public); writes authenticated.

### `resource_profiles`

- **Purpose:** Extended resource profile — education, certifications,
  prior companies, notable projects (arrays).
- **Key columns:**
  - `id` (uuid, PK)
  - `resource_id` (NOT NULL, FK → `resources.id`)
  - `education`, `certifications`, `prior_companies`,
    `notable_projects` (arrays)
  - `specialty_summary`, `linkedin_url`
- **RLS posture:** Read-all (public); writes authenticated.

### `resource_request_notifications`

- **Purpose:** Notification log for resource request lifecycle events
  (tiered follow-ups, escalations, approvals).
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id`, `request_id` (NOT NULL FKs)
  - `recipient_resource_id` (uuid), `recipient_email`
  - `notification_type` (text; see Lifecycle states)
  - `channel` (text; `in_app`/`email`/`both`)
  - `subject`, `body`, `sent_at`, `opened_at`, `acted_upon_at`
- **Lifecycle states (notification_type):**
  `initial_request`, `tier1_followup`, `tier2_followup`,
  `tier3_escalation`, `escalation_email`, `approval_confirmation`,
  `denial_notification`, `counter_proposal`, `meeting_reminder`
- **RLS posture:** Open. Policy `allow all` with `USING (true)` /
  `WITH CHECK (true)`.

### `resource_requests`

- **Purpose:** Requests from one resource for another resource's time
  on a project, with SLA-tiered follow-up and full negotiation state
  (approval, denial, counter, escalation).
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (NOT NULL)
  - `requesting_resource_id`, `requested_resource_id` (FKs → `resources.id`, NOT NULL)
  - `project_id` (NOT NULL), `task_id`
  - `approver_resource_id`
  - `urgency` (text; `critical`/`high`/`medium`/`low`)
  - `hours_requested`, `weeks_requested`, `allocation_pct`
  - `proposed_start`, `proposed_end`
  - `context` (NOT NULL), `impact_statement`, `attempts_made`
  - `status` (text; see Lifecycle states)
  - `denial_reason`, `denial_resource_id`, `denied_at`
  - `counter_resource_id`, `counter_notes`, `countered_at`
  - `escalated_to_resource_id`, `escalated_at`, `escalation_reason`
  - `injected_meeting_id`, `injected_at`
  - `resolved_at`, `resolution_notes`
  - `sla_tier1_hours` (default 4), `sla_tier2_hours` (default 24),
    `sla_tier3_hours` (default 48)
- **Lifecycle states (status):**
  `pending`, `acknowledged`, `approved`, `denied`, `countered`,
  `delegated`, `escalated`, `withdrawn`, `expired`
- **Lifecycle states (urgency):** `critical`, `high`, `medium`, `low`
- **RLS posture:** Open. Policy `allow all` with `USING (true)`.

### `resource_scorecards`

- **Purpose:** Computed per-resource performance scorecards with
  composite and sub-indices (execution, resilience, estimation,
  complexity, quality, PM-specific).
- **Key columns:**
  - `id` (uuid, PK)
  - `resource_id` (NOT NULL, FK → `resources.id`)
  - `task_count`, `exonerated_count`
  - `execution_index`, `resilience_index`, `estimation_accuracy`,
    `complexity_uplift`, `trend_direction`, `quality_index`,
    `composite_score`
  - `pm_eri`, `pm_spi_mean`, `pm_rework_rate`, `pm_overallocation_rate`
  - `strengths`, `development_areas` (arrays)
  - `scorecard_summary` (text)
- **RLS posture:** Open (authenticated).

### `resource_skills`

- **Purpose:** Joins resources to skills with proficiency level, years,
  and optional verification.
- **Key columns:**
  - `id` (uuid, PK)
  - `resource_id` (NOT NULL), `skill_id` (NOT NULL)
  - `proficiency` (text; see Lifecycle states)
  - `years_experience`, `last_used_date`
  - `verified_by` (FK → `users.id`), `verified_at`
- **Lifecycle states (proficiency):**
  `aware`, `practitioner`, `expert`, `authority`
- **RLS posture:** Open. Duplicate read policies (`rs_read` and
  `read all resource_skills`).

### `resources`

- **Purpose:** Central people/resource directory — linked to `users`
  when they have login access. Includes HUD role/level, department,
  manager hierarchy, and HR/IT/finance/legal/safety contact pointers.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (NOT NULL), `user_id` (uuid, FK → `users.id`)
  - `department_id`, `classification_id`, `hud_role_id` (FKs)
  - `name` (NOT NULL), `first_name`, `last_name`, `email`, `phone`
  - `level` (text; `junior`/`staff`/`senior`/`principal`)
  - `title`, `avatar_url`, `bio`
  - `is_active`, `is_external`, `is_org_root`
  - `availability_pct`, `actual_rate`, `hire_date`
  - `manager_id`, `advisor_id`
  - `hr_contact_id`, `it_contact_id`, `finance_contact_id`,
    `legal_contact_id`, `safety_contact_id`
- **Lifecycle states (level):** `junior`, `staff`, `senior`, `principal`
- **RLS posture:** RLS disabled. Policies exist (SELECT firm-isolated,
  INSERT/UPDATE/DELETE authenticated) but are inactive.

### `risk_items`

- **Purpose:** Unified risks AND assumptions on proposals/projects, with
  probability/impact scoring, expected monetary value, and validation
  workflow for assumptions.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (NOT NULL)
  - `proposal_id`, `project_id` (uuid FKs)
  - `item_type` (text; `risk` or `assumption` — CHECK)
  - `title` (NOT NULL), `description`, `discipline`
  - `linked_wbs_task_id` (uuid, FK → `wbs_tasks.id`)
  - `probability` (CHECK: must be 0.10, 0.20, 0.40, 0.60, or 0.80)
  - `impact` (CHECK: must be 0.10, 0.20, 0.40, 0.60, or 0.80)
  - `risk_score`, `cost_impact`, `schedule_impact_days`
  - `emv_cost`, `emv_schedule_days`
  - `mitigation`, `contingency_plan`
  - Assumption-specific: `confidence` (0.20/0.50/0.80 only),
    `prob_wrong`, `cost_delta_if_wrong`, `sched_delta_if_wrong`,
    `assumption_emv_cost`, `assumption_emv_sched`, `validation_action`,
    `must_confirm_by`, `confirm_with`
  - `validated_status` (text; see Lifecycle states), `validated_at`,
    `validated_by`
- **Lifecycle states (validated_status):**
  `open`, `partial`, `validated`
- **Lifecycle states (item_type):** `risk`, `assumption`
- **RLS posture:** RLS disabled.

### `risk_register`

- **Purpose:** Separate older risk-register pattern (parallel to
  `risk_items`) — simpler model scoped to projects only.
- **Key columns:**
  - `id`, `project_id`, `firm_id` (NOT NULL)
  - `title` (NOT NULL), `description`, `category`
  - `probability` (CHECK: 0..1), `cost_impact`, `schedule_impact_days`,
    `weighted_score`
  - `mitigation_strategy`, `contingency_plan`, `mitigation_owner`
  - `status` (enum `risk_status`, default `open`)
  - `identified_date`, `review_date`, `closed_date`
- **RLS posture:** Firm-isolated (internal only) via
  `risk_register_internal`.

### `roles`

- **Purpose:** Firm-level application roles (distinct from HUD job
  roles and the `users.role` text column) — governs admin-access grant.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (NOT NULL)
  - `name` (NOT NULL)
  - `grants_admin_access` (bool)
  - `is_active`, `sequence_order`
- **RLS posture:** Firm-isolated (real). SELECT for firm; INSERT/UPDATE
  admin-only.

### `snapshot_panels`

- **Purpose:** Composable panels inside a status snapshot (narrative,
  metrics, RAG indicators per panel).
- **Key columns:**
  - `id` (uuid, PK)
  - `snapshot_id` (uuid, FK → `status_snapshots.id`, NOT NULL)
  - `panel_type` (enum `panel_type`, default `custom`)
  - `panel_title`, `content` (jsonb)
  - `rag_status`, `rag_suggested` (enums)
  - `sequence_order` (NOT NULL), `is_visible`, `auto_populated`
- **RLS posture:** Firm-isolated via parent snapshot firm. Internal only
  for SELECT; INSERT requires parent snapshot match + `NOT is_client()`.

### `sow_approvals`

- **Purpose:** Per-step approval records on SOW documents — the
  sequential approval chain.
- **Key columns:**
  - `id` (uuid, PK)
  - `sow_id` (uuid, FK → `sow_documents.id`, NOT NULL)
  - `approver_role` (NOT NULL), `approver_id` (uuid)
  - `step_order` (integer, NOT NULL)
  - `status` (text; see Lifecycle states)
  - `flagged_section_ids` (array), `return_reason`, `approval_note`
  - `assigned_at`, `opened_at`, `actioned_at`, `deadline`
- **Lifecycle states (status):**
  `pending`, `in_review`, `approved`, `returned`, `skipped`
- **RLS posture:** RLS disabled.

### `sow_comments`

- **Purpose:** Comments on SOW documents or specific sections; blocking
  vs. non-blocking; threaded.
- **Key columns:**
  - `id` (uuid, PK)
  - `sow_id` (NOT NULL), `section_id`, `approval_id`
  - `parent_comment_id` (uuid, FK → self)
  - `author_id` (NOT NULL, FK → `resources.id`)
  - `content` (NOT NULL)
  - `is_blocking` (bool, NOT NULL)
  - `resolved`, `resolved_at`, `resolved_by`
- **RLS posture:** RLS disabled.

### `sow_documents`

- **Purpose:** Statements of Work — the contract deliverable produced
  from a proposal, with full approval lifecycle.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (NOT NULL)
  - `proposal_id` (NOT NULL, FK → `proposals.id`)
  - `title` (NOT NULL), `version` (NOT NULL, default `'1.0'`)
  - `status` (text; see Lifecycle states)
  - `contract_value`
  - `threshold_id` (FK → `approval_thresholds.id`)
  - `current_approver_id` (FK → `resources.id`)
  - `submitted_at`, `approved_at`, `released_at`,
    `sent_to_client_at`, `executed_at`
- **Lifecycle states (status):**
  `draft`, `pending_review`, `in_review`, `needs_revision`, `approved`,
  `released`, `executed`
- **RLS posture:** RLS disabled.

### `sow_history`

- **Purpose:** Audit log of SOW document events (created, edited,
  section_approved, approved, released, etc.) with jsonb diffs.
- **Key columns:**
  - `id` (uuid, PK)
  - `sow_id` (NOT NULL), `section_id`
  - `event_type` (text; see Lifecycle states)
  - `actor_id` (uuid, FK → `resources.id`)
  - `diff` (jsonb), `summary`, `version_at_event`
- **Lifecycle states (event_type):**
  `created`, `edited`, `section_approved`, `section_revised`,
  `submitted`, `approved`, `returned`, `released`, `sent`, `executed`
- **RLS posture:** RLS disabled.

### `sow_sections`

- **Purpose:** Sections of a SOW document, each with its own status and
  PM-level approval.
- **Key columns:**
  - `id` (uuid, PK)
  - `sow_id` (NOT NULL)
  - `section_number` (NOT NULL), `title` (NOT NULL), `content`
  - `status` (text; see Lifecycle states)
  - `auto_source`
  - `pm_approved_at`, `pm_approved_by`
  - `sort_order` (NOT NULL)
- **Lifecycle states (status):**
  `draft`, `approved`, `needs_revision`
- **RLS posture:** RLS disabled.

### `stakeholders`

- **Purpose:** Project stakeholders (external, client-side typically).
- **Key columns:**
  - `id` (uuid, PK)
  - `project_id`, `firm_id` (NOT NULL)
  - `first_name`, `last_name` (NOT NULL)
  - `title`, `company_name`, `stakeholder_group`
  - `email`, `phone_office`, `phone_cell`
  - `receives_snapshot` (bool)
  - `linked_user_id` (uuid, FK → `users.id`)
- **RLS posture:** Firm-isolated (internal only) via
  `stakeholders_internal`.

### `status_snapshots`

- **Purpose:** Periodic project status reports with overall RAG status
  and submission state; composed of `snapshot_panels`.
- **Key columns:**
  - `id` (uuid, PK)
  - `project_id`, `firm_id` (NOT NULL)
  - `reporting_period_start`, `reporting_period_end` (NOT NULL)
  - `title` (NOT NULL)
  - `prepared_by` (FK → `users.id`)
  - `overall_rag` (enum `rag_status`, default `green`)
  - `status` (enum `snapshot_status`, default `draft`)
  - `submitted_at`
- **RLS posture:** Firm-isolated with internal/client split. Internal:
  firm match. Clients: SELECT only where snapshot is `submitted` and
  project is accessible.

### `step_comments`

- **Purpose:** Comments on workflow step instances with time-logging,
  confidence flag (RAG), and flag type (question/risk/blocker).
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (NOT NULL)
  - `instance_id` (uuid — workflow instance), `template_step_id` (NOT NULL)
  - `parent_comment_id` (uuid, FK → self)
  - `author_resource_id`, `author_name`
  - `body` (NOT NULL)
  - `hours_logged` (numeric)
  - `confidence` (text; `green`/`yellow`/`red`)
  - `flag_type` (text; `none`/`question`/`risk`/`blocker`)
  - `attachments` (jsonb)
  - `is_deleted`, `is_promoted`
- **RLS posture:** Hardcoded single-firm.

### `suppliers`

- **Purpose:** Suppliers referenced by NCMRs and procurement records.
- **Key columns:** `id`, `firm_id` (NOT NULL), `name` (NOT NULL),
  `status` (default `active`)
- **RLS posture:** RLS enabled but no policies captured — locked.

### `support_ticket_comments`

- **Purpose:** Comments on support tickets, including internal-only
  flag for staff notes.
- **Key columns:**
  - `id` (uuid, PK)
  - `ticket_id` (NOT NULL, FK → `support_tickets.id`)
  - `user_id` (NOT NULL)
  - `body` (NOT NULL)
  - `is_internal` (bool, NOT NULL)
- **RLS posture:** Firm-scoped via `app.firm_id` session setting — a
  distinct mechanism from other tables that use `my_firm_id()`. Uses
  `current_setting('app.firm_id', true)`.

### `support_tickets`

- **Purpose:** Support tickets — bug reports and enhancement requests
  per firm, module-tagged, with soft-delete.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (NOT NULL)
  - `ticket_type` (text; `bug`/`enhancement`)
  - `severity` (text; `low`/`medium`/`high`/`critical`)
  - `module` (text; see Lifecycle states)
  - `entity_type` (text; see Lifecycle states) + `entity_id`
  - `title` (NOT NULL), `description`, `steps_to_repro`,
    `context_json` (jsonb)
  - `submitted_by` (NOT NULL), `assigned_to`
  - `status` (text; see Lifecycle states)
  - `resolved_at`, `deleted_at`
- **Lifecycle states (status):**
  `open`, `in_progress`, `resolved`, `closed`
- **Lifecycle states (severity):**
  `low`, `medium`, `high`, `critical`
- **Lifecycle states (module):**
  `projecthud`, `compass`, `cadencehud`, `pipeline`, `library`,
  `simulator`, `instances`, `general`
- **Lifecycle states (entity_type):**
  `workflow_template`, `workflow_instance`, `project`, `form`, null
- **RLS posture:** Firm-scoped via `app.firm_id` session setting,
  excluding soft-deleted rows.

### `task_assignees`

- **Purpose:** Multi-assignee support for tasks — joins tasks to users
  or resources.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id`, `task_id` (NOT NULL)
  - `user_id`, `resource_id` (uuid FKs)
  - `role` (default `assignee`)
  - `assigned_at` (NOT NULL)
- **RLS posture:** Hardcoded single-firm.

### `task_assignments`

- **Purpose:** Older/parallel task assignment pattern with loading
  percentage and HUD role — coexists with `task_assignees` and
  `task_resource_assignments`.
- **Key columns:**
  - `id` (uuid, PK)
  - `task_id`, `user_id` (NOT NULL)
  - `hud_role_id` (uuid, FK)
  - `loading_pct` (integer, 0 < x <= 100)
- **RLS posture:** Firm-isolated (internal only) via parent task firm.

### `task_deliverable_events`

- **Purpose:** Event log for task deliverable lifecycle transitions.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id`, `deliverable_id` (NOT NULL FKs)
  - `actor_resource_id`, `actor_role`
  - `event_type` (text; see Lifecycle states)
  - `from_state`, `to_state`, `notes`, `revision`
  - `occurred_at` (NOT NULL)
- **Lifecycle states (event_type):**
  `created`, `file_uploaded`, `submitted_for_review`,
  `review_comment`, `review_approved`, `approved`, `released`,
  `superseded`, `state_changed`, `unblocked`
- **RLS posture:** Hardcoded single-firm.

### `task_deliverables`

- **Purpose:** Deliverables produced by or consumed by tasks —
  inputs/outputs with full lifecycle state and storage linkage.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id`, `task_id` (NOT NULL)
  - `direction` (text; `input` or `output`)
  - `deliverable_type` (text; see Lifecycle states)
  - `name` (NOT NULL)
  - `source_task_id`, `source_external`, `minimum_state`
  - `is_required` (NOT NULL), `revision`
  - `current_state` (text; see Lifecycle states)
  - `file_path`, `file_name`, `file_size_bytes`
  - `uploaded_by`, `uploaded_at`, `owner_resource_id`
- **Lifecycle states (current_state):**
  `not_started`, `in_progress`, `draft`, `under_review`, `approved`,
  `released`, `superseded`
- **Lifecycle states (deliverable_type):**
  `drawing`, `specification`, `test_report`, `approval`,
  `material_cert`, `procedure`, `analysis`, `model`, `prototype`, `other`
- **Lifecycle states (direction):** `input`, `output`
- **RLS posture:** Hardcoded single-firm.

### `task_dependencies`

- **Purpose:** Directed task dependencies (scheduling + deliverable-based)
  between tasks, with lag.
- **Key columns:**
  - `id` (uuid, PK)
  - `predecessor_task_id`, `successor_task_id` (NOT NULL; cannot be
    equal by check constraint `no_self_dependency`)
  - `link_type` (enum `link_type`, default `FS`)
  - `lag_days` (numeric)
  - `dependency_type` (text; see Lifecycle states)
  - `deliverable_id` (uuid, FK → `task_deliverables.id`)
- **Lifecycle states (dependency_type):**
  `finish_to_start`, `start_to_start`, `finish_to_finish`, `deliverable`
- **RLS posture:** Firm-isolated (internal only) via parent task firm;
  additional permissive DELETE to any authenticated user.

### `task_performance_log`

- **Purpose:** Per-task performance data used for resource scorecards —
  variance, complexity, quality metrics, attribution.
- **Key columns:**
  - `id` (uuid, PK)
  - `task_id`, `resource_id`, `project_id`, `pm_id` (uuid FKs)
  - `planned_duration_days`, `actual_duration_days`, `variance_pct`
  - `complexity_rating` (integer, 1–5)
  - `variance_category` (text; see Lifecycle states)
  - `variance_detail`
  - `attribution_set_by` (uuid, FK → `users.id`)
  - `pm_confirmed`, `pm_confirmed_at`
  - `quality_met_criteria`, `quality_required_rework`,
    `quality_would_reassign`, `quality_score`
  - `skill_ids_exercised` (array)
- **Lifecycle states (variance_category):**
  `on_time`, `early`, `skill_gap`, `execution`, `quality_rework`,
  `scope_change`, `communication`, `dependency_slip`, `materials_late`,
  `third_party`, `resource_conflict`, `estimate_error`, `force_majeure`
- **RLS posture:** Open (authenticated).

### `task_resource_assignments`

- **Purpose:** Resource-to-task assignments (alternative to
  `task_assignees` / `task_assignments` patterns). Supports either a
  concrete resource OR a HUD role placeholder.
- **Key columns:**
  - `id` (uuid, PK)
  - `task_id` (NOT NULL)
  - `resource_id`, `hud_role_id` (at least one must be set by check)
  - `allocation_pct` (numeric, NOT NULL)
  - `planned_hours`, `actual_hours`
  - `is_primary`, `ai_assigned`, `manual_hours_override` (bools)
- **RLS posture:** Open (authenticated reads + writes).

### `task_skill_requirements`

- **Purpose:** Skills required to perform a task, with minimum
  proficiency and criticality.
- **Key columns:**
  - `id` (uuid, PK)
  - `task_id`, `skill_id` (NOT NULL FKs)
  - `min_proficiency` (text; `aware`/`practitioner`/`expert`/`authority`)
  - `is_critical` (bool)
- **RLS posture:** Open (read-all; writes authenticated).

### `tasks`

- **Purpose:** The work unit — scheduled, assignable, measurable. Ties
  together projects, WBS, assignees, deliverables, and dependencies.
- **Key columns:**
  - `id` (uuid, PK)
  - `project_id`, `firm_id` (NOT NULL)
  - `wbs_item_id` (uuid, FK → `wbs.id`)
  - `name` (NOT NULL)
  - `phase`, `description`, `internal_notes`
  - `assigned_to` (uuid, FK → `users.id` — single-assignee legacy)
  - `start_date`, `due_date`, `actual_start`, `actual_finish`
  - `status` (enum `task_status`, default `not_started`)
  - `pct_complete` (numeric, 0–100)
  - `duration_days`, `effort_days`, `duration_optimistic`,
    `duration_pessimistic`
  - `budget_hours`, `budget_cost`, `actual_hours`
  - `client_visible` (bool)
  - `complexity_rating` (integer, 1–5), `complexity_ai_inferred`,
    `complexity_reasoning`
  - `hud_role_id` (uuid, FK → `hud_roles.id`)
  - `source_wbs_task_id` (uuid, FK → `wbs_tasks.id`)
  - `exception_priority` (text; `high`/`medium`/`low`),
    `exception_status` (text; `unattended`/`in_progress`/`resolved`)
- **Lifecycle states (exception_status):**
  `unattended`, `in_progress`, `resolved`
- **RLS posture:** Firm-isolated with internal/client split. Internal:
  firm match. Clients: SELECT only where `client_visible = true`.
  Multiple DELETE policies exist (including an overly broad one
  allowing any authenticated user to delete any task) — a security
  concern worth flagging.

### `template_phases`

- **Purpose:** Phases within a phase template (e.g. "Requirements",
  "Design", "Test", "Release" within a PMI template).
- **Key columns:**
  - `id` (uuid, PK)
  - `template_id` (uuid, FK → `phase_templates.id`, NOT NULL)
  - `phase_name` (NOT NULL), `description`
  - `sequence_order` (NOT NULL)
  - `default_duration_days`, `milestone_description`
- **RLS posture:** Firm-isolated (real) via parent template's firm.

### `template_tasks`

- **Purpose:** Tasks within a phase template (template-level tasks that
  get cloned into project tasks).
- **Key columns:**
  - `id` (uuid, PK)
  - `template_phase_id` (uuid, FK → `template_phases.id`, NOT NULL)
  - `task_name` (NOT NULL)
  - `default_duration_days`, `default_effort_days`
  - `default_classification_id` (uuid, FK → `classifications.id`)
  - `sequence_order` (NOT NULL), `is_milestone`
- **RLS posture:** Firm-isolated (real) via transitive template firm
  lookup.

### `tenant_settings`

- **Purpose:** Per-firm tenant configuration — company name, logo,
  default currency, primary color, deployment mode.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (NOT NULL, FK → `firms.id`)
  - `company_name`, `company_logo_path`
  - `default_currency` (default `USD`)
  - `primary_color`, `contact_email`
  - `deployment_mode` (text, NOT NULL;
    `consulting_firm` or `internal_only`)
- **Lifecycle states (deployment_mode):**
  `consulting_firm`, `internal_only`
- **RLS posture:** Firm-isolated, admin-only. `tenant_settings_admin`:
  all ops require firm match AND admin role.

### `time_entries`

- **Purpose:** Timesheet entries — hours logged per user/project/task,
  weekly-rollup-linked, sourceable from step comments or action items.
- **Key columns:**
  - `id` (uuid, PK)
  - `user_id`, `resource_id` (uuid FKs)
  - `project_id`, `firm_id` (NOT NULL)
  - `task_id`, `instance_id`, `template_step_id`
  - `hours` (NOT NULL, > 0)
  - `date` (NOT NULL), `week_start_date`, `timesheet_week_id`
  - `is_billable`, `is_amended`, `amendment_reason`
  - `source_type` (text; see Lifecycle states)
  - `source_step_comment_id`, `source_action_item_id`
  - `step_name`
- **Lifecycle states (source_type):**
  `direct`, `step_comment`, `action_item`, `import`
- **RLS posture:** Firm-isolated (internal only) via
  `time_entries_internal`.

### `timesheet_weeks`

- **Purpose:** Weekly timesheet rollup per resource, with submission
  and approval lifecycle.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id`, `resource_id` (NOT NULL)
  - `week_start_date`, `week_end_date` (NOT NULL)
  - `total_hours`, `billable_hours`, `workflow_hours`, `direct_hours`
  - `status` (text; see Lifecycle states)
  - `submitted_at`, `submitted_by`
  - `approved_at`, `approved_by`, `approver_name`
  - `rejected_at`, `rejection_reason`
  - `resource_notes`, `approver_notes`
- **Lifecycle states (status):**
  `draft`, `submitted`, `approved`, `rejected`, `amended`
- **RLS posture:** Firm-isolated via resource lookup.

### `user_project_access`

- **Purpose:** Per-user per-project access control (above and beyond
  firm-level tenancy).
- **Key columns:**
  - `id` (uuid, PK)
  - `user_id`, `project_id` (NOT NULL)
  - `access_level` (enum `project_access_level`, default `view`,
    NOT NULL)
  - `is_primary`, `granted_by`
- **RLS posture:** Firm-isolated with admin gate. SELECT: user sees
  own rows OR admin sees firm's rows. INSERT/UPDATE/DELETE admin-only
  in firm.

### `users`

- **Purpose:** Application user accounts. Linked to Supabase Auth users
  via shared `id`. May be linked to a resource via `resource_id`.
- **Key columns:**
  - `id` (uuid, PK — matches `auth.users.id`)
  - `name`, `email` (NOT NULL)
  - `role_id` (uuid, FK → `roles.id`)
  - `role` (text; see Lifecycle states — distinct from `role_id`)
  - `firm_id` (FK → `firms.id`), `project_id`
  - `resource_id` (uuid, FK → `resources.id`)
  - `is_admin`, `is_active` (bools)
  - `landing_page` (default `compass`)
  - `hourly_rate`, `avatar_path`, `title`, `phone`
- **Lifecycle states (role):**
  `admin`, `pm`, `resource`, `viewer`
- **RLS posture:** RLS disabled. Policies exist (SELECT: self or
  firm match; UPDATE: self or admin; INSERT: admin) but are inactive.

### `video_clips`

- **Purpose:** Uploaded video clips (marketing, training, internal)
  with annotations and thumbnail support.
- **Key columns:**
  - `id` (uuid, PK)
  - `title` (NOT NULL), `description`
  - `project_id` (FK → `projects.id`)
  - `author_id` (FK → `users.id`)
  - `file_path` (NOT NULL), `file_size_bytes`, `thumbnail_url`
  - `duration_seconds`, `category` (see Lifecycle states)
  - `tags` (array), `annotations` (jsonb)
  - `is_public`, `firm_id`
- **Lifecycle states (category):**
  `marketing`, `training`, `internal`
- **RLS posture:** Mixed per-user/firm. SELECT: public videos to all +
  firm-scoped for authenticated. INSERT: own author_id. UPDATE/DELETE:
  author or is_admin.

### `view_participants`

- **Purpose:** Participants in workspace "views" — collaborative
  multi-user workspaces with owner/editor/viewer roles.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (NOT NULL), `workspace_owner_user_id` (NOT NULL)
  - `view_name` (NOT NULL)
  - `user_id`, `resource_id` (uuid)
  - `view_role` (text; `owner`/`editor`/`viewer`)
  - `tile_edit_overrides` (jsonb, NOT NULL)
  - `invited_at` (NOT NULL), `accepted_at`, `last_seen_at`
  - `color`
- **RLS posture:** Self-and-workspace-based. SELECT: own participant
  rows across owner/user/resource fields. INSERT/UPDATE/DELETE:
  workspace owner or accepted owner/editor.

### `wbs`

- **Purpose:** Work Breakdown Structure — hierarchical decomposition of
  project work. Tasks can reference WBS items via `wbs_item_id`.
- **Key columns:**
  - `id` (uuid, PK)
  - `project_id`, `firm_id` (NOT NULL)
  - `parent_wbs_id` (uuid, FK → self)
  - `wbs_code`, `title` (NOT NULL), `description`, `phase`
  - `duration_days`, `effort_days`, `num_people`
  - `estimated_hours`, `estimated_cost`
  - `assigned_classification_id` (FK → `classifications.id`)
  - `sequence_order`
- **RLS posture:** Firm-isolated (internal only) via `wbs_internal`.

### `wbs_disciplines`

- **Purpose:** Disciplines within a proposal's WBS (e.g.
  Electrical Engineering, Mechanical Engineering, Software).
- **Key columns:**
  - `id` (uuid, PK)
  - `proposal_id` (NOT NULL, FK → `proposals.id`)
  - `name` (NOT NULL), `color`
  - `default_role_id` (uuid, FK → `hud_roles.id`)
- **RLS posture:** RLS disabled. Policy `p_wbs_disciplines` scopes
  via parent proposal but is inactive.

### `wbs_materials`

- **Purpose:** Material line items in a proposal WBS.
- **Key columns:**
  - `id` (uuid, PK)
  - `proposal_id` (NOT NULL)
  - `name` (NOT NULL), `cost` (NOT NULL)
- **RLS posture:** RLS disabled.

### `wbs_tasks`

- **Purpose:** Tasks within a proposal's WBS discipline — the building
  block of a proposal estimate.
- **Key columns:**
  - `id` (uuid, PK)
  - `discipline_id` (NOT NULL, FK → `wbs_disciplines.id`)
  - `proposal_id` (NOT NULL)
  - `name` (NOT NULL), `phase`
  - `hud_role_id` (FK → `hud_roles.id`)
  - `level` (text; `Junior`/`Mid`/`Senior`/`Principal`/`Fellow`)
  - `duration_days`, `labor_days`, `headcount` (NOT NULL, default 1)
  - `estimated_hours`, `unit_cost`, `total_cost`
  - `is_risk_flag` (bool, NOT NULL)
- **RLS posture:** RLS disabled.

### `wbs_template_disciplines`

- **Purpose:** Disciplines within a WBS template (reusable proposal
  template).
- **Key columns:** `id`, `template_id` (NOT NULL, FK → `wbs_templates.id`),
  `name` (NOT NULL), `color`, `default_role_id`
- **RLS posture:** RLS disabled.

### `wbs_template_tasks`

- **Purpose:** Template tasks within a WBS template discipline.
- **Key columns:**
  - `id` (uuid, PK)
  - `discipline_id` (NOT NULL, FK → `wbs_template_disciplines.id`)
  - `name` (NOT NULL), `phase`
  - `hud_role_id` (FK → `hud_roles.id`)
  - `default_level` (text; same values as `wbs_tasks.level`)
  - `duration_days`, `labor_days`, `headcount` (NOT NULL)
  - `is_risk_flag` (bool, NOT NULL)
- **RLS posture:** RLS disabled.

### `wbs_templates`

- **Purpose:** Named, reusable WBS templates per firm (or private to
  a user).
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (NOT NULL)
  - `name` (NOT NULL), `description`, `industry_tag`
  - `visibility` (text; `private` or `firm`)
  - `created_by` (FK → `resources.id`)
- **Lifecycle states (visibility):** `private`, `firm`
- **RLS posture:** RLS disabled.

### `workflow_action_items`

- **Purpose:** Action items spawned from workflow step instances, with
  their own lifecycle and promotion to the main `action_items` table.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (NOT NULL)
  - `instance_id` (FK → `workflow_instances.id`)
  - `template_step_id` (FK → `workflow_template_steps.id`)
  - `source_comment_id` (FK → `step_comments.id`)
  - `title` (NOT NULL), `body`, `instructions`
  - `owner_resource_id`, `owner_name`
  - `due_date`, `status` (see Lifecycle states), `priority` (see
    Lifecycle states)
  - `resolved_at`, `resolution_note`, `is_promoted`
  - `attachments` (jsonb), `negotiation_state` (jsonb)
- **Lifecycle states (status):**
  `open`, `in_progress`, `resolved`, `cancelled`
- **Lifecycle states (priority):**
  `low`, `normal`, `high`, `critical`
- **RLS posture:** Hardcoded single-firm (primary policy) — BUT also
  has three additional authenticated-role policies with `USING (true)`
  / `WITH CHECK (true)`. When multiple permissive policies exist, ANY
  match grants access. Net effect: any authenticated user can
  SELECT/INSERT/UPDATE any row.

### `workflow_form_definitions`

- **Purpose:** Versioned form definitions (the "Lifecycle 1" artifact)
  with full review/approval state machine, annotations, and releases.
- **Key columns:**
  - `id` (uuid, PK)
  - `step_id` (FK → `workflow_template_steps.id`)
  - `firm_id` (NOT NULL)
  - `source_path`, `source_name`, `source_html`
  - `page_count`
  - `archetype` (text; `checklist` or `data_entry`)
  - `fields` (jsonb, NOT NULL), `routing` (jsonb, NOT NULL)
  - `category_id` (FK → `form_categories.id`)
  - `state` (text; see Lifecycle states)
  - `version` (NOT NULL, default `0.1.0`), `superseded_by`
  - `review_note`, `pending_reviewer_ids`, `reviewed_by` (arrays)
  - `approved_by`, `approved_at`, `released_at`, `archived_at`
  - `compass_visible` (bool, NOT NULL)
- **Lifecycle states (state):**
  `draft`, `committed`, `certified`, `published`, `superseded`,
  `archived`, `released`, `approved`, `in_review`
- **Lifecycle states (archetype):** `checklist`, `data_entry`
- **RLS posture:** Hardcoded single-firm (primary) PLUS JWT-based
  firm_id policies for authenticated role (redundant but non-
  conflicting since they're all permissive).

### `workflow_form_responses`

- **Purpose:** Individual field responses within a form instance
  (per-field, per-stage).
- **Key columns:**
  - `id` (uuid, PK)
  - `instance_id` (NOT NULL), `step_id`, `form_def_id` (NOT NULL)
  - `stage` (integer, NOT NULL, default 1)
  - `field_id` (NOT NULL), `value`, `note`
  - `filled_by`, `filled_at` (NOT NULL)
- **RLS posture:** Open. Policy `firm_isolation` with `USING (true)` /
  `WITH CHECK (true)` (name misleading).

### `workflow_instances`

- **Purpose:** Running instance of a workflow template — the core
  executing unit, with status, priority, PERT estimates, briefing
  narrative, and attachments.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id`, `template_id`, `project_id`, `task_id`, `source_task_id`,
    `form_def_id` (uuid FKs)
  - `title` (NOT NULL)
  - `status` (text; see Lifecycle states, default `pending`)
  - `current_step_id`, `current_step_name`, `current_step_type`
  - `launched_by`, `launched_at`, `completed_at`, `cancelled_at`
  - `priority` (text; see Lifecycle states)
  - `stakes`
  - `pert_optimistic`, `pert_likely`, `pert_pessimistic`
  - `briefing_narrative`, `briefing_generated_at`
  - `submitted_by_resource_id`, `submitted_by_name`
  - `workflow_type`
  - `attachments`, `form_data` (jsonb)
- **Lifecycle states (status):**
  `pending`, `in_progress`, `complete`, `cancelled`, `overridden`
- **Lifecycle states (priority):**
  `routine`, `important`, `critical`
- **RLS posture:** RLS disabled. Policies exist (open to
  authenticated users) but are inactive.

### `workflow_requests`

- **Purpose:** Reviewer/approver requests on a workflow instance
  (distinct from action items).
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (NOT NULL)
  - `instance_id` (FK → `workflow_instances.id`)
  - `role` (text; `reviewer` or `approver`)
  - `title` (NOT NULL), `body`
  - `status` (text; `open`/`resolved`/`cancelled`)
  - `owner_resource_id` (NOT NULL), `owner_name`, `created_by_name`
  - `due_date`
- **Lifecycle states (status):**
  `open`, `resolved`, `cancelled`
- **Lifecycle states (role):** `reviewer`, `approver`
- **RLS posture:** Open (authenticated).

### `workflow_step_instances`

- **Purpose:** Event log + state record for every workflow step
  activation, completion, reset, reassignment, or override. The
  append-only audit core of the workflow engine.
- **Key columns:**
  - `id` (uuid, PK)
  - `instance_id` (NOT NULL, FK → `workflow_instances.id`)
  - `template_step_id` (FK → `workflow_template_steps.id`)
  - `firm_id`
  - `step_type` (NOT NULL), `step_name`
  - `status` (text; see Lifecycle states)
  - `assignee_user_id` (FK → `users.id`), `assignee_email`,
    `assignee_name`, `assignee_org`
  - `due_at`, `started_at`, `completed_at`
  - `outcome`, `outcome_notes`
  - `signature_method` (text; `drawn`/`typed`/null)
  - `signature_data`
  - `actor_resource_id`, `actor_ip`, `actor_user_agent`, `actor_name`
  - `event_type` (NOT NULL, default `step_action`; see Lifecycle states)
  - `event_notes`
  - `target_step_id`, `route_to_step_id`, `route_to_step_name`
  - `suspend_condition`
  - `output_attachments` (jsonb)
- **Lifecycle states (status):**
  `pending`, `in_progress`, `complete`, `needs_attention`, `overdue`,
  `overridden`, `skipped`
- **Lifecycle states (event_type):**
  `instance_launched`, `step_activated`, `step_completed`, `step_reset`,
  `step_reassigned`, `step_reassignment_removed`,
  `step_assignee_override`, `rejected`, `instance_suspended`,
  `instance_cancelled`, `instance_completed`, `meeting_created`,
  `escalation_triggered`, `override`
- **RLS posture:** Open (authenticated reads + writes).

### `workflow_step_meeting_action_items`

- **Purpose:** Action items recorded at workflow-step-as-meeting events.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id`, `instance_id`, `template_step_id` (NOT NULL)
  - `description` (NOT NULL)
  - `assigned_to_resource`
  - `due_date`, `status` (default `open`)
- **RLS posture:** Firm-isolated (real) via `my_firm_id()`, for
  authenticated role.

### `workflow_step_meeting_data`

- **Purpose:** Data payload for workflow steps that are meetings —
  summary, discussion notes, decisions, email configuration.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id`, `instance_id`, `template_step_id` (NOT NULL)
  - `summary`, `discussion_notes`, `decisions_made`
  - `next_meeting_date`
  - `email_subject`, `email_message`, `cc_recipients` (jsonb)
  - `status` (default `draft`), `sent_at`
- **RLS posture:** RLS enabled but no policies captured — locked.

### `workflow_template_coc`

- **Purpose:** Chain-of-custody audit log for workflow template
  changes (field-by-field before/after with actor).
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id`, `template_id` (NOT NULL)
  - `event_type` (NOT NULL)
  - `changed_by` (FK → `resources.id`), `changed_by_name`
  - `field_name`, `old_value`, `new_value`, `note`
  - `version_at`
- **RLS posture:** Hardcoded single-firm.

### `workflow_template_steps`

- **Purpose:** Definition of each step within a workflow template —
  the template the runtime instance is executed against.
- **Key columns:**
  - `id` (uuid, PK)
  - `template_id` (NOT NULL, FK → `workflow_templates.id`)
  - `sequence_order` (NOT NULL)
  - `step_type` (NOT NULL; see Lifecycle states)
  - `name`, `instructions`
  - `assignee_type` (text; `user`/`role`/`external`/`pm`)
  - `assignee_user_id`, `assignee_resource_id`, `assignee_role`,
    `assignee_email`, `assignee_name`, `assignee_org`
  - `due_days`, `due_type` (text; `after_prior`/`before_completion`)
  - `escalate_after_days`, `escalate_to` (text; `pm`/`manager`/`custom`),
    `escalate_to_user_id`
  - `parallel_required` (bool, NOT NULL)
  - `form_template_id` (FK → `form_templates.id`)
  - `branch_conditions`, `response_options`, `outcomes`,
    `confirm_items`, `meeting_agenda`, `attached_docs` (jsonb)
  - `require_output`, `forward_input` (bools, NOT NULL)
  - `input_from_step`, `reject_to` (uuid FKs → self)
- **Lifecycle states (step_type):**
  `trigger`, `approval`, `review`, `signoff`, `action`, `external`,
  `form`, `branch`, `wait`, `confirmation`, `meeting`
- **Lifecycle states (assignee_type):**
  `user`, `role`, `external`, `pm`
- **Lifecycle states (due_type):**
  `after_prior`, `before_completion`
- **Lifecycle states (escalate_to):**
  `pm`, `manager`, `custom`
- **RLS posture:** Open (authenticated). Policy `firm_access_wts` with
  `USING (true)`.

### `workflow_templates`

- **Purpose:** The reusable workflow definition — named, versioned,
  with trigger configuration and visibility flags.
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (FK → `firms.id`)
  - `name` (NOT NULL), `description`
  - `status` (text; see Lifecycle states)
  - `trigger_type` (text; see Lifecycle states)
  - `trigger_config` (jsonb)
  - `version` (semver text), `version_major`, `version_minor`,
    `version_patch`
  - `compass_visible` (bool, NOT NULL)
  - `form_driven` (bool)
  - `created_by` (FK → `users.id`)
- **Lifecycle states (status):**
  `draft`, `committed`, `certified`, `published`, `superseded`,
  `archived`, `released`, `approved`, `in_review`
- **Lifecycle states (trigger_type):**
  `manual`, `missed_milestone`, `resource_denied`, `meeting_close`,
  `material_request`, `exception_resolved`
- **RLS posture:** RLS disabled. Policy `firm_access_workflow_templates`
  with `USING (true)` for authenticated exists but is inactive.

---

### Views (not base tables)

The schema contains 13 views in the `public` schema. Views don't have
their own RLS; they inherit row visibility from their underlying tables.
Briefly listed here:

- **`meeting_attendees_resolved`** — denormalized meeting attendees
  view joining user/stakeholder/contact into a single "who" row.
- **`resource_request_heartbeat`** — computed view showing elapsed
  time against SLA tiers for open resource requests.
- **`task_pert`** — PERT computations over tasks (expected, stddev).
- **`v_form_completion`** — form response completion rollup by
  instance/step/stage.
- **`v_meeting_agenda_items`** — meeting agenda items with resolved
  fields (likely sort_order normalization).
- **`v_meetings`** — denormalized meetings with project_name joined.
- **`v_pipeline_summary`** — sales pipeline dashboard view.
- **`v_risk_exposure`** — per-proposal risk/assumption EMV rollup.
- **`v_sow_approval_status`** — SOW progress dashboard view.
- **`v_wbs_cost_summary`** — proposal WBS cost rollup by discipline.
- **`v_weekly_hours`** — denormalized weekly time entries with all
  joined context (resource, project, task, week status).
- **`vw_coc_actor_history`** — chain-of-custody events ordered by
  actor.
- **`vw_coc_project_feed`** — chain-of-custody events filtered to a
  project.
- **`vw_coc_task_timeline`** — chain-of-custody events filtered to a
  task.

---

## Section B — Storage buckets

### `attachments`

- **Purpose:** General file attachments — message attachments, form
  uploads, issue-report screenshots, step-comment attachments.
- **Access policy:** Private (not public). Both `anon` and
  `authenticated` roles have SELECT and INSERT; `authenticated` also
  has UPDATE and DELETE. Anon access is labeled "dev" in the policy
  names — may not be intended for production.
- **File size limit:** 20 MB
- **Allowed MIME types:** Any
- **CORS:** [NOT KNOWN]

### `avatars`

- **Purpose:** User/firm avatar and logo images.
  Referenced by `users.avatar_path`, `resources.avatar_url`,
  `firms.logo_path`, `tenant_settings.company_logo_path`.
- **Access policy:** **Public.** SELECT open to `{public}` role
  (two redundant policies: `avatars_select`, `public_read_avatars`).
  INSERT and UPDATE require `authenticated`. No DELETE policy visible.
- **File size limit:** Unset (50 MB default)
- **Allowed MIME types:** Any
- **CORS:** [NOT KNOWN]

### `thumbnails`

- **Purpose:** Thumbnail images — likely auto-generated from source
  files (videos, documents).
- **Access policy:** Private. SELECT/INSERT/UPDATE for `authenticated`
  with additional `auth.uid() IS NOT NULL` check. No DELETE policy.
- **File size limit:** Unset (50 MB default)
- **Allowed MIME types:** Any
- **CORS:** [NOT KNOWN]

### `video-library`

- **Purpose:** Video clip storage for the `video_clips` table.
- **Access policy:** Private. Only SELECT and INSERT policies exist
  for `authenticated` — no UPDATE or DELETE policies, meaning
  uploaded objects are append-only from the user's perspective.
- **File size limit:** Unset (50 MB default) — notably small for
  video; application may enforce a larger limit via a different
  mechanism or rely on short clips only.
- **Allowed MIME types:** Any
- **CORS:** [NOT KNOWN]

### `workflow-documents`

- **Purpose:** Documents attached to workflow instances — step
  outputs, input references, form evidence PDFs
  (`form_instance_records.evidence_pdf_path`).
  Also likely the primary target for `documents.storage_path`.
- **Access policy:** Private. Full CRUD (SELECT/INSERT/DELETE) for
  `authenticated` role. No firm-scoping in the policy — any
  authenticated user can access any workflow document by path.
- **File size limit:** Unset (50 MB default)
- **Allowed MIME types:** Any
- **CORS:** [NOT KNOWN]

### Cross-reference to schema

The schema references storage paths from these tables:
`documents.storage_path`, `bist_fixtures.storage_path`,
`task_deliverables.file_path`, `video_clips.file_path`,
`issue_reports.auto_screenshot_path`,
`form_instance_records.evidence_pdf_path`,
`messages.attachment_path`, `firms.logo_path`,
`tenant_settings.company_logo_path`, `users.avatar_path`,
`resources.avatar_url`.

The `bist_fixtures.storage_path` column does not obviously correspond
to any of the five inventoried buckets. Possibilities: stored in
`attachments`, stored in a removed bucket, or stored in a bucket we
haven't identified. Marking as a gap below.

---

## Section C — Edge Functions

### `ai-briefing`

- **Purpose:** Proxies streaming LLM requests to Anthropic's API for
  `ai_org_briefings` and `morning_briefs` generation.
- **Input:** `{ prompt: string }`
- **Output:** Server-sent events stream forwarding the Anthropic
  response; error responses are `{ error: string }` JSON.
- **Auth:** Anonymous-callable (CORS `*`, no JWT check visible in
  source). Uses `ANTHROPIC_API_KEY` server-side secret.

### `ai-form-vision`

- **Purpose:** Vision-model proxy that sends an image plus text prompt
  to Claude and returns the text response — powers form field
  extraction / OCR for `form_templates.extracted_fields` and
  `absorption_confidence`.
- **Input:** `{ base64: string, media_type: string, prompt: string }`
  (media_type default `image/jpeg`)
- **Output:** `{ text: string }`
- **Auth:** **Explicitly deployed with `--no-verify-jwt`** per
  source comment — publicly callable. Uses `ANTHROPIC_API_KEY`
  server-side.

### `create-user`

- **Purpose:** Admin creation of new Supabase Auth users plus matching
  `public.users` row.
- **Input:** `{ email, password, name, app_role?, resource_id?, firm_id }`
- **Output:** `{ ok: true, user_id }` or `{ ok: false, error }`
- **Auth:** Service-role. Uses `SUPABASE_SERVICE_ROLE_KEY` to invoke
  `auth.admin.createUser`. Comment says requires "valid anon-key
  bearer token (authenticated user)" but code doesn't explicitly
  verify the bearer — gate relies on Supabase default JWT verification
  at the function invocation layer (whether that's enabled depends on
  deployment flags, not visible from source).

### `update-user`

- **Purpose:** Admin updates a user's email and/or password.
- **Input:** `{ user_id, email?, password? }`
- **Output:** `{ ok: true }` or `{ ok: false, error }`
- **Auth:** Service-role. Password minimum 8 characters enforced.

### `delete-user`

- **Purpose:** Admin deletion of a Supabase Auth user plus the
  `public.users` row, with self-deletion guard.
- **Input:** `{ user_id }`
- **Output:** `{ ok: true }` or `{ ok: false, error }`
- **Auth:** Service-role. Decodes the caller's JWT and refuses if the
  caller's `sub` equals `user_id` (prevents self-deletion).

### `notify-form-review`

- **Purpose:** Mints per-reviewer `form_review_tokens` (both
  `definition` and `instance` contexts) and sends a Resend email with
  a tokenized review link.
- **Input:** `{ form_def_id, reviewers: [{ id, name, email }], role,
  context, record_id?, instance_id?, response_id? }`
- **Output:** `{ ok: true, results: [{ email, link, token }] }` or
  `{ error }`
- **Auth:** `--no-verify-jwt` per deploy comment. Uses service role +
  `RESEND_API_KEY`.

### `notify-step-activated`

- **Purpose:** Sends a workflow-step assignment email via Resend when
  a step activates. Supports single "Review & Respond" button layout
  and legacy two-button (approve/reject) layout, with outcome labels.
- **Input:** `{ instance_id, instance_title, template_name, step_id,
  step_name, step_type, assignee_name, assignee_email, due_days,
  launched_by, is_bist, approve_url, reject_url, has_action_buttons,
  outcomes }`
- **Output:** `{ sent: true, to, id }` on success; `{ skipped: reason }`
  for BIST steps or missing email; `{ error }` on failure.
- **Auth:** Uses `RESEND_API_KEY` only. No Supabase client —
  forwards email metadata from caller. Gate depends on Supabase
  default JWT verification at function invocation layer.

### `process-form-decision`

- **Purpose:** Companion to `notify-form-review` — processes approve/
  reject decisions on form review tokens for BOTH lifecycles:
  (1) form definition reviews, which update
  `workflow_form_definitions.state`, and (2) form instance content
  reviews, which update `form_instance_records.content_state`.
  Manages multi-reviewer round state, writes chain-of-custody events,
  triggers downstream notifications, and (on content approval)
  signals step gate clearance.
- **Input:** `{ token, decision: 'approve'|'reject', note,
  form_def_id?, reviewer_id?, reviewer_name?, role? }`
- **Output:** `{ ok: true, status, message }` or
  `{ ok: false, error }`
- **Auth:** `--no-verify-jwt` per deploy comment. Token validation
  (from `form_review_tokens` table) is the auth mechanism. Uses
  service role + `RESEND_API_KEY`.
- **Note:** This function writes to two tables that do NOT exist in
  the current schema: `chain_of_custody` (the schema has `coc_events`
  and `workflow_template_coc` but not `chain_of_custody`) and
  `workflow_instance_steps` (the schema has `workflow_step_instances`
  but not `workflow_instance_steps`). Both writes use
  `.catch(() => {})` so they fail silently. This is either dead code,
  a reference to tables planned but not migrated, or an incorrect
  table name. Flagging as a gap.

### `respond-step`

- **Purpose:** The external respondent endpoint. Validates an
  `external_step_tokens` bearer token, records step completion via a
  `workflow_step_instances` `step_completed` event, then runs a
  routing engine that either advances to the next step, resets to the
  first step (on outcomes marked `requires_reset`), or completes the
  instance. Notifies the PM via Resend afterward.
- **Input:** `{ token, outcome, outcome_label, notes, requires_reset }`
- **Output:** `{ success: true, outcome, routing: 'advanced'|
  'reset'|'completed', next_step }` or `{ error, ... }`
- **Auth:** Token-based. Uses service role + `RESEND_API_KEY`.
  Interacts with Supabase via raw PostgREST REST calls rather than
  the JS client.

### `dynamic-function`

- **Purpose:** Unknown / not implemented. Source is the Supabase
  default Hello World template (`{ name }` → `"Hello ${name}!"`).
  Despite 10 deployments.
- **Input:** `{ name: string }` (per default template)
- **Output:** `{ message: "Hello ${name}!" }`
- **Auth:** Default template behavior.
- **Note:** Flagging as a gap — either unimplemented, in-progress, or
  used as a fallback. Worth clarifying with the owner.

### `hyper-task`

- **Purpose:** Unknown / not implemented. Source is the Supabase
  default Hello World template, identical to `dynamic-function`.
  Despite 7 deployments.
- **Input / Output / Auth:** Same as default template.
- **Note:** Same gap as above.

---

## Section D — Realtime subscriptions

**No Realtime subscriptions configured.**

The `supabase_realtime` publication returns zero tables:

```sql
SELECT schemaname, tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime';
-- (empty result)
```

This means that Postgres is not broadcasting `INSERT`, `UPDATE`, or
`DELETE` events for any table in this database. Any Supabase Realtime
subscriber code in the frontend (`supabase.channel(...).on(
'postgres_changes', ...)`) will not receive events.

**Cross-reference note for the Architect:** The brief's example
mentioned "cdn-events.js subscribes to `workflow_step_instances`
INSERTs." If that subscriber exists in frontend code, it is
effectively a no-op. Possible interpretations:

- Realtime was previously enabled and later disabled
- The subscription was implemented in code but never wired up on
  the backend
- The frontend uses polling that is mislabeled as "Realtime"
- A non-default publication name is in use (unlikely for Supabase)

Treat this as a cross-brief question for the Architect to reconcile
once the frontend inventory briefs complete.

**Known subscribers (from code references):** [NOT PROVIDED] — moot
since Realtime publishes no events.

---

## Gaps and follow-up items

Flagged explicitly so these aren't mistaken for completeness.

1. **RLS helper function definitions not captured.** Policies use
   `my_firm_id()`, `current_firm_id()`, `my_project_ids()`,
   `is_client()`, `is_admin()` pervasively. Their actual SQL
   definitions would be needed for a true security audit. Recommended
   query for a future pass:
   ```sql
   SELECT routine_name, data_type, routine_definition
   FROM information_schema.routines
   WHERE routine_schema = 'public'
     AND routine_name IN ('my_firm_id', 'current_firm_id',
       'my_project_ids', 'is_client', 'is_admin');
   ```

2. **Postgres enum type values.** Columns typed `USER-DEFINED` in the
   schema dump are enum-backed. Tables with enum-backed lifecycle
   columns whose values aren't CHECK-enforced (and thus not captured
   here) include: `action_items.status`, `action_items.priority`,
   `change_log.status`, `change_log.change_type`, `invoices.status`,
   `tasks.status`, `meetings.status`, `meetings.meeting_type`, and
   ~15 others. Recommended query for a future pass:
   ```sql
   SELECT t.typname AS enum_name,
          array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
   FROM pg_type t
   JOIN pg_enum e ON t.oid = e.enumtypid
   JOIN pg_namespace n ON n.oid = t.typnamespace
   WHERE n.nspname = 'public'
   GROUP BY t.typname ORDER BY t.typname;
   ```

3. **CORS configuration** for storage buckets not captured. Visible
   in Supabase Dashboard → Project Settings → API.

4. **RLS disabled on ~35 tables where policies exist.** This is the
   most significant architectural finding in this inventory. Tables
   affected include `meetings` and the full meeting family,
   `prospects` and the full prospect family, `proposals`,
   `sow_documents` and all SOW tables, `wbs_tasks` and all WBS tables,
   `workflow_instances`, `workflow_templates`, `companies`,
   `contacts`, `resources`, `users`, `firms`, `notes` and note
   family, `milestones`, `risk_items`, `health_scores`, `coc_events`,
   `mrb_cases`, `ncmrs`, and all six `bist_*` analytics tables. On
   each of these, any policies visible in `pg_policies` are
   **inactive**. Whether this is intentional (relying on server-side
   gating) or a security gap is for the Architect to judge; inventory
   documents state, not judgment.

5. **Hardcoded single-firm UUID** (`aaaaaaaa-0001-0001-0001-000000000001`)
   used in ~12 tables' RLS policies. These tables effectively have
   no multi-tenant enforcement. Whether this is intentional for a
   single-tenant deployment (the `tenant_settings.deployment_mode =
   'internal_only'` case) or is a mis-migration from a single-tenant
   prototype is for the Architect to resolve.

6. **Duplicate or redundant RLS policies** on several tables
   (e.g. `workflow_action_items` has both hardcoded-firm and
   `USING (true)` policies; `avatars` storage bucket has two identical
   SELECT policies). Because multiple permissive policies OR together,
   the effective posture is usually the most permissive one.

7. **Overly broad DELETE policies** on `action_items` and `tasks`:
   `allow authenticated delete action_items` / `auth_delete_tasks`
   both grant DELETE to any authenticated user with `USING (true)`,
   bypassing firm scoping. Likely unintentional.

8. **`process-form-decision` writes to non-existent tables** —
   `chain_of_custody` and `workflow_instance_steps`. Writes fail
   silently. Either the table names are wrong, the migration was
   reverted, or these are planned tables. Worth investigating.

9. **`dynamic-function` and `hyper-task` Edge Functions** are
   unimplemented (Hello World templates) despite having 10 and 7
   deployments respectively. Either placeholders or reverted
   implementations.

10. **`bist_fixtures.storage_path`** points into a storage bucket
    but no bucket among the five inventoried appears to be dedicated
    to fixtures. Either they live in `attachments`, or a bucket is
    missing from the dashboard list.

11. **Two parallel external-token systems** coexist:
    `external_response_tokens` (referenced by schema but no function
    source points to it) and `external_step_tokens` (used by
    `respond-step`). One may be legacy / deprecated.

12. **Three parallel task-assignment tables** coexist:
    `task_assignments`, `task_assignees`, and
    `task_resource_assignments`. Likely historical — the Architect
    should determine which is canonical.

13. **Realtime publishes no tables.** If any frontend code subscribes
    via Supabase Realtime channels, those subscribers are inactive.

---

*End of inventory.*
