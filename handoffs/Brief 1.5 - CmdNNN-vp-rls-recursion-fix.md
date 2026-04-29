# Brief — Mode A — view_participants RLS recursion fix (Brief 1.5) — CMD[NNN]

**Mode:** A (Architectural — RLS policies only; no application code, no schema changes)
**Surface:** Supabase database — `view_participants` RLS policies
**Doctrine version locked at brief authorship:** Style Doctrine v1.7
**Brief author:** Architect
**Date:** 2026-04-29
**Predecessor:** Brief 1 of arc (closed 2026-04-29) — schema fork shipped clean; RLS recursion defect surfaced post-deploy when Brief 2 application code exercised the policies
**Arc context:** This is Brief 1.5, an emergency repair brief intercalated into the MY VIEWS persistence fork arc:
  - **Brief 1 (closed):** Schema DDL — `compass_views`, `view_participants` rebuild, RLS policies rewritten. Smoke test verified shape; behavioral verification under RLS was missed.
  - **Brief 1.5 (this brief):** Rewrite the four `view_participants` RLS policies to eliminate the self-referential join causing 42P17 recursion errors.
  - **Brief 2 (in progress, halted):** Application code fork. Halted on RLS 500 errors. Resumes after Brief 1.5 ships.
  - **Brief 3 (anticipated):** Verification.

---

## §0 — Standing rules

- **Iron Rule 36** — terse hand-off (DDL, smoke test, findings).
- **Iron Rule 37** — silent work-mode. **Recently reinforced.** No diagnostic narration. No reconsidered-choices narration. Per-edit reasoning capped at one sentence.
- **Iron Rule 39** — input enumeration, output specification.
- **Iron Rule 40** — halt-on-missing-input, terse transcript, test instructions, dev-console-first debugging.
- **Style Doctrine §0.1** — agents do not modify or extend doctrine.

**Brief 1.5 specific:**

- **No application code touched.** Brief 2's halt remains in effect; only RLS policies change.
- **No schema changes.** Tables, columns, FKs, indexes, triggers all remain as Brief 1 left them.
- **Multi-step DDL with operator-inspection gates.** Per the operating-practice lesson from earlier in this arc: ship one step per round-trip. Do not bundle.
- **Numbered options, not natural-language templates.** Per the second operating-practice lesson.

---

## §1 — Purpose

The four `view_participants` RLS policies shipped in Brief 1 (`vp_select`, `vp_insert`, `vp_update`, `vp_delete`) preserve the original "self-and-workspace-based" semantics from the pre-Brief-1 schema. That semantics — "user can write a participant row if they are an accepted owner/editor of this view" — was implemented in the original schema by checking the legacy `workspace_owner_user_id` column directly. Brief 1 dropped that column, and the rewritten policies now express the check via joins back to `view_participants` itself.

The result: when a query against `view_participants` triggers RLS evaluation, the policy reads `view_participants` to evaluate, which triggers RLS again, which reads `view_participants` again, infinite recursion, Postgres returns `42P17 infinite recursion detected in policy for relation "view_participants"`.

Brief 1.5 rewrites the four policies to eliminate the self-reference. Owner-level operations check `compass_views.owner_user_id` directly. Participant-level operations check `view_participants.user_id` directly. Neither requires reading `view_participants` to evaluate.

After Brief 1.5 ships:
- All four `view_participants` policies are recursion-free.
- Owner-level operations (insert/update/delete any participant on a view you own) work for the dashboard owner.
- Participant-level operations (read your own row, update your own `accepted_at` / `last_seen_at`) work for the participant.
- Brief 2's halted Share INSERT test resumes successfully.

---

## §2 — Architectural decisions locked

### §2.1 Policy reference target

- **Owner identification:** `compass_views.owner_user_id`. The dashboard owner is the source of truth; participants are subordinate. Owner-level RLS clauses join to `compass_views` to identify ownership.
- **Participant identification:** `view_participants.user_id` directly. No join needed; the column is the answer.

### §2.2 Policy semantics preserved (with one simplification)

The original semantics permitted "owner OR accepted owner/editor" to perform owner-level operations. Brief 1.5 simplifies to **"owner ONLY"** for write operations.

Rationale: the "accepted owner/editor delegation" path was the source of the recursion — that's the clause that needed to read `view_participants` to determine if the requester was an editor. Eliminating delegation eliminates recursion. Operator decision (operator-confirmed: shared dashboard editing is not in current scope; only the owner edits sharing).

If post-Brief-2 operating experience reveals editor-delegation is needed, it can be reintroduced via a non-recursive mechanism (e.g., a `compass_views.editor_user_ids` array column populated by the owner) in a future brief.

### §2.3 Read access remains broad

For SELECT, both owners AND participants can read participant rows on dashboards they own or participate in. This is preserved (the recursion was on writes, not reads — but for symmetry and clarity, the SELECT policy is rewritten to the same non-recursive form).

### §2.4 RLS posture remains hardcoded single-firm

Brief 1's hardcoded firm UUID continues to apply at the `compass_views` level. Brief 1.5 does not change the firm-tenancy posture; it only rewrites the per-row policies.

---

## §3 — Required DDL

The agent ships SQL the operator runs in Supabase. **One step per round-trip.** Steps:

### §3.1 Step A — Inspect current policies

The agent provides this query for the operator to run:

```sql
SELECT polname,
       polcmd,
       pg_get_expr(polqual, polrelid) AS using_clause,
       pg_get_expr(polwithcheck, polrelid) AS check_clause
FROM pg_policy
WHERE polrelid = 'public.view_participants'::regclass
ORDER BY polname;
```

Operator runs, reports output. The agent reads the actual current USING / WITH CHECK clauses to confirm the recursion location and write replacement clauses against the actual baseline (not the architect's inferred baseline).

**This is a gate.** The agent does NOT proceed to Step B until Step A's output is in hand.

### §3.2 Step B — Rewrite SELECT policy

The agent provides DROP + CREATE for the SELECT policy. Replacement clause shape (agent adapts to actual baseline from Step A):

```sql
DROP POLICY IF EXISTS vp_select ON public.view_participants;

CREATE POLICY vp_select
  ON public.view_participants
  FOR SELECT
  USING (
    -- Participant can see their own row
    user_id = auth.uid()
    OR
    -- Owner can see all participant rows on their dashboards
    EXISTS (
      SELECT 1 FROM public.compass_views cv
      WHERE cv.id = view_participants.view_id
        AND cv.owner_user_id = auth.uid()
    )
  );
```

Operator runs. Agent confirms via re-running Step A's inspection query (operator runs that too) that the policy is updated.

**Gate.** Do not proceed to Step C until Step B is verified.

### §3.3 Step C — Rewrite INSERT policy

```sql
DROP POLICY IF EXISTS vp_insert ON public.view_participants;

CREATE POLICY vp_insert
  ON public.view_participants
  FOR INSERT
  WITH CHECK (
    -- Only the dashboard owner can insert participant rows
    EXISTS (
      SELECT 1 FROM public.compass_views cv
      WHERE cv.id = view_participants.view_id
        AND cv.owner_user_id = auth.uid()
    )
  );
```

Operator runs. Verify via Step A inspection.

**Gate.** Do not proceed to Step D until Step C is verified.

### §3.4 Step D — Rewrite UPDATE policy

UPDATE is the most nuanced because it has two legitimate user classes:

- The dashboard owner (can update any participant row — change role, color, remove)
- The participant themselves (can update only their own `accepted_at` and `last_seen_at` — accept invitation, heartbeat presence)

```sql
DROP POLICY IF EXISTS vp_update ON public.view_participants;

CREATE POLICY vp_update
  ON public.view_participants
  FOR UPDATE
  USING (
    -- Owner can update any row on their dashboard
    EXISTS (
      SELECT 1 FROM public.compass_views cv
      WHERE cv.id = view_participants.view_id
        AND cv.owner_user_id = auth.uid()
    )
    OR
    -- Participant can update their own row
    user_id = auth.uid()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.compass_views cv
      WHERE cv.id = view_participants.view_id
        AND cv.owner_user_id = auth.uid()
    )
    OR
    user_id = auth.uid()
  );
```

Operator runs. Verify via Step A inspection.

**Gate.** Do not proceed to Step E until Step D is verified.

### §3.5 Step E — Rewrite DELETE policy

```sql
DROP POLICY IF EXISTS vp_delete ON public.view_participants;

CREATE POLICY vp_delete
  ON public.view_participants
  FOR DELETE
  USING (
    -- Owner can delete any row on their dashboard
    EXISTS (
      SELECT 1 FROM public.compass_views cv
      WHERE cv.id = view_participants.view_id
        AND cv.owner_user_id = auth.uid()
    )
    OR
    -- Participant can remove themselves
    user_id = auth.uid()
  );
```

Operator runs. Verify via Step A inspection.

### §3.6 Step F — Recursion test

After all four policies are rewritten, the agent provides a smoke test SQL for the operator:

```sql
-- Test 1: SELECT against view_participants should not 42P17
SELECT count(*) FROM public.view_participants;

-- Test 2: Empty INSERT round-trip (insert + delete the test row).
-- This exercises the INSERT policy. Use the operator's user_id and
-- a test dashboard ID that the operator owns.
INSERT INTO public.view_participants
  (firm_id, view_id, user_id, view_role, color, invited_at)
SELECT
  cv.firm_id,
  cv.id,
  '57b93738-6a2a-4098-ba12-bfffd1f7dd07'::uuid, -- self as test target
  'viewer',
  '#888888',
  now()
FROM public.compass_views cv
WHERE cv.owner_user_id = '57b93738-6a2a-4098-ba12-bfffd1f7dd07'::uuid
LIMIT 1
RETURNING id, view_id, user_id;

-- Capture the returned id, then:
-- DELETE FROM public.view_participants WHERE id = '<returned id>';
```

Operator runs both. If neither errors with 42P17, recursion is fixed.

If Test 2 fails because no `compass_views` row exists for the operator (possible if MY VIEWS hasn't been opened yet to trigger auto-create), the agent provides a fallback that creates a temporary `compass_views` row first, then runs Test 2 against it, then deletes both.

---

## §4 — Out of scope

- Application code (Brief 2 territory; remains halted)
- Schema changes (tables, columns, FKs, indexes, triggers — none modified)
- The `compass_views` RLS policies (those are simple firm-isolation policies; no recursion possible)
- Editor-delegation semantics (deferred per §2.2)
- RLS posture changes (remains hardcoded single-firm)

---

## §5 — Inputs

### §5.1 Files modified

None (DDL-only).

### §5.2 Files read for reference

- Brief 1 hand-off (for the as-shipped policy SQL the agent referenced)
- `projecthud-supabase-schema-inventory.md`

### §5.3 Operator-run queries

Per §3.1 Step A — one inspection query before each policy rewrite. Per §3.6 Step F — recursion smoke test. All read-only or test-row round-trips with cleanup.

### §5.4 Doctrine + reference

- Style Doctrine v1.7
- Iron Rules 36, 37, 39, 40 ratifications
- Work Mode Classification doctrine v1.0

---

## §6 — Definition of done

Brief 1.5 is complete when:

- All four `view_participants` policies are rewritten per §3.2-§3.5
- Step F recursion test passes (no 42P17 errors)
- Step A inspection query confirms post-state policies are recursion-free
- No application code modified
- No schema modified
- Hand-off conforms to §8

---

## §7 — Smoke test

(Built into §3.6 Step F. After Brief 1.5 deploys, the operator additionally tests in the live application:)

1. Hard reset Compass. Open MY VIEWS. Confirm Default dashboard loads.
2. Open Share modal. Click a user from the dropdown. Confirm the user appears in PEOPLE WITH ACCESS without 500 errors in console.
3. Click Save Changes. Confirm view_participants row created (verify in Supabase).
4. Console should be clean — no `42P17` errors, no 500s on `view_participants` operations.

If smoke test passes, Brief 2 can resume from where it halted.

---

## §8 — Hand-off format

Required output:

1. **DDL delivered** — six SQL blocks per §3.1-§3.6, ONE PER ROUND-TRIP. Do not bundle.
2. **Step A inspection result** — agent reports what the operator saw; agent confirms baseline matches expected recursion location.
3. **Step F smoke test result** — pass / fail for recursion test.
4. **Findings** — zero or more one-liners. Examples:
   - "Step A confirmed recursion in vp_insert and vp_update policies; vp_select and vp_delete also rewritten preemptively for symmetry."
   - "Step F INSERT test required temporary compass_views row creation; row deleted post-test."
5. **Test instructions** — explicit verification steps the operator runs in the live application post-deploy.

---

## §9 — Reference materials

**Files modified:** None.

**Files read for reference:**
- Brief 1 hand-off (closed)
- `projecthud-supabase-schema-inventory.md`

**Doctrine + operating-discipline:**
- ProjectHUD Style Doctrine v1.7
- iron-rule-36-ratification.md
- iron-rule-37-ratification.md (recently reinforced)
- iron-rule-39-ratification.md
- iron-rule-40-ratification.md

**Brief context:**
- Brief 1 hand-off
- Brief 2 (halted; resumes post-Brief-1.5)
- This brief

---

## §10 — Narrative instruction block (paste-ready)

```
Apply brief-cmdNNN-vp-rls-recursion-fix.md (Brief 1.5 of
the MY VIEWS persistence fork arc — emergency repair).

This is a SCHEMA-RLS-ONLY brief. You ship SQL the operator
runs in Supabase. NO application code. NO schema changes.

Brief 2 is halted on 42P17 recursion errors caused by Brief
1's view_participants RLS policies referencing
view_participants in their USING/CHECK clauses. Brief 1.5
rewrites the four policies to eliminate the self-reference.

Architectural decisions are LOCKED in §2. Owner-level
operations check compass_views.owner_user_id directly.
Participant-level operations check view_participants.user_id
directly. No joins back to view_participants from inside
view_participants policies.

§3 has SIX SQL deliverables (Step A through Step F). Ship
ONE PER ROUND-TRIP. Do not bundle. The operator runs each,
reports back, you proceed to the next.

§0 standing rules apply. Iron Rule 37 was recently
reinforced — work silently. No mid-cycle narration. Per-edit
reasoning capped at one sentence. If you find yourself
reconsidering an architectural choice, halt instead of
narrating the reconsideration.

Operator's user_id is 57b93738-6a2a-4098-ba12-bfffd1f7dd07.
Firm UUID is aaaaaaaa-0001-0001-0001-000000000001.

Per Iron Rule 40 §1, halt on missing inputs.

Proceed with Step A.
```

---

*End of Brief — view_participants RLS recursion fix (Brief 1.5).*
