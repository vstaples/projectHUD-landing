// ============================================================
// ProjectHUD — accord-my-meetings.js
// Version: v20260513-CMD-ACCORD-MY-MEETINGS-1
// Modified: 2026-05-13
//
// CMD-ACCORD-MY-MEETINGS-1 — personal meeting dashboard.
//
// Renders three zones in the center pane when MY MEETINGS is
// selected from the left rail:
//   • LIVE NOW   — running meetings (organizer or invited)
//   • PENDING    — invites awaiting RSVP (Accept/Decline inline)
//   • UPCOMING   — accepted meetings in next 14 days
//
// Entry point wired from accord-rails.js — clicking the rail item
// [data-action="open-my-meetings"] calls window.AccordMyMeetings.open().
//
// IR66 — CSS token values verified present in deployed :root before
//        deployment (--ac-bg-tile, --ac-text-faint, --ac-amber-dim
//        all confirmed via getComputedStyle probe 2026-05-13).
// IR67 — version + date stamped above.
// ============================================================

(function () {
  'use strict';

  var API = window.API;

  // ── Module-level state ─────────────────────────────────────
  var _myMeetingsActive     = false;
  var _myMeetingsTimer      = null;
  var _constellationHostRef = null;  // captured on _open for restore on _close
  var _panelClickHandler    = null;  // bound per-panel, so we can detach

  // ── HTML escape ────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Date helpers ───────────────────────────────────────────
  function _formatDateTime(iso) {
    if (!iso) return 'Date TBD';
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return 'Date TBD';
      return d.toLocaleString(undefined, {
        weekday: 'short',
        month:   'short',
        day:     'numeric',
        hour:    '2-digit',
        minute:  '2-digit'
      });
    } catch (e) {
      return 'Date TBD';
    }
  }

  // ── Open / close ───────────────────────────────────────────
  function _open() {
    // §13 — double-open guard
    if (_myMeetingsActive) return;
    _myMeetingsActive = true;

    // Hide the center-pane constellation
    var conHost = document.getElementById('ac-constellation-host');
    _constellationHostRef = conHost;
    if (conHost) conHost.style.display = 'none';

    // Mount panel as sibling of #ac-constellation-host so it inherits
    // the center pane's positioned context (position: absolute; inset: 0)
    var parent = conHost ? conHost.parentNode : document.body;

    var panel = document.getElementById('ac-my-meetings-view');
    if (!panel) {
      panel = document.createElement('div');
      panel.id        = 'ac-my-meetings-view';
      panel.className = 'ac-my-meetings-view';
      parent.appendChild(panel);
    } else {
      panel.style.display = '';
    }

    // Panel-scoped delegation — bound once per open, detached on close
    _panelClickHandler = _onPanelClick;
    panel.addEventListener('click', _panelClickHandler);

    // Mark rail nav item active
    var nav = document.getElementById('ac-my-meetings-nav');
    if (nav) nav.classList.add('active');

    _render();
    _startRefresh();
  }

  function _close() {
    _myMeetingsActive = false;
    _stopRefresh();

    var panel = document.getElementById('ac-my-meetings-view');
    if (panel) {
      if (_panelClickHandler) {
        panel.removeEventListener('click', _panelClickHandler);
        _panelClickHandler = null;
      }
      panel.remove();
    }

    if (_constellationHostRef) {
      _constellationHostRef.style.display = '';
      _constellationHostRef = null;
    }

    var nav = document.getElementById('ac-my-meetings-nav');
    if (nav) nav.classList.remove('active');
  }

  // ── Data fetch + render ────────────────────────────────────
  function _render() {
    var panel = document.getElementById('ac-my-meetings-view');
    if (!panel) return;

    panel.innerHTML = '<div class="ac-mm-loading">Loading your meetings…</div>';

    var me  = window.Accord && window.Accord.state && window.Accord.state.me;
    var uid = me && me.id;
    var rid = me && me.resource_id;

    if (!uid) {
      panel.innerHTML = '<div class="ac-mm-empty-zone">' +
                        'Sign in to see your meetings.</div>';
      return;
    }

    // Q1 — meetings I organize, running or idle
    var qOrganized = API.get(
      'accord_meetings?organizer_id=eq.' + uid +
      '&state=in.(running,idle)' +
      '&order=scheduled_for.asc.nullsfirst' +
      '&select=meeting_id,title,state,scheduled_for,duration_minutes,workstream_id' +
      '&limit=50'
    ).catch(function () { return []; });

    // Q2 — meetings I'm invited to (any rsvp status) — !inner excludes orphans
    var qInvites = rid
      ? API.get(
          'accord_meeting_attendees?resource_id=eq.' + rid +
          '&select=attendee_id,meeting_id,rsvp_status,' +
          'accord_meetings!inner(meeting_id,title,state,scheduled_for,' +
          'duration_minutes,workstream_id,organizer_id)'
        ).catch(function () { return []; })
      : Promise.resolve([]);

    Promise.all([qOrganized, qInvites]).then(function (results) {
      // Bail if user closed the panel mid-fetch
      if (!_myMeetingsActive) return;
      var panelNow = document.getElementById('ac-my-meetings-view');
      if (!panelNow) return;

      var organized = Array.isArray(results[0]) ? results[0] : [];
      var invites   = Array.isArray(results[1]) ? results[1] : [];

      // Dedupe — organizer entry wins if same meeting appears in both
      var meetingMap = {};

      organized.forEach(function (m) {
        meetingMap[m.meeting_id] = {
          meeting_id:       m.meeting_id,
          title:            m.title,
          state:            m.state,
          scheduled_for:    m.scheduled_for,
          duration_minutes: m.duration_minutes,
          workstream_id:    m.workstream_id,
          role:             'organizer',
          rsvp_status:      'accepted'
        };
      });

      invites.forEach(function (inv) {
        var m = inv.accord_meetings;
        if (!m) return;
        if (meetingMap[m.meeting_id]) return;  // organizer takes priority
        meetingMap[m.meeting_id] = {
          meeting_id:       m.meeting_id,
          title:            m.title,
          state:            m.state,
          scheduled_for:    m.scheduled_for,
          duration_minutes: m.duration_minutes,
          workstream_id:    m.workstream_id,
          role:             'attendee',
          rsvp_status:      inv.rsvp_status,
          attendee_id:      inv.attendee_id
        };
      });

      var meetings = [];
      Object.keys(meetingMap).forEach(function (k) {
        meetings.push(meetingMap[k]);
      });

      // ── Partition into zones ─────────────────────────────
      var now      = Date.now();
      var in14days = now + 14 * 24 * 60 * 60 * 1000;

      var liveNow = meetings.filter(function (m) {
        return m.state === 'running';
      });

      var pendingZ = meetings.filter(function (m) {
        // Pending zone = invites awaiting RSVP; organizer has no pending RSVP
        return m.state === 'idle' && m.rsvp_status === 'pending';
      });

      var upcoming = meetings.filter(function (m) {
        if (m.state !== 'idle') return false;
        if (m.rsvp_status === 'pending')  return false;
        if (m.rsvp_status === 'declined') return false;
        if (!m.scheduled_for) return false;        // null-guard (V3 surfaced this)
        var t = new Date(m.scheduled_for).getTime();
        if (isNaN(t)) return false;
        return t > now && t < in14days;
      }).sort(function (a, b) {
        return new Date(a.scheduled_for) - new Date(b.scheduled_for);
      });

      panelNow.innerHTML = _myMeetingsHtml(liveNow, pendingZ, upcoming);
    }).catch(function (e) {
      console.error('[MyMeetings] render failed:', e);
      var p = document.getElementById('ac-my-meetings-view');
      if (p) {
        p.innerHTML = '<div class="ac-mm-empty-zone">' +
                      'Could not load meetings. Try refreshing.</div>';
      }
    });
  }

  // ── HTML render ────────────────────────────────────────────
  function _myMeetingsHtml(liveNow, pendingZ, upcoming) {
    var html = '';

    // ── Header ───────────────────────────────────────────────
    html += '<div class="ac-mm-header">';
    html += '<span class="ac-mm-title">MY MEETINGS</span>';
    html += '<button type="button" class="ac-mm-back" ' +
            'data-action="close-my-meetings">← Back</button>';
    html += '</div>';

    // ── LIVE NOW ─────────────────────────────────────────────
    html += '<div class="ac-mm-zone">';
    html += '<div class="ac-mm-zone-label">● LIVE NOW</div>';

    if (liveNow.length) {
      liveNow.forEach(function (m) {
        html += '<div class="ac-mm-card ac-mm-card--live">';
        html += '<div class="ac-mm-card-title">' +
                esc(m.title || 'Untitled meeting') + '</div>';
        html += '<div class="ac-mm-card-meta">' +
                (m.role === 'organizer' ? 'Organizer' : 'Invited') +
                '</div>';
        html += '<a class="ac-mm-join-btn" ' +
                'data-action="mm-join" ' +
                'data-meeting-id="' + esc(m.meeting_id) + '" ' +
                'href="accord.html?meeting=' + esc(m.meeting_id) + '">' +
                'JOIN →</a>';
        html += '</div>';
      });
    } else {
      html += '<div class="ac-mm-empty-zone">No meetings in progress.</div>';
    }
    html += '</div>';

    // ── PENDING YOUR RESPONSE ────────────────────────────────
    if (pendingZ.length) {
      html += '<div class="ac-mm-zone">';
      html += '<div class="ac-mm-zone-label">PENDING YOUR RESPONSE ' +
              '<span class="ac-mm-badge">' + pendingZ.length + '</span>' +
              '</div>';

      pendingZ.forEach(function (m) {
        html += '<div class="ac-mm-card ac-mm-card--pending">';
        html += '<div class="ac-mm-card-title">' +
                esc(m.title || 'Untitled meeting') + '</div>';
        html += '<div class="ac-mm-card-meta">' +
                esc(_formatDateTime(m.scheduled_for)) + '</div>';
        html += '<div class="ac-mm-rsvp-row">';
        html += '<button type="button" ' +
                'class="ac-mm-rsvp-btn ac-mm-rsvp-accept" ' +
                'data-action="mm-rsvp-accept" ' +
                'data-attendee-id="' + esc(m.attendee_id || '') + '">' +
                '✓ Accept</button>';
        html += '<button type="button" ' +
                'class="ac-mm-rsvp-btn ac-mm-rsvp-decline" ' +
                'data-action="mm-rsvp-decline" ' +
                'data-attendee-id="' + esc(m.attendee_id || '') + '">' +
                '✕ Decline</button>';
        html += '</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    // ── UPCOMING ─────────────────────────────────────────────
    html += '<div class="ac-mm-zone">';
    html += '<div class="ac-mm-zone-label">UPCOMING — NEXT 14 DAYS</div>';

    if (upcoming.length) {
      upcoming.forEach(function (m) {
        var durStr = m.duration_minutes ? ' · ' + m.duration_minutes + ' min' : '';
        html += '<div class="ac-mm-card ac-mm-card--upcoming" ' +
                'data-action="mm-open-meeting" ' +
                'data-meeting-id="' + esc(m.meeting_id) + '" ' +
                'data-workstream-id="' + esc(m.workstream_id || '') + '">';
        html += '<div class="ac-mm-card-title">' +
                esc(m.title || 'Untitled meeting') + '</div>';
        html += '<div class="ac-mm-card-meta">' +
                esc(_formatDateTime(m.scheduled_for) + durStr) + '</div>';
        html += '<div class="ac-mm-card-role">' +
                (m.role === 'organizer' ? 'Organizer' : 'Invited') +
                '</div>';
        html += '</div>';
      });
    } else {
      html += '<div class="ac-mm-empty-zone">' +
              'No upcoming meetings in the next 14 days.</div>';
    }
    html += '</div>';

    return html;
  }

  // ── Event delegation (panel-scoped) ────────────────────────
  function _onPanelClick(ev) {
    // Allow modifier-clicks (middle-click, cmd-click) on links to use
    // native browser semantics — open in new tab.
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button === 1) return;

    var actionEl = ev.target.closest('[data-action]');
    if (!actionEl) return;
    var action = actionEl.dataset.action;

    if (action === 'close-my-meetings') {
      ev.preventDefault();
      _close();
      return;
    }

    if (action === 'mm-join') {
      // <a href> works natively; intercept only to use in-SPA navigation
      var mtgIdJoin = actionEl.dataset.meetingId;
      if (mtgIdJoin && window.Accord && typeof window.Accord.setLevel === 'function') {
        ev.preventDefault();
        _close();
        window.Accord.setLevel('meeting', { meetingId: mtgIdJoin, workstreamId: null });
      }
      // else: let the <a> navigate normally
      return;
    }

    if (action === 'mm-open-meeting') {
      ev.preventDefault();
      var mtgId = actionEl.dataset.meetingId;
      var wsId  = actionEl.dataset.workstreamId || null;
      if (!mtgId) return;
      if (window.Accord && typeof window.Accord.setLevel === 'function') {
        _close();
        window.Accord.setLevel('meeting', { meetingId: mtgId, workstreamId: wsId });
      } else {
        location.href = 'accord.html?meeting=' + mtgId;
      }
      return;
    }

    if (action === 'mm-rsvp-accept' || action === 'mm-rsvp-decline') {
      ev.preventDefault();
      _rsvp(actionEl, action === 'mm-rsvp-accept' ? 'accepted' : 'declined');
      return;
    }
  }

  function _rsvp(btn, outcome) {
    var attendeeId = btn.dataset.attendeeId;
    if (!attendeeId) {
      console.warn('[MyMeetings] RSVP click missing attendee-id');
      return;
    }

    // Disable both buttons in the row optimistically
    btn.disabled = true;
    var row = btn.closest('.ac-mm-rsvp-row');
    var siblings = row ? row.querySelectorAll('button') : null;
    if (siblings) {
      siblings.forEach(function (b) { b.disabled = true; });
    }

    API.patch(
      'accord_meeting_attendees?attendee_id=eq.' + attendeeId,
      { rsvp_status: outcome }
    ).then(function () {
      // Re-fetch and re-render — the accepted card moves to UPCOMING,
      // declined card disappears entirely.
      _render();
    }).catch(function (e) {
      console.error('[MyMeetings] RSVP failed:', e);
      btn.disabled = false;
      if (siblings) {
        siblings.forEach(function (b) { b.disabled = false; });
      }
    });
  }

  // ── Refresh timer ──────────────────────────────────────────
  function _startRefresh() {
    _stopRefresh();
    _myMeetingsTimer = setInterval(function () {
      if (_myMeetingsActive) _render();
    }, 30000);
  }

  function _stopRefresh() {
    if (_myMeetingsTimer) {
      clearInterval(_myMeetingsTimer);
      _myMeetingsTimer = null;
    }
  }

  // ── Expose ─────────────────────────────────────────────────
  window.AccordMyMeetings = {
    open:    _open,
    close:   _close,
    refresh: _render
  };
})();