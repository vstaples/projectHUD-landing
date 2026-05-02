# HANDOFF — CMD101.5: Pipeline Layout Reorganization

**Date:** 2026-05-02
**Predecessor:** CMD101.01 (production)
**Operator:** Vaughn Staples
**Stamp target:** `v20260503-CMD101.05`

---

## §0. PRE-FLIGHT

Layout-only change. Brief is `brief-cmd101-5-pipeline-layout.md` — read end-to-end. Do not redesign. Do not narrate. Iron Rules 36, 37, 39, 40 §1 apply.

Operator output discipline reminder from CMD101.01 review: **acknowledgments ≤3 lines, no internal monologue, no "let me check…" preambles, no recommendations not requested. Deliver in the §7 file order, then 5-line summary, then §8 checklist verbatim. Stop.**

---

## §1. INPUTS

| File | Purpose |
|------|---------|
| `brief-cmd101-5-pipeline-layout.md` | Spec |
| `pipeline.html` (current production) | Base for edits — request from operator |
| `hud.css` (current production) | Base for token additions — request from operator |
| `cmd-center.js`, `hud-shell.js` | Verify-only — request only if string references found |

---

## §2. BUILD ORDER

1. `pipeline.html` — markup hoist (KPI + Funnel + Forecast out of `.view-dashboard`), class rename (`.view-dashboard` → `.view-list`), tab label rename, JS string updates.
2. `hud.css` — add `.permanent-row`, `.list-grid`; compact forecast-summary internals per §4.2.
3. `cmd-center.js` — only if string refs to `'Dashboard'` exist (grep first).
4. `hud-shell.js` — verify only; no change expected.

---

## §3. TRAPS

1. **Equal-height row** — `align-items: stretch` on `.permanent-row` is necessary but the inner forecast-summary panel must also let its content fill height. If rings vertically center inside an oversized panel, that's correct; if the panel collapses to ring height, the grid stretch isn't propagating — check the panel's own internal display rules.

2. **Forecast Summary compaction values are starting points.** If after applying §4.2 values the panels still don't match height, adjust ring size and label margin until they do. Do not change Funnel Velocity to match — Funnel is the reference height.

3. **Existing scripts break.** Any saved demo script with `Switch View "Dashboard"` will no-op after this change. Operator is aware. Do not write a migration.

4. **Don't bump `js/version.js`.** Operator manages stamp.

---

## §4. DELIVERY FORMAT

In order:
1. `pipeline.html` (full file)
2. `hud.css` patch (additions + compaction edits with line context)
3. `cmd-center.js` (full file, or "no changes needed" if grep returns clean)
4. 5-line "what changed" summary
5. §8 checklist verbatim

Stop after the checklist. No postamble.

---

**Ship it.**
