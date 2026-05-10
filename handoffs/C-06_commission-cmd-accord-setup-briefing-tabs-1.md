# Commission · C-06 · CMD-ACCORD-SETUP-BRIEFING-TABS-1

**Phase:** 1 of Wave 2 — Left column tabs: Briefing / Decisions / Risks
**Authored:** 2026-05-10
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Spec authority:** Accord Meeting Setup Shell — Requirements Specification v1.1 §4
**Predecessor:** C-05 · CMD-ACCORD-SETUP-FILMSTRIP-2 sealed (Wave 1 complete)
**Successor:** C-07 · CMD-ACCORD-SETUP-AGENDA-ENHANCED-1
**Coding agent:** execute sequentially; halt-and-surface after §9

---

## §0 — Wave 2 discipline additions (apply from this CMD forward)

The following patterns are now standard across all Wave 2 CMDs. No exceptions.

**Token pattern replaces boolean abort flags:**
```javascript
var _xyzToken = 0;
function _renderXyz(...) {
  var myToken = ++_xyzToken;
  // ...
  fetchSomething().then(function(data) {
    if (_xyzToken !== myToken) return;  // stale render
    if (!container.isConnected) return; // detached element
    _paintXyz(container, data);
  });
}
```

**`data-action` on every interactive element** — no id-only delegation targets.

**Legacy functions deleted, not renamed** — replaced logic is removed entirely.

**`firm_id` on every INSERT** sourced from `meeting.firm_id` — always verify present.

---

## §1 — Scope

Wire the left column's `.ac-col-tabbody[data-col="left"]` placeholder with three tabs: Briefing, Decisions, Risks. Also wire the `.ac-col-tabbar[data-col="left"]` with the tab switcher UI.

**Deliverables:**
1. Tab bar rendered in `.ac-col-tabbar[data-col="left"]` — Briefing / Decisions / Risks
2. Briefing tab: synthesis block, last meeting block, prior actions summary, prior decisions block, annotations block
3. Decisions tab: full workstream decision list with state badges and filters
4. Risks tab: Risk Register scoped to workstream project (read-only display)
5. All 8 smoke tests pass

**What does NOT ship:**
- Auto-rotation / slideshow tabs (C-10)
- Action Items kanban inline expand (C-09)
- CPM surface in Risks tab (Track F prerequisite)
- Click-to-percolate from decision rows (C-11)
- NRA badge wiring on decision rows (C-08 scope — intelligence layer)
- Briefing AI synthesis (X-08)

---

## §2 — IR64 verification (before writing any code)

**V1 — `risk_register` table structure:**
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'risk_register'
ORDER BY ordinal_position;
```
Need: PK name, project_id FK name, score/weight column name(s), description column, status column, owner column. Do not assume.

**V2 — `risk_register` RLS posture:**
```sql
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'risk_register';
```
Confirm firm-wide readable. If not, surface before proceeding.

**V3 — `accord_belief_adjustments` join path to workstream decisions:**
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'accord_belief_adjustments'
ORDER BY ordinal_position;
```
Need: confirm `target_node_id` FK to `accord_nodes` and that `declared_by` is `users.id`.

**V4 — Left column tabbar/tabbody selectors in live DOM:**
```javascript
JSON.stringify({
  tabbar:  document.querySelector('.ac-col-tabbar[data-col="left"]')?.className,
  tabbody: document.querySelector('.ac-col-tabbody[data-col="left"]')?.className,
  tbHTML:  document.querySelector('.ac-col-tabbar[data-col="left"]')?.innerHTML?.slice(0,100)
});
```
Confirm both selectors resolve and tabbar is currently empty (ready to receive tab buttons).

**V5 — `accord_nodes` NRA state (carry-forward):**
`accord_nras_current` view exists and is queryable. Carry-forward from CMD-ACCORD-NRA-SURFACE-1. Document as carry-forward — no re-query needed.

**V6 — `projects` table join from `workstreams`:**
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'workstreams'
  AND column_name ILIKE '%project%';
```
Need: whether `workstreams` has a `project_id` FK to `projects`. Required for scoping risk register to workstream.

Report V1–V4, V6 in close-out. V5 as carry-forward.

---

## §3 — No substrate changes

No migration. No new columns. No new triggers. All queries use existing tables. No `pg_notify` needed.

---

## §4 — Tab bar render

Called from `AccordMeetingSetup.render()` before column content:

```javascript
var _leftActiveTab = 'briefing';   // module-level; persists across re-renders

function _renderLeftTabBar(meeting) {
  var tabbar = document.querySelector('.ac-col-tabbar[data-col="left"]');
  if (!tabbar) return;

  var tabs = [
    { id: 'briefing',   label: 'Briefing'   },
    { id: 'decisions',  label: 'Decisions'  },
    { id: 'risks',      label: 'Risks'      }
  ];

  tabbar.innerHTML = tabs.map(function(t) {
    var active = t.id === _leftActiveTab ? ' ac-tab--active' : '';
    return '<button class="ac-tab' + active + '" data-action="left-tab" ' +
           'data-tab="' + t.id + '">' + t.label + '</button>';
  }).join('');

  tabbar.addEventListener('click', function(ev) {
    var btn = ev.target.closest('[data-action="left-tab"]');
    if (!btn) return;
    var tab = btn.dataset.tab;
    if (tab === _leftActiveTab) return;
    _leftActiveTab = tab;
    _activateLeftTab(tab, meeting);
    tabbar.querySelectorAll('.ac-tab').forEach(function(b) {
      b.classList.toggle('ac-tab--active', b.dataset.tab === tab);
    });
  });
}
```

Called from `render()` immediately after shell HTML is written, before content renders.

---

## §5 — Tab activation and content dispatch

```javascript
function _activateLeftTab(tab, meeting) {
  var tabbody = document.querySelector('.ac-col-tabbody[data-col="left"]');
  if (!tabbody) return;
  tabbody.innerHTML = '<div class="ac-tab-loading">Loading…</div>';

  if (tab === 'briefing')  { _renderBriefingTab(tabbody, meeting);  return; }
  if (tab === 'decisions') { _renderDecisionsTab(tabbody, meeting); return; }
  if (tab === 'risks')     { _renderRisksTab(tabbody, meeting);     return; }
}
```

Called from `render()` after tab bar is wired:
```javascript
_renderLeftTabBar(meeting);
_activateLeftTab(_leftActiveTab, meeting);
```

---

## §6 — Briefing tab

### §6.1 — Token and entry point

```javascript
var _briefingToken = 0;

function _renderBriefingTab(tabbody, meeting) {
  var myToken = ++_briefingToken;

  if (!meeting.workstream_id) {
    tabbody.innerHTML = '<div class="ac-briefing-wrap">' +
      '<div class="ac-briefing-empty">No workstream — standalone meeting.</div>' +
      '</div>';
    return;
  }

  // Parallel fetches — all independent reads
  Promise.all([
    _fetchPriorMeetingBrief(meeting.meeting_id, meeting.workstream_id),
    _fetchPriorActionsSummary(meeting.meeting_id, meeting.workstream_id),
    _fetchPriorDecisions(meeting.workstream_id),
    _fetchAnnotations(meeting.workstream_id)
  ]).then(function(results) {
    if (_briefingToken !== myToken) return;
    if (!tabbody.isConnected) return;
    _paintBriefingTab(tabbody, meeting, results[0], results[1], results[2], results[3]);
  }).catch(function(e) {
    console.error('[AccordMeetingSetup] briefing fetch failed', e);
    if (tabbody.isConnected) {
      tabbody.innerHTML = '<div class="ac-briefing-error">Could not load briefing.</div>';
    }
  });
}
```

`Promise.all` is correct here — all four fetches are independent reads with no shared mutation.

### §6.2 — Fetch: prior meeting (last closed/sealed)

```javascript
function _fetchPriorMeetingBrief(currentMeetingId, workstreamId) {
  return API.get(
    'accord_meetings?workstream_id=eq.' + workstreamId +
    '&meeting_id=neq.' + currentMeetingId +
    '&state=in.(closed,sealed)' +
    '&select=meeting_id,title,scheduled_for,sealed_at,briefing_text,state' +
    '&order=scheduled_for.desc.nullslast,created_at.desc' +
    '&limit=1'
  ).then(function(rows) {
    if (!rows || !rows.length) return null;
    var m = rows[0];
    // Fetch node counts for last meeting
    return API.get(
      'accord_nodes?meeting_id=eq.' + m.meeting_id +
      '&select=tag'
    ).then(function(nodes) {
      m._nodeCounts = {};
      (nodes || []).forEach(function(n) {
        m._nodeCounts[n.tag] = (m._nodeCounts[n.tag] || 0) + 1;
      });
      return m;
    });
  }).catch(function() { return null; });
}
```

### §6.3 — Fetch: prior actions summary

```javascript
function _fetchPriorActionsSummary(currentMeetingId, workstreamId) {
  return API.get(
    'accord_meetings?workstream_id=eq.' + workstreamId +
    '&meeting_id=neq.' + currentMeetingId +
    '&state=in.(closed,sealed)' +
    '&select=meeting_id&limit=20'
  ).then(function(meetings) {
    if (!meetings || !meetings.length) return { total: 0, overdue: 0, dueThisWeek: 0, nodes: [] };
    var ids = meetings.map(function(m) { return m.meeting_id; }).join(',');
    return API.get(
      'accord_nodes?meeting_id=in.(' + ids + ')' +
      '&tag=eq.action' +
      '&select=node_id,summary,due_date,created_by,status,seq_id' +
      '&order=due_date.asc.nullslast'
    ).then(function(nodes) {
      nodes = nodes || [];
      var now = Date.now();
      var weekMs = 7 * 24 * 60 * 60 * 1000;
      var overdue = 0, dueThisWeek = 0;
      nodes.forEach(function(n) {
        if (!n.due_date) return;
        var due = new Date(n.due_date).getTime();
        if (due < now) overdue++;
        else if (due < now + weekMs) dueThisWeek++;
      });
      return { total: nodes.length, overdue: overdue, dueThisWeek: dueThisWeek, nodes: nodes };
    });
  }).catch(function() { return { total: 0, overdue: 0, dueThisWeek: 0, nodes: [] }; });
}
```

### §6.4 — Fetch: prior decisions

```javascript
function _fetchPriorDecisions(workstreamId) {
  // Get meeting IDs
  return API.get(
    'accord_meetings?workstream_id=eq.' + workstreamId +
    '&state=in.(closed,sealed)' +
    '&select=meeting_id&limit=20'
  ).then(function(meetings) {
    if (!meetings || !meetings.length) return [];
    var ids = meetings.map(function(m) { return m.meeting_id; }).join(',');
    return API.get(
      'accord_nodes?meeting_id=in.(' + ids + ')' +
      '&tag=eq.decision' +
      '&select=node_id,summary,seq_id,created_at,status' +
      '&order=created_at.desc' +
      '&limit=12'
    ).then(function(nodes) { return nodes || []; });
  }).catch(function() { return []; });
}
```

### §6.5 — Fetch: annotations (belief adjustments)

```javascript
function _fetchAnnotations(workstreamId) {
  // Get decision node IDs in this workstream first
  return API.get(
    'accord_meetings?workstream_id=eq.' + workstreamId +
    '&state=in.(closed,sealed)' +
    '&select=meeting_id&limit=20'
  ).then(function(meetings) {
    if (!meetings || !meetings.length) return [];
    var mids = meetings.map(function(m) { return m.meeting_id; }).join(',');
    // Get decision nodes
    return API.get(
      'accord_nodes?meeting_id=in.(' + mids + ')' +
      '&tag=eq.decision&select=node_id&limit=50'
    ).then(function(decNodes) {
      if (!decNodes || !decNodes.length) return [];
      var nids = decNodes.map(function(n) { return n.node_id; }).join(',');
      return API.get(
        'accord_belief_adjustments?target_node_id=in.(' + nids + ')' +
        '&select=adjustment_id,target_node_id,delta,rationale,declared_at,declared_by' +
        '&order=declared_at.desc' +
        '&limit=8'
      ).then(function(rows) { return rows || []; });
    });
  }).catch(function() { return []; });
}
```

### §6.6 — Paint briefing tab

```javascript
function _paintBriefingTab(tabbody, meeting, lastMtg, actionsSummary, decisions, annotations) {
  var html = '<div class="ac-briefing-wrap">';

  // ── Synthesis block ──────────────────────────────────
  html += '<div class="ac-briefing-synthesis">';
  html += '<div class="ac-briefing-synthesis-label">WHAT CAME BEFORE</div>';
  if (meeting.briefing_text) {
    html += '<div class="ac-briefing-synthesis-text">' + esc(meeting.briefing_text) + '</div>';
  } else {
    html += '<div class="ac-briefing-synthesis-placeholder">' +
            'No briefing written yet. ' +
            '<span class="ac-briefing-edit-link" data-action="focus-briefing">Write one →</span>' +
            '</div>';
  }
  html += '</div>';

  // ── Last meeting block ───────────────────────────────
  if (lastMtg) {
    html += '<div class="ac-briefing-last">';
    html += '<div class="ac-briefing-section-label">LAST MEETING</div>';
    html += '<div class="ac-briefing-last-meta">';
    var dateStr = lastMtg.sealed_at || lastMtg.scheduled_for;
    html += '<span class="ac-briefing-last-date">' +
            esc(dateStr ? new Date(dateStr).toLocaleDateString(undefined,
              { month:'short', day:'numeric' }) : '—') + '</span>';
    html += '<span class="ac-briefing-last-title">' + esc(lastMtg.title || '—') + '</span>';
    html += '</div>';

    // Node counts
    var counts = lastMtg._nodeCounts || {};
    var countParts = [];
    [['decision','D'],['action','A'],['dissent','Di'],['risk','R']].forEach(function(pair) {
      var n = counts[pair[0]] || 0;
      if (n) countParts.push(n + pair[1]);
    });
    if (countParts.length) {
      html += '<div class="ac-briefing-last-counts">' + esc(countParts.join(' · ')) + '</div>';
    } else {
      html += '<div class="ac-briefing-last-counts ac-muted">No captures</div>';
    }

    if (lastMtg.briefing_text) {
      html += '<div class="ac-briefing-last-summary">' +
              esc(lastMtg.briefing_text.slice(0, 200)) +
              (lastMtg.briefing_text.length > 200 ? '…' : '') + '</div>';
    }

    html += '<a class="ac-briefing-minutes-link" data-action="open-minutes" ' +
            'data-meeting-id="' + esc(lastMtg.meeting_id) + '">' +
            'Read full minutes ↗</a>';
    html += '</div>';
  }

  // ── Prior actions summary ────────────────────────────
  html += '<div class="ac-briefing-actions">';
  html += '<div class="ac-briefing-section-label">PRIOR ACTIONS</div>';
  if (actionsSummary.total === 0) {
    html += '<div class="ac-muted">No prior actions in this workstream.</div>';
  } else {
    var overdueCls = actionsSummary.overdue > 0 ? ' ac-briefing-actions-count--alert' : '';
    html += '<div class="ac-briefing-actions-summary" data-action="toggle-actions-detail">';
    html += '<span class="ac-briefing-actions-count' + overdueCls + '">' +
            actionsSummary.total + ' tracked</span>';
    if (actionsSummary.overdue > 0) {
      html += '<span class="ac-briefing-actions-count ac-briefing-actions-count--alert"> · ' +
              actionsSummary.overdue + ' overdue</span>';
    }
    if (actionsSummary.dueThisWeek > 0) {
      html += '<span class="ac-briefing-actions-count ac-muted"> · ' +
              actionsSummary.dueThisWeek + ' due this week</span>';
    }
    html += ' <span class="ac-briefing-actions-expand">▸</span>';
    html += '</div>';
    // Detail list (hidden by default; C-09 expands to kanban)
    html += '<div class="ac-briefing-actions-detail" id="ac-briefing-actions-detail" style="display:none;">';
    actionsSummary.nodes.slice(0, 10).forEach(function(n) {
      var overdue = n.due_date && new Date(n.due_date) < new Date();
      html += '<div class="ac-briefing-action-row' + (overdue ? ' ac-briefing-action-row--overdue' : '') + '">';
      html += '<span class="ac-briefing-action-seq">' + esc(n.seq_id || 'A') + '</span>';
      html += '<span class="ac-briefing-action-summary">' +
              esc((n.summary || '').slice(0, 80)) + '</span>';
      if (n.due_date) {
        html += '<span class="ac-briefing-action-due' + (overdue ? ' ac-overdue' : '') + '">' +
                esc(new Date(n.due_date).toLocaleDateString(undefined,
                  { month:'short', day:'numeric' })) + '</span>';
      }
      html += '</div>';
    });
    if (actionsSummary.nodes.length > 10) {
      html += '<div class="ac-muted ac-briefing-more">+' +
              (actionsSummary.nodes.length - 10) + ' more</div>';
    }
    html += '</div>';
  }
  html += '</div>';

  // ── Prior decisions block ────────────────────────────
  html += '<div class="ac-briefing-decisions">';
  html += '<div class="ac-briefing-section-label">PRIOR DECISIONS</div>';
  if (!decisions.length) {
    html += '<div class="ac-muted">No decisions captured yet.</div>';
  } else {
    decisions.slice(0, 8).forEach(function(d) {
      html += '<div class="ac-briefing-decision-row">';
      html += '<span class="ac-briefing-decision-seq">' + esc(d.seq_id || 'DC') + '</span>';
      html += '<span class="ac-briefing-decision-text">' +
              esc((d.summary || '').slice(0, 90)) + '</span>';
      html += '</div>';
    });
    if (decisions.length > 8) {
      html += '<div class="ac-muted ac-briefing-more">+' +
              (decisions.length - 8) + ' more — see Decisions tab</div>';
    }
  }
  html += '</div>';

  // ── Annotations block ────────────────────────────────
  if (annotations.length) {
    html += '<div class="ac-briefing-annotations">';
    html += '<div class="ac-briefing-section-label">BELIEF ADJUSTMENTS</div>';
    annotations.slice(0, 4).forEach(function(a) {
      var delta = a.delta > 0 ? '+' + a.delta : String(a.delta);
      var deltaCls = a.delta > 0 ? 'ac-delta--pos' : 'ac-delta--neg';
      html += '<div class="ac-briefing-annotation-row">';
      html += '<span class="ac-delta ' + deltaCls + '">' + esc(delta) + '</span>';
      html += '<span class="ac-briefing-annotation-rationale">' +
              esc((a.rationale || '').slice(0, 80)) + '</span>';
      html += '</div>';
    });
    html += '</div>';
  }

  html += '</div>'; // .ac-briefing-wrap
  tabbody.innerHTML = html;
  _wireBriefingEvents(tabbody, meeting);
}
```

### §6.7 — Briefing tab events

```javascript
function _wireBriefingEvents(tabbody, meeting) {
  tabbody.addEventListener('click', function(ev) {
    var action = ev.target.dataset.action ||
                 ev.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    if (action === 'toggle-actions-detail') {
      var detail = tabbody.querySelector('#ac-briefing-actions-detail');
      var arrow  = tabbody.querySelector('.ac-briefing-actions-expand');
      if (!detail) return;
      var visible = detail.style.display !== 'none';
      detail.style.display = visible ? 'none' : '';
      if (arrow) arrow.textContent = visible ? '▸' : '▾';
      return;
    }

    if (action === 'open-minutes') {
      var btn = ev.target.closest('[data-action="open-minutes"]');
      if (!btn) return;
      var mtgId = btn.dataset.meetingId;
      // Navigate to that meeting's Minutes tab
      // Delegate to existing accord-core navigation
      if (window.Accord && Accord.setLevel) {
        Accord.setLevel('meeting', {
          meetingId:    mtgId,
          workstreamId: meeting.workstream_id,
          tab:          'minutes'
        });
      }
      return;
    }

    if (action === 'focus-briefing') {
      // Focus the Stakes/briefing_text field in the header
      var stakes = document.getElementById('ac-meeting-stakes');
      if (stakes) { stakes.focus(); stakes.scrollIntoView({ behavior: 'smooth' }); }
      return;
    }
  });
}
```

---

## §7 — Decisions tab

```javascript
var _decisionsToken = 0;

function _renderDecisionsTab(tabbody, meeting) {
  var myToken = ++_decisionsToken;

  if (!meeting.workstream_id) {
    tabbody.innerHTML = '<div class="ac-decisions-empty">No workstream context.</div>';
    return;
  }

  // Fetch all workstream decisions with NRA current state
  API.get(
    'accord_meetings?workstream_id=eq.' + meeting.workstream_id +
    '&state=in.(closed,sealed,running,idle)' +
    '&select=meeting_id&limit=50'
  ).then(function(meetings) {
    if (_decisionsToken !== myToken) return;
    if (!meetings || !meetings.length) {
      if (tabbody.isConnected) tabbody.innerHTML =
        '<div class="ac-decisions-empty">No meetings in this workstream yet.</div>';
      return;
    }
    var ids = meetings.map(function(m) { return m.meeting_id; }).join(',');
    return API.get(
      'accord_nodes?meeting_id=in.(' + ids + ')' +
      '&tag=eq.decision' +
      '&select=node_id,summary,seq_id,created_at,status,dissented_by' +
      '&order=created_at.desc'
    );
  }).then(function(nodes) {
    if (!nodes) return;
    if (_decisionsToken !== myToken) return;
    if (!tabbody.isConnected) return;
    _paintDecisionsTab(tabbody, nodes, meeting);
  }).catch(function(e) {
    console.error('[AccordMeetingSetup] decisions fetch failed', e);
    if (tabbody.isConnected)
      tabbody.innerHTML = '<div class="ac-decisions-error">Could not load decisions.</div>';
  });
}
```

### §7.1 — Decisions tab paint

```javascript
function _paintDecisionsTab(tabbody, nodes, meeting) {
  var filters = ['all', 'sealed', 'dissented'];
  var activeFilter = 'all';

  function _renderFiltered(filter) {
    var filtered = nodes.filter(function(n) {
      if (filter === 'all')      return true;
      if (filter === 'sealed')   return !n.dissented_by;
      if (filter === 'dissented') return !!n.dissented_by;
      return true;
    });

    var listHtml = filtered.length
      ? filtered.map(function(n) {
          var hasDissent = !!n.dissented_by;
          var rowCls = 'ac-dec-row' + (hasDissent ? ' ac-dec-row--dissent' : '');
          return '<div class="' + rowCls + '" data-node-id="' + esc(n.node_id) + '">' +
            '<span class="ac-dec-seq">' + esc(n.seq_id || 'DC') + '</span>' +
            '<span class="ac-dec-text">' + esc((n.summary || '').slice(0, 100)) + '</span>' +
            (hasDissent ? '<span class="ac-dec-badge ac-dec-badge--dissent">DISSENT</span>' : '') +
            '</div>';
        }).join('')
      : '<div class="ac-decisions-empty">No decisions match this filter.</div>';

    var list = tabbody.querySelector('#ac-dec-list');
    if (list) list.innerHTML = listHtml;
  }

  var filtersHtml = filters.map(function(f) {
    return '<button class="ac-dec-filter' + (f === activeFilter ? ' active' : '') + '" ' +
           'data-action="dec-filter" data-filter="' + f + '">' +
           f.toUpperCase() + '</button>';
  }).join('');

  tabbody.innerHTML = [
    '<div class="ac-decisions-wrap">',
      '<div class="ac-dec-filters">', filtersHtml, '</div>',
      '<div class="ac-dec-count">', nodes.length, ' decisions</div>',
      '<div class="ac-dec-list" id="ac-dec-list"></div>',
    '</div>'
  ].join('');

  _renderFiltered(activeFilter);

  tabbody.addEventListener('click', function(ev) {
    var btn = ev.target.closest('[data-action="dec-filter"]');
    if (!btn) return;
    activeFilter = btn.dataset.filter;
    tabbody.querySelectorAll('.ac-dec-filter').forEach(function(b) {
      b.classList.toggle('active', b.dataset.filter === activeFilter);
    });
    _renderFiltered(activeFilter);
  });
}
```

---

## §8 — Risks tab

```javascript
var _risksToken = 0;

function _renderRisksTab(tabbody, meeting) {
  var myToken = ++_risksToken;

  if (!meeting.workstream_id) {
    tabbody.innerHTML = '<div class="ac-risks-empty">No workstream context.</div>';
    return;
  }

  // Get project_id from workstream (V6 finding governs query shape)
  API.get(
    'workstreams?workstream_id=eq.' + meeting.workstream_id +
    '&select=<project_id_col_per_V6>&limit=1'
  ).then(function(rows) {
    if (_risksToken !== myToken) return;
    var ws = rows && rows[0];
    var projectId = ws && ws['<project_id_col_per_V6>'];

    if (!projectId) {
      if (tabbody.isConnected)
        tabbody.innerHTML = '<div class="ac-risks-empty">No project linked to this workstream.</div>';
      return;
    }

    return API.getRisksByProject(projectId);
  }).then(function(risks) {
    if (!risks) return;
    if (_risksToken !== myToken) return;
    if (!tabbody.isConnected) return;
    _paintRisksTab(tabbody, risks, meeting);
  }).catch(function(e) {
    console.error('[AccordMeetingSetup] risks fetch failed', e);
    if (tabbody.isConnected)
      tabbody.innerHTML = '<div class="ac-risks-error">Could not load risks.</div>';
  });
}
```

**V6 substitution:** replace `<project_id_col_per_V6>` with the confirmed column name from V6 finding. Use `API.getRisksByProject(projectId)` from the existing `api.js` (already defined per the `api.js` in uploads — `getRisksByProject` takes a project_id).

### §8.1 — Risks tab paint

```javascript
function _paintRisksTab(tabbody, risks, meeting) {
  if (!risks || !risks.length) {
    tabbody.innerHTML = '<div class="ac-risks-wrap">' +
      '<div class="ac-risks-empty">No risks registered for this project.</div>' +
      '</div>';
    return;
  }

  var html = '<div class="ac-risks-wrap">';
  html += '<div class="ac-risks-header">';
  html += '<span class="ac-risks-count">' + risks.length + ' risk' +
          (risks.length !== 1 ? 's' : '') + '</span>';
  html += '<span class="ac-risks-note ac-muted">CPM surface coming in Track F</span>';
  html += '</div>';

  risks.forEach(function(r) {
    var score = r.weighted_score || 0;
    var scoreCls = score >= 15 ? 'ac-risk-score--high' :
                   score >= 8  ? 'ac-risk-score--mid'  : 'ac-risk-score--low';
    html += '<div class="ac-risk-row">';
    html += '<span class="ac-risk-score ' + scoreCls + '">' + score + '</span>';
    html += '<div class="ac-risk-body">';
    html += '<div class="ac-risk-desc">' + esc((r.description || r.title || '').slice(0, 100)) + '</div>';
    if (r.mitigation_status) {
      html += '<div class="ac-risk-status ac-muted">' + esc(r.mitigation_status) + '</div>';
    }
    html += '</div>';
    html += '</div>';
  });

  html += '</div>';
  tabbody.innerHTML = html;
}
```

---

## §9 — CSS additions

All styles inside `.ac-setup-shell`. Token prefix `--ac-*` only.

```css
/* ── Tab bar ────────────────────────────────────────── */
.ac-col-tabbar {
  display: flex;
  gap: 2px;
  padding: 10px 14px 0 14px;
  border-bottom: 1px solid var(--ac-border-subtle);
  flex-shrink: 0;
}
.ac-tab {
  font-family: var(--ac-font-mono);
  font-size: 9.5px;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--ac-text-tertiary);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 6px 10px 8px 10px;
  cursor: pointer;
  margin-bottom: -1px;
  transition: color .15s, border-color .15s;
}
.ac-tab:hover { color: var(--ac-text-secondary); }
.ac-tab--active {
  color: var(--ac-cyan);
  border-bottom-color: var(--ac-cyan);
}

/* ── Briefing tab ───────────────────────────────────── */
.ac-briefing-wrap {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.ac-briefing-section-label {
  font-family: var(--ac-font-mono);
  font-size: 8.5px;
  color: var(--ac-text-tertiary);
  letter-spacing: 1.4px;
  text-transform: uppercase;
  margin-bottom: 6px;
}

/* Synthesis block */
.ac-briefing-synthesis {
  border-left: 2px solid var(--ac-cyan-dim);
  padding-left: 11px;
}
.ac-briefing-synthesis-label {
  font-family: var(--ac-font-mono);
  font-size: 8px;
  color: var(--ac-cyan);
  letter-spacing: 1.4px;
  text-transform: uppercase;
  margin-bottom: 6px;
}
.ac-briefing-synthesis-text {
  font-family: var(--ac-font-serif);
  font-size: 13.5px;
  font-style: italic;
  color: var(--ac-text-secondary);
  line-height: 1.6;
}
.ac-briefing-synthesis-placeholder {
  font-size: 12px;
  color: var(--ac-text-tertiary);
  font-style: italic;
}
.ac-briefing-edit-link {
  color: var(--ac-cyan);
  cursor: pointer;
  font-style: normal;
}
.ac-briefing-edit-link:hover { text-decoration: underline; }

/* Last meeting block */
.ac-briefing-last {
  background: var(--ac-bg-tile);
  border: 1px solid var(--ac-border-subtle);
  border-radius: 6px;
  padding: 10px 12px;
}
.ac-briefing-last-meta {
  display: flex;
  gap: 8px;
  align-items: baseline;
  margin-bottom: 4px;
}
.ac-briefing-last-date {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-text-tertiary);
}
.ac-briefing-last-title {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--ac-text-primary);
}
.ac-briefing-last-counts {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-text-tertiary);
  margin-bottom: 6px;
}
.ac-briefing-last-summary {
  font-size: 12px;
  color: var(--ac-text-secondary);
  line-height: 1.5;
  margin-bottom: 8px;
  font-style: italic;
}
.ac-briefing-minutes-link {
  font-family: var(--ac-font-mono);
  font-size: 9.5px;
  color: var(--ac-cyan);
  cursor: pointer;
  text-decoration: none;
}
.ac-briefing-minutes-link:hover { text-decoration: underline; }

/* Prior actions */
.ac-briefing-actions-summary {
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.ac-briefing-actions-count { color: var(--ac-text-secondary); }
.ac-briefing-actions-count--alert { color: var(--ac-rose); font-weight: 600; }
.ac-briefing-actions-expand { font-size: 10px; color: var(--ac-text-tertiary); }
.ac-briefing-actions-detail { margin-top: 8px; }
.ac-briefing-action-row {
  display: flex;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px solid var(--ac-border-subtle);
  font-size: 11.5px;
  align-items: baseline;
}
.ac-briefing-action-row:last-child { border-bottom: none; }
.ac-briefing-action-seq {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-amber);
  flex-shrink: 0;
}
.ac-briefing-action-summary { flex: 1; color: var(--ac-text-secondary); }
.ac-briefing-action-due { font-family: var(--ac-font-mono); font-size: 9px; color: var(--ac-text-tertiary); }
.ac-overdue { color: var(--ac-rose) !important; }
.ac-briefing-more { font-size: 10px; padding: 4px 0; }

/* Prior decisions */
.ac-briefing-decision-row {
  display: flex;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px solid var(--ac-border-subtle);
  align-items: baseline;
}
.ac-briefing-decision-row:last-child { border-bottom: none; }
.ac-briefing-decision-seq {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-cyan);
  flex-shrink: 0;
}
.ac-briefing-decision-text { font-size: 11.5px; color: var(--ac-text-secondary); }

/* Annotations */
.ac-briefing-annotation-row {
  display: flex;
  gap: 8px;
  padding: 5px 0;
  align-items: baseline;
}
.ac-delta { font-family: var(--ac-font-mono); font-size: 11px; font-weight: 700; flex-shrink: 0; }
.ac-delta--pos { color: var(--ac-green); }
.ac-delta--neg { color: var(--ac-rose); }
.ac-briefing-annotation-rationale { font-size: 11.5px; color: var(--ac-text-secondary); }

/* ── Decisions tab ──────────────────────────────────── */
.ac-decisions-wrap { padding: 14px 16px; }
.ac-dec-filters {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}
.ac-dec-filter {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  padding: 4px 10px;
  border: 1px solid var(--ac-border-subtle);
  border-radius: 3px;
  background: none;
  color: var(--ac-text-tertiary);
  cursor: pointer;
  letter-spacing: 0.8px;
}
.ac-dec-filter.active {
  color: var(--ac-cyan);
  border-color: var(--ac-cyan-dim);
  background: var(--ac-cyan-dim);
}
.ac-dec-count {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-text-tertiary);
  margin-bottom: 10px;
}
.ac-dec-row {
  display: flex;
  gap: 8px;
  padding: 7px 0;
  border-bottom: 1px solid var(--ac-border-subtle);
  align-items: flex-start;
  cursor: pointer;
}
.ac-dec-row:hover { background: var(--ac-bg-tile); margin: 0 -8px; padding: 7px 8px; }
.ac-dec-row--dissent { border-left: 2px solid var(--ac-rose); padding-left: 8px; }
.ac-dec-seq {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-cyan);
  flex-shrink: 0;
  margin-top: 2px;
}
.ac-dec-text { font-size: 12px; color: var(--ac-text-secondary); flex: 1; line-height: 1.4; }
.ac-dec-badge {
  font-family: var(--ac-font-mono);
  font-size: 8px;
  padding: 2px 5px;
  border-radius: 3px;
  flex-shrink: 0;
}
.ac-dec-badge--dissent { background: var(--ac-rose-dim); color: var(--ac-rose); }

/* ── Risks tab ──────────────────────────────────────── */
.ac-risks-wrap { padding: 14px 16px; }
.ac-risks-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
}
.ac-risks-count {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 1px;
}
.ac-risks-note { font-size: 9px; }
.ac-risk-row {
  display: flex;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--ac-border-subtle);
  align-items: flex-start;
}
.ac-risk-row:last-child { border-bottom: none; }
.ac-risk-score {
  font-family: var(--ac-font-mono);
  font-size: 11px;
  font-weight: 700;
  min-width: 24px;
  text-align: right;
  flex-shrink: 0;
}
.ac-risk-score--high { color: var(--ac-rose); }
.ac-risk-score--mid  { color: var(--ac-amber); }
.ac-risk-score--low  { color: var(--ac-text-tertiary); }
.ac-risk-desc { font-size: 12px; color: var(--ac-text-secondary); line-height: 1.4; }
.ac-risk-status { font-size: 10px; margin-top: 2px; }

/* ── Shared ─────────────────────────────────────────── */
.ac-muted { color: var(--ac-text-tertiary); }
.ac-briefing-empty, .ac-briefing-error,
.ac-decisions-empty, .ac-decisions-error,
.ac-risks-empty, .ac-risks-error,
.ac-tab-loading {
  font-size: 12px;
  color: var(--ac-text-tertiary);
  font-style: italic;
  padding: 16px;
}
```

---

## §10 — Teardown additions

```javascript
// In teardown():
// Tokens auto-invalidate — no explicit reset needed
// Tab active state persists intentionally (_leftActiveTab module-level var)
// No timers added in this CMD
```

Note: `_leftActiveTab` is intentionally preserved across renders so the operator's last-viewed tab persists when navigating away and back. Do not reset it in `teardown()`.

---

## §11 — Smoke tests

| # | Test | Expected |
|---|---|---|
| 1 | Open idle meeting — left column tab bar | Three tabs visible: Briefing / Decisions / Risks. Briefing active (cyan underline). Tabbody shows Briefing content. |
| 2 | Briefing tab — workstream with history | WHAT CAME BEFORE block (briefing_text or placeholder). Last meeting block with date, title, node counts. Prior actions summary with counts. Prior decisions list. |
| 3 | Briefing tab — prior actions expand/collapse | Click aggregate row → action detail list expands. Click again → collapses. |
| 4 | Briefing tab — "Write one →" link | Clicking focuses `#ac-meeting-stakes` field in header and scrolls to it. |
| 5 | Click Decisions tab | Tab bar switches to Decisions active. Decision list renders. ALL / SEALED / DISSENTED filters work. |
| 6 | Decisions tab — DISSENTED filter | Shows only rows with `dissented_by IS NOT NULL`. Rose border-left visible. |
| 7 | Click Risks tab | Tab renders. If project linked to workstream: risk list with scores and descriptions. If no project: "No project linked" message. |
| 8 | Tab persistence | Switch to Decisions tab. Navigate away (click another meeting in rail). Navigate back. Left column shows Decisions tab (not Briefing). |

---

## §12 — Files manifest

| File | Change |
|---|---|
| `accord-meeting-setup.js` | Tab bar render; `_activateLeftTab`; Briefing/Decisions/Risks tab functions |
| `accord-meeting-setup.css` | Tab bar + Briefing + Decisions + Risks styles |
| `accord-views.js` | No changes |
| `version.js` | Operator-managed (IR65) |

---

## §13 — Discipline checklist

- `var` only
- Token pattern on all three tab render functions (`_briefingToken`, `_decisionsToken`, `_risksToken`)
- `isConnected` check before every paint call
- `Promise.all` for Briefing tab — four independent reads; safe and documented
- Sequential fetches in Decisions and Risks tabs where second query depends on first — not `Promise.all`
- V6 column name substituted verbatim before coding `_renderRisksTab`
- `data-action` on all interactive elements
- `_leftActiveTab` not reset in `teardown()` — tab persistence is intentional
- `--ac-*` token prefix throughout; no production Accord tokens
- CPM surface placeholder text in Risks tab: "CPM surface coming in Track F" — not a blank, but clearly deferred

---

**Halt-and-surface after §11. Close-out must include: V1–V4 and V6 IR64 findings, V6 column name used in `_renderRisksTab`, `_leftActiveTab` persistence confirmed working in smoke test 8.**

**After seal: C-07 · CMD-ACCORD-SETUP-AGENDA-ENHANCED-1 is unblocked.**

---

*End Commission · C-06 · CMD-ACCORD-SETUP-BRIEFING-TABS-1.*
