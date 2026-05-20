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

    // CMD-ACCORD-CONSTELLATION-ENTRY-1 Phase 3 + 5:
    // Three-pane navigation level state. Phase 5 closure removed
    // viewMode (legacy toggle gone) — only `level` + `levelContext`
    // remain.
    level:         'constellation',  // 'constellation' | 'workstream' | 'meeting'
    levelContext:  {},               // { workstreamId?, meetingId? }
  };

  // ── Persistence helpers (cross-module convention from Compass) ────
  // sessionStorage + localStorage two-tier: session takes precedence
  // for tab-scoped continuity, localStorage is the long-term fallback.
  function _persistRead(key, fallback) {
    try {
      const s = sessionStorage.getItem(key);
      if (s !== null) return s;
      const l = localStorage.getItem(key);
      if (l !== null) return l;
    } catch (e) { /* private mode / quota — ignore */ }
    return fallback;
  }
  function _persistWrite(key, value) {
    try { sessionStorage.setItem(key, value); } catch (e) {}
    try { localStorage.setItem(key, value); } catch (e) {}
  }

  // Hydrate persisted state at module-load (synchronous; values exist
  // before _init() runs)
  state.level     = _persistRead('accord-level', 'constellation');
  try {
    const ctxRaw = _persistRead('accord-level-context', '{}');
    state.levelContext = JSON.parse(ctxRaw || '{}');
  } catch (e) { state.levelContext = {}; }

  // ── A-12 attendee panel state ────────────────────────────────────
  // CMD-ACCORD-CAPTURE-ATTENDEES-1: attendees panel reads invited
  // attendees from accord_meeting_attendees (resource_id keyed) and
  // overlays presence from CMDCenter sessions (user_id keyed). The
  // resource map bridges that join — populated once at firm load.
  // Rows with null user_id (seeded/external resources) are excluded
  // from the map; they correctly render gray presence dots since they
  // can never match a logged-in session.
  var _resourceMapByUserId  = {};   // { user_id: resource_id }
  var _attendeeList         = [];   // resolved attendees for current meeting
  var _attendeeRefreshTimer = null;
  // X-26: meeting-channel presence layer. Keyed by resource_id → last-seen
  // timestamp (ms). Entries expire after 70s (2 missed 30s heartbeats + buffer).
  // Supplements CMDCenter sessions for cross-firm attendees whose heartbeats
  // arrive on a different firm channel and are invisible to the organizer's map.
  var _meetingPresenceMap    = {};  // { resource_id: timestamp }
  var _presenceHeartbeatTimer = null;
  var _PRESENCE_INTERVAL_MS   = 30000;
  var _PRESENCE_EXPIRE_MS     = 70000;

  // ── Level setters (consumed by accord-rails.js) ──────────────────
  function setLevel(nextLevel, ctx) {
    if (nextLevel !== 'constellation' && nextLevel !== 'workstream' && nextLevel !== 'meeting') return;
    state.level        = nextLevel;
    state.levelContext = ctx || {};
    _persistWrite('accord-level', state.level);
    _persistWrite('accord-level-context', JSON.stringify(state.levelContext));

    // X-16: update URL to reflect current meeting.
    // This enables hard refresh, bookmarking, and multi-user session sync.
    // replaceState (not pushState) avoids polluting browser history on every level change.
    if (nextLevel === 'meeting' && ctx && ctx.meetingId) {
      var newUrl = location.pathname + '?meeting=' + ctx.meetingId;
      history.replaceState({ level: nextLevel, meetingId: ctx.meetingId }, '', newUrl);
    } else if (nextLevel === 'constellation' || nextLevel === 'workstream') {
      // Clear meeting param when ascending so URL stays clean at every level.
      history.replaceState({ level: nextLevel }, '', location.pathname);
    }

    window.dispatchEvent(new CustomEvent('accord:level-changed', {
      detail: { level: state.level, context: state.levelContext },
    }));
  }
  function ascendLevel() {
    if (state.level === 'meeting') {
      const ws = state.levelContext.workstreamId;
      setLevel('workstream', ws ? { workstreamId: ws } : {});
    } else if (state.level === 'workstream') {
      setLevel('constellation', {});
    }
    // 'constellation' is top — ESC at top is a no-op
  }

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

      // A-12: resolve resource_id for the current user. accord_meeting_attendees
      // joins on resource_id (resources.id), not user_id. state.me.resource_id
      // is used downstream for the "you" label and any future resource-keyed
      // identity check. Failure non-fatal — falls through with no resource_id.
      const rRows = await API.get(
        'resources?user_id=eq.' + sub + '&select=id&limit=1'
      ).catch(() => []);
      if (rRows && rRows[0]) state.me.resource_id = rRows[0].id;

      window.CURRENT_USER = state.me;

      // X-27: populate topnav identity chip so the logged-in user is
      // always visible. Prevents session confusion in multi-user testing.
      (function _paintIdentityChip(me) {
        var chip   = document.getElementById('acIdentityChip');
        var avatar = document.getElementById('acIdentityAvatar');
        var label  = document.getElementById('acIdentityName');
        if (!chip || !avatar || !label) return;
        var name    = (me && me.name) || 'You';
        var parts   = name.trim().split(/\s+/);
        var initials = parts.length >= 2
          ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
          : name.slice(0, 2).toUpperCase();
        avatar.textContent   = initials;
        label.textContent    = name;
        chip.style.display   = 'flex';
      }(state.me));

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
      // CMD-ACCORD-NEWMEETING-ROUTING-FIX-1: route through setLevel so
      // accord-transitions.js fires, tears down any active surface, and
      // mounts the new meeting's Setup shell cleanly.
      // Top-level new-meeting is always parking-lot (no workstream).
      setLevel('meeting', { meetingId: meeting.meeting_id, workstreamId: null });
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
      // X-13: dispatch level-changed so accord-rails re-routes to running shell
      window.dispatchEvent(new CustomEvent('accord:level-changed', {
        detail: {
          level:   state.level,
          context: state.levelContext
        }
      }));
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

      // CMD-A7: real PDF render trigger replaces CMD-A3's 6-second mock.
      // The Minutes Edge Function runs async and broadcasts
      // accord.minutes.rendered (or .render_failed) on the meeting channel
      // when complete. Toast subscriber (wired below) shows the result.
      _onMeetingEndSealed(state.meeting.meeting_id);

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
      // cap-title removed from capture-header (now in ac-view-header).
      if ($('cap-organizer')) $('cap-organizer').style.display = 'none';
      if ($('cap-meta-text')) $('cap-meta-text').textContent = '';
      if ($('cap-pulse')) $('cap-pulse').classList.remove('running');
      $('meetingToggleBtn').disabled = true;
      $('meetingToggleBtn').textContent = 'Start meeting →';
      return;
    }

    // cap-title lives in ac-view-header; ac-view-title set by renderMeetingView.
    // Remaining elements (organizer, meta, pulse) now rendered inside ac-view-header;
    // null-guard since they only exist after renderMeetingView has run.
    var capOrg = $('cap-organizer');
    var capOrgName = $('cap-organizer-name');
    var capMetaText = $('cap-meta-text');
    var pulse = $('cap-pulse');
    if (capOrg) {
      if (state.organizerName) {
        capOrg.style.display = '';
        if (capOrgName) capOrgName.textContent = state.organizerName;
      } else {
        capOrg.style.display = 'none';
      }
    }
    if (capMetaText) {
      const meta = [];
      if (m.scheduled_for) meta.push(new Date(m.scheduled_for).toLocaleString());
      meta.push('state: ' + m.state);
      capMetaText.textContent = meta.join(' · ');
    }
    if (pulse) {
      if (m.state === 'running') pulse.classList.add('running');
      else pulse.classList.remove('running');
    }

    const toggle = $('meetingToggleBtn');
    if (!toggle) return; // controls bar not yet relocated into view header
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
    if (!el) return; // controls bar not yet relocated into view header
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
    // Null-guard: these elements live inside #ac-meeting-surface-host which
    // may be parked at body (not yet mounted in tab body) when loadMeeting
    // fires from the Setup shell idle branch.
    if ($('captureInput'))  $('captureInput').disabled  = !enabled;
    document.querySelectorAll('.tag-btn').forEach(b => b.disabled = !enabled);
    if ($('chatInput'))     $('chatInput').disabled     = !enabled;
    if ($('chatSendBtn'))   $('chatSendBtn').disabled   = !enabled;
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
        _stopPresenceHeartbeat(); // X-26: clear heartbeat before unsubscribing
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
        // X-26: meeting-channel presence. Receive heartbeats from ALL
        // participants (including cross-firm) and update _meetingPresenceMap.
        .on('broadcast', { event: 'accord.presence.heartbeat' }, function(env) {
          var rid = env && env.payload && env.payload.resource_id;
          if (rid) {
            _meetingPresenceMap[rid] = Date.now();
            _renderAttendees(_attendeeList);
          }
        });
      // CMD-A7: relay minutes-render broadcasts to the toast surface.
      _wireMinutesEventsForChannel(state.channel);
      state.channel
        .subscribe(status => {
          const lc = $('liveConnectBtn');
          if (status === 'SUBSCRIBED') {
            lc?.classList.add('connected');
            // X-26: start broadcasting presence on the meeting channel.
            // Fires immediately so other participants see us at once,
            // then repeats every 30s. self:false means we don't receive
            // our own heartbeats — _meetingPresenceMap won't contain our
            // own resource_id, but _buildPresenceMap also checks CMDCenter
            // sessions (same-firm) and the attendee list re-render marks
            // the current user's dot via isMe logic, not presence.
            _startPresenceHeartbeat();
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            lc?.classList.remove('connected');
            _stopPresenceHeartbeat();
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

  // ── A-12 attendees panel ────────────────────────────────────
  // CMD-ACCORD-CAPTURE-ATTENDEES-1: replaces former Aegis-session
  // attendee source. Panel now reads invited attendees from
  // accord_meeting_attendees for the current meeting, overlays
  // presence dots derived from CMDCenter sessions via the firm
  // resource map.
  //
  // Lifecycle:
  //  - Firm resource map: fetched once at init (after _resolveMe)
  //  - Attendee list: loaded on accord:meeting-loaded; cleared on
  //    accord:level-changed when leaving meeting level
  //  - Presence re-render: CMDCenter.onAppEvent + 30s polling
  //    (running meetings only)
  function _loadFirmResourceMap() {
    if (!state.me || !state.me.firm_id) return;
    API.get('resources?firm_id=eq.' + state.me.firm_id + '&select=id,user_id')
      .then(function(rows) {
        (rows || []).forEach(function(r) {
          if (r.user_id) _resourceMapByUserId[r.user_id] = r.id;
        });
        // Re-render in case attendees loaded before the map was ready
        _renderAttendees(_attendeeList);
      })
      .catch(function(e) {
        console.warn('[Accord] firm resource map load failed', e);
      });
  }

  function _loadAttendees(meetingId) {
    if (!meetingId) return;
    API.get(
      'accord_meeting_attendees?meeting_id=eq.' + meetingId +
      '&select=attendee_id,resource_id,role_in_meeting,rsvp_status'
    ).then(function(rows) {
      rows = rows || [];
      if (!rows.length) {
        _attendeeList = [];
        _renderAttendees([]);
        return;
      }
      // Resolve display names by resource_id
      var resourceIds = rows.map(function(r) { return r.resource_id; });
      // Resolve display names AND user_ids by resource_id.
      // X-26: include user_id in the select so cross-firm attendees
      // get added to _resourceMapByUserId. _loadFirmResourceMap only
      // covers Vaughn's firm — without this, Ron's user_id is never
      // mapped and _buildPresenceMap can never mark him present.
      API.get(
        'resources?id=in.(' + resourceIds.join(',') + ')&select=id,name,user_id'
      ).then(function(resources) {
        var nameMap = {};
        (resources || []).forEach(function(r) {
          nameMap[r.id] = r.name;
          // Populate cross-firm entries the firm map fetch missed
          if (r.user_id && !_resourceMapByUserId[r.user_id]) {
            _resourceMapByUserId[r.user_id] = r.id;
          }
        });
        _attendeeList = rows.map(function(a) {
          return {
            attendee_id: a.attendee_id,
            resource_id: a.resource_id,
            name:        nameMap[a.resource_id] || 'Unknown',
            role:        a.role_in_meeting,
            rsvp:        a.rsvp_status,
          };
        });
        _renderAttendees(_attendeeList);
      });
    }).catch(function(e) {
      console.error('[Accord] attendees load failed', e);
    });
  }

  // X-26: meeting-channel presence heartbeat ──────────────────
  // Broadcasts resource_id on the meeting channel so all participants
  // (including cross-firm) can track each other's presence without
  // relying on the firm-scoped CMDCenter session map.
  function _sendPresenceHeartbeat() {
    if (!state.channel || !state.me) return;
    state.channel.send({
      type:    'broadcast',
      event:   'accord.presence.heartbeat',
      payload: { resource_id: state.me.resource_id }
    }).catch(function() { /* non-fatal */ });
  }

  function _startPresenceHeartbeat() {
    _stopPresenceHeartbeat();
    _sendPresenceHeartbeat(); // immediate on subscribe
    _presenceHeartbeatTimer = setInterval(function() {
      _sendPresenceHeartbeat();
      // Expire stale entries (participant closed tab without unsubscribing)
      var cutoff = Date.now() - _PRESENCE_EXPIRE_MS;
      var changed = false;
      Object.keys(_meetingPresenceMap).forEach(function(rid) {
        if (_meetingPresenceMap[rid] < cutoff) {
          delete _meetingPresenceMap[rid];
          changed = true;
        }
      });
      if (changed) _renderAttendees(_attendeeList);
    }, _PRESENCE_INTERVAL_MS);
  }

  function _stopPresenceHeartbeat() {
    if (_presenceHeartbeatTimer) {
      clearInterval(_presenceHeartbeatTimer);
      _presenceHeartbeatTimer = null;
    }
    _meetingPresenceMap = {};
  }

  // Build a { resource_id: true } map of currently-online attendees by
  // walking the live CMDCenter session map and translating each
  // user_id key through _resourceMapByUserId. Sessions with no resource
  // mapping (anon users, edge cases) are silently skipped — they'll
  // never match any invited attendee row.
  function _buildPresenceMap() {
    var presence = {};
    // Same-firm: CMDCenter session map (user_id → resource_id via _resourceMapByUserId)
    var sessions = (window.CMDCenter && window.CMDCenter.sessions && window.CMDCenter.sessions()) || {};
    Object.keys(sessions).forEach(function(uid) {
      var s = sessions[uid] || {};
      if (s.online === false) return;
      var resourceId = _resourceMapByUserId[uid];
      if (resourceId) presence[resourceId] = true;
    });
    // X-26: cross-firm: meeting-channel heartbeat map (resource_id direct).
    // Merges on top — if both maps agree the person is present, no conflict.
    Object.keys(_meetingPresenceMap).forEach(function(rid) {
      presence[rid] = true;
    });
    return presence;
  }

  function _renderAttendees(attendees) {
    var list = $('attendeesList');
    if (!list) return;

    // Bail at constellation/workstream — panel renders empty
    if (!state.meeting || !state.meeting.meeting_id) {
      list.innerHTML = '';
      return;
    }

    var presence     = _buildPresenceMap();
    var myResourceId = (state.me && state.me.resource_id) || null;

    if (!attendees || !attendees.length) {
      list.innerHTML = '<div class="ac-attendees-empty">No attendees added yet.</div>';
      return;
    }

    // Sort: organizer first, then by name
    var sorted = attendees.slice().sort(function(a, b) {
      if (a.role === 'organizer' && b.role !== 'organizer') return -1;
      if (b.role === 'organizer' && a.role !== 'organizer') return 1;
      return (a.name || '').localeCompare(b.name || '');
    });

    var html = sorted.map(function(a) {
      var isPresent = !!presence[a.resource_id];
      var isMe      = a.resource_id === myResourceId;
      // X-25: LIVE-shell class names (presence-dot / attendee-row /
      // attendee-name / attendee-self). ac-* names were IDLE-shell
      // identifiers with no rules in the running-meeting surface.
      var dotCls = isPresent ? 'presence-dot present' : 'presence-dot';
      return '<div class="attendee-row" data-resource-id="' + _esc(a.resource_id) + '">' +
               '<span class="' + dotCls + '"></span>' +
               '<span class="attendee-name">' + _esc(a.name) + '</span>' +
               (a.role === 'organizer'
                 ? '<span class="attendee-self">organizer</span>'
                 : '') +
               (isMe ? '<span class="attendee-self">you</span>' : '') +
             '</div>';
    }).join('');

    list.innerHTML = html;
  }

  function _startAttendeeRefresh(meetingId) {
    _stopAttendeeRefresh();
    if (!state.meeting || state.meeting.state !== 'running') return;
    _attendeeRefreshTimer = setInterval(function() {
      _renderAttendees(_attendeeList);
    }, 30000);
  }

  function _stopAttendeeRefresh() {
    if (_attendeeRefreshTimer) {
      clearInterval(_attendeeRefreshTimer);
      _attendeeRefreshTimer = null;
    }
  }

  // Wire subscriptions only. DB calls (firm resource map) deferred to
  // _init after _resolveMe resolves state.me.firm_id.
  function _wirePresence() {
    // Live presence dot updates — fires whenever Aegis sessions change.
    if (window.CMDCenter && typeof window.CMDCenter.onAppEvent === 'function') {
      window.CMDCenter.onAppEvent(function() { _renderAttendees(_attendeeList); });
    }

    // Load attendees on meeting load
    window.addEventListener('accord:meeting-loaded', function(ev) {
      var meetingId = ev && ev.detail && ev.detail.meeting && ev.detail.meeting.meeting_id;
      if (!meetingId) return;
      _loadAttendees(meetingId);
      _startAttendeeRefresh(meetingId);
    });

    // Clear when leaving meeting level
    window.addEventListener('accord:level-changed', function(ev) {
      var level = ev && ev.detail && ev.detail.level;
      if (level !== 'meeting') {
        _attendeeList = [];
        _stopAttendeeRefresh();
        _renderAttendees([]);
      }
    });

    // Initial render — will bail (no meeting) or empty-render
    _renderAttendees(_attendeeList);
  }

  function _esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ── Toast / modals ──────────────────────────────────────────
  // CMD-A7: toast supports kind ('success'|'error') and optional download URL.
  // The pdfToast element from CMD-A3 is preserved; only the JS API changes.
  function _showToast(opts) {
    opts = opts || {};
    const t = $('pdfToast');
    if (!t) return;
    const msgEl = t.querySelector('.toast-msg');
    const dlEl  = $('toastDownload');
    const kind  = opts.kind || 'success';
    if (msgEl) {
      const msg = _esc(opts.message || 'Minutes record published.');
      msgEl.innerHTML = '<strong>' + msg + '</strong>';
    }
    if (dlEl) {
      if (opts.downloadUrl) {
        dlEl.href = opts.downloadUrl;
        dlEl.style.display = '';
      } else {
        dlEl.removeAttribute('href');
        dlEl.style.display = 'none';
      }
    }
    t.classList.toggle('error', kind === 'error');
    t.classList.add('visible');
  }
  function _wireToast() {
    $('toastClose')?.addEventListener('click', () => $('pdfToast')?.classList.remove('visible'));
  }

  // ── CMD-A7: render trigger + event subscription ─────────────
  // After meeting END seals, fire the render-minutes Edge Function
  // asynchronously. The function broadcasts accord.minutes.rendered
  // (or .render_failed) on the meeting channel; the subscription
  // installed below in _subscribeMeetingChannel relays to the toast.
  async function _onMeetingEndSealed(meetingId) {
    if (!meetingId) return;
    try {
      // Fire-and-forget; the toast renders on the broadcast event,
      // not on this Promise's resolution. We still await to surface
      // immediate trigger errors (network, auth) for fail-fast UX.
      await API.invokeEdgeFunction('render-minutes', { meeting_id: meetingId });
    } catch (e) {
      console.error('[Accord] render-minutes invoke failed', e);
      _showToast({
        kind:    'error',
        message: 'Minutes render failed to start. Retry from the Minutes tab.',
      });
    }
  }

  // Hook for the meeting-channel subscription to relay broadcast
  // events to the toast. Called from _subscribeMeetingChannel below.
  function _wireMinutesEventsForChannel(ch) {
    if (!ch || typeof ch.on !== 'function') return;
    ch.on('broadcast', { event: 'accord.minutes.rendered' }, (payload) => {
      const p = payload?.payload || payload || {};
      _showToast({
        kind:        'success',
        message:     'Minutes record published.',
        downloadUrl: p.download_url || null,
      });
    });
    ch.on('broadcast', { event: 'accord.minutes.render_failed' }, (payload) => {
      const p = payload?.payload || payload || {};
      _showToast({
        kind:    'error',
        message: 'Render failed' + (p.reason ? ': ' + p.reason : '.'),
      });
    });
  }

  function _wireNewMeetingModal() {
    // F-LIVE-1: #newMeetingBtn removed from live capture surface.
    // Guard prevents throw if button is absent.
    if (!$('newMeetingBtn')) return;
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
    // CMD-ACCORD-MEETING-CENTER-1: liveConnectBtn removed from accord.html.
    // Guard prevents TypeError on surfaces where the element is absent.
    const lcBtn = $('liveConnectBtn');
    if (!lcBtn) return;
    lcBtn.addEventListener('click', async () => {
      if (!state.meeting) return;
      if (state.channel) {
        try { await state.channel.unsubscribe(); } catch (e) {}
        state.channel = null;
        lcBtn.classList.remove('connected');
      } else {
        await _subscribeMeetingChannel(state.meeting.meeting_id);
      }
    });
  }

  // ── Init ────────────────────────────────────────────────────
  async function _init() {
    // X-16: if URL contains ?meeting=<id>, honour it over persisted level.
    // Module-load hydration (lines 61–65) has already populated state.level
    // from localStorage; URL is the higher authority and overrides it here
    // before any consumer reads state.level. This keeps level state in sync
    // with the URL deep-link handler further down in _init.
    var _urlMtgId = new URLSearchParams(location.search).get('meeting');
    if (_urlMtgId) {
      state.level        = 'meeting';
      state.levelContext = { meetingId: _urlMtgId };
      _persistWrite('accord-level', 'meeting');
      _persistWrite('accord-level-context', JSON.stringify({ meetingId: _urlMtgId }));
    }

    _wireTopNav();
    _wireToggle();
    _wireNewMeetingModal();
    _wireEndMeetingModal();
    _wireToast();
    _wireLiveConnect();
    _wirePresence();

    await _resolveMe();

    // A-12: kick off the firm resource map fetch now that state.me.firm_id
    // is populated. Fire-and-forget — the map populates in parallel with
    // loadMeeting below. Worst case: first attendees render shows gray
    // presence dots; .then() callback re-renders once map is ready.
    _loadFirmResourceMap();

    // If URL has ?meeting=<id>, load it; otherwise show empty state.
    const params = new URLSearchParams(window.location.search);
    const meetingId = params.get('meeting');
    const validUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (meetingId && validUuid.test(meetingId)) {
      await loadMeeting(meetingId);
      // X-16: dispatch accord:level-changed now that _resolveMe and
      // loadMeeting have completed. accord-transitions.js owns the surface
      // switch on this event; its own boot-time safety net fires too early
      // (before AccordViews is on the global), so accord-core re-fires
      // through setLevel here at a point where the environment is ready.
      // Idempotent: state.level, persisted level, and URL are already correct
      // from the §3.2 override at the top of _init and the §3.1 amendment.
      // Sole new effect is the event dispatch.
      setLevel('meeting', {
        meetingId:    meetingId,
        workstreamId: state.meeting && state.meeting.workstream_id,
      });
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

  // ── ESC ascend ─────────────────────────────────────────────────
  // Scoped: suppressed when an input/textarea is focused, any modal
  // is open, or a transition is in flight.
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    const t = ev.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (document.querySelector('.modal-backdrop.active, [class*="modal"][style*="block"]')) return;
    if (window.AccordTransitions?.isInFlight?.()) return;
    ascendLevel();
  });

  // Phase 5: data-view-mode attribute removed from chrome — no-op.
  // Removed: _applyViewModeAttr() from Phase 3.

  return {
    state,
    switchSurface,
    loadMeeting,
    createMeeting,
    startMeeting,
    endMeeting,
    broadcast,
    _esc,

    // CMD-ACCORD-CONSTELLATION-ENTRY-1 Phase 3 — level state surface
    setLevel,
    ascendLevel,
  };
})();

window.Accord = Accord;