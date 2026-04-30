# Journal Entry — 2026-04-30

## Compass MY VIEWS Persistence Fork Arc — Comprehensive Closeout

### Status

The arc is functionally close to closure but not yet formally closed. As of this
entry: Brief 3.6 shipped and closed on literal scope; Vaughn's Dashboard is
accessible to invited-and-accepted users via the view-switcher dropdown after
hard refresh. Defect D8 (shared dashboards excluded from left-rail DASHBOARDS
panel) is under operator adjudication for demo-criticality. Brief 3.7 may follow
to address D8 if the demo audience is expected to encounter Compass via the
left-rail panel rather than the dropdown.

### Two-day arc — what was built

This entry supersedes the interim journal entry drafted on 2026-04-29 (which
captured through Brief 2.5). The full arc spans Phase 1 through Brief 3.6 and
is documented end-to-end here.

**Phase 1 (CMD-Compass-Diag, 2026-04-29 morning).** Investigative brief
diagnosing why four of eight My Work sub-views (MY TIME, MY VIEWS, MY NOTES,
MY TEAM) rendered empty workspaces. Root cause: Tier 2 left-rail vocabulary
(`time`, `notes`) collided with downstream legacy vocabulary (`timesheet`,
`concerns`) in mw-core / mw-tabs / mw-team dispatch. Phase 1 shipped no code;
report-only.

**CMD100 (2026-04-29).** Vocabulary unification. Tier 2 IDs adopted as
canonical. Renamed `'timesheet'` → `'time'` and `'concerns'` → `'notes'`
across mw-core, mw-tabs, panel IDs, dispatch table. localStorage migration.
mw-team's self-install monkey-patch retired. Operator-authorized mid-cycle
Mode C on hud-shell.js. Seven of eight sub-views functional post-deploy.
MY VIEWS deferred per brief §2.4.

**MY VIEWS data check (post-CMD100).** Operator's `notes_workspace.state`
contained no saved dashboards. `updated_at = 2026-04-29 05:05:11+00`
confirmed recent overwrite. Operator's prior MY VIEWS dashboard data
declared unrecoverable. Forward stance: rebuild on new architectural
foundation.

**Brief 1 — Schema (closed 2026-04-29).** New `compass_views` table with
UUID PK, hardcoded single-firm RLS, indexes, `updated_at` trigger.
`view_participants` rebuilt with `view_id` FK to `compass_views.id`
(CASCADE), legacy columns dropped, RLS rewritten. Five orphan participant
rows deleted with operator authorization. Smoke test verified shape across
seven blocks; behavioral verification under RLS not exercised — gap caused
Brief 1.5.

**Brief 1.5 — RLS recursion fix (closed 2026-04-29).** Emergency repair.
Brief 1's `vp_*` policies preserved "self-and-workspace-based" semantics by
introducing `EXISTS (SELECT FROM view_participants vp2 ...)` self-references,
which 42P17-recursed when application code first exercised them. Six SQL
deliverables (Steps A-F), one per round-trip. Owner-level checks rewritten
to reference `compass_views.owner_user_id` directly; participant-level checks
reference `view_participants.user_id` directly. Editor-delegation semantics
removed pending future non-recursive mechanism. `vp_select` had a residual
reference to dropped `resource_id` column (Brief 1 missed it); rewrite
removed it.

**Brief 2 (initially halted, then revised, then closed 2026-04-29).**
Application code fork. Original draft halted by fresh agent on discovery
that (a) the Share dialog physically lives in `my-notes.html` line 5432,
(b) MY NOTES had six other `view_participants` call sites silently broken
post-Brief-1, (c) invitation notifications use the `notes` table
(`is_inbox=true`, `entity_type='view_invite'`) NOT a separate
`notifications` table. Architect re-scoped Brief 2 with carved exception for
MY NOTES `view_participants` call sites and corrected notification target.
Same agent resumed against revised brief. Shipped: full MY VIEWS persistence
fork to `compass_views`, auto-create default dashboard, pill-badge rendering,
eight `view_participants` call sites updated across both files, library
moved to localStorage with one-shot migration, accept-dialog rewritten.
Heartbeat 500 discovered post-deploy and small follow-on edit pre-checked
participant existence before PATCH.

**Brief 2.5 — Share dialog extraction (closed 2026-04-29).** Operator
overrode architect's proactive-load recommendation in favor of extraction
(architectural durability over demo timing). Share-dialog functions extracted
from `my-notes.html` into shared module (`share-dialog.js`). Both surfaces
consume the module independently. MY VIEWS' Share button works on first
load without requiring MY NOTES navigation.

**Brief 3 — Multi-session verification (in progress 2026-04-29 → 2026-04-30).**
Originally scoped as the closeout brief — operator-driven verification
protocol across three browser sessions. Six emergency repair briefs
intercalated when each protocol step surfaced a different defect:

- **Brief 3.1 (closed 2026-04-29):** ReferenceError on Angela's session.
  Inline onclick markup at lines 745, 1255 emitted `_notesOpenNote` instead
  of `_viewsOpenNote`. Two-line fix.

- **Brief 3.2 (closed 2026-04-29):** Inbox row dispatch repair. Brief 3.1
  fixed ReferenceError but invitations still opened as note tiles instead
  of raising acknowledgement form. Inline onclick at line 745 always won
  over the smart-routing delegated handler. Fix: emit `data-noteid` and
  `data-viewid` attributes, remove inline onclick. Tray chips at line 1255
  left alone (legitimately open notes).

- **Brief 3.3 (closed 2026-04-29):** Dialog overlay class repair. Lines 778,
  805 emitted `notes-invite-dialog-overlay` class which had no CSS in MY
  VIEWS context — overlay rendered with `position: static` below viewport,
  invisible. Fix: change to `views-invite-dialog-overlay`.

- **Brief 3.4 (closed 2026-04-29):** Systematic surface-fork token sweep.
  Two phases with operator-inspection gate. Phase 1 enumeration found 6 bug
  sites in my-views.html (drag indicator class names at lines 2815/2829/2845;
  DOM ID lookups at 849/850; overlay class at 3221) plus shared module fix
  in share-dialog.js. Generic class rename: `notes-invite-dialog-overlay`
  and `views-invite-dialog-overlay` → `invite-dialog-overlay` with both
  surfaces' CSS defining the rule.

- **Brief 3.5 (closed 2026-04-29):** Two-phase, D2 + D3 bundled. D2: inbox
  doesn't refresh in recipient's session without hard reload. Root cause:
  my-views.html:541 calls `window._notesStartInboxPoll`, not
  `window._viewsStartInboxPoll`. The MY VIEWS-scoped poll was fully
  orphaned. Fix: direct local call, no window indirection (Option A). D3:
  synthetic IDs (`wt-`, `ph-` prefixes) passed to UUID-typed
  `notes?id=in.(...)` query produce 400. Fix: one-line filter at
  my-views.html:3399. D4 (decline-stale-UI from `window._notes` array
  identity defect) deferred to post-arc cleanup.

- **Brief 3.6 (closed 2026-04-30):** D6 — MY VIEWS load path queries owned
  dashboards only (`compass_views?owner_user_id=...`), never
  `view_participants` for accepted shares. After hard refresh, accepted
  shared dashboards disappear. Root cause: `_notesRestoreSharedViews`
  function exists in my-notes.html (lines 710-782) but does NOT exist in
  my-views.html, and `_notesLoadWorkspace` doesn't call any equivalent.
  Fix: port `_notesRestoreSharedViews` verbatim into my-views.html, call
  from `_notesLoadWorkspace` before `_notesCleanTiles()`. Same defect class
  as Brief 3.5 — Brief 2's MY VIEWS fork omitted MY NOTES infrastructure.

- **Brief 3 protocol — ongoing.** §3.4 acceptance flow verified. §3.5
  pill-badge verification surfaced D8 (left-rail DASHBOARDS panel filters
  out shared views via `_notesRenderLibrary` line 1595 explicit
  `_isSharedView` exclusion). Under operator adjudication.

### What was learned

#### Architect-level mistakes I own

1. **Misread agent table-name probing as fishing.** When the coding agent
   showed the operator a 27-name probe enumerating plausible Supabase table
   names, I jumped to "agent is fishing, methodology is broken" without
   asking the operator what the agent had actually done in prior session
   work. The operator's correction (the agent had already run real SQL
   queries; the probe was earlier-session investigative work) was warranted.
   Lesson: **the operator's direct evidence about what an agent did beats
   the architect's inference from a hand-off snippet.**

2. **Read past schema inventory's flagged constraint.** The schema inventory
   at line 1231 explicitly noted `notes.entity_type` CHECK was unusually
   narrow — restricted to `view_invite` / `view_removed` — and flagged "may
   be a mis-named constraint or indicate this table is used for view
   invitations only in practice." That second clause was the answer. I read
   the flag and didn't investigate, then directed Brief 2 to write
   notifications to the wrong table.

3. **Brief 1 scoped without consumer enumeration.** Brief 1 was "schema-only
   by design," and I authorized closure on a smoke test that verified shape.
   What the smoke test did not verify: that other application code consuming
   the changed schema would still work. MY NOTES had six `view_participants`
   call sites writing dropped columns; all silently broke post-Brief-1,
   surfaced only when Brief 2's fresh agent investigated.

4. **Brief 1's smoke test verified RLS existence, not RLS behavior.** The
   four `vp_*` policies existed with the expected CRUD coverage. The smoke
   test did not exercise them under realistic INSERT/UPDATE/DELETE queries.
   The 42P17 recursion only manifested when application code attempted real
   writes.

5. **Misread operator's "treats notifications as notes" symptom as same bug
   Brief 3.1 was meant to fix.** ReferenceError throws and does nothing
   visible; treating notifications as notes means the click IS succeeding
   and dispatching to the wrong handler. Different symptoms, different bugs.
   I should have asked the agent to verify the symptom matched the bug
   before they shipped.

6. **Predicted bug shapes from code reading rather than capturing DB ground
   truth first.** During the D2-investigation phase I was wrong twice in a
   row about what the symptoms meant — first about Angela not receiving
   notifications (she does), then about Accept failing (it works). The
   Query A/B/C protocol that finally clarified the picture should have been
   step one.

7. **Gave operator placeholder SQL with `<Angela's user_id>` that broke the
   parser due to apostrophe.** Operator-run queries should be ready to
   execute, not require manual substitution that introduces syntax errors.

8. **Earlier instruction to "test inbox propagation by inviting Ron and
   watching Angela" was incoherent.** Operator caught it; I corrected to
   single-recipient observation.

9. **Filename naming convention.** I named all briefs with `cmdNNN`
   placeholders without Brief identity in filename. Caused operator
   confusion when files lost mapping to arc. Fixed late in the cycle by
   recognizing Brief identity should be in the filename from the start.

#### Agent-level mistakes worth journaling

10. **Iron Rule 37 violations at scale (original Brief 2 agent).**
    Pre-revision Brief 2 agent narrated thinking in real time across the
    entire work-cycle: design deliberation, reconsidered choices,
    "actually wait" loops, per-edit reasoning paragraphs. Transcript ran
    into thousands of lines. Operator pushed back on credit cost; correction
    issued mid-arc with concrete reinforcement language. Subsequent briefs
    adopted "Per Iron Rule 37 — silent work-mode acknowledged" opening
    pattern and produced crisp transcripts. Brief-level §0 reinforcement
    works. Doctrine sharpening still needed.

11. **Bundled-batch deliveries crossing operator-inspection gates (Brief 1
    agent).** Three batches that internally bundled steps the brief
    structured as serially-gated. Database caught the gate violation as an
    integrity error; agent restructured to one-step-per-deliverable on
    operator instruction.

12. **Operator-authorization solicitations in natural-language templates
    (Brief 1 agent).** Recovered to explicit numbered options with concrete
    consequences.

#### Operator decisions worth preserving

13. **Prior MY VIEWS dashboard data declared unrecoverable.** Operator opted
    not to investigate Supabase PITR recovery. Forward stance: rebuild on
    `compass_views` foundation post-Brief-2.

14. **Tier 2 vocabulary canonical, not legacy.** When CMD100's vocabulary
    unification needed a direction, operator chose the user-facing labels
    as the surviving names. The user-facing identifier is the most stable
    layer; storage and dispatch can churn. Reusable as a default
    architectural principle.

15. **Architectural durability over demo timing on Brief 2.5.** Architect
    recommended proactive-load fix (5-line band-aid). Operator overrode in
    favor of extraction. Operator's instinct on architectural dependencies
    wins over architect's instinct on timing in cases where the coupling
    will keep biting.

16. **Brief 3.5 §8.2 partial-pass acceptance.** Revocation auto-propagation
    (dashboard disappears from invitee's DASHBOARDS list when owner revokes
    access, without hard refresh) deferred to post-arc cleanup. End-of-May
    demo timing prioritized. (Note: Brief 3.6 may have transitively
    addressed the hard-refresh half of this defect; live-session
    propagation still deferred.)

17. **D4 (decline-stale-UI from `window._notes` array identity defect)
    deferred.** User-facing impact bounded — Decline persists in UI until
    hard refresh; Accept masks the bug via full workspace re-render.
    Demo-tolerable.

### Operating-practice lessons crystallized

These are durable across the project; promoted from this arc. Sequential
lesson numbering picks up from the existing journal's master sequence.

- **Lesson 25: Schema migration consumer enumeration.** Brief-authoring
  step: enumerate all surfaces that read/write the changed schema before
  authorizing the migration, even if the migration itself doesn't modify
  those surfaces. Failure mode in this arc: Brief 1 was schema-only;
  consumers broke silently. Discovery cost: Brief 2 fresh-agent halt
  diagnosis.

- **Lesson 26: RLS behavioral verification.** Schema migration smoke tests
  touching RLS must include INSERT/UPDATE/DELETE round-trips against the
  policies, not just policy introspection via `pg_policy`. Failure mode in
  this arc: Brief 1 verified policies existed; recursion in their
  evaluation only surfaced when application code wrote. Discovery cost:
  Brief 1.5 emergency repair after Brief 2 deploy 500'd.

- **Lesson 27: Iron Rule 37 brief-level reinforcement.** Standard §0
  language: "no mid-cycle narration, no reconsidered-choices narration,
  per-edit reasoning capped at one sentence, halt instead of narrating
  reconsiderations." Use this until durable doctrine amendment lands.
  Failure mode in this arc: pre-correction Brief 2 agent narrated at scale,
  consuming credits and operator time. Recovery: brief-level reinforcement
  produced visibly cleaner agent behavior in Briefs 1.5, 2.5, 3.1-3.6.

- **Lesson 28: Operator-asks-architect-first.** When agent behavior looks
  wrong, ask the operator what the agent actually did before drawing
  conclusions from hand-off snippets. Failure mode in this arc: I jumped
  to "agent is fishing" on a probe display I'd misclassified.

- **Lesson 29: Flagged constraints are investigation prompts.** Schema
  inventory documents flagging "this constraint may indicate X" are signals
  to resolve before brief authoring, not annotations to read past. Failure
  mode in this arc: I read line 1231's flag and proceeded to the wrong
  notification table.

- **Lesson 30: Operator's architectural instinct over architect's timing
  instinct.** When operator and architect disagree on a fix's shape,
  operator's call on durability generally wins over architect's call on
  speed. Failure mode in this arc: my proactive-load recommendation would
  have preserved the MY NOTES coupling that's bitten this arc twice;
  operator's extraction call eliminated the coupling.

- **Lesson 31: Operator-inspection gates require one step per round-trip.**
  Bundled deliverables that span gates violate the briefing contract.
  Multiple briefs since Brief 1 have honored this — Brief 1.5 (six
  round-trips), Brief 2.5 (no gating issues), Brief 3.4 (sweep enumeration
  ≠ apply-fixes, gate between).

- **Lesson 32: Operator authorization solicitations require numbered options
  with concrete consequences.** Not natural-language templates. Failure
  mode in this arc: Brief 1 agent's "add a sentence such as…" pattern.
  Recovery: explicit numbered options.

- **Lesson 33: Surface-fork-as-verbatim-copy is a documented defect class.**
  When forking surfaces, agents must explicitly substitute surface-specific
  identifiers (function names, class names, DOM IDs, drop-indicator strings,
  global names — possibly more). Failure mode in this arc: Brief 2 cloned
  MY NOTES code into MY VIEWS preserving `_notesOpenNote` calls,
  `notes-*` class strings, `notes-*` DOM IDs, and `_notesStartInboxPoll`
  references. Discovery cost: Brief 3.1, 3.2, 3.3, 3.4, 3.5 — five
  emergency repair cycles. Future surface-fork briefs need an explicit
  verification step that grep-checks for cross-surface identifier
  references AND a parity check against the source surface's load-path
  function calls.

- **Lesson 34: Latent surface-fork defects can persist undetected based on
  operator habit.** Drag-and-drop indicator and section-collapse on MY
  VIEWS were broken since Brief 2 shipped. Operator never tried those
  flows. Surfaced only when Brief 3.4's systematic sweep ran. Argues for
  proactive sweeps as fork-completion discipline.

- **Lesson 35: Cosmetic naming inconsistencies should be a separate cleanup
  arc.** MY VIEWS exposes globals as `window._notes*` despite being MY
  VIEWS functions. Confusing but not broken. Bundling cosmetic renames
  with bug fixes adds risk for no functional benefit.

- **Lesson 36: Visual smoke tests over DOM-presence smoke tests.** Brief
  3.3's predecessor failed because confirming "an overlay exists in DOM"
  was insufficient when CSS wasn't applied. Smoke tests for visual UI must
  specify "operator can SEE this" as success criterion.

- **Lesson 37: Layered defects need diagnostic rigor.** Briefs 3.1, 3.2,
  3.3 each surfaced the next layer of defect at the same site after the
  prior repair. Agents should look for layered defects post-fix, not declare
  complete after literal scope. Brief 3.3's smoke test §7 anticipated
  partial-pass on view_invite while view_removed worked — that explicit
  framing is the right pattern.

- **Lesson 38: Cross-user functionality requires multi-session smoke tests
  in the original brief.** Brief 2's smoke test couldn't catch
  cross-user-only bugs because operator can't invite themselves. Bugs only
  surfaced in Brief 3 verification. Original briefs that produce
  cross-user features must specify multi-session smoke tests, not defer to
  verification.

- **Lesson 39: When behavior is unexpected, query the DB before reasoning
  about the code.** Code reading should follow the data state, not predict
  it. Failure mode in this arc: I was wrong twice in a row about D2/D3/D5
  symptoms because I reasoned from code instead of capturing DB ground
  truth. Recovery: Query A/B/C/D/E protocol clarified the picture in five
  queries.

- **Lesson 40: Whack-a-mole as a bundling signal.** When the same class of
  defect surfaces three times in three smoke tests, that's a signal to
  commission a systematic sweep rather than continuing to repair instances
  one at a time. Failure mode in this arc: Briefs 3.1-3.3 each fixed an
  instance; Brief 3.4 was the systematic sweep that should have been
  commissioned earlier.

- **Lesson 41: Realtime decisions for one table do not transitively apply
  to other tables.** Brief 1 §2.6 decided "no Realtime for `compass_views`"
  for last-write-wins semantics on dashboard data. That decision didn't
  address whether `notes` table (carrying inbox notifications) needed
  Realtime for inbox functionality. D2 surfaced that gap. Future schema
  briefs touching realtime should explicitly enumerate which related
  tables depend on the same propagation mechanism.

- **Lesson 42: MY VIEWS load-path was systematically incomplete relative
  to MY NOTES.** Brief 2's fork copied much of MY NOTES' structure but
  missed parts of the load orchestration. Brief 3.5 found the missing
  inbox poll invocation. Brief 3.6 found the missing `_notesRestoreSharedViews`
  call. Future surface-fork briefs should explicitly enumerate every
  entry-point function (load, init, refresh, etc.) and verify the fork's
  parity with the source. A "load path parity check" should be a standard
  verification step in surface-fork briefs.

- **Lesson 43: DB-correct behavior can mask UI defects.** Multiple defects
  in this arc had correct DB transactions paired with broken UI sync (D4
  decline-stale-UI, D6 hard-refresh-loses-shared-dashboard, D8 left-rail-
  excludes-shared-views). The pattern: agent confirms via Supabase that
  the DB write succeeded, declares "feature works at DB level," but the
  user-visible behavior is still broken. Verification must include both DB
  state AND user-visible UI state, not either-or.

### What was decided architecturally

- **MY VIEWS persistence layer permanently forked from MY NOTES.**
  `compass_views` table with UUID PK is canonical home for MY VIEWS
  dashboards. `notes_workspace.state` is exclusively MY NOTES territory.

- **`view_participants` keys to `compass_views.id` via `view_id` FK with
  CASCADE.** Legacy `(workspace_owner_user_id, view_name)` composite key
  retired.

- **RLS posture for new MY VIEWS tables: hardcoded single-firm.** Matches
  existing codebase pattern. RLS posture upgrade is a separate cross-cutting
  arc.

- **Editor-delegation semantics on `view_participants` retired.** Owner-only
  writes pending future non-recursive mechanism (e.g.,
  `compass_views.editor_user_ids` array).

- **Invitation notifications use the `notes` table** with `is_inbox=true`
  and `entity_type='view_invite'` / `'view_removed'`. The schema
  inventory's flagged constraint at line 1231 is now confirmed-as-intended
  behavior.

- **Share dialog code lives in shared module file** (`share-dialog.js`),
  not in `my-notes.html`. Both surfaces consume independently.

- **Library moved from `notes_workspace.state.viewsWorkspace.library` to
  per-user localStorage.** One-shot read-only migration ran in MY VIEWS
  load path.

- **MY VIEWS load path now queries shared dashboards.** Brief 3.6 ported
  `_notesRestoreSharedViews` into my-views.html. On hard refresh, accepted
  shared dashboards hydrate alongside owned dashboards.

- **MY NOTES dashboard sharing remains non-functional.** MY NOTES dashboards
  live in `notes_workspace.state.views`, have no `compass_views` row to
  satisfy `view_id` NOT NULL FK. Per Brief 2 §7.5, expected coupling state
  pending architect adjudication.

### What's pending

**Near-term (this arc):**
- **D8 — left-rail DASHBOARDS panel exclusion.** Currently under operator
  adjudication for demo-criticality. If shipping: Brief 3.7 with one of
  three options (remove exclusion, group under owner, separate SHARED
  section). If deferring: arc closes here on partial-pass and D8 joins
  post-demo cleanup.

**Identified post-demo work:**

- **D2 inverse — revocation auto-propagation without hard refresh.** When
  Vaughn revokes Angela's access, Angela's session should reflect the
  removal without manual hard refresh. Brief 3.6 may have transitively
  addressed the hard-refresh half (since `_notesRestoreSharedViews` only
  returns accepted-and-not-revoked rows on load). Live-session propagation
  still deferred.

- **D4 — decline-stale-UI from `window._notes` array identity defect.**
  share-dialog.js's splice operates on the orphaned `window._notes`
  reference because both surfaces wholesale-reassign their local `_notes`
  variable inside `_notesLoadAll`, severing the reference. Decline persists
  in UI until hard refresh. Fix shape: replace assignment with mutate-in-place
  pattern at my-views.html:571 and my-notes.html:639.

- **FK validation on non-account-user dropdown selection.** Surfaced during
  Brief 2 testing. When user without ProjectHUD login is selected from
  Share dialog dropdown, INSERT silently fails. Fix: filter dropdown to
  only show users with accounts.

- **MY NOTES note-sharing schema adjudication (§7.5 coupling).** MY NOTES
  dashboard sharing is non-functional. Either retire as legitimate
  cross-link bug or accommodate via polymorphic `view_id` schema.

- **Editor-delegation semantics on `view_participants`.** Retired in
  Brief 1.5 to break recursion. Reintroduce via non-recursive mechanism
  if operating practice requires.

- **Library cross-device sync.** Currently per-user localStorage; doesn't
  sync across devices.

- **Cosmetic naming inconsistency.** MY VIEWS exposes globals as
  `window._notes*` despite being MY VIEWS functions. Defer to separate
  cleanup arc.

- **Pre-existing latent defects surfaced by Brief 3.4 sweep.** Drag-and-drop
  visual indicator on MY VIEWS (lines 2815, 2829, 2845 fixed in 3.4 but
  worth confirming visually). Section-collapse on Library/Inbox headers
  (lines 849, 850 fixed in 3.4).

**Doctrine candidates for ratification:**

- **Iron Rule 37 sharpening.** Concrete enforcement triggers: per-edit
  one-sentence reasoning cap, prohibition on reconsidered-choices
  narration, "thinking out loud" linguistic patterns as halt conditions,
  brief-level §0 reinforcement language as standard. Operator observed
  agent backsliding 2-3 cycles after scolding; durable amendment needed.

- **New iron rule (or amendment to Iron Rule 39): schema migration consumer
  enumeration** (Lesson 25 above).

- **New iron rule (or amendment to existing): RLS behavioral verification**
  (Lesson 26 above).

- **Mode C protocol §8.3 sharpening** (carried forward from prior Compass
  arc): "If your fix introduces a new ID/key/name that any downstream code
  consumes, you are out of Mode C."

- **New iron rule: agents preserve the brief's gating structure in their
  deliverable structure** (Lesson 31 above).

- **New iron rule: operator authorization solicitations require numbered
  options with concrete consequences** (Lesson 32 above).

- **New iron rule: surface-fork briefs require token-sweep verification
  AND load-path parity check** (Lessons 33, 42 above).

- **New iron rule: smoke tests for cross-user features must specify
  multi-session test execution** (Lesson 38 above).

- **Filename convention: encode Brief identity in filename from start**
  (e.g., `Brief-1-arc-name-purpose.md`).

Doctrine work queued for after the Compass arc closes.

### Notes on agent dynamics

This arc had three distinct agent personalities operating across briefs:

- **Pre-correction Brief 2 agent.** Strong technical work, weak Iron Rule
  37 discipline. Transcripted reasoning at scale. Cost real operator
  credits.

- **Brief 1 agent.** Mature engineering instincts (built precondition
  checks into Batch 2 SQL that let the database enforce gates the
  deliverable structure should have prevented). Bundled-batch and
  natural-language-prompt failures recovered cleanly under operator
  instruction.

- **Brief 1.5 / 2.5 / 3.1-3.6 agent (presumably continuing).** Excellent
  discipline. Acknowledged Iron Rule 37 explicitly at hand-off open,
  produced crisp work. Surfaced Brief 1's residual `resource_id` reference
  (Brief 1.5), recognized layered defects (Brief 3.3 → 3.4 escalation),
  caught architect's own diagnosis errors (e.g., "doesn't appear to block
  accept flow" framing in D3 was operator-corrected; agent revised in
  next-cycle hand-off). Now the proven baseline for this codebase.

The Brief 1.5 / Brief 2.5 / 3.1-3.6 agent should be the preferred continuity
agent for future work in this codebase.

### Architect-self-reflection: the cost of this arc

Two weeks of compounded technical debt from Brief 2's insufficient initial
scope produced seven follow-on briefs and roughly two days of operator
time. The core architectural decisions — schema fork, RLS rewrite, share
dialog extraction — all proved correct. The execution gap was in scoping
Brief 2's verification: it should have included (a) consumer enumeration
of MY NOTES code, (b) RLS behavioral verification, (c) cross-user smoke
tests, (d) surface-fork verbatim-copy verification, (e) load-path parity
check against MY NOTES. None of these are exotic; all are now journaled
as durable lessons for future briefs.

The cost was high but the lessons are real and will compound in future
work. Future Brief-2-class scope decisions in this project will benefit
from this arc's documentation.

---

*End of journal entry — 2026-04-30 — Compass MY VIEWS Persistence Fork
Arc Comprehensive Closeout (interim, pending D8 disposition).*
