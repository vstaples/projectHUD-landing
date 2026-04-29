# Brief — Mode A — MY VIEWS persistence fork: schema (Brief 1 of arc) — CMD[NNN]

**Mode:** A (Architectural — schema only; no application code)
**Surface:** Supabase database (Postgres). No application files modified.
**Doctrine version locked at brief authorship:** Style Doctrine v1.7
**Brief author:** Architect
**Date:** 2026-04-29
**Predecessor:** Compass MY VIEWS data check (post-CMD100 investigation, outcome 3 confirmed: no recoverable data; persistence-layer fork required)
**Arc context:** This is Brief 1 of an anticipated 3-brief arc:
  - **Brief 1 (this brief):** Schema DDL + RLS policies. Operator runs DDL in Supabase. No application code.
  - **Brief 2 (anticipated):** Application code fork. my-views.html and supporting files rewritten to read/write from new tables. Includes Share UI fix per operator screenshot 2026-04-29.
  - **Brief 3 (anticipated):** Verification and journal. Operator creates test dashboards across multiple sessions; verifies persistence, sharing, invitation notifications, MY NOTES non-regression.

---

## §0 — Standing rules

The following Iron Rules apply throughout this work-cycle:

- **Iron Rule 36** (hand-off terseness) — terse diff (or DDL,
  in this brief), test result, findings only.
- **Iron Rule 37** (silent work-mode) — no diagnostic
  narration; work silently.
- **Iron Rule 39** (architect briefing discipline) — input
  enumeration, output specification (this brief satisfies §2
  and §6).
- **Iron Rule 40** (agent execution discipline) —
  halt-on-missing-input, terse transcript, test instructions
  in hand-off, dev-console-first debugging.
- **Style Doctrine §0.1** — agents do not modify or extend
  doctrine. Halt and report on doctrine gaps. (Doctrine isn't
  a likely halt trigger in Brief 1; the work is database-only.)

**Brief 1 specific:**

- **No application code is touched in Brief 1.** No edits to
  my-views.html, mw-tabs.js, mw-core.js, hud-shell.js, or any
  other JS/HTML/CSS file. The deliverable is SQL.
- **No data migration runs in Brief 1.** The new tables start
  empty. Migration of existing `notes_workspace.state.views`
  data is NOT in scope (and the operator has confirmed no
  recoverable dashboard data exists in `notes_workspace`
  anyway).
- **`notes_workspace` table is not modified.** MY NOTES
  continues to use it untouched. The fork is one-directional:
  MY VIEWS leaves `notes_workspace`; MY NOTES stays.
- **`view_participants` table IS modified.** A new column
  (`view_id uuid`) is added with FK to `compass_views.id`.
  Existing columns are reviewed; see §3.4.

---

## §1 — Purpose

Compass MY VIEWS currently shares a single `notes_workspace`
row with MY NOTES per user, both reading/writing into the
same `state` jsonb under different top-level keys. This
coupling caused the operator's prior dashboard data to be
silently overwritten by adjacent code paths during the
2026-04-27 → 2026-04-29 work cycles.

Brief 1 establishes a dedicated persistence layer for MY
VIEWS — `compass_views` table for dashboard content, with
the existing `view_participants` table refactored to FK
into it for multi-user sharing. After Brief 1 ships:

- DDL for new tables exists in Supabase
- RLS policies are in place (hardcoded single-firm posture
  per operator decision)
- `view_participants` schema is updated to support FK-based
  joins
- No application code yet reads/writes the new tables
  (Brief 2 territory)

After Brief 2 + Brief 3 ship, the architectural coupling
between MY VIEWS and MY NOTES is permanently severed at
the persistence layer.

---

## §2 — Architectural decisions locked

The architect locks these decisions before agent work begins.
The agent does not re-litigate them.

### §2.1 Single-table per dashboard, jsonb content

`compass_views` is one row per dashboard. Dashboard content
(tiles, layout, widgets) lives in a `state` jsonb column on
that row. NOT normalized into separate `compass_view_tiles`
/ `compass_view_layouts` / `compass_view_widgets` tables.

Rationale: matches the working pattern of `notes_workspace`,
simpler RLS, simpler reads, simpler migration path if
normalization ever becomes desirable.

### §2.2 UUID primary key

`compass_views.id` is `uuid` PK, default `gen_random_uuid()`.
NOT `(owner_user_id, view_name)` composite PK.

Rationale: cleaner FK model (`view_participants.view_id`
points to one column), allows dashboard renames without
breaking participant relationships, allows multiple
dashboards with the same name across users, future-proofs
for any feature requiring stable dashboard identity.

### §2.3 `view_participants` gets a `view_id` FK column

Existing `view_participants` already has the right shape for
participant relationships (roles, color, invite/accept
timestamps, tile_edit_overrides). Brief 1 adds a `view_id
uuid` column with FK to `compass_views.id` and ON DELETE
CASCADE.

Existing `(workspace_owner_user_id, view_name)` columns are
**dropped** as part of this brief — they're redundant once
`view_id` exists. See §3.4 for the exact transition.

Rationale: cleanest end state. The redundant columns would
otherwise cause silent drift (UI updates one, code updates
the other) and are the kind of debt that produces the
mysterious-issue class we just spent three days resolving.

### §2.4 RLS posture — hardcoded single-firm

Per operator decision (matches `project_daily_snapshots` and
other tables in the codebase). RLS enabled. Policies use
literal firm UUID `aaaaaaaa-0001-0001-0001-000000000001`.
Effectively single-tenant; no real multi-firm enforcement.

Rationale: matches existing codebase pattern. Going stricter
would make MY VIEWS an outlier. Going looser is unnecessarily
lax. RLS posture upgrade is a separate cross-cutting arc
(out of scope for this brief).

### §2.5 Cascade on dashboard deletion

`view_participants.view_id` FK has `ON DELETE CASCADE`.
Deleting a `compass_views` row deletes all associated
participant rows. No soft delete, no audit trail preservation.

Rationale: matches operator decision (Q4 in scoping).

### §2.6 No Realtime publication

`compass_views` is NOT added to the Realtime publication.
Last-write-wins behavior. Same posture as `notes_workspace`
and every other table in ProjectHUD currently.

Rationale: matches operator decision (Q5 in scoping).
Realtime is a separate post-demo enhancement.

### §2.7 Auto-created default dashboard — handled by code, not DDL

Per operator decision (Q3 in scoping), new users auto-receive
one default dashboard on first MY VIEWS load. This is Brief 2
application-code work; Brief 1 does NOT seed default rows
via DDL.

The DDL ensures the table exists; Brief 2's code inserts
the default row when a user first opens MY VIEWS and has
zero `compass_views` rows.

---

## §3 — Required DDL

The agent's deliverable is SQL the operator runs in Supabase.
Constructed as a single transaction where possible (atomic
schema change). If any step requires being outside a
transaction (e.g., enabling RLS), the agent calls that out
explicitly with separate execution steps.

### §3.1 `compass_views` table

```sql
CREATE TABLE public.compass_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  view_name text NOT NULL,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT compass_views_owner_name_unique
    UNIQUE (owner_user_id, view_name),

  CONSTRAINT compass_views_firm_id_fk
    FOREIGN KEY (firm_id) REFERENCES public.firms(id),

  CONSTRAINT compass_views_owner_user_id_fk
    FOREIGN KEY (owner_user_id) REFERENCES public.users(id)
);
```

Notes:

- `(owner_user_id, view_name)` UNIQUE constraint preserves
  per-user name uniqueness without making it the PK.
- `state jsonb` default `'{}'::jsonb` — empty object, not
  null. Brief 2's auto-create logic populates this with the
  default dashboard structure.
- `firms` and `users` FK references — agent confirms these
  tables exist with PK `id uuid` (per schema inventory they
  do; this is belt-and-suspenders).

### §3.2 `compass_views` indexes

```sql
CREATE INDEX compass_views_firm_id_idx
  ON public.compass_views (firm_id);

CREATE INDEX compass_views_owner_user_id_idx
  ON public.compass_views (owner_user_id);
```

Rationale: every read filters by `firm_id` (RLS) and most
reads filter by `owner_user_id` (per-user dashboard list).

### §3.3 `compass_views` RLS

```sql
ALTER TABLE public.compass_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY compass_views_firm_isolated_select
  ON public.compass_views
  FOR SELECT
  USING (firm_id = 'aaaaaaaa-0001-0001-0001-000000000001'::uuid);

CREATE POLICY compass_views_firm_isolated_insert
  ON public.compass_views
  FOR INSERT
  WITH CHECK (firm_id = 'aaaaaaaa-0001-0001-0001-000000000001'::uuid);

CREATE POLICY compass_views_firm_isolated_update
  ON public.compass_views
  FOR UPDATE
  USING (firm_id = 'aaaaaaaa-0001-0001-0001-000000000001'::uuid)
  WITH CHECK (firm_id = 'aaaaaaaa-0001-0001-0001-000000000001'::uuid);

CREATE POLICY compass_views_firm_isolated_delete
  ON public.compass_views
  FOR DELETE
  USING (firm_id = 'aaaaaaaa-0001-0001-0001-000000000001'::uuid);
```

Notes:

- Hardcoded single-firm posture per §2.4.
- Four separate policies (one per CRUD operation) for
  explicitness. Could be collapsed to a single policy with
  `FOR ALL`, but explicit policies are easier to audit.

### §3.4 `view_participants` modifications

The existing `view_participants` table currently has
`(workspace_owner_user_id, view_name)` as the participant-
to-dashboard reference. Brief 1 adds `view_id` and
deprecates the redundant columns.

**Step A — Add `view_id` column (nullable initially):**

```sql
ALTER TABLE public.view_participants
  ADD COLUMN view_id uuid;
```

Initially nullable because existing rows (if any) don't yet
have a corresponding `compass_views.id` to point to. Per the
operator's confirmed query, `compass_views` will start empty,
which means `view_participants` may already have orphaned
rows from prior testing. The agent inspects.

**Step B — Inspect existing `view_participants` rows:**

```sql
SELECT count(*) AS total_rows,
       count(view_id) AS rows_with_view_id,
       count(*) - count(view_id) AS rows_without_view_id
FROM public.view_participants;
```

Operator runs and reports. The agent uses the count to
decide between two paths:

- **If `total_rows = 0`:** No data. Proceed to Step C
  immediately. Make `view_id` NOT NULL, drop redundant
  columns.
- **If `total_rows > 0`:** Existing rows are orphaned (no
  matching `compass_views` row exists yet). Agent halts and
  reports. Operator decides whether to: (a) delete the
  orphaned rows (safe — the data they referenced no longer
  exists), or (b) defer the column-drop to a later cleanup,
  leaving redundant columns in place temporarily.

**Step C — Add FK constraint and NOT NULL (after Step B
confirms zero rows or after orphan cleanup):**

```sql
ALTER TABLE public.view_participants
  ADD CONSTRAINT view_participants_view_id_fk
    FOREIGN KEY (view_id)
    REFERENCES public.compass_views(id)
    ON DELETE CASCADE;

ALTER TABLE public.view_participants
  ALTER COLUMN view_id SET NOT NULL;
```

**Step D — Drop redundant columns (after Step C):**

```sql
ALTER TABLE public.view_participants
  DROP COLUMN workspace_owner_user_id,
  DROP COLUMN view_name;
```

Rationale per §2.3: `view_id` plus joined `compass_views`
gives both `owner_user_id` and `view_name`. Keeping the
redundant columns invites silent drift.

**Step E — Add index on `view_id` for join performance:**

```sql
CREATE INDEX view_participants_view_id_idx
  ON public.view_participants (view_id);
```

### §3.5 `view_participants` RLS — confirm posture unchanged

The existing `view_participants` RLS posture per the schema
inventory is "Self-and-workspace-based" — SELECT on own
participant rows, INSERT/UPDATE/DELETE for workspace owner
or accepted owner/editor.

Brief 1 does NOT modify the RLS posture. The existing
policies continue to apply. The agent's Step D column drops
will need to verify the policies don't reference the dropped
columns; if they do, the policies need rewriting.

**Verification query the agent provides:**

```sql
SELECT polname, pg_get_expr(polqual, polrelid) AS using_clause,
       pg_get_expr(polwithcheck, polrelid) AS check_clause
FROM pg_policy
WHERE polrelid = 'public.view_participants'::regclass;
```

Operator runs, reports. Agent inspects each policy's
USING / WITH CHECK clauses for references to
`workspace_owner_user_id` or `view_name`. If found, agent
provides ALTER POLICY statements to rewrite them in terms
of `view_id` (joining to `compass_views` to get the owner).

If no references found, no policy changes needed.

### §3.6 `updated_at` trigger

To keep `compass_views.updated_at` accurate without relying
on application code:

```sql
CREATE OR REPLACE FUNCTION public.compass_views_updated_at()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER compass_views_updated_at_trg
  BEFORE UPDATE ON public.compass_views
  FOR EACH ROW
  EXECUTE FUNCTION public.compass_views_updated_at();
```

Note: if a similar `updated_at` helper function already exists
in the schema (the agent checks via `pg_proc`), reuse it
rather than creating a duplicate. If creating a new function,
name it scoped to `compass_views_` to avoid collision.

---

## §4 — Out of scope

The following are explicitly NOT in scope for this work-cycle:

- Any application code change (my-views.html, mw-tabs.js,
  mw-core.js, hud-shell.js, etc.) — Brief 2 territory
- Any modification to `notes_workspace` table — MY NOTES is
  forbidden territory
- Any data migration from `notes_workspace.state.views` to
  `compass_views` — operator confirmed no recoverable data
- Realtime publication enablement — not happening per §2.6
- Default dashboard auto-creation — Brief 2 application code
- Share UI fix — Brief 2 application code (the screenshot of
  the broken Share modal is informational for Brief 2 scoping)
- Invitation notification flow rewiring — Brief 2 application
  code (existing `notifications` table mechanism preserved)
- RLS posture upgrade (per-user RLS instead of hardcoded
  single-firm) — separate cross-cutting arc
- Any change to `view_participants.color`, `tile_edit_overrides`,
  invite/accept timestamps — these columns are preserved as-is

---

## §5 — Inputs (Iron Rule 39 §2)

### §5.1 No application files modified

Brief 1 ships SQL only. No application files are read for
modification.

### §5.2 Files read for reference

- `projecthud-supabase-schema-inventory.md` — authoritative
  reference for current schema state; the agent confirms
  `compass_views` does not already exist, confirms `users`
  and `firms` PK structure, confirms `view_participants`
  current columns and RLS

### §5.3 Operator-run queries (data-gathering)

Per §3.4 Step B, the agent provides one `count(*)` query the
operator runs to inspect existing `view_participants` rows
before the column drop. Per §3.5, the agent provides one
`pg_policy` introspection query the operator runs to inspect
existing policy USING/CHECK clauses. Both are read-only and
diagnostic.

### §5.4 Doctrine + reference

- Style Doctrine v1.7
- Iron Rules 36, 37, 39, 40 ratifications
- Work Mode Classification doctrine v1.0
- This brief

---

## §6 — Definition of done

Brief 1 is complete when:

- `compass_views` table exists in Supabase with all columns,
  constraints, indexes, and RLS policies per §3.1-§3.3
- `compass_views` has the `updated_at` trigger per §3.6
- `view_participants` has new `view_id uuid NOT NULL`
  column with FK and CASCADE per §3.4 Steps A-E
- `view_participants` redundant columns
  (`workspace_owner_user_id`, `view_name`) are dropped
  (assuming Step B confirmed zero rows, or operator chose
  to drop after cleanup)
- `view_participants` RLS policies are verified per §3.5;
  if rewriting was needed, it shipped
- The agent provides a final verification SQL block the
  operator runs to confirm post-state matches expected
  schema (see §7)
- No application code modified
- No `notes_workspace` modifications
- The hand-off conforms to §8

---

## §7 — Smoke test

Operator runs after applying the DDL:

1. **Confirm `compass_views` exists with correct shape:**

   ```sql
   SELECT column_name, data_type, is_nullable, column_default
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'compass_views'
   ORDER BY ordinal_position;
   ```

   Expected: 7 columns (id, firm_id, owner_user_id, view_name,
   state, created_at, updated_at) with types matching §3.1.

2. **Confirm `compass_views` RLS is enabled:**

   ```sql
   SELECT relname, relrowsecurity
   FROM pg_class
   WHERE relname = 'compass_views';
   ```

   Expected: `relrowsecurity = true`.

3. **Confirm `compass_views` policies exist:**

   ```sql
   SELECT polname, polcmd
   FROM pg_policy
   WHERE polrelid = 'public.compass_views'::regclass;
   ```

   Expected: 4 policies (SELECT, INSERT, UPDATE, DELETE) per
   §3.3.

4. **Confirm `view_participants` has `view_id` and lacks
   redundant columns:**

   ```sql
   SELECT column_name, is_nullable
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'view_participants'
   ORDER BY ordinal_position;
   ```

   Expected: `view_id uuid NOT NULL` present;
   `workspace_owner_user_id` and `view_name` absent.

5. **Confirm FK constraint:**

   ```sql
   SELECT conname, confrelid::regclass AS references_table,
          confdeltype AS on_delete
   FROM pg_constraint
   WHERE conrelid = 'public.view_participants'::regclass
     AND contype = 'f';
   ```

   Expected: `view_participants_view_id_fk` exists,
   references `compass_views`, `confdeltype = 'c'` (CASCADE).

6. **Insert + delete round-trip test (read-only of impact):**

   ```sql
   -- Insert a test dashboard
   INSERT INTO public.compass_views (firm_id, owner_user_id, view_name, state)
   VALUES (
     'aaaaaaaa-0001-0001-0001-000000000001'::uuid,
     '57b93738-6a2a-4098-ba12-bfffd1f7dd07'::uuid,
     'BRIEF1_SMOKE_TEST',
     '{"test": true}'::jsonb
   )
   RETURNING id, owner_user_id, view_name, state;

   -- Confirm trigger fires on update
   UPDATE public.compass_views
     SET state = '{"test": "updated"}'::jsonb
     WHERE view_name = 'BRIEF1_SMOKE_TEST'
   RETURNING id, updated_at, state;

   -- Clean up the test row
   DELETE FROM public.compass_views
     WHERE view_name = 'BRIEF1_SMOKE_TEST';
   ```

   Expected: insert returns the row with the operator's
   user_id and firm_id; update returns a fresh `updated_at`;
   delete succeeds (with no participant rows to cascade,
   since none were inserted).

7. **Confirm `notes_workspace` is unaffected:**

   ```sql
   SELECT count(*) FROM public.notes_workspace
   WHERE user_id = '57b93738-6a2a-4098-ba12-bfffd1f7dd07';
   ```

   Expected: same row count as before Brief 1 (operator
   recalls or confirms; should be 1).

If any smoke test step fails, the operator captures the
output and the agent diagnoses.

---

## §8 — Hand-off format (Iron Rule 36 + Iron Rule 40 §3)

Required output:

1. **DDL delivered** — the SQL block(s) the operator runs in
   Supabase. Single transaction where possible. Multi-step
   call-outs explicit.
2. **Step B inspection result** — the agent reports back
   what the operator saw when they ran the
   `view_participants` count query, and the path taken
   (proceed to Step C / orphan cleanup / defer drop).
3. **Step §3.5 inspection result** — the agent reports
   whether `view_participants` RLS policies needed rewriting
   to remove references to dropped columns. If yes, the
   ALTER POLICY SQL is included.
4. **Smoke test result** — pass / fail / not run, with
   one-sentence explanation if not run.
5. **Findings** — zero or more one-liners. Examples:
   - "`updated_at` helper function did not exist; created
     scoped function per §3.6."
   - "`view_participants` had N orphaned rows from prior
     testing; operator authorized deletion before column drop."
   - "RLS policies referenced `workspace_owner_user_id`;
     rewrote to use `view_id` JOIN to `compass_views`."
   - "All inputs enumerated in brief §5 were received."
6. **Test instructions** — explicit verification steps the
   operator runs post-deploy (likely a near-restatement of §7
   with any agent-discovered nuances)

Do not transcribe reasoning. Do not echo brief content.

---

## §9 — Reference materials (Iron Rule 39 §2 — full enumeration)

**Files modified:**
- None (DDL-only brief)

**Files read for reference:**
- `projecthud-supabase-schema-inventory.md`

**Doctrine + operating-discipline:**
- ProjectHUD Style Doctrine v1.7
- iron-rule-36-ratification.md
- iron-rule-37-ratification.md
- iron-rule-39-ratification.md
- iron-rule-40-ratification.md
- work-mode-classification-doctrine.md (v1.0)

**Brief context:**
- Compass MY VIEWS data check hand-off (post-CMD100)
- This brief

---

## §10 — Narrative instruction block (paste-ready)

Per Iron Rule 39 §1, the operator copy-pastes the following
block to the coding agent:

```
Apply brief-cmdNNN-myviews-fork-schema.md (Brief 1 of the
MY VIEWS persistence fork arc).

This is a SCHEMA-ONLY brief. You ship SQL DDL the operator
runs in Supabase. You do NOT modify any application code.
You do NOT modify the `notes_workspace` table. You DO modify
`view_participants` per §3.4.

Architectural decisions are LOCKED in §2; do not re-litigate.
Single-table per dashboard with jsonb state (§2.1). UUID PK
(§2.2). `view_participants.view_id` FK with CASCADE (§2.3,
§2.5). Hardcoded single-firm RLS (§2.4). No Realtime (§2.6).
No DDL-level seeding (§2.7).

§4 lists out-of-scope items — do not touch.

The schema inventory document (attached) is your reference.
Do NOT probe table names; the schema is documented. If the
schema doesn't tell you something you need (e.g., the FK
column type for `users.id`), confirm via direct
`information_schema.columns` query rather than guessing.

§3.4 has multi-step DDL with operator-run inspection between
steps (Step B). You provide the SQL; operator runs each
step in sequence and reports back; you proceed based on
results.

§0 standing rules apply: Iron Rules 36, 37, 39, 40, plus
Style Doctrine §0.1.

Per Iron Rule 40 §1, halt on missing inputs. Per Iron Rule
40 §3, test instructions required in hand-off (§8).

Operator's user_id is `57b93738-6a2a-4098-ba12-bfffd1f7dd07`
(used in §7 smoke test query 6 and 7). Firm UUID is
`aaaaaaaa-0001-0001-0001-000000000001` (used throughout
RLS policies).

Proceed.
```

---

*End of Brief — MY VIEWS persistence fork: schema (Brief 1).*
