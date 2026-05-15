# Commission · CMD-ACCORD-DEMO-SEED-1
## Pre-Demo Remediation · ESC Fix + Demo Substrate
## Authored: 2026-05-14 · Architect: Claude

---

You are executing a pre-demo remediation CMD with three mandates:
fix a live ESC regression from C-11, investigate seq_id generation,
then build demonstration-quality substrate for the C-11 Test
Workstream. Read this entire commission before doing anything.
Execute phases in strict sequence — halt-and-surface at each phase
gate before proceeding.

---

## §1 — Phase 1: ESC regression fix (D4 from C-11 close-out)

**Diagnosis first.** Open the Setup shell on the C-11 smoke test
meeting with no percolate filter active. Press ESC. Report what
fires in console and whether any navigation or error occurs.

Then locate `_percolateEscHandler` in `accord-meeting-setup.js`.
Confirm whether `preventDefault()` and `stopPropagation()` are
called unconditionally or only when a filter is active.

**The fix is a one-line guard:**
```javascript
// Only intercept ESC when a filter is active.
// When no filter is active, let ESC propagate to the shell
// navigation handler (X-30/31/32 will wire that handler).
if (!_percolateResourceId) return;
```

That line goes at the top of `_percolateEscHandler`, before any
other logic.

**Deploy and verify:**
- ESC with filter active → filter clears, pill disappears, opacity restores
- ESC with no filter active → no interception, event propagates
  (will fire into void until X-30/31/32 lands — acceptable and expected)

Halt-and-surface with console evidence before proceeding to §2.

---

## §2 — Phase 2: seq_id investigation

Run these four queries in order. Surface all results verbatim
before proceeding to §3.

```sql
-- Q1: triggers on accord_nodes
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'accord_nodes'
ORDER BY trigger_name;
```

```sql
-- Q2: sequences
SELECT sequence_name, start_value, increment_by, last_value
FROM information_schema.sequences
LEFT JOIN pg_sequences ON sequencename = sequence_name
WHERE sequence_name ILIKE '%node%'
   OR sequence_name ILIKE '%seq%'
   OR sequence_name ILIKE '%accord%';
```

```sql
-- Q3: seq_id column default
SELECT column_name, column_default, data_type
FROM information_schema.columns
WHERE table_name = 'accord_nodes'
AND column_name IN ('seq_id', 'node_id');
```

```sql
-- Q4: current seq_id values in C-11 workstream
SELECT n.seq_id, n.tag, n.summary, m.title
FROM accord_nodes n
JOIN accord_meetings m ON m.meeting_id = n.meeting_id
WHERE m.workstream_id = 'c1100000-0000-0000-0000-000000000001'
ORDER BY n.seq_id;
```

Do not insert any nodes until seq_id strategy is confirmed with
the operator. Halt-and-surface.

---

## §3 — Phase 3: Demo substrate

### §3.0 — Clear existing thin nodes

After seq_id strategy is confirmed, delete the existing C-11 nodes:

```sql
DELETE FROM accord_nodes
WHERE meeting_id IN (
  'c1100000-0000-0000-1111-000000000001',
  'c1100000-0000-0000-1111-000000000002',
  'c1100000-0000-0000-1111-000000000003',
  'c1100000-0000-0000-1111-000000000004'
);
```

Verify zero rows remain:
```sql
SELECT COUNT(*) FROM accord_nodes
WHERE meeting_id IN (
  'c1100000-0000-0000-1111-000000000001',
  'c1100000-0000-0000-1111-000000000002',
  'c1100000-0000-0000-1111-000000000003',
  'c1100000-0000-0000-1111-000000000004'
);
```

### §3.1 — Identity constants

```
FIRM_ID            = aaaaaaaa-0001-0001-0001-000000000001

Vaughn Staples     resource = e1000001-0000-0000-0000-000000000001
                   user     = 57b93738-6a2a-4098-ba12-bfffd1f7dd07

Angela Kim         resource = c40b70c7-71db-4238-82d1-0701e11ebe47
                   user     = 0db33955-f6a0-49ae-ad4b-c5cdfacf34c8

Ron White          resource = e1000001-0000-0000-0000-000000000004
                   user     = f3947e77-73f2-4b39-80dc-b80323a1b723
                   (zero substrate — attendee on idle meeting only)
```

### §3.2 — Node distribution spec

| Meeting | Tag | Author | Detail |
|---|---|---|---|
| M1 · Kickoff (60d) | note | Vaughn | Objectives confirmed |
| M1 · Kickoff (60d) | decision | Vaughn | Phased delivery adopted (sealed) |
| M1 · Kickoff (60d) | note | Angela | Vendor dependency flagged |
| M2 · Review (45d) | action | Angela | Vendor confirmation — **overdue** |
| M2 · Review (45d) | risk | Angela | Vendor delay risk — no mitigation |
| M2 · Review (45d) | dissent | Angela | Phase 1 timeline premature |
| M2 · Review (45d) | decision | Angela | Proceed with internal spec in parallel |
| M3 · Decision Gate (30d) | action | Vaughn | Vendor alignment call — **complete** |
| M3 · Decision Gate (30d) | action | Angela | Deliver component spec — **overdue** |
| M3 · Decision Gate (30d) | decision | Vaughn | Adopt revised spec — awaiting Angela |
| M3 · Decision Gate (30d) | note | Angela | Spec 80% complete, blocked on vendor API |
| M4 · Action Review (14d) | action | Vaughn | Follow up on API docs — **complete** |
| M4 · Action Review (14d) | note | Vaughn | Vendor confirmed API docs releasing EOW |
| M4 · Action Review (14d) | note | Angela | Will complete spec within 48h of docs |

Total: 14 nodes across 4 meetings.

### §3.3 — Insert all 14 nodes in a single transaction

Insert in strict chronological order so seq_id values tell a
coherent story.

```sql
BEGIN;

-- M1 · Kickoff (60d ago) ----------------------------------------

INSERT INTO accord_nodes
  (node_id, firm_id, meeting_id, tag, summary, created_by, created_at)
VALUES (
  'c1100000-0000-0000-2222-000000000101',
  'aaaaaaaa-0001-0001-0001-000000000001',
  'c1100000-0000-0000-1111-000000000001',
  'note',
  'Workstream objectives confirmed with all stakeholders present. Engineering capacity allocated for Q2.',
  '57b93738-6a2a-4098-ba12-bfffd1f7dd07',
  now() - interval '60 days' + interval '15 minutes'
);

INSERT INTO accord_nodes
  (node_id, firm_id, meeting_id, tag, summary, created_by, created_at)
VALUES (
  'c1100000-0000-0000-2222-000000000102',
  'aaaaaaaa-0001-0001-0001-000000000001',
  'c1100000-0000-0000-1111-000000000001',
  'decision',
  'Adopt phased delivery model — Phase 1 scope frozen. Vaughn accountable.',
  '57b93738-6a2a-4098-ba12-bfffd1f7dd07',
  now() - interval '60 days' + interval '30 minutes'
);

INSERT INTO accord_nodes
  (node_id, firm_id, meeting_id, tag, summary, created_by, created_at)
VALUES (
  'c1100000-0000-0000-2222-000000000103',
  'aaaaaaaa-0001-0001-0001-000000000001',
  'c1100000-0000-0000-1111-000000000001',
  'note',
  'Angela flagged dependency on external vendor confirmation before Phase 1 can begin.',
  '0db33955-f6a0-49ae-ad4b-c5cdfacf34c8',
  now() - interval '60 days' + interval '45 minutes'
);

-- M2 · Review (45d ago) -----------------------------------------

INSERT INTO accord_nodes
  (node_id, firm_id, meeting_id, tag, summary,
   created_by, due_date, created_at)
VALUES (
  'c1100000-0000-0000-2222-000000000201',
  'aaaaaaaa-0001-0001-0001-000000000001',
  'c1100000-0000-0000-1111-000000000002',
  'action',
  'Angela: Obtain written confirmation from vendor on delivery timeline.',
  '0db33955-f6a0-49ae-ad4b-c5cdfacf34c8',
  now() - interval '30 days',
  now() - interval '45 days' + interval '20 minutes'
);

INSERT INTO accord_nodes
  (node_id, firm_id, meeting_id, tag, summary, created_by, created_at)
VALUES (
  'c1100000-0000-0000-2222-000000000202',
  'aaaaaaaa-0001-0001-0001-000000000001',
  'c1100000-0000-0000-1111-000000000002',
  'risk',
  'Vendor confirmation delay may push Phase 1 start by 2–3 weeks. No mitigation agreed.',
  '0db33955-f6a0-49ae-ad4b-c5cdfacf34c8',
  now() - interval '45 days' + interval '25 minutes'
);

INSERT INTO accord_nodes
  (node_id, firm_id, meeting_id, tag, summary,
   created_by, dissented_by, dissent_rationale, created_at)
VALUES (
  'c1100000-0000-0000-2222-000000000203',
  'aaaaaaaa-0001-0001-0001-000000000001',
  'c1100000-0000-0000-1111-000000000002',
  'dissent',
  'Angela dissents on Phase 1 timeline: vendor dependency not resolved, commitment is premature.',
  '0db33955-f6a0-49ae-ad4b-c5cdfacf34c8',
  '0db33955-f6a0-49ae-ad4b-c5cdfacf34c8',
  'We cannot commit to a Phase 1 start date until the vendor confirms capacity. The current timeline assumes confirmation that has not arrived.',
  now() - interval '45 days' + interval '40 minutes'
);

INSERT INTO accord_nodes
  (node_id, firm_id, meeting_id, tag, summary, created_by, created_at)
VALUES (
  'c1100000-0000-0000-2222-000000000204',
  'aaaaaaaa-0001-0001-0001-000000000001',
  'c1100000-0000-0000-1111-000000000002',
  'decision',
  'Proceed with internal spec work in parallel while vendor confirmation is pending. Angela to lead.',
  '0db33955-f6a0-49ae-ad4b-c5cdfacf34c8',
  now() - interval '45 days' + interval '50 minutes'
);

-- M3 · Decision Gate (30d ago) ----------------------------------

INSERT INTO accord_nodes
  (node_id, firm_id, meeting_id, tag, summary,
   created_by, due_date, status, created_at)
VALUES (
  'c1100000-0000-0000-2222-000000000301',
  'aaaaaaaa-0001-0001-0001-000000000001',
  'c1100000-0000-0000-1111-000000000003',
  'action',
  'Vaughn: Schedule vendor alignment call and circulate agenda in advance.',
  '57b93738-6a2a-4098-ba12-bfffd1f7dd07',
  now() - interval '14 days',
  'complete',
  now() - interval '30 days' + interval '15 minutes'
);

INSERT INTO accord_nodes
  (node_id, firm_id, meeting_id, tag, summary,
   created_by, due_date, created_at)
VALUES (
  'c1100000-0000-0000-2222-000000000302',
  'aaaaaaaa-0001-0001-0001-000000000001',
  'c1100000-0000-0000-1111-000000000003',
  'action',
  'Angela: Deliver completed component spec to engineering for review.',
  '0db33955-f6a0-49ae-ad4b-c5cdfacf34c8',
  now() - interval '7 days',
  now() - interval '30 days' + interval '20 minutes'
);

INSERT INTO accord_nodes
  (node_id, firm_id, meeting_id, tag, summary, created_by, created_at)
VALUES (
  'c1100000-0000-0000-2222-000000000303',
  'aaaaaaaa-0001-0001-0001-000000000001',
  'c1100000-0000-0000-1111-000000000003',
  'decision',
  'Adopt revised component spec as Phase 1 baseline — pending Angela sign-off.',
  '57b93738-6a2a-4098-ba12-bfffd1f7dd07',
  now() - interval '30 days' + interval '35 minutes'
);

INSERT INTO accord_nodes
  (node_id, firm_id, meeting_id, tag, summary, created_by, created_at)
VALUES (
  'c1100000-0000-0000-2222-000000000304',
  'aaaaaaaa-0001-0001-0001-000000000001',
  'c1100000-0000-0000-1111-000000000003',
  'note',
  'Angela confirmed spec is 80% complete. Remaining 20% blocked on vendor API documentation.',
  '0db33955-f6a0-49ae-ad4b-c5cdfacf34c8',
  now() - interval '30 days' + interval '40 minutes'
);

-- M4 · Action Review (14d ago) ----------------------------------

INSERT INTO accord_nodes
  (node_id, firm_id, meeting_id, tag, summary,
   created_by, due_date, status, created_at)
VALUES (
  'c1100000-0000-0000-2222-000000000401',
  'aaaaaaaa-0001-0001-0001-000000000001',
  'c1100000-0000-0000-1111-000000000004',
  'action',
  'Vaughn: Follow up with vendor on API documentation release date.',
  '57b93738-6a2a-4098-ba12-bfffd1f7dd07',
  now() - interval '3 days',
  'complete',
  now() - interval '14 days' + interval '10 minutes'
);

INSERT INTO accord_nodes
  (node_id, firm_id, meeting_id, tag, summary, created_by, created_at)
VALUES (
  'c1100000-0000-0000-2222-000000000402',
  'aaaaaaaa-0001-0001-0001-000000000001',
  'c1100000-0000-0000-1111-000000000004',
  'note',
  'Vendor confirmed API docs will be released by end of week. Angela unblocked to complete spec.',
  '57b93738-6a2a-4098-ba12-bfffd1f7dd07',
  now() - interval '14 days' + interval '20 minutes'
);

INSERT INTO accord_nodes
  (node_id, firm_id, meeting_id, tag, summary, created_by, created_at)
VALUES (
  'c1100000-0000-0000-2222-000000000403',
  'aaaaaaaa-0001-0001-0001-000000000001',
  'c1100000-0000-0000-1111-000000000004',
  'note',
  'Angela: Will complete spec within 48 hours of receiving vendor docs. Review meeting to follow.',
  '0db33955-f6a0-49ae-ad4b-c5cdfacf34c8',
  now() - interval '14 days' + interval '25 minutes'
);

COMMIT;
```

### §3.4 — Verify node insertion

```sql
SELECT n.tag, n.seq_id, n.summary, r.name AS author, m.title AS meeting
FROM accord_nodes n
JOIN accord_meetings m ON m.meeting_id = n.meeting_id
JOIN resources r ON r.id::text = n.created_by::text
WHERE m.workstream_id = 'c1100000-0000-0000-0000-000000000001'
ORDER BY n.created_at;
```

Expected: 14 rows in chronological order.
Surface the actual seq_id values assigned — document in close-out.

---

## §4 — Phase 4: Note (N-xxx) display verification

After seeding, navigate to the idle meeting and open the Briefing
column. Confirm note nodes appear in the Prior Actions block.

If notes do not surface, locate `_fetchPriorActionsSummary` in
`accord-meeting-setup.js`. Check the tag filter — likely
`tag=eq.action`. Extend to `tag=in.(action,note)`.

Surface finding and fix before close-out. Deploy and verify notes
appear for both Angela and Vaughn.

---

## §5 — Phase 5: ST-1 through ST-11 re-run

Run all 11 smoke tests against the enriched substrate.

With 14 nodes seeded, expected behavior:

| ST | Expected with enriched substrate |
|---|---|
| ST-1 | Angela's 2 actions + 1 risk + 3 notes rise; Vaughn and Ron items fade |
| ST-2 | Pill renders "Filtered: Angela Kim ✕" |
| ST-3 | Dismiss restores all items, full opacity |
| ST-4 | Outcome owner chip (Angela RESOLVE) fires percolate |
| ST-5 | Action card owner chip (Angela overdue action) fires percolate |
| ST-6 | Switch Angela → Vaughn; Vaughn's 2 actions + 2 decisions + 2 notes rise |
| ST-7 | Second click on Vaughn toggles off |
| ST-8 | Ron — all fade, Ron card raises, nothing rises, no error |
| ST-9 | ESC clears active filter |
| ST-10 | FULL PASS — Angela's D002 decision now rises under her filter |
| ST-11 | ESC with no filter active — no interception, event propagates |

All 11 must pass. Fewer than 11 confirmed passes = protocol violation per §6.

---

## §6 — Close-out deliverables

1. ESC fix confirmed (console evidence)
2. seq_id generation mechanism confirmed (trigger / sequence / application-level)
3. Actual seq_id values for all 14 nodes (table: tag · seq_id · summary · author)
4. Note display fix — confirmed applied or confirmed not needed
5. ST-1 through ST-11 results table with PASS/FAIL/notes
6. File change manifest (ESC fix + note display fix if applied)
7. Teardown reminder for post-demo cleanup:

```sql
DELETE FROM workstreams
WHERE workstream_id = 'c1100000-0000-0000-0000-000000000001';
```

---

## §7 — What this CMD does NOT do

- Does not modify seq_id generation mechanism (investigation only)
- Does not reset global seq_id counter
- Does not touch any files other than `accord-meeting-setup.js`
- Does not seed Ron with any substrate (zero activity is intentional for ST-8)
- Does not add agenda item owner_resource_id column (deferred per C-11 D1)

---

## §8 — Iron Rules in force

IR 36, 37, 40, 64, 65, 66, 67, 68, 69, 70, 71, 72.
var only — no let or const.
Console-first diagnosis before any file change.
One diagnostic at a time.
Halt-and-surface at every phase gate.

Proceed to §1.
