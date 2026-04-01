// ══════════════════════════════════════════════════════════
// MY WORK — SUITE TABS: MEETINGS, CALENDAR, CONCERNS
// ══════════════════════════════════════════════════════════

// ── Tab switcher ─────────────────────────────────────────
let _uActiveTab = 'work';
window.uSwitchTab = function(tab, btn) {
  // Flush any pending notes save before leaving the tab
  if (_uActiveTab === 'concerns' && tab !== 'concerns' && window._notesSaveNow) {
    window._notesSaveNow();
  }
  // Stop polls when leaving MY NOTES
  if (_uActiveTab === 'concerns' && tab !== 'concerns' && window._notesStopInboxPoll) {
    window._notesStopInboxPoll();
    if (window._notesStopPingSystem) window._notesStopPingSystem();
  }
  // Restart polls when entering MY NOTES
  if (tab === 'concerns' && window._notesStartInboxPoll) {
    window._notesStartInboxPoll();
    if (window._notesStartPingSystem) window._notesStartPingSystem();
  }
  // MY VIEWS — flush save and manage polls same as MY NOTES
  if (_uActiveTab === 'views' && tab !== 'views' && window._notesSaveNow) window._notesSaveNow();
  if (tab === 'views' && window._notesStartInboxPoll) window._notesStartInboxPoll();
  _uActiveTab = tab;
  localStorage.setItem('compass-user-tab', tab);
  document.querySelectorAll('.ust').forEach(b => b.classList.remove('on'));
  document.querySelectorAll('.utc').forEach(c => c.classList.remove('on'));
  if (btn) btn.classList.add('on');
  const panel = document.getElementById('utc-'+tab);
  if (panel) panel.classList.add('on');
  if (tab === 'meetings' && !window._mtgLoaded) loadMyMeetingsView();
  else if (tab === 'meetings' && window._mtgRefresh) window._mtgRefresh();
  if (tab === 'concerns' && !window._notesLoaded) loadMyNotesView();
  else if (tab === 'concerns' && window._notesRefresh) window._notesRefresh();
  if (tab === 'views' && !window._myViewsLoaded) loadMyViewsView();
  else if (tab === 'views' && window._viewsRefresh) window._viewsRefresh();
  if (tab === 'calendar' && !window._calLoaded) loadMyCalView();
  else if (tab === 'calendar' && window._calRefresh) window._calRefresh();
  if (tab === 'requests' && !window._requestsLoaded) loadUserRequests();
  if (tab === 'timesheet' && !window._myTimeLoaded) loadMyTimeView();
};

// ── Calendar popup ────────────────────────────────────────
let _ucalYear  = new Date().getFullYear();
let _ucalMonth = new Date().getMonth(); // 0-indexed

window.toggleMwCoc = function() {
  const coc = document.getElementById('mw-coc');
  if (!coc) { console.warn('[Compass] mw-coc not found'); return; }
  // Panel uses flex — toggle between flex and none
  const isVisible = coc.style.display === 'flex';
  if (isVisible) {
    coc.style.display = 'none';
  } else {
    coc.style.display = 'flex';
    coc.style.flexDirection = 'column';
  }
};

window.toggleUserCalendar = function() {
  const p = document.getElementById('user-cal-popup');
  if (!p) return;
  const visible = p.style.display !== 'none';
  p.style.display = visible ? 'none' : 'block';
  if (!visible) renderUserCalendar();
};

window.ucalNav = function(dir) {
  _ucalMonth += dir;
  if (_ucalMonth > 11) { _ucalMonth = 0; _ucalYear++; }
  if (_ucalMonth < 0)  { _ucalMonth = 11; _ucalYear--; }
  renderUserCalendar();
};

function renderUserCalendar() {
  const today = new Date().toLocaleDateString('en-CA');
  const todayDate = new Date(today+'T00:00:00');
  const lblEl = document.getElementById('ucal-month-label');
  if (lblEl) lblEl.textContent = new Date(_ucalYear, _ucalMonth, 1)
    .toLocaleDateString('en-US',{month:'long',year:'numeric'}).toUpperCase();

  const cells = document.getElementById('ucal-cells');
  if (!cells) return;

  // Build event map from live data
  const evMap = {}; // date-string -> array of color
  const addEv = (date, col) => {
    if (!date) return;
    const d = date.slice(0,10);
    if (!evMap[d]) evMap[d] = [];
    evMap[d].push(col);
  };

  // Tasks due
  (_wiItems||[]).forEach(w => { if (w.due) addEv(w.due, w.overdue?'#E24B4A':'#EF9F27'); });
  // Action items
  (window._userConcerns||[]).forEach(c => { if (c.raised_date) addEv(c.raised_date, '#E24B4A'); });
  // Meetings
  (window._userMeetings||[]).forEach(m => { if (m.date) addEv(m.date, '#8B5CF6'); });

  const firstDay = new Date(_ucalYear, _ucalMonth, 1);
  const lastDay  = new Date(_ucalYear, _ucalMonth+1, 0);
  const startDow = (firstDay.getDay()+6)%7; // Mon=0

  let html = '';
  // Blanks
  for (let i=0;i<startDow;i++) {
    const prevDate = new Date(_ucalYear, _ucalMonth, -startDow+i+1);
    html += `<div style="padding:2px 3px;border:1px solid transparent;opacity:.3">
      <div style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.3);text-align:center">${prevDate.getDate()}</div>
    </div>`;
  }
  for (let d=1; d<=lastDay.getDate(); d++) {
    const dt = new Date(_ucalYear, _ucalMonth, d).toLocaleDateString('en-CA');
    const isToday = dt === today;
    const dots = evMap[dt]||[];
    html += `<div onclick="ucalSelectDay('${dt}')" style="min-height:30px;padding:2px 3px;border:1px solid ${isToday?'rgba(0,210,255,.5)':'transparent'};background:${isToday?'rgba(0,210,255,.08)':'transparent'};cursor:pointer;position:relative;transition:border-color .1s" onmouseenter="this.style.borderColor='rgba(0,210,255,.2)'" onmouseleave="this.style.borderColor='${isToday?'rgba(0,210,255,.5)':'transparent'}'">
      <div style="font-family:var(--font-head);font-size:11px;color:${isToday?'#00D2FF':'rgba(255,255,255,.6)'};font-weight:${isToday?'700':'400'};text-align:center">${d}</div>
      <div style="display:flex;gap:1.5px;justify-content:center;flex-wrap:wrap;margin-top:1px">${dots.slice(0,3).map(c=>`<div style="width:4px;height:4px;border-radius:50%;background:${c}"></div>`).join('')}</div>
    </div>`;
  }
  cells.innerHTML = html;
  ucalSelectDay(today); // default to today's agenda
}

window.ucalSelectDay = function(dt) {
  const agendaEl = document.getElementById('ucal-agenda');
  if (!agendaEl) return;
  const label = new Date(dt+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
  const items = [];
  // Tasks due on this day
  (_wiItems||[]).filter(w=>w.due===dt).forEach(w=>
    items.push({color:w.overdue?'#E24B4A':'#EF9F27', time:'Task', text:esc(w.title)}));
  // Meetings on this day
  (window._userMeetings||[]).filter(m=>m.date&&m.date.slice(0,10)===dt).forEach(m=>
    items.push({color:'#8B5CF6', time:m.time||'Mtg', text:esc(m.title)}));
  agendaEl.innerHTML = `<div style="font-family:var(--font-head);font-size:11px;color:rgba(0,210,255,.5);letter-spacing:.08em;text-transform:uppercase;margin-bottom:5px">${label}</div>` +
    (items.length ? items.map(i=>`<div style="display:flex;align-items:center;gap:6px;font-family:var(--font-head);font-size:11px;color:rgba(240,246,255,.7);padding:3px 0;border-bottom:1px solid rgba(255,255,255,.04)">
      <div style="width:6px;height:6px;border-radius:50%;background:${i.color};flex-shrink:0"></div>
      <span style="color:rgba(255,255,255,.35);min-width:36px;flex-shrink:0">${i.time}</span>
      <span>${i.text}</span>
    </div>`).join('') : `<div style="font-family:var(--font-head);font-size:12px;color:#3A5C80">No events</div>`);
};

// ── MEETINGS ─────────────────────────────────────────────
window._meetingsLoaded = false;
window._userMeetings   = [];
window._mtgFilter      = 'all';
window._requestsLoaded = false;
window._calTabLoaded   = false;
window._myRequests     = [];

// ── My Time loader ────────────────────────────────────────
// Fetches /my-time.html, injects into #mt-root, calls _mtLoadView().
// Subsequent tab clicks hit _mtRefresh() via the loaded guard.
window.loadMyTimeView = async function() {
  if (window._myTimeLoaded) {
    window._mtRefresh && window._mtRefresh();
    return;
  }
  const container = document.getElementById('mt-root');
  if (!container) { console.error('[Compass] #mt-root not found'); return; }
  try {
    const resp = await fetch('/my-time.html');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const html = await resp.text();
    const parser = new DOMParser();
    const doc    = parser.parseFromString(html, 'text/html');
    Array.from(doc.body.childNodes).forEach(node => {
      if (node.nodeName !== 'SCRIPT') container.appendChild(document.importNode(node, true));
    });
    for (const s of doc.querySelectorAll('script')) {
      await new Promise((resolve, reject) => {
        const el = document.createElement('script');
        if (s.src) {
          el.src = s.src;
          el.onload  = resolve;
          el.onerror = () => reject(new Error('Failed to load ' + s.src));
        } else {
          el.textContent = s.textContent;
        }
        document.head.appendChild(el);
        if (!s.src) resolve();
      });
    }
    window._myTimeLoaded = true;
    // Hand scoped lets from compass.html to my-time.html via window
    window._mtResource = typeof _myResource !== 'undefined' ? _myResource : null;
    window._mtProjects = typeof _projects  !== 'undefined' ? _projects  : [];
    window._mtTasks    = typeof _tasks     !== 'undefined' ? _tasks     : [];
    window._mtCalEvents = [];
    if (window._mtLoadView) await window._mtLoadView();
    else console.error('[Compass] _mtLoadView not exported by my-time.html');
  } catch (err) {
    console.error('[Compass] Failed to load my-time.html:', err);
    if (window.compassToast) compassToast('Failed to load My Time — check console', 4000);
  }
};

// ── My Calendar loader ───────────────────────────────────
// Fetches /my-calendar.html, injects into #cal-root, calls _calLoadView().
// Bridges _myResource, _wiItems, _mtCalEvents as window._cal* globals.
window.loadMyCalView = async function() {
  if (window._calLoaded) {
    window._calRefresh && window._calRefresh();
    return;
  }
  const container = document.getElementById('cal-root');
  if (!container) { console.error('[Compass] #cal-root not found'); return; }
  try {
    const resp = await fetch('/my-calendar.html');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const html = await resp.text();
    const parser = new DOMParser();
    const doc    = parser.parseFromString(html, 'text/html');
    // Inject <style> blocks from doc.head — DOMParser puts them there, not in body
    for (const st of doc.querySelectorAll('style')) {
      const el = document.createElement('style');
      el.textContent = st.textContent;
      document.head.appendChild(el);
    }
    Array.from(doc.body.childNodes).forEach(node => {
      if (node.nodeName !== 'SCRIPT') container.appendChild(document.importNode(node, true));
    });
    for (const s of doc.querySelectorAll('script')) {
      await new Promise((resolve, reject) => {
        const el = document.createElement('script');
        if (s.src) {
          el.src = s.src;
          el.onload  = resolve;
          el.onerror = () => reject(new Error('Failed to load ' + s.src));
        } else {
          el.textContent = s.textContent;
        }
        document.head.appendChild(el);
        if (!s.src) resolve();
      });
    }
    // Bridge scoped vars from compass.html / my-work.html into my-calendar.html
    window._calResource    = typeof _myResource !== 'undefined' ? _myResource : null;
    window._calItems       = typeof _wiItems    !== 'undefined' ? _wiItems    : [];
    window._calCalEvents   = window._mtCalEvents || [];
    window._projects       = typeof _projects   !== 'undefined' ? _projects   : (window._projects || []);
    // Note: _calTimeEntries is fetched directly by buildCalendarTab — no bridge needed
    if (window._calLoadView) await window._calLoadView();
    else console.error('[Compass] _calLoadView not exported by my-calendar.html');
  } catch (err) {
    console.error('[Compass] Failed to load my-calendar.html:', err);
    compassToast('Failed to load My Calendar — check console', 4000);
  }
};

// ── My Meetings loader ────────────────────────────────────────────────────
window.loadMyMeetingsView = async function() {
  if (window._mtgLoaded) {
    window._mtgRefresh && window._mtgRefresh();
    return;
  }
  const container = document.getElementById('user-meetings-content');
  if (!container) { console.error('[Compass] #user-meetings-content not found'); return; }
  container.innerHTML = ''; // clear "Loading meetings…" placeholder
  try {
    const resp = await fetch('/my-meetings.html');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const html = await resp.text();
    const parser = new DOMParser();
    const doc    = parser.parseFromString(html, 'text/html');
    for (const st of doc.querySelectorAll('style')) {
      const el = document.createElement('style');
      el.textContent = st.textContent;
      document.head.appendChild(el);
    }
    Array.from(doc.body.childNodes).forEach(node => {
      if (node.nodeName !== 'SCRIPT') container.appendChild(document.importNode(node, true));
    });
    for (const s of doc.querySelectorAll('script')) {
      await new Promise((resolve, reject) => {
        const el = document.createElement('script');
        if (s.src) {
          el.src = s.src;
          el.onload  = resolve;
          el.onerror = () => reject(new Error('Failed to load ' + s.src));
        } else {
          el.textContent = s.textContent;
        }
        document.head.appendChild(el);
        if (!s.src) resolve();
      });
    }
    // Bridge resource
    window._mtgResource = typeof _myResource !== 'undefined' ? _myResource : null;
    window._users       = typeof _users       !== 'undefined' ? _users       : (window._users || []);
    if (window._mtgLoadView) await window._mtgLoadView();
    else console.error('[Compass] _mtgLoadView not exported by my-meetings.html');
  } catch(err) {
    console.error('[Compass] Failed to load my-meetings.html:', err);
    compassToast('Failed to load My Meetings — check console', 4000);
  }
};

// ── My Notes loader ───────────────────────────────────────────────────────
window.loadMyNotesView = async function() {
  if (window._notesLoaded) {
    window._notesRefresh && window._notesRefresh();
    return;
  }
  const container = document.getElementById('notes-root');
  if (!container) { console.error('[Compass] #notes-root not found'); return; }
  container.innerHTML = '';
  try {
    const resp = await fetch('/my-notes.html');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const html = await resp.text();
    const parser = new DOMParser();
    const doc    = parser.parseFromString(html, 'text/html');
    for (const st of doc.querySelectorAll('style')) {
      const el = document.createElement('style');
      el.textContent = st.textContent;
      document.head.appendChild(el);
    }
    Array.from(doc.body.childNodes).forEach(node => {
      if (node.nodeName !== 'SCRIPT') container.appendChild(document.importNode(node, true));
    });
    for (const s of doc.querySelectorAll('script')) {
      await new Promise((resolve, reject) => {
        const el = document.createElement('script');
        if (s.src) {
          el.src = s.src;
          el.onload  = resolve;
          el.onerror = () => reject(new Error('Failed to load ' + s.src));
        } else {
          el.textContent = s.textContent;
        }
        document.head.appendChild(el);
        if (!s.src) resolve();
      });
    }
    // Bridge resource
    window._notesResource = typeof _myResource !== 'undefined' ? _myResource : null;
    if (window._notesLoadView) await window._notesLoadView();
    else console.error('[Compass] _notesLoadView not exported by my-notes.html');
  } catch(err) {
    console.error('[Compass] Failed to load my-notes.html:', err);
    compassToast('Failed to load My Notes — check console', 4000);
  }
};

window.loadMyViewsView = async function() {
  if (window._myViewsLoaded) {
    window._viewsRefresh && window._viewsRefresh();
    return;
  }
  const container = document.getElementById('views-root');
  if (!container) {
    // #views-root is rendered by _mwLoadUserView inside my-work.html.
    // If MY WORK hasn't loaded yet, defer until it does.
    console.warn('[Compass] #views-root not found — deferring until _mwLoadUserView completes');
    const MAX_WAIT = 8000;
    const POLL_MS  = 100;
    let elapsed = 0;
    await new Promise(resolve => {
      const poll = setInterval(() => {
        elapsed += POLL_MS;
        if (document.getElementById('views-root') || elapsed >= MAX_WAIT) {
          clearInterval(poll);
          resolve();
        }
      }, POLL_MS);
    });
    if (!document.getElementById('views-root')) {
      console.error('[Compass] #views-root still not found after ' + MAX_WAIT + 'ms — aborting');
      return;
    }
    // Re-check loaded flag — another call may have succeeded while we waited
    if (window._myViewsLoaded) {
      window._viewsRefresh && window._viewsRefresh();
      return;
    }
  }
  container.innerHTML = '';
  try {
    const resp = await fetch('/my-views.html');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const html = await resp.text();
    const parser = new DOMParser();
    const doc    = parser.parseFromString(html, 'text/html');
    for (const st of doc.querySelectorAll('style')) {
      const el = document.createElement('style');
      el.textContent = st.textContent;
      document.head.appendChild(el);
    }
    Array.from(doc.body.childNodes).forEach(node => {
      if (node.nodeName !== 'SCRIPT') container.appendChild(document.importNode(node, true));
    });
    for (const s of doc.querySelectorAll('script')) {
      await new Promise((resolve, reject) => {
        const el = document.createElement('script');
        if (s.src) {
          el.src = s.src;
          el.onload  = resolve;
          el.onerror = () => reject(new Error('Failed to load ' + s.src));
        } else {
          el.textContent = s.textContent;
        }
        document.head.appendChild(el);
        if (!s.src) resolve();
      });
    }
    // Bridge resource — same pattern as MY NOTES
    window._notesResource = typeof _myResource !== 'undefined' ? _myResource : null;
    window._myViewsLoaded = true;
    if (window._viewsLoadView) await window._viewsLoadView();
    else console.error('[Compass] _viewsLoadView not exported by my-views.html');
  } catch(err) {
    console.error('[Compass] Failed to load my-views.html:', err);
    compassToast('Failed to load My Views — check console', 4000);
  }
};


window.loadUserMeetings = async function() {
  window._meetingsLoaded = true;
  const el = document.getElementById('user-meetings-content');
  if (!el) return;

  try {
    // meetings table — linked to pipeline prospects and workflow instances
    const today = new Date().toLocaleDateString('en-CA');
    const resId = _myResource?.id;
    const userId = _myResource?.user_id;

    const [meetings, attendees] = await Promise.all([
      API.get(`v_meetings?select=id,title,meeting_date,duration_minutes,location_or_link,meeting_type,status,organizer_id&order=meeting_date.desc&limit=50`).catch(()=>[]),
      userId ? API.get(`meeting_attendees?select=meeting_id,attendance_status&user_id=eq.${userId}&limit=100`).catch(()=>[]) : Promise.resolve([]),
    ]);

    const myMeetingIds = new Set(attendees.map(a=>a.meeting_id));
    const myMeetings = (meetings||[]);  // show all firm meetings from v_meetings

    window._userMeetings = myMeetings.map(m => ({
      id: m.id,
      title: m.title,
      date: m.meeting_date?.slice(0,10),
      time: m.meeting_date ? new Date(m.meeting_date).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}) : null,
      duration: m.duration_minutes||60,
      location: m.location_or_link,
      type: m.meeting_type||'meeting',
      status: 'scheduled',
      owned: false,
      past: m.meeting_date && m.meeting_date.slice(0,10) < today,
    }));

    // Update badge
    const todayMtgs = window._userMeetings.filter(m=>m.date===today).length;
    const badge = document.getElementById('ust-meetings-badge');
    if (badge && todayMtgs > 0) {
      badge.textContent = todayMtgs+' today';
      badge.className = 'ust-badge ust-badge-green';
      badge.style.display = 'inline';
    }

    renderUserMeetings();
  } catch(e) {
    console.error('[Compass] meetings load error:', e);
    el.innerHTML = '<div style="font-family:var(--font-head);font-size:12px;color:#E24B4A;padding:16px 0">Failed to load meetings</div>';
  }
};

function renderUserMeetings() {
  const el = document.getElementById('user-meetings-content');
  if (!el) return;
  const today = new Date().toLocaleDateString('en-CA');
  const f = window._mtgFilter;

  const filtered = (window._userMeetings||[]).filter(m => {
    if (f==='owned')    return m.owned;
    if (f==='upcoming') return !m.past;
    if (f==='past')     return m.past;
    if (f==='today')    return m.date===today;
    return true;
  });

  // Group into sections
  const todayMtgs    = filtered.filter(m=>m.date===today);
  const upcomingMtgs = filtered.filter(m=>!m.past&&m.date!==today);
  const pastMtgs     = filtered.filter(m=>m.past).slice(0,10);

  function mtgRow(m) {
    const barColor = m.owned ? '#8B5CF6' : m.past ? 'rgba(255,255,255,.15)' : '#00D2FF';
    const badge = m.owned ? '<span style="font-family:var(--font-head);font-size:11px;padding:2px 7px;border:1px solid rgba(139,92,246,.35);color:#8B5CF6;background:rgba(139,92,246,.07)">Owned by me</span>'
                : m.past  ? '<span style="font-family:var(--font-head);font-size:11px;padding:2px 7px;border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.35)">Completed</span>'
                          : '<span style="font-family:var(--font-head);font-size:11px;padding:2px 7px;border:1px solid rgba(0,210,255,.25);color:rgba(0,210,255,.7);background:rgba(0,210,255,.05)">Invited</span>';
    const timeStr = m.time ? m.time : '';
    const durStr  = m.duration ? m.duration+'min' : '';
    const locStr  = m.location ? esc(m.location) : '';
    const metaParts = [timeStr, durStr, locStr].filter(Boolean);
    const expandId = 'umtg-exp-'+m.id;
    return `<div style="display:flex;align-items:flex-start;gap:0;border:1px solid rgba(255,255,255,.07);margin-bottom:6px;cursor:pointer;transition:border-color .1s" onmouseenter="this.style.borderColor='rgba(0,210,255,.2)'" onmouseleave="this.style.borderColor='rgba(255,255,255,.07)'">
      <div style="width:4px;align-self:stretch;background:${barColor};flex-shrink:0"></div>
      <div style="flex:1;padding:9px 12px">
        <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:5px">
          <div style="font-family:var(--font-head);font-size:12px;font-weight:700;color:#F0F6FF;flex:1;line-height:1.3">${esc(m.title)}</div>
          ${badge}
        </div>
        <div style="display:flex;gap:10px;font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.4);flex-wrap:wrap;margin-bottom:5px">${metaParts.map(p=>`<span>${p}</span>`).join('')}</div>
      </div>
      <div style="padding:9px 10px;display:flex;flex-direction:column;gap:4px;flex-shrink:0">
        <button onclick="event.stopPropagation();uToggleMtgExpand('${expandId}')"
          style="font-family:var(--font-head);font-size:11px;padding:3px 10px;background:none;border:1px solid ${m.past?'rgba(255,255,255,.15)':'rgba(0,210,255,.35)'};color:${m.past?'rgba(255,255,255,.4)':'#00D2FF'};cursor:pointer;letter-spacing:.06em">Details</button>
        ${!m.past?`<button onclick="event.stopPropagation();window.location.href='/meeting-minutes.html?meeting_id=${m.id}'"
          style="font-family:var(--font-head);font-size:11px;padding:3px 10px;background:none;border:1px solid rgba(0,210,255,.2);color:#5A84A8;cursor:pointer;letter-spacing:.06em">Minutes</button>`:''}
      </div>
    </div>
    <div id="${expandId}" style="display:none;padding:6px 12px 10px 16px;background:#060c18;border:1px solid rgba(255,255,255,.06);border-top:none;margin-top:-6px;margin-bottom:6px">
      ${m.past?`<div style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.35);letter-spacing:.08em;text-transform:uppercase;margin-bottom:5px">Outcome</div>
        <div style="font-family:var(--font-body);font-size:12px;color:rgba(240,246,255,.65);line-height:1.55;margin-bottom:8px">Meeting completed. Open minutes for full record.</div>`
      :`<div style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.35);letter-spacing:.08em;text-transform:uppercase;margin-bottom:5px">Outcome (fill after meeting)</div>
        <textarea id="umtg-out-${m.id}" style="width:100%;padding:5px 8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:#C8DFF0;font-family:var(--font-body);font-size:12px;outline:none;resize:none;box-sizing:border-box" rows="2" placeholder="Record outcome — will be written to CoC…"></textarea>`}
      <div style="display:flex;gap:5px;margin-top:7px">
        ${!m.past?`<button onclick="uSaveOutcome('${m.id}')"
          style="font-family:var(--font-head);font-size:11px;padding:3px 10px;background:none;border:1px solid rgba(0,210,255,.35);color:#00D2FF;cursor:pointer;letter-spacing:.06em">Save outcome to CoC →</button>
        <button onclick="alert('Action item form — assigns to a team member and logs to CoC')"
          style="font-family:var(--font-head);font-size:11px;padding:3px 10px;background:none;border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.4);cursor:pointer">+ Spawn action item</button>`:''}
        <button onclick="window.location.href='/meeting-minutes.html?meeting_id=${m.id}'"
          style="font-family:var(--font-head);font-size:11px;padding:3px 10px;background:none;border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.4);cursor:pointer">Open minutes →</button>
      </div>
    </div>`;
  }

  function section(label, rows) {
    if (!rows.length) return '';
    return `<div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;color:rgba(0,210,255,.5);text-transform:uppercase;margin:10px 0 7px;padding-bottom:4px;border-bottom:1px solid rgba(0,210,255,.08)">${label}</div>` +
      rows.map(mtgRow).join('');
  }

  const filterBar = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
    <span style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.35);letter-spacing:.06em;text-transform:uppercase">Show</span>
    ${['all','owned','today','upcoming','past'].map(f=>`<button onclick="window._mtgFilter='${f}';renderUserMeetings()" 
      style="font-family:var(--font-head);font-size:11px;padding:3px 10px;background:${window._mtgFilter===f?'rgba(0,210,255,.08)':'none'};border:1px solid ${window._mtgFilter===f?'rgba(0,210,255,.4)':'rgba(255,255,255,.12)'};color:${window._mtgFilter===f?'#00D2FF':'rgba(255,255,255,.5)'};cursor:pointer;transition:.12s;letter-spacing:.06em;text-transform:capitalize">${f}</button>`).join('')}
    <button onclick="alert('New meeting form: title, project, date/time, duration, attendees, agenda, CoC link')"
      style="font-family:var(--font-head);font-size:11px;margin-left:auto;padding:4px 12px;background:rgba(0,210,255,.1);border:1px solid rgba(0,210,255,.35);color:#00D2FF;cursor:pointer;letter-spacing:.07em">+ Schedule meeting</button>
  </div>`;

  if (!filtered.length) {
    el.innerHTML = filterBar + '<div style="font-family:var(--font-head);font-size:12px;color:#3A5C80;padding:24px 0;text-align:center">No meetings found for this filter.</div>';
    return;
  }

  el.innerHTML = filterBar +
    (f==='all' || f==='today'    ? section('Today — '+new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}), todayMtgs) : '') +
    (f==='all' || f==='upcoming' ? section('Upcoming', upcomingMtgs) : '') +
    (f==='all' || f==='past'     ? section('Past', pastMtgs) : '') +
    (f==='owned' || f==='today' || f==='upcoming' || f==='past' ? filtered.map(mtgRow).join('') : '');
}

window.uToggleMtgExpand = function(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = el.style.display==='none' ? 'block' : 'none';
};

window.uSaveOutcome = async function(meetingId) {
  const txt = document.getElementById('umtg-out-'+meetingId)?.value?.trim()||'';
  if (!txt) { compassToast('Enter an outcome before saving',2000); return; }
  await API.post('workflow_step_instances',{
    id: crypto.randomUUID(), instance_id: crypto.randomUUID(), step_type: 'manual',
    event_type: 'step_completed',
    step_name: 'Meeting outcome',
    event_notes: txt,
    actor_name: _myResource?.name||null,
    outcome: 'on_track',
    created_at: new Date().toISOString(),
    firm_id: 'aaaaaaaa-0001-0001-0001-000000000001'
  }).catch(()=>{});
  compassToast('Outcome saved to CoC',2200);
  document.getElementById('umtg-out-'+meetingId).value = '';
};

// ── CONCERNS ─────────────────────────────────────────────
window._concernsLoaded = false;
window._userConcerns   = [];
window._concernFilter  = 'all';
let _concernSeq = 0; // for optimistic local IDs

window.loadUserConcerns = async function() {
  window._concernsLoaded = true;
  const el = document.getElementById('user-concerns-content');
  if (!el) return;

  const resId = _myResource?.id;
  if (!resId) { window._userConcerns = []; renderUserConcerns(); return; }

  try {
    // Load concerns + their comments in parallel
    const [concerns, comments] = await Promise.all([
      API.get(`concerns?raiser_resource_id=eq.${resId}&order=raised_at.desc&limit=100`).catch(()=>[]),
      API.get(`concern_comments?concern_id=not.is.null&order=created_at.asc&limit=500&select=id,concern_id,parent_id,author_name,body,event_type,created_at`).catch(()=>[]),
    ]);

    _concernSeq = 0;
    const commentsByC = {};
    (comments||[]).forEach(c => {
      if (!commentsByC[c.concern_id]) commentsByC[c.concern_id] = [];
      commentsByC[c.concern_id].push(c);
    });

    window._userConcerns = (concerns||[]).map(c => ({
      id:          c.id,
      cid:         'C-' + String(++_concernSeq).padStart(3,'0'),
      title:       c.title,
      description: c.description||'',
      status:      c.status||'unread',
      priority:    c.priority||'medium',
      visibility:  c.visibility||'pm',
      projectId:   c.project_id,
      project:     (_projects||[]).find(p=>p.id===c.project_id)?.name||'—',
      phase:       c.phase||'',
      raised_date: c.raised_at?.slice(0,10),
      raisedAt:    c.raised_at,
      thread:      (commentsByC[c.id]||[]).map(e=>({
        id:        e.id,
        parent_id: e.parent_id||null,
        who:       e.author_name,
        when:      e.created_at,
        text:      e.body,
        type:      e.event_type,
      })),
    }));

    // Migrate any localStorage concerns to DB (one-time)
    try {
      const lsKey = 'compass_concerns_' + resId;
      const lsRaw = localStorage.getItem(lsKey);
      if (lsRaw) {
        const lsItems = JSON.parse(lsRaw)||[];
        const dbIds = new Set((concerns||[]).map(c=>c.id));
        const toMigrate = lsItems.filter(c=>!dbIds.has(c.id));
        for (const c of toMigrate) {
          await API.post('concerns',{
            id: c.id, firm_id:'aaaaaaaa-0001-0001-0001-000000000001',
            raiser_resource_id: resId,
            raiser_name: _myResource?.name||null,
            title: c.title, description: c.description||c.title,
            status: c.status||'unread', priority: c.priority||'medium',
            raised_at: c.raisedAt||new Date().toISOString(),
          }).catch(()=>{});
        }
        if (toMigrate.length) {
          localStorage.removeItem(lsKey);
          // Reload to pick up migrated items
          window._concernsLoaded = false;
          loadUserConcerns(); return;
        }
        localStorage.removeItem(lsKey);
      }
    } catch(e) {}

    updateConcernBadge();
    renderUserConcerns();
  } catch(e) {
    console.error('[Compass] concerns load error:', e);
    window._userConcerns = [];
    renderUserConcerns();
  }
};


// ── My Requests — loadUserRequests ───────────────────────
// Fetches real workflow_instances submitted by this user and maps them
// to the _myRequests shape expected by renderMyRequestsActive/History.
window.loadUserRequests = async function() {
  window._requestsLoaded = true;
  renderMyRequestsCatalog();

  const resId = window._myResource?.id;
  if (resId) {
    try {
      const rows = await API.get(
        `workflow_instances?submitted_by_resource_id=eq.${resId}` +
        `&order=created_at.desc&limit=100` +
        `&select=id,title,status,current_step_name,workflow_type,submitted_by_name,created_at`
      ).catch(() => []);

      // Step label maps — mirrors stepPreviews in myrOpenWorkflowForm
      const _STEP_LABELS = {
        'resource-alloc':    ['Submit','PM review','Mgmt approval','Notify resource','Update schedule'],
        'pto-request':       ['Submit','PM review','Approved → cal blocked + team notified'],
        'capacity-concern':  ['Submit','PM review','Decision → queue adjusted'],
        'doc-review':        ['Submit','Route to reviewers','Review round 1','Revisions','Final review','Sign-off'],
        'change-request':    ['Submit','PM review','Client review','Impact assessment','Mgmt approval','Update plan','Notify team'],
        'issue-escalation':  ['Submit','PM review','Resolution plan','Resolved → CoC event'],
        'expense':           ['Submit','PM review','Finance approval','Processed'],
        'training':          ['Submit','PM review','Budget check','Mgmt approval','Confirmed'],
        'new-project':       ['Submit','Initial scoping','Resourcing plan','Budget review','Exec approval','Kickoff','Schedule','Active'],
        'project-closure':   ['Submit','Final CoC summary','Lessons learned','Financial reconcile','Exec sign-off','Archived'],
      };

      window._myRequests = (rows || []).map(r => {
        const wfType    = r.workflow_type || 'unknown';
        const stepLabels = _STEP_LABELS[wfType] || ['Submit','Review','Complete'];
        const currentStep = r.current_step_name || '';

        // Build step progress array — mark done/active based on current_step_name
        const currentIdx = stepLabels.findIndex(s =>
          s.toLowerCase().includes((currentStep||'').toLowerCase().split(' ')[0])
        );
        const activeIdx = currentIdx >= 0 ? currentIdx : (r.status === 'completed' ? stepLabels.length : 0);
        const steps = stepLabels.map((label, i) => ({
          label,
          done:   r.status === 'completed' ? true : i < activeIdx,
          active: r.status !== 'completed' && i === activeIdx,
        }));

        // Map instance status to display status
        const statusMap = {
          'pending':    'awaiting',
          'in_progress':'in_progress',
          'active':     'in_progress',
          'completed':  'completed',
          'rejected':   'rejected',
          'withdrawn':  'rejected',
        };

        return {
          id:        r.id,
          title:     r.title || 'Untitled request',
          status:    statusMap[r.status] || 'in_progress',
          workflow:  wfType.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase()),
          submitted: r.created_at ? new Date(r.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '',
          steps,
          cocNote:   '',   // loaded lazily from CoC events if needed
          _raw:      r,
        };
      });
    } catch(e) {
      console.warn('[MyRequests] loadUserRequests fetch failed:', e);
      window._myRequests = [];
    }
  } else {
    window._myRequests = [];
  }

  renderMyRequestsActive();
  renderMyRequestsHistory();

  // Update badges
  const activeCount = (window._myRequests||[]).filter(r=>r.status!=='completed'&&r.status!=='rejected').length;
  const badge = document.getElementById('ust-requests-badge');
  if (badge) {
    badge.textContent = activeCount > 0 ? activeCount + ' active' : '';
    badge.style.display = activeCount > 0 ? 'inline' : 'none';
  }
  const activeBadge = document.getElementById('myr-active-badge');
  if (activeBadge) {
    activeBadge.textContent = activeCount > 0 ? activeCount : '';
    activeBadge.style.display = activeCount > 0 ? 'inline' : 'none';
  }
};

window.myrSwitchView = function(view, btn) {
  document.querySelectorAll('.myr-subnav').forEach(b => {
    b.classList.remove('on');
    b.style.color = 'rgba(255,255,255,.35)';
    b.style.borderBottomColor = 'transparent';
  });
  if (btn) {
    btn.classList.add('on');
    btn.style.color = '#00D2FF';
    btn.style.borderBottomColor = '#00D2FF';
  }
  ['browse','active','history'].forEach(v => {
    const p = document.getElementById('myr-pane-'+v);
    if (p) p.style.display = v === view ? 'block' : 'none';
  });
};

// Workflow catalog definition
const _WF_CATALOG = [
  { cat:'Resource & scheduling', items:[
    { id:'resource-alloc', title:'Resource allocation request', icon:'user', iconBg:'rgba(0,210,255,.1)', iconColor:'#00D2FF',
      desc:'Request a change to a team member\'s allocation across projects. Routes to PM then management for approval.',
      steps:5, avgTime:'Avg 28h', usage:'3 this month' },
    { id:'pto-request', title:'PTO / leave request', icon:'cal', iconBg:'rgba(139,92,246,.1)', iconColor:'#8B5CF6',
      desc:'Request time off. Automatically blocks your calendar, notifies your PM, and updates assignment constraints for the period.',
      steps:3, avgTime:'Avg 4h', usage:'Used 6\xD7 this year', isNew:false },
    { id:'capacity-concern', title:'Capacity overload concern', icon:'warn', iconBg:'rgba(226,75,74,.1)', iconColor:'#E24B4A',
      desc:'Formally raise a capacity concern with your PM. Pre-populated with your current load, overdue count, and queue summary.',
      steps:3, avgTime:'Avg 6h', usage:'PM notified immediately' },
  ]},
  { cat:'Approvals & reviews', items:[
    { id:'doc-review', title:'Document review & sign-off', icon:'check', iconBg:'rgba(29,158,117,.1)', iconColor:'#1D9E75',
      desc:'Submit a document for structured review. Routes to designated reviewers with version tracking and approval chain.',
      steps:6, avgTime:'Avg 48h', usage:'New this month', isNew:true },
    { id:'change-request', title:'Change request', icon:'plus-sq', iconBg:'rgba(239,159,39,.1)', iconColor:'#EF9F27',
      desc:'Submit a scope, timeline, or resource change request. Requires PM and client acknowledgement before taking effect.',
      steps:7, avgTime:'Avg 72h', usage:'1 this month' },
    { id:'issue-escalation', title:'Issue escalation', icon:'info-circle', iconBg:'rgba(0,210,255,.1)', iconColor:'#00D2FF',
      desc:'Escalate a project issue through the formal chain of custody. Auto-attaches CoC context and intervention history.',
      steps:4, avgTime:'Avg 12h', usage:'2 this month' },
  ]},
  { cat:'HR & admin', items:[
    { id:'expense', title:'Expense reimbursement', icon:'doc-lines', iconBg:'rgba(255,255,255,.06)', iconColor:'rgba(255,255,255,.5)',
      desc:'Submit project-related expenses for reimbursement. Routes to PM then finance for approval and processing.',
      steps:4, avgTime:'Avg 5 days', usage:'' },
    { id:'training', title:'Training request', icon:'globe', iconBg:'rgba(255,255,255,.06)', iconColor:'rgba(255,255,255,.5)',
      desc:'Request approval for external training, certification, or conference attendance. Includes cost and schedule impact review.',
      steps:5, avgTime:'Avg 3 days', usage:'' },
  ]},
  { cat:'Project requests', items:[
    { id:'new-project', title:'New project intake', icon:'grid', iconBg:'rgba(0,210,255,.08)', iconColor:'rgba(0,210,255,.6)',
      desc:'Initiate a new project request. Triggers the full intake workflow including scoping, resourcing, and executive approval.',
      steps:8, avgTime:'Avg 5 days', usage:'' },
    { id:'project-closure', title:'Project closure', icon:'flag', iconBg:'rgba(29,158,117,.08)', iconColor:'rgba(29,158,117,.6)',
      desc:'Formally close a project. Captures lessons learned, final CoC summary, and triggers financial reconciliation.',
      steps:6, avgTime:'Avg 2 days', usage:'' },
  ]},
];

const _WF_ICONS = {
  'user': `<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="4" r="2.5" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M2 12c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5" stroke="currentColor" stroke-width="1.3" fill="none"/></svg>`,
  'cal':  `<svg width="14" height="14" viewBox="0 0 14 14"><rect x="1" y="2" width="12" height="11" rx="1" stroke="currentColor" stroke-width="1.3" fill="none"/><line x1="1" y1="5.5" x2="13" y2="5.5" stroke="currentColor" stroke-width="1"/><line x1="4.5" y1="1" x2="4.5" y2="3" stroke="currentColor" stroke-width="1.3"/><line x1="9.5" y1="1" x2="9.5" y2="3" stroke="currentColor" stroke-width="1.3"/></svg>`,
  'warn': `<svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 2L13 12H1Z" stroke="currentColor" stroke-width="1.3" fill="none"/><line x1="7" y1="6" x2="7" y2="9" stroke="currentColor" stroke-width="1.5"/><circle cx="7" cy="10.5" r=".8" fill="currentColor"/></svg>`,
  'check':`<svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 7l3.5 3.5L12 4" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`,
  'plus-sq':`<svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="2" width="10" height="10" rx="1" stroke="currentColor" stroke-width="1.3" fill="none"/><line x1="5" y1="7" x2="9" y2="7" stroke="currentColor" stroke-width="1.3"/><line x1="7" y1="5" x2="7" y2="9" stroke="currentColor" stroke-width="1.3"/></svg>`,
  'info-circle':`<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.3" fill="none"/><line x1="7" y1="5" x2="7" y2="7.5" stroke="currentColor" stroke-width="1.5"/><circle cx="7" cy="9.5" r=".8" fill="currentColor"/></svg>`,
  'doc-lines':`<svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="1" width="10" height="12" rx="1" stroke="currentColor" stroke-width="1.3" fill="none"/><line x1="4.5" y1="5" x2="9.5" y2="5" stroke="currentColor" stroke-width="1"/><line x1="4.5" y1="7.5" x2="9.5" y2="7.5" stroke="currentColor" stroke-width="1"/><line x1="4.5" y1="10" x2="7.5" y2="10" stroke="currentColor" stroke-width="1"/></svg>`,
  'globe':`<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M4 7h6M7 2v10M3 4.5c1 .7 2.5 1 4 1s3-.3 4-1M3 9.5c1-.7 2.5-1 4-1s3 .3 4 1" stroke="currentColor" stroke-width="1" fill="none"/></svg>`,
  'grid': `<svg width="14" height="14" viewBox="0 0 14 14"><rect x="1" y="1" width="5" height="5" stroke="currentColor" stroke-width="1.2" fill="none"/><rect x="8" y="1" width="5" height="5" stroke="currentColor" stroke-width="1.2" fill="none"/><rect x="1" y="8" width="5" height="5" stroke="currentColor" stroke-width="1.2" fill="none"/><rect x="8" y="8" width="5" height="5" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>`,
  'flag': `<svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 2v10M3 2h8l-2 3 2 3H3" stroke="currentColor" stroke-width="1.3" fill="none"/></svg>`,
};

function renderMyRequestsCatalog() {
  const _esc = s => !s ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const el = document.getElementById('myr-catalog-content');
  if (!el) return;
  let html = '';
  _WF_CATALOG.forEach(cat => {
    html += `<div class="myr-cat-label"><div class="myr-cat-line"></div>${_esc(cat.cat)}<div class="myr-cat-line"></div></div>`;
    html += `<div class="wf-catalog-grid">`;
    cat.items.forEach(wf => {
      const icon = _WF_ICONS[wf.icon] || '';
      html += `<div class="wf-card${wf.isNew?' wf-card-new':''}" onclick="myrOpenWorkflowForm('${wf.id}')">
        <div class="wf-card-top">
          <div class="wf-icon" style="background:${wf.iconBg};color:${wf.iconColor}">${icon}</div>
          <div class="wf-card-title">${_esc(wf.title)}</div>
        </div>
        <div class="wf-card-desc">${_esc(wf.desc)}</div>
        <div class="wf-card-meta">
          <span>${wf.steps} steps</span>
          <span>${wf.avgTime}</span>
          ${wf.usage?`<span>${_esc(wf.usage)}</span>`:''}
        </div>
        <button class="wf-card-submit" onclick="event.stopPropagation();myrOpenWorkflowForm('${wf.id}')">Submit &#8594;</button>
      </div>`;
    });
    html += `</div>`;
  });
  el.innerHTML = html;
}

function renderMyRequestsActive() {
  const el = document.getElementById('myr-active-content');
  if (!el) return;
  const reqs = window._myRequests || [];
  const active = reqs.filter(r => r.status !== 'completed' && r.status !== 'rejected');
  if (!active.length) {
    el.innerHTML = `<div style="font-family:var(--font-head);font-size:12px;color:rgba(255,255,255,.25);padding:20px 0;text-align:center">No active requests. Browse the catalog to submit a new request.</div>`;
    return;
  }
  let html = '';
  active.forEach((req, i) => {
    const statusColor = req.status==='approved'?'#1D9E75': req.status==='awaiting'?'#EF9F27':'#00D2FF';
    const badgeClass = req.status==='approved'?'style="border:1px solid rgba(29,158,117,.3);color:#1D9E75"':
                       req.status==='awaiting' ?'style="border:1px solid rgba(239,159,39,.3);color:#EF9F27"':
                                                'style="border:1px solid rgba(0,210,255,.3);color:#00D2FF"';
    const badgeLabel = req.status==='approved'?'Approved':req.status==='awaiting'?'Awaiting response':'In progress';
    const dotAnim = req.status==='awaiting'?'animation:myrActivePulse 1.5s infinite':'';
    let stepsHtml = (req.steps||[]).map((s,si) => {
      const cls = s.done?'myr-ptd-done':s.active?'myr-ptd-active':'myr-ptd-pending';
      const nameCls = s.done?'done':s.active?'active':'';
      const label = s.done?'&#10003;':(si+1);
      return `<div class="myr-pt-step"><div class="myr-pt-dot ${cls}">${label}</div><div class="myr-pt-name ${nameCls}">${_esc(s.label)}</div></div>`;
    }).join('');
    html += `<div class="myr-active-req">
      <div class="myr-ar-head" onclick="myrToggleReq('myr-ar-body-${i}')">
        <div style="width:8px;height:8px;border-radius:50%;background:${statusColor};flex-shrink:0;${dotAnim}"></div>
        <div style="font-family:var(--font-head);font-size:12px;font-weight:700;color:#F0F6FF;flex:1">${_esc(req.title)}</div>
        <span style="font-family:var(--font-head);font-size:11px;padding:2px 8px;${badgeClass.slice(7,-1)}">${badgeLabel}</span>
        <div style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.3)">${_esc(req.submitted||'')} &middot; ${_esc(req.workflow||'')}</div>
      </div>
      <div class="myr-ar-body${req.expanded?' open':''}" id="myr-ar-body-${i}">
        <div style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.3);margin-bottom:5px">Workflow progress</div>
        <div class="myr-pt-steps">${stepsHtml}</div>
        ${req.cocNote?`<div style="font-family:var(--font-head);font-size:11px;padding:6px 9px;background:rgba(0,210,255,.04);border:1px solid rgba(0,210,255,.1);border-left:2px solid rgba(0,210,255,.35);color:rgba(240,246,255,.65);line-height:1.55;margin-bottom:8px">${_esc(req.cocNote)}</div>`:''}
        <div style="display:flex;gap:5px;flex-wrap:wrap">
          <button onclick="myrWithdrawRequest('${req.id}')" style="font-family:var(--font-head);font-size:11px;padding:4px 12px;background:none;border:1px solid rgba(226,75,74,.3);color:#E24B4A;cursor:pointer;letter-spacing:.06em">Withdraw</button>
          <button onclick="myrAddContext('${req.id}')" style="font-family:var(--font-head);font-size:11px;padding:4px 12px;background:none;border:1px solid rgba(0,210,255,.3);color:#00D2FF;cursor:pointer;letter-spacing:.06em">Add context</button>
        </div>
      </div>
    </div>`;
  });
  el.innerHTML = html;
}

function renderMyRequestsHistory() {
  const el = document.getElementById('myr-history-content');
  if (!el) return;
  const reqs = window._myRequests || [];
  const hist = reqs.filter(r => r.status === 'completed' || r.status === 'rejected');
  if (!hist.length) {
    el.innerHTML = `<div style="font-family:var(--font-head);font-size:12px;color:rgba(255,255,255,.25);padding:20px 0;text-align:center">No completed requests yet.</div>`;
    return;
  }
  let html = `<div style="border:1px solid rgba(255,255,255,.07);overflow:hidden">`;
  hist.forEach((req, i) => {
    const isLast = i === hist.length - 1;
    const outcomeColor = req.status==='completed'?'#1D9E75':req.status==='rejected'?'#E24B4A':'#EF9F27';
    const outcomeBorder = req.status==='completed'?'rgba(29,158,117,.3)':req.status==='rejected'?'rgba(226,75,74,.3)':'rgba(239,159,39,.3)';
    const outcomeLabel = req.status==='completed'?'Approved':req.status==='rejected'?'Rejected':'Pending';
    html += `<div class="myr-hist-row"${isLast?' style="border-bottom:none"':''}>
      <div style="width:7px;height:7px;border-radius:50%;background:${outcomeColor};flex-shrink:0"></div>
      <div style="flex:1;font-family:var(--font-head);font-size:11px;color:#F0F6FF">${_esc(req.title)}</div>
      <div style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.3)">${_esc(req.date||'')}</div>
      <div style="font-family:var(--font-head);font-size:11px;padding:1px 7px;border:1px solid ${outcomeBorder};color:${outcomeColor}">${outcomeLabel}</div>
    </div>`;
  });
  html += `</div>`;
  el.innerHTML = html;
}

window.myrToggleReq = function(id) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('open');
};

window.myrOpenWorkflowForm = function(wfId) {
  // Find workflow definition
  let wf = null;
  _WF_CATALOG.forEach(c => c.items.forEach(w => { if (w.id === wfId) wf = w; }));
  if (!wf) return;
  // Build pre-filled form based on workflow type
  const stepPreviews = {
    'resource-alloc': ['Submit','PM review','Mgmt approval','Notify resource','Update schedule'],
    'pto-request':    ['Submit','PM review','Approved \u2192 cal blocked + team notified'],
    'capacity-concern':['Submit','PM review','Decision \u2192 queue adjusted'],
    'doc-review':     ['Submit','Route to reviewers','Review round 1','Revisions','Final review','Sign-off'],
    'change-request': ['Submit','PM review','Client review','Impact assessment','Mgmt approval','Update plan','Notify team'],
    'issue-escalation':['Submit','PM review','Resolution plan','Resolved \u2192 CoC event'],
    'expense':        ['Submit','PM review','Finance approval','Processed'],
    'training':       ['Submit','PM review','Budget check','Mgmt approval','Confirmed'],
    'new-project':    ['Submit','Initial scoping','Resourcing plan','Budget review','Exec approval','Kickoff','Schedule','Active'],
    'project-closure':['Submit','Final CoC summary','Lessons learned','Financial reconcile','Exec sign-off','Archived'],
  };
  const steps = stepPreviews[wfId] || ['Submit','Review','Complete'];
  const stepsHtml = steps.map(s=>`<span style="font-family:var(--font-head);font-size:11px;padding:3px 9px;border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.5);background:rgba(255,255,255,.02)">${_esc(s)}</span><span style="font-size:11px;color:rgba(255,255,255,.2)">\u2192</span>`).join('').replace(/→$/, '');
  const formBody = _buildWorkflowFormBody(wfId, wf);
  // Show via a compass toast-style modal — reuse existing modal infrastructure if available
  const prefillNote = wfId === 'capacity-concern' || wfId === 'resource-alloc'
    ? `<div style="font-family:var(--font-head);font-size:11px;color:rgba(0,210,255,.5);padding:5px 8px;background:rgba(0,210,255,.04);border:1px solid rgba(0,210,255,.12);margin-bottom:10px;line-height:1.5">Pre-filled from My Work context where available. Review and adjust before submitting.</div>`
    : '';
  const modalHtml = `
    <div style="padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.07);display:flex;align-items:center;gap:8px">
      <div style="font-family:var(--font-head);font-size:13px;font-weight:700;color:#F0F6FF;flex:1">${_esc(wf.title)}</div>
      <button onclick="myrCloseModal()" style="background:none;border:1px solid rgba(226,75,74,.3);color:#E24B4A;width:20px;height:20px;cursor:pointer;font-family:var(--font-head);font-size:11px;display:flex;align-items:center;justify-content:center">&#x2715;</button>
    </div>
    <div style="padding:14px;overflow-y:auto;max-height:60vh">
      ${prefillNote}
      <div style="margin-bottom:10px">
        <div style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.3);margin-bottom:5px;letter-spacing:.07em;text-transform:uppercase">Workflow steps</div>
        <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">${stepsHtml}</div>
      </div>
      ${formBody}
    </div>
    <div style="padding:10px 14px;border-top:1px solid rgba(255,255,255,.07);display:flex;gap:6px;justify-content:flex-end">
      <button onclick="myrCloseModal()" style="font-family:var(--font-head);font-size:11px;padding:5px 14px;background:none;border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.4);cursor:pointer;letter-spacing:.06em">Cancel</button>
      <button onclick="myrSubmitWorkflow('${wfId}')" data-myr-submit style="font-family:var(--font-head);font-size:11px;padding:5px 14px;background:rgba(0,210,255,.08);border:1px solid rgba(0,210,255,.4);color:#00D2FF;cursor:pointer;letter-spacing:.06em">Submit request &#8594;</button>
    </div>`;
  // Create modal overlay
  let overlay = document.getElementById('myr-modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'myr-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.addEventListener('click', e => { if (e.target === overlay) myrCloseModal(); });
    document.body.appendChild(overlay);
  }
  const modal = document.createElement('div');
  modal.id = 'myr-modal';
  modal.style.cssText = 'background:#111827;border:1px solid rgba(0,210,255,.25);width:480px;max-height:85vh;border-radius:4px;overflow:hidden;display:flex;flex-direction:column';
  modal.innerHTML = modalHtml;
  overlay.innerHTML = '';
  overlay.appendChild(modal);
  overlay.style.display = 'flex';
};

window.myrCloseModal = function() {
  const overlay = document.getElementById('myr-modal-overlay');
  if (overlay) overlay.style.display = 'none';
};

// ── Withdraw a submitted request ──────────────────────────
window.myrWithdrawRequest = async function(instanceId) {
  if (!instanceId) return;
  const firmId  = window.FIRM_ID || 'aaaaaaaa-0001-0001-0001-000000000001';
  const resName = window._myResource?.name || 'Unknown';
  const resId   = window._myResource?.id   || null;
  const now     = new Date().toISOString();

  // Confirm
  const req = (window._myRequests||[]).find(r => r.id === instanceId);
  const title = req?.title || 'this request';

  // Simple inline confirm — replace with modal if needed
  if (!window.confirm(`Withdraw "${title}"?\n\nThis will cancel the request and notify the reviewer.`)) return;

  try {
    // PATCH instance status to withdrawn
    await API.patch(`workflow_instances?id=eq.${instanceId}`, {
      status: 'withdrawn',
      updated_at: now,
    });

    // CoC event
    await API.post('coc_events', {
      id:                crypto.randomUUID(),
      firm_id:           firmId,
      entity_id:         instanceId,
      entity_type:       'workflow_instance',
      event_type:        'request.withdrawn',
      event_class:       'lifecycle',
      severity:          'info',
      event_notes:       JSON.stringify({ title, withdrawn_by: resName }),
      actor_name:        resName,
      actor_resource_id: resId,
      occurred_at:       now,
      created_at:        now,
    });

    // Close any open action items for this instance
    await API.patch(`workflow_action_items?instance_id=eq.${instanceId}&status=eq.open`, {
      status: 'resolved',
      updated_at: now,
    }).catch(() => {});

    // Optimistic local update
    if (window._myRequests) {
      window._myRequests = window._myRequests.map(r =>
        r.id === instanceId ? { ...r, status: 'rejected' } : r
      );
    }
    renderMyRequestsActive();
    renderMyRequestsHistory();
    compassToast(`"${title}" withdrawn. Reviewer notified.`);

  } catch(e) {
    console.error('[MyRequests] withdraw failed:', e);
    compassToast('Withdraw failed — ' + (e.message || 'check console'), 4000);
  }
};

// ── Add context to an active request ─────────────────────
window.myrAddContext = async function(instanceId) {
  if (!instanceId) return;
  const req = (window._myRequests||[]).find(r => r.id === instanceId);
  const title = req?.title || 'request';

  // Inline context modal
  const existing = document.getElementById('myr-context-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'myr-context-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:600;display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.innerHTML = `
    <div style="background:#111827;border:1px solid rgba(0,210,255,.25);width:420px;border-radius:4px;overflow:hidden">
      <div style="padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.07);display:flex;align-items:center;gap:8px">
        <div style="font-family:var(--font-head);font-size:13px;font-weight:700;color:#F0F6FF;flex:1">Add context</div>
        <div style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.3);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(title)}</div>
        <button onclick="document.getElementById('myr-context-overlay').remove()"
          style="background:none;border:1px solid rgba(226,75,74,.3);color:#E24B4A;width:20px;height:20px;cursor:pointer;font-family:var(--font-head);font-size:11px">&#x2715;</button>
      </div>
      <div style="padding:14px">
        <textarea id="myr-context-text" placeholder="Add additional context, updates, or attachments for the reviewer…"
          style="width:100%;padding:8px 10px;background:#1a2a40;border:1px solid rgba(0,210,255,.2);
                 color:#C8DFF0;font-family:var(--font-head);font-size:12px;outline:none;
                 resize:none;box-sizing:border-box" rows="4"></textarea>
      </div>
      <div style="padding:10px 14px;border-top:1px solid rgba(255,255,255,.07);display:flex;gap:6px;justify-content:flex-end">
        <button onclick="document.getElementById('myr-context-overlay').remove()"
          style="font-family:var(--font-head);font-size:11px;padding:5px 14px;background:none;border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.4);cursor:pointer;letter-spacing:.06em">
          Cancel
        </button>
        <button onclick="myrSubmitContext('${instanceId}')"
          style="font-family:var(--font-head);font-size:11px;padding:5px 14px;background:rgba(0,210,255,.08);border:1px solid rgba(0,210,255,.4);color:#00D2FF;cursor:pointer;letter-spacing:.06em">
          Add to thread &#8594;
        </button>
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  document.getElementById('myr-context-text')?.focus();
};

window.myrSubmitContext = async function(instanceId) {
  const text = document.getElementById('myr-context-text')?.value?.trim();
  if (!text) { compassToast('Enter some context before submitting.', 2000); return; }

  const firmId  = window.FIRM_ID || 'aaaaaaaa-0001-0001-0001-000000000001';
  const resName = window._myResource?.name || 'Unknown';
  const resId   = window._myResource?.id   || null;
  const now     = new Date().toISOString();

  try {
    await API.post('coc_events', {
      id:                crypto.randomUUID(),
      firm_id:           firmId,
      entity_id:         instanceId,
      entity_type:       'workflow_instance',
      event_type:        'request.context_added',
      event_class:       'note',
      severity:          'info',
      event_notes:       JSON.stringify({ note: text }),
      actor_name:        resName,
      actor_resource_id: resId,
      occurred_at:       now,
      created_at:        now,
    });

    // Update local cocNote on the request
    if (window._myRequests) {
      window._myRequests = window._myRequests.map(r =>
        r.id === instanceId ? { ...r, cocNote: text } : r
      );
    }
    renderMyRequestsActive();
    document.getElementById('myr-context-overlay')?.remove();
    compassToast('Context added to request thread.');

  } catch(e) {
    console.error('[MyRequests] add context failed:', e);
    compassToast('Failed to add context — ' + (e.message || 'check console'), 4000);
  }
};

window.myrSubmitWorkflow = async function(wfId) {
  // ── 1. Collect form values from modal ───────────────────
  const modal = document.getElementById('myr-modal');
  if (!modal) return;

  // Read all labelled inputs/selects/textareas by their data-field attribute
  const getField = (fieldId) => {
    const el = modal.querySelector(`[data-myr-field="${fieldId}"]`);
    return el ? el.value.trim() : '';
  };

  // Build field map by workflow type
  let title = '', details = {}, reviewerLabel = '';
  switch (wfId) {
    case 'doc-review': {
      const docName    = getField('doc_name');
      const reviewer   = getField('reviewer');
      const deadline   = getField('deadline');
      const instructions = getField('instructions');
      if (!docName) { compassToast('Document name is required.', 2500); return; }
      if (!reviewer) { compassToast('Reviewer is required.', 2500); return; }
      title        = `Document review: ${docName}`;
      reviewerLabel = reviewer;
      details      = { doc_name: docName, reviewer, deadline, instructions };
      break;
    }
    case 'resource-alloc': {
      const resource = getField('resource');
      const alloc    = getField('allocation');
      const effDate  = getField('effective_date');
      const justif   = getField('justification');
      if (!resource) { compassToast('Resource is required.', 2500); return; }
      title   = `Resource allocation: ${resource} → ${alloc}`;
      details = { resource, allocation: alloc, effective_date: effDate, justification: justif };
      break;
    }
    case 'pto-request': {
      const from = getField('from');
      const to   = getField('to');
      const plan = getField('coverage_plan');
      if (!from || !to) { compassToast('Start and end dates are required.', 2500); return; }
      title   = `PTO request: ${from} – ${to}`;
      details = { from, to, coverage_plan: plan };
      break;
    }
    case 'change-request': {
      const type   = getField('change_type');
      const desc   = getField('change_desc');
      const impact = getField('impact');
      if (!desc) { compassToast('Change description is required.', 2500); return; }
      title   = `Change request: ${type}`;
      details = { change_type: type, description: desc, impact };
      break;
    }
    case 'issue-escalation': {
      const proj  = getField('project');
      const issue = getField('issue_desc');
      const steps = getField('steps_taken');
      if (!issue) { compassToast('Issue description is required.', 2500); return; }
      title   = `Issue escalation: ${proj}`;
      details = { project: proj, description: issue, steps_taken: steps };
      break;
    }
    default: {
      const desc = getField('details');
      title   = wfId.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase()) + ' request';
      details = { description: desc };
    }
  }

  // ── 2. Disable submit button to prevent double-submit ───
  const submitBtn = modal.querySelector('[data-myr-submit]');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting…'; }

  myrCloseModal();

  const firmId   = window.FIRM_ID || 'aaaaaaaa-0001-0001-0001-000000000001';
  const resId    = window._myResource?.id || null;
  const resName  = window._myResource?.name || 'Unknown';
  const now      = new Date().toISOString();
  const instanceId = crypto.randomUUID();

  try {
    // ── 3. Create workflow_instance ────────────────────────
    await API.post('workflow_instances', {
      id:                       instanceId,
      firm_id:                  firmId,
      title,
      status:                   'pending',
      workflow_type:            wfId,
      current_step_name:        'Submitted',
      submitted_by_resource_id: resId,
      submitted_by_name:        resName,
      template_id:              null,   // My Requests submissions are template-free
      created_at:               now,
    });

    // ── 4. Write CoC event ─────────────────────────────────
    const cocId = crypto.randomUUID();
    await API.post('coc_events', {
      id:               cocId,
      firm_id:          firmId,
      entity_id:        instanceId,
      entity_type:      'workflow_instance',
      event_type:       'request.submitted',
      event_class:      'lifecycle',
      severity:         'info',
      event_notes:      JSON.stringify({
        workflow_type: wfId,
        title,
        ...details,
      }),
      actor_name:       resName,
      actor_resource_id: resId,
      occurred_at:      now,
      created_at:       now,
    });

    // ── 5. Create action item for the reviewer in My Work ──
    // Resolve reviewer resource_id: for doc-review, match label against _resources
    // For other types, default to PM (first resource that is_pm, or fallback)
    let ownerResId   = null;
    let ownerResName = reviewerLabel || 'PM';

    if (reviewerLabel && window._resources?.length) {
      // Strip any role suffix like " (PM)" from the label
      const cleanLabel = reviewerLabel.replace(/\s*\(.*?\)\s*$/,'').trim();
      const match = window._resources.find(r =>
        r.name && r.name.toLowerCase().includes(cleanLabel.toLowerCase().split(' ')[0])
      );
      if (match) { ownerResId = match.id; ownerResName = match.name; }
    }
    // Fallback: find any PM resource
    if (!ownerResId && window._resources?.length) {
      const pm = window._resources.find(r => r.department?.toLowerCase().includes('pm') || r.title?.toLowerCase().includes('project manager'));
      if (pm) { ownerResId = pm.id; ownerResName = pm.name; }
    }

    if (ownerResId) {
      await API.post('workflow_action_items', {
        id:               crypto.randomUUID(),
        instance_id:      instanceId,
        title:            `Review request: ${title}`,
        body:             details.instructions || details.justification || details.description || '',
        status:           'open',
        owner_resource_id: ownerResId,
        owner_name:       ownerResName,
        created_by_name:  resName,
        due_date:         details.deadline || null,
      });
    }

    // ── 6. Optimistic local update → re-render ─────────────
    const stepPreviews = {
      'resource-alloc':    ['Submit','PM review','Mgmt approval','Notify resource','Update schedule'],
      'pto-request':       ['Submit','PM review','Approved → cal blocked + team notified'],
      'capacity-concern':  ['Submit','PM review','Decision → queue adjusted'],
      'doc-review':        ['Submit','Route to reviewers','Review round 1','Revisions','Final review','Sign-off'],
      'change-request':    ['Submit','PM review','Client review','Impact assessment','Mgmt approval','Update plan','Notify team'],
      'issue-escalation':  ['Submit','PM review','Resolution plan','Resolved → CoC event'],
      'expense':           ['Submit','PM review','Finance approval','Processed'],
      'training':          ['Submit','PM review','Budget check','Mgmt approval','Confirmed'],
      'new-project':       ['Submit','Initial scoping','Resourcing plan','Budget review','Exec approval','Kickoff','Schedule','Active'],
      'project-closure':   ['Submit','Final CoC summary','Lessons learned','Financial reconcile','Exec sign-off','Archived'],
    };
    const labels = stepPreviews[wfId] || ['Submit','Review','Complete'];
    const steps  = labels.map((label, i) => ({ label, done: i < 1, active: i === 1 }));

    window._myRequests = window._myRequests || [];
    window._myRequests.unshift({
      id:        instanceId,
      title,
      status:    'in_progress',
      workflow:  wfId.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase()),
      submitted: new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'}),
      steps,
      cocNote:   details.instructions || details.description || '',
      expanded:  true,
    });

    renderMyRequestsActive();
    renderMyRequestsHistory();

    // Update tab badge
    const activeCount = window._myRequests.filter(r=>r.status!=='completed'&&r.status!=='rejected').length;
    const badge = document.getElementById('ust-requests-badge');
    if (badge) { badge.textContent = activeCount + ' active'; badge.style.display = 'inline'; }

    // Switch to Active sub-tab so the user sees their new request
    const activeBtn = document.querySelector('.myr-subnav[data-myr="active"]');
    if (activeBtn) myrSwitchView('active', activeBtn);

    compassToast(`✓ ${title} — submitted & routed to ${ownerResName}`);

  } catch(e) {
    console.error('[MyRequests] submit failed:', e);
    compassToast('Submission failed — ' + (e.message || 'check console'), 4000);
  }
};

function _buildWorkflowFormBody(wfId, wf) {
  // All inputs carry data-myr-field so myrSubmitWorkflow can read values by ID
  const inp = (label, fieldId, val='', required=true) =>
    `<div style="margin-bottom:10px">
      <div style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.4);letter-spacing:.07em;text-transform:uppercase;margin-bottom:4px">
        ${label}${required?' <span style="color:#E24B4A">*</span>':''}
      </div>
      <input data-myr-field="${fieldId}"
        style="width:100%;padding:6px 10px;background:#1a2a40;border:1px solid rgba(0,210,255,.2);
               color:#C8DFF0;font-family:var(--font-head);font-size:12px;outline:none;box-sizing:border-box"
        type="text" value="${_esc(val)}"/>
    </div>`;
  const ta = (label, fieldId, val='', rows=3, required=true) =>
    `<div style="margin-bottom:10px">
      <div style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.4);letter-spacing:.07em;text-transform:uppercase;margin-bottom:4px">
        ${label}${required?' <span style="color:#E24B4A">*</span>':''}
      </div>
      <textarea data-myr-field="${fieldId}"
        style="width:100%;padding:7px 10px;background:#1a2a40;border:1px solid rgba(0,210,255,.2);
               color:#C8DFF0;font-family:var(--font-head);font-size:12px;outline:none;
               resize:none;box-sizing:border-box"
        rows="${rows}">${_esc(val)}</textarea>
    </div>`;
  const sel = (label, fieldId, opts, required=true) =>
    `<div style="margin-bottom:10px">
      <div style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.4);letter-spacing:.07em;text-transform:uppercase;margin-bottom:4px">
        ${label}${required?' <span style="color:#E24B4A">*</span>':''}
      </div>
      <select data-myr-field="${fieldId}"
        style="width:100%;padding:6px 10px;background:#1a2a40;border:1px solid rgba(0,210,255,.2);
               color:#C8DFF0;font-family:var(--font-head);font-size:12px;outline:none;
               cursor:pointer;box-sizing:border-box">
        ${opts.map(o=>`<option>${_esc(o)}</option>`).join('')}
      </select>
    </div>`;

  // Reviewer options from live _resources, fallback to seed names
  const reviewerOpts = (window._resources||[]).length
    ? window._resources.map(r => r.name + (r.department ? ` (${r.department})` : ''))
    : ['VS (PM)','Sandra Okafor','Robert Chen','Alan Smith'];

  // Resource options for allocation requests
  const resourceOpts = (window._resources||[]).length
    ? window._resources.map(r => r.name)
    : ['Robert Chen','Sandra Okafor','Alan Smith','(Other)'];

  switch (wfId) {
    case 'resource-alloc':
      return sel('Resource requested', 'resource', resourceOpts) +
        sel('New allocation', 'allocation', ['40% NovaBio','60% NovaBio','80% NovaBio','100% NovaBio']) +
        inp('Effective date', 'effective_date', 'Apr 2, 2026') +
        ta('Justification', 'justification',
          'Section 4.3 review requires a dedicated resource starting Apr 2. Robert Chen at current 40% is insufficient.', 3);

    case 'pto-request':
      return inp('From', 'from', 'Mon Mar 31, 2026') +
        inp('To', 'to', 'Tue Apr 1, 2026') +
        ta('Coverage plan', 'coverage_plan',
          'Sandra Okafor to monitor NovaBio items. No Flexscope actions expected in this window.', 2, false);

    case 'capacity-concern':
      return `<div style="background:rgba(226,75,74,.05);border:1px solid rgba(226,75,74,.2);
                border-left:2px solid #E24B4A;padding:9px 11px;margin-bottom:10px;
                font-size:12px;color:rgba(240,246,255,.7);line-height:1.6">
          <div style="font-family:var(--font-head);font-size:11px;color:#E24B4A;
                      letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px">
            Current load — auto-generated
          </div>
          <div>Overdue: <strong style="color:#E24B4A">3 items</strong></div>
          <div>Due today: <strong style="color:#EF9F27">4 items</strong></div>
        </div>` +
        ta('What needs to move, be delegated, or be dropped?', 'details', '', 3);

    case 'doc-review':
      return inp('Document name / version', 'doc_name', '') +
        sel('Reviewer(s)', 'reviewer', reviewerOpts) +
        inp('Review deadline', 'deadline', '') +
        ta('Review instructions', 'instructions', '', 2, false);

    case 'change-request':
      return sel('Change type', 'change_type',
          ['Scope change','Timeline change','Resource change','Budget change']) +
        ta('Change description', 'change_desc', '', 3) +
        ta('Justification & impact', 'impact', '', 2);

    case 'issue-escalation':
      return sel('Project', 'project', ['Flexscope','NovaBio','Internal']) +
        ta('Issue description', 'issue_desc', '', 3) +
        ta('Steps already taken', 'steps_taken', '', 2, false);

    case 'expense':
      return inp('Project', 'project', '') +
        inp('Amount ($)', 'amount', '') +
        inp('Date incurred', 'expense_date', '') +
        ta('Description & receipts', 'description', '', 3);

    case 'training':
      return inp('Course / event name', 'course_name', '') +
        inp('Provider', 'provider', '') +
        inp('Cost ($)', 'cost', '') +
        inp('Dates', 'dates', '') +
        ta('Justification', 'justification', '', 2);

    case 'new-project':
      return inp('Project name', 'project_name', '') +
        sel('Client', 'client',
          [...new Set((window._projects||[]).map(p=>p.client_name||p.name).filter(Boolean)),
           '(New client)']) +
        inp('Target start date', 'start_date', '') +
        ta('Scope summary', 'scope', '', 3);

    case 'project-closure':
      return sel('Project', 'project',
          (window._projects||[]).map(p=>p.name).filter(Boolean).length
            ? (window._projects||[]).map(p=>p.name)
            : ['Flexscope','NovaBio','Internal']) +
        ta('Lessons learned', 'lessons', '', 3) +
        ta('Final notes', 'final_notes', '', 2, false);

    default:
      return ta('Details', 'details', '', 3);
  }
}

// ── My Calendar tab ────────────────────────────────────────
// ── Since-last-login delta strip ───────────────────────────
window.renderDeltaStrip = function(deltas) {
  // deltas: [{label, color:'red'|'amber'|'green'|'cyan', navigate:fn}]
  const strip = document.getElementById('mw-delta-strip');
  const chips = document.getElementById('mw-delta-chips');
  if (!strip || !chips || !deltas || !deltas.length) {
    if (strip) strip.style.display = 'none';
    return;
  }
  const colorMap = {
    red:   'border:1px solid rgba(226,75,74,.3);color:#E24B4A',
    amber: 'border:1px solid rgba(239,159,39,.3);color:#EF9F27',
    green: 'border:1px solid rgba(29,158,117,.3);color:#1D9E75',
    cyan:  'border:1px solid rgba(0,210,255,.3);color:#00D2FF',
  };
  chips.innerHTML = deltas.map((d, i) =>
    `<span class="delta-chip" style="${colorMap[d.color]||colorMap.cyan}" data-delta-idx="${i}">${_esc(d.label)}</span>`
  ).join('');
  // Store navigate fns
  window._deltaNavigateFns = deltas.map(d => d.navigate || null);
  strip.style.display = 'flex';
};

// Wire delta chip clicks at module level
document.addEventListener('click', function(ev) {
  const chip = ev.target.closest('.delta-chip');
  if (!chip) return;
  const idx = parseInt(chip.dataset.deltaIdx, 10);
  const fn = (window._deltaNavigateFns||[])[idx];
  if (typeof fn === 'function') fn();
});

// Populate delta strip after user view loads (called from _mwLoadUserView)
window.populateDeltaStrip = function() {
  // Build deltas from live data — tasks/concerns overdue since last session
  const tasks    = window._userTasks    || [];
  const concerns = window._userConcerns || [];
  const deltas   = [];
  const newTasks = tasks.filter(t => t._newSinceLogin);
  if (newTasks.length) {
    deltas.push({ label: newTasks.length + ' new action item' + (newTasks.length>1?'s':'') + ' assigned', color:'red',
      navigate: () => uSwitchTab('work', document.querySelector('.ust[data-tab=work]')) });
  }
  const overdue = tasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date) < new Date());
  if (overdue.length) {
    deltas.push({ label: overdue.length + ' item' + (overdue.length>1?'s':'')+' overdue', color:'amber',
      navigate: () => uSwitchTab('work', document.querySelector('.ust[data-tab=work]')) });
  }
  const unreads = concerns.filter(c => c.status==='unread'||c.status==='not_yet_read');
  if (unreads.length) {
    deltas.push({ label: unreads.length + ' unread concern' + (unreads.length>1?'s':''), color:'red',
      navigate: () => uSwitchTab('concerns', document.querySelector('.ust[data-tab=concerns]')) });
  }
  const reqs = window._myRequests || [];
  const recentApproved = reqs.filter(r => r.status==='completed' && r._newSinceLogin);
  if (recentApproved.length) {
    deltas.push({ label: recentApproved.length + ' request'+( recentApproved.length>1?'s':'')+' approved', color:'green',
      navigate: () => { uSwitchTab('requests', document.querySelector('.ust[data-tab=requests]')); myrSwitchView('active', document.querySelector('.myr-subnav[data-myr=active]')); } });
  }
  renderDeltaStrip(deltas);
};