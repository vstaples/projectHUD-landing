# Ratification Record — Iron Rule 65

**Date ratified:** 2026-05-06
**Ratification mode:** Architect recommendation accepted (Decision 2a)
**Authority:** operator (Vaughn Staples) + architect
**Canonical text:** `Iron_Rule_65_Ratification.md`
**Drafting context:** Post-CMD-PROJECTION-ENGINE-2; the third attestation incident with confirmed nuance from incident #2

---

## What was ratified

One rule entered canon:

| # | Rule |
|---|---|
| 65 | Render-version dual-pin (front-end `js/version.js` + Edge Function `RENDER_VERSION` move together when template body changes; client-only changes do not require dual movement) |

Doctrine queue is now **empty** — all five candidates from the post-build polish phase (R-DEPLOY-1, R-STOR-1, R-EDGE-1, R-PRIOR-ART-1/R-CONSUMER-CONVENTION-1, R-RENDER-VERSION-DUAL-PIN) are ratified.

---

## Provenance

Three attestations across three consecutive CMDs:

1. **CMD-A7-POLISH-1** — the visual register polish CMD modified template body; both pins moved; pattern first noted in hand-off, classified single-incident
2. **CMD-MINUTES-PRINT-FLOW** — the print-flow CMD added `@media print` CSS to template body; both pins moved; F3 finding surfaced the nuance ("dual-pin applies when template bytes change, not when client surface code changes")
3. **CMD-PROJECTION-ENGINE-2** — the template rename + new mockup-aligned template CMD modified template registry and added new template body; both pins moved; nuance confirmed (client-only picker UI changes did not trigger the requirement; template-body changes did)

The candidate held in queue between incidents #2 and #3 to validate that the nuance from #2 was a stable rule-shape, not a one-off. Incident #3 confirmed the nuance held; ratification proceeded.

---

## What this changes in the project

Effective immediately:

- **Future briefs across ProjectHUD inherit Iron Rule 65** in addition to 36-64
- **Brief-drafting practice now includes the dual-pin diagnostic question:** *"Does this change alter the bytes the Edge Function produces when it renders an artifact?"* The answer determines whether the brief's §10 Consumer Enumeration names both pins or only `js/version.js`
- **Doctrine queue is empty** — first time in approximately ten days

---

## What this does NOT change

- Existing render artifacts are unaffected (the rule applies forward, not retroactively)
- Existing CMDs that already followed the pattern (A7-POLISH-1, MINUTES-PRINT-FLOW, PROJECTION-ENGINE-2) remain compliant; no rework required
- Schema migration timestamp-versioning continues independent of the rule

---

## Files produced this ratification cycle

In `/mnt/user-data/outputs/`:

1. `Iron_Rule_65_Ratification.md` — full canonical text
2. `Ratification_Record_Iron_Rule_65.md` — this document

Recommend: import both to project files for durability.

---

## Aggregate Iron Rules count

After this cycle:

- **Pre-Accord arc canon (36-46):** 11 rules
- **Post-Accord-CMD-A1/A1.5/A2 (47-50):** 4 rules
- **Post-Accord-CMD-A3/AEGIS-1/A4/A5/A1.6 (51-55):** 5 rules
- **Post-Accord-CMD-A6 (56-60):** 5 rules + Rule 52 §4 amendment
- **Post-Accord-build polish (61-64):** 4 rules
- **Post-projection-engine arc (65):** 1 rule

**Total: 30 ratified Iron Rules (36-65)** governing the ProjectHUD project.

---

## Doctrine cycle observations

This is the sixth ratification cycle. Cadence:

- Cycle 1 (Iron Rules 41-46): six rules from architecture, 2026-05-04 afternoon
- Cycle 2 (Iron Rules 47-50): four rules from CMD-A1/A1.5/A2, 2026-05-04 evening
- Cycle 3 (Iron Rules 51-55): five rules from CMD-A3/AEGIS-1/A4/A5/A1.6, 2026-05-05 morning
- Cycle 4 (Iron Rules 56-60 + 52§4 amendment): five rules + amendment from CMD-A6, 2026-05-05 evening
- Cycle 5 (Iron Rules 61-64): four rules from CMD-AEGIS-1.1/A7/A7-POLISH-1, 2026-05-05 evening (later)
- Cycle 6 (Iron Rule 65): one rule from CMD-A7-POLISH-1/MINUTES-PRINT-FLOW/PROJECTION-ENGINE-2, 2026-05-06 (this cycle)

Cycle 6 surfaces a healthy pattern: the cadence is slowing. Cycles 1-5 produced 24 rules across 48 hours (~12 rules/day average). Cycle 6 produced one rule across the next 24 hours. This is what canon stabilization looks like — early architectural commitments produce dense doctrine; mature systems produce occasional refinements.

The remaining doctrine queue is empty. New candidates will surface from future shipping incidents but no specific candidate is currently anticipated. Standing by for organic emergence rather than deliberate forcing.

---

*Ratification recorded 2026-05-06 · one rule · architect-recommended path 2a accepted.*
