# Brief · Architecture documentation · Supabase schema inventory

**Purpose:** Produce a structured inventory of the Supabase backend
— tables, columns, relationships, RLS posture, storage buckets,
Edge Functions, and Realtime subscriptions. Phase 1 of the
ProjectHUD architecture documentation initiative.

**Audience:** Fresh Claude session acting as documentation agent.
Not a coding brief.

**Estimated effort:** 60-90 minutes depending on schema size.

---

## Context

ProjectHUD's four code platforms (Compass, Cadence, Aegis, Project
Management Core) all share a single Supabase backend. The backend
is the data layer that unifies the platform.

The Architect has inferred table names from code references during
Phase 1 work but has never seen the authoritative schema. Completing
this inventory surfaces the data-layer architecture and makes
subsequent Atlas sections (Part 5 — Project Management Core)
writable.

**Why this matters:** Code-level briefs have repeatedly hit moments
where assumptions about the data model led to misdiagnosis (e.g.,
the "RLS race" hypothesis during B-UI-9 work that turned out to be
a verification-harness artifact, not a real production defect).
A documented schema is the foundation for correct architectural
reasoning.

---

## Scope

### In scope

Produce a structured schema inventory covering:

**Section A — Tables**

For each table:

1. **Table name**
2. **Purpose** (≤20 word description — what does this table
   represent in the domain model?)
3. **Key columns** (5-10 most architecturally significant columns:
   PKs, FKs, status/state columns, timestamps). Not every column
   — just the architecturally meaningful ones.
4. **Lifecycle states** (if the table has a `status` or `state`
   column, enumerate the valid values and their meanings)
5. **Primary FK relationships** (this table → other tables, up to
   5 most significant)
6. **RLS posture** (≤30 word description — who can SELECT, who can
   INSERT/UPDATE, any notable cross-role gates)

**Section B — Storage buckets**

For each bucket:

1. **Bucket name**
2. **Purpose** (what content does this bucket hold?)
3. **Access policy** (public / signed-URL / authenticated)
4. **CORS posture** (if known: allows-any, same-origin-only,
   unconfigured)

**Section C — Edge Functions**

For each function:

1. **Function name / endpoint**
2. **Purpose** (≤20 word description)
3. **Input shape** (key request params)
4. **Output shape** (key response fields)
5. **Auth requirement** (anon / authenticated / service-role)

**Section D — Realtime subscriptions**

For each table with Realtime enabled:

1. **Table name**
2. **Event types published** (INSERT / UPDATE / DELETE)
3. **Known subscribers** (from code references — e.g.,
   `cdn-events.js` subscribes to `workflow_step_instances`
   INSERTs)

### Out of scope

- Full DDL (column types, constraints, indexes) unless
  architecturally significant
- Triggers, functions, stored procedures (can be a follow-up
  brief)
- Migration history
- Performance tuning notes
- Security audit or RLS vulnerability analysis
- Opinions on schema design quality

---

## Authorized reads

The operator will provide one or more of:

1. **A schema dump** (SQL export from `pg_dump --schema-only`, or
   Supabase dashboard schema export, or SQL files from migrations
   directory)
2. **RLS policy listings** (from Supabase dashboard "Policies"
   view, or from SQL migration files)
3. **Storage bucket configuration** (from Supabase dashboard
   Storage section, or from CLI inspection)
4. **Edge Function source** (from `supabase/functions/*` directory
   or Supabase dashboard)

If only partial information is available, document what's provided
and mark gaps as `[NOT PROVIDED]` rather than inventing content.

**If the operator uploads code files instead of schema** (e.g.,
`mw-tabs.js` referencing `workflow_instances` queries), use them
as secondary reference only — not authoritative. Note: "Table
inferred from code references; not confirmed from schema."

### Not authorized

- Any JS code files for documentation purposes (those are other
  briefs' scope; may be consulted briefly for disambiguating a
  column's purpose but not inventoried here)

---

## Output format

Four-section markdown document.

```markdown
# ProjectHUD Supabase schema inventory

## Section A — Tables

### `table_name`

- **Purpose:** [≤20 words]
- **Key columns:**
  - `id` (uuid, PK)
  - `firm_id` (uuid, FK → firms)
  - `status` (text; see Lifecycle states)
  - [...]
- **Lifecycle states** (if applicable):
  - `draft` — [meaning]
  - `in_progress` — [meaning]
  - `complete` — [meaning]
  - [...]
- **Primary FK relationships:**
  - `workflow_template_id` → `workflow_templates.id`
  - [...]
- **RLS posture:** [≤30 word description]

## Section B — Storage buckets

### `bucket-name`

- **Purpose:** [description]
- **Access policy:** [public / signed / auth]
- **CORS:** [posture if known, or NOT KNOWN]

## Section C — Edge Functions

### `function-name`

- **Purpose:** [≤20 words]
- **Input:** [key params]
- **Output:** [key response]
- **Auth:** [anon / authenticated / service-role]

## Section D — Realtime subscriptions

### Table: `table_name`

- **Events published:** INSERT / UPDATE / DELETE
- **Known subscribers:** [code references]
```

Within each section, order entries alphabetically.

---

## Steps

### Step 1 — Verify source materials

Confirm what the operator has provided:

- Schema dump? Format? Complete or partial?
- RLS policies? In SQL or dashboard export?
- Storage bucket config? CORS rules?
- Edge Functions? Source code or just endpoint list?
- Realtime config?

Report gaps explicitly. The Architect values honest partial
inventory over fabricated complete inventory.

### Step 2 — Build table inventory (Section A)

For each table in the schema:

1. Extract table name and column list
2. Identify architecturally significant columns (IDs, FKs, state,
   timestamps)
3. If a `status`/`state` column exists, find the CHECK constraint
   or referenced enum to enumerate valid values
4. Identify FK relationships
5. Parse any RLS policies for that table into a prose description
6. Write ≤20 word purpose sentence

### Step 3 — Build storage inventory (Section B)

For each bucket, capture name / purpose / access / CORS.

### Step 4 — Build Edge Function inventory (Section C)

For each function, describe purpose / input / output / auth.

### Step 5 — Build Realtime inventory (Section D)

For each Realtime-enabled table, capture events + known subscribers.

### Step 6 — Quality checks

- Every table has all 6 required fields
- Lifecycle states enumerated when status/state column present
- RLS posture describes WHO can do WHAT, not the literal policy
  SQL
- Storage, Edge Functions, Realtime sections complete or
  explicitly marked `[NOT PROVIDED]`

---

## Output discipline

Terse execution. When done, present:

- The four-section output markdown document
- A summary line per section (e.g., "Tables: 23. Storage
  buckets: 1. Edge Functions: 2. Realtime subscriptions: 1.")
- A "gaps" section noting anything the operator should check
  and provide in a future pass

---

## Special notes

### RLS posture framing

RLS policies are often dense SQL. The goal is not to reproduce
the SQL but to describe the effective behavior in prose. Example:

**Bad (literal SQL translation):** "Policy `select_policy` allows
SELECT where `auth.uid() = resource_id::uuid OR firm_id IN
(SELECT firm_id FROM user_firms WHERE user_id = auth.uid())`."

**Good (behavioral description):** "SELECT allowed to the user
whose resource_id matches, or any user in the same firm. INSERT/
UPDATE restricted to firm members; admins have broader access
via the `admins` role."

### Columns worth inventorying

Not every column. Architecturally significant ones:

- Primary keys (`id`)
- Foreign keys (`*_id` columns referring to other tables)
- State/status columns
- Timestamp columns (`created_at`, `updated_at`, `completed_at`,
  etc.) — capture what timestamps exist, not full audit
- Tenancy columns (`firm_id`, `tenant_id`, etc.)
- Columns referenced by RLS policies
- Columns central to the table's purpose (e.g., `source_html` on
  `workflow_form_definitions` — not a structural column but
  architecturally central)

Skip: every `name`, `description`, `notes`, `metadata` column
that's just content.

### Inferring from code when schema is unavailable

If the operator can't export the full schema but has provided code,
you can inventory tables by inference — but mark each such entry
as `[INFERRED FROM CODE]`. The Architect will validate these in a
future pass.

---

*End of Brief.*
