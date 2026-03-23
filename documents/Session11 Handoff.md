# CadenceHUD — Session 11 Handoff
**Apex Consulting Group · ProjectHUD · Confidential**
*March 23, 2026*

---

## System Identity

| Property | Value |
|----------|-------|
| App URL | https://project-hud-landing.vercel.app/cadence.html |
| Canonical domain | projecthud.com |
| Single-file app | `cadence.html` — all HTML/CSS/JS |
| Supabase URL | `https://dvbetgdzksatcgdfftbs.supabase.co` |
| Firm ID | `aaaaaaaa-0001-0001-0001-000000000001` |
| Git repo | https://github.com/vstaples/projectHUD-landing.git |
| Deployment | GitHub push → Vercel auto-deploy |
| Edge Function | `ai-briefing` at `${SUPA_URL}/functions/v1/ai-briefing` |
| AI Model | `claude-sonnet-4-6` via Supabase Edge Function proxy |

---

## Key Personnel

| Name | Resource ID | Email |
|------|-------------|-------|
| Vaughn W. Staples (internal) | e1000001-0000-0000-0000-000000000001 | vstaples@projecthud.com |
| Vaughn W. Staples (external) | 0402921d-9e87-4a02-a6aa-c5f754a77023 | vstaples64@gmail.com |

---

## Session 11 Outputs

| File | Purpose |
|------|---------|
| `/mnt/user-data/outputs/cadence.html` | Main app — all Session 11 features |
| `/mnt/user-data/outputs/rework-history-architecture.pdf` | Rework History Layer architecture PDF |
| `/mnt/user-data/outputs/rework-history-architecture.md` | Rework History Layer architecture MD |
| `/mnt/user-data/outputs/cadencehud_flyer.pdf` | Marketing flyer — 2-page dark theme |

---

## Session 11 Completed Features

### 1. Rework History Layer ✅
The second visual layer on the DAG canvas. Independent of Swimlane — the two are mutually exclusive (toggling one turns off the other).

**State variables:**
```javascript
let _historyActive    = false;
let _historyClusters  = []; // hit regions: [{stepId, heat, x, y, w, h}]
let _historyPopup     = null;
let _historyHideTimer = null;
let _hxHighlightTimer = null;
let _hxHighlightStep  = null;
let _hxCardDwellTimer = null;
```

**Constants:**
```javascript
const HEAT_COLORS = {
  low:      { fill:'rgba(95,120,200,.2)',  stroke:'#5f78c8', text:'#9aaeee' },
  moderate: { fill:'rgba(140,80,200,.2)',  stroke:'#8c50c8', text:'#c490f0' },
  high:     { fill:'rgba(180,50,220,.25)', stroke:'#b432dc', text:'#d86ef5' },
};
```

**Heat levels:** cold (0) → low (1–3) → moderate (4–9) → high (10+)

**Key functions:**
- `_buildReworkHeatMap(inst)` — aggregates Type A (own failure) and Type B (upstream reset) rework events per step across all instances of the same template
- `_heatLevel(n)` — returns cold/low/moderate/high
- `_toggleHistory()` — toggle with mutual exclusion vs swimlane
- `_hxShowPopup(cluster, clientX, clientY, inst)` — breakdown popup built as DOM elements with 1.5s dwell-to-briefing on each instance row
- `_hxHidePopup(immediate)` / `_hxStartHidePopup()` — hide with 280ms delay
- `_hxPopulatePanel(inst)` — populates heat zone cards in REPLAY zone overlay
- `_hxCardClick(stepId)` — 2.5s pulsing purple highlight ring on the clicked node
- `_hxCardHover(el, event)` — 1.5s dwell then shows same popup as badge hover
- `_hxCardLeave()` — cancels dwell timer, hides popup

**Canvas draw pass** (inside transform, after swimlane pass, before ctx.restore()):
- Node border override: 2px purple for high, 1.5px for moderate
- Heat badge: `bx = p.x`, `by = p.y + NH + 6` — outside lower-left corner
- Bottleneck ▲ flag on highest-heat node with total ≥ 10
- Hit regions stored in `_historyClusters[]`

**Reset cause classification:**
- Type A: `step_completed` with `requiresReset` outcome — step's own failure
- Type B: `step_reset` with "Reset by" in `event_notes` — upstream cascade

**Bottom panel:** `hx-info-panel` overlays the REPLAY zone (z-index:11) when active. Cards show step name (13px), count (20px), proportional bar, cause classification, per-instance breakdown. Purple dwell progress bar on hover. Click highlights node on canvas for 2.5s. `_hxHighlightStep` keeps pulse animation running.

---

### 2. Swimlane / History Mutual Exclusion ✅
Toggling either layer turns the other off — buttons, panels, and popups all clean up. They behave as a radio pair.

---

### 3. Confidence Dot Hover Tooltip ✅
The small colored dot in the lower-left corner of DAG nodes is a confidence signal from the latest step comment.

**State:** `let _confDots = []` — populated each render frame with `{stepId, stepName, conf, author, body, ts, x, y, r:8}`

**Tooltip shows:**
- Signal level (Confident / Some uncertainty / Concerned) in signal color
- Comment text (truncated 80 chars)
- Author + timestamp
- "Latest signal on [Step Name]" footer
- Auto-hides after 3s

**Hit-test:** circular distance check in mousemove handler, fires before heat/swimlane checks.

---

### 4. History Card Improvements ✅
- Title font: 13px (was 10px)
- Count font: 20px (was 18px)
- Cause/instance lines: 10px (was 9px)
- Cards have `cursor:pointer` and `overflow:hidden` for dwell bar
- Dwell bar color: `#b432dc` (purple, matching heat palette)

---

## Architecture: Key State Variables

```javascript
// Swimlane
let _swimlaneActive    = false;
let _swimlanePopup     = null;
let _swimlaneHideTimer = null;
let _swimlaneDwellTimer = null;
let _swimlaneDwellRow  = null;
let _swimlaneClusters  = [];

// Rework History
let _historyActive     = false;
let _historyClusters   = [];
let _historyPopup      = null;
let _historyHideTimer  = null;
let _hxHighlightStep   = null;
let _hxHighlightTimer  = null;
let _hxCardDwellTimer  = null;

// Confidence dots
let _confDots          = [];
let _confTooltipEl     = null;
let _confTooltipTimer  = null;
```

---

## Canvas Layer Order (renderInstanceDAG)

All drawn inside `ctx.save()` / `ctx.restore()` with translate+scale transform:

1. Connector lines
2. Rejection arcs (dashed red, `arcDepth = 50 + i*12`)
3. Instance pills
4. Node shadows
5. Node bodies + text + state indicators
6. Sequence numbers
7. Confidence dots (bottom-left corner, stored in `_confDots[]`)
8. Rework badges (inside node, bottom-right)
9. Active step pulse ring
10. **History highlight ring** (`_hxHighlightStep`)
11. **Swimlane dot clusters** (top-right corner, `_swimlaneClusters[]`)
12. **History heat badges** (outside lower-left, `bx = p.x`, `by = p.y + NH + 6`)

Then `ctx.restore()`, then zoom label update.

---

## Database Schema — Key Tables

```sql
-- workflow_instances
id, firm_id, template_id, title, status, launched_at,
briefing_narrative, briefing_generated_at,    -- AI briefing cache
current_step_id, current_step_name, current_step_type  -- swimlane denorm

-- workflow_step_instances (Chain of Custody)
id, instance_id, template_step_id, event_type, outcome,
event_notes, created_at, author_id, author_name,
hours_logged, confidence, step_name

-- step_comments
id, instance_id, template_step_id, body, confidence,
author_name, created_at, is_deleted, parent_id

-- workflow_action_items
id, instance_id, template_step_id, title, owner_id,
due_date, status, attachments (jsonb)
```

**event_type values:** `step_activated`, `step_completed`, `step_reset`, `trigger_fired`

**Reset cause detection:**
```javascript
// Type B — upstream
(e.event_notes||'').toLowerCase().includes('reset by')

// Type A — own failure
e.event_type === 'step_completed' && oDef?.requiresReset === true
```

---

## DAG Layout Constants

```javascript
const NW = 152;     // node width
const NH = 68;      // node height
const HGAP = 72;    // horizontal gap between nodes
const PAD_L = 56;   // left padding
const PAD_R = 56;   // right padding
const OWNER_H = 22; // owner avatar row height above nodes
const NODE_Y = 50 + OWNER_H; // node top y in content space
```

**Arc geometry:** originates from `x = p.x + NW/2` (node center), `y = p.y + NH` (node bottom). Curves down to `arcDepth = 50 + i*12` below bottom. Heat badges at `p.x, p.y + NH + 6` sit left of arc origin — no overlap.

---

## Updated Priority List (Session 12+)

| # | Feature | Notes |
|---|---------|-------|
| 1 | **Rejection Context Threading** | When step rejected, rejection note travels to destination step as pinned read-only context card. Assignee sees why they're back at step 1. |
| 2 | **Direct Action Item from Step** | `+ Add Action Item` button on step panel without requiring a comment first. |
| 3 | **Layer 3 Analytics Dashboard** | Step dwell heatmap, rejection rate by step, bottleneck identification, PERT accuracy trending. Full dashboard view. |
| 4 | **Morning Brief (3-tier AI)** | PM tactical / Manager strategic / Executive financial. Daily AI-generated push. |
| 5 | **Confidence Predictor** | After N instances, predict rejection probability from confidence signal trajectory before rejection occurs. |

---

## Working Rules (Non-Negotiable)

1. Never make changes without reading relevant code first
2. Always validate after every JS edit (brace-balance check: `node --input-type=module`)
3. Mirror working patterns exactly — check how similar features are implemented before writing new ones
4. Deploy: `cp /home/claude/cadence.html /mnt/user-data/outputs/cadence.html`
5. After 3+ failed attempts: stop and ask for DevTools console output
6. Architecture discussions → generate `.md` + `.pdf` before implementation
7. `API` object in `/js/api.js` — methods: `.get()`, `.post()`, `.patch()`, `.del()`
8. `API.post()` return value unreliable — always pre-generate UUID with `crypto.randomUUID()`
9. `showIntelBriefing(instId)` delegates to `_showIntelBriefingModal(inst)` after data fetch — shows `_showBriefingLoadingModal` immediately for siblings
10. `_swimlaneClusters` and `_historyClusters` and `_confDots` reset each render frame
11. `_viewMode` on instance not set until `setInstViewMode()` called — guards must check actual DOM visibility
12. Canvas coordinate system: always draw swimlane/history layers INSIDE the `ctx.save()/translate/scale ... ctx.restore()` block
13. Swimlane and History are mutually exclusive — toggling one must turn off the other
14. `startStep` patches `current_step_id` on every step activation (swimlane backfill)

---

## Transcript References

| Session | File |
|---------|------|
| Session 8a (design) | `/mnt/transcripts/2026-03-23-04-17-30-cadencehud-session8-dev.txt` |
| Session 8b (build) | `/mnt/transcripts/2026-03-23-05-56-31-cadencehud-session8-dev.txt` |
| Session 9 | `/mnt/transcripts/2026-03-23-11-44-16-cadencehud-session9-dev.txt` |
| Session 10 | `/mnt/transcripts/2026-03-23-14-12-27-cadencehud-session10-dev.txt` |
| Journal | `/mnt/transcripts/journal.txt` |

*Session 11 transcript will be written at end of session.*

---

*CadenceHUD · ProjectHUD · Confidential · Apex Consulting Group · Session 11 · March 23, 2026*
