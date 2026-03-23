# Rework History Layer
## Architecture Document — CadenceHUD Session 11
**Apex Consulting Group · ProjectHUD · Confidential**
*March 23, 2026*

---

## 1. Purpose & Strategic Rationale

The Rework History Layer is the second visual layer on the DAG canvas — distinct from
the Multi-Instance Swimlane (current position) that was completed in Session 10. Where
the Swimlane answers "where are things right now?", the Rework History Layer answers
"where does this process consistently break down?"

Each DAG node gains a heat indicator showing accumulated rejection pressure across all
instances of the same template — not just the current instance. A step with zero
rejections looks normal. A step with 44 rejections across three instances is visibly
on fire. A PM launching a new instance can see — before a single rejection occurs —
which step historically causes the most trouble. That is predictive intelligence, not
reactive reporting.

### The Insight This Session's Data Revealed

The diagnostic data from Session 10 produced an important finding that the History Layer
will surface automatically for every instance:

Checklist: Design Review shows 9 resets across 3 instances — but 8 of those 9 were
caused by the template routing Approval rejections and Finalize declines all the way back
to step 1. The step itself is clean. Vision Cart Review proved this with a first-pass
completion. The problem is the routing logic, not the step instructions.

This distinction — "step failing on its own merits" vs "step reset by upstream problems"
— is exactly what the History Layer must classify and surface. It changes the recommended
action entirely.

---

## 2. UI Design

### 2.1 Heat Badges on Nodes

Each DAG node gains a heat badge anchored to its bottom-center edge — distinct from
the top-right position of the Swimlane dot cluster. The badge shows:

- A ↩ arrow + total rework count across all instances
- Color scaled to heat level: gray (0), muted blue (1-2), amber (3-9), red (10+)
- A ▲ bottleneck flag on the highest-heat node when it exceeds 2× the template average

Heat levels:
- Cold (0): no badge rendered
- Low (1-3): muted blue-gray badge, thin border
- Moderate (4-9): amber badge
- High (10+): red badge, thicker border
- Bottleneck: red badge + ▲ flag, node border turns red

### 2.2 Node Border Heat

The node border color shifts with heat intensity:
- Default: var(--border) — neutral dark
- Moderate: 1px amber border
- High: 2px red border — visually dominant, impossible to miss

### 2.3 Hover Tooltip

Hovering a heat badge opens a breakdown tooltip showing:
- Step name + total count in the header
- One row per instance: instance name, proportional bar, rejection count
- Reset cause classification: "Own failures" vs "Reset by upstream"
- A "↩ History" sub-header when the dominant cause is upstream reset

### 2.4 History Toggle Button

A ↩ History button sits in the instance header bar alongside ◉ Swimlane. The two
are independent layers — both can be active simultaneously. When History is active,
the Swimlane overlay zone (bottom panel) shows the heat zone with one card per step.

### 2.5 Heat Zone (Bottom Panel)

When History is active, the REPLAY zone is replaced by the Heat Zone — same size,
same position as the Swimlane overlay. One card per step with rework data:
- Step name
- Total rejection count (large, color-coded)
- Proportional bar showing this step's share of total template rework
- Per-instance breakdown
- Reset cause classification

Clicking a card opens the step's full rework history in a modal with the chronological
event log, rejection notes, and pattern classification.

---

## 3. Reset Cause Classification

The most important analytical distinction the History Layer must make:

### Type A — Own Failure
The step was completed with a requiresReset outcome (rejected, declined). The step
itself is the source of the rework. Fix: improve step instructions, clarify requirements,
or add a pre-submission checklist.

### Type B — Upstream Reset
The step was reset by a downstream rejection cascading back. The step completed
correctly — it was reset by routing logic. Fix: change the template routing (does
Approval rejection really need to reset all the way to step 1?) or accept the reset
as intentional.

The classification is computed from the CoC:
- step_reset events with notes containing "Reset by X on Y" → Type B
- step_completed events with requiresReset outcomes → Type A

This classification appears in both the hover tooltip and the heat zone card.

---

## 4. Technical Architecture

### 4.1 Data Source

All rework data is already in `_stepInsts` for the selected instance. For sibling
instances, the same lazy-load pattern from _swLoadSiblingData applies — CoC loaded
on demand when History is activated.

The aggregation function:

```javascript
function _buildReworkHeatMap(inst) {
  const templateId = inst.template_id;
  const allInsts   = _instances.filter(i =>
    i.template_id === templateId &&
    (i.status === 'in_progress' || i.status === 'complete')
  );

  const heatMap = {}; // stepId → { total, byInstance, typeA, typeB }

  allInsts.forEach(i => {
    (i._stepInsts || []).forEach(e => {
      const sid = e.template_step_id;
      if (!sid) return;
      if (!heatMap[sid]) heatMap[sid] = { total:0, byInstance:{}, typeA:0, typeB:0 };

      if (e.event_type === 'step_reset') {
        heatMap[sid].total++;
        heatMap[sid].byInstance[i.id] = (heatMap[sid].byInstance[i.id]||0) + 1;
        // Classify: reset by upstream = Type B
        const note = (e.event_notes||'').toLowerCase();
        if (note.includes('reset by')) heatMap[sid].typeB++;
        else heatMap[sid].typeA++;
      }

      if (e.event_type === 'step_completed' && e.outcome) {
        const stepDef = (inst._tmplSteps||[]).find(s=>s.id===sid);
        const oDef    = stepDef ? _getOutcomes(stepDef).find(o=>o.id===e.outcome) : null;
        if (oDef?.requiresReset) {
          heatMap[sid].total++;
          heatMap[sid].byInstance[i.id] = (heatMap[sid].byInstance[i.id]||0) + 1;
          heatMap[sid].typeA++;
        }
      }
    });
  });

  return heatMap;
}
```

### 4.2 Heat Level Classification

```javascript
function _heatLevel(count) {
  if (count === 0)  return 'cold';
  if (count <= 3)   return 'low';
  if (count <= 9)   return 'moderate';
  return 'high';
}

const HEAT_COLORS = {
  cold:     null,
  low:      { badge:'#2a5080', border:'#1a3a5a', text:'#6a9abf' },
  moderate: { badge:'#854F0B', border:'#BA7517', text:'#EF9F27' },
  high:     { badge:'#A32D2D', border:'#E24B4A', text:'#ff5f6b' },
};
```

### 4.3 Canvas Draw Pass

The heat layer draws after the swimlane layer in renderInstanceDAG, before
ctx.restore():

```javascript
if (_historyActive) {
  const heatMap = _buildReworkHeatMap(inst);
  const maxHeat = Math.max(...Object.values(heatMap).map(h=>h.total), 1);

  steps.forEach((s, i) => {
    const heat = heatMap[s.id];
    if (!heat || heat.total === 0) return;
    const level = _heatLevel(heat.total);
    const cols  = HEAT_COLORS[level];
    const p     = nodePos(s.id);

    // Node border color override
    // (handled in node draw pass — _historyActive check)

    // Heat badge — bottom-center of node
    const label  = `↩ ${heat.total}×`;
    const bw     = 42, bh = 16;
    const bx     = p.x + NW/2 - bw/2;
    const by     = p.y + NH + 4;

    ctx.save();
    ctx.fillStyle   = cols.badge + '33'; // 20% opacity fill
    ctx.strokeStyle = cols.border;
    ctx.lineWidth   = heat.total >= 10 ? 1.5 : 1;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 4);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle    = cols.text;
    ctx.font         = 'bold 8px sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + bw/2, by + bh/2);

    // Bottleneck flag
    if (heat.total === maxHeat && heat.total >= 10) {
      ctx.fillStyle = '#ff5f6b';
      ctx.font      = 'bold 8px sans-serif';
      ctx.fillText('▲', bx + bw - 6, by + 5);
    }

    ctx.restore();

    // Store hit region for hover
    _historyClusters.push({
      stepId: s.id, heat,
      x: bx, y: by, w: bw, h: bh,
    });
  });
}
```

### 4.4 State Variables

```javascript
let _historyActive   = false;
let _historyClusters = []; // hit regions for current frame
```

### 4.5 Toggle Wiring

```javascript
function _toggleHistory() {
  const inst = _selectedInstance;
  if (!inst || inst._viewMode !== 'diagram') return;
  _historyActive = !_historyActive;
  // Load sibling data if not already loaded
  if (_historyActive) _swLoadSiblingData(inst);
  // Update button appearance
  const btn = document.getElementById('hx-toggle-btn');
  if (btn) {
    btn.style.background = _historyActive ? '#ff5f6b' : 'transparent';
    btn.style.color      = _historyActive ? '#fff'    : 'var(--muted)';
  }
  // Show/hide heat zone overlay
  const panel = document.getElementById('hx-info-panel');
  if (panel) {
    panel.style.display = _historyActive ? 'flex' : 'none';
    if (_historyActive) _hxPopulatePanel(inst);
  }
  renderInstanceDAG(inst);
}
```

---

## 5. Competitive Analysis

| Capability | Jira | Monday | Asana | MS Project | CadenceHUD |
|---|---|---|---|---|---|
| Rejection count per step | ✗ | ✗ | ✗ | ✗ | ✓ |
| Heat map across instances | ✗ | ✗ | ✗ | ✗ | ✓ |
| Own failure vs upstream reset | ✗ | ✗ | ✗ | ✗ | ✓ |
| Bottleneck auto-flag | ✗ | ✗ | ✗ | ✗ | ✓ |
| Per-instance breakdown | ✗ | ✗ | ✗ | ✗ | ✓ |
| Hover tooltip with notes | ✗ | ✗ | ✗ | ✗ | ✓ |

The distinction between "own failure" and "upstream reset" has no equivalent in any
PM tool. It is the difference between a diagnostic that points at the step and one
that points at the routing logic — two completely different remediation paths.

---

## 6. Implementation Sequence

| Step | Task |
|------|------|
| 1 | Add _historyActive state + HEAT_COLORS constants |
| 2 | Build _buildReworkHeatMap() aggregation function |
| 3 | Build _heatLevel() classifier |
| 4 | Add ↩ History toggle button to instance header |
| 5 | Add heat layer draw pass to renderInstanceDAG (after swimlane pass) |
| 6 | Add mousemove hit-test for heat badge hover → tooltip |
| 7 | Build _hxShowTooltip() with breakdown + cause classification |
| 8 | Add hx-info-panel HTML to REPLAY zone (alongside sw-info-panel) |
| 9 | Build _hxPopulatePanel() — heat zone cards |
| 10 | Test with Design Review Signoff — verify 44× on Approval, 9× on Checklist |

---

*CadenceHUD · ProjectHUD · Confidential*
*Apex Consulting Group · Session 11 · March 23, 2026*
