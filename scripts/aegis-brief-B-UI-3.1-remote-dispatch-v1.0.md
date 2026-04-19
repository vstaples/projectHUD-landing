# Brief B-UI-3.1 · `Click ForInstance` Remote Dispatch Fix

**Category:** Bug fix (dispatch routing)
**Depends on:** B-UI-3 shipped (command exists)
**Unblocks:** `dual_session_test` v1.4 AK-side migration; any cross-session use of `Click ForInstance`
**Inherits from:** `aegis-MASTER-handoff.md`
**Estimated session:** 1–2 hours
**Brief version:** 1.0 · 2026-04-19

---

## Scope statement

`Click ForInstance` currently dispatches **locally on Aegis** even
when prefixed with a session alias (`VS: Click ForInstance …` or
`AK: Click ForInstance …`). Other action commands (`Set Tab`,
`Form Submit`, one-word `Click`) route remotely when prefixed.
`Click ForInstance` should behave the same.

Observed symptom from B-UI-3 probe: `VS: Click ForInstance …`
returned `[object Object]` (the wrapper-as-string of a local
command return) instead of the remote-ack string format
`Click ForInstance: Review · <id prefix>`. The command "worked"
in the probe only because Aegis-under-VS-auth shares DOM with
Compass-under-VS-auth — the local execution found a valid Review
button by coincidence.

**Working hypothesis (to verify):** the two-word verb
`Click ForInstance` is incorrectly registered in one of the local-
verb allow-lists (`_lv` or `_rl`), causing the dispatcher to run
it locally even when a target prefix is present. Two-word wait
verbs (`Wait ForRoute`, `Wait ForInstance`, `Wait ForQueueRow`)
are *correctly* in those arrays per Rule 26 — they MUST run
locally. `Click ForInstance` is the opposite: it's an action
command that MUST run on the target session.

**Do not** expand scope. Fix the routing; ship the fix; verify.
If the investigation reveals this isn't a registration issue,
surface the finding before writing speculative fixes.

---

## Context files

Read in this order:

1. `aegis-MASTER-handoff.md` — pay attention to:
   - Iron Rule 26 (typed Waits run locally; registered in `_lv`
     and `_rl`)
   - Iron Rule 29 (session prefix discipline)
   - B-UI-3 section and handoff append (the command's current
     registration)
   - B-UI-2 section — Parser handling subsection (line numbers
     of `_lv` ~1842 and `_rl` ~2580; may have drifted since)
2. `cmd-center.js` — specifically:
   - The `_lv` local-verb array (search for `_lv = [` or the
     array declaration site)
   - The `_rl` local-verb array (search for `_rl = [` or
     equivalent)
   - The `COMMANDS` registry entry for `Click ForInstance`
   - The `COMMANDS` registry entry for `Click` (one-word, for
     comparison — this is the known-working reference)
   - The dispatch path that consults these arrays — specifically
     where a prefixed command decides "local or remote"

**Do not read** other source files. This fix is contained within
`cmd-center.js`.

---

## Iron rules inherited

- **Rule 26** — Typed Wait commands MUST run locally. `_lv` and
  `_rl` arrays are the mechanism. Do NOT remove any existing
  entries from these arrays in this brief — every current entry
  corresponds to a typed Wait that legitimately belongs there.
- **Rule 28** — Version strings reconciled across all loader
  sites after the fix.
- **Rule 29** — Session prefix discipline. After this fix, the
  enforcement is real — an unprefixed `Click ForInstance` will
  still run locally (which is correct; unprefixed means "local"
  by design), but a *prefixed* `Click ForInstance` will route
  remotely as intended.
- **Rule 30** — DOM-first action-command hazard. This brief does
  not change DOM semantics; it only changes routing.

---

## Investigation procedure

Execute in order. Stop and report if any step surfaces a finding
that contradicts the hypothesis.

### Step 1 — Confirm the registration

Grep `cmd-center.js` for `Click ForInstance`. Expected: registry
entry in `COMMANDS`, verb entries in `_lv` and/or `_rl`.

- If `Click ForInstance` appears in `_lv` or `_rl`: **that's the
  bug**. Proceed to Step 2.
- If `Click ForInstance` is NOT in either array: the bug is
  elsewhere. Stop and report.

### Step 2 — Compare to one-word `Click`

Grep `cmd-center.js` for `'Click'` as a registry key and in the
local-verb arrays. Expected: `Click` is registered in `COMMANDS`
but NOT in `_lv` or `_rl`. That's why a prefixed `VS: Click` routes
remotely.

- If `Click` is also in `_lv`/`_rl`: the dispatch path is more
  nuanced than the arrays alone. Report before fixing.
- If `Click` is NOT in those arrays: the asymmetry with
  `Click ForInstance` is the bug. Proceed to Step 3.

### Step 3 — Trace the dispatch decision

Find the code path that decides local vs. remote for a parsed
prefixed command. It should look roughly like:
```
if (parsed.target && !_lv.includes(parsed.verb) && !_rl.includes(parsed.verb)) {
  // route remote
} else {
  // run local
}
```
or some equivalent.

Confirm:
- `VS: Click "Review"` — parsed.verb = `Click`, not in
  `_lv`/`_rl`, routes remote. ✓
- `VS: Click ForInstance $id "Review"` — parsed.verb =
  `Click ForInstance`, currently in one of the arrays, runs
  local. ✗

### Step 4 — Apply the fix

Remove `Click ForInstance` from whichever local-verb array(s) it
was added to. Do NOT remove anything else. Do NOT refactor the
array structure.

Expected diff: 1-2 lines removed from `cmd-center.js`.

### Step 5 — Version reconcile

Per Rule 28, bump the canonical version string across all four
loader sites (`cmd-center.js` header / `_productVersions` /
`console.group`, `sidebar.js`, `compass.html`, `aegis.html`).

Suggested: `v20260419-CMD66`.

### Step 6 — Verify with probe

Run the verification probe (see below). Expected output: transcript
shows `Click ForInstance: Review · <id prefix>` — a string, not
`[object Object]`.

---

## Verification probe

`scripts/b-ui-3-1_remote_dispatch_probe.txt`:

```
# Version: 1.0
# Requires: VS, AK
# B-UI-3.1 probe — Click ForInstance routes remotely when prefixed.

Assert session VS is connected
Assert session AK is connected

VS: Set View "compass"
AK: Set View "compass"
Wait ForLocation VS "compass.my_work" timeout=30000
Wait ForLocation AK "compass.my_work" timeout=30000

# VS submits (as in dual_session_test)
VS: Set Tab "MY REQUESTS"
VS: Set SubTab "BROWSE"
VS: Form Open "Expense Report"
Pause Form open — confirm Expense Report modal is visible

VS: Form Insert "Employee Name" "Vaughn Staples"
VS: Form Insert "Trip Start Date" "2026-04-14"
VS: Form Insert "Trip End Date" "2026-04-14"
VS: Form Select "Business Purpose" "client"
VS: Form Insert "Purpose Description" "B-UI-3.1 remote dispatch probe"
VS: Form Insert "Customer Name" "Remote Dispatch Corp"
VS: Form Submit

Wait ForEvent "form.submitted" → $instance_id
Wait ForInstance $instance_id for launched

# VS's own step-1 self-review
VS: Set Tab "MY WORK"
Wait ForQueueRow $instance_id to VS
VS: Click ForInstance $instance_id "Review"

Pause Review popup raised for VS — approve manually

# After VS approves, step-2 routes to AK
Wait ForRoute $instance_id to AK

# THE TEST: AK: Click ForInstance must route remotely.
# Before this fix, it ran locally on Aegis, which had no AK-scoped
# queue row, so the click either found nothing or the wrong row.
AK: Set Tab "MY WORK"
Wait ForQueueRow $instance_id to AK
AK: Click ForInstance $instance_id "Review"

Pause Review popup raised for AK — confirm the opened form is
      "Remote Dispatch Corp" (not a stale row)

Log "✓ B-UI-3.1 probe complete · target $instance_id"
```

Key assertion: the second `Click ForInstance` (AK-side) must
route remotely. If it ran locally, AK's queue row isn't in Aegis's
DOM, and the command would error out with "no row for instance."
If it routes correctly, AK's Compass opens the Review popup for
the target instance.

Expected transcript for both Click ForInstance lines:
```
Click ForInstance: Review · <id_prefix>
```

Not `[object Object]`.

---

## Definition of done

### Code-level evidence

- `node --check cmd-center.js` passes.
- `grep -n "Click ForInstance" cmd-center.js`:
  - Shows entry in `COMMANDS` registry (1 match)
  - Does NOT appear in `_lv` or `_rl` arrays
  - May appear in command implementation body and error-message
    strings — those are fine
- Cache-bust reconciled to canonical CMD66 (or next string) at all
  four loader sites per Rule 28.

### Behavioral evidence

Probe runs end-to-end. Both `Click ForInstance` invocations
(VS-side and AK-side) render the expected string format in the
transcript. AK's Review form opens for the correct instance.

### Handoff update

Append `## Brief B-UI-3.1 — Click ForInstance remote dispatch fix (CMD66)` with:

1. Root cause — the local-verb array misregistration.
2. The specific line(s) removed.
3. Probe confirmation that AK-side `Click ForInstance` now routes
   remotely.
4. Note: `dual_session_test` v1.4 migration is now unblocked.
5. Updated file version table and cache-bust inventory.

---

## Out of scope

- **Do not** refactor `_lv` or `_rl` arrays.
- **Do not** change how the parser classifies two-word verbs.
- **Do not** modify the dispatch path beyond the minimum needed to
  remove the misregistration.
- **Do not** touch any other command's registration.
- **Do not** migrate `dual_session_test` to v1.4 in this brief. That
  is a separate follow-up after B-UI-3.1 ships.
- **Do not** address the `[object Object]` transcript-formatter bug
  surfaced in B-UI-3 — it's a latent separate issue; filed as its
  own candidate brief.

---

## Pre-flight checklist

Answer before making changes:

1. Is `Click ForInstance` actually in `_lv` or `_rl`? (Expected yes;
   if no, the hypothesis is wrong and the investigation needs to
   widen.)
2. Is one-word `Click` absent from those arrays? (Expected yes; it
   must be, given that `VS: Click "Review"` has been routing
   correctly in prior briefs.)
3. Is the dispatch decision truly array-based, or is there
   additional classification metadata (e.g., a `local: true` flag
   on the registry entry)?
4. What is the canonical CMD version string now, and what will it
   be after this fix? Reconcile all loader sites.

---

## If the investigation surfaces something else

If Step 1 or Step 2 contradicts the hypothesis — for example, if
`Click ForInstance` is NOT in the local-verb arrays, or if
one-word `Click` IS in them — stop and report before writing a
fix. The real root cause is elsewhere, and speculative fixes
risk breaking the known-working dispatch path for other commands.

Possible alternative root causes to investigate if the hypothesis
fails:

- The `COMMANDS` registry has a per-entry `local: true` flag or
  equivalent metadata that was set incorrectly on
  `Click ForInstance`.
- The two-word verb parser emits a different `parsed.verb` shape
  that the dispatch logic mishandles.
- The prefix-strip logic has a path-specific regex that fails on
  two-word action verbs.

Each of these is a fix of different shape. Surface the finding
before proceeding.

---

## Post-completion

After B-UI-3.1 lands:

- `Click ForInstance` routes remotely when prefixed. Both same-
  session and cross-session usage works.
- `dual_session_test` v1.4 migration is unblocked — swap
  `Click "Review"` and `Click "Approve"` for
  `Click ForInstance $instance_id "Review"` and
  `Click ForInstance $instance_id "Approve"` on both VS and AK
  sides. 15-minute follow-up.
- Next candidates: `modal.opened` + `Wait ForModal` (drops 2
  Pauses); Cadence iframe SQL sweep (drops last Pause).

---

*End of Brief B-UI-3.1. Revisions go in a new numbered brief.*
