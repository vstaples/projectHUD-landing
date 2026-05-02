# BRIEF — CMD101: Pipeline Dashboard Retrofit + Delete Verb + Active Toggle

**Stamp target:** `v20260502-CMD101.00` (operator confirms before delivery)
**Mode:** Option A — dashboard replaces kanban as `pipeline.html` default; kanban demoted to sub-view.

---

## §1. SCOPE

Three workstreams delivered as one cohesive change:

1. **Dashboard retrofit** — convert `pipeline.html` from kanban-first to dashboard-first; kanban becomes "Board" sub-view inside the same page.
2. **`Delete Prospect` recorder verb** — script-only, no UI surface.
3. **Active/Inactive toggle** — boolean on `prospects`, exposed via Edit drawer; inactive prospects excluded from kanban + dashboard aggregates.

---

## §2. SCHEMA MIGRATIONS

### 2.1 `prospects.is_active`

```sql
ALTER TABLE prospects
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;

CREATE INDEX idx_prospects_firm_active
  ON prospects(firm_id, is_active)
  WHERE is_active = true;
```

Partial index keeps active-deal queries fast as inactive rows accumulate.

### 2.2 RLS — DELETE policy on `prospects`

Required for `API.del('prospects?id=eq.…')` to succeed. Confirm policy exists:

```sql
SELECT polname, polcmd FROM pg_policy
  WHERE polrelid = 'prospects'::regclass;
```

If no DELETE policy: add one matching the firm-scoped UPDATE policy pattern.

---

## §3. PAGE STRUCTURE — `pipeline.html`

Replace current single-view markup with two-view shell:

```html
<div class="hud-shell">
  <div class="hud-tabs">                              <!-- new -->
    <button class="hud-tab active" data-view="dashboard">Dashboard</button>
    <button class="hud-tab" data-view="board">Board</button>
  </div>

  <section class="view-dashboard">                    <!-- new, default -->
    [KPI strip]
    [Funnel Velocity panel]
    [Active Deals panel]
    [Right rail: Forecast Rings, Alerts-Stuck, Touch Today]
  </section>

  <section class="view-board" hidden>                 <!-- existing kanban, unchanged -->
    [current kanban markup]
  </section>
</div>
```

View switch is pure DOM toggle (`hidden` attribute) — no route change, no re-fetch. Both views read from a single shared `_prospects` cache populated on page load.

**Recorder implications:**
- New `Switch View` verb: `Switch View "Dashboard"` / `Switch View "Board"`.
- Existing kanban verbs (`Open Prospect`, `Move Prospect`, etc.) continue to work — they fire only when the Board view is active. Capture-phase listener should check view state before classifying.

---

## §4. WIDGET DATA SPECIFICATION

All metrics computed client-side from a single `prospects` fetch. No new RPCs, no views.

### 4.1 Single fetch
```js
const prospects = await API.get(
  `prospects?select=*&firm_id=eq.${firmId}&is_active=eq.true&order=updated_at.desc`
);
```
Plus a separate fetch for trailing-12mo closed-won (used by Forecast %):
```js
const cutoff = new Date(Date.now() - 365*86400e3).toISOString();
const closedWon = await API.get(
  `prospects?select=est_value,updated_at&firm_id=eq.${firmId}&stage=eq.approved&updated_at=gte.${cutoff}`
);
```

### 4.2 Stage probability map (constant, lives in `pipeline.html`)
```js
const STAGE_PROB = {
  prospect:   0.10,
  qualifying: 0.25,
  discovery:  0.40,
  proposal:   0.60,
  review:     0.80,
  approved:   1.00
};
```

### 4.3 Stuck-deal thresholds (per-stage, lives in `pipeline.html`)
```js
const STUCK_THRESHOLD_DAYS = {
  prospect:   14,
  qualifying: 21,
  discovery:  30,
  proposal:   30,
  review:     14,
  approved:   Infinity   // never stuck
};
```
Time-in-stage proxy: `(now - updated_at) in days`. Documented limitation: any edit resets the clock until a `prospect_stage_history` table is added (deferred to v2).

### 4.4 KPI strip — six cards

| Card | Computation | Color rule |
|------|-------------|------------|
| Pipeline Value | `Σ est_value` (active, stage ≠ approved) | `--cyan` |
| Weighted Forecast | `Σ (est_value × STAGE_PROB[stage])` (active, stage ≠ approved) | `--cyan`; sub: "X% vs trailing 12mo" where X = forecast / Σ closedWon.est_value |
| Win Rate | last 90d: `count(approved) / count(approved + lost)` — **note:** no "lost" stage exists; v1 = `count(approved last 90d) / count(all stage changes last 90d)`. Approximation flagged in tooltip. | `--green` if ≥30%, else `--amber` |
| Avg Cycle | mean `(updated_at - created_at)` days for last 10 approved | `--amber` if >baseline (set baseline = 45d), else `--green` |
| Stuck Deals | count where `daysInStage > STUCK_THRESHOLD_DAYS[stage]` | `--red` if >0, else `--green`; sub: "$X at risk" = sum of est_value of stuck |
| This Week | `+$X` = sum est_value of prospects whose `updated_at >= now-7d` AND stage advanced (approximation: any update); sub: "N advanced · M won" | `--green` |

Sixth card decision: this is the cleanest semantic set. The 7th from earlier mockup ("Active Deals") is dropped — count is already implied by the funnel panel.

### 4.5 Funnel Velocity panel — six stage tiles + five conversion %

Stage tile content (per stage):
- Stage name (color: stage accent, see §4.7)
- `$X` total est_value in stage
- `N · Yd avg` — count + avg time-in-stage

Conversion % between adjacent stages:
- v1: instantaneous funnel ratio = `count(downstream) / count(upstream)` for current snapshot. **Limitation:** doesn't measure historical conversion — measures shape of current pipeline. Acceptable v1; flag for v2 (needs stage-history table).
- Color: green ≥50%, amber 30–50%, red <30%.

### 4.6 Active Deals panel — replaces kanban as primary list

Row pattern (one row per active prospect, sorted by stage then est_value desc):
- Left border: green/amber/red per status (on track / followup overdue / stuck)
- Title + meta line (company · industry · assignee initials)
- Stage pill (stage-color)
- Status pill (On Track / Followup Nd / Stuck Nd)
- Date (next_follow_up_date or updated_at)
- Value (cyan, tnum, right-aligned)

Click row → opens existing prospect detail drawer (unchanged behavior). Recorder captures as existing `Open Prospect "<title>"` verb.

### 4.7 Right rail — three panels

**Panel 1 — Forecast Summary (3 ring gauges):**
- Forecast %: `weighted_forecast / trailing_12mo_closedWon` (capped display at 100%, real value in tooltip)
- Win Rate: same as KPI (stays in sync)
- Velocity: `(deals advanced last 30d) / (deals advanced prior 30d)` — ratio, 1.0 = steady; ring fill = min(ratio, 2.0)/2.0

**Panel 2 — Alerts — Stuck:**
- Top 5 stuck prospects, sorted by days-over-threshold desc
- Each row: title, "Stage · Company", days-over in red/amber

**Panel 3 — Touch Today:**
- Scoring: `score = (days_in_stage × 10) + (overdue_followup_days × 30) + (est_value / 1000) + (stage_index × 50)` where stage_index gives later-stage deals priority
- Top 5 by score
- Each row: rank, title, score, sub: "$X · reason"

### 4.8 Stage colors (extend palette via `--purple` already in tokens)

```css
--stage-prospect:   var(--green);
--stage-qualifying: #5dcaa5;
--stage-discovery:  var(--cyan);
--stage-proposal:   var(--amber);
--stage-review:     var(--purple);
--stage-approved:   var(--green);
```

Add to `hud.css` §3 (color tokens) — these are net-new tokens, no existing values changed.

---

## §5. RECORDER VERB — `Delete Prospect`

### 5.1 Syntax
```
Delete Prospect "<title>"
```

### 5.2 Resolution
1. Match by exact `title` within `firm_id` AND `is_active=true`.
2. If 0 matches → log `[recorder] Delete Prospect: no match for "<title>"` and continue (don't halt script).
3. If >1 matches → log warning, delete all matches (operator chose this verb knowing demos use unique names).

### 5.3 Implementation
- Add to `api.js`: `const deleteProspect = (id) => del(\`prospects?id=eq.${id}\`);`
- Add to cmd-center COMMANDS table:
  ```js
  'Delete Prospect': async (title) => {
    const matches = _prospects.filter(p => p.title === title);
    if (!matches.length) { console.warn(`[recorder] Delete Prospect: no match for "${title}"`); return; }
    for (const p of matches) await API.deleteProspect(p.id);
    await refreshProspects();   // re-broadcast page_ready when settled
  }
  ```
- No UI surface. No capture-side recorder rule (verb is script-only — operator never produces it via clicks).

### 5.4 Use case
Demo scripts begin with `Delete Prospect "Acme Robotics Demo"` so the script is replayable against the same fixture name without manual cleanup.

---

## §6. ACTIVE/INACTIVE TOGGLE — Edit Prospect drawer

### 6.1 UI placement
Edit drawer footer, left of Save/Cancel:
```
[ Mark Inactive ]    [Cancel]  [Save]
```
Button label flips: `Mark Inactive` when `is_active=true`, `Mark Active` when `is_active=false`.

Style: ghost button, `--text-muted` text, `--border` outline. Click triggers immediate PATCH (no Save required) + closes drawer + refreshes board/dashboard.

### 6.2 Recorder verb
```
Toggle Active "<title>"
```
Capture-side: classify clicks on `.btn-toggle-active` inside `.prospect-edit-drawer`. Replay-side: same resolution as Delete Prospect.

### 6.3 Inactive prospect visibility
- Excluded from default fetch in §4.1 (filtered by `is_active=eq.true`).
- Future "Archive" view (out of scope this brief) will surface them.
- Filter chip "Show inactive" deferred to a later brief.

---

## §7. FILE INVENTORY

| File | Change type |
|------|-------------|
| `pipeline.html` | Major rewrite — two-view shell, dashboard markup, kanban demoted to `<section class="view-board" hidden>` |
| `js/api.js` | Add `deleteProspect`, add `setProspectActive` (PATCH `is_active`) |
| `js/cmd-center.js` | Add `Delete Prospect`, `Toggle Active`, `Switch View` to COMMANDS table |
| `js/hud-shell.js` | Capture-side: classify `.hud-tab` → `Switch View "<label>"`; classify `.btn-toggle-active` → `Toggle Active "<title>"` |
| `css/hud.css` | Add stage-color tokens (§4.8); add tab styling (`.hud-tab`, `.hud-tab.active`); add `.dashboard-grid` layout |
| `migrations/2026_05_02_prospects_is_active.sql` | NEW — schema migration |

---

## §8. PHASING (recommended order, single delivery)

1. Schema migration (operator runs in SQL Editor before file deploy).
2. `api.js` — new methods.
3. `pipeline.html` — markup + JS for dashboard, kanban moved into `view-board` section.
4. `hud.css` — tokens + tab styling + dashboard grid.
5. `cmd-center.js` — three new COMMANDS.
6. `hud-shell.js` — capture rules for new clickables.

---

## §9. TEST PLAN

After delivery, operator validates:

**Dashboard:**
- [ ] Page loads to Dashboard view by default.
- [ ] All 6 KPI cards populate; values reconcile with funnel panel sums.
- [ ] Funnel velocity shows 6 tiles + 5 conversion %; colors correct per threshold.
- [ ] Active Deals list shows all active prospects; click row opens drawer.
- [ ] Three right-rail panels populate.
- [ ] Switch to Board view shows existing kanban, unchanged.
- [ ] Switch back to Dashboard preserves scroll position.

**Recorder/replay:**
- [ ] `Switch View "Board"` and `Switch View "Dashboard"` recorded on tab click.
- [ ] `Switch View "Board"` then `Open Prospect "X"` replays cleanly.
- [ ] Existing kanban scripts replay unchanged when Board view is active.

**Delete verb:**
- [ ] Script line `Delete Prospect "Test Co"` removes the prospect; subsequent re-add of same name succeeds.
- [ ] Script line `Delete Prospect "Nonexistent"` logs warning, doesn't halt.

**Active toggle:**
- [ ] Mark Inactive removes prospect from kanban + dashboard.
- [ ] Re-fetching with `is_active=false` filter shows the prospect (manual SQL check).
- [ ] `Toggle Active "X"` recorded on click; replays cleanly.

---

## §10. DEFERRED TO LATER BRIEFS

- `prospect_stage_history` table + trigger → enables true historical funnel velocity and accurate time-in-stage
- "Lost" stage → enables proper win-rate calculation
- Archive view for inactive prospects
- "Show inactive" filter chip on dashboard
- Quota table (`firms.pipeline_quota_annual`) → replaces trailing-12mo benchmark with real target
- KPI card 7 (deferred — current 6 are semantically complete)

---

**End of brief.** Awaiting operator approval to draft the handoff and proceed to delivery.
