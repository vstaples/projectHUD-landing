// ══════════════════════════════════════════════════════════
// MY WORK — SUITE TABS: MEETINGS, CALENDAR, CONCERNS
// VERSION: 20260402-202500
// ══════════════════════════════════════════════════════════
console.log('%c[mw-tabs] v20260410-395000','background:#c47d18;color:#000;font-weight:700;padding:2px 8px;border-radius:3px');

// ── Supabase URL/Key helpers ──────────────────────────────
// SUPA_URL/SUPA_KEY/FIRM_ID are defined in config.js but may be block-scoped
// when loaded from compass.html vs cadence.html. Resolve from any source.
function _mwSupaURL()      { try { return SUPA_URL;       } catch(_) { return window.SUPA_URL       || 'https://dvbetgdzksatcgdfftbs.supabase.co'; } }
function _mwSupaKey()      { try { return SUPA_KEY;       } catch(_) { return window.SUPA_KEY       || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR2YmV0Z2R6a3NhdGNnZGZmdGJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NDc2MTYsImV4cCI6MjA4OTEyMzYxNn0.1geeKhrLL3nhjW08ieKr7YZmE0AVX4xnom7i2j1W358'; } }
function _mwStorageBucket(){ try { return STORAGE_BUCKET; } catch(_) { return window.STORAGE_BUCKET || 'workflow-documents'; } }
function _mwFirmId()       { try { return FIRM_ID;        } catch(_) { return window.FIRM_ID        || 'aaaaaaaa-0001-0001-0001-000000000001'; } }

// ── Email notification helper ─────────────────────────────
// Calls /api/notify-step-activated — same endpoint Cadence uses.
async function _myrNotify({ toEmail, toName, fromName, stepName, stepType, title, instanceId, body, stepId }) {
  if (!toEmail) return;
  try {
    // Generate external response token for approval-type steps
    let approveUrl = null, rejectUrl = null;
    const _externalTypes = ['approval','signoff','external','confirmation','review'];
    if (_externalTypes.includes(stepType) && instanceId) {
      try {
        const rawToken   = crypto.randomUUID();
        const bindingStr = `${_mwFirmId()}:${instanceId}:${stepId||stepName}`;
        const encoder    = new TextEncoder();
        const hashBuf    = await crypto.subtle.digest('SHA-256', encoder.encode(bindingStr + rawToken));
        const tokenHmac  = Array.from(new Uint8Array(hashBuf))
          .map(b => b.toString(16).padStart(2,'0')).join('').slice(0,32);
        await API.post('external_step_tokens', {
          firm_id:           _mwFirmId(),
          instance_id:       instanceId,
          template_step_id:  stepId || null,
          token:             rawToken,
          token_hmac:        tokenHmac,
          token_hash:        tokenHmac,
          recipient_email:   toEmail,
          recipient_name:    toName || null,
          assignee_email:    toEmail,
          assignee_name:     toName || null,
          step_name:         stepName || null,
          step_instructions: body || null,
          instance_title:    title || null,
          template_name:     'Document Review Request',
          expires_at:        new Date(Date.now() + 30*24*3600*1000).toISOString(),
          generated_at:      new Date().toISOString(),
          issued_at:         new Date().toISOString(),
        }).catch(()=>{});
        const base = (window.location.origin || 'https://projecthud.com') + '/approve.html';
        approveUrl = `${base}?token=${rawToken}`;
        rejectUrl  = null; // Single button — approve.html shows all options
      } catch(_) {}
    }

    const _notifyUrl = `${_mwSupaURL()}/functions/v1/notify-step-activated`;
    const _notifyKey = _mwSupaKey();
    console.log('[notify] approveUrl:', approveUrl, 'stepType:', stepType, 'has_action_buttons:', !!(approveUrl));
    const res = await fetch(_notifyUrl, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        _notifyKey,
        'Authorization': `Bearer ${_notifyKey}`,
      },
      body: JSON.stringify({
        firm_id:            _mwFirmId(),
        instance_id:        instanceId || null,
        instance_title:     title      || null,
        template_name:      'Document Review Request',
        step_id:            stepId     || null,
        step_name:          stepName   || 'Review',
        step_type:          stepType   || 'review',
        assignee_name:      toName     || null,
        assignee_email:     toEmail,
        launched_by:        fromName   || null,
        is_bist:            false,
        step_instructions:  body       || null,
        approve_url:        approveUrl,
        reject_url:         rejectUrl,
        has_action_buttons: !!(approveUrl),
        outcomes:           [],
      }),
    });
    if (res.ok) {
      console.log('[MyRequests] Email sent to', toEmail);
    } else {
      res.text().then(t => console.warn('[MyRequests] notify', res.status, t.slice(0,300)));
    }
  } catch(e) {
    console.warn('[MyRequests] notify error:', e.message);
  }
}


// var (not let) — my-work.html scripts are injected via document.head.appendChild
// and may execute more than once per page session. var re-declaration is safe; let/const are not.
var _uActiveTab = _uActiveTab || 'work';
// Persistent expand/CoC state — survives DOM rebuilds
var _myrExpandedIds = _myrExpandedIds || new Set();
var _myrCocOpenIds  = _myrCocOpenIds  || new Set();
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
  // Stop CoC live poll when leaving requests tab
  if (_uActiveTab === 'requests' && tab !== 'requests' && window._myrCocPollTimer) {
    clearInterval(window._myrCocPollTimer);
    window._myrCocPollTimer = null;
    console.log('[MyRequests] CoC live refresh poll stopped');
  }
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
  if (tab === 'work' && window._mwWorkStale) {
    window._mwWorkStale = false;
    window._mwLoadUserView && window._mwLoadUserView();
  }
  if (tab === 'concerns' && !window._notesLoaded) loadMyNotesView();
  else if (tab === 'concerns' && window._notesRefresh) window._notesRefresh();
  if (tab === 'views' && !window._myViewsLoaded) loadMyViewsView();
  else if (tab === 'views' && window._viewsRefresh) window._viewsRefresh();
  if (tab === 'calendar' && !window._calLoaded) loadMyCalView();
  else if (tab === 'calendar' && window._calRefresh) window._calRefresh();
  if (tab === 'requests' && !window._requestsLoaded) loadUserRequests();
  else if (tab === 'requests' && window._requestsLoaded) {
    // Re-fetch on every visit to pick up reviewer actions and status changes
    window._requestsLoaded = false;
    loadUserRequests();
  }
  if (tab === 'timesheet' && !window._myTimeLoaded) loadMyTimeView();
};

// ── Calendar popup ────────────────────────────────────────
var _ucalYear  = (typeof _ucalYear  !== "undefined") ? _ucalYear  : new Date().getFullYear();
var _ucalMonth = (typeof _ucalMonth !== "undefined") ? _ucalMonth : new Date().getMonth(); // 0-indexed

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
    // If _widgetContext is missing despite being loaded, the const collision killed
    // the script block — force a clean re-init (page reload is the safest recovery)
    if (!window._widgetContext) {
      console.warn('[MyViews] _widgetContext missing after load — reloading page to recover');
      window.location.reload();
      return;
    }
    // Already loaded and healthy — just refresh data
    if (window._viewsRefresh) {
      window._viewsRefresh();
    } else if (window._viewsLoadView) {
      window._viewsLoaded = false;
      await window._viewsLoadView();
    }
    return;
  }
  const container = document.getElementById('views-root');
  if (!container) {
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
    // Bridge resource BEFORE calling _viewsLoadView so _widgetContext resolves correctly
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

// ══════════════════════════════════════════════════════════════════════════════
// MY REQUESTS — Cadence-backed engine  v20260403-400000
// ── Stubs for cdn-instances.js dependencies ──────────────────────────────────
if (typeof _startElapsedTimer === 'undefined') {
  window._startElapsedTimer = function() {};
}
if (typeof _stopElapsedTimer === 'undefined') {
  window._stopElapsedTimer = function() {};
}

// ── My Requests subnav switcher ─────────────────────────────────────────────
function myrSwitchView(view, btnEl) {
  // Update subnav button states
  document.querySelectorAll('.myr-subnav').forEach(function(b) {
    b.classList.remove('active', 'on');
    if (b.dataset.myr === view) b.classList.add('on');
  });
  // Show/hide pane containers (myr-pane-*) and content divs
  ['browse', 'active', 'history'].forEach(function(k) {
    var pane    = document.getElementById('myr-pane-' + k);
    var content = document.getElementById('myr-' + (k === 'browse' ? 'catalog' : k) + '-content');
    var show    = k === view;
    if (pane)    pane.style.display    = show ? '' : 'none';
    if (content) content.style.display = show ? '' : 'none';
  });
}
window.myrSwitchView = myrSwitchView;

// Browse  = live query: workflow_templates + workflow_form_definitions (compass_visible=true)
// Active  = live query: workflow_instances submitted by this user
// History = completed instances
// Instance view = full-screen overlay mounting Cadence instance renderer
// ══════════════════════════════════════════════════════════════════════════════

// ── State ─────────────────────────────────────────────────────────────────────
window._myrTemplates   = [];
window._myrFormDefs    = [];
window._myrInstances   = [];
window._myrLoadRunning = false;
window._myrLoadPending = false;

// ── Entry point ───────────────────────────────────────────────────────────────
window.loadUserRequests = async function() {
  if (window._myrLoadRunning) {
    window._myrLoadPending = true;
    return;
  }
  window._myrLoadRunning = true;
  window._myrLoadPending = false;
  window._requestsLoaded = true;
  try {
    const firmId = _mwFirmId();
    // Resolve resource UUID — _myResource may not be set; fall back to email lookup
    let resId = (typeof _myResource !== 'undefined' && _myResource?.id) ? _myResource.id : null;
    if (!resId && window.CURRENT_USER?.email) {
      const resRows = await API.get(`resources?firm_id=eq.${firmId}&select=id&limit=1&or=(email.eq.${encodeURIComponent(window.CURRENT_USER.email)},user_id.eq.${encodeURIComponent(window.CURRENT_USER.id||'')})`).catch(()=>[]);
      resId = resRows?.[0]?.id || null;
      console.log('[loadUserRequests] resolved resId from email:', resId);
    }
    if (!resId && window.CURRENT_USER?.sub) {
      // Try auth sub (UUID portion)
      const resRows2 = await API.get(`resources?firm_id=eq.${firmId}&select=id,user_id&limit=50`).catch(()=>[]);
      const match = resRows2.find(r => r.user_id === window.CURRENT_USER.sub || r.user_id === window.CURRENT_USER.id);
      resId = match?.id || null;
      console.log('[loadUserRequests] resolved resId from sub:', resId);
    }
    const [wfTmpls, formDefs, instances] = await Promise.all([
      API.get(`workflow_templates?compass_visible=eq.true&status=eq.released&firm_id=eq.${firmId}&order=name.asc&select=id,name,description,status,version,trigger_type`).catch(() => []),
      API.get(`workflow_form_definitions?compass_visible=eq.true&state=in.(certified,published)&firm_id=eq.${firmId}&order=source_name.asc&select=id,source_name,state,version,category_id,description`).catch(() => []),
      resId ? API.get(`workflow_instances?submitted_by_resource_id=eq.${resId}&order=created_at.desc&limit=100&select=id,title,status,current_step_name,workflow_type,template_id,created_at,updated_at`).catch(() => []) : [],
    ]);
    window._myrTemplates = wfTmpls  || [];
    window._myrFormDefs  = formDefs || [];
    window._myrInstances = instances || [];
    _myrRenderAll();
  } catch(e) {
    console.error('[loadUserRequests] failed:', e.message);
  } finally {
    window._myrLoadRunning = false;
    if (window._myrLoadPending) {
      window._myrLoadPending = false;
      setTimeout(() => window.loadUserRequests && window.loadUserRequests(), 300);
    }
  }
};

function _myrRenderAll() {
  _myrRenderBrowse();
  _myrRenderActive();
  _myrRenderHistory();
  _myrUpdateRequestBadges();
}

// ── BROWSE ────────────────────────────────────────────────────────────────────
function _myrRenderBrowse() {
  const el = document.getElementById('myr-catalog-content');
  if (!el) return;
  const tmpls = window._myrTemplates || [];
  const forms = window._myrFormDefs  || [];
  const esc = s => !s ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  if (!forms.length) {
    el.innerHTML = `<div style="font-family:var(--font-head);font-size:13px;color:rgba(255,255,255,.3);padding:40px 0;text-align:center">No published forms yet.<br><span style="font-size:11px;color:rgba(255,255,255,.2)">Publish forms in Cadence to populate this library.</span></div>`;
    return;
  }

  let html = '';

  if (forms.length) {
    html += `<div class="wf-catalog-grid">`;
    forms.forEach(f => {
      const certBadge = f.state === 'published'
        ? `<span style="font-family:var(--font-mono);font-size:9px;font-weight:700;letter-spacing:.06em;padding:1px 6px;border-radius:3px;background:rgba(61,224,138,.15);color:#3de08a;border:1px solid rgba(61,224,138,.35)">Certified ✓</span>`
        : f.state === 'certified'
        ? `<span style="font-family:var(--font-mono);font-size:9px;font-weight:700;letter-spacing:.06em;padding:1px 6px;border-radius:3px;background:rgba(61,224,138,.08);color:rgba(61,224,138,.5);border:1px solid rgba(61,224,138,.2)">Certified</span>`
        : '';
      html += `<div class="wf-card" onclick="myrLaunchRequest('form','${f.id}')">
        <div class="wf-card-top">
          <div class="wf-icon" style="background:rgba(29,158,117,.1);color:#1D9E75">
            <svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="1" width="10" height="12" rx="1" stroke="currentColor" stroke-width="1.3" fill="none"/><line x1="4.5" y1="5" x2="9.5" y2="5" stroke="currentColor" stroke-width="1"/><line x1="4.5" y1="7.5" x2="9.5" y2="7.5" stroke="currentColor" stroke-width="1"/></svg>
          </div>
          <div class="wf-card-title">${esc(f.source_name||'Form')}</div>
        </div>
        <div class="wf-card-desc">${esc(f.description||'Fill and submit for review and approval.')}</div>
        <div class="wf-card-meta" style="display:flex;align-items:center;gap:6px;flex-wrap:nowrap">
          <span style="font-family:var(--font-mono);font-size:10px;color:rgba(255,255,255,.3);white-space:nowrap">v${esc(f.version||'0.1.0')}</span>
          ${certBadge}
          <button onclick="event.stopPropagation();myrLaunchRequest('form','${f.id}')" style="margin-left:auto;display:inline-flex;align-items:center;font-family:var(--font-head);font-size:11px;font-weight:700;padding:4px 12px;border-radius:4px;border:1px solid var(--cad,#00c9c9);background:transparent;color:var(--cad,#00c9c9);cursor:pointer;white-space:nowrap;letter-spacing:.03em">Submit &#8594;</button>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  el.innerHTML = html;
}

// ── ACTIVE ────────────────────────────────────────────────────────────────────

// ── Grouped table renderer for Active + History ───────────────────────────────
function _myrRenderGroupedTable(instances, isHistory) {
  const esc = s => !s ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const FA = 'font-family:Arial,sans-serif;';
  const FM = 'font-family:var(--font-mono,monospace);';

  // Group by template_id → form name
  var groups = {};
  instances.forEach(function(inst) {
    var fd = (window._myrFormDefs||[]).find(function(f){ return f.id === inst.template_id; });
    var grpKey = inst.template_id || 'other';
    var grpName = fd ? fd.source_name : (inst.title?.split(' —')[0] || 'Other');
    if (!groups[grpKey]) groups[grpKey] = { name: grpName, items: [] };
    groups[grpKey].items.push(inst);
  });

  var statusColor = { in_progress:'#EF9F27', complete:'#3de08a', cancelled:'rgba(255,255,255,.3)', under_review:'#00D2FF' };

  var html = '';
  Object.values(groups).forEach(function(grp) {
    // Sort by created_at desc within group
    grp.items.sort(function(a,b){ return new Date(b.created_at)-new Date(a.created_at); });

    // Group header
    html += `<div style="margin-bottom:4px;margin-top:16px;padding:6px 10px;background:rgba(0,201,201,.06);border-left:3px solid #00c9c9;border-radius:0 4px 4px 0;display:flex;align-items:center;justify-content:space-between">
      <span style="${FA}font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#00c9c9">${esc(grp.name)}</span>
      <span style="${FM}font-size:10px;color:rgba(255,255,255,.3)">${grp.items.length} request${grp.items.length!==1?'s':''}</span>
    </div>`;

    // Check if this is an expense report group (has expense form_data)
    var isExpense = grp.items.some(function(i){ return i.form_data && i.form_data['_total_expenses']; });

    if (isExpense) {
      // Table layout for expense reports
      html += `<table style="width:100%;border-collapse:collapse;margin-bottom:8px">
        <thead>
          <tr style="background:rgba(255,255,255,.04)">
            <th style="${FA}font-size:10px;font-weight:500;color:rgba(255,255,255,.4);padding:6px 10px;text-align:left;border-bottom:0.5px solid rgba(255,255,255,.08)">Date Filed</th>
            <th style="${FA}font-size:10px;font-weight:500;color:rgba(255,255,255,.4);padding:6px 10px;text-align:left;border-bottom:0.5px solid rgba(255,255,255,.08)">Business Purpose</th>
            <th style="${FA}font-size:10px;font-weight:500;color:rgba(255,255,255,.4);padding:6px 10px;text-align:left;border-bottom:0.5px solid rgba(255,255,255,.08)">Description</th>
            <th style="${FA}font-size:10px;font-weight:500;color:rgba(255,255,255,.4);padding:6px 10px;text-align:left;border-bottom:0.5px solid rgba(255,255,255,.08)">Client</th>
            <th style="${FA}font-size:10px;font-weight:500;color:rgba(255,255,255,.4);padding:6px 10px;text-align:right;border-bottom:0.5px solid rgba(255,255,255,.08)">Total</th>
            <th style="${FA}font-size:10px;font-weight:500;color:rgba(255,255,255,.4);padding:6px 10px;text-align:left;border-bottom:0.5px solid rgba(255,255,255,.08)">Status</th>
          </tr>
        </thead>
        <tbody>`;
      grp.items.forEach(function(inst) {
        var fd = inst.form_data || {};
        var date = inst.created_at ? new Date(inst.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
        var purpose = fd['_purpose_label'] || fd['Business Purpose'] || '—';
        var desc = fd['Purpose Description'] || '—';
        var client = fd['Customer Name'] ? fd['Customer Name'] + (fd['Customer Location'] ? ', ' + fd['Customer Location'] : '') : '—';
        var total = fd['_total_expenses'] || '—';
        var step = inst.current_step_name || inst.status || '—';
        var sColor = statusColor[inst.status] || '#EF9F27';
        html += `<tr onclick="myrOpenInstance('${inst.id}')" style="cursor:pointer;border-bottom:0.5px solid rgba(255,255,255,.05);transition:background .1s" onmouseover="this.style.background='rgba(255,255,255,.03)'" onmouseout="this.style.background=''">
          <td style="${FA}font-size:11px;color:rgba(255,255,255,.6);padding:8px 10px;white-space:nowrap">${esc(date)}</td>
          <td style="${FA}font-size:11px;color:rgba(255,255,255,.7);padding:8px 10px">${esc(purpose)}</td>
          <td style="${FA}font-size:11px;color:rgba(255,255,255,.5);padding:8px 10px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(desc)}</td>
          <td style="${FA}font-size:11px;color:rgba(255,255,255,.5);padding:8px 10px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(client)}</td>
          <td style="${FM}font-size:11px;font-weight:700;color:#3de08a;padding:8px 10px;text-align:right;white-space:nowrap">${esc(total)}</td>
          <td style="padding:8px 10px"><span style="${FA}font-size:10px;font-weight:700;color:${sColor};letter-spacing:.05em">${esc(step)}</span></td>
        </tr>`;
      });
      html += `</tbody></table>`;
    } else {
      // Generic card layout for non-expense forms
      grp.items.forEach(function(inst) {
        var date = inst.created_at ? new Date(inst.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
        var step = inst.current_step_name || inst.status || '—';
        var sColor = statusColor[inst.status] || '#EF9F27';
        html += `<div onclick="myrOpenInstance('${inst.id}')" style="padding:10px 12px;border:0.5px solid rgba(255,255,255,.07);border-radius:4px;margin-bottom:6px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;transition:background .1s" onmouseover="this.style.background='rgba(255,255,255,.03)'" onmouseout="this.style.background=''">
          <div>
            <div style="${FA}font-size:12px;font-weight:600;color:#F0F6FF;margin-bottom:3px">${esc(inst.title)}</div>
            <div style="${FA}font-size:11px;color:rgba(255,255,255,.35)">${esc(date)}</div>
          </div>
          <span style="${FA}font-size:10px;font-weight:700;color:${sColor};letter-spacing:.05em;white-space:nowrap">${esc(step)}</span>
        </div>`;
      });
    }
  });
  return html;
}

function _myrRenderActive() {
  const el = document.getElementById('myr-active-content');
  if (!el) return;
  const active = (window._myrInstances||[]).filter(i => i.status !== 'complete' && i.status !== 'cancelled');
  if (!active.length) {
    el.innerHTML = `<div style="font-family:var(--font-head);font-size:13px;color:rgba(255,255,255,.3);padding:32px 0;text-align:center">No active requests. Browse the catalog to submit a new request.</div>`;
    return;
  }
  el.innerHTML = _myrRenderGroupedTable(active, false);
}

// ── HISTORY ───────────────────────────────────────────────────────────────────
function _myrRenderHistory() {
  const el = document.getElementById('myr-history-content');
  if (!el) return;
  const done = (window._myrInstances||[]).filter(i => i.status==='complete'||i.status==='cancelled');
  if (!done.length) {
    el.innerHTML = `<div style="font-family:var(--font-head);font-size:13px;color:rgba(255,255,255,.3);padding:32px 0;text-align:center">No completed requests yet.</div>`;
    return;
  }
  el.innerHTML = _myrRenderGroupedTable(done, true);
}

// ── LAUNCH ────────────────────────────────────────────────────────────────────
window.myrLaunchRequest = async function(type, templateId) {
  if (type === 'form') {
    // Load form definition and render HTML form if source_path is an HTML file
    try {
      const firmId = _mwFirmId();
      const formRows = await API.get(
        `workflow_form_definitions?id=eq.${templateId}&firm_id=eq.${firmId}&select=id,source_name,source_path,version,state&limit=1`
      ).catch(() => []);
      const formDef = formRows?.[0];
      if (formDef && formDef.source_path && formDef.source_path.match(/\.html?$/i)) {
        // Fetch signed URL and open in overlay
        let url;
        try {
          if (typeof _getSignedUrl === 'function') {
            url = await _getSignedUrl(formDef.source_path);
          } else {
            const SUPA = typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : '';
            const BKT  = typeof STORAGE_BUCKET !== 'undefined' ? STORAGE_BUCKET : 'form-assets';
            url = `${SUPA}/storage/v1/object/public/${BKT}/${formDef.source_path}`;
          }
        } catch(e) { url = null; }
        if (url) {
          _myrOpenHtmlFormOverlay(formDef.source_name || 'Form', url);
          return;
        }
      }
    } catch(e) { console.warn('[myrLaunchRequest] form load error:', e); }
    // Fallback: try source_html from DB
    try {
      const firmId2 = _mwFirmId();
      const rows2 = await API.get(
        `workflow_form_definitions?id=eq.${templateId}&firm_id=eq.${firmId2}&select=id,source_name,source_html,version&limit=1`
      ).catch(() => []);
      const fd2 = rows2?.[0];
      if (fd2 && fd2.source_html) {
        // Inject Cadence form CSS if not already self-contained
        // This makes ALL forms render correctly in Compass without per-form SQL patches
        const CADENCE_FORM_CSS = `<style>
*,*::before,*::after{box-sizing:border-box}
body,html{margin:0;padding:0;font-family:Arial,sans-serif;font-size:12px;background:#fff;color:#1a1a2e}
.shell{max-width:960px;margin:0 auto;border-radius:12px;border:0.5px solid #2a2f3e;background:#fff;overflow:hidden}
.hdr{background:#00c9c9;padding:14px 20px;display:flex;justify-content:space-between;align-items:center}
.htitle{font-size:15px;font-weight:500;color:#003333}
.hsub{font-size:10px;color:#005555;margin-top:2px}
.rpills{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.rp{background:rgba(0,0,0,.2);color:#003333;font-size:9px;font-weight:500;padding:2px 10px;border-radius:8px}
.ra{color:#003333;font-size:10px;font-weight:700}
.body{padding:16px 20px}
.sec{margin-bottom:18px}
.sec-lbl{font-size:9px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;border-bottom:0.5px solid #e5e7eb;padding-bottom:4px;margin-bottom:8px;margin-top:16px}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px}
.f{display:flex;flex-direction:column;gap:3px}
.f label{font-size:11px;font-weight:500;color:#1a1a2e}
.f input,.f select,.f textarea{font-family:Arial,sans-serif;font-size:12px;padding:5px 8px;border:0.5px solid #d1d5db;border-radius:5px;background:#f9fafb;color:#1a1a2e;width:100%}
.f input[readonly]{background:#f3f4f6;color:#6b7280;cursor:default;border-color:#e5e7eb}
.req{color:#E24B4A}
.sys-badge{font-size:9px;background:#e5e7eb;color:#6b7280;padding:1px 5px;border-radius:3px;margin-left:3px}
.cond-block{display:none;margin-top:8px;padding:10px 14px;border:0.5px solid #e5e7eb;border-radius:6px;background:#f9fafb}
.cond-block.visible{display:block}
.cond-label{font-size:9px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;margin-bottom:8px}
.day-wrap{overflow-x:auto;margin-bottom:4px}
.day-table{table-layout:fixed;width:100%;min-width:700px;border-collapse:collapse}
.day-table th{background:#f9fafb;padding:5px 4px;font-size:10px;font-weight:500;color:#6b7280;border:0.5px solid #e5e7eb;text-align:center;white-space:nowrap}
.day-table td{border:0.5px solid #e5e7eb;padding:1px 2px;font-size:11px;color:#1a1a2e}
.cat-h{text-align:left!important;padding-left:6px!important;min-width:110px;width:110px}
.cat{font-size:11px;color:#374151;padding:3px 6px;min-width:110px;width:110px}
.today-col{background:#f0fdf4}.today-h{background:#f0fdf4}
.sec-hdr td{background:#f9fafb;font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;padding:4px 6px;border:0.5px solid #e5e7eb}
.grand td{font-weight:700;background:#f9fafb;border:0.5px solid #e5e7eb}
.total-cell,.total-h{text-align:right;padding-right:6px;font-family:monospace;white-space:nowrap;min-width:70px;width:70px}
.day-table input[type="number"]{width:100%;border:none;background:transparent;text-align:right;padding:3px 4px;font-size:11px;font-family:monospace;color:#1a1a2e;outline:none}
.day-table input[type="number"]:focus{background:#fff8e1;border-radius:2px}
.misc-table,.ent-table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px}
.misc-table th,.ent-table th{background:#f9fafb;padding:5px 8px;font-size:10px;font-weight:500;color:#6b7280;border:0.5px solid #e5e7eb;text-align:left}
.misc-table td,.ent-table td{border:0.5px solid #e5e7eb;padding:2px 4px}
.misc-table input,.ent-table input,.misc-table select,.ent-table select{width:100%;border:none;background:transparent;font-size:11px;font-family:Arial,sans-serif;padding:3px 4px;color:#1a1a2e;outline:none}
.misc-total-row td{background:#f9fafb;font-size:11px;font-weight:600;padding:4px 8px}
.del-btn{background:none;border:none;color:#9ca3af;cursor:pointer;font-size:12px;padding:2px 6px}
.del-btn:hover{color:#e84040}
.add-row-btn{background:none;border:none;color:#00c9c9;font-size:11px;font-weight:600;cursor:pointer;padding:4px 0;font-family:Arial,sans-serif}
.totals-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px}
.tot-block{border:0.5px solid #e5e7eb;border-radius:6px;padding:10px 14px;background:#f9fafb}
.tot-title{font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;margin-bottom:6px}
.tot-row{display:flex;justify-content:space-between;font-size:11px;color:#374151;padding:2px 0}
.tot-cat{color:#6b7280}.tot-val{font-family:monospace;font-weight:600;color:#1a1a2e}
.cert-block{background:#f9fafb;border:0.5px solid #e5e7eb;border-radius:6px;padding:10px 14px;margin-bottom:12px;font-size:11px;color:#374151;line-height:1.6}
.sig-area{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:12px}
.sig-line{border-bottom:1px solid #374151;height:28px;margin-bottom:2px}
.sig-lbl{font-size:10px;color:#6b7280;margin-top:3px}
.ftr{padding:12px 20px;border-top:0.5px solid #e5e7eb;background:#f9fafb;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#6b7280}
.btn-s{border:0.5px solid #d1d5db;background:transparent;border-radius:5px;padding:6px 12px;font-family:Arial,sans-serif;font-size:12px;font-weight:500;cursor:pointer;color:#374151}
.btn-p{background:#00c9c9;color:#003333;border:none;border-radius:5px;padding:6px 16px;font-family:Arial,sans-serif;font-size:12px;font-weight:500;cursor:pointer}
.btn-s:hover{background:#f3f4f6}.btn-p:hover{background:#00b5b5}
</style>`;
        // Only inject if source_html doesn't already have its own style block
        const html = fd2.source_html.includes('<style>') 
          ? fd2.source_html 
          : CADENCE_FORM_CSS + fd2.source_html;
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const blobUrl = URL.createObjectURL(blob);
        _myrOpenHtmlFormOverlay(fd2.source_name || 'Form', blobUrl);
        return;
      }
    } catch(e) { console.warn('[myrLaunchRequest] source_html fallback error:', e); }
    compassToast('No form content available.', 3000);
    return;
  }
  const tmpl = (window._myrTemplates||[]).find(t => t.id === templateId);
  if (!tmpl) { compassToast('Template not found.', 2500); return; }

  const resId   = _myResource?.id   || null;
  const resName = _myResource?.name || 'Unknown';
  const firmId  = _mwFirmId();
  const now     = new Date().toISOString();

  const confirmed = await _myrLaunchModal(tmpl);
  if (!confirmed) return;

  try {
    const rows = await API.post('workflow_instances', {
      firm_id:                  firmId,
      template_id:              templateId,
      title:                    `${tmpl.name} — ${resName}`,
      status:                   'in_progress',
      launched_by:              _myResource?.user_id || null,
      launched_at:              now,
      submitted_by_resource_id: resId,
      submitted_by_name:        resName,
      current_step_name:        null,
      created_at:               now,
    });
    if (!rows?.[0]?.id) throw new Error('Instance creation failed');
    const instanceId = rows[0].id;

    await API.post('workflow_step_instances', {
      instance_id: instanceId, firm_id: firmId,
      step_type: 'trigger', step_name: 'Instance launched', status: 'complete',
      event_type: 'instance_launched',
      event_notes: `Submitted via Compass by ${resName}`,
      actor_resource_id: resId, actor_name: resName, created_at: now,
    });

    const steps = await API.get(`workflow_template_steps?template_id=eq.${templateId}&order=sequence_order.asc&select=*`).catch(() => []);
    const firstStep = (steps||[]).find(s => s.step_type !== 'trigger');
    if (firstStep) {
      await API.post('workflow_step_instances', {
        instance_id: instanceId, firm_id: firmId,
        event_type: 'step_activated', template_step_id: firstStep.id,
        step_type: firstStep.step_type||'action', step_name: firstStep.name||null,
        actor_name: 'System', created_at: new Date(Date.now()+1).toISOString(),
      });
      if (typeof _notifyStepActivated === 'function') {
        _notifyStepActivated(instanceId, firstStep, rows[0]).catch(() => {});
      }
    }

    compassToast(`✓ ${tmpl.name} submitted`);
    window._pollNow && window._pollNow();
    await loadUserRequests();
    myrOpenInstance(instanceId);

  } catch(e) {
    console.error('[myrLaunchRequest] failed:', e);
    compassToast('Launch failed — ' + (e.message||'check console'), 4000);
  }
};

function _myrOpenHtmlFormOverlay(title, url) {
  var existing = document.getElementById('myr-html-form-overlay');
  if (existing) existing.remove();
  var overlay = document.createElement('div');
  overlay.id = 'myr-html-form-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)';

  var modal = document.createElement('div');
  modal.id = 'myr-html-form-modal';
  modal.style.cssText = 'width:90vw;max-width:1000px;height:90vh;background:#fff;border-radius:12px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 40px 120px rgba(0,0,0,.6);transition:all .2s ease';

  // Minimal control bar — just maximize + close, no duplicate title
  var bar = document.createElement('div');
  bar.style.cssText = 'display:flex;align-items:center;justify-content:flex-end;gap:6px;padding:6px 10px;background:rgba(0,0,0,.08);flex-shrink:0;position:absolute;top:0;right:0;z-index:10';

  var maxBtn = document.createElement('button');
  maxBtn.title = 'Maximize';
  maxBtn.innerHTML = '⛶';
  maxBtn.style.cssText = 'background:none;border:none;color:#003333;font-size:16px;cursor:pointer;line-height:1;padding:2px 6px;border-radius:3px;opacity:.7';
  maxBtn.onclick = function() {
    var m = document.getElementById('myr-html-form-modal');
    if (m.dataset.maximized === '1') {
      m.style.width = '90vw'; m.style.maxWidth = '1000px'; m.style.height = '90vh';
      m.dataset.maximized = '0'; maxBtn.innerHTML = '⛶';
    } else {
      m.style.width = '100vw'; m.style.maxWidth = '100vw'; m.style.height = '100vh';
      m.style.borderRadius = '0';
      m.dataset.maximized = '1'; maxBtn.innerHTML = '⧉';
    }
  };

  var closeBtn = document.createElement('button');
  closeBtn.innerHTML = '✕';
  closeBtn.style.cssText = 'background:none;border:none;color:#003333;font-size:16px;cursor:pointer;line-height:1;padding:2px 6px;border-radius:3px;opacity:.7';
  closeBtn.onclick = function() { overlay.remove(); };

  bar.appendChild(maxBtn);
  bar.appendChild(closeBtn);

  var iframe = document.createElement('iframe');
  iframe.src = url;
  iframe.style.cssText = 'flex:1;width:100%;border:none';
  // iframe.allow removed — was triggering unrecognized feature warning
  iframe.sandbox = 'allow-scripts allow-forms allow-popups';

  modal.style.position = 'relative';
  modal.appendChild(bar);
  modal.appendChild(iframe);
  overlay.appendChild(modal);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

// ── Form iframe message handler ──────────────────────────────────────────────
window.addEventListener('message', function(ev) {
  var d = ev.data;
  if (!d || !d.type) return;
  if (d.type === 'compass_form_save_draft') {
    compassToast('Draft saved.', 2500);
  } else if (d.type === 'compass_form_submit') {
    var overlay = document.getElementById('myr-html-form-overlay');
    if (overlay) overlay.remove();
    // Create workflow_instance record in DB
    (async function() {
      try {
        var firmId  = _mwFirmId();
        var res     = window._myResource;
        var formId  = d.formId || null;
        var formDef = (window._myrFormDefs||[]).find(function(f){ return f.id === formId; });
        var title   = (formDef ? formDef.source_name : 'Form Submission') + ' — ' + (res?.name || 'Unknown');
        var payload = {
          firm_id:                    firmId,
          title:                      title,
          status:                     'in_progress',
          workflow_type:              'form',
          template_id:                formId,
          submitted_by_resource_id:   res?.id   || null,
          submitted_by_name:          res?.name || null,
          current_step_name:          'Under Review',
          event_notes:                'Submitted via Compass by ' + (res?.name || 'user'),
          form_data:                  d.formData || null,
        };
        await API.post('workflow_instances', payload);
        compassToast('Submitted for approval. You will be notified when reviewed.', 4000);
        if (typeof loadUserRequests === 'function') setTimeout(loadUserRequests, 1000);
      } catch(e) {
        console.error('[compass_form_submit] failed to create instance:', e);
        compassToast('Submission failed — please try again.', 4000);
      }
    })();
  } else if (d.type === 'compass_form_error') {
    compassToast('Please complete all required fields: ' + (d.fields||[]).join(', '), 4000);
  }
});

function _myrLaunchModal(tmpl) {
  return new Promise(resolve => {
    const esc = s => !s ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:800;display:flex;align-items:center;justify-content:center';
    overlay.innerHTML = `<div style="background:#0d1b2e;border:1px solid rgba(0,210,255,.25);width:420px;border-radius:4px;padding:24px">
      <div style="font-family:var(--font-head);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#00D2FF;margin-bottom:8px">Submit Request</div>
      <div style="font-family:var(--font-head);font-size:16px;font-weight:700;color:#F0F6FF;margin-bottom:8px">${esc(tmpl.name)}</div>
      <div style="font-family:var(--font-head);font-size:12px;color:rgba(255,255,255,.5);margin-bottom:20px;line-height:1.6">${esc(tmpl.description||'')}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button id="_myrModalCancel" style="font-family:var(--font-head);font-size:11px;padding:6px 16px;background:none;border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.4);cursor:pointer">Cancel</button>
        <button id="_myrModalConfirm" style="font-family:var(--font-head);font-size:11px;font-weight:700;padding:6px 20px;background:rgba(0,210,255,.1);border:1px solid rgba(0,210,255,.4);color:#00D2FF;cursor:pointer">Submit &#8594;</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#_myrModalConfirm').onclick = () => { overlay.remove(); resolve(true);  };
    overlay.querySelector('#_myrModalCancel').onclick  = () => { overlay.remove(); resolve(false); };
    overlay.addEventListener('click', e => { if (e.target===overlay) { overlay.remove(); resolve(false); } });
  });
}

// ── INSTANCE OVERLAY ──────────────────────────────────────────────────────────
// Loads cdn-instances.js + dependencies on first call (once), then renders
// the standard Cadence instance detail view into a full-screen overlay.

var _myrCdnLoaded = false;

async function _myrEnsureCdn() {
  if (_myrCdnLoaded) return;
  // Load Cadence rendering scripts in correct order
  const CDN_V = '20260401229002';
  const scripts = [
    `/js/cdn-core-state.js?v=${CDN_V}`,
    `/js/cdn-utils.js?v=${CDN_V}`,
    `/js/cdn-coc.js?v=${CDN_V}`,
    `/js/cdn-dag-viewer.js?v=${CDN_V}`,
    `/js/cdn-assignee.js?v=${CDN_V}`,
    `/js/cdn-outcomes.js?v=${CDN_V}`,
    `/js/cdn-scrubber.js?v=${CDN_V}`,
    `/js/cdn-comments.js?v=${CDN_V}`,
    `/js/cdn-instance-dag.js?v=${CDN_V}`,
    `/js/cdn-instances.js?v=${CDN_V}`,
  ];
  for (const src of scripts) {
    // Skip if already loaded
    if (document.querySelector(`script[src="${src}"]`)) continue;
    await new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload  = resolve;
      el.onerror = () => { console.warn('[myrEnsureCdn] failed to load', src); resolve(); };
      document.head.appendChild(el);
    });
  }
  _myrCdnLoaded = true;
  // Seed required Cadence globals if not already set
  if (typeof FIRM_ID_CAD === 'undefined') window.FIRM_ID_CAD = _mwFirmId();
  if (typeof SUPA_URL    === 'undefined') window.SUPA_URL    = typeof _mwSupaURL    === 'function' ? _mwSupaURL()    : '';
  if (typeof SUPA_KEY    === 'undefined') window.SUPA_KEY    = typeof _mwSupaKey    === 'function' ? _mwSupaKey()    : '';
  if (!window._instances)  window._instances  = [];
  if (!window._templates)  window._templates  = [];
  if (!window._myResourceId && _myResource?.id) window._myResourceId = _myResource.id;
  if (!window._myUserId     && _myResource?.user_id) window._myUserId = _myResource.user_id;
  console.log('[myrEnsureCdn] Cadence rendering scripts ready');
}

window.myrOpenInstance = async function(instanceId) {
  document.getElementById('myr-instance-overlay')?.remove();

  // Build overlay shell immediately so user sees feedback
  const overlay = document.createElement('div');
  overlay.id = 'myr-instance-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:var(--bg0,#0a1628);z-index:700;display:flex;flex-direction:column;overflow:hidden';
  overlay.innerHTML = `
    <div id="myr-inst-header" style="display:flex;align-items:center;gap:12px;padding:10px 16px;
      border-bottom:1px solid rgba(255,255,255,.08);flex-shrink:0;background:var(--bg1,#0d1b2e)">
      <button onclick="myrCloseInstance()"
        style="font-family:var(--font-head);font-size:11px;padding:4px 12px;background:none;
        border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.5);cursor:pointer;letter-spacing:.06em">
        ← Back to Requests
      </button>
      <div id="myr-inst-title" style="font-family:var(--font-head);font-size:13px;font-weight:600;color:#F0F6FF">
        Loading…
      </div>
    </div>
    <div id="myr-inst-body" style="flex:1;overflow:hidden;position:relative">
      <div style="display:flex;align-items:center;justify-content:center;height:100%;
        font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,.3)">
        Loading instance…
      </div>
    </div>`;
  document.body.appendChild(overlay);

  try {
    // Ensure Cadence rendering scripts are loaded
    await _myrEnsureCdn();

    // Fetch instance, template steps, and CoC in parallel
    const [instRows, stepInstRows] = await Promise.all([
      API.get(`workflow_instances?id=eq.${instanceId}&select=*&limit=1`).catch(() => []),
      API.get(`workflow_step_instances?instance_id=eq.${instanceId}&order=created_at.asc,id.asc`).catch(() => []),
    ]);
    const inst = instRows?.[0];
    if (!inst) throw new Error('Instance not found');

    // Fetch template steps
    const tmplSteps = inst.template_id
      ? await API.get(`workflow_template_steps?template_id=eq.${inst.template_id}&order=sequence_order.asc&select=*`).catch(() => [])
      : [];

    // Fetch template record
    const tmplRows = inst.template_id
      ? await API.get(`workflow_templates?id=eq.${inst.template_id}&select=*&limit=1`).catch(() => [])
      : [];

    // Hydrate Cadence globals minimally so renderInstanceDetail works
    inst._tmplSteps  = tmplSteps  || [];
    inst._stepInsts  = stepInstRows || [];
    inst._selectedStep = null;

    // Inject into _instances and _templates if not already present
    if (!window._instances.find(i => i.id === inst.id)) window._instances.push(inst);
    else { const idx = window._instances.findIndex(i => i.id === inst.id); window._instances[idx] = inst; }

    if (tmplRows?.[0] && !window._templates.find(t => t.id === tmplRows[0].id)) {
      tmplRows[0].steps = tmplSteps || [];
      window._templates.push(tmplRows[0]);
    }

    window._selectedInstance = inst;

    // Update header title
    const titleEl = document.getElementById('myr-inst-title');
    if (titleEl) titleEl.textContent = inst.title || 'Request';

    // Mount Cadence instance detail into overlay body
    const bodyEl = document.getElementById('myr-inst-body');
    if (bodyEl && typeof renderInstanceDetail === 'function') {
      renderInstanceDetail(bodyEl, inst);
      // Start live event detection for this instance
      if (typeof _startExternalEventDetection === 'function') {
        _startExternalEventDetection(inst.id);
      }
      if (typeof _startElapsedTimer === 'function') {
        _startElapsedTimer(inst);
      }
    } else if (bodyEl) {
      bodyEl.innerHTML = `<div style="padding:40px;font-family:var(--font-head);font-size:12px;
        color:rgba(255,255,255,.4)">Instance renderer not available — ensure cdn-instances.js is loaded.</div>`;
    }

    // myrCloseInstance() is called by the back button — defined below


  } catch(e) {
    console.error('[myrOpenInstance] failed:', e);
    const bodyEl = document.getElementById('myr-inst-body');
    if (bodyEl) bodyEl.innerHTML = `<div style="padding:40px;font-family:var(--font-head);
      font-size:12px;color:#E24B4A">Failed to load: ${e.message}</div>`;
  }
};

window.myrCloseInstance = function() {
  if (typeof _stopExternalEventDetection === 'function') _stopExternalEventDetection();
  if (typeof _stopElapsedTimer          === 'function') _stopElapsedTimer();
  document.getElementById('myr-instance-overlay')?.remove();
};

// ── Badge update ──────────────────────────────────────────────────────────────
function _myrUpdateRequestBadges() {
  const insts       = window._myrInstances || [];
  const activeCount = insts.filter(i => i.status!=='complete' && i.status!=='cancelled').length;
  const activeBadge = document.getElementById('myr-active-badge');
  if (activeBadge) {
    activeBadge.textContent = activeCount > 0 ? activeCount : '';
    activeBadge.style.display = activeCount > 0 ? 'inline' : 'none';
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