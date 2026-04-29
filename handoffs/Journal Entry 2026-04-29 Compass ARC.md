# Journal Entry — 2026-04-29

## Compass Arc Closeout — sub-view wiring through MY VIEWS persistence fork

### What was built

Five briefs across two days resolved a compounding cascade of
defects in Compass My Work, ending with MY VIEWS persistence
forked clean from MY NOTES.

**Phase 1 (CMD-Compass-Diag, 2026-04-29 morning).** Investigative
brief diagnosing why four of eight My Work sub-views (MY TIME,
MY VIEWS, MY NOTES, MY TEAM) rendered empty workspaces while
the other four worked. Agent identified the structural defect:
Tier 2 left-rail vocabulary (`time`, `notes`) collided with
downstream legacy vocabulary (`timesheet`, `concerns`) in
mw-core / mw-tabs / mw-team dispatch. Headline candidate plus
two adjacent failure modes (`views` `_widgetContext` reload,
`team` self-install patch) reported with file/line evidence.
Phase 1 shipped no code; report-only.

**CMD100 (Phase 2 of original Compass arc, 2026-04-29).**
Vocabulary unification. Tier 2 IDs adopted as canonical.
Renamed `'timesheet'` → `'time'` and `'concerns'` → `'notes'`
across mw-core, mw-tabs, panel IDs, dispatch table.
localStorage migration for legacy values. mw-team's self-install
monkey-patch retired into canonical dispatch. Operator-authorized
mid-cycle Mode C directive on hud-shell.js for slide-in trigger
unblocking. Seven of eight sub-views functional post-deploy.
MY VIEWS deferred per brief §2.4.

**MY VIEWS data check (post-CMD100, 2026-04-29).** Investigation
into MY VIEWS' specific failure mode. Confirmed via Supabase
SQL: operator's `notes_workspace.state` row contained no saved
dashboards under any key. Prior dashboard data overwritten on
2026-04-29 05:05:11+00 — recent work cycles erased real saved
work. Outcome 3: confirmed empty. Recovery declined; arc shifted
to architectural fork.

**Brief 1 — Schema (CMD-A or similar — operator assigns; closed
2026-04-29).** New `compass_views` table created with UUID PK,
hardcoded single-firm RLS, indexes, `updated_at` trigger.
`view_participants` rebuilt with `view_id` FK to
`compass_views.id` (CASCADE), legacy columns
(`workspace_owner_user_id`, `view_name`, `resource_id`)
dropped, RLS rewritten. Five orphan participant rows from
prior testing deleted with operator authorization. Smoke
test §7 verified shape across 7 blocks; behavioral
verification under RLS not exercised (this gap caused
Brief 1.5).

**Brief 1.5 — RLS recursion fix (closed 2026-04-29).**
Emergency repair brief. Brief 1's `vp_*` policies preserved
"self-and-workspace-based" semantics by introducing
`EXISTS (SELECT FROM view_participants vp2 ...)` self-references,
which 42P17-recursed when application code first exercised them.
Six SQL deliverables (Steps A-F), one per round-trip. Owner-level
checks rewritten to reference `compass_views.owner_user_id`
directly; participant-level checks reference
`view_participants.user_id` directly. Editor-delegation semantics
removed pending future non-recursive mechanism. Recursion
eliminated; INSERT/DELETE round-trip verified.

**Brief 2 (initially halted, then revised, then closed 2026-04-29).**
Application code fork. Original draft halted by fresh agent on
discovery that (a) the Share dialog physically lives in
`my-notes.html` (line 5432) despite functioning as shared chrome,
(b) MY NOTES had six other `view_participants` call sites that
were silently broken post-Brief-1, (c) invitation notifications
in this codebase use the `notes` table (`is_inbox=true`,
`entity_type='view_invite'`) NOT the `notifications` table I
specified. Architect re-scoped Brief 2 with carved exception for
MY NOTES `view_participants` call sites and corrected
notification target. Same agent resumed against revised brief.
Shipped: full MY VIEWS persistence fork to `compass_views`,
auto-create default dashboard, pill-badge rendering, eight
`view_participants` call sites updated across both files, library
moved to localStorage, accept-dialog rewritten to support both
new viewId-bearing invites and legacy ones. Heartbeat 500
discovered post-deploy; small follow-on edit pre-checked
participant existence before PATCH.

**Brief 2.5 — Share dialog extraction (closed 2026-04-29).**
Operator overrode architect's proactive-load recommendation in
favor of extraction (architectural durability over demo timing).
Share-dialog functions extracted from `my-notes.html` into
shared module. Both surfaces consume the module directly. MY
VIEWS' Share button now works on first MY VIEWS load without
requiring MY NOTES navigation.

### What was learned

#### Architect-level mistakes I own

1. **Misread agent table-name probing as fishing.** When the
   coding agent showed the operator a 27-name probe enumerating
   plausible Supabase table names, I jumped to "agent is fishing,
   methodology is broken" without asking the operator what the
   agent had actually done in prior session work. The operator's
   correction (the agent had already run real SQL queries; the
   probe was earlier-session investigative work) was warranted.
   Lesson: **the operator's direct evidence about what an agent
   did beats the architect's inference from a hand-off snippet.**
   When an agent's behavior looks wrong, ask the operator before
   reaching conclusions. (Captured in journal as a recurring
   class of architect failure: I had the operator-asks-architect-
   first opportunity in this case and didn't take it.)

2. **Read past schema inventory's flagged constraint.** The
   schema inventory at line 1231 explicitly noted `notes.entity_type`
   CHECK was unusually narrow — restricted to `view_invite` /
   `view_removed` — and flagged "may be a mis-named constraint
   or indicate this table is used for view invitations only in
   practice." That second clause was the answer: view invitations
   live in the `notes` table, not the `notifications` table. I
   read the flag and didn't investigate, then directed Brief 2
   to write notifications to the wrong table. Lesson: **flagged
   constraint notes in inventory documents are signals to
   investigate, not annotations to skip past.** Future briefs
   touching tables with flagged constraints should cite the flag
   and resolve it before brief authoring.

3. **Brief 1 scoped without consumer enumeration.** Brief 1 was
   "schema-only by design," and I authorized its closure on a
   smoke test that verified shape (`information_schema.columns`,
   `pg_policy` introspection). What the smoke test did not
   verify: that other application code consuming the changed
   schema would still work. MY NOTES had six `view_participants`
   call sites writing dropped columns; all silently broke
   post-Brief-1, surfaced only when Brief 2's fresh agent
   investigated. Lesson: **schema migration briefs need consumer
   enumeration as a brief-authoring step.** "What other surfaces
   read or write this table?" is a question the architect must
   answer before authorizing the migration, even if the migration
   itself doesn't modify those surfaces.

4. **Brief 1's smoke test verified RLS existence, not RLS
   behavior.** The Brief 1 smoke test confirmed the four `vp_*`
   policies existed with the expected CRUD coverage. It did not
   exercise the policies under realistic INSERT/UPDATE/DELETE
   queries. The 42P17 recursion only manifested when application
   code attempted real writes. Lesson: **schema migration smoke
   tests touching RLS must include INSERT/UPDATE/DELETE
   round-trips against the policies, not just `pg_policy`
   introspection.** Future RLS-touching briefs include behavioral
   verification in §7.

#### Agent-level mistakes worth journaling

5. **Iron Rule 37 violations at scale (original Brief 2 agent).**
   Pre-revision Brief 2 agent narrated thinking in real time
   across the entire work-cycle: design deliberation,
   reconsidered choices, "actually wait" loops, per-edit
   reasoning paragraphs. Transcript ran into thousands of lines.
   Operator pushed back on credit cost; correction issued
   mid-arc with concrete reinforcement language (per-edit
   one-sentence cap, prohibition on reconsidered-choices
   narration, "thinking out loud" patterns as halt conditions).
   Subsequent Brief 1.5 hand-off opened with "Per Iron Rule 37
   — silent work-mode acknowledged" and produced a crisp
   transcript. Lesson: **brief-level Iron Rule 37 reinforcement
   works as a stopgap until durable doctrine amendment lands.**
   Every future brief in this arc and beyond should include §0
   reinforcement language as standard.

6. **Bundled-batch deliveries crossing operator-inspection
   gates (Brief 1 agent).** Brief 1 agent shipped SQL in three
   batches; each batch internally bundled steps that the brief
   structured as serially-gated (Step A → operator inspect →
   Step B → operator inspect → Step C). Operator interpreted
   "three batches" as "three round-trips" because that was what
   they received. Database caught the gate violation as an
   integrity error; agent restructured to one-step-per-deliverable
   on operator instruction. Lesson: **agents preserve the brief's
   gating structure in their deliverable structure; bundled
   deliverables that span gates violate the briefing contract.**
   Multiple briefs since have honored this — including Brief 1.5
   (six round-trips) and Brief 2.5 (no gating issues).

7. **Operator-authorization solicitations in natural-language
   templates (Brief 1 agent).** Agent asked operator for
   authorization with prompts like "add a sentence such as…"
   that required operator interpretation. Recovered to explicit
   numbered options with concrete consequences. Lesson:
   **operator authorization solicitations require numbered
   options with concrete consequences, not natural-language
   templates.**

#### Operator decisions worth preserving

8. **Prior MY VIEWS dashboard data declared unrecoverable.**
   `notes_workspace.state` for operator's user_id contained
   only an empty `state.views.Default` placeholder shape;
   `updated_at = 2026-04-29 05:05:11+00` confirmed recent
   overwrite. Operator opted not to investigate Supabase PITR
   recovery angle. Forward stance: rebuild dashboards on the
   new `compass_views` foundation post-Brief-2.

9. **Tier 2 vocabulary canonical, not legacy.** When CMD100's
   vocabulary unification needed a direction, operator (with
   architect concurrence) chose the user-facing labels as the
   surviving names. Rationale: the user-facing identifier is
   the most stable layer; storage and dispatch can churn.
   Reusable as a default architectural principle.

10. **Architectural durability over demo timing on Brief 2.5.**
    Architect recommended proactive-load fix (5-line change,
    band-aid). Operator overrode in favor of extraction (new
    file, multi-surface change, durable architectural cleanup).
    Operator's instinct on architectural dependencies wins over
    the architect's instinct on timing in cases where the
    coupling will keep biting.

### Operating-practice lessons crystallized

These are durable across the project; promoted from this arc:

- **Schema migration consumer enumeration** (Lesson 3 above).
  Brief-authoring step: enumerate all surfaces that read/write
  the changed schema before authorizing the migration.

- **RLS behavioral verification** (Lesson 4 above). Schema
  migration smoke tests touching RLS must include
  INSERT/UPDATE/DELETE round-trips, not just policy
  introspection.

- **Iron Rule 37 brief-level reinforcement** (Lesson 5 above).
  Standard §0 language: "no mid-cycle narration, no
  reconsidered-choices narration, per-edit reasoning capped at
  one sentence, halt instead of narrating reconsiderations."
  Use this until durable doctrine amendment.

- **Operator-asks-architect-first** (Lesson 1 above). When
  agent behavior looks wrong, ask the operator what the agent
  actually did before drawing conclusions from hand-off
  snippets.

- **Flagged constraints are investigation prompts** (Lesson 2
  above). Schema inventory documents flagging "this constraint
  may indicate X" are signals to resolve before brief
  authoring, not annotations to read past.

- **Operator's architectural instinct over architect's timing
  instinct** (Lesson 10 above). When operator and architect
  disagree on a fix's shape, operator's call on durability
  generally wins over architect's call on speed.

### What was decided (architecturally)

- **MY VIEWS persistence layer permanently forked from MY NOTES.**
  `compass_views` table with UUID PK is canonical home for
  MY VIEWS dashboards. `notes_workspace.state` is exclusively
  MY NOTES territory.

- **`view_participants` keys to `compass_views.id` via
  `view_id` FK with CASCADE.** Legacy
  `(workspace_owner_user_id, view_name)` composite key
  retired.

- **RLS posture for new MY VIEWS tables: hardcoded single-firm.**
  Matches existing codebase pattern. RLS posture upgrade is a
  separate cross-cutting arc, not bundled with feature work.

- **Editor-delegation semantics on `view_participants`
  retired.** Owner-only writes pending future non-recursive
  mechanism (e.g., `compass_views.editor_user_ids` array).

- **Invitation notifications use the `notes` table** with
  `is_inbox=true` and `entity_type='view_invite'` /
  `'view_removed'`. The schema inventory's flagged constraint
  at line 1231 is now confirmed-as-intended behavior.

- **Share dialog code lives in shared module file**, not in
  `my-notes.html`. Both surfaces consume independently. MY
  VIEWS' first-load experience no longer requires MY NOTES
  visit.

- **Library moved from `notes_workspace.state.viewsWorkspace.library`
  to per-user localStorage.** One-shot read-only migration ran
  in MY VIEWS load path. Acceptable trade for now; per-user
  cross-device sync is a future enhancement.

- **MY NOTES dashboard sharing is non-functional post-Brief-2.**
  MY NOTES dashboards live in `notes_workspace.state.views`,
  have no `compass_views` row to satisfy `view_id` NOT NULL
  FK. Per Brief 2 §7.5, this is the expected coupling state
  pending architect adjudication.

### What's pending

**Near-term (this arc):**
- **Brief 3 — Multi-session verification.** Operator creates
  test dashboards across multiple browser sessions (Chrome,
  Edge, Firefox per prior working precedent), verifies
  cross-user invitation flow, confirms MY NOTES non-regression
  at depth, confirms inbox displays new `view_invite` rows.
  Disposition: operator's call on commission-now vs.
  defer-to-post-demo.

**Identified post-demo work:**
- **FK validation on non-account-user dropdown selection.**
  Surfaced during Brief 2 testing. When user without a
  ProjectHUD login account is selected from Share dialog
  dropdown, INSERT silently fails (FK violation against
  `users.id`). Fix: filter dropdown to only show users with
  accounts, OR catch FK violation and surface friendly error.

- **MY NOTES note-sharing schema adjudication (§7.5
  coupling).** MY NOTES dashboard sharing is currently
  non-functional. Either (a) note-sharing was always
  conceptually MY VIEWS dashboard sharing routed through MY
  NOTES code, in which case retirement is the answer, or (b)
  MY NOTES legitimately shares notes via `view_participants`
  and the schema needs accommodation (polymorphic `view_id`
  or separate participant table). Operator + architect
  decide before next note-sharing test exercise.

- **Editor-delegation semantics on `view_participants`.**
  Retired in Brief 1.5 to break recursion. If operating
  practice reveals editors are needed, reintroduce via
  non-recursive mechanism (`compass_views.editor_user_ids`
  array maintained by owner).

- **Library cross-device sync.** Currently per-user
  localStorage. If user works across multiple devices,
  templates don't sync. Future enhancement: dedicated
  `compass_views_library` table or library row in
  `compass_views` with `view_name = '__library__'`.

**Doctrine candidates for ratification:**
- **Iron Rule 37 sharpening.** Concrete enforcement triggers:
  per-edit one-sentence reasoning cap, prohibition on
  reconsidered-choices narration, "thinking out loud"
  linguistic patterns as halt conditions, brief-level §0
  reinforcement language as standard.

- **New iron rule (or amendment to Iron Rule 39): schema
  migration consumer enumeration.** "Schema migration briefs
  must enumerate all consumers of the changed schema before
  authorization, even if the brief does not modify those
  consumers."

- **New iron rule (or amendment to existing): RLS behavioral
  verification.** "Schema migration briefs touching RLS must
  include INSERT/UPDATE/DELETE round-trips against the
  policies in §7 smoke test, not just policy introspection."

- **Mode C protocol §8.3 sharpening** (carried forward from
  the prior Compass arc): "If your fix introduces a new
  ID/key/name that any downstream code consumes, you are out
  of Mode C." Ratification deferred to a separate doctrine
  cycle.

- **New iron rule (or amendment to existing): agents preserve
  the brief's gating structure in their deliverable
  structure.** "Bundled deliverables that span operator-
  inspection gates violate the briefing contract."

- **New iron rule (or amendment to existing): operator
  authorization solicitations require numbered options with
  concrete consequences**, not natural-language templates.

Doctrine work is queued for after the Compass arc fully
closes. Brief 3 disposition gates the closure.

### Notes on agent dynamics

This arc had three distinct agent personalities operating
across briefs:

- **Pre-correction Brief 2 agent.** Strong technical work,
  weak Iron Rule 37 discipline. Transcripted reasoning at
  scale.
- **Brief 1.5 agent.** Excellent discipline. Acknowledged Iron
  Rule 37 explicitly at hand-off open, produced crisp work,
  surfaced Brief 1's residual `resource_id` reference as a
  bonus catch.
- **Brief 1 agent.** Mature engineering instincts (built
  precondition checks into Batch 2 SQL that let the database
  enforce gates the deliverable structure should have
  prevented). Bundled-batch and natural-language-prompt
  failures recovered cleanly under operator instruction.

The Brief 1.5 / Brief 2.5 agent (presumably same continuing
agent) is now the proven baseline for this codebase. Future
work in this codebase prefers continuity with this agent
where possible.

---

*End of journal entry — 2026-04-29 — Compass arc closeout.*
