# Accord Evidence Layer — Architecture Brief

**Document type:** Substrate specification for the Accord module
**Version:** 0.1 · 2026-05-04
**Status:** Draft for operator review
**Supersedes:** n/a (initial document)
**Inherits from:** `hud-ecosystem-protocol-v0_1.md` (CoC contract,
event bus, identity resolution); Iron Rules 36–40

---

## §0 — Purpose

The v3b-4 prototype renders a Decision Ledger surface (spine view,
inspector pane, declared-belief metric, causal-link chips) that
*implies* a substrate it does not yet specify. This document is that
substrate.

Without it, every feature on the Ledger surface — supersession,
causal queries, "why does this exist?" walks, risk-without-mitigation
diagnostics, point-in-time reconstruction — is a one-off renderer
sitting on a string-typed mockup. With it, those features are
projections of a single typed graph, and the surface becomes a
faithful render rather than a hand-curated reading list.

This brief specifies four things and only four:

1. The **Accord node taxonomy** (what a captured artifact is).
2. The **typed causal edge taxonomy** (how nodes relate).
3. The **declared-belief model** (what confidence numbers actually
   are, and what they are not).
4. The **canonical-state ownership protocol** between Accord and
   sibling modules (Compass, Aegis, future modules).

It does not specify: the build sequence, the schema migration plan,
the real-time channel architecture, the PDF pipeline, the exact
React component tree, or any UI layer beyond what the substrate
implies. Those belong to subsequent briefs.

---

## §1 — Reading order and scope

A reader new to this document should arrive having already read:

1. `hud-ecosystem-protocol-v0_1.md` — the cross-product contract.
   This brief consumes its CoC table, its event bus envelope, and
   its identity model. Nothing here contradicts it.
2. The Accord prototype (`accord-prototype-v3b-4.html`) plus the
   Decision Ledger extension. This brief is the schema implied by
   what is rendered there.
3. The 2026-05-04 afternoon journal entry, which named the three
   doctrine candidates this brief operationalizes (private
   composers + structured commits, CoC inviolability + meeting
   boundary as commit point, Module Emergence Pattern).

Scope boundary: this brief defines the **Evidence Layer** — the
typed graph of nodes and edges that constitutes Accord's record. It
stops at the boundary where build commissioning begins. The
build-side architecture brief (~4–6 hours, pending) consumes this
document and translates it into schema migrations, RLS policies,
event-bus subscribers, and CMD sequencing.

---

## §2 — Node taxonomy

### §2.1 The five tags, ratified

Every Accord commit is a node. Every node carries exactly one tag
from the existing v3b-4 capture vocabulary:

| Tag        | Semantic                                                                 |
|------------|--------------------------------------------------------------------------|
| `note`     | Context, observation, or evidence relating to a thread.                  |
| `decision` | A state change in the world; the team has chosen.                        |
| `action`   | A future obligation with an owner and a due date.                        |
| `risk`     | An identified hazard, threat, or unmitigated concern.                    |
| `question` | An open inquiry; an unresolved knowledge gap.                            |

This is the schema as drawn on the Live Capture tag bar. **The
Decision Ledger surface introduces no sixth tag.** "Evidence" as it
appears in the prototype's spine view is not a new tag; it is a
*rendering treatment* applied to a `note`-tagged node that carries
one or more typed causal edges to a `decision` node (see §3.4).
This preserves the four-plus-one tag schema and keeps the capture
surface unchanged.

"Answer" as it appears in the spine view is similarly not a new
tag; it is a `note` carrying an `answers` edge to a `question`
node. Same principle.

### §2.2 Node attributes

Every node persists with at minimum:

```
node_id            uuid                 globally unique, immutable
firm_id            uuid                 multi-tenancy partition
created_at         timestamptz          immutable; the commit moment
created_by         resource_id          author at moment of commit
tag                text                 one of: note|decision|action|risk|question
thread_id          uuid                 the thread this node anchors to
meeting_id         uuid?                the capture context (null for async commits)
agenda_item_id     uuid?                the agenda item under which captured
summary            text                 the one-line human-readable
body               text?                the longer-form note (optional)
attachments        jsonb                attachment refs (image, file, transcript)
sealed_at          timestamptz?         when the meeting END committed it; null pre-END
```

Three properties are doctrinally non-negotiable:

- `node_id`, `created_at`, `created_by`, `tag`, and `summary` are
  **immutable after `sealed_at` is set**. Pre-seal these are
  draft-mutable per the v3b archive arc; post-seal, never.
- `body` and `attachments` are **append-only post-seal**. A
  correction cannot rewrite; it must be expressed as a new node
  with a `corrects` edge (see §3).
- The pair `(node_id, sealed_at)` is the cryptographic anchor for
  the Merkle chain (§5.3). Once sealed, the node is part of the
  CoC and any tampering is detectable.

### §2.3 Subtypes for `decision` (deferred)

Three decision subtypes have been informally discussed across the
arc:

- `decision/design` — design-control decisions affecting product
  artifacts (the dominant case in OrthoMotion-class scenarios).
- `decision/process` — operational decisions about how the team
  works (cadence, ownership, escalation).
- `decision/risk-acceptance` — formal acceptance of a residual
  risk per ISO 14971 §7.

This brief **does not ratify subtypes**. The reason: subtyping
without a forcing function (a query, a regulatory mapping, a
distinct UI affordance) becomes premature taxonomy. v0.2 of this
brief will revisit once at least one of those forcing functions
materializes — most likely the 14971 risk-register integration.

For v0.1, all decisions are flat under the `decision` tag.

### §2.4 Node states

Pre-seal states (mutable):
- `fresh` — created this meeting, eligible for hard delete.
- `inherited` — created in a prior meeting, surfaced in this one.

Post-seal states (immutable, but visibility-mutable):
- `committed` — sealed at meeting END; the canonical state.
- `archived` — committed but visibility-suppressed in active views.
  The CoC entry is intact; only the active rendering hides it.
  Restore promotes back to `committed`.
- `superseded` — a newer node has declared `supersedes` against
  this one. The old node remains in the ledger; default queries
  prefer the superseder. See §3.2.

There is no `deleted` state post-seal. CoC inviolability is
absolute. The v3b archive arc resolved this; it is restated here
to make the doctrine commitment visible at the substrate level.

---

## §3 — Causal edge taxonomy

The single most important structural commitment in this brief is
that **causal relationships between nodes are first-class typed
edges in the data model, not strings inside node bodies and not UI
affordances on top of an untyped graph.**

The Decision Ledger surface as drawn shows edges as text chips
inside spine cards (`Supersedes D-104`, `Answers Q-087`, `Field
contradiction`). At the substrate level these are rows in a typed
edge table. The chips render the rows; the rows are the truth.

### §3.1 Edge table

```
edge_id        uuid                  globally unique, immutable
firm_id        uuid                  multi-tenancy partition
from_node_id   uuid                  the source node
to_node_id     uuid                  the target node
edge_type      text                  one of the types below
rationale      text?                 author's stated reason (optional)
declared_at    timestamptz           when the edge was committed
declared_by    resource_id           who committed the edge
sealed_at      timestamptz?          mirrors the source node's seal
```

Edges are themselves immutable post-seal. An edge cannot be
rewritten, only superseded by a `retracts` edge (§3.6).

### §3.2 Ratified edge types — v0.1

The following nine edge types are ratified for v0.1. The list is
deliberately small. Adding edge types is cheap; removing them once
queries depend on them is expensive. v0.1 keeps the set tight.

**Decision evolution:**

- `supersedes` (decision → decision) — the source decision replaces
  the target. The target's status changes to `superseded`. Default
  queries return the source; explicit history queries traverse the
  chain. This is the supersession protocol that makes CoC
  inviolability coexist with organizational reality.

**Inquiry resolution:**

- `answers` (note → question) — the source note resolves the target
  question. The question's status changes to `resolved`. A question
  may have multiple `answers` edges over time; the most recent
  unretracted answer is canonical.

- `closes` (action → question) — used when an action's completion
  is itself the resolution (e.g., "run the test" closes "will it
  pass?"). Distinct from `answers` because the closing artifact is
  an action, not a note.

**Evidence flow:**

- `supports` (note → decision) — evidence weighting in favor.
- `weakens` (note → decision) — evidence weighting against.
- `contradicts` (note → decision) — evidence directly inconsistent
  with the decision's stated need or success criteria.

These three are the engine behind the declared-belief adjustment
log (§4). A note tagged with one of these edges is what the spine
renders as "Evidence."

**Risk lifecycle:**

- `raises` (any node → risk) — the source surfaced the risk.
- `mitigates` (action → risk) — the source action is the
  mitigation. A risk with no incoming `mitigates` edge is an
  unmitigated risk; this is a primary diagnostic surface.

**Cross-module reference:**

- `cites` (any node → external_ref) — the source references an
  artifact in another module (Compass action, Aegis policy, future
  module artifact). See §5 for the external reference protocol.

### §3.3 Edge types explicitly NOT in v0.1

The following are tempting and deferred:

- `validates` / `invalidates` (action_result → decision). Deferred
  because action results are not yet first-class nodes — Compass
  owns action execution state. Once Compass exposes action
  completion as a referenceable artifact (§5.2), these edge types
  become viable. v0.2 likely includes them.
- `caused_by` / `resulted_in` (cross-decision causation). Deferred
  because these tempt narrative reconstruction post-hoc, which is
  exactly the failure mode CoC inviolability exists to prevent. Not
  added until a query genuinely requires them.
- `duplicate_of` (any → any). Deferred. Pre-seal duplicate handling
  is hard delete; post-seal duplicate handling is archive. No edge
  type needed for v0.1.

### §3.4 Rendering treatments derived from edges

The Decision Ledger spine is a rendering of the edge graph. The
following rendering rules are derivable, not authored:

- A `note` node with one or more `supports`/`weakens`/`contradicts`
  edges to a decision renders in the spine as **"Evidence"**.
- A `note` node with an `answers` edge to a question renders in
  the spine as **"Answer"**.
- A `decision` with an outgoing `supersedes` edge renders with the
  superseded badge.
- A `risk` with no incoming `mitigates` edge renders with the
  unmitigated visual treatment.
- A `question` with no incoming `answers` or `closes` edge renders
  as an open loop.

These rules are pure functions of the edge graph. The capture
surface authors no rendering treatment; the renderer reads the
edges and decides.

### §3.5 Edge commit gestures

Edges are themselves *structured commits* in the doctrine sense
(private composers + structured commits). An edge does not exist
until an explicit commit gesture creates it.

Three commit moments:

1. **At node commit time.** The capture composer offers an "anchor
   to…" affordance — a picker that lets the operator declare an
   edge from the node being committed to an existing node. Edge
   committed atomically with the node.
2. **Retroactively, by the author.** Any node's author may, before
   `sealed_at`, declare additional outgoing edges from their node.
   Post-seal, this path is closed.
3. **Retroactively, by anyone, post-seal.** A new node committed
   later may declare edges to older sealed nodes. The new node and
   its edges seal together at the next END. This is how
   asynchronous discovery — "wait, this connects to that decision
   from three weeks ago" — enters the ledger without violating
   immutability.

### §3.6 Edge retraction

An edge can be wrong. A `weakens` edge declared in haste may, on
reflection, have been a misreading. The substrate honors this with
a single mechanism:

- `retracts` (node → edge) — a new node declares that a prior edge
  was incorrect. The edge remains in the ledger (CoC integrity);
  default rendering treats it as retracted (struck through, with
  the retraction visible on hover).

This is the edge-level analog of `supersedes` for decisions. Both
mechanisms preserve the full epistemic history while allowing the
default query to surface current truth.

---

## §4 — Declared-belief model

### §4.1 What this is, and what it is not

Every decision node carries a `declared_belief` value (0–100) at
commit time, plus a log of subsequent declared adjustments. The
current value is `declared_belief_at_commit + Σ adjustments`,
clamped to [0, 100].

**This is declared belief, not measured confidence.** The system
records what humans claim about the decision's likelihood of
addressing the underlying need. The system does not claim that
those declarations are calibrated against ground truth.

This framing is doctrinal. It governs every label, tooltip, export,
and audit-facing surface in Accord. A 13485-savvy reviewer will
read the screen for ten seconds and ask whether the system is
measuring or reporting; the answer must be unambiguous. v0.1
answers: **reporting.** Calibration becomes possible only after
months of declared-belief data has accumulated against real
outcomes (§4.5); until then, the metric is honest about its
provenance.

### §4.2 Schema

On the `decision`-tagged node:

```
declared_belief_at_commit   int        0–100, set at commit time
declared_need               text       what the decision is trying to address
success_criteria            text       what would constitute validation
validation_due              date?      optional; when validation is expected
```

Adjustments are stored as a separate table — they are themselves
nodes? No. They are a fourth kind of structured commit, distinct
from nodes and edges:

```
belief_adjustment_id    uuid
firm_id                 uuid
target_node_id          uuid           the decision being adjusted
delta                   int            signed; -100 to +100
rationale               text           required; not optional
declared_at             timestamptz
declared_by             resource_id
linked_evidence_node_id uuid?          optional reference to a note that
                                       motivated the adjustment
sealed_at               timestamptz?
```

The `linked_evidence_node_id` is the bridge between the
declared-belief log and the typed edge graph. When an operator
adjusts belief because a `weakens` edge was just declared, the
adjustment row references the source note. The "why changed"
inspector pane is a join across these two tables.

### §4.3 Action confidence — the second dimension

Action nodes carry a parallel but distinct value:
`declared_addresses_need` (0–100). This is not "will this action be
completed" (Compass owns execution probability); it is "if completed,
will it actually validate the underlying need this decision is
trying to address."

The two-dimension framing matters. An action can be 95% likely to
complete and 40% likely to actually validate the need (because the
test methodology is wrong, the scope is too narrow, or the success
criteria are weak). The substrate stores both signals, and the
inspector pane surfaces both. Compass owns the first; Accord owns
the second.

### §4.4 What is rendered

The "Why confidence changed" panel in the inspector is a join of
`belief_adjustment` rows for the selected decision, ordered by
`declared_at`. Each row carries attribution (`declared_by`) and
optional evidence link (`linked_evidence_node_id`). The current
value is the running sum. The trajectory is the value-over-time
projection.

The rendering label is **"Declared belief"**, not "Confidence."
Consistent across surface, inspector, export, and PDF.

### §4.5 The calibration path (deferred)

v0.2 or later, once the Outcome layer exists (§4.6), the substrate
gains a calibration capability: per-team and per-decision-class
Brier scores, log-loss measures, calibration curves comparing
declared belief at commit time against eventual validation
outcomes. This is the "system continuously measures whether we
were right" capability the prior conversation arc surfaced.

It is deferred because:

1. It requires accumulated outcome data, which requires the Outcome
   layer to exist and to have been used in production for months.
2. It would, if implemented prematurely, encourage gaming of
   declared-belief inputs by teams trying to optimize their score.
   The honest framing in v0.1 ("declared, not measured") needs to
   establish itself culturally before measurement enters the
   system.
3. The patent narrative, if pursued, lives at this layer — and the
   patent claim is stronger when written against a real
   implementation than against a mockup.

### §4.6 The Outcome layer (deferred to v0.2)

A future `outcome` artifact type will close the loop. Outcomes
attach to decisions and carry: result (pass/fail/partial/unknown),
evidence references, timestamp, and the resulting calibration
data point. v0.1 does not specify the schema; it commits only to
the architectural slot.

---

## §5 — Canonical-state ownership across modules

### §5.1 The doctrine

**No artifact has two canonical homes.** Each module owns one
truth; other modules reference. Dual-write is forbidden.

Applied to Accord and Compass:

- **Accord owns reasoning context.** Why a decision was made, what
  it's trying to address, the typed edges around it, the belief
  trajectory, the supersession chain.
- **Compass owns execution state.** Whether an action is open or
  closed, who's working on it, when it's due, whether it's late.

When Accord captures an action-tagged node, the node is an Accord
artifact for reasoning purposes (it sits on the spine, it can have
edges, it carries `declared_addresses_need`). The corresponding
*executable* action is created in Compass via the dispatch
contract from the ecosystem protocol, and Accord stores a
reference to the Compass artifact, not a copy of its state.

The spine card in the Ledger surface displays Compass execution
state by reference (`Compass: ACT-342`, status fetched live from
Compass). Compass is the source of truth for that status.
Conversely, the Compass action carries an `accord://node/N-xxx`
back-reference to its reasoning origin, so a Compass user can ask
"why is this action here?" and walk back into Accord.

### §5.2 The cross-module reference protocol

Every Accord node and every Accord edge target is addressable via
a URI of the form:

```
accord://node/{node_id}
accord://decision/{node_id}    (alias for nodes with tag=decision)
accord://thread/{thread_id}
accord://meeting/{meeting_id}
```

Other modules consume these URIs as opaque references. They
resolve via a single endpoint that returns the rendered node card
plus a URL into the Accord UI for human navigation.

Symmetrically, Accord references foreign artifacts via URIs the
other modules expose:

```
compass://action/{id}
aegis://policy/{id}
```

The `cites` edge type (§3.2) carries these foreign URIs in its
`to_node_id` slot via a tagged-union representation:

```
to_node_id      uuid?          null when external
to_external_ref text?          one of the cross-module URIs above
```

Exactly one of the two is non-null per edge. The rendering layer
resolves external references at display time.

### §5.3 The CoC integration

This brief consumes the `coc_events` table from the ecosystem
protocol §380–425. Every node commit, edge commit, belief
adjustment, archive, restore, and supersession writes a CoC event:

| Accord operation         | CoC `event_type`                       |
|--------------------------|----------------------------------------|
| Node committed (sealed)  | `accord.node.sealed`                   |
| Edge declared (sealed)   | `accord.edge.sealed`                   |
| Belief adjusted          | `accord.belief.adjusted`               |
| Node archived            | `accord.node.archived`                 |
| Node restored            | `accord.node.restored`                 |
| Decision superseded      | `accord.decision.superseded`           |
| Edge retracted           | `accord.edge.retracted`                |
| Meeting ended (commit)   | `accord.meeting.ended`                 |

The `meeting.ended` event is the atomic commit boundary. It carries
in its `after_state` payload the list of all node IDs and edge IDs
sealed in that transaction, plus the Merkle root computed across
them. Subsequent tampering of any sealed node or edge is detectable
by recomputing the root.

External anchoring of the daily Merkle root to a public timestamp
service is a v0.2 addition, deferred for the same reasons as
calibration: the architectural slot is reserved here, the
implementation lands when the use case forces it.

### §5.4 Aegis as presence source-of-truth

The handoff document committed Aegis as Accord's presence source.
This brief honors that: Accord does not maintain its own presence
infrastructure. The presence dots in Live Capture subscribe to the
existing Aegis presence channel via the ecosystem event bus. Any
future state additions to Aegis presence (away, do-not-disturb,
focus modes) are inherited automatically.

---

## §6 — What this brief deliberately does not specify

The following are real architectural questions whose answers would
constrain implementation choices prematurely, and which are best
answered in subsequent briefs once the substrate has been ratified
and at least partially implemented:

- The exact Postgres schema (column types, indexes, constraints).
  Deferred to the build-side architecture brief.
- The RLS policies for multi-tenant isolation. Deferred; will
  inherit Aegis patterns and ecosystem-protocol §458.
- The real-time channel architecture for Live Capture broadcasts.
  Deferred; the doctrine of private composers + structured commits
  reduces the design space considerably (no live keystrokes), but
  the channel topology still needs specification.
- The PDF generation pipeline for Minutes. Deferred; the
  PDF-as-render commitment in §4 of the prior conversation arc
  governs the framing.
- Sub-topic tags. Operator was nurturing the idea earlier in the
  arc per the handoff. Not surfaced for v0.1; will revisit if the
  operator brings it forward.
- The Outcome node type schema. Reserved as v0.2 work (§4.6).
- Decision subtypes. Reserved as v0.2 work (§2.3).
- Confidence calibration math. Reserved as v0.2 or later (§4.5).

---

## §7 — Doctrine candidates this brief operationalizes

Three doctrine candidates from the prior arc are operationalized
here and become testable against the schema:

1. **Private composers + structured commits.** Edges are themselves
   structured commits (§3.5), extending the doctrine from text
   inputs to relational inputs. The doctrine generalizes: every
   piece of structured data in Accord enters the substrate via an
   explicit commit gesture; nothing leaks from a private composer
   to others' views without one.

2. **CoC inviolability + meeting boundary as commit point.** The
   `sealed_at` field (§2.2) and the `meeting.ended` CoC event
   (§5.3) implement this directly. Pre-seal: structurally mutable.
   Post-seal: structurally immutable, with supersession (§3.2) and
   retraction (§3.6) as the only mechanisms for expressing change.

3. **Module Emergence Pattern.** The cross-module reference
   protocol (§5.2) and the CoC integration (§5.3) demonstrate
   Accord operating across the five architectural levels (substrate,
   synthesis, workflow, publishing, integration) named in the
   pattern. This brief is itself evidence that the pattern was
   correctly recognized: a feature that needs its own substrate
   document is no longer a feature.

Three additional doctrine candidates are surfaced by this brief
and queued for ratification:

4. **Typed causal edges as primitive.** Reasoning chains are
   projections of a typed graph. Edges are first-class data, not
   text in node bodies and not UI affordances on top of an untyped
   graph. (§3 in toto.)

5. **Declared belief, not measured confidence.** Until calibration
   data exists, the metric is what humans claim, not what the
   system measures. The label, the schema, and the surface treat
   it as such. (§4.1.)

6. **Canonical-state ownership across modules.** No artifact has
   two canonical homes. Each module owns one truth; others
   reference. Dual-write is forbidden. (§5.1.)

Ratification of (4), (5), (6) belongs to a future doctrine cycle.
This brief commits to behaving as if they are ratified.

---

## §8 — Open questions for v0.2

Each of these is a known gap that v0.1 deliberately does not
resolve:

1. **Outcome node type schema** — required for the calibration
   path and the closed-loop diagnostic. Deferred until the
   Outcome use case is demonstrated against a real workflow.

2. **Decision subtypes** — `decision/design`,
   `decision/process`, `decision/risk-acceptance`. Deferred
   pending a forcing function (most likely 14971 risk-register
   integration).

3. **`validates` / `invalidates` edge types** — require Compass
   to expose action-completion-as-artifact. Deferred until the
   Compass interface lands.

4. **Daily Merkle-root external anchoring** — the cryptographic
   continuity story is incomplete without external timestamp
   anchoring. Deferred until v0.2; architectural slot reserved
   in §5.3.

5. **Sub-topic tag** — operator's prior nurturing topic. Not
   declared lapsed; awaiting operator surface.

6. **Comment layer** — the parallel commentary stream discussed in
   the conversation arc (comments orbit nodes but never enter the
   CoC). Schema and edge semantics for comments-on-nodes and
   comment-promotion-to-tagged-entries are deferred to a separate
   brief.

7. **Per-thread vs per-decision spine selection** — the spine view
   currently anchors to a thread. Anchoring instead to a decision
   (and traversing edges backward to assemble its reasoning chain)
   is a different rendering with the same substrate. v0.1 specifies
   the data; v0.2 of the surface brief decides the default
   rendering.

---

## §9 — Decision log

| Date       | Decision                                                    |
|------------|-------------------------------------------------------------|
| 2026-05-04 | v0.1 drafted. Four-tag schema preserved; "Evidence" and    |
|            | "Answer" demoted from node types to edge-derived rendering |
|            | treatments. Nine ratified edge types. Declared-belief      |
|            | framing locked. Canonical-state ownership doctrine stated. |
|            | Outcome layer, calibration math, decision subtypes,        |
|            | validates/invalidates edges deferred to v0.2.              |

---

*End of Accord Evidence Layer brief v0.1 · 2026-05-04 afternoon ·
substrate for the Decision Ledger surface · awaiting operator
review.*
