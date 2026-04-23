// ══════════════════════════════════════════════════════════
// MY WORK — SUITE TABS: MEETINGS, CALENDAR, CONCERNS
// VERSION: 20260423-CMD76
// ══════════════════════════════════════════════════════════
console.log('%c[mw-tabs] v20260423-CMD76 — B-UI-7: reactive MY REQUESTS ACTIVE → HISTORY migrations (completed/withdrawn/recalled)','background:#c47d18;color:#000;font-weight:700;padding:2px 8px;border-radius:3px');
window._mwTabsVersion = 'v20260423-CMD76';

// ── B1 (CMD54): amount extraction from form.submitted payloads ────────────
// Consumed by Class 1 threshold policies (e.g. Expense ≥ $5,000 → inject CFO).
// Inspects known field names, strips currency prefixes/commas, returns a
// Number or null. Warns once per form whose fields match none of the list
// so B6's author knows which keys to add.
var _MW_AMOUNT_FIELDS = ['amount', 'total_amount', 'expense_total', 'budget'];
var _mwAmountWarned = {};
function _mwExtractAmount(formData, formName) {
  if (!formData) return null;
  for (var i = 0; i < _MW_AMOUNT_FIELDS.length; i++) {
    var raw = formData[_MW_AMOUNT_FIELDS[i]];
    if (raw != null && raw !== '') {
      var n = Number(String(raw).replace(/[$,\s]/g, ''));
      if (!isNaN(n)) return n;
    }
  }
  if (!_mwAmountWarned[formName]) {
    _mwAmountWarned[formName] = true;
    console.warn('[mw-tabs] form.submitted: no amount field matched for',
      JSON.stringify(formName), '· available keys:', Object.keys(formData));
  }
  return null;
}

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
        // Write token to DB — fire-and-forget, don't block notification on this
        API.post('external_step_tokens', {
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
    // 3-second timeout — notification is best-effort, never block UI on it
    const _notifyAbort = new AbortController();
    const _notifyTimer = setTimeout(() => _notifyAbort.abort(), 3000);
    const res = await fetch(_notifyUrl, {
      method:  'POST',
      signal:  _notifyAbort.signal,
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
    clearTimeout(_notifyTimer);
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
// MY REQUESTS — Cadence-backed engine  v20260410-403000
// ── API delete helper (API wrapper lacks delete method) ──────────────────────
async function _myrDel(path) {
  var SUPA = typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : (window.PHUD?.SUPABASE_URL || '');
  var KEY  = typeof SUPABASE_KEY !== 'undefined' ? SUPABASE_KEY : (window.PHUD?.SUPABASE_KEY || '');
  var resp = await fetch(SUPA + '/rest/v1/' + path, {
    method: 'DELETE',
    headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' }
  });
  if (!resp.ok) throw new Error('DELETE ' + path + ' → ' + resp.status);
  return true;
}

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
    const [wfTmpls, formDefs, instances, drafts] = await Promise.all([
      API.get(`workflow_templates?compass_visible=eq.true&status=eq.released&firm_id=eq.${firmId}&order=name.asc&select=id,name,description,status,version,trigger_type`).catch(() => []),
      API.get(`workflow_form_definitions?compass_visible=eq.true&state=in.(certified,published)&firm_id=eq.${firmId}&order=source_name.asc&select=id,source_name,state,version,category_id,description`).catch(() => []),
      resId ? API.get(`workflow_instances?submitted_by_resource_id=eq.${resId}&order=created_at.desc&limit=100&select=id,title,status,current_step_name,workflow_type,template_id,created_at,updated_at,form_data,notes`).catch(() => []) : [],
      resId ? API.get(`form_drafts?user_id=eq.${resId}&firm_id=eq.${firmId}&order=updated_at.desc&select=id,form_def_id,form_data,updated_at`).catch(() => []) : [],
    ]);
    window._myrTemplates = wfTmpls  || [];
    window._myrFormDefs  = formDefs || [];
    window._myrInstances = instances || [];
    window._myrDrafts    = drafts   || [];
    // Fetch template steps for all instance template_ids and cache
    var tmplIds = [...new Set((instances||[]).map(function(i){ return i.template_id; }).filter(Boolean))];
    if (tmplIds.length) {
      var tmplStepRows = await API.get('workflow_template_steps?template_id=in.(' + tmplIds.join(',') + ')&order=sequence_order.asc&select=id,name,step_type,sequence_order,template_id,assignee_role').catch(function(){ return []; });
      window._myrTmplSteps = {};
      (tmplStepRows||[]).forEach(function(s){
        if (!window._myrTmplSteps[s.template_id]) window._myrTmplSteps[s.template_id] = [];
        window._myrTmplSteps[s.template_id].push(s);
      });
    }
    // Fetch CoC events + workflow_requests for all active instances to power Signature Loop Status
    var instIds = (instances||[]).filter(function(i){ return i.status === 'in_progress' || i.status === 'blocked'; }).map(function(i){ return i.id; });
    window._myrInstCoc = {};
    window._myrInstReqs = {};
    if (instIds.length) {
      var cocRows  = await API.get('coc_events?entity_id=in.(' + instIds.join(',') + ')&order=occurred_at.asc&select=entity_id,event_type,actor_name,occurred_at,event_notes').catch(function(){ return []; });
      var reqRows  = await API.get('workflow_requests?instance_id=in.(' + instIds.join(',') + ')&order=created_at.asc&select=instance_id,role,status,owner_name,created_at').catch(function(){ return []; });
      (cocRows||[]).forEach(function(e){
        if (!window._myrInstCoc[e.entity_id]) window._myrInstCoc[e.entity_id] = [];
        window._myrInstCoc[e.entity_id].push(e);
      });
      (reqRows||[]).forEach(function(r){
        if (!window._myrInstReqs[r.instance_id]) window._myrInstReqs[r.instance_id] = [];
        window._myrInstReqs[r.instance_id].push(r);
      });
    }
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

// ── Withdraw / delete instance ───────────────────────────────────────────────
// ── _myrConfirm — professional confirm modal (replaces browser confirm()) ────
// Usage: await _myrConfirm({ title, body, confirmLabel, danger })
// Returns: true (confirmed) or false (cancelled)
function _myrConfirm(opts) {
  return new Promise(function(resolve) {
    var existing = document.getElementById('myr-confirm-overlay');
    if (existing) existing.remove();
    var title        = opts.title        || 'Confirm';
    var body         = opts.body         || 'Are you sure?';
    var confirmLabel = opts.confirmLabel || 'Confirm';
    var danger       = opts.danger !== false; // default true
    var FA = 'font-family:Arial,sans-serif;';
    var overlay = document.createElement('div');
    overlay.id = 'myr-confirm-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99000;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px)';
    overlay.innerHTML =
      '<div style="'+FA+'background:#0d1117;border:1px solid rgba(255,255,255,.12);border-radius:10px;width:400px;max-width:calc(100vw - 32px);box-shadow:0 24px 64px rgba(0,0,0,.7);overflow:hidden">' +
        '<div style="padding:18px 22px 14px;border-bottom:1px solid rgba(255,255,255,.07);display:flex;align-items:center;gap:12px">' +
          (danger ? '<div style="width:32px;height:32px;border-radius:8px;background:rgba(232,64,64,.12);border:1px solid rgba(232,64,64,.3);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0">⚠</div>' : '') +
          '<div style="font-size:15px;font-weight:700;color:#ffffff;letter-spacing:.01em">' + title + '</div>' +
        '</div>' +
        '<div style="padding:16px 22px;font-size:13px;color:rgba(255,255,255,.6);line-height:1.6">' + body + '</div>' +
        '<div style="padding:12px 22px 18px;display:flex;justify-content:flex-end;gap:8px">' +
          '<button id="myr-confirm-cancel" style="'+FA+'font-size:12px;font-weight:600;padding:6px 16px;border-radius:6px;border:1px solid rgba(255,255,255,.15);background:transparent;color:rgba(255,255,255,.6);cursor:pointer">Cancel</button>' +
          '<button id="myr-confirm-ok" style="'+FA+'font-size:12px;font-weight:700;padding:6px 16px;border-radius:6px;border:none;background:'+(danger?'#c0392b':'#1D9E75')+';color:#fff;cursor:pointer;letter-spacing:.02em">' + confirmLabel + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    function close(result) {
      overlay.remove();
      resolve(result);
    }
    document.getElementById('myr-confirm-ok').onclick     = function() { close(true);  };
    document.getElementById('myr-confirm-cancel').onclick = function() { close(false); };
    overlay.addEventListener('click', function(e) { if (e.target === overlay) close(false); });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape')  { close(false); document.removeEventListener('keydown', onKey); }
      if (e.key === 'Enter')   { close(true);  document.removeEventListener('keydown', onKey); }
    });
  });
}

window.myrWithdrawInstance = async function(instanceId, title, evt) {
  if (evt) { evt.stopPropagation(); evt.preventDefault(); }
  var confirmed = await _myrConfirm({
    title: 'Withdraw Request',
    body: '<strong style="color:#fff">' + title + '</strong><br><br>This will cancel the submission and remove it from active routing. This cannot be undone.',
    confirmLabel: 'Withdraw',
    danger: true
  });
  if (!confirmed) return;
  try {
    var firmId = _mwFirmId();
    await API.patch(
      'workflow_instances?id=eq.' + instanceId + '&firm_id=eq.' + firmId,
      { status: 'cancelled', current_step_name: 'Withdrawn' }
    );

    // ── B-UI-7a (CMD75): emit instance.withdrawn ─────────────────────────────
    // Fires immediately after the PATCH commits, BEFORE the local
    // loadUserRequests refresh. Cross-surface consumers (MY REQUESTS reactive
    // handler per B-UI-7, Aegis scripts, future dashboards) react in parallel
    // with local refresh, not after it. Rule 34 inverse: cross-surface state
    // transitions mirror onto the event bus. No rAF — post-PATCH emit does
    // not depend on DOM commit.
    if (typeof window._cmdEmit === 'function') {
      window._cmdEmit('instance.withdrawn', {
        instance_id:              instanceId,
        withdrawn_by_resource_id: (_myResource && _myResource.id) || null,
        reason:                   null,
      });
    }

    compassToast('Request withdrawn.', 2500);
    if (typeof loadUserRequests === 'function') setTimeout(loadUserRequests, 500);
  } catch(e) {
    console.error('[myrWithdrawInstance] failed:', e);
    compassToast('Failed to withdraw — please try again.', 3000);
  }
};

// ── Grouped table renderer for Active + History ───────────────────────────────
// Returns true if the instance has any step with a null/missing assignee
function _myrHasMissingApprover(inst) {
  try {
    var notes = inst.notes ? JSON.parse(inst.notes) : null;
    var chain = notes && notes.step_chain;
    if (!chain) return false;
    return Object.values(chain).some(function(s) {
      return !s.assignee_name || s.assignee_name === '—';
    });
  } catch(_) { return false; }
}

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

  var statusColor = { in_progress:'#EF9F27', complete:'#3de08a', cancelled:'rgba(255,255,255,.3)', under_review:'#00D2FF', blocked:'#E24B4A' };

  var html = '';
  Object.values(groups).forEach(function(grp) {
    // Sort by created_at desc within group
    grp.items.sort(function(a,b){ return new Date(b.created_at)-new Date(a.created_at); });

    // Group header
    html += `<div style="margin-bottom:4px;margin-top:16px;padding:6px 10px;background:rgba(0,201,201,.06);border-left:3px solid #00c9c9;border-radius:0 4px 4px 0;display:flex;align-items:center;justify-content:space-between">
      <span style="${FA}font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#00c9c9">${esc(grp.name)}</span>
      <span style="${FM}font-size:10px;color:rgba(255,255,255,.3)">${grp.items.length} request${grp.items.length!==1?'s':''}</span>
    </div>`;

    // Check if this is an expense report group — by name (always) or form_data presence
    var isExpense = /expense\s*report/i.test(grp.name) || grp.items.some(function(i){ return i.form_data && i.form_data['_total_expenses']; });

    if (isExpense) {
      // Table layout for expense reports
      html += `<table style="width:100%;border-collapse:collapse;margin-bottom:8px">
        <thead>
          <tr style="background:rgba(255,255,255,.04)">
            <th style="${FA}font-size:12px;font-weight:500;color:rgba(255,255,255,.4);padding:6px 10px;text-align:left;border-bottom:0.5px solid rgba(255,255,255,.08)">Date Filed</th>
            <th style="${FA}font-size:12px;font-weight:500;color:rgba(255,255,255,.4);padding:6px 10px;text-align:left;border-bottom:0.5px solid rgba(255,255,255,.08)">Business Purpose</th>
            <th style="${FA}font-size:12px;font-weight:500;color:rgba(255,255,255,.4);padding:6px 10px;text-align:left;border-bottom:0.5px solid rgba(255,255,255,.08)">Description</th>
            <th style="${FA}font-size:12px;font-weight:500;color:rgba(255,255,255,.4);padding:6px 10px;text-align:left;border-bottom:0.5px solid rgba(255,255,255,.08)">Client Name</th>
            <th style="${FA}font-size:12px;font-weight:500;color:rgba(255,255,255,.4);padding:6px 10px;text-align:left;border-bottom:0.5px solid rgba(255,255,255,.08)">Client Location</th>
            <th style="${FA}font-size:12px;font-weight:500;color:rgba(255,255,255,.4);padding:6px 10px;text-align:right;border-bottom:0.5px solid rgba(255,255,255,.08)">Total Expenses</th>
            <th style="${FA}font-size:12px;font-weight:500;color:rgba(255,255,255,.4);padding:6px 10px;text-align:right;border-bottom:0.5px solid rgba(255,255,255,.08)">Net Due</th>
            <th style="${FA}font-size:12px;font-weight:500;color:rgba(255,255,255,.4);padding:6px 10px;text-align:left;border-bottom:0.5px solid rgba(255,255,255,.08)">Status</th>
            ${!isHistory ? `<th style="padding:6px 10px;border-bottom:0.5px solid rgba(255,255,255,.08);width:32px"></th>` : ''}
          </tr>
        </thead>
        <tbody>`;
      grp.items.forEach(function(inst) {
        var fd = inst.form_data || {};
        var date = inst.created_at ? new Date(inst.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
        var purpose = fd['_purpose_label'] || fd['Business Purpose'] || '—';
        var desc = fd['Purpose Description'] || '—';
        var clientName = fd['Customer Name'] || '—';
        var clientLoc = fd['Customer Location'] || '—';
        var total = fd['_total_expenses'] || '—';
        var netDue = fd['_net_due_employee'] || '—';
        var step = inst.current_step_name || inst.status || '—';
        var sColor = statusColor[inst.status] || '#EF9F27';
        var hasMissing = _myrHasMissingApprover(inst);
        if (inst.status === 'blocked') { step = '⚠ ' + step; }
        else if (hasMissing) { sColor = '#EF9F27'; } // keep amber but flag in popup
        html += `<tr onclick="myrOpenInstance('${inst.id}')" style="cursor:pointer;border-bottom:0.5px solid rgba(255,255,255,.05);transition:background .1s" onmouseover="this.style.background='rgba(255,255,255,.03)'" onmouseout="this.style.background=''">
          <td style="${FA}font-size:13px;color:rgba(255,255,255,.6);padding:8px 10px;white-space:nowrap">${esc(date)}</td>
          <td style="${FA}font-size:13px;color:rgba(255,255,255,.7);padding:8px 10px">${esc(purpose)}</td>
          <td style="${FA}font-size:13px;color:rgba(255,255,255,.5);padding:8px 10px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(desc)}</td>
          <td style="${FA}font-size:13px;color:rgba(255,255,255,.5);padding:8px 10px;white-space:nowrap">${esc(clientName)}</td>
          <td style="${FA}font-size:13px;color:rgba(255,255,255,.5);padding:8px 10px;white-space:nowrap">${esc(clientLoc)}</td>
          <td style="${FM}font-size:13px;font-weight:700;color:#3de08a;padding:8px 10px;text-align:right;white-space:nowrap">${esc(total)}</td>
          <td style="${FM}font-size:13px;font-weight:700;color:#00c9c9;padding:8px 10px;text-align:right;white-space:nowrap">${esc(netDue)}</td>
          <td style="padding:8px 10px;white-space:nowrap" id="myr-status-${inst.id}">${_myrStatusCell(inst, esc(step), sColor)}</td>
          ${!isHistory ? `<td style="padding:4px 8px;white-space:nowrap;display:flex;align-items:center;gap:6px">
            ${inst.status === 'blocked'
              ? `<button onclick="myrResumeInstance('${inst.id}','${esc(inst.title)}',event)"
                  style="${FA}font-size:10px;font-weight:700;padding:3px 8px;border:1px solid #E24B4A;
                  background:rgba(226,75,74,.1);color:#E24B4A;border-radius:3px;cursor:pointer">
                  ▶ Resume</button>`
              : `<button onclick="myrRecallToDraft_row('${inst.id}',event)" style="${FA}font-size:10px;font-weight:700;padding:3px 8px;border:1px solid #f0a030;background:transparent;color:#f0a030;border-radius:3px;cursor:pointer">Recall</button>`
            }
            <button onclick="myrWithdrawInstance('${inst.id}','${esc(inst.title)}',event)" title="Withdraw" style="background:none;border:none;color:rgba(255,255,255,.25);cursor:pointer;font-size:13px;padding:2px 4px;border-radius:3px;transition:color .15s" onmouseover="this.style.color='#e84040'" onmouseout="this.style.color='rgba(255,255,255,.25)'">&#128465;</button>
          </td>` : ''}
        </tr>`;
      });
      html += `</tbody></table>`;
    } else {
      // Generic card layout for non-expense forms
      grp.items.forEach(function(inst) {
        var date = inst.created_at ? new Date(inst.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
        var step = inst.current_step_name || inst.status || '—';
        var sColor = statusColor[inst.status] || '#EF9F27';
        if (inst.status === 'blocked') step = '⚠ ' + step;
        var cardMissing = _myrHasMissingApprover(inst) && inst.status !== 'blocked';
        html += `<div onclick="myrOpenInstance('${inst.id}')" style="padding:10px 12px;border:0.5px solid rgba(255,255,255,.07);border-radius:4px;margin-bottom:6px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;transition:background .1s" onmouseover="this.style.background='rgba(255,255,255,.03)'" onmouseout="this.style.background=''">
          <div>
            <div style="${FA}font-size:12px;font-weight:600;color:#F0F6FF;margin-bottom:3px">${esc(inst.title)}</div>
            <div style="${FA}font-size:11px;color:rgba(255,255,255,.35)">${esc(date)}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="${FA}font-size:10px;font-weight:700;color:${sColor};letter-spacing:.05em;white-space:nowrap">${esc(step)}${cardMissing?' ⚠':''}</span>
            ${!isHistory ? `<button onclick="myrWithdrawInstance('${inst.id}','${esc(inst.title)}',event)" title="Withdraw" style="background:none;border:none;color:rgba(255,255,255,.25);cursor:pointer;font-size:13px;padding:2px 4px;border-radius:3px" onmouseover="this.style.color='#e84040'" onmouseout="this.style.color='rgba(255,255,255,.25)'">🗑</button>` : ''}
          </div>
        </div>`;
      });
    }
  });
  return html;
}

function _myrRenderActive() {
  const el = document.getElementById('myr-active-content');
  if (!el) return;
  const active  = (window._myrInstances||[]).filter(i => i.status !== 'complete' && i.status !== 'cancelled');
  const drafts  = window._myrDrafts || [];
  const FA = 'font-family:Arial,sans-serif;';
  const FM = 'font-family:var(--font-mono,monospace);';
  const esc = s => !s ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  let html = '';

  // ── Drafts section ───────────────────────────────────────────────────────
  if (drafts.length) {
    html += `<div style="margin-bottom:4px;margin-top:8px;padding:6px 10px;background:rgba(240,160,48,.06);border-left:3px solid #f0a030;border-radius:0 4px 4px 0;display:flex;align-items:center;justify-content:space-between">
      <span style="${FA}font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#f0a030">Drafts</span>
      <span style="${FM}font-size:10px;color:rgba(255,255,255,.3)">${drafts.length} saved</span>
    </div>`;
    var isExpenseDraft = drafts.some(function(d){ return /expense\s*report/i.test((window._myrFormDefs||[]).find(function(f){ return f.id===d.form_def_id; })?.source_name||''); });
    if (isExpenseDraft) {
      html += `<table style="width:100%;border-collapse:collapse;margin-bottom:8px">
        <thead><tr style="background:rgba(240,160,48,.06)">
          <th style="${FA}font-size:11px;font-weight:500;color:rgba(255,255,255,.4);padding:6px 10px;text-align:left;border-bottom:0.5px solid rgba(255,255,255,.08)">Date Filed</th>
          <th style="${FA}font-size:12px;font-weight:500;color:rgba(255,255,255,.4);padding:6px 10px;text-align:left;border-bottom:0.5px solid rgba(255,255,255,.08)">Business Purpose</th>
          <th style="${FA}font-size:12px;font-weight:500;color:rgba(255,255,255,.4);padding:6px 10px;text-align:left;border-bottom:0.5px solid rgba(255,255,255,.08)">Description</th>
          <th style="${FA}font-size:12px;font-weight:500;color:rgba(255,255,255,.4);padding:6px 10px;text-align:left;border-bottom:0.5px solid rgba(255,255,255,.08)">Client Name</th>
          <th style="${FA}font-size:12px;font-weight:500;color:rgba(255,255,255,.4);padding:6px 10px;text-align:left;border-bottom:0.5px solid rgba(255,255,255,.08)">Client Location</th>
          <th style="${FA}font-size:12px;font-weight:500;color:rgba(255,255,255,.4);padding:6px 10px;text-align:right;border-bottom:0.5px solid rgba(255,255,255,.08)">Total Expenses</th>
          <th style="${FA}font-size:12px;font-weight:500;color:rgba(255,255,255,.4);padding:6px 10px;text-align:right;border-bottom:0.5px solid rgba(255,255,255,.08)">Net Due</th>
          <th style="${FA}font-size:12px;font-weight:500;color:rgba(255,255,255,.4);padding:6px 10px;text-align:left;border-bottom:0.5px solid rgba(255,255,255,.08)">Status</th>
          <th style="padding:6px 10px;border-bottom:0.5px solid rgba(255,255,255,.08);width:32px"></th>
        </tr></thead>
        <tbody>`;
      drafts.forEach(function(draft) {
        var fdef = (window._myrFormDefs||[]).find(function(f){ return f.id===draft.form_def_id; });
        var name = fdef ? fdef.source_name : 'Form';
        if (!/expense\s*report/i.test(name)) return;
        var dd = draft.form_data || {};
        var saved = draft.updated_at ? new Date(draft.updated_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
        var purpose = dd['_purpose_label'] || dd['Business Purpose'] || '—';
        var desc = dd['Purpose Description'] || '—';
        var clientName = dd['Customer Name'] || '—';
        var clientLoc = dd['Customer Location'] || '—';
        var total = dd['_total_expenses'] || '—';
        var netDue = dd['_net_due_employee'] || '—';
        html += `<tr style="border-bottom:0.5px solid rgba(255,255,255,.05);background:rgba(240,160,48,.03)">
          <td style="${FA}font-size:13px;color:rgba(255,255,255,.6);padding:8px 10px;white-space:nowrap">${esc(saved)}</td>
          <td style="${FA}font-size:13px;color:#f0a030;padding:8px 10px">${esc(purpose)}</td>
          <td style="${FA}font-size:13px;color:rgba(255,255,255,.5);padding:8px 10px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(desc)}</td>
          <td style="${FA}font-size:13px;color:rgba(255,255,255,.5);padding:8px 10px;white-space:nowrap">${esc(clientName)}</td>
          <td style="${FA}font-size:13px;color:rgba(255,255,255,.5);padding:8px 10px;white-space:nowrap">${esc(clientLoc)}</td>
          <td style="${FM}font-size:13px;font-weight:700;color:#3de08a;padding:8px 10px;text-align:right;white-space:nowrap">${esc(total)}</td>
          <td style="${FM}font-size:13px;font-weight:700;color:#00c9c9;padding:8px 10px;text-align:right;white-space:nowrap">${esc(netDue)}</td>
          <td style="padding:8px 10px"><span style="${FA}font-size:12px;font-weight:700;color:#f0a030;letter-spacing:.05em">DRAFT</span></td>
          <td style="padding:4px 8px;white-space:nowrap">
            <button onclick="myrContinueDraft('${draft.form_def_id}','${draft.id}')" style="${FA}font-size:12px;font-weight:700;padding:3px 8px;border-radius:3px;border:1px solid #f0a030;background:transparent;color:#f0a030;cursor:pointer">Continue →</button>
            <button onclick="myrDiscardDraft('${draft.id}','${esc(name)}',event)" title="Discard" style="background:none;border:none;color:rgba(255,255,255,.25);cursor:pointer;font-size:13px;padding:2px 4px;border-radius:3px;margin-left:2px" onmouseover="this.style.color='#e84040'" onmouseout="this.style.color='rgba(255,255,255,.25)'">&#128465;</button>
          </td>
        </tr>`;
      });
      html += `</tbody></table>`;
    } else {
      drafts.forEach(function(draft) {
        var fdef = (window._myrFormDefs||[]).find(function(f){ return f.id===draft.form_def_id; });
        var name = fdef ? fdef.source_name : 'Form';
        var saved = draft.updated_at ? new Date(draft.updated_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
        html += `<div style="padding:10px 12px;border:0.5px solid rgba(240,160,48,.25);border-radius:4px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;background:rgba(240,160,48,.04)">
          <div>
            <div style="${FA}font-size:12px;font-weight:600;color:#f0a030;margin-bottom:2px">${esc(name)}</div>
            <div style="${FA}font-size:10px;color:rgba(255,255,255,.35)">Draft saved ${esc(saved)}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <button onclick="myrContinueDraft('${draft.form_def_id}','${draft.id}')" style="${FA}font-size:11px;font-weight:700;padding:4px 12px;border-radius:4px;border:1px solid #f0a030;background:transparent;color:#f0a030;cursor:pointer;font-weight:700">Continue &#8594;</button>
            <button onclick="myrDiscardDraft('${draft.id}','${esc(name)}',event)" title="Discard draft" style="background:none;border:none;color:rgba(255,255,255,.25);cursor:pointer;font-size:13px;padding:2px 4px;border-radius:3px" onmouseover="this.style.color='#e84040'" onmouseout="this.style.color='rgba(255,255,255,.25)'">&#128465;</button>
          </div>
        </div>`;
      });
    }
  }
  // ── Submitted section ────────────────────────────────────────────────────
  if (active.length) {
    html += _myrRenderGroupedTable(active, false);
  } else if (!drafts.length) {
    html += `<div style="${FA}font-size:13px;color:rgba(255,255,255,.3);padding:32px 0;text-align:center">No active requests. Browse the catalog to submit a new request.</div>`;
  }

  el.innerHTML = html;
}

window.myrContinueDraft = async function(formDefId, draftId) {
  try {
    var firmId = _mwFirmId();
    var rows = await API.get(`workflow_form_definitions?id=eq.${formDefId}&firm_id=eq.${firmId}&select=id,source_name,source_html,version&limit=1`).catch(()=>[]);
    var fd = rows?.[0];
    if (!fd?.source_html) { compassToast('Form not found.', 2500); return; }
    // Find the draft data
    var draft = (window._myrDrafts||[]).find(d => d.id === draftId);
    var savedData = draft?.form_data || {};
    // MT1: Full restore including grid, misc, and ent rows (editable mode)
    var restoreScript = `<script>
window.addEventListener('DOMContentLoaded', function() {
  var saved = ${JSON.stringify(savedData)};
  Object.keys(saved).forEach(function(label) {
    if (label.indexOf('_grid_') === 0 || label.indexOf('_misc_') === 0 ||
        label.indexOf('_ent_')  === 0 || label.charAt(0) === '_') return;
    var el = document.querySelector('[data-label="' + label + '"]');
    if (el && saved[label]) el.value = saved[label];
  });
  if (typeof buildTable === 'function' && (saved['Trip Start Date'] || saved['Trip End Date'])) {
    var s = document.getElementById('trip-start');
    var e = document.getElementById('trip-end');
    if (s && saved['Trip Start Date']) s.value = saved['Trip Start Date'];
    if (e && saved['Trip End Date'])   e.value = saved['Trip End Date'];
    if (typeof onDateChange === 'function') onDateChange();
  }
  setTimeout(function() {
    Object.keys(saved).forEach(function(label) {
      if (label.indexOf('_grid_') !== 0) return;
      var parts = label.split('_');
      var cat = parts[2]; var dk = parts.slice(3).join('-');
      var el = document.querySelector('[data-cat="' + cat + '"][data-dk="' + dk + '"]');
      if (el) { el.value = saved[label]; el.dispatchEvent(new Event('input')); }
    });
    var miscIdxs = {};
    Object.keys(saved).forEach(function(k) { if (k.indexOf('_misc_') === 0) { miscIdxs[k.split('_')[2]] = true; } });
    Object.keys(miscIdxs).sort().forEach(function(idx) {
      if (typeof addMiscRow === 'function') addMiscRow();
      var rows = document.querySelectorAll('#misc-tbody tr'); var row = rows[parseInt(idx)]; if (!row) return;
      var desc = row.querySelector('input[placeholder="Item description"]');
      var date = row.querySelector('input[type="date"]'); var type = row.querySelector('select'); var amt = row.querySelector('input[type="number"]');
      if (desc && saved['_misc_'+idx+'_desc']) desc.value = saved['_misc_'+idx+'_desc'];
      if (date && saved['_misc_'+idx+'_date']) date.value = saved['_misc_'+idx+'_date'];
      if (type && saved['_misc_'+idx+'_type']) type.value = saved['_misc_'+idx+'_type'];
      if (amt  && saved['_misc_'+idx+'_amt'])  { amt.value = saved['_misc_'+idx+'_amt']; amt.dispatchEvent(new Event('input')); }
    });
    var entIdxs = {};
    Object.keys(saved).forEach(function(k) { if (k.indexOf('_ent_') === 0) { entIdxs[k.split('_')[2]] = true; } });
    Object.keys(entIdxs).sort().forEach(function(idx) {
      if (typeof addEntRow === 'function') addEntRow();
      var rows = document.querySelectorAll('#ent-tbody tr'); var row = rows[parseInt(idx)]; if (!row) return;
      var date = row.querySelector('input[type="date"]'); var type = row.querySelector('.ent-type');
      var guests = row.querySelector('.ent-guests'); var purpose = row.querySelector('.ent-purpose'); var amt = row.querySelector('.ent-amt');
      if (date    && saved['_ent_'+idx+'_date'])    date.value    = saved['_ent_'+idx+'_date'];
      if (type    && saved['_ent_'+idx+'_type'])    type.value    = saved['_ent_'+idx+'_type'];
      if (guests  && saved['_ent_'+idx+'_guests'])  guests.value  = saved['_ent_'+idx+'_guests'];
      if (purpose && saved['_ent_'+idx+'_purpose']) purpose.value = saved['_ent_'+idx+'_purpose'];
      if (amt     && saved['_ent_'+idx+'_amt'])     { amt.value = saved['_ent_'+idx+'_amt']; amt.dispatchEvent(new Event('input')); }
    });
  }, 400);
});
<\/script>`;
    var html = fd.source_html.replace('</body>', restoreScript + '</body>');
    if (!html.includes('</body>')) html = fd.source_html + restoreScript;
    var blob = new Blob([html], {type:'text/html;charset=utf-8'});
    _myrOpenHtmlFormOverlay(fd.source_name, URL.createObjectURL(blob), fd.id);
  } catch(e) {
    console.error('[myrContinueDraft] failed:', e);
    compassToast('Could not open draft — please try again.', 3000);
  }
};

window.myrDiscardDraft = async function(draftId, name, evt) {
  if (evt) { evt.stopPropagation(); evt.preventDefault(); }
  var confirmed = await _myrConfirm({
    title: 'Discard Draft',
    body: 'Discard the draft for <strong style="color:#fff">' + name + '</strong>?<br><br>All entered data will be permanently deleted.',
    confirmLabel: 'Discard',
    danger: true
  });
  if (!confirmed) return;
  try {
    var firmId = _mwFirmId();
    await _myrDel('form_drafts?id=eq.' + draftId + '&firm_id=eq.' + firmId);
    compassToast('Draft discarded.', 2000);
    if (typeof loadUserRequests === 'function') setTimeout(loadUserRequests, 500);
  } catch(e) {
    console.error('[myrDiscardDraft] failed:', e);
    compassToast('Failed to discard draft.', 3000);
  }
};

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
          _myrOpenHtmlFormOverlay(formDef.source_name || 'Form', url, formDef.id);
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
        _myrOpenHtmlFormOverlay(fd2.source_name || 'Form', blobUrl, fd2.id);
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

// B2 (CMD63): parent-side tracking of the currently-open form overlay.
// Source of truth for the form.opened emit's form_name: parent knows what
// it opened regardless of whether the iframe bootstrap echoes back a name.
// Populated by _myrOpenHtmlFormOverlay; cleared on overlay close.
window._myrCurrentForm = null; // { form_name, form_def_id, opened_at }

function _myrOpenHtmlFormOverlay(title, url, formDefId) {
  // B2: stash canonical form name + def id so the compass_form_ready
  // postMessage handler (below) can build a protocol-compliant payload
  // without trusting the iframe to re-send identifiers it already received.
  window._myrCurrentForm = {
    form_name:   title || 'Form',
    form_def_id: formDefId || null,
    opened_at:   Date.now(),
  };
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
  closeBtn.onclick = function() {
    overlay.remove();
    window._myrCurrentForm = null;
    try { window.postMessage({ type: 'cmd:form_action', action: 'Form Close' }, '*'); } catch(e) {}
  };

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
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) {
      overlay.remove();
      window._myrCurrentForm = null;
      try { window.postMessage({ type: 'cmd:form_action', action: 'Form Close' }, '*'); } catch(e) {}
    }
  });
  document.body.appendChild(overlay);
}

// ── Form iframe message handler ──────────────────────────────────────────────
window.addEventListener('message', function(ev) {
  var d = ev.data;
  if (!d || !d.type) return;
  // MT1 security: only process Cadence form messages.
  // Blob URL iframes have origin 'null' — that's the only expected source.
  // Reject anything else that isn't the same origin (e.g. injected cross-origin frames).
  var knownTypes = ['compass_form_save_draft', 'compass_form_submit', 'compass_form_error', 'compass_form_ready'];
  if (knownTypes.indexOf(d.type) === -1) return; // not a Cadence form message — ignore
  if (ev.origin !== 'null' && ev.origin !== window.location.origin) {
    console.warn('[mw-tabs] postMessage from unexpected origin rejected:', ev.origin);
    return;
  }
  // B2 (CMD63): form.opened emit. Iframe bootstrap signals "fields are
  // queryable" with { type: 'compass_form_ready', form_name?, form_def_id? }.
  // Parent is the source of truth for form_name/form_def_id (captured at
  // Form Open time in _myrCurrentForm); iframe-supplied values are accepted
  // as fallback only. If _myrCurrentForm is null (overlay already closed,
  // or ready fires before the setter — shouldn't happen), the emit is
  // still sent using iframe-supplied values if any, else skipped with a
  // warn. The iframe sender is a pending Cadence-side migration
  // (workflow_form_definitions.source_html bootstrap); until that ships,
  // this handler simply never fires and Wait ForForm times out
  // diagnostically at its configured timeout. See handoff B2 follow-up.
  if (d.type === 'compass_form_ready') {
    var cur = window._myrCurrentForm || {};
    var formName  = cur.form_name   || d.form_name   || null;
    var formDefId = cur.form_def_id || d.form_def_id || null;
    if (!formName) {
      console.warn('[mw-tabs] compass_form_ready received with no form_name (parent state and iframe payload both empty) — form.opened not emitted');
      return;
    }
    var res = window._myResource || {};
    if (typeof window._cmdEmit === 'function') {
      window._cmdEmit('form.opened', {
        form_name:          formName,
        form_def_id:        formDefId,
        opener_resource_id: res.id      || null,
        opener_user_id:     res.user_id || null,
      });
    }
    return;
  }
  if (d.type === 'compass_form_save_draft') {
    (async function() {
      try {
        var firmId = _mwFirmId();
        var res    = window._myResource;
        if (!res?.id) { compassToast('Draft saved locally — sign in to persist.', 2500); return; }
        // Upsert: delete existing draft for this form+user, then insert fresh
        await _myrDel('form_drafts?firm_id=eq.' + firmId + '&user_id=eq.' + res.id + '&form_def_id=eq.' + d.formId).catch(()=>{});
        await API.post('form_drafts', {
          firm_id:          firmId,
          user_id:          res.id,
          form_def_id:      d.formId,
          form_data:        d.formData || {},
          updated_at:       new Date().toISOString(),
        });
        compassToast('Draft saved. Resume anytime from Active tab.', 3000);
        if (typeof loadUserRequests === 'function') {
          setTimeout(function() {
            loadUserRequests().then(function() {
              // Force re-render the Active pane so totals update immediately
              // even if the user is still on the overlay or Active tab
              if (typeof _myrRenderActive === 'function') _myrRenderActive();
            }).catch(function(){});
          }, 300);
        }
      } catch(e) {
        console.error('[save_draft] failed:', e);
        compassToast('Draft save failed — please try again.', 3000);
      }
    })();
  } else if (d.type === 'compass_form_submit') {
    // ── MT1: Bulletproof form submit ──────────────────────────────────────
    // Prior code used a UUID regex heuristic to map form_def_id → template_id.
    // That heuristic is fragile and wrong. The correct approach:
    //   1. Look up the companion workflow_templates row by name + form_driven=true
    //      from the DB at submit time — authoritative, never guesses.
    //   2. Write both template_id (companion) AND form_def_id on the instance
    //      so the round-trip is explicit and permanent.
    //   3. Activate routing steps correctly via workflow_step_instances,
    //      mirroring exactly what cdn-instances.js does in Cadence.
    //   4. Close the overlay AFTER the instance is created, not before,
    //      so a failed submit doesn't silently discard the user's work.
    // ─────────────────────────────────────────────────────────────────────
    (async function() {
      var overlay = document.getElementById('myr-html-form-overlay');
      try {
        var firmId = _mwFirmId();
        var res    = window._myResource;
        var formId = d.formId || null;
        if (!formId) throw new Error('No formId in submit message');

        // 1. Get the form definition — name + version for the instance title
        var formDef = (window._myrFormDefs || []).find(function(f) { return f.id === formId; });
        var formName = formDef ? (formDef.source_name || 'Form') : 'Form';

        // 2. Look up the companion workflow_templates row by name + form_driven.
        //    Filter to published/certified only — never submit against a draft template.
        var tmplRows = await API.get(
          'workflow_templates?firm_id=eq.' + firmId +
          '&name=eq.' + encodeURIComponent(formName) +
          '&form_driven=eq.true' +
          '&status=in.(published,certified)' +
          '&order=created_at.desc&limit=1&select=id,name,version,status'
        ).catch(function() { return []; });
        var tmpl = tmplRows && tmplRows[0];
        if (!tmpl) throw new Error(
          'No published/certified companion template found for "' + formName + '". ' +
          'The form must be published in Cadence before it can be submitted.'
        );

        // 3. Load template steps — use in-memory cache first (mw-core loads these),
        //    fall back to DB query only if not cached.
        var cachedSteps = (window._myrTmplSteps || {})[tmpl.id];
        var steps = cachedSteps && cachedSteps.length ? cachedSteps : await API.get(
          'workflow_template_steps?template_id=eq.' + tmpl.id +
          '&order=sequence_order.asc&select=id,name,step_type,sequence_order,assignee_type,assignee_role,template_id'
        ).catch(function() { return []; });
        var firstStep = (steps || []).find(function(s) { return s.step_type !== 'trigger'; });

        // 4. Create the workflow_instance — template_id = companion UUID (not form_def_id)
        var now   = new Date().toISOString();
        var title = formName + ' — ' + (res ? res.name || 'Unknown' : 'Unknown');
        var instRows = await API.post('workflow_instances', {
          firm_id:                  firmId,
          template_id:              tmpl.id,
          form_def_id:              formId,
          title:                    title,
          status:                   'in_progress',
          workflow_type:            'form',
          launched_by:              res ? (res.user_id || res.id || null) : null,
          launched_at:              now,
          submitted_by_resource_id: res ? res.id   : null,
          submitted_by_name:        res ? res.name : null,
          current_step_name:        firstStep ? firstStep.name : null,
          form_data:                d.formData || null,
          created_at:               now,
        });
        var inst = instRows && instRows[0];
        if (!inst || !inst.id) throw new Error('Instance creation returned no row');
        var instanceId = inst.id;

        // ── Emit #5: instance.launched (B1 / CMD54) ──────────────────────
        // Fires in the same logical transaction as the workflow_instances
        // insert. Feeds M2 live feed, Class 2 velocity counters, Class 5
        // precondition checks.
        if (typeof window._cmdEmit === 'function') {
          window._cmdEmit('instance.launched', {
            instance_id:             instanceId,
            template_id:             tmpl.id,
            template_name:           tmpl.name || formName,
            submitter_resource_id:   res ? res.id : null,
          });
        }

        // 5. Write trigger event (instance_launched)
        await API.post('workflow_step_instances', {
          instance_id:       instanceId,
          firm_id:           firmId,
          step_type:         'trigger',
          step_name:         'Instance launched',
          status:            'complete',
          event_type:        'instance_launched',
          event_notes:       'Submitted via Compass by ' + (res ? res.name || 'Unknown' : 'Unknown'),
          actor_resource_id: res ? res.id : null,
          actor_name:        res ? res.name : null,
          created_at:        now,
        });

        // 6. Activate first real step (Employee Submission / step 1)
        if (firstStep) {
          await API.post('workflow_step_instances', {
            instance_id:      instanceId,
            firm_id:          firmId,
            event_type:       'step_activated',
            template_step_id: firstStep.id,
            step_type:        firstStep.step_type || 'form',
            step_name:        firstStep.name || null,
            actor_name:       'System',
            created_at:       new Date(Date.now() + 1).toISOString(),
          }).catch(function(e) { console.warn('[compass_form_submit] step_activated write failed:', e); });
        }

        // 7. Delete draft now that submit succeeded
        if (res && res.id && formId) {
          await _myrDel(
            'form_drafts?firm_id=eq.' + firmId +
            '&user_id=eq.' + res.id +
            '&form_def_id=eq.' + formId
          ).catch(function(e) { console.warn('[compass_form_submit] draft cleanup failed:', e); });
        }

        // 8. Close overlay — only on success so user keeps their form on failure
        if (overlay) overlay.remove();
        window._myrCurrentForm = null;

        console.log('%c[compass_form_submit] instance created: ' + instanceId + ' · template: ' + tmpl.id,
          'background:#1a4a2a;color:#3de08a;padding:2px 8px;border-radius:3px');

        // Expose for CMD Center scripts — avoids DOM scraping or Supabase queries
        window._lastSubmittedInstanceId = instanceId;

        // ── Emit #2: form.submitted (B1 / CMD54) ─────────────────────────
        // Canonical "a form was just submitted" event. Consumed by future
        // policies (Class 1 threshold on amount), Wait ForInstance, and
        // CommandHUD agent-pipeline triggers. Payload field names are locked.
        if (typeof window._cmdEmit === 'function') {
          window._cmdEmit('form.submitted', {
            instance_id:            instanceId,
            form_name:              formName,
            submitter_resource_id:  res ? res.id      : null,
            submitter_user_id:      res ? res.user_id : null,
            amount:                 _mwExtractAmount(d.formData, formName),
          });
        }

        // Write request.submitted CoC event — powers the Document Review Request panel.
        // The docs[] array makes the form appear as a clickable link in the review panel.
        // path: 'form:{formDefId}' is handled by myrOpenAttachment to render source_html.
        await API.post('coc_events', {
          firm_id:           firmId,
          entity_id:         instanceId,
          entity_type:       'workflow_instance',
          event_type:        'request.submitted',
          event_class:       'lifecycle',
          severity:          'info',
          event_notes:       JSON.stringify({
            doc_name:     formName,
            instructions: 'Please review and sign the ' + formName + ' submitted by ' + (res ? res.name : 'Unknown') + '.',
            docs: [{
              name:   formName + ' v' + (formDef ? formDef.version || '—' : '—'),
              source: 'form',
              path:   'form:' + formId + ':' + instanceId,
              mime:   'text/html',
            }],
            submitter_resource_id: res ? res.id : null,
          }),
          actor_name:        res ? res.name : 'System',
          actor_resource_id: res ? res.id   : null,
          occurred_at:       now,
          created_at:        now,
        }).catch(function(e) { console.warn('[compass_form_submit] CoC write failed:', e); });

        // Pre-resolve all step assignees and store in notes for Signature Loop Status
        // This lets the popup show WHO is responsible for each step before they act
        try {
          var submitterResId = res ? res.id : null;
          if (submitterResId) {
            var submitterResRows = await API.get(
              'resources?id=eq.' + submitterResId +
              '&select=id,name,manager_id,finance_contact_id,legal_contact_id,hr_contact_id'
            ).catch(function(){ return []; });
            var submitterResRow = submitterResRows && submitterResRows[0];
            if (submitterResRow) {
              var roleToResId = {
                submitter: submitterResId,
                manager:   submitterResRow.manager_id,
                finance:   submitterResRow.finance_contact_id,
                legal:     submitterResRow.legal_contact_id,
                hr:        submitterResRow.hr_contact_id,
              };
              // Gather all assignee resource IDs
              var assigneeIds = Object.values(roleToResId).filter(Boolean);
              var assigneeMap = {};
              if (assigneeIds.length) {
                var assigneeRows = await API.get(
                  'resources?id=in.(' + [...new Set(assigneeIds)].join(',') + ')&select=id,name'
                ).catch(function(){ return []; });
                (assigneeRows||[]).forEach(function(r){ assigneeMap[r.id] = r.name; });
              }
              // Build step chain: sequence_order → { role, assignee_name }
              var stepChain = {};
              (steps||[]).filter(function(s){ return s.step_type !== 'trigger'; }).forEach(function(s) {
                var resId = roleToResId[s.assignee_role] || null;
                stepChain[s.sequence_order] = {
                  role:          s.assignee_role,
                  assignee_name: resId ? (assigneeMap[resId] || '—') : null,
                  assignee_id:   resId || null,
                };
              });
              // Patch notes on the instance
              await API.patch('workflow_instances?id=eq.' + instanceId, {
                notes:      JSON.stringify({ step_chain: stepChain }),
                updated_at: now,
              }).catch(function(e){ console.warn('[compass_form_submit] notes patch failed:', e); });
            }
          }
        } catch(e) {
          console.warn('[compass_form_submit] step chain pre-resolve failed:', e);
        }

        // Resolve role → resource and create workflow_request for step 1.
        // If step 1 is a submitter step, the act of submitting the form completes it —
        // no additional review action is needed from the submitter. Auto-advance to step 2.
        if (firstStep && res && res.id) {
          var isSubmitterStep = firstStep.assignee_role === 'submitter' ||
                                firstStep.assignee_type === 'submitter';
          if (isSubmitterStep) {
            // Write a CoC event marking step 1 complete via submission
            await API.post('coc_events', {
              id:                crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '-s1'),
              firm_id:           firmId,
              entity_id:         instanceId,
              entity_type:       'workflow_instance',
              event_type:        'request.approved',
              event_class:       'lifecycle',
              severity:          'info',
              event_notes:       JSON.stringify({ decision: 'approved', comments: 'Submitted by ' + res.name }),
              actor_name:        res.name,
              actor_resource_id: res.id,
              occurred_at:       now,
              created_at:        now,
            }).catch(function(e) { console.warn('[compass_form_submit] step 1 CoC write failed:', e); });

            // Find step 2 and route directly to it
            var step2 = (steps || []).find(function(s) {
              return s.step_type !== 'trigger' && s.sequence_order > firstStep.sequence_order;
            });
            if (step2) {
              await window._mwResolveAndRoute(
                instanceId, steps, step2.sequence_order, res.id, formName
              ).catch(function(e) { console.warn('[compass_form_submit] step 2 routing failed:', e); });
            }
          } else {
            // Non-submitter first step — create workflow_request normally
            await window._mwResolveAndRoute(
              instanceId, steps, firstStep.sequence_order, res.id, formName
            ).catch(function(e) { console.warn('[compass_form_submit] routing failed:', e); });
          }
        }

        compassToast('Submitted for approval — routing to ' + (firstStep ? firstStep.name : 'reviewers') + '.', 4000);
        if (typeof loadUserRequests === 'function') setTimeout(loadUserRequests, 800);

      } catch(e) {
        console.error('[compass_form_submit] failed:', e);
        // Do NOT close the overlay on failure — user's filled form stays visible
        compassToast('Submission failed: ' + (e.message || 'check console') + '. Your form data is preserved.', 6000);
      }
    })();
  } else if (d.type === 'compass_form_error') {
    compassToast('Please complete all required fields: ' + (d.fields||[]).join(', '), 4000);
  }
});

// ── myrOpenAttachment ─────────────────────────────────────────────────────────
// Opens an attachment from the Document Review Request panel.
// Handles two cases:
//   source='form'  → fetches source_html from DB and renders in overlay (read-only)
//   otherwise      → treats path as a storage path and opens via signed URL
// ─────────────────────────────────────────────────────────────────────────────
window.myrOpenAttachment = async function(path) {
  if (!path) return;
  var firmId = _mwFirmId();

  // Form attachment — path format: 'form:{formDefId}:{instanceId}'
  if (path.indexOf('form:') === 0) {
    var parts      = path.slice(5).split(':');
    var formDefId  = parts[0];
    var instanceId = parts[1] || null;

    // Fetch form definition and instance data in parallel
    var fetches = [
      API.get(
        'workflow_form_definitions?id=eq.' + formDefId +
        '&firm_id=eq.' + firmId +
        '&select=id,source_name,source_html&limit=1'
      ).catch(function() { return []; })
    ];
    if (instanceId) {
      fetches.push(
        API.get(
          'workflow_instances?id=eq.' + instanceId +
          '&select=id,form_data&limit=1'
        ).catch(function() { return []; })
      );
    }
    var results   = await Promise.all(fetches);
    var fd        = results[0] && results[0][0];
    var instRow   = results[1] && results[1][0];
    var savedData = (instRow && instRow.form_data) || {};

    if (!fd || !fd.source_html) {
      compassToast('Form not available.', 2500);
      return;
    }

    // Build restore + lock script to inject into the form HTML
    var restoreScript = `<script>
window.addEventListener('DOMContentLoaded', function() {
  var saved = ${JSON.stringify(savedData)};
  Object.keys(saved).forEach(function(label) {
    if (label.indexOf('_grid_') === 0 || label.indexOf('_misc_') === 0 ||
        label.indexOf('_ent_')  === 0 || label.charAt(0) === '_') return;
    var el = document.querySelector('[data-label="' + label + '"]');
    if (el && saved[label]) el.value = saved[label];
  });
  if (typeof buildTable === 'function' && (saved['Trip Start Date'] || saved['Trip End Date'])) {
    var s = document.getElementById('trip-start');
    var e = document.getElementById('trip-end');
    if (s && saved['Trip Start Date']) s.value = saved['Trip Start Date'];
    if (e && saved['Trip End Date'])   e.value = saved['Trip End Date'];
    if (typeof onDateChange === 'function') onDateChange();
  }
  setTimeout(function() {
    Object.keys(saved).forEach(function(label) {
      if (label.indexOf('_grid_') !== 0) return;
      var parts = label.split('_');
      var cat = parts[2]; var dk = parts.slice(3).join('-');
      var el = document.querySelector('[data-cat="' + cat + '"][data-dk="' + dk + '"]');
      if (el) { el.value = saved[label]; el.dispatchEvent(new Event('input')); }
    });
    var miscIdxs = {};
    Object.keys(saved).forEach(function(k) { if (k.indexOf('_misc_') === 0) { miscIdxs[k.split('_')[2]] = true; } });
    Object.keys(miscIdxs).sort().forEach(function(idx) {
      var rows = document.querySelectorAll('#misc-tbody tr'); var row = rows[parseInt(idx)]; if (!row) return;
      var desc = row.querySelector('input[placeholder="Item description"]');
      var date = row.querySelector('input[type="date"]'); var type = row.querySelector('select'); var amt = row.querySelector('input[type="number"]');
      if (desc && saved['_misc_'+idx+'_desc']) desc.value = saved['_misc_'+idx+'_desc'];
      if (date && saved['_misc_'+idx+'_date']) date.value = saved['_misc_'+idx+'_date'];
      if (type && saved['_misc_'+idx+'_type']) type.value = saved['_misc_'+idx+'_type'];
      if (amt  && saved['_misc_'+idx+'_amt'])  { amt.value = saved['_misc_'+idx+'_amt']; amt.dispatchEvent(new Event('input')); }
    });
    var entIdxs = {};
    Object.keys(saved).forEach(function(k) { if (k.indexOf('_ent_') === 0) { entIdxs[k.split('_')[2]] = true; } });
    Object.keys(entIdxs).sort().forEach(function(idx) {
      var rows = document.querySelectorAll('#ent-body tr'); var row = rows[parseInt(idx)]; if (!row) return;
      var date = row.querySelector('input[type="date"]'); var type = row.querySelector('.ent-type');
      var guests = row.querySelector('.ent-guests'); var purpose = row.querySelector('.ent-purpose'); var amt = row.querySelector('.ent-amt');
      if (date    && saved['_ent_'+idx+'_date'])    date.value    = saved['_ent_'+idx+'_date'];
      if (type    && saved['_ent_'+idx+'_type'])    type.value    = saved['_ent_'+idx+'_type'];
      if (guests  && saved['_ent_'+idx+'_guests'])  guests.value  = saved['_ent_'+idx+'_guests'];
      if (purpose && saved['_ent_'+idx+'_purpose']) purpose.value = saved['_ent_'+idx+'_purpose'];
      if (amt     && saved['_ent_'+idx+'_amt'])     { amt.value = saved['_ent_'+idx+'_amt']; amt.dispatchEvent(new Event('input')); }
    });
    // Lock all fields — review mode
    document.querySelectorAll('input,textarea,select').forEach(function(el) {
      el.disabled = true; el.style.cursor = 'not-allowed';
    });
    document.querySelectorAll('.btn-s,.btn-p,.ftr').forEach(function(el) {
      el.style.display = 'none';
    });
  }, 400);
});
<\/script>`;

    var html = fd.source_html.replace('</body>', restoreScript + '</body>');
    if (!html.includes('</body>')) html = fd.source_html + restoreScript;
    var blob    = new Blob([html], { type: 'text/html;charset=utf-8' });
    var blobUrl = URL.createObjectURL(blob);
    _myrOpenHtmlFormOverlay(fd.source_name || 'Form', blobUrl, fd.id);
    // role comes from the path: 'form:{formDefId}:{instanceId}:{role}'
    var sigRole    = parts[2] || null;
    var signerName = (window._myResource && window._myResource.name) || '';
    setTimeout(function() {
      var iframe = document.querySelector('#myr-html-form-modal iframe');
      if (!iframe) return;
      iframe.addEventListener('load', function onLoad() {
        iframe.removeEventListener('load', onLoad);
        setTimeout(function() {
          if (iframe.contentWindow) {
            iframe.contentWindow.postMessage({
              type:       'cad:activate_signature',
              role:       sigRole,
              signerName: sigRole ? signerName : '',
              readOnly:   !sigRole,
            }, '*');
          }
        }, 500); // wait for DOMContentLoaded + CadenceSignature.activate to run first
      });
    }, 100);
    return;
  }

  // File attachment — open via signed URL
  try {
    var url;
    if (typeof _getSignedUrl === 'function') {
      url = await _getSignedUrl(path);
    } else {
      var SUPA = typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : _mwSupaURL();
      var BKT  = typeof STORAGE_BUCKET !== 'undefined' ? STORAGE_BUCKET : 'workflow-documents';
      url = SUPA + '/storage/v1/object/public/' + BKT + '/' + path;
    }
    window.open(url, '_blank');
  } catch(e) {
    compassToast('Could not open attachment.', 2500);
    console.error('[myrOpenAttachment] failed:', e);
  }
};

// ── _mwResolveAndRoute — Resolution Engine ───────────────────────────────────
// Maps workflow template step roles to actual resource IDs and creates
// workflow_requests rows so the right people see the request in their queue.
//
// Role resolution map:
//   submitter → the resource who submitted (passed in as submitterResId)
//   manager   → submitter's resources.manager_id
//   finance   → submitter's resources.finance_contact_id
//   (extensible: add more roles here as needed)
//
// Called immediately after step_activated is written on submit.
// Also called when a step completes and the next step is activated.
// ─────────────────────────────────────────────────────────────────────────────
window._mwResolveAndRoute = async function(instanceId, templateSteps, currentStepSeq, submitterResId, formName) {
  try {
    var firmId = _mwFirmId();
    var now    = new Date().toISOString();

    // Find the step to route
    var step = (templateSteps || []).find(function(s) { return s.sequence_order === currentStepSeq; });
    if (!step) {
      console.warn('[_mwResolveAndRoute] no step found at seq:', currentStepSeq);
      return;
    }

    // Load submitter's resource row for role resolution
    var resRows = await API.get(
      'resources?id=eq.' + submitterResId +
      '&select=id,name,manager_id,finance_contact_id,legal_contact_id,hr_contact_id'
    ).catch(function() { return []; });
    var submitterRes = resRows && resRows[0];
    if (!submitterRes) {
      console.warn('[_mwResolveAndRoute] submitter resource not found:', submitterResId);
      return;
    }

    // Resolve Cadence role → resource ID
    var resourceMap = {
      submitter: submitterResId,
      manager:   submitterRes.manager_id,
      finance:   submitterRes.finance_contact_id,
      legal:     submitterRes.legal_contact_id,
      hr:        submitterRes.hr_contact_id,
    };

    // Map Cadence role → workflow_requests.role constraint value
    // workflow_requests only accepts: 'approver', 'reviewer'
    var dbRoleMap = {
      submitter: 'reviewer',  // submitter reviews their own form before it routes
      manager:   'approver',
      finance:   'approver',
      legal:     'approver',
      hr:        'approver',
    };

    var assigneeResId = resourceMap[step.assignee_role] || null;
    var dbRole        = dbRoleMap[step.assignee_role]   || 'approver';

    if (!assigneeResId) {
      // ── Unresolved role — contact not yet assigned ───────────────────────────
      // Don't silently stall. Write a CoC event flagging the blockage,
      // patch the instance to 'blocked', and surface a toast to the current user.
      var roleLabel = {
        finance: 'Finance contact',
        legal:   'Legal contact',
        hr:      'HR contact',
        manager: 'Manager',
      }[step.assignee_role] || ('"' + step.assignee_role + '" contact');

      var blockedMsg = roleLabel + ' is not assigned for this user. '
        + 'Please assign one in My Team settings, then resubmit.';

      console.warn('[_mwResolveAndRoute] ' + blockedMsg);

      // Write CoC event so admins can see the blockage in audit trail
      await API.post('coc_events', {
        firm_id:     firmId,
        entity_id:   instanceId,
        entity_type: 'workflow_instance',
        event_type:  'request.blocked',
        event_class: 'lifecycle',
        severity:    'warning',
        event_notes: JSON.stringify({
          reason:        'unresolved_role',
          role:          step.assignee_role,
          step_name:     step.name,
          message:       blockedMsg,
        }),
        actor_name:  'System',
        occurred_at: new Date().toISOString(),
        created_at:  new Date().toISOString(),
      }).catch(function() {});

      // Mark instance as blocked
      await API.patch('workflow_instances?id=eq.' + instanceId, {
        status:            'blocked',
        current_step_name: 'BLOCKED: ' + roleLabel + ' not assigned',
        updated_at:        new Date().toISOString(),
      }).catch(function() {});

      // ── Emit #7: instance.blocked (B1 / CMD54) ───────────────────────────
      // Fires on non-fatal routing halt (unresolved role, missing assignee).
      // Replaces the hand-maintained M2 mock. CommandHUD may trigger
      // critical-urgency dispatches for blocked instances past a threshold.
      if (typeof window._cmdEmit === 'function') {
        window._cmdEmit('instance.blocked', {
          instance_id: instanceId,
          seq:         currentStepSeq,
          reason:      'missing_role',
          details:     roleLabel + ' not assigned for role "' + step.assignee_role + '" at step ' + currentStepSeq,
        });
      }

      // Layer 2: Notify ALL admins via workflow_action_items
      // Tagged with instance_id so they can be batch-resolved when the issue is fixed
      try {
        var adminUsers = await API.get(
          'resources?firm_id=eq.' + firmId +
          '&select=id,name,user_id&is_active=eq.true'
        ).catch(function() { return []; });
        // Find admin users by cross-referencing users table
        var userRows = await API.get(
          'users?firm_id=eq.' + firmId + '&is_admin=eq.true&select=id,name,resource_id'
        ).catch(function() { return []; });
        var adminResIds = (userRows||[]).map(function(u){ return u.resource_id; }).filter(Boolean);
        // Also include the submitter's manager as a fallback
        if (submitterRes && submitterRes.manager_id) adminResIds.push(submitterRes.manager_id);
        var uniqueAdminResIds = adminResIds.filter(function(id, i, a){ return a.indexOf(id) === i; });

        if (uniqueAdminResIds.length) {
          var adminActionTitle = '⚠ Routing blocked: ' + roleLabel + ' not assigned';
          var adminActionBody  = 'The workflow "' + formName + '" is blocked because ' + blockedMsg +
            ' Click "Resume" on the request in MY REQUESTS to continue routing once the contact is assigned.';
          await Promise.all(uniqueAdminResIds.map(function(adminResId) {
            return API.post('workflow_action_items', {
              firm_id:           firmId,
              instance_id:       instanceId,
              title:             adminActionTitle,
              body:              adminActionBody,
              status:            'open',
              owner_resource_id: adminResId,
              owner_name:        (adminUsers||[]).find(function(r){ return r.id===adminResId; })?.name || 'Admin',
              created_by_name:   'Cadence Workflow Engine',
              created_at:        new Date().toISOString(),
            }).catch(function() {});
          }));
          console.log('[_mwResolveAndRoute] notified ' + uniqueAdminResIds.length + ' admin(s) of routing block');
        }
      } catch(e) {
        console.warn('[_mwResolveAndRoute] admin notification failed:', e);
      }

      // Surface toast to whoever triggered this
      if (typeof compassToast === 'function') {
        compassToast(
          '⚠ Routing blocked — ' + blockedMsg,
          6000
        );
      }
      return;
    }

    // Load assignee name
    var assigneeRows = await API.get(
      'resources?id=eq.' + assigneeResId + '&select=id,name'
    ).catch(function() { return []; });
    var assigneeName = (assigneeRows && assigneeRows[0] && assigneeRows[0].name) || 'Unknown';
    var submitterName = submitterRes.name || 'Unknown';

    // Check if a workflow_request already exists for this instance + step
    var existing = await API.get(
      'workflow_requests?instance_id=eq.' + instanceId +
      '&owner_resource_id=eq.' + assigneeResId +
      '&status=eq.open&select=id&limit=1'
    ).catch(function() { return []; });
    if (existing && existing.length) {
      console.log('[_mwResolveAndRoute] request already exists for role:', step.assignee_role);
      return;
    }

    // Create the workflow_request. Capture the inserted row so the
    // new row's id is available for the workflow_request.created emit.
    // Supabase REST with default Prefer: return=representation returns
    // the inserted row(s) as an array.
    var insertedReq = await API.post('workflow_requests', {
      firm_id:          firmId,
      instance_id:      instanceId,
      role:             dbRole,
      title:            formName + ' — ' + step.name,
      body:             'Please review and action: ' + formName + ' submitted by ' + submitterName,
      status:           'open',
      owner_resource_id: assigneeResId,
      owner_name:       assigneeName,
      created_by_name:  submitterName,
      due_date:         null,
      created_at:       now,
    });
    var newRequestId = (insertedReq && insertedReq[0] && insertedReq[0].id) || null;

    console.log('%c[_mwResolveAndRoute] routed step ' + currentStepSeq + ' (' + step.assignee_role + ') → ' + assigneeName,
      'background:#1a4a2a;color:#3de08a;padding:2px 8px;border-radius:3px');

    // Expose for CMD Center — if this request is for the current user, store it
    // so scripts can call Click "Review" or Click "Approve" without DOM scraping.
    //
    // B-UI-3.2 (CMD69): this write MUST happen BEFORE the workflow_request.created
    // emit. The emit triggers B-UI-1's reactive handler which fires work_queue.rendered
    // via rAF (~16ms); Wait ForQueueRow resolves; Click ForInstance then reads
    // _myActiveRequestId[instance_id]. If the map write is downstream of the emit,
    // Click ForInstance throws "no row for instance" because the map is empty at
    // click time. Pre-fix, the write trailed the emit plus an awaited API.get
    // round-trip (50–200ms) — the race was deterministic, not time-sensitive.
    // Post-fix, the write is synchronous-after-INSERT using the row id captured
    // from the POST's return=representation (no second HTTP round-trip needed —
    // newRequestId was already available at line ~2311).
    if (window._myResource && assigneeResId === window._myResource.id && newRequestId) {
      if (!window._myActiveRequestId) window._myActiveRequestId = {};
      window._myActiveRequestId[instanceId] = newRequestId;
    }

    // ── Emit #3: workflow_request.created (B1 / CMD54; CMD65 hotfix; CMD69 reorder) ──
    // Fires at the routing site (not in the cmd-center.js transcript intercept)
    // so every routed request emits, not only those the intercept catches on
    // Compass. `role` carries the Cadence role (manager/finance/legal/hr/
    // submitter) which is what policies predicate on — the DB's workflow_requests
    // role column is coarser ('approver'/'reviewer').
    //
    // CMD65 hotfix: include workflow_request_id. B-UI-1's _emitRenderedOnce
    // dedups by workflow_request_id and bails early when it's absent — an
    // omission in B1's original payload (Brief B1 v1.1 Emit #3 didn't list it).
    // Absence caused every work_queue.rendered emit to silently no-op since
    // B-UI-1 shipped; surfaced by B-UI-2's probe. Additive change; no
    // downstream consumer breaks.
    //
    // CMD69 reorder (B-UI-3.2): moved from line ~2327 (pre-_myActiveRequestId write)
    // to here (post-write). Serializes the map write as a precondition of the
    // emit. For the not-for-current-user branch, the map write is skipped but
    // the emit still fires — other consumers (reactive subscription on the
    // assignee's own tab, M2 feed) require it. That branch's timing is unchanged.
    if (typeof window._cmdEmit === 'function') {
      window._cmdEmit('workflow_request.created', {
        workflow_request_id:    newRequestId,
        instance_id:            instanceId,
        seq:                    currentStepSeq,
        assignee_resource_id:   assigneeResId,
        assignee_name:          assigneeName,
        role:                   step.assignee_role || null,
        template_id:            step.template_id || null,
      });
    }

    // Update instance current_step_id
    await API.patch(
      'workflow_instances?id=eq.' + instanceId,
      { current_step_id: step.id, updated_at: now }
    ).catch(function(e) { console.warn('[_mwResolveAndRoute] current_step_id patch failed:', e); });

  } catch(e) {
    console.error('[_mwResolveAndRoute] failed:', e);
  }
};

// ── myrResumeInstance ─────────────────────────────────────────────────────────
// Layer 3: Resume a blocked instance after the missing contact has been assigned.
// Re-runs _mwResolveAndRoute for the current step. If it resolves, clears all
// admin action items for this instance and continues routing.
window.myrResumeInstance = async function(instanceId, title, evt) {
  if (evt) { evt.stopPropagation(); evt.preventDefault(); }
  try {
    var firmId = _mwFirmId();
    var res    = window._myResource;
    if (!res) { compassToast('Cannot resume — user identity not resolved.', 3000); return; }

    // Re-fetch the instance to get current step
    var instRows = await API.get(
      'workflow_instances?id=eq.' + instanceId + '&select=id,title,current_step_id,template_id,submitted_by_resource_id,form_data&limit=1'
    ).catch(function() { return []; });
    var inst = instRows && instRows[0];
    if (!inst) { compassToast('Instance not found.', 3000); return; }

    // Load template steps
    var steps = await API.get(
      'workflow_template_steps?template_id=eq.' + inst.template_id +
      '&order=sequence_order.asc&select=id,name,step_type,sequence_order,assignee_type,assignee_role,template_id'
    ).catch(function() { return []; });

    var currentStep = (steps||[]).find(function(s) { return s.id === inst.current_step_id; });
    if (!currentStep) { compassToast('Could not determine current step.', 3000); return; }

    // Temporarily patch status back to in_progress so routing can proceed
    await API.patch('workflow_instances?id=eq.' + instanceId, {
      status:     'in_progress',
      updated_at: new Date().toISOString(),
    });

    // Re-run resolution for the current step
    var submitterResId = inst.submitted_by_resource_id || res.id;
    var formName = title || inst.title || 'Form';
    await window._mwResolveAndRoute(instanceId, steps, currentStep.sequence_order, submitterResId, formName);

    // Check if still blocked after resolution attempt
    var checkRows = await API.get(
      'workflow_instances?id=eq.' + instanceId + '&select=status&limit=1'
    ).catch(function() { return []; });
    var newStatus = checkRows && checkRows[0] && checkRows[0].status;

    if (newStatus === 'blocked') {
      compassToast('Still blocked — contact is still missing. Please assign the contact first.', 5000);
      return;
    }

    // Success — resolve all admin action items for this instance
    await API.patch(
      'workflow_action_items?instance_id=eq.' + instanceId + '&status=eq.open',
      { status: 'resolved', updated_at: new Date().toISOString() }
    ).catch(function() {});

    compassToast('✓ Routing resumed successfully.', 3000);
    if (typeof loadUserRequests === 'function') setTimeout(loadUserRequests, 500);

  } catch(e) {
    console.error('[myrResumeInstance] failed:', e);
    compassToast('Resume failed: ' + (e.message || 'check console'), 4000);
  }
};

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

function _myrStatusCell(inst, step, sColor) {
  var FA = 'font-family:Arial,sans-serif;font-size:11px;';
  var steps = (window._myrTmplSteps||{})[inst.template_id] || [];
  var cocEvts  = (window._myrInstCoc  || {})[inst.id] || [];
  var instReqs = (window._myrInstReqs || {})[inst.id] || [];
  var fmtDt = function(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'});
  };

  // Build a map of step completion from CoC events + requests
  // request.approved events carry actor_name = the approver
  var approvedEvents = cocEvts.filter(function(e){ return e.event_type === 'request.approved'; });
  var submittedEvent = cocEvts.find(function(e){ return e.event_type === 'request.submitted'; });
  var blockedEvent   = cocEvts.find(function(e){ return e.event_type === 'request.blocked'; });

  // Find current step sequence_order to know which steps are before/after
  var currentStep = steps.find(function(s){ return s.name === inst.current_step_name; });
  var currentSeq  = currentStep ? currentStep.sequence_order : 0;

  var stepRows = steps.filter(function(s){ return s.step_type !== 'trigger'; }).map(function(s, idx) {
    var isPast    = s.sequence_order < currentSeq;
    var isActive  = s.name === inst.current_step_name;
    var isFuture  = s.sequence_order > currentSeq;
    var isBlocked = isActive && inst.status === 'blocked';
    var isAllDone = inst.status === 'completed';

    // Determine approver and date from CoC events
    var approvalEvent = approvedEvents[idx - 1]; // offset by 1 since trigger is step 0
    // Step 1 (submit) uses submitted event
    if (s.sequence_order === 1 && submittedEvent) {
      approvalEvent = null; // show submitted date not approval
    }

    var approverName = '—';
    var stepDate     = '—';

    // Use workflow_requests rows sorted by created_at — each maps to a step in sequence
    var nonTriggerSteps = steps.filter(function(s){ return s.step_type !== 'trigger'; });
    var stepIdx = nonTriggerSteps.findIndex(function(ns){ return ns.id === s.id; });
    var stepReq = instReqs[stepIdx] || null;

    // Pre-resolved step chain stored in notes at submit time
    var stepChain = null;
    try {
      var notesObj = inst.notes ? JSON.parse(inst.notes) : null;
      stepChain = notesObj ? notesObj.step_chain : null;
    } catch(_) {}
    var chainEntry = stepChain ? stepChain[s.sequence_order] : null;
    // Assignee from chain — the person responsible for this step
    var chainAssignee = chainEntry ? (chainEntry.assignee_name || '—') : '—';

    if (s.sequence_order === 1) {
      stepDate     = submittedEvent ? fmtDt(submittedEvent.occurred_at) : fmtDt(inst.created_at);
      // Step 1 with step_type 'form' is completed by the act of submission itself
      var isFormStep = s.step_type === 'form';
      approverName = chainAssignee;
      // Always show as approved/submitted if instance exists
      if (isFormStep) {
        dot = '#1D9E75'; sc = '#1D9E75'; sl = 'Submitted';
        return '<tr style="border-bottom:0.5px solid rgba(255,255,255,.08)">' +
          '<td style="' + FA + 'color:#e8eef8;padding:6px 10px;white-space:nowrap">' +
            '<div style="display:flex;align-items:center;gap:7px">' +
              '<div style="width:7px;height:7px;border-radius:50%;background:' + dot + ';flex-shrink:0"></div>' + s.name +
            '</div></td>' +
          '<td style="' + FA + 'color:rgba(255,255,255,.6);padding:6px 10px;white-space:nowrap">' + stepDate + '</td>' +
          '<td style="' + FA + 'padding:6px 10px;white-space:nowrap">' + approverName + '</td>' +
          '<td style="padding:6px 10px"><span style="' + FA + 'font-weight:700;color:' + sc + '">' + sl + '</span></td>' +
        '</tr>';
      }
      // For completed non-form step 1, show who actually signed; otherwise show assignee
      approverName = (isPast || isAllDone)
        ? (stepReq ? stepReq.owner_name : chainAssignee)
        : chainAssignee;
    } else if (isPast || isAllDone) {
      // Match the approval CoC event to this step using the step_chain assignee_id.
      // Array-index matching breaks when the same person appears in multiple steps
      // (e.g. VS approves steps 1 & 2, then AK approves step 3 — index 1 would
      // incorrectly pick VS's second approval for AK's step).
      var assigneeId = chainEntry ? chainEntry.assignee_id : null;
      var ev = null;
      if (assigneeId) {
        // Find the first unused approved event whose actor_resource_id matches this step's assignee
        var usedEventIds = [];
        // Walk steps in order up to this one to consume events correctly
        var nonTriggerSorted = steps
          .filter(function(ns){ return ns.step_type !== 'trigger' && ns.sequence_order < s.sequence_order; })
          .sort(function(a,b){ return a.sequence_order - b.sequence_order; });
        nonTriggerSorted.forEach(function(prevStep) {
          var prevChain = stepChain ? stepChain[prevStep.sequence_order] : null;
          var prevAssigneeId = prevChain ? prevChain.assignee_id : null;
          var prevEv = approvedEvents.find(function(ae) {
            return !usedEventIds.includes(ae.occurred_at) &&
              (ae.actor_resource_id === prevAssigneeId ||
               (ae.actor_name && prevChain && ae.actor_name === prevChain.assignee_name));
          });
          if (prevEv) usedEventIds.push(prevEv.occurred_at);
        });
        // Now find the event for this step
        ev = approvedEvents.find(function(ae) {
          return !usedEventIds.includes(ae.occurred_at) &&
            (ae.actor_resource_id === assigneeId ||
             (ae.actor_name && chainEntry && ae.actor_name === chainEntry.assignee_name));
        });
        // Fallback: first unused event
        if (!ev) {
          ev = approvedEvents.find(function(ae){ return !usedEventIds.includes(ae.occurred_at); });
        }
      } else {
        // No assignee_id — fall back to sequential index
        var approvalIdx = stepIdx - 1;
        ev = approvedEvents[approvalIdx];
      }
      stepDate     = ev ? fmtDt(ev.occurred_at) : (stepReq ? fmtDt(stepReq.created_at) : '—');
      // Show actual signer for completed steps
      approverName = ev ? ev.actor_name : (stepReq ? stepReq.owner_name : chainAssignee);
    } else {
      // Waiting or active — show who is responsible from the pre-resolved chain
      approverName = chainAssignee;
    }

    var dot, sc, sl;
    if (isAllDone || isPast) {
      dot = '#1D9E75'; sc = '#1D9E75'; sl = 'Approved';
    } else if (isBlocked) {
      dot = '#E24B4A'; sc = '#E24B4A'; sl = 'Blocked';
    } else if (isActive) {
      dot = '#00c9c9'; sc = '#EF9F27'; sl = 'In Progress';
    } else {
      dot = '#555e6e'; sc = 'rgba(255,255,255,.3)'; sl = 'Waiting';
    }

    // Flag missing approver in red
    var isMissingApprover = (approverName === '—' || !approverName) && !isAllDone && !isPast;
    var approverDisplay = isMissingApprover
      ? '<span style="color:#E24B4A;font-weight:700">⚠ Not assigned</span>'
      : approverName;
    return '<tr style="border-bottom:0.5px solid rgba(255,255,255,.08)' + (isMissingApprover?';background:rgba(226,75,74,.05)':'') + '">' +
      '<td style="' + FA + 'color:#e8eef8;padding:6px 10px;white-space:nowrap">' +
        '<div style="display:flex;align-items:center;gap:7px">' +
          '<div style="width:7px;height:7px;border-radius:50%;background:' + dot + ';flex-shrink:0"></div>' + s.name +
        '</div></td>' +
      '<td style="' + FA + 'color:rgba(255,255,255,.6);padding:6px 10px;white-space:nowrap">' + stepDate + '</td>' +
      '<td style="' + FA + 'padding:6px 10px;white-space:nowrap">' + approverDisplay + '</td>' +
      '<td style="padding:6px 10px"><span style="' + FA + 'font-weight:700;color:' + sc + '">' + sl + '</span></td>' +
    '</tr>';
  }).join('');
  var tt = steps.length ? '<div class="myr-sig-tt" style="display:none;position:absolute;bottom:calc(100% + 8px);right:0;background:#111620;border:1px solid rgba(0,201,201,.4);border-radius:6px;z-index:9999;min-width:500px;box-shadow:0 8px 32px rgba(0,0,0,.7);overflow:hidden;font-size:11px">' +
    '<div style="background:' + (inst.status==='blocked'?'rgba(226,75,74,.12)':'rgba(0,201,201,.12)') + ';padding:6px 12px;border-bottom:0.5px solid ' + (inst.status==='blocked'?'rgba(226,75,74,.3)':'rgba(0,201,201,.3)') + ';display:flex;align-items:center;gap:8px">' +
      (inst.status==='blocked'?'<span style="font-size:13px">⚠</span>':'') +
      '<span style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:' + (inst.status==='blocked'?'#E24B4A':'#00c9c9') + ';letter-spacing:.08em;text-transform:uppercase">' +
      (inst.status==='blocked'?'ACTION REQUIRED — ROUTING BLOCKED':'Signature Loop Status') +
      '</span>' +
    '</div>' +
    '<table style="border-collapse:collapse;width:100%;font-size:11px">' +
      '<thead><tr style="border-bottom:0.5px solid rgba(255,255,255,.1)">' +
        '<th style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:#00c9c9;padding:6px 10px;text-align:left">Step</th>' +
        '<th style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:#00c9c9;padding:6px 10px;text-align:left;white-space:nowrap">Date / Time</th>' +
        '<th style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:#00c9c9;padding:6px 10px;text-align:left">Approver</th>' +
        '<th style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:#00c9c9;padding:6px 10px;text-align:left">Status</th>' +
      '</tr></thead>' +
      '<tbody>' + stepRows + '</tbody>' +
    '</table></div>' : '';
  var hasMissingApprover = _myrHasMissingApprover(inst);
  var warningBadge = (hasMissingApprover && inst.status !== 'blocked')
    ? '<span title="One or more approvers not assigned" style="margin-left:5px;font-size:12px;cursor:help">⚠</span>'
    : '';
  return '<div style="display:inline-block;position:relative;font-size:11px" onmouseenter="var t=this.querySelector(\'.myr-sig-tt\');if(t)t.style.display=\'block\'" onmouseleave="var t=this.querySelector(\'.myr-sig-tt\');if(t)t.style.display=\'none\'">' +
    '<span style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:' + sColor + ';letter-spacing:.05em;cursor:default">' + step + '</span>' + warningBadge + tt +
  '</div>';
}

window.myrRecallToDraft_row = async function(instanceId, evt) {
  if (evt) { evt.stopPropagation(); evt.preventDefault(); }
  var confirmed = await _myrConfirm({
    title: 'Recall to Draft',
    body: 'Return this submission to Draft status?<br><br>The form will be removed from active routing and restored as an editable draft.',
    confirmLabel: 'Recall',
    danger: false
  });
  if (!confirmed) return;
  try {
    var firmId = _mwFirmId();
    var resId  = _myResource ? _myResource.id : null;
    if (!resId) { compassToast('Cannot recall — user identity not resolved.', 3000); return; }
    // MT1: fetch fresh from DB so form_def_id is available even if _myrInstances cache is stale
    var instRows = await API.get(
      'workflow_instances?id=eq.' + instanceId + '&select=id,template_id,form_def_id,form_data&limit=1'
    ).catch(function(){ return []; });
    var inst = instRows && instRows[0];
    if (!inst) { compassToast('Instance not found.', 2500); return; }
    // Use form_def_id directly — written at submit time (MT1). No regex.
    var formDefId = inst.form_def_id || null;
    if (!formDefId) {
      // Legacy fallback for pre-MT1 instances
      if (inst.template_id) {
        var tmplRows = await API.get(
          'workflow_templates?id=eq.' + inst.template_id + '&select=id,name,form_driven&limit=1'
        ).catch(function(){ return []; });
        var lt = tmplRows && tmplRows[0];
        if (lt && lt.form_driven && lt.name) {
          var fdRows = await API.get(
            'workflow_form_definitions?firm_id=eq.' + firmId +
            '&source_name=eq.' + encodeURIComponent(lt.name) +
            '&select=id&order=updated_at.desc&limit=1'
          ).catch(function(){ return []; });
          formDefId = fdRows && fdRows[0] ? fdRows[0].id : null;
        }
      }
      if (!formDefId) { compassToast('Cannot recall — form definition not linked.', 3000); return; }
    }
    await API.patch('workflow_instances?id=eq.' + instanceId + '&firm_id=eq.' + firmId, { status: 'cancelled' });
    await _myrDel(
      'form_drafts?firm_id=eq.' + firmId + '&user_id=eq.' + resId + '&form_def_id=eq.' + formDefId
    ).catch(function(){});
    await API.post('form_drafts', {
      firm_id:     firmId,
      user_id:     resId,
      form_def_id: formDefId,
      form_data:   inst.form_data || {},
      updated_at:  new Date().toISOString(),
    });

    // ── B-UI-7a (CMD75): emit instance.recalled ──────────────────────────────
    // Distinct from instance.withdrawn per operator decision: recall has the
    // draft-restoration side effect (form_drafts insert above) and different
    // user intent (return-to-editable) vs withdraw's terminate-and-forget.
    // Emits after both PATCH and draft-restore commit, before local refresh.
    // Rule 34 inverse: cross-surface state transitions mirror onto the event
    // bus. No rAF — post-PATCH emit does not depend on DOM commit.
    if (typeof window._cmdEmit === 'function') {
      window._cmdEmit('instance.recalled', {
        instance_id:             instanceId,
        recalled_by_resource_id: resId || null,
        reason:                  null,
      });
    }

    compassToast('Recalled to Draft.', 2500);
    if (typeof loadUserRequests === 'function') setTimeout(loadUserRequests, 600);
  } catch(e) {
    console.error('[myrRecallToDraft_row] failed:', e);
    compassToast('Recall failed: ' + (e.message || 'check console'), 3000);
  }
};

window.myrOpenInstance = async function(instanceId) {
  try {
    var firmId = _mwFirmId();
    var instRows = await API.get('workflow_instances?id=eq.' + instanceId + '&select=*&limit=1').catch(function(){ return []; });
    var inst = instRows?.[0];
    if (!inst) { compassToast('Instance not found.', 2500); return; }
    // MT1: Use form_def_id directly — no regex heuristic.
    // form_def_id is written at submit time by the bulletproof compass_form_submit handler.
    // For legacy instances that pre-date MT1 (no form_def_id), fall back gracefully.
    var formDefId = inst.form_def_id || null;
    if (!formDefId && inst.template_id) {
      // Legacy fallback: look up form_def by companion template name
      var tmplRows = await API.get(
        'workflow_templates?id=eq.' + inst.template_id + '&select=id,name,form_driven&limit=1'
      ).catch(function(){ return []; });
      var legacyTmpl = tmplRows && tmplRows[0];
      if (legacyTmpl && legacyTmpl.form_driven && legacyTmpl.name) {
        var fdRows = await API.get(
          'workflow_form_definitions?firm_id=eq.' + firmId +
          '&source_name=eq.' + encodeURIComponent(legacyTmpl.name) +
          '&select=id&order=updated_at.desc&limit=1'
        ).catch(function(){ return []; });
        formDefId = fdRows && fdRows[0] ? fdRows[0].id : null;
        console.warn('[myrOpenInstance] legacy fallback resolved form_def_id:', formDefId, 'for template:', legacyTmpl.name);
      }
    }
    if (!formDefId) { compassToast('No form linked to this instance.', 2500); return; }
    var rows = await API.get('workflow_form_definitions?id=eq.' + formDefId + '&firm_id=eq.' + firmId + '&select=id,source_name,source_html&limit=1').catch(function(){ return []; });
    var fd = rows?.[0];
    if (!fd?.source_html) { compassToast('Form not found.', 2500); return; }
    var savedData = inst.form_data || {};
    var restoreScript = `<script>
window.addEventListener('DOMContentLoaded', function() {
  var saved = ${JSON.stringify(savedData)};

  // 1. Restore named fields (data-label)
  Object.keys(saved).forEach(function(label) {
    if (label.indexOf('_grid_') === 0 || label.indexOf('_misc_') === 0 ||
        label.indexOf('_ent_')  === 0 || label.charAt(0) === '_') return;
    var el = document.querySelector('[data-label="' + label + '"]');
    if (el && saved[label]) el.value = saved[label];
  });

  // 2. Rebuild date grid if trip dates are saved, then restore grid values
  if (typeof buildTable === 'function' && (saved['Trip Start Date'] || saved['Trip End Date'])) {
    var s = document.getElementById('trip-start');
    var e = document.getElementById('trip-end');
    if (s && saved['Trip Start Date']) s.value = saved['Trip Start Date'];
    if (e && saved['Trip End Date'])   e.value = saved['Trip End Date'];
    if (typeof onDateChange === 'function') onDateChange();
  }

  setTimeout(function() {
    // 3. Grid cells — _grid_{cat}_{dk}
    Object.keys(saved).forEach(function(label) {
      if (label.indexOf('_grid_') !== 0) return;
      var parts = label.split('_');
      // parts: ['', 'grid', cat, ...dk parts]
      var cat = parts[2];
      var dk  = parts.slice(3).join('-');
      var el = document.querySelector('[data-cat="' + cat + '"][data-dk="' + dk + '"]');
      if (el) { el.value = saved[label]; el.dispatchEvent(new Event('input')); }
    });

    // 4. Misc expense rows — _misc_{idx}_{field}
    var miscIdxs = {};
    Object.keys(saved).forEach(function(k) {
      if (k.indexOf('_misc_') === 0) { miscIdxs[k.split('_')[2]] = true; }
    });
    Object.keys(miscIdxs).sort().forEach(function(idx) {
      if (typeof addMiscRow === 'function') addMiscRow();
      var rows = document.querySelectorAll('#misc-tbody tr');
      var row  = rows[parseInt(idx)];
      if (!row) return;
      var desc = row.querySelector('input[placeholder="Item description"]');
      var date = row.querySelector('input[type="date"]');
      var type = row.querySelector('select');
      var amt  = row.querySelector('input[type="number"]');
      if (desc && saved['_misc_'+idx+'_desc']) desc.value = saved['_misc_'+idx+'_desc'];
      if (date && saved['_misc_'+idx+'_date']) date.value = saved['_misc_'+idx+'_date'];
      if (type && saved['_misc_'+idx+'_type']) type.value = saved['_misc_'+idx+'_type'];
      if (amt  && saved['_misc_'+idx+'_amt'])  { amt.value = saved['_misc_'+idx+'_amt']; amt.dispatchEvent(new Event('input')); }
    });

    // 5. Entertainment detail rows — _ent_{idx}_{field}
    var entIdxs = {};
    Object.keys(saved).forEach(function(k) {
      if (k.indexOf('_ent_') === 0) { entIdxs[k.split('_')[2]] = true; }
    });
    Object.keys(entIdxs).sort().forEach(function(idx) {
      if (typeof addEntRow === 'function') addEntRow();
      var rows = document.querySelectorAll('#ent-tbody tr');
      var row  = rows[parseInt(idx)];
      if (!row) return;
      var date    = row.querySelector('input[type="date"]');
      var type    = row.querySelector('.ent-type');
      var guests  = row.querySelector('.ent-guests');
      var purpose = row.querySelector('.ent-purpose');
      var amt     = row.querySelector('.ent-amt');
      if (date    && saved['_ent_'+idx+'_date'])    date.value    = saved['_ent_'+idx+'_date'];
      if (type    && saved['_ent_'+idx+'_type'])    type.value    = saved['_ent_'+idx+'_type'];
      if (guests  && saved['_ent_'+idx+'_guests'])  guests.value  = saved['_ent_'+idx+'_guests'];
      if (purpose && saved['_ent_'+idx+'_purpose']) purpose.value = saved['_ent_'+idx+'_purpose'];
      if (amt     && saved['_ent_'+idx+'_amt'])     { amt.value = saved['_ent_'+idx+'_amt']; amt.dispatchEvent(new Event('input')); }
    });

    // 6. Lock form — read-only view mode
    document.querySelectorAll('input,textarea,select').forEach(function(el) {
      el.disabled = true; el.style.cursor = 'not-allowed';
    });
    document.querySelectorAll('.btn-s,.btn-p,.ftr').forEach(function(el) {
      el.style.display = 'none';
    });
  }, 400);
});
<\/script>`;
    var html = fd.source_html.replace('<\/body>', restoreScript + '<\/body>');
    if (!html.includes('<\/body>')) html = fd.source_html + restoreScript;
    var blob = new Blob([html], {type:'text/html;charset=utf-8'});
    _myrOpenHtmlFormOverlay(fd.source_name, URL.createObjectURL(blob), fd.id);
    setTimeout(function() {
      var bar = document.querySelector('#myr-html-form-modal > div');
      if (!bar) return;
      var recallBtn = document.createElement('button');
      recallBtn.textContent = 'Recall to Draft';
      recallBtn.style.cssText = 'font-family:Arial,sans-serif;font-size:11px;font-weight:700;padding:4px 14px;background:none;border:1px solid #f0a030;color:#f0a030;cursor:pointer;border-radius:4px;margin-right:8px';
      recallBtn.onclick = function() { myrRecallToDraft_row(inst.id, null); };
      bar.insertBefore(recallBtn, bar.firstChild);
    }, 50);
  } catch(e) {
    console.error('[myrOpenInstance] failed:', e);
    compassToast('Failed to open: ' + e.message, 3000);
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
  const drafts      = window._myrDrafts    || [];
  const activeCount = insts.filter(i => i.status!=='complete' && i.status!=='cancelled').length;
  const total       = activeCount + drafts.length;
  const activeBadge = document.getElementById('myr-active-badge');
  if (activeBadge) {
    activeBadge.textContent = total > 0 ? total : '';
    activeBadge.style.display = total > 0 ? 'inline' : 'none';
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
    '<span class="delta-chip" style="' + (colorMap[d.color]||colorMap.cyan) + '" data-delta-idx="' + i + '">' + _esc(d.label) + '</span>'
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

// ═══════════════════════════════════════════════════════════════════════════
// Work Queue reactivity (B-UI-1 / CMD64)
// ═══════════════════════════════════════════════════════════════════════════
// Problem: MY WORK queue renders from a DB query at tab-mount time only. A
// workflow_request.created emit reaches this tab via the event bus but the
// queue ignores it — the user sees a stale list until they switch tabs or
// refresh. Same class of gap as the Instance Feed non-reactivity flagged
// during B1.5 smoke.
//
// Fix: subscribe to CMDCenter.onAppEvent. On a workflow_request.created
// whose assignee_resource_id matches _myResource.id, re-run the existing
// mount-time render via window._mwLoadUserView(). On resolved events where
// the resolver is the current operator, same re-render (row disappears).
//
// After the re-render's DOM commits, emit work_queue.rendered carrying
// {workflow_request_id, instance_id, seq, assignee_resource_id, template_id}
// so scripts can wait on a clickable row (future Wait ForQueueRow).
//
// Iron Rules honored:
//   15 — onAppEvent listeners sit downstream of the Aegis self-echo filter.
//   20 — listeners receive inner payload, not envelope.
//   22 — on-mount buffer scan via recentEvents(50) catches events that
//        fired between DB query start and subscription registration.
//   25 — dedup runs at handler entry, before onAppEvent fan-out; no impact.
//   27 — no compound-predicate re-check against the buffer; the subscription
//        applies a single filter once per event.
(function() {
  // Guard against double-mount (module is loaded once per tab, but a
  // refresh re-evaluates the IIFE; the _cmdCenterLoaded guard in
  // cmd-center.js does the same).
  if (window._mwWorkQueueReactive) return;
  window._mwWorkQueueReactive = true;

  // Remember the workflow_request_ids we've already emitted work_queue.rendered
  // for. Prevents duplicate emits if _mwLoadUserView re-renders unchanged rows.
  // Keyed by workflow_request.id; values are ts. No TTL — the map is
  // bounded by active-queue size (typically <50), which is cheaper than
  // reasoning about TTL edge cases.
  var _renderedRequestIds = {};

  function _myResId() {
    return (window._myResource && window._myResource.id) || null;
  }

  // After a re-render triggered by workflow_request.created, fire
  // work_queue.rendered with the payload from that same event. Callers in
  // _handleEvent now await `_mwLoadUserView` before invoking this, so by
  // the time we're here the synchronous innerHTML assignment that writes
  // the .wi-row / .wi-action-btn elements has already committed to the
  // DOM. The single rAF below pushes the emit past the next paint tick
  // as a belt-and-suspenders guard — any future consumer that wants to
  // interact with layout (not just query DOM) benefits from the extra
  // tick without changing the contract.
  //
  // The emit payload comes from the triggering event, NOT from a DOM query.
  // This is deliberate: the event is the source of truth for workflow_request
  // metadata; the DOM is only the presentation layer. Any future consumer
  // (policy engine, scripts) should treat work_queue.rendered as "this
  // workflow_request is now presented to the assignee AND [data-wi-id] is
  // queryable" — the latter postcondition is what B-UI-3.4 tightens.
  function _emitRenderedOnce(evtPayload) {
    var wrid = evtPayload && evtPayload.workflow_request_id;
    if (!wrid) return;
    if (_renderedRequestIds[wrid]) return;
    _renderedRequestIds[wrid] = Date.now();
    requestAnimationFrame(function() {
      if (typeof window._cmdEmit !== 'function') return;
      window._cmdEmit('work_queue.rendered', {
        workflow_request_id:  wrid,
        instance_id:          evtPayload.instance_id || null,
        seq:                  (evtPayload.seq != null ? evtPayload.seq : null),
        assignee_resource_id: evtPayload.assignee_resource_id || null,
        template_id:          evtPayload.template_id || null,
      });
    });
  }

  // Core handler — called by both live onAppEvent and the on-mount buffer
  // scan. Returns true if the event triggered a re-render (caller doesn't
  // use this today, but keeps the contract clean).
  //
  // B-UI-3.4 (CMD71): `_mwLoadUserView` is async. The CMD64 implementation
  // invoked it without awaiting and then scheduled the emit via rAF. rAF
  // fires before the awaited DB query inside `_mwLoadUserView` resolves, so
  // `work_queue.rendered` landed before `[data-wi-id="<wrid>"]` was in the
  // DOM — the second leg of the Click ForInstance precondition race
  // B-UI-3.2 surfaced. Fix: await the render Promise, then emit. A single
  // rAF inside `_emitRenderedOnce` remains as a paint-commit guard.
  function _handleEvent(eventName, data) {
    if (!data) return false;
    var myResId = _myResId();
    if (!myResId) return false;

    if (eventName === 'workflow_request.created') {
      if (data.assignee_resource_id !== myResId) return false;

      // CMD74 (B-UI-6.1): mirror the routing-side _myActiveRequestId write
      // on the receive path.
      //
      // On the routing session, _mwResolveAndRoute (mw-tabs.js:2329) writes
      // _myActiveRequestId[instance_id] = workflow_request.id synchronously
      // before emitting workflow_request.created. Click ForInstance's wrid
      // lookup (cmd-center.js:1283) reads this map to resolve instance_id →
      // wrid, then queries [data-wi-id="<wrid>"]. Pre-CMD74, the receive
      // session (AK when VS routes to AK) had no equivalent write: the map
      // stayed empty for instance_ids the operator didn't personally route.
      // Cross-session Click ForInstance always threw "no row for instance"
      // even though B-UI-1's render committed the data-wi-id anchor on time.
      //
      // Latent defect exposed by B-UI-5 (CMD71) making cross-session
      // dispatch reliable. Single-session probes (B-UI-3.4) never hit it
      // because the routing and clicking sessions were identical — the
      // routing-side write covered the click.
      //
      // INTENTIONAL ASYMMETRY — do not "symmetrize" by adding a condition:
      // The routing-side write at mw-tabs.js:2329 guards with
      //   assigneeResId === window._myResource.id
      // because _mwResolveAndRoute runs on the routing session's behalf for
      // ALL assignees (self and others) — the guard filters the write to
      // only the self-routing case, so the routing operator's own map
      // receives only their own wrids.
      //
      // THIS handler (B-UI-1 _handleEvent) is only reached on the assignee's
      // own session, AND line 3048 above already filtered on
      //   data.assignee_resource_id !== myResId → return false
      // so by the time execution reaches here, the event IS for this
      // operator. The write below is therefore unconditional by design;
      // copying the routing-side guard would re-check a filter that already
      // passed upstream and — if misread — could turn into a no-op.
      if (data.workflow_request_id && data.instance_id) {
        if (!window._myActiveRequestId) window._myActiveRequestId = {};
        window._myActiveRequestId[data.instance_id] = data.workflow_request_id;
      }

      // A new row is inbound for this operator. Re-render the queue and
      // then announce the row is clickable.
      if (typeof window._mwLoadUserView === 'function') {
        Promise.resolve()
          .then(function() { return window._mwLoadUserView(); })
          .then(function() { _emitRenderedOnce(data); })
          .catch(function(e) {
            console.warn('[mw-tabs] _mwLoadUserView threw during reactive refresh:', e);
            // Still emit — a downstream consumer waiting on
            // work_queue.rendered should fail via its own timeout rather
            // than hang because the renderer threw.
            _emitRenderedOnce(data);
          });
      } else {
        _emitRenderedOnce(data);
      }
      return true;
    }

    if (eventName === 'workflow_request.resolved') {
      if (data.resolver_resource_id !== myResId) return false;
      // The operator resolved their own task — the row should disappear
      // (or update badge if changes_requested). Let the existing renderer
      // handle the visual transition; it re-queries workflow_requests and
      // the resolved row naturally drops out of the "open" filter.
      // No work_queue.rendered emit on resolved — the emit's purpose is
      // "a new queue item is now clickable," not "an old one is gone."
      if (data.workflow_request_id) delete _renderedRequestIds[data.workflow_request_id];
      if (typeof window._mwLoadUserView === 'function') {
        try { window._mwLoadUserView(); } catch (e) {
          console.warn('[mw-tabs] _mwLoadUserView threw during reactive refresh:', e);
        }
      }
      return true;
    }

    return false;
  }

  // Poll briefly until CMDCenter is ready (cmd-center.js loads after
  // mw-tabs.js on compass.html; mirror the pattern M2-FEED-1 uses in
  // aegis.html).
  function _mount() {
    if (!window.CMDCenter || !window.CMDCenter.onAppEvent) return false;

    // On-mount buffer scan — catch events that fired in the 30s retention
    // window before this subscription registered. Typical case: user opens
    // Compass seconds after a colleague's Approve click routed the next step
    // to them. The initial DB query already picks those up, so we're really
    // catching the narrower window between "DB query fires" and "subscription
    // registered" — but the dedup via _renderedRequestIds keeps us honest
    // either way.
    try {
      var recent = window.CMDCenter.recentEvents(50) || [];
      for (var i = recent.length - 1; i >= 0; i--) {
        var r = recent[i];
        if (r.eventName === 'workflow_request.created' || r.eventName === 'workflow_request.resolved') {
          _handleEvent(r.eventName, r.data);
        }
      }
    } catch (e) { /* seed is best-effort */ }

    window.CMDCenter.onAppEvent(_handleEvent);
    return true;
  }

  if (!_mount()) {
    var _tries = 0;
    var _t = setInterval(function() {
      _tries++;
      if (_mount()) { clearInterval(_t); return; }
      if (_tries > 200) {
        clearInterval(_t);
        console.warn('[mw-tabs] CMDCenter never appeared — Work Queue reactivity will not mount');
      }
    }, 50);
  }
})();

// ══════════════════════════════════════════════════════════════════════════════
// B-UI-7 (CMD76): Reactive MY REQUESTS ACTIVE → HISTORY migrations
// ══════════════════════════════════════════════════════════════════════════════
// Subscribes to the terminal instance event family and migrates the local
// submitter's cached row without requiring a hard refresh. Architectural
// reference: B-UI-1's _mwWorkQueueReactive IIFE above — same mount pattern,
// same on-mount buffer scan (Rule 22), same CMDCenter.onAppEvent subscription.
//
// Scope:
//   instance.completed   → flip cached status='complete',  re-render (migrate to HISTORY)
//   instance.withdrawn   → flip cached status='cancelled', re-render (migrate to HISTORY)
//   instance.recalled    → flip cached status='cancelled' + trigger loadUserRequests
//                          to pick up the restored form_drafts row. Recall uniquely
//                          has a draft-restoration side effect (B-UI-7a mw-tabs.js:2738)
//                          that the local cache cannot synthesize from event payload
//                          alone, so we delegate to the server round-trip. The ACTIVE
//                          row still disappears immediately via the local status flip;
//                          the Drafts-section update arrives ~600ms later with the
//                          loadUserRequests refresh.
//
// Deliberately NOT subscribed: instance.blocked. Blocked instances remain in
// ACTIVE with the ⚠ icon per existing design (mw-tabs.js:1064 _myrHasMissingApprover).
// The ⚠ is missing-signatory metadata that travels with the instance; it is
// not a signal to migrate.
//
// Reject handling: non-applicable. Per B-UI-7a Step 2 (Scenario B), rejection
// in this product = "request changes" — workflow stays in_progress, loops back
// to submitter via a new workflow_action_items row. The existing
// workflow_request.resolved {decision: 'changes_requested'} emit is the
// canonical signal; no ACTIVE→HISTORY migration occurs.
//
// Idempotence (Rule 25): if the same terminal event fires twice (transport
// retry, late echo), the second invocation finds the row already in terminal
// status → "no-op · row-not-in-active" log line + return. _cmdEmit's event_id
// dedup handles the wire-level dupe; this handler's local status check handles
// the logical dupe.
//
// Iron Rules honored:
//   15 — onAppEvent listeners sit downstream of Aegis self-echo filter.
//   20 — one listener path added, covering three event names via a dispatch switch.
//   22 — on-mount buffer scan via recentEvents(50); catches events that fired
//        between loadUserRequests completion and subscription registration.
//   25 — handler is idempotent; second fire no-ops via row-not-in-active branch.
//   31 — every non-trivial path produces a transcript-legible dev-console log
//        with instance_id and cause (event name).
//   32 — runtime evidence is the permanent log lines + operator visual
//        confirmation of row migration. No transient instrumentation.
//   34 — non-applicable by architectural choice. The handler reads only local
//        session state (_myrInstances); no cross-session mirroring concern.
// ══════════════════════════════════════════════════════════════════════════════
(function() {
  if (window._myrRequestsReactive) return;
  window._myrRequestsReactive = true;

  var TERMINAL_EVENTS = {
    'instance.completed': 'complete',
    'instance.withdrawn': 'cancelled',
    'instance.recalled':  'cancelled',
  };

  function _handleTerminal(eventName, data) {
    if (!TERMINAL_EVENTS.hasOwnProperty(eventName)) return false;
    var instanceId = data && data.instance_id;
    if (!instanceId) {
      console.warn('[my-requests] terminal event missing instance_id', eventName, data);
      return false;
    }

    var insts = window._myrInstances || [];
    var idx = -1;
    for (var i = 0; i < insts.length; i++) {
      if (insts[i] && insts[i].id === instanceId) { idx = i; break; }
    }

    // Row not in local cache — either another user's instance, or already
    // migrated this session, or the event is for an instance we never owned.
    // Rule 31: log the no-op to keep silent-dismissal debugging tractable.
    if (idx === -1) {
      console.log('[my-requests] no-op · instance_id=' + instanceId + ' reason=row-not-in-active');
      return false;
    }

    var current = insts[idx].status;
    if (current === 'complete' || current === 'cancelled') {
      // Idempotent no-op: row is already terminal (prior invocation handled it,
      // or the server refresh landed first).
      console.log('[my-requests] no-op · instance_id=' + instanceId + ' reason=already-migrated');
      return false;
    }

    // Flip the cached status. _myrRenderActive / _myrRenderHistory /
    // _myrUpdateRequestBadges all derive from _myrInstances by filter; one
    // re-render repoints ACTIVE, HISTORY, and the count badge coherently.
    insts[idx].status = TERMINAL_EVENTS[eventName];
    // For withdrawn: match the withdraw PATCH's current_step_name write
    // (mw-tabs.js:1052) so HISTORY's status-column renderer shows "Withdrawn"
    // rather than whatever the step was when the row was completed.
    if (eventName === 'instance.withdrawn') {
      insts[idx].current_step_name = 'Withdrawn';
    }

    if (typeof _myrRenderAll === 'function') {
      try { _myrRenderAll(); } catch (e) {
        console.warn('[my-requests] _myrRenderAll threw during reactive migration:', e);
      }
    }

    // Recall has a draft-restoration side effect (form_drafts POST at
    // mw-tabs.js:2738) that the local cache cannot synthesize. Trigger a
    // server refresh to pick up the restored draft row in the Drafts section.
    // The ACTIVE-row removal is already visible from the status flip + render
    // above; this is purely for the Drafts-section update.
    if (eventName === 'instance.recalled') {
      if (typeof window.loadUserRequests === 'function') {
        setTimeout(function() { window.loadUserRequests(); }, 600);
      }
      console.log('[my-requests] ACTIVE → removed · instance_id=' + instanceId + ' cause=' + eventName);
      return true;
    }

    // Completed / withdrawn: migrate to HISTORY. Because HISTORY is eagerly
    // rendered from the same _myrInstances array (mw-tabs.js:1383), the
    // re-render above already put the row in HISTORY's filtered view. The
    // HISTORY count (part of _myrUpdateRequestBadges' same derivation) also
    // syncs automatically — no separate add/increment helpers needed.
    console.log('[my-requests] HISTORY ← added · instance_id=' + instanceId + ' cause=' + eventName);
    console.log('[my-requests] ACTIVE → HISTORY · instance_id=' + instanceId + ' cause=' + eventName);
    return true;
  }

  function _mount() {
    if (!window.CMDCenter || !window.CMDCenter.onAppEvent) return false;

    // On-mount buffer scan (Rule 22) — catches terminal events that fired in
    // the retention window before this subscription registered. Typical case:
    // user opens MY REQUESTS seconds after a colleague's approval completed
    // their instance. The initial DB query already reflects the terminal
    // status, so the handler's "already-migrated" no-op branch fires — which
    // is correct and transcript-legible.
    try {
      var recent = window.CMDCenter.recentEvents(50) || [];
      for (var i = recent.length - 1; i >= 0; i--) {
        var r = recent[i];
        if (r && TERMINAL_EVENTS.hasOwnProperty(r.eventName)) {
          _handleTerminal(r.eventName, r.data);
        }
      }
    } catch (e) { /* seed is best-effort */ }

    window.CMDCenter.onAppEvent(_handleTerminal);
    return true;
  }

  if (!_mount()) {
    var _tries = 0;
    var _t = setInterval(function() {
      _tries++;
      if (_mount()) { clearInterval(_t); return; }
      if (_tries > 200) {
        clearInterval(_t);
        console.warn('[mw-tabs] CMDCenter never appeared — MY REQUESTS reactivity will not mount');
      }
    }, 50);
  }
})();