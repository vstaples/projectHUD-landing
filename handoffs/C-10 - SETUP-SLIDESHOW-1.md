# BRIEF — C-10 · CMD-ACCORD-SETUP-SLIDESHOW-1

**Spec authority:** Accord Meeting Setup RS v1.1 §9.2
**Wave:** 2 (Intelligence and depth) — final CMD of Wave 2
**Predecessors sealed:** C-01 through C-09
**Scope:** Surface only. No substrate, no migrations, no RLS.
**Stamp target:** operator-managed (IR65)

---

## §1 — Change Summary

Install per-column auto-rotation across the Meeting Setup three-column layout. Rotation policies are **asymmetric**:

| Column | Default | Toggle | Pause-on-hover | Click-pause |
|---|---|---|---|---|
| Left (Briefing) | MANUAL | AUTO ⇄ MANUAL header toggle | n/a (until AUTO) | 60s in AUTO |
| Center (Agenda) | NO ROTATION | — | — | — |
| Right (Attendees) | AUTO | none | yes, 3s grace to resume | 60s |

Add stepper + progress indicator to each rotating column header. Center column is untouched.

---

## §2 — Behavior Spec

### §2.1 — Rotation cadence
- Interval: **15s per tab**, fixed.
- Tab order = existing tab DOM order in the column.
- On reaching last tab, wrap to first.

### §2.2 — Left column (Briefing / Decisions / Risks)
- Loads in MANUAL. No rotation. Briefing tab pinned.
- Header has `AUTO · MANUAL` toggle. Click AUTO → **first advance at t+5s** (initial dwell — confirms AUTO engaged), then standard 15s cadence: Decisions at t+5s, Risks at t+20s, wraps to Briefing at t+35s, etc.
- Click any tab while in AUTO → that tab is now current, **60s pause**, then rotation resumes from the clicked tab at standard 15s cadence (no 5s initial dwell — that's only for the AUTO-engagement transition).
- Click MANUAL toggle → rotation halts, current tab remains visible. AUTO/MANUAL state is **ephemeral — resets to MANUAL on every page load**.

### §2.3 — Right column (Attendees / Action Items / [future Attachments])
- Loads in AUTO. Rotation begins on default tab (Attendees) at +15s.
- **Hover target is the entire column container** (header + body together — stepper interaction does not trigger a leave→resume race).
- Cursor enters anywhere in the column → **rotation pauses immediately**, progress indicator freezes.
- Cursor leaves → **3s grace timer**. If cursor re-enters during grace, grace resets. After 3s clean leave, rotation resumes from current tab's elapsed point (do NOT reset progress to 0).
- **Click during grace: click wins.** A tab/stepper click during the 3s grace cancels the grace timer and applies the 60s manual pause.
- Click any tab → that tab is now current, **60s pause**, then rotation resumes.
- No AUTO/MANUAL toggle on right column.

### §2.4 — Center column
- No rotation logic installed. Tab-switch behavior shipped in C-07 untouched.

### §2.5 — Tab-list awareness
- Rotation engine reads the column's tab list at runtime. When X-01 (Attachments) ships and adds a third tab to the right column, rotation picks it up automatically with no C-10 patch.
- If a column has only one tab, rotation is a no-op (engine still runs but never advances).

### §2.6 — External pause hook (forward-compat for C-12)
- Expose `AccordSlideshow.pause(colId)` and `AccordSlideshow.resume(colId)` so C-12 (Gathering Mode) can halt right-column rotation when collapsing to roster-only. Document as the hook contract; do not implement gathering-mode invocation here.

---

## §3 — UI Elements

### §3.1 — Stepper (rotating columns only)
- Anchored right of column title in the column header (the `.ac-col-tabbar`).
- Format: `‹  • • •  ›` — chevrons + N dots, one per tab.
- **Class reuse:** uses existing `.ac-stepper-btn` (chevrons) + `.ac-stepper-dot` + `.ac-stepper-dot--active` (current tab) shipped by C-07. Wrapper class `.ac-col-stepper` scopes the stepper to left/right rotating columns (distinct from C-07's `.ac-center-stepper`).
- Current tab dot: filled (`--ac-cyan`).
- Other dots: outlined (`--ac-border-mid`).
- Click dot → jump to that tab (counts as manual click → 60s pause).
- Click `‹` / `›` → step back/forward by one (counts as manual click → 60s pause). Wraps.
- Hidden when column has only one tab.

### §3.2 — Progress indicator
- 1px line at bottom of column header (full width of header).
- Drains left-to-right over the active 15s interval.
- Color: `--ac-cyan` at 60% opacity.
- Resets to 0 on every tab transition (auto or manual).
- Hidden / static when paused (hover-pause, 60s click-pause, or column in MANUAL).

### §3.3 — AUTO / MANUAL toggle (left column only)
- Anchored in left column header, opposite the stepper or stacked above per Style Doctrine v1.8 horizontal-rhythm allowance.
- Two-state pill: `AUTO` highlighted when active, `MANUAL` highlighted when inactive.
- Default: MANUAL highlighted.
- Stepper renders only when in AUTO (no rotation = no stepper).

---

## §4 — Implementation Hooks

Phase 1 (Investigation) must locate and document:
- The current tab-switch dispatch in left column (C-06 wired) and right column (C-04 / C-09 wired).
- Whether tab-switch is event-driven (`data-action="*-tab-switch"`) or direct-handler. Rotation must call the same path the user click does — no shadow render path.
- Existing column header DOM structure for stepper/progress placement.
- Any existing timers in the surface (`setTimeout`/`setInterval`) that could conflict with the rotation engine.

---

## §5 — File Inventory

| File | Change |
|---|---|
| `accord-meeting-setup.js` | New `_initSlideshow()` module. Per-column rotation engine. Stepper + progress + toggle render. Wire into existing tab-switch dispatch. Expose `AccordSlideshow.pause/resume`. |
| `accord-meeting-setup.css` | New rules: `.ac-col-stepper` (wrapper for left/right rotating-column steppers), `.ac-rotation-progress` (1px draining line), `.ac-rotation-toggle` (AUTO/MANUAL pill). Existing `.ac-stepper-btn` / `.ac-stepper-dot` / `.ac-stepper-dot--active` (C-07) reused. |
| `accord-meeting-setup-requirements-v1.1.md` | None — spec already covers. |
| `accord-schema-inventory-v1.x.md` | None — no substrate. |

---

## §6 — Test Plan (operator-runnable)

1. Load Meeting Setup. Left column = Briefing tab visible, MANUAL highlighted, no stepper. Center = Agenda. Right = Attendees, stepper visible, progress line draining.
2. Wait 15s. Right column advances Attendees → Action Items. Progress resets and drains again.
3. Wait another 15s. Action Items → Attendees (only 2 tabs currently — rotation wraps).
4. Hover cursor over right column body. Progress line freezes mid-drain. Stepper dot stays on current.
5. Move cursor outside right column. Watch 3s. Rotation resumes from where progress froze.
6. Hover into right column, hover out, hover in again within 3s. Rotation does NOT resume (grace reset).
7. Click Action Items tab manually in right column. Progress resets, 60s pause begins. After 60s, rotation resumes.
8. Click `‹` or `›` chevron in right stepper. Steps tab + 60s pause begins.
9. Click AUTO toggle in left column header. Stepper appears. **At t+5s** rotation advances Briefing → Decisions. Then standard 15s cadence: Decisions → Risks at t+20s, wraps to Briefing at t+35s.
10. Click MANUAL toggle. Rotation halts. Current tab persists. Stepper hides.
11. Center column: no stepper, no progress line, no rotation. Tab-switch via filmstrip click and direct tab click works (regression check on C-07).
12. Open browser console. Run `AccordSlideshow.pause('right')`. Right column rotation halts, progress freezes. Run `AccordSlideshow.resume('right')`. Resumes from current.

---

## §7 — Out of Scope

- Gathering mode rotation suppression — C-12 invokes the pause hook.
- Persistence of AUTO/MANUAL state across reloads (open question §8).
- Rotation cadence configurability (15s is fixed per spec).
- Center column tab additions or rotation.
- Attachments tab on right column — ships in X-01.
- Filmstrip frame auto-advance — separate concern.

---

## §8 — Decisions locked (open-question pass, 2026-05-10)

| # | Question | Resolution |
|---|---|---|
| 8.1 | AUTO/MANUAL persistence across reload | **Ephemeral.** Resets to MANUAL on page load. No localStorage. |
| 8.2 | Hover-pause scope: column body vs full container | **Full column container** (header + body together). Stepper interaction does not trigger leave→resume race. |
| 8.3 | Click during 3s grace: click vs grace wins | **Click wins.** Grace timer cancelled, 60s manual pause applied. |
| 8.4 | AUTO toggle initial advance: immediate / 15s / other | **5s initial dwell.** First advance at t+5s after AUTO engaged. Subsequent advances at standard 15s cadence. |

All four absorbed into §2 spec language. No further dispositions required.

### Phase 1 dispositions (2026-05-10)

| # | Finding | Resolution |
|---|---|---|
| 7.1 | `.ac-stepper-dot` collision with C-07 center-stepper classes | **Reuse C-07 classes** (`.ac-stepper-btn` / `.ac-stepper-dot` / `.ac-stepper-dot--active`). New wrapper `.ac-col-stepper` scopes rotating-column variant. |
| 7.2 | `--ac-accent-cyan` token does not exist (Brief drafting slip) | **Use `--ac-cyan`** (canonical). 60% opacity for progress line. Brief patched. |

---

## §9 — Doctrine notes

- **IR71** — rotation timers must clear on tab-list mutation. If C-12 or any other CMD adds/removes tabs at runtime, rotation engine re-reads tab list before next advance.
- **IR72** — Phase 1 cross-module survey: confirm no other surface uses `AccordSlideshow` namespace.
- **IR65** — operator-managed version pin at seal.
- **Style Doctrine v1.8** — stepper uses Accord palette tokens (no new colors).

---

*End brief · C-10 · SETUP-SLIDESHOW-1*
