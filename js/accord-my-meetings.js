// ============================================================
// ProjectHUD — accord-my-meetings.js
// Version: v20260519-CMD-ACCORD-MY-MEETINGS-1-P2
// Modified: 2026-05-19
//
// CMD-ACCORD-MY-MEETINGS-1 Phase 2 — closed meetings, stakes, state badges.
//   - LIVE NOW:    state badge + stakes line
//   - PENDING:     state badge + stakes line
//   - UPCOMING:    state badge + stakes line
//   - CLOSED (new): top 10 closed/sealed, clickable → review mode
//
// IR66 — data shape verified via console probes 2026-05-13.
// IR67 — version + date stamped above.
// ============================================================

(function () {
  'use strict';

  var API = window.API;

  var _mmContainer  = null;
  var _mmTimer      = null;
  var _clickHandler = null;

  // ── State badges ────────────────────────────────────────────
  var STATE_BADGES = {
    running: '<span class="ac-mm-state ac-mm-state--live">&#9679; LIVE</span>',
    idle:    '<span class="ac-mm-state ac-mm-state--preparing">Preparing</span>',
    closed:  '<span class="ac-mm-state ac-mm-state--closed">Closed</span>',
    sealed:  '<span class="ac-mm-state ac-mm-state--closed">Sealed</span>'
  };

  // ── CSS injection (once per page load) ─────────────────────
  (function _injectStyles() {
    if (document.getElementById('ac-mm-p2-styles')) return;
    var s = document.createElement('style');
    s.id = 'ac-mm-p2-styles';
    s.textContent =
      '.ac-mm-state{display:inline-block;font-size:10px;font-weight:700;' +
        'padding:1px 7px;border-radius:3px;margin-bottom:5px;letter-spacing:.06em}' +
      '.ac-mm-state--live{background:rgba(72,170,136,.12);color:#48aa88;' +
        'border:1px solid rgba(72,170,136,.25)}' +
      '.ac-mm-state--preparing{background:rgba(232,148,48,.08);color:#e89430;' +
        'border:1px solid rgba(232,148,48,.22)}' +
      '.ac-mm-state--closed{background:rgba(255,255,255,.04);color:#7a8a9a;' +
        'border:1px solid rgba(255,255,255,.08)}' +
      '.ac-mm-stakes{font-size:12px;color:var(--lo,#7a8a9a);font-style:italic;' +
        'border-left:2px solid rgba(255,255,255,.12);' +
        'padding-left:7px;margin:4px 0 6px;line-height:1.5;' +
        'display:-webkit-box;-webkit-line-clamp:2;' +
        '-webkit-box-orient:vertical;overflow:hidden}' +
      '.ac-mm-card--live     .ac-mm-stakes{border-left-color:rgba(72,170,136,.4)}' +
      '.ac-mm-card--pending  .ac-mm-stakes{border-left-color:rgba(224,82,82,.4)}' +
      '.ac-mm-card--upcoming .ac-mm-stakes{border-left-color:rgba(232,148,48,.4)}' +
      '.ac-mm-card--closed   .ac-mm-stakes{border-left-color:rgba(255,255,255,.1)}' +
      '.ac-mm-card--closed{border-left:3px solid rgba(255,255,255,.10);' +
        'opacity:.75;cursor:pointer}' +
      '.ac-mm-card--closed:hover{opacity:1}';
    document.head.appendChild(s);
    console.log('%c[accord-my-meetings.js] v20260519-CMD-ACCORD-MY-MEETINGS-1-P2 styles injected',
      'background:#e89430;color:#fff;padding:2px 6px;border-radius:3px;font-weight:600');
  })();

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _timeAgo(iso) {
    if (!iso) return '';
    var mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins === 1) return '1 min ago';
    return mins + ' min ago';
  }

  function _fmtDateTime(iso) {
    if (!iso) return 'Date TBD';
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return 'Date TBD';
      return d.toLocaleString(undefined, {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch (e) { return 'Date TBD'; }
  }

  function _fmtDate(iso) {
    if (!iso) return 'TBD';
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return 'TBD';
      return d.toLocaleDateString(undefined, {
        weekday: 'short', month: 'short', day: 'numeric'
      });
    } catch (e) { return 'TBD'; }
  }

  // X-26: refresh rail on navigation so JOIN / "In meeting" state updates
  // immediately. Listen on both events:
  //   accord:level-changed  — fires when setLevel is called (state may not
  //                           be written yet — catches the "leaving" case)
  //   accord:meeting-loaded — fires after state.meeting is fully hydrated
  //                           (catches the "just joined" case)
  window.addEventListener('accord:level-changed', function () {
    if (_mmContainer) _fetchAndRender();
  });
  window.addEventListener('accord:meeting-loaded', function () {
    if (_mmContainer) _fetchAndRender();
  });

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

    // Q1 -- organized meetings (all states) with workstream name
    var qOrganized = API.get(
      'accord_meetings?organizer_id=eq.' + uid +
      '&state=in.(running,idle,closed,sealed)' +
      '&order=scheduled_for.asc.nullsfirst' +
      '&select=meeting_id,title,state,scheduled_for,duration_minutes,' +
      'workstream_id,started_at,stakes,workstreams(name)' +
      '&limit=50'
    ).catch(function () { return []; });

    // Q2 -- invited meetings with organizer name + workstream name
    var qInvites = rid
      ? API.get(
          'accord_meeting_attendees?resource_id=eq.' + rid +
          '&select=attendee_id,meeting_id,rsvp_status,' +
          'accord_meetings!inner(meeting_id,title,state,scheduled_for,' +
          'duration_minutes,workstream_id,organizer_id,started_at,stakes,' +
          'workstreams(name),users(name))'
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
          meeting_id:       m.meeting_id,
          title:            m.title,
          state:            m.state,
          scheduled_for:    m.scheduled_for,
          duration_minutes: m.duration_minutes,
          workstream_id:    m.workstream_id,
          workstream_name:  m.workstreams ? m.workstreams.name : null,
          started_at:       m.started_at,
          stakes:           m.stakes || null,
          organizer_name:   null,
          role:             'organizer',
          rsvp_status:      'accepted'
        };
      });

      invites.forEach(function (inv) {
        var m = inv.accord_meetings;
        if (!m || meetingMap[m.meeting_id]) return;
        meetingMap[m.meeting_id] = {
          meeting_id:       m.meeting_id,
          title:            m.title,
          state:            m.state,
          scheduled_for:    m.scheduled_for,
          duration_minutes: m.duration_minutes,
          workstream_id:    m.workstream_id,
          workstream_name:  m.workstreams ? m.workstreams.name : null,
          started_at:       m.started_at,
          stakes:           m.stakes || null,
          organizer_name:   m.users ? m.users.name : null,
          role:             'attendee',
          rsvp_status:      inv.rsvp_status,
          attendee_id:      inv.attendee_id
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

      var closed = meetings.filter(function (m) {
        return m.state === 'closed' || m.state === 'sealed';
      }).sort(function (a, b) {
        return new Date(b.scheduled_for) - new Date(a.scheduled_for);
      }).slice(0, 10);

      container.innerHTML = _myMeetingsHtml(liveNow, pendingZ, upcoming, closed);
      _clickHandler = function (ev) { _onContainerClick(ev); };
      container.addEventListener('click', _clickHandler);

    }).catch(function (e) {
      console.error('[MyMeetings] fetch failed:', e);
      if (container === _mmContainer && container.isConnected) {
        container.innerHTML = '<div class="ac-mm-empty">Could not load meetings.</div>';
      }
    });
  }

  function _myMeetingsHtml(liveNow, pending, upcoming, closed) {
    var html = '';

    // LIVE NOW
    if (liveNow.length) {
      html += '<div class="ac-mm-zone">';
      html += '<div class="ac-mm-zone-label">&#9679; LIVE NOW</div>';
      liveNow.forEach(function (m) {
        html += '<div class="ac-mm-card ac-mm-card--live">';
        html += (STATE_BADGES[m.state] || '');
        html += '<div class="ac-mm-card-title">' + esc(m.title || 'Untitled') + '</div>';
        if (m.stakes) {
          html += '<div class="ac-mm-stakes">' + esc(m.stakes) + '</div>';
        }
        var meta = [];
        if (m.started_at) meta.push(_timeAgo(m.started_at));
        if (m.workstream_name) meta.push(esc(m.workstream_name));
        if (meta.length) {
          html += '<div class="ac-mm-card-meta">' + meta.join(' &middot; ') + '</div>';
        }
        var activeMtgId = window.Accord && window.Accord.state &&
                          window.Accord.state.meeting &&
                          window.Accord.state.meeting.meeting_id;
        var alreadyIn = (activeMtgId === m.meeting_id);
        if (alreadyIn) {
          html += '<div class="ac-mm-in-meeting">&#9679; In meeting</div>';
        } else {
          html += '<a class="ac-mm-join-btn" data-action="mm-join" ' +
                  'data-meeting-id="' + esc(m.meeting_id) + '" ' +
                  'href="accord.html?meeting=' + esc(m.meeting_id) + '">JOIN &#8594;</a>';
        }
        html += '</div>';
      });
      html += '</div>';
    }

    // PENDING
    if (pending.length) {
      html += '<div class="ac-mm-zone">';
      html += '<div class="ac-mm-zone-label">PENDING ' +
              '<span class="ac-mm-badge">' + pending.length + '</span></div>';
      pending.forEach(function (m) {
        html += '<div class="ac-mm-card ac-mm-card--pending">';
        html += (STATE_BADGES.idle || '');
        html += '<div class="ac-mm-card-title">' + esc(m.title || 'Untitled') + '</div>';
        if (m.stakes) {
          html += '<div class="ac-mm-stakes">' + esc(m.stakes) + '</div>';
        }
        var meta = [];
        if (m.scheduled_for) meta.push(_fmtDateTime(m.scheduled_for));
        if (m.duration_minutes) meta.push(m.duration_minutes + ' min');
        if (meta.length) {
          html += '<div class="ac-mm-card-meta">' + esc(meta.join(' \u00b7 ')) + '</div>';
        }
        if (m.organizer_name) {
          html += '<div class="ac-mm-card-meta ac-mm-card-invited">' +
                  'Invited by ' + esc(m.organizer_name) + '</div>';
        }
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

    // UPCOMING
    if (upcoming.length) {
      html += '<div class="ac-mm-zone">';
      html += '<div class="ac-mm-zone-label">UPCOMING</div>';
      upcoming.forEach(function (m) {
        html += '<div class="ac-mm-card ac-mm-card--upcoming" ' +
                'data-action="mm-open-meeting" ' +
                'data-meeting-id="' + esc(m.meeting_id) + '" ' +
                'data-workstream-id="' + esc(m.workstream_id || '') + '">';
        html += (STATE_BADGES.idle || '');
        html += '<div class="ac-mm-card-title">' + esc(m.title || 'Untitled') + '</div>';
        if (m.stakes) {
          html += '<div class="ac-mm-stakes">' + esc(m.stakes) + '</div>';
        }
        var meta = [];
        if (m.scheduled_for) meta.push(_fmtDate(m.scheduled_for));
        if (m.workstream_name) meta.push(esc(m.workstream_name));
        if (meta.length) {
          html += '<div class="ac-mm-card-meta">' + meta.join(' &middot; ') + '</div>';
        }
        html += '<div class="ac-mm-card-role">' +
                (m.role === 'organizer' ? 'Organizer' : 'Invited') + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    // CLOSED
    if (closed && closed.length) {
      html += '<div class="ac-mm-zone">';
      html += '<div class="ac-mm-zone-label">CLOSED</div>';
      closed.forEach(function (m) {
        html += '<div class="ac-mm-card ac-mm-card--closed" ' +
                'data-action="mm-open-meeting" ' +
                'data-meeting-id="' + esc(m.meeting_id) + '" ' +
                'data-workstream-id="' + esc(m.workstream_id || '') + '">';
        html += (STATE_BADGES[m.state] || STATE_BADGES.closed);
        html += '<div class="ac-mm-card-title">' + esc(m.title || 'Untitled') + '</div>';
        if (m.stakes) {
          html += '<div class="ac-mm-stakes">' + esc(m.stakes) + '</div>';
        }
        var meta = [];
        if (m.scheduled_for) meta.push(_fmtDate(m.scheduled_for));
        if (m.workstream_name) meta.push(esc(m.workstream_name));
        if (meta.length) {
          html += '<div class="ac-mm-card-meta">' + meta.join(' &middot; ') + '</div>';
        }
        html += '<div class="ac-mm-card-role">' +
                (m.role === 'organizer' ? 'Organizer' : 'Attended') + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    if (!liveNow.length && !pending.length && !upcoming.length && (!closed || !closed.length)) {
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