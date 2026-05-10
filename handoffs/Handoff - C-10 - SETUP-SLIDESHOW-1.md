# HANDOFF — C-10 · CMD-ACCORD-SETUP-SLIDESHOW-1

**Date:** 2026-05-10
**Predecessor:** C-09 SETUP-ACTION-KANBAN-1 (sealed)
**Operator:** Vaughn Staples
**Stamp target:** operator-managed (IR65)

---

## §0 — Pre-flight

Surface-only CMD. Brief is `Brief - C-10 - SETUP-SLIDESHOW-1.md` — read end-to-end before touching code.

**Standing rules apply:**
- IR36 — terse hand-off (diff, smoke result, findings only)
- IR37 — silent work, no narration
- IR39 — input enumeration, output spec; this handoff satisfies both
- IR40 — halt-on-missing-input, dev-console-first debugging
- IR64 — Phase 1 verification before code (light here — no substrate)
- IR65 — do not bump version pin; operator manages
- IR71 — clear timers on tab-list mutation
- `var` only — no `let` / `const`
- Zero-arg onclicks via `data-action` — no inline arg passing

**Operator output discipline:** acknowledgments ≤3 lines. No internal monologue. No "let me check…" preambles. Deliver in §4 file order, then 5-line summary, then §3 test instructions verbatim. Stop.

---

## §1 — Inputs

| File | Purpose |
|---|---|
| `Brief - C-10 - SETUP-SLIDESHOW-1.md` | Spec |
| `accord-meeting-setup.js` (current production, post-C-09) | Base for edits — request from operator |
| `accord-meeting-setup.css` (current production) | Base for new rules — request from operator |
| `Accord_Meeting_Setup__mockup_RS_v1_1_.md` | §9.2 + §6.3 spec reference |
| `Style_Doctrine_v1_8.md` | Token + treatment reference |

---

## §2 — Phase plan

### Phase 1 — Investigation
- IR64-light verification: locate existing tab-switch dispatch in left column (Briefing/Decisions/Risks per C-06) and right column (Attendees/Action Items per C-04 + C-09). Confirm dispatch path — `data-action` event-delegated or direct handler.
- Confirm column header DOM available for stepper + progress + toggle insertion. If headers don't have a stable mount point, surface as halt-and-resolve before Phase 2.
- IR72 namespace check: confirm no other surface uses `AccordSlideshow` or equivalent global.
- All Brief §8 open questions are pre-resolved; no operator dispositions pending.

### Phase 2 — Rotation engine + per-column policies
- Single `_initSlideshow()` module. Two engine instances — one per rotating column, keyed `'left'` / `'right'`.
- Per-engine state: `currentTabIdx`, `intervalTimer`, `progressTimer`, `isPaused`, `pauseUntil` (timestamp), `policy` (`'auto-default'` / `'manual-default'`).
- Tab transition path: invoke the same handler the user click dispatches. No shadow render path.
- Hover/leave handlers on column container: pause immediately on enter; 3s grace timer on leave that triggers resume; grace timer cleared on re-enter.
- Manual click path: 60s pause via `pauseUntil = Date.now() + 60000`. Engine tick checks `pauseUntil > Date.now()` before advancing.
- Expose `window.AccordSlideshow = { pause: fn, resume: fn }`.

### Phase 3 — UI elements
- Stepper, progress indicator, AUTO/MANUAL toggle render via existing column-header paint path. If header is rebuilt on tab switch, stepper state must survive — read engine state on each paint.
- New CSS classes per Brief §5. Tokens only — no new colors.
- AUTO/MANUAL toggle wired via `data-action="slideshow-policy-toggle"` with `data-col="left"`. Zero-arg onclick rule respected.

### Phase 4 — Closure
- Operator-runnable smoke test per Brief §6 (12 steps). Each step PASS / FAIL with one-line evidence.
- IR65 fires — flag for operator pin.

---

## §3 — Traps

1. **Tab-list mutation during rotation.** If any code path rebuilds the tab-strip DOM, the engine's `currentTabIdx` may point at a stale node. Re-read tab list before each advance. IR71 is the rule.

2. **Hover-pause container scope.** Hover target is the **entire column container** (header + body). Per Brief §2.3 spec lock — stepper sits inside the hover-target so stepper interaction does not trigger a leave→3s-grace→resume race.

3. **`setInterval` drift on background tabs.** Browser throttles `setInterval` to ~1s minimum on inactive tabs. Progress line will appear to "jump" when the tab regains focus. Acceptable — do not over-engineer.

4. **Engine teardown on level-changed.** When operator navigates away from Meeting Setup, the rotation timers must clear. Wire teardown into the existing `accord:level-changed` listener that already drops in-flight column-drag listeners (see lines ~220 of `accord-meeting-setup.js`).

5. **`AccordSlideshow` namespace collision.** Confirm no other surface uses this global. IR72 cross-module survey.

6. **Center column must remain untouched.** Do not install hover handlers, stepper, or progress line on the center column. C-07 agenda behavior is regression-tested at smoke step 11.

7. **Operator does not bump version.** IR65. Do not touch HTML script tag version strings or `version.js`.

---

## §4 — Delivery format

In order:

1. **Phase 1 hand-off (separate message)** — investigation findings (tab-switch dispatch path; column-header mount points; namespace clear). Halt-and-resolve items only if surface assumptions don't hold. STOP. Operator green-lights Phase 2 unless halt-and-resolve fired.

2. **Phase 2-3 hand-off (combined)** — `accord-meeting-setup.js` full file. `accord-meeting-setup.css` patch (additions only, with line context). 5-line "what changed" summary.

3. **Phase 4 hand-off** — Smoke test run, 12-step results inline. IR65 flag. CMD seal recommendation.

Stop after each phase hand-off. Do not narrate. No postamble.

---

## §5 — Findings hooks

If anything unexpected surfaces during execution — surface it as a one-liner finding per IR36. Examples of finding-worthy events:
- Existing tab-switch path is direct-handler (not event-delegated). Engine adapts; document.
- Column header DOM is rebuilt on every tab paint. Stepper state must survive — engine re-renders stepper on each paint.
- Any cross-module conflict surfaced by IR72 survey.

Doctrine candidates emerging from this CMD (3rd data point + becomes Iron Rule territory):
- **Per-column UI state coordination.** Watch for it.
- **External pause/resume hook contract.** First instance — track for cross-CMD pattern.

---

**Ship Phase 1 first.**
