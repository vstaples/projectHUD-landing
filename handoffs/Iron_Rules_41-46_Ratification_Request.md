# Iron Rules 41–46 — Ratification Request

**Date:** 2026-05-04 afternoon
**Drafter:** architect
**Awaiting:** operator ratification
**Source arc:** Accord module (2026-04-29 Compass closeout →
2026-05-04 morning Module Emergence → 2026-05-04 afternoon
v3b-4 + Decision Ledger + Evidence Layer brief)

---

## Background

Six doctrine candidates have surfaced across the Accord arc. Three
were named in the 2026-05-04 afternoon journal entry and the v3b-4
handoff. Three additional candidates were surfaced by the Evidence
Layer architecture brief drafted this session (see
`accord-evidence-layer-v0_1.md` §7).

The Evidence Layer brief currently behaves *as if* candidates 4–6
are ratified. The brief is operating on uncommitted authority. This
ratification request closes that gap and converts six floating
candidates into canonical Iron Rules.

The full ratification text for all six rules is in
`Iron_Rules_41-46_Ratifications.md` (drafted this session). This
document is the operator-facing summary and ratification ask.

---

## The six candidates

### Iron Rule 41 — Private composers + structured commits

Every text input affordance is private to its operator until an
explicit commit gesture publishes it as a structured artifact.
Nothing propagates to others' views without a deliberate, named
commit action that tags the input with a structured type.

**Originally named:** 2026-05-04 afternoon journal entry.

**Why this becomes a rule:** the pattern recurred across six
composers in Accord independently. Once named, it is the
architectural reason the Decision Ledger surface can render a
clean reasoning chain at all. Without it, the data feeding the
chain would be a stream of partial states, not a sequence of
deliberate commits.

**Cross-module reach:** every ProjectHUD module that accepts
collaborative text input inherits this rule. Modules that surface
use cases requiring live-typing visibility (whiteboarding,
simultaneous editing) either decompose into private composers +
structured commits, or are not ProjectHUD's job.

---

### Iron Rule 42 — CoC inviolability + meeting boundary as commit point

Once a containing event commits to the Chain of Custody, the
artifacts produced within that event become structurally immutable.
Pre-commit: hard delete is fine. Post-commit: archive, supersede,
or retract — never delete. The original artifact remains forever.

**Originally named:** 2026-05-04 afternoon journal entry. The v3b
archive arc implemented the doctrine; this rule formalizes it.

**Why this becomes a rule:** evidentiary records require structural
immutability. Regulated-industry buyers will not accept a record
system that permits post-hoc alteration regardless of policy
enforcement. The naive "lock everything" alternative produces
shadow systems outside the ledger. The shape of change must be
structurally constrained, not behaviorally constrained.

**Cross-module reach:** Accord (END MEETING is the commit moment),
Aegis (policy publication), and any future module maintaining
evidentiary record. Compass already implements its own
Uncommitted/Committed pattern compatible with this rule.

---

### Iron Rule 43 — Module Emergence Pattern

A feature has emerged as a module when it operates across all five
architectural levels: substrate, synthesis, workflow, publishing,
and integration. Module promotion follows recognition of the
pattern, not the other way around.

**Originally named:** 2026-05-04 morning session (transcripts not
yet journaled). Reinforced afternoon.

**Why this becomes a rule:** prevents two failure modes —
premature module declaration (calling something a module before it
earns the architectural weight) and indefinite feature creep
(letting a feature accrete module-shaped capabilities indefinitely
under a parent module that grows misshapen as a result).

**Cross-module reach:** governs the recognition process for new
candidate modules across all of ProjectHUD. Existing modules
(Compass, Aegis, Cadence, Accord) have already passed the test;
the rule applies to future emergence cycles.

---

### Iron Rule 44 — Typed causal edges as primitive

Causal relationships between artifacts are first-class typed edges
in the data model. Not strings inside artifact bodies, not UI
affordances on top of an untyped graph, not inferred at query time
from text matching. The set of valid edge types is enumerated and
ratified per module.

**Surfaced by:** Evidence Layer brief v0.1 §3.

**Why this becomes a rule:** the Decision Ledger v3b-4 prototype
rendered relationships as text chips that *looked* like data but
were authored as strings. Once a downstream feature asks "show me
every decision that supersedes anything," string matching is the
only available implementation, and string matching is silently
wrong. Typed edges as primitive make every relational query a
graph traversal instead of a string search.

**Cross-module reach:** every module that maintains a graph of
related artifacts. Edge vocabularies are module-specific (Accord's
nine edge types are not Compass's), but the typed-edge commitment
is universal.

---

### Iron Rule 45 — Declared belief, not measured confidence

A module that has not validated its probabilistic outputs against
ground truth must label those outputs as **declared** rather than
**measured**. Measured confidence requires calibration evidence:
outcome data, calibration curves, Brier or log-loss scores. Until
that evidence exists, the metric is declared.

**Surfaced by:** Evidence Layer brief v0.1 §4.1, in response to
the agent-introduced confidence visualization that implied
measurement while implementing declaration.

**Why this becomes a rule:** the most common failure mode for
systems in this problem space. Tools that present declared belief
as measured confidence get caught in audit, lose regulated-industry
buyers, and damage trust. The rule prescribes the framing that
prevents the failure. It also enforces honest capture — declaring
78% belief is a personal stake; "measuring 78% confidence" is
abstracting the human out of the loop.

**Cross-module reach:** every module that surfaces probabilistic
or confidence-shaped metrics. Modules without such metrics inherit
no obligation.

---

### Iron Rule 46 — Canonical-state ownership across modules

No artifact has two canonical homes. Each module owns one truth;
other modules reference. Dual-write is forbidden. When two modules
appear to need the same artifact, exactly one of them owns the
canonical state and the other holds a reference that resolves at
display or query time.

**Surfaced by:** Evidence Layer brief v0.1 §5.1.

**Why this becomes a rule:** the Accord–Compass interaction is the
prototype case. An action belongs in both modules — Accord owns
the reasoning context, Compass owns the execution state. Naive
dual-write produces two sources of truth that drift. The rule
prescribes the alternative (canonical home per concern, references
across modules, opaque URIs as the protocol) and forbids the
failure mode.

**Cross-module reach:** every module pair where shared artifacts
exist. Establishes the URI scheme protocol (`accord://`,
`compass://`, `aegis://`) as ratified.

---

## Ratification options

Per Iron Rule 40, the operator selects from numbered options with
explicit consequences. Six rules, ratified independently:

**Option A — Ratify all six as drafted.**
- Consequence: rules 41–46 enter canon as of 2026-05-04. The
  Evidence Layer brief v0.1 stops operating on uncommitted
  authority. Future briefs inherit all six. Build commissioning
  may proceed without the doctrinal gap.
- Effort: zero further drafting. The architect updates the
  Evidence Layer brief's §7 to mark candidates 4–6 ratified and
  the journal entry's doctrine-candidates section to mark all
  three originals ratified.

**Option B — Ratify a subset; defer the rest.**
- Consequence: the operator names which rules ratify now and
  which need revision or further consideration. The architect
  redrafts the deferred rules per operator feedback and presents
  for re-ratification next session.
- Effort: depends on which subset. If only minor wording revisions
  are wanted on specific rules, the architect can revise and
  re-present in this session. If substantive rethinking is wanted,
  next session.

**Option C — Defer all ratification; the operator wants to read the
full text first.**
- Consequence: the architect produces nothing further this session
  on the doctrine front. The operator reads
  `Iron_Rules_41-46_Ratifications.md` at their own pace and
  ratifies (or sends back for revision) in a future session.
- Effort: zero further drafting this session. The Evidence Layer
  brief continues to operate on uncommitted authority until
  ratification lands.

**Option D — Reject specific rules; ratify the others.**
- Consequence: the operator names which rules they reject
  outright (not "revise," but "do not ratify in any form"). Those
  candidates are removed from the doctrine queue and the Evidence
  Layer brief's affected sections are revised to operate without
  the rejected commitments.
- Effort: depends on which rules. Rule 44 (typed edges) and Rule 46
  (canonical-state ownership) are most load-bearing for the
  Evidence Layer brief; rejecting either would require substantive
  revision of the brief.

---

## Architect's recommendation

**Option A.** All six are clean candidates. Each has a clear
recurrence pattern (named at least once before this session, or
naturally implied by load-bearing prototype behavior). Each has a
well-scoped cross-module application. Each has a concrete failure
mode it prevents.

The drafting register matches the existing Iron Rules 36–40 (rule
statement, why this rule exists, sectioned operationalization,
cross-module application). Wording revisions are likely cheaper
than ratification deferrals — if the operator wants a specific
phrasing tightened on any of the six, that's a one-line correction,
not a ratification blocker.

If the operator selects Option A, ratification is closed at the
end of this turn and the architect updates the Evidence Layer
brief and the journal entry to reflect the new canonical state.

---

*Ratification request drafted · 2026-05-04 afternoon · awaiting
operator selection.*
