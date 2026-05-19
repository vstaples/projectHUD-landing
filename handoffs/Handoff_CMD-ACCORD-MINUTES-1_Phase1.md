# HANDOFF — CMD-ACCORD-MINUTES-1 · Phase 1: Investigation

**Date:** 2026-05-19
**CMD:** M-01 · CMD-ACCORD-MINUTES-1
**Operator:** Vaughn Staples
**Phase:** 1 of 6 — Investigation only. No code changes.

---

## §0 — PRE-FLIGHT

Read `Brief_CMD-ACCORD-MINUTES-1.md` end-to-end before proceeding.
Session protocol: (1) Terse mode — only communicate what is necessary;
no reasoning, no diagnostics. (2) Begin session by testing Claude in Chrome
connection. (3) After each code update enter Test Mode — one checklist item
at a time. (4) Browser debugging not reliably available — work from console
pastes if needed.
Iron Rules 36, 40 §1, 47, 64, 72 apply.
This phase produces written findings only. Do not write, edit, or propose
any code. Deliver in §6 findings format, then §7 checklist verbatim. Stop.

---

## §1 — INPUTS

Request the following files from the operator:

| File | Purpose |
|------|---------|
| `accord-views.js` | Confirm closed-state branch swap point |
| `accord-live-capture.js` | Reference — Phase 3 swap point pattern |
| `accord-capture.js` | IR72 survey — closed-state event consumers |
| `accord-core.js` | IR72 survey — level-changed dispatch on close |

---

## §2 — INVESTIGATION ITEMS

**Item 1 — Closed-state swap point**
In `accord-views.js:renderMeetingView()` at the state branch (~line 394):
Confirm the exact branch for `state='closed'`.
State: what currently renders for a closed meeting (5-tab shell or other).
Confirm the new `AccordMinutes.render()` call can be inserted at this point
with no surgery beyond the branch addition.

**Item 2 — `accord_minutes_renders` schema (IR47)**
Run in Supabase SQL Editor:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'accord_minutes_renders'
ORDER BY ordinal_position;
```
Report exact column list. Confirm whether a plain status-row INSERT is
sufficient for v1 or whether any NOT NULL columns require PDF pipeline data.
This is a potential halt-and-surface condition — see §3.

**Item 3 — `accord_minutes_recipients` schema (IR47)**
Run in Supabase SQL Editor:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'accord_minutes_recipients'
ORDER BY ordinal_position;
```
Report exact column list. Confirm RLS policies:
```sql
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'accord_minutes_recipients';
```

**Item 4 — `accord_meeting_outcomes.status` constraint (IR47)**
Run:
```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'accord_meeting_outcomes'::regclass
AND contype = 'c';
```
Report valid status values. Confirm `open|achieved|partial|carried|abandoned`
or surface actual values.

**Item 5 — `accord_nodes.tag` constraint (IR47)**
Run:
```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'accord_nodes'::regclass
AND contype = 'c'
AND conname ILIKE '%tag%';
```
Confirm tag values. Cross-check with Live Capture Phase 4 finding:
`note|decision|action|risk|question|dissent`. Surface any discrepancy.

**Item 6 — `accord_meeting_attendees` columns (IR47)**
Run:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'accord_meeting_attendees'
ORDER BY ordinal_position;
```
Confirm: `resource_id`, `rsvp_status`, and any additional columns needed
for recipient pre-population (name resolution path).

**Item 7 — IR72 cross-module survey**
Search `accord-capture.js` and `accord-core.js` for any event dispatch
or subscription that fires on `state='closed'` or on `accord:level-changed`
when transitioning away from a closed meeting.
List each event, its dispatch site, and any known subscribers.
The Minutes surface must not break any of these contracts.

**Item 8 — `accord_minutes_renders` INSERT requirements**
From the schema found in Item 2: identify any NOT NULL columns that are
not derivable from meeting data alone (e.g. `storage_path`, `content_hash`,
`merkle_root_at_render`, `byte_size`, `page_count`).
If any such columns exist and have no DEFAULT: this is a **halt-and-surface
condition** — v1 cannot INSERT a render record without a PDF pipeline.
Proposed resolution: INSERT with `status='pending'` and NULL for
pipeline-derived columns, if the schema permits.

**Item 9 — CSS token conflicts**
From `accord-live-capture.js`: confirm the Minutes surface can reuse the
same Outfit font + Accord palette CSS vars without conflict with the
closed-meeting shell being replaced.
Identify any class names in the existing closed-meeting shell that conflict
with the Minutes surface class namespace (`ac-minutes-*`).

---

## §3 — HALT-AND-SURFACE CONDITIONS

Stop and surface to operator before proceeding if:

1. **Item 8:** `accord_minutes_renders` has NOT NULL columns requiring PDF
   pipeline data with no DEFAULT. State the blocking columns explicitly.

2. **Item 1:** Closed-state branch is more complex than a single swap point —
   entangled dependencies beyond the 5-tab shell.

3. **Item 7:** A cross-module subscriber depends on a structural feature of
   the 5-tab closed shell that the Minutes surface would break.

---

## §4 — WHAT THIS PHASE DOES NOT DO

- No code written, modified, or proposed
- No migration SQL drafted
- No UI components sketched
- No `information_schema` queries beyond those listed in §2

---

## §5 — OUTPUT DISCIPLINE

One section per investigation item. Format:

```
### Item N — [name]
**Finding:** [1-3 sentences]
**Query result / file / line:** [paste or reference]
**Traps:** [any ambiguity or downstream risk, or "none"]
```

After all 9 items: Phase 1 summary (3-5 sentences for Phase 2 agent).
Then §7 checklist verbatim. Stop.

---

## §6 — FINDINGS FORMAT

(Agent populates this section)

### Item 1 — Closed-state swap point
### Item 2 — `accord_minutes_renders` schema
### Item 3 — `accord_minutes_recipients` schema
### Item 4 — `accord_meeting_outcomes.status` constraint
### Item 5 — `accord_nodes.tag` constraint
### Item 6 — `accord_meeting_attendees` columns
### Item 7 — IR72 cross-module survey
### Item 8 — `accord_minutes_renders` INSERT requirements
### Item 9 — CSS token conflicts

### Phase 1 summary
(3-5 sentences for Phase 2 agent)

---

## §7 — PHASE 1 CHECKLIST

- [ ] All 9 investigation items addressed or marked `[FILE NOT PROVIDED]`
- [ ] Halt-and-surface conditions checked; any triggered items escalated
- [ ] No code written or proposed
- [ ] `accord_minutes_renders` INSERT feasibility confirmed or halted
- [ ] `accord_minutes_recipients` RLS policies confirmed
- [ ] `accord_meeting_outcomes.status` valid values confirmed
- [ ] `accord_nodes.tag` values confirmed and cross-checked
- [ ] IR72 event list complete or stated as "no cross-module events found"
- [ ] Phase 1 summary written (≤5 sentences)

---

**Ship it.**
