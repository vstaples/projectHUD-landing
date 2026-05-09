// ============================================================
// accord-meeting-setup.js — Meeting Setup surface
// CMD-ACCORD-MEETING-SETUP-1 Phase 2
//
// Renders the pre-meeting Setup shell for accord_meetings rows
// in state='idle'. Replaces the 5-tab shell for draft meetings.
// Phase 2 scope: chrome only (header, 3-column placeholders,
// filmstrip placeholder, footer with Begin Meeting wiring).
// Pane content (Briefing logic, Agenda, Anticipation, Filmstrip,
// Prior actions) ships in Phases 3-7.
//
// Exposes: window.AccordMeetingSetup = { render(host, meeting, workstreamId), teardown() }
// ============================================================

(function () {
  'use strict';

  var API = window.API;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Module state ─────────────────────────────────────────────
  var _saveTimer = null;
  var _currentMeetingId = null;

  // ── Detach hook (registered with window on render) ─────────
  function _detachHandler() {
    teardown();
  }

  // ── teardown ─────────────────────────────────────────────────
  function teardown() {
    // Clear the detach hook only if we own it
    if (window._accordDetachSurfaceHost === _detachHandler) {
      window._accordDetachSurfaceHost = null;
    }
    // Cancel any pending autosave debounce
    if (_saveTimer) {
      clearTimeout(_saveTimer);
      _saveTimer = null;
    }
    _currentMeetingId = null;
    // DOM cleared by caller (transitions.js or renderMeetingView)
  }

  // ── briefing_text autosave ───────────────────────────────────
  function _wireBriefingAutosave(textarea, meetingId) {
    textarea.addEventListener('input', function () {
      if (_saveTimer) clearTimeout(_saveTimer);
      _saveTimer = setTimeout(function () {
        _saveTimer = null;
        var val = textarea.value;
        API.patch('accord_meetings?meeting_id=eq.' + meetingId, {
          briefing_text: val
        }).catch(function (e) {
          // State-gate or organizer-gate rejection — surface is effectively
          // read-only at this point. Log only; no alert.
          console.warn('[AccordMeetingSetup] briefing_text PATCH rejected', e);
        });
      }, 800);
    });
  }

  // ── Begin Meeting ────────────────────────────────────────────
  function _beginMeeting(meeting, workstreamId, btn) {
    btn.disabled = true;
    var orig = btn.textContent;
    btn.textContent = 'Starting\u2026';

    Accord.startMeeting(meeting.meeting_id).then(function () {
      // Re-render the meeting view — transitions to 5-tab shell.
      // Re-query the host after startMeeting() resolves (IR71).
      var host = document.querySelector('.ac-view-host');
      if (host && window.AccordViews && window.AccordViews.renderMeetingView) {
        return AccordViews.renderMeetingView(host, meeting.meeting_id, workstreamId);
      }
    }).catch(function (e) {
      console.error('[AccordMeetingSetup] Begin Meeting failed', e);
      alert('Could not start meeting: ' + (e && e.message ? e.message : String(e)));
      btn.disabled = false;
      btn.textContent = orig;
    });
  }

  // ── Workstream name fetch (non-blocking) ─────────────────────
  function _resolveWorkstreamName(workstreamId, crumbEl) {
    if (!workstreamId) return;
    API.get('workstreams?workstream_id=eq.' + workstreamId + '&select=name&limit=1')
      .then(function (rows) {
        var name = rows && rows[0] && rows[0].name;
        if (name && crumbEl) {
          crumbEl.textContent = esc(name) + ' \u203a ';
        }
      })
      .catch(function () { /* non-fatal; breadcrumb stays as placeholder */ });
  }

  // ── HTML build ────────────────────────────────────────────────
  function _buildHTML(meeting, workstreamId) {
    var title = esc(meeting.title || '(untitled)');

    var scheduledStr = '';
    if (meeting.scheduled_for) {
      try {
        scheduledStr = new Date(meeting.scheduled_for).toLocaleDateString([], {
          year: 'numeric', month: 'short', day: 'numeric',
          hour: '2-digit', minute: '2-digit'
        });
      } catch (e) { scheduledStr = ''; }
    }

    // Breadcrumb: workstream name resolved async; show placeholder until resolved
    var crumbWs = workstreamId
      ? '<span class="ac-setup-crumb-ws" id="ac-setup-crumb-ws">\u2026 \u203a </span>'
      : '<span class="ac-setup-crumb-ws">Accord \u203a </span>';

    // Filmstrip: omit entirely for parking-lot meetings (workstream_id IS NULL)
    var filmstripHTML = workstreamId
      ? '<div class="ac-setup-filmstrip"><span class="ac-setup-placeholder">(coming soon)</span></div>'
      : '';

    return (
      '<div class="ac-setup-shell">' +

        '<header class="ac-setup-header">' +
          '<nav class="ac-setup-breadcrumb">' +
            crumbWs +
            '<span class="ac-setup-crumb-mtg">' + title + '</span>' +
          '</nav>' +
          '<h2 class="ac-setup-title">' + title + '</h2>' +
          '<div class="ac-setup-meta">' +
            (scheduledStr ? '<span class="ac-setup-meta-date">' + esc(scheduledStr) + '</span>' : '') +
            '<span class="ac-setup-state-badge">Draft</span>' +
          '</div>' +
        '</header>' +

        '<div class="ac-setup-body">' +

          '<div class="ac-setup-col ac-setup-col--briefing">' +
            '<div class="ac-setup-col-label section-label">Briefing</div>' +
            '<div class="ac-setup-briefing-area">' +
              '<textarea class="ac-setup-briefing-text" id="ac-setup-briefing-text" ' +
                'placeholder="Add prep notes\u2026" ' +
                'aria-label="Meeting briefing">' +
                esc(meeting.briefing_text || '') +
              '</textarea>' +
            '</div>' +
          '</div>' +

          '<div class="ac-setup-col ac-setup-col--agenda">' +
            '<div class="ac-setup-col-label section-label">Agenda</div>' +
            '<div class="ac-setup-agenda-area">' +
              '<span class="ac-setup-placeholder">(coming soon)</span>' +
            '</div>' +
          '</div>' +

          '<div class="ac-setup-col ac-setup-col--anticipation">' +
            '<div class="ac-setup-col-label section-label">Anticipation</div>' +
            '<div class="ac-setup-anticipation-area">' +
              '<span class="ac-setup-placeholder">(coming soon)</span>' +
            '</div>' +
          '</div>' +

        '</div>' +

        filmstripHTML +

        '<footer class="ac-setup-footer">' +
          '<div class="ac-setup-footer-left"></div>' +
          '<div class="ac-setup-footer-right">' +
            '<button type="button" class="btn btn-signal ac-setup-begin" id="ac-setup-begin-btn">' +
              'Begin Meeting \u2192' +
            '</button>' +
          '</div>' +
        '</footer>' +

      '</div>'
    );
  }

  // ── render ────────────────────────────────────────────────────
  function render(host, meeting, workstreamId) {
    if (!host) return;

    // Teardown any prior state before overwriting DOM
    teardown();

    _currentMeetingId = meeting.meeting_id;

    // Register ourselves as the surface-host detach handler so
    // accord-transitions.js can cleanly unmount Setup on ascend.
    window._accordDetachSurfaceHost = _detachHandler;

    host.innerHTML = _buildHTML(meeting, workstreamId);

    // Async: resolve workstream name for breadcrumb
    if (workstreamId) {
      var crumbEl = host.querySelector('#ac-setup-crumb-ws');
      _resolveWorkstreamName(workstreamId, crumbEl);
    }

    // Wire briefing autosave
    var textarea = host.querySelector('#ac-setup-briefing-text');
    if (textarea) {
      _wireBriefingAutosave(textarea, meeting.meeting_id);
    }

    // Wire Begin Meeting
    var beginBtn = host.querySelector('#ac-setup-begin-btn');
    if (beginBtn) {
      beginBtn.addEventListener('click', function () {
        _beginMeeting(meeting, workstreamId, beginBtn);
      });
    }
  }

  // ── Expose ────────────────────────────────────────────────────
  window.AccordMeetingSetup = {
    render: render,
    teardown: teardown,
  };

})();