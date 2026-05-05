// ============================================================
// ProjectHUD — accord-core.js
// CMD-A3 · Accord shell, tab routing, meeting lifecycle, presence.
//
// Responsibilities:
//   - Tab routing for the five-tab top nav
//   - Active meeting state (idle | running | closed)
//   - Timer
//   - Presence subscription via Aegis (CMDCenter.onAppEvent + sessions())
//   - Realtime channel subscription (accord:meeting:{meeting_id})
//     via a meeting-scoped Supabase client
//   - Window-global API exposed as window.Accord for accord-capture.js
//
// Iron Rule 41 enforcement is at the surface level (composer is local;
// only commit gestures broadcast). Iron Rule 42 enforcement happens at
// the DB via the seal trigger; this surface reflects the closed-state
// transformation but doesn't enforce immutability itself.
// ============================================================

const Accord = (() => {
  'use strict';

  // ── Module state ──────────────────────────────────────────────
  const state = {
    meeting:       null,    // { id, title, state, organizer_id, started_at, ended_at, sealed_at, ... }
    thread:        null,    // current thread (one per meeting v0.1)
    organizerName: null,
    me:            null,    // { id, name, firm_id }
    timerInterval: null,
    channel:       null,    // Supabase realtime channel
    realtimeClient: null,
    surface:       'capture',
  };

  // ── DOM refs ──────────────────────────────────────────────────
  const $ = id => document.getElementById(id);

  // ── Identity (mirrors compass.html pattern) ───────────────────
  async function _resolveMe() {
    try {
      const token  = await Auth.getFreshToken().catch(() => Auth.getToken());
      const claims = JSON.parse(atob(token.split('.')[1]));
      const sub    = claims.sub;
      const email  = claims.email || null;

      const rows = await API.get(`users?id=eq.${sub}&select=id,name,email,firm_id`).catch(() => []);
      const u    = rows && rows[0] || null;
      state.me = {
        id:      u?.id   || sub,
        name:    u?.name || email || 'You',
        email,
        firm_id: u?.firm_id || window.FIRM_ID || null,
      };
      window.CURRENT_USER = state.me;
      return state.me;
    } catch (e) {
      console.error('[Accord] identity resolution failed', e);
      state.me = { id: null, name: 'Unknown', firm_id: null };
      return state.me;
    }
  }

  // ── Tab routing ───────────────────────────────────────────────
  function _wireTopNav() {
    document.querySelectorAll('#accord-app .surface-switch button').forEach(btn => {
      btn.addEventListener('click', () => switchSurface(btn.dataset.surface));
    });
    // Closed-banner CTAs (route to placeholder surfaces)
    document.querySelectorAll('#accord-app .closed-banner [data-target-surface]').forEach(btn => {
      btn.addEventListener('click', () => switchSurface(btn.dataset.targetSurface));
    });
  }

  function switchSurface(name) {
    state.surface = name;
    document.querySelectorAll('#accord-app .surface').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('#accord-app .surface-switch button').forEach(b => b.classList.remove('active'));
    const surface = $('surface-' + name);
    const btn     = document.querySelector(`#accord-app .surface-switch [data-surface="${name}"]`);
    if (surface) surface.classList.add('active');
    if (btn)     btn.classList.add('active');
    // CMD-A4: notify other surface modules of the change so they can lazy-load.
    window.dispatchEvent(new CustomEvent('accord:surface-changed', { detail: { surface: name } }));
  }

  // ── Meeting load / create ────────────────────────────────────
  async function loadMeeting(meetingId) {
    try {
      const rows = await API.get(`accord_meetings?meeting_id=eq.${meetingId}&select=*`);
      const m = rows && rows[0];
      if (!m) {
        console.warn('[Accord] meeting not found / inaccessible:', meetingId);
        _setMeetingHeader(null);
        return null;
      }
      state.meeting = m;

      // Resolve organizer name
      const oRows = await API.get(`users?id=eq.${m.organizer_id}&select=name`).catch(() => []);
      state.organizerName = oRows?.[0]?.name || null;

      // Resolve thread: prefer the thread linked via any existing node in this meeting;
      // fall back to the most recent thread in the firm.
      const linked = await API.get(
        `accord_nodes?meeting_id=eq.${m.meeting_id}&select=thread_id&limit=1`
      ).catch(() => []);
      let thread = null;
      if (linked && linked[0]?.thread_id) {
        const tt = await API.get(
          `accord_threads?thread_id=eq.${linked[0].thread_id}&select=*`
        ).catch(() => []);
        thread = tt?.[0] || null;
      }
      if (!thread) {
        const tRows = await API.get(
          `accord_threads?firm_id=eq.${m.firm_id}&select=*&order=created_at.desc&limit=1`
        ).catch(() => []);
        thread = tRows?.[0] || null;
      }
      state.thread = thread;

      _setMeetingHeader(m);
      _renderClosedBanner(m);
      _refreshTimer();
      _enableComposerForState();

      // Subscribe to the meeting channel (idempotent)
      await _subscribeMeetingChannel(m.meeting_id);

      // Notify accord-capture.js to render its data
      window.dispatchEvent(new CustomEvent('accord:meeting-loaded', { detail: { meeting: m, thread: state.thread } }));
      return m;
    } catch (e) {
      console.error('[Accord] loadMeeting failed', e);
      return null;
    }
  }

  async function createMeeting(title, threadTitle) {
    if (!state.me?.firm_id) {
      alert('No firm context — cannot create meeting.');
      return null;
    }
    try {
      // 1. Create thread first
      const threadRow = {
        firm_id:    state.me.firm_id,
        title:      threadTitle || title || 'Untitled thread',
        created_by: state.me.id,
      };
      const tCreated = await API.post('accord_threads', threadRow);
      const thread = Array.isArray(tCreated) ? tCreated[0] : tCreated;

      // 2. Create meeting in idle state
      // Note: accord_meetings has no scheduled_for NOT NULL; included only as informational
      const meetingRow = {
        firm_id:       state.me.firm_id,
        title:         title || 'Untitled meeting',
        organizer_id:  state.me.id,
        state:         'idle',
        scheduled_for: new Date().toISOString(),
      };
      const mCreated = await API.post('accord_meetings', meetingRow);
      const meeting = Array.isArray(mCreated) ? mCreated[0] : mCreated;

      // Stash thread reference for the loader
      state.thread = thread;
      await loadMeeting(meeting.meeting_id);
      // Persist meeting id in URL so refresh keeps the same meeting
      const url = new URL(window.location);
      url.searchParams.set('meeting', meeting.meeting_id);
      window.history.replaceState(null, '', url);
      return meeting;
    } catch (e) {
      console.error('[Accord] createMeeting failed', e);
      alert('Failed to create meeting: ' + (e?.message || e));
      return null;
    }
  }

  // ── Lifecycle transitions ────────────────────────────────────
  async function startMeeting() {
    const m = state.meeting;
    if (!m || m.state !== 'idle') return;
    try {
      const rows = await API.patch(`accord_meetings?meeting_id=eq.${m.meeting_id}`, {
        state:      'running',
        started_at: new Date().toISOString(),
      });
      const updated = rows?.[0] || m;
      state.meeting = { ...m, ...updated };
      _setMeetingHeader(state.meeting);
      _refreshTimer();
      _enableComposerForState();
    } catch (e) {
      console.error('[Accord] startMeeting failed', e);
      alert('Failed to start meeting: ' + (e?.message || e));
    }
  }

  async function endMeeting() {
    const m = state.meeting;
    if (!m || m.state !== 'running') return;
    try {
      const rows = await API.patch(`accord_meetings?meeting_id=eq.${m.meeting_id}`, { state: 'closed' });
      // The seal trigger populates ended_at, sealed_at, merkle_root server-side.
      // Refetch to get the sealed values.
      const fresh = await API.get(`accord_meetings?meeting_id=eq.${m.meeting_id}&select=*`).catch(() => []);
      state.meeting = fresh?.[0] || (rows?.[0] || m);
      _setMeetingHeader(state.meeting);
      _renderClosedBanner(state.meeting);
      _refreshTimer();
      _enableComposerForState();

      // Mock async PDF toast — fires ~6s post-END (real wiring in CMD-A7)
      setTimeout(() => _showToast(), 6000);

      // Tell capture surface to refresh (sealed_at now populated on nodes)
      window.dispatchEvent(new CustomEvent('accord:meeting-sealed', { detail: { meeting: state.meeting } }));
    } catch (e) {
      console.error('[Accord] endMeeting failed', e);
      alert('Failed to end meeting: ' + (e?.message || e));
    }
  }

  // ── Header / banner / timer / composer-enable ────────────────
  function _setMeetingHeader(m) {
    if (!m) {
      $('cap-title').textContent = 'No meeting loaded';
      $('cap-organizer').style.display = 'none';
      $('cap-meta-text').textContent   = 'Use NEW MEETING to begin.';
      $('cap-pulse').classList.remove('running');
      $('meetingToggleBtn').disabled = true;
      $('meetingToggleBtn').textContent = 'Start meeting →';
      return;
    }

    $('cap-title').textContent = m.title || 'Untitled meeting';
    if (state.organizerName) {
      $('cap-organizer').style.display = '';
      $('cap-organizer-name').textContent = state.organizerName;
    } else {
      $('cap-organizer').style.display = 'none';
    }
    const meta = [];
    if (m.scheduled_for) meta.push(new Date(m.scheduled_for).toLocaleString());
    meta.push('state: ' + m.state);
    $('cap-meta-text').textContent = meta.join(' · ');

    const pulse = $('cap-pulse');
    if (m.state === 'running') pulse.classList.add('running');
    else pulse.classList.remove('running');

    const toggle = $('meetingToggleBtn');
    if (m.state === 'idle') {
      toggle.disabled = false;
      toggle.textContent = 'Start meeting →';
      toggle.classList.add('btn-signal'); toggle.classList.remove('btn-end');
    } else if (m.state === 'running') {
      toggle.disabled = false;
      toggle.textContent = 'End meeting';
      toggle.classList.remove('btn-signal'); toggle.classList.add('btn-end');
    } else {
      toggle.disabled = true;
      toggle.textContent = 'Closed';
      toggle.classList.remove('btn-signal', 'btn-end');
      toggle.classList.add('btn-ghost');
    }
  }

  function _renderClosedBanner(m) {
    const banner = $('closedBanner');
    if (!banner) return;
    if (m && m.state === 'closed') {
      banner.classList.add('visible');
      document.querySelector('.surface-capture')?.classList.add('meeting-closed');
    } else {
      banner.classList.remove('visible');
      document.querySelector('.surface-capture')?.classList.remove('meeting-closed');
    }
  }

  function _refreshTimer() {
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
    const el = $('meetingTimer');
    const m = state.meeting;
    if (!m) { el.textContent = '00:00:00'; el.classList.remove('ended'); return; }
    if (m.state === 'idle') { el.textContent = '00:00:00'; el.classList.remove('ended'); return; }
    if (m.state === 'closed') {
      // Frozen "ENDED · N MIN"
      const start = m.started_at ? new Date(m.started_at).getTime() : null;
      const end   = m.ended_at ? new Date(m.ended_at).getTime() : Date.now();
      const mins  = start ? Math.max(0, Math.round((end - start) / 60000)) : 0;
      el.textContent = `ENDED · ${mins} MIN`;
      el.classList.add('ended');
      return;
    }
    // running
    el.classList.remove('ended');
    const startTs = m.started_at ? new Date(m.started_at).getTime() : Date.now();
    const tick = () => {
      const ms = Date.now() - startTs;
      const total = Math.max(0, Math.floor(ms / 1000));
      const h = String(Math.floor(total / 3600)).padStart(2, '0');
      const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
      const ss = String(total % 60).padStart(2, '0');
      el.textContent = `${h}:${mm}:${ss}`;
    };
    tick();
    state.timerInterval = setInterval(tick, 1000);
  }

  function _enableComposerForState() {
    const m = state.meeting;
    const enabled = !!(m && m.state === 'running');
    $('captureInput').disabled = !enabled;
    document.querySelectorAll('#accord-app .tag-btn').forEach(b => b.disabled = !enabled);
    $('chatInput').disabled = !enabled;
    $('chatSendBtn').disabled = !enabled;
  }

  // ── Realtime channel for the meeting ─────────────────────────
  // Per build brief §5: accord:meeting:{meeting_id}, Broadcast (not postgres_changes).
  // Iron Rule 41: only commit-moment events broadcast; no keystrokes.
  async function _subscribeMeetingChannel(meetingId) {
    try {
      // Wait for the supabase JS lib loaded by cmd-center.js (best-effort).
      let attempts = 0;
      while (!window.supabase && attempts < 40) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
      }
      if (!window.supabase) {
        console.warn('[Accord] window.supabase not available; meeting channel disabled');
        return;
      }
      // Reuse a dedicated client so we don't fight cmd-center's hud:{firm_id} channel.
      if (!state.realtimeClient) {
        const SUPA_URL = (window.PHUD && PHUD.SUPABASE_URL) || window.SUPABASE_URL;
        const SUPA_KEY = (window.PHUD && PHUD.SUPABASE_KEY) || window.SUPABASE_KEY;
        state.realtimeClient = window.supabase.createClient(SUPA_URL, SUPA_KEY, {
          realtime: { params: { eventsPerSecond: 10 } },
        });
        // Authorize realtime with the user's JWT so RLS / channel access apply
        try {
          const token = await Auth.getFreshToken().catch(() => Auth.getToken());
          if (state.realtimeClient.realtime?.setAuth) state.realtimeClient.realtime.setAuth(token);
        } catch (e) { /* non-fatal */ }
      }
      // Tear down any prior subscription
      if (state.channel) {
        try { await state.channel.unsubscribe(); } catch (e) {}
        state.channel = null;
      }
      const channelName = 'accord:meeting:' + meetingId;
      state.channel = state.realtimeClient.channel(channelName, {
        config: { broadcast: { self: false, ack: false } }
      });
      state.channel
        .on('broadcast', { event: 'accord.node.committed' },   payload => _onRemoteEvent('node', payload))
        .on('broadcast', { event: 'accord.chat.posted' },      payload => _onRemoteEvent('chat', payload))
        .on('broadcast', { event: 'accord.agenda.changed' },   payload => _onRemoteEvent('agenda', payload))
        .subscribe(status => {
          const lc = $('liveConnectBtn');
          if (status === 'SUBSCRIBED') {
            lc?.classList.add('connected');
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            lc?.classList.remove('connected');
          }
        });
    } catch (e) {
      console.warn('[Accord] meeting channel subscribe failed', e);
    }
  }

  function _onRemoteEvent(kind, env) {
    const data = env?.payload || env;
    // Drop events from this very session (defensive; broadcast.self=false should already filter)
    if (data?.source_session && state.me && data.source_session === state.me.id) return;
    // Re-emit on window so accord-capture.js handles per-kind UI updates
    window.dispatchEvent(new CustomEvent('accord:remote-' + kind, { detail: data }));
  }

  // Public broadcast helper — used by accord-capture.js after a commit lands
  function broadcast(event, payload) {
    if (!state.channel) return Promise.resolve(false);
    const env = {
      protocol_version: 1,
      event_id:         (window.crypto?.randomUUID?.() || ('id-' + Date.now())),
      event_type:       event,
      source_product:   'projecthud',
      source_session:   state.me?.id || 'system',
      ts:               Date.now(),
      firm_id:          state.me?.firm_id || null,
      payload,
    };
    return state.channel.send({ type: 'broadcast', event, payload: env });
  }

  // ── Aegis presence integration ──────────────────────────────
  // Subscribe to the Aegis hud:{firm_id} session map. Render the local
  // sessions list as attendees + presence dots.
  function _wirePresence() {
    function renderAttendees() {
      const el = $('attendeesList');
      if (!el) return;
      const sessions = (window.CMDCenter && window.CMDCenter.sessions && window.CMDCenter.sessions()) || {};
      const rows = [];
      const myId = state.me?.id;
      Object.keys(sessions).forEach(uid => {
        const s = sessions[uid] || {};
        const isMe = uid === myId;
        const status = s.online === false ? 'offline' : (s.unstable ? 'unstable' : 'present');
        const dotCls = status === 'present' ? 'present' : (status === 'unstable' ? 'unstable' : '');
        rows.push(`
          <div class="attendee-row">
            <span class="presence-dot ${dotCls}"></span>
            <span class="attendee-name">${_esc(s.name || 'Unknown')}</span>
            ${isMe ? '<span class="attendee-self">you</span>' : ''}
          </div>`);
      });
      el.innerHTML = rows.join('') ||
        '<div class="attendee-row" style="color:var(--ink-faint);font-size:11px">No other sessions detected.</div>';
    }
    // Initial
    renderAttendees();
    // Re-render on Aegis events
    if (window.CMDCenter && typeof window.CMDCenter.onAppEvent === 'function') {
      window.CMDCenter.onAppEvent(() => renderAttendees());
    }
    // Cheap polling fallback (every 4s) in case onAppEvent doesn't fire on session change
    setInterval(renderAttendees, 4000);
  }

  function _esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ── Toast / modals ──────────────────────────────────────────
  function _showToast() {
    const t = $('pdfToast');
    if (!t) return;
    t.classList.add('visible');
  }
  function _wireToast() {
    $('toastClose')?.addEventListener('click', () => $('pdfToast')?.classList.remove('visible'));
  }

  function _wireNewMeetingModal() {
    const modal  = $('newMeetingModal');
    const open   = () => { $('nmTitle').value = ''; $('nmThreadTitle').value = ''; modal.classList.add('visible'); $('nmTitle').focus(); };
    const close  = () => modal.classList.remove('visible');
    $('newMeetingBtn').addEventListener('click', open);
    $('nmCancel').addEventListener('click', close);
    $('nmCreate').addEventListener('click', async () => {
      const title  = $('nmTitle').value.trim();
      const thread = $('nmThreadTitle').value.trim();
      if (!title) { $('nmTitle').focus(); return; }
      close();
      await createMeeting(title, thread || title);
    });
  }

  function _wireEndMeetingModal() {
    const modal = $('endMeetingModal');
    const close = () => modal.classList.remove('visible');
    $('emCancel').addEventListener('click', close);
    $('emConfirm').addEventListener('click', async () => {
      close();
      await endMeeting();
    });
  }

  function _wireToggle() {
    $('meetingToggleBtn').addEventListener('click', () => {
      const m = state.meeting;
      if (!m) return;
      if (m.state === 'idle')   return startMeeting();
      if (m.state === 'running') return $('endMeetingModal').classList.add('visible');
    });
  }

  function _wireLiveConnect() {
    $('liveConnectBtn').addEventListener('click', async () => {
      if (!state.meeting) return;
      if (state.channel) {
        try { await state.channel.unsubscribe(); } catch (e) {}
        state.channel = null;
        $('liveConnectBtn').classList.remove('connected');
      } else {
        await _subscribeMeetingChannel(state.meeting.meeting_id);
      }
    });
  }

  // ── Init ────────────────────────────────────────────────────
  async function _init() {
    _wireTopNav();
    _wireToggle();
    _wireNewMeetingModal();
    _wireEndMeetingModal();
    _wireToast();
    _wireLiveConnect();
    _wirePresence();

    await _resolveMe();

    // If URL has ?meeting=<id>, load it; otherwise show empty state.
    const params = new URLSearchParams(window.location.search);
    const meetingId = params.get('meeting');
    const validUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (meetingId && validUuid.test(meetingId)) {
      await loadMeeting(meetingId);
    } else if (meetingId) {
      // Stale ?meeting=undefined or similar — clear it from the URL silently.
      const url = new URL(window.location);
      url.searchParams.delete('meeting');
      window.history.replaceState(null, '', url);
    }

    console.log('[Accord] core ready · ' + (window._PROJECTHUD_VERSION || 'no-version'));
  }

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  return {
    state,
    switchSurface,
    loadMeeting,
    createMeeting,
    startMeeting,
    endMeeting,
    broadcast,
    _esc,
  };
})();

window.Accord = Accord;