# Iron Rule 41 — Ratification

**Status:** drafted 2026-05-04 · awaiting operator ratification
**Authority:** operator + architect (see §0.1 of Style Doctrine)
**Scope:** every module in ProjectHUD that accepts collaborative
text input from multiple operators in a shared context

---

## Rule

**Every text input affordance is private to its operator until
an explicit commit gesture publishes it as a structured
artifact.** Nothing propagates from a composer to other
participants' views until the operator performs a deliberate,
named commit action that tags the input with a structured type.

The propagation event is always atomic and structured. Never
partial keystrokes. Never live-typing visible to others. Never
half-formed thoughts on others' screens. Never typing indicators.
Never conflict resolution between simultaneous typists.

---

## Why this rule exists

The Accord prototype's six text-input affordances (Live Capture,
comment, reply, chat, action assignment, future annotation tools)
all converged on the same pattern independently. The architect
named the pattern in the 2026-05-04 afternoon session; the
operator's prior architectural instincts had already encoded it
into every composer in the prototype.

Once named, the pattern shows itself to be load-bearing:

- It eliminates entire categories of complexity (no character-by-
  character broadcasting infrastructure, no typing-indicator
  presence channel, no conflict resolution between simultaneous
  edits).
- It produces clean structured commits at the data layer, which
  makes the typed-edge graph in Accord's Evidence Layer (Iron
  Rule 44) tractable.
- It respects the cognitive reality of collaborative composition:
  half-formed thoughts shown to others contaminate consensus.

This is not stylistic preference. It is the architectural reason
the Decision Ledger surface can render a clean reasoning chain at
all. Without private composers, the data feeding the chain would
be a stream of partial states, not a sequence of deliberate
commits.

---

## §1 — What counts as a commit gesture

A commit gesture is named, deliberate, and atomic. The valid
gestures across ProjectHUD modules are:

| Composer                        | Commit gesture                       |
|---------------------------------|--------------------------------------|
| Live Capture (Accord)           | Tag click (NOTE/DECISION/ACTION/...) |
| Comment, reply, chat            | Send                                 |
| Action assignment               | Confirm                              |
| Belief adjustment               | Adjust + rationale + Confirm         |
| Edge declaration                | Anchor + Confirm                     |
| Future annotation tools         | Done                                 |

Each gesture commits the composer's contents atomically into a
structured artifact. The artifact carries: type, author,
timestamp, and (where applicable) the references the gesture
declared.

---

## §2 — What this rule forbids

- Live-typing broadcast (others see characters as they're typed).
- Typing indicators ("Mike is typing…").
- Auto-save-then-broadcast patterns that leak intermediate state.
- Conflict resolution between simultaneous typists at the
  composer level (because there is nothing to conflict — each
  operator's composer is private).
- Drafts visible to other participants before commit.

---

## §3 — What this rule does not forbid

- The operator may save a private draft visible only to themselves.
  Sessionstorage persistence of an in-progress composer is fine.
- Server-side persistence of a private draft is fine, provided the
  draft is never delivered to other participants' rendering layer
  before commit.
- Post-commit edits are governed by separate doctrine (Iron Rule
  42 — meeting boundary as commit point; Iron Rule 43 — supersession
  protocol). This rule governs only the pre-commit privacy
  contract.

---

## §4 — Cross-module application

This rule applies to every ProjectHUD module that accepts
collaborative text input. Module authors do not relitigate the
private-composer commitment per module; they inherit it from this
rule.

If a module surfaces a use case that appears to require live-
typing visibility (collaborative whiteboarding, simultaneous
document editing, screen-share annotation), the resolution is one
of: (a) the use case belongs in a different tool that is not
ProjectHUD, (b) the module decomposes the use case into private
composers + structured commits, or (c) the rule needs amendment
through formal ratification cycle. (a) and (b) are the dominant
expected outcomes.

---

*Iron Rule 41 ratified.*

# Iron Rule 42 — Ratification

**Status:** drafted 2026-05-04 · awaiting operator ratification
**Authority:** operator + architect
**Scope:** every module in ProjectHUD that maintains an
evidentiary record (Chain of Custody) of operator activity

---

## Rule

**Once a containing event commits to the Chain of Custody, the
artifacts produced within that event become structurally
immutable.** Pre-commit, artifacts may be hard-deleted. Post-
commit, artifacts may only be archived (visibility-suppressed),
superseded (replaced by a newer artifact with an explicit
supersession edge), or retracted (declared incorrect by a newer
artifact with an explicit retraction edge). The original artifact
remains in the ledger forever.

For Accord, the containing event is a meeting and the commit
moment is END MEETING. For other modules, the containing event
is whatever workflow boundary the module declares as its own
commit point — but the inviolability commitment is identical.

---

## Why this rule exists

CoC inviolability is what makes the record evidentiary. If the
record can be quietly rewritten, it stops being evidence and
becomes opinion-with-versioning. Regulated industries (medical
device, aerospace, pharma, finance) require evidentiary records;
their auditors will not accept a record system that permits
post-hoc alteration regardless of how good the policy enforcement
is.

The naive resolution — "lock everything, allow no changes" —
breaks against organizational reality. Decisions get revised.
Risks get reassessed. Errors get corrected. A record system that
forbids change forces operators to work around it, which produces
shadow systems (email threads, Slack DMs, paper notes) outside
the ledger entirely. That is worse than allowing change.

The resolution honored by this rule: the **shape** of change is
structurally constrained. Old artifacts persist. New artifacts
that revise old ones declare their relationship explicitly. The
full epistemic history is preserved and queryable. Default
queries surface current truth; explicit history queries traverse
the supersession chain.

---

## §1 — Pre-commit semantics

Before the containing event commits, the artifact is in draft
state. In draft state:

- The artifact's author may rewrite, edit, or hard-delete it.
- The artifact is visible to the meeting participants per the
  module's privacy model.
- The artifact carries no `sealed_at` timestamp.
- No CoC event is written for the artifact's draft mutations.

Pre-commit, in other words, is a normal collaborative work
surface. Mutations happen. The system tolerates them.

---

## §2 — The commit moment

The commit moment is atomic. It is named per module:

| Module     | Commit moment                              |
|------------|--------------------------------------------|
| Accord     | END MEETING (per scenario)                 |
| Compass    | (deferred — Compass already has its own)  |
| Aegis      | Policy publication                        |
| (others)   | (declared per module)                     |

At the commit moment, the module:

1. Sets `sealed_at` on every artifact in the containing event.
2. Computes the Merkle root across all sealed artifacts.
3. Writes a single CoC event recording the commit, carrying the
   Merkle root in `after_state`.
4. Transitions the surface to its post-commit visual state.

The commit moment is irreversible. There is no "uncommit." A
mistakenly-committed event must be addressed through supersession
or retraction at the artifact level, not by undoing the commit.

---

## §3 — Post-commit semantics

After commit, the artifact is sealed. Sealed means:

- `node_id`, `created_at`, `created_by`, `tag`, and `summary` are
  immutable. Any attempted mutation is rejected at the data layer.
- `body` and `attachments` are append-only. A correction cannot
  rewrite; it must be expressed as a new sealed artifact with a
  `corrects` or `supersedes` edge to the original.
- Visibility is mutable through archive/restore. The CoC entry
  remains intact; only the active rendering changes.

Tampering with a sealed artifact is detectable: the Merkle root
recomputes against the original event's recorded root and the
mismatch is the audit signal.

---

## §4 — The mechanisms for expressing change

Three mechanisms exist for expressing change post-commit:

1. **Archive.** The artifact is hidden from active views but
   preserved intact. Restore promotes it back to active visibility.
   This is the "I created this in this meeting and now I want it
   off the screen, but I cannot delete it" affordance.

2. **Supersede.** A new artifact declares a `supersedes` edge to
   the old one. The old artifact's status changes to `superseded`.
   Default queries surface the superseder; explicit history
   queries traverse the chain. This is the "the decision changed"
   affordance.

3. **Retract** (for edges, not nodes). A new artifact declares a
   `retracts` edge to a prior edge, indicating the prior edge was
   incorrect. The edge remains in the ledger; default rendering
   treats it as struck through. This is the "I declared a
   relationship that turned out to be wrong" affordance.

There is no fourth mechanism. There is no "delete." There is no
"hide forever." There is no "rewrite history." Modules that are
tempted to add a fourth mechanism are not implementing this rule.

---

## §5 — Cross-module application

Every module in ProjectHUD that maintains evidentiary record
inherits this rule. The commit moment is module-specific; the
inviolability commitment is universal.

If a module surfaces a use case that appears to require post-
commit deletion, the resolution is one of: (a) the use case is
asking for archive, not deletion (rename and proceed), (b) the
use case is asking for supersession (rename and proceed), or
(c) the use case is asking for something the rule forbids and the
module must surface this through formal ratification cycle. (a)
and (b) are the dominant expected outcomes.

---

*Iron Rule 42 ratified.*

# Iron Rule 43 — Ratification

**Status:** drafted 2026-05-04 · awaiting operator ratification
**Authority:** operator + architect
**Scope:** every module in ProjectHUD that recognizes itself as a
module rather than a feature

---

## Rule

**A feature has emerged as a module when it operates across all
five architectural levels: substrate, synthesis, workflow,
publishing, and integration.** Module promotion follows
recognition of the pattern, not the other way around. Module
authors do not declare modulehood; they recognize it in retrospect
and rename accordingly.

---

## Why this rule exists

The Accord arc began with a feature called "Meeting Minutes."
Across two sessions of architectural attention, that feature
accreted capabilities until it stopped being a feature and became
something that needed its own substrate document, its own brand
identity, its own surface ecosystem, and its own doctrine
candidates. The operator and architect recognized the pattern in
the 2026-05-04 morning session and named it Module Emergence.

Without the rule, two failure modes are likely:

1. **Premature module declaration.** A new feature is named a
   module on day one because it sounds important, before it has
   accreted enough capability to justify the architectural
   weight. The module never quite earns its name.
2. **Indefinite feature creep.** A feature accretes module-shaped
   capabilities indefinitely without being recognized or renamed,
   so its growing weight strains the parent module that nominally
   contains it. The architecture rots from the inside.

The rule prescribes the recognition test that resolves both
failure modes. A feature is a feature until the test triggers.
When the test triggers, the feature is renamed and given its own
architectural footprint.

---

## §1 — The recognition test

A feature has emerged as a module when it operates across all
five of these levels:

1. **Substrate.** The feature has its own data model that is not
   merely a table within a parent module's schema. Accord has its
   own node-and-edge graph (Iron Rule 44). Compass has its own
   action-and-status model. Aegis has its own policy model. A
   feature without its own substrate is still a feature.

2. **Synthesis.** The feature combines inputs from outside its
   substrate to produce derived artifacts. Accord synthesizes
   captured commits into Decision Ledgers, Living Documents, and
   Minutes. A feature that only stores and retrieves what it was
   given is still a feature.

3. **Workflow.** The feature has a temporal lifecycle of its own
   that operators move through. Accord has the meeting lifecycle
   (idle → running → closed). Compass has the action lifecycle.
   A feature without its own lifecycle is still a feature.

4. **Publishing.** The feature produces deliverables for audiences
   outside its operating context. Accord produces digests, PDFs,
   and external-citable references. A feature whose outputs are
   consumed only by its own UI is still a feature.

5. **Integration.** The feature touches other modules through a
   defined contract. Accord references Compass actions and Aegis
   presence. A feature that does not interoperate with siblings
   is still a feature.

When all five tests pass, the feature has emerged. The architect
should name the emergence (the way "Meeting Minutes" became
"Accord") and produce a substrate document for the new module.

---

## §2 — What this rule does not require

- Modulehood is not gated on user-visible polish. A module can be
  recognized while still in vision-stage prototype.
- Modulehood is not gated on production code existence. A module
  can be recognized before any line of build code is written, as
  Accord was.
- Modulehood is not gated on team size, allocation, or commercial
  framing. The recognition is architectural; the commercial story
  follows.

---

## §3 — Consequences of recognition

When a feature is recognized as having emerged, the architect
produces:

1. A renaming proposal (the feature name often no longer fits).
2. A substrate document at the level of the Accord Evidence Layer
   brief.
3. An initial roadmap or vision document mapping capabilities
   across the five levels.
4. An entry in the project's module registry (the Atlas, when it
   exists).

The operator ratifies the renaming and the substrate. The module
proceeds.

---

## §4 — Cross-module application

This rule does not apply to a specific module; it applies to the
recognition process for new modules. Existing modules (Compass,
Aegis, Cadence, Accord) have already passed the test or the test
would not apply retroactively. New candidate modules pass through
this rule before they receive architectural investment.

---

*Iron Rule 43 ratified.*

# Iron Rule 44 — Ratification

**Status:** drafted 2026-05-04 · awaiting operator ratification
**Authority:** operator + architect
**Scope:** every module in ProjectHUD that maintains a graph of
related artifacts

---

## Rule

**Causal relationships between artifacts are first-class typed
edges in the data model. They are not strings inside artifact
bodies, not UI affordances on top of an untyped graph, and not
inferred at query time from text matching.** The set of valid edge
types is enumerated and ratified per module; adding edge types is
a deliberate act, not an emergent one.

---

## Why this rule exists

The Decision Ledger surface in the v3b-4 prototype renders
relationships between captured commits as text chips inside spine
cards (`Supersedes D-104`, `Answers Q-087`, `Field contradiction`).
The chips look like data; they were authored as text. The
substrate underneath was string-typed.

This works exactly until it doesn't. Once a downstream feature
asks "show me every decision that supersedes anything," string
matching is the only available implementation, and string matching
is fragile, locale-dependent, and silently wrong. Once the second
such question arrives ("show me every risk with no mitigating
action"), the cost of having authored relationships as text rather
than as typed edges becomes load-bearing.

The rule prescribes the alternative. Edges are rows in an edge
table. They have types from a ratified vocabulary. Queries against
them are graph traversals, not string searches. The rendering
layer reads the edges and decides what to show; the capture layer
authors edges via explicit commit gestures (Iron Rule 41).

---

## §1 — Edge attributes

Every edge persists with at minimum:

```
edge_id        uuid                  globally unique, immutable
firm_id        uuid                  multi-tenancy partition
from_node_id   uuid                  the source artifact
to_node_id     uuid?                 the target artifact (null when external)
to_external    text?                 cross-module URI when target is foreign
edge_type      text                  one of the module's ratified types
rationale      text?                 author's stated reason (optional)
declared_at    timestamptz           when the edge was committed
declared_by    resource_id           who committed the edge
sealed_at      timestamptz?          mirrors the source artifact's seal
```

Edges are themselves structured commits. They enter the substrate
through explicit commit gestures (Iron Rule 41), and they become
immutable post-seal (Iron Rule 42). An incorrect edge is corrected
through `retracts`, not rewriting.

---

## §2 — Ratified edge vocabulary per module

Each module that adopts this rule declares its ratified edge
types in its substrate document. Adding an edge type to the
ratified vocabulary requires:

1. A demonstrated query that needs the type.
2. A clear semantic distinction from existing types.
3. Substrate document amendment.

Edge type proliferation is a smell. A module with twenty edge
types is probably misusing five of them. v0.x substrate
documents should err toward small ratified sets and grow
cautiously.

---

## §3 — Rendering follows from edges, not the other way around

The capture surface authors no rendering treatment. The renderer
reads the edge graph and decides. A `note` with a `supports` edge
to a `decision` renders as Evidence; a `note` with an `answers`
edge to a `question` renders as Answer; a `risk` with no incoming
`mitigates` edge renders as unmitigated. These are pure functions
of the graph, not authored decorations.

This separation matters because it makes rendering experiments
cheap (change the renderer, not the data) and because it makes
diagnostics tractable (the same edge graph that drives spine
rendering also drives "show me every unmitigated risk" queries
without parallel implementations).

---

## §4 — Cross-module application

This rule applies to every module that maintains a graph of
related artifacts. The ratified edge vocabulary is module-specific
(Accord's nine edge types, declared in the Evidence Layer brief
v0.1, are not the same as Compass's or Aegis's). The commitment
to typed edges as primitive is universal.

A module that finds itself authoring relationships as text inside
artifact bodies is not implementing this rule. The fix is schema
migration to a typed edge table; the cost is paid once and amortizes
across every downstream query.

---

*Iron Rule 44 ratified.*

# Iron Rule 45 — Ratification

**Status:** drafted 2026-05-04 · awaiting operator ratification
**Authority:** operator + architect
**Scope:** every module in ProjectHUD that surfaces probabilistic
or confidence-shaped metrics to operators

---

## Rule

**A module that has not validated its probabilistic outputs against
ground truth must label those outputs as declared rather than
measured.** "Declared" means the metric records what humans claim;
"measured" means the metric records what the system has empirically
verified. The two carry different epistemic weight, and the module
must not allow surface presentation to imply the latter when only
the former is true.

Module authors who wish to claim measured confidence must produce
calibration evidence: outcome data, calibration curves, Brier or
log-loss scores against historical predictions. Until that evidence
exists, the metric is declared.

---

## Why this rule exists

The Decision Ledger surface displays decision-level confidence
percentages, signed adjustments, and trajectory lines. Operators
read those numbers as measurements. The numbers are, in fact,
human declarations weighted by hand-tuned coefficients with no
calibration against outcomes.

This gap is the most common failure mode for systems in this
problem space. Tools that present declared belief as measured
confidence get caught in audit, lose regulated-industry buyers,
and damage the trust that took years to accrue. The rule
prescribes the framing that prevents this failure.

The cultural reason matters too. Calling a metric "declared"
forces honest capture: an operator declaring 78% belief is
declaring a personal stake, attribution, rationale. Calling the
same metric "measured" abstracts the human out of the loop and
implies system-level certainty that does not exist. The first
framing is auditable; the second is misleading.

---

## §1 — What counts as declared

Declared metrics are:

- Authored by a named operator at a specific timestamp.
- Stored with attribution and rationale.
- Surfaced with the operator's identity visible (or one click away).
- Labeled with the word "declared" or its register-appropriate
  equivalent ("declared belief," "declared probability," "stated
  confidence" — never bare "confidence").

The "Why changed" inspector pane in the Decision Ledger v0.1 is
a faithful declared-metric surface: each adjustment row carries
the author, the timestamp, the rationale, and (optionally) the
linked evidence node that motivated the adjustment.

---

## §2 — What counts as measured

Measured metrics require all of:

1. **Calibration data.** A history of past declarations matched
   against eventual outcomes.
2. **A scoring rule.** Brier score, log-loss, calibration curve,
   or comparable probabilistic measure.
3. **A confidence interval.** The system reports not just a point
   estimate but the uncertainty around it, derived from sample
   size and historical accuracy.
4. **An accountability path.** Operators can audit the calibration
   data, the scoring rule, and the resulting weights.

A module that produces output meeting all four conditions may
present it as measured. A module that produces output meeting
three or fewer conditions may not.

---

## §3 — The transition path

Modules begin life producing declared metrics. They transition to
measured metrics only after sufficient outcome data has
accumulated. The Accord Evidence Layer v0.1 explicitly defers
calibration to v0.2 or later, recognizing that calibration becomes
possible only after months of declared-belief data has accumulated
against real outcomes.

The transition is not a one-way ratchet. A module that previously
claimed measured confidence but discovers its calibration evidence
was flawed must revert to declared until calibration is rebuilt.
Reverting is acceptable; pretending is not.

---

## §4 — Surface obligations

When a metric is declared:

- The label must include "declared" or equivalent.
- The author of the declaration must be visible or one click away.
- The rationale must be visible or one click away.
- Trajectory and adjustment history must be visible on demand.

When a metric is measured:

- The calibration evidence must be visible or one click away.
- The scoring rule must be visible or one click away.
- The confidence interval must be presented alongside the point
  estimate.
- The sample size of the underlying calibration must be visible.

A module that fails these surface obligations is not implementing
the rule.

---

## §5 — Cross-module application

This rule applies to every module that surfaces probabilistic or
confidence-shaped metrics. It applies whether the metric is about
a decision (Accord), an action (Accord, Compass), a policy
(Aegis), a risk (any), or any other artifact.

Modules that do not surface such metrics inherit no obligation
from this rule. If a module later begins surfacing such metrics,
it adopts the rule at that moment.

---

*Iron Rule 45 ratified.*

# Iron Rule 46 — Ratification

**Status:** drafted 2026-05-04 · awaiting operator ratification
**Authority:** operator + architect
**Scope:** every cross-module reference in ProjectHUD where one
module displays or operates on an artifact owned by another

---

## Rule

**No artifact has two canonical homes.** Each module owns one
truth; other modules reference. Dual-write is forbidden. When two
modules appear to need the same artifact, exactly one of them
owns the canonical state and the other holds a reference that
resolves at display or query time.

---

## Why this rule exists

The Accord–Compass interaction is the prototype case. An action
captured during a meeting belongs in both modules: Accord records
the reasoning that produced it (the spine, the typed edges, the
declared belief that this action will address the underlying
need), and Compass records its execution state (open or closed,
who's working on it, when it's due, whether it's late).

The naive resolution — dual-write — produces two sources of truth
that drift. Accord says the action is open; Compass says it's
closed; nobody knows which is right. The correct resolution
prescribed by this rule: one canonical home per concern.

- **Accord** owns reasoning context: the why, the edges, the
  belief trajectory, the supersession history.
- **Compass** owns execution state: the open/closed status, the
  assignee, the due date, the completion timestamp.

The same action artifact is queryable from both modules; only one
module persists each piece of state.

---

## §1 — Canonical-state declarations

Each module declares, in its substrate document, what state it
owns canonically. Sibling modules that need access to that state
hold references and resolve them at query time.

The Accord Evidence Layer v0.1 declares Accord's canonical
ownership of: nodes, edges, declared belief, belief adjustments,
the supersession graph, the Merkle-chained CoC of meeting
events.

Compass's substrate document (when written) will declare its
canonical ownership of: actions, their lifecycle, assignees, due
dates, completion state.

When the two overlap (an action exists in both), each module owns
only its declared piece. Accord stores `compass://action/{id}` as
a reference; Compass stores `accord://node/{id}` as a back-
reference; neither persists the other's state.

---

## §2 — The cross-module reference protocol

Every module that participates in cross-module references exposes
a URI scheme: `{module}://{artifact-type}/{id}`. The ratified
schemes (as of 2026-05-04):

- `accord://node/{node_id}`
- `accord://decision/{node_id}` (alias)
- `accord://thread/{thread_id}`
- `accord://meeting/{meeting_id}`
- `compass://action/{action_id}`
- `aegis://policy/{policy_id}`

References are stored as opaque strings. Resolution happens at
display or query time, via a single endpoint per module that
returns the rendered card plus a deep link into the module's UI.

A module that finds itself parsing or interpreting another
module's URI internals is not implementing this rule. The URI is
opaque; the only legitimate operation on a foreign URI is "ask
the foreign module to resolve it."

---

## §3 — Display obligations

When module A displays module B's artifact via reference:

- The display must be live (resolved at display time, not cached
  copy of state).
- The display must indicate that the artifact lives in module B
  (visible badge, color treatment, or label).
- The display must offer a deep link into module B's surface for
  the operator to act on the artifact in its native context.
- The display must not mutate module B's state. Mutation goes
  through module B's own surface or its API, never through
  module A pretending to own state it does not own.

The Decision Ledger surface displays Compass actions as chips on
spine cards. Each chip is live (status fetched from Compass), is
labeled `Compass: ACT-342`, and is clickable to navigate to the
Compass action surface. The Ledger does not mutate Compass state.

---

## §4 — When dual-write seems necessary

Three patterns exist for situations where dual-write seems
necessary:

1. **The artifact actually decomposes into two artifacts.** What
   looked like one shared artifact is two related artifacts that
   each have one canonical home. (Accord's reasoning node + the
   Compass action it references is the prototype case.)

2. **One module is the canonical home and the other caches.** The
   cache is read-through; the canonical home is the source of
   truth; the cache invalidates on canonical updates via the
   ecosystem event bus.

3. **A new shared module owns the artifact.** Both modules become
   referencing siblings. This is the rare case and indicates the
   shared artifact deserves its own module-emergence recognition
   (Iron Rule 43).

The pattern that does not exist: "both modules persist the same
state and reconcile occasionally." That is dual-write. It is
forbidden.

---

## §5 — Cross-module application

This rule applies to every module pair in ProjectHUD where shared
artifacts exist. It does not require that all modules participate;
a module that owns its artifacts entirely with no cross-module
references inherits no obligation.

When a new module-to-module relationship emerges, the canonical-
state ownership question is settled before any reference is
implemented. The settlement is documented in both modules'
substrate documents.

---

*Iron Rule 46 ratified.*
