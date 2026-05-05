# ProjectHUD — Functional Requirements Compendium

**Status:** Functional requirements · v1 · 2026-05-05 evening
**Companion document:** `accord-vision-v1.md` (strategic narrative)
**Purpose:** Every functional requirement surfaced over the architectural conversation, named, scoped, and traceable. Searchable reference. Prevents requirement loss.
**Treatment of speculative items:** Per architect-confirmed treatment A — speculative items are marked explicitly as **PROPOSED, AWAITING ARCHITECT RATIFICATION**. They appear in their natural location with the marker. Confirmed items have no marker.

---

## §0 — How to use this document

This document is structured as a reference compendium, not a narrative. It is meant to be searched and pulled from. Each section captures a category of functional requirement; within each section requirements are enumerated.

For every requirement, the document records:
- **What it is** (the requirement itself)
- **Where it came from** (the conversation moment that surfaced it)
- **Status** (confirmed / proposed-pending-ratification / partially-shipped / shipped)
- **Iron Rule cross-references** (where applicable)
- **CMD that lands or will land it** (where known)

When the build starts moving on a CMD, this document is the source-of-truth checklist. When a managing director asks "did we cover X?", this document answers.

The document is **alive**. It will be updated as new requirements surface and as ratifications happen. Treat it as a working artifact, not a finished one.

---

# Part 1 — Substrate Architecture

## §1 — Node taxonomy

The substrate models institutional commitments as typed nodes. Each node type carries structured fields appropriate to its role.

### §1.1 Decision nodes

Confirmed fields (per Iron Rule 44 ratification, CMD-A1 substrate spec, CMD-A5 surface, CMD-A1.6 seal scope):

- `node_id` — UUID primary key
- `node_type` — discriminator, value 'decision'
- `firm_id` — FK to firms; firm-scoped via RLS
- `meeting_id` — FK to accord_meetings; the meeting that ratified this decision
- `summary` — text; the decision statement
- `tag` — value 'decision' (Iron Rule 45 vocabulary)
- `created_at` — timestamptz
- `created_by` — FK to users
- `sealed_at` — timestamptz; populated at meeting END trigger
- `node_hash` — text; SHA-256 of the node fields, populated at seal
- `prev_hash` — text; the chain link to prior CoC event

PROPOSED, AWAITING ARCHITECT RATIFICATION (added for counterfactual + CPM support):

- `effective_date` — date; when the decision becomes binding. Required for downstream date propagation in counterfactual operations.
- `ratification_status` — enum {ratified, pending, withdrawn}; default ratified at seal
- `vote_tally` — JSON {yes: int, no: int, abstain: int}; captures formal voting where applicable
- `mover_user_id` — FK to users; who proposed the decision
- `seconder_user_id` — FK to users; who seconded
- `decision_seq_id` — text; per-meeting sequence (DC-01, DC-02, etc.)
- `confidence_declared_summary` — derived; aggregates child belief declarations
- `gravity_score` — derived; computed from edge count and downstream criticality (used for "high-leverage decisions" dashboard view)

Source: CMD-A1 substrate ship, CMD-A5 ledger surface, mockup analysis, Helix counterfactual scenario, CIT register comparison.

### §1.2 Action nodes

Confirmed fields:

- `node_id`, `node_type` ('action'), `firm_id`, `meeting_id`, `summary`, `tag`, `created_at`, `created_by`, `sealed_at`, `node_hash`, `prev_hash`

PROPOSED, AWAITING ARCHITECT RATIFICATION:

- `assigned_to_user_id` — FK to users; the action's owner
- `due_date` — date; the commitment date
- `derives_from_date_basis` — enum {decision_effective, predecessor_completion, hard_deadline, soft_deadline}; how the due_date is computed; required for CPM date propagation under counterfactual
- `duration_estimate` — interval; for CPM input
- `duration_optimistic` / `duration_most_likely` / `duration_pessimistic` — interval; for PERT input
- `crash_cost_slope` — numeric; cost per day of duration reduction; for shortest-schedule optimization
- `resource_substitutability` — JSON; which resource classes can perform this action with cost differentials; for cheapest-schedule optimization
- `pinnability` — boolean; explicit user marking that the action cannot move regardless of computed slack
- `must_complete_by` — date nullable; hard deadline (regulatory, contractual)
- `should_complete_by` — date nullable; soft deadline with lateness penalty
- `lateness_penalty_per_day` — numeric; for cheapest-schedule optimization when soft deadlines slip
- `action_seq_id` — text; per-meeting sequence (AX-01, AX-02, etc.)
- `compass_task_id` — FK; populated when CMD-COMPASS-BRIDGE wires the cross-module link
- `actual_start_date` / `actual_completion_date` — date nullable; populated by Compass execution telemetry
- `current_status` — enum {queued, in_flight, blocked, completed, cancelled}; updated bidirectionally with Compass

Source: Mockup analysis, CIT register comparison, schedule-manipulation conversation, CMD-A6 placeholder spec.

### §1.3 Risk nodes

Confirmed fields (per CMD-A1 substrate ship):

- Standard node fields (`node_id`, `node_type` 'risk', `firm_id`, etc.)

PROPOSED, AWAITING ARCHITECT RATIFICATION (modeled on CIT register structure):

- `risk_type` — enum {Sterilization, Supplier, Design, Production, Execution, Scope_Creep, Regulatory, Financial, Operational, ...}; controlled vocabulary
- `originator_user_id` — FK to users
- `owner_user_id` — FK to users; primary risk owner
- `first_milestone_impacted` — text; phase or milestone reference
- `phase_duration_at_risk` — interval; months at risk
- `initial_probability_bucket` — enum {1, 3, 9} mapping to {<5%, >5% & <25%, >25%}; CIT register convention
- `initial_cost_weighted` — numeric; dollar cost at probability bucket
- `mitigation_proposed` — text; description of mitigation approach
- `mitigation_owner_user_id` — FK to users; can differ from risk owner
- `mitigation_target_date` — date
- `mitigation_status` — enum {Tracking, Approved, Not_Approved, In_Progress, Closed}
- `mitigated_probability_bucket` — enum {1, 3, 9}
- `residual_cost_weighted` — numeric; post-mitigation
- `cost_of_actions` — numeric; dollar cost of mitigation work
- `risk_seq_id` — text; per-meeting sequence (RK-01, RK-02, etc.)
- `comments` — text; freeform context
- `severity_derived` — derived from probability_bucket; for ranking

Source: CIT Risk Register PDF analysis, mockup §5, schedule-manipulation conversation.

### §1.4 Question nodes

Confirmed fields:

- Standard node fields (tag = 'question')

PROPOSED, AWAITING ARCHITECT RATIFICATION:

- `assigned_to_user_id` — FK to users; who is responsible for answering
- `due_date` — date; when the answer is expected
- `surfaced_by_user_id` — FK to users; who raised the question
- `ties_to_node_ids` — array of UUIDs; references to related decisions/risks/actions
- `question_seq_id` — text; per-meeting sequence (OQ-01, OQ-02, etc.)
- `answered_at` — timestamptz nullable; populated when an answers edge lands
- `answered_by_node_id` — FK; the answer node (typically a note or decision)

Source: Mockup §6 Open Questions, parking-lot conversation.

### §1.5 Note nodes (supporting evidence)

Confirmed fields:

- Standard node fields (tag = 'note')

PROPOSED, AWAITING ARCHITECT RATIFICATION:

- `prepared_by_user_id` — FK to users; the author/preparer of the supporting material
- `external_uri` — text; pointer to file, URL, document outside Accord
- `evidence_class` — enum {bench_data, study, model, memo, transcript, calculation, citation, supplier_documentation, regulatory_reference, ...}
- `cited_in_node_ids` — derived array; computed from incoming `cites` edges

Source: Mockup §8 Supporting Evidence, Helix counterfactual scenario (EV-104, EV-107, EV-109, EV-201, etc.).

### §1.6 Dissent nodes

PROPOSED, AWAITING ARCHITECT RATIFICATION (entirely new node type):

- Standard node fields (`node_type` = 'dissent')
- `attached_to_node_id` — FK to the decision the dissent is recorded against
- `declarer_user_id` — FK to users; the dissenter
- `alternative_proposed_summary` — text; what the dissenter would have ratified instead
- `alternative_proposed_structured` — JSON; structured fields matching the parent decision's fields, with overrides specifying what would change
- `rationale` — text; the dissenter's reasoning
- `recorded_at` — timestamptz

Source: Mockup DC-02 Onomura dissent example, Helix scenario Dr. Okafor dissent, counterfactual conversation. **Dissent capture is the substrate prerequisite for the counterfactual operator** — without `alternative_proposed_structured`, the engine cannot apply the dissent as a counterfactual substitution.

### §1.7 Belief declaration nodes

Confirmed (per CMD-A5 ledger ship and Iron Rule 45):

- `adjustment_id` (PK)
- `firm_id`, `target_node_id`, `delta`, `rationale`, `declared_at`, `declared_by`
- `sealed_at`, `adjustment_hash`

PROPOSED, AWAITING ARCHITECT RATIFICATION (additions for PERT integration):

- `confidence_level_quantized` — enum {high, mixed, low} mapping to declared belief; already in spirit per Iron Rule 45 but not yet a structured field
- `pert_distribution_class` — enum {tight, moderate, wide} derived from confidence_level_quantized; for PERT modeling
- `applies_to_dimension` — enum {decision_correctness, action_completion_likelihood, action_duration, risk_probability, ...}; specifies what the belief is *about*, since beliefs can be declared on different dimensions of the same target

Source: CMD-A5 ledger ship, Iron Rule 45, PERT extension conversation.

### §1.8 Meeting nodes

Confirmed fields (per CMD-A1 substrate spec):

- Standard meeting fields (`meeting_id`, `firm_id`, `title`, `state`, `started_at`, `sealed_at`, `merkle_root`, `prev_hash`)

PROPOSED, AWAITING ARCHITECT RATIFICATION (additions surfaced by mockup analysis):

- `meeting_type` — enum {informal, working_session, design_review, steering, board_review, ...}; controls default render template
- `recorder_user_id` — FK; the person taking the official record
- `quorum_required` — int; minimum attendees for valid action
- `quorum_present` — int; computed from attendance
- `executive_summary` — JSON; structured summary with four named angles {what_was_decided, what_were_watching, whats_now_in_motion, whats_still_unanswered}
- `next_meeting_id` — FK; link to the next scheduled session
- `agenda_items` — array; each with start_time, duration, lead_user_id, has_decision_pending boolean
- `attendee_records` — array; each with user_id, status enum {present, proxy, absent, late, departed_early}, role marker (org/recorder), proxy_for_user_id where applicable
- `parking_lot_items` — array of node_ids deferred to next session
- `pre_reads` — array; pointers to supporting evidence circulated before the meeting

Source: Mockup §1 Attendees, §2 Agenda, §3 Decisions, §6 Open Questions, §7 Parking Lot, executive summary block.

---

## §2 — Edge taxonomy

The substrate models relationships between commitments as typed causal edges. Iron Rule 44 establishes typed-edge graph as primitive. The full edge type registry follows.

### §2.1 Confirmed edge types (per CMD-A1 substrate ship and CMD-A4 living document)

- `cites` — supporting evidence to decision/risk; the evidence backs the claim
- `supports` — note/evidence to decision; weaker than cites, indicates corroboration
- `contradicts` — node to decision; introduces evidence against
- `supersedes` — newer decision to older decision; the older is superseded
- `derives_from` — action/risk/question to decision; the dependent exists *because* of the decision
- `mitigates` — action to risk; the action exists to reduce the risk
- `raises` — decision to risk; the decision introduces the risk
- `answers` — decision/note to question; the question is resolved
- `closes` — note/edge to decision; the decision lifecycle terminates

### §2.2 Edge fields (confirmed)

- `edge_id` (PK)
- `firm_id`, `from_node_id`, `to_node_id`, `edge_type`
- `declared_at`, `declared_by`
- `sealed_at`, `edge_hash`

### §2.3 Proposed edge types

PROPOSED, AWAITING ARCHITECT RATIFICATION:

- `precedence` — action to action; explicit precedence relationship for CPM (subset of `derives_from` with explicit ordering semantics)
- `blocked_by` — action to action; the source cannot start until the target completes (inverse of precedence)
- `parallel_with` — action to action; explicit parallelization marker; allows resource heatmap to model concurrent execution
- `deferred_to` — node to meeting; tracks parking lot and next-meeting carry-over
- `revisits` — meeting to decision; the meeting re-examined a prior decision (may produce new dissent or supersession)
- `acknowledges` — node to dissent; tracks formal acknowledgment that dissent was considered before ratification

Source: CMD-COMPASS-BRIDGE design, schedule-manipulation conversation, mockup parking-lot analysis.

### §2.4 Edge-derived rendering (Iron Rule 44 + Iron Rule 51)

Confirmed: rendering treatments derive from edge presence at construction time, not from authored decoration. Per Iron Rule 51, class-conditional styling is decided at construction time.

Examples (confirmed in CMD-A4, CMD-A5, CMD-A7):

- A decision with outgoing `supersedes` edge renders with line-through summary + SUPERSEDED badge
- A decision with incoming `contradicts` edge renders with CONTRADICTED badge
- An action with incoming `mitigates` edges to risks renders with mitigation count
- A decision with `cites` edges to evidence renders with evidence count

PROPOSED additions (for projection engine and counterfactual support):

- A decision with attached dissent renders with dissent indicator
- An action on critical path renders with CRITICAL badge (post-CPM linkage)
- An action with computed slack renders with slack value displayed (post-CPM linkage)
- A decision whose effective_date moves under counterfactual renders with delta indicator

---

## §3 — Chain of Custody (confirmed, shipped)

Per CMD-A1 substrate spec and Iron Rule 42 (CoC inviolability):

- Every meeting END writes a `coc_events` row of type `accord.meeting.ended`
- The row carries `merkle_root` computed from sealed nodes, edges, and belief adjustments
- The row carries `prev_hash` linking to the firm's prior CoC event
- The chain is firm-scoped; cross-firm CoC events do not link
- Sealed substrate rows have `sealed_at IS NOT NULL` and `*_hash IS NOT NULL`
- Post-seal mutations are rejected at row-level security layer

Per CMD-A1.6 broadened seal scope: belief adjustments seal at any meeting END within the firm, not just meetings that contain the target decision.

PROPOSED additions for counterfactual support:

- Counterfactual analyses are themselves sealed substrate nodes (`node_type` = 'counterfactual')
- A counterfactual node carries `parent_decision_node_id`, `applied_alternative_node_id` (the dissent or freeform alternative), `computed_at`, `computed_by`, plus the rendered briefing artifact
- Counterfactual nodes get their own `merkle_root` reference and participate in the firm's CoC chain

PROPOSED additions for CPM and schedule-manipulation:

- Schedule manipulations that the user commits become decision nodes (the user's manipulation IS a decision, ratified by the user clicking Apply)
- The committed manipulation has `derives_from` edges to all the action nodes whose dates moved
- The substrate captures both the prior schedule state and the new schedule state through the edge graph; CPM recomputation is reproducible

---

# Part 2 — The Projection Engine

## §4 — Engine architecture

A projection is a function over substrate state. Three inputs:

- **Selection rule** — predicate over nodes/edges/declarations; specifies the subset of substrate in scope
- **Structural transformation** — ordering, grouping, aggregation, derivation rules over the selected substrate
- **Register stylesheet** — visual treatment, typography, color tokens, layout proportions

PROPOSED, AWAITING ARCHITECT RATIFICATION:

The engine is implemented as a single Edge Function (or successor architecture) that accepts:

```
render(
  template_id: string,
  substrate_state: { variant: 'as_sealed' | 'counterfactual' | 'projected', params: {...} },
  reader_context: { user_id, role, firm_id }
)
```

and emits HTML output. The same engine produces meeting minutes, executive briefings, dashboard views, morning briefs, counterfactual analyses, and schedule manipulations. Adding a new template is a configuration entry; the engine code does not change per template.

### §4.1 Selection rules (proposed taxonomy)

- `meeting_scope` — all sealed nodes for a given meeting_id
- `decision_only` — all sealed decision nodes matching filters
- `personal_scope` — nodes where reader_context.user_id appears in declarer/owner/assignee/dissenter fields
- `team_scope` — nodes whose owners belong to a team (post identity-unification CMD)
- `firm_scope` — all nodes in the firm matching filters
- `time_window` — nodes sealed within a date range
- `critical_path_scope` — nodes on the current critical path (post-CPM)
- `high_leverage_scope` — decisions with leverage_score above threshold (post-CPM)
- `counterfactual_scope` — substrate state under an applied alternative

Selection rules compose. "Personal scope intersected with critical-path scope intersected with this-week time-window" is the morning brief's individual contributor view.

### §4.2 Structural transformations

- `chronological` — order by declared_at or sealed_at
- `causal` — order by edge dependency (decisions before their actions, etc.)
- `by_owner` — group by assigned_to or declared_by
- `by_severity` — order by risk severity or decision gravity
- `by_critical_path_priority` — order by computed slack ascending (post-CPM)
- `aggregated` — collapse into KPI-style counts and rollups

### §4.3 Register stylesheets

Confirmed (post-CMD-A7-POLISH-1):

- **Editorial register** — slate background, bone foreground, amber accent, Fraunces / IBM Plex Sans / IBM Plex Mono typography per `accord.html` convention
- **Print register** — letter-format pagination, fixed page chrome, optimized for printer output (CMD-MINUTES-PRINT-FLOW)

PROPOSED:

- **Dashboard register** — denser, more KPI-like, less narrative; suited for morning brief and executive surfaces
- **Email register** — single-column, ~600px width, inline-only styling, no external CSS dependencies; suited for Personal Digest delivery
- **Mobile register** — narrow-viewport optimized; suited for dashboard mobile views and on-the-go reading
- **Print register variant: legal-format** — for jurisdictions or document types requiring legal-format pages

---

## §5 — The eight projections

Confirmed-in-spirit during conversation. Each projection is one configuration of the engine.

### §5.1 Executive Briefing (one page)

- **Selection rule:** `meeting_scope` for a single meeting
- **Structural transformation:** aggregated; KPI-strip on top; executive-summary block beneath
- **Register:** editorial; tightened spacing for single-page fit
- **Audience:** board members, CEO, time-constrained readers
- **Distinguishing content:** 4-up KPI strip (decisions/actions/risks/questions) using large amber numerals; pull-quote of top-line outcome; four named angles (What Was Decided / What We're Watching / What's Now in Motion / What's Still Unanswered)
- **Reading time target:** 90 seconds

### §5.2 Technical Briefing (the mockup)

- **Selection rule:** `meeting_scope` for a single meeting
- **Structural transformation:** chronological with sectional grouping (Attendees, Agenda, Decisions, Actions, Risks, Questions, Parking Lot, Supporting Evidence, Belief Declarations, Audit Footer)
- **Register:** editorial; full-pagination
- **Audience:** design review board, engineering team, deep-read auditors
- **Distinguishing content:** decision detail with vote tallies and dissent paragraphs; action items as tabular tracker with IDs and ties; risks with severity and owner; testimonial-paragraph belief declarations; cited supporting evidence
- **Reading time target:** 5-10 minutes
- **Reference artifact:** the user-uploaded mockup (`meeting-minutes-mockup.html`)

### §5.3 Personal Digest

- **Selection rule:** `meeting_scope` intersected with `personal_scope`
- **Structural transformation:** addressed-to-reader; reader's actions emphasized; reader's beliefs surfaced; reader-relevant decisions highlighted
- **Register:** email-register variant; addressed personally
- **Audience:** the named recipient; auto-fanned to all attendees
- **Distinguishing content:** "Dear [Name] — here are the decisions you participated in, the action items assigned to you, the risks you own mitigation for, the open questions awaiting your answer"
- **Delivery mechanism:** email via Digest & Send surface (CMD-A6 partial implementation; full implementation post-COMPASS-BRIDGE)

### §5.4 Decision Memo

- **Selection rule:** `decision_only` filtered to a meeting or time window
- **Structural transformation:** numbered list; effective-date prominent; dissent preserved
- **Register:** editorial; legal-document feel
- **Audience:** contract attorney, regulatory affairs, compliance officer
- **Distinguishing content:** decisions only, no procedural overhead, each as a numbered binding statement with effective date
- **Use case:** attaches to 510(k) submissions, board minutes, contract files

### §5.5 Risk Register Update

- **Selection rule:** risks raised, modified, mitigated, or accepted in a meeting (or time window)
- **Structural transformation:** diff against prior register state; new entries highlighted; status changes called out
- **Register:** editorial; tabular layout per CIT register convention
- **Audience:** risk officers, audit liaison, compliance leads
- **Distinguishing content:** Crystal Ball aggregate (initial vs residual cost-weighted), severity matrix, mitigation status flags
- **Reference artifact:** the user-uploaded CIT Risk Register PDF

### §5.6 Action Plan / Project Manifest

- **Selection rule:** actions filtered to a project, time window, or owner set
- **Structural transformation:** dependency-ordered; critical path designated (post-CPM); owner workload visible
- **Register:** editorial; Gantt-overlay component
- **Audience:** project managers, team leads, individual contributors
- **Distinguishing content:** critical-path coloring, slack-budget annotations, owner-workload distribution
- **Use case:** sprint planning, resource leveling, schedule defense

### §5.7 The Reasoning Trail

- **Selection rule:** a single decision plus its full causal cone (incoming + outgoing edges, recursively)
- **Structural transformation:** graph projection; decision at center; edges fanning to evidence/dependencies/risks
- **Register:** editorial with graph-visualization elements
- **Audience:** auditors, retrospective reviewers, future architects
- **Distinguishing content:** "Why was this decision made?" answered structurally; supporting evidence cited; alternatives that were rejected; downstream consequences traced
- **Distinctive value:** no other meeting tool produces this; it is Accord's signature graph-projection output

### §5.8 Living Reference

- **Selection rule:** `firm_scope` filtered to current state (not sealed historical snapshot)
- **Structural transformation:** evergreen; reflects substrate state at view time, not at original render time
- **Register:** editorial; web-only (not exported)
- **Audience:** internal users; "what's true now?"
- **Distinguishing content:** if a decision gets superseded, the live reference shows that immediately; if a question gets answered, the answer appears inline
- **Distinction from other projections:** Living Reference is the *only* projection without a sealed snapshot; all others are anchored to substrate state at render time

---

## §6 — Counterfactual operations (the second engine)

The counterfactual engine is a graph operator that takes a substrate state plus an applied alternative and computes a parallel substrate projection. The actual substrate is unchanged (Iron Rule 42 immutability holds); the parallel projection is computed in memory and optionally sealed as its own substrate node.

### §6.1 The five operations (per Helix scenario)

PROPOSED, AWAITING ARCHITECT RATIFICATION:

1. **Substitute the decision.** Create a hypothetical decision node DC-X-cf with the alternative's structured fields. Mark as projection-only.
2. **Re-evaluate cited evidence.** Walk the original decision's `cites` edges. For each, determine whether the evidence applies under the counterfactual (often it does not — Vendor A's data sheet does not apply to a Vendor B alternative). Walk the alternative's evidence (captured during deliberation) and compose the new evidentiary basis.
3. **Propagate to dependent actions.** Walk `derives_from` edges in reverse from the original decision. Each dependent action gets a counterfactual variant; the variant's due_date recomputes from the alternative's effective_date. Lead-time differences (where captured as substrate fields) propagate.
4. **Re-evaluate raised risks.** Walk `raises` edges. Risks tied to specific properties of the original decision may be reduced, eliminated, or replaced by different risks under the alternative.
5. **Re-evaluate mitigated risks.** Walk `mitigates` edges. The alternative may mitigate risks via a different mechanism, possibly with a new sub-risk surfacing.
6. **Re-evaluate belief declarations.** Walk belief declarations attached to the original decision and adjacent decisions. Where the rationale text references the original decision specifically, mark the declaration as "warrants re-declaration." Do not fabricate new beliefs.

### §6.2 Output: the counterfactual briefing

Five sections, rendered through the projection engine using a counterfactual-specific template:

1. **The Decision and Its Alternative** — side-by-side comparison
2. **Evidentiary Basis** — what evidence supports each
3. **Operational Implications** — Gantt overlay (post-CPM); date deltas; resource shifts
4. **Risk Profile Change** — risk register diff; Crystal Ball recomputation
5. **What This Means** — narrative summary of the counterfactual's structural argument

### §6.3 Sealing a counterfactual

PROPOSED:

- The user reviews the briefing and clicks "Seal as substrate node"
- A counterfactual node is created with `node_type = 'counterfactual'`, attached to the parent decision, with the rendered briefing artifact as a substrate-anchored payload
- The counterfactual node participates in the firm's CoC chain
- Future renders of the parent decision can surface "this decision has 2 sealed counterfactuals" as a navigation affordance

### §6.4 Honest limits

The counterfactual engine never fabricates. Limits are surfaced explicitly:

- If a substrate field needed for computation is missing, the briefing renders that section qualitatively rather than quantitatively, with a flag indicating the missing data
- Second-order human and market effects are out of scope; the briefing's "Limits of this analysis" footer states this
- Belief re-declaration is flagged where warranted but never invented

---

# Part 3 — CPM and PERT Integration

## §7 — CPM as derived computation

CPM is graph mathematics applied to the substrate's action-and-precedence subgraph. Inputs are present in the substrate (where action fields are populated). Outputs are computed properties on each action node.

### §7.1 Inputs (PROPOSED, AWAITING ARCHITECT RATIFICATION)

Per §1.2 action fields:

- `duration_estimate` per action
- `precedence` edges (or `derives_from` with explicit ordering semantics)
- Anchor dates: decision effective dates serving as start anchors; hard deadlines as completion anchors
- Resource constraints (post resource-heatmap CMD): owner availability windows

### §7.2 Outputs (computed)

- `earliest_start`, `earliest_finish` per action — forward pass
- `latest_start`, `latest_finish` per action — backward pass from project end-date
- `total_slack` per action — latest_finish − earliest_finish
- `free_slack` per action — slack absorbable without affecting any successor
- `is_critical_path` boolean per action — total_slack == 0
- `project_end_date` derived — max of all earliest_finish values
- `critical_path_chain` — ordered list of actions on the critical path

### §7.3 Recomputation triggers

- Any change to action durations, precedence edges, or anchor dates triggers recomputation
- Recomputation runs as a derived view, not a stored field; reads always reflect current state
- For performance, the firm's CPM state may be cached and invalidated on substrate changes

### §7.4 Crash-cost optimization (shortest schedule)

PROPOSED, AWAITING ARCHITECT RATIFICATION:

- For each action with non-null `crash_cost_slope`, the system computes the cost of shortening that action by one day
- The optimization ranks candidate tasks by "duration reduction per dollar spent"
- Iteratively crash the cheapest critical-path task until either (a) the target duration is met, or (b) no further crashes are possible (all critical-path tasks are non-crashable or the critical path shifts to non-crashable tasks)
- Output: alternative schedule with shortened duration, named additional resource costs, named tasks crashed, new critical path

### §7.5 Cheapest-schedule optimization

PROPOSED, AWAITING ARCHITECT RATIFICATION:

- For each action with positive slack, the system can search across the slack envelope for placements that minimize resource conflicts or substitute lower-cost resources
- The optimization is bounded: cannot violate hard deadlines (`must_complete_by`), cannot exceed declared resource availability, cannot use non-substitutable resources
- The optimization respects `pinnability` — pinned actions do not move regardless of computed slack
- Output: alternative arrangement with same project end-date, lower total cost, named resource shifts, named task reorderings

---

## §8 — PERT extension

PERT adds probability distributions over duration estimates. The substrate's belief declaration mechanism (Iron Rule 45) becomes the natural source.

### §8.1 Belief-to-distribution mapping

PROPOSED, AWAITING ARCHITECT RATIFICATION:

- High confidence belief on an action's duration → tight triangular distribution {optimistic = most_likely × 0.95, most_likely, pessimistic = most_likely × 1.10}
- Mixed confidence → moderate distribution {optimistic = most_likely × 0.85, most_likely, pessimistic = most_likely × 1.30}
- Low confidence → wide distribution {optimistic = most_likely × 0.70, most_likely, pessimistic = most_likely × 1.80}
- Distribution parameters are configurable per-firm; defaults above

### §8.2 Monte Carlo simulation

- Run N iterations (default 10,000) of the project schedule, sampling each action's duration from its PERT distribution
- Per iteration, compute project end-date
- Aggregate: P50 (median completion date), P80, P95
- Identify high-variance tasks (large impact on end-date variance)

### §8.3 PERT outputs in projections

- The morning brief surfaces P50 and P80 project completion forecasts per project
- The dashboard surfaces "high-variance tasks" — tasks whose belief uncertainty contributes most to project-end-date variance; these are leverage points for further deliberation or crashing
- The risk register's project-delay impact incorporates PERT-derived variance

---

## §9 — Resource heatmap projection

PROPOSED, AWAITING ARCHITECT RATIFICATION:

### §9.1 Inputs

- Action `assigned_to_user_id`
- Action `duration_estimate` and PERT distribution
- Per-resource availability windows (from Compass calendar integration)
- Per-resource cost-per-hour and substitutability rules

### §9.2 Computation

- Sum allocated hours per resource per time bucket (day/week/month)
- Compute allocation percentage against availability
- Identify over-allocation (>100%) and under-allocation (<70%)
- Cross-reference with CPM context: distinguish "over-allocated on critical path work" (real risk) from "over-allocated on slack-buffered work" (manageable)

### §9.3 Visualization

- Heatmap grid: resources on Y-axis, time on X-axis, color intensity = allocation percentage
- Critical-path overlay: cells containing critical-path work shown with amber border
- Drag-affordance: user can drag tasks across cells to reassign or reschedule

### §9.4 Use cases

- Identifying resource bottlenecks before they cause schedule slips
- Justifying hiring decisions ("Brightwater is at 110% on critical-path work for the next eight weeks; hiring a Senior Customer Success Manager has computable schedule-risk reduction")
- Validating cheapest-schedule optimizations against real resource availability

---

# Part 4 — The Schedule Manipulation Surface

## §10 — Interactive scheduling

PROPOSED, AWAITING ARCHITECT RATIFICATION (long-horizon CMD; substantial scope):

The schedule manipulation surface is a Gantt-shaped interactive surface where the substrate is manipulable in real time, with graph constraints honored automatically.

### §10.1 Visual primitives

- Each action renders as a bar positioned at its CPM-derived earliest_start..earliest_finish
- Each bar's slack envelope renders as a translucent region around it (extending to latest_finish)
- Critical-path bars render in amber; positive-slack bars render in muted bone
- Owner avatars on each bar
- Edges between bars rendered as faint connector lines (precedence visualization)

### §10.2 Drag affordances

- User grabs a bar and drags forward/backward in time
- Within slack envelope: bar moves, no propagation, system shows "no consequences"
- Beyond slack envelope: dependent bars move with it, propagation animated, project end-date shifts visibly, cost surfaces
- Drag preview is real-time; commit is explicit (user clicks Apply or Cancel)

### §10.3 Pin and constraint affordances

- Right-click a bar → Pin in place (action cannot move regardless of slack)
- Right-click a bar → Set hard deadline (creates `must_complete_by` constraint)
- Pin/constraint changes recompute slack envelopes for all other bars

### §10.4 Optimization affordances

- Right-click on canvas → "Synthesize shortest schedule" → optimization runs, animated result, diff displayed
- Right-click on canvas → "Synthesize cheapest schedule" → similar
- Right-click on canvas → "Show me what changed since last review" → animated diff against prior committed schedule

### §10.5 Drill-down affordances

- Right-click a bar → "Show what this depends on" → dependency cone highlights, everything outside dims
- Right-click a bar → "Show what depends on this" → reverse dependency cone
- Right-click a bar → "Show the decision this derives from" → navigates to decision node in Decision Ledger

### §10.6 Commit and provenance

- User commits a schedule manipulation by clicking Apply
- The commit becomes a substrate node (the manipulation IS a decision; the user ratified it)
- The commit has `derives_from` edges to all action nodes whose dates changed
- The committed manipulation enters CoC and is sealed at the firm's next meeting END (or via an explicit "ratify schedule manipulation" affordance)

### §10.7 Multi-user collaboration

- Multiple users can view the surface simultaneously
- Drag operations broadcast in real time to other viewers
- Commits require single-user authority (the manipulating user) but are auditable to all viewers
- Conflict resolution: if two users attempt incompatible manipulations, the system blocks the second commit with a clear conflict message

---

# Part 5 — The Morning Brief

## §11 — Personalized projections

The morning brief is a projection over the substrate centered on the reader's position in the graph.

### §11.1 Per-role variants

PROPOSED, AWAITING ARCHITECT RATIFICATION:

**Individual contributor brief:**
- Personal action queue ranked by criticality (post-CPM)
- Decisions the contributor participated in declaring belief on
- Risks the contributor owns mitigation for
- Open questions assigned to the contributor with due dates
- Yesterday's substrate changes affecting their work

**Team lead brief:**
- IC brief content for self
- Plus team-level rollup: critical-path tasks owned by team members, allocation hot-spots, blocked tasks
- Plus dissent intelligence: dissents recorded by team members on decisions affecting their work
- Yesterday's status changes affecting team members

**Functional director brief:**
- Domain-filtered decision and risk view (e.g., CFO sees financial-tagged nodes)
- PERT-derived forecasts for projects in the domain
- Counterfactuals sealed yesterday and their domain impact
- Risk register movement in the domain

**Managing director brief:**
- Decision velocity (count by stakes, this week)
- Schedule health (slack remaining on each major project's critical path, trending)
- Belief-adjusted forecasts (P50 completion dates, with deltas)
- Dissent intelligence (high-leverage dissents predictively materializing)
- Counterfactual leverage (decisions worth revisiting)
- Risk register movement (firm-wide)
- Calendar context (today's meetings with substrate pre-reads)

### §11.2 Anticipatory content

The morning brief looks both backward and forward:

- **What's converging today** — meetings on calendar with their open questions queued, pre-reads, decisions expected to be ratified
- **What's diverging today** — action items hitting due dates, risk mitigation deadlines arriving, belief re-declaration windows opening
- **What's at stake today** — if the reader will participate in a decision today, the brief surfaces a counterfactual preview ("Today's vote on DC-pending-23 has these substrate implications under each candidate")

### §11.3 Drill-from-brief navigation

The brief is itself a projection — every item links into the substrate. The reader can drill from any line item into the underlying nodes, edges, decisions, beliefs, or evidence. Navigation is bidirectional; readers can move from their position outward (to the firm) or inward (to specific commitments).

---

# Part 6 — The CMD Roadmap

## §12 — Build sequence

The destination is reached through a sequence of CMDs. Each one shippable, each one compounding on its predecessors. Order matters; do not skip ahead.

### §12.1 Phase 1 — Counterfactual demo path

**CMD-PROJECTION-ENGINE-1** (next, ~6-8h)
- Refactor render-minutes Edge Function so template body is parameter, not hardcoded
- Engine accepts (template_id, substrate_state, reader_context) inputs
- Three initial templates ship: Executive Briefing, Technical Briefing (mockup-aligned), Personal Digest
- Includes the redesigned Minutes template from yesterday's redesign work as the Technical Briefing
- Closes the visible bug from the screenshots that prompted the redesign

**CMD-SUBSTRATE-COUNTERFACTUAL-MIN** (~10-12h)
- Add minimal substrate fields needed for counterfactual: `effective_date` on decisions, `due_date` with `derives_from_date_basis` on actions
- Add dissent node type with `alternative_proposed_structured` field
- Migration with backward compatibility (existing nodes retain default values)

**CMD-COUNTERFACTUAL-POC** (~12-15h)
- Implement the five graph-traversal operations (§6.1)
- Render counterfactual briefing through projection engine using counterfactual-specific template
- Demo path: one decision, one alternative (recorded dissent), three downstream nodes computed and rendered
- Sealed-counterfactual mechanism deferred to follow-up CMD if scope expands

**Phase 1 outcome:** managing director demo capability that no current product can match. ~30-40 hours total.

### §12.2 Phase 2 — Cross-module integration

**CMD-COMPASS-BRIDGE** (~10-15h)
- Add `tasks.source_uri`, `tasks.source_node_id` columns
- Wire `compass.task.create_request` event subscriber in Compass
- Bidirectional ack contract: action commits in Accord create Compass tasks; status updates in Compass propagate back
- Replace CMD-A6 placeholder cards with live routing

**CMD-SUBSTRATE-CPM-MIN** (~8-10h)
- Add `duration_estimate`, formalized `precedence_edge` semantics
- Establish anchor-date computation rules (decision effective_date as predecessor, hard deadlines as successors)
- Migration with backward compatibility

**Phase 2 outcome:** Accord substrate connected to execution; foundation for CPM laid. ~20-25 hours total.

### §12.3 Phase 3 — CPM and PERT computation

**CMD-CPM-DERIVED** (~10-12h)
- Implement CPM forward and backward passes as derived computation
- Surface slack, critical-path designation, project end-date in projection engine
- Update Action Plan template to render CPM context
- Update Personal Digest to rank actions by criticality

**CMD-PERT-EXTENSION** (~10-12h)
- Belief-to-distribution mapping per §8.1
- Monte Carlo simulation engine
- P50/P80/P95 outputs in projections
- High-variance task identification

**Phase 3 outcome:** quantitative schedule reasoning powered by team's own beliefs. ~20-25 hours total.

### §12.4 Phase 4 — Resource and schedule manipulation

**CMD-RESOURCE-HEATMAP** (~10-15h)
- Resource allocation computation
- Heatmap visualization
- Critical-path overlay on heatmap
- Cost-aware reassignment affordances

**CMD-SCHEDULE-MANIPULATION** (~20-30h)
- Interactive Gantt-shaped surface
- Drag-with-slack-honoring
- Pin and constraint affordances
- Cheapest/shortest schedule optimization

**Phase 4 outcome:** category-defining capability. ~30-45 hours total.

### §12.5 Phase 5 — Cross-cutting refinement

**CMD-IDENTITY-UNIFICATION** (multi-CMD)
- Unify session-identity globals into `window.PHUD.identity`
- Refactor coc.js `_resolveActor()` chain to do users.id → resources.id translation internally
- Eliminate Iron Rule 58's call-site override mandate

**CMD-MORNING-BRIEF** (~15-20h)
- Per-role brief variants implementation
- Anticipatory content (today's meetings, deadlines, decision-pending items)
- Drill-from-brief navigation

**CMD-LIVING-REFERENCE** (~10-15h)
- Evergreen projection that reflects current substrate state
- Web-only delivery
- Distinct from sealed-snapshot projections

**Phase 5 outcome:** daily-experience product surface complete; foundations finalized for v1.0 ship.

### §12.6 Estimated total effort

- Phase 1: ~30-40 hours
- Phase 2: ~20-25 hours
- Phase 3: ~20-25 hours
- Phase 4: ~30-45 hours
- Phase 5: ~40-60 hours

**Total: ~140-195 hours** to fully realized v1.0 with category-defining capability.

---

# Part 7 — Cross-Cutting Concerns

## §13 — Doctrinal cross-references

Every requirement above interacts with one or more ratified Iron Rules. Cross-references for major requirements:

- **Substrate immutability** (counterfactuals as parallel projections, not mutations) → Iron Rule 42
- **Typed causal edges as primitive** (the entire architectural commitment) → Iron Rule 44
- **Declared belief, not measured confidence** (PERT distribution mapping) → Iron Rule 45
- **Schema-existence verification** (counterfactual engine validates fields before computing) → Iron Rule 47 (amended)
- **HTTP behavioral verification** (CPM and counterfactual outputs verified through projection engine, not metadata) → Iron Rule 50
- **Class-conditional construction** (edge-derived render treatments in projections) → Iron Rule 51
- **Logical-concern collisions** (font loading, document rendering follow established codebase patterns) → Iron Rule 52 §4
- **First-caller hazards** (introducing new mechanisms in CPM, optimization, manipulation surface) → Iron Rule 60
- **Codebase-as-spec** (survey existing patterns before specifying new mechanisms) → Iron Rule 64

## §14 — Open architectural questions

These are unresolved and surface in the future as ratification work or further conversation:

- **Counterfactual sealing semantics.** When a counterfactual is sealed as a substrate node, does it participate in the firm's primary CoC chain or in a parallel "counterfactual CoC"? Affects audit-trail interpretation.
- **Schedule manipulation provenance.** When a user commits a schedule manipulation, what counts as the "decision" — the click-Apply action, or the underlying optimization parameters? Affects how manipulations are auditable.
- **Cross-firm projections.** ProjectHUD is firm-scoped today. If a managed services provider uses ProjectHUD across multiple client firms, how do projections behave? Out of scope for v1.0, but architecturally relevant.
- **Real-time multi-user manipulation conflicts.** §10.7 specifies blocking on conflict; richer conflict resolution (operational transformation, three-way merge) deferred.
- **PERT distribution parameter learning.** §8.1 specifies static defaults; could the system learn per-firm or per-user distribution shapes from historical accuracy of declared beliefs? Future enhancement.
- **Counterfactual chains.** Can a counterfactual itself have a counterfactual? "Under DC-02-cf, what would have happened if DC-04 had also been different?" Composable counterfactuals are mathematically tractable but UX-complex.
- **Evidence freshness.** Should evidence cited in a decision have an `expires_at` or `requires_review_by` field? Auditors care; substrate doesn't model this yet.

## §15 — Reference artifacts

Files in the project that this compendium draws from or relates to:

- `accord-vision-v1.md` — strategic narrative companion
- `accord-build-architecture-v0_1.md` (v0.1.2) — original substrate spec
- `accord-evidence-layer-v0_1.md` (v0.1.1) — substrate context document
- `Iron_Rules_36-40_Ratifications.md` through `Iron_Rules_61-64_Ratifications.md` — full doctrine canon
- `projecthud-file-inventory-v2_2.md` — file inventory
- `Style_Doctrine_v1_7.md` — visual register canon
- `hud-ecosystem-protocol-v0_1.md` — cross-module event contract
- All ratification records (Iron Rules 41-46, 47-50, 51-55, 56-60, 61-64)
- All shipped CMD briefs and hand-offs (CMD-A1 through CMD-MINUTES-PRINT-FLOW)
- `Accord-Overview.pdf` — marketing register reference
- `meeting-minutes-mockup.html` — operator-uploaded richer-template reference
- `Risk_Register.pdf` — operator-uploaded CIT register reference for substrate enrichment
- `minutes-redesigned.html` — yesterday's redesigned Minutes template (to land in CMD-PROJECTION-ENGINE-1)

---

# Part 8 — Living Document Conventions

## §16 — Update protocol

This document is alive. Conventions for keeping it accurate:

- When a new requirement surfaces in conversation, add it with the `PROPOSED, AWAITING ARCHITECT RATIFICATION` marker
- When the architect ratifies a proposed requirement, remove the marker
- When a CMD ships and lands a requirement, add a status note `(SHIPPED in CMD-X)` to the affected requirement
- When a requirement turns out to be wrong or unworkable, mark it `RETRACTED` with the reason and date; do not delete (the trail of retracted requirements is itself valuable)
- Bump the document version number on substantive changes; current is v1

## §17 — Versioning

- v1 (2026-05-05 evening) — initial draft from architectural conversation
- (future) v1.1 — first substantive revision

When versions accumulate, retain prior versions in the project file collection so the evolution of the requirements is itself auditable.

---

*End of functional requirements compendium. Companion strategic vision document at `accord-vision-v1.md`.*
