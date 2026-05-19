# HANDOFF — CMD-ACCORD-KNOWLEDGE-BASE-1 · Phase 4: Flat Filter Views

**Date:** 2026-05-19
**CMD:** K-01 · CMD-ACCORD-KNOWLEDGE-BASE-1
**Operator:** Vaughn Staples
**Phase:** 4 of 5 — Filter pills wired. Flat list views for Decisions, Actions, Risks.

---

## §0 — PRE-FLIGHT

Read `Brief_CMD-ACCORD-KNOWLEDGE-BASE-1.md` end-to-end before proceeding.
Session protocol: terse mode; Test Mode after each code update.
Iron Rules 36, 40 §1, 47, 64, 71 apply.
`var` only. No `setTimeout` for sequencing. Deliver §6 then §7. Stop.

---

## §1 — CARRY-FORWARD

**Phase 3 confirmed:**
- All nodes currently ungrouped (discipline/topic NULL) — expected, future CMD writes them
- Full node payload loaded: seq_id, tag, summary, discipline, topic, created_by,
  created_at, meeting_id, due_date, status, body
- `meetingTitleMap` built from meetings array
- Author resolution: confirm approach used (resources.user_id or truncated ID)
- Collapse state in `_discCollapsed` / `_topicCollapsed` objects

**Node data available for filters:**
- `node.tag` — decision / action / risk / dissent / note / question
- `node.status` — fresh / committed
- `node.due_date` — nullable ISO date string
- `node.body` — JSON string for action items: `{ assignee_name, assignee_resource_id }`
- `node.seq_id` — e.g. DC-018, AX-011, RK-005

---

## §2 — INPUTS

| File | Purpose |
|------|---------|
| `accord-knowledge-base.js` | Phase 3 output — extend with filter views |

---

## §3 — DELIVERABLES

1. `accord-knowledge-base.js` — filter pills wired, flat views built

Operator review checkpoint before Phase 5.

---

## §4 — BUILD SPEC

### 4.1 — Filter pill wiring

Make pills clickable. Replace `cursor:default` with `cursor:pointer` on
`.ac-kb-pill`. Add click handlers via event delegation on `.ac-kb-pills`:

```javascript
pillsEl.addEventListener('click', function(e) {
  var pill = e.target.closest('.ac-kb-pill');
  if (!pill) return;
  var type = pill.dataset.pill;
  _setFilter(type);
});
```

`_setFilter(type)`:
1. Update active pill class
2. Re-render canvas with correct view

```javascript
var _activeFilter = 'all';  // module-level state

function _setFilter(type) {
  _activeFilter = type;
  // Update pill active states
  document.querySelectorAll('.ac-kb-pill').forEach(function(p) {
    p.classList.toggle('active', p.dataset.pill === type);
  });
  // Re-render canvas
  var canvas = document.querySelector('.ac-kb-canvas');
  if (!canvas) return;
  if (type === 'all') {
    _renderHierarchy(canvas);
  } else if (type === 'notes') {
    _renderHierarchy(canvas, 'note');  // hierarchy filtered to notes only
  } else {
    _renderFlatView(canvas, type);
  }
}
```

---

### 4.2 — Notes filter

Notes uses the existing hierarchy view filtered to `tag === 'note'` nodes only.
Pass an optional `tagFilter` param to `_renderHierarchy(canvas, tagFilter)`.
When `tagFilter` is set, only include nodes matching that tag in the discipline
→ topic grouping. Empty discipline blocks (no matching nodes) are omitted.

---

### 4.3 — Decisions flat view

`_renderFlatView(canvas, 'decisions')`:

Group into two sections: **Active** and **With Dissent**.

```javascript
// Active: tag === 'decision' AND no dissent node with same meeting_id+agenda_item_id
// With dissent: any meeting that has both a decision AND a dissent node
// Simple approach: decisions with a dissent sibling in same meeting
```

Simpler approach for v1: group by `node.status`:
- **Active**: `tag === 'decision'` (all decisions — no status distinction for decisions)
- Show all decisions in one group labeled "Recorded"

Each row:
```
[DC-018 badge]  [summary text]                [author · date]
                [meeting chip]  [status label if any]
```

Badge: purple (`--dcn`)

No × delete. No edit. Read-only.

Section header CSS:
```css
.ac-kb-flat-sec {
  font-size: 11px; font-weight: 700; letter-spacing: .10em;
  text-transform: uppercase; color: var(--lo);
  padding: 14px 0 6px;
  display: flex; align-items: center; gap: 10px;
}
.ac-kb-flat-sec::after {
  content: ''; flex: 1; height: 1px; background: var(--b0);
}
```

Flat entry CSS:
```css
.ac-kb-flat-list { display: flex; flex-direction: column; gap: 6px; }
.ac-kb-flat-entry {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 10px 14px;
  background: var(--raised); border: 1px solid var(--b0);
  border-left: 3px solid var(--b2);
  border-radius: 6px; transition: border-color .12s;
}
.ac-kb-flat-entry:hover { border-color: var(--b1); }
/* Color left border per type */
.ac-kb-flat-entry--dc { border-left-color: var(--dcn); }
.ac-kb-flat-entry--ax { border-left-color: var(--act); }
.ac-kb-flat-entry--rk { border-left-color: var(--rsk); }
.ac-kb-flat-body { flex: 1; min-width: 0; }
.ac-kb-flat-text { font-size: 13px; color: var(--hi); line-height: 1.5; }
.ac-kb-flat-meta {
  display: flex; align-items: center; gap: 10px;
  flex-wrap: wrap; margin-top: 5px;
}
.ac-kb-flat-author { font-size: 11px; color: var(--lo); }
.ac-kb-flat-date   { font-size: 11px; color: var(--lo); }
.ac-kb-flat-mtg {
  font-size: 11px; color: var(--lo);
  padding: 1px 7px; border-radius: 10px;
  background: rgba(255,255,255,.04); border: 1px solid var(--b0);
}
.ac-kb-flat-status { font-size: 11px; font-weight: 600; }
.ac-kb-flat-status--open   { color: var(--act); }
.ac-kb-flat-status--done   { color: var(--nt); }
.ac-kb-flat-status--over   { color: var(--rsk); }
```

---

### 4.4 — Action Items flat view

`_renderFlatView(canvas, 'actions')`:

Group into three sections: **Overdue** · **Open** · **Closed**

```javascript
var today = new Date(); today.setHours(0,0,0,0);
var overdue = [], open = [], closed = [];

actions.forEach(function(n) {
  if (n.status === 'committed') {
    closed.push(n);
  } else if (n.due_date && new Date(n.due_date) < today) {
    overdue.push(n);
  } else {
    open.push(n);
  }
});
```

Each row — richer than decisions:
```
[AX-011 badge]  [summary]                [assignee chip]  [due date]  [status chip]
                [meeting chip]
```

Parse assignee from `node.body`:
```javascript
var body = {};
try { body = JSON.parse(n.body || '{}'); } catch(e) {}
var assignee = body.assignee_name || '—';
```

Due date color: red if overdue, amber if open with date, dim if no date.
Status chip: Overdue (red) · Open (amber) · Done (green).

---

### 4.5 — Risks flat view

`_renderFlatView(canvas, 'risks')`:

Group into two sections: **Open** · **Mitigated**

```javascript
var open = [], mitigated = [];
risks.forEach(function(n) {
  if (n.status === 'committed') {
    mitigated.push(n);
  } else {
    open.push(n);
  }
});
```

Each row:
```
[RK/DS badge]  [summary]         [severity chip]  [author]
               [meeting chip]
```

Parse severity from `node.body`:
```javascript
var body = {};
try { body = JSON.parse(n.body || '{}'); } catch(e) {}
var severity = body.severity || null;
```

Severity chip colors: Low (amber) · Medium (amber) · High (red). Omit if null.

DS badge same red as RK.

---

### 4.6 — "All meetings ▾" dropdown (v1 — display only)

Keep non-functional this phase. Phase 5 can wire it if time permits,
or defer to a future CMD. The dropdown renders but click does nothing.

---

### 4.7 — Empty state

If a filter view has no matching nodes:
```html
<div class="ac-kb-placeholder">No [decisions / action items / risks] recorded yet.</div>
```

---

## §5 — IRON RULE REMINDERS

**IR71:** Filter state is client-side only — no server round-trip on pill click.
Re-render from already-loaded `_nodes` array. Do not re-query Supabase.

**`var` only** — no `let`/`const`.

---

## §6 — FILE ORDER

1. `accord-knowledge-base.js` — full file with filter views added

Then: operator review note.
Then: §7 checklist verbatim. Stop.

---

## §7 — PHASE 4 CHECKLIST

- [ ] Filter pills are now clickable (cursor:pointer)
- [ ] Clicking All: returns to hierarchy view
- [ ] Clicking Notes: hierarchy view filtered to note nodes only
- [ ] Clicking Decisions: flat list renders, all decisions shown
- [ ] Decision entries: purple badge · summary · author · date · meeting chip
- [ ] Decision entries have colored left border
- [ ] Clicking Action Items: flat list with Overdue / Open / Closed groups
- [ ] Action entries: amber badge · summary · assignee · due date · status chip
- [ ] Overdue calculation correct (due_date < today AND status != committed)
- [ ] Assignee parsed from body JSON (or '—' if absent)
- [ ] Clicking Risks: flat list with Open / Mitigated groups
- [ ] Risk entries: red badge · summary · severity chip · author · meeting chip
- [ ] Severity parsed from body JSON (omitted if null)
- [ ] DS nodes appear in Risks view with DS badge
- [ ] Empty state renders when no nodes match filter
- [ ] Active pill highlight correct per type
- [ ] Re-render uses loaded _nodes array — no new Supabase queries on pill click
- [ ] All meetings dropdown renders but non-functional
- [ ] Phase 2/3 header, stats, status bar unchanged
- [ ] `var` only — no `let`/`const`

---

**Ship it.**
