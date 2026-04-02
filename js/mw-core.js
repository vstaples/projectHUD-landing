// VERSION: 20260402-173000
console.log('%c[mw-core] v20260403-100000','background:#c47d18;color:#000;font-weight:700;padding:2px 8px;border-radius:3px');

// ── HTML escape helper (used throughout this module) ──────────────────────
function _esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
// My Work filter state
var _wfStatus    = (typeof _wfStatus    !== 'undefined') ? _wfStatus    : 'all';  // 'all' | 'not_started' | 'in_progress' | 'blocked'
var _wfProject   = (typeof _wfProject   !== 'undefined') ? _wfProject   : '';     // project id | '' = all
var _wfDateRange = (typeof _wfDateRange !== 'undefined') ? _wfDateRange : 'week'; // 'today' | 'week' | '30d' | 'all'
var _wfType      = (typeof _wfType      !== 'undefined') ? _wfType      : 'all';  // 'all' | 'task' | 'action'  [Session 16]
var _doneToday   = (typeof _doneToday   !== 'undefined') ? _doneToday   : [];     // session-persistent completed items  [Session 16]
var _activeGauge = (typeof _activeGauge !== 'undefined') ? _activeGauge : null;   // clicked gauge date key | null  [Session 16]
var _dwellTimer  = (typeof _dwellTimer  !== 'undefined') ? _dwellTimer  : null;   // gauge hover dwell timer  [Session 16]
// ── Diagram mode state ────────────────────────────────────────────────────
var _diagramMode  = (typeof _diagramMode  !== 'undefined') ? _diagramMode  : false; // LIST vs DIAGRAM toggle
var _diagScale    = (typeof _diagScale    !== 'undefined') ? _diagScale    : 1;
var _diagPanX     = (typeof _diagPanX     !== 'undefined') ? _diagPanX     : 0;
var _diagPanY     = (typeof _diagPanY     !== 'undefined') ? _diagPanY     : 0;
var _diagCollapsed = (typeof _diagCollapsed !== 'undefined') ? _diagCollapsed : new Set(); // collapsed project IDs
var _diagPanning  = (typeof _diagPanning  !== 'undefined') ? _diagPanning  : false;
var _diagLastX    = (typeof _diagLastX    !== 'undefined') ? _diagLastX    : 0;
var _diagLastY    = (typeof _diagLastY    !== 'undefined') ? _diagLastY    : 0;
var _weekOffset   = (typeof _weekOffset   !== 'undefined') ? _weekOffset   : 0;  // weeks back from current week

// ── Init ──────────────────────────────────────────────────
// compass-date is updated by _mwLoadUserView (shows week range when navigating)
document.getElementById('compass-date').textContent =
  new Date().toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  }).toUpperCase();


// ── Load shared base data ─────────────────────────────────
// ══════════════════════════════════════════════════════════
// VIEW: MY WORK (Individual Contributor) — Feature #1 · Session 16
// ══════════════════════════════════════════════════════════
window._mwLoadUserView = async function() {
  const loading = document.getElementById('compass-loading');
  const content = document.getElementById('user-content');
  // Reset lazy-load flags so tabs reload on view refresh
  window._requestsLoaded = false;
  
  if (!_myResource?.id) {
    if (loading) loading.style.display = 'none';
    content.style.display = 'block';

    // ── Wire CoC drag handle ─────────────────────────────
    (function() {
      const resizer = document.getElementById('mw-coc-resizer');
      const cocPanel = document.getElementById('mw-coc');
      if (!resizer || !cocPanel) return;
      let startX, startW;
      resizer.addEventListener('mousedown', function(e) {
        e.preventDefault();
        window._cocDragging = true;
        startX = e.clientX;
        startW = cocPanel.offsetWidth;
        resizer.style.background = 'rgba(0,210,255,.5)';
        const mm = function(e2) {
          const delta = startX - e2.clientX; // drag left = grow CoC
          const newW  = Math.max(180, Math.min(600, startW + delta));
          cocPanel.style.flex = 'none';
          cocPanel.style.width = newW + 'px';
        };
        const mu = function() {
          window._cocDragging = false;
          resizer.style.background = 'rgba(0,210,255,.08)';
          document.removeEventListener('mousemove', mm);
          document.removeEventListener('mouseup', mu);
        };
        document.addEventListener('mousemove', mm);
        document.addEventListener('mouseup', mu);
      });
    })();
    const d = _identityDebug;
    content.innerHTML = `
      <div style="padding:40px 20px;text-align:center">
        <div style="font-family:var(--font-mono);font-size:11px;color:var(--compass-red);
          margin-bottom:12px;letter-spacing:.12em">⚠ IDENTITY NOT RESOLVED</div>
        <div style="display:inline-block;text-align:left;background:var(--bg1);
          border:1px solid var(--border);padding:14px 20px;margin-bottom:16px;
          font-family:var(--font-data);font-size:11px;line-height:2;min-width:320px">
          <div style="color:var(--text3);letter-spacing:.08em;margin-bottom:4px">SESSION DETAILS</div>
          <div><span style="color:var(--text3)">Auth email&nbsp;&nbsp;&nbsp;</span>
            <span style="color:${d.authEmail?'var(--compass-cyan)':' var(--compass-red)'}">
              ${d.authEmail||'— not found in JWT —'}</span></div>
          <div><span style="color:var(--text3)">Auth UUID&nbsp;&nbsp;&nbsp;&nbsp;</span>
            <span style="color:var(--text2)">${d.authSub||'—'}</span></div>
          <div><span style="color:var(--text3)">App user ID&nbsp;&nbsp;</span>
            <span style="color:${d.appUserId&&d.appUserId!=='undefin…'?'var(--text2)':' var(--compass-red)'}">
              ${d.appUserId&&d.appUserId!=='undefin…'?d.appUserId:'— no users row found —'}</span></div>
          <div><span style="color:var(--text3)">Resource ID&nbsp;&nbsp;</span>
            <span style="color:${d.resourceId&&d.resourceId!=='undefin…'?'var(--text2)':' var(--compass-red)'}">
              ${d.resourceId&&d.resourceId!=='undefin…'?d.resourceId:'— not linked —'}</span></div>
          ${d.error?`<div style="color:var(--compass-red);margin-top:4px">Error: ${esc(d.error)}</div>`:''}
        </div>
        <div style="font-family:var(--font-body);font-size:12px;color:var(--text3);
          margin-bottom:16px;line-height:1.6;max-width:480px;margin-left:auto;margin-right:auto">
          ${d.authEmail
            ?`Logged in as <strong style="color:var(--text1)">${esc(d.authEmail)}</strong> but no matching resource was found.`
            :'No email found in session token. Try logging out and back in.'}
        </div>
        <a href="/users.html" style="font-family:var(--font-mono);font-size:11px;
          letter-spacing:.1em;color:var(--compass-cyan);text-decoration:none;
          border:1px solid rgba(0,210,255,.3);padding:6px 16px;margin-right:8px">USER MGMT →</a>
        <button onclick="_viewLoaded['user']=false;_mwLoadUserView()"
          style="font-family:var(--font-mono);font-size:11px;letter-spacing:.1em;
            color:var(--text2);background:none;border:1px solid var(--border);
            padding:6px 16px;cursor:pointer">RETRY</button>
      </div>`;
    return;
  }

  try {
    const resId = _myResource.id;
    const today = new Date().toLocaleDateString('en-CA');
    const todayDate = new Date(today + 'T00:00:00');
    const dayOfWeek = todayDate.getDay();
    const isoOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(todayDate);
    weekStart.setDate(todayDate.getDate() - isoOffset - (_weekOffset * 7));
    const weekStartDate = weekStart.toLocaleDateString('en-CA');
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
    const weekEndDate = weekEnd.toLocaleDateString('en-CA');
    const weekDays = Array.from({length:7}, (_, i) => {
      const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
      return d.toLocaleDateString('en-CA');
    });
    const weekLabels = ['MON','TUE','WED','THU','FRI','SAT','SUN'];

    // Update top-right date display to reflect current week view
    const dateEl = document.getElementById('compass-date');
    if (dateEl) {
      if (_weekOffset === 0) {
        dateEl.textContent = new Date().toLocaleDateString('en-US',{
          weekday:'short',month:'short',day:'numeric',year:'numeric'}).toUpperCase();
      } else {
        const ws = new Date(weekStart).toLocaleDateString('en-US',{month:'short',day:'numeric'});
        const we = new Date(weekEnd).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
        dateEl.textContent = (ws + ' – ' + we).toUpperCase();
      }
    }

    const [myTasks, myActionItems, wfInstances, myTimeEntries, myWeek, completedThisWeek, resolvedThisWeek, myPendingReviews] = await Promise.all([
      API.get(`tasks?select=id,name,project_id,status,due_date,pct_complete,budget_hours,effort_days,actual_hours,actual_start,complexity_rating&assigned_to=eq.${_myResource.user_id}&status=neq.complete&order=created_at.desc&limit=200`).catch(() => []),
      API.get(`workflow_action_items?select=id,title,body,status,due_date,owner_resource_id,owner_name,created_by_name,instance_id,negotiation_state&owner_resource_id=eq.${resId}&status=eq.open&limit=100`).catch(() => []),
      API.get(`workflow_instances?select=id,title,status,current_step_name,project_id,task_id&firm_id=eq.${window.FIRM_ID||'aaaaaaaa-0001-0001-0001-000000000001'}&status=in.(active,in_progress,pending,cancelled)&limit=200`).catch(() => []),
      API.get(`time_entries?resource_id=eq.${resId}&order=date.desc&limit=200&select=id,date,hours,is_billable,project_id,task_id,step_name,source_type,notes,week_start_date`).catch(() => []),
      API.get(`timesheet_weeks?resource_id=eq.${resId}&week_start_date=eq.${weekStartDate}&select=id,status,total_hours,billable_hours,submitted_at,approved_at,approver_name,rejection_reason&limit=1`).catch(() => []),
      API.get(`tasks?select=id,name,updated_at&assigned_to=eq.${_myResource.user_id}&status=eq.complete&updated_at=gte.${weekStartDate}T00:00:00&limit=100`).catch(() => []),
      API.get(`workflow_action_items?select=id,title,body,status,due_date,owner_resource_id,owner_name,created_by_name,instance_id,negotiation_state&owner_resource_id=eq.${resId}&status=eq.resolved&limit=100`).catch(() => []),
      // 4th parallel fetch: dedicated workflow_requests table (review/approve rows)
      API.get(`workflow_requests?owner_resource_id=eq.${resId}&status=eq.open&select=id,role,title,body,instance_id,owner_name,created_by_name,due_date,created_at&limit=100`).catch(() => []),
    ]);

    // _myCocEvents set after workItems built (below)
    // ── Hours per day ─────────────────────────────────────────────────
    const hoursByDay = {}, billableByDay = {};
    weekDays.forEach(d => { hoursByDay[d] = 0; billableByDay[d] = 0; });
    myTimeEntries.forEach(e => {
      if (Object.prototype.hasOwnProperty.call(hoursByDay, e.date)) {
        const h = parseFloat(e.hours || 0);
        hoursByDay[e.date] += h;
        if (e.is_billable) billableByDay[e.date] += h;
      }
    });

    // ── Week totals ───────────────────────────────────────────────────
    const weekEntries  = myTimeEntries.filter(e => weekDays.includes(e.date));
    const weekTotal    = weekEntries.reduce((s,e) => s + parseFloat(e.hours||0), 0);
    const weekBillable = weekEntries.filter(e=>e.is_billable).reduce((s,e)=>s+parseFloat(e.hours||0), 0);
    const todayTotal   = parseFloat(hoursByDay[today] || 0);
    const maxDayHours  = Math.max(...Object.values(hoursByDay), 1);

    // ── Work list ─────────────────────────────────────────────────────
    const workItems = [];
    (myTasks || [])
      .filter(t => t.status !== 'cancelled')
      .filter(t => { const p=parseFloat(t.pct_complete)||0; const pn=p<=1&&p>0?Math.round(p*100):Math.round(p); return pn < 100; })
      .forEach(t => {
        const proj = _projects.find(p => p.id === t.project_id);
        const overdue = t.due_date && t.due_date < today;
        const p = parseFloat(t.pct_complete)||0;
        const pctNorm = p<=1&&p>0?Math.round(p*100):Math.round(p);
        const budgetHrs = t.budget_hours ? parseFloat(t.budget_hours) : t.effort_days ? parseFloat(t.effort_days)*8 : null;
        workItems.push({ type:'task', id:t.id, title:t.name, project:proj?.name||'—',
          projectId:t.project_id||null, status:t.status, due:t.due_date, overdue, pct:pctNorm,
          budgetHours:  budgetHrs,
          effortDays:   t.effort_days  ? parseFloat(t.effort_days)  : null,
          actualHours:  t.actual_hours ? parseFloat(t.actual_hours) : null,
          actualStart:  t.actual_start||null,
          complexity:   t.complexity_rating||null,
          assignedTo:   t.assigned_to||null,
          urgency: overdue ? 0 : (t.due_date ? 1 : 2) });
      });

    // ── workflow_requests rows → workItems (PENDING REVIEWS section) ──────────
    // These are injected at urgency -1 so they always sort above regular tasks.
    // _wrRole is carried through so mw-events.js can route without title-prefix heuristic.
    const wrInstanceIds = new Set();
    (myPendingReviews||[]).forEach(wr => {
      workItems.push({
        type:            'action',
        id:              wr.id,
        title:           wr.title,
        project:         wr.role === 'approver' ? 'Pending Approval' : 'Pending Review',
        projectId:       null,
        status:          'open',
        due:             wr.due_date || null,
        overdue:         wr.due_date && wr.due_date < today,
        urgency:         -1,           // always top of queue, exempt from all date filters
        createdBy:       wr.created_by_name || null,
        createdAt:       wr.created_at || null,
        ownerName:       wr.owner_name || null,
        ownerResourceId: resId,
        instanceId:      wr.instance_id || null,
        body:            wr.body || null,
        _wrRole:         wr.role,      // 'reviewer' | 'approver' — used by mw-events routing
        _isWrRow:        true,
      });
      if (wr.instance_id) wrInstanceIds.add(wr.instance_id);
    });

    // ── Legacy action_items — exclude any that were migrated to workflow_requests ─
    // During cutover: skip action_items whose instance_id already has a workflow_requests row.
    (myActionItems||[]).filter(a=>a.owner_resource_id).forEach(a => {
      // Skip if this instance already covered by workflow_requests
      if (a.instance_id && wrInstanceIds.has(a.instance_id) &&
          ((a.title||'').startsWith('Review request:') || (a.title||'').startsWith('Approve request:'))) {
        return;
      }
      const overdue = a.due_date && a.due_date < today;
      workItems.push({ type:'action', id:a.id, title:a.title, project:'Action item',
        projectId:null, status:a.status||'open', due:a.due_date, overdue, urgency: overdue?0:1,
        createdBy: a.created_by_name||null,
        ownerName: a.owner_name||null, ownerResourceId: a.owner_resource_id||null,
        instanceId: a.instance_id||null,   // needed to route review requests
        body: a.body||null });
    });
    workItems.sort((a,b) => {
      if (a.urgency !== b.urgency) return a.urgency - b.urgency;
      if (a.due && b.due) return a.due.localeCompare(b.due);
      return 0;
    });
    // Filter out action items whose parent workflow instance is cancelled
    const cancelledInstanceIds = new Set(
      (wfInstances||[]).filter(i => i.status === 'cancelled').map(i => i.id)
    );
    const filteredItems = workItems.filter(w =>
      !w.instanceId || !cancelledInstanceIds.has(w.instanceId)
    );
    _wiItems = filteredItems;
    window._wiItems = filteredItems;
    window.myActionItems = myActionItems||[];
    window._myPendingReviews = myPendingReviews||[];
    window._wfInstances   = wfInstances||[];
    // Seed negotiation state cache from DB so row borders render correctly
    window._negStateCache = window._negStateCache || {};
    (myActionItems||[]).forEach(a => {
      if (a.negotiation_state) window._negStateCache[a.id] = a.negotiation_state;
    });
    _teEntries = myTimeEntries;
    window._myTimeEntries = myTimeEntries;
    window._weekEntries = myTimeEntries.filter(function(e){ return weekDays.includes(e.date); });
    window._today = today;

    // ── Fetch CoC events for all instances backing the user's work ────
    // ── Fetch CoC events (entity-based + actor-based) ──────────────────────────
    // Collect all entity IDs this user cares about: task IDs, action item IDs, project IDs
    const myTaskIds      = workItems.map(w=>w.id).filter(Boolean);
    const myAiIds        = (myActionItems||[]).map(a=>a.id).filter(Boolean);
    const myProjectIds   = [...new Set(workItems.map(w=>w.projectId).filter(Boolean))];
    // Also include workflow_instance IDs for migrated historical events
    const myInstIds      = (wfInstances||[]).filter(w=>
      myProjectIds.includes(w.project_id) || workItems.some(wi=>wi.id===w.task_id)
    ).map(w=>w.id);
    const allEntityIds   = [...new Set([...myTaskIds, ...myAiIds, ...myProjectIds, ...myInstIds])];

    let myCocEvents   = [];
    let actorCocEvents = [];

    // Use CoC service if fully loaded (coc.js deployed with readMany)
    if (typeof window.CoC?.readMany === 'function') {
      myCocEvents = allEntityIds.length
        ? await window.CoC.readMany(allEntityIds, { limit: 300 }).catch(() => [])
        : [];
      if (_myResource?.id) {
        actorCocEvents = await window.CoC.readMany([], {
          actorResourceId: _myResource.id, limit: 100
        }).catch(() => []);
      }
    } else {
      // Direct API fallback — used when coc.js is absent or a pre-readMany version
      // is deployed. Remove once coc.js is confirmed live on the server.
      if (allEntityIds.length) {
        myCocEvents = await API.get(
          `coc_events?select=id,entity_id,entity_type,event_type,step_name,event_notes,actor_name,actor_resource_id,outcome,metadata,occurred_at,created_at&entity_id=in.(${allEntityIds.join(',')})&order=occurred_at.desc&limit=300`
        ).catch(() => []);
      }
    }

    // Actor-name fallback for legacy rows (written before actor_resource_id was enforced)
    if (!actorCocEvents.length && _myResource?.name) {
      actorCocEvents = await API.get(
        `coc_events?actor_name=eq.${encodeURIComponent(_myResource.name)}&order=occurred_at.desc&limit=100&select=*`
      ).catch(() => []);
    }

    // Merge, deduplicate by id, sort by occurred_at (canonical timestamp)
    const cocMap = new Map();
    [...myCocEvents, ...actorCocEvents].forEach(e => cocMap.set(e.id, e));
    window._myCocEvents = [...cocMap.values()].sort(
      (a,b) => (b.occurred_at||b.created_at||'').localeCompare(a.occurred_at||a.created_at||'')
    );
    console.log('[Compass] myCocEvents:', window._myCocEvents.length,
      '| CoC service:', typeof window.CoC?.readMany === 'function' ? 'active' : 'fallback mode');
    if (_teFilter && !weekDays.includes(_teFilter)) _teFilter = null;

    const overdueCount = workItems.filter(w => w.overdue).length;
    const waiting    = workItems.filter(w => w.status==='not_started').length;
    const inProgress = workItems.filter(w => w.status==='in_progress').length;
    const blocked    = workItems.filter(w => w.status==='blocked').length;

    // Streak
    const uniqueDates = [...new Set(myTimeEntries.map(e=>e.date))].sort().reverse();
    let streak = 0;
    for (let i = 0; i < 60; i++) {
      const dd = new Date(today+'T00:00:00'); dd.setDate(dd.getDate()-i);
      if (uniqueDates.includes(dd.toLocaleDateString('en-CA'))) streak++; else if (i>0) break;
    }
    const firstName = (_myResource?.name||'there').split(' ')[0];
    const hour = new Date().getHours();
    const greeting = hour<12?'Good morning':hour<17?'Good afternoon':'Good evening';
    const weekOf = weekStart.toLocaleDateString('en-US',{month:'short',day:'numeric'});

    // Real completed counts this week (from DB, not session memory)
    const completedTasksCount  = (completedThisWeek||[]).length;
    const resolvedActionsCount = (resolvedThisWeek||[]).filter(a => {
      // Filter client-side since updated_at column may not exist on this table
      return true; // count all resolved for this resource this week (approximate)
    }).length;
    const weekDoneCount = completedTasksCount + resolvedActionsCount;
    const weekDoneLabel = (() => {
      if (weekDoneCount === 0) return '0 completed';
      const parts = [];
      if (completedTasksCount > 0)  parts.push(`${completedTasksCount} task${completedTasksCount!==1?'s':''}`);
      if (resolvedActionsCount > 0) parts.push(`${resolvedActionsCount} action${resolvedActionsCount!==1?'s':''}`);
      return parts.join(' · ') + ' done';
    })();

    // EOD nudge
    const nowHr = new Date().getHours() + new Date().getMinutes()/60;
    let eodNudge = null;
    if (nowHr >= 17 && todayTotal === 0) eodNudge = 'red';
    else if (nowHr >= 16 && todayTotal < 4) eodNudge = 'amber';

    // Timesheet status
    const myWeekRow = myWeek?.[0] || null;
    const wsStatus  = myWeekRow?.status || 'draft';
    const wsLabel   = {draft:'DRAFT',submitted:'SUBMITTED',approved:'APPROVED',rejected:'REJECTED',amended:'AMENDED'}[wsStatus]||wsStatus.toUpperCase();
    const wsColor   = wsStatus==='approved'?'var(--compass-green)':wsStatus==='submitted'?'var(--compass-cyan)':wsStatus==='rejected'?'var(--compass-red)':'var(--text3)';

    // Day dots M-F
    function dayDotHtml(d, label) {
      const hrs=hoursByDay[d]||0, isPast=d<today, isToday=d===today;
      let fill, border, char, color;
      if (isToday)           { fill='var(--compass-cyan)'; border='var(--compass-cyan)'; char='■'; color='#060a10'; }
      else if (isPast&&hrs>0){ fill='var(--compass-green)'; border='var(--compass-green)'; char='✓'; color='#060a10'; }
      else if (isPast)       { fill='var(--compass-red)'; border='var(--compass-red)'; char='!'; color='#fff'; }
      else                   { fill='transparent'; border='var(--muted)'; char='—'; color='var(--muted)'; }
      return `<div class="day-dot" data-day="${d}" title="${label} · ${hrs.toFixed(1)}h"
        style="display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer">
        <div style="width:22px;height:22px;border-radius:50%;background:${fill};
          border:1.5px solid ${border};display:flex;align-items:center;justify-content:center;
          font-size:10px;color:${color};font-family:var(--font-mono);font-weight:700;
          transition:transform .1s"
          onmouseenter="this.style.transform='scale(1.15)'"
          onmouseleave="this.style.transform='scale(1)'">${char}</div>
        <span style="font-family:var(--font-mono);font-size:11px;font-weight:600;color:var(--text3)">${label}</span>
      </div>`;
    }
    const dotsHtml = weekDays.slice(0,5).map((d,i)=>dayDotHtml(d,['M','T','W','T','F'][i])).join('');

    // ══════════════════════════════════════════════════════════
    // SPEEDOMETER GAUGES — original design preserved exactly.
    // Scaled from GW=90→74 so all 7 fit compactly side by side.
    // ALL visual elements kept: tick marks, dual arc (billable +
    // non-billable purple), needle, centre dot, pill readout.
    // ══════════════════════════════════════════════════════════
    const gaugeMax = 8; // fixed 8h scale: 8h = full right, 6h ≈ 2 o'clock, legend below confirms
    const GW=74, GH=70, GCX=37, GCY=48, GR=30;

    function gPt(deg) {
      const a = (deg - 180) * Math.PI / 180;
      return [(GCX + GR * Math.cos(a)).toFixed(1), (GCY + GR * Math.sin(a)).toFixed(1)];
    }
    function gArc(d1, d2) {
      if (d2 <= d1) return '';
      const [x1,y1] = gPt(d1), [x2,y2] = gPt(Math.min(d2, 179.9));
      return `M${x1},${y1} A${GR},${GR} 0 ${d2-d1>180?1:0} 1 ${x2},${y2}`;
    }

    // Tick marks + % labels — same geometry as original, rescaled
    const gTicks = Array.from({length:11}, (_,i) => {
      const deg = i * 18;
      const isMaj = i % 2 === 0;
      const a = (deg - 180) * Math.PI / 180;
      const r0 = GR + 2, r1 = isMaj ? GR + 7 : GR + 4;
      const x0=(GCX+r0*Math.cos(a)).toFixed(1), y0=(GCY+r0*Math.sin(a)).toFixed(1);
      const x1=(GCX+r1*Math.cos(a)).toFixed(1), y1=(GCY+r1*Math.sin(a)).toFixed(1);
      const tick = `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="rgba(255,255,255,.28)" stroke-width="${isMaj?1:.6}"/>`;
      if (!isMaj) return tick;
      const rl=GR+16, lx=(GCX+rl*Math.cos(a)).toFixed(1), ly=(GCY+rl*Math.sin(a)).toFixed(1);
      return tick + `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="central" font-size="7.5" font-family="monospace" font-weight="700" fill="rgba(255,255,255,.75)">${i*10}%</text>`;
    }).join('');

    const gaugesHtml = weekDays.map((d, i) => {
      const hrs=hoursByDay[d]||0, bill=billableByDay[d]||0, nonBill=hrs-bill;
      const isToday=d===today, isActive=_activeGauge===d;
      const pct=Math.min(hrs/gaugeMax,1), billPct=Math.min(bill/gaugeMax,1), nbPct=Math.min(nonBill/gaugeMax,1);
      const billEnd=billPct*180, nbEnd=(billPct+nbPct)*180;
      const needleRad=(pct*180-180)*Math.PI/180;
      const nx=(GCX+(GR-6)*Math.cos(needleRad)).toFixed(1);
      const ny=(GCY+(GR-6)*Math.sin(needleRad)).toFixed(1);
      const arcColor  = isActive?'#EF9F27':isToday?'#00D2FF':hrs>0?'#1D9E75':'rgba(255,255,255,.08)';
      const pillColor = isActive?'#EF9F27':isToday?'#00D2FF':hrs>0?'#1D9E75':'rgba(255,255,255,.2)';
      const dayColor  = isActive?'#EF9F27':isToday?'#00D2FF':'#6A94B8';
      const fw        = isToday||isActive?'600':'400';
      return `
      <div class="gauge-col" data-gauge-date="${d}" data-gauge-has-data="${hrs>0}"
        style="display:flex;flex-direction:column;align-items:center;gap:2px;flex:1;min-width:0;cursor:pointer">
        <svg viewBox="0 0 ${GW} ${GH}" width="${GW}" height="${GH}" style="overflow:visible">
          ${gTicks}
          <path d="${gArc(0,179.9)}" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="4" stroke-linecap="round"/>
          ${hrs>0?`
          ${bill>0?`<path d="${gArc(0,billEnd)}" fill="none" stroke="${arcColor}" stroke-width="4" stroke-linecap="round"/>`:''}
          ${nonBill>0?`<path d="${gArc(billEnd,nbEnd)}" fill="none" stroke="#8B5CF6" stroke-width="4" stroke-linecap="round"/>`:''}
          <line x1="${GCX}" y1="${GCY}" x2="${nx}" y2="${ny}" stroke="${arcColor}" stroke-width="1.5" stroke-linecap="round"/>
          <circle cx="${GCX}" cy="${GCY}" r="3" fill="${arcColor}"/>
          `:`<circle cx="${GCX}" cy="${GCY}" r="2" fill="rgba(255,255,255,.12)"/>`}
          <rect x="${GCX-17}" y="${GCY+5}" width="34" height="14" rx="7" fill="rgba(6,10,16,.7)" stroke="${pillColor}" stroke-width="1.2"/>
          <text x="${GCX}" y="${GCY+12}" text-anchor="middle" dominant-baseline="central"
            font-size="11" font-family="monospace" font-weight="700" fill="${pillColor}">
            ${hrs>0?hrs.toFixed(1)+'h':'—'}
          </text>
        </svg>
        <div style="font-family:var(--font-mono);font-size:11px;font-weight:700;
          color:${isToday||isActive?dayColor:'#F0F6FF'};text-align:center;line-height:1.4;letter-spacing:.04em">
          ${weekLabels[i]}<br>
          <span style="font-weight:400;color:${dayColor};font-size:11px">${new Date(d+'T00:00:00').getDate()}</span>
        </div>
      </div>`;
    }).join('');

    // Wire gauge hover tooltips after render (1.5s dwell)
    (function _wireGaugeHover() {
      var _gt = null, _gTimer = null;
      var container = document.getElementById('mw-gauge-row');
      if (!container) return;
      container.addEventListener('mouseover', function(ev) {
        var col = ev.target.closest('.gauge-col');
        if (!col) return;
        if (!ev.ctrlKey) return;  // Ctrl required
        clearTimeout(_gTimer);
        _gTimer = setTimeout(function() {
          if (_gt) { _gt.remove(); _gt = null; }
          var d    = col.dataset.gaugeDate;
          var te   = (window._myTimeEntries||[]).filter(function(e){ return e.date===d; });
          var hrs  = te.reduce(function(s,e){ return s+parseFloat(e.hours||0); },0);
          var bill = te.filter(function(e){ return e.is_billable; }).reduce(function(s,e){ return s+parseFloat(e.hours||0); },0);
          var label= new Date(d+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
          var html = '<div style="font-size:13px;font-weight:700;color:#F0F6FF;margin-bottom:6px">' + label + '</div>';
          if (!te.length) {
            html += '<div style="font-size:12px;color:#6A94B8">No time entries</div>';
          } else {
            html += '<div style="font-size:12px;color:#C8DFF0;margin-bottom:4px">' + hrs.toFixed(1) + 'h total &nbsp;·&nbsp; ' + bill.toFixed(1) + 'h billable</div>';
            html += '<div style="border-top:1px solid rgba(255,255,255,.08);margin:6px 0;padding-top:6px">';
            te.forEach(function(e) {
              var proj = (_projects||[]).find(function(p){ return p.id===e.project_id; });
              html += '<div style="display:flex;justify-content:space-between;gap:12px;font-size:11px;color:#90B8D8;margin-bottom:3px">';
              html += '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (proj?proj.name:e.step_name||'—') + '</span>';
              html += '<span style="flex-shrink:0;color:' + (e.is_billable?'#00D2FF':'#8B5CF6') + '">' + parseFloat(e.hours||0).toFixed(1) + 'h</span></div>';
            });
            html += '</div>';
          }
          _gt = document.createElement('div');
          _gt.style.cssText = 'position:fixed;z-index:9999;background:#0a1628;border:1px solid rgba(0,210,255,.25);border-left:3px solid #00D2FF;border-radius:3px;padding:10px 14px;font-family:inherit;min-width:180px;max-width:280px;box-shadow:0 8px 32px rgba(0,0,0,.7);pointer-events:none';
          _gt.innerHTML = html;
          document.body.appendChild(_gt);
          var r = col.getBoundingClientRect();
          var top = r.bottom + 6;
          var left = r.left + r.width/2 - 140;
          if (left < 8) left = 8;
          if (left + 280 > window.innerWidth - 8) left = window.innerWidth - 288;
          _gt.style.top  = top + 'px';
          _gt.style.left = left + 'px';
        }, 1500);
      });
      container.addEventListener('mouseout', function(ev) {
        var col = ev.target.closest('.gauge-col');
        if (!col) return;
        clearTimeout(_gTimer);
        if (_gt) { _gt.remove(); _gt = null; }
      });
    })();

    const barLegend = `
      <div style="display:flex;align-items:center;gap:12px;padding:0 13px 8px;
        font-family:var(--font-mono);font-size:11px;color:var(--text3)">
        <div style="display:flex;align-items:center;gap:5px">
          <div style="width:14px;height:4px;background:var(--compass-cyan);border-radius:2px"></div>
          <span>Billable</span></div>
        <div style="display:flex;align-items:center;gap:5px">
          <div style="width:14px;height:4px;background:#8B5CF6;border-radius:2px"></div>
          <span>Non-billable</span></div>
        <span>Scale: 8h = full</span>
        ${_activeGauge?`<button class="gauge-clear-btn" style="margin-left:auto;font-family:var(--font-mono);
          font-size:11px;color:var(--compass-amber);background:none;border:none;cursor:pointer;padding:0">
          ✕ clear filter</button>`:''}
      </div>`;

    // Recent time entries
    const displayEntries = _teFilter ? myTimeEntries.filter(e=>e.date===_teFilter) : myTimeEntries.slice(0,8);
    const filterLabel = _teFilter ? new Date(_teFilter+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}) : null;

    // EOD nudge HTML
    const eodNudgeHtml = (() => {
      if (!eodNudge) return '';
      const isRed=eodNudge==='red', c=isRed?'var(--compass-red)':'var(--compass-amber)';
      const bg=isRed?'rgba(226,75,74,.06)':'rgba(239,159,39,.06)';
      return `<div style="border-left:3px solid ${c};background:${bg};padding:9px 12px;margin-top:10px;
        display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div>
          <div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:${c}">
            ■ ${isRed?'No time logged today.':'Log today\'s time before EOD'}</div>
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);margin-top:2px">
            ${isRed?(8-todayTotal).toFixed(1)+'h gap':todayTotal.toFixed(1)+'h of ~8h expected'}</div>
        </div>
        <button class="open-weekly-ts-btn" data-expand-today="1"
          style="font-family:var(--font-mono);font-size:11px;font-weight:600;letter-spacing:.06em;
            padding:5px 10px;background:none;border:1px solid ${c};color:${c};cursor:pointer;
            white-space:nowrap;flex-shrink:0">Log today →</button>
      </div>`;
    })();

    // Work list rows
    function workListRows() {
      const cutoff30d = new Date(Date.now()+30*86400000).toLocaleDateString('en-CA');
      const filtered = workItems.filter(w => {
        if (_wfType !== 'all' && w.type !== _wfType) return false;
        if (_wfStatus !== 'all') {
          if (w.type!=='action' && w.status !== _wfStatus) return false;
        }
        if (_wfProject && w.projectId !== _wfProject) return false;
      const isRequestItem = w._isWrRow ||
        (w.title||'').startsWith('Review request:') || (w.title||'').startsWith('Approve request:');
      if (isRequestItem) return true; // always show — blocking items regardless of due date or type filter
        if (_wfDateRange==='today') return !w.due||w.due===today||w.overdue;
        if (_wfDateRange==='week')  return !w.due||w.due<=weekDays[6]||w.overdue;
        if (_wfDateRange==='30d')   return !w.due||w.due<=cutoff30d||w.overdue;
        return true;
      });
      if (!filtered.length) return `<div style="padding:18px 13px;text-align:center;
        font-family:var(--font-mono);font-size:12px;color:var(--text3)">No items match filters</div>`;
      return filtered.map(w => {
        const tc = w._isWrRow
          ? (w._wrRole==='approver'
              ? {c:'var(--compass-amber)',bg:'rgba(239,159,39,.1)',lbl:'Request'}
              : {c:'var(--compass-amber)',bg:'rgba(239,159,39,.1)',lbl:'Request'})
          : w.type==='task'
            ?{c:'var(--compass-cyan)',bg:'rgba(0,210,255,.08)',lbl:'Task'}
            :{c:'var(--compass-green)',bg:'rgba(29,158,117,.08)',lbl:'Action'};
        const badge=`<div style="display:inline-flex;align-items:center;padding:1px 7px;
          border:1px solid ${tc.c};background:${tc.bg};border-radius:3px;
          font-family:var(--font-mono);font-size:11px;font-weight:600;color:${tc.c};
          white-space:nowrap">${tc.lbl}</div>`;
        let progressCell=`<span style="font-family:var(--font-mono);font-size:11px;color:var(--text3)">—</span>`;
        if (w.type==='task'&&w.pct>0) {
          const fc=w.pct>=80?'var(--compass-green)':w.pct>=40?'var(--compass-cyan)':'rgba(255,255,255,.25)';
          progressCell=`<div style="position:relative;margin-top:10px">
            <div style="height:5px;background:rgba(255,255,255,.06);border-radius:3px;overflow:visible;position:relative">
              <div style="height:100%;width:${Math.min(w.pct,100)}%;background:${fc};border-radius:3px;transition:width .3s;position:relative">
                <span style="position:absolute;right:0;top:-14px;transform:translateX(50%);
                  font-family:var(--font-mono);font-size:11px;font-weight:700;color:${fc};white-space:nowrap">${w.pct}%</span>
              </div></div></div>`;
        }
        const dueCell=w.overdue
          ?`<span style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--compass-red)">${daysOverdue(w.due)}d</span>`
          :w.due?`<span style="font-family:var(--font-mono);font-size:11px;color:var(--text3)">${fmtDate(w.due)}</span>`
          :`<span style="color:var(--text3);font-size:11px">—</span>`;
        let btnLabel,btnStyle;
        if (w._isWrRow) {
          // workflow_requests rows always get a direct action button — no LOE negotiation
          btnLabel = w._wrRole === 'approver' ? 'Approve' : 'Review';
          btnStyle = `color:#060a10;border:1px solid var(--compass-cyan);background:var(--compass-cyan);font-weight:700`;
        } else if (w.type==='action') {
          const _ns = negGetState(w.id).state;
          if (_ns==='unrated') {
            // Must be rated before it can be resolved
            btnLabel='Rate';      btnStyle=`color:#111827;border:1px solid #F0F6FF;background:#F0F6FF;font-weight:700`;
          } else if (_ns==='pending' || _ns==='negotiating') {
            // Awaiting assigner response
            btnLabel='Pending';   btnStyle=`color:#8B5CF6;border:1px solid rgba(139,92,246,.4);background:none`;
          } else if (_ns==='escalated') {
            btnLabel='Escalated'; btnStyle=`color:var(--compass-red);border:1px solid rgba(226,75,74,.4);background:none`;
          } else {
            // agreed or any other state — ready to resolve
            btnLabel='Resolve';  btnStyle=`color:#fff;border:1px solid var(--compass-green);background:var(--compass-green);font-weight:700`;
          }
        }
        else if (w.status==='blocked')    {btnLabel='Unblock';    btnStyle=`color:var(--compass-amber);border:1px solid var(--compass-amber);background:none`;}
        else if (w.pct>=100)               {btnLabel='Mark Done';  btnStyle=`color:#060a10;border:none;background:#FFFFFF`;}
        else if (w.status==='in_progress'){btnLabel='In Progress';btnStyle=`color:var(--compass-amber);border:1px solid rgba(239,159,39,.5);background:none`;}
        else                               {btnLabel='Start';      btnStyle=`color:#060a10;border:1px solid #00D2FF;background:#00D2FF;font-weight:700`;}
        const _negBorder = w.type==='action' ? (() => { const _ns=negGetState(w.id).state; return _ns==='unrated'?'border-left:3px dashed rgba(255,255,255,.18)':_ns==='pending'?'border-left:3px dashed rgba(239,159,39,.5)':_ns==='negotiating'?'border-left:3px solid rgba(139,92,246,.6)':_ns==='agreed'?'border-left:3px solid rgba(29,158,117,.5)':_ns==='escalated'?'border-left:3px solid rgba(226,75,74,.5)':''; })() : '';
        // Check if parent workflow instance was cancelled/withdrawn
        const _instCancelled = w.instanceId
          ? (window._wfInstances||[]).find(i => i.id === w.instanceId)?.status === 'cancelled'
          : false;
        const _cancelStyle = _instCancelled ? 'opacity:.45;' : '';
        const _titleStyle  = _instCancelled ? 'text-decoration:line-through;color:rgba(255,255,255,.4);' : '';
        return `<div class="cmp-row wi-row" data-wi-id="${w.id}" data-wi-type="${w.type}"
          data-wi-status="${w.status}" data-wi-projectid="${w.projectId||''}"
          style="display:grid;grid-template-columns:14px 80px 1fr 140px 56px 78px;
            gap:0;align-items:center;padding:0 8px 0 4px;min-height:38px;${_negBorder}${_cancelStyle}">
          <div style="display:flex;align-items:center;justify-content:center">
            <div class="wi-complete-circle" data-wi-id="${w.id}" data-wi-type="${w.type}"
              data-wi-title="${esc(w.title)}" data-wi-projectid="${w.projectId||''}"
              data-wi-status="${w.status}" title="Click to mark complete"
              style="width:11px;height:11px;border-radius:50%;border:1.5px solid var(--text3);
                cursor:pointer;flex-shrink:0;transition:all .12s"
              onmouseenter="this.style.borderColor='var(--compass-green)';this.style.boxShadow='0 0 0 2px rgba(29,158,117,.25)'"
              onmouseleave="this.style.borderColor='var(--text3)';this.style.boxShadow='none'"></div>
          </div>
          <div style="padding:0 6px 0 2px;display:flex;align-items:center">${badge}</div>
          <div style="padding:8px 8px 8px 4px;min-width:0">
            <div style="font-family:var(--font-body);font-size:12px;font-weight:500;color:var(--text0);
              white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${_titleStyle}">${esc(w.title)}${_instCancelled?' <span style="font-size:10px;color:#E24B4A;font-family:var(--font-mono)">WITHDRAWN</span>':''}</div>
            <div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);margin-top:1px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              ${w._isWrRow
                ? `<span>From: ${esc(w.createdBy||'—')} · ${w.createdAt ? new Date(w.createdAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : '—'}</span>`
                : `<span>${esc(w.project)}${w.due?' · Due '+fmtDate(w.due):''}</span>`
              }
              ${w.type==='action'&&!w._isWrRow?(()=>{const _ns=negGetState(w.id).state;return _ns&&_ns!=='unrated'?getNegotiationBadgeHtml(_ns):'';})():''}</div>
          </div>
          <div style="padding:0 8px">${progressCell}</div>
          <div style="text-align:center">${dueCell}</div>
          <div style="padding:0 4px">
            <button class="wi-action-btn" data-wi-id="${w.id}" data-wi-type="${w.type}"
              data-wi-title="${esc(w.title)}" data-wi-projectid="${w.projectId||''}"
              data-wi-status="${w.status}" data-wi-pct="${w.pct||0}"
              style="width:100%;font-family:var(--font-mono);font-size:11px;font-weight:600;
                letter-spacing:.06em;padding:4px 0;cursor:pointer;border-radius:3px;
                transition:opacity .12s;${btnStyle}"
              onmouseenter="this.style.opacity='.8'" onmouseleave="this.style.opacity='1'">${btnLabel}</button>
          </div>
        </div>`;
      }).join('');
    }

    // Done Today rows
    function doneTodayRows() {
      if (!_doneToday.length) return `<div style="padding:12px 13px;font-family:var(--font-body);
        font-size:12px;color:var(--text3);font-style:italic">
        Nothing completed yet today — complete items from your work list to see them here.</div>`;
      return _doneToday.map(item=>{
        const sc=item.signal==='green'?'var(--compass-green)':item.signal==='red'?'var(--compass-red)':'var(--compass-amber)';
        return `<div style="display:flex;align-items:center;gap:8px;padding:7px 13px;border-bottom:1px solid var(--border)">
          <span style="color:var(--compass-green);font-size:13px;flex-shrink:0">✓</span>
          <div style="flex:1;min-width:0;overflow:hidden">
            <div style="font-family:var(--font-body);font-size:12px;font-weight:500;color:var(--text0);
              white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(item.title)}</div>
            <div style="font-family:var(--font-mono);font-size:11px;color:var(--text3)">
              ${esc(item.project||'—')} · ${item.time||'—'}${item.noTime?' · <span style="color:var(--text3)">no time logged</span>':''}</div>
          </div>
          ${item.signal?`<div style="width:8px;height:8px;border-radius:50%;background:${sc};flex-shrink:0"></div>`:`<div style="width:8px;height:8px"></div>`}
          <div style="font-family:var(--font-mono);font-size:13px;font-weight:700;
            color:${item.noTime?'var(--text3)':'var(--compass-cyan)'};flex-shrink:0">
            ${item.noTime?'—':(item.hours||0).toFixed(1)+'h'}</div>
        </div>`;
      }).join('');
    }

    content.innerHTML = `
    <!-- Calendar popup overlay -->
    <div id="user-cal-popup" style="display:none;position:fixed;top:44px;right:120px;width:310px;background:#0d1e35;border:1px solid rgba(0,210,255,.3);z-index:200;padding:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:#F0F6FF;letter-spacing:.06em" id="ucal-month-label">MARCH 2026</div>
        <div style="display:flex;gap:4px">
          <button onclick="ucalNav(-1)" style="width:22px;height:22px;background:none;border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.5);cursor:pointer;font-family:inherit;font-size:12px;display:flex;align-items:center;justify-content:center;transition:.12s" onmouseenter="this.style.borderColor='rgba(0,210,255,.3)';this.style.color='#00D2FF'" onmouseleave="this.style.borderColor='rgba(255,255,255,.12)';this.style.color='rgba(255,255,255,.5)'">&#8249;</button>
          <button onclick="ucalNav(1)"  style="width:22px;height:22px;background:none;border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.5);cursor:pointer;font-family:inherit;font-size:12px;display:flex;align-items:center;justify-content:center;transition:.12s" onmouseenter="this.style.borderColor='rgba(0,210,255,.3)';this.style.color='#00D2FF'" onmouseleave="this.style.borderColor='rgba(255,255,255,.12)';this.style.color='rgba(255,255,255,.5)'">&#8250;</button>
          <button onclick="toggleUserCalendar()" style="width:22px;height:22px;background:none;border:none;color:rgba(255,255,255,.4);cursor:pointer;font-size:14px">&#x2715;</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:8px">
        ${['M','T','W','T','F','S','S'].map(d=>`<div style="font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,.3);text-align:center;padding:3px 0;letter-spacing:.06em">${d}</div>`).join('')}
      </div>
      <div id="ucal-cells" style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:8px"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px">
        ${[['#8B5CF6','Meeting'],['#EF9F27','Due date'],['#00D2FF','Action item'],['#E24B4A','Concern']].map(([c,l])=>`<div style="display:flex;align-items:center;gap:4px;font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,.35)"><div style="width:7px;height:7px;border-radius:50%;background:${c}"></div>${l}</div>`).join('')}
      </div>
      <div id="ucal-agenda" style="border-top:1px solid rgba(255,255,255,.06);padding-top:8px"></div>
    </div>

    <!-- Since-last-login delta strip -->
    <div id="mw-delta-strip" style="display:none;align-items:center;gap:6px;flex-wrap:wrap;padding:7px 14px 7px;border-bottom:1px solid rgba(0,210,255,.07);background:rgba(0,210,255,.03)">
      <span style="font-family:var(--font-mono);font-size:10px;letter-spacing:.08em;color:rgba(255,255,255,.25);text-transform:uppercase;white-space:nowrap">Since last login</span>
      <div id="mw-delta-chips" style="display:flex;gap:6px;flex-wrap:wrap"></div>
    </div>

    <!-- Suite tabs -->
    <div id="user-suite-tabs" style="display:flex;border-bottom:1px solid rgba(255,255,255,.07);margin-bottom:12px;background:var(--bg0,#060a10);position:sticky;top:0;z-index:10">
      <button class="ust on" data-tab="work"      onclick="uSwitchTab('work',this)">My Work</button>
      <button class="ust"    data-tab="timesheet"  onclick="uSwitchTab('timesheet',this)">My Time</button>
      <button class="ust"    data-tab="calendar"   onclick="uSwitchTab('calendar',this)">My Calendar</button>
      <button class="ust"    data-tab="meetings"   onclick="uSwitchTab('meetings',this)">My Meetings <span id="ust-meetings-badge" class="ust-badge" style="display:none"></span></button>
      <button class="ust"    data-tab="views"      onclick="uSwitchTab('views',this)">My Views</button>
      <button class="ust"    data-tab="concerns"   onclick="uSwitchTab('concerns',this)">My Notes <span id="ust-concerns-badge" class="ust-badge ust-badge-red" style="display:none"></span></button>
      <button class="ust"    data-tab="requests"   onclick="uSwitchTab('requests',this)">My Requests <span id="ust-requests-badge" class="ust-badge" style="display:none"></span></button>
    </div>
    <style>
      .ust{font-family:var(--font-mono);font-size:12px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;padding:7px 14px;cursor:pointer;color:rgba(255,255,255,.35);background:none;border:none;border-bottom:2px solid transparent;transition:.12s;display:flex;align-items:center;gap:5px}
      .ust.on{color:#00D2FF;border-bottom-color:#00D2FF}
      .ust:hover:not(.on){color:rgba(255,255,255,.7)}
      .ust-badge{font-size:11px;padding:1px 6px;border-radius:2px}
      .ust-badge-red{background:rgba(226,75,74,.15);color:#E24B4A}
      .ust-badge-amber{background:rgba(239,159,39,.12);color:#EF9F27}
      .ust-badge-green{background:rgba(29,158,117,.12);color:#1D9E75}
      .utc{display:none}.utc.on{display:block}#utc-concerns.on{display:block}
      .myr-subnav{font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;padding:6px 14px;background:none;border:none;border-bottom:2px solid transparent;color:rgba(255,255,255,.35);cursor:pointer;transition:.12s;display:flex;align-items:center;gap:5px}
      .myr-subnav.on{color:#00D2FF;border-bottom-color:#00D2FF}
      .myr-subnav:hover:not(.on){color:rgba(255,255,255,.7)}
      .wf-catalog-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px;margin-bottom:14px}
      .wf-card{border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.02);padding:11px 13px 38px;cursor:pointer;transition:.12s;position:relative}
      .wf-card:hover{border-color:rgba(0,210,255,.25);background:rgba(0,210,255,.03)}
      .wf-card-top{display:flex;align-items:flex-start;gap:8px;margin-bottom:5px}
      .wf-icon{width:28px;height:28px;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0}
      .wf-card-title{font-size:12px;font-weight:700;color:#F0F6FF;line-height:1.3;flex:1}
      .wf-card-desc{font-size:11px;color:rgba(255,255,255,.45);line-height:1.55;margin-bottom:7px}
      .wf-card-meta{display:flex;gap:8px;flex-wrap:wrap;font-size:11px;color:rgba(255,255,255,.3)}
      .wf-card-submit{position:absolute;right:10px;bottom:10px;font-size:11px;padding:3px 10px;background:rgba(0,210,255,.08);border:1px solid rgba(0,210,255,.3);color:#00D2FF;cursor:pointer;font-family:var(--font-mono);letter-spacing:.06em;transition:.12s}
      .wf-card-submit:hover{background:rgba(0,210,255,.15)}
      .wf-card-new::before{content:'New';position:absolute;top:8px;right:8px;font-size:9px;padding:1px 6px;background:rgba(29,158,117,.15);border:1px solid rgba(29,158,117,.3);color:#1D9E75;letter-spacing:.08em;font-family:var(--font-mono)}
      .myr-cat-label{font-size:11px;letter-spacing:.08em;color:rgba(255,255,255,.25);text-transform:uppercase;margin:10px 0 6px;display:flex;align-items:center;gap:6px}
      .myr-cat-line{flex:1;height:1px;background:rgba(255,255,255,.06)}
      .myr-active-req{border:1px solid rgba(255,255,255,.08);margin-bottom:8px;overflow:hidden}
      .myr-ar-head{display:flex;align-items:center;gap:8px;padding:9px 13px;border-bottom:1px solid rgba(255,255,255,.05);cursor:pointer;transition:.12s}
      .myr-ar-head:hover{background:rgba(255,255,255,.02)}
      .myr-ar-body{padding:9px 13px;display:none}
      .myr-ar-body.open{display:block}
      .myr-pt-steps{display:flex;gap:0;position:relative;margin:5px 0 10px}
      .myr-pt-steps::before{content:'';position:absolute;top:9px;left:0;right:0;height:1px;background:rgba(255,255,255,.08);z-index:0}
      .myr-pt-step{display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;position:relative;z-index:1}
      .myr-pt-dot{width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex-shrink:0}
      .myr-ptd-done{background:#1D9E75;color:#fff}
      .myr-ptd-active{background:#00D2FF;color:#060a10;animation:myrActivePulse 1.5s infinite}
      @keyframes myrActivePulse{0%,100%{opacity:1}50%{opacity:.6}}
      .myr-ptd-pending{background:rgba(255,255,255,.08);color:rgba(255,255,255,.3);border:1px solid rgba(255,255,255,.12)}
      .myr-pt-name{font-size:10px;color:rgba(255,255,255,.35);text-align:center;letter-spacing:.04em;line-height:1.3;max-width:64px}
      .myr-pt-name.done{color:#1D9E75}.myr-pt-name.active{color:#00D2FF}
      .myr-hist-row{display:flex;align-items:center;gap:8px;padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.04);font-family:var(--font-mono);font-size:11px;cursor:pointer;transition:.12s}
      .myr-hist-row:hover{background:rgba(255,255,255,.02)}
      .myr-hist-outcome{font-size:11px;padding:1px 7px;border:1px solid;letter-spacing:.04em}
      .cal-tab-cell{height:40px;border-right:1px solid rgba(255,255,255,.08);border-bottom:1px solid rgba(255,255,255,.1);position:relative;cursor:pointer;transition:.12s}
      .cal-tab-cell:hover{background:rgba(0,210,255,.04)}
      .cal-tab-event{position:absolute;left:2px;right:2px;top:2px;border-radius:2px;padding:3px 5px;font-size:11px;overflow:hidden;font-family:var(--font-ui,system-ui);z-index:2}
      .cal-tab-ce-meeting{background:rgba(139,92,246,.2);border:1px solid rgba(139,92,246,.4);color:#C4B5F8}
      .cal-tab-ce-task{background:rgba(239,159,39,.15);border:1px solid rgba(239,159,39,.3);color:#F5D080}
      .cal-tab-ce-focus{background:rgba(0,210,255,.1);border:1px solid rgba(0,210,255,.25);color:#7DD8F0}
      .cal-tab-ce-pto{background:rgba(226,75,74,.1);border:1px solid rgba(226,75,74,.25);color:#F0A0A0}
      .cal-tab-ce-nonbill{background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.25);color:#C4B5F8}
      .delta-chip{font-family:var(--font-mono);font-size:11px;padding:2px 9px;border:1px solid;cursor:pointer;transition:.12s;white-space:nowrap}
      .delta-chip:hover{filter:brightness(1.15)}
      #mw-coc-drag:hover{background:rgba(0,210,255,.3)!important}
      #mw-coc-drag:active{background:rgba(0,210,255,.5)!important}
      #mw-done-resize:hover{background:rgba(0,210,255,.25)!important}
    </style>

    <!-- Tab: WORK (existing content wrapper) -->
    <div class="utc on" id="utc-work">

    <div id="mw-flex" style="display:flex;gap:0;align-items:flex-start;width:100%">
    <div style="flex:1;min-width:0">

    <!-- 1.A Greeting -->
    <div style="display:grid;grid-template-columns:1fr auto;align-items:center;gap:12px;margin-bottom:14px">
      <div>
        <div style="font-family:var(--font-mono);font-size:22px;font-weight:700;color:var(--text0);line-height:1.1">${greeting}, ${esc(firstName)}</div>
        <div style="font-family:var(--font-mono);font-size:12px;color:var(--text3);margin-top:2px">
          ${new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <!-- Calendar icon -->
        <button onclick="toggleUserCalendar()"
          style="width:30px;height:30px;background:none;border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.5);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .12s;flex-shrink:0"
          onmouseenter="this.style.borderColor='rgba(0,210,255,.3)';this.style.color='#00D2FF'"
          onmouseleave="this.style.borderColor='rgba(255,255,255,.1)';this.style.color='rgba(255,255,255,.5)'"
          title="My Calendar">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="2" width="12" height="11" rx="1" stroke="currentColor" stroke-width="1.2"/>
            <line x1="1" y1="5" x2="13" y2="5" stroke="currentColor" stroke-width="1.2"/>
            <line x1="4" y1="1" x2="4" y2="3" stroke="currentColor" stroke-width="1.2"/>
            <line x1="10" y1="1" x2="10" y2="3" stroke="currentColor" stroke-width="1.2"/>
          </svg>
        </button>
        <!-- CoC icon — toggles CoC panel -->
        <button data-action="toggle-coc"
          style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:.08em;height:30px;padding:0 10px;background:none;border:1px solid rgba(0,210,255,.2);color:rgba(0,210,255,.6);cursor:pointer;transition:all .12s;flex-shrink:0"
          title="Chain of Custody">CoC</button>
        ${streak>0&&weekDoneCount>0?`<div style="display:flex;align-items:center;gap:6px;padding:5px 12px;
          background:rgba(239,159,39,.1);border:1px solid rgba(239,159,39,.3);border-radius:4px;
          font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--compass-amber);white-space:nowrap">
          ■ ${streak}-day streak · ${weekDoneLabel}</div>`:streak>0?`<div style="display:flex;align-items:center;gap:6px;padding:5px 12px;
          background:rgba(0,210,255,.06);border:1px solid rgba(0,210,255,.2);border-radius:4px;
          font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--compass-cyan);white-space:nowrap">
          ■ ${streak}-day streak</div>`:''}
      </div>
    </div>

    <!-- 1.A 8-Card Strip -->
    <div id="mw-stat-strip" style="display:grid;grid-template-columns:repeat(8,1fr);gap:7px;margin-bottom:14px">
      <div class="stat-card" style="border-top:2px solid var(--text3)" onmouseenter="showStatTooltip(event,'waiting')" onmouseleave="hideStatTooltip()">
        <div class="stat-label" style="font-family:var(--font-mono)">Tasks Waiting</div>
        <div class="stat-value" style="font-family:var(--font-mono);color:var(--text3)">${waiting}</div>
        <div class="stat-sub" style="font-family:var(--font-mono)">assigned</div>
      </div>
      <div class="stat-card" style="border-top:2px solid var(--compass-cyan)" onmouseenter="showStatTooltip(event,'inprogress')" onmouseleave="hideStatTooltip()">
        <div class="stat-label" style="font-family:var(--font-mono)">Tasks In Progress</div>
        <div class="stat-value sv-cyan" style="font-family:var(--font-mono)">${inProgress}</div>
        <div class="stat-sub" style="font-family:var(--font-mono)">active now</div>
      </div>
      <div class="stat-card" style="border-top:2px solid var(--compass-red)" onmouseenter="showStatTooltip(event,'blocked')" onmouseleave="hideStatTooltip()">
        <div class="stat-label" style="font-family:var(--font-mono)">Tasks Blocked</div>
        <div class="stat-value" style="font-family:var(--font-mono);color:${blocked>0?'var(--compass-red)':'var(--text2)'}">${blocked}</div>
        <div class="stat-sub" style="font-family:var(--font-mono)">needs attention</div>
      </div>
      <div class="stat-card stat-done-today" style="border-top:2px solid var(--compass-green)" onmouseenter="showStatTooltip(event,'done')" onmouseleave="hideStatTooltip()">
        <div class="stat-label" style="font-family:var(--font-mono)">Done Today</div>
        <div class="stat-value" id="done-today-count" style="font-family:var(--font-mono);color:var(--compass-green)">${_doneToday.length}</div>
        <div class="stat-sub" style="font-family:var(--font-mono)">completed</div>
      </div>
      <div class="stat-card" style="border-top:2px solid var(--compass-amber)" onmouseenter="showStatTooltip(event,'hrs_week')" onmouseleave="hideStatTooltip()">
        <div class="stat-label" style="font-family:var(--font-mono)">Hrs — Week</div>
        <div class="stat-value sv-amber" style="font-family:var(--font-mono)">${weekTotal.toFixed(1)}</div>
        <div class="stat-sub" style="font-family:var(--font-mono)">${weekBillable.toFixed(1)}h billable</div>
      </div>
      <div class="stat-card" style="border-top:2px solid var(--compass-cyan)" onmouseenter="showStatTooltip(event,'hrs_today')" onmouseleave="hideStatTooltip()">
        <div class="stat-label" style="font-family:var(--font-mono)">Hrs — Today</div>
        <div class="stat-value sv-cyan" style="font-family:var(--font-mono)">${todayTotal.toFixed(1)}</div>
        <div class="stat-sub" style="font-family:var(--font-mono)">of ~8h expected</div>
      </div>
      <div class="stat-card" style="border-top:2px solid ${overdueCount>0?'var(--compass-amber)':'var(--border)'}" onmouseenter="showStatTooltip(event,'open')" onmouseleave="hideStatTooltip()">
        <div class="stat-label" style="font-family:var(--font-mono)">Open Items</div>
        <div class="stat-value" style="font-family:var(--font-mono);color:${overdueCount>0?'var(--compass-amber)':'var(--text1)'}">${workItems.length}</div>
        <div class="stat-sub" style="font-family:var(--font-mono);color:${overdueCount>0?'var(--compass-red)':'var(--text3)'}">${overdueCount>0?overdueCount+' overdue':'all current'}</div>
      </div>
      <div class="stat-card" style="border-top:2px solid var(--compass-purple)" onmouseenter="showStatTooltip(event,'workflows')" onmouseleave="hideStatTooltip()">
        <div class="stat-label" style="font-family:var(--font-mono)">Active Workflows</div>
        <div class="stat-value" style="font-family:var(--font-mono);color:var(--compass-purple)">${wfInstances.length}</div>
        <div class="stat-sub" style="font-family:var(--font-mono)">firm-wide</div>
      </div>
    </div>

        <!-- 1.B Speedometer Row + Bill/Non-bill bar -->
        <div class="cmp-panel" style="margin-bottom:14px">
          <div class="panel-hdr">
            <div class="panel-title" style="color:var(--compass-cyan);font-size:13px">${_weekOffset===0?'This week':_weekOffset===1?'Last week':`${_weekOffset} weeks ago`} — hours by day</div>
            <div style="display:flex;align-items:center;gap:6px">
              <!-- Back a week -->
              <button id="week-step-back"
                style="background:none;border:1px solid var(--border);color:var(--text3);
                  width:22px;height:22px;display:flex;align-items:center;justify-content:center;
                  cursor:pointer;font-size:12px;padding:0;line-height:1;transition:all .12s"
                onmouseenter="this.style.borderColor='var(--compass-cyan)';this.style.color='var(--compass-cyan)'"
                onmouseleave="this.style.borderColor='var(--border)';this.style.color='var(--text3)'">‹</button>
              <!-- Date range label -->
              <div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);min-width:86px;text-align:center">
                ${new Date(weekDays[0]+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}
                – ${new Date(weekDays[6]+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}
              </div>
              <!-- Forward a week (disabled when at current) -->
              <button id="week-step-fwd"
                ${_weekOffset===0?'disabled':''  }
                style="background:none;border:1px solid ${_weekOffset===0?'rgba(255,255,255,.08)':'var(--border)'};
                  color:${_weekOffset===0?'rgba(255,255,255,.15)':'var(--text3)'};
                  width:22px;height:22px;display:flex;align-items:center;justify-content:center;
                  cursor:${_weekOffset===0?'default':'pointer'};font-size:12px;padding:0;line-height:1;transition:all .12s"
                ${_weekOffset>0?`onmouseenter="this.style.borderColor='var(--compass-cyan)';this.style.color='var(--compass-cyan)'"
                  onmouseleave="this.style.borderColor='var(--border)';this.style.color='var(--text3)'"`:''}
                >›</button>
            </div>
          </div>
          <!-- Inner two-column: gauges left | bill summary right -->
          <div style="display:grid;grid-template-columns:auto 200px;gap:0;align-items:start">
            <!-- Gauges column -->
            <div>
              <div id="mw-gauge-row" style="display:flex;justify-content:flex-start;padding:8px 4px 0;gap:0">
                ${gaugesHtml}
              </div>
              ${barLegend}
            </div>
            <!-- Billable summary column -->
            <div style="padding:12px 14px 10px;border-left:1px solid var(--border);display:flex;flex-direction:column;gap:8px;min-width:0">
              <div style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text3)">Billable vs Non-Bill</div>
              <!-- Big numbers -->
              <div style="display:flex;justify-content:space-between;align-items:baseline">
                <div>
                  <div style="font-family:var(--font-mono);font-size:22px;font-weight:700;line-height:1;color:var(--compass-cyan)">${weekBillable.toFixed(1)}h</div>
                  <div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);margin-top:2px">billable</div>
                </div>
                <div style="text-align:right">
                  <div style="font-family:var(--font-mono);font-size:22px;font-weight:700;line-height:1;color:#8B5CF6">${(weekTotal-weekBillable).toFixed(1)}h</div>
                  <div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);margin-top:2px">non-bill</div>
                </div>
              </div>
              <!-- The bar -->
              ${weekTotal>0?`
              <div>
                <div style="display:flex;height:6px;border-radius:3px;overflow:hidden;background:rgba(255,255,255,.06)">
                  <div style="width:${(weekBillable/weekTotal*100).toFixed(1)}%;background:var(--compass-cyan);transition:width .4s ease"></div>
                  <div style="width:${((weekTotal-weekBillable)/weekTotal*100).toFixed(1)}%;background:#8B5CF6;transition:width .4s ease"></div>
                </div>
                <div style="display:flex;justify-content:space-between;margin-top:4px;font-family:var(--font-mono);font-size:11px;font-weight:700">
                  <span style="color:var(--compass-cyan)">${weekTotal>0?Math.round(weekBillable/weekTotal*100):0}%</span>
                  <span style="color:#8B5CF6">${weekTotal>0?Math.round((weekTotal-weekBillable)/weekTotal*100):0}%</span>
                </div>
              </div>
              <div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);border-top:1px solid var(--border);padding-top:8px">
                <span style="color:var(--text1);font-weight:600">${weekTotal.toFixed(1)}h</span> total this week
              </div>`:`<div style="font-family:var(--font-mono);font-size:12px;color:var(--text3)">No hours logged yet</div>`}
            </div>
          </div>
        </div>

        <!-- 1.B2 Recommended Sequence Panel -->
        <div id="mw-rec-seq" style="margin-bottom:14px;display:none"></div>

        <!-- 1.C Work List -->
        <div class="cmp-panel" id="mw-worklist-panel" style="margin-bottom:14px">
          <div class="panel-hdr" style="flex-wrap:wrap;gap:6px;padding-bottom:8px">
            <div class="panel-title" style="color:var(--compass-cyan);font-size:13px">My Work Queue</div>
            <button onclick="(function(){const el=document.getElementById('mw-rec-seq');if(!el)return;if(el.style.display==='none'){if(window._recSeqItems)renderRecSeq(window._recSeqItems);else buildRecommendedSequence(_wiItems);el.style.display='block';}else{el.style.display='none';}})()" title="Recommended sequence" style="font-family:var(--font-mono);font-size:11px;padding:2px 8px;background:rgba(0,210,255,.06);border:1px solid rgba(0,210,255,.2);color:rgba(0,210,255,.6);cursor:pointer;letter-spacing:.05em;transition:all .12s" onmouseenter="this.style.background='rgba(0,210,255,.12)'" onmouseleave="this.style.background='rgba(0,210,255,.06)'">⚡ Seq</button>
            <div style="display:flex;align-items:center;gap:0;border:1px solid rgba(255,255,255,.12);border-radius:12px;overflow:hidden;margin:0 auto">
              <button data-action="diagram-list" style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:.07em;padding:3px 12px;background:${_diagramMode?'none':'rgba(239,159,39,.2)'};color:${_diagramMode?'rgba(255,255,255,.3)':'#EF9F27'};border:none;cursor:pointer;transition:all .12s">LIST</button>
              <button data-action="diagram-diag" style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:.07em;padding:3px 12px;background:${_diagramMode?'rgba(239,159,39,.2)':'none'};color:${_diagramMode?'#EF9F27':'rgba(255,255,255,.3)'};border:none;border-left:1px solid rgba(255,255,255,.1);cursor:pointer;transition:all .12s">DIAGRAM</button>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              ${overdueCount>0?`<span class="panel-badge pb-red">${overdueCount} overdue</span>`:`<span class="panel-badge pb-green">All current</span>`}
              <div id="diag-zoom-controls" style="display:${_diagramMode?'flex':'none'};align-items:center;gap:4px">
                <button data-action="diag-zoom-out" style="font-family:var(--font-mono);font-size:13px;width:22px;height:22px;background:none;border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.4);cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1">−</button>
                <span id="diag-zoom-lbl" style="font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,.35);min-width:34px;text-align:center">${Math.round(_diagScale*100)}%</span>
                <button data-action="diag-zoom-in" style="font-family:var(--font-mono);font-size:13px;width:22px;height:22px;background:none;border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.4);cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1">+</button>
                <button data-action="diag-zoom-reset" style="font-family:var(--font-mono);font-size:11px;width:22px;height:22px;background:none;border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.4);cursor:pointer;display:flex;align-items:center;justify-content:center">↺</button>
                <button data-action="diag-maximize" style="font-family:var(--font-mono);font-size:11px;width:22px;height:22px;background:none;border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.4);cursor:pointer;display:flex;align-items:center;justify-content:center" title="Maximize">
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="4" height="4" stroke="currentColor" stroke-width="1.2"/><rect x="7" y="1" width="4" height="4" stroke="currentColor" stroke-width="1.2"/><rect x="1" y="7" width="4" height="4" stroke="currentColor" stroke-width="1.2"/><rect x="7" y="7" width="4" height="4" stroke="currentColor" stroke-width="1.2"/></svg>
                </button>
              </div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;padding:7px 13px;
            border-bottom:1px solid var(--border);flex-wrap:wrap;background:var(--bg2)">
            <span style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--muted);letter-spacing:.06em">TYPE</span>
            <div style="display:flex;gap:3px">
              ${['all','task','action'].map(t=>{const labels={all:'All',task:'Tasks',action:'Actions'},active=_wfType===t;return `<button class="wf-type-btn" data-type="${t}" style="font-family:var(--font-mono);font-size:11px;font-weight:600;padding:3px 8px;background:${active?'rgba(139,92,246,.25)':'none'};color:${active?'#8B5CF6':'var(--text2)'};border:1px solid ${active?'#8B5CF6':'var(--border)'};cursor:pointer">${labels[t]}</button>`;}).join('')}
            </div>
            <span style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--muted);letter-spacing:.06em;margin-left:4px">STATUS</span>
            <div style="display:flex;gap:3px">
              ${['all','not_started','in_progress','blocked'].map(s=>{const labels={all:'All',not_started:'Not started',in_progress:'In progress',blocked:'Blocked'},active=_wfStatus===s;return `<button class="wf-status-btn" data-status="${s}" style="font-family:var(--font-mono);font-size:11px;font-weight:600;padding:3px 8px;background:${active?'rgba(0,210,255,.12)':'none'};color:${active?'var(--compass-cyan)':'var(--text2)'};border:1px solid ${active?'var(--compass-cyan)':'var(--border)'};cursor:pointer">${labels[s]}</button>`;}).join('')}
            </div>
            <span style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--muted);letter-spacing:.06em;margin-left:4px">RANGE</span>
            <div style="display:flex;gap:3px">
              ${[['today','Today'],['week','Week'],['30d','30d'],['all','All time']].map(([v,l])=>{const active=_wfDateRange===v;return `<button class="wf-date-btn" data-range="${v}" style="font-family:var(--font-mono);font-size:11px;font-weight:600;padding:3px 8px;background:${active?'rgba(239,159,39,.15)':'none'};color:${active?'var(--compass-amber)':'var(--text2)'};border:1px solid ${active?'var(--compass-amber)':'var(--border)'};cursor:pointer">${l}</button>`;}).join('')}
            </div>
            <select class="wf-proj-sel" style="font-family:var(--font-mono);font-size:11px;padding:3px 8px;
              background:var(--bg1);color:var(--text1);border:1px solid ${_wfProject?'var(--compass-cyan)':'var(--border)'};
              cursor:pointer;flex:1;min-width:100px;max-width:160px;margin-left:auto">
              <option value="">All projects</option>
              ${[...new Set(workItems.filter(w=>w.projectId).map(w=>w.projectId))].map(pid=>{const p=_projects.find(p=>p.id===pid);return p?`<option value="${p.id}" ${_wfProject===p.id?'selected':''}}>${esc(p.name)}</option>`:'';}).join('')}
            </select>
          </div>
          <div style="display:grid;grid-template-columns:14px 80px 1fr 140px 56px 78px;
            gap:0;padding:5px 8px 5px 4px;border-bottom:1px solid var(--border);
            font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text3);
            letter-spacing:.08em;text-transform:uppercase">
            <div></div><div style="padding-left:2px">TYPE</div>
            <div style="padding-left:4px">TASK / ACTION</div>
            <div style="padding:0 8px">PROGRESS</div>
            <div style="text-align:center">DUE</div>
            <div style="text-align:center;position:relative">
              <span id="wq-legend-btn"
                style="font-family:var(--font-mono);font-size:10px;color:rgba(0,210,255,.4);cursor:help;border:1px solid rgba(0,210,255,.2);border-radius:2px;padding:0 4px;line-height:1.6"
                onmouseenter="window._wqLegendEnter(this,event)"
                onmouseleave="clearTimeout(window._wqLegendTimer)">?</span>
            </div>
          </div>
          <div id="work-list-rows" style="${_diagramMode?'display:none':''}">${workListRows()}</div>
          <!-- Diagram view -->
          <div id="mw-diagram-wrap" style="${_diagramMode?'':'display:none'}">
            <!-- 4-cell diagram grid:
                 [corner][timeline header — h-scroll only]
                 [stub col — v-scroll only][card canvas — both] -->
            <div id="mw-diag-tl-wrap" style="height:480px;display:grid;grid-template-columns:150px 1fr;grid-template-rows:36px 1fr;background:var(--bg0);background-image:radial-gradient(rgba(0,210,255,.05) 1px,transparent 1px);background-size:24px 24px">
              <!-- Top-left: fixed corner -->
              <div style="background:#060a10;border-right:1px solid rgba(0,210,255,.08);border-bottom:1px solid rgba(0,210,255,.1);z-index:10"></div>
              <!-- Top-right: timeline header — h-scroll synced, no v-scroll -->
              <div id="mw-diag-tl-header" style="overflow:hidden;background:#060a10;border-bottom:1px solid rgba(0,210,255,.1);z-index:10"></div>
              <!-- Bottom-left: stub column — v-scroll synced, no h-scroll -->
              <div id="mw-diag-stub-col" style="overflow:hidden;background:var(--bg0);border-right:1px solid rgba(0,210,255,.08);z-index:9"></div>
              <!-- Bottom-right: card canvas — master scroll source -->
              <div id="mw-diag-canvas-wrap" style="overflow:auto;cursor:grab;position:relative">
                <div id="mw-diag-root"></div>
              </div>
            </div>
            <div style="display:flex;gap:12px;padding:5px 14px;border-top:1px solid rgba(255,255,255,.04);flex-wrap:wrap">
              <div style="display:flex;align-items:center;gap:5px;font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,.3)"><div style="width:8px;height:8px;border-radius:1px;background:#E24B4A"></div>Overdue</div>
              <div style="display:flex;align-items:center;gap:5px;font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,.3)"><div style="width:8px;height:8px;border-radius:1px;background:#EF9F27"></div>Due today</div>
              <div style="display:flex;align-items:center;gap:5px;font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,.3)"><div style="width:8px;height:8px;border-radius:1px;background:#00D2FF"></div>Task</div>
              <div style="display:flex;align-items:center;gap:5px;font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,.3)"><div style="width:8px;height:8px;border-radius:1px;background:#8B5CF6"></div>Action item</div>
              <div style="display:flex;align-items:center;gap:6px;font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,.25)">Capacity bar:</div>
              <div style="display:flex;align-items:center;gap:5px;font-family:var(--font-mono);font-size:11px;color:rgba(29,158,117,.6)"><div style="width:20px;height:4px;border-radius:1px;background:#1D9E75"></div>&lt;70%</div>
              <div style="display:flex;align-items:center;gap:5px;font-family:var(--font-mono);font-size:11px;color:rgba(239,159,39,.6)"><div style="width:20px;height:4px;border-radius:1px;background:#EF9F27"></div>&gt;70%</div>
              <div style="display:flex;align-items:center;gap:5px;font-family:var(--font-mono);font-size:11px;color:rgba(226,75,74,.6)"><div style="width:20px;height:4px;border-radius:1px;background:#E24B4A"></div>Over</div>
              <div style="display:flex;align-items:center;gap:5px;font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,.25);margin-left:auto">Scroll to zoom · drag to pan</div>
            </div>
          </div>
        </div>


      </div>


      <div id="mw-right" style="width:300px;flex-shrink:0;padding-left:14px;display:flex;flex-direction:column">
        <!-- 1.E Timesheet Status -->
        <div class="cmp-panel" style="margin-bottom:14px">
          <div style="padding:10px 13px 6px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
              <span style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--text1)">WEEK OF ${weekOf}</span>
              <span style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:.1em;
                color:${wsColor};border:1px solid ${wsColor};padding:1px 7px">${wsLabel}</span>
            </div>
            <div style="font-family:var(--font-mono);font-size:26px;font-weight:700;color:var(--text0);line-height:1">${weekTotal.toFixed(1)}h</div>
            <div style="font-family:var(--font-mono);font-size:12px;color:var(--text3);margin-top:2px">
              <span style="color:var(--compass-cyan)">${weekBillable.toFixed(1)}h billable</span>
              · <span style="color:#8B5CF6">${(weekTotal-weekBillable).toFixed(1)}h non-billable</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-around;
            padding:8px 13px 10px;border-top:1px solid var(--border);border-bottom:1px solid var(--border)">
            ${dotsHtml}
          </div>
          ${eodNudgeHtml}
          <div style="padding:8px 13px;display:flex;gap:8px;align-items:center">
            <button class="open-weekly-ts-btn"
              style="flex:1;font-family:var(--font-mono);font-size:11px;font-weight:700;
                letter-spacing:.07em;text-transform:uppercase;padding:7px;
                background:none;border:1px solid rgba(0,210,255,.3);color:var(--compass-cyan);
                cursor:pointer;transition:background .12s"
              onmouseenter="this.style.background='rgba(0,210,255,.07)'"
              onmouseleave="this.style.background='none'">Full week view →</button>
            ${(wsStatus==='draft'||wsStatus==='rejected'||wsStatus==='amended')?`
            <button class="ts-submit-btn" data-week-id="${myWeekRow?.id||''}"
              data-week-start="${weekStartDate}" data-week-hours="${weekTotal.toFixed(1)}"
              style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:.07em;
                text-transform:uppercase;padding:7px 14px;background:var(--compass-cyan);
                color:#060a10;border:none;cursor:pointer;transition:opacity .12s"
              onmouseenter="this.style.opacity='.85'" onmouseleave="this.style.opacity='1'">Submit →</button>`:''}
          </div>
        </div>

        <!-- Time log -->
        <div id="mw-timelog" class="cmp-panel" style="margin-bottom:0;overflow-y:auto;flex-shrink:0">
          <div class="panel-hdr">
            <div class="panel-title">Time log${filterLabel?' — '+filterLabel:' — recent'}</div>
            <div style="display:flex;gap:8px;align-items:center">
              ${filterLabel?`<button class="te-clear-filter"
                style="font-family:var(--font-mono);font-size:11px;color:var(--compass-amber);
                  background:none;border:none;cursor:pointer;padding:0">✕ clear</button>`:''  }
              <button class="te-new-btn"
                style="font-family:var(--font-mono);font-size:11px;font-weight:700;
                  letter-spacing:.06em;color:var(--compass-cyan);background:none;
                  border:1px solid rgba(0,210,255,.25);padding:3px 8px;cursor:pointer"
                onmouseenter="this.style.background='rgba(0,210,255,.08)'"
                onmouseleave="this.style.background='none'">+ Log time</button>
              <button class="te-week-footer"
                style="font-family:var(--font-mono);font-size:11px;color:var(--text3);
                  background:none;border:none;cursor:pointer;padding:0">Week view →</button>
            </div>
          </div>
          ${displayEntries.length===0
            ?`<div style="padding:14px 13px;font-family:var(--font-mono);font-size:12px;color:var(--text3)">
              ${filterLabel?'No entries for this day':'No time entries this period'}</div>`
            :displayEntries.map(e=>{
              const proj=_projects.find(p=>p.id===e.project_id);
              const srcIcon=e.source_type==='step_comment'?'◈':e.source_type==='action_item'?'⊡':'●';
              const srcColor=e.source_type==='step_comment'?'var(--compass-cyan)':e.source_type==='action_item'?'var(--compass-purple)':'var(--text3)';
              const isCadence=e.source_type==='step_comment';
              return `<div class="te-row" data-te-id="${e.id}" data-te-cadence="${isCadence}"
                style="display:flex;align-items:center;gap:8px;padding:7px 13px;
                  border-bottom:1px solid var(--border);cursor:pointer;transition:background .1s;
                  border-left:2px solid ${_teSelected===e.id?'var(--compass-cyan)':'transparent'};
                  background:${_teSelected===e.id?'rgba(0,210,255,.04)':''}"
                onmouseenter="this.style.background='var(--bg2)'"
                onmouseleave="this.style.background='${_teSelected===e.id?'rgba(0,210,255,.04)':''}' ">
                <div style="font-size:13px;color:${srcColor};flex-shrink:0">${srcIcon}</div>
                <div style="flex:1;min-width:0">
                  <div style="font-family:var(--font-body);font-size:12px;font-weight:500;
                    color:var(--text0);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                    ${e.step_name?esc(e.step_name):esc(proj?.name||'—')}</div>
                  <div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);margin-top:1px">
                    ${fmtDate(e.date)} · ${e.is_billable?'Billable':'Non-billable'}
                    ${isCadence?' · <span style="color:var(--compass-cyan)">via Cadence</span>':''}</div>
                </div>
                <div style="font-family:var(--font-mono);font-size:13px;font-weight:700;
                  color:${e.is_billable?'var(--compass-green)':'var(--text2)'};flex-shrink:0">
                  ${parseFloat(e.hours).toFixed(1)}h</div>
              </div>`;
            }).join('')
            +`<div style="padding:8px 13px;display:flex;justify-content:space-between;
              align-items:center;border-top:1px solid var(--border)">
              <span style="font-family:var(--font-mono);font-size:11px;color:var(--text3)">
                ${filterLabel?filterLabel+' total':'Week of '+new Date(weekStartDate+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>
              <div style="display:flex;align-items:center;gap:12px">
                <span style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--compass-cyan)">
                  ${filterLabel?displayEntries.reduce((s,e)=>s+parseFloat(e.hours||0),0).toFixed(1):weekTotal.toFixed(1)}h</span>
                <button class="te-week-footer"
                  style="font-family:var(--font-mono);font-size:11px;color:var(--compass-cyan);
                    background:none;border:1px solid rgba(0,210,255,.25);padding:3px 10px;cursor:pointer"
                  onmouseenter="this.style.background='rgba(0,210,255,.08)'"
                  onmouseleave="this.style.background='none'">Week view →</button>
              </div>
            </div>`}
        </div>


      <!-- Done Today — with vertical drag handle above -->
        <div id="mw-done-resize" style="height:5px;cursor:row-resize;background:rgba(0,210,255,.08);border-top:1px solid rgba(0,210,255,.12);transition:background .15s" data-action="done-resize"></div>
        <div id="mw-done-today" style="flex:1;overflow-y:auto;min-height:80px">
          <div class="cmp-panel" style="height:100%;margin-bottom:0">
            <div class="panel-hdr" style="flex-shrink:0">
              <div class="panel-title">Done today
                ${_doneToday.length>0?`<span style="font-family:var(--font-mono);font-size:11px;font-weight:600;color:var(--compass-green);margin-left:8px">${_doneToday.length} completed</span>`:''}</div>
            </div>
            <div id="done-today-list" style="overflow-y:auto">${doneTodayRows()}</div>
          </div>
        </div>
      </div>

      <!-- CoC Panel — fills remaining space -->
      <div id="mw-coc" style="display:none;flex-direction:column;width:300px;flex-shrink:0;background:#060c18;border-left:1px solid rgba(0,210,255,.15);position:relative">
        <!-- Drag handle on left edge -->
        <div id="mw-coc-drag" style="position:absolute;left:0;top:0;width:5px;height:100%;cursor:col-resize;z-index:10;background:transparent"></div>
        <div style="display:flex;flex-direction:column;height:100%;overflow-y:auto">
        <div style="position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;padding:10px 14px 8px;background:#060a10;border-bottom:1px solid rgba(0,210,255,.1)">
          <div>
            <div style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:#F0F6FF;letter-spacing:.05em">Chain of Custody</div>
            <div id="mw-coc-count" style="font-family:var(--font-mono);font-size:11px;color:var(--text3);margin-top:1px"></div>
          </div>
        </div>
        <div id="mw-coc-body" style="padding:10px 14px">
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--text3)">No history yet.</div>
        </div>
      </div>

        </div><!-- end inner scroll -->
    </div><!-- end mw-coc -->
    </div><!-- end mw-flex -->

    </div><!-- end utc-work -->

    <!-- Tab: TIMESHEET — my-time.html injected here on first activation -->
    <div class="utc" id="utc-timesheet">
      <div id="mt-root"></div>
    </div>

    <!-- Tab: MEETINGS -->
    <div class="utc" id="utc-meetings">
      <div id="user-meetings-content"><div style="font-family:var(--font-mono);font-size:12px;color:#3A5C80;padding:16px 0">Loading meetings…</div></div>
    </div>

    <!-- Tab: MY VIEWS — my-views.html injected here on first activation -->
    <div class="utc" id="utc-views">
      <div id="views-root"></div>
    </div>

    <!-- Tab: CONCERNS -->
    <div class="utc" id="utc-concerns">
      <div id="notes-root"></div>
    </div>

    <!-- Tab: MY CALENDAR — my-calendar.html injected here on first activation -->
    <div class="utc" id="utc-calendar">
      <div id="cal-root"></div>
    </div>

    <!-- Tab: MY REQUESTS -->
    <div class="utc" id="utc-requests">
      <div id="user-requests-content">
        <div style="display:flex;align-items:center;gap:0;margin-bottom:14px;border-bottom:1px solid rgba(255,255,255,.06);">
          <button class="myr-subnav on" data-myr="browse" onclick="myrSwitchView('browse',this)">Browse</button>
          <button class="myr-subnav" data-myr="active" onclick="myrSwitchView('active',this)">Active <span id="myr-active-badge" class="ust-badge ust-badge-amber" style="display:none"></span></button>
          <button class="myr-subnav" data-myr="history" onclick="myrSwitchView('history',this)">History</button>
          <div style="margin-left:auto;display:flex;align-items:center;gap:8px;padding-right:4px">
            <button onclick="myrDevPurge()" title="DEV — purge all requests from Supabase"
              style="font-family:var(--font-mono);font-size:10px;letter-spacing:.06em;padding:2px 9px;
                     background:rgba(226,75,74,.08);border:1px solid rgba(226,75,74,.3);
                     color:rgba(226,75,74,.6);cursor:pointer;border-radius:2px;white-space:nowrap">
              ⚠ DEV: Purge
            </button>
            <div style="font-family:var(--font-mono);font-size:10px;color:rgba(255,255,255,.2);letter-spacing:.06em">Powered by <span style="color:rgba(0,210,255,.5)">CadenceHUD</span> workflow engine</div>
          </div>
        </div>
        <div id="myr-pane-browse">
          <div id="myr-catalog-content"><div style="font-family:var(--font-mono);font-size:12px;color:#3A5C80;padding:16px 0">Loading workflow catalog…</div></div>
        </div>
        <div id="myr-pane-active" style="display:none">
          <div id="myr-active-content"><div style="font-family:var(--font-mono);font-size:12px;color:#3A5C80;padding:16px 0">Loading active requests…</div></div>
        </div>
        <div id="myr-pane-history" style="display:none">
          <div id="myr-history-content"><div style="font-family:var(--font-mono);font-size:12px;color:#3A5C80;padding:16px 0">Loading request history…</div></div>
        </div>
      </div>
    </div>`;

    if (loading) loading.style.display = 'none';
    content.style.display = 'block';

    // ── Delta strip — since last login ───────────────────
    setTimeout(() => { if (window.populateDeltaStrip) populateDeltaStrip(); }, 200);

    // ── Action item polling — checks every 15s for new open items ─
    if (!window._actionItemPollTimer) {
      let _knownActionIds  = new Set((myActionItems||[]).map(a => a.id));
      let _knownReviewIds  = new Set((myPendingReviews||[]).map(r => r.id));
      let _knownInstSteps  = {};  // instanceId → current_step_name snapshot for submitter
      // Seed instance step snapshot from current requests
      (window._myRequests||[]).forEach(r => { _knownInstSteps[r.id] = r._raw?.current_step_name || ''; });
      let _pollCount = 0;
      const _doPoll = async () => {
        if (!_myResource?.id) { console.warn('[Poll] _myResource not ready — skipping'); return; }
        _pollCount++;
        try {
          const [freshActions, freshReviews, freshInsts] = await Promise.all([
            API.get(
              `workflow_action_items?owner_resource_id=eq.${_myResource.id}&status=eq.open&select=id,title&limit=50`
            ).catch(e => { console.warn('[Poll] action_items fetch error:', e.message); return null; }),
            API.get(
              `workflow_requests?owner_resource_id=eq.${_myResource.id}&status=eq.open&select=id,role&limit=50`
            ).catch(e => { console.warn('[Poll] workflow_requests fetch error:', e.message); return null; }),
            API.get(
              `workflow_instances?submitted_by_resource_id=eq.${_myResource.id}&status=in.(in_progress,complete)&select=id,current_step_name&limit=50`
            ).catch(() => null),
          ]);
          const newActions  = (freshActions||[]).filter(a => !_knownActionIds.has(a.id));
          const newReviews  = (freshReviews||[]).filter(r => !_knownReviewIds.has(r.id));
          // Detect step changes on submitter's own instances
          const stepChanged = (freshInsts||[]).filter(inst => {
            if (!Object.prototype.hasOwnProperty.call(_knownInstSteps, inst.id)) {
              _knownInstSteps[inst.id] = inst.current_step_name;
              return false;
            }
            const prev = _knownInstSteps[inst.id];
            const changed = prev !== inst.current_step_name;
            _knownInstSteps[inst.id] = inst.current_step_name;
            return changed;
          });
          const totalOpen = (freshActions?.length||0) + (freshReviews?.length||0);
          const totalNew  = newActions.length + newReviews.length + stepChanged.length;
          if (totalNew) {
            newActions.forEach(a => _knownActionIds.add(a.id));
            newReviews.forEach(r => _knownReviewIds.add(r.id));
            const activeTab = typeof _uActiveTab !== 'undefined' ? _uActiveTab : 'work';
            if (activeTab === 'work') {
              window._mwLoadUserView && window._mwLoadUserView();
            } else if (activeTab === 'requests') {
              window._requestsLoaded = false;
              window.loadUserRequests && window.loadUserRequests();
            } else {
              window._mwWorkStale = true;
            }
          }
        } catch(e) { console.error('[Poll] error:', e.message); }
      };
      window._pollNow = _doPoll;
      window._actionItemPollTimer = setInterval(_doPoll, 10000);
    } else {
    }

    
// ── Stat strip summary tooltip ──────────────────────────────────────────
(function() {
  var _tip = null;
  var _tipTimer = null;

  window.showStatTooltip = function(e, type) {
    clearTimeout(_tipTimer);
    if (_tip) { _tip.remove(); _tip = null; }
    if (!e.ctrlKey) return;  // Ctrl required
    var _eTarget = e.currentTarget;
    var _eType   = type;
    _tipTimer = setTimeout(function() {
      window._showStatTooltipNow(_eTarget, _eType);
    }, 1500);
  };
  window._showStatTooltipNow = function(eTarget, type) {
    if (_tip) { _tip.remove(); _tip = null; }
    var wi = window._wiItems || [];
    var type = type || 'summary';

    var today   = new Date().toLocaleDateString('en-CA');
    var esc     = function(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
    var fmtDate = function(d) {
      if (!d) return '—';
      return new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});
    };
    var fmtHrs  = function(h) { return parseFloat(h||0).toFixed(1)+'h'; };
    var te      = window._myTimeEntries || [];
    var done    = window._doneToday || [];
    var wf      = window._wfInstances || [];

    var headerColors = {
      waiting:'var(--text3)', inprogress:'var(--compass-cyan)', blocked:'var(--compass-red)',
      done:'var(--compass-green)', hrs_week:'var(--compass-amber)', hrs_today:'var(--compass-cyan)',
      open:'var(--compass-amber)', workflows:'var(--compass-purple)', summary:'rgba(0,210,255,.5)'
    };
    var headerTitles = {
      waiting:'Tasks Waiting', inprogress:'Tasks In Progress', blocked:'Tasks Blocked',
      done:'Completed Today', hrs_week:'Hours — This Week', hrs_today:'Hours — Today',
      open:'All Open Items', workflows:'Active Workflows', summary:'Status Summary'
    };
    var accentColor = headerColors[type] || 'var(--compass-cyan)';
    var title = headerTitles[type] || 'Summary';

    var taskRow = function(w, color) {
      var overdueBadge = w.overdue ? '<span style="font-size:13px;padding:1px 5px;background:rgba(226,75,74,.15);color:var(--compass-red);border:1px solid rgba(226,75,74,.25);border-radius:2px;margin-left:6px;flex-shrink:0">overdue</span>' : '';
      var pct = w.progress != null ? w.progress : null;
      var prog = pct != null ? '<div style="height:2px;background:rgba(255,255,255,.08);border-radius:1px;margin-top:3px"><div style="height:2px;background:'+color+';width:'+Math.min(100,pct)+'%;border-radius:1px"></div></div>' : '';
      return '<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05)">' +
        '<div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap">' +
          '<span style="color:var(--text0);font-size:13px;flex:1;min-width:0">' + esc(w.title) + '</span>' +
          overdueBadge +
          '<span style="color:'+(w.overdue?'var(--compass-red)':'var(--text3)')+';font-size:13px;flex-shrink:0">'+fmtDate(w.due)+'</span>' +
        '</div>' +
        '<div style="color:var(--text3);font-size:13px;margin-top:1px">'+esc(w.project||'—')+'</div>' +
        prog + '</div>';
    };
    var teRow = function(e) {
      var proj = (window._projects||[]).find(function(p){return p.id===e.project_id;});
      var bill = e.is_billable ? '<span style="color:var(--compass-cyan);font-size:13px;margin-left:4px">● bill</span>' : '<span style="color:var(--compass-purple);font-size:13px;margin-left:4px">● non-bill</span>';
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.05)">' +
        '<div style="flex:1;min-width:0"><div style="color:var(--text0);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(e.description||e.activity||'Time entry')+'</div>' +
        '<div style="color:var(--text3);font-size:13px">'+esc(proj?proj.name:'—')+bill+'</div></div>' +
        '<div style="color:var(--compass-amber);font-weight:700;font-size:13px;margin-left:12px;flex-shrink:0">'+fmtHrs(e.hours)+'</div></div>';
    };

    var html = '';

    if (type === 'waiting') {
      var items = wi.filter(function(w){return w.status==='not_started';});
      html = items.length ? items.map(function(w){return taskRow(w,'var(--text3)');}).join('')
           : '<div style="color:var(--text3);padding:12px 0">No tasks waiting.</div>';

    } else if (type === 'inprogress') {
      var items = wi.filter(function(w){return w.status==='in_progress';});
      html = items.length ? items.map(function(w){return taskRow(w,'var(--compass-cyan)');}).join('')
           : '<div style="color:var(--text3);padding:12px 0">No tasks in progress.</div>';

    } else if (type === 'blocked') {
      var items = wi.filter(function(w){return w.status==='blocked';});
      html = items.length ? items.map(function(w){return taskRow(w,'var(--compass-red)');}).join('')
           : '<div style="color:var(--compass-green);padding:12px 0">✓ Nothing blocked.</div>';

    } else if (type === 'done') {
      html = done.length ? done.map(function(w){
        return '<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05)">' +
          '<div style="color:var(--text0);font-size:13px">'+esc(w.title)+'</div>' +
          '<div style="color:var(--text3);font-size:13px;margin-top:1px">'+esc(w.project||'—')+'</div></div>';
      }).join('') : '<div style="color:var(--text3);padding:12px 0">Nothing completed yet today.</div>';

    } else if (type === 'hrs_week') {
      var weekTe = window._weekEntries || te;
      var tot  = weekTe.reduce(function(s,e){return s+parseFloat(e.hours||0);},0);
      var bill = weekTe.filter(function(e){return e.is_billable;}).reduce(function(s,e){return s+parseFloat(e.hours||0);},0);
      var pct  = tot>0?Math.round(bill/tot*100):0;
      html = '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.08)">' +
        '<div style="text-align:center"><div style="color:var(--text3);font-size:13px;text-transform:uppercase;letter-spacing:.08em">Total</div><div style="color:var(--compass-amber);font-size:13px;font-weight:700">'+fmtHrs(tot)+'</div></div>' +
        '<div style="text-align:center"><div style="color:var(--text3);font-size:13px;text-transform:uppercase;letter-spacing:.08em">Billable</div><div style="color:var(--compass-cyan);font-size:13px;font-weight:700">'+fmtHrs(bill)+'</div></div>' +
        '<div style="text-align:center"><div style="color:var(--text3);font-size:13px;text-transform:uppercase;letter-spacing:.08em">Bill %</div><div style="color:'+(pct>=80?'var(--compass-green)':pct>=50?'var(--compass-amber)':'var(--compass-red)')+';font-size:13px;font-weight:700">'+pct+'%</div></div>' +
        '</div>' + (weekTe.length ? weekTe.slice(0,20).map(teRow).join('') : '<div style="color:var(--text3);padding:8px 0">No time entries this week.</div>');

    } else if (type === 'hrs_today') {
      var todayStr = window._today || today;
      var todayTe = te.filter(function(e){return e.date===todayStr;});
      var tot  = todayTe.reduce(function(s,e){return s+parseFloat(e.hours||0);},0);
      var bill = todayTe.filter(function(e){return e.is_billable;}).reduce(function(s,e){return s+parseFloat(e.hours||0);},0);
      html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.08)">' +
        '<div style="text-align:center"><div style="color:var(--text3);font-size:13px;text-transform:uppercase;letter-spacing:.08em">Total today</div><div style="color:var(--compass-amber);font-size:13px;font-weight:700">'+fmtHrs(tot)+'</div></div>' +
        '<div style="text-align:center"><div style="color:var(--text3);font-size:13px;text-transform:uppercase;letter-spacing:.08em">Billable</div><div style="color:var(--compass-cyan);font-size:13px;font-weight:700">'+fmtHrs(bill)+'</div></div>' +
        '</div>' + (todayTe.length ? todayTe.map(teRow).join('') : '<div style="color:var(--text3);padding:8px 0">No time entries logged today.</div>');

    } else if (type === 'open') {
      var overdue = wi.filter(function(w){return w.overdue;});
      var current = wi.filter(function(w){return !w.overdue;});
      if (overdue.length) {
        html += '<div style="font-family:inherit;font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--compass-red);margin-bottom:4px">Overdue — '+overdue.length+'</div>';
        html += overdue.map(function(w){return taskRow(w,'var(--compass-red)');}).join('');
        html += '<div style="margin-top:10px"></div>';
      }
      if (current.length) {
        html += '<div style="font-family:inherit;font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--compass-amber);margin-bottom:4px">Current — '+current.length+'</div>';
        html += current.map(function(w){return taskRow(w,'var(--compass-amber)');}).join('');
      }
      if (!wi.length) html = '<div style="color:var(--compass-green);padding:12px 0">✓ No open items.</div>';

    } else if (type === 'workflows') {
      if (!wf.length) {
        html = '<div style="color:var(--text3);padding:12px 0">No active workflows.</div>';
      } else {
        // Group by status
        var wfGroups = { blocked:[], in_progress:[], not_started:[], other:[] };
        wf.forEach(function(w) {
          var s = w.status || 'other';
          if (wfGroups[s]) wfGroups[s].push(w); else wfGroups.other.push(w);
        });
        var wfRow = function(w, sc) {
          var proj = (window._projects||[]).find(function(p){return p.id===w.project_id;});
          var step = w.current_step_name ? '<span style="color:var(--compass-cyan);margin-left:6px;font-size:13px">→ '+esc(w.current_step_name)+'</span>' : '';
          return '<div style="display:flex;align-items:baseline;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.05)">' +
            '<div style="flex:1;min-width:0">' +
              '<span style="color:var(--text0);font-size:13px">'+esc(w.title||w.template_name||'Workflow')+'</span>' + step +
              '<div style="color:var(--text3);font-size:13px;margin-top:1px">'+esc(proj?proj.name:'—')+'</div>' +
            '</div>' +
          '</div>';
        };
        var wfSection = function(label, items, sc) {
          if (!items.length) return '';
          return '<div style="font-family:inherit;font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:'+sc+';margin:8px 0 4px">'+label+' — '+items.length+'</div>' +
            items.map(function(w){ return wfRow(w, sc); }).join('');
        };
        // Summary counts bar
        var statBar = '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.08);text-align:center">' +
          '<div><div style="color:var(--text3);font-size:13px;text-transform:uppercase;letter-spacing:.08em">In Progress</div><div style="color:var(--compass-cyan);font-size:13px;font-weight:700">'+wfGroups.in_progress.length+'</div></div>' +
          '<div><div style="color:var(--text3);font-size:13px;text-transform:uppercase;letter-spacing:.08em">Blocked</div><div style="color:'+(wfGroups.blocked.length?'var(--compass-red)':'var(--text2)')+';font-size:13px;font-weight:700">'+wfGroups.blocked.length+'</div></div>' +
          '<div><div style="color:var(--text3);font-size:13px;text-transform:uppercase;letter-spacing:.08em">Not Started</div><div style="color:var(--text2);font-size:13px;font-weight:700">'+wfGroups.not_started.length+'</div></div>' +
        '</div>';
        html = statBar +
          wfSection('Blocked', wfGroups.blocked, 'var(--compass-red)') +
          wfSection('In Progress', wfGroups.in_progress, 'var(--compass-cyan)') +
          wfSection('Not Started', wfGroups.not_started, 'var(--text3)') +
          wfSection('Other', wfGroups.other, 'var(--text3)');
      }

    } else {
      // Summary view
      var waiting  = wi.filter(function(w){return w.status==='not_started';});
      var inp      = wi.filter(function(w){return w.status==='in_progress';});
      var blk      = wi.filter(function(w){return w.status==='blocked';});
      var overdue  = wi.filter(function(w){return w.overdue;});
      var tot      = te.reduce(function(s,e){return s+parseFloat(e.hours||0);},0);
      var bill     = te.filter(function(e){return e.is_billable;}).reduce(function(s,e){return s+parseFloat(e.hours||0);},0);
      var pct      = tot>0?Math.round(bill/tot*100):0;
      html =
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.08);text-align:center">' +
          '<div><div style="color:var(--text3);font-size:13px;text-transform:uppercase;letter-spacing:.08em">Waiting</div><div style="color:var(--text2);font-size:13px;font-weight:700">'+waiting.length+'</div></div>' +
          '<div><div style="color:var(--text3);font-size:13px;text-transform:uppercase;letter-spacing:.08em">In Progress</div><div style="color:var(--compass-cyan);font-size:13px;font-weight:700">'+inp.length+'</div></div>' +
          '<div><div style="color:var(--text3);font-size:13px;text-transform:uppercase;letter-spacing:.08em">Blocked</div><div style="color:'+(blk.length?'var(--compass-red)':'var(--text2)')+';font-size:13px;font-weight:700">'+blk.length+'</div></div>' +
          '<div><div style="color:var(--text3);font-size:13px;text-transform:uppercase;letter-spacing:.08em">Overdue</div><div style="color:'+(overdue.length?'var(--compass-red)':'var(--text2)')+';font-size:13px;font-weight:700">'+overdue.length+'</div></div>' +
        '</div>' +
        '<div style="font-size:13px;color:var(--text3)">Week: <span style="color:var(--compass-amber);font-weight:700">'+fmtHrs(tot)+'</span> &nbsp; Billable: <span style="color:var(--compass-cyan);font-weight:700">'+fmtHrs(bill)+' ('+pct+'%)</span></div>';
    }

    if (!html.trim()) return;

    _tip = document.createElement('div');
    _tip.id = 'mw-stat-tip';
    _tip.style.cssText = [
      'position:fixed', 'z-index:9999', 'background:#0a1628',
      'border:1px solid rgba(0,210,255,.25)', 'border-radius:3px',
      'padding:14px 16px', 'font-family:inherit;',
      'font-size:13px', 'color:var(--text1,#C8DFF0)', 'width:600px',
      'max-height:70vh', 'overflow-y:auto',
      'box-shadow:0 8px 32px rgba(0,0,0,.75)', 'pointer-events:auto', 'line-height:1.55'
    ].join(';');
    _tip.innerHTML =
      '<div style="font-family:inherit;font-size:13px;font-weight:700;letter-spacing:.1em;' +
      'text-transform:uppercase;color:' + accentColor + ';margin-bottom:10px;' +
      'border-bottom:1px solid rgba(0,210,255,.1);padding-bottom:8px">' + title + '</div>' + html;
    document.body.appendChild(_tip);

    // Position below the hovered card
    var cardEl = eTarget;
    var r = cardEl.getBoundingClientRect();
    var tipW = 600;
    var top  = r.bottom + 6;
    var left = r.left;
    if (left + tipW > window.innerWidth - 10) left = window.innerWidth - tipW - 10;
    if (left < 8) left = 8;
    _tip.style.top  = top + 'px';
    _tip.style.left = left + 'px';
  };

  window.hideStatTooltip = function() {
    clearTimeout(_tipTimer);
    _tipTimer = setTimeout(function() {
      if (_tip) { _tip.remove(); _tip = null; }
    }, 150);
  };
  // Cancel all tooltip timers if Ctrl is released mid-dwell
  document.addEventListener('keyup', function(e) {
    if (e.key === 'Control') {
      clearTimeout(_tipTimer);
      if (_tip) { _tip.remove(); _tip = null; }
    }
  });
  // Ctrl pressed while already hovering — start dwell for any tooltip target
  document.addEventListener('keydown', function(ev) {
    if (ev.key !== 'Control' || ev.repeat) return;
    // Stat card
    var statCard = document.querySelector('.stat-card:hover');
    if (statCard) {
      var attr = statCard.getAttribute('onmouseenter') || '';
      var m = attr.match(/showStatTooltip[^'"]*['"](\w+)['"]/); 
      if (m) {
        clearTimeout(_tipTimer);
        if (_tip) { _tip.remove(); _tip = null; }
        var _cap = statCard, _capType = m[1];
        _tipTimer = setTimeout(function() { window._showStatTooltipNow(_cap, _capType); }, 1500);
      }
    }
    // Rec seq pane
    var recPane = document.getElementById('mw-rec-seq');
    if (recPane && recPane.matches(':hover')) {
      clearTimeout(window._rTimer);
      var _capPane = recPane;
      window._rTimer = setTimeout(function() {
        if (!window._rTip) window.showRecSeqTooltip({ ctrlKey: true, currentTarget: _capPane });
      }, 1500);
    }
    // Gauge
    var gaugeRow = document.getElementById('mw-gauge-row');
    if (gaugeRow) {
      var gaugeHov = gaugeRow.querySelector('.gauge-col:hover');
      if (gaugeHov) gaugeHov.dispatchEvent(new MouseEvent('mouseover', { ctrlKey: true, bubbles: true }));
    }
    // Work queue legend button
    var legendBtn = document.getElementById('wq-legend-btn');
    if (legendBtn && legendBtn.matches(':hover')) {
      clearTimeout(window._wqLegendTimer);
      window._wqLegendTimer = setTimeout(function() { window._showWQLegend(legendBtn); }, 1500);
    }

  });

  // Work Queue legend tooltip
  window._wqLegendEnter = function(btn, ev) {
    clearTimeout(window._wqLegendTimer);
    if (!ev.ctrlKey) return;
    window._wqLegendTimer = setTimeout(function() { window._showWQLegend(btn); }, 1500);
  };
  window._showWQLegend = function(btn) {
    var existing = document.getElementById('wq-legend-tip');
    if (existing) { existing.remove(); return; }
    var tip = document.createElement('div');
    tip.id = 'wq-legend-tip';
    tip.style.cssText = 'position:fixed;z-index:9999;background:#0a1628;'
      + 'border:1px solid rgba(0,210,255,.25);border-left:3px solid #00D2FF;'
      + 'border-radius:3px;padding:12px 14px;font-family:inherit;'
      + 'min-width:300px;box-shadow:0 8px 32px rgba(0,0,0,.7);pointer-events:auto';
    tip.innerHTML =
      '<div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;'
      + 'color:#00D2FF;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid rgba(0,210,255,.15)">'
      + 'Button Legend</div>'
      + '<div style="display:flex;align-items:center;gap:8px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.05)"><div style="width:66px;flex-shrink:0;font-size:10px;font-weight:700;padding:2px 6px;border:1px solid #FFFFFF;color:#0a1628;background:#FFFFFF;text-align:center;border-radius:2px">Start</div><div style="font-size:11px;color:#90B8D8">Task not yet begun</div></div>'
      + '<div style="display:flex;align-items:center;gap:8px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.05)"><div style="width:66px;flex-shrink:0;font-size:10px;font-weight:700;padding:2px 6px;border:1px solid #F0F6FF;color:#111827;background:#F0F6FF;text-align:center;border-radius:2px">Rate</div><div style="font-size:11px;color:#90B8D8">Action item needs LOE rating</div></div>'
      + '<div style="display:flex;align-items:center;gap:8px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.05)"><div style="width:66px;flex-shrink:0;font-size:10px;font-weight:700;padding:2px 6px;border:1px solid var(--compass-amber);color:var(--compass-amber);text-align:center;border-radius:2px">In Progress</div><div style="font-size:11px;color:#90B8D8">Task underway</div></div>'
      + '<div style="display:flex;align-items:center;gap:8px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.05)"><div style="width:66px;flex-shrink:0;font-size:10px;font-weight:700;padding:2px 6px;border:1px solid #8B5CF6;color:#8B5CF6;text-align:center;border-radius:2px">Pending</div><div style="font-size:11px;color:#90B8D8">LOE submitted, awaiting assignor</div></div>'
      + '<div style="display:flex;align-items:center;gap:8px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.05)"><div style="width:66px;flex-shrink:0;font-size:10px;font-weight:700;padding:2px 6px;border:1px solid var(--compass-red);color:var(--compass-red);text-align:center;border-radius:2px">Escalated</div><div style="font-size:11px;color:#90B8D8">Escalated to PM</div></div>'
      + '<div style="display:flex;align-items:center;gap:8px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.05)"><div style="width:66px;flex-shrink:0;font-size:10px;font-weight:700;padding:2px 6px;border:1px solid #FFFFFF;color:#0a1628;background:#FFFFFF;text-align:center;border-radius:2px">Mark Done</div><div style="font-size:11px;color:#90B8D8">Task ≥100% complete</div></div>'
      + '<div style="display:flex;align-items:center;gap:8px;padding:3px 0"><div style="width:66px;flex-shrink:0;font-size:10px;font-weight:700;padding:2px 6px;border:1px solid var(--compass-green);color:#fff;background:var(--compass-green);text-align:center;border-radius:2px">Resolve</div><div style="font-size:11px;color:#90B8D8">LOE agreed, ready to close</div></div>';
    var r = btn.getBoundingClientRect();
    tip.style.top  = (r.bottom + 6) + 'px';
    tip.style.right = (window.innerWidth - r.right - 4) + 'px';
    document.body.appendChild(tip);
    // Dismiss on outside click or Ctrl release
    setTimeout(function() {
      document.addEventListener('click', function _dismiss(e) {
        if (!tip.contains(e.target)) { tip.remove(); document.removeEventListener('click', _dismiss); }
      });
      document.addEventListener('keyup', function _kup(e) {
        if (e.key === 'Control') { tip.remove(); document.removeEventListener('keyup', _kup); }
      });
    }, 50);
  };
  // Also wire mouseout on the ? button to cancel pending timer
  document.addEventListener('mouseout', function(ev) {
    if (ev.target && ev.target.id === 'wq-legend-btn') {
      clearTimeout(window._wqLegendTimer);
    }
  });
  // Keep tip alive when mouse enters it
  document.addEventListener('mouseover', function(ev) {
    if (_tip && _tip.contains(ev.target)) { clearTimeout(_tipTimer); }
  });
  document.addEventListener('mouseout', function(ev) {
    if (_tip && _tip.contains(ev.target) && !_tip.contains(ev.relatedTarget)) {
      window.hideStatTooltip();
    }
  });
})();


// ── Stat card click popup ────────────────────────────────────────────
window.showCardPopup = function(type, cardEl) {
  // Remove any existing popup
  var existing = document.getElementById('mw-card-popup');
  if (existing) { existing.remove(); return; }

  var wi       = window._wiItems || [];
  var te       = window._myTimeEntries || [];
  var done     = window._doneToday || [];
  var wf       = window._wfInstances || [];
  var today    = new Date().toLocaleDateString('en-CA');

  var esc = function(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
  var fmtDate = function(d) {
    if (!d) return '—';
    var dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-US', { month:'short', day:'numeric' });
  };
  var fmtHrs = function(h) { return parseFloat(h||0).toFixed(1) + 'h'; };

  var headerColor = {
    waiting:'var(--text3)', inprogress:'var(--compass-cyan)', blocked:'var(--compass-red)',
    done:'var(--compass-green)', hrs_week:'var(--compass-amber)', hrs_today:'var(--compass-cyan)',
    open:'var(--compass-amber)', workflows:'var(--compass-purple)'
  }[type] || 'var(--compass-cyan)';

  var titles = {
    waiting:'Tasks Waiting', inprogress:'Tasks In Progress', blocked:'Tasks Blocked',
    done:'Completed Today', hrs_week:'Hours — This Week', hrs_today:'Hours — Today',
    open:'All Open Items', workflows:'Active Workflows'
  };

  // Row builder for task lists
  var taskRow = function(w, accentColor) {
    var overdueBadge = w.overdue
      ? '<span style="font-size:9px;padding:1px 5px;background:rgba(226,75,74,.15);color:var(--compass-red);border:1px solid rgba(226,75,74,.25);border-radius:2px;margin-left:6px;flex-shrink:0">overdue</span>'
      : '';
    var pct = w.progress != null ? w.progress : null;
    var progBar = pct != null
      ? '<div style="height:2px;background:rgba(255,255,255,.08);border-radius:1px;margin-top:3px"><div style="height:2px;background:' + accentColor + ';width:' + Math.min(100,pct) + '%;border-radius:1px"></div></div>'
      : '';
    return '<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05)">' +
      '<div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap">' +
        '<span style="color:var(--text0);font-size:12px;flex:1;min-width:0">' + esc(w.title) + '</span>' +
        overdueBadge +
        '<span style="color:' + (w.overdue?'var(--compass-red)':'var(--text3)') + ';font-size:11px;flex-shrink:0">' + fmtDate(w.due) + '</span>' +
      '</div>' +
      '<div style="color:var(--text3);font-size:11px;margin-top:1px">' + esc(w.project||'—') + '</div>' +
      progBar +
    '</div>';
  };

  // Time entry row
  var teRow = function(e) {
    var proj = (window._projects||[]).find(function(p){ return p.id===e.project_id; });
    var billDot = e.is_billable
      ? '<span style="color:var(--compass-cyan);font-size:9px;margin-left:4px">● bill</span>'
      : '<span style="color:var(--compass-purple);font-size:9px;margin-left:4px">● non-bill</span>';
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.05)">' +
      '<div style="flex:1;min-width:0">' +
        '<div style="color:var(--text0);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(e.description||e.activity||'Time entry') + '</div>' +
        '<div style="color:var(--text3);font-size:11px">' + esc(proj?proj.name:'—') + billDot + '</div>' +
      '</div>' +
      '<div style="color:var(--compass-amber);font-weight:700;font-size:13px;margin-left:12px;flex-shrink:0">' + fmtHrs(e.hours) + '</div>' +
    '</div>';
  };

  // Workflow row
  var wfRow = function(w) {
    var proj = (window._projects||[]).find(function(p){ return p.id===w.project_id; });
    var statusColor = w.status==='in_progress'?'var(--compass-cyan)':w.status==='blocked'?'var(--compass-red)':'var(--text3)';
    return '<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05)">' +
      '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<span style="color:var(--text0);font-size:12px;flex:1">' + esc(w.template_name||w.name||'Workflow') + '</span>' +
        '<span style="font-size:10px;color:' + statusColor + ';font-family:var(--font-mono,monospace);text-transform:uppercase;letter-spacing:.06em;flex-shrink:0;margin-left:8px">' + esc(w.status||'') + '</span>' +
      '</div>' +
      '<div style="color:var(--text3);font-size:11px;margin-top:1px">' + esc(proj?proj.name:'—') + '</div>' +
    '</div>';
  };

  var bodyHtml = '';

  if (type === 'waiting') {
    var items = wi.filter(function(w){ return w.status==='not_started'; });
    if (!items.length) { bodyHtml = '<div style="color:var(--text3);padding:12px 0">No tasks waiting.</div>'; }
    else bodyHtml = items.map(function(w){ return taskRow(w,'var(--text3)'); }).join('');

  } else if (type === 'inprogress') {
    var items = wi.filter(function(w){ return w.status==='in_progress'; });
    if (!items.length) { bodyHtml = '<div style="color:var(--text3);padding:12px 0">No tasks in progress.</div>'; }
    else bodyHtml = items.map(function(w){ return taskRow(w,'var(--compass-cyan)'); }).join('');

  } else if (type === 'blocked') {
    var items = wi.filter(function(w){ return w.status==='blocked'; });
    if (!items.length) { bodyHtml = '<div style="color:var(--compass-green);padding:12px 0">✓ Nothing blocked.</div>'; }
    else bodyHtml = items.map(function(w){ return taskRow(w,'var(--compass-red)'); }).join('');

  } else if (type === 'done') {
    if (!done.length) { bodyHtml = '<div style="color:var(--text3);padding:12px 0">Nothing completed yet today.</div>'; }
    else bodyHtml = done.map(function(w){
      return '<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05)">' +
        '<div style="color:var(--text0);font-size:12px">' + esc(w.title) + '</div>' +
        '<div style="color:var(--text3);font-size:11px;margin-top:1px">' + esc(w.project||'—') + '</div>' +
      '</div>';
    }).join('');

  } else if (type === 'hrs_week') {
    var entries = te;
    var total   = entries.reduce(function(s,e){ return s+parseFloat(e.hours||0); },0);
    var bill    = entries.filter(function(e){ return e.is_billable; }).reduce(function(s,e){ return s+parseFloat(e.hours||0); },0);
    var nonBill = total - bill;
    var pct     = total>0 ? Math.round(bill/total*100) : 0;
    // Summary bar
    bodyHtml =
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.08)">' +
        '<div style="text-align:center"><div style="color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.08em">Total</div><div style="color:var(--compass-amber);font-size:18px;font-weight:700">' + fmtHrs(total) + '</div></div>' +
        '<div style="text-align:center"><div style="color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.08em">Billable</div><div style="color:var(--compass-cyan);font-size:18px;font-weight:700">' + fmtHrs(bill) + '</div></div>' +
        '<div style="text-align:center"><div style="color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.08em">Bill %</div><div style="color:' + (pct>=80?'var(--compass-green)':pct>=50?'var(--compass-amber)':'var(--compass-red)') + ';font-size:18px;font-weight:700">' + pct + '%</div></div>' +
      '</div>';
    if (!entries.length) bodyHtml += '<div style="color:var(--text3);padding:8px 0">No time entries this week.</div>';
    else bodyHtml += entries.slice(0,15).map(teRow).join('');

  } else if (type === 'hrs_today') {
    var entries = te.filter(function(e){ return e.date===today; });
    var total   = entries.reduce(function(s,e){ return s+parseFloat(e.hours||0); },0);
    var bill    = entries.filter(function(e){ return e.is_billable; }).reduce(function(s,e){ return s+parseFloat(e.hours||0); },0);
    bodyHtml =
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.08)">' +
        '<div style="text-align:center"><div style="color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.08em">Total today</div><div style="color:var(--compass-amber);font-size:18px;font-weight:700">' + fmtHrs(total) + '</div></div>' +
        '<div style="text-align:center"><div style="color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.08em">Billable</div><div style="color:var(--compass-cyan);font-size:18px;font-weight:700">' + fmtHrs(bill) + '</div></div>' +
      '</div>';
    if (!entries.length) bodyHtml += '<div style="color:var(--text3);padding:8px 0">No time entries logged today.</div>';
    else bodyHtml += entries.map(teRow).join('');

  } else if (type === 'open') {
    var overdue = wi.filter(function(w){ return w.overdue; });
    var current = wi.filter(function(w){ return !w.overdue; });
    if (overdue.length) {
      bodyHtml += '<div style="font-family:var(--font-mono,monospace);font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--compass-red);margin-bottom:4px">Overdue — ' + overdue.length + '</div>';
      bodyHtml += overdue.map(function(w){ return taskRow(w,'var(--compass-red)'); }).join('');
      bodyHtml += '<div style="margin-top:10px"></div>';
    }
    if (current.length) {
      bodyHtml += '<div style="font-family:var(--font-mono,monospace);font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--compass-amber);margin-bottom:4px">Current — ' + current.length + '</div>';
      bodyHtml += current.map(function(w){ return taskRow(w,'var(--compass-amber)'); }).join('');
    }
    if (!wi.length) bodyHtml = '<div style="color:var(--compass-green);padding:12px 0">✓ No open items.</div>';

  } else if (type === 'workflows') {
    if (!wf.length) { bodyHtml = '<div style="color:var(--text3);padding:12px 0">No active workflows.</div>'; }
    else bodyHtml = wf.map(wfRow).join('');
  }

  // Build popup
  var popup = document.createElement('div');
  popup.id = 'mw-card-popup';
  popup.style.cssText = [
    'position:fixed','z-index:9998','background:#0a1628',
    'border:1px solid rgba(0,210,255,.2)','border-radius:3px',
    'padding:0','width:420px','max-height:72vh',
    'box-shadow:0 12px 40px rgba(0,0,0,.8)',
    'display:flex','flex-direction:column','overflow:hidden'
  ].join(';');

  popup.innerHTML =
    '<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid rgba(0,210,255,.12);flex-shrink:0">' +
      '<div style="font-family:var(--font-mono,monospace);font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:' + headerColor + ';flex:1">' + (titles[type]||type) + '</div>' +
      '<button onclick="document.getElementById(&apos;mw-card-popup&apos;).remove()" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:16px;padding:0;line-height:1">×</button>' +
    '</div>' +
    '<div style="padding:10px 14px;overflow-y:auto;flex:1">' + bodyHtml + '</div>';

  document.body.appendChild(popup);

  // Position below the clicked card
  var r = cardEl.getBoundingClientRect();
  var top = r.bottom + 6;
  var left = r.left;
  if (left + 420 > window.innerWidth - 10) left = window.innerWidth - 430;
  if (top + 500 > window.innerHeight - 10) top = r.top - Math.min(500, top + 500 - window.innerHeight + 20);
  popup.style.top  = top + 'px';
  popup.style.left = left + 'px';

  // Close on outside click
  setTimeout(function() {
    document.addEventListener('click', function _closePopup(ev) {
      if (!popup.contains(ev.target) && ev.target !== cardEl) {
        popup.remove();
        document.removeEventListener('click', _closePopup);
      }
    });
  }, 0);
};

// ── Recommended daily sequence panel ─────────────────
    // Exclude workflow_requests rows — Request class items don't belong in the sequence scorer
    const _seqItems = (_wiItems||[]).filter(w => !w._isWrRow);
    setTimeout(() => buildRecommendedSequence(_seqItems), 100);

    // ── Build diagram if in diagram mode ────────────────
    if (_diagramMode) {
      setTimeout(buildWorkDiagram, 50);
    }

    // ── Populate CoC panel via CoC.render() ────────────
    (function() {
      const body  = document.getElementById('mw-coc-body');
      const count = document.getElementById('mw-coc-count');
      const evts  = window._myCocEvents || [];
      if (count) count.textContent = evts.length + ' events';
      if (!body) return;
      if (!evts.length) {
        body.innerHTML = '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);line-height:1.7">No CoC events yet.<br><br>Events appear when you complete workflow steps or save progress updates.</div>';
        return;
      }
      // _timelineHtml is the internal renderer exposed by coc.js
      if (window.CoC?._timelineHtml) {
        body.innerHTML = window.CoC._timelineHtml(evts);
      }
    })();


  } catch (e) {
    console.error('[Compass] _mwLoadUserView error:', e);
    if (loading) loading.innerHTML = '<div style="color:var(--compass-red);font-family:var(--font-mono);font-size:11px">Failed to load — check console</div>';
  }
}