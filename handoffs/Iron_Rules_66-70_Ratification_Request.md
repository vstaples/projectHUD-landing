# Iron Rules 66-70 — Ratification Request

**Source:** Design arc 2026-05-07 (Accord Meeting Setup v1 → v3.5; 8-mockup charette)

These five rules emerged from the v3.5 design arc and form a coherent canon for customer-facing surface design in Accord. Each is requested for ratification as Iron Rule.

---

## Iron Rule 66 — Substrate-Shape-Agnosticism

**Rule:** Default-state customer-facing surfaces in Accord must serve all meeting archetypes (or all workstream shapes, or all whatever-the-surface-is-organizing) by design. Specialization to a single shape is permitted only as opt-in views layered on top of the universal default.

**Origin:** v4 magic-wand failed because canvas-primary served engineering-shape projects and crowded out 1:1s, retros, kickoffs, status syncs, regulatory reviews, board updates. The lesson: when designing a surface that operators of many kinds will use, the default cannot privilege one operator's shape.

**Diagnostic question:** "Does this design's default state work for an operator whose substrate is shaped completely differently than the example I built it from?"

**Failure mode it prevents:** Building beautiful single-scenario surfaces that look like products and serve like demos.

---

## Iron Rule 67 — The 8-Archetype Test

**Rule:** Meeting-related designs in Accord must be validated against eight explicit archetypes before being adopted as canonical:

1. 1:1 with direct report
2. Status sync
3. Project review
4. Retrospective
5. Decision review
6. Kickoff
7. Regulatory review
8. Board update

**Application:** For each design move (panel, affordance, behavior), the test is: "Does this serve archetype 1? Archetype 2? ... Archetype 8?" Anything that serves only a subset is demoted to opt-in view or cut.

**Origin:** v4's failure was diagnosed by walking the 8 archetypes and noting how badly canvas-primary served 7 of them. The 8 archetypes themselves emerged from operator's 40+ years of meeting facilitation experience.

**Companion rule:** When new meeting archetypes emerge in operator practice, they may be added to the test list. The list is canonical but not closed.

**Failure mode it prevents:** Designing for the meeting-shape currently in front of you instead of the meeting-shape diversity Accord must serve.

---

## Iron Rule 68 — Privacy-by-Surface

**Rule:** Surfaces in Accord are categorized by audience at design time, not retrofitted with permissions. The three categories:

- **Operator-private surfaces:** seen only by the operator (briefing pack, prep workspaces, strategic intelligence about attendees)
- **Public surfaces:** seen by all meeting participants (agenda, references, sealed minutes, decision artifacts)
- **Substrate-derived public/private items:** sealed substrate is public to those involved; intelligence derived from substrate (patterns, urgency math, temperature reads) is operator-private

**Application:** Before any design integrates substrate-derived intelligence, ask: "If this is shown to the subject, is it surveillance?" If yes, the affordance belongs in an operator-private surface only.

**Origin:** v3.5 conflated operator-prep with attendee-gathering surfaces. Showing Tom "Dissent simmering · 22d unacknowledged" or Marcus "2 slips per 30d" would feel surveillance-state. Resolution: the briefing pack is operator-private; attendees see a simpler joining surface.

**Failure mode it prevents:** Building intelligence affordances that work against the operator's relationship with attendees the moment they're seen.

---

## Iron Rule 69 — Universal Default; Power-User Views Layered

**Rule:** When a surface has both a "general operator" use case and a "power user" use case, the general default must work for the general operator. Power-user affordances (canvas modes, session-grid composition, spatial graphs, dense visualizations) are opt-in layers, never the default.

**Application:** Every design move must answer: "Is this useful to the operator who opens this for the first time?" If no, it's a power-user feature. Power-user features are demoted to optional view, mode toggle, or settings — never the default render.

**Origin:** v4 attempted five power-user moves (canvas-primary, filmstrip, session-grid, spatial-map, sound-design) as default. The general operator was overwhelmed; the engineering-project power user was served well. Wrong trade. v3.5 made everything except filmstrip opt-in or cut.

**Failure mode it prevents:** Optimizing for the power user at the expense of the general operator.

---

## Iron Rule 70 — Substrate-Derived Intelligence > Information Presentation

**Rule:** Customer-facing surfaces in Accord should *coach* the operator — surfacing prep prompts, urgency math, pattern attribution, predictive conflicts, behavioral intelligence — not merely *present* substrate as data. When substrate intelligence is available, it should be applied actively (e.g., "You haven't queried Tom's dissent. Pattern says his silence breaks at day 14; he's at day 22") rather than passively rendered (e.g., "Tom: dissent open, 22 days").

**Application:** For any substrate displayed on a customer-facing surface, ask: "What does the operator do with this? Can the surface help them act on it?" If passive presentation is the only answer, look for a coaching affordance.

**Origin:** The four external mockups varied in how active their substrate use was. M#2 had "You haven't queried T. Liu's dissent" — coaching. M#4 had "mean silence-before-public-dissent: 14d" — urgency math. M#3 had "previous similar meetings averaged 47 min" — predictive timing. v3.5 integrated all three classes of intelligence. The lesson: substrate is most valuable when it actively shapes operator behavior.

**Failure mode it prevents:** Building surfaces that show data well but coach poorly. Beautiful information-density without operator-actionability.

---

## Ratification block

**Operator:** if these rules are accepted as canon, please respond with explicit ratification statement:

> "I ratify Iron Rules 66, 67, 68, 69, and 70 as canon."

Or specify per-rule acceptance/modification.

After ratification, these rules join the doctrine canon and constrain all future Accord customer-facing design CMDs.

**End of ratification request.**
