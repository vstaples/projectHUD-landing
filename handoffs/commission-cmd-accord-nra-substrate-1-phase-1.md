# Commission · CMD-ACCORD-NRA-SUBSTRATE-1 · Phase 1 (Investigation)

**Status:** Commissioned 2026-05-08 evening
**Operator:** Vaughn Staples
**Architect:** Claude (post-handoff)
**Scope this engagement:** Phase 1 only — investigation, halt-and-surface

---

## §1 — Reference set

- `brief-cmd-accord-nra-substrate-1.md` — operator-ratified brief (this CMD)
- `scaffolding-cmd-accord-nra-substrate-1.md` — architect scaffolding (substrate shape, RLS posture, trigger mechanics, plain-terms summary)
- `Iron_Rules_66-70_Ratifications.md` — design discipline canon
- `Iron_Rules_71-72_Ratifications.md` — IR71 (state-mutation-before-invalidation) + IR72 (cross-module Phase 1 survey, mandatory deliverable)
- `aegis-MASTER-handoff-2026-05-08-evening.md` — full build state through prior CMD seal
- All prior Iron Rules ratifications (36-65 + IR58 amendment)

---

## §2 — Phase 1 deliverables

Per brief §4 Phase 1, execute eight deliverables. Investigation only — no migrations, no triggers, no code. End Phase 1 with halt-and-surface document.

1. **IR72 cross-module survey** — six survey targets per scaffolding §3.3:
   - Compass workstream-state events
   - Pipeline action lifecycle
   - Cadence cdn-* substrate
   - Existing trigger functions on `accord_meetings`
   - CoC writer prefix discipline (`accord.*`)
   - Helper functions (`my_firm_id()` and equivalents)

2. **IR64 verification** — confirm substrate assumptions:
   - `accord_nodes` schema artifact types (decision/action/risk/question/dissent)
   - `accord_actors` table FK assumption
   - `my_firm_id()` helper exists with expected signature
   - F-P4-9 UPDATE RLS pattern is established convention

3. **IR68 substrate-level disposition** — confirm whether surface-level operator-privacy is sufficient OR identify substrate-level enforcement gap. **Architect-lean: surface-level is sufficient v1.** Document if Phase 1 finds otherwise.

4. **F-P3-6 navigational-classification check** — does `accord_nras` SELECT policy fit the F-P3-6 pattern? If yes, advances doctrine candidate from 2 to 3 (ratifiable post-CMD).

5. **CoC writer survey** — confirm `accord.*` prefix discipline; identify writer location and structure for the six new event types.

6. **Trigger function survey** — find closest existing analog (workstream cascade or meeting state change) for adoption pattern.

7. **8-archetype walkthrough (IR67)** — pressure-test NRA shape against 1:1 / status sync / project review / retrospective / decision review / kickoff / regulatory / board update. Document any element failing for ≥2 archetypes; propose demotion or cut.

8. **Five architect-internal open questions** — disposition each per brief §8:
   - Resolution candidate semantics (separate column vs. inferred state)
   - `owner_event_type` text vs. enum
   - Trigger granularity (per meeting vs. workstream-batch)
   - Supersession atomicity (trigger-based vs. transaction-level)
   - IR68 disposition (architect-lean: surface-level)

End Phase 1 with halt-and-surface summary covering all eight deliverables, IR64 findings, dispositions, and Phase 2 readiness.

---

## §3 — Discipline (apply throughout)

- **IR36/37/40 §1** — terse hand-off; silent work-mode; halt on missing input
- **IR39** — substrate work; no surface scope creep
- **IR64** — verify mental models against codebase; do not rely on scaffolding's substrate assumptions without confirmation
- **IR65** — does NOT fire this Phase (investigation only)
- **IR67** — 8-archetype walkthrough is mandatory deliverable 7
- **IR68** — substrate-level disposition required (deliverable 3)
- **IR71** — state-mutation-before-invalidation; applies to any code work, but Phase 1 is investigation only — apply when scaffolding code patterns for Phase 4 trigger work
- **IR72** — cross-module Phase 1 survey is mandatory canon (ratified 2026-05-08); deliverable 1
- **F-P3-2 / F-P3-7 / F-P3-9 / F-P4-1 / F-P4-9** — all apply per Phase 1 survey

---

## §4 — What Phase 1 does NOT do

- Does NOT modify substrate (no migrations)
- Does NOT write trigger functions
- Does NOT extend CoC writer
- Does NOT make ratification calls on doctrine candidates (operator's call post-Phase-1)
- Does NOT draft Phase 2-5 deliverables; halt-and-surface ends Phase 1 cleanly

---

## §5 — Halt-and-surface terms

Per established CMD pattern. Single document covering:

1. IR72 cross-module survey results (six targets, with file/line references where applicable)
2. IR64 findings (mental model vs. codebase reality)
3. IR68 disposition with rationale
4. F-P3-6 check result
5. CoC writer + trigger function survey notes
6. 8-archetype walkthrough results
7. Five open question dispositions
8. Phase 2 readiness statement (or blockers if found)
9. Doctrine queue advancement candidates

Phase 2 commissioning is architect's next move after operator reviews Phase 1.

---

*Commission CMD-ACCORD-NRA-SUBSTRATE-1 · Phase 1 · Investigation.*
