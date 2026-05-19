# HANDOFF — CMD-ACCORD-KNOWLEDGE-BASE-1 · Phase 1: Investigation

**Date:** 2026-05-19
**CMD:** K-01 · CMD-ACCORD-KNOWLEDGE-BASE-1
**Operator:** Vaughn Staples
**Phase:** 1 of 5 — Investigation only. No code changes.

---

## §0 — PRE-FLIGHT

Read `Brief_CMD-ACCORD-KNOWLEDGE-BASE-1.md` end-to-end before proceeding.
Session protocol: terse mode; Test Mode after each code update.
Iron Rules 36, 40 §1, 47, 64, 72 apply.
This phase produces written findings only. No code. No proposals.
Deliver in §6 findings format, then §7 checklist verbatim. Stop.

---

## §1 — INPUTS

| File | Purpose |
|------|---------|
| `accord-views.js` | Workstream Detail render — tab injection point |

---

## §2 — INVESTIGATION ITEMS

**Item 1 — Workstream Detail render location**
In `accord-views.js`, find the function that renders the Workstream Detail page
(meeting cards list). Confirm:
- Function name and line number
- Where in the DOM it writes its output (host element)
- Whether it currently has a tab bar or is a single-view surface
- Exact point where the tab bar can be injected above the meeting cards list

**Item 2 — IR47: `accord_nodes.discipline` and `accord_nodes.topic`**
Run in Supabase SQL Editor:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'accord_nodes'
AND column_name IN ('discipline', 'topic');
```
Expected: 2 rows. Surface finding explicitly.

**Item 3 — `accord_nodes.status` soft delete value**
Run:
```sql
SELECT DISTINCT status FROM accord_nodes WHERE status IS NOT NULL LIMIT 20;
```
Confirm `'deleted'` is used for soft deletes. Surface actual values found.

**Item 4 — `accord_meetings.state` valid values**
Confirm from `accord-views.js` or schema:
Valid values for filtering closed meetings: `closed | sealed`.
State whether `sealed` meetings should also appear in Knowledge Base
(they should — sealed = permanently closed).

**Item 5 — Resources name resolution pattern**
In `accord-views.js`, find the existing pattern for resolving
`resource_id` → display name. Confirm the query pattern used
so `accord-knowledge-base.js` can follow the same approach.

**Item 6 — CSS conflicts**
From `accord-views.js` inline styles or linked CSS:
Identify any class names that could conflict with `ac-kb-*` namespace.
Confirm Outfit font is already loaded on the Workstream Detail page
(it should be — loaded by Live Capture shell, but confirm it's in `<head>`
unconditionally).

---

## §3 — HALT-AND-SURFACE CONDITIONS

Stop and surface if:
1. `discipline` or `topic` columns do not exist — Phase 2 cannot query them.
2. The Workstream Detail render function writes directly to `innerHTML` in a
   way that would destroy the tab bar on refresh — describe the pattern.

---

## §4 — WHAT THIS PHASE DOES NOT DO

- No code written or proposed
- No migration SQL
- No UI sketches

---

## §5 — OUTPUT FORMAT

```
### Item N — [name]
**Finding:** [1-3 sentences]
**File / line / query result:** [reference]
**Traps:** [or "none"]
```

Phase 1 summary (3-5 sentences). Then §7 checklist. Stop.

---

## §6 — FINDINGS FORMAT

### Item 1 — Workstream Detail render location
### Item 2 — IR47: discipline / topic columns
### Item 3 — accord_nodes.status soft delete value
### Item 4 — accord_meetings.state valid values
### Item 5 — Resources name resolution pattern
### Item 6 — CSS conflicts

### Phase 1 summary

---

## §7 — PHASE 1 CHECKLIST

- [ ] All 6 items addressed
- [ ] IR47: discipline/topic column existence confirmed or halted
- [ ] Soft delete value confirmed
- [ ] Workstream Detail tab injection point identified
- [ ] No code written
- [ ] Phase 1 summary written (≤5 sentences)

---

**Ship it.**
