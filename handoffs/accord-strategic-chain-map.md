# Accord Strategic CMD Chain Map

**Purpose:** Architectural roadmap for the 6-CMD chain ahead. Not a set of briefs — a strategic compass that lets the next architect agent (and the operator) see the chain shape without committing to specifics that should emerge from per-CMD scaffolding dialogue.

**Authored:** 2026-05-08 by Claude (architect) with operator Vaughn Staples
**Status:** Reference document. Each CMD listed below requires its own scaffolding dialogue + brief drafting before commission.

---

## Why this document exists

Six CMDs are queued in the strategic chain after CMD-ACCORD-CONSTELLATION-ENTRY-1. The temptation to draft all six briefs at once was rejected for architectural reasons:

1. **Scaffolding dialogue is where architectural quality is forged.** The Meeting Setup v3.5 design didn't emerge from one-shot drafting — it emerged from operator critique of architect drafts across multiple iterations. Each downstream CMD needs equivalent dialogue.

2. **Each CMD teaches the build process things downstream briefs should absorb.** Phase 1 investigations surface findings that inform subsequent CMDs. Doctrine candidates ratify after enough cross-CMD data points. Premature drafting would lock decisions before the data exists.

3. **The architect-operator relationship is the resource, not the artifact-set.** Drafting six briefs alone would consume the relationship without using it for what it's good at — dialogue.

This document instead provides:
- Strategic intent for each CMD
- Dependencies and ordering rationale
- What each CMD unlocks downstream
- Doctrine implications already known
- Estimated effort
- Open architectural questions that scaffolding dialogue must address

When the next architect agent picks up the chain, this document is the strategic compass; per-CMD scaffolding + brief work is the implementation.

---

## The chain at a glance

```
[NOW READY TO COMMISSION]
CMD-ACCORD-CONSTELLATION-ENTRY-1
  ↓ unlocks navigation hierarchy
[NEXT IN CHAIN]
CMD-ACCORD-NRA-SUBSTRATE-1
  ↓ unlocks NRA discipline as substrate primitive
CMD-ACCORD-NRA-SURFACE-1
  ↓ unlocks NRA-aware live capture
CMD-ACCORD-MEETING-SETUP-1 (v3.5 becomes brief reference)
  ↓ unlocks the briefing pack experience
CMD-ACCORD-MEETING-PUBLIC-GATHERING-SURFACE-1
  ↓ unlocks the attendee-side join experience
[STRATEGIC INFLECTION POINT]
CMD-COUNTERFACTUAL-POC
  ↓ unlocks the second of three architectural compounds (per accord-vision-v1)
[FURTHER DOWNSTREAM — not in this document]
CMD-COMPASS-BRIDGE → CMD-CPM-SUBSTRATE-1 → CMD-CPM-DERIVED-1 → 
CMD-PERT-1 → CMD-RESOURCE-HEATMAP-1 → CMD-SCHEDULE-MANIPULATION-1
```

The 6-CMD chain takes Accord from "list-of-tabs UI" (current state) through "constellation + meeting briefing pack" (mid-state) to "counterfactual operator working" (the second strategic compound). After CMD-COUNTERFACTUAL-POC, the build pivots toward CPM linkage and scheduling — the third strategic compound.

---

## CMD-2: CMD-ACCORD-NRA-SUBSTRATE-1

**Strategic intent:** Make Next Required Action (NRA) a first-class substrate primitive. Today's threading already has decision/action/risk/question shapes via CoC events; this CMD makes NRA discipline structurally enforced — every thread terminates somewhere, sealing requires every thread cleared.

**Why this CMD comes here:** the constellation CMD ships navigation. Meeting Setup (v3.5) assumes NRA-aware threads ("Resolve Tom's dissent — Decide" / "Vendor coordination — Assign"). NRA substrate must exist before Meeting Setup can build on it. NRA is also load-bearing for the Counterfactual Operator (knowing what's outstanding requires knowing what's "open" in NRA terms).

**Substrate scope (anticipated):**
- NRA shape as substrate column or table (decision / action / risk / question / deferred)
- Per-thread NRA assignment at thread creation
- Sealing constraint: meeting can't seal if any thread has unset/unresolved NRA
- "Forced bump to next meeting" affordance for unresolved threads
- CoC events for NRA transitions (NRA-set, NRA-resolved, NRA-deferred, NRA-bumped)

**What scaffolding dialogue must address:**
- Is NRA a column on `accord_threads` or its own table?
- What's the relationship between NRA-shape and the existing CoC decision/action/risk/question events?
- How does "deferred" interact with carry-forward to next meeting?
- Does the sealing constraint apply at thread-level or meeting-level (any unresolved thread blocks seal vs all threads must resolve)?
- RLS implications: NRA state visibility within meeting participants vs broader firm
- Migration shape: existing threads need backfill of NRA shape from existing CoC events

**Doctrine implications already known:**
- IR65 likely fires (substrate change may affect Edge Function bytes)
- IR66 (substrate-shape-agnosticism): NRA must work for all 8 archetypes — the four NRA shapes plus deferral cover all archetypes
- IR68 (privacy-by-surface): NRA state is participant-scoped, like the threads themselves

**Estimated effort:** 12-18 hours

**What it unlocks downstream:** CMD-NRA-SURFACE-1 (the live UI), CMD-MEETING-SETUP-1 (the briefing pack's "Decide / Assign / Risk / Ask" pills become substrate-real), CMD-COUNTERFACTUAL-POC (knowing what's outstanding requires NRA state).

---

## CMD-3: CMD-ACCORD-NRA-SURFACE-1

**Strategic intent:** Surface NRA discipline in the Live Capture experience. Operator (or scribe) sees NRA pills per thread; sealing UI enforces NRA discipline; "force bump to next meeting" affordance available.

**Why this CMD comes here:** with NRA substrate landed, the surface follows. Meeting Setup v3.5's references to NRA shapes (Decide / Assign / Risk / Ask pills) need a working surface upstream to demonstrate the affordance — operator and attendees experience NRA in live capture before they see it pre-populated in setup.

**Surface scope (anticipated):**
- Per-thread NRA pill (color-coded: cyan/amber/rose/violet) in Live Capture
- NRA assignment on thread creation (operator picks shape; default infer from text)
- Sealing UI: meeting can't seal until every thread has resolved NRA; UI surfaces unresolved threads explicitly
- "Force bump" affordance: thread carries to next meeting in workstream, unresolved
- Visual: in Live Capture, threads with set-and-resolved NRAs appear visually distinct from unset/unresolved

**What scaffolding dialogue must address:**
- Where does the NRA pill render — beside thread title? Above? Inside?
- How does NRA infer from natural-language thread text (rule-based heuristic? Reserved for future AI-assist?)
- "Force bump" UX: confirmation modal? Inline button? What's the friction level?
- Sealing UI: hard-block (operator can't seal) vs soft-warn (operator can seal with explicit override)
- Mobile/tablet support (probably read-only NRA, full operator-action desktop-first)

**Doctrine implications already known:**
- IR65 may or may not fire (depends on whether minutes render template surfaces NRA explicitly)
- IR66: NRA pill rendering must work for all 8 archetypes (1:1 has fewer threads, retrospective may have many; UI scales)
- IR69 (universal default): natural-language NRA inference is power-user; operator-explicit NRA selection is universal default

**Estimated effort:** 8-12 hours

**What it unlocks downstream:** CMD-MEETING-SETUP-1 (Setup's NRA pills now have lived precedent; operator already understands them). CMD-COUNTERFACTUAL-POC (NRA-resolved is the substrate signal for "decision actually settled" vs "decision in flight").

---

## CMD-4: CMD-ACCORD-MEETING-SETUP-1

**Strategic intent:** Ship the Meeting Setup briefing pack experience. v3.5 design (locked 2026-05-07) becomes the brief's reference document.

**Why this CMD comes here:** depends on (a) constellation entry providing the "+ New Meeting" affordance from the workstream-level view, (b) NRA substrate + surface providing the substrate shapes the briefing pack visualizes, (c) all the pre-existing substrate (workstreams, sealed minutes, decisions, actions, risks, dissents, annotations).

**Surface scope (anticipated, per v3.5):**
- Three-column briefing pack: Briefing | Agenda | Expectations
- Header strip with title, intended outcome (commitment statement), when/where/duration/attendees
- First-ever vs Follow-up context handling (educational fade-in slides for first-ever; rich substrate panels for follow-up)
- Substrate-derived intelligence: synthesis prose, prep prompts, urgency math, pattern attribution, temperature badges
- Filmstrip workstream timeline below (12 prior + today + future-scheduled frames; click to scrub)
- Time-budget bar + predictive conflicts in footer
- Connection-state dots (operator addition: empty-glow / green / yellow with click-them-in affordance)
- Cinematic commit transition on Begin Meeting

**What scaffolding dialogue must address:**
- Phase decomposition (v3.5 has many moving parts; needs phase-by-phase shipping plan):
  - Suggested split: substrate aggregations + briefing column → composition column → expectations column → filmstrip → footer + commit transition
- Substrate-derived intelligence implementation: how does "PATTERN: 2 slips per 30d" actually compute? "mean silence-before-public-dissent: 14d"? These require historical-pattern aggregation views.
- First-ever educational slide content (final copy)
- Connection-state dot integration with Zoom/Meet/etc presence APIs (or polled?)
- "Click them in" UX for late connections
- Privacy-by-surface enforcement: this surface is operator-private (per IR68); RLS or query-scope confirms

**Doctrine implications already known:**
- IR66, IR67, IR68, IR69, IR70 all directly applicable; v3.5 was designed to comply
- IR65 likely fires (substrate intelligence may affect rendered minutes if Setup's commitment statement persists into minutes)
- 8-archetype test must validate Setup default state across all 8 (already pressure-tested at design time; reconfirm at implementation)

**Estimated effort:** 25-40 hours (largest CMD in chain; multi-CMD decomposition possible)

**What it unlocks:** Accord's first customer-facing surface that meaningfully differentiates from any meeting tool on the market. The strategic moment where Accord becomes "I can't go back to Outlook."

---

## CMD-5: CMD-ACCORD-MEETING-PUBLIC-GATHERING-SURFACE-1

**Strategic intent:** Ship the simple attendee-side surface for the period between invite-sent and Begin Meeting. Per IR68 privacy-by-surface, this is a separate surface from the operator briefing pack — attendees see only what's appropriate for them.

**Why this CMD comes here:** depends on Meeting Setup (CMD-4) defining what's operator-private vs public-shared. Privacy-by-surface (IR68) requires both surfaces to be designed in parallel; CMD-4 is the operator surface, CMD-5 is the attendee surface.

**Surface scope (anticipated):**
- Title (visible)
- Intended outcome / commitment statement (if operator chose to share — explicit operator decision, not default-public)
- Agenda (always visible)
- Carried references (always visible)
- Connection-state dots showing who's connected (everyone sees everyone's state, like Zoom gallery — your eyes are on the same lobby)
- "Joining meeting in 23 min" countdown
- Join button (when meeting time arrives, button activates)
- NO briefing column synthesis; NO expectations column substrate intelligence; NO time budget; NO prep prompts; NO temperature badges; NO urgency math; NO pattern attribution

**What scaffolding dialogue must address:**
- Sharing toggle for commitment statement: operator decides per-meeting whether attendees see the intended outcome
- Cosmetic shape: simple list-style vs scaled-down briefing pack? Per IR69, simpler is better.
- Async pre-meeting collaboration affordances (suggest agenda items, comment, declare beliefs ahead) — in this CMD or deferred to CMD-ACCORD-PRE-MEETING-COLLAB-1?
- RLS: attendee can see this surface; non-attendee firm members see nothing meaningful; non-firm members get nothing.

**Doctrine implications already known:**
- IR68 is the entire point of this CMD
- IR69: attendee surface is the universal default (every meeting has attendees); operator briefing pack is the power-user view (only operators see)
- IR66: simple list-shape works for all 8 archetypes; meets the test trivially

**Estimated effort:** 6-10 hours (significantly simpler than CMD-4)

**What it unlocks:** the gathering experience. Accord becomes a complete pre-meeting tool: operator preps in briefing pack; attendees join via clean public surface; everyone enters the meeting through the cinematic commit transition (CMD-4) at Begin time.

---

## CMD-6: CMD-COUNTERFACTUAL-POC

**Strategic intent:** Proof-of-concept for the second architectural compound (per `accord-vision-v1.md`). The Counterfactual Operator surfaces "what would change if X resolved differently." First instance: a decision that's been awaiting belief — what's the counterfactual workstream state if Sarah declares vs declines vs abstains?

**Why this CMD comes here:** the counterfactual operator depends on substrate that's now mature: workstreams (CMD-1's prerequisite), NRA shapes (CMDs 2-3), meeting threading + decisions + dissents. With Meeting Setup (CMD-4) providing the briefing-pack frame, the counterfactual operator is a *new substrate-derived intelligence affordance* that Setup's Expectations column could surface.

**POC scope (anticipated):**
- A single counterfactual class: "Decision X is awaiting belief. What changes if it resolves Y vs Z?"
- Computation: cross-thread substrate query + projection of downstream effects
- Visualization: simple "if Y → these other items unblock; if Z → these other items face new pressure" — text-based for POC, visual in future CMD
- Surface: emerges first in operator's briefing pack Expectations column (per IR70: substrate-coaches-operator)

**What scaffolding dialogue must address:**
- The first counterfactual class to ship: belief-pending decisions are the simplest. Other classes (overdue actions, unresolved dissents, deferred questions) deferred.
- Computation tractability: queries need to run fast enough to render in the briefing pack (<500ms ideally)
- Accuracy threshold: counterfactuals are predictions; how confident can we be? POC may need to surface "likely" vs "possible" distinctions.
- Operator UI: how is the counterfactual rendered? Inline with the decision? Separate panel? Click-to-expand?

**Doctrine implications already known:**
- IR70 is the entire point: this CMD ships substrate-coaching of the highest order
- IR68: counterfactuals are operator-private intelligence (the same way temperature badges are)
- IR66: POC may serve only specific decision/dissent shapes; full archetype coverage is for future CMDs

**Estimated effort:** 20-30 hours (proof-of-concept; production-quality follows in subsequent CMDs)

**What it unlocks:** Strategic — the second architectural compound is now real, not just designed. Three compounds in `accord-vision-v1.md`: projection engine (shipped via existing minutes/digest infrastructure), counterfactual operator (this POC + follow-ups), CPM linkage (downstream chain begins after this).

After CMD-6, the build pivots to CPM substrate work. The 6-CMD chain in this document ends here.

---

## What this chain does NOT include

Per the strategic roadmap in `accord-vision-v1.md`:

**Future CMDs after this 6-chain (separate strategic arc):**
- CMD-COMPASS-BRIDGE — connects Accord substrate to Compass for cross-module knowledge graph
- CMD-CPM-SUBSTRATE-1 — third architectural compound begins
- CMD-CPM-DERIVED-1 — derived task graph from CPM substrate
- CMD-PERT-1 — PERT analysis on CPM
- CMD-RESOURCE-HEATMAP-1 — resource allocation visualization
- CMD-SCHEDULE-MANIPULATION-1 — operator-driven schedule changes with cascade

**Other queued CMDs (lower priority, may interleave):**
- CMD-ACCORD-WORKSTREAMS-N-LEVEL-1 — deeper nesting if needed
- CMD-ACCORD-PRE-MEETING-COLLAB-1 — async attendee suggestions
- CMD-ACCORD-CALENDAR-INTEGRATION-1 — external calendar / required-vs-optional / scheduling intersects (deferred future)
- CMD-COMPASS-ACCORD-TREE-UNIFY-1 — cross-module tree unification when operator practice demands
- ~15 other smaller CMDs in queue (see master handoff)

---

## Recommended pacing

**Conservative pace (2-3 sessions per CMD):**
- CMD-1 (Constellation): 2-3 sessions to ship + verify
- CMD-2 (NRA Substrate): scaffolding + brief + 2 sessions = ~3-4 sessions
- CMD-3 (NRA Surface): scaffolding + brief + 1-2 sessions = ~2-3 sessions
- CMD-4 (Meeting Setup): scaffolding + brief + 4-6 sessions (largest CMD) = ~6-8 sessions
- CMD-5 (Public Gathering): scaffolding + brief + 1 session = ~2 sessions
- CMD-6 (Counterfactual POC): scaffolding + brief + 3-4 sessions = ~4-5 sessions

**Total session estimate: 19-25 sessions** for the 6-CMD chain. Plus operator-action items between CMDs, plus doctrine ratification ceremonies as candidates fire.

This pacing is realistic, not aspirational. Yesterday's design arc was a single all-day session of comparable density; most CMDs require less design intensity but more implementation density.

**Aggressive pace** would compress this 30-40%. **Cautious pace** would expand it 30-40% (more dialogue, more verification, more iteration). Operator decides; recommend conservative pace as default.

---

## Operator role across the chain

For each CMD, operator responsibilities are consistent with the established Mode C protocol:

1. **Scaffolding dialogue:** review architect's scaffolding draft; critique; iterate; ratify final scaffolding before brief drafting
2. **Brief ratification:** review brief; ratify or amend
3. **Phase 1 halt-and-surface:** review investigation findings; confirm or amend Q-CE dispositions
4. **Subsequent phase halt-and-surface:** behavioral verification per phase
5. **CMD closure:** final acceptance test; CMD seals

Plus per-CMD operator-action items as they emerge (data fixes, fixture updates, etc.).

---

## Doctrine queue evolution across the chain

Several doctrine candidates currently in queue should ratify across this chain:

**Likely to ratify post-CMD-1 (constellation):**
- Cross-module Phase 1 survey (currently 3 data points; CMD-1's Phase 1 makes it 4) → ratifiable as Iron Rule 71

**Likely to ratify post-CMD-2 (NRA substrate):**
- F-P3-6 navigational-classification IR42 pattern (likely advances to 3 with substrate change)
- F-P4-9 state-aware UPDATE RLS WITH CHECK explicit (likely advances cross-CMD if NRA needs new RLS)

**Likely to ratify post-CMD-4 (Meeting Setup):**
- Whatever new doctrine emerges from shipping the most complex customer-facing surface — likely 2-3 new candidates

**By end of chain:** doctrine canon may grow from 36 (current) to ~42-45 ratified rules. The IR66-70 quintet may anchor a deeper "Customer Surface Design Canon" sub-doctrine.

---

## Closing strategic note

This 6-CMD chain takes Accord from "well-engineered substrate with weak surfaces" (current state) to "first customer-facing tool that genuinely differentiates" (post-CMD-4) to "the second architectural compound is real" (post-CMD-6).

The chain is roughly 5-8 weeks of work at conservative pace, longer if compressed by other priorities. Each CMD compounds the previous — by the time CMD-6 ships, the next chain (CPM substrate work) sits atop a substantially richer foundation than today's.

**The chain is sound. The pacing is realistic. The doctrine constrains drift. The operator-architect dialogue produces quality at each step.** Trust the process; ship CMD-1; let the rest follow.

---

*End of Accord Strategic Chain Map.*

*This document is a strategic compass, not a commitment. Each CMD requires its own scaffolding dialogue + brief drafting before commission. Pacing and scope estimates may shift as findings from upstream CMDs inform downstream design.*
