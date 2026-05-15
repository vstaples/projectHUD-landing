# C-11 · §4 Amendment — Mandatory Substrate Seeding
## Replaces §4 of C-11_commission-cmd-accord-setup-percolate-1.md
## Authored: 2026-05-14 · Architect: Claude

---

## §4 — Phase 2: Mandatory substrate seeding

**This phase is non-negotiable. All 11 smoke tests run against
this seeded data. Do not use pre-existing meeting data. Do not
skip or abbreviate this phase. Do not ask the operator to confirm
prior meeting counts — create everything from scratch.**

The seeding creates a hermetically sealed test environment with
known UUIDs. Every smoke test references these constants by name.

---

### §4.0 — Identity constants

```
FIRM_ID = aaaaaaaa-0001-0001-0001-000000000001

-- Vaughn Staples (Organizer + "Sarah" profile: clean substrate)
VAUGHN_RESOURCE_ID = e1000001-0000-0000-0000-000000000001
VAUGHN_USER_ID     = 57b93738-6a2a-4098-ba12-bfffd1f7dd07

-- Angela Kim ("Tom" profile: heavy substrate)
ANGELA_RESOURCE_ID = c40b70c7-71db-4238-82d1-0701e11ebe47
ANGELA_USER_ID     = 0db33955-f6a0-49ae-ad4b-c5cdfacf34c8

-- Ron White ("Marcus" profile: zero substrate activity)
RON_RESOURCE_ID    = e1000001-0000-0000-0000-000000000004
RON_USER_ID        = f3947e77-73f2-4b39-80dc-b80323a1b723
```

**Profile mapping for smoke tests:**
- ST-1/4/5 — click Angela (heavy substrate, items should rise)
- ST-6     — switch to Vaughn (clean, items rise, Angela clears)
- ST-7     — click Vaughn again (toggle off)
- ST-8     — click Ron (zero activity, nothing rises, all fade)

---

### §4.1 — Seed Step 1: Create the test workstream

```sql
INSERT INTO workstreams
  (workstream_id, firm_id, name, state, created_at)
VALUES
  ('c1100000-0000-0000-0000-000000000001',
   'aaaaaaaa-0001-0001-0001-000000000001',
   'C-11 Test Workstream',
   'active',
   now() - interval '90 days');
```

Verify:
```sql
SELECT workstream_id, name, state
FROM workstreams
WHERE workstream_id = 'c1100000-0000-0000-0000-000000000001';
```
Expected: 1 row.

---

### §4.2 — Seed Step 2: Create 4 prior closed meetings

These supply the Briefing column's prior actions and prior
decisions blocks. Insert directly as closed state.

```sql
INSERT INTO accord_meetings
  (meeting_id, firm_id, workstream_id, title, state,
   organizer_id, scheduled_for, started_at, ended_at,
   sealed_at, created_at)
VALUES
  ('c1100000-0000-0000-1111-000000000001',
   'aaaaaaaa-0001-0001-0001-000000000001',
   'c1100000-0000-0000-0000-000000000001',
   'C-11 Prior Meeting 1 · Kickoff',
   'closed',
   '57b93738-6a2a-4098-ba12-bfffd1f7dd07',
   now() - interval '60 days',
   now() - interval '60 days' + interval '5 minutes',
   now() - interval '60 days' + interval '65 minutes',
   now() - interval '60 days' + interval '65 minutes',
   now() - interval '60 days'),

  ('c1100000-0000-0000-1111-000000000002',
   'aaaaaaaa-0001-0001-0001-000000000001',
   'c1100000-0000-0000-0000-000000000001',
   'C-11 Prior Meeting 2 · Review',
   'closed',
   '57b93738-6a2a-4098-ba12-bfffd1f7dd07',
   now() - interval '45 days',
   now() - interval '45 days' + interval '5 minutes',
   now() - interval '45 days' + interval '65 minutes',
   now() - interval '45 days' + interval '65 minutes',
   now() - interval '45 days'),

  ('c1100000-0000-0000-1111-000000000003',
   'aaaaaaaa-0001-0001-0001-000000000001',
   'c1100000-0000-0000-0000-000000000001',
   'C-11 Prior Meeting 3 · Decision Gate',
   'closed',
   '57b93738-6a2a-4098-ba12-bfffd1f7dd07',
   now() - interval '30 days',
   now() - interval '30 days' + interval '5 minutes',
   now() - interval '30 days' + interval '65 minutes',
   now() - interval '30 days' + interval '65 minutes',
   now() - interval '30 days'),

  ('c1100000-0000-0000-1111-000000000004',
   'aaaaaaaa-0001-0001-0001-000000000001',
   'c1100000-0000-0000-0000-000000000001',
   'C-11 Prior Meeting 4 · Action Review',
   'closed',
   '57b93738-6a2a-4098-ba12-bfffd1f7dd07',
   now() - interval '14 days',
   now() - interval '14 days' + interval '5 minutes',
   now() - interval '14 days' + interval '65 minutes',
   now() - interval '14 days' + interval '65 minutes',
   now() - interval '14 days');
```

---

### §4.3 — Seed Step 3: Create the target IDLE meeting

This is the meeting the Setup shell opens for all smoke tests.

```sql
INSERT INTO accord_meetings
  (meeting_id, firm_id, workstream_id, title, state,
   organizer_id, scheduled_for, duration_minutes, created_at)
VALUES
  ('c1100000-0000-0000-1111-000000000005',
   'aaaaaaaa-0001-0001-0001-000000000001',
   'c1100000-0000-0000-0000-000000000001',
   'C-11 Percolate Smoke Test Meeting',
   'idle',
   '57b93738-6a2a-4098-ba12-bfffd1f7dd07',
   now() + interval '2 days',
   60,
   now());
```

---

### §4.4 — Seed Step 4: Attendees for the idle meeting

```sql
INSERT INTO accord_meeting_attendees
  (attendee_id, firm_id, meeting_id, resource_id,
   role_in_meeting, rsvp_status)
VALUES
  ('c1100000-0000-0000-5555-000000000001',
   'aaaaaaaa-0001-0001-0001-000000000001',
   'c1100000-0000-0000-1111-000000000005',
   'e1000001-0000-0000-0000-000000000001',
   'organizer', 'accepted'),

  ('c1100000-0000-0000-5555-000000000002',
   'aaaaaaaa-0001-0001-0001-000000000001',
   'c1100000-0000-0000-1111-000000000005',
   'c40b70c7-71db-4238-82d1-0701e11ebe47',
   'participant', 'accepted'),

  ('c1100000-0000-0000-5555-000000000003',
   'aaaaaaaa-0001-0001-0001-000000000001',
   'c1100000-0000-0000-1111-000000000005',
   'e1000001-0000-0000-0000-000000000004',
   'participant', 'accepted');
```

---

### §4.5 — Seed Step 5: Nodes in prior meetings

Angela's overdue action (Meeting 4 — most recent prior):
```sql
INSERT INTO accord_nodes
  (node_id, firm_id, meeting_id, tag, summary,
   created_by, due_date, created_at)
VALUES
  ('c1100000-0000-0000-2222-000000000001',
   'aaaaaaaa-0001-0001-0001-000000000001',
   'c1100000-0000-0000-1111-000000000004',
   'action',
   'Angela: Deliver component spec to engineering (C-11 test)',
   '0db33955-f6a0-49ae-ad4b-c5cdfacf34c8',
   now() - interval '7 days',
   now() - interval '14 days');
```

Vaughn's completed action #1 (Meeting 3):
```sql
INSERT INTO accord_nodes
  (node_id, firm_id, meeting_id, tag, summary,
   created_by, due_date, status, created_at)
VALUES
  ('c1100000-0000-0000-2222-000000000002',
   'aaaaaaaa-0001-0001-0001-000000000001',
   'c1100000-0000-0000-1111-000000000003',
   'action',
   'Vaughn: Schedule vendor review (C-11 test)',
   '57b93738-6a2a-4098-ba12-bfffd1f7dd07',
   now() - interval '7 days',
   'complete',
   now() - interval '30 days');
```

Vaughn's completed action #2 (Meeting 2):
```sql
INSERT INTO accord_nodes
  (node_id, firm_id, meeting_id, tag, summary,
   created_by, due_date, status, created_at)
VALUES
  ('c1100000-0000-0000-2222-000000000003',
   'aaaaaaaa-0001-0001-0001-000000000001',
   'c1100000-0000-0000-1111-000000000002',
   'action',
   'Vaughn: Circulate draft brief to stakeholders (C-11 test)',
   '57b93738-6a2a-4098-ba12-bfffd1f7dd07',
   now() - interval '21 days',
   'complete',
   now() - interval '45 days');
```

Decision awaiting Angela's input (Meeting 3):
```sql
INSERT INTO accord_nodes
  (node_id, firm_id, meeting_id, tag, summary,
   created_by, created_at)
VALUES
  ('c1100000-0000-0000-2222-000000000004',
   'aaaaaaaa-0001-0001-0001-000000000001',
   'c1100000-0000-0000-1111-000000000003',
   'decision',
   'Adopt revised component spec — awaiting Angela confirmation (C-11 test)',
   '57b93738-6a2a-4098-ba12-bfffd1f7dd07',
   now() - interval '30 days');
```

Dissent node by Angela (Meeting 2):
```sql
INSERT INTO accord_nodes
  (node_id, firm_id, meeting_id, tag, summary,
   created_by, dissented_by, dissent_rationale, created_at)
VALUES
  ('c1100000-0000-0000-2222-000000000005',
   'aaaaaaaa-0001-0001-0001-000000000001',
   'c1100000-0000-0000-1111-000000000002',
   'dissent',
   'Angela dissents: timeline not achievable given current capacity (C-11 test)',
   '0db33955-f6a0-49ae-ad4b-c5cdfacf34c8',
   '0db33955-f6a0-49ae-ad4b-c5cdfacf34c8',
   'Resource allocation has not been confirmed for Q3.',
   now() - interval '45 days');
```

---

### §4.6 — Seed Step 6: Outcomes for the idle meeting

The `accord_meeting_outcomes` state gate requires parent meeting
`state = 'idle'`. The Meeting 5 (Step 3) satisfies this.

```sql
INSERT INTO accord_meeting_outcomes
  (outcome_id, firm_id, meeting_id, verb, description,
   owner_resource_id, status, position, created_at)
VALUES
  ('c1100000-0000-0000-3333-000000000001',
   'aaaaaaaa-0001-0001-0001-000000000001',
   'c1100000-0000-0000-1111-000000000005',
   'RESOLVE',
   'Resolve open spec dissent — Angela to confirm or escalate (C-11 test)',
   'c40b70c7-71db-4238-82d1-0701e11ebe47',
   'open', 1, now()),

  ('c1100000-0000-0000-3333-000000000002',
   'aaaaaaaa-0001-0001-0001-000000000001',
   'c1100000-0000-0000-1111-000000000005',
   'DECIDE',
   'Decide on vendor selection — Vaughn to present recommendation (C-11 test)',
   'e1000001-0000-0000-0000-000000000001',
   'open', 2, now());
```

---

### §4.7 — Seed Step 7: Agenda items for the idle meeting

```sql
INSERT INTO accord_agenda_items
  (agenda_item_id, firm_id, meeting_id, title,
   item_type, position, status,
   pulled_from_node_id, created_at)
VALUES
  ('c1100000-0000-0000-4444-000000000001',
   'aaaaaaaa-0001-0001-0001-000000000001',
   'c1100000-0000-0000-1111-000000000005',
   'Resolve Angela dissent on component timeline (C-11 test)',
   'DECIDE', 1, 'pending',
   'c1100000-0000-0000-2222-000000000005',
   now()),

  ('c1100000-0000-0000-4444-000000000002',
   'aaaaaaaa-0001-0001-0001-000000000001',
   'c1100000-0000-0000-1111-000000000005',
   'Review vendor shortlist and select final candidate (C-11 test)',
   'DECIDE', 2, 'pending',
   NULL,
   now());
```

---

### §4.8 — Seeding verification (run all 5 before proceeding)

```sql
-- V1: workstream
SELECT workstream_id, name FROM workstreams
WHERE workstream_id = 'c1100000-0000-0000-0000-000000000001';
-- Expected: 1 row

-- V2: all 5 meetings
SELECT state, title FROM accord_meetings
WHERE workstream_id = 'c1100000-0000-0000-0000-000000000001'
ORDER BY created_at;
-- Expected: 5 rows (4 closed + 1 idle)

-- V3: attendees
SELECT r.name, a.role_in_meeting
FROM accord_meeting_attendees a
JOIN resources r ON r.id = a.resource_id
WHERE a.meeting_id = 'c1100000-0000-0000-1111-000000000005';
-- Expected: 3 rows (Vaughn organizer, Angela participant, Ron participant)

-- V4: prior nodes
SELECT tag, summary FROM accord_nodes
WHERE meeting_id IN (
  'c1100000-0000-0000-1111-000000000001',
  'c1100000-0000-0000-1111-000000000002',
  'c1100000-0000-0000-1111-000000000003',
  'c1100000-0000-0000-1111-000000000004')
ORDER BY tag, created_at;
-- Expected: 5 rows (3 action, 1 decision, 1 dissent)

-- V5: outcomes and agenda items
SELECT 'outcome' AS type, description AS label FROM accord_meeting_outcomes
WHERE meeting_id = 'c1100000-0000-0000-1111-000000000005'
UNION ALL
SELECT 'agenda', title FROM accord_agenda_items
WHERE meeting_id = 'c1100000-0000-0000-1111-000000000005'
ORDER BY type;
-- Expected: 4 rows (2 outcomes + 2 agenda items)
```

**All 5 must return expected counts. Halt-and-surface on any mismatch.**

---

### §4.9 — Navigate to the smoke test meeting

After all verifications pass:

```javascript
window.Accord.setLevel('meeting', {
  meetingId:    'c1100000-0000-0000-1111-000000000005',
  workstreamId: 'c1100000-0000-0000-0000-000000000001'
});
```

The Setup shell must render with:
- 3 attendee cards: Vaughn (organizer/YOU), Angela, Ron
- 2 outcomes: Angela RESOLVE, Vaughn DECIDE
- 2 agenda items
- Briefing column: prior actions (Angela overdue, Vaughn ×2 complete),
  prior decisions (1 decision, 1 dissent)

Confirm this visually before writing any code. If any panel is
empty or missing, halt-and-surface — do not proceed to coding
with incomplete substrate visibility.

---

### §4.10 — Teardown (after C-11 is sealed)

```sql
DELETE FROM workstreams
WHERE workstream_id = 'c1100000-0000-0000-0000-000000000001';
```

CASCADE deletes remove all 5 meetings, 3 attendee rows, 5 nodes,
2 outcomes, 2 agenda items in one operation.

---

*End §4 Amendment · C-11 · CMD-ACCORD-SETUP-PERCOLATE-1*
*Replace §4 of the commission brief with this document before
handing off to the coding agent.*
