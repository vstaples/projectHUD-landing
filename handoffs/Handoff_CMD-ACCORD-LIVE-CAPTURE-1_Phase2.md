# HANDOFF — CMD-ACCORD-LIVE-CAPTURE-1 · Phase 2: Substrate Migrations

**Date:** 2026-05-17
**CMD:** L-01 · CMD-ACCORD-LIVE-CAPTURE-1
**Operator:** Vaughn Staples
**Phase:** 2 of 7 — Migrations only. No surface changes.

---

## §0 — PRE-FLIGHT

Read `Brief_CMD-ACCORD-LIVE-CAPTURE-1.md` end-to-end before proceeding.
Read Phase 1 findings in full — they carry forward.
Iron Rules 36, 40 §1, 47, 49, 64, 73 apply.
Terse output discipline: no preamble, no internal monologue.
Deliver in the §6 file order, then §7 checklist verbatim. Stop.

---

## §1 — PHASE 1 FINDINGS CARRY-FORWARD

The following Phase 1 findings directly affect this phase:

- `accord_nodes.discipline` and `accord_nodes.topic` confirmed absent — migrations are clear to proceed
- `accord_chat_messages` table confirmed present — no new chat table needed
- `seq_id` is assigned server-side by `allocate_node_seq()` trigger — do not reference in migrations
- CSS stylesheets not yet reviewed — not in scope this phase

---

## §2 — INPUTS

No additional files required beyond the brief and this handoff.

Schema changes in this project are applied directly via the Supabase Dashboard SQL Editor.
There is no migrations folder or CLI. The delivered `.sql` file is the migration record.
The operator will run it manually in the SQL Editor.

---

## §3 — DELIVERABLES

Four migrations. One new table. All in a single `.sql` file following the project
naming convention (timestamp prefix + descriptive slug).

---

## §4 — MIGRATION SPEC

### Migration file: `accord-live-capture-substrate.sql`

#### 4.1 — IR47 pre-flight verification queries

Include these as comments at the top of the migration file so any future reader
can re-run them to verify state before applying:

```sql
-- IR47 verification — run before applying this migration
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'accord_nodes'
--   AND column_name IN ('discipline', 'topic');
-- Expected: 0 rows

-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'accord_meetings'
--   AND column_name = 'cloned_from_meeting_id';
-- Expected: 0 rows

-- SELECT table_name FROM information_schema.tables
--   WHERE table_name = 'accord_minutes_recipients';
-- Expected: 0 rows
```

#### 4.2 — `accord_nodes.discipline`

```sql
ALTER TABLE accord_nodes
  ADD COLUMN discipline TEXT NULL;

COMMENT ON COLUMN accord_nodes.discipline IS
  'Knowledge Base top-level grouping (e.g. "Electrical Engineering"). '
  'Free text, Option A. UI for assignment deferred to CMD-ACCORD-KNOWLEDGE-BASE-1. '
  'Nullable; populated post-meeting via Knowledge Base surface.';
```

#### 4.3 — `accord_nodes.topic`

```sql
ALTER TABLE accord_nodes
  ADD COLUMN topic TEXT NULL;

COMMENT ON COLUMN accord_nodes.topic IS
  'Knowledge Base sub-topic within discipline '
  '(e.g. "Adapter Board Thermal Constraints"). '
  'Free text, Option A. Nullable; set alongside discipline.';
```

#### 4.4 — `accord_meetings.cloned_from_meeting_id`

```sql
ALTER TABLE accord_meetings
  ADD COLUMN cloned_from_meeting_id UUID NULL
    REFERENCES accord_meetings(meeting_id);

COMMENT ON COLUMN accord_meetings.cloned_from_meeting_id IS
  'FK -> accord_meetings(meeting_id). '
  'Set when this meeting was cloned from a prior meeting via the Composer tab. '
  'UI deferred to CMD-ACCORD-MEETING-SETUP-1 Composer phase.';
```

#### 4.5 — `accord_minutes_recipients` table

```sql
CREATE TABLE accord_minutes_recipients (
  recipient_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id         UUID        NOT NULL REFERENCES firms(id),
  render_id       UUID        NOT NULL REFERENCES accord_minutes_renders(render_id),
  resource_id     UUID        NULL REFERENCES resources(id),
  external_email  TEXT        NULL,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_minutes_recipient_one_type CHECK (
    (resource_id IS NOT NULL) != (external_email IS NOT NULL)
  )
);

COMMENT ON TABLE accord_minutes_recipients IS
  'Append-only send log for accord_minutes_renders. '
  'One row per recipient per render. '
  'resource_id XOR external_email per chk_minutes_recipient_one_type.';

COMMENT ON COLUMN accord_minutes_recipients.resource_id IS
  'FK -> resources(id). Internal recipient. NULL if external_email is set.';

COMMENT ON COLUMN accord_minutes_recipients.external_email IS
  'External recipient email address. NULL if resource_id is set.';
```

#### 4.6 — RLS for `accord_minutes_recipients`

```sql
ALTER TABLE accord_minutes_recipients ENABLE ROW LEVEL SECURITY;

-- SELECT: any firm member can see recipients for their firm's renders
CREATE POLICY "select_own_firm"
  ON accord_minutes_recipients
  FOR SELECT
  USING (firm_id = my_firm_id());

-- INSERT: any firm member can append a recipient row
CREATE POLICY "insert_own_firm"
  ON accord_minutes_recipients
  FOR INSERT
  WITH CHECK (firm_id = my_firm_id());

-- No UPDATE or DELETE policies — table is append-only by design
```

#### 4.7 — IR47 post-flight verification queries

Include at the bottom of the migration file as comments:

```sql
-- IR47 post-flight — run after applying to confirm
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'accord_nodes'
--   AND column_name IN ('discipline', 'topic');
-- Expected: 2 rows

-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'accord_meetings'
--   AND column_name = 'cloned_from_meeting_id';
-- Expected: 1 row

-- SELECT table_name FROM information_schema.tables
--   WHERE table_name = 'accord_minutes_recipients';
-- Expected: 1 row

-- SELECT COUNT(*) FROM information_schema.table_privileges
--   WHERE table_name = 'accord_minutes_recipients';
-- Expected: > 0 (RLS policies applied)
```

---

## §5 — WHAT THIS PHASE DOES NOT DO

- No surface JS changes
- No accord-capture.js or accord-ledger.js changes
- No changes to existing accord_nodes INSERT paths (discipline/topic are nullable; existing writes are unaffected)
- No CSS changes
- No version.js bump (IR65 fires at CMD seal, Phase 7)

---

## §6 — FILE ORDER

1. `accord-live-capture-substrate.sql` — full migration SQL, ready to paste into Supabase SQL Editor

Then: 3-line summary of what shipped. Then §7 checklist verbatim. Stop.

---

## §7 — PHASE 2 CHECKLIST

- [ ] Migration file named `accord-live-capture-substrate.sql`
- [ ] IR47 pre-flight verification queries present as comments at top of file
- [ ] `accord_nodes.discipline` added with COMMENT ON COLUMN (IR49)
- [ ] `accord_nodes.topic` added with COMMENT ON COLUMN (IR49)
- [ ] `accord_meetings.cloned_from_meeting_id` added with FK and COMMENT ON COLUMN (IR49)
- [ ] `accord_minutes_recipients` table created with correct constraint
- [ ] RLS enabled on `accord_minutes_recipients` — SELECT + INSERT only (append-only)
- [ ] No UPDATE or DELETE policies on `accord_minutes_recipients`
- [ ] IR47 post-flight verification queries present as comments at bottom of file
- [ ] No surface JS changes made
- [ ] No existing INSERT paths touched

---

**Ship it.**
