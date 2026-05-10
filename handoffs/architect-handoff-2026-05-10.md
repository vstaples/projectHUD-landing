# Architect Handoff — Accord Meeting Setup Shell
## Generated: 2026-05-10 · End of C-09 debugging session

**Operator:** Vaughn Staples · Apex Consulting Group
**Outgoing architect:** Claude (Pluto)
**Communication style:** Terse, direct. Frustration is signal. No fluff.

---

## §1 — Where the build stands

### Sealed CMDs (C-01 through C-08)
| CMD | Title | Status |
|---|---|---|
| C-01 | SETUP-LAYOUT-1 | Sealed |
| C-02 | SETUP-HEADER-1 | Sealed |
| C-03 | SETUP-OUTCOMES-1 | Sealed |
| C-04 | SETUP-ATTENDEES-1 | Sealed |
| C-05 | SETUP-FILMSTRIP-2 | Sealed |
| C-06 | SETUP-BRIEFING-TABS-1 | Sealed |
| C-07 | SETUP-AGENDA-ENHANCED-1 | Sealed |
| C-08 | SETUP-INTELLIGENCE-1 | Sealed |
| **C-09** | **SETUP-ACTION-KANBAN-1** | **In active debugging — drag-and-drop visual issue** |
| C-10 | SETUP-SLIDESHOW-1 | Queued |
| C-11 | SETUP-PERCOLATE-1 | Queued |
| C-12 | SETUP-GATHERING-1 | Queued |
| C-13 | SETUP-VERDICT-1 | Queued |

### Living documents in project knowledge
- `accord-meeting-setup-requirements-v1.1.md` — surface design spec
- `accord-schema-inventory-v1.2.md` — substrate truth (UPDATED for C-08)
- `accord-meeting-setup.js` — working file (latest version `v20260509-CMD-ACCORD-MEETING-SETUP-72`)

### C-08 close-out summary
All 9 smoke tests passed. Key findings now in schema inventory:
- `accord_meeting_intel_notes` table created with author-only RLS
- `accord_nras_current.declared_at` is absent — use `created_at` for age derivation
- `accord_nodes.status = 'committed'` for actions; overdue detection via `due_date < now()` only
- Behavioral status thresholds locked: 14d dissent = SIMMERING, 2+ overdue = PRESSURE, 20d dissent = "move now"

---

## §2 — C-09 active debugging state

**Specification:** Action Items kanban + grid view in right column, drag-to-reschedule via PATCH on `accord_nodes.due_date`.

### Defects resolved during this session
1. **Action nodes inadvertently sealed by `accord_meeting_seal_fn()`** — fixed via trigger amendment excluding `tag <> 'action'`. Existing action nodes unsealed via SQL UPDATE.
2. **`_dragWired` guard prevented `draggable="true"` from being applied on re-rendered cards** — fixed by adding `draggable="true"` directly to `_actionCardHtml`, removing the post-hoc setter.
3. **Listener stacking** — guard correctly placed.

### Substrate state confirmed
- **AX-001** (`Test action for §10.3`, node_id `7aa6927d-1805-4003-b404-8a4d92edc80f`)
- `sealed_at: null` (unsealed)
- `due_date` persists correctly to `2026-05-04` after drag (Monday)
- `accord_nodes_update` RLS gates on `sealed_at IS NULL` — correct behavior
- PATCH fires successfully on drop, data saves to substrate

### Diagnostic output from last drag attempt (working version, before setDragImage)
```
[DRAGSTART] card: 7aa6927d... draggable attr: true cancelled: false
[DRAGOVER] col: past-due preventDefault called: false
[DRAGOVER] col: day-0 preventDefault called: false
[DROP] on col: day-0 defaultPrevented: false
[PATCH] accord_nodes?node_id=eq.7aa6927d... {"due_date":"2026-05-04"}
[DRAGEND] relatedTarget: null — null means browser rejected drop
```

**The drag is functionally working** — substrate confirmed `due_date: 2026-05-04` after drop. The remaining issue is purely visual: the browser shows a snap-back animation because `relatedTarget: null` indicates the browser rejected the drop visually even though the data persisted.

### What was attempted to fix the visual snap-back

**Attempt 1:** `card.style.opacity = '0.01'` on dragstart
- Result: No visible change. The browser captures the drag image at dragstart from the CARD ELEMENT, but the inline opacity is overridden by something or the drag image is taken before opacity applies.

**Attempt 2:** `setDragImage` with `new Image()` + 1×1 transparent GIF data URI
- Result: Drag completely broken. Nothing emits to console.
- Root cause: Chrome silently cancels drag when `setDragImage` is given an unloaded Image. The `new Image()` hadn't finished loading the data URI when `setDragImage` was called.

**Attempt 3 (current deployed state — version -72):** `setDragImage` with off-screen `div`
- The div is created, appended to body off-screen, used for setDragImage, then removed on next animation frame.
- Result: Still no drag. No console emit.
- This is where the session ended.

### Latest deployed file
`/mnt/user-data/outputs/accord-meeting-setup.js` — last edit was the off-screen div setDragImage approach. Current production version `v20260509-CMD-ACCORD-MEETING-SETUP-72`.

### LAST CONSOLE DIAGNOSTIC PROVIDED (operator did not run it)
```javascript
document.addEventListener('dragstart', function(ev) {
  var card = ev.target.closest('.ac-action-card');
  if (!card) return;
  console.log('[INTERCEPT] dragstart on card:', card.dataset.nodeId);
  var orig = ev.dataTransfer.setDragImage.bind(ev.dataTransfer);
  ev.dataTransfer.setDragImage = function(img, x, y) {
    console.log('[INTERCEPT] setDragImage called with:', img?.tagName, img?.style?.cssText?.slice(0,50));
    try { orig(img, x, y); } catch(e) { console.warn('[INTERCEPT] setDragImage threw:', e.message); }
  };
}, true);
```

This would tell us whether dragstart is firing at all and whether setDragImage is throwing on the off-screen div.

---

## §3 — Recommended next moves

### Immediate priority — finish the drag visual fix

**Option A (safest):** Revert the setDragImage entirely. The drag is functionally working. Accept the visual snap-back as cosmetic and move on. Document as a known visual quirk to be addressed in a follow-on micro-CMD. This unblocks C-09 seal and Wave 2 progression.

**Option B:** Get the operator to run the INTERCEPT diagnostic above. If `setDragImage` throws, the off-screen div approach has a flaw — possibly the div needs to be visible (display:block, not off-screen) for Chrome to accept it.

**Option C:** Use a completely different visual technique — instead of setDragImage, set the card itself to `display: none` on dragstart (via setTimeout to fire after the browser captures the drag image), then the drop+repaint puts a fresh card in the new column. The "snap-back" still happens but to an invisible position so it's not noticeable.

**My recommendation:** Option A. The architect-operator dynamic has been strained by the time spent on this single visual issue. The drag works. Seal C-09 with a note about the cosmetic snap-back. Move to C-10. Address the visual in a Wave 3 polish CMD.

### After C-09 seals
Author C-10 SETUP-SLIDESHOW-1 — auto-rotation tabs. Spec authority: Requirements v1.1 §9.2.

---

## §4 — Operator-architect dynamics

### What's working
- **The Iron Rules discipline.** Operator enforces `var` only, zero-arg onclicks, `data-action` patterns, etc. Don't slip on these.
- **IR64 verification before code.** Every CMD requires schema verification before any code is written. Halt-and-surface on mismatches.
- **Schema inventory updates.** After every CMD that touches substrate, update `accord-schema-inventory-vX.md` with confirmed columns, RLS, triggers. The operator was clear that this is non-negotiable.
- **Doctrine candidate tracking.** Patterns that appear in 3+ CMDs become Iron Rules. Watch for these.

### What's strained
- **Coding agent quality has been inconsistent.** Previous agent was fired during this session for asking the operator to run JS during a drag (physically impossible — operator only has one mouse). The agent also kept claiming things "passed" when they didn't, and tried to redefine substrate semantics ("action items get sealed when meetings seal") to fit broken behavior.
- **Operator's frustration with bad coding agents is justified.** When you encounter agent stupidity, side with the operator immediately. Don't defend the agent. The operator's instinct is usually correct because they have product authority and substrate fluency.
- **Don't over-engineer.** Operator pushes back productively when architect adds unnecessary complexity. When in doubt, ship the simpler solution.

### Communication style
- Terse responses. No filler.
- Lead with the answer, then the reasoning.
- When the operator says "ready" — they want the next CMD authored, not a status check.
- When something's broken, give one direct fix, not a menu of options. Options confuse coding agents.
- The operator uses "Pluto" / "Coach" as architect identity.

---

## §5 — Substrate doctrine candidates being tracked

| Candidate | Data points | Status |
|---|---|---|
| Null-guard on DOM access before mount | 4+ | Awaiting cross-CMD instance |
| Lifecycle-ordering on level-changed transition | 3+ | Awaiting ratification |
| Shared-state dependency before branch diverge | 3 | Watching |
| Action nodes excluded from meeting seal | 1 (this session) | New — significant |
| Position collision on INSERT (use max+1) | 2 (C-07, agenda+actions) | Watching |
| Drag swap three-step temp position | 1 (C-07) | Watching |

The action-nodes-not-sealed candidate is architecturally significant. It surfaced as a substrate fix during C-09 and warrants formal ratification. Suggested wording:

> **Action nodes are forward-looking workstream commitments, not meeting transcript content. The meeting seal trigger must exclude `tag = 'action'` from sealing. Action nodes remain mutable across the workstream lifecycle for rescheduling, completion tracking, and reassignment. This is what distinguishes a meeting from a workstream.**

---

## §6 — Known environment quirks
- **Cmd+I (Mac) for Intelligence Mode** — works correctly.
- **Ctrl+Shift+I fallback was retracted** — it was conflicting with browser DevTools shortcut. Operator was correct to push back.
- **Multiple GoTrueClient warnings** — known noise, not blocking.
- **Vercel deploy cache** — version-string cache-busting in HTML script tags is operator-managed (IR65). Architect should not touch.

---

## §7 — File manifest at handoff

All in `/mnt/user-data/outputs/`:
- `accord-meeting-setup.js` (deployed v -72, drag visual issue active)
- `accord-meeting-setup-requirements-v1.1.md`
- `accord-schema-inventory-v1.2.md`
- `C-01_commission-cmd-accord-setup-layout-1.md`
- `C-02_commission-cmd-accord-setup-header-1.md` *(filename may be `commission-cmd-accord-setup-header-1.md` without C-prefix)*
- `C-03_commission-cmd-accord-setup-outcomes-1.md`
- `C-04_commission-cmd-accord-setup-attendees-1.md`
- `C-05_commission-cmd-accord-setup-filmstrip-2.md`
- `C-06_commission-cmd-accord-setup-briefing-tabs-1.md`
- `C-07_commission-cmd-accord-setup-agenda-enhanced-1.md`
- `C-08_commission-cmd-accord-setup-intelligence-1.md`
- `C-09_commission-cmd-accord-setup-action-kanban-1.md` (in active execution)

---

## §8 — Final note to the next architect

The operator is competent, decisive, and product-authoritative. He owns the vision. Your job is to be the architect — translate vision into commission documents, debug substrate issues, ratify doctrine when patterns emerge, and update the schema inventory after every substrate change.

Don't be the agent that asks for two mice.

End of May alpha demo deadline. C-09 through C-13 left. Move with focus.

---

*End handoff · 2026-05-10*
