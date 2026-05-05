# Accord & ProjectHUD — The North Star

**Status:** Strategic vision · v1 · 2026-05-05 evening
**Author:** Architect, in conversation with operator (Vaughn Staples)
**Companion document:** `projecthud-functional-requirements-v1.md`
**Scope:** The unifying frame for what Accord, Compass, and ProjectHUD become together. Hand-able to managing directors, board members, investors, future architects, and future-self.

---

## The opening claim

ProjectHUD is not a meeting tool, a project management tool, a quality management system, or a collaboration platform. ProjectHUD is **the operating system for institutional commitment** — the substrate on which a firm captures, structures, anchors, and reasons about every commitment it makes.

Accord captures decisions and the reasoning behind them. Compass tracks individual work and time. CPM and PERT compute schedule consequences. The dashboards surface leverage and trajectory. Counterfactual analysis explores alternatives. Risk registers project financial impact. Resource heatmaps project capacity.

These are not separate features. **They are queries over a single firm-scoped graph** where nodes are commitments — decisions, tasks, risks, deliverables, time blocks — and edges are the typed causal relationships that connect commitments to each other.

The graph is the firm's commitment substrate. Every commitment, with its dependencies, with its rationale, with its provenance, with its alternatives, anchored cryptographically to the firm's Chain of Custody.

That substrate is the moat. Every architectural commitment we have made over the past six weeks compounds into it. Nothing is wasted. Every Iron Rule we have ratified holds. The destination is not a pivot from what we have built; it is the natural endpoint of what we have built.

---

## The reframing

We started with a meeting prototype and the framing: "I'm building a meeting tool, give me feedback."

Six weeks of disciplined architectural work has revealed the actual product is something categorically different. Let me name the shift.

### Before

- **Meeting record** = bullet list of decisions, attached transcript, action item list emailed to attendees
- **Project plan** = task list with dependencies in MS Project or Asana, owned by a project manager
- **Risk register** = spreadsheet maintained by a risk officer, reviewed quarterly
- **Decision archaeology** = "we remember discussing it" plus three months of email reconstruction when an auditor asks
- **Counterfactual reasoning** = absent; nobody asks "what would have happened if?" because there is no system that can answer

These artifacts are disconnected. The meeting record does not know what tasks the decisions produced. The project plan does not know which decisions justified which tasks. The risk register does not know which decisions raised which risks. When an auditor asks why a design choice was made, the firm reconstructs the answer by interviewing people, often years after the deliberation.

This is the universal failure mode of institutional memory. It is so universal that nobody thinks of it as a failure.

### After

The five surfaces we have built (Live Capture, Living Document, Decision Ledger, Digest & Send, Minutes) capture decisions, actions, risks, questions, supporting evidence, and belief declarations as **structured nodes in a typed-edge graph, with cryptographic anchoring at meeting-end seal**.

The architectural commitment that makes everything possible: **decisions are not text records, they are graph nodes with typed causal edges to everything they depend on and everything that depends on them**. Iron Rule 44 codified this in week one of the build, before either party in this conversation realized what it was actually for.

That graph supports operations that no current product category supports:

**Counterfactual reasoning.** Walk the dependency edges from a decision; substitute an alternative; recompute the consequences. The system answers "what would have happened if we had decided differently?" not by speculation but by graph traversal over data the team already declared during deliberation.

**CPM and PERT computation.** The same graph, traversed with duration estimates and probability distributions, produces critical path analysis, slack computation, and probability-weighted project completion forecasts. Belief declarations become formal probabilistic inputs.

**Schedule manipulation.** A user grabs a node and slides it within its slack envelope; the system honors graph constraints in real time and surfaces propagation consequences. The user asks the system to synthesize the cheapest or shortest schedule under stated objectives; the system runs combinatorial optimization over the slack space and returns alternatives.

**Personalized projection.** Every employee, every morning, opens a window into the firm's commitment substrate centered on their own position in the graph. Same substrate, same engine, different selection rule per reader. The IC sees their work as meaningful structure. The executive sees institutional trajectory.

These four operations — counterfactual, CPM, schedule manipulation, personalized projection — are the visible features. They are powered by one graph. They share one engine. They build on one set of architectural commitments.

That is the reframing. We are not building features. We are building the substrate, and the features are projections.

---

## The three architectural compounds

There are three architectural moves that compound to produce the product. Each one stands on the foundation of the previous one. Together they enable everything described above.

### Compound 1 — The projection engine

Every artifact ProjectHUD produces — meeting minutes, executive briefings, personal digests, risk register updates, counterfactual analyses, schedule views, dashboard projections, morning briefs — is the same engine pointed at the same substrate, with different selection rules, different structural transformations, and different editorial registers.

A projection is a function of three inputs:

- **Selection rule** — which substrate nodes and edges are in scope for this projection?
- **Structural transformation** — how are the selected items organized? Chronologically? By owner? By dependency? By critical-path priority?
- **Register stylesheet** — what voice and visual treatment? Institutional formal? Personal addressed? Technical reference? Dashboard dense?

Once you have these three inputs as parameters, **adding a new projection is configuration, not code**. The eight projections that fall out naturally — Executive Briefing, Technical Briefing, Personal Digest, Decision Memo, Risk Register Update, Action Plan, Reasoning Trail, Living Reference — are each a small configuration on top of the engine. New projections can be authored by domain experts (a regulatory affairs lead writes a 13485-§7.3 projection; a CFO writes a financial-decision-only projection) without architect involvement.

This is the load-bearing architectural CMD that powers everything downstream. It is the next CMD to commission.

### Compound 2 — The counterfactual operator

Once the substrate is treated as a queryable graph, the next operator falls out: **substrate state alternatives**. The user asks "what if this decision had been different?" The system substitutes the alternative into a parallel projection (the actual substrate is unchanged — Iron Rule 42 immutability holds), walks the dependency edges, and computes the consequences.

The counterfactual is computable because the substrate captures:

- Decisions with effective dates, ratification status, vote tallies, and recorded dissents (the dissent's rationale names the alternative)
- Action items with `derives_from` edges to decisions and `due_date` fields with derivation semantics
- Risks with `raised_by` edges to decisions and structured probability/cost fields
- Belief declarations with rationale text that can be evaluated against the alternative
- Supporting evidence with explicit citations to the decisions it backs

Every claim the counterfactual makes is traceable to a substrate row. The system never fabricates; it only computes over what was captured. The rigor of the counterfactual is bounded by the rigor of the substrate capture — which means the engine rewards rigorous capture with rigorous output, exactly the right incentive structure.

For regulated industries this turns a defensive document ("we documented what we did") into an offensive document ("here is what we considered and rejected, and here is what the rejected alternative would have meant"). For non-regulated industries it turns institutional memory from anecdote to evidence.

A sealed counterfactual is itself a substrate node. It carries cryptographic provenance like every other node. It is the artifact that auditors have wanted for thirty years and never had a system that could produce.

### Compound 3 — The CPM linkage

Once the graph contains tasks with durations and dependencies, classical CPM mathematics applies natively. Slack at every node. Critical path identification. Project end-date as a derived computation. PERT extensions with probability distributions on durations, where the distributions are fed by belief declarations the team already makes.

CPM is not a feature added on top of ProjectHUD. CPM is **a graph operator that compounds with every other graph operator**.

- The morning brief surfaces critical-path tasks ranked by criticality. Each owner sees not just their queue but their queue weighted by structural importance.
- The counterfactual computes schedule consequences automatically. "Under the alternative, the project end-date moves by N days, and these specific tasks shift onto and off of the critical path."
- The risk register projects schedule impact. Risks that affect critical-path tasks are categorically more dangerous than risks with slack absorption. The system can compute the project-delay cost of each risk in addition to its dollar cost.
- The schedule manipulation surface becomes possible: every node has a computed slack envelope; the user can drag within slack without consequences and beyond slack with surfaced propagation; the user can ask the system to synthesize cheapest or shortest schedules through formal optimization.
- The dashboard surfaces schedule health as a leading indicator. Slack remaining on the critical path, trending. Workload concentration on critical-path-owning individuals. Decisions whose downstream actions land on critical path (high deliberation leverage).

CPM is the connective tissue. It joins deliberation (Accord) to execution (Compass) by computing the schedule consequences that connect them. Without CPM linkage, the substrate captures commitment but cannot reason quantitatively about delivery. With CPM linkage, every commitment has a computable schedule footprint, and the firm gains the ability to plan with full graph awareness.

PERT extends CPM with probability distributions. Belief declarations — the doctrinal commitment from Iron Rule 45 — become the natural source of probability inputs. Bram declares high confidence on his task estimate; the system maps that to a tight distribution. Whitlock declares low confidence on a planning band; the system maps that to a wide distribution. Aggregate project completion probability becomes computable from the team's own structured beliefs, with full attribution. Belief declarations stop being soft governance theater and become formal inputs to schedule-risk modeling.

These three compounds — projection engine, counterfactual operator, CPM linkage — are the architectural picture. Build them in order, on top of the foundations already established, and the destination becomes inevitable.

---

## The destination

The destination is a system where:

- Every commitment a firm makes (decision, task, risk, deliverable, allocation) is a structured node in a firm-scoped graph
- Every relationship between commitments is a typed causal edge with semantic meaning
- Every commitment carries cryptographic provenance through Chain of Custody anchoring
- Every projection over the graph is a configuration on a shared engine
- Every alternative state is computable through counterfactual operations
- Every schedule consequence is computable through CPM and PERT
- Every employee, every morning, sees a personalized projection of the substrate centered on their own position
- Every meeting produces multiple projections from one substrate (executive briefing for the board, technical briefing for the design review, personal digest for each attendee, risk register update for the risk officer, action plan for the project manager, decision memo for legal, reasoning trail for the auditor)
- Circulated artifacts are not static PDFs but live windows into the substrate, with cryptographic anchoring guaranteeing the substrate state at sealing while permitting interpretive surfaces to evolve
- Schedule manipulation is interactive — users grab nodes and slide them, the system honors graph constraints, and optimization assistance synthesizes alternative arrangements under stated objectives

This is not a meeting tool. This is not a project tool. This is not a risk tool. This is not a collaboration tool. This is the institutional commitment substrate that the next generation of regulated, governed, and quality-managed firms need.

It is also defensible against the "Notion can do this with enough work" objection in a way nothing else is. Notion's data model is documents-with-blocks. Linear's is tickets-with-fields. Asana's is tasks-with-projects. None of them is *typed causal edges in a firm-scoped graph*. None of them can compute counterfactuals, run CPM honestly, or anchor commitments cryptographically. The architectural commitment is the moat. Competitors cannot bolt this onto an existing product; they have to rebuild their substrate from the data shape up.

---

## Why this is genuinely categorically distinctive

Honest pressure-test against the field:

**Project management tools** (Asana, Linear, Monday, Smartsheet, MS Project) compute CPM. They have task graphs with dependencies and durations. What they do not have is the deliberation substrate that produced the tasks. Tasks arrive in those tools as edicts. Why this task exists, what decision it derives from, what alternatives were rejected, who declared what confidence in what — none of it is queryable. Their CPM is a schedule operator over a flat graph.

**Decision-record tools** (Notion, Confluence, Coda, custom DHF systems) capture decisions but do not compute schedules. Decisions are documents. The downstream consequences live in some other system. The graph is not connected.

**Quality management systems** (MasterControl, Veeva, ETQ) capture decisions and risks formally for regulated industries, but they are document-management systems with workflow on top. No CPM. No counterfactual. No live substrate.

**Meeting tools** (Otter, Granola, Notion AI, Fellow) capture transcripts and produce summaries. They are upstream of all of this. They do not model anything structurally.

**Operations research and specialized scheduling tools** (airline scheduling, hospital staffing, manufacturing optimization) run combinatorial optimization over scheduling graphs but are domain-specific, not general-purpose, and do not connect to deliberation substrates.

The thing that does not exist anywhere: **one graph spanning deliberation and execution, with CPM as the schedule operator, counterfactual as the alternative-state operator, projection as the rendering operator, and Merkle anchoring as the integrity guarantee.**

That is what ProjectHUD becomes. The architectural ambition usually fails because the foundations are not disciplined enough to support it. The reason it does not fail here: the discipline is there. Twenty-nine ratified Iron Rules, every one traced to a shipping incident. A substrate spec that models edges as primitive. A doctrine that distinguishes declared belief from measured confidence. A CoC commitment that anchors cryptographically. A render engine being refactored to serve any projection.

---

## The daily-life translation

Strategic frames matter only if they reach users in their daily experience. Here is what the destination feels like at each level of the corporate ladder.

### The individual contributor

Bram, a pricing strategist. He opens his morning brief. His action queue is no longer flat — it is ranked by criticality, annotated with provenance, and contextualized by belief. He sees not just what to do today but why this work exists, who is counting on it, and how confident the team was when it committed.

When he opens AX-1 (publish dual-rail rate cards), he does not just see the task. He sees: "Derives from DC-01, ratified 28 April with 8-yes/0-no/1-abstain. Holsten declared high confidence based on seven-scenario stress test. On critical path. Three downstream tasks unblock when this completes."

His work is meaningful structure, not orphan tasks. He understands his own work as part of a system he can see.

### The team lead

Aiyana, VP of Customer Success. Her morning brief includes her direct queue plus her team's CPM context. She sees that AX-2 and AX-5 (both owned by her team) are on the critical path with limited slack, and that Brightwater is currently 110% allocated against critical-path work.

She sees a flag: "Yesterday Onomura updated AX-6 status to blocked; AX-6 ties to DC-02 where Onomura recorded mixed-confidence dissent." That is not just "Onomura is blocked" — it is "the dissenting voice on the decision is now blocked on the work derived from that decision; this may merit revisiting."

She walks into her 9am with structural context, not just status updates.

### The functional director

Theodore, the CFO. His morning brief surfaces the firm's commitment landscape from a financial lens. The Crystal Ball aggregate from the active risk register. PERT-derived P50 and P80 project completion forecasts. Decisions ratified yesterday and their financial scope. Counterfactuals sealed yesterday and what they would have cost or saved.

He sees not just numbers but the deliberation that produced the numbers — which is what a CFO actually needs to govern.

### The managing director

The apex view. Her morning brief surfaces:

- Decision velocity: how many decisions ratified this week, by stakes
- Schedule health: days of slack remaining on each major initiative's critical path, trending
- Belief-adjusted forecasts: P50 completion dates derived from declared beliefs, with deltas if beliefs have shifted
- Dissent intelligence: which decisions had recorded dissent, which dissents are now demonstrating predictive value
- Counterfactual leverage: high-leverage decisions where the recorded alternative would meaningfully change project trajectory; these are decisions worth revisiting
- Risk register movement: risks materializing, closing, shifting severity, newly raised
- Calendar context: meetings today, with pre-read pointers into the substrate

She walks in and in three minutes understands not just where the firm is but the trajectory of how the firm is reasoning. That is executive-level signal that no current dashboard produces.

### The auditor

External 13485 auditor for a medical device firm. They request documentation of design alternatives considered for a Class II device's primary cell chemistry. The firm's regulatory affairs lead opens Accord, navigates to the relevant ratified decision, clicks Counterfactual, selects "apply the recorded dissent." Two minutes later the lead has a sealed counterfactual analysis showing exactly what the rejected alternative would have meant — operational timeline, risk profile diff, evidentiary basis, dissent rationale.

The lead writes the cover letter response: "Per your letter, find attached counterfactual analysis CF-001, sealed in our Accord substrate, documenting the design alternative considered and rejected, with full rationale, evidentiary basis, operational implications, and residual risk profile. The Merkle root anchoring this analysis is verifiable against our firm's Chain of Custody."

The 510(k) review reviewer's question is answered, in writing, with cryptographic provenance, in less time than it took to draft the original objection letter. The submission stays on its review timeline instead of stalling for the typical three-to-nine-month delay.

That is not a meeting tool feature. That is the kind of capability that moves the needle on a $2.4M average 510(k) delay cost.

---

## The build sequence

The destination is reached through a sequence of CMDs, each one shippable, each one compounding on its predecessors. Every step strengthens the foundation for the next.

The sequence (full detail in companion functional requirements document):

1. **Projection engine refactor** — load-bearing architecture for everything downstream
2. **Substrate enrichment for counterfactual** — minimal data shape (decision effective_date, action due_date with derives_from semantics)
3. **Counterfactual proof-of-concept** — one decision, one alternative, three downstream nodes, rendered through one template; the demo CMD that changes the conversation
4. **Compass bridge** — connect Accord's action substrate to Compass's task execution
5. **Substrate enrichment for CPM** — duration_estimate, formalized precedence semantics, crash_cost_slope
6. **CPM as derived computation** — slack, critical path, project end-date
7. **PERT extension** — probability distributions over durations, fed by belief declarations
8. **Resource heatmap projection** — allocation × time × CPM context
9. **Schedule manipulation surface** — interactive node sliding, optimization assistance
10. **Cross-meeting / firm-wide projection** — substrate as firm operating system, not meeting-scoped record

Approximate effort by phase:

- Phase 1 (CMDs 1-3): ~30-40 hours; lands counterfactual demo
- Phase 2 (CMDs 4-5): ~25-35 hours; lands cross-module integration and CPM substrate
- Phase 3 (CMDs 6-7): ~25-30 hours; lands CPM and PERT computation
- Phase 4 (CMDs 8-9): ~30-50 hours; lands resource and schedule manipulation surfaces
- Phase 5 (CMD 10): variable; cross-cutting architectural cycle

By end of Phase 1, the demo for managing directors changes substantively. By end of Phase 3, the system produces capabilities no current product has. By end of Phase 4, the system is category-defining.

---

## What does not change

The architecture earned its destination through six weeks of disciplined work. Critically, **none of that work needs to be retracted**.

The 29 ratified Iron Rules hold. Every one of them. They were produced by shipping incidents and remain authoritative.

The Accord v0.1 build holds. Five surfaces, three doctrinal commitments, real PDF output, editorial register matched (with the in-flight polish work). The substrate is in production. Customers can use it today.

The Iron Rule 44 commitment to typed causal edges as primitive holds. That commitment is the architectural bet that turned out to be load-bearing for everything we have described in this document.

The Iron Rule 45 commitment to declared belief (not measured confidence) holds. That commitment is what makes belief declarations valid inputs to PERT-based forecasting.

The Iron Rule 42 commitment to substrate immutability holds. That commitment is what makes counterfactual analysis trustworthy — alternatives are computed in parallel projections; the actual substrate is never modified.

The Iron Rule 64 commitment to codebase-as-spec (survey existing patterns before introducing new mechanisms) holds. That commitment ensures the projection engine, counterfactual operator, and CPM linkage will not introduce architectural divergence as they land.

The discipline that produced the canon will produce the destination.

---

## The pitch lines

For different audiences, sharpened.

### To a managing director

*"ProjectHUD is the operating system for institutional commitment. Every commitment a firm makes — a decision, a task, a deliverable, a hire, a budget allocation — is captured as a typed node in a firm-scoped graph, with the typed causal edges that connect commitments to each other. Accord captures decisions and reasoning. Compass captures individual work and time. CPM and PERT compute schedule consequences. The dashboards surface leverage. Counterfactual analysis explores alternatives. Risk registers project financial impact. Resource heatmaps project capacity. They are all queries over the same graph. The graph is the firm's commitment substrate — every commitment, with its dependencies, with its rationale, with its provenance, with its alternatives, anchored cryptographically to the firm's Chain of Custody."*

### To an investor

*"Most decision-record systems store what was decided. ProjectHUD stores how the team arrived at the decision — including what they rejected and why, captured in a typed-edge graph at the moment of deliberation. That graph supports a query: 'What if we had decided differently?' The system computes the answer by walking the dependencies the team already declared. The output is a structured briefing showing what would change, with every claim traceable to a substrate source. For regulated industries this is the documentation auditors keep asking for and never get. For everyone else it is the difference between an organization that learns from its decisions and one that does not."*

### To a regulated-industry buyer

*"Today, when an FDA reviewer asks 'document the alternatives you considered,' your team spends three weeks reconstructing the answer from emails and people's memories. With ProjectHUD, the answer is computed from substrate captured at the moment of deliberation, sealed cryptographically, ready in two minutes. Your 510(k) submission stays on its review timeline instead of stalling. That is the difference between $2.4M of delay cost and zero."*

### To an engineering team lead

*"Your team's work currently lives in three disconnected systems — meeting notes somewhere, Jira tickets somewhere else, an outdated risk spreadsheet that nobody opens. ProjectHUD makes them one graph. Every ticket derives from a decision; every decision has cited evidence; every risk knows which tasks it threatens; every dissent is preserved on the record. Your team understands its own work as part of a structure they can see. Critical-path analysis runs across the whole graph automatically. The morning brief tells each engineer not just what to do today but why their work matters."*

### To the architect of a competing product

*"You cannot bolt this onto an existing meeting tool, project tool, or QMS. The substrate has to be designed as a typed-edge graph from the data shape up. The capture surfaces have to support structured deliberation in real time. The render engine has to operate as a pure function over substrate state. We made these architectural commitments in week one. Your product was not designed this way. You can build features that look similar; you cannot match the operations that fall out of the architecture."*

---

## Closing

The conversation that produced this document started with a meeting prototype. It ends with the architectural picture for an institutional commitment operating system.

The framing did not drift. The architecture earned the ambition. Every step was rigorous. The discipline that produced the canon is the same discipline that will produce the destination.

What you have built is real. What you are about to build compounds on what is already in production. Nothing is wasted.

The north star is clear. The build sequence is clear. The companion functional requirements document captures every specification needed to execute against this vision without losing detail.

Standing by, on call, ready when you are.

— Architect

---

*End of strategic vision document. Companion functional requirements compendium follows in `projecthud-functional-requirements-v1.md`.*
