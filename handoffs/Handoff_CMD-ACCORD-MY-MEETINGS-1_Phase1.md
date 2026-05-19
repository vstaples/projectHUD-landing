# HANDOFF — CMD-ACCORD-MY-MEETINGS-1 · Phase 1: Investigation

**Date:** 2026-05-19
**CMD:** MM-01 · CMD-ACCORD-MY-MEETINGS-1
**Operator:** Vaughn Staples
**Phase:** 1 of 4 — Investigation only. No code changes.

---

## §0 — PRE-FLIGHT

Read `Brief_CMD-ACCORD-MY-MEETINGS-1.md` end-to-end before proceeding.
Session protocol: terse mode; Test Mode after each code update.
Iron Rules 36, 40 §1, 47, 64, 72 apply.
This phase produces written findings only. No code. No proposals.
Deliver in §6 findings format, then §7 checklist verbatim. Stop.

---

## §1 — INPUTS

| File | Purpose |
|------|---------|
| `accord-views.js` | MY MEETINGS tab handler — confirm entry point |
| `accord-constellation.js` | Alternate location for tab handler |
| `accord-my-meetings.js` | Check if already exists |

---

## §2 — INVESTIGATION ITEMS

**Item 1 — MY MEETINGS tab click handler**
Search `accord-views.js` and `accord-constellation.js` for the MY MEETINGS
tab click handler. Confirm:
- Which file handles it
- What it currently renders (stub, nothing, or existing content)
- The host element it writes into
- Whether `AccordMyMeetings` is already referenced anywhere

**Item 2 — IR47: `accord_meetings.organizer_id` type**
Run in Supabase SQL Editor:
```sql
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'accord_meetings'
AND column_name = 'organizer_id';
```
Also run:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'resources'
AND column_name IN ('id', 'user_id');
```
Determine: is `organizer_id` an `auth.users.id` (compared with `auth.uid()`)
or a `resources.id`? This is critical for the self-filter query.

**Item 3 — `accord_meeting_attendees.resource_id` type**
Confirm `accord_meeting_attendees.resource_id` references `resources.id`
(not `auth.users.id`). This controls avatar resolution.
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'accord_meeting_attendees'
AND column_name IN ('resource_id', 'attendee_id');
```

**Item 4 — `accord_meetings.stakes` column**
Run:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'accord_meetings'
AND column_name = 'stakes';
```
If absent: stakes line cannot be rendered — note in findings.
Stakes was added in CMD-ACCORD-SETUP-HEADER-1 but may not be deployed yet.

**Item 5 — `accord-my-meetings.js` existence**
Check whether `accord-my-meetings.js` already exists in the codebase.
If it exists, read its public API and note what's already built.
If it doesn't exist, confirm this is a new file.

**Item 6 — MY MEETINGS tab badge count**
The mockup shows a badge count on the MY MEETINGS tab.
Search for any existing badge count logic on the MY MEETINGS tab.
Confirm whether the current tab renders a count or is bare text.

---

## §3 — HALT-AND-SURFACE CONDITIONS

Stop and surface if:
1. `organizer_id` type is ambiguous — cannot determine whether to compare
   with `auth.uid()` or a resource ID without operator clarification.
2. `accord-my-meetings.js` exists and has substantial existing logic that
   conflicts with the brief — describe the conflict.

---

## §4 — OUTPUT FORMAT

```
### Item N — [name]
**Finding:** [1-3 sentences]
**Query result / file / line:** [reference]
**Traps:** [or "none"]
```

Phase 1 summary (3-5 sentences). Then §7 checklist. Stop.

---

## §6 — FINDINGS FORMAT

### Item 1 — MY MEETINGS tab click handler
### Item 2 — IR47: organizer_id type
### Item 3 — accord_meeting_attendees.resource_id type
### Item 4 — accord_meetings.stakes column
### Item 5 — accord-my-meetings.js existence
### Item 6 — MY MEETINGS tab badge count

### Phase 1 summary

---

## §7 — PHASE 1 CHECKLIST

- [ ] All 6 items addressed
- [ ] IR47: organizer_id type confirmed or halted
- [ ] resource_id type confirmed
- [ ] stakes column existence confirmed
- [ ] accord-my-meetings.js existence confirmed
- [ ] No code written
- [ ] Phase 1 summary written (≤5 sentences)

---

**Ship it.**
