# Commission · C-07 · CMD-ACCORD-SETUP-AGENDA-ENHANCED-1

**Phase:** 2 of Wave 2 — Agenda column: enhanced agenda + prep prompt + center tab bar
**Authored:** 2026-05-10
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Spec authority:** Accord Meeting Setup Shell — Requirements Specification v1.1 §5
**Predecessor:** C-06 · CMD-ACCORD-SETUP-BRIEFING-TABS-1 sealed
**Successor:** C-08 · CMD-ACCORD-SETUP-INTELLIGENCE-1
**Coding agent:** execute sequentially; halt-and-surface after §9

---

## §1 — Scope

This CMD has three deliverables:

1. **Substrate sub-amendments** — `workstreams.project_id`, `accord_agenda_items.item_type`, `accord_agenda_items.duration_minutes_estimate`
2. **Center column tab bar** — Agenda / Minute Notes stepper wired (Comments deferred)
3. **Agenda list** — full render replacing "AGENDA · COMING SOON" placeholder: drag-to-reorder, item type pill, time estimate, expand/collapse meta, carried indicator, add item row, prep prompt

**What does NOT ship:**
- Comments tab (deferred — no substrate yet)
- Carried References strip (X-01)
- Prep prompt AI synthesis (X-08) — v1 prep prompt is substrate-derived only
- Click-to-percolate on owner chips (C-11)
- Footer budget bar consumption of `duration_minutes_estimate` (C-13)
- Risks tab project join activation (activates automatically once `workstreams.project_id` is populated)

---

## §2 — IR64 verification (before writing any code)

**V1 — `accord_agenda_items` current columns (confirm `item_type` and `duration_minutes_estimate` absent):**
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'accord_agenda_items'
ORDER BY ordinal_position;
```
Confirm both columns absent. Also confirm `agenda_item_id` PK name and `position` column exists.

**V2 — `workstreams` current columns (confirm `project_id` absent):**
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'workstreams'
ORDER BY ordinal_position;
```
Confirm `project_id` absent. Also note the PK name.

**V3 — `accord_agenda_items` RLS posture:**
```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'accord_agenda_items';
```
Need: confirm UPDATE policy allows PATCH on new columns. If policy uses `WITH CHECK` that restricts columns, new columns must be in scope.

**V4 — Center column tabbody and tabbar selectors:**
```javascript
JSON.stringify({
  tabbar:  document.querySelector('.ac-col-tabbar[data-col="center"]')?.innerHTML?.slice(0,100),
  tabbody: document.querySelector('.ac-col-tabbody[data-col="center"]')?.innerHTML?.slice(0,200)
});
```
Confirm tabbar is empty (ready for tab buttons). Confirm tabbody contains outcomes block + agenda placeholder.

**V5 — `accord_meeting_attendees` join for prep prompt owner lookup:**
Carry-forward from C-04: `accord_meeting_attendees` table exists, `resource_id` FK to `resources`. Owner name lookup uses `resources.id` + `resources.name`. Document as carry-forward.

**V6 — `accord_edges` structure for ref chips:**
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'accord_edges'
ORDER BY ordinal_position;
```
Need: confirm `from_node_id`, `to_node_id`, `edge_type` column names. Ref chips are low-priority in v1 — if edges are complex, defer ref chips to a follow-on and document.

Report V1–V4, V6 in close-out. V5 as carry-forward.

---

## §3 — Substrate sub-amendments

Deploy all three before any UI work. Run in Supabase SQL editor.

```sql
-- Migration: 2026-05-10_agenda_enhanced_substrate.sql
-- C-07 · CMD-ACCORD-SETUP-AGENDA-ENHANCED-1

-- 1. workstreams.project_id — enables Risks tab join
ALTER TABLE workstreams
  ADD COLUMN project_id UUID NULL REFERENCES projects(id) ON DELETE SET NULL;

COMMENT ON COLUMN workstreams.project_id IS
  'FK to projects table. Enables Risk Register scoping by workstream. '
  'C-07 CMD-ACCORD-SETUP-AGENDA-ENHANCED-1. Risks tab activates once populated.';

-- 2. accord_agenda_items.item_type — NRA-shape pill
ALTER TABLE accord_agenda_items
  ADD COLUMN item_type TEXT NULL
  CHECK (item_type IN ('DECIDE','ASSIGN','INFORM','RISK','QUESTION'));

COMMENT ON COLUMN accord_agenda_items.item_type IS
  'NRA shape inference: the kind of outcome this agenda item targets. '
  'NULL = not yet typed. C-07 CMD-ACCORD-SETUP-AGENDA-ENHANCED-1.';

-- 3. accord_agenda_items.duration_minutes_estimate — per-item time estimate
ALTER TABLE accord_agenda_items
  ADD COLUMN duration_minutes_estimate INT NULL;

COMMENT ON COLUMN accord_agenda_items.duration_minutes_estimate IS
  'Operator estimate of time needed for this agenda item (minutes). '
  'Feeds footer budget bar in C-13. NULL = not estimated. C-07.';
```

**Post-migration:**
```sql
SELECT pg_notify('pgrst', 'reload schema');
```

**Verification:**
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name IN ('workstreams','accord_agenda_items')
  AND column_name IN ('project_id','item_type','duration_minutes_estimate')
ORDER BY table_name, column_name;
```
Expected: 3 rows. Halt if any absent.

---

## §4 — `accord-views.js` amendment

No changes needed. Meeting object already has all required fields. Agenda block fetches its own data.

---

## §5 — Center column tab bar

Called from `AccordMeetingSetup.render()` after shell HTML is written, before content:

```javascript
var _centerActiveTab = 'agenda';   // module-level; persists across renders

function _renderCenterTabBar(meeting) {
  var tabbar = document.querySelector('.ac-col-tabbar[data-col="center"]');
  if (!tabbar) return;

  // Center column: Agenda is permanent; Minute Notes activated by filmstrip scrub
  // Comments deferred (no substrate yet)
  var tabs = [
    { id: 'agenda',       label: 'Agenda'       },
    { id: 'minute-notes', label: 'Minute Notes' }
  ];

  // Stepper: < [dot][dot] > anchored right of title area via CSS flex
  tabbar.innerHTML = [
    '<div class="ac-center-tabs">',
      tabs.map(function(t) {
        var active = t.id === _centerActiveTab ? ' ac-tab--active' : '';
        return '<button class="ac-tab' + active + '" data-action="center-tab" ' +
               'data-tab="' + t.id + '">' + t.label + '</button>';
      }).join(''),
    '</div>',
    '<div class="ac-center-stepper">',
      '<button class="ac-stepper-btn" data-action="center-prev">‹</button>',
      tabs.map(function(t) {
        var filled = t.id === _centerActiveTab ? ' ac-stepper-dot--active' : '';
        return '<span class="ac-stepper-dot' + filled + '" data-tab="' + t.id + '"></span>';
      }).join(''),
      '<button class="ac-stepper-btn" data-action="center-next">›</button>',
    '</div>'
  ].join('');

  tabbar.addEventListener('click', function(ev) {
    var action = ev.target.dataset.action ||
                 ev.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    var tabId = null;
    if (action === 'center-tab') {
      tabId = ev.target.closest('[data-action]').dataset.tab;
    } else if (action === 'center-prev' || action === 'center-next') {
      var order = ['agenda','minute-notes'];
      var idx = order.indexOf(_centerActiveTab);
      tabId = action === 'center-prev'
        ? order[Math.max(0, idx - 1)]
        : order[Math.min(order.length - 1, idx + 1)];
    }

    if (!tabId || tabId === _centerActiveTab) return;
    _centerActiveTab = tabId;
    _updateCenterTabBar(tabbar, tabId);
    _activateCenterTab(tabId, meeting);
  });
}

function _updateCenterTabBar(tabbar, activeTab) {
  tabbar.querySelectorAll('.ac-tab').forEach(function(b) {
    b.classList.toggle('ac-tab--active', b.dataset.tab === activeTab);
  });
  tabbar.querySelectorAll('.ac-stepper-dot').forEach(function(d) {
    d.classList.toggle('ac-stepper-dot--active', d.dataset.tab === activeTab);
  });
}

function _activateCenterTab(tab, meeting) {
  var tabbody = document.querySelector('.ac-col-tabbody[data-col="center"]');
  if (!tabbody) return;
  if (tab === 'agenda') {
    // Restore: outcomes block + agenda — both must be visible
    tabbody.querySelectorAll(':scope > *').forEach(function(el) {
      el.style.display = '';
    });
    var overlay = document.getElementById('ac-scrub-overlay');
    if (overlay) overlay.style.display = 'none';
    return;
  }
  if (tab === 'minute-notes') {
    // Minute Notes shows the scrub overlay if a frame is active,
    // otherwise shows a prompt to click a filmstrip frame
    var overlay = document.getElementById('ac-scrub-overlay');
    if (overlay && _scrubState && _scrubState.active) {
      tabbody.querySelectorAll(':scope > *:not(#ac-scrub-overlay)').forEach(function(el) {
        el.style.display = 'none';
      });
      overlay.style.display = '';
    } else {
      var tabbody2 = document.querySelector('.ac-col-tabbody[data-col="center"]');
      if (tabbody2) tabbody2.innerHTML =
        '<div class="ac-minute-notes-prompt">' +
        'Click a filmstrip frame to view prior meeting captures.' +
        '</div>';
    }
    return;
  }
}
```

Note: `_scrubState` is a module-level var from C-05. `_activateCenterTab` references it directly.

---

## §6 — Agenda render

Called from `AccordMeetingSetup.render()` and from `_activateCenterTab('agenda')`:

### §6.1 — Token and entry point

```javascript
var _agendaToken = 0;

function _renderAgendaContent(meeting, workstreamId) {
  var myToken = ++_agendaToken;

  // Target: the ac-col-tabbody center area
  // The outcomes block is already rendered above (C-03)
  // We render into a dedicated agenda container below the outcomes block
  var tabbody = document.querySelector('.ac-col-tabbody[data-col="center"]');
  if (!tabbody) return;

  // Find or create the agenda container (below outcomes block)
  var agendaContainer = document.getElementById('ac-agenda-container');
  if (!agendaContainer) {
    agendaContainer = document.createElement('div');
    agendaContainer.id = 'ac-agenda-container';
    agendaContainer.className = 'ac-agenda-container';
    tabbody.appendChild(agendaContainer);
  }
  agendaContainer.innerHTML = '<div class="ac-agenda-loading">Loading agenda…</div>';

  Promise.all([
    _fetchAgendaItems(meeting.meeting_id),
    _fetchPrepPrompts(meeting, workstreamId)
  ]).then(function(results) {
    if (_agendaToken !== myToken) return;
    if (!agendaContainer.isConnected) return;
    _paintAgenda(agendaContainer, results[0], results[1], meeting, workstreamId);
  }).catch(function(e) {
    console.error('[AccordMeetingSetup] agenda fetch failed', e);
    if (agendaContainer.isConnected)
      agendaContainer.innerHTML = '<div class="ac-agenda-error">Could not load agenda.</div>';
  });
}
```

### §6.2 — Fetch agenda items

```javascript
function _fetchAgendaItems(meetingId) {
  return API.get(
    'accord_agenda_items?meeting_id=eq.' + meetingId +
    '&order=position.asc,created_at.asc' +
    '&select=agenda_item_id,title,position,status,item_type,' +
            'duration_minutes_estimate,pulled_from_node_id,pulled_from_tag'
  ).then(function(rows) { return rows || []; });
}
```

### §6.3 — Fetch prep prompts (substrate-derived, no AI)

Three prompt types derived from substrate:

```javascript
function _fetchPrepPrompts(meeting, workstreamId) {
  if (!workstreamId) return Promise.resolve([]);

  // Fetch attendees + their open dissents + overdue actions
  return Promise.all([
    // Attendees in this meeting
    API.get(
      'accord_meeting_attendees?meeting_id=eq.' + meeting.meeting_id +
      '&select=resource_id,role_in_meeting'
    ),
    // Open dissent nodes in this workstream
    API.get(
      'accord_meetings?workstream_id=eq.' + workstreamId +
      '&state=in.(closed,sealed,running)&select=meeting_id&limit=20'
    ).then(function(mtgs) {
      if (!mtgs || !mtgs.length) return [];
      var ids = mtgs.map(function(m) { return m.meeting_id; }).join(',');
      return API.get(
        'accord_nodes?meeting_id=in.(' + ids + ')' +
        '&tag=eq.dissent' +
        '&select=node_id,summary,dissented_by,seq_id,meeting_id'
      ).then(function(rows) { return rows || []; });
    })
  ]).then(function(results) {
    var attendees = results[0] || [];
    var dissents  = results[1] || [];
    var prompts   = [];

    // Prompt type 1: attendee has an open unresolved dissent in this workstream
    var attendeeIds = attendees.map(function(a) { return a.resource_id; });
    dissents.forEach(function(d) {
      // dissented_by is users.id; attendee resource_id is resources.id
      // Match is approximate in v1 — flag any dissent for awareness
      // C-08 enriches this with full user→resource resolution
      if (d.dissented_by) {
        prompts.push({
          type:   'dissent',
          text:   'Unresolved dissent ' + esc(d.seq_id || 'DS') +
                  ' in workstream. ' + esc((d.summary || '').slice(0, 60)),
          action: 'PULL AS THREAD →',
          nodeId: d.node_id
        });
      }
    });

    return prompts.slice(0, 3);  // max 3 prompts
  }).catch(function() { return []; });
}
```

Note: prep prompt ownership resolution (user→resource) is approximate in v1. C-08 enriches with full resolution. Document in close-out.

### §6.4 — Paint agenda

```javascript
function _paintAgenda(container, items, prompts, meeting, workstreamId) {
  var isIdle = meeting.state === 'idle';
  var html   = '';

  // ── Prep prompt ──────────────────────────────────────
  if (prompts.length && isIdle) {
    html += '<div class="ac-prep-prompt-strip">';
    var p = prompts[0];  // show one at a time
    html += '<div class="ac-prep-prompt" data-prompt-idx="0">';
    html += '<span class="ac-prep-glyph">⚡</span>';
    html += '<span class="ac-prep-text">' + p.text + '</span>';
    html += '<button class="ac-prep-action" data-action="prep-action" ' +
            (p.nodeId ? 'data-node-id="' + esc(p.nodeId) + '"' : '') + '>' +
            esc(p.action) + '</button>';
    html += '<button class="ac-prep-dismiss" data-action="dismiss-prompt" ' +
            'data-prompt-idx="0" title="Dismiss">×</button>';
    html += '</div>';
    if (prompts.length > 1) {
      html += '<div class="ac-prep-more ac-muted">' +
              (prompts.length - 1) + ' more insight' +
              (prompts.length > 2 ? 's' : '') + '</div>';
    }
    html += '</div>';
  }

  // ── Agenda header ────────────────────────────────────
  html += '<div class="ac-agenda-header">';
  html += '<span class="ac-agenda-label">AGENDA</span>';
  var stats = _agendaStats(items);
  if (stats) html += '<span class="ac-agenda-stats ac-muted">' + esc(stats) + '</span>';
  html += '</div>';

  // ── Agenda list ──────────────────────────────────────
  html += '<div class="ac-agenda-list" id="ac-agenda-list">';
  if (!items.length) {
    html += '<div class="ac-agenda-empty ac-muted">No agenda items. Add one below.</div>';
  } else {
    items.forEach(function(item, idx) {
      html += _agendaItemHtml(item, idx, items.length, isIdle);
    });
  }
  html += '</div>';

  // ── Add item row (idle only) ─────────────────────────
  if (isIdle) {
    html += '<div class="ac-agenda-add-row">';
    html += '<input class="ac-agenda-add-input" id="ac-agenda-add-input" ' +
            'type="text" placeholder="Accord will infer the NRA shape…" autocomplete="off">';
    html += '<button class="ac-agenda-add-btn" data-action="add-agenda-item">+</button>';
    html += '</div>';
  }

  container.innerHTML = html;
  _wireAgendaEvents(container, items, meeting, workstreamId);
  _initDragToReorder(container, items, meeting);
}

function _agendaStats(items) {
  if (!items.length) return '';
  var pulled  = items.filter(function(i) { return i.pulled_from_node_id; }).length;
  var timed   = items.filter(function(i) { return i.duration_minutes_estimate; });
  var totalMin = timed.reduce(function(s, i) { return s + i.duration_minutes_estimate; }, 0);
  var parts = [items.length + ' items'];
  if (pulled) parts.push(pulled + ' carried');
  if (totalMin) parts.push(totalMin + 'm est.');
  return parts.join(' · ');
}
```

### §6.5 — Agenda item HTML

```javascript
function _agendaItemHtml(item, idx, total, isIdle) {
  var isCarried  = !!item.pulled_from_node_id;
  var itemCls    = 'ac-agenda-item' + (isCarried ? ' ac-agenda-item--carried' : '');

  var html = '<div class="' + itemCls + '" ' +
             'data-item-id="' + esc(item.agenda_item_id) + '" ' +
             'data-position="' + item.position + '">';

  // Drag handle (idle only)
  if (isIdle) {
    html += '<div class="ac-agenda-handle" draggable="false">⠿</div>';
  }

  // Title (editable inline if idle)
  if (isIdle) {
    html += '<div class="ac-agenda-title ac-agenda-title--editable" ' +
            'contenteditable="true" spellcheck="false">' +
            esc(item.title || '') + '</div>';
  } else {
    html += '<div class="ac-agenda-title">' + esc(item.title || '') + '</div>';
  }

  // Type pill
  if (item.item_type) {
    var typeCls = 'ac-item-type ac-item-type--' + item.item_type.toLowerCase();
    html += '<span class="' + typeCls + '">' + esc(item.item_type) + '</span>';
  } else if (isIdle) {
    html += '<button class="ac-item-type-set" data-action="set-item-type" ' +
            'data-item-id="' + esc(item.agenda_item_id) + '">+ type</button>';
  }

  // Expand toggle
  html += '<button class="ac-agenda-expand" data-action="toggle-item-meta" ' +
          'title="' + (isIdle ? 'Edit / expand' : 'Expand') + '">▸</button>';

  // Meta row (collapsed by default)
  html += '<div class="ac-agenda-meta" id="ac-agenda-meta-' +
          esc(item.agenda_item_id) + '" style="display:none;">';

  // Carried badge
  if (isCarried && item.pulled_from_tag) {
    html += '<span class="ac-agenda-carried-badge ac-agenda-pulled-' +
            esc(item.pulled_from_tag.toLowerCase()) + '">← ' +
            esc(item.pulled_from_tag.toUpperCase()) + '</span>';
  }

  // Time estimate (editable if idle)
  if (isIdle) {
    html += '<span class="ac-agenda-time-label">⏱</span>';
    html += '<input class="ac-agenda-time-input" type="number" min="1" max="120" ' +
            'placeholder="min" value="' +
            esc(item.duration_minutes_estimate ? String(item.duration_minutes_estimate) : '') +
            '" data-item-id="' + esc(item.agenda_item_id) + '">';
  } else if (item.duration_minutes_estimate) {
    html += '<span class="ac-agenda-time-label">⏱ ' +
            item.duration_minutes_estimate + 'm</span>';
  }

  // Delete button (idle only)
  if (isIdle) {
    html += '<button class="ac-agenda-delete" data-action="delete-agenda-item" ' +
            'title="Remove item">×</button>';
  }

  html += '</div>'; // .ac-agenda-meta
  html += '</div>'; // .ac-agenda-item
  return html;
}
```

### §6.6 — Event wiring

```javascript
var _agendaTitleTimers = {};
var _agendaTimeTimers  = {};

function _wireAgendaEvents(container, items, meeting, workstreamId) {
  // Single delegation on container
  container.addEventListener('click', function(ev) {
    var action = ev.target.dataset.action ||
                 ev.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    if (action === 'toggle-item-meta') {
      var item = ev.target.closest('.ac-agenda-item');
      if (!item) return;
      var itemId = item.dataset.itemId;
      var meta   = container.querySelector('#ac-agenda-meta-' + itemId);
      var btn    = ev.target.closest('[data-action="toggle-item-meta"]');
      if (!meta) return;
      var visible = meta.style.display !== 'none';
      meta.style.display = visible ? 'none' : '';
      if (btn) btn.textContent = visible ? '▸' : '▾';
      return;
    }

    if (action === 'add-agenda-item') {
      var input = container.querySelector('#ac-agenda-add-input');
      if (!input) return;
      var title = input.value.trim();
      if (!title) return;
      _addAgendaItem(title, items, meeting, container, workstreamId);
      input.value = '';
      return;
    }

    if (action === 'delete-agenda-item') {
      var row = ev.target.closest('.ac-agenda-item');
      if (!row) return;
      _deleteAgendaItem(row.dataset.itemId, meeting, container, workstreamId);
      return;
    }

    if (action === 'set-item-type') {
      var btn2 = ev.target.closest('[data-action="set-item-type"]');
      if (!btn2) return;
      _showTypePicker(btn2, btn2.dataset.itemId, meeting, container, workstreamId);
      return;
    }

    if (action === 'select-type') {
      var btn3 = ev.target.closest('[data-action="select-type"]');
      if (!btn3) return;
      _setItemType(btn3.dataset.itemId, btn3.dataset.type, meeting, container, workstreamId);
      return;
    }

    if (action === 'dismiss-prompt') {
      var strip = container.querySelector('.ac-prep-prompt-strip');
      if (strip) strip.style.display = 'none';
      return;
    }
  });

  // Enter key on add input
  var addInput = container.querySelector('#ac-agenda-add-input');
  if (addInput && !addInput.dataset.listenerBound) {
    addInput.dataset.listenerBound = '1';
    addInput.addEventListener('keydown', function(ev) {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      var title = addInput.value.trim();
      if (!title) return;
      _addAgendaItem(title, items, meeting, container, workstreamId);
      addInput.value = '';
    });
  }

  // Inline title edit — debounced PATCH
  container.addEventListener('input', function(ev) {
    var titleEl = ev.target.closest('.ac-agenda-title--editable');
    if (titleEl) {
      var row = titleEl.closest('.ac-agenda-item');
      if (!row) return;
      var itemId = row.dataset.itemId;
      if (_agendaTitleTimers[itemId]) clearTimeout(_agendaTitleTimers[itemId]);
      _agendaTitleTimers[itemId] = setTimeout(function() {
        var val = titleEl.textContent.trim();
        if (!val) return;
        API.patch('accord_agenda_items?agenda_item_id=eq.' + itemId, { title: val })
          .catch(function(e) { console.error('[AccordMeetingSetup] title patch failed', e); });
      }, 800);
      return;
    }

    // Time estimate input
    var timeInput = ev.target.closest('.ac-agenda-time-input');
    if (timeInput) {
      var itemId2 = timeInput.dataset.itemId;
      if (_agendaTimeTimers[itemId2]) clearTimeout(_agendaTimeTimers[itemId2]);
      _agendaTimeTimers[itemId2] = setTimeout(function() {
        var val2 = parseInt(timeInput.value, 10);
        API.patch('accord_agenda_items?agenda_item_id=eq.' + itemId2, {
          duration_minutes_estimate: val2 > 0 ? val2 : null
        }).catch(function(e) { console.error('[AccordMeetingSetup] time patch failed', e); });
      }, 800);
    }
  });
}
```

### §6.7 — CRUD operations

```javascript
function _addAgendaItem(title, items, meeting, container, workstreamId) {
  if (container.dataset.submitting === '1') return;
  container.dataset.submitting = '1';
  var nextPos = items.length;
  API.post('accord_agenda_items', {
    firm_id:    meeting.firm_id,
    meeting_id: meeting.meeting_id,
    title:      title,
    position:   nextPos,
    status:     'pending'
  }).then(function() {
    container.dataset.submitting = '';
    _renderAgendaContent(meeting, workstreamId);
  }).catch(function(e) {
    container.dataset.submitting = '';
    console.error('[AccordMeetingSetup] add agenda item failed', e);
  });
}

function _deleteAgendaItem(itemId, meeting, container, workstreamId) {
  API.del('accord_agenda_items?agenda_item_id=eq.' + itemId)
    .then(function() { _renderAgendaContent(meeting, workstreamId); })
    .catch(function(e) { console.error('[AccordMeetingSetup] delete agenda item failed', e); });
}

function _setItemType(itemId, type, meeting, container, workstreamId) {
  API.patch('accord_agenda_items?agenda_item_id=eq.' + itemId, { item_type: type })
    .then(function() { _renderAgendaContent(meeting, workstreamId); })
    .catch(function(e) { console.error('[AccordMeetingSetup] type patch failed', e); });
}

function _showTypePicker(anchor, itemId, meeting, container, workstreamId) {
  // Remove any existing picker
  var existing = container.querySelector('.ac-type-picker');
  if (existing) existing.remove();

  var types = ['DECIDE','ASSIGN','INFORM','RISK','QUESTION'];
  var picker = document.createElement('div');
  picker.className = 'ac-type-picker';
  picker.innerHTML = types.map(function(t) {
    return '<button class="ac-type-option ac-item-type--' + t.toLowerCase() + '" ' +
           'data-action="select-type" data-item-id="' + esc(itemId) + '" ' +
           'data-type="' + t + '">' + t + '</button>';
  }).join('');
  anchor.insertAdjacentElement('afterend', picker);
}
```

### §6.8 — Drag-to-reorder

```javascript
function _initDragToReorder(container, items, meeting) {
  var list = container.querySelector('#ac-agenda-list');
  if (!list) return;

  var _dragSrc = null;

  list.addEventListener('dragstart', function(ev) {
    var handle = ev.target.closest('.ac-agenda-handle');
    var row    = handle && handle.closest('.ac-agenda-item');
    if (!row) { ev.preventDefault(); return; }
    _dragSrc = row;
    row.classList.add('ac-agenda-item--dragging');
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', row.dataset.itemId);
  });

  list.addEventListener('dragover', function(ev) {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    var target = ev.target.closest('.ac-agenda-item');
    if (!target || target === _dragSrc) return;
    list.querySelectorAll('.ac-agenda-item--over').forEach(function(el) {
      el.classList.remove('ac-agenda-item--over');
    });
    target.classList.add('ac-agenda-item--over');
  });

  list.addEventListener('drop', function(ev) {
    ev.preventDefault();
    var target = ev.target.closest('.ac-agenda-item');
    if (!target || !_dragSrc || target === _dragSrc) return;
    var srcId  = _dragSrc.dataset.itemId;
    var tgtId  = target.dataset.itemId;
    var srcPos = parseInt(_dragSrc.dataset.position, 10);
    var tgtPos = parseInt(target.dataset.position, 10);
    // Sequential PATCHes — not Promise.all (shared-state write)
    API.patch('accord_agenda_items?agenda_item_id=eq.' + srcId, { position: tgtPos })
      .then(function() {
        return API.patch('accord_agenda_items?agenda_item_id=eq.' + tgtId, { position: srcPos });
      })
      .then(function() { _renderAgendaContent(meeting, meeting.workstream_id); })
      .catch(function(e) {
        console.error('[AccordMeetingSetup] reorder failed', e);
        _renderAgendaContent(meeting, meeting.workstream_id);
      });
  });

  list.addEventListener('dragend', function() {
    list.querySelectorAll('.ac-agenda-item--dragging, .ac-agenda-item--over')
      .forEach(function(el) {
        el.classList.remove('ac-agenda-item--dragging', 'ac-agenda-item--over');
      });
    _dragSrc = null;
  });

  // Make handles the drag initiators
  list.querySelectorAll('.ac-agenda-handle').forEach(function(h) {
    h.addEventListener('mousedown', function() {
      h.closest('.ac-agenda-item').setAttribute('draggable', 'true');
    });
    h.addEventListener('mouseup', function() {
      h.closest('.ac-agenda-item').setAttribute('draggable', 'false');
    });
  });
}
```

---

## §7 — Teardown additions

```javascript
// In teardown():
Object.keys(_agendaTitleTimers).forEach(function(k) {
  if (_agendaTitleTimers[k]) clearTimeout(_agendaTitleTimers[k]);
});
_agendaTitleTimers = {};
Object.keys(_agendaTimeTimers).forEach(function(k) {
  if (_agendaTimeTimers[k]) clearTimeout(_agendaTimeTimers[k]);
});
_agendaTimeTimers = {};
// _agendaToken auto-invalidates; _centerActiveTab persists intentionally
```

---

## §8 — CSS additions

```css
/* ── Center tabbar ──────────────────────────────────── */
.ac-col-tabbar[data-col="center"] {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px 0 14px;
  border-bottom: 1px solid var(--ac-border-subtle);
}
.ac-center-tabs { display: flex; gap: 2px; }
.ac-center-stepper {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 1px;
}
.ac-stepper-btn {
  font-size: 14px;
  background: none; border: none;
  color: var(--ac-text-tertiary);
  cursor: pointer; padding: 0 3px;
  line-height: 1;
}
.ac-stepper-btn:hover { color: var(--ac-cyan); }
.ac-stepper-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: var(--ac-border-mid);
  cursor: pointer;
}
.ac-stepper-dot--active { background: var(--ac-cyan); }

/* ── Minute notes prompt ────────────────────────────── */
.ac-minute-notes-prompt {
  padding: 24px 18px;
  font-size: 12px;
  color: var(--ac-text-tertiary);
  font-style: italic;
  text-align: center;
}

/* ── Prep prompt ────────────────────────────────────── */
.ac-prep-prompt-strip {
  padding: 0 18px 10px 18px;
}
.ac-prep-prompt {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--ac-amber-dim);
  border: 1px solid rgba(251,191,119,0.3);
  border-radius: 5px;
  padding: 9px 12px;
}
.ac-prep-glyph { font-size: 13px; flex-shrink: 0; }
.ac-prep-text {
  flex: 1;
  font-size: 12px;
  color: var(--ac-amber);
  line-height: 1.4;
}
.ac-prep-action {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-amber);
  background: none; border: none;
  cursor: pointer; padding: 0;
  letter-spacing: 0.8px;
  white-space: nowrap;
  flex-shrink: 0;
}
.ac-prep-action:hover { text-decoration: underline; }
.ac-prep-dismiss {
  font-size: 13px;
  color: var(--ac-text-tertiary);
  background: none; border: none;
  cursor: pointer; padding: 0 2px;
  flex-shrink: 0;
}
.ac-prep-dismiss:hover { color: var(--ac-amber); }
.ac-prep-more {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  margin-top: 4px;
  padding-left: 4px;
}

/* ── Agenda header ──────────────────────────────────── */
.ac-agenda-container { display: flex; flex-direction: column; }
.ac-agenda-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 12px 18px 8px 18px;
}
.ac-agenda-label {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-text-tertiary);
  letter-spacing: 1.4px;
  text-transform: uppercase;
}
.ac-agenda-stats { font-family: var(--ac-font-mono); font-size: 9px; }

/* ── Agenda list ────────────────────────────────────── */
.ac-agenda-list { padding: 0 18px; }
.ac-agenda-empty { font-size: 12px; padding: 8px 0; }

.ac-agenda-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--ac-border-subtle);
  flex-wrap: wrap;
}
.ac-agenda-item:last-child { border-bottom: none; }
.ac-agenda-item--carried { border-left: 3px solid var(--ac-cyan-dim); padding-left: 10px; }
.ac-agenda-item--dragging { opacity: 0.5; }
.ac-agenda-item--over { background: var(--ac-bg-tile); }

.ac-agenda-handle {
  color: var(--ac-text-faint);
  cursor: grab;
  font-size: 13px;
  padding-top: 2px;
  flex-shrink: 0;
  user-select: none;
}
.ac-agenda-handle:active { cursor: grabbing; }

.ac-agenda-title {
  flex: 1;
  font-size: 13px;
  color: var(--ac-text-primary);
  line-height: 1.4;
  min-width: 0;
  outline: none;
}
.ac-agenda-title--editable { cursor: text; }
.ac-agenda-title--editable:focus {
  background: var(--ac-bg-pane);
  border-radius: 3px;
  padding: 1px 4px;
  margin: -1px -4px;
}

/* Type pill */
.ac-item-type {
  font-family: var(--ac-font-mono);
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.8px;
  padding: 2px 7px;
  border-radius: 3px;
  flex-shrink: 0;
  text-transform: uppercase;
}
.ac-item-type--decide   { background: var(--ac-cyan-dim);   color: var(--ac-cyan);   }
.ac-item-type--assign   { background: var(--ac-amber-dim);  color: var(--ac-amber);  }
.ac-item-type--inform   { background: rgba(255,255,255,.06); color: var(--ac-text-tertiary); }
.ac-item-type--risk     { background: var(--ac-rose-dim);   color: var(--ac-rose);   }
.ac-item-type--question { background: var(--ac-violet-dim); color: var(--ac-violet); }

.ac-item-type-set {
  font-family: var(--ac-font-mono);
  font-size: 8px;
  color: var(--ac-text-faint);
  background: none;
  border: 1px dashed var(--ac-border-subtle);
  border-radius: 3px;
  padding: 2px 6px;
  cursor: pointer;
  flex-shrink: 0;
}
.ac-item-type-set:hover { color: var(--ac-cyan); border-color: var(--ac-cyan-dim); }

/* Type picker popover */
.ac-type-picker {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  width: 100%;
  padding: 6px 0 2px 0;
}
.ac-type-option {
  font-family: var(--ac-font-mono);
  font-size: 8px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 3px;
  border: none;
  cursor: pointer;
  letter-spacing: 0.8px;
}

.ac-agenda-expand {
  font-size: 10px;
  color: var(--ac-text-tertiary);
  background: none; border: none;
  cursor: pointer; padding: 2px 4px;
  flex-shrink: 0;
  margin-top: 2px;
}
.ac-agenda-expand:hover { color: var(--ac-text-secondary); }

/* Meta row */
.ac-agenda-meta {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0 2px 0;
  flex-wrap: wrap;
}
.ac-agenda-carried-badge {
  font-family: var(--ac-font-mono);
  font-size: 8.5px;
  padding: 1px 6px;
  border-radius: 3px;
}
.ac-agenda-pulled-decision { color: var(--ac-cyan);   background: var(--ac-cyan-dim);   }
.ac-agenda-pulled-action   { color: var(--ac-amber);  background: var(--ac-amber-dim);  }
.ac-agenda-pulled-dissent  { color: var(--ac-rose);   background: var(--ac-rose-dim);   }
.ac-agenda-pulled-risk     { color: var(--ac-rose);   background: var(--ac-rose-dim);   }

.ac-agenda-time-label { font-family: var(--ac-font-mono); font-size: 10px; color: var(--ac-text-tertiary); }
.ac-agenda-time-input {
  width: 52px;
  font-size: 11px;
  background: var(--ac-bg-tile);
  color: var(--ac-text-primary);
  border: 1px solid var(--ac-border-subtle);
  border-radius: 3px;
  padding: 2px 6px;
  outline: none;
}
.ac-agenda-time-input:focus { border-color: var(--ac-border-active); }

.ac-agenda-delete {
  font-size: 13px;
  color: var(--ac-text-faint);
  background: none; border: none;
  cursor: pointer; padding: 0 2px;
  margin-left: auto;
}
.ac-agenda-delete:hover { color: var(--ac-rose); }

/* Add row */
.ac-agenda-add-row {
  display: flex;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px dashed var(--ac-border-subtle);
}
.ac-agenda-add-input {
  flex: 1;
  font-size: 12px;
  background: transparent;
  color: var(--ac-text-primary);
  border: none;
  outline: none;
  font-style: italic;
}
.ac-agenda-add-input::placeholder { color: var(--ac-text-faint); }
.ac-agenda-add-btn {
  font-size: 16px;
  color: var(--ac-cyan);
  background: none; border: none;
  cursor: pointer; padding: 0 4px;
  line-height: 1;
}
.ac-agenda-add-btn:hover { color: var(--ac-text-primary); }
```

---

## §9 — Smoke tests

| # | Test | Expected |
|---|---|---|
| 1 | Center tab bar renders | Agenda / Minute Notes tabs visible. Stepper dots present. Agenda tab active (cyan underline). |
| 2 | Agenda renders | Items list (or empty state). Stats row shows count. Add item row at bottom. Prep prompt if dissents in workstream. |
| 3 | Add agenda item | Type title → Enter → item appears. `firm_id` on INSERT. Re-fetch confirms persisted. |
| 4 | Item type picker | Click "+ type" → picker appears with 5 type buttons. Click DECIDE → chip renders cyan. PATCH confirmed. |
| 5 | Time estimate | Enter minutes in ⏱ field → 800ms debounce → PATCH fires. Reload → estimate persists. |
| 6 | Inline title edit | Edit title → 800ms debounce → PATCH fires. Reload → updated title persists. |
| 7 | Drag-to-reorder | Drag item by handle to new position. Sequential PATCHes fire. Re-fetch confirms new order. |
| 8 | Minute Notes tab | Click Minute Notes tab → prompt renders ("Click a filmstrip frame…"). Click a filmstrip frame → scrub overlay shows. Switch back to Agenda tab → agenda restored. |
| 9 | Migration — Risks tab activates | Manually populate `workstreams.project_id` for one workstream (Supabase editor). Navigate to Setup shell for a meeting in that workstream → Risks tab shows risk data instead of empty state. |

---

## §10 — Files manifest

| File | Change |
|---|---|
| `workstreams` (Supabase) | `project_id` column added |
| `accord_agenda_items` (Supabase) | `item_type` + `duration_minutes_estimate` columns added |
| `accord-meeting-setup.js` | Center tab bar; agenda render/paint/events/CRUD/drag; prep prompt; teardown additions |
| `accord-meeting-setup.css` | Center tabbar, stepper, prep prompt, agenda list styles |
| `accord-views.js` | No changes |
| `version.js` | Operator-managed (IR65) |

---

## §11 — Discipline checklist

- `var` only
- Token pattern: `_agendaToken` on `_renderAgendaContent`; `isConnected` before paint
- `Promise.all` for agenda + prep prompts — two independent reads; documented as safe
- Sequential PATCHes for drag reorder — not `Promise.all`
- `data-action` on all interactive elements
- Double-submit guard on add item: `container.dataset.submitting`
- Input listener stacking guard: `addInput.dataset.listenerBound` (C-04 lesson)
- `_agendaTitleTimers` and `_agendaTimeTimers` cleared in `teardown()`
- `_centerActiveTab` not reset in teardown — tab persistence intentional
- `firm_id` on INSERT from `meeting.firm_id` — confirmed present in canonical select list
- `status: 'pending'` on INSERT — use value confirmed from C-03 V2 finding (carry-forward)
- Prep prompt ownership resolution approximate in v1 — documented in close-out
- Ref chips deferred if V6 shows complex edge structure — documented in close-out
- `--ac-*` token prefix throughout

---

**Halt-and-surface after §9. Close-out must include: V1–V4 and V6 IR64 findings, migration verification result, prep prompt ownership approximation note, ref chips disposition, smoke test 9 Risks tab activation result.**

**After seal: C-08 · CMD-ACCORD-SETUP-INTELLIGENCE-1 is unblocked.**

---

*End Commission · C-07 · CMD-ACCORD-SETUP-AGENDA-ENHANCED-1.*
