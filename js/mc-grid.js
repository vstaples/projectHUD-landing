// mc-grid.js — Compass My Calendar: Grid/List view + module entry points
// Loaded by my-calendar.html as <script src="/js/mc-grid.js">.
// Defines: buildCalendarTab, _renderCalTab, _calLoadView, _calRefresh
// Depends on mc-kanban.js for calSwitchView (called from within buildCalendarTab).

(function() {
'use strict';

/* ─── Globals available from mw-tabs.js bridge (loadMyCalView) ─────── */
// window._calResource  — _myResource equivalent
// window._calItems     — _wiItems (open work items for this user)
// window._calCalEvents — calendar_events for current week

const FIRM_ID = window.FIRM_ID || 'aaaaaaaa-0001-0001-0001-000000000001';

/* ─── Local escape helper ────────────────────────────────────────────── */
const _esc = s => (String(s||'')).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/* ─── GRID / LIST CALENDAR ──────────────────────────────────────────── */
/* buildCalendarTab: fetches time_entries + calendar_events, renders month  */
/* or list view. Also called by _calRefresh on every tab revisit.           */
window.buildCalendarTab = function() {
  const grid = document.getElementById('cal-tab-grid');
  const lbl  = document.getElementById('cal-tab-month-label');
  if (!grid) return;
  const now   = new Date();
  let year    = now.getFullYear();
  let month   = now.getMonth();
  window._calTabYear  = year;
  window._calTabMonth = month;
  _renderCalTab();

  // Fetch calendar_events AND time_entries for current week
  // Both fetched here so My Calendar works standalone without My Work having loaded first
  (async () => {
    try {
      const resource = window._calResource || window._mtResource || window._myResource;
      console.log('[Compass] buildCalendarTab fetch: resource=', resource?.name||'NULL', 'API=', typeof API, '_calResource=', window._calResource?.name||'NULL');
      if (!resource || !API) { console.warn('[Compass] buildCalendarTab: aborting — missing resource or API'); return; }

      // Compute Mon–Sun of current week using local date arithmetic (avoids DST/UTC shift)
      const todayLocal = new Date();
      const dow = todayLocal.getDay(); // 0=Sun
      const diffToMon = dow === 0 ? -6 : 1 - dow;
      // Use year/month/date directly — never rely on getTime() arithmetic across DST boundaries
      const monDate = new Date(todayLocal.getFullYear(), todayLocal.getMonth(), todayLocal.getDate() + diffToMon);
      const sunDate = new Date(monDate.getFullYear(), monDate.getMonth(), monDate.getDate() + 6);
      const isoLocal = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      const weekStart = isoLocal(monDate);
      const weekEnd   = isoLocal(sunDate);

      console.log('[Compass] My Calendar fetching week:', weekStart, '–', weekEnd, 'resource:', resource.id);

      const [evs, tes] = await Promise.all([
        API.get(
          'calendar_events?firm_id=eq.' + FIRM_ID + '&resource_id=eq.' + resource.id +
          '&event_date=gte.' + weekStart + '&event_date=lte.' + weekEnd +
          '&select=*&order=event_date.asc,start_time.asc'
        ).catch(e => { console.error('[Compass] calendar_events fetch failed:', e); return []; }),
        API.get(
          'time_entries?resource_id=eq.' + resource.id +
          '&date=gte.' + weekStart + '&date=lte.' + weekEnd +
          '&select=id,date,hours,is_billable,project_id,task_id,notes,step_name' +
          '&order=date.asc'
        ).catch(e => { console.error('[Compass] time_entries fetch failed:', e); return []; })
      ]);

      console.log('[Compass] My Calendar got', tes?.length, 'time entries,', evs?.length, 'cal events');
      window._mtCalEvents    = Array.isArray(evs) ? evs : [];
      window._calCalEvents   = window._mtCalEvents;
      window._calTimeEntries = Array.isArray(tes) ? tes : [];
      _renderCalTab(); // re-render now that both data sources are loaded
    } catch(e) {
      console.error('[Compass] My Calendar fetch error:', e);
      window._mtCalEvents = [];
      window._calCalEvents = [];
    }
  })();
  document.getElementById('cal-tab-prev')?.addEventListener('click', () => {
    window._calTabMonth--;
    if (window._calTabMonth < 0) { window._calTabMonth = 11; window._calTabYear--; }
    _renderCalTab();
  });
  document.getElementById('cal-tab-next')?.addEventListener('click', () => {
    window._calTabMonth++;
    if (window._calTabMonth > 11) { window._calTabMonth = 0; window._calTabYear++; }
    _renderCalTab();
  });
  document.getElementById('cal-tab-today')?.addEventListener('click', () => {
    const t = new Date();
    window._calTabYear = t.getFullYear();
    window._calTabMonth = t.getMonth();
    _renderCalTab();
  });
  document.getElementById('cal-tab-add-block')?.addEventListener('click', () => {
    compassToast('Time block feature coming in next session.');
  });
  document.getElementById('myr-pto-quick')?.addEventListener('click', () => {
    if (window.myrOpenWorkflowForm) myrOpenWorkflowForm('pto-request');
    else compassToast('PTO request — open My Requests tab to submit.', 2500);
  });
};

function _renderCalTab() {
  const grid = document.getElementById('cal-tab-grid');
  const lbl  = document.getElementById('cal-tab-month-label');
  if (!grid) return;
  const year = window._calTabYear, month = window._calTabMonth;
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dayNames   = ['','Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  if (lbl) lbl.textContent = monthNames[month] + ' ' + year;
  // Find start of week containing today's date, anchored to Mon
  const now = new Date();
  // Build week anchored to current Monday
  const dayOfWeek = now.getDay(); // 0=Sun
  const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + diffToMon);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    days.push(d);
  }
  grid.innerHTML = '';
  // Header row
  const cornerH = document.createElement('div');
  cornerH.style.cssText = 'border-bottom:1px solid rgba(255,255,255,.06);border-right:1px solid rgba(255,255,255,.06)';
  grid.appendChild(cornerH);
  days.forEach(d => {
    const isToday = d.toDateString() === now.toDateString();
    const dH = document.createElement('div');
    dH.style.cssText = `padding:5px 0;font-family:var(--font-mono);font-size:11px;border-bottom:1px solid rgba(255,255,255,.06);text-align:center;letter-spacing:.06em;color:${isToday?'#00D2FF':'rgba(255,255,255,.85)'}`;
    dH.textContent = dayNames[d.getDay()===0?7:d.getDay()] + ' ' + d.getDate();
    grid.appendChild(dH);
  });
  // Build real event map from live data sources
  // Structure: { 'dayIndex-hour': [{type, label, billable, hours}] }
  const realEvents = {};

  // Helper: ISO date string for a Date object
  const isoD = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');

  // 1. calendar_events → placed at their start_time hour
  (window._calCalEvents || []).forEach(ev => {
    const evDate = ev.event_date ? ev.event_date.slice(0,10) : null;
    if (!evDate) return;
    const di = days.findIndex(d => isoD(d) === evDate);
    if (di < 0) return;
    const startH = ev.start_time ? parseInt(ev.start_time.slice(0,2), 10) : 9;
    const key = di + '-' + startH;
    if (!realEvents[key]) realEvents[key] = [];
    const isPto = (ev.event_type||'').toLowerCase().includes('pto') || (ev.title||'').toLowerCase().includes('pto');
    realEvents[key].push({ type: isPto ? 'pto' : 'meeting', label: ev.title || 'Event', hours: ev.duration_hours || 0 });
  });

  // 2. time_entries → no start_time; stack from hour 8 downward within the day
  //    Group by date first, then assign hour slots sequentially
  const teByDay = {};
  (window._calTimeEntries || []).forEach(e => {
    const d = e.date ? e.date.slice(0,10) : null;
    if (!d) return;
    if (!teByDay[d]) teByDay[d] = [];
    teByDay[d].push(e);
  });
  days.forEach((d, di) => {
    const entries = teByDay[isoD(d)] || [];
    let slotHour = 8;
    entries.forEach(e => {
      if (slotHour > 17) return; // off the visible grid
      const key = di + '-' + slotHour;
      if (!realEvents[key]) realEvents[key] = [];
      // Label: project name from _calItems lookup, or notes, or fallback
      const projName = (window._mtProjects || []).find(p => p.id === e.project_id);
      const taskName = (window._calItems || []).find(t => t.id === e.task_id);
      const label = taskName?.title || taskName?.name || projName?.name || projName?.title || e.notes || (e.is_billable ? 'Billable work' : 'Non-billable');
      realEvents[key].push({ type: e.is_billable ? 'focus' : 'nonbill', label, notes: e.notes || null, hours: parseFloat(e.hours)||0 });
      slotHour += Math.max(1, Math.round(parseFloat(e.hours)||1)); // advance slot by entry hours
    });
  });
  // Time rows 8–17 — each cell is 40px tall (2 lines), events span proportional rows
  const HOURS = [8,9,10,11,12,13,14,15,16,17];
  const CELL_H = 40; // px per hour row

  // Update grid column template to use correct row height
  const gridEl2 = document.getElementById('cal-tab-grid');
  if (gridEl2) gridEl2.style.gridAutoRows = CELL_H + 'px';

  HOURS.forEach(h => {
    const timeLbl = document.createElement('div');
    timeLbl.style.cssText = 'font-family:var(--font-mono,monospace);font-size:11px;font-weight:400;color:rgba(255,255,255,.75);padding:4px 6px 0;text-align:right;border-right:1px solid rgba(255,255,255,.15);line-height:1.4;white-space:nowrap';
    timeLbl.textContent = (h<=12?h:h-12)+':00'+(h<12?' AM':h===12?' PM':' PM');
    grid.appendChild(timeLbl);
    days.forEach((d, di) => {
      const isToday = d.toDateString() === now.toDateString();
      const isWknd  = d.getDay() === 0 || d.getDay() === 6;
      const cell = document.createElement('div');
      cell.className = 'cal-tab-cell';
      cell.style.position = 'relative';
      if (isToday) cell.style.borderLeft = '2px solid rgba(0,210,255,.2)';
      cell.style.background = isToday?'rgba(0,210,255,.02)':isWknd?'rgba(255,255,255,.01)':'';
      const evList = realEvents[di+'-'+h] || [];
      evList.forEach(ev => {
        const spanRows = Math.max(1, Math.round(ev.hours || 1));
        const evEl = document.createElement('div');
        evEl.className = 'cal-tab-event cal-tab-ce-'+ev.type;
        // Height spans multiple rows minus 4px gap
        evEl.style.height = (spanRows * CELL_H - 4) + 'px';
        evEl.style.minHeight = (CELL_H - 4) + 'px';
        evEl.style.whiteSpace = 'normal';
        evEl.style.overflow = 'hidden';
        evEl.style.display = 'flex';
        evEl.style.flexDirection = 'column';
        evEl.style.justifyContent = 'flex-start';
        evEl.style.padding = '3px 5px';
        evEl.style.zIndex = '2';
        // Line 1: title (bold, 11px)
        const line1 = document.createElement('div');
        line1.style.cssText = 'font-family:var(--font-mono);font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.3';
        line1.textContent = ev.label;
        evEl.appendChild(line1);
        // Line 2: notes/description (10px, dimmer)
        if (ev.notes || ev.hours) {
          const line2 = document.createElement('div');
          line2.style.cssText = 'font-family:var(--font-mono,monospace);font-size:11px;opacity:.7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px;line-height:1.3';
          line2.textContent = (ev.notes || '') + (ev.hours ? (ev.notes ? ' · ' : '') + ev.hours + 'h' : '');
          evEl.appendChild(line2);
        }
        evEl.title = ev.label + (ev.hours ? ' (' + ev.hours + 'h)' : '') + (ev.notes ? ' — ' + ev.notes : '');
        cell.appendChild(evEl);
      });
      cell.addEventListener('click', () => compassToast('Time block feature coming in next session.'));
      grid.appendChild(cell);
    });
  });
}



/* ─── Module entry points ────────────────────────────────────────────── */
window._calLoadView = async function() {
  if (window._calLoaded) { window._calRefresh && window._calRefresh(); return; }
  window._calLoaded = true;
  _calWireBaseEvents();
  buildCalendarTab();
};

window._calRefresh = async function() {
  // Re-stamp any bridged globals that may have been updated since first load
  if (typeof _myResource !== 'undefined' && _myResource) window._calResource  = _myResource;
  if (typeof _wiItems    !== 'undefined' && _wiItems)    window._calItems     = _wiItems;
  // Sync _calCalEvents from _mtCalEvents in case my-time updated it this session
  window._calCalEvents = window._mtCalEvents || window._calCalEvents || [];
  // buildCalendarTab fetches time_entries and calendar_events fresh — always call it
  buildCalendarTab();
};

function _calWireBaseEvents() {
  // The Grid view button listeners are wired inside buildCalendarTab.
  // calSwitchView and Kanban events are wired inside _kbWireEvents (called on first Kanban toggle).
  // Nothing additional needed at module level.
}


})();