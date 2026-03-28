# Compass — My Notes · Widget Library Architecture
**Date:** March 28, 2026  
**For:** Coding agent — Widget library Phase 1 through Phase 5  
**Prerequisites:** my-notes-handoff.md · my-notes-advanced-handoff.md · Technical Briefing MD  
**Status:** Design complete and locked. Ready to build.

---

## Core Architectural Decision

Widgets are a **rendering mode within a normal tile**, not a special tile type.

A tile always has the same structure: header, canvas area, chat panel. The canvas area renders in one of three modes:

| Mode | What renders | Trigger |
|---|---|---|
| `note` | textarea / contenteditable blocks | Default |
| `entity_card` | linked task, meeting, or action item | Link Entity button |
| `widget` | live data visualization | Add Widget picker |

Switching modes does not change the tile structure. Only what renders inside the canvas changes. This means adding a new widget costs almost nothing architecturally — write the render function, register it, it appears in the picker.

**Never create special tile types for widgets.** Every new widget type as a separate tile type means new DB columns, new state management, new rendering infrastructure. The registry pattern avoids all of that.

---

## The Widget Registry

All widgets are registered at module load time. The registry is the only extension point — the core tile code never changes when a new widget is added.

### Registration shape

```javascript
WIDGET_REGISTRY.register({
  id: 'capacity_gauge',           // unique string, snake_case
  label: 'Capacity gauge',        // display name in picker
  category: 'personal',           // see categories below
  description: 'Today\'s hours — used vs. available',
  icon: 'gauge',                  // icon key for picker display
  configSchema: [                 // fields shown in config UI
    {
      key: 'targetUserId',
      label: 'Person',
      type: 'resource_picker',    // see config field types below
      default: 'self'
    }
  ],
  dataFn: async (config, context) => {
    // fetch from Supabase, return data object
    // context provides: supabase client, current user, firm_id
    // return null on error — widget renders error state
  },
  renderFn: (data, container, config) => {
    // draw the widget into container (a DOM element)
    // use SVG for charts/gauges, plain HTML for text/feeds
    // container is the tile canvas div, already sized
    // must handle null data gracefully (show loading or error state)
  },
  refreshInterval: 60000,         // ms between auto-refresh. 0 = manual only
  minTileHeight: 'small'          // minimum row height for this widget to be useful
});
```

### Config field types

| Type | Renders as | Returns |
|---|---|---|
| `resource_picker` | Searchable dropdown of firm resources | `resource_id` string or `'self'` |
| `project_picker` | Searchable dropdown of active projects | `project_id` string |
| `text` | Text input | string |
| `number` | Number input with min/max | number |
| `select` | Dropdown with defined options | string |
| `boolean` | Toggle | boolean |
| `date_range` | From/to date picker | `{ from, to }` |

### Registry implementation

```javascript
const WIDGET_REGISTRY = (() => {
  const _widgets = {};

  return {
    register(def) {
      if (!def.id || !def.renderFn || !def.dataFn) {
        console.error('[Widgets] Invalid registration:', def.id);
        return;
      }
      _widgets[def.id] = def;
    },

    get(id) {
      return _widgets[id] || null;
    },

    getAll() {
      return Object.values(_widgets);
    },

    getByCategory(category) {
      return Object.values(_widgets).filter(w => w.category === category);
    },

    async render(widgetId, config, container, context) {
      const widget = _widgets[widgetId];
      if (!widget) {
        container.innerHTML = `<div class="widget-error">Unknown widget: ${widgetId}</div>`;
        return;
      }
      try {
        container.innerHTML = '<div class="widget-loading">Loading...</div>';
        const data = await widget.dataFn(config, context);
        container.innerHTML = '';
        widget.renderFn(data, container, config);
      } catch (err) {
        console.error('[Widgets] Render error:', widgetId, err);
        container.innerHTML = '<div class="widget-error">Failed to load</div>';
      }
    }
  };
})();
```

---

## Tile Canvas Rendering Modes

### Workspace state for a widget tile

```json
{
  "row": "row1",
  "slot": 0,
  "noteId": "uuid",
  "canvasMode": "widget",
  "widgetId": "capacity_gauge",
  "widgetConfig": { "targetUserId": "self" }
}
```

For note mode: `"canvasMode": "note"` (or absent — note is default)  
For entity card mode: `"canvasMode": "entity_card"`, `"entityType": "task"`, `"entityId": "uuid"`

### Mode switching

The tile header gains a mode indicator — a small pill showing the current mode (Note / Widget / Card). Clicking it opens a mode switcher dropdown:

```
◉ Note canvas
○ Link entity  →  (opens entity picker)
○ Add widget   →  (opens widget picker)
```

Switching from note to widget does not delete the note content — the note still exists in the DB, the tile just renders the widget instead. Switching back to note mode shows the note content again. Mode is a display preference, not a destructive operation.

### Widget refresh mechanism

Each widget tile that is currently visible in the grid runs its own refresh interval. The interval starts when the tile renders and clears when the tile is closed or minimized.

```javascript
function startWidgetRefresh(tileEl, widgetId, config, context) {
  const widget = WIDGET_REGISTRY.get(widgetId);
  if (!widget || widget.refreshInterval === 0) return;

  const interval = setInterval(() => {
    const canvas = tileEl.querySelector('.tile-canvas');
    if (!canvas) { clearInterval(interval); return; }
    WIDGET_REGISTRY.render(widgetId, config, canvas, context);
  }, widget.refreshInterval);

  tileEl._widgetInterval = interval;
}

function stopWidgetRefresh(tileEl) {
  if (tileEl._widgetInterval) {
    clearInterval(tileEl._widgetInterval);
    delete tileEl._widgetInterval;
  }
}
```

---

## Widget Picker UI

Opens when user selects "Add widget" from the mode switcher. A modal (not fixed position — use the existing modal pattern from My Notes).

### Layout

```
┌─────────────────────────────────────────┐
│  Add widget            [Search...    ]  │
├─────────────────────────────────────────┤
│  Personal              Project          │
│  ┌──────────────┐  ┌──────────────┐    │
│  │ Capacity     │  │ Meeting      │    │
│  │ gauge        │  │ health       │    │
│  └──────────────┘  └──────────────┘    │
│  ┌──────────────┐  ┌──────────────┐    │
│  │ Action item  │  │ Project      │    │
│  │ counter      │  │ health bars  │    │
│  └──────────────┘  └──────────────┘    │
│  Financial          Process            │
│  ...                ...                │
│  Industry                              │
│  ...                                   │
└─────────────────────────────────────────┘
```

Each widget card shows: icon, label, description (one line), category badge.

Clicking a widget card:
1. Closes the picker
2. Opens the config form (if configSchema has fields)
3. Saves `canvasMode: 'widget'`, `widgetId`, `widgetConfig` to tile workspace state
4. Renders the widget immediately

If `configSchema` is empty, skip the config form and render immediately.

### Config form

A simple form generated from `configSchema`. One field per schema entry. "Apply" saves config and renders. "Cancel" returns to picker.

The config form is also accessible after a widget is placed — a gear icon (⚙) appears in the tile header for widget-mode tiles, opening the config form to change settings.

---

## Five Widget Categories

### Category 1 — Personal intelligence
*About you, for you.*

| Widget ID | Label | Data source | Refresh |
|---|---|---|---|
| `capacity_gauge` | Capacity gauge | `workflow_action_items` + calendar blocks | 60s |
| `action_item_counter` | Action item counter | `workflow_action_items` | 60s |
| `contribution_sparkline` | Contribution sparkline | `meeting_ratings` per week | 5min |
| `my_week_summary` | My week summary | `workflow_action_items` + time entries | 5min |

### Category 2 — Project intelligence
*About a project, for the team.*

| Widget ID | Label | Data source | Refresh |
|---|---|---|---|
| `meeting_health_sparkline` | Meeting health | `meeting_ratings` + `v_meetings` | 5min |
| `project_health_bars` | Project health | `meeting_ratings`, `workflow_action_items`, CoC | 5min |
| `ai_sentiment_feed` | AI sentiment | `project_sentiment` table (pre-generated) | 5min |
| `open_items_heatmap` | Open items heatmap | `workflow_action_items` per person per day | 5min |

### Category 3 — Financial intelligence
*About the money, for PMs and leadership.*

| Widget ID | Label | Data source | Refresh |
|---|---|---|---|
| `invoice_feed` | Invoice feed | `invoices` table | 5min |
| `billability_bars` | Billability bars | Time entries per resource | 5min |
| `revenue_dial` | Revenue dial | `invoices` table | 15min |

### Category 4 — Process intelligence
*About workflows in motion.*

| Widget ID | Label | Data source | Refresh |
|---|---|---|---|
| `workflow_status_strip` | Workflow status | `workflow_instances` + CadenceHUD | 30s |
| `onboarding_progress` | Onboarding progress | `workflow_instances` by employee | 60s |
| `approval_chain_tracker` | Approval chain | `coc_events` by entity | 30s |

### Category 5 — Industry intelligence (medical device)
*Regulated environment specific.*

| Widget ID | Label | Data source | Refresh |
|---|---|---|---|
| `capa_counter` | CAPA counter | `capa_records` | 5min |
| `ncmr_disposition` | NCMR disposition | `ncmr_records` | 5min |
| `iqc_pass_rate` | IQC pass rate trend | `iqc_results` | 5min |
| `supplier_status_grid` | Supplier status | `suppliers` | 15min |
| `phase_gate_readiness` | Phase gate readiness | `program_deliverables` | 5min |

---

## Rendering Approach

**Use SVG for all charts, gauges, and data visualizations.**

SVG renders crisply at any tile size, requires no external library for basic shapes, is accessible, and is consistent with the existing mockup approach. The capacity gauge is a few SVG path elements. The sparkline is a few SVG rect elements. Do not reach for Canvas unless you need pixel-level animation or data volumes above 10,000 points — that day is not today.

**Use plain HTML with CSS for text-heavy widgets.**

The AI sentiment feed, the invoice feed, the approval chain tracker — these are structured lists and text blocks. Plain HTML renders faster and is easier to maintain than SVG text elements.

**No external charting libraries for Phase 1-2.**

Writing a sparkline in raw SVG takes twenty lines. Pulling in Chart.js for a sparkline adds 200KB and a dependency to manage. Build the first three widgets in raw SVG. If a future widget genuinely needs Chart.js (a complex multi-series chart, a geographic map), add it then for that specific widget only.

### SVG patterns for the three Phase 1 widgets

**Capacity gauge (semicircular arc):**
```javascript
// Arc from 180° to 0° (left to right, top half)
// usedPct = 0.0 to 1.0
function renderCapacityGauge(data, container) {
  const { used, available, total, overdue } = data;
  const pct = Math.min(used / total, 1);
  const r = 40, cx = 60, cy = 55;
  const startAngle = Math.PI;
  const endAngle = Math.PI + (pct * Math.PI);
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const largeArc = pct > 0.5 ? 1 : 0;
  const color = pct > 0.9 ? '#E24B4A' : pct > 0.7 ? '#BA7517' : '#185FA5';

  container.innerHTML = `
    <svg width="100%" viewBox="0 0 120 70">
      <path d="M${cx-r},${cy} A${r},${r} 0 0,1 ${cx+r},${cy}"
            fill="none" stroke="var(--color-border-tertiary)" stroke-width="8"
            stroke-linecap="round"/>
      <path d="M${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2}"
            fill="none" stroke="${color}" stroke-width="8"
            stroke-linecap="round"/>
      <text x="${cx}" y="${cy-6}" text-anchor="middle"
            font-size="14" font-weight="500"
            fill="var(--color-text-primary)">${available}h</text>
      <text x="${cx}" y="${cy+8}" text-anchor="middle"
            font-size="9" fill="var(--color-text-tertiary)">remaining</text>
    </svg>
    <div class="widget-stat-row">
      <div class="wsr-item"><span class="wsr-val" style="color:#185FA5">${used}h</span><span class="wsr-lbl">used</span></div>
      <div class="wsr-item"><span class="wsr-val" style="color:#BA7517">${total}h</span><span class="wsr-lbl">total</span></div>
      <div class="wsr-item"><span class="wsr-val" style="color:#E24B4A">${overdue}</span><span class="wsr-lbl">overdue</span></div>
    </div>`;
}
```

**Action item counter:**
```javascript
function renderActionItemCounter(data, container) {
  const { total, overdue, dueToday, upcoming } = data;
  const color = overdue > 0 ? '#E24B4A' : dueToday > 0 ? '#BA7517' : '#185FA5';
  container.innerHTML = `
    <div class="widget-counter">
      <div class="wc-big" style="color:${color}">${total}</div>
      <div class="wc-label">action items</div>
      <div class="wc-breakdown">
        <span style="color:#E24B4A">${overdue} overdue</span>
        <span style="color:#BA7517">${dueToday} today</span>
        <span style="color:#185FA5">${upcoming} upcoming</span>
      </div>
    </div>`;
}
```

**Meeting health sparkline:**
```javascript
function renderMeetingHealthSparkline(data, container) {
  const { ratings, avg, trend } = data; // ratings: array of {label, value}
  const maxH = 48;
  const bars = ratings.map((r, i) => {
    const h = Math.round((r.value / 5) * maxH);
    const color = r.value >= 4 ? '#1D9E75' : r.value >= 3 ? '#BA7517' : '#E24B4A';
    const x = i * 18 + 4;
    return `<rect x="${x}" y="${maxH - h + 4}" width="14" height="${h}"
                  rx="2" fill="${color}"/>
            <text x="${x + 7}" y="62" text-anchor="middle"
                  font-size="8" fill="var(--color-text-tertiary)">${r.label}</text>`;
  }).join('');

  const trendColor = trend === 'up' ? '#1D9E75' : trend === 'down' ? '#E24B4A' : '#BA7517';
  container.innerHTML = `
    <svg width="100%" viewBox="0 0 ${ratings.length * 18 + 8} 72">
      ${bars}
    </svg>
    <div class="widget-sparkline-footer">
      avg ${avg.toFixed(1)} / 5
      <span style="color:${trendColor}">${trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} ${trend}</span>
    </div>`;
}
```

---

## Data Functions — Phase 1 Widgets

### Capacity gauge `dataFn`

```javascript
async function capacityGaugeData(config, context) {
  const { supabase, firmId } = context;
  const userId = config.targetUserId === 'self'
    ? context.currentUserId : config.targetUserId;
  const today = new Date().toLocaleDateString('en-CA');

  const { data: items } = await supabase
    .from('workflow_action_items')
    .select('loe_hours, status, due_date')
    .eq('assigned_to_user_id', userId)
    .eq('firm_id', firmId)
    .not('loe_hours', 'is', null);

  const total = 8; // standard work day hours
  const allocated = (items || [])
    .filter(i => i.status !== 'completed')
    .reduce((sum, i) => sum + (i.loe_hours || 0), 0);
  const overdue = (items || [])
    .filter(i => i.status !== 'completed' && i.due_date < today).length;

  return {
    used: Math.min(allocated, total),
    available: Math.max(total - allocated, 0),
    total,
    overdue
  };
}
```

### Action item counter `dataFn`

```javascript
async function actionItemCounterData(config, context) {
  const { supabase, firmId, currentUserId } = context;
  const userId = config.targetUserId === 'self'
    ? currentUserId : config.targetUserId;
  const today = new Date().toLocaleDateString('en-CA');

  const { data: items } = await supabase
    .from('workflow_action_items')
    .select('status, due_date')
    .eq('assigned_to_user_id', userId)
    .eq('firm_id', firmId)
    .neq('status', 'completed');

  const all = items || [];
  return {
    total: all.length,
    overdue: all.filter(i => i.due_date && i.due_date < today).length,
    dueToday: all.filter(i => i.due_date === today).length,
    upcoming: all.filter(i => i.due_date && i.due_date > today).length
  };
}
```

### Meeting health sparkline `dataFn`

```javascript
async function meetingHealthData(config, context) {
  const { supabase, firmId } = context;

  const { data: meetings } = await supabase
    .from('v_meetings')
    .select('id, meeting_date')
    .eq('firm_id', firmId)
    .eq('project_id', config.projectId)
    .order('meeting_date', { ascending: false })
    .limit(7);

  if (!meetings?.length) return { ratings: [], avg: 0, trend: 'stable' };

  const ids = meetings.map(m => m.id);
  const { data: ratings } = await supabase
    .from('meeting_ratings')
    .select('meeting_id, rating')
    .in('meeting_id', ids);

  const ratingMap = {};
  (ratings || []).forEach(r => {
    if (!ratingMap[r.meeting_id]) ratingMap[r.meeting_id] = [];
    ratingMap[r.meeting_id].push(r.rating);
  });

  const result = meetings.reverse().map((m, i) => {
    const mrs = ratingMap[m.id] || [];
    const avg = mrs.length
      ? mrs.reduce((s, r) => s + r, 0) / mrs.length : 0;
    return { label: `M${i + 1}`, value: Math.round(avg * 10) / 10 };
  });

  const values = result.map(r => r.value).filter(v => v > 0);
  const avg = values.length
    ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10
    : 0;
  const trend = values.length >= 2
    ? values[values.length - 1] > values[0] ? 'up'
      : values[values.length - 1] < values[0] ? 'down' : 'stable'
    : 'stable';

  return { ratings: result, avg, trend };
}
```

---

## Widget CSS

Add to the My Notes stylesheet. All widget rendering depends on these classes.

```css
.widget-error {
  display: flex; align-items: center; justify-content: center;
  height: 100%; font-size: 11px; color: var(--color-text-danger);
  font-family: var(--font-sans);
}
.widget-loading {
  display: flex; align-items: center; justify-content: center;
  height: 100%; font-size: 11px; color: var(--color-text-tertiary);
  font-family: var(--font-sans);
}
.widget-stat-row {
  display: flex; gap: 8px; justify-content: center;
  padding: 4px 8px; font-family: var(--font-sans);
}
.wsr-item { display: flex; flex-direction: column; align-items: center; gap: 1px; }
.wsr-val { font-size: 13px; font-weight: 500; line-height: 1; }
.wsr-lbl { font-size: 9px; color: var(--color-text-tertiary); }
.widget-counter {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; height: 100%; gap: 4px;
  font-family: var(--font-sans); padding: 8px;
}
.wc-big { font-size: 32px; font-weight: 500; line-height: 1; }
.wc-label { font-size: 10px; color: var(--color-text-tertiary); }
.wc-breakdown { display: flex; gap: 10px; font-size: 10px; margin-top: 2px; }
.widget-sparkline-footer {
  display: flex; justify-content: center; gap: 8px;
  font-size: 10px; color: var(--color-text-tertiary);
  font-family: var(--font-sans); padding: 2px 0;
}
.tile-header-widget-badge {
  font-size: 9px; padding: 1px 5px; border-radius: 20px;
  background: var(--color-background-info); color: var(--color-text-info);
  flex-shrink: 0;
}
```

---

## Build Order

### Phase 1 — Infrastructure (build before any widget)

1. Widget registry object (`WIDGET_REGISTRY`) — register, get, getAll, getByCategory, render
2. Tile canvas mode field — add `canvasMode`, `widgetId`, `widgetConfig` to tile workspace state
3. Mode switcher — small dropdown in tile header, three options: Note / Link entity / Add widget
4. Widget picker modal — grouped by category, search, widget cards
5. Config form — generated from `configSchema`, gear icon in header for reconfiguration
6. Widget refresh — `startWidgetRefresh` / `stopWidgetRefresh` per tile
7. Widget CSS classes

**Validation:** At the end of Phase 1, register a stub widget (a div that says "hello from capacity gauge") and confirm the full flow works end to end — picker opens, widget selected, config saved, stub renders, refresh fires. Do not proceed to Phase 2 until this is clean.

### Phase 2 — First three widgets

1. `capacity_gauge` — capacity arc dial with stat row
2. `action_item_counter` — large number with breakdown
3. `meeting_health_sparkline` — seven-bar sparkline

These are fully specced above including render functions and data functions. Build each one, test against live data, confirm refresh works at the specified interval.

### Phase 3 — Personal and project intelligence

4. `contribution_sparkline` — eight-week bar chart from `meeting_ratings`
5. `project_health_bars` — five horizontal bars per project
6. `my_week_summary` — five-day capacity strip
7. `open_items_heatmap` — team members vs. days grid
8. `billability_bars` — horizontal bars per resource from time entries
9. `workflow_status_strip` — horizontal step diagram for a CadenceHUD workflow

### Phase 4 — Financial and industry (requires new tables)

Create tables first: `invoices`, `program_deliverables`, `capa_records`, `ncmr_records`, `iqc_results`, `suppliers`. Seed with test data. Then:

10. `invoice_feed` — invoice rows colored by status
11. `revenue_dial` — month revenue vs. target arc
12. `capa_counter` — open CAPAs by severity
13. `ncmr_disposition` — open NCMRs by disposition
14. `iqc_pass_rate` — pass rate trend sparkline
15. `supplier_status_grid` — qualification status indicators
16. `phase_gate_readiness` — function area completeness row

### Phase 5 — AI-generated widgets (requires historical data + daily job)

17. `ai_sentiment_feed` — reads from `project_sentiment` table (pre-generated by 6am job)
18. `onboarding_progress` — arc dial for new hire overall onboarding completion
19. Future: anomaly detector, predictive capacity, cross-program pattern card

---

## Key Constraints

- Widget render functions must handle null data gracefully — show loading state, not a crash
- Widget render functions must be idempotent — calling render twice produces the same result
- Refresh intervals are per-tile, not global. Tiles not visible (minimized, in tray) should not refresh
- Config changes trigger immediate re-render — no page reload required
- The chat panel is always available regardless of canvas mode
- Widget tiles still have a note behind them — switching back to note mode shows it
- Never use `position: fixed` inside a widget render function — the tile canvas is a scrollable container
- Round all numbers before display — no raw floats on screen
- SVG for charts and gauges. HTML for feeds and text-heavy widgets. No Chart.js in Phase 1 or 2

---

## Competitive Position

No tool in the current market has configurable live data widgets embedded in a personal knowledge workspace alongside notes and collaboration, pulling from the same system that manages the actual work.

| Tool | Widgets | Personal workspace | Live data | Same system |
|---|---|---|---|---|
| monday.com | Yes | No — separate dashboards | Yes | Partial |
| Notion | Database views | Yes | No | No |
| Salesforce | Yes | No — management only | Yes | No |
| Power BI / Tableau | Yes | No | Yes | No |
| **Compass** | **Yes** | **Yes** | **Yes** | **Yes** |

The combination does not exist anywhere else. Individual PM configures their own operational dashboard. Live data from the same system managing the work. Notes and collaboration in the same spatial workspace as the widgets. That is the product.

---

## Next-Generation Widgets (future, after 6+ months of data)

Document these as roadmap items. Do not build in Phase 1–4.

| Widget | What it does | Why it needs history |
|---|---|---|
| Predictive capacity | 7-day forward capacity projection based on assigned work and historical velocity | Needs velocity baseline |
| Meeting necessity score | Predicted value of a scheduled meeting based on thread history and purpose similarity | Needs 6+ months of ratings |
| Anomaly detector | Surfaces the single most unusual pattern this week vs. historical baseline | Needs personal baseline |
| Cross-program pattern card | Patterns appearing across multiple active projects simultaneously | Needs multi-project history |
| Team sentiment pulse | Aggregate health indicator across all active projects | Needs project sentiment history |

---

*Compass — Decision intelligence for professional services*  
*Widget library architecture handoff · March 28, 2026*  
*Covers: registry pattern · tile canvas modes · picker UI · five categories · 19 widgets · three fully specced · build order · competitive position*
