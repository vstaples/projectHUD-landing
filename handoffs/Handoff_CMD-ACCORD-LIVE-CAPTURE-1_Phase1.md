# HANDOFF — CMD-ACCORD-LIVE-CAPTURE-1 · Phase 1: Investigation

**Date:** 2026-05-17
**CMD:** L-01 · CMD-ACCORD-LIVE-CAPTURE-1
**Operator:** Vaughn Staples
**Phase:** 1 of 7 — Investigation only. No code changes.

---

## §0 — PRE-FLIGHT

Read the brief `Brief_CMD-ACCORD-LIVE-CAPTURE-1.md` end-to-end before proceeding.
This phase produces written findings only. Do not write, edit, or propose any code.
Iron Rules 36, 40 §1, 47, 64, 72 apply.
Terse output discipline: no preamble, no internal monologue, no unsolicited recommendations.
Deliver in the §6 findings format, then the §7 checklist verbatim. Stop.

---

## §1 — INPUTS

Request the following files from the operator:

| File | Purpose |
|------|---------|
| `accord-capture.js` | Primary capture site — node INSERT during running meeting |
| `accord-ledger.js` | Secondary capture site (confirmed node INSERT at line ~923) |
| `accord-core.js` | `Accord.startMeeting()` — transition to running shell |
| `accord-transitions.js` | Level-change routing — how running meeting shell is entered |
| The current running-meeting shell file(s) | Whatever renders when `state='running'` — filename unknown; ask operator |
| `accord-views.js` | Workstream/meeting queries — presence and filmstrip patterns |

If the operator cannot provide a file, mark that investigation item `[FILE NOT PROVIDED]`
and note what can be inferred from adjacent files.

---

## §2 — INVESTIGATION ITEMS

Execute each item in order. For each, state: finding, file + line reference where applicable,
and any traps or ambiguities.

**Item 1 — Existing running-meeting shell**
Locate the file(s) that render when a meeting is in `state='running'`.
Confirm: entry point, DOM structure (tab-based or single canvas?), how it is mounted.
State whether it is a full page replacement or a panel/overlay within the existing shell.

**Item 2 — `Accord.startMeeting()` transition path**
In `accord-core.js`, find `startMeeting()` (or equivalent).
Confirm: what it PATCHes, what event it dispatches, what it renders after PATCH.
State whether the new shell can be swapped in at this transition point cleanly,
or whether surgery on `accord-transitions.js` is required.

**Item 3 — Node capture sites**
In `accord-capture.js` (~line 300) and `accord-ledger.js` (~line 923):
Confirm the inline POST pattern for `accord_nodes` INSERT.
List the fields currently written on INSERT (tag, summary, body, meeting_id, agenda_item_id, etc.).
Confirm whether `seq_id` is generated client-side or server-side.
Note: `discipline` and `topic` columns do not yet exist — confirm this via the INSERT
field list (absence is sufficient; IR47 full verification deferred to Phase 2).

**Item 4 — Agenda item status transition**
Find where `accord_agenda_items.status` is PATCHed to `'discussed'` during a running meeting.
Confirm trigger: is it manual (organizer clicks "mark discussed") or automatic?
This drives the progress bar segment logic in the new shell.

**Item 5 — Live attendee presence**
In `accord-views.js` or the running-meeting shell:
Confirm how live attendee presence is currently derived.
Is `accord_meeting_attendees.rsvp_status` the source, or is there a separate
presence/heartbeat mechanism?
If Realtime is involved, identify the subscription.

**Item 6 — Team chat substrate**
Search all provided files for any chat, message, or comment table/query.
Three possible findings:
  (a) Dedicated table (e.g. `accord_meeting_messages`) — confirm columns
  (b) `accord_nodes` with a special tag (e.g. `tag='chat'`) — confirm
  (c) No substrate exists — state explicitly

This is a **halt-and-surface condition** if finding is (c). Do not proceed past
this item without operator disposition if chat substrate does not exist.

**Item 7 — IR72 cross-module survey**
Search all provided files for any event dispatch or subscription that fires
during a running meeting session (e.g. `accord:node-created`, `accord:meeting-started`,
CoC events, Realtime publishes).
List each event, its dispatch site, and any known subscribers outside Accord.
The new shell must continue to emit all events the existing shell emits.

**Item 8 — CSS token conflicts**
The new shell uses Outfit font and the Live Capture palette
(background `#0b0d14`, surface `#10131e`, cyan accent `#4a8cf5`).
The existing 5-tab shell uses the production Accord palette (amber/signal-dominant).
Identify any global CSS that would conflict with the new palette —
specifically: any font-family declarations, any `body` or `#accord-app` background
overrides, any z-index stacking that would affect the sidebar resize handle.

**Item 9 — `accord_nodes.discipline` and `accord_nodes.topic` pre-check**
Confirm these columns do not yet exist by checking the INSERT field list
from Item 3 and any SELECT queries against `accord_nodes` in the provided files.
State: "Columns confirmed absent" or "Column [name] found — unexpected, flag for architect."

---

## §3 — HALT-AND-SURFACE CONDITIONS

Stop and surface to operator (do not proceed to next item) if:

1. **Item 6 finding (c):** Team chat substrate does not exist. New table required;
   architect must spec before Phase 2 can proceed.

2. **Item 2:** `Accord.startMeeting()` is entangled with the 5-tab shell in a way
   that requires touching `accord-transitions.js` beyond a single swap point.
   Describe the entanglement precisely.

3. **Item 7:** A cross-module subscriber depends on a structural feature of the
   5-tab shell (e.g. specific tab IDs, DOM selectors) that the new shell would break.

4. **Any item:** A file requested in §1 does not exist at the expected path and
   the gap cannot be bridged from adjacent files.

---

## §4 — WHAT THIS PHASE DOES NOT DO

- No code written, modified, or proposed
- No migration SQL drafted
- No UI components sketched
- No `information_schema` queries run (IR47 formal verification is Phase 2)
- No assessment of whether the existing shell is "good" or "bad"

---

## §5 — OUTPUT DISCIPLINE

Findings document: one section per investigation item.
Format each as:

```
### Item N — [name]
**Finding:** [1-3 sentences]
**File / line:** [filename:line or "not locatable"]
**Traps:** [any ambiguity or downstream risk, or "none"]
```

After all 9 items: §6 summary (3-5 sentences total across all items — what the
Phase 2 agent most needs to know). Then §7 checklist verbatim.

---

## §6 — FINDINGS FORMAT

(Agent populates this section)

### Item 1 — Existing running-meeting shell
### Item 2 — `Accord.startMeeting()` transition path
### Item 3 — Node capture sites
### Item 4 — Agenda item status transition
### Item 5 — Live attendee presence
### Item 6 — Team chat substrate
### Item 7 — IR72 cross-module survey
### Item 8 — CSS token conflicts
### Item 9 — `accord_nodes.discipline` / `topic` pre-check

### Phase 1 summary
(3-5 sentences for Phase 2 agent)

---

## §7 — PHASE 1 CHECKLIST

- [ ] All 9 investigation items addressed or explicitly marked `[FILE NOT PROVIDED]`
- [ ] Halt-and-surface conditions checked; any triggered items escalated before proceeding
- [ ] No code written or proposed
- [ ] Team chat substrate finding stated explicitly as (a), (b), or (c)
- [ ] IR72 event list complete or stated as "no cross-module events found"
- [ ] CSS conflict items listed or stated as "no conflicts found"
- [ ] `discipline` / `topic` column absence confirmed or unexpected presence flagged
- [ ] Phase 1 summary written (≤5 sentences)

---

**Ship it.**
