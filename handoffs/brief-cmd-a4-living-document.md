# Brief · Living Document surface · CMD-A4

## §0 — Standing rules for fresh agent

Read before proceeding.

**Iron Rule 36 — hand-off terseness.** Diff, smoke test result,
findings as one-liners. No narration in the hand-off.

**Iron Rule 37 — work silently mid-execution.** No diagnostic
narration. No hypothesis testing in chat. The only permitted
mid-work communication is genuine clarification questions when
scope is ambiguous.

**Iron Rule 38 — consumer enumeration.** §10 enumerates
consumers. Verify on the way through. The function-duplication
awareness from §2 of the rule applies — if a function name
appears in multiple files, all instances must be enumerated.

**Iron Rule 39 — RLS / behavioral verification.** This brief
prescribes behavioral tests in §9.

**Iron Rule 40 — agent execution discipline.** Halt on missing
input. Terse transcript. Test instructions in handoff.

**Iron Rule 42 — CoC inviolability.** This surface renders
sealed (post-END) data exclusively. Pre-END nodes are not
displayed. The surface is *read-only* against the CoC; no
mutations from this surface in CMD-A4.

**Iron Rule 44 — typed causal edges as primitive.** This surface
is the first visible consumer of edge data. Rendering treatments
(supersession marks, evidence pairings, answered-question
annotations) are derived from edges, not authored as decoration.
A behavioral test in §9 verifies this.

**Iron Rule 47 — verification before reference (all layers).**
The `accord_*` PK naming convention divergence (inventory v2.2
§7.6.6) — `<table>_id`, not bare `id`. JS column references must
match.

**Iron Rule 50 — HTTP-based behavioral verification.** All §9
verification is HTTP-based.

**Multi-issue post-deploy.** If the operator reports multiple
issues after deploy, fix ONE per work-cycle.

---

## §1 — Purpose

Build the Living Document surface — the cross-meeting durable
record. Where Live Capture (CMD-A3) is the verb-mode work
surface during meetings, Living Document is the noun-mode read
surface across them.

After CMD-A4 ships:

1. The Living Document tab in `accord.html` (currently a
   placeholder per CMD-A3) becomes a functional surface.
2. The surface is **thread-anchored**. Selecting a thread shows
   that thread's full evidence chain across every meeting
   the thread has appeared in.
3. The chain renders as a **temporal spine**: nodes ordered by
   commit time, grouped by meeting, with typed-edge annotations
   (supersession marks, answered-question links, supports/
   weakens/contradicts annotations on decisions, mitigates
   annotations on risks).
4. Filter chips narrow rendering by tag (note / decision /
   action / risk / question), by status (open / superseded /
   answered / closed), and by edge presence (e.g. "decisions
   with field-contradiction evidence").
5. Per-thread aggregate signals: open-questions count,
   unmitigated-risks count, decision count, supersession depth.
6. **Cross-thread index rail**: a left rail listing every
   thread in the project, with status indicators and node
   counts.
7. Read-only — no commits, no edits, no edge declarations.
   Edge declaration is CMD-A5's surface (Decision Ledger).
   Live Capture remains the commit-only surface.

CMD-A4 establishes the read-side patterns (data fetching, edge
hydration, spine rendering) that CMD-A5 will reuse and extend.

Estimated effort: 20 hours.

---

## §2 — Scope

### In scope

- Living Document surface markup (replace the placeholder in
  `accord.html` `surface-document`)
- New JS module `accord-document.js` for surface logic
- Minor extensions to `accord-core.js` if surface-routing or
  shared helpers need adjustment (keep changes minimal)
- Thread-list rail with status indicators and node counts
- Per-thread spine rendering (per §4)
- Edge-derived rendering treatments (per §5)
- Filter chips (per §6)
- Per-thread aggregate signals (per §7)
- Behavioral verification per §9
- Helper text in the "+ New meeting" modal addressing the
  thread vs. agenda confusion surfaced in CMD-A3 (per §8)
- Version pin bump

### Out of scope

- Decision Ledger tab (CMD-A5)
- Digest & Send tab (CMD-A6)
- Minutes tab (CMD-A7)
- Edge declaration UI — viewing only; declaring lives in CMD-A5
- Belief adjustment UI (CMD-A5)
- Comment composer (separate brief — comment layer schema is v0.2)
- Cross-thread navigation animations or transitions beyond what
  the existing surface-switch already does
- Real-time updates as new commits land in other open sessions
  (the surface re-renders on tab switch and on manual refresh;
  live-update subscription deferred to a polish pass)
- Search across threads
- Pagination for very long threads (deferred until a thread
  exceeds ~200 nodes — not expected at v0.1)

---

## §3 — Surface structure

The Living Document surface is a three-region layout, mirroring
the prototype's editorial register:

```
┌─────────────────────────────────────────────────────────────┐
│  [Live Capture] [Living Document]* [Decision Ledger] ...    │   (top nav, unchanged)
├──────────────┬─────────────────────────────────────────────┤
│              │                                              │
│  THREAD      │  SPINE                                       │
│  RAIL        │                                              │
│              │  ┌──────────────────────────────────────┐    │
│  • Thread A  │  │ Thread title                         │    │
│  • Thread B  │  │ Aggregate signals                    │    │
│  • Thread C  │  ├──────────────────────────────────────┤    │
│              │  │ Filter chips                          │    │
│              │  ├──────────────────────────────────────┤    │
│              │  │                                       │    │
│              │  │ [Meeting 1 — date]                    │    │
│              │  │   ● Note    │ summary                 │    │
│              │  │   ● Decision│ summary    [supersedes] │    │
│              │  │   ● Action  │ summary                 │    │
│              │  │                                       │    │
│              │  │ [Meeting 2 — date]                    │    │
│              │  │   ● Question│ summary                 │    │
│              │  │   ● Note    │ summary    [answers]    │    │
│              │  │                                       │    │
│              │  └──────────────────────────────────────┘    │
└──────────────┴─────────────────────────────────────────────┘
```

Use the same warm-slate token palette and font hierarchy from
CMD-A3's surface. No new CSS variables. All colors via existing
tokens (per Style Doctrine v1.7).

The `surface-document` section in `accord.html` currently
contains a placeholder div. Replace its contents with the
three-region structure above. Keep `id="surface-document"` and
`class="surface"` on the outer `<section>` so the existing
surface-switch routing in `accord-core.js` continues to work.

---

## §4 — Spine rendering

### §4.1 Data fetch

When the Living Document tab is activated and a thread is
selected, fetch:

1. The thread row (`accord_threads` by `thread_id`).
2. All sealed nodes in the thread, ordered by `(meeting_id,
   created_at)` ascending. Filter `WHERE sealed_at IS NOT NULL`
   — the surface renders **only sealed CoC artifacts** per Iron
   Rule 42.
3. All edges where `from_node_id` or `to_node_id` is in the
   thread's node set, regardless of edge_type. Edges may
   point outside the thread (e.g., an action node citing a
   Compass artifact); preserve the foreign references but
   render only the local end.
4. The set of meetings (`accord_meetings`) referenced by those
   nodes, for date headers and grouping.

The fetch uses standard `API.*` patterns (PostgREST). All reads
are firm-isolated by RLS — no application-layer firm filter
required.

### §4.2 Grouping and ordering

Render the spine grouped by meeting, oldest first within meeting,
oldest meeting first overall. Within each meeting group, nodes
appear in `created_at` order.

Each meeting group has a header showing:
- Meeting title
- Sealed date (formatted date, no time — time-of-day is noise
  at the cross-meeting reading scale)
- Optional `Δ` indicator if the spine includes superseded nodes
  from this meeting

### §4.3 Node row anatomy

Each spine row renders:

- **Tag dot** — colored per existing `--tag-{tag}` tokens from
  CMD-A3
- **Tag label** — short, all-caps mono per existing pattern
- **Summary** — the node's `summary` text, wrapping if long
- **Author byline** — `— [name]`, dimmed
- **Edge annotations** (per §5) — visible inline next to the
  summary or as a chip at the end of the row, depending on
  edge type

Body text (longer-form `body` content if present) is collapsed
by default. A small `…` affordance expands a row to show its
body. State is per-session, not persisted.

### §4.4 Empty states

If a thread has zero sealed nodes (newly created, no captures
sealed yet): render an empty state — "No sealed entries yet.
Captures appear here once a meeting closes."

If no thread is selected: render a default empty state on the
spine area — "Select a thread from the rail."

If the project has zero threads: render a project-level empty
state — "No threads yet. Create one in Live Capture."

---

## §5 — Edge-derived rendering treatments (Iron Rule 44)

The single most important architectural test of CMD-A4 is that
**edge-driven rendering is a pure function of the edge graph**.
The surface authors no rendering decoration; it reads the edge
table and renders accordingly.

### §5.1 Treatment per edge type

| Edge type | Source render | Target render |
|---|---|---|
| `supersedes` | "supersedes [target summary]" chip; source rendered with elevated emphasis | Target rendered with strikethrough + dimmed; "superseded by [source]" link |
| `retracts` | "retracts [target]" chip on retracting node | Target edge / node visually dimmed |
| `answers` | "answers [question summary]" chip on answering note | Question rendered with checkmark dot; "answered by [source]" link |
| `closes` | "closes [question]" chip on closing action | Question rendered with checkmark + closed indicator |
| `supports` | "supports [decision]" chip on note | Decision shows aggregated `+N supporting evidence` count |
| `weakens` | "weakens [decision]" chip on note | Decision shows aggregated `−N weakening evidence` count |
| `contradicts` | "contradicts [decision]" chip on note | Decision flagged with `⚠ contradiction` annotation; rendered with elevated risk emphasis |
| `raises` | "raises [risk]" chip on source | Risk node rendered with the raising source visible in its metadata |
| `mitigates` | "mitigates [risk]" chip on action | Risk node shows `mitigated by [action]` and visual treatment shifts to dimmed/resolved |
| `cites` | Foreign URI rendered as a chip with module badge (e.g., `compass://action/...`); resolved via `API.resolveURI()` from CMD-A2 if available, otherwise rendered as plain URI |

### §5.2 Aggregation rules

For a decision node with multiple `supports` / `weakens` /
`contradicts` edges, aggregate counts and render once. Don't
render one chip per edge — that would be visually overwhelming.
Format: `+3 supporting · 1 weakening · 2 contradicting`.

For a risk with one or more `mitigates` edges, render once with
the most recent mitigating action linked. Older mitigations
remain in the data; UI shows the latest by default with a
"see all" affordance.

### §5.3 Behavioral test (§9.2)

A behavioral test in §9 verifies that adding a `supersedes` edge
to the database via direct SQL re-renders the surface
correctly without any code change. This proves the rendering is
edge-driven, not hand-curated.

### §5.4 Cross-thread edges

An edge whose source and target are in different threads is
rendered on the thread the user is currently viewing (the
"local" end). The "foreign" end shows as an outbound link to
the other thread. Click → switches the rail selection to the
foreign thread and scrolls to the relevant node.

---

## §6 — Filter chips

Three chip groups, all multi-select within a group, AND across
groups:

**Tag** (default: all selected):
- Note · Decision · Action · Risk · Question

**Status** (default: all selected):
- Active · Superseded · Answered · Closed
- (Status is derived from edge presence + node tag combinations,
  not a stored column. See §6.1.)

**Edge presence** (default: none selected):
- Has supersession · Has contradicting evidence · Has open
  questions · Has unmitigated risks

The chip bar lives between the meeting-grouped spine and the
filter row. State is per-session, not persisted. Filter changes
re-render the spine without a fetch round-trip — all data is
already client-side.

### §6.1 Status derivation

| Status | Derivation |
|---|---|
| Active | Node has no incoming `supersedes`, `retracts`, `answers`, `closes`, or `mitigates` edge |
| Superseded | Node has an incoming `supersedes` edge from a newer node |
| Answered | Question node has an incoming `answers` or `closes` edge |
| Closed | Action node whose `compass_action_ref` resolves (via §3.7 of CMD-A2's resolver) to a Compass action with `status = 'closed'` |

The Closed status fetch may add latency. For v0.1, fetch
Compass action statuses lazily — render the action with a
"checking…" indicator and resolve via `API.resolveURI()` calls
in parallel. If the Compass-side resolver branch is not yet
implemented (CMD-A2 stubs it as `module_not_yet_resolver_compatible`),
treat all action statuses as "unknown" and render a neutral
indicator. Don't block the spine render on this.

---

## §7 — Per-thread aggregate signals

Above the spine, render a single-line strip with thread-level
aggregates:

```
[Thread title] · 12 nodes · 3 decisions · 2 open questions · 1 unmitigated risk
```

Counts derive from the loaded data (no extra fetches). If a
count is zero, omit the segment rather than rendering "0 X".

The strip is purely informational. Click on a count segment
→ filters the spine to show only those nodes (e.g., clicking
"2 open questions" applies the Question tag filter + Active
status filter).

---

## §8 — Helper text in "+ New meeting" modal (CMD-A3 polish)

Per the CMD-A3 finding about thread-vs-agenda confusion, add a
single line of helper text in the new-meeting modal near the
thread input:

```
Threads span meetings; add agenda items below after creating.
```

Style: `--ink-muted`, smaller than label text, italic.

The modal lives in `accord.html`. This is the only edit to
`accord.html` outside the `surface-document` replacement.

---

## §9 — Behavioral verification

All HTTP-based per Iron Rule 50.

### §9.1 Iron Rule 42 — read-only against sealed data

1. Open Living Document. Select a thread that has both sealed
   nodes (from a closed meeting) and pre-seal draft nodes
   (from an active meeting if any, or none if no active
   meeting exists).
2. Verify that pre-seal nodes are NOT visible in the spine.
   Only sealed nodes render.
3. Inspect the surface for any UI affordance that would mutate
   data (delete buttons, edit pencils, "save" buttons, etc.).
   None should exist.

PASS = sealed-only rendering + zero mutation affordances.

### §9.2 Iron Rule 44 — edge-driven rendering

1. Open Living Document. Select a thread with at least one
   decision node.
2. Note the current rendering of the decision (no supersession
   indicator).
3. From SQL editor (or any direct DB access), insert an edge:
   ```sql
   INSERT INTO accord_edges (
     edge_id, firm_id, from_node_id, to_node_id,
     edge_type, declared_at, declared_by, sealed_at,
     edge_hash
   ) VALUES (
     gen_random_uuid(), '<firm>', '<newer_decision_node>',
     '<older_decision_node>', 'supersedes',
     now(), '<user_id>', now(), 'manual-test-hash'
   );
   ```
4. Refresh the Living Document tab.
5. Verify: the older decision now renders with strikethrough
   + dimmed treatment + "superseded by" link. The newer
   decision renders with elevated emphasis + "supersedes" chip.

PASS = rendering changed without code change. The edge graph
is the source of truth.

After verification, optionally clean up the test edge:
`DELETE FROM accord_edges WHERE edge_hash = 'manual-test-hash';`

### §9.3 Filter chips

1. Apply each filter chip individually. Verify the spine
   updates to show only matching nodes.
2. Apply combinations (Tag: Decision + Status: Superseded).
   Verify AND logic across groups.
3. Apply Edge Presence chip "Has unmitigated risks". Verify
   only risk nodes lacking incoming `mitigates` edges render.

PASS = all chip behaviors match §6 specification.

### §9.4 Cross-thread edge link

If any edges exist with source and target in different threads
(seed if needed), verify that clicking the foreign-thread link
switches rail selection to the target thread and scrolls to
the relevant node.

PASS = navigation works.

### §9.5 Empty states

1. Create a new thread with no sealed nodes. Open Living
   Document. Verify the thread-empty state renders.
2. Open Living Document with no thread selected. Verify the
   no-selection empty state renders.

PASS = both empty states visible.

### §9.6 Cross-firm isolation (regression check)

1. Session A: User in firm A, Living Document open on a firm A
   thread.
2. Session B: User in firm B, Living Document open.
3. Session B's rail does NOT show firm A's threads.
4. Manually constructing a URL with firm A's thread_id in
   Session B's URL bar (if URL routing exposes thread_id) does
   NOT load firm A's data — the fetch returns empty / forbidden.

PASS = RLS holds at the surface layer.

### §9.7 CMD-A3 / CMD-AEGIS-1 regression check

1. Open Live Capture. Verify the surface still works end-to-end
   (create meeting → start → capture → end).
2. Verify Aegis presence dots still update correctly across
   same-firm sessions.

PASS = no regressions to prior CMDs.

---

## §10 — Consumer enumeration (Iron Rule 38)

Files modified:

| File | Effect | Existing consumers |
|---|---|---|
| `accord.html` | `surface-document` placeholder replaced; one helper-text line added to new-meeting modal | None outside Accord |
| `accord-core.js` | Possibly minor adjustments for surface-switch hooks if needed | All accord.html consumers |
| `accord-document.js` | New | None (created in this CMD) |
| `js/version.js` | Pin bump | All cache-bust consumers |

Tables read:

| Table | Operation | RLS context |
|---|---|---|
| `accord_threads` | SELECT | firm-isolated by RLS |
| `accord_meetings` | SELECT | firm-isolated |
| `accord_nodes` | SELECT (sealed only via `WHERE sealed_at IS NOT NULL`) | firm-isolated |
| `accord_edges` | SELECT | firm-isolated |

No tables written. No CoC events. No mutations.

Function-name verification (Rule 38 §2 amendment): the surface
introduces functions like `renderSpine()`, `loadThread()`,
`applyFilters()`. Verify no existing files in the codebase
declare functions with these names. If collision exists,
namespace under `Document.*` or `AccordDocument.*` (matching
existing patterns) and surface as a finding.

---

## §11 — What must work after this ships

1. The Living Document tab loads cleanly.
2. The thread-list rail populates with all threads in the
   project.
3. Selecting a thread renders its full sealed-node spine
   grouped by meeting.
4. Edge annotations appear correctly per §5.
5. Filter chips work per §6.
6. Aggregate signals show per §7.
7. Empty states render correctly per §4.4.
8. The §8 helper text appears in the new-meeting modal.
9. Live Capture surface unchanged; Aegis presence unchanged;
   Compass / Cadence unchanged. Spot-check.
10. Console banner shows CMD-A4.

---

## §12 — Smoke test

Operator runs after deploy:

1. Hard-refresh `accord.html`. Click the Living Document tab.
   Surface loads. Console banner shows CMD-A4.
2. Verify thread rail populates. Click a thread with multiple
   sealed nodes. Verify spine renders, grouped by meeting.
3. Verify any existing edges in test data render per §5.
4. Run §9.1 and §9.2 verification tests. Both should PASS.
5. Apply each filter chip. Verify behavior per §9.3.
6. Click an aggregate signal segment. Verify it acts as a
   filter shortcut.
7. Open the "+ New meeting" modal. Verify helper text appears.
8. Verify Live Capture still works end-to-end. Verify
   `compass.html` still loads.

If smoke test cannot be run live: agent runs against staging,
operator runs browser-side post-deploy.

---

## §13 — Hand-off format (Iron Rule 36)

Required output:

1. **Files modified / created** — one-liner per file.
2. **Diff** — unified diff for `accord.html`, `accord-core.js`
   (if modified), `js/version.js`; full content for
   `accord-document.js`.
3. **Smoke test result** — pass / fail / not run.
4. **Behavioral verification results** — one line per §9
   subtest:
   - §9.1 Read-only against sealed data: PASS / FAIL
   - §9.2 Edge-driven rendering: PASS / FAIL
   - §9.3 Filter chips: PASS / FAIL
   - §9.4 Cross-thread edge link: PASS / FAIL / not run (no
     cross-thread edges in test data)
   - §9.5 Empty states: PASS / FAIL
   - §9.6 Cross-firm isolation: PASS / FAIL
   - §9.7 Prior-CMD regression: PASS / FAIL
5. **Findings** — zero or more one-liners.

Do not transcribe reasoning. Do not echo brief content.

If §9.2 (edge-driven rendering) fails, halt and surface — that
is the core architectural verification of this CMD.

---

## §14 — Reference materials

- `accord-build-architecture-v0_1.md` (v0.1.2)
- `accord-evidence-layer-v0_1.md` (v0.1.1) — substrate context
- `accord-prototype-v3b-4.html` — visual register reference
- `accord.html` (production source — CMD-A3 shipped)
- `accord-core.js` (production source — CMD-A3 shipped)
- `accord-capture.js` (production source — CMD-A3 shipped, for
  pattern reference)
- `Iron_Rules_36-40_Ratifications.md` (with newly ratified
  Rule 38)
- `Iron_Rules_41-46_Ratifications.md`
- `Iron_Rules_47-50_Ratifications.md` (with amended Rule 47)
- `Style_Doctrine_v1_7.md`
- `projecthud-file-inventory-v2_2.md`
- `aegis-shared-loaders-inventory-v1.md`
- `api.js` (production source) — for `API.resolveURI` and
  read patterns
- `coc.js` (production source — for `accord.*` event-type
  registry, in case any read-side display references EVENT_META)
- `js/version.js` (production source)
- CMD-A1, CMD-A1.5, CMD-A2, CMD-A3, CMD-AEGIS-1 hand-offs
- This brief — authoritative on scope

---

## §15 — Agent narrative instruction block

Per Iron Rule 39 §1, the operator copy-pastes the block below
into the agent's conversation as the first input.

```
Apply brief-cmd-a4-living-document.md.

This is the fourth CMD in the Accord build — the Living
Document surface. Read-only across sealed CoC data. The first
visible consumer of the typed-edge graph from CMD-A1's
substrate.

Replace the placeholder in accord.html surface-document with
a thread-anchored spine. Render sealed nodes grouped by
meeting; derive edge-annotation treatments from the edge
table per Iron Rule 44 (no authored decoration). Filter chips
and aggregate signals per the brief.

Standing rules: Iron Rules 36, 37, 38, 39, 40 apply per §0.
Iron Rule 42 (read-only against sealed data), Rule 44 (edge-
driven rendering) are the doctrinal commitments this surface
operationalizes. Rule 47 (verification, all layers) and Rule 50
(HTTP-based verification) apply throughout.

§9 specifies seven behavioral verification subtests. Each must
be exercised before hand-off. PASS/FAIL reported per subtest in
§13. §9.2 (edge-driven rendering) is the core architectural
verification — if it fails, halt and surface.

One small accord.html edit outside the surface itself: add the
helper text in §8 to the "+ New meeting" modal addressing the
thread-vs-agenda confusion CMD-A3 surfaced.

Hand-off format per §13: files, diff, smoke test, §9 results,
findings. No narration.

Halt on missing input.

Proceed.
```

---

## §16 — Enumerated inputs (Iron Rule 39 §2)

The agent needs:

- This brief
- `accord.html`, `accord-core.js`, `accord-capture.js`
  (production sources)
- `accord-prototype-v3b-4.html` (visual reference)
- `accord-build-architecture-v0_1.md` (v0.1.2)
- `accord-evidence-layer-v0_1.md` (v0.1.1)
- `Iron_Rules_36-40_Ratifications.md` (with Rule 38)
- `Iron_Rules_41-46_Ratifications.md`
- `Iron_Rules_47-50_Ratifications.md` (with amended Rule 47)
- `Style_Doctrine_v1_7.md`
- `projecthud-file-inventory-v2_2.md`
- `aegis-shared-loaders-inventory-v1.md`
- `api.js`, `coc.js`, `js/version.js` (production sources)
- CMD-A1, CMD-A2, CMD-A3, CMD-AEGIS-1 hand-offs
- Access to a Supabase environment with:
  - At least one closed meeting with sealed nodes
  - At least one thread spanning multiple meetings (for the
    spine grouping verification)
  - Two test users in same firm (for §9.7 regression check)
  - One test user in a different firm (for §9.6)
  - At minimum one edge in production data (for §9.2;
    if none exist, agent seeds one for the test)

If any input is missing, halt per Iron Rule 40 §1.1.

---

## §17 — Enumerated outputs (Iron Rule 39 §3)

The agent produces:

1. Modified `accord.html` — `surface-document` content replaced;
   helper text added to new-meeting modal
2. Modified `accord-core.js` — only if surface-routing or
   shared helpers need adjustment (keep changes minimal)
3. New `accord-document.js` — Living Document surface logic
4. Modified `js/version.js` — CMD-A4 pin
5. Hand-off document with: files, diff, smoke test, §9 subtests
   PASS/FAIL each, findings — per §13 / Iron Rule 36

No additional artifacts.

---

*End of Brief — Living Document surface (CMD-A4).*
