# Commission · C-09 · CMD-ACCORD-SETUP-ACTION-KANBAN-1

**Phase:** 4 of Wave 2 — Action Items tab: time-anchored kanban + calendar view
**Authored:** 2026-05-10
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Spec authority:** Accord Meeting Setup Shell — Requirements Specification v1.1 §8
**Predecessor:** C-08 · CMD-ACCORD-SETUP-INTELLIGENCE-1 sealed
**Successor:** C-10 · CMD-ACCORD-SETUP-SLIDESHOW-1
**Coding agent:** execute sequentially; halt-and-surface after §9

---

## §1 — Scope

Wire the right column's Action Items tab (currently showing "coming soon" placeholder). Ships two views toggled by a KANBAN / GRID control.

**Deliverables:**
1. Right column tab bar wired: Attendees / Action Items (Comments deferred — no substrate)
2. Action Items — KANBAN view: time-anchored columns (Past Due / Mon–Fri / Next Week), drag-to-reschedule, slack indicators
3. Action Items — GRID view: week calendar grid, action items as positioned cards
4. Cross-substrate highlight: clicking a card highlights related agenda item + attendee card
5. All 7 smoke tests pass

**What does NOT ship:**
- CPM critical-path spine (Track F prerequisite — noted per spec §8.1)
- Attachments tab (X-01)
- Click-to-percolate full implementation (C-11) — cross-highlight in this CMD is a lightweight precursor
- Inline action item creation (read-only view of existing substrate actions)

---

## §2 — IR64 verification (before writing any code)

**V1 — `accord_nodes` UPDATE RLS for `due_date`:**
```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'accord_nodes';
```
Need: confirm UPDATE policy allows PATCH on `due_date`. If policy is restrictive, drag-to-reschedule may be silently blocked. Halt and surface if UPDATE is not permitted for the current user.

**V2 — Right column tabbar current state:**
```javascript
JSON.stringify({
  tabbar:  document.querySelector('.ac-col-tabbar[data-col="right"]')?.innerHTML?.slice(0,200),
  tabbody: document.querySelector('.ac-col-tabbody[data-col="right"]')?.innerHTML?.slice(0,100)
});
```
Confirm tabbar is empty (no tabs yet wired in right column). C-04 rendered the attendees block directly into the tabbody without a tab bar — this CMD adds the tab bar above it.

**V3 — `accord_nodes` owner column carry-forward:**
`accord_nodes.created_by = auth.users.id` confirmed C-04 V5. Action ownership maps via `resources.user_id`. Document as carry-forward.

**V4 — Current week date boundaries:**
No query needed — computed in JS. Document in close-out how week start is determined (Monday vs Sunday). Use ISO week (Monday start) to match Compass MY CALENDAR pattern.

Report V1–V2 in close-out. V3–V4 as carry-forwards.

---

## §3 — No substrate changes

No migration. `accord_nodes.due_date` exists (confirmed schema inventory). No new columns. No new triggers. `pg_notify` not needed.

---

## §4 — Right column tab bar

The right column currently has no tab bar wired (C-04 rendered directly into tabbody). This CMD adds the tab bar above the attendees block.

```javascript
var _rightActiveTab = 'attendees';  // module-level; persists

function _renderRightTabBar(meeting, workstreamId) {
  var tabbar = document.querySelector('.ac-col-tabbar[data-col="right"]');
  if (!tabbar || tabbar.dataset.wired) return;  // idempotent
  tabbar.dataset.wired = '1';

  var tabs = [
    { id: 'attendees',    label: 'Attendees'    },
    { id: 'action-items', label: 'Action Items' }
  ];

  tabbar.innerHTML = tabs.map(function(t) {
    var active = t.id === _rightActiveTab ? ' ac-tab--active' : '';
    return '<button class="ac-tab' + active + '" data-action="right-tab" ' +
           'data-tab="' + t.id + '">' + t.label + '</button>';
  }).join('');

  tabbar.addEventListener('click', function(ev) {
    var btn = ev.target.closest('[data-action="right-tab"]');
    if (!btn) return;
    var tab = btn.dataset.tab;
    if (tab === _rightActiveTab) return;
    _rightActiveTab = tab;
    tabbar.querySelectorAll('.ac-tab').forEach(function(b) {
      b.classList.toggle('ac-tab--active', b.dataset.tab === tab);
    });
    _activateRightTab(tab, meeting, workstreamId);
  });
}

function _activateRightTab(tab, meeting, workstreamId) {
  var tabbody = document.querySelector('.ac-col-tabbody[data-col="right"]');
  if (!tabbody) return;
  if (tab === 'attendees') {
    _renderAttendees(meeting, workstreamId);
    return;
  }
  if (tab === 'action-items') {
    _renderActionItems(meeting, workstreamId);
    return;
  }
}
```

Call from `render()`:
```javascript
_renderRightTabBar(meeting, workstreamId);
// _renderAttendees already called — tab bar appears above existing content
```

---

## §5 — Action Items fetch

```javascript
var _actionItemsToken = 0;

function _renderActionItems(meeting, workstreamId) {
  var myToken = ++_actionItemsToken;
  var tabbody = document.querySelector('.ac-col-tabbody[data-col="right"]');
  if (!tabbody) return;
  tabbody.innerHTML = '<div class="ac-actions-loading">Loading actions…</div>';

  if (!workstreamId) {
    tabbody.innerHTML = '<div class="ac-actions-empty">No workstream context.</div>';
    return;
  }

  _fetchWorkstreamActions(workstreamId, meeting.meeting_id)
    .then(function(actions) {
      if (_actionItemsToken !== myToken) return;
      if (!tabbody.isConnected) return;
      _resolveActionOwners(actions).then(function(enriched) {
        if (_actionItemsToken !== myToken) return;
        if (!tabbody.isConnected) return;
        _paintActionItems(tabbody, enriched, meeting);
      });
    })
    .catch(function(e) {
      console.error('[AccordMeetingSetup] action items fetch failed', e);
      if (tabbody.isConnected)
        tabbody.innerHTML = '<div class="ac-actions-error">Could not load actions.</div>';
    });
}

function _fetchWorkstreamActions(workstreamId, currentMeetingId) {
  return API.get(
    'accord_meetings?workstream_id=eq.' + workstreamId +
    '&state=in.(closed,sealed,running,idle)' +
    '&select=meeting_id&limit=50'
  ).then(function(meetings) {
    if (!meetings || !meetings.length) return [];
    var ids = meetings.map(function(m) { return m.meeting_id; }).join(',');
    return API.get(
      'accord_nodes?meeting_id=in.(' + ids + ')' +
      '&tag=eq.action' +
      '&select=node_id,summary,seq_id,due_date,created_by,meeting_id,agenda_item_id' +
      '&order=due_date.asc.nullslast,created_at.asc'
    ).then(function(nodes) { return nodes || []; });
  });
}

function _resolveActionOwners(actions) {
  if (!actions.length) return Promise.resolve(actions);
  var userIds = [];
  actions.forEach(function(a) {
    if (a.created_by && userIds.indexOf(a.created_by) === -1)
      userIds.push(a.created_by);
  });
  if (!userIds.length) return Promise.resolve(actions);

  return API.get(
    'resources?user_id=in.(' + userIds.join(',') + ')&select=id,name,user_id'
  ).then(function(resources) {
    var map = {};
    (resources || []).forEach(function(r) { map[r.user_id] = r; });
    actions.forEach(function(a) {
      var r = map[a.created_by];
      a._owner_name      = r ? r.name : null;
      a._owner_resource_id = r ? r.id : null;
    });
    return actions;
  }).catch(function() { return actions; });
}
```

---

## §6 — Kanban view

### §6.1 — Week boundaries

```javascript
function _getWeekBounds() {
  var now    = new Date();
  var day    = now.getDay();                    // 0=Sun … 6=Sat
  var monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));  // ISO week: Mon start
  monday.setHours(0, 0, 0, 0);

  var days = [];
  for (var i = 0; i < 5; i++) {
    var d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }

  var nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);

  return { monday: monday, days: days, nextMonday: nextMonday };
}
```

### §6.2 — Column assignment

```javascript
function _assignColumn(action, bounds) {
  if (!action.due_date) return 'unscheduled';
  var due = new Date(action.due_date);
  due.setHours(0, 0, 0, 0);
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  if (due < today) return 'past-due';

  for (var i = 0; i < bounds.days.length; i++) {
    var d = new Date(bounds.days[i]);
    d.setHours(0, 0, 0, 0);
    if (due.getTime() === d.getTime()) return 'day-' + i;  // 0=Mon … 4=Fri
  }

  if (due >= bounds.nextMonday) return 'next-week';
  return 'unscheduled';
}

function _slackDays(action) {
  if (!action.due_date) return null;
  var due  = new Date(action.due_date).getTime();
  var now  = Date.now();
  return Math.floor((due - now) / 86400000);
}
```

### §6.3 — Paint kanban

```javascript
function _paintActionItems(tabbody, actions, meeting) {
  var bounds = _getWeekBounds();
  var view   = 'kanban';  // default

  function _renderKanban() {
    // Bucket actions
    var buckets = {
      'past-due':    [],
      'day-0': [], 'day-1': [], 'day-2': [], 'day-3': [], 'day-4': [],
      'next-week':   [],
      'unscheduled': []
    };
    actions.forEach(function(a) {
      var col = _assignColumn(a, bounds);
      buckets[col].push(a);
    });

    var DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

    var html = '<div class="ac-actions-toolbar">';
    html += '<div class="ac-view-toggle">';
    html += '<button class="ac-view-btn' + (view === 'kanban' ? ' active' : '') +
            '" data-action="actions-view" data-view="kanban">KANBAN</button>';
    html += '<button class="ac-view-btn' + (view === 'grid' ? ' active' : '') +
            '" data-action="actions-view" data-view="grid">GRID</button>';
    html += '</div>';
    html += '<span class="ac-actions-count ac-muted">' + actions.length + ' actions</span>';
    html += '</div>';

    html += '<div class="ac-kanban-track">';

    // Past Due (always shown, even if empty)
    html += _kanbanCol('PAST DUE', buckets['past-due'], 'past-due', true);

    // Mon–Fri
    for (var i = 0; i < 5; i++) {
      var dayLabel = DAY_NAMES[i] + ' ' + _fmtShort(bounds.days[i]);
      var isToday  = _isSameDay(bounds.days[i], new Date());
      html += _kanbanCol(dayLabel, buckets['day-' + i], 'day-' + i, false, isToday);
    }

    // Next Week
    html += _kanbanCol('NEXT WEEK', buckets['next-week'], 'next-week', false);

    // Unscheduled (only if non-empty)
    if (buckets['unscheduled'].length) {
      html += _kanbanCol('UNSCHEDULED', buckets['unscheduled'], 'unscheduled', false);
    }

    html += '</div>'; // .ac-kanban-track
    tabbody.innerHTML = html;
    _wireActionEvents(tabbody, actions, meeting, bounds, view, _renderKanban, _renderGrid);
    _initKanbanDrag(tabbody, actions, meeting, bounds);
  }

  function _renderGrid() {
    _paintGridView(tabbody, actions, meeting, bounds, _renderKanban, _renderGrid);
  }

  _renderKanban();
}

function _kanbanCol(label, items, colId, isAlert, isToday) {
  var colCls = 'ac-kanban-col';
  if (isAlert && items.length) colCls += ' ac-kanban-col--alert';
  if (isToday) colCls += ' ac-kanban-col--today';

  var html = '<div class="' + colCls + '" data-col-id="' + colId + '">';
  html += '<div class="ac-kanban-col-label">' + esc(label);
  if (items.length) html += ' <span class="ac-kanban-count">' + items.length + '</span>';
  html += '</div>';
  html += '<div class="ac-kanban-cards" data-col-id="' + colId + '">';

  if (!items.length) {
    html += '<div class="ac-kanban-empty">—</div>';
  } else {
    items.forEach(function(a) { html += _actionCardHtml(a); });
  }

  html += '</div>';
  html += '</div>';
  return html;
}

function _actionCardHtml(action) {
  var slack   = _slackDays(action);
  var isPast  = slack !== null && slack < 0;
  var slackCls = isPast ? 'ac-slack--past'
               : slack === null ? ''
               : slack <= 1 ? 'ac-slack--red'
               : slack <= 5 ? 'ac-slack--amber'
               : 'ac-slack--green';

  var html = '<div class="ac-action-card" ' +
             'data-node-id="' + esc(action.node_id) + '" ' +
             'data-agenda-item-id="' + esc(action.agenda_item_id || '') + '" ' +
             'data-resource-id="' + esc(action._owner_resource_id || '') + '" ' +
             'data-action="action-card-click">';

  html += '<div class="ac-action-seq">' + esc(action.seq_id || 'AX') + '</div>';
  html += '<div class="ac-action-summary">' +
          esc((action.summary || '').slice(0, 80)) + '</div>';

  if (action._owner_name) {
    html += '<div class="ac-action-owner">' + esc(action._owner_name) + '</div>';
  }

  if (slack !== null) {
    var slackText = isPast
      ? Math.abs(slack) + 'd overdue'
      : slack === 0 ? 'due today'
      : slack + 'd';
    html += '<div class="ac-action-slack ' + slackCls + '">' + esc(slackText) + '</div>';
  }

  html += '</div>';
  return html;
}
```

### §6.4 — Date helpers

```javascript
function _fmtShort(date) {
  return date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
}

function _isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}
```

---

## §7 — Grid view

```javascript
function _paintGridView(tabbody, actions, meeting, bounds, onKanban, onGrid) {
  var DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  var HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];  // 8am–5pm

  var html = '<div class="ac-actions-toolbar">';
  html += '<div class="ac-view-toggle">';
  html += '<button class="ac-view-btn" data-action="actions-view" data-view="kanban">KANBAN</button>';
  html += '<button class="ac-view-btn active" data-action="actions-view" data-view="grid">GRID</button>';
  html += '</div>';
  html += '<span class="ac-actions-count ac-muted">' + actions.length + ' actions</span>';
  html += '</div>';

  html += '<div class="ac-grid-view">';
  // Day header row
  html += '<div class="ac-grid-header">';
  html += '<div class="ac-grid-time-gutter"></div>';
  DAY_NAMES.forEach(function(name, i) {
    var isToday = _isSameDay(bounds.days[i], new Date());
    html += '<div class="ac-grid-day-header' + (isToday ? ' ac-grid-day-header--today' : '') + '">';
    html += esc(name) + ' ' + esc(_fmtShort(bounds.days[i]));
    html += '</div>';
  });
  html += '</div>';

  // Hour rows
  html += '<div class="ac-grid-body">';
  HOURS.forEach(function(h) {
    html += '<div class="ac-grid-row">';
    html += '<div class="ac-grid-time">' + h + ':00</div>';
    DAY_NAMES.forEach(function(name, i) {
      // Place actions with due_date matching this day
      var dayActions = actions.filter(function(a) {
        return a.due_date && _isSameDay(new Date(a.due_date), bounds.days[i]);
      });
      html += '<div class="ac-grid-cell" ' +
              'data-day-idx="' + i + '" data-hour="' + h + '">';
      // In grid view, show all day's actions in the first hour slot (8am)
      if (h === 8) {
        dayActions.forEach(function(a) {
          html += '<div class="ac-grid-action-card" ' +
                  'data-node-id="' + esc(a.node_id) + '" ' +
                  'data-agenda-item-id="' + esc(a.agenda_item_id || '') + '" ' +
                  'data-resource-id="' + esc(a._owner_resource_id || '') + '" ' +
                  'data-action="action-card-click">' +
                  esc(a.seq_id || 'AX') + ' · ' +
                  esc((a.summary || '').slice(0, 40)) +
                  '</div>';
        });
      }
      html += '</div>';
    });
    html += '</div>';
  });
  html += '</div>'; // .ac-grid-body
  html += '</div>'; // .ac-grid-view

  tabbody.innerHTML = html;
  _wireActionEvents(tabbody, actions, meeting, bounds, 'grid', onKanban, onGrid);
}
```

---

## §8 — Event wiring

```javascript
function _wireActionEvents(tabbody, actions, meeting, bounds, currentView, onKanban, onGrid) {
  tabbody.addEventListener('click', function(ev) {
    var action = ev.target.dataset.action ||
                 ev.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    if (action === 'actions-view') {
      var btn  = ev.target.closest('[data-action="actions-view"]');
      var view = btn && btn.dataset.view;
      if (view === 'kanban' && currentView !== 'kanban') { onKanban(); return; }
      if (view === 'grid'   && currentView !== 'grid')   { onGrid();   return; }
      return;
    }

    if (action === 'action-card-click') {
      var card = ev.target.closest('[data-action="action-card-click"]');
      if (!card) return;
      _onActionCardClick(card, meeting);
      return;
    }
  });
}
```

### §8.1 — Action card click (cross-substrate highlight)

```javascript
function _onActionCardClick(card, meeting) {
  var agendaItemId = card.dataset.agendaItemId;
  var resourceId   = card.dataset.resourceId;

  // Highlight related agenda item in center column
  if (agendaItemId) {
    document.querySelectorAll('.ac-agenda-item').forEach(function(el) {
      el.classList.remove('ac-highlight-pulse');
    });
    var agendaRow = document.querySelector(
      '.ac-agenda-item[data-item-id="' + agendaItemId + '"]'
    );
    if (agendaRow) {
      agendaRow.classList.add('ac-highlight-pulse');
      agendaRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      setTimeout(function() { agendaRow.classList.remove('ac-highlight-pulse'); }, 2000);
    }
  }

  // Pulse related attendee card in right column
  if (resourceId) {
    document.querySelectorAll('.ac-attendee-card').forEach(function(el) {
      el.classList.remove('ac-highlight-pulse');
    });
    var attCard = document.querySelector(
      '.ac-attendee-card[data-resource-id="' + resourceId + '"]'
    );
    if (attCard) {
      attCard.classList.add('ac-highlight-pulse');
      setTimeout(function() { attCard.classList.remove('ac-highlight-pulse'); }, 2000);
    }
  }
}
```

---

## §9 — Drag-to-reschedule (kanban)

Horizontal drag between kanban columns. On drop, PATCH `due_date` on the action node.

```javascript
function _initKanbanDrag(tabbody, actions, meeting, bounds) {
  var _dragAction = null;

  tabbody.addEventListener('dragstart', function(ev) {
    var card = ev.target.closest('.ac-action-card');
    if (!card) { ev.preventDefault(); return; }
    _dragAction = card.dataset.nodeId;
    card.classList.add('ac-card-dragging');
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', _dragAction);
  });

  tabbody.addEventListener('dragover', function(ev) {
    var col = ev.target.closest('.ac-kanban-cards');
    if (!col) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    tabbody.querySelectorAll('.ac-kanban-cards--drag-over').forEach(function(el) {
      el.classList.remove('ac-kanban-cards--drag-over');
    });
    col.classList.add('ac-kanban-cards--drag-over');
  });

  tabbody.addEventListener('drop', function(ev) {
    ev.preventDefault();
    var col = ev.target.closest('.ac-kanban-cards');
    if (!col || !_dragAction) return;
    var colId = col.dataset.colId;
    var newDueDate = _colIdToDate(colId, bounds);

    tabbody.querySelectorAll('.ac-kanban-cards--drag-over').forEach(function(el) {
      el.classList.remove('ac-kanban-cards--drag-over');
    });

    // PATCH due_date on accord_nodes
    var patchBody = { due_date: newDueDate };  // null for unscheduled
    API.patch('accord_nodes?node_id=eq.' + _dragAction, patchBody)
      .then(function() {
        // Update local action object and re-render
        var a = actions.find(function(x) { return x.node_id === _dragAction; });
        if (a) a.due_date = newDueDate;
        _paintActionItems(
          document.querySelector('.ac-col-tabbody[data-col="right"]'),
          actions,
          meeting
        );
      })
      .catch(function(e) {
        console.error('[AccordMeetingSetup] due_date patch failed', e);
      });
    _dragAction = null;
  });

  tabbody.addEventListener('dragend', function() {
    tabbody.querySelectorAll('.ac-card-dragging, .ac-kanban-cards--drag-over')
      .forEach(function(el) {
        el.classList.remove('ac-card-dragging', 'ac-kanban-cards--drag-over');
      });
    _dragAction = null;
  });

  // Make cards draggable
  tabbody.querySelectorAll('.ac-action-card').forEach(function(card) {
    card.setAttribute('draggable', 'true');
  });
}

function _colIdToDate(colId, bounds) {
  if (colId === 'past-due' || colId === 'unscheduled') return null;
  if (colId === 'next-week') {
    var d = new Date(bounds.nextMonday);
    return d.toISOString().slice(0, 10);
  }
  var dayIdx = parseInt(colId.replace('day-', ''), 10);
  if (isNaN(dayIdx)) return null;
  var d2 = new Date(bounds.days[dayIdx]);
  return d2.toISOString().slice(0, 10);
}
```

---

## §10 — Teardown additions

```javascript
// In teardown():
// _actionItemsToken auto-invalidates
// _rightActiveTab persists intentionally (tab persistence)
// No timers added in this CMD
```

---

## §11 — CSS additions

```css
/* ── Action Items toolbar ───────────────────────────── */
.ac-actions-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px 8px 14px;
  flex-shrink: 0;
}
.ac-view-toggle {
  display: flex;
  background: var(--ac-bg-pane);
  border: 1px solid var(--ac-border-subtle);
  border-radius: 5px;
  padding: 2px;
  gap: 2px;
}
.ac-view-btn {
  font-family: var(--ac-font-mono);
  font-size: 8.5px;
  letter-spacing: 1px;
  color: var(--ac-text-tertiary);
  background: none; border: none;
  padding: 4px 10px;
  cursor: pointer;
  border-radius: 3px;
}
.ac-view-btn.active {
  background: var(--ac-cyan-dim);
  color: var(--ac-cyan);
}
.ac-actions-count { font-family: var(--ac-font-mono); font-size: 9px; }

/* ── Kanban track ───────────────────────────────────── */
.ac-kanban-track {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 0 14px 12px 14px;
  flex: 1;
  align-items: flex-start;
  scrollbar-width: thin;
  scrollbar-color: var(--ac-border-mid) transparent;
}
.ac-kanban-col {
  flex: 0 0 150px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ac-kanban-col--alert .ac-kanban-col-label { color: var(--ac-rose); }
.ac-kanban-col--today .ac-kanban-col-label { color: var(--ac-cyan); }

.ac-kanban-col-label {
  font-family: var(--ac-font-mono);
  font-size: 8.5px;
  color: var(--ac-text-tertiary);
  letter-spacing: 1px;
  text-transform: uppercase;
  padding: 2px 0 4px 0;
  border-bottom: 1px solid var(--ac-border-subtle);
  display: flex;
  align-items: center;
  gap: 5px;
}
.ac-kanban-count {
  background: var(--ac-bg-tile);
  color: var(--ac-text-secondary);
  border-radius: 8px;
  padding: 0 5px;
  font-size: 8px;
}
.ac-kanban-cards { display: flex; flex-direction: column; gap: 5px; min-height: 40px; }
.ac-kanban-cards--drag-over { background: var(--ac-bg-tile); border-radius: 4px; }
.ac-kanban-empty { font-size: 10px; color: var(--ac-text-faint); padding: 6px 0; }

/* ── Action card ────────────────────────────────────── */
.ac-action-card {
  background: var(--ac-bg-tile);
  border: 1px solid var(--ac-border-subtle);
  border-radius: 5px;
  padding: 7px 9px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 3px;
  transition: border-color .15s;
}
.ac-action-card:hover { border-color: var(--ac-border-mid); }
.ac-action-card.ac-card-dragging { opacity: 0.5; }
.ac-action-seq {
  font-family: var(--ac-font-mono);
  font-size: 8.5px;
  color: var(--ac-amber);
  font-weight: 600;
}
.ac-action-summary { font-size: 11.5px; color: var(--ac-text-primary); line-height: 1.3; }
.ac-action-owner   { font-size: 10px; color: var(--ac-text-tertiary); }
.ac-action-slack   { font-family: var(--ac-font-mono); font-size: 9px; }
.ac-slack--red     { color: var(--ac-rose); }
.ac-slack--amber   { color: var(--ac-amber); }
.ac-slack--green   { color: var(--ac-green); }
.ac-slack--past    { color: var(--ac-rose); font-weight: 600; }

/* ── Grid view ──────────────────────────────────────── */
.ac-grid-view {
  display: flex;
  flex-direction: column;
  overflow: auto;
  flex: 1;
  padding: 0 14px;
}
.ac-grid-header {
  display: grid;
  grid-template-columns: 36px repeat(5, 1fr);
  border-bottom: 1px solid var(--ac-border-subtle);
  position: sticky;
  top: 0;
  background: var(--ac-bg-pane);
  z-index: 2;
}
.ac-grid-time-gutter { }
.ac-grid-day-header {
  font-family: var(--ac-font-mono);
  font-size: 8.5px;
  color: var(--ac-text-tertiary);
  padding: 6px 4px;
  text-align: center;
}
.ac-grid-day-header--today { color: var(--ac-cyan); }
.ac-grid-body { display: flex; flex-direction: column; }
.ac-grid-row {
  display: grid;
  grid-template-columns: 36px repeat(5, 1fr);
  border-bottom: 1px solid var(--ac-border-subtle);
  min-height: 44px;
}
.ac-grid-time {
  font-family: var(--ac-font-mono);
  font-size: 8px;
  color: var(--ac-text-faint);
  padding: 4px 4px 0 0;
  text-align: right;
}
.ac-grid-cell { padding: 3px; }
.ac-grid-action-card {
  background: var(--ac-amber-dim);
  border: 1px solid rgba(251,191,119,0.2);
  border-radius: 3px;
  padding: 3px 5px;
  font-size: 9.5px;
  color: var(--ac-amber);
  cursor: pointer;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ac-grid-action-card:hover { border-color: var(--ac-amber); }

/* ── Cross-substrate highlight pulse ────────────────── */
@keyframes ac-highlight-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(251,191,119,0.6); }
  50%  { box-shadow: 0 0 0 6px rgba(251,191,119,0); }
  100% { box-shadow: 0 0 0 0 rgba(251,191,119,0); }
}
.ac-highlight-pulse {
  animation: ac-highlight-pulse 0.6s ease-out 2;
  border-color: var(--ac-amber) !important;
}
```

---

## §12 — Smoke tests

| # | Test | Expected |
|---|---|---|
| 1 | Right column tab bar | Attendees / Action Items tabs visible. Attendees active by default. Click Action Items → kanban renders. Click Attendees → roster returns. |
| 2 | Kanban — Past Due column | Actions with `due_date < today` appear in Past Due. Slack badge shows "Xd overdue" in rose. |
| 3 | Kanban — week columns | Actions with `due_date` matching Mon–Fri current week appear in correct column. Today's column label is cyan. |
| 4 | Kanban — Next Week | Actions with `due_date >= next Monday` appear in Next Week column. |
| 5 | GRID view toggle | Click GRID → week grid renders with day headers. Actions placed in correct day column. Click KANBAN → returns to kanban. |
| 6 | Drag to reschedule | Drag a card from Past Due to a day column. PATCH fires. Card appears in new column. Verify in Supabase: `SELECT due_date FROM accord_nodes WHERE node_id = '<id>'` → new date. |
| 7 | Cross-substrate highlight | Click an action card → related agenda item in center column pulses amber (if `agenda_item_id` match). Related attendee card in right column pulses (if owner match). 2-second pulse. |

---

## §13 — Files manifest

| File | Change |
|---|---|
| `accord-meeting-setup.js` | Right column tab bar; `_renderActionItems()`; kanban/grid paint; drag; event wiring; cross-highlight |
| `accord-meeting-setup.css` | Kanban, grid, action card, cross-highlight styles |
| `accord-views.js` | No changes |
| `version.js` | Operator-managed (IR65) |

---

## §14 — Discipline checklist

- `var` only
- Token pattern: `_actionItemsToken`; `isConnected` before paint
- Sequential fetches: meetings → action nodes (second depends on first)
- `_resolveActionOwners`: independent read after action fetch — `Promise.all` not applicable here (resolveOwners depends on action results); plain `.then()` chain
- `data-action` on all interactive elements; `data-node-id`, `data-agenda-item-id`, `data-resource-id` on every card
- `_rightActiveTab` not reset in teardown — tab persistence intentional
- CPM critical-path spine absent — documented in close-out as Track F prerequisite
- ISO week (Monday start) used for week boundaries — documented in close-out
- `due_date` PATCH sends ISO date string (`YYYY-MM-DD`) not full timestamp
- V1 finding (UPDATE RLS) must confirm PATCH on `accord_nodes.due_date` is permitted before coding drag — halt if not
- `--ac-*` token prefix throughout

---

**Halt-and-surface after §12. Close-out must include: V1 UPDATE RLS finding, ISO week-start confirmation, CPM spine deferral noted, drag PATCH date format verified.**

**After seal: C-10 · CMD-ACCORD-SETUP-SLIDESHOW-1 is unblocked.**

---

*End Commission · C-09 · CMD-ACCORD-SETUP-ACTION-KANBAN-1.*
