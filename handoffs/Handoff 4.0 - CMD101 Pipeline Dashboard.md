# HANDOFF — CMD101: Pipeline Dashboard Retrofit + Delete Verb + Active Toggle

**Date:** 2026-05-02
**Outgoing agent:** CMD100.83 successor (planning agent)
**Incoming agent:** CMD101 build agent
**Operator:** Vaughn Staples
**Stamp target:** `v20260502-CMD101.00` (operator confirms before delivery)

---

## §0. PRE-FLIGHT — READ THIS FIRST

You are picking up a fully-specified build. The brief is `brief-cmd101-pipeline-dashboard.md` — read it end-to-end before touching code. Do not redesign. Do not narrate. Do not exceed scope. Iron Rules 36, 37, 39, 40 §1 apply.

The operator has already:
- Reviewed and approved the dashboard mockup (house-style version with funnel velocity panel from the upgraded mockup)
- Confirmed Option A placement (dashboard replaces kanban as page default; kanban demoted to "Board" sub-view)
- Confirmed forecast benchmark = trailing-12mo closed-won (no quota table)
- Confirmed per-stage stuck thresholds
- Confirmed `is_active` schema addition
- Confirmed `Delete Prospect` recorder verb (script-only)
- Confirmed `Toggle Active` via Edit drawer footer button

There are no remaining design decisions for you to make. If you find one, halt and ask — don't invent.

---

## §1. INPUTS PROVIDED

| File | Purpose |
|------|---------|
| `brief-cmd101-pipeline-dashboard.md` | Authoritative spec — implement to this |
| `pipeline.html` | Current source — base for retrofit |
| `js/api.js` | Current source — extend with two new methods |
| `hud.css` | Reference for token names; extend with new ones in §4.8 of brief |
| `dashboard.html`, `compass.html` | Reference for house style — DO NOT modify, use as visual exemplar |

You will need to request from operator:
- Current `js/cmd-center.js` (recorder COMMANDS table + replay loop)
- Current `js/hud-shell.js` (capture-side classifier)
- These were not in this planning context; build agent must request before touching recorder/replay code.

---

## §2. BUILD ORDER (mandatory sequence)

**Step 1 — Schema migration**

Operator runs in Supabase SQL Editor:
```sql
ALTER TABLE prospects
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;

CREATE INDEX idx_prospects_firm_active
  ON prospects(firm_id, is_active)
  WHERE is_active = true;
```

Then operator confirms RLS DELETE policy exists:
```sql
SELECT polname, polcmd FROM pg_policy
  WHERE polrelid = 'prospects'::regclass;
```

If no DELETE policy in results, halt and request operator add one matching firm-scoped UPDATE pattern. Do not attempt to write the policy yourself.

**Step 2 — `js/api.js`**

Add two domain methods near other prospect calls (alphabetical-ish — `getActionItems` block is a good neighbor):
```js
const deleteProspect    = (id)        => del(`prospects?id=eq.${id}`);
const setProspectActive = (id, active) => patch(`prospects?id=eq.${id}`, { is_active: active });
```

Export both in the return block.

**Step 3 — `pipeline.html` markup + JS**

Major rewrite. Two-view shell per brief §3:
- New tab strip at top
- `<section class="view-dashboard">` containing all dashboard panels (default visible)
- `<section class="view-board" hidden>` containing existing kanban markup, **unchanged** — copy-paste current body into this wrapper

JS: single `_prospects` cache populated on load, both views read from it. View toggle is `hidden` attribute swap, no re-fetch.

Computations live in `pipeline.html` — do not hide them in shared modules. Per brief §4 — KPI strip math, funnel snapshot ratios, stuck detection, scoring for Touch Today.

**Step 4 — `hud.css`**

Add new tokens per brief §4.8 (six `--stage-*` variables). Add `.hud-tab` / `.hud-tab.active` styling matching the Compass `.hud-tab-strip` pattern (operator can paste an example if you don't have it). Add `.dashboard-grid` two-column layout (1fr 320px sidebar).

Do not modify any existing tokens or classes. Add only.

**Step 5 — `js/cmd-center.js`**

Add three entries to COMMANDS table:
- `'Switch View'` — toggles between dashboard/board sections, broadcasts `page_ready` after switch settles
- `'Delete Prospect'` — per brief §5.3
- `'Toggle Active'` — flips `is_active`, refreshes cache, broadcasts `page_ready`

All three end with refresh + page_ready broadcast.

**Step 6 — `js/hud-shell.js`**

Add capture-side classifier rules:
- `.hud-tab` click → `Switch View "<label>"`
- `.btn-toggle-active` inside `.prospect-edit-drawer` → `Toggle Active "<title>"` (extract title from drawer header)

`Delete Prospect` has NO capture rule — script-only verb.

---

## §3. CRITICAL TRAPS (do not repeat prior incidents)

1. **Module-scope state** — any new map the COMMANDS table reads (e.g. a view-state map for Switch View) must live at module scope in cmd-center.js. Do not nest inside an IIFE or channel-setup closure. Prior `_recordArmed` / `_pageReadyTs` incidents documented in CMD100.83 handoff.

2. **CURRENT_USER unreliable** — for any user-context lookup, read `window._aegisSelf` first. Brief doesn't require user context but if you add anything that does, follow this rule.

3. **Class regexes** — use `el.classList.contains('hud-tab')` not `\bhud-tab\b`. Recorder bug history.

4. **Don't bump `js/version.js`** — operator manages stamp externally. Ask after delivery which stamp.

5. **Don't probe schema** — schema is per brief §2 + the column inventory operator already provided. If you need a column not listed, halt and ask.

6. **Existing kanban behavior must remain bit-for-bit unchanged.** The Board view is the existing markup wrapped in a new section element. Drag-and-drop, card open, add prospect — all continue to work. Only the visibility-toggle integration is new.

7. **Recorder events fire only when their view is active.** Capture-phase listener should check `document.querySelector('.view-board:not([hidden])')` before classifying kanban-context clicks. Otherwise dashboard-area Active Deals clicks could be misclassified as kanban Open Prospect events. (They both open the drawer; the verb name is the same; risk is mostly cosmetic but worth handling cleanly.)

---

## §4. DELIVERY FORMAT

When complete, present in this order:
1. SQL migration file (operator runs separately)
2. `pipeline.html` (full file)
3. `js/api.js` (full file)
4. `js/cmd-center.js` (full file)
5. `js/hud-shell.js` (full file)
6. `hud.css` patch (only the additions, with line-number context)

Followed by:
- 5-line "what changed" summary
- The test plan from brief §9, copy-pasted verbatim as a checklist

No postamble. Stop after the test plan.

---

## §5. KNOWN LIMITATIONS — DO NOT FIX, DO NOT FLAG IN UI

These are documented in brief §10 as deferred. The build should ship with these limitations silent:

- Time-in-stage measured via `updated_at` proxy (any edit resets clock)
- Funnel conversion %s are snapshot ratios, not historical
- Win rate denominator is approximate (no Lost stage)
- No "Show inactive" filter
- No archive view
- No quota field

If operator asks why something looks off, point to brief §10. Do not add tooltips explaining the limitations — the brief decided clean UI > caveat clutter.

---

## §6. AFTER DELIVERY

Operator will:
1. Run SQL migration
2. Confirm stamp number for `js/version.js`
3. Test per checklist
4. Report results

Your follow-up at that point should be ≤3 lines suggesting the next direction (likely: record `add_new_prospect.txt` end-to-end now that dashboard surfaces metrics properly, OR begin `prospect_stage_history` v2 brief).

---

**Good luck. The brief is the contract. Ship it.**
