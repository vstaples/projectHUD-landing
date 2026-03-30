// mc-kanban.js — Compass My Calendar: Kanban board
// Loaded by my-calendar.html as <script src="/js/mc-kanban.js"> AFTER mc-grid.js.
// Defines: calSwitchView, _kbRender, _kbWireEvents, and all _kb* functions.
// State: _kbDrag, _kbNeg, _kbDel, _kbColDates, _kbWeekOffset are IIFE-scoped lets.
// Calls buildCalendarTab (from mc-grid.js) — requires mc-grid.js to load first.

(function() {
'use strict';

// ── KANBAN STATE ─────────────────────────────────────────
// Module-level state for the Kanban board. All _kb* prefixed.
// Initialised once; survives tab switches (board re-renders, state persists).

let _kbWeekOffset   = 0;
let _kbLoaded       = false;
let _kbColDates     = {};
let _kbShowWeekend  = false; // hidden by default in Kanban
let _kbDrag         = { card: null, srcColId: null, cardId: null, hrs: 0, type: '', due: null, taskId: null };
let _kbNeg          = { active: false, cardEl: null, srcColId: null, destColId: null };
let _kbDel          = { active: false, cardEl: null, cardId: null, taskId: null };
let _kbAddTarget    = null; // colId receiving the add-item action

// Kanban CSS — injected once on first toggle
(function injectKbCss() {
  if (document.getElementById('kb-styles-v2')) return;
  const s = document.createElement('style');
  s.id = 'kb-styles-v2';
  s.textContent = [
    '.kb-col{background:var(--bg1);border:1px solid var(--border);overflow:hidden;min-height:300px;display:flex;flex-direction:column}',
    '.kb-col.weekend{opacity:.6}',
    '.kb-col.kb-next{background:var(--bg2);border-style:dashed}',
    '.kb-col.kb-drag-over{border-color:var(--compass-cyan,#00D2FF)!important;background:rgba(0,210,255,.04)}',
    '.kb-col.kb-col-today{border-top:2px solid var(--compass-cyan,#00D2FF);background:rgba(0,210,255,.03)}',
    '.kb-col-hdr{padding:7px 9px;border-bottom:1px solid var(--border);background:var(--bg2);flex-shrink:0}',
    '.kb-col-day{font-family:var(--font-mono);font-size:12px;font-weight:700;letter-spacing:.06em;color:var(--text0)}',
    '.kb-col-day.kb-today{color:var(--compass-cyan,#00D2FF)}',
    '.kb-col-day.kb-past{color:var(--text3)}',
    '.kb-cap-bar{height:4px;border-radius:2px;overflow:hidden;background:rgba(255,255,255,.06);margin-top:5px}',
    '.kb-cap-fill{height:100%;border-radius:2px;transition:width .2s}',
    '.kb-cap-lbl{font-family:var(--font-mono);font-size:11px;color:var(--text3);margin-top:3px}',
    '.kb-cap-lbl.warn{color:var(--compass-amber,#EF9F27)}',
    '.kb-cap-lbl.over{color:var(--compass-red,#E24B4A)}',
    '.kb-col-body{padding:6px;display:flex;flex-direction:column;gap:4px;flex:1}',
    '.kb-dz{border:1px dashed rgba(0,210,255,.18);padding:7px 6px;text-align:center;font-family:var(--font-mono);font-size:11px;color:var(--text3);letter-spacing:.05em;transition:all .12s}',
    '.kb-dz.active{border-color:var(--compass-cyan,#00D2FF);background:rgba(0,210,255,.05);color:var(--compass-cyan,#00D2FF)}',
    '.kb-card{border:1px solid rgba(0,210,255,.2);padding:7px 8px;cursor:grab;background:rgba(0,210,255,.04);user-select:none;position:relative;transition:opacity .12s}',
    '.kb-card:active{cursor:grabbing;opacity:.5}',
    '.kb-card.kb-dragging{opacity:.3}',
    '.kb-card.kb-meeting{background:rgba(139,92,246,.08);border-color:rgba(139,92,246,.35)}',
    '.kb-card.kb-pending{background:rgba(239,159,39,.08);border:1.5px dashed rgba(239,159,39,.55)}',
    '.kb-card.kb-approved{background:rgba(29,158,117,.08);border:1.5px solid rgba(29,158,117,.45)}',
    '.kb-card.kb-overdue{background:rgba(226,75,74,.08);border:1.5px solid rgba(226,75,74,.45)}',
    '.kb-card-proj{font-family:var(--font-mono);font-size:11px;color:var(--text3);margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:.04em}',
    '.kb-card.kb-meeting .kb-card-proj{color:rgba(139,92,246,.75)}',
    '.kb-card-title{font-family:var(--font-mono);font-size:12px;font-weight:700;letter-spacing:.05em;color:var(--text0);line-height:1.3;margin-bottom:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.kb-card.kb-pending .kb-card-title{color:var(--compass-amber,#EF9F27)}',
    '.kb-card.kb-overdue .kb-card-title{color:var(--compass-red,#E24B4A)}',
    '.kb-card.kb-approved .kb-card-title{color:var(--compass-green,#1D9E75)}',
    '.kb-card.kb-meeting .kb-card-title{color:rgba(139,92,246,.95)}',
    '.kb-card-foot{display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-top:3px}',
    '.kb-pill{font-family:var(--font-mono);font-size:11px;padding:1px 6px;white-space:nowrap;border-radius:2px;display:inline-block}',
    '.kb-del-btn{position:absolute;top:4px;right:5px;background:none;border:none;font-size:14px;color:var(--text3);cursor:pointer;padding:0;line-height:1;display:none}',
    '.kb-del-btn:hover{color:var(--compass-red,#E24B4A)}',
    '.kb-card:hover .kb-del-btn{display:block}',
    '.kb-kpi{background:var(--bg1);border:1px solid var(--border);padding:8px 11px}',
    '.kb-kpi-lbl{font-family:var(--font-mono,monospace);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--text3);margin-bottom:3px}',
    '.kb-kpi-val{font-family:var(--font-mono);font-size:22px;font-weight:700;color:var(--text0);line-height:1}',
    '.kb-kpi-sub{font-family:var(--font-mono,monospace);font-size:11px;color:var(--text3);margin-top:2px}',
    '.kb-kpi-val.warn{color:var(--compass-amber,#EF9F27)}',
    '.kb-kpi-val.info{color:var(--compass-cyan,#00D2FF)}',
    '.kb-add-btn{width:100%;margin-top:4px;padding:5px;background:none;border:1px dashed rgba(0,210,255,.15);color:rgba(0,210,255,.4);font-family:var(--font-mono);font-size:11px;letter-spacing:.06em;cursor:pointer;transition:all .12s}',
    '.kb-add-btn:hover{border-color:rgba(0,210,255,.4);color:#00D2FF;background:rgba(0,210,255,.04)}',
    '#kb-add-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:1000;align-items:center;justify-content:center}',
    '#kb-add-modal.open{display:flex}',
    '.kb-modal-box{background:var(--bg1,#0c1628);border:1px solid rgba(0,210,255,.2);padding:20px 22px;width:380px;max-width:94vw;box-shadow:0 8px 32px rgba(0,0,0,.6)}',
    '.kb-modal-title{font-family:var(--font-mono);font-size:14px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text0);margin-bottom:14px}',
    '.kb-modal-field{margin-bottom:11px}',
    '.kb-modal-lbl{font-family:var(--font-mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--text3);margin-bottom:4px}',
    '.kb-modal-inp{width:100%;font-family:var(--font-mono);font-size:12px;padding:6px 9px;background:var(--bg2,#0f1f35);border:1px solid rgba(0,210,255,.15);color:var(--text0);outline:none;transition:border-color .12s}',
    '.kb-modal-inp:focus{border-color:rgba(0,210,255,.45)}',
    '.kb-modal-sel{width:100%;font-family:var(--font-mono);font-size:12px;padding:6px 9px;background:var(--bg2,#0f1f35);border:1px solid rgba(0,210,255,.15);color:var(--text0);outline:none;cursor:pointer}',
    '.kb-modal-btns{display:flex;gap:8px;margin-top:16px}',
    '.kb-modal-btn-add{flex:1;font-family:var(--font-mono);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:7px;background:rgba(0,210,255,.12);border:1px solid rgba(0,210,255,.4);color:#00D2FF;cursor:pointer;transition:opacity .12s}',
    '.kb-modal-btn-add:hover{opacity:.8}',
    '.kb-modal-btn-cancel{font-family:var(--font-mono);font-size:12px;letter-spacing:.06em;padding:7px 16px;background:none;border:1px solid rgba(255,255,255,.15);color:var(--text2);cursor:pointer}'
  ].join('');
  document.head.appendChild(s);
})();

window.calSwitchView = function(view) {
  const gridEl   = document.getElementById('cal-grid-view');
  const kanbanEl = document.getElementById('cal-kanban-view');
  const gridBtn  = document.getElementById('cal-view-grid-btn');
  const kbBtn    = document.getElementById('cal-view-kanban-btn');
  if (!gridEl || !kanbanEl) return;
  const ACTIVE_BG  = 'linear-gradient(180deg,#f5c842 0%,#c99a0a 100%)';
  const INACTIVE_BG = 'rgba(0,0,0,.35)';
  function setActive(btn)   { btn.style.background=''; btn.style.cssText += ';background:'+ACTIVE_BG+';color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.45);box-shadow:inset 0 1px 0 rgba(255,255,255,.25)'; }
  function setInactive(btn) { btn.style.background=''; btn.style.cssText += ';background:'+INACTIVE_BG+';color:rgba(255,255,255,.4);text-shadow:none;box-shadow:none'; }
  if (view === 'kanban') {
    gridEl.style.display   = 'none';
    kanbanEl.style.display = 'block';
    if (gridBtn) setInactive(gridBtn);
    if (kbBtn)   setActive(kbBtn);
    if (!_kbLoaded) { _kbLoaded = true; _kbWireEvents(); }
    _kbRender();
  } else {
    gridEl.style.display   = 'block';
    kanbanEl.style.display = 'none';
    if (gridBtn) setActive(gridBtn);
    if (kbBtn)   setInactive(kbBtn);
  }
};

// ── KANBAN UTILITY HELPERS ───────────────────────────────
function _kbIsoLocal(d) {
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

function _kbGetMonday(offset) {
  const now = new Date(), day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diff + offset * 7);
  mon.setHours(0,0,0,0);
  return mon;
}

function _kbBuildColDates(mon) {
  const ids = ['mon','tue','wed','thu','fri','sat','sun'];
  const out = {};
  ids.forEach((id, i) => { out[id] = _kbIsoLocal(new Date(mon.getTime() + i * 86400000)); });
  out['next'] = _kbIsoLocal(new Date(mon.getTime() + 7 * 86400000));
  // Last week = previous Monday through Sunday
  const prevMon = new Date(mon.getTime() - 7 * 86400000);
  out['last'] = _kbIsoLocal(prevMon); // anchor date for last-week bucket
  return out;
}

function _kbFmtColDay(id, iso) {
  if (id === 'next') return 'Next week';
  const d = new Date(iso + 'T00:00:00');
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()] + ' ' + (d.getMonth()+1) + '/' + d.getDate();
}

function _kbComputeCapacity(colId, cards) {
  let mtgH = 0, taskH = 0;
  cards.forEach(c => {
    const h = parseFloat(c.dataset.hrs) || 0;
    if (c.dataset.type === 'meeting') mtgH += h; else taskH += h;
  });
  const available = Math.max(0, 8 - mtgH);           // hours not consumed by meetings
  const freeHrs   = Math.max(0, available - taskH);   // hours not yet filled by tasks either
  const pct = available > 0 ? Math.min(Math.round((taskH / available) * 100), 100) : (taskH > 0 ? 100 : 0);
  return { scheduled: taskH, available, freeHrs, mtgHours: mtgH, pct, over: taskH > available };
}

function _kbCapColor(cap) {
  return cap.over ? '#A32D2D' : cap.pct > 85 ? '#BA7517' : '#185FA5';
}

function _kbGetProjectName(pid) {
  if (!pid) return null;
  const p = (window._mtProjects || window._projects || []).find(x => x.id === pid);
  return p ? (p.name || p.title || null) : null;
}

// ── KANBAN RENDER ────────────────────────────────────────
// Builds the full board: injects dynamic <style>, KPI strip, column headers,
// card rows, drag zones, capacity bars. Called once on first Kanban switch
// and again on week navigation.
function _kbRender() {
  const mon = _kbGetMonday(_kbWeekOffset);
  _kbColDates = _kbBuildColDates(mon);
  const fri = new Date(mon.getTime() + 4 * 86400000);
  const fmt = d => d.toLocaleDateString('en-US', {month:'short', day:'numeric'});
  const lbl = document.getElementById('kb-week-lbl');
  if (lbl) lbl.textContent = fmt(mon) + ' - ' + fmt(fri) + ', ' + mon.getFullYear();

  const board   = document.getElementById('kb-board');
  if (!board) return;
  const today   = _kbIsoLocal(new Date());
  const resource = window._calResource || window._mtResource || window._myResource || null;
  const uid     = resource ? resource.user_id : null;

  const wiItems  = window._calItems || window._mtTasks || [];
  const calEvs   = window._calCalEvents || window._mtCalEvents || [];

  const openItems = wiItems.filter(t => {
    if (!t || !t.id) return false;
    return t.status !== 'completed' && t.status !== 'done' && t.status !== 'approved';
  });

  // Time entries for billable KPI
  const teEntries = window._calTimeEntries || [];
  const monIso    = _kbIsoLocal(mon);
  const friIso    = _kbIsoLocal(fri);
  const weekEntries = teEntries.filter(e => e.date >= monIso && e.date <= friIso);
  const billHrs   = weekEntries.filter(e => e.is_billable).reduce((s,e) => s + (parseFloat(e.hours)||0), 0);
  const nonBillHrs = weekEntries.filter(e => !e.is_billable).reduce((s,e) => s + (parseFloat(e.hours)||0), 0);
  const totalLoggedHrs = billHrs + nonBillHrs;
  const billPct   = totalLoggedHrs > 0 ? Math.round((billHrs / totalLoggedHrs) * 100) : 0;

  // Col order: last | Mon Tue Wed Thu Fri [Sat Sun] | next — weekend visibility controlled by toggle
  const allColIds = ['last','mon','tue','wed','thu','fri','sat','sun','next'];
  const colIds = _kbShowWeekend ? allColIds : allColIds.filter(id => id !== 'sat' && id !== 'sun');
  const workCols = colIds.filter(id => id !== 'last' && id !== 'next').length;
  board.style.gridTemplateColumns = 'repeat(' + (workCols + 2) + ',minmax(0,1fr))';

  const taskBuckets = {}, calBuckets = {};
  colIds.forEach(id => { taskBuckets[id] = []; calBuckets[id] = []; });

  const prevMonDate = _kbColDates['last'];
  const prevSunDate = _kbIsoLocal(new Date(mon.getTime() - 86400000)); // Sun before this Mon

  openItems.forEach(t => {
    const due = t.due ? t.due.slice(0,10) : null;
    if (!due) { taskBuckets['next'].push(t); return; }
    let placed = false;
    // Only bucket into a day column if that day is today or future
    // Past days within this week → push to 'last' (already missed)
    const checkIds = _kbShowWeekend
      ? ['mon','tue','wed','thu','fri','sat','sun']
      : ['mon','tue','wed','thu','fri'];
    checkIds.forEach(id => {
      if (!placed && _kbColDates[id] === due) {
        // If this day has already passed, treat as last week
        if (_kbColDates[id] < today) {
          taskBuckets['last'].push(t);
        } else {
          taskBuckets[id].push(t);
        }
        placed = true;
      }
    });
    if (!placed) {
      if (due > _kbColDates['sun'])  taskBuckets['next'].push(t);
      else                           taskBuckets['last'].push(t);
    }
  });

  calEvs.forEach(ev => {
    const evDate = ev.event_date ? ev.event_date.slice(0,10) : null;
    if (!evDate) return;
    colIds.forEach(id => {
      if (id === 'last' || id === 'next') return; // don't bucket cal events into overflow cols
      if (_kbColDates[id] === evDate) calBuckets[id].push(ev);
    });
  });

  let totalItems = 0, totalMtgHrs = 0, totalTaskHrs = 0, pendingCount = 0;

  const colsHtml = colIds.map(colId => {
    const colDate  = _kbColDates[colId];
    const isTdy    = colDate === today;
    const isPast   = colDate < today && colId !== 'next';
    const isWknd   = colId === 'sat' || colId === 'sun';
    const isNext   = colId === 'next';
    const isLast   = colId === 'last';
    let cardsHtml  = '';

    calBuckets[colId].forEach(ev => {
      const h = parseFloat(ev.duration_hours || 0);
      const isPto = (ev.event_type||'').toLowerCase().includes('pto') || (ev.title||'').toLowerCase().includes('pto');
      totalMtgHrs += h; totalItems++;
      const timeStr = ev.start_time ? ev.start_time.slice(0,5) : '';
      cardsHtml += '<div class="kb-card kb-meeting" draggable="true" data-id="cal-' + _esc(String(ev.id)) + '" data-hrs="' + h + '" data-type="meeting" data-colid="' + colId + '">' +
        '<div style="font-family:var(--font-mono,monospace);font-size:11px;color:rgba(139,92,246,.75);margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:.04em">' + _esc(isPto ? 'PTO' : 'Meeting') + '</div>' +
        '<div style="font-family:var(--font-mono);font-size:13px;font-weight:500;color:rgba(139,92,246,.95);line-height:1.3;margin-bottom:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _esc(ev.title || 'Event') + '</div>' +
        '<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-top:3px">' + (timeStr ? '<span class="kb-pill kb-pill-mtg">' + _esc(timeStr) + '</span>' : '') + (h ? '<span class="kb-pill kb-pill-hrs">' + h + 'h</span>' : '') + '</div>' +
        '</div>';
    });

    // Sort: on-time/upcoming first, overdue at bottom
    const sortedTasks = [...taskBuckets[colId]].sort((a,b) => {
      const aOv = a.overdue || (a.due && a.due.slice(0,10) < today) ? 1 : 0;
      const bOv = b.overdue || (b.due && b.due.slice(0,10) < today) ? 1 : 0;
      return aOv - bOv;
    });
    sortedTasks.forEach(t => {
      // _wiItems fields: title, project, projectId, budgetHours, effortDays, due, overdue, type, status
      const h = parseFloat(t.budgetHours || (t.effortDays ? t.effortDays * 8 : 0) || 2);
      const isOverdue = t.overdue || (t.due && t.due.slice(0,10) < today);
      totalTaskHrs += h; totalItems++;
      let cardCls = 'kb-card';
      if (isOverdue) cardCls += ' kb-overdue';
      const dueStr = t.due ? t.due.slice(5) : null;
      let pills = '<span class="kb-pill kb-pill-task">' + _esc(t.type || 'task') + '</span>' +
                  '<span class="kb-pill kb-pill-hrs">' + h + 'h</span>';
      if (isOverdue) pills += '<span class="kb-pill kb-pill-red">Overdue</span>';
      if (dueStr)    pills += '<span class="kb-pill kb-pill-hrs">Due ' + _esc(dueStr) + '</span>';
      const ownerName = t.ownerName || t.assignedName || null;
      const isMyCard  = !ownerName || ownerName === (resource && resource.name);
      const lockIcon  = isMyCard ? '' : '<svg width="10" height="11" viewBox="0 0 10 11" fill="none" xmlns="http://www.w3.org/2000/svg" style="position:absolute;top:5px;right:22px;opacity:.55"><rect x="1" y="4.5" width="8" height="6" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M3 4.5V3a2 2 0 0 1 4 0v1.5" stroke="currentColor" stroke-width="1.2"/></svg>';
      // Row 1: project / company / 'Action item' label
      const row1Label = t.type === 'action' ? 'Action item' : (t.project || 'Internal');
      // Row 4 pills: type | hours | due date (overdue shown via card border/color, not pill)
      const r4pills = '<span class="kb-pill kb-pill-task">' + _esc(t.type || 'task') + '</span>'
        + '<span class="kb-pill kb-pill-hrs">' + h + 'h</span>'
        + (dueStr ? '<span class="kb-pill kb-pill-hrs">Due ' + _esc(dueStr) + '</span>' : '')
        + (isOverdue ? '<span class="kb-pill kb-pill-red">Overdue</span>' : '');
      cardsHtml += '<div class="' + cardCls + '" draggable="true" data-id="task-' + _esc(t.id) + '" data-hrs="' + h + '" data-type="task" data-taskid="' + _esc(t.id) + '" data-due="' + _esc(t.due||'') + '" data-colid="' + colId + '">' +
        '<button class="kb-del-btn" aria-label="Remove">\u00D7</button>' +
        lockIcon +
        '<div style="font-family:var(--font-mono,monospace);font-size:11px;color:var(--text3);margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:.05em;text-transform:uppercase">' + _esc(row1Label) + '</div>' +
        '<div style="font-family:var(--font-mono);font-size:13px;font-weight:600;color:var(--text0);line-height:1.25;margin-bottom:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _esc(t.title || t.name || 'Item') + '</div>' +
        '<div style="font-family:var(--font-mono,monospace);font-size:11px;color:var(--text3);margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _esc(ownerName || 'Owner: None') + '</div>' +
        '<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">' + r4pills + '</div>' +
        '</div>';
    });

    // ── Logged section: actual time_entries for this day (past cols only) ──
    const dayLogged = (window._calTimeEntries || []).filter(e => e.date && e.date.slice(0,10) === colDate);
    if (dayLogged.length > 0 && !isNext) {
      cardsHtml += '<div style="font-family:var(--font-mono,monospace);font-size:11px;color:var(--text3);letter-spacing:.08em;text-transform:uppercase;padding:5px 6px 3px;margin-top:4px;border-top:1px solid rgba(255,255,255,.06)">— Worked —</div>';
      dayLogged.forEach(e => {
        // Look up project name from all available project sources
        const _allProjects = window._projects || window._mtProjects || [];
        const projName = _allProjects.find(p => p.id === e.project_id);
        // Look up task from both open items and the full task name via step_name
        const taskItem = (window._calItems || []).find(t => t.id === e.task_id);
        // Build title: prefer task title, then project + step, then notes, then project name
        const _projLabel = projName?.name || projName?.title || null;
        const _stepLabel = e.step_name && e.step_name !== 'general' ? e.step_name : null;
        const title = taskItem?.title || taskItem?.name
          || (_projLabel && _stepLabel ? _projLabel + ' — ' + _stepLabel : null)
          || e.notes
          || _projLabel
          || 'Time entry';
        const desc = e.notes && e.notes !== title ? e.notes : (_stepLabel && _projLabel ? null : _stepLabel);
        const h        = parseFloat(e.hours) || 0;
        const billCls  = e.is_billable ? 'var(--compass-cyan,#00D2FF)' : '#7F77DD';
        cardsHtml += '<div style="padding:5px 7px;border-left:2px solid ' + billCls + ';margin:2px 0;background:rgba(255,255,255,.03)">' +
          '<div style="font-family:var(--font-mono);font-size:12px;font-weight:600;color:var(--compass-green,#1D9E75);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.3">' + _esc(title) + '</div>' +
          (desc ? '<div style="font-family:var(--font-mono,monospace);font-size:11px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px">' + _esc(desc) + '</div>' : '') +
          '<div style="font-family:var(--font-mono,monospace);font-size:11px;color:' + billCls + ';margin-top:2px">' + h + 'h · ' + (e.is_billable ? 'Billable' : 'Non-bill') + '</div>' +
          '</div>';
      });
    }

    cardsHtml += '<div class="kb-dz" data-colid="' + colId + '">+ drop here</div>';
    if (!isLast) cardsHtml += '<button class="kb-add-btn" data-addcol="' + colId + '">+ Add item</button>';

    const mtgH  = calBuckets[colId].reduce((s,ev) => s + parseFloat(ev.duration_hours||0), 0);
    const taskH = taskBuckets[colId].reduce((s,t) => s + parseFloat(t.budgetHours||(t.effortDays?t.effortDays*8:0)||2), 0);
    const avail = Math.max(0, 8 - mtgH);
    const pct   = avail > 0 ? Math.min(Math.round((taskH / avail) * 100), 100) : (taskH > 0 ? 100 : 0);
    const over  = taskH > avail;
    const capColor = over ? '#A32D2D' : pct > 85 ? '#BA7517' : '#185FA5';

    const colLabel = isLast ? 'Last week' : isNext ? 'Next week' : _kbFmtColDay(colId, colDate);

    // Per-day 8-segment bar: each segment = 1h. Cyan=billable, purple=non-bill, white=unallocated
    const dayTeEntries = (window._calTimeEntries || []).filter(e => e.date && e.date.slice(0,10) === colDate);
    const dayBillH    = Math.min(dayTeEntries.filter(e => e.is_billable).reduce((s,e) => s+(parseFloat(e.hours)||0), 0), 8);
    const dayNonBillH = Math.min(dayTeEntries.filter(e => !e.is_billable).reduce((s,e) => s+(parseFloat(e.hours)||0), 0), Math.max(0, 8 - dayBillH));
    const dayTotalH   = dayBillH + dayNonBillH;

    // capText: past days → show actual logged; future days → show scheduled vs available
    let capText;
    if (isNext || isLast) {
      capText = taskBuckets[colId].length + ' item' + (taskBuckets[colId].length !== 1 ? 's' : '');
    } else if (isPast) {
      // Past day — show what was actually logged
      capText = dayTotalH > 0
        ? dayBillH.toFixed(1) + 'h bill · ' + dayNonBillH.toFixed(1) + 'h non-bill'
        : '0h logged';
    } else {
      // Today or future — show scheduled vs available
      capText = over
        ? taskH.toFixed(1) + 'h / ' + avail.toFixed(1) + 'h — over'
        : taskH.toFixed(1) + 'h / ' + avail.toFixed(1) + 'h avail';
    }
    // 8 segments: filled cyan (billable), purple (non-bill), white (unallocated)
    const _segs = Array.from({length:8}, (_,i) => {
      const hr = i + 1;
      if (hr <= dayBillH)                              return 'var(--compass-cyan,#00D2FF)';
      if (hr <= dayBillH + dayNonBillH)                return '#7F77DD';
      return 'rgba(255,255,255,.15)';
    });
    const billBar = (!isNext && !isLast)
      ? '<div style="display:flex;height:4px;gap:2px;margin-top:5px">'
        + _segs.map(c => '<div style="flex:1;height:4px;border-radius:1px;background:' + c + '"></div>').join('')
        + '</div>'
      : '';

    return '<div class="kb-col' + (isWknd?' weekend':'') + (isNext?' kb-next':'') + (isLast?' kb-next':'') + (isTdy?' kb-col-today':'') + '" data-colid="' + colId + '" id="kb-col-' + colId + '">' +
      '<div class="kb-col-hdr">' +
      '<div style="font-family:var(--font-mono);font-size:13px;font-weight:700;letter-spacing:.06em;color:' + (isTdy?'var(--compass-cyan,#00D2FF)':isPast?'var(--text3)':'var(--text0)') + '">' + colLabel + '</div>' +
      ((!isNext && !isLast) ?
        billBar +
        '<div style="font-family:var(--font-mono,monospace);font-size:11px;color:' + (over?'var(--compass-red,#E24B4A)':pct>85?'var(--compass-amber,#EF9F27)':'var(--text3)') + ';margin-top:3px">' + capText + '</div>'
      : '<div style="font-family:var(--font-mono,monospace);font-size:11px;color:var(--text3);margin-top:5px">' + capText + '</div>') +
      '</div>' +
      '<div class="kb-col-body" id="kb-body-' + colId + '">' + cardsHtml + '</div>' +
      '</div>';
  }).join('');

  board.innerHTML = colsHtml;

  const kpiRow = document.getElementById('kb-kpi-row');
  if (kpiRow) {
    // Last week: sum budget hours of all items in the 'last' bucket
    const lastHrs = taskBuckets['last'].reduce((s,t) => s + parseFloat(t.budgetHours||(t.effortDays?t.effortDays*8:0)||2), 0);
    const lastCount = taskBuckets['last'].length;
    // Next week: sum budget hours of all items in the 'next' bucket
    const nextHrs = taskBuckets['next'].reduce((s,t) => s + parseFloat(t.budgetHours||(t.effortDays?t.effortDays*8:0)||2), 0);
    const nextCount = taskBuckets['next'].length;

    kpiRow.innerHTML =
      '<div class="kb-kpi" style="border-left:2px solid rgba(226,75,74,.5)">' +
        '<div class="kb-kpi-lbl">Last week</div>' +
        '<div class="kb-kpi-val' + (lastCount > 0 ? ' warn' : '') + '">' + lastHrs.toFixed(0) + 'h</div>' +
        '<div class="kb-kpi-sub">' + lastCount + ' item' + (lastCount !== 1 ? 's' : '') + ' carried</div>' +
      '</div>' +
      '<div class="kb-kpi"><div class="kb-kpi-lbl">Scheduled</div><div class="kb-kpi-val info">' + totalItems + '</div><div class="kb-kpi-sub">items this week</div></div>' +
      '<div class="kb-kpi"><div class="kb-kpi-lbl">Billable logged</div><div class="kb-kpi-val' + (billPct >= 80 ? '' : ' warn') + '">' + billHrs.toFixed(1) + 'h</div><div class="kb-kpi-sub">' + billPct + '% of ' + totalLoggedHrs.toFixed(1) + 'h logged</div></div>' +
      '<div class="kb-kpi"><div class="kb-kpi-lbl">Non-billable</div><div class="kb-kpi-val">' + nonBillHrs.toFixed(1) + 'h</div><div class="kb-kpi-sub">' + (100 - billPct) + '% of logged hours</div></div>' +
      '<div class="kb-kpi"><div class="kb-kpi-lbl">Meetings</div><div class="kb-kpi-val">' + totalMtgHrs.toFixed(1) + 'h</div><div class="kb-kpi-sub">calendar events</div></div>' +
      '<div class="kb-kpi"><div class="kb-kpi-lbl">Pending approval</div><div class="kb-kpi-val' + (pendingCount > 0 ? ' warn' : '') + '">' + pendingCount + '</div><div class="kb-kpi-sub">awaiting PM</div></div>' +
      '<div class="kb-kpi" style="border-right:2px solid rgba(0,210,255,.35)">' +
        '<div class="kb-kpi-lbl">Next week</div>' +
        '<div class="kb-kpi-val info">' + nextHrs.toFixed(0) + 'h</div>' +
        '<div class="kb-kpi-sub">' + nextCount + ' item' + (nextCount !== 1 ? 's' : '') + ' queued</div>' +
      '</div>';
  }

  _kbWireCards();
}

// ── KANBAN EVENT WIRING ──────────────────────────────────
// Delegated listeners on the board container. Called once after _kbRender.
// Handles: drag/drop, card clicks → openWorkItemExpanded, del-btn,
// week nav arrows, weekend toggle, add-item button, KPI refresh.
function _kbWireEvents() {
  document.getElementById('kb-prev-btn')?.addEventListener('click', () => { _kbWeekOffset--; _kbRender(); });
  document.getElementById('kb-next-btn')?.addEventListener('click', () => { _kbWeekOffset++; _kbRender(); });

  // Weekend toggle
  document.getElementById('kb-wknd-btn')?.addEventListener('click', () => {
    _kbShowWeekend = !_kbShowWeekend;
    const btn   = document.getElementById('kb-wknd-btn');
    const slash = document.getElementById('kb-wknd-slash');
    if (btn) {
      btn.style.color  = _kbShowWeekend ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.25)';
      btn.style.border = _kbShowWeekend ? '1px solid rgba(255,255,255,.3)' : '1px solid rgba(255,255,255,.1)';
    }
    if (slash) slash.style.display = _kbShowWeekend ? 'none' : 'block';
    _kbRender();
  });

  const board = document.getElementById('kb-board');
  if (!board) return;

  board.addEventListener('dragover', e => {
    const body = e.target.closest('.kb-col-body');
    if (body) {
      const col = body.closest('.kb-col');
      const overColId = col?.dataset.colid;
      const overDate  = _kbColDates[overColId];
      const todayStr  = _kbIsoLocal(new Date());
      const isPastCol = overColId === 'last' || (overDate && overDate < todayStr);
      if (isPastCol) {
        e.dataTransfer.dropEffect = 'none';
        // don't preventDefault — let browser show no-drop cursor
        return;
      }
      e.preventDefault();
      document.querySelectorAll('.kb-col').forEach(c => c.classList.remove('kb-drag-over'));
      col?.classList.add('kb-drag-over');
      body.querySelector('.kb-dz')?.classList.add('active');
    } else {
      e.preventDefault();
    }
  });

  board.addEventListener('dragleave', e => {
    const leaving = e.target.closest('.kb-col');
    const entering = document.elementFromPoint(e.clientX, e.clientY)?.closest('.kb-col');
    if (leaving && leaving !== entering) {
      leaving.classList.remove('kb-drag-over');
      leaving.querySelector('.kb-dz')?.classList.remove('active');
    }
  });

  board.addEventListener('drop', e => {
    e.preventDefault();
    document.querySelectorAll('.kb-col').forEach(c => { c.classList.remove('kb-drag-over'); c.querySelector('.kb-dz')?.classList.remove('active'); });
    if (!_kbDrag.card) return;
    const body = e.target.closest('.kb-col-body');
    if (!body) { _kbDragEnd(); return; }
    const destColId = body.closest('.kb-col')?.dataset.colid;
    if (!destColId || destColId === _kbDrag.srcColId) { _kbDragEnd(); return; }
    // Block drops onto past day columns and the 'last' bucket
    const _dropDestDate = _kbColDates[destColId];
    const todayStr = _kbIsoLocal(new Date());
    if (destColId === 'last' || (_dropDestDate && _dropDestDate < todayStr)) {
      compassToast && compassToast('Cannot schedule items in the past.', 2000);
      _kbDragEnd(); return;
    }
    const cardHrs  = parseFloat(_kbDrag.hrs) || 0;
    const cardType = _kbDrag.type || '';
    const destDate = _kbColDates[destColId];
    const dueDate  = _kbDrag.due;

    // Compute available capacity in destination column
    const destBody  = body;
    const destCards = Array.from(destBody.querySelectorAll('.kb-card'));
    const destCap   = _kbComputeCapacity(destColId, destCards);
    const canFit    = Math.max(0, destCap.freeHrs);

    _kbDrag.card.classList.remove('kb-dragging');

    if (cardType !== 'meeting' && canFit < cardHrs && destColId !== 'next') {
      // ── Capacity split ────────────────────────────────────────────────
      const fitHrs      = parseFloat(canFit.toFixed(1));
      const remainHrs   = parseFloat((cardHrs - fitHrs).toFixed(1));

      // Update dropped card to only the hours that fit
      _kbDrag.card.dataset.hrs = String(fitHrs);
      _kbDrag.card.dataset.colid = destColId;
      // Update hrs pill text inside the card
      const hrsPill = _kbDrag.card.querySelector('.kb-pill-hrs');
      if (hrsPill && hrsPill.textContent.includes('h') && !hrsPill.textContent.includes('Due')) {
        hrsPill.textContent = fitHrs + 'h';
      }
      destBody.insertBefore(_kbDrag.card, destBody.querySelector('.kb-dz') || null);

      if (remainHrs > 0) {
        // Clone the card and put remainder back into Last Week
        const remnant = _kbDrag.card.cloneNode(true);
        remnant.dataset.hrs    = String(remainHrs);
        remnant.dataset.colid  = 'last';
        remnant.dataset.id     = _kbDrag.cardId + '-rem';
        // Update hrs pill on remnant
        const rPill = remnant.querySelector('.kb-pill-hrs');
        if (rPill && rPill.textContent.includes('h') && !rPill.textContent.includes('Due')) {
          rPill.textContent = remainHrs + 'h';
        }
        const lastBody = document.getElementById('kb-body-last');
        if (lastBody) lastBody.insertBefore(remnant, lastBody.querySelector('.kb-dz') || null);
        compassToast && compassToast(
          fitHrs + 'h of ' + cardHrs + 'h fits on ' + destColId.toUpperCase() + '. ' + remainHrs + 'h overflow returned to Last Week.', 3500
        );
      }
    } else {
      // Fits entirely — normal move
      _kbDrag.card.dataset.colid = destColId;
      destBody.insertBefore(_kbDrag.card, destBody.querySelector('.kb-dz') || null);
    }

    // Past-due negotiation flag
    const isPastDue = dueDate && destDate && destDate > dueDate && cardType !== 'meeting';
    if (isPastDue || destColId === 'next') {
      _kbDrag.card.classList.add('kb-pending');
      _kbNeg.active = true; _kbNeg.cardEl = _kbDrag.card;
      _kbNeg.srcColId = _kbDrag.srcColId; _kbNeg.destColId = destColId;
      _kbShowNeg(_kbDrag.card, destColId, dueDate);
    }

    // Re-wire new cards and update all cap bars + KPI strip
    _kbWireCards();
    _kbUpdateCapBars();
    _kbUpdateKpis();
    _kbDragEnd();
  });

  document.getElementById('kb-neg-btn-a')?.addEventListener('click', _kbNegMoveBack);
  document.getElementById('kb-neg-btn-b')?.addEventListener('click', _kbNegFindSlot);
  document.getElementById('kb-neg-btn-c')?.addEventListener('click', _kbNegSubmit);
  document.getElementById('kb-del-cancel')?.addEventListener('click', () => {
    document.getElementById('kb-del-panel').style.display = 'none';
    _kbDel = { active: false, cardEl: null, cardId: null, taskId: null };
  });
  document.getElementById('kb-del-confirm')?.addEventListener('click', _kbDelConfirm);

  // Add-item modal
  document.getElementById('kb-modal-cancel')?.addEventListener('click', _kbAddClose);
  document.getElementById('kb-add-modal')?.addEventListener('click', e => { if (e.target === e.currentTarget) _kbAddClose(); });
  document.getElementById('kb-modal-confirm')?.addEventListener('click', _kbAddConfirm);

  // Delegated: + Add item buttons (re-wired after each render via _kbWireCards)
  document.getElementById('kb-board')?.addEventListener('click', e => {
    const btn = e.target.closest('.kb-add-btn');
    if (!btn) return;
    _kbAddOpen(btn.dataset.addcol);
  });
}

// ── KANBAN CARD WIRING ───────────────────────────────────
// Attaches dragstart/dragend to every .kb-card after a render.
function _kbWireCards() {
  document.querySelectorAll('.kb-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      _kbDrag.card = card; _kbDrag.srcColId = card.dataset.colid;
      _kbDrag.cardId = card.dataset.id; _kbDrag.hrs = parseFloat(card.dataset.hrs)||0;
      _kbDrag.type = card.dataset.type||''; _kbDrag.due = card.dataset.due||null;
      _kbDrag.taskId = card.dataset.taskid||null;
      setTimeout(() => card.classList.add('kb-dragging'), 0);
    });
    card.addEventListener('dragend', _kbDragEnd);

    // Click (not on delete button) → open My Work item modal
    card.addEventListener('click', e => {
      if (e.target.closest('.kb-del-btn')) return;
      const taskId = card.dataset.taskid;
      if (!taskId) return; // meetings don't open modal
      const items = window._calItems || [];
      const item  = items.find(w => w.id === taskId);
      if (item && window.openWorkItemExpanded) {
        window.openWorkItemExpanded(item);
      } else if (taskId) {
        compassToast && compassToast('Switch to My Work tab to view this item.', 2500);
      }
    });

    const delBtn = card.querySelector('.kb-del-btn');
    if (delBtn) delBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (card.dataset.type === 'meeting') { card.remove(); _kbUpdateCapBars(); return; }
      _kbDel = { active: true, cardEl: card, cardId: card.dataset.id, taskId: card.dataset.taskid };
      const panel = document.getElementById('kb-del-panel');
      if (panel) panel.style.display = 'block';
      const inp = document.getElementById('kb-del-reason');
      if (inp) { inp.value = ''; inp.style.borderColor = ''; inp.focus(); }
    });
  });
}

function _kbDragEnd() {
  if (_kbDrag.card) _kbDrag.card.classList.remove('kb-dragging');
  _kbDrag = { card: null, srcColId: null, cardId: null, hrs: 0, type: '', due: null, taskId: null };
}

// ── KANBAN LIVE METRICS ──────────────────────────────────
// _kbUpdateCapBars: recomputes and repaints capacity bars after any drag/drop.
// _kbUpdateKpis: refreshes the 4 KPI tiles (total, billable, meetings, overdue).
function _kbUpdateCapBars() {
  const today = _kbIsoLocal(new Date());
  ['last','mon','tue','wed','thu','fri','sat','sun','next'].forEach(colId => {
    const body = document.getElementById('kb-body-' + colId);
    const col  = document.getElementById('kb-col-' + colId);
    if (!body || !col) return;
    const hdr  = col.querySelector('.kb-col-hdr');
    if (!hdr) return;

    const cap     = _kbComputeCapacity(colId, Array.from(body.querySelectorAll('.kb-card')));
    const colDate = _kbColDates[colId];
    const isNext  = colId === 'next';
    const isLast  = colId === 'last';
    const isPast  = colDate && colDate < today;

    // Rebuild the sub-header: bar + cap text
    // Remove old bar+text divs (everything after the day label div)
    const dayLbl = hdr.firstElementChild;
    while (hdr.children.length > 1) hdr.removeChild(hdr.lastChild);

    if (!isNext && !isLast) {
      // 8-segment billable bar
      const dayTeEntries = (window._calTimeEntries || []).filter(e => e.date && e.date.slice(0,10) === colDate);
      const dayBillH    = Math.min(dayTeEntries.filter(e => e.is_billable).reduce((s,e) => s+(parseFloat(e.hours)||0), 0), 8);
      const dayNonBillH = Math.min(dayTeEntries.filter(e => !e.is_billable).reduce((s,e) => s+(parseFloat(e.hours)||0), 0), Math.max(0, 8 - dayBillH));
      const segs = Array.from({length:8}, (_,i) => {
        const hr = i + 1;
        if (hr <= dayBillH)                return 'var(--compass-cyan,#00D2FF)';
        if (hr <= dayBillH + dayNonBillH)  return '#7F77DD';
        return 'rgba(255,255,255,.15)';
      });
      const barDiv = document.createElement('div');
      barDiv.style.cssText = 'display:flex;height:4px;gap:2px;margin-top:5px';
      segs.forEach(c => {
        const seg = document.createElement('div');
        seg.style.cssText = 'flex:1;height:4px;border-radius:1px;background:' + c;
        barDiv.appendChild(seg);
      });
      hdr.appendChild(barDiv);

      // Cap text
      let capTxt, capColor;
      if (isPast) {
        const dayTotalH = dayBillH + dayNonBillH;
        capTxt = dayTotalH > 0 ? dayBillH.toFixed(1) + 'h bill · ' + dayNonBillH.toFixed(1) + 'h non-bill' : '0h logged';
        capColor = 'var(--text3)';
      } else {
        capColor = cap.over ? 'var(--compass-red,#E24B4A)' : cap.pct > 85 ? 'var(--compass-amber,#EF9F27)' : 'var(--text3)';
        capTxt = cap.over ? cap.scheduled.toFixed(1) + 'h / ' + cap.available.toFixed(1) + 'h — over' : cap.scheduled.toFixed(1) + 'h / ' + cap.available.toFixed(1) + 'h avail';
      }
      const txtDiv = document.createElement('div');
      txtDiv.style.cssText = 'font-family:var(--font-mono,monospace);font-size:11px;color:' + capColor + ';margin-top:3px';
      txtDiv.textContent = capTxt;
      hdr.appendChild(txtDiv);
    } else {
      const count = body.querySelectorAll('.kb-card').length;
      const txtDiv = document.createElement('div');
      txtDiv.style.cssText = 'font-family:var(--font-mono,monospace);font-size:11px;color:var(--text3);margin-top:5px';
      txtDiv.textContent = count + ' item' + (count !== 1 ? 's' : '');
      hdr.appendChild(txtDiv);
    }
  });
}

// Update the KPI strip without a full re-render
function _kbUpdateKpis() {
  const kpiRow = document.getElementById('kb-kpi-row');
  if (!kpiRow) return;
  const today = _kbIsoLocal(new Date());

  let totalItems = 0, totalMtgHrs = 0, totalTaskHrs = 0;
  ['mon','tue','wed','thu','fri','sat','sun'].forEach(colId => {
    const body = document.getElementById('kb-body-' + colId);
    if (!body) return;
    body.querySelectorAll('.kb-card').forEach(c => {
      const h = parseFloat(c.dataset.hrs)||0;
      if (c.dataset.type === 'meeting') totalMtgHrs += h;
      else { totalTaskHrs += h; totalItems++; }
    });
  });

  // Last week hours
  const lastBody = document.getElementById('kb-body-last');
  let lastHrs = 0, lastCount = 0;
  if (lastBody) {
    lastBody.querySelectorAll('.kb-card').forEach(c => {
      if (c.dataset.type !== 'meeting') { lastHrs += parseFloat(c.dataset.hrs)||0; lastCount++; }
    });
  }
  // Next week hours
  const nextBody = document.getElementById('kb-body-next');
  let nextHrs = 0, nextCount = 0;
  if (nextBody) {
    nextBody.querySelectorAll('.kb-card').forEach(c => {
      if (c.dataset.type !== 'meeting') { nextHrs += parseFloat(c.dataset.hrs)||0; nextCount++; }
    });
  }

  // Billable stats from time entries (unchanged by drag)
  const teEntries = window._calTimeEntries || [];
  const monIso = _kbIsoLocal(_kbGetMonday(_kbWeekOffset));
  const friIso = _kbIsoLocal(new Date(_kbGetMonday(_kbWeekOffset).getTime() + 4*86400000));
  const weekTe = teEntries.filter(e => e.date >= monIso && e.date <= friIso);
  const billHrs = weekTe.filter(e => e.is_billable).reduce((s,e) => s+(parseFloat(e.hours)||0), 0);
  const nonBillHrs = weekTe.filter(e => !e.is_billable).reduce((s,e) => s+(parseFloat(e.hours)||0), 0);
  const totalLoggedHrs = billHrs + nonBillHrs;
  const billPct = totalLoggedHrs > 0 ? Math.round((billHrs/totalLoggedHrs)*100) : 0;

  kpiRow.innerHTML =
    '<div class="kb-kpi" style="border-left:2px solid rgba(226,75,74,.5)">' +
      '<div class="kb-kpi-lbl">Last week</div>' +
      '<div class="kb-kpi-val' + (lastCount > 0 ? ' warn' : '') + '">' + lastHrs.toFixed(0) + 'h</div>' +
      '<div class="kb-kpi-sub">' + lastCount + ' item' + (lastCount !== 1 ? 's' : '') + ' carried</div>' +
    '</div>' +
    '<div class="kb-kpi"><div class="kb-kpi-lbl">Scheduled</div><div class="kb-kpi-val info">' + totalItems + '</div><div class="kb-kpi-sub">items this week</div></div>' +
    '<div class="kb-kpi"><div class="kb-kpi-lbl">Billable logged</div><div class="kb-kpi-val' + (billPct >= 80 ? '' : ' warn') + '">' + billHrs.toFixed(1) + 'h</div><div class="kb-kpi-sub">' + billPct + '% of ' + totalLoggedHrs.toFixed(1) + 'h logged</div></div>' +
    '<div class="kb-kpi"><div class="kb-kpi-lbl">Non-billable</div><div class="kb-kpi-val">' + nonBillHrs.toFixed(1) + 'h</div><div class="kb-kpi-sub">' + (100-billPct) + '% of logged hours</div></div>' +
    '<div class="kb-kpi"><div class="kb-kpi-lbl">Meetings</div><div class="kb-kpi-val">' + totalMtgHrs.toFixed(1) + 'h</div><div class="kb-kpi-sub">calendar events</div></div>' +
    '<div class="kb-kpi"><div class="kb-kpi-lbl">Pending</div><div class="kb-kpi-val">—</div><div class="kb-kpi-sub">awaiting PM</div></div>' +
    '<div class="kb-kpi" style="border-right:2px solid rgba(0,210,255,.35)">' +
      '<div class="kb-kpi-lbl">Next week</div>' +
      '<div class="kb-kpi-val info">' + nextHrs.toFixed(0) + 'h</div>' +
      '<div class="kb-kpi-sub">' + nextCount + ' item' + (nextCount !== 1 ? 's' : '') + ' queued</div>' +
    '</div>';
}

// ── KANBAN NEGOTIATION PANEL ─────────────────────────────
// Shown when a card is dragged past its due date. Offers three paths:
//   ↩ Move it back | ◈ Find a slot (Compass) | ✓ Submit for PM approval
function _kbShowNeg(cardEl, destColId, dueDate) {
  const panel = document.getElementById('kb-neg-panel');
  const body  = document.getElementById('kb-neg-body');
  if (!panel) return;
  const title = cardEl.querySelector('.kb-card-title')?.textContent || 'Item';
  if (body) body.textContent = '"' + title + '" moved ' + (destColId === 'next' ? 'to backlog' : 'past its due date') + (dueDate ? ' (was due ' + dueDate + ')' : '') + '. PM approval required before the slip is confirmed. A CoC event will be logged.';
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function _kbNegMoveBack() {
  if (_kbNeg.cardEl && _kbNeg.srcColId) {
    const srcBody = document.getElementById('kb-body-' + _kbNeg.srcColId);
    if (srcBody) {
      _kbNeg.cardEl.classList.remove('kb-pending');
      _kbNeg.cardEl.dataset.colid = _kbNeg.srcColId;
      srcBody.insertBefore(_kbNeg.cardEl, srcBody.querySelector('.kb-dz') || null);
      _kbUpdateCapBars();
    }
  }
  document.getElementById('kb-neg-panel').style.display = 'none';
  _kbNeg = { active: false, cardEl: null, srcColId: null, destColId: null };
}

function _kbNegFindSlot() {
  document.getElementById('kb-neg-panel').style.display = 'none';
  compassToast('Compass is checking attendee availability \u2014 feature coming soon.', 3000);
  _kbNeg = { active: false, cardEl: null, srcColId: null, destColId: null };
}

async function _kbNegSubmit() {
  const card   = _kbNeg.cardEl;
  const taskId = card?.dataset.taskid;
  document.getElementById('kb-neg-panel').style.display = 'none';
  if (taskId && API) {
    try {
      await window.CoC.write('calendar.reposition', taskId, {
        entityType: 'task',
        stepName:   'Calendar slot moved past due date',
        notes:      'Moved to ' + (_kbNeg.destColId||'unknown') + ' past original due date. Submitted for PM approval.',
        outcome:    'pending',
      });
    } catch(err) { console.error('[Compass] Kanban CoC write failed:', err); }
  }
  compassToast('Submitted for PM approval \u2014 CoC logged.', 3000);
  _kbNeg = { active: false, cardEl: null, srcColId: null, destColId: null };
}

// ── KANBAN ADD / DELETE MODALS ───────────────────────────
// _kbAddOpen/Close/Confirm: local-only card creation (no immediate DB write).
// _kbDelConfirm: removes card + writes CoC event + notifies PM via toast.
function _kbAddOpen(colId) {
  _kbAddTarget = colId;
  const modal  = document.getElementById('kb-add-modal');
  const dayLbl = document.getElementById('kb-modal-day-lbl');
  if (!modal) return;
  if (dayLbl) {
    const colDate = _kbColDates[colId] || '';
    dayLbl.textContent = colId === 'next' ? 'Next week' : _kbFmtColDay(colId, colDate);
  }
  document.getElementById('kb-modal-title').value = '';
  document.getElementById('kb-modal-desc').value  = '';
  document.getElementById('kb-modal-dur').value   = '1';
  document.getElementById('kb-modal-type').value  = 'admin';
  modal.classList.add('open');
  document.getElementById('kb-modal-title').focus();
}

function _kbAddClose() {
  document.getElementById('kb-add-modal')?.classList.remove('open');
  _kbAddTarget = null;
}

function _kbAddConfirm() {
  const title = (document.getElementById('kb-modal-title')?.value || '').trim();
  const type  = document.getElementById('kb-modal-type')?.value || 'admin';
  const desc  = (document.getElementById('kb-modal-desc')?.value || '').trim();
  const dur   = parseFloat(document.getElementById('kb-modal-dur')?.value) || 1;
  const colId = _kbAddTarget;

  if (!title) {
    document.getElementById('kb-modal-title').style.borderColor = 'rgba(226,75,74,.6)';
    document.getElementById('kb-modal-title').focus();
    return;
  }

  const body = document.getElementById('kb-body-' + colId);
  if (!body) { _kbAddClose(); return; }

  // Build a card for the new item
  const typeLabels = { admin:'Admin', personal:'Personal', pto:'PTO', focus:'Focus block', task:'Task', other:'Other' };
  const newId = 'local-' + Date.now();
  const card  = document.createElement('div');
  card.className = 'kb-card';
  card.draggable = true;
  card.dataset.id     = newId;
  card.dataset.hrs    = String(dur);
  card.dataset.type   = type === 'task' ? 'task' : 'local';
  card.dataset.colid  = colId;
  card.dataset.due    = _kbColDates[colId] || '';
  card.innerHTML =
    '<button class="kb-del-btn" aria-label="Remove">\u00D7</button>' +
    '<div class="kb-card-proj">' + _esc(typeLabels[type] || type) + '</div>' +
    '<div class="kb-card-title">' + _esc(title) + '</div>' +
    (desc ? '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _esc(desc) + '</div>' : '') +
    '<div class="kb-card-foot"><span class="kb-pill kb-pill-hrs">' + dur + 'h</span></div>';

  // Insert before drop zone
  const dz = body.querySelector('.kb-dz');
  body.insertBefore(card, dz || null);

  // Wire the new card's drag + delete
  card.addEventListener('dragstart', e => {
    _kbDrag.card = card; _kbDrag.srcColId = card.dataset.colid;
    _kbDrag.cardId = card.dataset.id; _kbDrag.hrs = parseFloat(card.dataset.hrs)||0;
    _kbDrag.type = card.dataset.type; _kbDrag.due = card.dataset.due||null;
    _kbDrag.taskId = null;
    setTimeout(() => card.classList.add('kb-dragging'), 0);
  });
  card.addEventListener('dragend', _kbDragEnd);
  card.querySelector('.kb-del-btn')?.addEventListener('click', e => {
    e.stopPropagation(); card.remove(); _kbUpdateCapBars();
  });

  _kbUpdateCapBars();

  // Write a CoC event for non-local types if API available
  if ((type === 'task' || type === 'focus') && API) {
    window.CoC.write('calendar.item_added', newId, {
      entityType: 'calendar_item',
      notes:      title + (desc ? ': ' + desc : '') + ' — ' + dur + 'h on ' + (card.dataset.due||colId),
      outcome:    'scheduled',
    }).catch(() => {});
  }

  _kbAddClose();
  compassToast && compassToast('"' + title + '" added to ' + (colId === 'next' ? 'next week' : _kbFmtColDay(colId, _kbColDates[colId])), 2500);
}

async function _kbDelConfirm() {
  const reasonEl = document.getElementById('kb-del-reason');
  const reason   = reasonEl?.value.trim() || '';
  if (reason.length < 10) {
    if (reasonEl) reasonEl.style.borderColor = 'var(--compass-red,#E24B4A)';
    compassToast('Please enter a reason (min 10 characters).', 2500);
    return;
  }
  document.getElementById('kb-del-panel').style.display = 'none';
  const taskId  = _kbDel.taskId;
  if (taskId) {
    try {
      await window.CoC.write('calendar.slice_deleted', taskId, {
        entityType: 'task',
        notes:      reason,
        outcome:    'at_risk',
      });
    } catch(err) { console.error('[Compass] Kanban delete CoC failed:', err); }
  }
  _kbDel.cardEl?.remove();
  _kbUpdateCapBars();
  compassToast('Slice removed \u2014 CoC logged, PM notified.', 3000);
  _kbDel = { active: false, cardEl: null, cardId: null, taskId: null };
}



})();
