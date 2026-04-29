# Brief — Mode A — MY VIEWS persistence fork: multi-session verification (Brief 3 of arc) — CMD[NNN]

**Mode:** A (Architectural — verification protocol; no code expected unless defects surface)
**Surface:** Live application across multiple browser sessions
**Doctrine version locked at brief authorship:** Style Doctrine v1.7
**Brief author:** Architect
**Date:** 2026-04-29
**Predecessor briefs:** Brief 1 (schema), Brief 1.5 (RLS recursion fix), Brief 2 (application code), Brief 2.5 (share dialog extraction) — all closed
**Arc context:** This is Brief 3, the closeout brief for the MY VIEWS persistence fork:
  - **Brief 1 (closed):** Schema fork.
  - **Brief 1.5 (closed):** RLS recursion fix.
  - **Brief 2 (closed):** Application code fork.
  - **Brief 2.5 (closed):** Share dialog extraction.
  - **Brief 3 (this brief):** Multi-session verification. Operator validates the entire arc against the working multi-user invitation flow previously demonstrated with three browser sessions (Chrome, Edge, Firefox).

---

## §0 — Standing rules

### §0.1 Iron Rules in force

- **Iron Rule 36** — terse hand-off (diff if any, smoke test, findings).
- **Iron Rule 37** — silent work-mode. **Recently reinforced and verified effective in Brief 1.5 and Brief 2.5.** No mid-cycle narration. No reconsidered-choices narration. Per-edit reasoning capped at one sentence. If you find yourself reconsidering an architectural choice, halt instead of narrating. Open hand-off with "Per Iron Rule 37 — silent work-mode acknowledged" as Brief 1.5's agent did.
- **Iron Rule 39** — input enumeration, output specification.
- **Iron Rule 40** — halt-on-missing-input, terse transcript, test instructions, dev-console-first debugging.
- **Style Doctrine §0.1** — agents do not modify or extend doctrine.

### §0.2 Brief 3 is operator-driven, not agent-driven

This brief is unusual — most of the work is operator-run.
The operator executes the verification protocol; the agent
engages only if specific defects surface that need
diagnosis or repair. Most likely outcome: agent does little
to nothing and the brief closes on operator-verified
results.

The agent's role:
1. Confirm receipt of this brief.
2. Stand by while operator runs the verification protocol.
3. If operator reports a defect during the protocol, agent
   diagnoses and reports findings. Repair is OUT of scope
   for Brief 3 — defect findings escalate to a follow-on
   brief (Brief 3.5 or post-arc cleanup).
4. Compile final hand-off summarizing what was verified,
   what (if anything) failed, and disposition for any
   failures.

### §0.3 Operating-practice lessons in force across this arc

1. Operator-inspection gates require one step per round-trip.
2. Operator authorization solicitations require numbered
   options with concrete consequences.
3. Schema migrations have consumers beyond the surface
   being forked.

(Not all directly applicable to a verification brief, but
listed for continuity.)

---

## §1 — Purpose

After Brief 3 closes:

1. The MY VIEWS persistence fork (Briefs 1 through 2.5) is
   confirmed functional under realistic multi-user / multi-
   session conditions.
2. The previously-working three-browser cross-session
   invitation flow (Chrome, Edge, Firefox) is confirmed
   restored.
3. Any defects that surface during verification are
   documented for follow-on disposition.
4. The arc is formally closed in the journal.

---

## §2 — Architectural decisions locked

### §2.1 No code shipping in Brief 3 by default

Brief 3 is verification, not feature work. The agent does
NOT modify code unless a defect surfaces that requires
immediate diagnosis (in which case the diagnosis is the
deliverable; repair is escalated).

### §2.2 Multi-session test stance

The verification protocol exercises the system under the
same conditions the operator previously tested successfully
pre-fork: three browser sessions, three different users,
real cross-session invitation flow. This is the highest-
fidelity test available short of production traffic.

### §2.3 Defect handling

If a defect surfaces during the protocol:

- **Operator halts the protocol at the failure point.** Do
  not skip past failures and continue.
- **Agent diagnoses** (per Iron Rule 40 §4 dev-console-first)
  and reports findings.
- **Repair is OUT of scope for Brief 3.** Defects become
  inputs to follow-on disposition (Brief 3.5 if blocking,
  post-demo cleanup queue if non-blocking).
- **Operator and architect adjudicate disposition** at the
  failure point before continuing or closing the brief.

### §2.4 What "passed" means

Brief 3 passes when:

- All §7 protocol steps complete with expected behavior
- No new defects surface that require code changes
- The previously-deferred §7.5 MY NOTES note-sharing
  coupling is the only acknowledged-broken behavior, and
  it's an explicit limitation, not a discovery

---

## §3 — Verification protocol

The operator runs this protocol. Each step has expected
behavior; the operator confirms or reports a deviation.
Agent stands by to diagnose deviations.

### §3.1 Pre-protocol setup (operator)

Three browser sessions ready: Chrome, Edge, Firefox (or
equivalent set — what matters is three distinct sessions
that don't share auth cookies). Three test users available:

- **User O (Owner):** the operator's primary account.
  Logged in on Browser 1.
- **User P1 (Participant 1):** a second test user with a
  ProjectHUD account. Logged in on Browser 2.
- **User P2 (Participant 2):** a third test user with a
  ProjectHUD account. Logged in on Browser 3.

If you don't have three distinct test accounts available,
report which you have and we adjust the protocol scope.

Recommended: have DevTools console open in all three
browsers. Filter to errors and warnings. Run with a clean
console at protocol start.

### §3.2 Browser 1 / User O — Owner setup

1. Hard reset Compass. Console banner shows expected CMD
   number.
2. Click MY VIEWS in Tier 2 left rail.
   **Expected:** Default dashboard loads. (If MY VIEWS has
   never been opened for User O, auto-create runs and
   Default appears.)
3. Add 2-3 tiles to Default. Wait for auto-save.
4. Verify in Supabase:
   ```sql
   SELECT id, view_name, jsonb_pretty(state) AS state
   FROM compass_views
   WHERE owner_user_id = '<User O id>';
   ```
   Returns at least one row (Default) with the tiles in
   `state`.

### §3.3 Browser 1 / User O — share Default with P1

1. Click ⊕ Share button on Default.
   **Expected:** Share dialog opens immediately. (No MY
   NOTES navigation required — Brief 2.5 fix.)
2. In the dropdown, search for User P1.
   **Expected:** P1 appears in the list with their assigned
   color avatar.
3. Click P1.
   **Expected:** P1 appears in PEOPLE WITH ACCESS as
   "Invitation pending" with their color.
4. Click Save Changes (or close the modal — the participant
   row is saved at click time).
5. Verify in Supabase:
   ```sql
   SELECT vp.id, vp.view_id, vp.user_id, vp.view_role,
          vp.color, vp.invited_at, vp.accepted_at,
          u.name AS participant_name
   FROM view_participants vp
   LEFT JOIN users u ON vp.user_id = u.id
   WHERE vp.view_id = '<Default UUID from §3.2>';
   ```
   Returns one row for P1 with `accepted_at IS NULL`.
6. Verify invitation notification:
   ```sql
   SELECT id, owner_user_id, entity_type, entity_id,
          entity_meta, title, is_inbox, created_at
   FROM notes
   WHERE entity_type = 'view_invite'
     AND owner_user_id = '<User P1 id>'
   ORDER BY created_at DESC LIMIT 1;
   ```
   Returns the invitation row. `entity_id` matches the
   `view_participants.id` from step 5. `entity_meta`
   contains `viewId` and `viewName`.

### §3.4 Browser 2 / User P1 — receive invitation, accept

1. Hard reset Compass on Browser 2 (logged in as User P1).
2. Open MY NOTES (the inbox lives in MY NOTES territory).
   **Expected:** Inbox shows "1" or similar count indicating
   a new view invite.
3. Open the inbox, find the invitation from User O.
   **Expected:** Invitation card shows owner name (User O),
   dashboard name (Default), accept/decline buttons.
4. Click Accept.
   **Expected:** Invitation accepted; UI redirects or
   surfaces the shared dashboard.
5. Verify in Supabase (run from any browser with read
   access):
   ```sql
   SELECT accepted_at FROM view_participants
   WHERE view_id = '<Default UUID>'
     AND user_id = '<User P1 id>';
   ```
   `accepted_at` now populated with timestamp near the
   accept click.

### §3.5 Browser 1 / User O — verify pill-badge appears

1. With User O still in MY VIEWS / Default dashboard,
   reload the page (or trigger a re-render of the
   participants bar).
2. **Expected:** A pill-badge for User P1 appears at the
   top of the workspace area, in P1's assigned color, with
   P1's name.
3. Pending invitations (accepted_at IS NULL) should NOT
   render badges. Confirm this by:
   - On Browser 1, share Default with User P2 (repeat §3.3
     for P2)
   - Reload Default
   - **Expected:** P1's badge appears (accepted), P2's
     badge does NOT appear (pending). One badge total.

### §3.6 Browser 3 / User P2 — second invitation flow

Repeat §3.4 for User P2, accepting the invitation from
User O.

After P2 accepts, reload Browser 1 / User O / Default.

**Expected:** Two pill-badges now visible at the top of
the workspace area — P1 and P2 in their respective colors.

### §3.7 Browser 2 / User P1 — work in shared dashboard

1. With P1 having accepted, open the shared Default
   dashboard.
   **Expected:** P1 sees the same tiles User O created in
   §3.2.
2. Confirm P1 cannot edit owner-level settings (sharing,
   delete, rename) — these should be owner-only post-
   Brief 1.5.
3. P1 can see the dashboard read-only (or per their
   assigned `view_role` from `view_participants`).

### §3.8 Browser 1 / User O — modify dashboard, observe in P1's session

1. With User O in Default, add another tile or modify an
   existing one. Wait for auto-save.
2. On Browser 2 / User P1, reload the shared dashboard.
   **Expected:** P1's view reflects User O's edit.
   (Note: Brief 2 specified last-write-wins, NOT Realtime
   — P1 must manually reload to see updates. Real-time
   sync was deferred per §2.6 of Brief 1.)

### §3.9 Browser 1 / User O — remove P2 from sharing

1. Open Share dialog on Default.
2. Find P2 in PEOPLE WITH ACCESS. Click the remove (×)
   button.
3. **Expected:** P2 removed from list. `view_participants`
   row deleted.
4. Verify in Supabase:
   ```sql
   SELECT * FROM view_participants
   WHERE view_id = '<Default UUID>'
     AND user_id = '<User P2 id>';
   ```
   Returns zero rows.
5. **Expected:** A `view_removed` notification was created
   for P2:
   ```sql
   SELECT * FROM notes
   WHERE entity_type = 'view_removed'
     AND owner_user_id = '<User P2 id>'
   ORDER BY created_at DESC LIMIT 1;
   ```
   Returns the removal notification.
6. Reload Default on Browser 1. P2's pill-badge no longer
   appears.

### §3.10 Browser 3 / User P2 — observe access removal

1. Reload Compass on Browser 3.
2. **Expected:** User O's Default dashboard no longer
   appears in P2's accessible-shared-dashboards list.
3. **Expected:** P2's inbox shows the `view_removed`
   notification.

### §3.11 Cascade delete verification

1. On Browser 1 / User O, create a temporary test dashboard
   (e.g., "DELETE_TEST").
2. Share it with P1.
3. P1 accepts.
4. Verify both `view_participants` rows exist:
   ```sql
   SELECT count(*) FROM view_participants
   WHERE view_id = '<DELETE_TEST UUID>';
   ```
   Returns 1 (P1 only — owner doesn't have a participant
   row per Brief 2 design).
5. On Browser 1, delete the DELETE_TEST dashboard.
6. **Expected:** Cascade deletes all `view_participants`
   rows for that view_id:
   ```sql
   SELECT count(*) FROM view_participants
   WHERE view_id = '<DELETE_TEST UUID>';
   ```
   Returns 0.
7. On Browser 2, P1's shared-dashboards list should no
   longer include DELETE_TEST.

### §3.12 MY NOTES non-regression

1. On Browser 1, switch to MY NOTES.
2. Existing notes hierarchy intact.
3. Edit a note, save. Reload — content persisted.
4. Click Share on a note (this exercises the §7.5 deferred
   coupling — MY NOTES dashboard sharing).
   **Expected per §7.5 limitation:** Share modal opens but
   selecting a user produces no `view_participants` row
   (silent skip; MY NOTES dashboards have no
   `compass_views` row to FK against). Console shows the
   skip warning.
5. This is the documented limitation, not a defect.
   Confirm console output matches the expected skip
   message.

### §3.13 Console cleanliness final check

Throughout §3.2 through §3.12, the DevTools console in all
three browsers should show:

- No 42P17 recursion errors
- No 500 errors on `view_participants` operations
- No 500 errors on `compass_views` operations
- No uncaught exceptions
- Heartbeat traffic should be clean (post-Brief-2 fix)

Any errors or unexpected warnings: report.

---

## §4 — Out of scope

- Code changes (defects surfaced are diagnosed only;
  repaired in follow-on briefs)
- Real-time sync verification (deferred per arc decisions)
- MY NOTES dashboard sharing (deferred per §7.5; tested
  only as limitation confirmation)
- FK validation on non-account-user dropdown selection
  (deferred to post-demo cleanup queue)
- Editor-delegation semantics on `view_participants`
  (retired in Brief 1.5; reintroduce in future brief if
  needed)
- Cross-firm or RLS posture testing (single-firm hardcoded
  posture is the current architectural decision)
- Performance / load testing
- Mobile or tablet browser testing

---

## §5 — Inputs

### §5.1 Files modified / created

None expected. (Defects might require small fixes;
disposition per §2.3.)

### §5.2 Files read for reference

- Brief 1, 1.5, 2, 2.5 hand-offs (closed)
- Journal entry 2026-04-29 — Compass arc closeout
- `projecthud-supabase-schema-inventory.md`
- This brief

### §5.3 Operator-run resources

- Three browser sessions (Chrome, Edge, Firefox or
  equivalent)
- Three test user accounts (O, P1, P2) with valid
  ProjectHUD logins
- Supabase access for verification queries
- DevTools open in each browser, console + network panels

### §5.4 Doctrine + reference

- Style Doctrine v1.7
- Iron Rules 36, 37, 39, 40 ratifications
- Work Mode Classification doctrine v1.0

---

## §6 — Definition of done

Brief 3 is complete when:

- All §3 verification steps either pass or have a
  documented disposition (defect found and dispositioned
  via follow-on brief OR limitation confirmed)
- Console cleanliness verified across all three browsers
- Multi-session invitation flow confirmed restored to
  pre-fork working state
- Any defects surfaced are documented in hand-off with
  recommended disposition
- Arc closes formally — operator and architect agree the
  fork is functionally complete
- Hand-off conforms to §8

---

## §7 — Pass / fail criteria

### Pass criteria
- §3.2 through §3.11 complete with expected behavior
- §3.12 confirms MY NOTES non-regression except for the
  acknowledged §7.5 limitation
- §3.13 console clean

### Acceptable partial-pass criteria
- §3.4 / §3.6 acceptance flow has minor UX glitches that
  don't block the underlying data flow (acceptable but
  documented as findings)
- Cross-session reload latency or refresh nuances that
  don't break correctness
- §3.12 step 4 limitation behavior matches expected skip;
  console message is informational not error

### Fail criteria
- Any 42P17 error
- Any 500 error on `view_participants` or `compass_views`
  operations under normal flow
- Invitation notifications not created
- Pill-badges not rendering for accepted participants
- Cascade delete not removing participant rows
- Owner cannot share / cannot remove participants

Failures halt the protocol, agent diagnoses, follow-on
brief authored if needed.

---

## §8 — Hand-off format

Required output:

1. **Verification protocol results** — section by section
   from §3, each step marked PASS / PARTIAL / FAIL with
   one-line note for non-PASS.
2. **Files modified** (likely none) — one-liner per file
   if any.
3. **Diagnosis of any failures** — for each FAIL, one-line
   diagnosis and recommended disposition.
4. **Defect findings** — defects discovered that don't
   block PASS but warrant tracking.
5. **Limitations confirmed** — §7.5 MY NOTES sharing,
   non-account-user FK validation, etc. — confirm these
   behave as documented limitations not defects.
6. **Arc closure recommendation** — agent recommends arc
   formally closes, OR specific follow-on briefs needed
   before closure.

Per Iron Rule 37 — work silently. Open hand-off with
"Per Iron Rule 37 — silent work-mode acknowledged."

---

## §9 — Reference materials

**Files modified:**
- None expected.

**Files read for reference:**
- Brief 1 hand-off
- Brief 1.5 hand-off
- Brief 2 hand-off
- Brief 2.5 hand-off
- Journal entry 2026-04-29
- `projecthud-supabase-schema-inventory.md`

**Doctrine + operating-discipline:**
- ProjectHUD Style Doctrine v1.7
- iron-rule-36-ratification.md
- iron-rule-37-ratification.md
- iron-rule-39-ratification.md
- iron-rule-40-ratification.md
- work-mode-classification-doctrine.md (v1.0)

**Brief context:**
- All prior briefs in arc (closed)
- This brief

---

## §10 — Narrative instruction block (paste-ready)

```
Apply brief-cmdNNN-myviews-fork-verification.md (Brief 3
of the MY VIEWS persistence fork arc — the closeout).

This brief is OPERATOR-DRIVEN, not agent-driven. Operator
runs the §3 verification protocol across three browser
sessions. You stand by, engage only if defects surface.

§2.1: NO CODE CHANGES expected by default. If a defect
surfaces, you DIAGNOSE only — repairs escalate to follow-on
briefs.

§2.3: Operator halts protocol at first failure. You
diagnose. Architect adjudicates disposition.

§3 has 12 protocol sections. Most-likely outcome: operator
reports all PASS, you compile hand-off, arc closes.

Per Iron Rule 37 — recently reinforced and verified
effective in Brief 1.5 and Brief 2.5 — work silently.
Open hand-off with "Per Iron Rule 37 — silent work-mode
acknowledged." No mid-cycle narration.

Per Iron Rule 40 §1, halt on missing inputs. If operator
can't run the protocol (only 1-2 browsers available, only
1-2 test users available, etc.), halt and report scope
adjustment options to architect.

Operator's user_id is 57b93738-6a2a-4098-ba12-bfffd1f7dd07.
Firm UUID is aaaaaaaa-0001-0001-0001-000000000001.

Acknowledge receipt and stand by for operator to begin
protocol.
```

---

*End of Brief — MY VIEWS persistence fork verification (Brief 3).*
