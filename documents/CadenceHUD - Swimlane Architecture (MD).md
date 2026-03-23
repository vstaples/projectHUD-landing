# Multi-Instance Swimlane
## Architecture Document — CadenceHUD Session 10
**Apex Consulting Group · ProjectHUD · Confidential**
*March 23, 2026*

---

## 1. Purpose & Strategic Rationale

The Multi-Instance Swimlane adds a portfolio intelligence layer directly onto the DAG
canvas. Today, the diagram shows one instance at a time. The Swimlane reveals what every
other active instance of the same template is doing — simultaneously, on the same canvas
— without leaving the workflow view.

Each DAG node gains a dot cluster in its top-right corner. Each dot represents one active
instance currently at that step, color-coded by health. Hovering the cluster reveals a
popup list of those instances. Dwelling on any entry for 1.5 seconds opens the full
Intelligence Briefing for that instance — the same modal triggered by the ◎ Briefing
button, with all sections intact.

The Swimlane is the first PM feature that lets a manager see where every instance of a
process stands simultaneously, understand their relative health, and drill into any one of
them without leaving the portfolio view.

---

## 2. UI Design

### 2.1 Dot Clusters

Each DAG node gains a dot cluster badge in its top-right corner. Dots are 9px circles,
color-coded by instance health:

- Amber — active, progressing normally
- Red — rejected or blocked at this step
- Green — just completed this step (trailing indicator)
- Gray — suspended or stalled

Clusters show up to 5 dots before collapsing to a count badge. The cluster has a subtle
background panel with a thin border, sitting above the node at z-index 20.

### 2.2 Hover Popup

Hovering a dot cluster opens a popup list immediately (no delay). The popup shows:

- Step name and instance count in the header
- One row per instance: health dot, instance name, elapsed time, rework count, priority pill
- A 2px amber progress bar crawls across the bottom of each row on hover over 1.5 seconds

The popup persists when the cursor moves from the cluster into the popup (mouseenter/leave
bridge with 250ms hide delay).

### 2.3 Dwell → Intelligence Briefing

After 1.5 seconds of hovering any row, the full Intelligence Briefing modal opens for
that instance. This is the exact same modal as the ◎ Briefing button — same layout,
same sections, same collapsible AI Narrative, same stat tiles, workflow timeline, action
items, notes & comments, and remaining steps. The dwell timer cancels cleanly if the
cursor leaves the row before 1.5 seconds.

### 2.4 Swimlane Toggle — Option D

A `◉ Swimlane` pill button lives in the instance header bar, to the right of the
LIST / DIAGRAM toggle. It is grayed out in List mode (self-documenting — the layer only
applies to the diagram). In Diagram mode, clicking it illuminates the dot clusters.
When active, the pill fills amber like the active DIAGRAM button. State persists per
session in a local variable `_swimlaneActive`.

### 2.5 Bottleneck Banner

When more than 40% of active sibling instances cluster at the same step, a bottleneck
banner fires above the DAG canvas:

"Bottleneck detected — N of M instances clustered at [Step]. Median dwell: Xh ·
Current avg: Yh"

The threshold and median are computed from `_stepInsts` CoC data already in memory.

### 2.6 Click to Filter

Clicking a dot cluster (rather than hovering) filters the instances panel to show only
instances with `current_step_id` matching that node. A filter bar appears above the DAG
with a clear button. Clicking the same cluster again clears the filter.

---

## 3. Technical Architecture

### 3.1 Data Source

All instances of the same template are already loaded in `_instances`. The Swimlane
needs no new DB calls for the cluster display — it reads from memory:

```javascript
const siblings = _instances.filter(i =>
  i.template_id === inst.template_id &&
  i.id          !== inst.id &&
  i.status      === 'in_progress'
);
```

The active step per sibling is read from `current_step_id` — a new column on
`workflow_instances` populated by the routing engine on every step activation.

### 3.2 DB Migration

```sql
ALTER TABLE workflow_instances
  ADD COLUMN IF NOT EXISTS current_step_id   UUID,
  ADD COLUMN IF NOT EXISTS current_step_name TEXT,
  ADD COLUMN IF NOT EXISTS current_step_type TEXT;
```

Updated in `_notifyStepActivated` every time a step activates — already the correct
location since it fires on every transition. No additional API calls needed at render time.

### 3.3 Rendering

Dot clusters are rendered as absolute-positioned HTML divs overlaid on the DAG node
divs — not drawn on the canvas. This keeps them interactive (hover, click) without
requiring canvas hit-testing.

Each cluster is rendered in `renderInstanceStep` after the node div is created:

```javascript
function _renderSwimlaneCluster(stepId, stepEl) {
  if (!_swimlaneActive) return;
  const inst     = _selectedInstance;
  const siblings = _instances.filter(i =>
    i.template_id === inst.template_id &&
    i.id          !== inst.id &&
    i.status      === 'in_progress' &&
    i.current_step_id === stepId
  );
  if (!siblings.length) return;
  // Build dot cluster div and append to stepEl
}
```

### 3.4 Health Classification

```javascript
function _instanceHealth(inst) {
  if (inst.status === 'suspended') return 'gray';
  const coc = inst._stepInsts || [];
  const last = coc[coc.length - 1];
  if (!last) return 'amber';
  if (last.event_type === 'step_completed') {
    const step = (inst._tmplSteps||[]).find(s=>s.id===last.template_step_id);
    const out  = step ? _getOutcomes(step).find(o=>o.id===last.outcome) : null;
    if (out?.requiresReset) return 'red';
    return 'green';
  }
  if (last.event_type === 'step_activated') return 'amber';
  return 'gray';
}
```

### 3.5 Dwell Timer Implementation

```javascript
const _dwellTimers = {};
const DWELL_MS = 1600;

function _startDwell(row, instId) {
  row.classList.add('sw-dwelling');
  const bar = row.querySelector('.sw-dbar');
  bar.style.transition = 'none'; bar.style.width = '0%';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    bar.style.transition = `width ${DWELL_MS/1000}s linear`;
    bar.style.width = '100%';
  }));
  _dwellTimers[instId] = setTimeout(() => showIntelBriefing(instId), DWELL_MS);
}

function _cancelDwell(row, instId) {
  row.classList.remove('sw-dwelling');
  const bar = row.querySelector('.sw-dbar');
  bar.style.transition = 'none'; bar.style.width = '0%';
  clearTimeout(_dwellTimers[instId]);
}
```

### 3.6 Swimlane Toggle Wiring

Added to the instance header render alongside the LIST/DIAGRAM toggle:

```javascript
<button id="sw-toggle-btn" onclick="_toggleSwimlane()"
  style="...same pill style as LIST/DIAGRAM...
    background:${_swimlaneActive?'var(--cad)':'transparent'};
    color:${_swimlaneActive?'var(--bg0)':'var(--muted)'};
    opacity:${viewMode==='diagram'?'1':'0.35'};
    pointer-events:${viewMode==='diagram'?'auto':'none'}">
  ◉ Swimlane
</button>

function _toggleSwimlane() {
  if (_instViewMode !== 'diagram') return;
  _swimlaneActive = !_swimlaneActive;
  renderInstanceDetail(_selectedInstance?.id);
}
```

---

## 4. Competitive Analysis

### 4.1 Current Landscape

Every major PM tool shows a board. Boards show where things are. The Swimlane shows
where things are relative to each other, relative to the process, and relative to history
— simultaneously.

| Capability | Jira | Monday | Asana | Smartsheet | MS Project | CadenceHUD |
|---|---|---|---|---|---|---|
| See all instances of a process template | Board (manual) | Board | Board | Sheet | Gantt only | ✓ DAG canvas |
| See which step each instance is at | Status column | Status | Status field | Column | % complete | ✓ Node position |
| Compare multiple instances simultaneously | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ Dot clusters |
| Health signal per instance per step | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ Color-coded |
| Bottleneck auto-detection | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Dwell to open full briefing | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Click step to filter instances | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Rework count per step across portfolio | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |

### 4.2 Why the Gap Is Structural

The board view in Monday, Jira, and Asana shows all items in a column — but the column
is a status value, not a step in a structured workflow. They have no concept of a workflow
template that multiple instances share. They cannot show that 7 of 12 active Design Review
Signoffs are stuck at the Approval step — because they do not know those 12 items are
instances of the same process.

This is architectural. CadenceHUD's template + instances model enables portfolio views
that are impossible for task-list tools. The competitors would need to rebuild their data
models to close this gap. That is a 2-3 year project, not a feature sprint.

---

## 5. Next-Generation Capabilities

**1. Bottleneck Detection — Automatic**
When more than a threshold percentage of active instances cluster at the same step, the
system flags it with elapsed time comparison against historical median. The Intelligence
Briefing for any of those instances gains portfolio context.

**2. Wave Analysis**
When the same template runs repeatedly on a schedule, the Swimlane reveals the wave
pattern. All instances cascade through steps on similar timelines. The system predicts
when a downstream step will be hit by the next wave and pre-alerts the assignee.

**3. Cross-Instance Confidence Heatmap**
Once Step Comments are live across multiple instances, the Swimlane displays confidence
signal aggregation per step — not just instance count but health distribution. The node
becomes a mini heatmap: 2 green, 3 yellow, 2 red. The PM sees portfolio distress at a
glance.

**4. Resource Saturation View**
When a single resource appears as active assignee across multiple instances at the same
step, the dot shows the resource's avatar initials instead of a generic dot. The PM sees
immediately that one person is blocking 5 workflows.

**5. Comparative Elapsed Time**
Each dot encodes not just health but velocity. A dot that has been at a step for 3× the
historical median renders in deeper red. Color encodes time-at-step relative to baseline,
not just current status.

**6. The Template Performance Score**
Aggregating across all instances of a template over time, the Swimlane data feeds a
template-level score: average rework rate per step, average elapsed time, bottleneck
step, variance. This score appears in the Template Editor — informing whether the
template is working as designed or needs structural revision. No PM tool has ever
automatically evaluated its own process templates against execution reality.

---

## 6. The Strategic Point

A board column labeled "In Review" tells you 12 items are in review.

The Swimlane tells you 12 instances are at the Approval step, 9 of them have been there
longer than the historical median, 2 resources are each blocking 4 instances
simultaneously, and this step has a 340% higher rework rate than any other step in
the template.

That is the difference between a status board and an intelligence system.

---

## 7. Implementation Sequence

| Step | Task |
|------|------|
| 1 | SQL migration — add current_step_id, current_step_name, current_step_type to workflow_instances |
| 2 | Wire _notifyStepActivated to update current_step_id on every transition |
| 3 | Add ◉ Swimlane toggle pill to instance header (Option D) |
| 4 | Build _renderSwimlaneCluster() — dot cluster HTML overlay on each DAG node |
| 5 | Build _instanceHealth() — classify each sibling as amber/red/green/gray |
| 6 | Build hover popup with instance list and dwell progress bar |
| 7 | Wire dwell timer → showIntelBriefing(instId) at 1.5s |
| 8 | Build bottleneck detection and banner |
| 9 | Wire click-to-filter on clusters |
| 10 | Test with 3+ simultaneous instances of Design Review Signoff template |

---

*CadenceHUD · ProjectHUD · Confidential*
*Apex Consulting Group · Session 10 · March 23, 2026*
