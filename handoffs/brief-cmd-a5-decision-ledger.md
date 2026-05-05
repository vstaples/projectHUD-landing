# Brief · Decision Ledger surface · CMD-A5

## §0 — Standing rules for fresh agent

Read before proceeding.

**Iron Rule 36 — hand-off terseness.** Diff, smoke test result,
findings as one-liners. No narration in the hand-off.

**Iron Rule 37 — work silently mid-execution.** No diagnostic
narration. The only permitted mid-work communication is genuine
clarification questions when scope is ambiguous.

**Iron Rule 38 — consumer enumeration.** §10 enumerates
consumers. Verify on the way through. The function-duplication
awareness from §2 of the rule applies — if a function name
appears in multiple files, all instances must be enumerated.
This brief introduces a new surface module; verify no name
collisions with `accord-core.js`, `accord-capture.js`,
`accord-document.js`, or any other loaded JS.

**Iron Rule 39 — RLS / behavioral verification.** This brief
prescribes behavioral tests in §9.

**Iron Rule 40 — agent execution discipline.** Halt on missing
input. Terse transcript. Test instructions in handoff.

**Iron Rule 42 — CoC inviolability.** This surface renders
sealed (post-END) decision nodes exclusively. Pre-END nodes are
not displayed. *This surface is mostly read-only against the
CoC; the only mutations are belief-adjustment writes (§5),
which are themselves sealed at the next meeting END and
become immutable thereafter.*

**Iron Rule 44 — typed causal edges as primitive.** The Decision
Ledger renders the edge graph (supersedes, supports, weakens,
contradicts, answers, raises) directly. Belief-adjustment
chains use the same edge primitive.

**Iron Rule 45 — declared belief, not measured confidence.**
This is the brief's central doctrinal commitment. UI vocabulary
strictly avoids "confidence," "probability," "certainty," and
related framings. All belief expressions are declarations made
by named persons at named moments. See §5 for the canonical
vocabulary.

**Iron Rule 47 (amended) — schema-existence verification.**
Apply to every column reference. `accord_*` PKs are
`<table>_id` (not `.id`). The amendment broadened scope from
SQL to JS — verify column references in JS too. (R-47-extension
is provisional; apply in spirit.)

**Iron Rule 50 — HTTP-based behavioral verification.** Tests
that depend on JWT context (firm isolation, RLS) are
HTTP-based, not SQL-only.

**Provisional rules carried forward (not yet ratified):**
- R-44-extension — class-conditional behavior on edge-derived
  chips must be applied at chip-construction time, not by
  per-case post-processing. CMD-A4 §9.4 surfaced.
- R-47-extension — verification before reference applies to JS
  column references, not just SQL FK declarations.
- R-38-extension — function-name collision check across all
  loader files at brief draft time.
- Sentinel-test loaded-code — ensure verification scripts
  exercise the actually-deployed code, not stale copies.

**Multi-issue post-deploy.** If the operator reports multiple
issues after deploy, fix ONE per work-cycle with one hand-off
per fix.

---

## §1 — Purpose

Build the Decision Ledger surface — the third Accord tab and
the surface that makes Accord legible *as a decision system* to
the people who consume its output (regulated-industry buyers,
auditors, retrospective reviewers).

After CMD-A5 ships:

1. The Decision Ledger tab renders all sealed `tag = 'decision'`
   nodes for the current firm, organized for quick scanning.
2. Each decision row exposes: the decision summary, who
   declared it, when (meeting + date), the thread it lives in,
   declared-belief state (current value + history), and edge-
   derived treatments (superseded badge, supporting/weakening
   counts, contradicts callout).
3. Decisions can be expanded to reveal the supporting evidence
   chain (nodes connected by `supports`, `weakens`,
   `contradicts`, `cites` edges).
4. **Belief adjustments can be declared on sealed decisions.**
   This is CMD-A5's only mutation surface. Adjustments write to
   `accord_belief_adjustments` and broadcast on a meeting
   channel during running meetings (or are queued for the next
   meeting if no meeting is running).
5. Cross-surface navigation works: clicking a thread name jumps
   to Living Document; clicking a meeting name jumps to a
   meeting-scoped Living Document view; clicking the
   declared-belief history opens a per-decision detail panel.
6. Filter chips: tag (decisions only — but kept for UI parity),
   status (active / superseded / contradicted), declared-
   belief (high / mixed / low / none-declared), edge-presence
   (has supporting evidence / has counter-evidence /
   superseded / contradicted).

CMD-A5 is the surface where Iron Rule 45 stops being
architecture and becomes vocabulary the user reads. The
brief's editorial register matters — Accord cannot compromise
on declared-belief framing and remain coherent for regulated
buyers.

---

## §2 — Scope

### In scope

- New file `js/accord-ledger.js` — Decision Ledger surface
  module, IIFE-wrapped, lazy-init via `accord:surface-changed`
  event (mirrors `accord-document.js` pattern)
- Modify `accord.html` — replace the Decision Ledger
  placeholder with the surface markup; load
  `accord-ledger.js`; add ledger-specific CSS
- The decision-list rendering with edge-derived treatments
- The expansion panel (evidence chain) per decision
- The belief-adjustment composer (text + delta
  declaration)
- The per-decision detail panel (declared-belief history)
- Filter chips per §6
- Cross-surface navigation hooks
- Behavioral tests per §9 — including the doctrinal
  vocabulary check (§9.8)
- Version pin bump to CMD-A5

### Out of scope

- Real-time updates when decisions are sealed in another
  session — CMD-A4 deferred this; CMD-A5 inherits the manual-
  refresh pattern (refresh on tab-switch and on explicit
  refresh action)
- Calibration scoring of declared beliefs against outcomes —
  deferred to v0.2+
- The `accord_user_to_resource()` helper migration — folded
  into CMD-A6 per build brief §4.5
- Compass-side action-status resolver (CMD-COMPASS-RESOLVER
  candidate) — CMD-A4 deferred this; CMD-A5 inherits the
  default-to-`active` behavior for action nodes (Decision
  Ledger doesn't show actions, so this rarely surfaces here)
- PDF rendering of decision ledger pages — CMD-A7
- Digest & Send of decision ledger — CMD-A6
- Edit / retract of belief adjustments post-seal (the
  `retracts` edge type exists in substrate but isn't surfaced
  here; future polish)
- Polish for the CMD-A4 §9.4-surfaced cross-thread chip
  navigation in `accord-document.js` (separate CMD if
  desired; CMD-A5 doesn't touch document.js)
- Top-nav brand-meta cosmetic from CMD-A4 finding 2 (separate
  one-line polish; can bundle with this CMD if trivial)

---

## §3 — Surface structure

Mirrors the established three-region pattern from `accord-
document.js` but with different content roles.

```
+-----------------------------------------------------------+
| TOP NAV (5 tabs — Decision Ledger active)                 |
+-----------------+--------------------+--------------------+
| FILTER RAIL     | DECISION LIST      | DETAIL PANEL       |
| (left, ~250px)  | (center, fluid)    | (right, ~340px,    |
|                 |                    |  collapsible)      |
| - Search box    | One row per        |                    |
| - Tag chips     | decision, sorted   | When a decision is |
| - Status chips  | most-recent first  | selected:          |
| - Belief chips  | by sealed_at       | - Full summary     |
| - Edge chips    |                    | - Thread + meeting |
| - Aggregate     | Click row → opens  |   crumb            |
|   counts        | detail panel       | - Declared-belief  |
| - Refresh btn   |                    |   history          |
|                 |                    | - Evidence chain   |
|                 |                    | - Adjustment       |
|                 |                    |   composer         |
+-----------------+--------------------+--------------------+
```

### §3.1 Region styling

CSS tokens per Style Doctrine v1.7. Match the visual register
of `accord-document.js`:

- Filter rail: `--bg1` background, IBM Plex Mono labels for
  chip groups
- Decision list: `--bg0` background, decision rows on
  `--surface-panel` cards
- Detail panel: `--bg1` background, slide-in animation when
  opening (mirrors agenda rail's behavior in Live Capture)
- Empty states: same visual register as `accord-document.js`'s
  empty states (per CMD-A4 §4.4)

### §3.2 Lazy-init pattern

Match `accord-document.js` exactly:

```javascript
(() => {
  'use strict';
  const $ = id => document.getElementById(id);

  const local = {
    initialized:    false,
    decisions:      [],         // sealed decision nodes
    threads:        {},         // { thread_id: thread } for crumb rendering
    meetings:       {},         // { meeting_id: meeting } for crumb rendering
    edges:          [],         // edges where from_node OR to_node is a decision
    adjustments:    [],         // belief adjustments for visible decisions
    nodeIndex:      {},         // { node_id: node }
    activeDecision: null,       // node_id of currently expanded decision
    activeFilters:  _defaultFilters(),
  };

  // ... etc
})();
```

Public surface at module bottom:

```javascript
window.AccordLedger = {
  _state:           local,
  _renderList:      _renderList,
  _selectDecision:  _selectDecision,
  _refresh:         _refresh,
};
```

---

## §4 — Decision row rendering

Each decision row contains:

1. **Decision summary** (the `summary` text from `accord_nodes`)
2. **Declared by** (resolved from `created_by` → `users.name`)
3. **When** (formatted `sealed_at` — "in [Meeting Title], [Date]")
4. **Thread crumb** (clickable; navigates to Living Document
   filtered to that thread)
5. **Edge-derived badges** (per §5)
6. **Declared-belief indicator** (per §5)

Visual treatment:

- Active decisions: full opacity, no decoration
- Superseded decisions: strikethrough on summary, `superseded`
  badge with arrow to the superseding decision (clickable)
- Contradicted decisions: red `contradicted` corner ribbon
- Decisions with high counter-evidence weight: amber edge

These treatments are **edge-derived** (Iron Rule 44). The
rendering function reads the edge table; no per-node "status"
column is consulted beyond the `accord_nodes.status` field that
CMD-A1 schema includes (which itself reflects edge-graph state
via the seal trigger or future updaters).

Per R-44-extension: class-conditional behavior on chips and
badges must be decided at construction time, not by post-
processing. CMD-A4's bug-fix pattern is the model.

### §4.1 Sort order

Default: most-recent first by `sealed_at desc, node_id desc`.
Filtering reorders within sort.

Future: thread-grouped view as alternative sort. Out of scope
for v0.1; the mechanism for layout-switching can be added in
polish later.

### §4.2 Pagination / virtualization

For v0.1, render all decisions in a single scroll. If a firm
exceeds ~500 sealed decisions, render performance becomes a
concern; out of scope for v0.1, queue for v0.2.

The brief assumes early adopter firms have <100 sealed
decisions. Architect's bet.

---

## §5 — Belief declarations (Iron Rule 45)

This is the doctrinal core of CMD-A5.

### §5.1 Vocabulary contract

The UI uses **declared belief**, not "confidence." Strict
prohibitions:

- ❌ "confidence: 80%" / "confidence level: high"
- ❌ "probability: 0.85" / "probability of success"
- ❌ "certainty score" / "uncertainty quantification"
- ❌ "meter" / "gauge" — framing implies measurement
- ❌ Bayesian language ("posterior," "prior," "likelihood")
- ❌ "AI estimates" / "we predict" / "the model says"

Allowed vocabulary:

- ✅ "[Name] declares belief: high"
- ✅ "Declared belief in this decision: mixed"
- ✅ "Belief adjusted to: low — [rationale]"
- ✅ "Adjustment by [Name] on [Date]"
- ✅ "Belief history" (for the timeline of declarations)

### §5.2 Belief levels

Three discrete levels (NOT a continuous scale — discreteness
is part of the doctrinal commitment):

- **high** — declarer believes the decision is sound and would
  defend it
- **mixed** — declarer believes the decision is sound but with
  qualifications, or believes parts but not whole
- **low** — declarer believes the decision is unsound, has
  weakened over time, or that supporting evidence has been
  contradicted

Optional fourth state (default for any decision with no
explicit declaration): **none-declared**. This is the absence
of declaration, not a fourth belief level.

### §5.3 Belief-adjustment composer

Located in the detail panel. Components:

- **Belief level selector** — three buttons: "high" / "mixed"
  / "low". Mutually exclusive.
- **Rationale text** — required, free-form. Placeholder:
  "Why this declaration?"
- **Submit button** — labeled "Declare belief" (NOT "Submit"
  or "Save"; the verb matters).

When clicked:

1. Validates: belief level chosen + rationale non-empty.
2. Inserts a row in `accord_belief_adjustments` with:
   - `firm_id` from session
   - `target_node_id` from active decision
   - `delta` mapped from level: `high` → `+1`, `mixed` → `0`,
     `low` → `-1` (the substrate uses an integer delta;
     the surface translates to UI levels)
   - `rationale` from text
   - `declared_by` from `auth.uid()`
   - `declared_at` defaults to `now()`
3. Adjustment row's `sealed_at` is `NULL` until next meeting END
   triggers the seal mechanism (CMD-A1 trigger handles this).
4. Composer resets; detail panel re-renders to include the new
   declaration in the history.
5. If a meeting is running, broadcast on `accord:meeting:{id}`
   carrying `accord.belief.declared` event (declared in the
   capture surface's meeting context). If no meeting running,
   the declaration is queued and will be sealed by the next
   meeting END.

### §5.4 Belief level aggregation

For the row indicator (§4.6) and the history panel:

- Aggregate the declared-belief level using the **most recent
  declaration per declarer**, not summing or averaging.
- If multiple declarers, show the **most recent declaration
  overall** as the headline level, with a count: "high (3
  declarers, most recent: [Name], [Date])."
- The history panel shows the full timeline of declarations
  with delta direction (▲ raised, ▼ lowered, ▬ no-change).

This is **not a measurement.** The aggregation rule is a
display convention. Iron Rule 45 forbids quantitative summaries.

### §5.5 Two-dimensional action confidence note

The Evidence Layer brief §4.4 specifies that action nodes have
two-dimensional belief: "will it complete" (Compass owns) and
"will it address the need" (Accord owns). The Decision Ledger
does NOT show action nodes — it shows decisions only. So this
2D distinction doesn't surface here.

When a future surface (CMD-A6 Digest, or a hypothetical Action
Ledger) shows action nodes, it will need this distinction. Out
of scope for CMD-A5.

---

## §6 — Filter chips

Four chip groups in the filter rail.

### §6.1 Tag chips

For UI parity with the Living Document. Decision Ledger
filters to `tag = 'decision'` by default; the chip is shown
disabled-but-on so the filter rail register matches the
Living Document. (Alternative: omit the tag chip group
entirely. Architect prefers parity.)

### §6.2 Status chips

Three chips:
- **active** — no superseding edge from this decision
- **superseded** — has at least one outgoing `supersedes` edge
- **contradicted** — has at least one incoming `contradicts`
  edge of substantial weight

Default: all three on.

### §6.3 Declared-belief chips

Four chips:
- **high**
- **mixed**
- **low**
- **none-declared**

Default: all four on. Filter applies to the row's headline
declared-belief level (per §5.4 aggregation).

### §6.4 Edge-presence chips

Four chips (opt-in by default — match `accord-document.js`'s
edge chip pattern):
- **has supporting evidence** — incoming `supports` edges
- **has counter-evidence** — incoming `weakens` edges
- **superseded** — outgoing `supersedes` edges
- **contradicted** — incoming `contradicts` edges

Default: all four off (opt-in). When chips are off, no edge-
presence filter applies.

### §6.5 Search box

Text search over decision summary. Case-insensitive substring
match. Live filter (no submit required).

### §6.6 Aggregate counts

Below the chips: total decisions matching current filters,
broken down by status. Updates live as filters change.

```
12 decisions matching
  9 active
  2 superseded
  1 contradicted
```

---

## §7 — Detail panel (right column)

Slide-in when a decision row is clicked. Closeable via close
button or by clicking outside.

### §7.1 Header

- Decision summary (full text — wrap, no truncation)
- Crumb: thread → meeting → date
  - Thread name clickable → navigates to Living Document
  - Meeting name clickable → navigates to Living Document
    filtered to that meeting

### §7.2 Declared-belief history (§5.4)

Timeline of all declarations on this decision. Most recent first.
Each row:

```
[level] · [Name] · [date]
"[rationale]"
```

If no declarations: "No belief declarations yet."

### §7.3 Evidence chain

The decision and its connected nodes via the edge graph.
Renders the subgraph rooted at the decision, expanding two
hops:

- 1-hop incoming `supports` / `weakens` / `contradicts` /
  `cites` → "Evidence" section
- 1-hop incoming `answers` (where this decision answers a
  question) → "Resolves" section
- 1-hop outgoing `supersedes` → "Supersedes" section
- 1-hop incoming `supersedes` → "Superseded by" section
- 2-hop: optional "Show extended chain" button (out of scope
  for v0.1; reserved as polish)

Each evidence node renders as a clickable chip showing tag +
summary. Click navigates to Living Document with that node
focused.

### §7.4 Belief-adjustment composer (§5.3)

Always visible at the bottom of the detail panel when a
decision is active. Submit button labeled "Declare belief."

After submission:
- Row inserts into `accord_belief_adjustments`
- Detail panel re-renders to include new declaration
- Composer resets (level cleared, text cleared)
- Toast confirmation: "Belief declared." (NOT "Saved.")

---

## §8 — CMD-A4 polish bundling (optional)

The architect leaves it to the agent to bundle these CMD-A4
finding cleanups OR defer to a separate polish CMD:

**Option A — bundle with CMD-A5:**
1. Top-nav brand-meta in `accord.html` derives from
   `window._PROJECTHUD_VERSION` instead of hardcoding "CMD-A3"
   text. (CMD-A4 finding 2.)

**Option B — defer to a polish CMD:**
None of CMD-A4's findings block CMD-A5. All can wait.

**Architect's recommendation:** Option A for the brand-meta
fix (it's one line and the visible "CMD-A3" label is now
two CMDs stale). Defer the Compass-side action resolver
(CMD-COMPASS-RESOLVER candidate) and the test data residue
cleanup — both are outside CMD-A5's scope.

---

## §9 — Behavioral verification

The agent runs these tests and reports results in the hand-off.
Per Rule 50, all tests are HTTP-based (browser console + UI
clicks), not SQL-only.

### §9.1 Read-only against sealed nodes (Iron Rule 42)

1. Identify a recent unsealed decision node (one captured but
   meeting hasn't ended). Verify it does NOT appear in the
   Decision Ledger list.
2. End the meeting (seal the node). Refresh the Decision
   Ledger. Verify the now-sealed decision DOES appear.
3. **PASS** = unsealed not visible; sealed becomes visible
   after refresh.

### §9.2 Edge-driven rendering (CORE — Iron Rule 44)

1. Identify a sealed decision A. Verify its initial rendering
   (no badges).
2. Via SQL: insert a `supersedes` edge from a new decision B
   (also sealed) to A, with `sealed_at` set on the edge row.
3. Refresh the Decision Ledger. Verify:
   - Decision A now shows the `superseded` badge with arrow
     pointing to B.
   - Decision B exists in the list (no badges yet).
4. Via SQL: insert a `contradicts` edge from a new decision C
   (sealed) targeting A.
5. Refresh. Verify A now shows BOTH the superseded badge AND
   the contradicted ribbon.
6. **PASS** = visual treatments derived purely from edge graph;
   no application code change required.

### §9.3 Filter chips

For each chip group:
1. Default state shows all decisions.
2. Toggle one chip off; verify list filters correctly.
3. Toggle multiple chips; verify intersection logic.
4. Reset to default; verify list restores.
5. **PASS** = chip filters work as documented.

### §9.4 Belief declaration round-trip (Iron Rule 45)

1. Open a sealed decision in the detail panel.
2. Verify "No belief declarations yet" if applicable, or the
   existing history.
3. Compose a declaration: select "high", enter rationale,
   click "Declare belief."
4. Verify:
   - Toast appears with "Belief declared." text.
   - History section updates to include the new row with
     correct level, declarer name, date, and rationale text.
   - Composer resets.
5. Via SQL: verify a row inserted into
   `accord_belief_adjustments` with `delta = 1`,
   `target_node_id` matching the decision, `declared_by`
   matching `auth.uid()`, `sealed_at IS NULL`.
6. **PASS** = round-trip works; substrate state matches UI
   state.

### §9.5 Belief seal at next meeting END

1. Following §9.4, verify the new adjustment row has
   `sealed_at IS NULL`.
2. Trigger any meeting END (any meeting in the firm).
3. Refresh the Decision Ledger.
4. Verify (via SQL) the adjustment row now has
   `sealed_at IS NOT NULL` and `adjustment_hash IS NOT NULL`.
5. **PASS** = belief adjustments seal correctly via the
   existing CMD-A1 trigger.

### §9.6 Cross-surface navigation

1. From Decision Ledger, click a thread crumb. Verify Living
   Document opens with that thread selected.
2. From Decision Ledger detail panel, click an evidence node
   chip. Verify Living Document opens with that node focused
   (or as close to focused as the existing surface supports).
3. **PASS** = navigation hooks work without errors.

### §9.7 Cross-firm isolation

1. As user A in firm 1, count visible decisions in Decision
   Ledger.
2. As user B in firm 2 (use existing test fixture or seed if
   needed; per CMD-AEGIS-1 we now have working firm
   isolation), count visible decisions.
3. Verify counts are different (each user sees only their
   firm's decisions).
4. Try to declare belief on one of user A's decisions while
   logged in as user B (use the decision's `node_id` directly
   in the composer). Verify the insert is rejected by RLS.
5. **PASS** = firm isolation holds at both read and write
   layers.

### §9.8 Doctrinal vocabulary check (Iron Rule 45)

The agent greps the rendered DOM and JS source for prohibited
vocabulary:

```
grep -i "confidence\|probability\|certainty\|likelihood\|posterior\|prior" \
  js/accord-ledger.js accord.html
```

(Plus any inline strings the agent constructs at runtime.)

**PASS** = zero matches in the surface code (excluding code
comments where "prior" might appear in technical sense).
**FAIL** = any user-facing string contains prohibited
vocabulary.

The agent fixes vocabulary violations before hand-off; this is
the doctrinal-floor check, not just a finding.

### §9.9 Prior-CMD regression

1. Load Live Capture (CMD-A3 surface). Verify it loads and
   captures still work.
2. Load Living Document (CMD-A4 surface). Verify it loads and
   spine renders.
3. Load Decision Ledger (this CMD). Verify it loads.
4. Switch between tabs. Verify each surface re-initializes (or
   uses cached state) without errors.
5. **PASS** = no regression in CMD-A3 or CMD-A4 surfaces.

---

## §10 — Consumer enumeration (Iron Rule 38)

Files affected by this CMD:

| File | Effect |
|---|---|
| `accord.html` | Decision Ledger placeholder replaced with surface markup; loads `accord-ledger.js`; ledger CSS appended |
| `js/accord-ledger.js` | New file — surface module |
| `js/version.js` | Pin bump to CMD-A5 |
| `js/accord-core.js` | Verify `switchSurface()` dispatches `accord:surface-changed` with `surface: 'ledger'` payload (it should already, but verify); no other modification expected |

Files audited but not modified:

| File | Audit purpose |
|---|---|
| `js/accord-document.js` | Verify no name collisions on functions like `_renderList`, `_selectDecision`, `_refresh`, `_defaultFilters` |
| `js/accord-capture.js` | Same |
| `js/accord-core.js` | Verify `Accord._esc`, `Accord.state.me`, `accord:surface-changed` event dispatch are available |
| `js/cmd-center.js` | If any belief-declaration broadcast is wired (per §5.3 step 5), verify the channel naming pattern is consistent with post-CMD-AEGIS-1 firm scoping |

Tables read by this CMD:

| Table | Effect |
|---|---|
| `accord_nodes` | SELECT, filtered to `tag = 'decision'` and `sealed_at IS NOT NULL` |
| `accord_threads` | SELECT for crumb rendering |
| `accord_meetings` | SELECT for crumb rendering |
| `accord_edges` | SELECT where `from_node_id` or `to_node_id` is in visible decisions |
| `accord_belief_adjustments` | SELECT for history; INSERT for new declarations |
| `users` | SELECT for declarer name resolution |

The INSERT to `accord_belief_adjustments` is new mutation
behavior. Verify RLS allows authenticated users to INSERT
where `declared_by = auth.uid()` and `firm_id = my_firm_id()`,
and rejects all other INSERTs (especially cross-firm). CMD-A1's
RLS policies should already enforce this; the agent verifies
via §9.7 step 4.

No tables modified structurally. No schema changes. No new
RLS policies.

---

## §11 — What must work after this ships

1. Decision Ledger tab loads cleanly. Console banner shows
   CMD-A5.
2. All sealed decisions for the user's firm are visible.
3. Filter chips work per §6.
4. Detail panel opens on click; renders evidence chain and
   declared-belief history.
5. Belief-adjustment composer accepts input, validates,
   inserts row, updates history.
6. Belief adjustments seal at next meeting END.
7. Cross-surface navigation hooks work.
8. No regression in Live Capture (CMD-A3), Living Document
   (CMD-A4), or any Aegis-side functionality post-CMD-AEGIS-1.
9. Doctrinal vocabulary check (§9.8) passes — zero
   "confidence" / "probability" / etc. in user-facing strings.
10. If §8 Option A bundled: top-nav brand-meta correctly reads
    "CMD-A5 · Decision Ledger" (or whatever pattern the agent
    chooses for surface-aware brand-meta rendering).

---

## §12 — Smoke test

Operator runs after deploy:

1. Hard-refresh `accord.html`. Console banner shows CMD-A5.
2. Click Decision Ledger tab. Surface loads; decisions render.
3. Click a decision row. Detail panel opens with evidence
   chain + declared-belief history.
4. In the composer, select "high", type a rationale, click
   "Declare belief." Verify toast and history update.
5. End any current meeting (or trigger seal manually). Verify
   the new adjustment row's `sealed_at` populates (via SQL or
   refresh-and-inspect).
6. Toggle filter chips. Verify list updates correctly.
7. Click a thread crumb. Verify Living Document opens to that
   thread.
8. Switch back to Live Capture. Verify it still works.
9. Switch to Living Document. Verify it still works.
10. Spot-check: any non-Accord surface (Compass, Cadence) loads
    cleanly. No regression.

If smoke test cannot be run live: agent runs cURL / browser
console portions against staging; operator runs interactive
parts post-deploy.

---

## §13 — Hand-off format (Iron Rule 36)

Required output:

1. **Files modified / created** — one-liner per file.
2. **Diff** — unified diff for `accord.html`, `js/version.js`;
   full content for `accord-ledger.js`. If §8 Option A bundled,
   include diff for the brand-meta change.
3. **Smoke test result** — pass / fail / not run.
4. **Behavioral verification results** — per §9 subtest:
   - §9.1 Read-only sealed: PASS / FAIL
   - §9.2 Edge-driven rendering: PASS / FAIL
   - §9.3 Filter chips: PASS / FAIL
   - §9.4 Belief declaration round-trip: PASS / FAIL
   - §9.5 Belief seal at meeting END: PASS / FAIL
   - §9.6 Cross-surface navigation: PASS / FAIL
   - §9.7 Cross-firm isolation: PASS / FAIL
   - §9.8 Doctrinal vocabulary: PASS / FAIL
   - §9.9 Prior-CMD regression: PASS / FAIL
5. **Findings** — zero or more one-liners. Examples:
   - "Belief levels persist correctly via accord_belief_adjustments."
   - "Cross-thread evidence chip navigation works in detail panel."
   - "Doctrinal vocabulary check: 0 violations in surface code."

Do not transcribe reasoning. Do not echo brief content.

If §9.2 or §9.8 fails, halt and surface as finding before
pushing further changes. These are the doctrinal-floor checks
for CMD-A5; their failure means the surface doesn't honor the
rules it's built to enforce.

---

## §14 — Reference materials

- This brief
- `accord-build-architecture-v0_1.md` (v0.1.2) — schema for
  `accord_belief_adjustments`, edge table
- `accord-evidence-layer-v0_1.md` (v0.1.1) — Iron Rule 45
  rationale; declared-belief framing source
- `Iron_Rules_36-40_Ratifications.md` — Rule 38 (with
  reinforcement note from CMD-A4 era)
- `Iron_Rules_41-46_Ratifications.md` — Rules 42, 44, 45 in
  particular
- `Iron_Rules_47-50_Ratifications.md` — Rules 47 (amended),
  50 in particular
- `projecthud-file-inventory-v2_2.md` — schema and conventions
- `Style_Doctrine_v1_7.md`
- `accord-document.js` (production source) — the module
  pattern this brief mirrors
- `accord-core.js` (production source) — `Accord._esc`,
  `Accord.state.me`, `accord:surface-changed` event source
- `accord.html` (production source) — placeholder to replace
- `accord-capture.js` (production source) — for collision-
  check audit
- `cmd-center.js` (post-CMD-AEGIS-1 production source) — if
  belief-declaration broadcast wires through here
- `js/version.js` (production source) — current pin
  v20260504-CMD-A4
- CMD-A3 hand-off — context for capture surface
- CMD-A4 hand-off — context for document surface and findings
  carried forward
- CMD-AEGIS-1 hand-off — context for firm-isolation discipline

---

## §15 — Agent narrative instruction block

Per Iron Rule 39 §1, the operator copy-pastes the block below
into the agent's conversation as the first input.

```
Apply brief-cmd-a5-decision-ledger.md.

This is the fifth CMD in the Accord build — the Decision
Ledger surface, the third Accord tab. Builds on CMD-A4's
established surface idiom (lazy-init via accord:surface-changed,
read-only against sealed nodes, edge-derived rendering,
three-region layout).

Standing rules: Iron Rules 36, 37, 38, 39, 40, 42, 44, 47
(amended), 50 apply per §0. Iron Rule 45 is the central
doctrinal commitment — declared belief, not measured
confidence. The §9.8 doctrinal vocabulary check is non-
negotiable.

The new mutation surface is the belief-adjustment composer
(§5.3). It writes to accord_belief_adjustments with sealed_at
NULL; the existing CMD-A1 seal trigger handles sealing at
next meeting END.

Hand-off format per §13: files, diff, smoke test, §9 results,
findings. No narration.

Halt on missing input. If §9.2 (edge-driven rendering) or
§9.8 (doctrinal vocabulary) fails, halt and surface — these
are the doctrinal-floor checks.

Proceed.
```

---

## §16 — Enumerated inputs (Iron Rule 39 §2)

The agent needs:

- This brief
- `accord-build-architecture-v0_1.md` (v0.1.2)
- `accord-evidence-layer-v0_1.md` (v0.1.1)
- `Iron_Rules_36-40_Ratifications.md`
- `Iron_Rules_41-46_Ratifications.md`
- `Iron_Rules_47-50_Ratifications.md`
- `projecthud-file-inventory-v2_2.md`
- `Style_Doctrine_v1_7.md`
- Production source files: `accord.html`, `accord-core.js`,
  `accord-capture.js`, `accord-document.js`,
  `cmd-center.js` (post-CMD-AEGIS-1), `auth.js` (post-CMD-AEGIS-1),
  `js/version.js`
- CMD-A3, CMD-A4, CMD-AEGIS-1 hand-offs
- Access to a Supabase environment with:
  - The `accord_*` schema deployed
  - Firm isolation working (post-CMD-AEGIS-1)
  - At least 3-5 sealed decision nodes for testing (or agent
    seeds via Live Capture in a quick test meeting)
  - Cross-firm test user available (per §9.7) — operator may
    use the same fixtures CMD-AEGIS-1 used

If any input is missing, halt per Iron Rule 40 §1.1.

---

## §17 — Enumerated outputs (Iron Rule 39 §3)

The agent produces:

1. `js/accord-ledger.js` — new surface module
2. Modified `accord.html` — Decision Ledger surface markup +
   ledger CSS + script loader entry
3. Modified `js/version.js` — CMD-A5 pin
4. (If §8 Option A bundled) Modified `accord.html` brand-meta
   to derive from `window._PROJECTHUD_VERSION`
5. Hand-off document with: files, diff, smoke test, §9
   verification results, findings — per §13 / Iron Rule 36

No additional artifacts. No new ratifications expected (the
provisional rule candidates from prior CMDs remain queued).

---

*End of Brief — Decision Ledger surface (CMD-A5).*
