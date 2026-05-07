# Architectural Scaffolding · CMD-SUBSTRATE-COUNTERFACTUAL-MIN

**Status:** conceptual sketch (not a brief). Foundation for the eventual brief draft.

**Architect:** Vaughn (operator) + Claude (architect)
**Date:** 2026-05-06
**Strategic context:** First strategic-roadmap CMD building toward counterfactual operator capability. Per `accord-vision-v1.md`, counterfactual is "bedrock, not feature."

---

## §1 — What this CMD is for

The vision document specifies three architectural compounds that ProjectHUD becomes:

1. **Projection engine** — every artifact configuration over substrate (shipped today via CMD-PROJECTION-ENGINE-1/2)
2. **Counterfactual operator** — graph traversal computes alternatives ("what if DC-117 had been declined?")
3. **CPM linkage** — same graph computes slack, critical path, schedule manipulation

Compound 1 ships against existing substrate. Compounds 2 and 3 require substrate changes that don't yet exist. **CMD-SUBSTRATE-COUNTERFACTUAL-MIN delivers the minimum substrate changes that make compound 2 buildable, while preserving the path to compound 3.**

The "MIN" in the name is structural intent: ship the smallest substrate change set that unblocks the next CMD (CMD-COUNTERFACTUAL-POC), not a comprehensive substrate redesign. Resist scope creep. Each substrate addition justifies itself by enabling a specific subsequent capability.

---

## §2 — The three substrate additions

### §2.1 Sequence IDs (DC-01, AX-01, RK-01, OQ-01, ...)

**Problem:** accord_nodes today are UUID-keyed. Operators see UUIDs in URLs, briefs, conversations: "what's the status of `8ac92d42-...`?" UUIDs are correct for substrate references but operationally hostile — unmemorable, ungoogleable, ambiguous when shortened.

**Vision context:** the strategic vision document references nodes throughout as DC-117, AX-091, RK-022, etc. Counterfactual queries assume this addressability.

**Substrate change:**

Add to `accord_nodes`:
- `seq_class` — text, the prefix character pair (DC, AX, RK, OQ, BL, NT — one per node class)
- `seq_number` — integer, monotonically increasing per `(firm_id, seq_class)`
- `seq_id` — generated column, `seq_class || '-' || lpad(seq_number::text, 3, '0')` (computed, indexed)

Constraints:
- Unique `(firm_id, seq_id)` — no two nodes in a firm share an identifier
- `seq_number` allocated server-side via sequence or trigger (race-safe)
- Once allocated, `seq_number` and `seq_id` are immutable (Iron Rule 42 substrate immutability)

Mapping table (initial):

| Node class | Prefix |
|---|---|
| Decision | `DC` |
| Action | `AX` |
| Risk | `RK` |
| Open question | `OQ` |
| Belief | `BL` |
| Note / observation | `NT` |
| Dissent (new, see §2.2) | `DS` |

The mapping table is itself substrate (a small `node_class_seq_prefixes` table) so future node classes can register their prefixes.

**Investigation required during brief:**
- How does the existing accord_nodes population path work? Triggers, application code, or both?
- Does the existing schema have a "node class" or "node type" field already? If so, the prefix mapping keys off that.
- What does seq allocation look like under concurrent writes? PostgreSQL sequences are race-safe but per-firm scoping requires custom logic.
- How do we backfill existing accord_nodes? Strategy: write trigger; backfill rows in chronological order grouped by class; commit in single transaction.
- Are seq_ids referenced anywhere in existing UI? (Probably not — they don't exist yet.) Once introduced, where do they surface? (Brief decisions, ledger displays, URL routes, CoC events, technical briefing tooltips.)

**Operator-facing changes:**
- Decision Ledger displays `DC-117 · Modeled across seven quarters` instead of just `Modeled across seven quarters` (keeps title; prepends seq_id)
- URLs: `/accord/decision-record/DC-117` instead of `/accord/decision-record/8ac92d42-...`. Both work via redirect; UI prefers seq_id.
- CoC events reference `seq_id` in their human-readable description
- Technical Briefing template tooltips ("DC-?") become populated with actual seq_ids

### §2.2 Dissent nodes

**Problem:** decisions are recorded as ratified without first-class representation of who disagreed and why. Belief_adjustments capture some of this but as a derivative of the belief substrate, not as primary-record dissent. Counterfactual queries that ask "show me decisions where dissent existed" require querying multiple substrate tables and inferring intent.

**Vision context:** the strategic vision references "dissent registry" as a substrate concept enabling several derived projections (operator calibration, retrospective accuracy, organizational decision quality metrics).

**Substrate change:**

Add a new node class `dissent` to `accord_nodes` with the existing schema, plus:
- A new edge type `dissents_from` connecting a `dissent` node to a `decision` node
- Specific metadata fields on dissent nodes:
  - `dissented_by` — UUID, the actor (resource_id per IR58 amended)
  - `dissent_rationale` — text, free-form
  - `dissent_predicted_outcome` — text, optional; what the dissenter predicted would happen
  - `dissent_recorded_at` — timestamp; when dissent was logged (vs when decision was made)

Dissent nodes get the `DS` seq prefix. So `DC-117` (a decision) might have `DS-014` and `DS-019` dissents attached.

Lifecycle:
- A dissent must reference an existing decision via the `dissents_from` edge
- Once recorded, dissent nodes follow IR42 immutability — they can be archived but not modified
- Dissent does NOT block decision sealing; a decision is ratified despite registered dissent
- The decision node carries a derived count of registered dissents (`dissent_count`) for query convenience

**Investigation required during brief:**
- Does the existing accord_nodes table support per-class field extensions (e.g., a JSONB `metadata` column), or do new node classes require schema additions?
- Is there an existing edge type registry, and how do new edge types get registered?
- RLS implications: dissent visibility — same firm-scoped rules as parent decision? Or more restrictive (dissenter + organizer only)? Architect confirm.
- CoC event emission: `accord.dissent.recorded` is the new event type. Lands in EVENT_META in `js/coc.js`.

**Operator-facing changes:**
- Decision Record UI gains a "Dissent" panel showing registered dissents (operator-judged design)
- Living Document displays a small dissent-count badge next to dissented decisions
- Retrospective queries (future capability): "decisions with dissent registered; correlation between dissent presence and outcome"

**Why dissent matters for counterfactual:**
The counterfactual operator's value depends on substrate that captures the *path not taken*. Today, the substrate captures only the path taken (the ratified decision). Dissent nodes are the substrate's representation of "and here's the path that was considered and rejected, and here's who made that case." Counterfactual analysis with dissent substrate becomes traceable: "DC-117 was ratified despite DS-014's prediction that the latency hit would exceed 500ms. The latency hit was 612ms. DS-014's predicted outcome was correct. The dissenter's calibration improves."

This is the substrate base for organizational decision quality metrics over time. Without dissent nodes, those metrics aren't derivable.

### §2.3 effective_date and due_date fields

**Problem:** accord_nodes have `created_at` (when the row was written) and `sealed_at` (when ratified, immutability triggered). Neither captures *when the decision takes effect* or *when associated work is due*. Counterfactual queries that ask "what would have happened if this decision had taken effect three months earlier?" require effective_date as substrate. CPM substrate (compound 3) requires due_date.

**Substrate change:**

Add to `accord_nodes`:
- `effective_date` — date, nullable; when the decision/action/etc. takes effect
- `due_date` — date, nullable; when associated work is due
- `effective_date_basis` — text, nullable; brief description of how effective_date was set ("operator-stated", "default-from-template", "computed-from-edges")

Both fields are mutable until `sealed_at` is set; immutable thereafter (per IR42).

Field semantics by node class:
- **Decisions (DC):** `effective_date` = when the decision takes effect (e.g., a pricing change effective 2026-07-01). `due_date` typically null (decisions don't have due dates; their downstream actions do).
- **Actions (AX):** `effective_date` = when the action begins. `due_date` = when the action must complete.
- **Risks (RK):** `effective_date` = when the risk window opens. `due_date` = when the risk window closes (mitigation deadline).
- **Open questions (OQ):** `effective_date` typically null. `due_date` = when an answer is required.
- **Beliefs (BL):** both null typically; beliefs are timeless until adjusted.
- **Dissent (DS):** `effective_date` = when the dissent is recorded. `due_date` null.

**Investigation required during brief:**
- Are there existing nullable date fields on accord_nodes that could be repurposed, or do these need to be net-new columns?
- Does the existing UI capture any "when does this take effect" / "when is this due" data informally (e.g., in description text)? If so, migration path: parse and populate, or leave existing rows null and require operator to backfill?
- CoC event emission for date changes: does updating `effective_date` (pre-seal) emit a CoC event? Probably yes for traceability.
- Edge implications: if action AX-005 has `due_date = 2026-07-15` and depends on decision DC-117 with `effective_date = 2026-07-01`, the substrate is internally consistent. If DC-117 moves to `effective_date = 2026-08-01`, what happens to AX-005? Architect-decide: substrate flags inconsistency or allows operator to manually resolve.

**Why these dates matter:**
- **Counterfactual:** "what if DC-117 had been effective 2026-04-01 instead of 2026-07-01?" requires effective_date as queryable substrate
- **CPM:** "what's the critical path through these actions, given their dependencies and due dates?" requires due_date
- **Resource heatmap:** "which operators have due_date concentrations in the same month?" requires due_date
- **Brief generation:** "decisions taking effect in Q3 2026" requires effective_date

---

## §3 — What this CMD does NOT include

Resist scope creep. Each item below is real work that belongs in subsequent CMDs:

- **No counterfactual UI.** This CMD ships substrate; CMD-COUNTERFACTUAL-POC ships the first counterfactual surface.
- **No CPM logic.** This CMD adds due_date as substrate; CPM substrate (CMD-CPM-SUBSTRATE-1) and CPM derivation (CMD-CPM-DERIVED-1) are separate.
- **No PERT distributions.** Per the vision document, PERT requires counterfactual + CPM as foundation. Several CMDs out.
- **No retrospective accuracy queries.** Substrate-only; the queries (and the surfaces displaying them) come later.
- **No dissent UI changes beyond minimum visibility.** This CMD makes dissent a queryable substrate primitive; CMD-DISSENT-UI-1 (or whatever name) handles the operator-facing flow for registering dissent. (Probable design: small "Register dissent" affordance on Decision Record; dissent panel on Living Document; full retrospective surface lands later.)
- **No backfill of historical "implicit dissent."** Existing decisions without dissent nodes stay that way. Future decisions can register dissent; operators can voluntarily backfill notable historical dissents but not required.

The spirit: this CMD opens three doors. Subsequent CMDs walk through them.

---

## §4 — Architectural design questions to resolve before the brief drafts

These are open questions for operator-architect deliberation before the brief is written. Answering them shapes the brief's structure and scope.

### Q1 — seq_id allocation strategy

Two viable approaches:

**Option A — PostgreSQL sequence per (firm_id, seq_class).** Create sequences dynamically as new (firm, class) combinations appear. Pro: race-safe, atomic. Con: meta-substrate (sequences are objects); per-firm sequence proliferation if firm count grows.

**Option B — Trigger + lock-and-increment.** Trigger on accord_nodes INSERT acquires advisory lock keyed by (firm_id, seq_class), reads max(seq_number)+1, releases lock. Pro: no proliferating sequences. Con: trigger complexity; lock contention under high concurrency.

**Architect lean:** Option B. Concurrency is low (single firm, single operator typical). Trigger logic is local and inspectable. Avoids meta-substrate.

### Q2 — Dissent edge or dissent FK?

Two viable approaches:

**Option A — Edge in accord_edges.** Use existing edge substrate; create `dissents_from` edge type. Pro: consistent with existing graph model; edges already firm-scoped + RLS'd. Con: dissent → decision relationship is conceptually 1:1 (a dissent dissents from exactly one decision), and edges are typically N:M.

**Option B — `dissents_from_node_id` FK column on dissent-class accord_nodes.** Direct FK. Pro: enforces 1:1 cardinality at schema level; query simplicity. Con: schema branching by node class; sets precedent for class-specific FK columns.

**Architect lean:** Option A (edge). Consistency with existing graph model trumps cardinality precision; the 1:1 cardinality is enforceable via trigger or check constraint without schema branching.

### Q3 — Should dissent nodes carry their own seq_class?

Two viable approaches:

**Option A — Yes, DS prefix.** Dissents are first-class nodes with their own seq IDs (DS-014).

**Option B — No, dissents borrow their parent decision's ID.** A dissent against DC-117 is referred to as "DC-117/dissent-1" or similar.

**Architect lean:** Option A (DS prefix). First-class dissent nodes that can be referenced independently. "DS-014 was correct in retrospect" reads better than "DC-117/dissent-1 was correct in retrospect."

### Q4 — effective_date vs created_at semantics

For decisions with no operator-stated effective_date: should `effective_date` default to `created_at`, default to NULL, or refuse the insert?

**Architect lean:** default to NULL. Forces operator to consider "when does this take effect?" as a real question. Templates and UI can suggest `created_at` as the default but the operator should affirm. This nudges substrate quality.

### Q5 — Dissent and sealed status

Can dissent be registered against an already-sealed decision?

Two viable approaches:

**Option A — No.** Dissent must be registered before seal; sealed decisions are immutable including their dissent set.

**Option B — Yes, with timestamp.** Late dissent is allowed; the substrate captures `dissent_recorded_at` clearly so retrospective vs prospective dissent is distinguishable.

**Architect lean:** Option B. Real organizations have late dissent ("six months later, X disagreed with this call"). Suppressing it loses substrate fidelity. The timestamp distinction handles operational ambiguity.

### Q6 — IR42 immutability extends to seq_id?

Once a node is sealed, its seq_id is immutable. But can seq_id change *before* sealing? Probably not — operator memory of seq_ids accrues quickly; mutability would create confusion.

**Architect lean:** seq_id immutable upon allocation, regardless of sealed status. Allocation happens at INSERT time; the seq_id is the row's name from birth.

---

## §5 — Effort estimate and phasing

This is a substantial CMD. Estimate: 8-15 hours agent work, multi-session probable.

**Suggested phasing:**

**Phase 1 — Investigation:**
- Survey accord_nodes schema and existing class/type fields
- Identify existing seq-id-like patterns (if any)
- Identify edge type registry mechanism
- Document RLS policies for dissent visibility
- Surface findings to architect

**Phase 2 — Substrate migration (sequence IDs):**
- Migration adds seq_class, seq_number, seq_id
- Trigger for allocation
- Backfill historical rows
- Index seq_id for query performance

**Phase 3 — Substrate migration (dissent):**
- New edge type registration
- New CoC event types
- Optional minimum UI: ability to register dissent (small affordance, not a redesign)

**Phase 4 — Substrate migration (dates):**
- effective_date, due_date columns
- effective_date_basis column
- CoC events for date changes

**Phase 5 — Verification:**
- Substrate consistency tests
- Backfill validation
- IR42 immutability holds
- Cross-firm RLS holds
- Existing CMD regression

Each phase has a halt-and-surface point. The agent does not run all phases in one shot.

---

## §6 — Doctrine implications

This CMD will likely trigger:

- **No new Iron Rules** (probably) — the substrate additions are extensions of existing patterns, not new rule classes
- **IR42 reconfirmed** through immutability of new fields once sealed
- **IR45 reconfirmed** through vocabulary check (avoid "confidence", "likelihood", etc. in any new UI)
- **IR58 reconfirmed** through CoC events using the amended actor-resource resolution
- **IR65 likely fires** if any template body changes (the Technical Briefing template's DC-? tooltips become real seq_ids; that's a template body change)

If IR65 fires, RENDER_VERSION moves alongside js/version.js. First time in many CMDs that IR65 fires affirmatively — worth confirming during brief drafting.

**Candidate doctrinal observation:** "substrate additions that enable downstream architectural compounds are minimum-scoped to unblock the next CMD, not maximum-scoped to anticipate the full eventual capability." Pattern from this CMD's "MIN" intent. Not yet a rule; one CMD = one data point.

---

## §7 — Sequence after this CMD

Per the vision document's roadmap:

1. CMD-SUBSTRATE-COUNTERFACTUAL-MIN (this one)
2. CMD-COUNTERFACTUAL-POC (first counterfactual surface; probably an Aegis playbook that walks the graph)
3. CMD-COMPASS-BRIDGE (Compass tasks reference accord seq_ids; bidirectional substrate linkage)
4. CMD-CPM-SUBSTRATE-1 (dependency edges with weights/durations)
5. CMD-CPM-DERIVED-1 (slack and critical path computation)
6. CMD-PERT-1 (PERT distributions on top of CPM)
7. CMD-RESOURCE-HEATMAP-1 (resource visualization derived from due_dates + assignments)
8. CMD-SCHEDULE-MANIPULATION-1 (the long-horizon destination — operators manipulate schedule and see propagated effects)

Each of those is a separate CMD with its own brief. CMD-SUBSTRATE-COUNTERFACTUAL-MIN unblocks the first three.

---

## §8 — Pending decisions before brief drafts

The architect-operator deliberation needed to convert this scaffolding into a brief:

**Decisions needing operator confirmation:**

- **Q1** — Sequence allocation strategy (architect-leans Option B / trigger)
- **Q2** — Dissent representation (architect-leans Option A / edge)
- **Q3** — Dissent seq prefix (architect-leans Option A / DS prefix)
- **Q4** — effective_date default (architect-leans NULL default)
- **Q5** — Late dissent (architect-leans Option B / allowed with timestamp)
- **Q6** — seq_id immutability scope (architect-leans immutable upon allocation regardless of sealed)

**Decisions worth operator weigh-in:**

- Phasing — is the 5-phase split right, or should some merge?
- Effort estimate — 8-15h is rough; architect-side guess; operator may have different intuition
- Sequence prefix mapping table — DC, AX, RK, OQ, BL, NT, DS — operator confirms or proposes alternatives
- Whether minimum dissent UI (Phase 3 last bullet) is in scope or deferred to its own CMD
- IR65 — does the architect want template-body changes (Technical Briefing tooltips) folded into this CMD or deferred to its own CMD?

These deliberations don't need to happen now. The scaffolding holds the conceptual frame; brief drafting can resume after rest with these questions surfaced.

---

*End of architectural scaffolding — CMD-SUBSTRATE-COUNTERFACTUAL-MIN.*
