# Commission · CMD-ACCORD-MEETING-VISIBILITY-1

**Phase:** Architecture — Meeting visibility RLS
**Authored:** 2026-05-12
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Spec authority:** Operator direction 2026-05-12; schema inventory v1.4
**Predecessor:** X-16 sealed · A-12 sealed
**Successor:** CMD-ACCORD-INVITATION-EXPLORE-1
**Coding agent:** execute sequentially; halt-and-surface after §7
**Note:** This is a pure SQL commission. No JS changes. No HTML changes.
All work happens in the Supabase SQL editor.

---

## §1 — Scope

Currently every firm member sees every firm meeting in the Accord rail and
parking lot. Visibility is gated only by `firm_id` RLS — not by invitation.

This CMD establishes per-meeting visibility at the substrate level:
- A user sees a meeting if they are the **organizer** (`organizer_id = auth.uid()`)
- A user sees a meeting if they are an **invited attendee** whose resource is in
  `accord_meeting_attendees` for that meeting
- All other meetings are invisible — not filtered in application code, blocked
  at the database level

**Deliverables:**
1. `my_resource_id()` SQL helper function
2. Amended RLS SELECT policy on `accord_meetings`
3. Amended RLS SELECT policy on `accord_workstreams` — workstream visible if
   user can see at least one meeting in it
4. Verification that all three test users (Vaughn, Angela, Ron) see correct data

**What does NOT change:**
- INSERT/UPDATE/DELETE policies on any table
- `accord_meeting_attendees` policies
- `accord_nodes`, `accord_chat_messages`, or any other table policies
- Any JS or HTML files

---

## §2 — Pre-flight verification (before writing any SQL)

Run all four probes and paste results before touching any policy.

**P1 — Current RLS policies on `accord_meetings`:**
```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'accord_meetings'
ORDER BY cmd, policyname;
```

**P2 — Current RLS policies on `accord_workstreams`:**
```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'accord_workstreams'
ORDER BY cmd, policyname;
```

**P3 — Confirm `my_firm_id()` pattern exists (reference for new helper):**
```sql
SELECT prosrc FROM pg_proc WHERE proname = 'my_firm_id' LIMIT 1;
```

**P4 — Confirm `accord_meeting_attendees` structure:**
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'accord_meeting_attendees'
ORDER BY ordinal_position;
```

Report P1–P4 before proceeding.

---

## §3 — `my_resource_id()` helper function

This function returns the `resources.id` for the currently authenticated user.
It is the identity bridge required for the `accord_meeting_attendees` join.

```sql
CREATE OR REPLACE FUNCTION my_resource_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT id
  FROM resources
  WHERE user_id = auth.uid()
    AND firm_id = my_firm_id()
  LIMIT 1;
$$;
```

**Verify after creation:**
```sql
SELECT my_resource_id();
```
Expected: returns Vaughn's resource UUID (`e1000001-0000-0000-0000-000000000001`).
If returns NULL — `resources.user_id` is not linked for Vaughn. Halt and surface.

---

## §4 — Amended RLS on `accord_meetings`

### §4.1 — Drop existing SELECT policy

```sql
-- Find and drop the existing firm-scoped SELECT policy
-- The exact name comes from P1 output above
-- Pattern will be something like:
DROP POLICY IF EXISTS accord_meetings_select ON accord_meetings;
-- Adjust name to match P1 output exactly
```

### §4.2 — New SELECT policy

```sql
CREATE POLICY accord_meetings_select ON accord_meetings
  FOR SELECT
  USING (
    firm_id = my_firm_id()
    AND (
      -- Organizer always sees their meeting
      organizer_id = auth.uid()
      OR
      -- Invited attendee sees the meeting
      meeting_id IN (
        SELECT meeting_id
        FROM accord_meeting_attendees
        WHERE resource_id = my_resource_id()
          AND firm_id = my_firm_id()
      )
    )
  );
```

**Critical:** `my_resource_id()` may return NULL for users with no linked
resource row (e.g. Ron if his resource has `user_id = NULL`). A NULL
`resource_id` in the subquery returns zero rows — correct behavior. Ron sees
no meetings he wasn't explicitly invited to. Do not add a NULL guard that
accidentally grants visibility.

---

## §5 — Amended RLS on `accord_workstreams`

A workstream is visible if the user can see at least one meeting in it.
This is derived visibility — no workstream membership table needed.

### §5.1 — Drop existing SELECT policy

```sql
DROP POLICY IF EXISTS accord_workstreams_select ON accord_workstreams;
-- Adjust name to match P2 output exactly
```

### §5.2 — New SELECT policy

```sql
CREATE POLICY accord_workstreams_select ON accord_workstreams
  FOR SELECT
  USING (
    firm_id = my_firm_id()
    AND (
      -- Workstream creator always sees it
      created_by = auth.uid()
      OR
      -- User has at least one visible meeting in this workstream
      EXISTS (
        SELECT 1
        FROM accord_meetings m
        WHERE m.workstream_id = accord_workstreams.workstream_id
          AND m.firm_id = my_firm_id()
          AND (
            m.organizer_id = auth.uid()
            OR m.meeting_id IN (
              SELECT meeting_id
              FROM accord_meeting_attendees
              WHERE resource_id = my_resource_id()
                AND firm_id = my_firm_id()
            )
          )
      )
    )
  );
```

**Note:** If `accord_workstreams` has no `created_by` column, remove that
branch. P2 output will confirm. The EXISTS subquery alone is sufficient.

---

## §6 — Seed test data for Angela

Before running acceptance tests, Angela needs invited attendee rows so she
has something to see. Run this:

```sql
-- Find Angela's resource_id
SELECT id, name, user_id FROM resources
WHERE name ILIKE '%angela%'
AND firm_id = 'aaaaaaaa-0001-0001-0001-000000000001';
```

Then seed 3 meetings with Angela as invited attendee — pick 3 of Vaughn's
existing running/idle meetings:

```sql
-- Repeat for 3 different meeting_ids
INSERT INTO accord_meeting_attendees (
  attendee_id,
  firm_id,
  meeting_id,
  resource_id,
  role_in_meeting,
  rsvp_status
)
VALUES (
  gen_random_uuid(),
  'aaaaaaaa-0001-0001-0001-000000000001',
  '<meeting_id>',
  '<angela_resource_id>',
  'attendee',
  'accepted'
)
ON CONFLICT DO NOTHING;
```

---

## §7 — Acceptance tests

Run all tests. All six must pass before sealing.

**Test 1 — Vaughn sees his meetings (organizer path):**
```sql
-- Run as Vaughn (default session)
SELECT meeting_id, title, state
FROM accord_meetings
WHERE firm_id = 'aaaaaaaa-0001-0001-0001-000000000001'
ORDER BY created_at DESC
LIMIT 10;
```
Expected: returns Vaughn's meetings. Count should match prior baseline.

**Test 2 — Angela sees only her invited meetings:**
```sql
-- Must be run as Angela's auth session
-- Use Supabase auth.uid() check:
SELECT auth.uid(), my_resource_id();
-- Then:
SELECT meeting_id, title FROM accord_meetings
WHERE firm_id = 'aaaaaaaa-0001-0001-0001-000000000001';
```
Expected: returns only the 3 seeded meetings. NOT all firm meetings.

**Test 3 — Ron sees nothing:**
```sql
-- Run as Ron's auth session
SELECT auth.uid(), my_resource_id();
SELECT COUNT(*) FROM accord_meetings
WHERE firm_id = 'aaaaaaaa-0001-0001-0001-000000000001';
```
Expected: `my_resource_id()` returns NULL (Ron has no resource row linked).
COUNT returns 0 unless Ron is organizer of any meetings.

**Test 4 — Workstream visibility follows meeting visibility:**
```sql
-- Run as Angela's session
SELECT workstream_id, name FROM accord_workstreams
WHERE firm_id = 'aaaaaaaa-0001-0001-0001-000000000001';
```
Expected: returns only workstreams containing Angela's invited meetings.

**Test 5 — Application layer (browser) — Vaughn:**
Hard refresh Accord as Vaughn. Confirm workstream rail shows same meetings
as before. No regression.

**Test 6 — Application layer (browser) — Angela:**
Hard refresh Accord as Angela. Confirm rail shows only her 3 invited meetings.
Confirm constellation shows only workstreams for those meetings.

---

## §8 — Rollback plan

If tests fail or unexpected data loss occurs:

```sql
-- Restore original firm-scoped SELECT policy on accord_meetings
DROP POLICY IF EXISTS accord_meetings_select ON accord_meetings;
CREATE POLICY accord_meetings_select ON accord_meetings
  FOR SELECT
  USING (firm_id = my_firm_id());

-- Restore original workstreams policy
DROP POLICY IF EXISTS accord_workstreams_select ON accord_workstreams;
CREATE POLICY accord_workstreams_select ON accord_workstreams
  FOR SELECT
  USING (firm_id = my_firm_id());
```

Keep this rollback SQL on hand before running §4 and §5.

---

## §9 — Post-seal notes

After this seals:
- Angela's Accord rail will be sparse until more meetings are seeded or
  the invitation pipeline (CMD-ACCORD-INVITATION-PIPELINE-1) ships
- Ron's Accord rail will be empty — correct behavior
- The `my_resource_id()` function is now a canonical substrate helper —
  document in schema inventory v1.5
- Any future CMD that needs per-user meeting visibility can rely on this
  function rather than re-implementing the join

---

## §10 — Files manifest

| Asset | Change |
|---|---|
| Supabase SQL | `my_resource_id()` function |
| Supabase SQL | `accord_meetings` SELECT policy |
| Supabase SQL | `accord_workstreams` SELECT policy |
| `accord-schema-inventory-v1.5.md` | Document `my_resource_id()` + visibility policy pattern |

No JS. No HTML. No CSS. No version bump needed — substrate-only change.

---

## §11 — Discipline checklist

- Pre-flight P1–P4 verified before any SQL runs
- Rollback SQL prepared before §4 executes
- `my_resource_id()` returns NULL gracefully for unlinked users
- NULL resource_id produces zero rows in subquery — not a security bypass
- Angela seeded with 3 meetings before Tests 2/4/6
- All 6 acceptance tests pass before seal
- Schema inventory updated to v1.5 on seal

---

**Halt-and-surface after §7. Close-out must include P1–P4 pre-flight output,
`my_resource_id()` verification result, and all 6 acceptance test results.**

**After seal: CMD-ACCORD-INVITATION-EXPLORE-1 is unblocked.**

---

*End Commission · CMD-ACCORD-MEETING-VISIBILITY-1.*
