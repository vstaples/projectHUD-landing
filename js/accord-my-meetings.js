// ============================================================
// ProjectHUD — accord-my-meetings.js
// Version: v20260513-CMD-ACCORD-MY-MEETINGS-2
// Modified: 2026-05-13
//
// CMD-ACCORD-MY-MEETINGS-2 — tabbed rail pattern.
// Renders LIVE NOW / PENDING / UPCOMING directly in the left rail
// MY MEETINGS tab panel. No full-page overlay.
//
// Public API:
//   window.AccordMyMeetings.renderInRail(container)
//   window.AccordMyMeetings.pauseRefresh()
//   window.AccordMyMeetings.refresh()
//
// IR66 — tokens verified in deployed :root (2026-05-13).
// IR67 — version + date stamped above.
// ============================================================

(function () {
  'use strict';

  var API = window.API;

  var _mmContainer  = null;
  var _mmTimer      = null;
  var _clickHandler = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  window.AccordMyMeetings = {
    renderInRail: _renderInRail,
    pauseRefresh: _pauseRefresh,
    refresh:      _fetchAndRender,
  };

  function _renderInRail(container) {
    if (!container) return;
    if (_mmContainer && _clickHandler) {
      _mmContainer.removeEventListener('click', _clickHandler);
      _clickHandler = null;
    }
    _mmContainer = container;
    container.innerHTML = '<div class="ac-mm-loading">Loading...</div>';
    _fetchAndRender();
    _startRefresh();
  }

  function _startRefresh() {
    _stopRefresh();
    _mmTimer = setInterval(function () {
      if (_mmContainer) _fetchAndRender();
    }, 30000);
  }

  function _stopRefresh() {
    if (_mmTimer) { clearInterval(_mmTimer); _mmTimer = null; }
  }

  function _pauseRefresh() { _stopRefresh(); }

  function _fetchAndRender() {
    var container = _mmContainer;
    if (!container) return;

    var me  = window.Accord && window.Accord.state && window.Accord.state.me;
    var uid = me && me.id;
    var rid = me && me.resource_id;

    if (!uid) {
      container.innerHTML = '<div class="ac-mm-empty">Sign in to see your meetings.</div>';
      return;
    }

    var qOrganized = API.get(
      'accord_meetings?organizer_id=eq.' + uid +
      '&state=in.(running,idle)' +
      '&order=scheduled_for.asc.nullsfirst' +
      '&select=meeting_id,title,state,scheduled_for,duration_minutes,workstream_id' +
      '&limit=50'
    ).catch(function () { return []; });

    var qInvites = rid
      ? API.get(
          'accord_meeting_attendees?resource_id=eq.' + rid +
          '&select=attendee_id,meeting_id,rsvp_status,' +
          'accord_meetings!inner(meeting_id,title,state,scheduled_for,' +
          'duration_minutes,workstream_id,organizer_id)'
        ).catch(function () { return []; })
      : Promise.resolve([]);

    Promise.all([qOrganized, qInvites]).then(function (results) {
      if (container !== _mmContainer) return;
      if (!container.isConnected) return;

      var organized = Array.isArray(results[0]) ? results[0] : [];
      var invites   = Array.isArray(results[1]) ? results[1] : [];

      var meetingMap = {};
      organized.forEach(function (m) {
        meetingMap[m.meeting_id] = {
          meeting_id: m.meeting_id, title: m.title, state: m.state,
          scheduled_for: m.scheduled_for, workstream_id: m.workstream_id,
          role: 'organizer', rsvp_status: 'accepted'
        };
      });
      invites.forEach(function (inv) {
        var m = inv.accord_meetings;
        if (!m || meetingMap[m.meeting_id]) return;
        meetingMap[m.meeting_id] = {
          meeting_id: m.meeting_id, title: m.title, state: m.state,
          scheduled_for: m.scheduled_for, workstream_id: m.workstream_id,
          role: 'attendee', rsvp_status: inv.rsvp_status,
          attendee_id: inv.attendee_id
        };
      });

      var meetings = Object.keys(meetingMap).map(function (k) { return meetingMap[k]; });
      var now      = Date.now();
      var in14days = now + 14 * 24 * 60 * 60 * 1000;

      var liveNow = meetings.filter(function (m) { return m.state === 'running'; });

      var pendingZ = meetings.filter(function (m) {
        return m.state === 'idle' && m.rsvp_status === 'pending';
      });

      var upcoming = meetings.filter(function (m) {
        if (m.state !== 'idle' || m.rsvp_status === 'pending' ||
            m.rsvp_status === 'declined' || !m.scheduled_for) return false;
        var t = new Date(m.scheduled_for).getTime();
        return !isNaN(t) && t > now && t < in14days;
      }).sort(function (a, b) {
        return new Date(a.scheduled_for) - new Date(b.scheduled_for);
      });

      container.innerHTML = _myMeetingsHtml(liveNow, pendingZ, upcoming);

      _clickHandler = function (ev) { _onContainerClick(ev); };
      container.addEventListener('click', _clickHandler);

    }).catch(function (e) {
      console.error('[MyMeetings] fetch failed:', e);
      if (container === _mmContainer && container.isConnected) {
        container.innerHTML = '<div class="ac-mm-empty">Could not load meetings.</div>';
      }
    });
  }

  function _myMeetingsHtml(liveNow, pending, upcoming) {
    var html = '';

    if (liveNow.length) {
      html += '<div class="ac-mm-zone">';
      html += '<div class="ac-mm-zone-label">&#9679; LIVE NOW</div>';
      liveNow.forEach(function (m) {
        html += '<div class="ac-mm-card ac-mm-card--live">';
        html += '<div class="ac-mm-card-title">' + esc(m.title || 'Untitled') + '</div>';
        html += '<a class="ac-mm-join-btn" data-action="mm-join" ' +
                'data-meeting-id="' + esc(m.meeting_id) + '" ' +
                'href="accord.html?meeting=' + esc(m.meeting_id) + '">JOIN &#8594;</a>';
        html += '</div>';
      });
      html += '</div>';
    }

    if (pending.length) {
      html += '<div class="ac-mm-zone">';
      html += '<div class="ac-mm-zone-label">PENDING ' +
              '<span class="ac-mm-badge">' + pending.length + '</span></div>';
      pending.forEach(function (m) {
        var dateStr = m.scheduled_for
          ? new Date(m.scheduled_for).toLocaleDateString(undefined,
              { month: 'short', day: 'numeric' })
          : 'Date TBD';
        html += '<div class="ac-mm-card ac-mm-card--pending">';
        html += '<div class="ac-mm-card-title">' + esc(m.title || 'Untitled') + '</div>';
        html += '<div class="ac-mm-card-meta">' + esc(dateStr) + '</div>';
        html += '<div class="ac-mm-rsvp-row">';
        html += '<button class="ac-mm-rsvp-btn ac-mm-rsvp-accept" ' +
                'data-action="mm-rsvp-accept" ' +
                'data-attendee-id="' + esc(m.attendee_id || '') + '" ' +
                'title="Accept">&#10003;</button>';
        html += '<button class="ac-mm-rsvp-btn ac-mm-rsvp-decline" ' +
                'data-action="mm-rsvp-decline" ' +
                'data-attendee-id="' + esc(m.attendee_id || '') + '" ' +
                'title="Decline">&#10005;</button>';
        html += '</div></div>';
      });
      html += '</div>';
    }

    if (upcoming.length) {
      html += '<div class="ac-mm-zone">';
      html += '<div class="ac-mm-zone-label">UPCOMING</div>';
      upcoming.forEach(function (m) {
        var dateStr = m.scheduled_for
          ? new Date(m.scheduled_for).toLocaleDateString(undefined,
              { weekday: 'short', month: 'short', day: 'numeric' })
          : 'TBD';
        html += '<div class="ac-mm-card ac-mm-card--upcoming" ' +
                'data-action="mm-open-meeting" ' +
                'data-meeting-id="' + esc(m.meeting_id) + '" ' +
                'data-workstream-id="' + esc(m.workstream_id || '') + '">';
        html += '<div class="ac-mm-card-title">' + esc(m.title || 'Untitled') + '</div>';
        html += '<div class="ac-mm-card-meta">' + esc(dateStr) + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    if (!liveNow.length && !pending.length && !upcoming.length) {
      html += '<div class="ac-mm-empty">No upcoming meetings.</div>';
    }

    return html;
  }

  function _onContainerClick(ev) {
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button === 1) return;
    var actionEl = ev.target.closest('[data-action]');
    if (!actionEl) return;
    var action = actionEl.dataset.action;

    if (action === 'mm-join') {
      var mtgId = actionEl.dataset.meetingId;
      if (mtgId && window.Accord && typeof window.Accord.setLevel === 'function') {
        ev.preventDefault();
        window.Accord.setLevel('meeting', { meetingId: mtgId, workstreamId: null });
      }
      return;
    }

    if (action === 'mm-open-meeting') {
      ev.preventDefault();
      var mtgId2 = actionEl.dataset.meetingId;
      var wsId   = actionEl.dataset.workstreamId || null;
      if (!mtgId2) return;
      if (window.Accord && typeof window.Accord.setLevel === 'function') {
        window.Accord.setLevel('meeting', { meetingId: mtgId2, workstreamId: wsId });
      } else {
        location.href = 'accord.html?meeting=' + mtgId2;
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
    if (!attendeeId) { console.warn('[MyMeetings] RSVP missing attendee-id'); return; }

    btn.disabled = true;
    var row = btn.closest('.ac-mm-rsvp-row');
    if (row) row.querySelectorAll('button').forEach(function (b) { b.disabled = true; });

    API.patch(
      'accord_meeting_attendees?attendee_id=eq.' + attendeeId,
      { rsvp_status: outcome }
    ).then(function () {
      _fetchAndRender();
    }).catch(function (e) {
      console.error('[MyMeetings] RSVP failed:', e);
      btn.disabled = false;
      if (row) row.querySelectorAll('button').forEach(function (b) { b.disabled = false; });
    });
  }

})();