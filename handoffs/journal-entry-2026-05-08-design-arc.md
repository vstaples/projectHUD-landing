# Journal — 2026-05-08 — The Design Arc Day

## What happened

Yesterday produced three things that sit at very different scales:

1. **Two CMDs closed clean** — CMD-SUBSTRATE-COUNTERFACTUAL-MIN (5 phases) and CMD-ACCORD-WORKSTREAMS-SUBSTRATE-1 (5 phases). Both shipped without incident, both with substantive doctrinal observations queued for ratification. Routine in shape if not in scope. The architect-coding-agent-operator triad ran smoothly.

2. **An 8-mockup design charette for Accord's first customer-facing surface** — the New Meeting setup experience. This was unprecedented in scope for this build. Three external agents drafted twice each; architect drafted v1 → v2 → v3 → v4 → v3.5; operator critiqued each in turn. Net result: v3.5 canonical, locked.

3. **Five doctrinal lessons emerged from the design arc** — substrate-shape-agnosticism, the 8-archetype test, privacy-by-surface, universal-default-power-user-views-layered, and substrate-derived-intelligence-over-information-presentation. These are the most consequential design doctrine to emerge in any single session of this build.

## The shape of the design arc

The arc moved through five distinct phases, each with its own lesson.

**Phase 1: Initial mockups against unstated framework.** Three external agents and the architect each shipped a v1 mockup based on a design brief that was rich in inspiration but thin in evaluative criteria. Operator critiqued each — surfacing seven framework principles in the process (title prominence, mode differentiation, agenda primary, continuation as reference, carried artifacts with prune, meta strip restraint, calendar gap acknowledged). Lesson: framework principles emerge from critique, not from spec. Designing without ratified evaluation criteria produces good-faith mockups that miss the mark predictably.

**Phase 2: v2 briefing-pack synthesis.** Architect synthesized the seven principles + best moves from external mockups into v2. Operator scored 6/10 — wanted "damn, I love that." Lesson: synthesis of solid moves produces a polished version of an already-known thing, not a paradigm shift. To break through, must reframe what's being designed.

**Phase 3: v3 with first-ever educational slides + rich follow-up substrate.** Operator's "Lock & load... I love it!" — first time in the arc the design earned an unambiguous yes. Lesson: the move that broke through wasn't a paradigm shift — it was *adding the right amount of substrate-density* to the column that was already there. The Briefing column was the column that needed depth; once it had it, the surface became coherent.

**Phase 4: v4 magic-wand experiment.** Architect built canvas-primary + filmstrip + session-grid + spatial-attendee-map + sound design. Render failed first; rebuilt; second render landed but operator: "swing & a miss." Lesson: the magic-wand framing tempted the architect to bet on five paradigm-breaking moves at once. Four of the five were scenario-specific (engineering-shape; courtroom-shape; rehearsal-shape; strategic-encounter-shape) and crowded out generality. **One** (the filmstrip) was generalizable and survived.

**Phase 5: v3.5 with discipline.** Architect rebuilt from v3 with critical-honesty discipline: each integrated keeper had to pass the 8-archetype test (1:1, status sync, project review, retrospective, decision review, kickoff, regulatory, board update). Anything that fit only one archetype got demoted to optional view or cut. Result: v3.5 canonical, operator declared "perfect," locked.

## What I learned about my own design instincts

The v4 swing was important and worth taking, even though it failed. Without the magic-wand experiment, I wouldn't have learned that my instinct to "push past v3" was actually an instinct to *replace the universal frame with a scenario-specific one*. The operator's diagnosis ("75% of the content has no reasonable connection to what we've discussed... and expects a rich set of pictures & attachments that may not be present") was the diagnosis of substrate-shape-failure, which I couldn't have arrived at by polishing v3.

The lesson generalizes beyond meeting setup: **when tempted to break a frame, ask first whether the frame is general or scenario-specific.** If general, the temptation is probably wrong (you're trading generality for novelty). If scenario-specific, the temptation is probably right (you're trading specificity for reach). v3 was general; v4 traded that for engineering-specific novelty; the trade was bad.

## What the operator brought

Two specific operator contributions were architecturally consequential:

1. **The duck-on-water metaphor** — meeting setup is graceful surface over frantic underwater paddling. Reframed the design ambition from "good UI" to "make the operator look like a graceful duck" (not "make the operator look like a flight engineer"). Distinction matters: graceful surface ≠ information-dense cockpit.

2. **The connection-state dot vocabulary** — empty-with-glow / green / yellow as universally legible state language. Operator's 40 years of meeting facilitation produced a design move I wouldn't have invented: making *temporal lateness* a permanent visual marker, with operator-controlled "click them in" affordance for late connections. This is operator-as-designer at its sharpest.

## Doctrine emerging

Five candidates ratified separately. They form a coherent set that constrains future design CMDs:

1. **Substrate-shape-agnosticism** — surfaces serve all archetypes by default; specialization is opt-in
2. **The 8-archetype test** — meeting designs validated against 8 explicit archetypes
3. **Privacy-by-surface** — operator-prep surfaces stay operator-private; intelligence about attendees never crosses to attendees
4. **Universal-default; power-user views layered** — substrate density adapts to volume; specialized views are opt-in
5. **Substrate-derived intelligence > information presentation** — surface coaches operator, not just shows data

Together these are a design-discipline canon for any future customer-facing surface in Accord, not just meeting setup.

## What I'd do differently next time

Run the architect-mockup *before* requesting external agent mockups, not in parallel. The external agents were given an underspecified brief and produced predictable scenario-specific mockups; the architect-mockup ran through the same scenario-specific failures (v4); the operator critique then forced framework emergence. If I'd run my own v1 → v2 → v3 → v3.5 first, the framework would have emerged from architect-operator dialogue, and I could have given external agents a sharp brief asking them to challenge a *known* design rather than fishing in open water.

The design arc was correct in its outcome but inefficient in its path. Next design CMD: architect-first iteration to v3-quality, then external-agent-as-pressure-test, not external-agent-as-co-designer.

## What's locked

- **v3.5 Meeting Setup** canonical (briefing pack + filmstrip; substrate-shape-agnostic)
- **Five doctrine items** drafted for ratification (this morning's first CMD-class work)
- **External agent loop closed** (Option B last night — they weren't going to clear the bar; revisit if/when CMD-ACCORD-MEETING-SETUP-1 commissions)
- **Constellation scaffolding still un-revised** — needs absorbing this arc's framework before brief drafting

End of journal entry.
