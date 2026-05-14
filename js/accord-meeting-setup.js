// ============================================================
// accord-meeting-setup.js — Meeting Setup surface
// CMD-ACCORD-MEETING-SETUP-1 Phase 2 + Phase 3 + Phase 4
//
// Phase 2: shell chrome, Begin Meeting.
// Phase 3: agenda render, add-item, reorder, pull-as-thread.
// Phase 4: briefing two-state (mechanical default + override);
//          agenda separator + typed pulled badges;
//          pulled_from_tag on INSERT.
//
// Exposes: window.AccordMeetingSetup = { render, teardown }
// ============================================================

(function () {
  'use strict';

  var API = window.API;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function truncate(s, n) {
    s = String(s == null ? '' : s);
    return s.length > n ? s.slice(0, n) + '\u2026' : s;
  }

  // ── Module state ─────────────────────────────────────────────
  var _saveTimer          = null;   // covers all autosave paths
  var _currentMeetingId   = null;
  var _agendaFetchAborted = false;
  var _workstreamName     = null;   // cached for briefing default text

  // ── CMD-ACCORD-SETUP-LAYOUT-1: layout state ──────────────────
  // Drag state holds primitives only — IR71 (no DOM refs in mutable state).
  // DOM nodes are re-queried inside each handler.
  var _colDrag = {
    active:      false,
    handle:      null,    // 'left' | 'right'
    startX:      0,
    startLeftW:  0,
    startRightW: 0
  };
  var _filmDrag = {
    active:  false,
    startY:  0,
    startH:  0
  };
  var COL_MIN_W    = 260;
  var COL_MAX_W    = 1400;
  var FILM_MIN_H   = 48;
  var FILM_MAX_H   = 350;
  var FILM_DEFAULT = 102;
  var FOOTER_H     = 54;
  var LS_KEY_LEFT  = 'accord-setup-col-left-w';
  var LS_KEY_RIGHT = 'accord-setup-col-right-w';
  var LS_KEY_FILM  = 'accord-setup-filmstrip-h';
  var FULLPAGE_CLS = 'accord-setup-fullpage';

  // ── CMD-ACCORD-SETUP-HEADER-1: header state ───────────────────
  // One debounce timer per editable field, keyed by column name.
  var _headerSaveTimers = {};
  var _countdownTimer   = null;

  // ── X-11: briefing edit state ─────────────────────────────────
  var _briefingEditTimer = null;

  // ── X-14: WHEN picker state ───────────────────────────────────
  var _pickerOpen      = false;
  var _pickerDate      = null;
  var _pickerHour      = 9;
  var _pickerMinute    = 0;
  var _pickerDuration  = 60;
  var _pickerViewYear  = null;
  var _pickerViewMonth = null;

  // ── CMD-ACCORD-SETUP-OUTCOMES-1: outcomes state ───────────────
  var _outcomesAborted  = false;
  var _descPatchTimers  = {};   // keyed by outcome_id

  // ── CMD-ACCORD-SETUP-ATTENDEES-1: attendees state ─────────────
  var _attendeesAborted = false;
  var _searchTimer      = null;
  var _rsvpPollTimer    = null;   // E-Phase: RSVP status poll handle

  // ── CMD-ACCORD-SETUP-FILMSTRIP-2: filmstrip state ─────────────
  var _filmstripAborted    = false;
  var _filmstripToken      = 0;     // incremented each render; callbacks capture & compare
  var _scrubState          = { active: false, meetingId: null };
  var _filmResizeObserver  = null;
  // Canonical tag order: N·D·A·R·Q·Di (locked MEETING-SETUP-1 Phase 6)
  var FILM_TAG_ORDER = [
    { tag: 'note',     abbr: 'N'  },
    { tag: 'decision', abbr: 'D'  },
    { tag: 'action',   abbr: 'A'  },
    { tag: 'risk',     abbr: 'R'  },
    { tag: 'question', abbr: 'Q'  },
    { tag: 'dissent',  abbr: 'Di' }
  ];

  // ── CMD-ACCORD-SETUP-FILMSTRIP-CARDS-1 (C-14): card enrichment state ─
  // P1 amendment: renamed from _filmResizeObserver (already used by
  // _initFilmDensity for zone-level density observer) to _filmTierObserver.
  var _filmCardToken   = 0;
  var _filmTierObserver = null;

  // ── CMD-ACCORD-SETUP-BRIEFING-TABS-1: tab state ───────────────
  // _leftActiveTab persists across renders intentionally (smoke test 8).
  // Do NOT reset in teardown().
  var _leftActiveTab  = 'briefing';
  var _briefingToken  = 0;
  var _decisionsToken = 0;
  var _risksToken     = 0;

  // ── CMD-ACCORD-SETUP-AGENDA-ENHANCED-1: center tab + agenda state
  // _centerActiveTab persists across renders intentionally.
  // Do NOT reset in teardown().
  var _centerActiveTab    = 'agenda';
  var _agendaToken        = 0;
  var _agendaTitleTimers  = {};
  var _agendaTimeTimers   = {};

  // ── CMD-ACCORD-SETUP-INTELLIGENCE-1: intel state ──────────────
  var _intelToken      = 0;
  var _intelData       = null;
  var _intelOpen       = false;
  var _intelNoteTimer  = null;
  var _currentMeeting  = null;
  var _currentResourceId = null;

  // ── CMD-ACCORD-SETUP-ACTION-KANBAN-1: action items state ──────
  // _rightActiveTab persists across renders intentionally.
  // Do NOT reset in teardown().
  var _rightActiveTab    = 'attendees';
  var _actionItemsToken  = 0;

  // ── CMD-ACCORD-SETUP-SLIDESHOW-1: rotation engine state ───────
  var _slideshowEngines = { left: null, right: null };

  // ── CMD-ACCORD-SETUP-PERCOLATE-1: percolate state ─────────────
  var _percolateResourceId   = null;   // active filter; null = no filter
  var _percolateResourceName = null;   // display name for pill

  // ── CMD-ACCORD-SETUP-GATHERING-1: gathering mode state (C-12) ─
  var _gatheringMode     = false;      // is gathering mode currently active
  var _gatheringTimer    = null;       // setInterval handle for scheduled_for polling
  var _gatheringPrepView = false;      // is "Show prep view" currently on
  var _connDotStates     = {};         // { [attendee_id]: 'none' | 'on-time' | 'late' }
  var _fiveMinWarned     = false;      // has 5-min warning fired this session

  // ── CMD-ACCORD-SETUP-VERDICT-1 (C-13): footer + countdown state ─
  var _currentWorkstreamId = null;     // cached in render(); used by footer re-render triggers
  var _verdictToken        = 0;
  var _verdictPopoverOpen  = false;
  var _countdownInterval   = null;     // gathering countdown handle (renamed from C-13 spec to avoid collision with header _countdownTimer)

  // ── Detach hook ───────────────────────────────────────────────
  function _detachHandler() {
    // Remove fullpage classes only when genuinely leaving Setup.
    // During idle→idle navigation (e.g. filmstrip NEXT), accord-transitions
    // sets window._setupPreserveFullpage = true before renderMeetingView runs,
    // so the classes are preserved through the _detachSurfaceHost call.
    if (!window._setupPreserveFullpage) {
      var appRoot = document.getElementById('accord-app');
      if (appRoot) appRoot.classList.remove(FULLPAGE_CLS);
      document.body.classList.remove(FULLPAGE_CLS);
    }
    teardown();
  }

  // ── teardown ──────────────────────────────────────────────────
  function teardown() {
    if (window._accordDetachSurfaceHost === _detachHandler) {
      window._accordDetachSurfaceHost = null;
    }
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
    _agendaFetchAborted        = true;
    _anticipationFetchAborted  = true;
    _filmstripFetchAborted     = true;
    _currentMeetingId          = null;
    _workstreamName            = null;
    // Remove NRA event listeners -- Phase 5
    NRA_EVENTS.forEach(function(evt) {
      window.removeEventListener(evt, _onNraEvent);
    });
    // Remove filmstrip click listener -- Phase 6
    var strip = document.querySelector('.ac-setup-filmstrip');
    if (strip) strip.removeEventListener('click', _onFilmCardClick);

    // ── CMD-ACCORD-SETUP-HEADER-1: header teardown (§6.1) ──────
    Object.keys(_headerSaveTimers).forEach(function(k) {
      if (_headerSaveTimers[k]) clearTimeout(_headerSaveTimers[k]);
    });
    _headerSaveTimers = {};
    _stopCountdown();

    // ── X-11: briefing edit teardown ─────────────────────────────
    if (_briefingEditTimer) { clearTimeout(_briefingEditTimer); _briefingEditTimer = null; }

    // ── CMD-ACCORD-SETUP-OUTCOMES-1: outcomes teardown ──────────
    _outcomesAborted = true;
    Object.keys(_descPatchTimers).forEach(function(k) {
      if (_descPatchTimers[k]) clearTimeout(_descPatchTimers[k]);
    });
    _descPatchTimers = {};

    // ── CMD-ACCORD-SETUP-ATTENDEES-1: attendees teardown ────────
    _attendeesAborted = true;
    if (_searchTimer) { clearTimeout(_searchTimer); _searchTimer = null; }
    // E-Phase: stop RSVP poll on teardown
    _stopRsvpPoll();

    // ── CMD-ACCORD-SETUP-FILMSTRIP-2: filmstrip teardown ────────
    _filmstripAborted = true;
    _filmstripToken++;            // invalidates all in-flight filmstrip callbacks
    if (_filmResizeObserver) { _filmResizeObserver.disconnect(); _filmResizeObserver = null; }

    // ── CMD-ACCORD-SETUP-FILMSTRIP-CARDS-1 (C-14): card tier teardown ─
    _stopFilmCardTiers();
    _filmCardToken = 0;
    if (_scrubState.active) {
      _scrubState.active    = false;
      _scrubState.meetingId = null;
      // Restore center column if scrub was hiding it
      var tabbody = document.querySelector('.ac-col-tabbody[data-col="center"]');
      if (tabbody) {
        tabbody.querySelectorAll(':scope > *').forEach(function(el) {
          el.style.display = '';
        });
      }
    }

    // ── CMD-ACCORD-SETUP-AGENDA-ENHANCED-1: agenda teardown ─────
    // _agendaToken auto-invalidates; _centerActiveTab persists intentionally
    Object.keys(_agendaTitleTimers).forEach(function(k) {
      if (_agendaTitleTimers[k]) clearTimeout(_agendaTitleTimers[k]);
    });
    _agendaTitleTimers = {};
    Object.keys(_agendaTimeTimers).forEach(function(k) {
      if (_agendaTimeTimers[k]) clearTimeout(_agendaTimeTimers[k]);
    });
    _agendaTimeTimers = {};

    // ── CMD-ACCORD-SETUP-INTELLIGENCE-1: intel teardown ─────────
    _intelData         = null;
    _currentMeeting    = null;
    _currentResourceId = null;
    _intelOpen         = false;
    _intelNoteSaving   = false;
    if (_intelNoteTimer) { clearTimeout(_intelNoteTimer); _intelNoteTimer = null; }
    var intelOverlay = document.getElementById('ac-intel-overlay');
    if (intelOverlay) {
      intelOverlay.style.display = 'none';
      intelOverlay.classList.remove('ac-intel-overlay--visible');
      intelOverlay.innerHTML = '';
    }
    var intelShell = document.querySelector('.ac-setup-shell');
    if (intelShell) intelShell.classList.remove('ac-intel-dimmed');

    // ── CMD-ACCORD-SETUP-LAYOUT-1: layout teardown ─────────────
    // NOTE: fullpage classes (FULLPAGE_CLS) are NOT removed here.
    // They are removed only in _detachHandler, which fires when
    // genuinely navigating away from Setup to a non-idle surface.
    // Removing them here causes a rail flash during idle→idle
    // NEXT navigation (teardown fires, classes gone, render re-applies).
    // Drop in-flight column-drag listeners.
    if (_colDrag.active) {
      document.removeEventListener('mousemove', _onHandleMouseMove);
      document.removeEventListener('mouseup',   _onHandleMouseUp);
      _colDrag.active = false;
    }
    // Drop in-flight filmstrip-drag listeners.
    if (_filmDrag.active) {
      document.removeEventListener('mousemove', _onFilmHandleMouseMove);
      document.removeEventListener('mouseup',   _onFilmHandleMouseUp);
      _filmDrag.active = false;
    }
    // Remove Cmd+I / Ctrl+I listener (idempotent — removeEventListener
    // is a no-op if the listener was never attached).
    document.removeEventListener('keydown', _onIntelKey);

    // ── CMD-ACCORD-SETUP-SLIDESHOW-1: rotation engine teardown ───
    _destroySlideshow();

    // ── X-14: WHEN picker teardown ────────────────────────────────
    _closeWhenPicker();
    _pickerOpen      = false;
    _pickerDate      = null;
    _pickerViewYear  = null;
    _pickerViewMonth = null;

    // ── CMD-ACCORD-SETUP-PERCOLATE-1: percolate teardown ─────────
    _clearPercolate();

    // ── CMD-ACCORD-SETUP-GATHERING-1 (C-12): teardown (§10) ──────
    _stopGatheringTimer();
    _gatheringMode     = false;
    _gatheringPrepView = false;
    _fiveMinWarned     = false;
    _connDotStates     = {};
    var fiveMinBanner = document.getElementById('ac-five-min-banner');
    if (fiveMinBanner) fiveMinBanner.remove();
    _exitGatheringMode();   // removes ac-gathering-active class + header chrome

    // ── CMD-ACCORD-SETUP-VERDICT-1 (C-13): teardown (§12) ────────
    _stopGatheringCountdown();
    _verdictToken       = 0;
    _verdictPopoverOpen = false;
    var popover = document.getElementById('ac-verdict-popover');
    if (popover) popover.remove();
  }

  // ── Briefing autosave ─────────────────────────────────────────
  function _wireBriefingAutosave(textarea, meetingId) {
    textarea.addEventListener('input', function () {
      if (_saveTimer) clearTimeout(_saveTimer);
      _saveTimer = setTimeout(function () {
        _saveTimer = null;
        API.patch('accord_meetings?meeting_id=eq.' + meetingId, {
          briefing_text: textarea.value
        }).catch(function (e) {
          console.warn('[AccordMeetingSetup] briefing_text PATCH rejected', e);
        });
      }, 800);
    });
  }

  // ── Begin Meeting ─────────────────────────────────────────────
  function _beginMeeting(meeting, workstreamId, btn) {
    btn.disabled = true;
    var orig = btn.textContent;
    btn.textContent = 'Starting\u2026';
    Accord.startMeeting(meeting.meeting_id).then(function () {
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

  // ── Workstream breadcrumb ─────────────────────────────────────
  function _resolveWorkstreamName(workstreamId, crumbEl) {
    if (!workstreamId || !crumbEl) return;
    API.get('workstreams?workstream_id=eq.' + workstreamId + '&select=name&limit=1')
      .then(function (rows) {
        var name = rows && rows[0] && rows[0].name;
        if (name) {
          _workstreamName = name;
          crumbEl.textContent = esc(name) + ' \u203a ';
        }
      })
      .catch(function () {});
  }

  // ── Shell HTML ────────────────────────────────────────────────
  // CMD-ACCORD-SETUP-LAYOUT-1: 4-zone grid shell (§9 of commission).
  // All zone content is placeholder; successor CMDs populate per the
  // wave plan (Setup Shell Spec §14):
  //   header    → CMD-ACCORD-SETUP-HEADER-1
  //   columns   → CMD-ACCORD-SETUP-OUTCOMES-1, ATTENDEES-1, BRIEFING-TABS-1
  //   filmstrip → CMD-ACCORD-SETUP-FILMSTRIP-2
  //   footer    → CMD-ACCORD-SETUP-VERDICT-1
  function _buildHTML(meeting, workstreamId) {
    var meetingId = esc(meeting && meeting.meeting_id ? meeting.meeting_id : '');
    return (
      '<div class="ac-setup-shell" data-mode="prep" data-meeting-id="' + meetingId + '">' +

        // Zone 1: Header (auto height) — CMD-ACCORD-SETUP-HEADER-1
        '<div class="ac-setup-header">' +

          '<div class="ac-header-left">' +
            '<div class="ac-header-title"' +
                ' contenteditable="true"' +
                ' spellcheck="false"' +
                ' data-field="title"' +
                ' id="ac-meeting-title"></div>' +
            '<div class="ac-header-stakes-block">' +
              '<span class="ac-header-stakes-label">STAKES</span>' +
              '<div class="ac-header-stakes"' +
                  ' contenteditable="true"' +
                  ' spellcheck="false"' +
                  ' data-field="stakes"' +
                  ' id="ac-meeting-stakes"' +
                  ' data-placeholder="What is at risk in this meeting\u2026"></div>' +
            '</div>' +
          '</div>' +

          '<div class="ac-header-right">' +
            '<div class="ac-header-mode-toggle">' +
              '<span class="ac-mode-tab" id="ac-mode-followup">FOLLOW-UP</span>' +
              '<span class="ac-mode-tab" id="ac-mode-firstever">FIRST-EVER</span>' +
            '</div>' +
            '<div class="ac-header-meta">' +
              '<div class="ac-meta-row ac-meta-row--when" id="ac-meta-when-row">' +
                '<span class="ac-meta-label">WHEN</span>' +
                '<span class="ac-meta-value" id="ac-meta-when">\u2014</span>' +
              '</div>' +
              '<div class="ac-meta-row">' +
                '<span class="ac-meta-label">WHERE</span>' +
                '<span class="ac-meta-value ac-meta-editable"' +
                     ' contenteditable="true"' +
                     ' spellcheck="false"' +
                     ' data-field="location"' +
                     ' id="ac-meta-where"' +
                     ' data-placeholder="Add location\u2026"></span>' +
              '</div>' +
              '<div class="ac-meta-row">' +
                '<span class="ac-meta-label">WORKSTREAM</span>' +
                '<span class="ac-meta-value" id="ac-meta-workstream">\u2014</span>' +
              '</div>' +
              '<div class="ac-meta-row" id="ac-meta-starts-row" style="display:none;">' +
                '<span class="ac-pulse-dot"></span>' +
                '<span class="ac-meta-value ac-meta-starts" id="ac-meta-starts">\u2014</span>' +
              '</div>' +
            '</div>' +
          '</div>' +

        '</div>' +

        // Zone 2: Columns (1fr)
        '<div class="ac-setup-columns">' +

          // Left column
          '<div class="ac-setup-col-left">' +
            '<div class="ac-col-tabbar" data-col="left"></div>' +
            '<div class="ac-col-tabbody" data-col="left">' +
              '<div class="ac-col-placeholder">Briefing \u00b7 coming soon</div>' +
            '</div>' +
            '<div class="ac-col-handle ac-col-handle--left" data-handle="left"></div>' +
          '</div>' +

          // Center column
          '<div class="ac-setup-col-center">' +
            '<div class="ac-col-tabbar" data-col="center"></div>' +
            '<div class="ac-col-tabbody" data-col="center">' +
              '<div class="ac-col-placeholder">Agenda \u00b7 coming soon</div>' +
            '</div>' +
            '<div class="ac-col-handle ac-col-handle--right" data-handle="right"></div>' +
          '</div>' +

          // Right column
          '<div class="ac-setup-col-right">' +
            '<div class="ac-col-tabbar" data-col="right"></div>' +
            '<div class="ac-col-tabbody" data-col="right">' +
              '<div class="ac-col-placeholder">Attendees \u00b7 coming soon</div>' +
            '</div>' +
          '</div>' +

        '</div>' +

        // Zone 3: Filmstrip (102px default, drag-resizable)
        '<div class="ac-setup-filmstrip">' +
          '<div class="ac-filmstrip-handle"></div>' +
          '<div class="ac-filmstrip-content">' +
            '<div class="ac-zone-placeholder">Workstream timeline \u00b7 coming soon</div>' +
          '</div>' +
        '</div>' +

        // Zone 4: Footer (54px)
        '<div class="ac-setup-footer">' +
          '<div class="ac-zone-placeholder">Footer \u00b7 coming soon</div>' +
        '</div>' +

      '</div>' +

      // Intelligence Mode overlay — outside grid, full viewport (§8.2)
      '<div class="ac-intel-overlay" id="ac-intel-overlay" style="display:none;"></div>'
    );
  }

  // ══════════════════════════════════════════════════════════════
  // BRIEFING COLUMN
  // ══════════════════════════════════════════════════════════════

  function _renderBriefing(meeting, workstreamId) {
    var area = document.getElementById('ac-setup-briefing-area');
    if (!area) return;
    if (meeting.briefing_text != null) {
      _paintBriefingEdit(area, meeting, workstreamId, null);
    } else {
      _paintBriefingDefault(area, meeting, workstreamId);
    }
  }

  // ── State A: mechanical default ───────────────────────────────
  function _paintBriefingDefault(area, meeting, workstreamId) {
    area.innerHTML = '<div class="ac-setup-briefing-default">' +
      '<div class="ac-setup-briefing-default-text ac-agenda-loading">Loading\u2026</div>' +
      '<div class="ac-setup-briefing-default-actions">' +
        '<button type="button" class="ac-setup-briefing-edit-btn">Edit briefing</button>' +
      '</div>' +
    '</div>';

    var textEl = area.querySelector('.ac-setup-briefing-default-text');

    if (!workstreamId) {
      textEl.textContent = 'Standalone meeting \u2014 no workstream context.';
      _wireEditBtn(area, meeting, workstreamId, textEl.textContent);
      return;
    }

    // Parallel fetch: prior meetings + (if any) last meeting node counts
    API.get(
      'accord_meetings?workstream_id=eq.' + workstreamId +
      '&meeting_id=neq.' + meeting.meeting_id +
      '&state=in.(closed,sealed)' +
      '&select=meeting_id,title,scheduled_for,sealed_at' +
      '&order=scheduled_for.desc.nullslast,created_at.desc'
    ).then(function (priorMeetings) {
      priorMeetings = priorMeetings || [];
      if (!priorMeetings.length) {
        var txt = 'First meeting in this workstream. No prior context.';
        textEl.textContent = txt;
        _wireEditBtn(area, meeting, workstreamId, txt);
        return;
      }
      var last = priorMeetings[0];
      var n    = priorMeetings.length;
      return API.get(
        'accord_nodes?meeting_id=eq.' + last.meeting_id + '&select=tag'
      ).then(function (nodes) {
        nodes = nodes || [];
        var counts = { decision: 0, action: 0, risk: 0 };
        nodes.forEach(function (nd) {
          if (counts[nd.tag] !== undefined) counts[nd.tag]++;
        });
        var dateStr = '';
        if (last.scheduled_for) {
          try {
            dateStr = new Date(last.scheduled_for).toLocaleDateString([], {
              month: 'short', day: 'numeric', year: 'numeric'
            });
          } catch (e) {}
        }
        var wsName = _workstreamName || 'this workstream';
        var countParts = [];
        if (counts.decision) countParts.push(counts.decision + ' decision' + (counts.decision > 1 ? 's' : ''));
        if (counts.action)   countParts.push(counts.action   + ' action'   + (counts.action   > 1 ? 's' : ''));
        if (counts.risk)     countParts.push(counts.risk     + ' risk'     + (counts.risk     > 1 ? 's' : ''));
        var countStr = countParts.length ? countParts.join(', ') + ' captured.' : 'No decisions, actions, or risks captured.';
        var txt = 'Meeting ' + (n + 1) + ' in ' + wsName + '.\n' +
                  'Last meeting: ' + (last.title || 'Untitled') + (dateStr ? ' (' + dateStr + ')' : '') + '.\n' +
                  countStr;
        textEl.textContent = txt;
        _wireEditBtn(area, meeting, workstreamId, txt);
      });
    }).catch(function (e) {
      console.error('[AccordMeetingSetup] briefing default fetch failed', e);
      textEl.textContent = 'Could not load prior context.';
      _wireEditBtn(area, meeting, workstreamId, '');
    });
  }

  function _wireEditBtn(area, meeting, workstreamId, mechanicalText) {
    var btn = area.querySelector('.ac-setup-briefing-edit-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      _switchToEdit(area, meeting, workstreamId, mechanicalText);
    });
  }

  // ── State B: override textarea ────────────────────────────────
  function _paintBriefingEdit(area, meeting, workstreamId, seed) {
    var val = (meeting.briefing_text != null) ? meeting.briefing_text : (seed || '');
    area.innerHTML =
      '<div class="ac-setup-briefing-edit">' +
        '<textarea class="ac-setup-briefing-textarea" aria-label="Meeting briefing">' +
          esc(val) +
        '</textarea>' +
        '<div class="ac-setup-briefing-edit-actions">' +
          '<button type="button" class="ac-setup-briefing-reset-btn">Reset to default</button>' +
        '</div>' +
      '</div>';

    var textarea = area.querySelector('.ac-setup-briefing-textarea');
    _wireBriefingAutosave(textarea, meeting.meeting_id);

    var resetBtn = area.querySelector('.ac-setup-briefing-reset-btn');
    resetBtn.addEventListener('click', function () {
      if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
      API.patch('accord_meetings?meeting_id=eq.' + meeting.meeting_id, {
        briefing_text: null
      }).then(function () {
        meeting.briefing_text = null;
        _paintBriefingDefault(area, meeting, workstreamId);
      }).catch(function (e) {
        console.error('[AccordMeetingSetup] reset briefing failed', e);
      });
    });

    setTimeout(function () { if (textarea) textarea.focus(); }, 30);
  }

  function _switchToEdit(area, meeting, workstreamId, mechanicalText) {
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
    _paintBriefingEdit(area, meeting, workstreamId, mechanicalText);
  }

  // ══════════════════════════════════════════════════════════════
  // AGENDA COLUMN
  // ══════════════════════════════════════════════════════════════

  function _fetchAgendaItems(meetingId) {
    return API.get(
      'accord_agenda_items?meeting_id=eq.' + meetingId +
      '&order=position.asc,created_at.asc&select=*'
    ).then(function (rows) { return rows || []; });
  }

  // ── Pulled badge ──────────────────────────────────────────────
  function _pulledBadge(item) {
    if (!item.pulled_from_node_id) return '';
    var tag   = item.pulled_from_tag || '';
    var label = tag ? ('\u2190 ' + tag.toUpperCase()) : '\u2190 pulled';
    var cls   = 'ac-agenda-pulled-badge' + (tag ? ' ac-agenda-pulled-' + tag.toLowerCase() : '');
    return '<span class="' + esc(cls) + '">' + esc(label) + '</span>';
  }

  // ── Build item row HTML ───────────────────────────────────────
  function _itemHTML(item, pos, isFirst, isLast) {
    return (
      '<li class="ac-agenda-item" data-item-id="' + esc(item.agenda_item_id) + '">' +
        '<span class="ac-agenda-item-pos">' + pos + '</span>' +
        '<span class="ac-agenda-item-title" data-orig="' + esc(item.title) + '">' +
          esc(item.title) +
        '</span>' +
        _pulledBadge(item) +
        '<span class="ac-agenda-item-controls">' +
          '<button class="ac-agenda-up" data-action="up" title="Move up"' +
            (isFirst ? ' disabled' : '') + '>\u25b2</button>' +
          '<button class="ac-agenda-down" data-action="down" title="Move down"' +
            (isLast ? ' disabled' : '') + '>\u25bc</button>' +
          '<button class="ac-agenda-del" data-action="del" title="Remove">\u00d7</button>' +
        '</span>' +
      '</li>'
    );
  }

  // ── Paint agenda ──────────────────────────────────────────────
  function _paintAgenda(area, items, meeting, workstreamId) {
    var firmId = (window.Accord && window.Accord.state && window.Accord.state.meeting)
      ? window.Accord.state.meeting.firm_id : null;

    var orgItems  = items.filter(function (i) { return !i.pulled_from_node_id; });
    var pullItems = items.filter(function (i) { return !!i.pulled_from_node_id; });
    var posCounter = 0;

    var listHTML = '<ul class="ac-agenda-list">';
    orgItems.forEach(function (item, i) {
      posCounter++;
      listHTML += _itemHTML(item, posCounter, i === 0, i === orgItems.length - 1);
    });
    listHTML += '</ul>';

    if (orgItems.length && pullItems.length) {
      listHTML += '<hr class="ac-agenda-section-divider">';
    }

    if (pullItems.length) {
      listHTML += '<ul class="ac-agenda-list">';
      pullItems.forEach(function (item, i) {
        posCounter++;
        listHTML += _itemHTML(item, posCounter, i === 0, i === pullItems.length - 1);
      });
      listHTML += '</ul>';
    }

    var addRow = (
      '<div class="ac-agenda-add-row">' +
        '<input type="text" class="ac-agenda-add-input" placeholder="Add agenda item\u2026" ' +
          'aria-label="New agenda item">' +
        '<button type="button" class="ac-agenda-add-btn" title="Add">+</button>' +
      '</div>'
    );
    var pullRow = workstreamId
      ? '<div class="ac-agenda-pull-row">' +
          '<button type="button" class="ac-agenda-pull-btn">\u2190 Pull from prior meeting</button>' +
        '</div>'
      : '';

    area.innerHTML = listHTML + addRow + pullRow;
    _wireAgendaEvents(area, items, meeting, workstreamId, firmId);
  }

  // ── Agenda event delegation ───────────────────────────────────
  function _wireAgendaEvents(area, items, meeting, workstreamId, firmId) {

    // Reorder
    area.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-action="up"],[data-action="down"]');
      if (!btn || btn.disabled) return;
      var row = btn.closest('.ac-agenda-item');
      if (!row) return;
      _reorderItem(row.dataset.itemId, btn.dataset.action, items, meeting, workstreamId);
    });

    // Delete
    area.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-action="del"]');
      if (!btn) return;
      var row = btn.closest('.ac-agenda-item');
      if (!row) return;
      API.del('accord_agenda_items?agenda_item_id=eq.' + row.dataset.itemId)
        .then(function () { return _refreshAgenda(meeting, workstreamId); })
        .catch(function (e) { console.error('[AccordMeetingSetup] delete failed', e); });
    });

    // Inline edit — click to activate
    area.addEventListener('click', function (ev) {
      var titleEl = ev.target.closest('.ac-agenda-item-title');
      if (!titleEl || titleEl.contentEditable === 'true') return;
      titleEl.contentEditable = 'true';
      titleEl.focus();
      var range = document.createRange();
      range.selectNodeContents(titleEl);
      range.collapse(false);
      var sel = window.getSelection();
      if (sel) { sel.removeAllRanges(); sel.addRange(range); }
    });

    // Inline edit — save on blur
    area.addEventListener('focusout', function (ev) {
      var titleEl = ev.target.closest('.ac-agenda-item-title');
      if (!titleEl || titleEl.contentEditable !== 'true') return;
      titleEl.contentEditable = 'false';
      var newVal = titleEl.textContent.trim();
      var orig   = titleEl.dataset.orig || '';
      if (!newVal || newVal === orig) { titleEl.textContent = orig; return; }
      var row    = titleEl.closest('.ac-agenda-item');
      var itemId = row && row.dataset.itemId;
      if (!itemId) return;
      API.patch('accord_agenda_items?agenda_item_id=eq.' + itemId, { title: newVal })
        .then(function () { titleEl.dataset.orig = newVal; })
        .catch(function (e) {
          console.error('[AccordMeetingSetup] title PATCH failed', e);
          titleEl.textContent = orig;
        });
    });

    // Inline edit — keyboard
    area.addEventListener('keydown', function (ev) {
      var titleEl = ev.target.closest('.ac-agenda-item-title');
      if (!titleEl || titleEl.contentEditable !== 'true') return;
      if (ev.key === 'Enter') { ev.preventDefault(); titleEl.blur(); }
      else if (ev.key === 'Escape') {
        titleEl.textContent = titleEl.dataset.orig || '';
        titleEl.contentEditable = 'false';
      }
    });

    // Add-item — Enter
    area.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter') return;
      var input = ev.target.closest('.ac-agenda-add-input');
      if (!input) return;
      ev.preventDefault();
      _addItem(input, items, meeting, workstreamId, firmId);
    });

    // Add-item — button
    area.addEventListener('click', function (ev) {
      if (!ev.target.closest('.ac-agenda-add-btn')) return;
      var input = area.querySelector('.ac-agenda-add-input');
      if (input) _addItem(input, items, meeting, workstreamId, firmId);
    });

    // Pull picker open
    area.addEventListener('click', function (ev) {
      if (!ev.target.closest('.ac-agenda-pull-btn')) return;
      _openPullPicker(area, items, meeting, workstreamId, firmId);
    });

    // Pull picker close
    area.addEventListener('click', function (ev) {
      if (!ev.target.closest('.ac-agenda-pull-close')) return;
      _closePullPicker(area, workstreamId);
    });

    // Pull node select
    area.addEventListener('click', function (ev) {
      var nodeRow = ev.target.closest('.ac-agenda-pull-node');
      if (!nodeRow) return;
      _pullNode(nodeRow.dataset.nodeId, nodeRow.dataset.summary,
                nodeRow.dataset.tag, items, meeting, workstreamId, firmId);
    });
  }

  // ── Add item ──────────────────────────────────────────────────
  function _addItem(input, items, meeting, workstreamId, firmId) {
    var title = input.value.trim();
    if (!title) return;
    var useFirmId = firmId ||
      (window.Accord && window.Accord.state && window.Accord.state.meeting &&
       window.Accord.state.meeting.firm_id);
    input.value = '';
    input.disabled = true;
    _fetchMaxPosition(meeting.meeting_id).then(function (maxPos) {
      return API.post('accord_agenda_items', {
        firm_id:    useFirmId,
        meeting_id: meeting.meeting_id,
        title:      title,
        position:   maxPos + 1,
        status:     'pending'
      });
    }).then(function () {
      return _refreshAgenda(meeting, workstreamId);
    }).catch(function (e) {
      console.error('[AccordMeetingSetup] add item failed', e);
      input.value = title;
    }).then(function () {
      input.disabled = false;
      input.focus();
    });
  }

  // ── Reorder ───────────────────────────────────────────────────
  function _reorderItem(itemId, dir, items, meeting, workstreamId) {
    // Reorder within group only — find item in its group
    var orgItems  = items.filter(function (i) { return !i.pulled_from_node_id; });
    var pullItems = items.filter(function (i) { return !!i.pulled_from_node_id; });
    var group = null;
    var idx   = -1;
    for (var i = 0; i < orgItems.length; i++) {
      if (orgItems[i].agenda_item_id === itemId) { group = orgItems; idx = i; break; }
    }
    if (idx < 0) {
      for (var j = 0; j < pullItems.length; j++) {
        if (pullItems[j].agenda_item_id === itemId) { group = pullItems; idx = j; break; }
      }
    }
    if (!group || idx < 0) return;
    var swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= group.length) return;

    var idA = group[idx].agenda_item_id,    posA = group[idx].position;
    var idB = group[swapIdx].agenda_item_id, posB = group[swapIdx].position;

    API.patch('accord_agenda_items?agenda_item_id=eq.' + idA, { position: posB })
      .then(function () {
        return API.patch('accord_agenda_items?agenda_item_id=eq.' + idB, { position: posA });
      })
      .then(function () { return _refreshAgenda(meeting, workstreamId); })
      .catch(function (e) {
        console.error('[AccordMeetingSetup] reorder failed', e);
        _refreshAgenda(meeting, workstreamId);
      });
  }

  // ── Pull picker ───────────────────────────────────────────────
  function _openPullPicker(area, items, meeting, workstreamId, firmId) {
    var pullRow = area.querySelector('.ac-agenda-pull-row');
    if (!pullRow) return;

    // Build set of already-pulled node IDs to filter duplicates
    var alreadyPulled = {};
    items.forEach(function (i) {
      if (i.pulled_from_node_id) alreadyPulled[i.pulled_from_node_id] = true;
    });

    pullRow.innerHTML = '<div class="ac-agenda-pull-panel">' +
      '<div class="ac-agenda-pull-header">Pull from prior meeting ' +
        '<button type="button" class="ac-agenda-pull-close" title="Close">\u00d7</button>' +
      '</div>' +
      '<div class="ac-agenda-pull-empty">Loading\u2026</div>' +
    '</div>';

    API.get(
      'accord_meetings?workstream_id=eq.' + workstreamId +
      '&meeting_id=neq.' + meeting.meeting_id +
      '&state=in.(closed,sealed)' +
      '&select=meeting_id,title,sealed_at,scheduled_for' +
      '&order=scheduled_for.desc.nullslast,created_at.desc' +
      '&limit=8'
    ).then(function (priorMeetings) {
      priorMeetings = priorMeetings || [];
      if (!priorMeetings.length) {
        var panel = pullRow.querySelector('.ac-agenda-pull-panel');
        if (panel) panel.querySelector('.ac-agenda-pull-empty').textContent =
          'No prior meetings in this workstream.';
        return;
      }
      var priorIds = priorMeetings.map(function (m) { return m.meeting_id; });
      var meetingMap = {};
      priorMeetings.forEach(function (m) { meetingMap[m.meeting_id] = m; });

      return API.get(
        'accord_nodes?meeting_id=in.(' + priorIds.join(',') + ')' +
        '&tag=in.(action,decision,dissent)' +
        '&select=node_id,summary,tag,meeting_id,created_at' +
        '&order=created_at.desc' +
        '&limit=30'
      ).then(function (nodes) {
        nodes = (nodes || []).filter(function (n) { return !alreadyPulled[n.node_id]; });
        var panel = pullRow.querySelector('.ac-agenda-pull-panel');
        if (!panel) return;
        if (!nodes.length) {
          panel.querySelector('.ac-agenda-pull-empty').textContent =
            'No unpulled action, decision, or dissent nodes in prior meetings.';
          return;
        }
        var listHTML = '';
        nodes.forEach(function (n) {
          var mtg = meetingMap[n.meeting_id] || {};
          var dateStr = '';
          if (mtg.scheduled_for) {
            try {
              dateStr = new Date(mtg.scheduled_for).toLocaleDateString([], {
                month: 'short', day: 'numeric', year: 'numeric'
              });
            } catch (e) {}
          }
          listHTML += (
            '<div class="ac-agenda-pull-node" ' +
              'data-node-id="' + esc(n.node_id) + '" ' +
              'data-summary="' + esc(n.summary) + '" ' +
              'data-tag="' + esc(n.tag) + '">' +
              '<span class="ac-agenda-pull-tag" data-tag="' + esc(n.tag) + '">' +
                esc(n.tag.toUpperCase()) +
              '</span>' +
              '<span class="ac-agenda-pull-text">' + esc(truncate(n.summary, 120)) + '</span>' +
              '<span class="ac-agenda-pull-meta">' +
                esc(mtg.title || '') + (dateStr ? ' \u00b7 ' + dateStr : '') +
              '</span>' +
            '</div>'
          );
        });
        panel.querySelector('.ac-agenda-pull-empty').outerHTML = listHTML;
      });
    }).catch(function (e) {
      console.error('[AccordMeetingSetup] pull picker fetch failed', e);
      var panel = pullRow.querySelector('.ac-agenda-pull-panel');
      if (panel) panel.querySelector('.ac-agenda-pull-empty').textContent =
        'Could not load prior nodes.';
    });
  }

  function _closePullPicker(area, workstreamId) {
    var pullRow = area.querySelector('.ac-agenda-pull-row');
    if (pullRow) {
      pullRow.innerHTML = workstreamId
        ? '<button type="button" class="ac-agenda-pull-btn">\u2190 Pull from prior meeting</button>'
        : '';
    }
  }

  // ── Pull node → insert ────────────────────────────────────────
  function _pullNode(nodeId, summary, tag, items, meeting, workstreamId, firmId) {
    var useFirmId = firmId ||
      (window.Accord && window.Accord.state && window.Accord.state.meeting &&
       window.Accord.state.meeting.firm_id);
    var area = document.getElementById('ac-setup-agenda-area');
    _closePullPicker(area, workstreamId);
    _fetchMaxPosition(meeting.meeting_id).then(function (maxPos) {
      return API.post('accord_agenda_items', {
        firm_id:             useFirmId,
        meeting_id:          meeting.meeting_id,
        title:               summary,
        position:            maxPos + 1,
        status:              'pending',
        pulled_from_node_id: nodeId,
        pulled_from_tag:     tag || null
      });
    }).then(function () {
      return _refreshAgenda(meeting, workstreamId);
    }).catch(function (e) {
      console.error('[AccordMeetingSetup] pull node insert failed', e);
    });
  }

  function _fetchMaxPosition(meetingId) {
    return API.get(
      'accord_agenda_items?meeting_id=eq.' + meetingId +
      '&select=position&order=position.desc&limit=1'
    ).then(function (rows) {
      return (rows && rows[0] && rows[0].position) ? rows[0].position : 0;
    });
  }

  // ── Agenda refresh / initial render ──────────────────────────
  function _refreshAgenda(meeting, workstreamId) {
    var area = document.getElementById('ac-setup-agenda-area');
    if (!area) return Promise.resolve();
    return _fetchAgendaItems(meeting.meeting_id).then(function (items) {
      if (_agendaFetchAborted) return;
      _paintAgenda(area, items, meeting, workstreamId);
    }).catch(function (e) {
      console.error('[AccordMeetingSetup] agenda refresh failed', e);
    });
  }

  function _renderAgenda(meeting, workstreamId) {
    _agendaFetchAborted = false;
    var area = document.getElementById('ac-setup-agenda-area');
    if (!area) return;
    _fetchAgendaItems(meeting.meeting_id).then(function (items) {
      if (_agendaFetchAborted) return;
      _paintAgenda(area, items, meeting, workstreamId);
    }).catch(function (e) {
      console.error('[AccordMeetingSetup] agenda fetch failed', e);
      if (!_agendaFetchAborted && area) {
        area.innerHTML = '<div class="ac-agenda-error">Could not load agenda.</div>';
      }
    });
  }

  // ══════════════════════════════════════════════════════════════
  // HEADER — CMD-ACCORD-SETUP-HEADER-1
  // §5 render functions + §6 edit wiring + §5.6 countdown.
  // ══════════════════════════════════════════════════════════════

  function _renderHeader(meeting, workstreamId) {
    _paintTitle(meeting);
    _paintStakes(meeting);
    _paintMeta(meeting, workstreamId);
    _paintModeToggle(meeting, workstreamId);
    _wireHeaderEdits(meeting);
    _startCountdown(meeting);
  }

  // §5.1 — Title
  function _paintTitle(meeting) {
    var el = document.getElementById('ac-meeting-title');
    if (!el) return;
    el.textContent = meeting.title || '';
  }

  // §5.2 — Stakes
  function _paintStakes(meeting) {
    var el = document.getElementById('ac-meeting-stakes');
    if (!el) return;
    if (meeting.stakes) {
      el.textContent = meeting.stakes;
      el.classList.remove('ac-placeholder');
    } else {
      el.textContent = '';
      el.classList.add('ac-placeholder');
    }
  }

  // §5.3 — Meta rows: WHEN + WHERE + WORKSTREAM (async)
  function _paintMeta(meeting, workstreamId) {
    var whenEl = document.getElementById('ac-meta-when');
    if (whenEl) {
      whenEl.innerHTML = _fmtWhen(meeting.scheduled_for, meeting.duration_minutes);
    }
    _wireWhenPicker(meeting);   // X-14: replaces X-12 _wireDurationEdit

    var whereEl = document.getElementById('ac-meta-where');
    if (whereEl) {
      if (meeting.location) {
        whereEl.textContent = meeting.location;
        whereEl.classList.remove('ac-placeholder');
      } else {
        whereEl.textContent = '';
        whereEl.classList.add('ac-placeholder');
      }
    }

    _paintWorkstreamMeta(workstreamId, meeting.meeting_id);
  }

  function _fmtWhen(scheduledFor, durationMinutes) {
    if (!scheduledFor) return '\u2014';
    var d         = new Date(scheduledFor);
    var opts      = { weekday: 'short', month: 'short', day: 'numeric' };
    var date      = d.toLocaleDateString(undefined, opts);
    var startTime = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    var timeStr   = startTime;
    if (durationMinutes) {
      var end     = new Date(d.getTime() + durationMinutes * 60000);
      var endTime = end.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      timeStr += ' \u2014 ' + endTime;
    }
    return '<span class="ac-when-date">' + esc(date) + '</span>' +
           ' \u00b7 ' +
           '<span class="ac-when-time">' + esc(timeStr) + '</span>';
  }

  // §5.4 — WORKSTREAM meta (async two-pass: initial '—', then populated)
  function _paintWorkstreamMeta(workstreamId, currentMeetingId) {
    var el = document.getElementById('ac-meta-workstream');
    if (!el) return;
    if (!workstreamId) { el.textContent = 'No workstream'; return; }

    Promise.all([
      API.get('workstreams?workstream_id=eq.' + workstreamId + '&select=name&limit=1'),
      API.get(
        'accord_meetings?workstream_id=eq.' + workstreamId +
        '&meeting_id=neq.' + currentMeetingId +
        '&state=in.(closed,sealed)' +
        '&select=meeting_id,sealed_at,scheduled_for' +
        '&order=scheduled_for.desc.nullslast,created_at.desc' +
        '&limit=1'
      )
    ]).then(function(results) {
      var ws      = results[0] && results[0][0];
      var lastMtg = results[1] && results[1][0];
      var elNow   = document.getElementById('ac-meta-workstream'); // IR71: re-query after async
      if (!elNow) return;
      var name    = ws ? ws.name : 'Unknown workstream';
      var lastStr = '';
      if (lastMtg) {
        var lastDate = new Date(lastMtg.sealed_at || lastMtg.scheduled_for);
        var daysAgo  = Math.round((Date.now() - lastDate.getTime()) / 86400000);
        lastStr = ' \u00b7 last met ' + daysAgo + 'd ago';
      } else {
        lastStr = ' \u00b7 first meeting';
      }
      elNow.textContent = name + lastStr;
    }).catch(function() {
      var elNow = document.getElementById('ac-meta-workstream');
      if (elNow) elNow.textContent = '\u2014';
    });
  }

  // §5.5 — FOLLOW-UP / FIRST-EVER toggle (async, derived — not operator-settable)
  function _paintModeToggle(meeting, workstreamId) {
    var fuEl = document.getElementById('ac-mode-followup');
    var feEl = document.getElementById('ac-mode-firstever');
    if (!fuEl || !feEl) return;

    if (!workstreamId) {
      // Parking-lot meeting: always FIRST-EVER
      fuEl.classList.remove('active');
      feEl.classList.add('active');
      return;
    }

    API.get(
      'accord_meetings?workstream_id=eq.' + workstreamId +
      '&meeting_id=neq.' + meeting.meeting_id +
      '&state=in.(closed,sealed)' +
      '&select=meeting_id&limit=1'
    ).then(function(rows) {
      // IR71: re-query elements after async (teardown may have fired)
      var fuNow = document.getElementById('ac-mode-followup');
      var feNow = document.getElementById('ac-mode-firstever');
      if (!fuNow || !feNow) return;
      var isFollowUp = rows && rows.length > 0;
      fuNow.classList.toggle('active', isFollowUp);
      feNow.classList.toggle('active', !isFollowUp);
    }).catch(function() {
      var fuNow = document.getElementById('ac-mode-followup');
      var feNow = document.getElementById('ac-mode-firstever');
      if (fuNow) fuNow.classList.remove('active');
      if (feNow) feNow.classList.remove('active');
    });
  }

  // §5.6 — STARTS IN countdown (shown only within 24h of scheduled_for)
  function _startCountdown(meeting) {
    _stopCountdown();
    if (!meeting.scheduled_for) return;

    function _tick() {
      var row = document.getElementById('ac-meta-starts-row');
      var el  = document.getElementById('ac-meta-starts');
      if (!row || !el) { _stopCountdown(); return; }

      var now    = Date.now();
      var target = new Date(meeting.scheduled_for).getTime();
      var diffMs = target - now;

      if (diffMs < 0 || diffMs > 86400000) {
        row.style.display = 'none';
        return;
      }

      row.style.display = '';
      var diffMin = Math.round(diffMs / 60000);
      if (diffMin < 1) {
        el.textContent = 'Starting now';
      } else if (diffMin < 60) {
        el.textContent = 'Starts in ' + diffMin + 'min';
      } else {
        var h = Math.floor(diffMin / 60);
        var m = diffMin % 60;
        el.textContent = 'Starts in ' + h + 'h' + (m ? ' ' + m + 'min' : '');
      }

      // 5-minute warning: rose colour (adds imminent class)
      el.classList.toggle('ac-meta-starts--imminent', diffMin <= 5);
    }

    _tick();
    _countdownTimer = setInterval(_tick, 30000);
  }

  function _stopCountdown() {
    if (_countdownTimer) { clearInterval(_countdownTimer); _countdownTimer = null; }
  }

  // §6 — Edit wiring: title, stakes, location
  // One 800ms debounce timer per field, keyed by column name.
  // Immediate PATCH on blur cancels the debounce — blur is the
  // save signal; debounce exists only to reduce mid-type traffic.
  // IR71: `el` captured in forEach closure at wire time — synchronous
  // so no async mutation risk; blur fires before any DOM wipe.
  function _wireHeaderEdits(meeting) {
    var fields = [
      { id: 'ac-meeting-title',  col: 'title',    singleLine: true  },
      { id: 'ac-meeting-stakes', col: 'stakes',   singleLine: false },
      { id: 'ac-meta-where',     col: 'location', singleLine: false }
    ];

    fields.forEach(function(f) {
      var el = document.getElementById(f.id);
      if (!el) return;

      el.addEventListener('input', function() {
        var val = el.textContent.trim();

        // Placeholder toggle (stakes + where have data-placeholder)
        if (el.dataset.placeholder) {
          el.classList.toggle('ac-placeholder', !val);
        }

        // Debounce PATCH
        if (_headerSaveTimers[f.col]) clearTimeout(_headerSaveTimers[f.col]);
        _headerSaveTimers[f.col] = setTimeout(function() {
          _headerSaveTimers[f.col] = null;
          var body = {};
          body[f.col] = val || null;
          API.patch('accord_meetings?meeting_id=eq.' + meeting.meeting_id, body)
            .catch(function(e) {
              console.error('[AccordMeetingSetup] header PATCH failed (' + f.col + ')', e);
            });
        }, 800);
      });

      // Title is single-line: Enter blurs instead of inserting <br>
      if (f.singleLine) {
        el.addEventListener('keydown', function(ev) {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            el.blur();
          }
        });
      }

      // Blur: immediate PATCH, cancel debounce
      el.addEventListener('blur', function() {
        if (_headerSaveTimers[f.col]) {
          clearTimeout(_headerSaveTimers[f.col]);
          _headerSaveTimers[f.col] = null;
        }
        var val = el.textContent.trim();
        var body = {};
        body[f.col] = val || null;
        API.patch('accord_meetings?meeting_id=eq.' + meeting.meeting_id, body)
          .catch(function(e) {
            console.error('[AccordMeetingSetup] header blur PATCH failed (' + f.col + ')', e);
          });
      });
    });
  }

  // ══════════════════════════════════════════════════════════════
  // LAYOUT — CMD-ACCORD-SETUP-LAYOUT-1
  // Column resize, filmstrip resize, Cmd+I stub.
  // IR71: drag state holds primitives only; DOM is re-queried in
  // every handler so that an in-flight teardown + re-render does
  // not strand listeners pointing at detached nodes.
  // ══════════════════════════════════════════════════════════════

  // ── Column width init from localStorage ──────────────────────
  function _initColWidths() {
    var cols = document.querySelector('.ac-setup-columns');
    if (!cols) return;
    try {
      var lw = localStorage.getItem(LS_KEY_LEFT);
      var rw = localStorage.getItem(LS_KEY_RIGHT);
      if (lw) {
        var lwn = parseInt(lw, 10);
        if (lwn >= COL_MIN_W && lwn <= COL_MAX_W) {
          cols.style.setProperty('--col-left-w', lwn + 'px');
        }
      }
      if (rw) {
        var rwn = parseInt(rw, 10);
        if (rwn >= COL_MIN_W && rwn <= COL_MAX_W) {
          cols.style.setProperty('--col-right-w', rwn + 'px');
        }
      }
    } catch (e) {}
  }

  // ── Column drag handlers ─────────────────────────────────────
  function _wireColumnHandles() {
    var handles = document.querySelectorAll('.ac-col-handle');
    for (var i = 0; i < handles.length; i++) {
      handles[i].addEventListener('mousedown', _onHandleMouseDown);
    }
  }

  function _onHandleMouseDown(ev) {
    var handle = ev.currentTarget;
    var cols = document.querySelector('.ac-setup-columns');
    if (!cols) return;
    var cs = getComputedStyle(cols);
    _colDrag.active      = true;
    _colDrag.handle      = handle.dataset.handle;
    _colDrag.startX      = ev.clientX;
    _colDrag.startLeftW  = parseInt(cs.getPropertyValue('--col-left-w'),  10) || 360;
    _colDrag.startRightW = parseInt(cs.getPropertyValue('--col-right-w'), 10) || 380;
    handle.classList.add('dragging');
    document.addEventListener('mousemove', _onHandleMouseMove);
    document.addEventListener('mouseup',   _onHandleMouseUp);
    ev.preventDefault();
  }

  function _onHandleMouseMove(ev) {
    if (!_colDrag.active) return;
    var dx = ev.clientX - _colDrag.startX;
    var cols = document.querySelector('.ac-setup-columns');
    if (!cols) return;
    var newW;
    if (_colDrag.handle === 'left') {
      newW = Math.max(COL_MIN_W, Math.min(COL_MAX_W, _colDrag.startLeftW + dx));
      cols.style.setProperty('--col-left-w', newW + 'px');
    } else {
      // 'right' handle is on the right border of the center column.
      // Dragging it right (positive dx) shrinks the right column.
      newW = Math.max(COL_MIN_W, Math.min(COL_MAX_W, _colDrag.startRightW - dx));
      cols.style.setProperty('--col-right-w', newW + 'px');
    }
  }

  function _onHandleMouseUp(ev) {
    if (!_colDrag.active) return;
    _colDrag.active = false;
    var dragging = document.querySelectorAll('.ac-col-handle.dragging');
    for (var i = 0; i < dragging.length; i++) {
      dragging[i].classList.remove('dragging');
    }
    document.removeEventListener('mousemove', _onHandleMouseMove);
    document.removeEventListener('mouseup',   _onHandleMouseUp);
    // Persist
    var cols = document.querySelector('.ac-setup-columns');
    if (cols) {
      var cs = getComputedStyle(cols);
      try {
        var lw = (cs.getPropertyValue('--col-left-w')  || '').trim();
        var rw = (cs.getPropertyValue('--col-right-w') || '').trim();
        if (lw) localStorage.setItem(LS_KEY_LEFT,  lw);
        if (rw) localStorage.setItem(LS_KEY_RIGHT, rw);
      } catch (e) {}
    }
  }

  // ── Filmstrip height init from localStorage ──────────────────
  function _initFilmstripHeight() {
    var shell = document.querySelector('.ac-setup-shell');
    if (!shell) return;
    try {
      var hRaw = localStorage.getItem(LS_KEY_FILM);
      if (!hRaw) return;
      var h = parseInt(hRaw, 10);
      if (!h || h < FILM_MIN_H) h = FILM_MIN_H;
      if (h > FILM_MAX_H) h = FILM_MAX_H;
      _setShellFilmstripRow(shell, h);
    } catch (e) {}
  }

  function _setShellFilmstripRow(shell, h) {
    // Header is auto, columns is 1fr, filmstrip is the variable, footer is 54px.
    shell.style.gridTemplateRows = 'auto 1fr ' + h + 'px ' + FOOTER_H + 'px';
  }

  // ── Filmstrip drag handlers ──────────────────────────────────
  function _wireFilmstripHandle() {
    var handle = document.querySelector('.ac-filmstrip-handle');
    if (!handle) return;
    handle.addEventListener('mousedown', _onFilmHandleMouseDown);
  }

  function _onFilmHandleMouseDown(ev) {
    var handle = ev.currentTarget;
    var strip  = document.querySelector('.ac-setup-filmstrip');
    if (!strip) return;
    _filmDrag.active = true;
    _filmDrag.startY = ev.clientY;
    _filmDrag.startH = strip.offsetHeight || FILM_DEFAULT;
    handle.classList.add('dragging');
    document.addEventListener('mousemove', _onFilmHandleMouseMove);
    document.addEventListener('mouseup',   _onFilmHandleMouseUp);
    ev.preventDefault();
  }

  function _onFilmHandleMouseMove(ev) {
    if (!_filmDrag.active) return;
    var shell = document.querySelector('.ac-setup-shell');
    if (!shell) return;
    // Drag handle is on the TOP edge of the filmstrip — pulling the cursor
    // up (negative dy) should grow the filmstrip.
    var dy   = ev.clientY - _filmDrag.startY;
    var newH = Math.max(FILM_MIN_H, Math.min(FILM_MAX_H, _filmDrag.startH - dy));
    _setShellFilmstripRow(shell, newH);
  }

  function _onFilmHandleMouseUp(ev) {
    if (!_filmDrag.active) return;
    _filmDrag.active = false;
    var dragging = document.querySelectorAll('.ac-filmstrip-handle.dragging');
    for (var i = 0; i < dragging.length; i++) {
      dragging[i].classList.remove('dragging');
    }
    document.removeEventListener('mousemove', _onFilmHandleMouseMove);
    document.removeEventListener('mouseup',   _onFilmHandleMouseUp);
    // Persist final height
    var strip = document.querySelector('.ac-setup-filmstrip');
    if (strip) {
      try { localStorage.setItem(LS_KEY_FILM, String(strip.offsetHeight)); }
      catch (e) {}
    }
  }

  // ── Intelligence Mode keystroke (Wave 2 stub per §8.2) ───────
  function _onIntelKey(ev) {
    // ev.key is case-sensitive: 'i' = Ctrl+I alone; 'I' = Ctrl+Shift+I.
    // Guard !ev.shiftKey explicitly so Ctrl+Shift+I (DevTools) is never swallowed.
    if ((ev.metaKey || ev.ctrlKey) && !ev.shiftKey && ev.key === 'i') {
      ev.preventDefault();
      var overlay = document.getElementById('ac-intel-overlay');
      if (!overlay) return;
      // Wave 2 (CMD-ACCORD-SETUP-INTELLIGENCE-1) replaces this stub.
      console.log('[AccordMeetingSetup] Intelligence Mode: not yet implemented');
    }
  }

  // ══════════════════════════════════════════════════════════════
  // OUTCOMES — CMD-ACCORD-SETUP-OUTCOMES-1
  // §5 render + CRUD + wire. V1 resource columns: id (PK), name.
  // Commission bug fix: _addOutcomeFormHtml submit/cancel buttons
  // given data-action attrs (commission had id-only; delegation
  // checks dataset.action so id-only buttons would never fire).
  // ══════════════════════════════════════════════════════════════

  // §5.1 — Entry point
  function _renderOutcomes(meeting) {
    var host = document.querySelector('.ac-col-tabbody[data-col="center"]');
    if (!host) return;
    // Prepend outcomes container above existing agenda placeholder
    var existing = host.innerHTML;
    host.innerHTML = '<div class="ac-outcomes-block" id="ac-outcomes-block"></div>' + existing;
    _loadOutcomes(meeting);
  }

  // §5.2 — Load (fetch → resolve owner names → paint)
  function _loadOutcomes(meeting) {
    _outcomesAborted = false;
    var block = document.getElementById('ac-outcomes-block');
    if (!block) return;
    block.innerHTML = '<div class="ac-outcomes-loading">Loading\u2026</div>';

    API.get(
      'accord_meeting_outcomes?meeting_id=eq.' + meeting.meeting_id +
      '&order=position.asc,created_at.asc' +
      '&select=*'
    ).then(function(rows) {
      if (_outcomesAborted) return;
      _resolveOwnerNames(rows || [], function(resolved) {
        if (_outcomesAborted) return;
        var block = document.getElementById('ac-outcomes-block'); // IR71: re-query after async
        if (!block) return;
        _paintOutcomes(block, resolved, meeting);
      });
    }).catch(function(e) {
      console.error('[AccordMeetingSetup] outcomes fetch failed', e);
      var block = document.getElementById('ac-outcomes-block');
      if (block) block.innerHTML = '<div class="ac-outcomes-error">Could not load outcomes.</div>';
    });
  }

  // §5.4 (support) — Resolve owner names via single follow-up fetch
  // V1: resources PK = id, display name = name
  function _resolveOwnerNames(outcomes, callback) {
    var ids = outcomes
      .filter(function(o) { return o.owner_resource_id; })
      .map(function(o) { return o.owner_resource_id; });

    if (!ids.length) { callback(outcomes); return; }

    API.get(
      'resources?id=in.(' + ids.join(',') + ')&select=id,name'
    ).then(function(rows) {
      var nameMap = {};
      (rows || []).forEach(function(r) { nameMap[r.id] = r.name; });
      outcomes.forEach(function(o) {
        if (o.owner_resource_id) o._owner_name = nameMap[o.owner_resource_id] || null;
      });
      callback(outcomes);
    }).catch(function() { callback(outcomes); });
  }

  // §5.3 — Paint
  function _paintOutcomes(block, outcomes, meeting) {
    var isRunning = meeting.state !== 'idle';
    var html = '<div class="ac-outcomes-header">';
    html += '<span class="ac-outcomes-label">INTENDED OUTCOMES</span>';
    if (!isRunning) {
      html += '<button class="ac-outcomes-add-btn" data-action="add-outcome">+ Add outcome</button>';
    }
    html += '</div>';
    html += '<div class="ac-outcomes-list" id="ac-outcomes-list">';

    if (!outcomes.length) {
      html += '<div class="ac-outcomes-empty">No outcomes defined. Add one to set the meeting\'s intent.</div>';
    } else {
      outcomes.forEach(function(o) {
        html += _outcomeRowHtml(o, isRunning);
      });
    }

    html += '</div>';
    if (!isRunning) {
      html += _addOutcomeFormHtml();
    }

    block.innerHTML = html;
    _wireOutcomeEvents(block, outcomes, meeting);
    _wirePercolateOnOutcomes(block);
    if (_percolateResourceId) _applyPercolate();
  }

  // §5.4 — Outcome row HTML
  function _outcomeRowHtml(o, isRunning) {
    var verbClass = 'ac-verb-' + esc(o.verb.toLowerCase());
    var html = '<div class="ac-outcome-row" data-outcome-id="' + esc(o.outcome_id) + '">';
    html += '<span class="ac-outcome-verb ' + verbClass + '">' + esc(o.verb) + '</span>';

    if (isRunning) {
      html += '<span class="ac-outcome-desc">' + esc(o.description) + '</span>';
    } else {
      html += '<span class="ac-outcome-desc ac-outcome-desc--editable"' +
              ' contenteditable="true" spellcheck="false">' +
              esc(o.description) + '</span>';
    }

    if (o.owner_resource_id && o._owner_name) {
      html += '<span class="ac-outcome-owner" data-resource-id="' +
              esc(o.owner_resource_id) + '">' + esc(o._owner_name) + '</span>';
    }

    if (o.condition) {
      html += '<span class="ac-outcome-condition">if ' + esc(o.condition) + '</span>';
    }

    if (!isRunning) {
      html += '<div class="ac-outcome-controls">';
      html += '<button class="ac-outcome-btn" data-action="move-up" title="Move up">\u25b2</button>';
      html += '<button class="ac-outcome-btn" data-action="move-down" title="Move down">\u25bc</button>';
      html += '<button class="ac-outcome-btn ac-outcome-btn--delete" data-action="delete" title="Remove">\u00d7</button>';
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  // §5.5 — Add-outcome form HTML
  // Commission fix: data-action attrs added to submit/cancel buttons
  // so click delegation (which checks dataset.action) can reach them.
  function _addOutcomeFormHtml() {
    return [
      '<div class="ac-outcome-form" id="ac-outcome-form" style="display:none;">',
        '<div class="ac-outcome-form-row">',
          '<select class="ac-outcome-verb-select" id="ac-outcome-verb-select">',
            '<option value="">Verb\u2026</option>',
            '<option value="RESOLVE">RESOLVE</option>',
            '<option value="SEAL">SEAL</option>',
            '<option value="DECIDE">DECIDE</option>',
            '<option value="ASSIGN">ASSIGN</option>',
            '<option value="DEFER">DEFER</option>',
            '<option value="INFORM">INFORM</option>',
          '</select>',
          '<input class="ac-outcome-desc-input" id="ac-outcome-desc-input"',
                 ' type="text" placeholder="Describe the outcome\u2026" autocomplete="off">',
        '</div>',
        '<div class="ac-outcome-form-actions">',
          '<button class="ac-outcome-form-submit btn btn-signal"',
                  ' id="ac-outcome-submit"',
                  ' data-action="ac-outcome-submit">Add</button>',
          '<button class="ac-outcome-form-cancel btn btn-ghost"',
                  ' id="ac-outcome-cancel"',
                  ' data-action="ac-outcome-cancel">Cancel</button>',
        '</div>',
      '</div>'
    ].join('');
  }

  // §5.6 — Event wiring (single delegated listener on block)
  function _wireOutcomeEvents(block, outcomes, meeting) {
    block.addEventListener('click', function(ev) {
      var target = ev.target;
      var action = target.dataset.action ||
                   (target.closest('[data-action]') && target.closest('[data-action]').dataset.action);
      if (!action) return;

      if (action === 'add-outcome')       { _showAddForm(block); return; }
      if (action === 'ac-outcome-submit') { _submitOutcome(block, meeting); return; }
      if (action === 'ac-outcome-cancel') { _hideAddForm(block); return; }

      var row = target.closest('.ac-outcome-row');
      if (!row) return;
      var outcomeId = row.dataset.outcomeId;

      if (action === 'delete')    { _deleteOutcome(outcomeId, meeting); return; }
      if (action === 'move-up')   { _moveOutcome(outcomeId, -1, outcomes, meeting); return; }
      if (action === 'move-down') { _moveOutcome(outcomeId,  1, outcomes, meeting); return; }
    });

    // Description inline edit — debounced PATCH on input
    block.addEventListener('input', function(ev) {
      var desc = ev.target.closest('.ac-outcome-desc--editable');
      if (!desc) return;
      var row = desc.closest('.ac-outcome-row');
      if (!row) return;
      _debouncedDescPatch(row.dataset.outcomeId, desc.textContent.trim(), meeting);
    });
  }

  // §5.7 — CRUD

  function _submitOutcome(block, meeting) {
    // Guard against double-submission (e.g. rapid double-click or bubbling).
    if (block.dataset.submitting) return;
    block.dataset.submitting = '1';

    var verbEl  = document.getElementById('ac-outcome-verb-select');
    var descEl  = document.getElementById('ac-outcome-desc-input');
    var verb    = verbEl  ? verbEl.value          : '';
    var desc    = descEl  ? descEl.value.trim()   : '';
    if (!verb || !desc) { block.dataset.submitting = ''; return; }

    var list = block.querySelector('#ac-outcomes-list');
    var pos  = list ? list.querySelectorAll('.ac-outcome-row').length : 0;

    API.post('accord_meeting_outcomes', {
      firm_id:     meeting.firm_id,
      meeting_id:  meeting.meeting_id,
      verb:        verb,
      description: desc,
      position:    pos,
      status:      'open'
    }).then(function() {
      block.dataset.submitting = '';
      _hideAddForm(block);
      _loadOutcomes(meeting);
      _renderFooter(meeting, _currentWorkstreamId);   // C-13 §11: verdict re-derive on outcome add
    }).catch(function(e) {
      block.dataset.submitting = '';
      console.error('[AccordMeetingSetup] add outcome failed', e);
    });
  }

  function _deleteOutcome(outcomeId, meeting) {
    API.del('accord_meeting_outcomes?outcome_id=eq.' + outcomeId)
      .then(function() {
        _loadOutcomes(meeting);
        _renderFooter(meeting, _currentWorkstreamId);   // C-13 §11: verdict re-derive on outcome remove
      })
      .catch(function(e) {
        console.error('[AccordMeetingSetup] delete outcome failed', e);
      });
  }

  // Sequential PATCHes per IR (shared-state write antipattern with Promise.all)
  function _moveOutcome(outcomeId, direction, outcomes, meeting) {
    var idx = -1;
    for (var i = 0; i < outcomes.length; i++) {
      if (outcomes[i].outcome_id === outcomeId) { idx = i; break; }
    }
    if (idx === -1) return;
    var swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= outcomes.length) return;

    var a = outcomes[idx];
    var b = outcomes[swapIdx];

    API.patch('accord_meeting_outcomes?outcome_id=eq.' + a.outcome_id, { position: b.position })
      .then(function() {
        return API.patch('accord_meeting_outcomes?outcome_id=eq.' + b.outcome_id, { position: a.position });
      })
      .then(function() { _loadOutcomes(meeting); })
      .catch(function(e) {
        console.error('[AccordMeetingSetup] reorder outcome failed', e);
        _loadOutcomes(meeting);   // restore consistent state
      });
  }

  function _debouncedDescPatch(outcomeId, desc, meeting) {
    if (_descPatchTimers[outcomeId]) clearTimeout(_descPatchTimers[outcomeId]);
    _descPatchTimers[outcomeId] = setTimeout(function() {
      _descPatchTimers[outcomeId] = null;
      API.patch('accord_meeting_outcomes?outcome_id=eq.' + outcomeId, { description: desc })
        .catch(function(e) {
          console.error('[AccordMeetingSetup] desc patch failed', e);
        });
    }, 800);
  }

  // §5.8 — Show / hide add form
  function _showAddForm(block) {
    var form = block.querySelector('#ac-outcome-form');
    var btn  = block.querySelector('[data-action="add-outcome"]');
    if (form) form.style.display = '';
    if (btn)  btn.style.display  = 'none';
    var input = block.querySelector('#ac-outcome-desc-input');
    if (input) input.focus();
  }

  function _hideAddForm(block) {
    var form  = block.querySelector('#ac-outcome-form');
    var btn   = block.querySelector('[data-action="add-outcome"]');
    var verb  = block.querySelector('#ac-outcome-verb-select');
    var input = block.querySelector('#ac-outcome-desc-input');
    if (form)  form.style.display  = 'none';
    if (btn)   btn.style.display   = '';
    if (verb)  verb.value          = '';
    if (input) input.value         = '';
  }

  // ══════════════════════════════════════════════════════════════
  // ATTENDEES — CMD-ACCORD-SETUP-ATTENDEES-1
  // V4: organizer_id = auth.users.id; resources linked via user_id.
  // V5: accord_nodes.created_by = users.id; matched via _user_id
  //     enriched onto attendees from resources.user_id.
  // ══════════════════════════════════════════════════════════════

  // §5 auth helper — parse JWT sub from localStorage
  // (window.Auth does not exist in this codebase per V4 browser probe)
  function _getCurrentUserId() {
    try {
      var key = null;
      for (var k in localStorage) {
        if (k.indexOf('auth-token') !== -1) { key = k; break; }
      }
      if (!key) return null;
      var session = JSON.parse(localStorage.getItem(key));
      var token = session && session.access_token;
      if (!token) return null;
      var payload = JSON.parse(atob(token.split('.')[1]));
      return payload.sub || null;
    } catch(e) { return null; }
  }

  function _isCurrentUserOrganizer(meeting) {
    try {
      var uid = _getCurrentUserId();
      return !!uid && uid === meeting.organizer_id;
    } catch(e) { return false; }
  }

  // §5.1 — Entry point
  function _renderAttendees(meeting, workstreamId) {
    _attendeesAborted = false;
    var host = document.querySelector('.ac-col-tabbody[data-col="right"]');
    if (!host) return;
    host.innerHTML = '<div class="ac-attendees-block" id="ac-attendees-block">' +
                     '<div class="ac-attendees-loading">Loading\u2026</div>' +
                     '</div>';
    _loadAttendees(meeting, workstreamId);
  }

  // §5.2 — Load + organizer auto-seed
  function _loadAttendees(meeting, workstreamId) {
    API.get(
      'accord_meeting_attendees?meeting_id=eq.' + meeting.meeting_id +
      '&select=attendee_id,resource_id,role_in_meeting,rsvp_status' +
      '&order=role_in_meeting.asc,invited_at.asc'
    ).then(function(rows) {
      if (_attendeesAborted) return;
      rows = rows || [];

      // Auto-seed organizer row if absent and meeting is idle
      var hasOrganizer = rows.some(function(r) {
        return r.role_in_meeting === 'organizer';
      });
      if (!hasOrganizer && meeting.state === 'idle') {
        return _seedOrganizer(meeting).then(function() {
          if (_attendeesAborted) return;
          return _loadAttendees(meeting, workstreamId);
        });
      }

      // Parallel: resolve names+user_ids AND stakes lines
      return Promise.all([
        _resolveAttendeeNames(rows),
        _resolveStakesLines(rows, workstreamId, meeting.meeting_id)
      ]).then(function(results) {
        if (_attendeesAborted) return;
        var enriched  = results[0];
        var stakesMap = results[1];
        // Attach stakes count to each attendee via _user_id
        enriched.forEach(function(a) {
          a._actionCount = (a._user_id && stakesMap[a._user_id]) || 0;
        });
        var block = document.getElementById('ac-attendees-block'); // IR71
        if (!block) return;
        _paintAttendees(block, enriched, meeting);
        // E-Phase: start RSVP poll after initial paint (idle meetings only)
        if (meeting.state === 'idle') _startRsvpPoll(meeting, workstreamId);
      });
    }).catch(function(e) {
      console.error('[AccordMeetingSetup] attendees fetch failed', e);
      var block = document.getElementById('ac-attendees-block');
      if (block) block.innerHTML = '<div class="ac-attendees-error">Could not load attendees.</div>';
    });
  }

  // Seed organizer — V4: organizer_id is users.id; look up via resources.user_id
  function _seedOrganizer(meeting) {
    return API.get(
      'resources?user_id=eq.' + meeting.organizer_id + '&select=id,name&limit=1'
    ).then(function(rows) {
      if (!rows || !rows.length) {
        console.warn('[AccordMeetingSetup] organizer resource not found for user', meeting.organizer_id);
        return;
      }
      return API.post('accord_meeting_attendees', {
        firm_id:         meeting.firm_id,
        meeting_id:      meeting.meeting_id,
        resource_id:     rows[0].id,
        role_in_meeting: 'organizer',
        rsvp_status:     'accepted'
      }).catch(function(e) {
        // Ignore duplicate key — idempotent
        console.warn('[AccordMeetingSetup] organizer seed skipped:', e && e.message);
      });
    });
  }

  // §5.3 — Resolve names + user_id (needed for V5 stakes matching)
  function _resolveAttendeeNames(attendees) {
    if (!attendees.length) return Promise.resolve([]);
    var ids = attendees.map(function(a) { return a.resource_id; }).join(',');
    return API.get(
      'resources?id=in.(' + ids + ')&select=id,name,user_id'
    ).then(function(rows) {
      var map = {};
      (rows || []).forEach(function(r) { map[r.id] = r; });
      attendees.forEach(function(a) {
        var rec = map[a.resource_id];
        a._name    = rec ? rec.name    : 'Unknown';
        a._user_id = rec ? rec.user_id : null;  // users.id for stakes matching
      });
      return attendees;
    }).catch(function() { return attendees; });
  }

  // §5.4 — Stakes line: count actions owned by each attendee in this workstream
  // V5: accord_nodes.created_by = users.id; map keyed by users.id
  function _resolveStakesLines(attendees, workstreamId, currentMeetingId) {
    if (!workstreamId || !attendees.length) return Promise.resolve({});
    return API.get(
      'accord_meetings?workstream_id=eq.' + workstreamId +
      '&state=in.(closed,sealed,running)' +
      '&select=meeting_id'
    ).then(function(meetings) {
      if (!meetings || !meetings.length) return {};
      var mids = meetings.map(function(m) { return m.meeting_id; }).join(',');
      return API.get(
        'accord_nodes?meeting_id=in.(' + mids + ')' +
        '&tag=eq.action' +
        '&select=created_by'
      ).then(function(nodes) {
        var counts = {};
        (nodes || []).forEach(function(n) {
          if (n.created_by) counts[n.created_by] = (counts[n.created_by] || 0) + 1;
        });
        return counts;  // { users_id: count }
      });
    }).catch(function() { return {}; });
  }

  // §5.5 — Paint
  function _paintAttendees(block, attendees, meeting) {
    var isOrganizer = _isCurrentUserOrganizer(meeting);
    var isIdle      = meeting.state === 'idle';

    var html = '<div class="ac-attendees-header">';
    html += '<span class="ac-attendees-label">EXPECTED ATTENDEES</span>';
    html += '<span class="ac-attendees-count">' + attendees.length + '</span>';
    html += '</div>';

    html += '<div class="ac-attendees-list">';
    attendees.forEach(function(a) {
      html += _attendeeCardHtml(a, meeting, isOrganizer && isIdle);
    });
    html += '</div>';

    if (isOrganizer && isIdle) {
      html += _addAttendeeHtml();
    }

    block.innerHTML = html;
    _wireAttendeeEvents(block, meeting);
    _wirePercolateOnAttendees(block);
    _reapplyConnDotStates(block);                       // C-12: restore manual toggles after re-render
    if (_gatheringMode) _applyGatheringToCards(true);   // C-12 §14: re-apply gathering after re-render
    if (_percolateResourceId) _applyPercolate();
  }

  // §5.6 — Attendee card HTML
  function _attendeeCardHtml(attendee, meeting, canRemove) {
    var isYou       = attendee.role_in_meeting === 'organizer';
    var initials    = _initials(attendee._name || '');
    var statusBadge = _statusBadge(attendee);

    var html = '<div class="ac-attendee-card" data-attendee-id="' +
               esc(attendee.attendee_id) + '" ' +
               'data-resource-id="' + esc(attendee.resource_id) + '">';

    // Connection dot (C-12 wires gathering-mode toggle)
    html += '<div class="ac-conn-dot ac-conn-dot--none"' +
            ' data-action="conn-dot-toggle"' +
            ' data-attendee-id="' + esc(attendee.attendee_id) + '"' +
            ' title="Click to mark connection status"></div>';

    // Avatar
    html += '<div class="ac-attendee-avatar' +
            (isYou ? ' ac-attendee-avatar--you' : '') + '">' +
            esc(initials) + '</div>';

    // Name block
    html += '<div class="ac-attendee-name-block">';
    html += '<div class="ac-attendee-name">' + esc(attendee._name || 'Unknown') + '</div>';
    html += '<div class="ac-attendee-role">' +
            esc(attendee.role_in_meeting.toUpperCase()) + '</div>';

    // Stakes line: action count (omit if zero or no workstream)
    if (attendee._actionCount > 0) {
      html += '<div class="ac-attendee-stakes">Owns ' + attendee._actionCount +
              ' action' + (attendee._actionCount === 1 ? '' : 's') +
              ' in this workstream.</div>';
    }

    html += '</div>';

    // YOU badge
    if (isYou) html += '<span class="ac-attendee-you">YOU</span>';

    // Status badge
    if (statusBadge) html += statusBadge;

    // Remove button (organizer + idle + not self)
    if (canRemove && !isYou) {
      html += '<button class="ac-attendee-remove" data-action="remove-attendee"' +
              ' title="Remove attendee">\u00d7</button>';
    }

    html += '</div>';
    return html;
  }

  function _statusBadge(attendee) {
    // Organizer is implicitly accepted — suppress badge on their card.
    if (attendee.role_in_meeting === 'organizer') return '';
    var map = {
      'accepted':  { cls: 'ac-badge--accepted',  label: 'ACCEPTED'  },
      'declined':  { cls: 'ac-badge--declined',  label: 'DECLINED'  },
      'tentative': { cls: 'ac-badge--tentative', label: 'TENTATIVE' },
      // X-25: render PENDING badge so the card signals "no response yet".
      // Previously null (no badge), which hid the invitation status.
      'pending':   { cls: 'ac-badge--pending',   label: 'PENDING'   }
    };
    var entry = map[attendee.rsvp_status];
    if (!entry) return '';
    return '<span class="ac-attendee-badge ' + entry.cls + '">' +
           entry.label + '</span>';
  }

  function _initials(name) {
    var parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  // §5.7 — Add attendee HTML
  function _addAttendeeHtml() {
    return [
      '<div class="ac-add-attendee-row" id="ac-add-attendee-row">',
        '<button class="ac-add-attendee-btn" data-action="show-add-attendee">',
          '+ Add attendee',
        '</button>',
      '</div>',
      '<div class="ac-add-attendee-form" id="ac-add-attendee-form" style="display:none;">',
        '<input class="ac-add-attendee-input" id="ac-add-attendee-input"',
               ' type="text" placeholder="Search by name\u2026" autocomplete="off">',
        '<div class="ac-add-attendee-results" id="ac-add-attendee-results"></div>',
        '<button class="btn btn-ghost ac-add-attendee-cancel"',
                ' data-action="hide-add-attendee">Cancel</button>',
      '</div>'
    ].join('');
  }

  // §5.8 — Event wiring (delegated on block)
  function _wireAttendeeEvents(block, meeting) {
    block.addEventListener('click', function(ev) {
      var target = ev.target;
      var action = target.dataset.action ||
                   (target.closest('[data-action]') &&
                    target.closest('[data-action]').dataset.action);
      if (!action) return;

      if (action === 'show-add-attendee') { _showAddAttendee(block, meeting); return; }
      if (action === 'hide-add-attendee') { _hideAddAttendee(block); return; }

      if (action === 'remove-attendee') {
        var card = target.closest('.ac-attendee-card');
        if (!card) return;
        _removeAttendee(card.dataset.attendeeId, meeting);
        return;
      }

      if (action === 'add-attendee-select') {
        var btn = target.closest('[data-action="add-attendee-select"]');
        if (!btn) return;
        _hideAddAttendee(block);
        _addAttendee(btn.dataset.resourceId, meeting);
        return;
      }

      // C-12 §8.3 — Conn-dot cycle: none → on-time → late → none
      if (action === 'conn-dot-toggle') {
        var dot2 = target.closest('[data-action="conn-dot-toggle"]');
        if (!dot2) return;
        ev.stopImmediatePropagation();    // prevent percolate handler firing on same click
        var aid     = dot2.dataset.attendeeId;
        var states  = ['none', 'on-time', 'late'];
        var current = _connDotStates[aid] || 'none';
        var next    = states[(states.indexOf(current) + 1) % states.length];
        _connDotStates[aid] = next;
        dot2.className = 'ac-conn-dot ac-conn-dot--' + next +
                         (_gatheringMode ? ' ac-conn-dot--gathering' : '');
        return;
      }
    });
  }

  // §5.9 — Search, add, remove
  function _showAddAttendee(block, meeting) {
    var row   = block.querySelector('#ac-add-attendee-row');
    var form  = block.querySelector('#ac-add-attendee-form');
    var input = block.querySelector('#ac-add-attendee-input');
    if (row)  row.style.display  = 'none';
    if (form) form.style.display = '';
    if (input) {
      input.focus();
      // Guard: only wire the input listener once per render cycle
      if (!input.dataset.listenerBound) {
        input.dataset.listenerBound = '1';
        input.addEventListener('input', function() {
          _debouncedResourceSearch(input.value.trim(), block);
        });
      }
    }
  }

  function _hideAddAttendee(block) {
    var row     = block.querySelector('#ac-add-attendee-row');
    var form    = block.querySelector('#ac-add-attendee-form');
    var input   = block.querySelector('#ac-add-attendee-input');
    var results = block.querySelector('#ac-add-attendee-results');
    if (row)     row.style.display  = '';
    if (form)    form.style.display = 'none';
    if (input)   input.value = '';
    if (results) results.innerHTML = '';
    if (_searchTimer) { clearTimeout(_searchTimer); _searchTimer = null; }
  }

  function _debouncedResourceSearch(query, block) {
    if (_searchTimer) clearTimeout(_searchTimer);
    if (!query || query.length < 2) {
      var results = block.querySelector('#ac-add-attendee-results');
      if (results) results.innerHTML = '';
      return;
    }
    _searchTimer = setTimeout(function() {
      _searchTimer = null;
      API.get(
        'resources?name=ilike.*' + encodeURIComponent(query) + '*' +
        '&select=id,name&limit=8'
      ).then(function(rows) {
        var results = block.querySelector('#ac-add-attendee-results');
        if (!results) return;
        if (!rows || !rows.length) {
          results.innerHTML = '<div class="ac-search-empty">No results.</div>';
          return;
        }
        results.innerHTML = rows.map(function(r) {
          return '<button class="ac-search-result"' +
                 ' data-action="add-attendee-select"' +
                 ' data-resource-id="' + esc(r.id) + '"' +
                 ' data-name="' + esc(r.name) + '">' +
                 esc(r.name) + '</button>';
        }).join('');
      }).catch(function() {});
    }, 300);
  }

  function _addAttendee(resourceId, meeting) {
    API.post('accord_meeting_attendees', {
      firm_id:         meeting.firm_id,
      meeting_id:      meeting.meeting_id,
      resource_id:     resourceId,
      role_in_meeting: 'participant',
      rsvp_status:     'pending'
    }).then(function() {
      _loadAttendees(meeting);
      _renderFooter(meeting, _currentWorkstreamId);   // C-13 §11: verdict re-derive on attendee add
    }).catch(function(e) {
      console.error('[AccordMeetingSetup] add attendee failed', e);
    });
  }

  function _removeAttendee(attendeeId, meeting) {
    API.del('accord_meeting_attendees?attendee_id=eq.' + attendeeId)
      .then(function() {
        _loadAttendees(meeting);
        _renderFooter(meeting, _currentWorkstreamId);   // C-13 §11: verdict re-derive on attendee remove
      })
      .catch(function(e) {
        console.error('[AccordMeetingSetup] remove attendee failed', e);
      });
  }

  // ══════════════════════════════════════════════════════════════
  // CMD-ACCORD-SETUP-GATHERING-1 (C-12) — Gathering mode
  // §5 detection · §6 enter/exit · §7 header · §8 cards · §9 5-min
  // Architect amendments applied: header mounts to .ac-col-tabbar;
  // column rail selector .ac-setup-col-right; conn-dot in-place mod
  // (no second insert); replaces legacy _setGatheringMode (P1).
  // ══════════════════════════════════════════════════════════════

  // §5.1 — Timer start/stop
  function _startGatheringTimer(meeting) {
    _stopGatheringTimer();
    if (!meeting || !meeting.scheduled_for) return;

    _gatheringTimer = setInterval(function() {
      _checkGatheringCondition(meeting);
    }, 30000);  // poll every 30 seconds

    // Also check immediately on mount
    _checkGatheringCondition(meeting);
  }

  function _stopGatheringTimer() {
    if (_gatheringTimer) {
      clearInterval(_gatheringTimer);
      _gatheringTimer = null;
    }
  }

  // §5.2 — Condition check
  function _checkGatheringCondition(meeting) {
    if (meeting.state !== 'idle') {
      // Meeting started — exit gathering mode if active
      if (_gatheringMode) _exitGatheringMode();
      _stopGatheringTimer();
      return;
    }

    if (!meeting.scheduled_for) return;

    var now          = Date.now();
    var scheduled    = new Date(meeting.scheduled_for).getTime();
    var minutesUntil = (scheduled - now) / 60000;

    if (minutesUntil <= 15 && minutesUntil > -5) {
      // Within window: engage or maintain gathering mode
      if (!_gatheringMode) _enterGatheringMode(meeting);

      // 5-minute warning — C-13 replaces banner with persistent countdown
      if (minutesUntil <= 5 && minutesUntil > 0 && !_fiveMinWarned) {
        _fiveMinWarned = true;
        _startGatheringCountdown(meeting.scheduled_for);  // persistent timer replaces C-12 banner
      }
    } else {
      // Outside window: exit if active (operator rescheduled)
      if (_gatheringMode) _exitGatheringMode();
    }
  }

  // §6.1 — Enter
  function _enterGatheringMode(meeting) {
    _gatheringMode = true;
    _paintGatheringHeader(true);
    _applyGatheringToCards(true);
    var rightCol = document.querySelector('.ac-setup-col-right');
    if (rightCol) rightCol.classList.add('ac-gathering-active');
  }

  // §6.2 — Exit
  function _exitGatheringMode() {
    _gatheringMode     = false;
    _gatheringPrepView = false;
    _fiveMinWarned     = false;

    _paintGatheringHeader(false);
    _applyGatheringToCards(false);
    _stopGatheringCountdown();   // C-13 §10.2: stop countdown on exit

    var rightCol = document.querySelector('.ac-setup-col-right');
    if (rightCol) rightCol.classList.remove('ac-gathering-active');
  }

  // §7 — Right column header transformation (architect amendment:
  // header target is .ac-col-tabbar[data-col="right"]; label and
  // toggle appended as additional flex children — no tabbar rebuild,
  // no C-10 slideshow side effects)
  function _paintGatheringHeader(active) {
    var header = document.querySelector('.ac-col-tabbar[data-col="right"]');
    if (!header) return;

    // Remove any existing gathering chrome
    var existing = header.querySelector('.ac-gathering-label');
    if (existing) existing.remove();
    var existingToggle = header.querySelector('.ac-gathering-prep-toggle');
    if (existingToggle) existingToggle.remove();

    if (!active) return;

    // "GATHERING" label — margin-left: auto (in CSS) pushes it right
    // of the slideshow stepper + rotation progress
    var label = document.createElement('span');
    label.className = 'ac-gathering-label';
    label.textContent = 'GATHERING';
    header.appendChild(label);

    // "Show prep view" toggle — operator-private affordance
    var toggle = document.createElement('button');
    toggle.className = 'ac-gathering-prep-toggle';
    toggle.dataset.action = 'gathering-prep-toggle';
    toggle.textContent = _gatheringPrepView ? 'PREP VIEW \u2713' : 'SHOW PREP VIEW';
    toggle.title = 'Private \u2014 not visible to attendees';
    header.appendChild(toggle);

    toggle.addEventListener('click', function() {
      _gatheringPrepView = !_gatheringPrepView;
      toggle.textContent = _gatheringPrepView ? 'PREP VIEW \u2713' : 'SHOW PREP VIEW';
      _applyGatheringToCards(_gatheringMode);
    });
  }

  // §8.1 — Apply/remove gathering state on attendee cards
  // Architect amendment to V3 hide list: drop never-shipped
  // [data-action="toggle-attendee-detail"] and .ac-attendee-detail;
  // add .ac-attendee-stakes (always-rendered action-count line)
  function _applyGatheringToCards(entering) {
    var block = document.getElementById('ac-attendees-block');
    if (!block) return;

    var showIntel = entering ? _gatheringPrepView : true;

    block.querySelectorAll('.ac-attendee-card').forEach(function(card) {
      // Conn-dot: enlarge in gathering mode
      var dot = card.querySelector('.ac-conn-dot');
      if (dot) {
        dot.classList.toggle('ac-conn-dot--gathering', entering);
      }

      // Intelligence elements: hide unless prep view is showing
      var hideEls = card.querySelectorAll(
        '.ac-attendee-badge, .ac-attendee-owed, ' +
        '.ac-attendee-urgency, .ac-attendee-stakes'
      );
      hideEls.forEach(function(el) {
        el.style.display = (entering && !showIntel) ? 'none' : '';
      });
    });
  }

  // Restore manually-toggled conn-dot states after attendee re-render.
  // §14 discipline checklist: _connDotStates re-applied after re-render.
  function _reapplyConnDotStates(block) {
    if (!block) return;
    block.querySelectorAll('.ac-conn-dot[data-attendee-id]').forEach(function(dot) {
      var aid   = dot.dataset.attendeeId;
      var state = _connDotStates[aid];
      if (!state || state === 'none') return;  // default class already set
      dot.className = 'ac-conn-dot ac-conn-dot--' + state +
                      (_gatheringMode ? ' ac-conn-dot--gathering' : '');
    });
  }

  // §9 — 5-minute warning: footer pulse + brief overlay banner
  function _showFiveMinWarning() {
    // Footer pulse
    var footer = document.querySelector('.ac-setup-footer');
    if (footer) {
      footer.classList.add('ac-five-min-pulse');
      setTimeout(function() {
        footer.classList.remove('ac-five-min-pulse');
      }, 4000);
    }

    // Banner overlay — auto-dismisses after 8 seconds
    var shell = document.querySelector('.ac-setup-shell');
    if (!shell) return;

    // Idempotency guard: if banner already present, don't stack
    var existing = document.getElementById('ac-five-min-banner');
    if (existing) existing.remove();

    var banner = document.createElement('div');
    banner.id = 'ac-five-min-banner';
    banner.className = 'ac-five-min-banner';
    banner.innerHTML = '<span class="ac-five-min-glyph">\u23f1</span>' +
                       '<span class="ac-five-min-text">5 minutes to start</span>' +
                       '<button class="ac-five-min-dismiss" ' +
                       'data-action="five-min-dismiss" title="Dismiss">\u2715</button>';
    shell.appendChild(banner);

    banner.querySelector('[data-action="five-min-dismiss"]')
      .addEventListener('click', function() { banner.remove(); });

    // Auto-dismiss
    setTimeout(function() {
      if (banner.parentNode) banner.remove();
    }, 8000);

    // Animate in
    requestAnimationFrame(function() {
      banner.classList.add('ac-five-min-banner--visible');
    });
  }

  // ══════════════════════════════════════════════════════════════
  // CMD-ACCORD-SETUP-VERDICT-1 (C-13) — Footer zone
  // §4 verdict · §5 budget · §6 warning pills · §7 footer render
  // §8 popover · §9 begin meeting · §10 countdown timer
  // Amendments from pre-flight: P1 — countdown renamed
  // _startGatheringCountdown/_stopGatheringCountdown (avoids
  // collision with header _startCountdown/_stopCountdown);
  // P2 — barCls uses ac-budget-fill-- prefix matching CSS §13;
  // _wireFooterEvents rewritten without optional chaining;
  // _currentWorkstreamId cached in render() for re-render triggers.
  // ══════════════════════════════════════════════════════════════

  // §4.2 — Verdict derivation
  function _deriveVerdict(meeting, workstreamId, callback) {
    var myToken = ++_verdictToken;

    Promise.all([
      API.get('accord_meeting_outcomes?meeting_id=eq.' + meeting.meeting_id +
              '&select=outcome_id,verb,owner_resource_id,status'),
      API.get('accord_meeting_attendees?meeting_id=eq.' + meeting.meeting_id +
              '&select=attendee_id,resource_id,role_in_meeting,rsvp_status'),
      workstreamId ? API.get(
        'accord_meetings?workstream_id=eq.' + workstreamId +
        '&state=in.(closed,sealed,running,idle)&select=meeting_id&limit=50'
      ).then(function(mtgs) {
        if (!mtgs || !mtgs.length) return [];
        var ids = mtgs.map(function(m) { return m.meeting_id; }).join(',');
        return API.get(
          'accord_nodes?meeting_id=in.(' + ids + ')&tag=eq.action' +
          '&select=node_id,due_date,sealed_at' +
          '&order=due_date.asc'
        ).then(function(nodes) { return nodes || []; });
      }) : Promise.resolve([])
    ]).then(function(results) {
      if (_verdictToken !== myToken) return;

      var outcomes  = results[0] || [];
      var attendees = results[1] || [];
      var actions   = results[2] || [];

      var now = Date.now();
      var overdueActions = actions.filter(function(a) {
        return !a.sealed_at && a.due_date &&
               new Date(a.due_date + 'T00:00:00').getTime() < now;
      });

      var checks = [];

      // Blocking checks
      var hasOutcomes = outcomes.length > 0;
      checks.push({ label: 'Outcomes defined', passed: hasOutcomes, blocking: true });

      var declined = attendees.filter(function(a) {
        return a.rsvp_status === 'declined' &&
               (a.role_in_meeting === 'lead' || a.role_in_meeting === 'organizer');
      });
      checks.push({ label: 'No required attendee declined', passed: declined.length === 0, blocking: true });

      // Advisory checks
      var allOutcomesOwned = outcomes.every(function(o) { return o.owner_resource_id; });
      checks.push({ label: 'All outcomes have owners', passed: allOutcomesOwned, blocking: false });

      var hasDuration = !!meeting.duration_minutes;
      checks.push({ label: 'Duration set', passed: hasDuration, blocking: false });

      checks.push({
        label:    overdueActions.length + ' overdue action' + (overdueActions.length !== 1 ? 's' : '') + ' in workstream',
        passed:   overdueActions.length === 0,
        blocking: false
      });

      var blockingFail = checks.some(function(c) { return c.blocking && !c.passed; });
      var advisoryFail = checks.some(function(c) { return !c.blocking && !c.passed; });

      var state, label, color;
      if (blockingFail)      { state = 'not-ready'; label = 'NOT READY';        color = 'rose';  }
      else if (advisoryFail) { state = 'caveats';   label = 'GO WITH CAVEATS';  color = 'amber'; }
      else                   { state = 'go';         label = 'GO';               color = 'green'; }

      callback({ state: state, label: label, color: color, checks: checks });
    }).catch(function(e) {
      console.error('[AccordMeetingSetup] verdict derivation failed', e);
      callback(null);
    });
  }

  // §5 — Budget bar derivation
  function _deriveBudget(meeting, meetingId, callback) {
    API.get(
      'accord_agenda_items?meeting_id=eq.' + meetingId +
      '&select=duration_minutes_estimate&order=position.asc'
    ).then(function(items) {
      items = items || [];
      var used  = items.reduce(function(s, i) { return s + (i.duration_minutes_estimate || 0); }, 0);
      var total = meeting.duration_minutes || 0;
      var slack = total - used;
      callback({ used: used, total: total, slack: slack });
    }).catch(function() { callback({ used: 0, total: 0, slack: 0 }); });
  }

  // §6 — Warning pills (substrate-derived from _intelData if available)
  function _deriveWarningPills(meeting, workstreamId, intelData) {
    var pills = [];
    if (!intelData || !intelData.attendees) return pills;
    intelData.attendees.forEach(function(a) {
    if (a.status_tag === 'QUIET \u00b7 RE-ONBOARD') {
        var dayStr = a.days_off_substrate ? ' \u00b7 ' + a.days_off_substrate + 'd silent' : '';
        pills.push({ text: esc(a.name) + ' \u2014 no recent activity' + dayStr, severity: 'mid' });
      }
      if (a.status_tag === 'OVERDUE \u00b7 PRESSURE') {
        pills.push({ text: esc(a.name) + ' \u00b7 ' + a.overdue_actions + ' overdue', severity: 'high' });
      }
    });
    return pills.slice(0, 2);
  }

  // §7.1 — Footer entry point
  function _renderFooter(meeting, workstreamId) {
    var footer = document.querySelector('.ac-setup-footer');
    if (!footer) return;

    footer.innerHTML = _footerLoadingHtml();

    Promise.all([
      new Promise(function(resolve) { _deriveVerdict(meeting, workstreamId, resolve); }),
      new Promise(function(resolve) { _deriveBudget(meeting, meeting.meeting_id, resolve); })
    ]).then(function(results) {
      if (!footer.isConnected) return;
      var verdict      = results[0];
      var budget       = results[1];
      var warningPills = _deriveWarningPills(meeting, workstreamId, _intelData);
      footer.innerHTML = _footerHtml(meeting, verdict, budget, warningPills);
      _wireFooterEvents(footer, meeting, verdict);
    });
  }

  function _footerLoadingHtml() {
    return '<div class="ac-footer-loading">Evaluating readiness\u2026</div>';
  }

  // §7.2 — Footer HTML
  // P2 amendment: barCls uses ac-budget-fill-- prefix (matches §13 CSS; commission had ac-budget-bar--)
  function _footerHtml(meeting, verdict, budget, warningPills) {
    var html = '';

    // Verdict pill (left)
    if (verdict) {
      html += '<div class="ac-footer-left">';
      html += '<button class="ac-verdict-pill ac-verdict-pill--' + verdict.color +
              '" data-action="verdict-popover">' + esc(verdict.label) + '</button>';
      html += '</div>';
    } else {
      html += '<div class="ac-footer-left"></div>';
    }

    // Budget bar (center)
    html += '<div class="ac-footer-center">';
    if (budget.total > 0) {
      var pct    = Math.min(100, Math.round((budget.used / budget.total) * 100));
      var barCls = pct >= 100 ? 'ac-budget-fill--over'   // P2: --fill not --bar
                 : pct >= 80  ? 'ac-budget-fill--warn'
                 : 'ac-budget-fill--ok';
      html += '<span class="ac-budget-label">TIME BUDGET</span>';
      html += '<div class="ac-budget-track">';
      html += '<div class="ac-budget-fill ' + barCls + '" style="width:' + pct + '%"></div>';
      html += '</div>';
      html += '<span class="ac-budget-stats">';
      if (budget.used) html += budget.used + 'm planned';
      if (budget.slack > 0) html += ' \u00b7 ' + budget.slack + 'm slack';
      if (budget.slack < 0) html += ' \u00b7 ' + Math.abs(budget.slack) + 'm over';
      html += '</span>';
      warningPills.forEach(function(p) {
        html += '<span class="ac-budget-warning ac-budget-warning--' +
                p.severity + '">' + p.text + '</span>';
      });
    } else {
      html += '<span class="ac-budget-label">TIME BUDGET</span>';
      html += '<span class="ac-budget-empty ac-muted">Set duration in header to track time</span>';
    }
    html += '</div>';

    // Action buttons (right)
    html += '<div class="ac-footer-right">';
    // E-Phase: Save & invite button — enabled only when meeting.scheduled_for is set.
    // D-S3 hard guard: an invitation without a date is meaningless.
    if (meeting.scheduled_for) {
      html += '<button class="ac-btn-secondary" data-action="save-invite"' +
              ' title="Send invitations to pending attendees">Save &amp; invite</button>';
    } else {
      html += '<button class="ac-btn-secondary" data-action="save-invite" disabled' +
              ' title="Set a meeting date before sending invitations">Save &amp; invite</button>';
    }
    html += '<button class="ac-btn-primary" data-action="begin-meeting">Begin Meeting \u2192</button>';
    html += '</div>';

    return html;
  }

  // §7.3 — Footer event wiring
  // Optional-chaining removed — rewritten to match established codebase pattern
  function _wireFooterEvents(footer, meeting, verdict) {
    footer.addEventListener('click', function(ev) {
      var target = ev.target;
      var action = target.dataset.action ||
                   (target.closest('[data-action]') &&
                    target.closest('[data-action]').dataset.action);
      if (!action) return;

      if (action === 'verdict-popover') {
        var btn = target.closest('[data-action="verdict-popover"]');
        if (!btn) return;
        _toggleVerdictPopover(btn, verdict);
        return;
      }

      if (action === 'begin-meeting') {
        _onBeginMeeting(meeting);
        return;
      }

      if (action === 'save-invite') {
        _onSaveInvite(meeting);
        return;
      }
    });
  }

  // ── E-Phase · RSVP poll (E2, Option A) ──────────────────────────────────────
  // Polls accord_meeting_attendees every 10s for rsvp_status changes and
  // re-renders the attendees block if any status changed. Fires only on idle
  // meetings. Stopped by teardown or on meeting state change.
  function _startRsvpPoll(meeting, workstreamId) {
    _stopRsvpPoll();
    _rsvpPollTimer = setInterval(function() {
      if (_attendeesAborted) { _stopRsvpPoll(); return; }
      API.get(
        'accord_meeting_attendees?meeting_id=eq.' + meeting.meeting_id +
        '&select=attendee_id,rsvp_status'
      ).then(function(rows) {
        if (_attendeesAborted) return;
        rows = rows || [];
        // Check if any rsvp_status changed since last render
        var block = document.getElementById('ac-attendees-block');
        if (!block) { _stopRsvpPoll(); return; }
        var currentCards = block.querySelectorAll('[data-attendee-id]');
        var changed = rows.some(function(row) {
          var card = block.querySelector('[data-attendee-id="' + row.attendee_id + '"]');
          if (!card) return true; // new attendee added
          // X-25: pending now renders .ac-badge--pending; treat all
          // statuses uniformly — any missing or class-mismatched badge
          // triggers a re-render. (Organizer cards lack a badge by
          // design and may cause a spurious re-render each cycle; that's
          // a pre-existing no-op since the output is identical.)
          var badge    = card.querySelector('.ac-attendee-badge');
          var hasBadge = !!badge;
          if (!hasBadge) return true;  // badge missing → re-render
          return !badge.classList.contains('ac-badge--' + row.rsvp_status);
        });
        if (changed) {
          // Re-render full attendee list to pick up new rsvp_status badges
          _loadAttendees(meeting, workstreamId);
        }
      }).catch(function() {}); // silent — poll failure is non-fatal
    }, 10000);
  }

  function _stopRsvpPoll() {
    if (_rsvpPollTimer) {
      clearInterval(_rsvpPollTimer);
      _rsvpPollTimer = null;
    }
  }

  // ── E-Phase · CMD-ACCORD-INVITATION-PIPELINE-1 ──────────────────────────────
  // E1: "Save & invite" dispatch handler.
  // Fetches all pending attendees for the meeting, inserts accord_invitation_tokens
  // rows, calls notify-meeting-invitation Edge Function for each, and shows
  // inline confirmation. D-S3: scheduled_for is guaranteed non-null by the
  // button guard in _footerHtml.
  function _onSaveInvite(meeting) {
    var btn = document.querySelector('[data-action="save-invite"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

    var SUPA_URL = 'https://dvbetgdzksatcgdfftbs.supabase.co';
    var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR2YmV0Z2R6a3NhdGNnZGZmdGJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NDc2MTYsImV4cCI6MjA4OTEyMzYxNn0.1geeKhrLL3nhjW08ieKr7YZmE0AVX4xnom7i2j1W358';

    // Step 1: fetch pending attendees with resource email + name
    API.get(
      'accord_meeting_attendees?meeting_id=eq.' + meeting.meeting_id +
      '&rsvp_status=eq.pending' +
      '&select=attendee_id,resource_id,resources!inner(name,email)'
    ).then(function(rows) {
      rows = rows || [];
      if (!rows.length) {
        if (btn) { btn.disabled = false; btn.textContent = 'Save & invite'; }
        _showInviteResult('No pending attendees to invite.', false);
        return;
      }

      // Format meeting date string (D-S3: scheduled_for always present here)
      var meetingDate = new Date(meeting.scheduled_for).toLocaleDateString(undefined, {
        weekday: 'long', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
      var meetingDuration = meeting.duration_minutes ? (meeting.duration_minutes + ' min') : null;
      var organizerName   = (window.Accord && window.Accord.state && window.Accord.state.me)
                            ? (window.Accord.state.me.name || 'Organizer') : 'Organizer';
      var firmName        = meeting.firm_id ? 'Apex Consulting Group' : '';

      // Step 2: for each pending attendee, insert token + call Edge Function
      var promises = rows.map(function(a) {
        var res   = a.resources || {};
        var email = res.email;
        var name  = res.name || 'Invitee';
        if (!email) return Promise.resolve({ skipped: true, name: name });

        // Insert invitation token
        return API.post('accord_invitation_tokens', {
          firm_id:         meeting.firm_id,
          meeting_id:      meeting.meeting_id,
          attendee_id:     a.attendee_id,
          recipient_email: email,
          recipient_name:  name
        }).then(function(tokenRow) {
          // API.post returns an array — extract first element
          var token = tokenRow && tokenRow[0] && tokenRow[0].token;
          if (!token) return { error: 'no token', name: name };

          // Call notify-meeting-invitation Edge Function
          return fetch(
            SUPA_URL + '/functions/v1/notify-meeting-invitation',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
              body: JSON.stringify({
                token:            token,
                recipient_email:  email,
                recipient_name:   name,
                meeting_title:    meeting.title,
                meeting_date:     meetingDate,
                meeting_duration: meetingDuration,
                meeting_location: meeting.location || null,
                organizer_name:   organizerName,
                firm_name:        firmName
              })
            }
          ).then(function(r) { return r.json(); })
           .then(function(data) { return { sent: !!data.sent, name: name, data: data }; })
           .catch(function(e) { return { error: e.message, name: name }; });
        }).catch(function(e) { return { error: e.message, name: name }; });
      });

      Promise.all(promises).then(function(results) {
        var sent    = results.filter(function(r) { return r.sent; }).length;
        var skipped = results.filter(function(r) { return r.skipped; }).length;
        var errors  = results.filter(function(r) { return r.error; }).length;

        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Resend invitations';
          btn.title = 'Resend invitations to pending attendees';
        }

        var msg = 'Invitations sent to ' + sent + ' attendee' + (sent === 1 ? '' : 's');
        if (skipped) msg += ' (' + skipped + ' skipped — no email)';
        if (errors)  msg += ' · ' + errors + ' error' + (errors === 1 ? '' : 's');
        _showInviteResult(msg, errors > 0);
      });
    }).catch(function(e) {
      console.error('[AccordMeetingSetup] save-invite failed', e);
      if (btn) { btn.disabled = false; btn.textContent = 'Save & invite'; }
      _showInviteResult('Error: ' + e.message, true);
    });
  }

  function _showInviteResult(msg, isError) {
    var footer = document.querySelector('.ac-setup-footer');
    if (!footer) return;
    var existing = footer.querySelector('.ac-invite-result');
    if (existing) existing.remove();
    var el = document.createElement('div');
    el.className = 'ac-invite-result';
    el.style.cssText = 'font-family:var(--ac-font-mono,monospace);font-size:11px;' +
      'color:' + (isError ? 'var(--ac-rose,#ff6b6b)' : 'var(--ac-green,#00e5a0)') + ';' +
      'padding:4px 8px;letter-spacing:.04em;';
    el.textContent = msg;
    footer.querySelector('.ac-footer-right').insertAdjacentElement('beforebegin', el);
    setTimeout(function() { if (el.parentNode) el.remove(); }, 6000);
  }

  // §8 — Verdict modal (centered, dimmed backdrop)
  function _toggleVerdictPopover(anchor, verdict) {
    var existing = document.getElementById('ac-verdict-popover');
    if (existing) {
      existing.remove();
      _verdictPopoverOpen = false;
      return;
    }

    if (!verdict) return;
    _verdictPopoverOpen = true;

    // Backdrop
    var backdrop = document.createElement('div');
    backdrop.id = 'ac-verdict-popover';
    backdrop.className = 'ac-verdict-backdrop';

    // Modal
    var modal = document.createElement('div');
    modal.className = 'ac-verdict-modal';

    var checksHtml = verdict.checks.map(function(c) {
      var icon = c.passed ? '\u2713' : (c.blocking ? '\u2717' : '\u25b3');
      var cls  = c.passed ? 'ac-check--pass' : (c.blocking ? 'ac-check--fail' : 'ac-check--warn');
      return '<div class="ac-check-row ' + cls + '">' +
             '<span class="ac-check-icon">' + icon + '</span>' +
             '<span class="ac-check-label">' + esc(c.label) + '</span>' +
             '</div>';
    }).join('');

    modal.innerHTML =
      '<div class="ac-verdict-modal-header">' +
        '<span class="ac-verdict-modal-title">READINESS</span>' +
        '<button class="ac-verdict-modal-close" data-action="verdict-close">\u2715</button>' +
      '</div>' +
      '<div class="ac-verdict-modal-pill ac-verdict-pill--' + verdict.color + '">' +
        esc(verdict.label) +
      '</div>' +
      '<div class="ac-verdict-modal-checks">' + checksHtml + '</div>';

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    // Close on backdrop click or ✕ button
    backdrop.addEventListener('click', function(ev) {
      if (ev.target === backdrop ||
          (ev.target.dataset && ev.target.dataset.action === 'verdict-close')) {
        backdrop.remove();
        _verdictPopoverOpen = false;
      }
    });

    // Close on Escape
    function _onEsc(ev) {
      if (ev.key === 'Escape') {
        backdrop.remove();
        _verdictPopoverOpen = false;
        document.removeEventListener('keydown', _onEsc);
      }
    }
    document.addEventListener('keydown', _onEsc);
  }

  // §9 — Begin Meeting
  function _onBeginMeeting(meeting) {
    var btn = document.querySelector('[data-action="begin-meeting"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Starting\u2026';
    }

    if (typeof window.Accord.startMeeting !== 'function') {
      console.error('[AccordMeetingSetup] Accord.startMeeting not available');
      if (btn) { btn.disabled = false; btn.textContent = 'Begin Meeting \u2192'; }
      return;
    }

    window.Accord.startMeeting(meeting.meeting_id)
      .catch(function(e) {
        console.error('[AccordMeetingSetup] startMeeting failed', e);
        if (btn && btn.isConnected) {
          btn.disabled = false;
          btn.textContent = 'Begin Meeting \u2192';
        }
      });
    // Success: accord-core transitions surface to running shell; teardown fires automatically
  }

  // §10 — Gathering countdown timer (F-C12-1 carry-forward)
  // Renamed from C-13 spec (_startCountdown/_stopCountdown) to avoid
  // collision with CMD-ACCORD-SETUP-HEADER-1's _startCountdown/_stopCountdown
  // (header "STARTS IN" countdown, lines 1104/1142). State var: _countdownInterval.
  function _startGatheringCountdown(scheduledFor) {
    _stopGatheringCountdown();

    var target = new Date(scheduledFor).getTime();

    function _tick() {
      var remaining = Math.max(0, target - Date.now());
      var mins  = Math.floor(remaining / 60000);
      var secs  = Math.floor((remaining % 60000) / 1000);
      var display = mins + ':' + (secs < 10 ? '0' : '') + secs;

      var el = document.getElementById('ac-countdown-timer');
      if (!el) { _stopGatheringCountdown(); return; }
      el.textContent = display;
      if (remaining === 0) _stopGatheringCountdown();
    }

    // Mount timer element inside setup shell
    var shell = document.querySelector('.ac-setup-shell');
    if (!shell) return;

    var existing = document.getElementById('ac-countdown-timer');
    if (!existing) {
      var timer = document.createElement('div');
      timer.id = 'ac-countdown-timer';
      timer.className = 'ac-countdown-timer';
      shell.appendChild(timer);
    }

    _tick();   // immediate first tick
    _countdownInterval = setInterval(_tick, 1000);
  }

  function _stopGatheringCountdown() {
    if (_countdownInterval) {
      clearInterval(_countdownInterval);
      _countdownInterval = null;
    }
    var el = document.getElementById('ac-countdown-timer');
    if (el) el.remove();
  }
  // §4 entry + §5 fetch/paint/scrub + §6 density.
  // Sequential fetch: node counts depend on meeting IDs from first
  // fetch — not Promise.all by design.
  // ▶ PLAY HISTORY deferred (future CMD — complex animation).
  // ══════════════════════════════════════════════════════════════

  // §4 — Entry point
  function _renderFilmstrip(meeting, workstreamId) {
    _filmstripAborted = false;
    var myToken = ++_filmstripToken;
    var content = document.querySelector('.ac-filmstrip-content'); // captured once; not re-queried
    console.log('[FILM] start token=', myToken, 'ws=', workstreamId);
    if (!content) { console.log('[FILM] no content element'); return; }
    content.innerHTML = '<div class="ac-film-loading">Loading timeline\u2026</div>';

    if (!workstreamId) {
      content.innerHTML = '<div class="ac-film-empty">No workstream \u2014 standalone meeting.</div>';
      return;
    }

    _fetchFilmMeetings(meeting.meeting_id, workstreamId)
      .then(function(meetings) {
        console.log('[FILM] meetings cb token=', _filmstripToken, 'mine=', myToken, 'ok=', _filmstripToken === myToken);
        if (_filmstripToken !== myToken) return;
        return _fetchFilmNodeCounts(meetings).then(function(countMap) {
          console.log('[FILM] counts cb token=', _filmstripToken, 'mine=', myToken, 'ok=', _filmstripToken === myToken);
          if (_filmstripToken !== myToken) return;
          if (!content.isConnected) return;  // detached — second shell replaced us
          _paintFilmstrip(content, meetings, countMap, meeting, workstreamId);
          console.log('[FILM] painted!');
          _initFilmDensity();
          // C-14: enrich cards with node data + start tier observer
          _enrichFilmCards();
          setTimeout(function() { _initFilmCardTiers(); }, 50);
        });
      })
      .catch(function(e) {
        console.error('[AccordMeetingSetup] filmstrip fetch failed', e);
        if (_filmstripToken !== myToken) return;
        if (!content.isConnected) return;
        content.innerHTML = '<div class="ac-film-error">Could not load timeline.</div>';
      });
  }

  // §5.1 — Fetch meetings (all in workstream, chronological)
  function _fetchFilmMeetings(currentMeetingId, workstreamId) {
    return API.get(
      'accord_meetings?workstream_id=eq.' + workstreamId +
      '&select=meeting_id,title,scheduled_for,sealed_at,state' +
      '&order=scheduled_for.asc.nullslast,created_at.asc'
    ).then(function(rows) { return rows || []; });
  }

  // §5.2 — Fetch node counts (sequential — depends on meeting IDs)
  function _fetchFilmNodeCounts(meetings) {
    if (!meetings.length) return Promise.resolve({});
    var ids = meetings.map(function(m) { return m.meeting_id; }).join(',');
    return API.get(
      'accord_nodes?meeting_id=in.(' + ids + ')&select=meeting_id,tag'
    ).then(function(nodes) {
      var map = {};
      meetings.forEach(function(m) { map[m.meeting_id] = {}; });
      (nodes || []).forEach(function(n) {
        if (!map[n.meeting_id]) map[n.meeting_id] = {};
        map[n.meeting_id][n.tag] = (map[n.meeting_id][n.tag] || 0) + 1;
      });
      return map;
    }).catch(function() { return {}; });
  }

  // §5.3 — Paint
  function _paintFilmstrip(content, meetings, countMap, currentMeeting, workstreamId) {
    var priorCount = meetings.filter(function(m) {
      return m.state === 'closed' || m.state === 'sealed';
    }).length;

    var html = '';

    // Header
    html += '<div class="ac-film-header">';
    html += '<span class="ac-film-label">WORKSTREAM TIMELINE \u00b7 ';
    html += priorCount + ' PRIOR MEETING' + (priorCount !== 1 ? 'S' : '');
    html += ' \u00b7 CLICK ANY FRAME TO SCRUB</span>';
    html += '<div class="ac-film-controls">';
    html += '<span class="ac-film-ctrl" data-action="scrub-first">\u23ee FIRST</span>';
    html += '<span class="ac-film-ctrl ac-film-ctrl--active" data-action="scrub-today">\u2299 TODAY</span>';
    html += '<span class="ac-film-ctrl" data-action="scrub-next">\u23ed NEXT</span>';
    html += '</div>';
    html += '</div>';

    // Frame track
    html += '<div class="ac-film-track" id="ac-film-track">';
    meetings.forEach(function(m, idx) {
      var isCurrent = m.meeting_id === currentMeeting.meeting_id;
      var isFuture  = (m.state === 'idle') && !isCurrent;
      var counts    = countMap[m.meeting_id] || {};
      var date      = _filmDate(m);
      var summary   = _filmCountSummary(counts);
      var hasDissent  = (counts['dissent']  || 0) > 0;
      var hasDecision = (counts['decision'] || 0) > 0;
      var thumbIdx  = (idx % 12) + 1;

      var frameClass = 'ac-film-frame';
      if (isCurrent) frameClass += ' ac-film-frame--current';
      if (isFuture)  frameClass += ' ac-film-frame--future';

      html += '<div class="' + frameClass + '" data-meeting-id="' + esc(m.meeting_id) + '">';
      html += '<div class="ac-film-thumb ac-film-thumb--f' + thumbIdx + '"></div>';

      if (hasDissent)       html += '<div class="ac-film-marker ac-film-marker--dissent"></div>';
      else if (hasDecision) html += '<div class="ac-film-marker ac-film-marker--decision"></div>';

      html += '<div class="ac-film-meta">';
      if (summary) html += '<div class="ac-film-counts">' + esc(summary) + '</div>';
      html += '<div class="ac-film-date' + (isCurrent ? ' ac-film-date--current' : '') + '">';
      html += esc(date) + '</div>';
      html += '</div>';
      html += '</div>'; // .ac-film-frame
    });
    html += '</div>'; // .ac-film-track

    content.innerHTML = html;
    _wireFilmstripEvents(content, meetings, currentMeeting, workstreamId);
    _scrollToCurrentFrame(content);
  }

  // §5.4 — Date and count helpers
  function _filmDate(meeting) {
    var d = meeting.scheduled_for || meeting.sealed_at;
    if (!d) return '\u2014';
    return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function _filmCountSummary(counts) {
    var parts = [];
    FILM_TAG_ORDER.forEach(function(t) {
      var n = counts[t.tag] || 0;
      if (n > 0) parts.push(n + t.abbr);
    });
    return parts.length ? parts.join(' \u00b7 ') : '';
  }

  // §5.5 — Scrub overlay: activate / deactivate
  function _activateScrub(meetingId, meetings, currentMeeting, workstreamId) {
    _scrubState.active    = true;
    _scrubState.meetingId = meetingId;

    // Highlight active frame
    document.querySelectorAll('.ac-film-frame').forEach(function(f) {
      f.classList.toggle('ac-film-frame--scrubbing', f.dataset.meetingId === meetingId);
    });

    var todayCtrl = document.querySelector('[data-action="scrub-today"]');
    if (todayCtrl) todayCtrl.classList.remove('ac-film-ctrl--active');

    // Only take over the center column when Minute Notes tab is active.
    // When Agenda tab is active, scrub state is recorded but center is untouched.
    // NOTE: we now always switch to minute-notes at end of this function,
    // so this guard is no longer needed. Keep comment for history.

    var tabbody = document.querySelector('.ac-col-tabbody[data-col="center"]');
    if (!tabbody) return;

    // Hide existing content (preserve — do not destroy)
    tabbody.querySelectorAll(':scope > *:not(#ac-scrub-overlay)').forEach(function(el) {
      el.style.display = 'none';
    });

    // Create or reuse scrub overlay
    var overlay = document.getElementById('ac-scrub-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id        = 'ac-scrub-overlay';
      overlay.className = 'ac-scrub-overlay';
      tabbody.insertBefore(overlay, tabbody.firstChild);
    }
    overlay.style.display = '';

    var priorMeetings = meetings.filter(function(m) {
      return m.state === 'closed' || m.state === 'sealed';
    });
    var idx  = priorMeetings.findIndex(function(m) { return m.meeting_id === meetingId; });
    var mtg  = meetings.find(function(m) { return m.meeting_id === meetingId; });
    var pos  = idx >= 0 ? (idx + 1) + ' / ' + priorMeetings.length : '';

    overlay.innerHTML = [
      '<div class="ac-scrub-header">',
        '<span class="ac-scrub-title">' + esc(mtg ? mtg.title : '\u2014') + '</span>',
        '<div class="ac-scrub-nav">',
          '<button class="ac-scrub-prev" data-action="scrub-prev">\u2039</button>',
          '<span class="ac-scrub-pos">' + esc(pos) + '</span>',
          '<button class="ac-scrub-next" data-action="scrub-next-frame">\u203a</button>',
        '</div>',
        '<button class="ac-scrub-close" data-action="scrub-close">Back to agenda</button>',
      '</div>',
      '<div class="ac-scrub-nodes" id="ac-scrub-nodes">',
        '<div class="ac-scrub-loading">Loading captures\u2026</div>',
      '</div>'
    ].join('');

    _loadScrubNodes(meetingId, overlay);
    _wireScrubNav(overlay, meetings, currentMeeting, workstreamId);

    // Switch tab bar to Minute Notes when scrub activates
    _centerActiveTab = 'minute-notes';
    _updateCenterTabBar(
      document.querySelector('.ac-col-tabbar[data-col="center"]'),
      'minute-notes'
    );
  }

  function _deactivateScrub(currentMeeting) {
    _scrubState.active    = false;
    _scrubState.meetingId = null;

    // Restore center column
    var tabbody = document.querySelector('.ac-col-tabbody[data-col="center"]');
    if (tabbody) {
      tabbody.querySelectorAll(':scope > *').forEach(function(el) {
        el.style.display = '';
      });
      var overlay = document.getElementById('ac-scrub-overlay');
      if (overlay) overlay.style.display = 'none';
    }

    // Reset frame highlighting
    document.querySelectorAll('.ac-film-frame').forEach(function(f) {
      f.classList.remove('ac-film-frame--scrubbing');
    });

    // Hide scrub agenda if present
    var scrubAgenda = document.getElementById('ac-scrub-agenda');
    if (scrubAgenda) scrubAgenda.style.display = 'none';

    var todayCtrl = document.querySelector('[data-action="scrub-today"]');
    if (todayCtrl) todayCtrl.classList.add('ac-film-ctrl--active');

    // Switch tab bar back to Agenda when scrub deactivates
    _centerActiveTab = 'agenda';
    _updateCenterTabBar(
      document.querySelector('.ac-col-tabbar[data-col="center"]'),
      'agenda'
    );
  }

  // §5.6 — Load scrub nodes
  function _loadScrubNodes(meetingId, overlay) {
    API.get(
      'accord_nodes?meeting_id=eq.' + meetingId +
      '&order=created_at.asc' +
      '&select=node_id,tag,summary,seq_id,created_at'
    ).then(function(nodes) {
      var container = overlay.querySelector('#ac-scrub-nodes');
      if (!container) return;
      nodes = nodes || [];
      if (!nodes.length) {
        container.innerHTML = '<div class="ac-scrub-empty">No captures in this meeting.</div>';
        return;
      }
      container.innerHTML = nodes.map(function(n) {
        return [
          '<div class="ac-scrub-node ac-scrub-node--' + esc(n.tag) + '">',
            '<span class="ac-scrub-node-tag">' +
              esc((n.seq_id || n.tag || '').toString().toUpperCase()) + '</span>',
            '<span class="ac-scrub-node-summary">' + esc(n.summary || '') + '</span>',
          '</div>'
        ].join('');
      }).join('');
    }).catch(function(e) {
      console.error('[AccordMeetingSetup] scrub nodes fetch failed', e);
      var container = overlay.querySelector('#ac-scrub-nodes');
      if (container) container.innerHTML = '<div class="ac-scrub-error">Could not load captures.</div>';
    });
  }

  // §5.7 — Scrub nav wiring (prev/next/close on overlay)
  function _wireScrubNav(overlay, meetings, currentMeeting, workstreamId) {
    overlay.addEventListener('click', function(ev) {
      var action = ev.target.dataset.action ||
                   (ev.target.closest('[data-action]') &&
                    ev.target.closest('[data-action]').dataset.action);
      if (!action) return;

      if (action === 'scrub-close') {
        _deactivateScrub(currentMeeting);
        return;
      }

      var priorMeetings = meetings.filter(function(m) {
        return m.state === 'closed' || m.state === 'sealed';
      });
      var idx = priorMeetings.findIndex(function(m) {
        return m.meeting_id === _scrubState.meetingId;
      });

      if (action === 'scrub-prev' && idx > 0) {
        _activateScrub(priorMeetings[idx - 1].meeting_id, meetings, currentMeeting, workstreamId);
      }
      if (action === 'scrub-next-frame' && idx < priorMeetings.length - 1) {
        _activateScrub(priorMeetings[idx + 1].meeting_id, meetings, currentMeeting, workstreamId);
      }
    });
  }

  // §5.8 — Filmstrip track + header event wiring
  function _wireFilmstripEvents(content, meetings, currentMeeting, workstreamId) {
    // Track: frame clicks
    var track = content.querySelector('#ac-film-track');
    if (track) {
      track.addEventListener('click', function(ev) {
        var frame = ev.target.closest('.ac-film-frame');
        if (!frame) return;
        var meetingId = frame.dataset.meetingId;
        if (!meetingId) return;

        // Clicking current frame deactivates scrub
        if (meetingId === currentMeeting.meeting_id) {
          if (_scrubState.active) _deactivateScrub(currentMeeting);
          return;
        }

        // Future idle frames are not scrubable
        var mtg = meetings.find(function(m) { return m.meeting_id === meetingId; });
        if (!mtg || (mtg.state === 'idle' && meetingId !== currentMeeting.meeting_id)) return;

        _activateScrub(meetingId, meetings, currentMeeting, workstreamId);
      });
    }

    // Header controls
    content.addEventListener('click', function(ev) {
      var action = ev.target.dataset.action ||
                   (ev.target.closest('[data-action]') &&
                    ev.target.closest('[data-action]').dataset.action);
      if (!action) return;

      var priorMeetings = meetings.filter(function(m) {
        return m.state === 'closed' || m.state === 'sealed';
      });

      if (action === 'scrub-first' && priorMeetings.length) {
        _activateScrub(priorMeetings[0].meeting_id, meetings, currentMeeting, workstreamId);
        return;
      }
      if (action === 'scrub-today') {
        if (_scrubState.active) _deactivateScrub(currentMeeting);
        _scrollToCurrentFrame(content);
        return;
      }
      if (action === 'scrub-next') {
        var futureIdle = meetings.filter(function(m) {
          return m.state === 'idle' && m.meeting_id !== currentMeeting.meeting_id;
        });
        if (futureIdle.length && window.Accord && Accord.setLevel) {
          Accord.setLevel('meeting', {
            meetingId:    futureIdle[0].meeting_id,
            workstreamId: workstreamId,
            meetingState: 'idle'   // pre-signals transitions to apply fullpage before animation
          });
        }
      }
    });
  }

  function _scrollToCurrentFrame(content) {
    var current = content.querySelector('.ac-film-frame--current');
    if (current) {
      current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  // §6 — Density state via ResizeObserver
  function _initFilmDensity() {
    var filmstrip = document.querySelector('.ac-setup-filmstrip');
    if (!filmstrip || typeof ResizeObserver === 'undefined') return;

    if (_filmResizeObserver) { _filmResizeObserver.disconnect(); _filmResizeObserver = null; }

    _filmResizeObserver = new ResizeObserver(function(entries) {
      var h = (entries[0] && entries[0].contentRect && entries[0].contentRect.height)
              || filmstrip.offsetHeight;
      filmstrip.setAttribute('data-density',
        h < 130 ? 'compact' : (h < 260 ? 'medium' : 'expanded'));
    });
    _filmResizeObserver.observe(filmstrip);

    // Set initial density
    var h = filmstrip.offsetHeight;
    filmstrip.setAttribute('data-density',
      h < 130 ? 'compact' : (h < 260 ? 'medium' : 'expanded'));
  }

  // ══════════════════════════════════════════════════════════════
  // CMD-ACCORD-SETUP-FILMSTRIP-CARDS-1 (C-14) — Card information density
  // §4 data fetch · §5 card paint · §7 ResizeObserver tier classes
  // P1 amendment: tier observer uses _filmTierObserver (not
  // _filmResizeObserver — already used by _initFilmDensity).
  // sealed_at=not.is.null filter — committed content only.
  // ══════════════════════════════════════════════════════════════

  // §4 — Batch fetch and enrich all visible cards
  function _enrichFilmCards() {
    var myToken = ++_filmCardToken;

    var frames = document.querySelectorAll('.ac-film-frame[data-meeting-id]');
    if (!frames.length) return;

    var ids = Array.from(frames).map(function(f) {
      return f.dataset.meetingId;
    }).filter(Boolean);

    if (!ids.length) return;

    API.get(
      'accord_nodes?meeting_id=in.(' + ids.join(',') + ')' +
      '&tag=in.(decision,action,dissent,risk)' +
      '&sealed_at=not.is.null' +
      '&select=meeting_id,tag,seq_id,summary,created_by' +
      '&order=meeting_id.asc,seq_number.asc' +
      '&limit=60'
    ).then(function(nodes) {
      if (_filmCardToken !== myToken) return;
      nodes = nodes || [];

      // Group by meeting_id
      var byMeeting = {};
      nodes.forEach(function(n) {
        if (!byMeeting[n.meeting_id]) byMeeting[n.meeting_id] = [];
        byMeeting[n.meeting_id].push(n);
      });

      // Enrich each frame in place
      frames.forEach(function(frame) {
        var mid = frame.dataset.meetingId;
        if (!mid) return;
        _paintFilmCardContent(frame, byMeeting[mid] || []);
      });
    }).catch(function(e) {
      console.error('[AccordMeetingSetup] filmcard enrich failed', e);
    });
  }

  // §5 — Paint dots + node lines onto a single card
  function _paintFilmCardContent(frame, nodes) {
    // Remove any existing enrichment
    var existing = frame.querySelector('.ac-film-dots');
    if (existing) existing.remove();
    var existingNodes = frame.querySelector('.ac-film-nodes');
    if (existingNodes) existingNodes.remove();

    if (!nodes.length) return;

    // ── Dot strip (always visible) ────────────────────────
    var tagTypes = {};
    nodes.forEach(function(n) { tagTypes[n.tag] = true; });

    var dotHtml = '<div class="ac-film-dots">';
    if (tagTypes.decision) dotHtml += '<span class="ac-film-dot ac-film-dot--decision"></span>';
    if (tagTypes.action)   dotHtml += '<span class="ac-film-dot ac-film-dot--action"></span>';
    if (tagTypes.dissent)  dotHtml += '<span class="ac-film-dot ac-film-dot--dissent"></span>';
    if (tagTypes.risk)     dotHtml += '<span class="ac-film-dot ac-film-dot--risk"></span>';
    dotHtml += '</div>';

    frame.insertAdjacentHTML('afterbegin', dotHtml);

    // ── Node lines (visibility CSS-controlled by tier class) ──
    var tagOrder = ['decision', 'action', 'dissent', 'risk'];
    var sorted = nodes.slice().sort(function(a, b) {
      return tagOrder.indexOf(a.tag) - tagOrder.indexOf(b.tag);
    });

    var nodesHtml = '<div class="ac-film-nodes">';
    sorted.slice(0, 4).forEach(function(n) {
      nodesHtml += '<div class="ac-film-node ac-film-node--' + n.tag + '">';
      nodesHtml += '<span class="ac-film-node-seq">' + esc(n.seq_id || '') + '</span>';
      if (n.summary) {
        nodesHtml += '<span class="ac-film-node-summary">' +
                     esc(n.summary.slice(0, 40)) + '</span>';
      }
      nodesHtml += '</div>';
    });
    nodesHtml += '</div>';

    frame.insertAdjacentHTML('beforeend', nodesHtml);
  }

  // §7 — ResizeObserver: apply tier classes to each frame based on height
  // Uses _filmTierObserver (P1 amendment — avoids collision with
  // _filmResizeObserver used by _initFilmDensity for zone density)
  function _initFilmCardTiers() {
    if (typeof ResizeObserver === 'undefined') return;

    _stopFilmCardTiers();

    _filmTierObserver = new ResizeObserver(function(entries) {
      entries.forEach(function(entry) {
        var frame  = entry.target;
        var height = entry.contentRect.height;
        frame.classList.remove('ac-film-frame--compact', 'ac-film-frame--full');
        if (height >= 140) {
          frame.classList.add('ac-film-frame--full');
        } else if (height >= 90) {
          frame.classList.add('ac-film-frame--compact');
        }
      });
    });

    document.querySelectorAll('.ac-film-frame').forEach(function(frame) {
      _filmTierObserver.observe(frame);
    });
  }

  function _stopFilmCardTiers() {
    if (_filmTierObserver) {
      _filmTierObserver.disconnect();
      _filmTierObserver = null;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // LEFT COLUMN TABS — CMD-ACCORD-SETUP-BRIEFING-TABS-1
  // §4 tab bar · §5 dispatch · §6 briefing · §7 decisions · §8 risks
  // V6: no project_id on workstreams — risks tab renders empty state.
  // _leftActiveTab persists across renders (smoke test 8 — intentional).
  // ══════════════════════════════════════════════════════════════

  // §4 — Tab bar
  function _renderLeftTabBar(meeting) {
    var tabbar = document.querySelector('.ac-col-tabbar[data-col="left"]');
    if (!tabbar || tabbar.dataset.wired) return;
    tabbar.dataset.wired = '1';

    var tabs = [
      { id: 'briefing',  label: 'Briefing'  },
      { id: 'decisions', label: 'Decisions' },
      { id: 'risks',     label: 'Risks'     }
    ];

    tabbar.innerHTML = [
      '<div class="ac-tabs">',
        tabs.map(function(t) {
          var active = t.id === _leftActiveTab ? ' ac-tab--active' : '';
          return '<button class="ac-tab' + active + '" data-action="left-tab" ' +
                 'data-tab="' + t.id + '">' + t.label + '</button>';
        }).join(''),
      '</div>',
      '<div class="ac-col-slideshow-controls" data-col="left">',
        '<div class="ac-col-stepper" data-col="left" style="display:none"></div>',
        '<div class="ac-rotation-toggle" data-col="left">',
          '<button class="ac-toggle-btn" data-action="slideshow-policy"',
                  ' data-col="left" data-val="auto">AUTO</button>',
          '<button class="ac-toggle-btn ac-toggle-btn--active" data-action="slideshow-policy"',
                  ' data-col="left" data-val="manual">MANUAL</button>',
        '</div>',
      '</div>',
      '<div class="ac-rotation-progress ac-rotation-progress--frozen" data-col="left"></div>'
    ].join('');

    tabbar.addEventListener('click', function(ev) {
      var target = ev.target.closest('[data-action]');
      var action = target && target.dataset.action;

      // ── left-tab click ────────────────────────────────────────
      if (action === 'left-tab') {
        var tab = target.dataset.tab;
        if (!tab || tab === _leftActiveTab) return;
        _leftActiveTab = tab;
        _activateLeftTab(tab, meeting);
        tabbar.querySelectorAll('.ac-tabs .ac-tab').forEach(function(b) {
          b.classList.toggle('ac-tab--active', b.dataset.tab === tab);
        });
        var le = _slideshowEngines['left'];
        if (le && le.policy === 'auto') {
          var ltabs = _getSlideshowTabs('left');
          le.currentIdx = ltabs.indexOf(tab);
          if (le.currentIdx < 0) le.currentIdx = 0;
          _slideshowUpdateStepper('left', le.currentIdx);
          _slideshowManualClick('left');
        }
        return;
      }

      // ── AUTO / MANUAL toggle ──────────────────────────────────
      if (action === 'slideshow-policy') {
        if (!target || target.dataset.col !== 'left') return;
        var val = target.dataset.val;
        var le2 = _slideshowEngines['left'];
        if (!le2) return;
        tabbar.querySelectorAll('.ac-toggle-btn').forEach(function(b) {
          b.classList.toggle('ac-toggle-btn--active', b.dataset.val === val);
        });
        if (val === 'auto') {
          le2.policy       = 'auto';
          le2.initialDwell = true;
          le2.elapsed      = 0;
          le2.pauseUntil   = 0;
          le2.paused       = false;
          _slideshowSetProgress('left', 0);
          _slideshowFreezeProgress('left', false);
          var ptabs = _getSlideshowTabs('left');
          var stepper = tabbar.querySelector('.ac-col-stepper');
          if (stepper && ptabs.length > 1) {
            _slideshowPaintStepper('left', le2.currentIdx);
            stepper.style.display = '';
          }
        } else {
          le2.policy       = 'manual';
          le2.initialDwell = false;
          le2.elapsed      = 0;
          le2.pauseUntil   = 0;
          le2.paused       = false;
          _slideshowSetProgress('left', 0);
          _slideshowFreezeProgress('left', true);
          var stepperEl = tabbar.querySelector('.ac-col-stepper');
          if (stepperEl) stepperEl.style.display = 'none';
        }
        return;
      }

      // ── stepper chevron click ─────────────────────────────────
      if (action === 'slideshow-prev' || action === 'slideshow-next') {
        if (!target || target.dataset.col !== 'left') return;
        var le3 = _slideshowEngines['left'];
        if (!le3) return;
        var ctabs = _getSlideshowTabs('left');
        if (ctabs.length <= 1) return;
        var newIdx = action === 'slideshow-prev'
          ? (le3.currentIdx - 1 + ctabs.length) % ctabs.length
          : (le3.currentIdx + 1) % ctabs.length;
        le3.currentIdx = newIdx;
        _slideshowActivateTab('left', newIdx, meeting, null);
        _slideshowUpdateStepper('left', newIdx);
        _slideshowManualClick('left');
        le3.elapsed = 0;
        return;
      }

      // ── stepper dot click ─────────────────────────────────────
      var dot = ev.target.closest('.ac-stepper-dot[data-col="left"]');
      if (dot) {
        var le4 = _slideshowEngines['left'];
        if (!le4) return;
        var dotIdx = parseInt(dot.dataset.idx, 10);
        if (isNaN(dotIdx)) return;
        var dtabs = _getSlideshowTabs('left');
        if (dotIdx < 0 || dotIdx >= dtabs.length) return;
        le4.currentIdx = dotIdx;
        _slideshowActivateTab('left', dotIdx, meeting, null);
        _slideshowUpdateStepper('left', dotIdx);
        _slideshowManualClick('left');
        le4.elapsed = 0;
        return;
      }
    });
  }

  // §5 — Tab activation dispatch
  function _activateLeftTab(tab, meeting) {
    var tabbody = document.querySelector('.ac-col-tabbody[data-col="left"]');
    if (!tabbody) return;
    tabbody.innerHTML = '<div class="ac-tab-loading">Loading\u2026</div>';

    if (tab === 'briefing')  { _renderBriefingTab(tabbody, meeting);  return; }
    if (tab === 'decisions') { _renderDecisionsTab(tabbody, meeting); return; }
    if (tab === 'risks')     { _renderRisksTab(tabbody, meeting);     return; }
  }

  // §6 — Briefing tab

  function _renderBriefingTab(tabbody, meeting) {
    var myToken = ++_briefingToken;

    if (!meeting.workstream_id) {
      tabbody.innerHTML = '<div class="ac-briefing-wrap">' +
        '<div class="ac-briefing-empty">No workstream \u2014 standalone meeting.</div>' +
        '</div>';
      return;
    }

    Promise.all([
      _fetchPriorMeetingBrief(meeting.meeting_id, meeting.workstream_id),
      _fetchPriorActionsSummary(meeting.meeting_id, meeting.workstream_id),
      _fetchPriorDecisions(meeting.workstream_id),
      _fetchAnnotations(meeting.workstream_id)
    ]).then(function(results) {
      if (_briefingToken !== myToken) return;
      if (!tabbody.isConnected) return;
      _paintBriefingTab(tabbody, meeting, results[0], results[1], results[2], results[3]);
    }).catch(function(e) {
      console.error('[AccordMeetingSetup] briefing fetch failed', e);
      if (tabbody.isConnected) {
        tabbody.innerHTML = '<div class="ac-briefing-error">Could not load briefing.</div>';
      }
    });
  }

  function _fetchPriorMeetingBrief(currentMeetingId, workstreamId) {
    return API.get(
      'accord_meetings?workstream_id=eq.' + workstreamId +
      '&meeting_id=neq.' + currentMeetingId +
      '&state=in.(closed,sealed)' +
      '&select=meeting_id,title,scheduled_for,sealed_at,briefing_text,state' +
      '&order=scheduled_for.desc.nullslast,created_at.desc' +
      '&limit=1'
    ).then(function(rows) {
      if (!rows || !rows.length) return null;
      var m = rows[0];
      return API.get(
        'accord_nodes?meeting_id=eq.' + m.meeting_id +
        '&select=tag'
      ).then(function(nodes) {
        m._nodeCounts = {};
        (nodes || []).forEach(function(n) {
          m._nodeCounts[n.tag] = (m._nodeCounts[n.tag] || 0) + 1;
        });
        return m;
      });
    }).catch(function() { return null; });
  }

  function _fetchPriorActionsSummary(currentMeetingId, workstreamId) {
    return API.get(
      'accord_meetings?workstream_id=eq.' + workstreamId +
      '&meeting_id=neq.' + currentMeetingId +
      '&state=in.(closed,sealed)' +
      '&select=meeting_id&limit=20'
    ).then(function(meetings) {
      if (!meetings || !meetings.length) return { total: 0, overdue: 0, dueThisWeek: 0, nodes: [] };
      var ids = meetings.map(function(m) { return m.meeting_id; }).join(',');
      return API.get(
        'accord_nodes?meeting_id=in.(' + ids + ')' +
        '&tag=eq.action' +
        '&select=node_id,summary,due_date,created_by,status,seq_id' +
        '&order=due_date.asc.nullslast'
      ).then(function(nodes) {
        nodes = nodes || [];
        var now = Date.now();
        var weekMs = 7 * 24 * 60 * 60 * 1000;
        var overdue = 0, dueThisWeek = 0;
        nodes.forEach(function(n) {
          if (!n.due_date) return;
          var due = new Date(n.due_date).getTime();
          if (due < now) overdue++;
          else if (due < now + weekMs) dueThisWeek++;
        });
        return { total: nodes.length, overdue: overdue, dueThisWeek: dueThisWeek, nodes: nodes };
      });
    }).catch(function() { return { total: 0, overdue: 0, dueThisWeek: 0, nodes: [] }; });
  }

  function _fetchPriorDecisions(workstreamId) {
    return API.get(
      'accord_meetings?workstream_id=eq.' + workstreamId +
      '&state=in.(closed,sealed)' +
      '&select=meeting_id&limit=20'
    ).then(function(meetings) {
      if (!meetings || !meetings.length) return [];
      var ids = meetings.map(function(m) { return m.meeting_id; }).join(',');
      return API.get(
        'accord_nodes?meeting_id=in.(' + ids + ')' +
        '&tag=eq.decision' +
        '&select=node_id,summary,seq_id,created_at,status' +
        '&order=created_at.desc' +
        '&limit=12'
      ).then(function(nodes) { return nodes || []; });
    }).catch(function() { return []; });
  }

  function _fetchAnnotations(workstreamId) {
    return API.get(
      'accord_meetings?workstream_id=eq.' + workstreamId +
      '&state=in.(closed,sealed)' +
      '&select=meeting_id&limit=20'
    ).then(function(meetings) {
      if (!meetings || !meetings.length) return [];
      var mids = meetings.map(function(m) { return m.meeting_id; }).join(',');
      return API.get(
        'accord_nodes?meeting_id=in.(' + mids + ')' +
        '&tag=eq.decision&select=node_id&limit=50'
      ).then(function(decNodes) {
        if (!decNodes || !decNodes.length) return [];
        var nids = decNodes.map(function(n) { return n.node_id; }).join(',');
        return API.get(
          'accord_belief_adjustments?target_node_id=in.(' + nids + ')' +
          '&select=adjustment_id,target_node_id,delta,rationale,declared_at,declared_by' +
          '&order=declared_at.desc' +
          '&limit=8'
        ).then(function(rows) { return rows || []; });
      });
    }).catch(function() { return []; });
  }

  function _paintBriefingTab(tabbody, meeting, lastMtg, actionsSummary, decisions, annotations) {
    var html = '<div class="ac-briefing-wrap">';

    // Synthesis block
    html += '<div class="ac-briefing-synthesis">';
    html += '<div class="ac-briefing-synthesis-label">IMPORTANT HIGHLIGHTS</div>';
    if (meeting.briefing_text) {
      html += '<div class="ac-briefing-synthesis-text">' + esc(meeting.briefing_text) + '</div>';
    } else {
      html += '<div class="ac-briefing-synthesis-placeholder">' +
              'No briefing written yet. ' +
              '<span class="ac-briefing-edit-link" data-action="focus-briefing">Write one \u2192</span>' +
              '</div>';
    }
    html += '</div>';

    // Last meeting block
    if (lastMtg) {
      html += '<div class="ac-briefing-last">';
      html += '<div class="ac-briefing-section-label">LAST MEETING</div>';
      html += '<div class="ac-briefing-last-meta">';
      var dateStr = lastMtg.sealed_at || lastMtg.scheduled_for;
      html += '<span class="ac-briefing-last-date">' +
              esc(dateStr ? new Date(dateStr).toLocaleDateString(undefined,
                { month: 'short', day: 'numeric' }) : '\u2014') + '</span>';
      html += '<span class="ac-briefing-last-title">' + esc(lastMtg.title || '\u2014') + '</span>';
      html += '</div>';
      var counts = lastMtg._nodeCounts || {};
      var countParts = [];
      [['decision','D'],['action','A'],['dissent','Di'],['risk','R']].forEach(function(pair) {
        var n = counts[pair[0]] || 0;
        if (n) countParts.push(n + pair[1]);
      });
      if (countParts.length) {
        html += '<div class="ac-briefing-last-counts">' + esc(countParts.join(' \u00b7 ')) + '</div>';
      } else {
        html += '<div class="ac-briefing-last-counts ac-muted">No captures</div>';
      }
      if (lastMtg.briefing_text) {
        html += '<div class="ac-briefing-last-summary">' +
                esc(lastMtg.briefing_text.slice(0, 200)) +
                (lastMtg.briefing_text.length > 200 ? '\u2026' : '') + '</div>';
      }
      html += '<a class="ac-briefing-minutes-link" data-action="open-minutes" ' +
              'data-meeting-id="' + esc(lastMtg.meeting_id) + '">' +
              'Read full minutes \u2197</a>';
      html += '</div>';
    }

    // Prior actions summary
    html += '<div class="ac-briefing-actions">';
    html += '<div class="ac-briefing-section-label">PRIOR ACTIONS</div>';
    if (actionsSummary.total === 0) {
      html += '<div class="ac-muted">No prior actions in this workstream.</div>';
    } else {
      var overdueCls = actionsSummary.overdue > 0 ? ' ac-briefing-actions-count--alert' : '';
      html += '<div class="ac-briefing-actions-summary" data-action="toggle-actions-detail">';
      html += '<span class="ac-briefing-actions-count' + overdueCls + '">' +
              actionsSummary.total + ' tracked</span>';
      if (actionsSummary.overdue > 0) {
        html += '<span class="ac-briefing-actions-count ac-briefing-actions-count--alert"> \u00b7 ' +
                actionsSummary.overdue + ' overdue</span>';
      }
      if (actionsSummary.dueThisWeek > 0) {
        html += '<span class="ac-briefing-actions-count ac-muted"> \u00b7 ' +
                actionsSummary.dueThisWeek + ' due this week</span>';
      }
      html += ' <span class="ac-briefing-actions-expand">\u25b8</span>';
      html += '</div>';
      html += '<div class="ac-briefing-actions-detail" id="ac-briefing-actions-detail" style="display:none;">';
      actionsSummary.nodes.slice(0, 10).forEach(function(n) {
        var overdue = n.due_date && new Date(n.due_date) < new Date();
        html += '<div class="ac-briefing-action-row' + (overdue ? ' ac-briefing-action-row--overdue' : '') + '">';
        html += '<span class="ac-briefing-action-seq">' + esc(n.seq_id || 'A') + '</span>';
        html += '<span class="ac-briefing-action-summary">' +
                esc((n.summary || '').slice(0, 80)) + '</span>';
        if (n.due_date) {
          html += '<span class="ac-briefing-action-due' + (overdue ? ' ac-overdue' : '') + '">' +
                  esc(new Date(n.due_date).toLocaleDateString(undefined,
                    { month: 'short', day: 'numeric' })) + '</span>';
        }
        html += '</div>';
      });
      if (actionsSummary.nodes.length > 10) {
        html += '<div class="ac-muted ac-briefing-more">+' +
                (actionsSummary.nodes.length - 10) + ' more</div>';
      }
      html += '</div>';
    }
    html += '</div>';

    // Prior decisions block
    html += '<div class="ac-briefing-decisions">';
    html += '<div class="ac-briefing-section-label">PRIOR DECISIONS</div>';
    if (!decisions.length) {
      html += '<div class="ac-muted">No decisions captured yet.</div>';
    } else {
      decisions.slice(0, 8).forEach(function(d) {
        html += '<div class="ac-briefing-decision-row">';
        html += '<span class="ac-briefing-decision-seq">' + esc(d.seq_id || 'DC') + '</span>';
        html += '<span class="ac-briefing-decision-text">' +
                esc((d.summary || '').slice(0, 90)) + '</span>';
        html += '</div>';
      });
      if (decisions.length > 8) {
        html += '<div class="ac-muted ac-briefing-more">+' +
                (decisions.length - 8) + ' more \u2014 see Decisions tab</div>';
      }
    }
    html += '</div>';

    // Annotations block
    if (annotations.length) {
      html += '<div class="ac-briefing-annotations">';
      html += '<div class="ac-briefing-section-label">BELIEF ADJUSTMENTS</div>';
      annotations.slice(0, 4).forEach(function(a) {
        var delta = a.delta > 0 ? '+' + a.delta : String(a.delta);
        var deltaCls = a.delta > 0 ? 'ac-delta--pos' : 'ac-delta--neg';
        html += '<div class="ac-briefing-annotation-row">';
        html += '<span class="ac-delta ' + deltaCls + '">' + esc(delta) + '</span>';
        html += '<span class="ac-briefing-annotation-rationale">' +
                esc((a.rationale || '').slice(0, 80)) + '</span>';
        html += '</div>';
      });
      html += '</div>';
    }

    html += '</div>'; // .ac-briefing-wrap
    tabbody.innerHTML = html;
    _wireBriefingEvents(tabbody, meeting);
  }

  function _wireBriefingEvents(tabbody, meeting) {
    tabbody.addEventListener('click', function(ev) {
      // Click on existing saved briefing text opens edit (no data-action needed)
      if (ev.target.closest('.ac-briefing-synthesis-text')) {
        _openBriefingEdit(meeting);
        return;
      }

      var action = ev.target.dataset.action ||
                   (ev.target.closest('[data-action]') &&
                    ev.target.closest('[data-action]').dataset.action);
      if (!action) return;

      if (action === 'toggle-actions-detail') {
        var detail = tabbody.querySelector('#ac-briefing-actions-detail');
        var arrow  = tabbody.querySelector('.ac-briefing-actions-expand');
        if (!detail) return;
        var visible = detail.style.display !== 'none';
        detail.style.display = visible ? 'none' : '';
        if (arrow) arrow.textContent = visible ? '\u25b8' : '\u25be';
        return;
      }

      if (action === 'open-minutes') {
        var btn = ev.target.closest('[data-action="open-minutes"]');
        if (!btn) return;
        var mtgId = btn.dataset.meetingId;
        if (window.Accord && Accord.setLevel) {
          Accord.setLevel('meeting', {
            meetingId:    mtgId,
            workstreamId: meeting.workstream_id,
            tab:          'minutes'
          });
        }
        return;
      }

      if (action === 'focus-briefing') {
        _openBriefingEdit(meeting);
        return;
      }

      if (action === 'save-briefing') {
        _saveBriefingEdit(meeting);
        return;
      }

      if (action === 'cancel-briefing') {
        _cancelBriefingEdit(meeting);
        return;
      }
    });
  }

  // ══════════════════════════════════════════════════════════════
  // X-11 — Briefing inline edit
  // Replaces broken focus-briefing→stakes handler.
  // ══════════════════════════════════════════════════════════════

  function _openBriefingEdit(meeting) {
    var wrap = document.querySelector('.ac-briefing-synthesis');
    if (!wrap) return;
    if (wrap.querySelector('.ac-briefing-edit-area')) return;  // already open

    var placeholder  = wrap.querySelector('.ac-briefing-synthesis-placeholder');
    var existingText = wrap.querySelector('.ac-briefing-synthesis-text');
    var seed = meeting.briefing_text || '';

    if (placeholder)  placeholder.style.display  = 'none';
    if (existingText) existingText.style.display  = 'none';

    var editHtml = '<div class="ac-briefing-edit-area">' +
      '<textarea class="ac-briefing-textarea" ' +
      'placeholder="What leadership needs to know walking in\u2026" ' +
      'rows="5">' + esc(seed) + '</textarea>' +
      '<div class="ac-briefing-edit-actions">' +
        '<button class="ac-briefing-save-btn" data-action="save-briefing">Save</button>' +
        '<button class="ac-briefing-cancel-btn" data-action="cancel-briefing">Cancel</button>' +
      '</div>' +
    '</div>';

    wrap.insertAdjacentHTML('beforeend', editHtml);

    var textarea = wrap.querySelector('.ac-briefing-textarea');
    if (textarea) {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = textarea.value.length;

      textarea.addEventListener('input', function() {
        if (_briefingEditTimer) clearTimeout(_briefingEditTimer);
        _briefingEditTimer = setTimeout(function() {
          _patchBriefingText(textarea.value, meeting);
        }, 800);
      });
    }
  }

  function _saveBriefingEdit(meeting) {
    var textarea = document.querySelector('.ac-briefing-textarea');
    if (!textarea) return;
    var val = textarea.value.trim();
    _patchBriefingText(val, meeting);
    _closeBriefingEdit(meeting, val);
  }

  function _cancelBriefingEdit(meeting) {
    _closeBriefingEdit(meeting, meeting.briefing_text || null);
  }

  function _closeBriefingEdit(meeting, newValue) {
    if (_briefingEditTimer) { clearTimeout(_briefingEditTimer); _briefingEditTimer = null; }
    var wrap = document.querySelector('.ac-briefing-synthesis');
    if (!wrap) return;

    var editArea = wrap.querySelector('.ac-briefing-edit-area');
    if (editArea) editArea.remove();

    meeting.briefing_text = newValue || null;

    var placeholder  = wrap.querySelector('.ac-briefing-synthesis-placeholder');
    var existingText = wrap.querySelector('.ac-briefing-synthesis-text');

    if (newValue) {
      if (existingText) {
        existingText.textContent = newValue;
        existingText.style.display = '';
      } else {
        wrap.insertAdjacentHTML('beforeend',
          '<div class="ac-briefing-synthesis-text">' + esc(newValue) + '</div>');
      }
      if (placeholder) placeholder.style.display = 'none';
    } else {
      if (placeholder) placeholder.style.display = '';
      if (existingText) existingText.style.display = 'none';
    }
  }

  function _patchBriefingText(val, meeting) {
    API.patch(
      'accord_meetings?meeting_id=eq.' + meeting.meeting_id,
      { briefing_text: val || null }
    ).catch(function(e) {
      console.error('[AccordMeetingSetup] briefing_text patch failed', e);
    });
  }

  // ══════════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════
  // X-14 — WHEN picker (replaces X-12 duration-only inline edit)
  // §5 wiring · §6 open/close · §7 paint · §8 events · §9 save
  // Optional-chaining removed throughout — matches codebase pattern.
  // _isSameDay reuses existing helper (line ~5627).
  // ══════════════════════════════════════════════════════════════

  // §5 — Wire WHEN row click to open picker
  function _wireWhenPicker(meeting) {
    var whenRow = document.getElementById('ac-meta-when-row');
    if (!whenRow || whenRow.dataset.whenPickerWired) return;
    whenRow.dataset.whenPickerWired = '1';
    delete whenRow.dataset.durationWired;

    whenRow.addEventListener('click', function(ev) {
      if (ev.target.closest('#ac-when-picker')) return;
      _toggleWhenPicker(meeting);
    });
  }

  function _toggleWhenPicker(meeting) {
    if (_pickerOpen) { _closeWhenPicker(); } else { _openWhenPicker(meeting); }
  }

  // §6 — Open / close
  function _openWhenPicker(meeting) {
    _pickerOpen = true;

    if (meeting.scheduled_for) {
      _pickerDate   = new Date(meeting.scheduled_for);
      _pickerHour   = _pickerDate.getHours();
      _pickerMinute = _pickerDate.getMinutes() >= 30 ? 30 : 0;
    } else {
      _pickerDate   = _nextWeekday(new Date());
      _pickerHour   = 9;
      _pickerMinute = 0;
    }
    _pickerDuration  = meeting.duration_minutes || 60;
    _pickerViewYear  = _pickerDate.getFullYear();
    _pickerViewMonth = _pickerDate.getMonth();

    var whenRow = document.getElementById('ac-meta-when-row');
    if (!whenRow) return;

    var existing = document.getElementById('ac-when-picker');
    if (existing) existing.remove();

    // Mount on body to escape overflow:hidden on ac-setup-shell
    var picker = document.createElement('div');
    picker.id = 'ac-when-picker';
    picker.className = 'ac-when-picker';
    document.body.appendChild(picker);

    // Position using WHEN row rect — align right edge, below row
    var rect = whenRow.getBoundingClientRect();
    picker.style.position = 'fixed';
    picker.style.top      = (rect.bottom + 6) + 'px';
    picker.style.right    = (window.innerWidth - rect.right) + 'px';

    _paintPicker(picker, meeting);

    setTimeout(function() {
      document.addEventListener('click', _onPickerOutsideClick);
    }, 0);
  }

  function _closeWhenPicker() {
    _pickerOpen = false;
    var picker = document.getElementById('ac-when-picker');
    if (picker) picker.remove();
    document.removeEventListener('click', _onPickerOutsideClick);
  }

  function _onPickerOutsideClick(ev) {
    var picker  = document.getElementById('ac-when-picker');
    var whenRow = document.getElementById('ac-meta-when-row');
    if (!picker) { document.removeEventListener('click', _onPickerOutsideClick); return; }
    if (!picker.contains(ev.target) && whenRow && !whenRow.contains(ev.target)) {
      _closeWhenPicker();
    }
  }

  function _nextWeekday(date) {
    var d = new Date(date);
    d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    return d;
  }

  // §7 — Picker paint
  function _paintPicker(picker, meeting) {
    picker.innerHTML = [
      '<div class="ac-picker-body">',
        '<div class="ac-picker-left">',
          _calendarHtml(_pickerViewYear, _pickerViewMonth, _pickerDate),
        '</div>',
        '<div class="ac-picker-right">',
          '<div class="ac-picker-field">',
            '<label class="ac-picker-label">START TIME</label>',
            _timeSelectHtml(_pickerHour, _pickerMinute),
          '</div>',
          '<div class="ac-picker-field">',
            '<label class="ac-picker-label">DURATION</label>',
            _durationSelectHtml(_pickerDuration),
          '</div>',
          '<div class="ac-picker-actions">',
            '<button class="ac-picker-set" data-action="picker-set">\u2713 Set</button>',
            '<button class="ac-picker-cancel" data-action="picker-cancel">Cancel</button>',
          '</div>',
        '</div>',
      '</div>'
    ].join('');

    _wirePickerEvents(picker, meeting);
  }

  // §7.1 — Calendar HTML
  function _calendarHtml(year, month, selectedDate) {
    var MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
    var DAY_HEADERS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

    var html = '<div class="ac-cal">';
    html += '<div class="ac-cal-nav">';
    html += '<button class="ac-cal-prev" data-action="cal-prev">\u2039</button>';
    html += '<span class="ac-cal-month-label">' + esc(MONTHS[month]) + ' ' + year + '</span>';
    html += '<button class="ac-cal-next" data-action="cal-next">\u203a</button>';
    html += '</div>';

    html += '<div class="ac-cal-grid">';
    DAY_HEADERS.forEach(function(d) {
      html += '<span class="ac-cal-day-header">' + d + '</span>';
    });

    var firstDay    = new Date(year, month, 1).getDay();
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var today       = new Date();

    for (var i = 0; i < firstDay; i++) {
      html += '<span class="ac-cal-cell ac-cal-cell--empty"></span>';
    }

    for (var d2 = 1; d2 <= daysInMonth; d2++) {
      var cellDate = new Date(year, month, d2);
      var isPast   = cellDate < new Date(today.getFullYear(), today.getMonth(), today.getDate());
      var isToday  = _isSameDay(cellDate, today);
      var isSel    = selectedDate && _isSameDay(cellDate, selectedDate);
      var cls = 'ac-cal-cell';
      if (isPast)  cls += ' ac-cal-cell--past';
      if (isToday) cls += ' ac-cal-cell--today';
      if (isSel)   cls += ' ac-cal-cell--selected';
      html += '<span class="' + cls + '" data-action="cal-select" data-day="' + d2 + '">' +
              d2 + '</span>';
    }

    html += '</div></div>';
    return html;
  }

  // §7.2 — Time select HTML
  function _timeSelectHtml(hour, minute) {
    var html = '<select class="ac-picker-select" id="ac-picker-time">';
    for (var h = 6; h <= 22; h++) {
      for (var m = 0; m < 60; m += 30) {
        var label = _fmt12h(h, m);
        var val   = h + ':' + (m === 0 ? '00' : '30');
        var sel   = (h === hour && m === minute) ? ' selected' : '';
        html += '<option value="' + val + '"' + sel + '>' + esc(label) + '</option>';
      }
    }
    html += '</select>';
    return html;
  }

  function _fmt12h(hour, minute) {
    var ampm = hour >= 12 ? 'PM' : 'AM';
    var h12  = hour % 12 || 12;
    var mStr = minute === 0 ? ':00' : ':30';
    return h12 + mStr + ' ' + ampm;
  }

  // §7.3 — Duration select HTML
  function _durationSelectHtml(currentDuration) {
    var options = [30, 45, 60, 90, 120];
    var html = '<select class="ac-picker-select" id="ac-picker-duration">';
    options.forEach(function(min) {
      var label = min < 60  ? min + ' min'
                : min === 60 ? '1 hour'
                : (min / 60) + ' hours';
      var sel = (min === currentDuration) ? ' selected' : '';
      html += '<option value="' + min + '"' + sel + '>' + label + '</option>';
    });
    var isCustom = options.indexOf(currentDuration) === -1 && currentDuration > 0;
    html += '<option value="custom"' + (isCustom ? ' selected' : '') + '>Custom\u2026</option>';
    html += '</select>';
    if (isCustom) {
      html += '<input class="ac-picker-custom-duration" type="number" ' +
              'min="5" max="480" step="5" value="' + currentDuration + '">';
    }
    return html;
  }

  // §8 — Picker event wiring
  // Optional-chaining removed — uses established delegation pattern
  function _wirePickerEvents(picker, meeting) {
    picker.addEventListener('click', function(ev) {
      var target = ev.target;
      var action = target.dataset.action ||
                   (target.closest('[data-action]') &&
                    target.closest('[data-action]').dataset.action);
      if (!action) return;
      ev.stopPropagation();

      if (action === 'cal-prev') {
        _pickerViewMonth--;
        if (_pickerViewMonth < 0) { _pickerViewMonth = 11; _pickerViewYear--; }
        var cal = picker.querySelector('.ac-cal');
        if (cal) cal.outerHTML = _calendarHtml(_pickerViewYear, _pickerViewMonth, _pickerDate);
        _wirePickerEvents(picker, meeting);
        return;
      }
      if (action === 'cal-next') {
        _pickerViewMonth++;
        if (_pickerViewMonth > 11) { _pickerViewMonth = 0; _pickerViewYear++; }
        var cal2 = picker.querySelector('.ac-cal');
        if (cal2) cal2.outerHTML = _calendarHtml(_pickerViewYear, _pickerViewMonth, _pickerDate);
        _wirePickerEvents(picker, meeting);
        return;
      }
      if (action === 'cal-select') {
        var btn = target.closest('[data-action="cal-select"]');
        if (!btn || btn.classList.contains('ac-cal-cell--past')) return;
        var day = parseInt(btn.dataset.day, 10);
        _pickerDate = new Date(_pickerViewYear, _pickerViewMonth, day);
        var cal3 = picker.querySelector('.ac-cal');
        if (cal3) cal3.outerHTML = _calendarHtml(_pickerViewYear, _pickerViewMonth, _pickerDate);
        _wirePickerEvents(picker, meeting);
        return;
      }
      if (action === 'picker-set')    { _saveWhenPicker(meeting); return; }
      if (action === 'picker-cancel') { _closeWhenPicker(); return; }
    });

    // Time select
    var timeSelect = picker.querySelector('#ac-picker-time');
    if (timeSelect && !timeSelect.dataset.wired) {
      timeSelect.dataset.wired = '1';
      timeSelect.addEventListener('change', function() {
        var parts    = timeSelect.value.split(':');
        _pickerHour   = parseInt(parts[0], 10);
        _pickerMinute = parseInt(parts[1], 10);
      });
    }

    // Duration select
    var durSelect = picker.querySelector('#ac-picker-duration');
    if (durSelect && !durSelect.dataset.wired) {
      durSelect.dataset.wired = '1';
      durSelect.addEventListener('change', function() {
        if (durSelect.value === 'custom') {
          var existingInp = picker.querySelector('.ac-picker-custom-duration');
          if (!existingInp) {
            var inp = document.createElement('input');
            inp.className = 'ac-picker-custom-duration';
            inp.type = 'number';
            inp.min  = '5';
            inp.max  = '480';
            inp.step = '5';
            inp.value = '60';
            durSelect.insertAdjacentElement('afterend', inp);
            inp.focus();
          }
        } else {
          _pickerDuration = parseInt(durSelect.value, 10);
          var customInp2 = picker.querySelector('.ac-picker-custom-duration');
          if (customInp2) customInp2.remove();
        }
      });
    }

    // Custom duration input
    var customInp = picker.querySelector('.ac-picker-custom-duration');
    if (customInp && !customInp.dataset.wired) {
      customInp.dataset.wired = '1';
      customInp.addEventListener('input', function() {
        var val = parseInt(customInp.value, 10);
        if (val > 0) _pickerDuration = val;
      });
    }
  }

  // §9 — Save
  function _saveWhenPicker(meeting) {
    if (!_pickerDate) { _closeWhenPicker(); return; }

    var d = new Date(
      _pickerDate.getFullYear(),
      _pickerDate.getMonth(),
      _pickerDate.getDate(),
      _pickerHour,
      _pickerMinute,
      0, 0
    );
    var scheduledFor = d.toISOString();

    var customInp = document.querySelector('.ac-picker-custom-duration');
    if (customInp) {
      var val = parseInt(customInp.value, 10);
      if (val > 0) _pickerDuration = val;
    }

    API.patch(
      'accord_meetings?meeting_id=eq.' + meeting.meeting_id,
      { scheduled_for: scheduledFor, duration_minutes: _pickerDuration }
    ).then(function() {
      meeting.scheduled_for    = scheduledFor;
      meeting.duration_minutes = _pickerDuration;
      _closeWhenPicker();
      var whenEl = document.getElementById('ac-meta-when');
      if (whenEl) whenEl.innerHTML = _fmtWhen(meeting.scheduled_for, meeting.duration_minutes);
      _renderFooter(meeting, meeting.workstream_id || null);
    }).catch(function(e) {
      console.error('[AccordMeetingSetup] scheduled_for patch failed', e);
      _closeWhenPicker();
    });
  }

  // §10 — Keyboard: Escape closes picker, Enter confirms
  document.addEventListener('keydown', function _pickerKeydown(ev) {
    if (!_pickerOpen) return;
    if (ev.key === 'Escape') { _closeWhenPicker(); }
    if (ev.key === 'Enter') {
      var picker = document.getElementById('ac-when-picker');
      if (picker && window.Accord && window.Accord.state && window.Accord.state.meeting) {
        _saveWhenPicker(window.Accord.state.meeting);
      }
    }
  });

  // §7 — Decisions tab

  function _renderDecisionsTab(tabbody, meeting) {
    var myToken = ++_decisionsToken;

    if (!meeting.workstream_id) {
      tabbody.innerHTML = '<div class="ac-decisions-empty">No workstream context.</div>';
      return;
    }

    API.get(
      'accord_meetings?workstream_id=eq.' + meeting.workstream_id +
      '&state=in.(closed,sealed,running,idle)' +
      '&select=meeting_id&limit=50'
    ).then(function(meetings) {
      if (_decisionsToken !== myToken) return;
      if (!meetings || !meetings.length) {
        if (tabbody.isConnected) tabbody.innerHTML =
          '<div class="ac-decisions-empty">No meetings in this workstream yet.</div>';
        return;
      }
      var ids = meetings.map(function(m) { return m.meeting_id; }).join(',');
      return API.get(
        'accord_nodes?meeting_id=in.(' + ids + ')' +
        '&tag=eq.decision' +
        '&select=node_id,summary,seq_id,created_at,status,dissented_by' +
        '&order=created_at.desc'
      );
    }).then(function(nodes) {
      if (!nodes) return;
      if (_decisionsToken !== myToken) return;
      if (!tabbody.isConnected) return;
      _paintDecisionsTab(tabbody, nodes, meeting);
    }).catch(function(e) {
      console.error('[AccordMeetingSetup] decisions fetch failed', e);
      if (tabbody.isConnected)
        tabbody.innerHTML = '<div class="ac-decisions-error">Could not load decisions.</div>';
    });
  }

  function _paintDecisionsTab(tabbody, nodes, meeting) {
    var filters = ['all', 'sealed', 'dissented'];
    var activeFilter = 'all';

    function _renderFiltered(filter) {
      var filtered = nodes.filter(function(n) {
        if (filter === 'all')       return true;
        if (filter === 'sealed')    return !n.dissented_by;
        if (filter === 'dissented') return !!n.dissented_by;
        return true;
      });

      var listHtml = filtered.length
        ? filtered.map(function(n) {
            var hasDissent = !!n.dissented_by;
            var rowCls = 'ac-dec-row' + (hasDissent ? ' ac-dec-row--dissent' : '');
            return '<div class="' + rowCls + '" data-node-id="' + esc(n.node_id) + '">' +
              '<span class="ac-dec-seq">' + esc(n.seq_id || 'DC') + '</span>' +
              '<span class="ac-dec-text">' + esc((n.summary || '').slice(0, 100)) + '</span>' +
              (hasDissent ? '<span class="ac-dec-badge ac-dec-badge--dissent">DISSENT</span>' : '') +
              '</div>';
          }).join('')
        : '<div class="ac-decisions-empty">No decisions match this filter.</div>';

      var list = tabbody.querySelector('#ac-dec-list');
      if (list) list.innerHTML = listHtml;
    }

    var filtersHtml = filters.map(function(f) {
      return '<button class="ac-dec-filter' + (f === activeFilter ? ' active' : '') + '" ' +
             'data-action="dec-filter" data-filter="' + f + '">' +
             f.toUpperCase() + '</button>';
    }).join('');

    tabbody.innerHTML = [
      '<div class="ac-decisions-wrap">',
        '<div class="ac-dec-filters">', filtersHtml, '</div>',
        '<div class="ac-dec-count">', nodes.length, ' decision' + (nodes.length !== 1 ? 's' : ''), '</div>',
        '<div class="ac-dec-list" id="ac-dec-list"></div>',
      '</div>'
    ].join('');

    _renderFiltered(activeFilter);

    tabbody.addEventListener('click', function(ev) {
      var btn = ev.target.closest('[data-action="dec-filter"]');
      if (!btn) return;
      activeFilter = btn.dataset.filter;
      tabbody.querySelectorAll('.ac-dec-filter').forEach(function(b) {
        b.classList.toggle('active', b.dataset.filter === activeFilter);
      });
      _renderFiltered(activeFilter);
    });
  }

  // §8 — Risks tab
  // V6: no project_id on workstreams, no workstream_id on projects.
  // Join path does not exist. Tab renders empty state for all workstreams
  // until a future CMD establishes the FK. CPM surface also deferred.

  function _renderRisksTab(tabbody, meeting) {
    if (!meeting.workstream_id) {
      tabbody.innerHTML = '<div class="ac-risks-empty">No workstream context.</div>';
      return;
    }
    // V6: workstream→project join absent — render empty state
    tabbody.innerHTML = [
      '<div class="ac-risks-wrap">',
        '<div class="ac-risks-header">',
          '<span class="ac-risks-count">RISK REGISTER</span>',
          '<span class="ac-risks-note ac-muted">CPM surface coming in Track F</span>',
        '</div>',
        '<div class="ac-risks-empty">',
          'No project linked to this workstream. Risk register will appear here once a project is associated.',
        '</div>',
      '</div>'
    ].join('');
  }

  // ══════════════════════════════════════════════════════════════
  // CENTER TAB BAR + AGENDA — CMD-ACCORD-SETUP-AGENDA-ENHANCED-1
  // §5 center tab bar · §6 agenda render/paint/events/CRUD/drag
  // V6: ref chips deferred — edge structure complex, low priority.
  // _centerActiveTab persists across renders (intentional).
  // ══════════════════════════════════════════════════════════════

  // §5 — Center tab bar
  function _renderCenterTabBar(meeting) {
    var tabbar = document.querySelector('.ac-col-tabbar[data-col="center"]');
    if (!tabbar) return;

    var tabs = [
      { id: 'agenda',       label: 'Agenda'       },
      { id: 'minute-notes', label: 'Minute Notes' }
    ];

    tabbar.innerHTML = [
      '<div class="ac-center-tabs">',
        tabs.map(function(t) {
          var active = t.id === _centerActiveTab ? ' ac-tab--active' : '';
          return '<button class="ac-tab' + active + '" data-action="center-tab" ' +
                 'data-tab="' + t.id + '">' + t.label + '</button>';
        }).join(''),
      '</div>',
      '<div class="ac-center-stepper">',
        '<button class="ac-stepper-btn" data-action="center-prev">\u2039</button>',
        tabs.map(function(t) {
          var filled = t.id === _centerActiveTab ? ' ac-stepper-dot--active' : '';
          return '<span class="ac-stepper-dot' + filled + '" data-tab="' + t.id + '"></span>';
        }).join(''),
        '<button class="ac-stepper-btn" data-action="center-next">\u203a</button>',
      '</div>'
    ].join('');

    tabbar.addEventListener('click', function(ev) {
      var action = ev.target.dataset.action ||
                   (ev.target.closest('[data-action]') &&
                    ev.target.closest('[data-action]').dataset.action);
      if (!action) return;

      var tabId = null;
      if (action === 'center-tab') {
        tabId = ev.target.closest('[data-action]').dataset.tab;
      } else if (action === 'center-prev' || action === 'center-next') {
        var order = ['agenda', 'minute-notes'];
        var idx = order.indexOf(_centerActiveTab);
        tabId = action === 'center-prev'
          ? order[Math.max(0, idx - 1)]
          : order[Math.min(order.length - 1, idx + 1)];
      }

      if (!tabId || tabId === _centerActiveTab) return;
      _centerActiveTab = tabId;
      _updateCenterTabBar(tabbar, tabId);
      _activateCenterTab(tabId, meeting);
    });
  }

  function _updateCenterTabBar(tabbar, activeTab) {
    tabbar.querySelectorAll('.ac-tab').forEach(function(b) {
      b.classList.toggle('ac-tab--active', b.dataset.tab === activeTab);
    });
    tabbar.querySelectorAll('.ac-stepper-dot').forEach(function(d) {
      d.classList.toggle('ac-stepper-dot--active', d.dataset.tab === activeTab);
    });
  }

  function _activateCenterTab(tab, meeting) {
    var tabbody = document.querySelector('.ac-col-tabbody[data-col="center"]');
    if (!tabbody) return;

    // If scrub is active, both tabs show prior meeting content
    if (_scrubState && _scrubState.active) {
      if (tab === 'agenda') {
        _loadScrubAgenda(_scrubState.meetingId, tabbody);
      } else {
        var overlay = document.getElementById('ac-scrub-overlay');
        if (overlay) {
          tabbody.querySelectorAll(':scope > *:not(#ac-scrub-overlay)')
            .forEach(function(el) { el.style.display = 'none'; });
          overlay.style.display = '';
        }
      }
      return;
    }

    // No scrub active — normal idle meeting behavior
    if (tab === 'agenda') {
      tabbody.querySelectorAll(':scope > *').forEach(function(el) {
        el.style.display = '';
      });
      var overlay2 = document.getElementById('ac-scrub-overlay');
      if (overlay2) overlay2.style.display = 'none';
      var scrubAgenda2 = document.getElementById('ac-scrub-agenda');
      if (scrubAgenda2) scrubAgenda2.style.display = 'none';
      var prompt2 = document.getElementById('ac-minute-notes-prompt');
      if (prompt2) prompt2.style.display = 'none';
      if (!document.getElementById('ac-agenda-container')) {
        _renderAgendaContent(meeting, meeting.workstream_id);
      }
      return;
    }

    if (tab === 'minute-notes') {
      tabbody.querySelectorAll(':scope > *').forEach(function(el) {
        el.style.display = 'none';
      });
      var prompt = document.getElementById('ac-minute-notes-prompt');
      if (!prompt) {
        prompt = document.createElement('div');
        prompt.id = 'ac-minute-notes-prompt';
        prompt.className = 'ac-minute-notes-prompt';
        prompt.textContent = 'Click a filmstrip frame to view prior meeting captures.';
        tabbody.appendChild(prompt);
      }
      prompt.style.display = '';
      return;
    }
  }

  function _loadScrubAgenda(meetingId, tabbody) {
    tabbody.querySelectorAll(':scope > *:not(#ac-scrub-agenda)')
      .forEach(function(el) { el.style.display = 'none'; });

    var scrubAgenda = document.getElementById('ac-scrub-agenda');
    if (!scrubAgenda) {
      scrubAgenda = document.createElement('div');
      scrubAgenda.id = 'ac-scrub-agenda';
      scrubAgenda.className = 'ac-scrub-overlay';
      tabbody.appendChild(scrubAgenda);
    }
    scrubAgenda.style.display = '';
    scrubAgenda.innerHTML = '<div class="ac-scrub-loading">Loading agenda\u2026</div>';

    API.get(
      'accord_agenda_items?meeting_id=eq.' + meetingId +
      '&order=position.asc&select=agenda_item_id,title,position,item_type'
    ).then(function(items) {
      if (!scrubAgenda.isConnected) return;
      items = items || [];
      if (!items.length) {
        scrubAgenda.innerHTML = '<div class="ac-scrub-empty">No agenda items in this meeting.</div>';
        return;
      }
      scrubAgenda.innerHTML = [
        '<div class="ac-scrub-header">',
          '<span class="ac-scrub-title">Agenda</span>',
          '<button class="ac-scrub-close" data-action="scrub-close">Back to agenda</button>',
        '</div>',
        '<div class="ac-scrub-nodes">',
          items.map(function(i) {
            return '<div class="ac-scrub-node">' +
              (i.item_type ? '<span class="ac-scrub-node-tag">' + esc(i.item_type) + '</span>' : '') +
              '<span class="ac-scrub-node-summary">' + esc(i.title || '') + '</span>' +
              '</div>';
          }).join(''),
        '</div>'
      ].join('');

      scrubAgenda.addEventListener('click', function(ev) {
        var action = ev.target.dataset.action ||
                     (ev.target.closest('[data-action]') &&
                      ev.target.closest('[data-action]').dataset.action);
        if (action === 'scrub-close') _deactivateScrub(window.Accord.state.meeting);
      });
    }).catch(function() {
      if (scrubAgenda.isConnected)
        scrubAgenda.innerHTML = '<div class="ac-scrub-error">Could not load agenda.</div>';
    });
  }

  // §6.1 — Agenda entry point
  function _renderAgendaContent(meeting, workstreamId) {
    var myToken = ++_agendaToken;
    var tabbody = document.querySelector('.ac-col-tabbody[data-col="center"]');
    if (!tabbody) return;

    var agendaContainer = document.getElementById('ac-agenda-container');
    if (!agendaContainer) {
      // Remove legacy placeholder before creating agenda container
      var placeholder = tabbody.querySelector('.ac-col-placeholder');
      if (placeholder) placeholder.remove();
      agendaContainer = document.createElement('div');
      agendaContainer.id = 'ac-agenda-container';
      agendaContainer.className = 'ac-agenda-container';
      tabbody.appendChild(agendaContainer);
    }
    agendaContainer.innerHTML = '<div class="ac-agenda-loading">Loading agenda\u2026</div>';

    Promise.all([
      _fetchAgendaItems(meeting.meeting_id),
      _fetchPrepPrompts(meeting, workstreamId)
    ]).then(function(results) {
      if (_agendaToken !== myToken) return;
      var liveContainer = document.getElementById('ac-agenda-container'); // IR71 re-query
      console.log('[AGENDA] then fired token=', _agendaToken, 'mine=', myToken, 'connected=', liveContainer && liveContainer.isConnected);
      if (!liveContainer || !liveContainer.isConnected) return;
      _paintAgenda(liveContainer, results[0], results[1], meeting, workstreamId);
      console.log('[AGENDA] painted');
    }).catch(function(e) {
      console.error('[AccordMeetingSetup] agenda fetch failed', e);
      var liveContainer = document.getElementById('ac-agenda-container');
      if (liveContainer && liveContainer.isConnected)
        liveContainer.innerHTML = '<div class="ac-agenda-error">Could not load agenda.</div>';
    });
  }

  // §6.2 — Fetch agenda items
  function _fetchAgendaItems(meetingId) {
    return API.get(
      'accord_agenda_items?meeting_id=eq.' + meetingId +
      '&order=position.asc,created_at.asc' +
      '&select=agenda_item_id,title,position,status,item_type,' +
              'duration_minutes_estimate,pulled_from_node_id,pulled_from_tag'
    ).then(function(rows) { return rows || []; });
  }

  // §6.3 — Fetch prep prompts (substrate-derived, no AI)
  // Ownership match is approximate in v1 (users.id vs resources.id).
  // C-08 enriches with full user→resource resolution.
  function _fetchPrepPrompts(meeting, workstreamId) {
    if (!workstreamId) return Promise.resolve([]);

    return Promise.all([
      API.get(
        'accord_meeting_attendees?meeting_id=eq.' + meeting.meeting_id +
        '&select=resource_id,role_in_meeting'
      ),
      API.get(
        'accord_meetings?workstream_id=eq.' + workstreamId +
        '&state=in.(closed,sealed,running)&select=meeting_id&limit=20'
      ).then(function(mtgs) {
        if (!mtgs || !mtgs.length) return [];
        var ids = mtgs.map(function(m) { return m.meeting_id; }).join(',');
        return API.get(
          'accord_nodes?meeting_id=in.(' + ids + ')' +
          '&tag=eq.dissent' +
          '&select=node_id,summary,dissented_by,seq_id,meeting_id'
        ).then(function(rows) { return rows || []; });
      })
    ]).then(function(results) {
      var dissents = results[1] || [];
      var prompts  = [];

      dissents.forEach(function(d) {
        if (d.dissented_by) {
          prompts.push({
            type:   'dissent',
            text:   'Unresolved dissent ' + esc(d.seq_id || 'DS') +
                    ' in workstream. ' + esc((d.summary || '').slice(0, 60)),
            action: 'PULL AS THREAD \u2192',
            nodeId: d.node_id
          });
        }
      });

      return prompts.slice(0, 3);
    }).catch(function() { return []; });
  }

  // §6.4 — Paint agenda
  function _paintAgenda(container, items, prompts, meeting, workstreamId) {
    var isIdle = meeting.state === 'idle';
    var html   = '';

    // Prep prompt strip
    if (prompts.length && isIdle) {
      html += '<div class="ac-prep-prompt-strip">';
      var p = prompts[0];
      html += '<div class="ac-prep-prompt" data-prompt-idx="0">';
      html += '<span class="ac-prep-glyph">\u26a1</span>';
      html += '<span class="ac-prep-text">' + p.text + '</span>';
      html += '<button class="ac-prep-action" data-action="prep-action" ' +
              (p.nodeId ? 'data-node-id="' + esc(p.nodeId) + '"' : '') + '>' +
              esc(p.action) + '</button>';
      html += '<button class="ac-prep-dismiss" data-action="dismiss-prompt" ' +
              'data-prompt-idx="0" title="Dismiss">\u00d7</button>';
      html += '</div>';
      if (prompts.length > 1) {
        html += '<div class="ac-prep-more ac-muted">' +
                (prompts.length - 1) + ' more insight' +
                (prompts.length > 2 ? 's' : '') + '</div>';
      }
      html += '</div>';
    }

    // Agenda header
    html += '<div class="ac-agenda-header">';
    html += '<span class="ac-agenda-label">AGENDA</span>';
    var stats = _agendaStats(items);
    if (stats) html += '<span class="ac-agenda-stats ac-muted">' + esc(stats) + '</span>';
    html += '</div>';

    // Agenda list
    html += '<div class="ac-agenda-list" id="ac-agenda-list">';
    if (!items.length) {
      html += '<div class="ac-agenda-empty ac-muted">No agenda items. Add one below.</div>';
    } else {
      items.forEach(function(item, idx) {
        html += _agendaItemHtml(item, idx, items.length, isIdle);
      });
    }
    html += '</div>';

    // Add item row (idle only)
    if (isIdle) {
      html += '<div class="ac-agenda-add-row">';
      html += '<input class="ac-agenda-add-input" id="ac-agenda-add-input" ' +
              'type="text" placeholder="Accord will infer the NRA shape\u2026" autocomplete="off">';
      html += '<button class="ac-agenda-add-btn" data-action="add-agenda-item">+</button>';
      html += '</div>';
    }

    container.innerHTML = html;
    _wireAgendaEvents(container, items, meeting, workstreamId);
    _initDragToReorder(container, items, meeting);
    _wirePercolateOnAgenda(container);
    if (_percolateResourceId) _applyPercolate();
  }

  function _agendaStats(items) {
    if (!items.length) return '';
    var pulled   = items.filter(function(i) { return i.pulled_from_node_id; }).length;
    var timed    = items.filter(function(i) { return i.duration_minutes_estimate; });
    var totalMin = timed.reduce(function(s, i) { return s + i.duration_minutes_estimate; }, 0);
    var parts    = [items.length + ' item' + (items.length !== 1 ? 's' : '')];
    if (pulled)   parts.push(pulled + ' carried');
    if (totalMin) parts.push(totalMin + 'm est.');
    return parts.join(' \u00b7 ');
  }

  // §6.5 — Agenda item HTML
  function _agendaItemHtml(item, idx, total, isIdle) {
    var isCarried = !!item.pulled_from_node_id;
    var itemCls   = 'ac-agenda-item' + (isCarried ? ' ac-agenda-item--carried' : '');

    var html = '<div class="' + itemCls + '" ' +
               'data-item-id="' + esc(item.agenda_item_id) + '" ' +
               'data-position="' + item.position + '">';

    if (isIdle) {
      html += '<div class="ac-agenda-handle" draggable="true" data-drag-handle="1">\u2837</div>';
    }

    if (isIdle) {
      html += '<div class="ac-agenda-title ac-agenda-title--editable" ' +
              'contenteditable="true" spellcheck="false">' +
              esc(item.title || '') + '</div>';
    } else {
      html += '<div class="ac-agenda-title">' + esc(item.title || '') + '</div>';
    }

    if (item.item_type) {
      var typeCls = 'ac-item-type ac-item-type--' + item.item_type.toLowerCase();
      html += '<span class="' + typeCls + '">' + esc(item.item_type) + '</span>';
    } else if (isIdle) {
      html += '<button class="ac-item-type-set" data-action="set-item-type" ' +
              'data-item-id="' + esc(item.agenda_item_id) + '">+ type</button>';
    }

    html += '<button class="ac-agenda-expand" data-action="toggle-item-meta" ' +
            'title="' + (isIdle ? 'Edit / expand' : 'Expand') + '">\u25b8</button>';

    html += '<div class="ac-agenda-meta" id="ac-agenda-meta-' +
            esc(item.agenda_item_id) + '" style="display:none;">';

    if (isCarried && item.pulled_from_tag) {
      html += '<span class="ac-agenda-carried-badge ac-agenda-pulled-' +
              esc(item.pulled_from_tag.toLowerCase()) + '">\u2190 ' +
              esc(item.pulled_from_tag.toUpperCase()) + '</span>';
    }

    if (isIdle) {
      html += '<span class="ac-agenda-time-label">\u23f1</span>';
      html += '<input class="ac-agenda-time-input" type="number" min="1" max="120" ' +
              'placeholder="min" value="' +
              esc(item.duration_minutes_estimate ? String(item.duration_minutes_estimate) : '') +
              '" data-item-id="' + esc(item.agenda_item_id) + '">';
    } else if (item.duration_minutes_estimate) {
      html += '<span class="ac-agenda-time-label">\u23f1 ' +
              item.duration_minutes_estimate + 'm</span>';
    }

    if (isIdle) {
      html += '<button class="ac-agenda-delete" data-action="delete-agenda-item" ' +
              'title="Remove item">\u00d7</button>';
    }

    html += '</div>';
    html += '</div>';
    return html;
  }

  // §6.6 — Event wiring
  function _wireAgendaEvents(container, items, meeting, workstreamId) {
    container.addEventListener('click', function(ev) {
      var action = ev.target.dataset.action ||
                   (ev.target.closest('[data-action]') &&
                    ev.target.closest('[data-action]').dataset.action);
      if (!action) return;

      if (action === 'toggle-item-meta') {
        var agendaItem = ev.target.closest('.ac-agenda-item');
        if (!agendaItem) return;
        var itemId = agendaItem.dataset.itemId;
        var meta   = container.querySelector('#ac-agenda-meta-' + itemId);
        var btn    = ev.target.closest('[data-action="toggle-item-meta"]');
        if (!meta) return;
        var visible = meta.style.display !== 'none';
        meta.style.display = visible ? 'none' : '';
        if (btn) btn.textContent = visible ? '\u25b8' : '\u25be';
        return;
      }

      if (action === 'add-agenda-item') {
        var input = container.querySelector('#ac-agenda-add-input');
        if (!input) return;
        var title = input.value.trim();
        if (!title) return;
        _addAgendaItem(title, items, meeting, container, workstreamId);
        input.value = '';
        return;
      }

      if (action === 'delete-agenda-item') {
        var row = ev.target.closest('.ac-agenda-item');
        if (!row) return;
        _deleteAgendaItem(row.dataset.itemId, meeting, container, workstreamId);
        return;
      }

      if (action === 'set-item-type') {
        var btn2 = ev.target.closest('[data-action="set-item-type"]');
        if (!btn2) return;
        _showTypePicker(btn2, btn2.dataset.itemId, meeting, container, workstreamId);
        return;
      }

      if (action === 'select-type') {
        var btn3 = ev.target.closest('[data-action="select-type"]');
        if (!btn3) return;
        _setItemType(btn3.dataset.itemId, btn3.dataset.type, meeting, container, workstreamId);
        return;
      }

      if (action === 'dismiss-prompt') {
        var strip = container.querySelector('.ac-prep-prompt-strip');
        if (strip) strip.style.display = 'none';
        return;
      }
    });

    var addInput = container.querySelector('#ac-agenda-add-input');
    if (addInput && !addInput.dataset.listenerBound) {
      addInput.dataset.listenerBound = '1';
      addInput.addEventListener('keydown', function(ev) {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        var title = addInput.value.trim();
        if (!title) return;
        _addAgendaItem(title, items, meeting, container, workstreamId);
        addInput.value = '';
      });
    }

    container.addEventListener('input', function(ev) {
      var titleEl = ev.target.closest('.ac-agenda-title--editable');
      if (titleEl) {
        var row2 = titleEl.closest('.ac-agenda-item');
        if (!row2) return;
        var itemId = row2.dataset.itemId;
        if (_agendaTitleTimers[itemId]) clearTimeout(_agendaTitleTimers[itemId]);
        _agendaTitleTimers[itemId] = setTimeout(function() {
          var val = titleEl.textContent.trim();
          if (!val) return;
          API.patch('accord_agenda_items?agenda_item_id=eq.' + itemId, { title: val })
            .catch(function(e) { console.error('[AccordMeetingSetup] title patch failed', e); });
        }, 800);
        return;
      }

      var timeInput = ev.target.closest('.ac-agenda-time-input');
      if (timeInput) {
        var itemId2 = timeInput.dataset.itemId;
        if (_agendaTimeTimers[itemId2]) clearTimeout(_agendaTimeTimers[itemId2]);
        _agendaTimeTimers[itemId2] = setTimeout(function() {
          var val2 = parseInt(timeInput.value, 10);
          API.patch('accord_agenda_items?agenda_item_id=eq.' + itemId2, {
            duration_minutes_estimate: val2 > 0 ? val2 : null
          }).catch(function(e) { console.error('[AccordMeetingSetup] time patch failed', e); });
        }, 800);
      }
    });
  }

  // §6.7 — CRUD
  function _addAgendaItem(title, items, meeting, container, workstreamId) {
    if (container.dataset.submitting === '1') return;
    container.dataset.submitting = '1';
    var maxPos = items.reduce(function(m, i) { return Math.max(m, i.position); }, -1);
    var nextPos = maxPos + 1;
    API.post('accord_agenda_items', {
      firm_id:    meeting.firm_id,
      meeting_id: meeting.meeting_id,
      title:      title,
      position:   nextPos,
      status:     'pending'
    }).then(function() {
      container.dataset.submitting = '';
      _renderAgendaContent(meeting, workstreamId);
    }).catch(function(e) {
      container.dataset.submitting = '';
      console.error('[AccordMeetingSetup] add agenda item failed', e);
    });
  }

  function _deleteAgendaItem(itemId, meeting, container, workstreamId) {
    API.del('accord_agenda_items?agenda_item_id=eq.' + itemId)
      .then(function() { _renderAgendaContent(meeting, workstreamId); })
      .catch(function(e) { console.error('[AccordMeetingSetup] delete agenda item failed', e); });
  }

  function _setItemType(itemId, type, meeting, container, workstreamId) {
    API.patch('accord_agenda_items?agenda_item_id=eq.' + itemId, { item_type: type })
      .then(function() { _renderAgendaContent(meeting, workstreamId); })
      .catch(function(e) { console.error('[AccordMeetingSetup] type patch failed', e); });
  }

  function _showTypePicker(anchor, itemId, meeting, container, workstreamId) {
    var existing = container.querySelector('.ac-type-picker');
    if (existing) existing.remove();

    var types = ['DECIDE', 'ASSIGN', 'INFORM', 'RISK', 'QUESTION'];
    var picker = document.createElement('div');
    picker.className = 'ac-type-picker';
    picker.innerHTML = types.map(function(t) {
      return '<button class="ac-type-option ac-item-type--' + t.toLowerCase() + '" ' +
             'data-action="select-type" data-item-id="' + esc(itemId) + '" ' +
             'data-type="' + t + '">' + t + '</button>';
    }).join('');
    anchor.insertAdjacentElement('afterend', picker);
  }

  // §6.8 — Drag-to-reorder
  function _initDragToReorder(container, items, meeting) {
    var list = container.querySelector('#ac-agenda-list');
    if (!list) return;

    var _dragSrc = null;

    list.addEventListener('dragstart', function(ev) {
      var handle = ev.target.closest('[data-drag-handle]');
      if (!handle) { ev.preventDefault(); return; }
      var row = handle.closest('.ac-agenda-item');
      if (!row) { ev.preventDefault(); return; }
      _dragSrc = row;
      row.setAttribute('draggable', 'true');
      row.classList.add('ac-agenda-item--dragging');
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', row.dataset.itemId);
    });

    list.addEventListener('dragover', function(ev) {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'move';
      var target = ev.target.closest('.ac-agenda-item');
      if (!target || target === _dragSrc) return;
      list.querySelectorAll('.ac-agenda-item--over').forEach(function(el) {
        el.classList.remove('ac-agenda-item--over');
      });
      target.classList.add('ac-agenda-item--over');
    });

    list.addEventListener('drop', function(ev) {
      ev.preventDefault();
      var target = ev.target.closest('.ac-agenda-item');
      if (!target || !_dragSrc || target === _dragSrc) return;
      var srcId  = _dragSrc.dataset.itemId;
      var tgtId  = target.dataset.itemId;
      var srcPos = parseInt(_dragSrc.dataset.position, 10);
      var tgtPos = parseInt(target.dataset.position, 10);
      // Three-step swap via temp position to avoid UNIQUE(meeting_id, position) collision.
      // Step 1: move src to temp (-1), Step 2: move tgt to src's slot,
      // Step 3: move src from temp to tgt's slot. Sequential — not Promise.all.
      API.patch('accord_agenda_items?agenda_item_id=eq.' + srcId, { position: -1 })
        .then(function() {
          return API.patch('accord_agenda_items?agenda_item_id=eq.' + tgtId, { position: srcPos });
        })
        .then(function() {
          return API.patch('accord_agenda_items?agenda_item_id=eq.' + srcId, { position: tgtPos });
        })
        .then(function() { _renderAgendaContent(meeting, meeting.workstream_id); })
        .catch(function(e) {
          console.error('[AccordMeetingSetup] reorder failed', e);
          _renderAgendaContent(meeting, meeting.workstream_id);
        });
    });

    list.addEventListener('dragend', function() {
      list.querySelectorAll('.ac-agenda-item--dragging, .ac-agenda-item--over')
        .forEach(function(el) {
          el.classList.remove('ac-agenda-item--dragging', 'ac-agenda-item--over');
          el.removeAttribute('draggable');
        });
      _dragSrc = null;
    });
  }

  // ══════════════════════════════════════════════════════════════
  // INTELLIGENCE MODE — CMD-ACCORD-SETUP-INTELLIGENCE-1
  // §4 derivation · §5 attendee enrichment · §6 overlay panel
  // V2: declared_at absent — using created_at throughout.
  // V3: action status = 'committed' only; overdue via due_date < now().
  // ══════════════════════════════════════════════════════════════

  // §4 — Intel derivation engine
  function _deriveIntelData(meeting, workstreamId, callback) {
    var myToken = ++_intelToken;

    if (!workstreamId) {
      callback({ attendees: [], hot_buttons: [], private_note: { note_id: null, body: '' } });
      return;
    }

    API.get(
      'accord_meeting_attendees?meeting_id=eq.' + meeting.meeting_id +
      '&select=attendee_id,resource_id,role_in_meeting'
    ).then(function(attendeeRows) {
      if (_intelToken !== myToken) return;
      attendeeRows = attendeeRows || [];
      if (!attendeeRows.length) {
        callback({ attendees: [], hot_buttons: [], private_note: { note_id: null, body: '' } });
        return;
      }

      var resourceIds = attendeeRows.map(function(a) { return a.resource_id; }).join(',');

      return API.get(
        'accord_meetings?workstream_id=eq.' + workstreamId +
        '&state=in.(closed,sealed,running)' +
        '&select=meeting_id&limit=30'
      ).then(function(priorMtgs) {
        priorMtgs = priorMtgs || [];
        if (!priorMtgs.length) {
          return [
            [],
            [],
            [],
            [],
            []
          ];
        }
        var mids = priorMtgs.map(function(m) { return m.meeting_id; }).join(',');

        return Promise.all([
          API.get('resources?id=in.(' + resourceIds + ')&select=id,name,user_id'),
          API.get(
            'accord_nodes?meeting_id=in.(' + mids + ')&tag=eq.dissent' +
            '&select=node_id,summary,seq_id,dissented_by,created_at,meeting_id'
          ),
          API.get(
            'accord_nodes?meeting_id=in.(' + mids + ')&tag=eq.action' +
            '&select=node_id,summary,seq_id,created_by,due_date,status'
          ),
          API.get(
            'accord_nodes?meeting_id=in.(' + mids + ')&tag=eq.decision' +
            '&select=node_id,seq_id,summary,created_by'
          ),
          API.get(
            'accord_meeting_intel_notes?meeting_id=eq.' + meeting.meeting_id +
            '&select=note_id,body&limit=1'
          )
        ]);
      }).then(function(results) {
        if (_intelToken !== myToken) return;
        var resources = results[0] || [];
        var dissents  = results[1] || [];
        var actions   = results[2] || [];
        var noteRows  = results[4] || [];

        var userToResource = {};
        resources.forEach(function(r) { if (r.user_id) userToResource[r.user_id] = r; });
        var resourceMap = {};
        resources.forEach(function(r) { resourceMap[r.id] = r; });

        var now = Date.now();

        var attendeeIntel = attendeeRows.map(function(a) {
          var res    = resourceMap[a.resource_id] || {};
          var userId = res.user_id;

          var myDissents = dissents.filter(function(d) {
            return d.dissented_by === userId;
          }).map(function(d) {
            var age = d.created_at
              ? Math.round((now - new Date(d.created_at).getTime()) / 86400000)
              : null;
            return { seq_id: d.seq_id, summary: d.summary, age_days: age };
          });

          var myActions = actions.filter(function(n) { return n.created_by === userId; });
          var myOverdue = myActions.filter(function(n) {
            return n.due_date && new Date(n.due_date).getTime() < now;
          });

          var myNodes = dissents.concat(actions).filter(function(n) {
            return n.created_by === userId || n.dissented_by === userId;
          });

          var statusTag, statusColor;
          var hasActiveDissent = myDissents.some(function(d) { return d.age_days !== null; });
          var oldestDissent    = myDissents.reduce(function(max, d) {
            return (d.age_days || 0) > (max.age_days || 0) ? d : max;
          }, { age_days: 0 });
          var isOverdue = myOverdue.length > 0;

          if (hasActiveDissent && oldestDissent.age_days >= 14) {
            statusTag   = 'DISSENT \u00b7 SIMMERING';
            statusColor = 'rose';
          } else if (isOverdue && myOverdue.length >= 2) {
            statusTag   = 'OVERDUE \u00b7 PRESSURE';
            statusColor = 'amber';
          } else if (myNodes.length === 0 && myActions.length === 0) {
            statusTag   = 'QUIET \u00b7 RE-ONBOARD';
            statusColor = 'muted';
          } else {
            statusTag   = 'ENGAGED \u00b7 STEADY';
            statusColor = 'green';
          }

          var owedParts = [];
          if (myActions.length) owedParts.push('Owns ' + myActions.length +
            ' action' + (myActions.length !== 1 ? 's' : '') + ' in workstream');
          if (myOverdue.length) owedParts.push(myOverdue.length + ' overdue');
          var owedLine = owedParts.join('. ');

          var urgencyLine = '';
          if (hasActiveDissent && oldestDissent.age_days) {
            urgencyLine = (oldestDissent.seq_id || 'Dissent') + ': ' +
                          oldestDissent.age_days + 'd unresolved';
            if (oldestDissent.age_days >= 20) urgencyLine += ' \u00b7 move now';
          }

          return {
            resource_id:     a.resource_id,
            name:            res.name || 'Unknown',
            user_id:         userId || null,
            role:            a.role_in_meeting,
            status_tag:      statusTag,
            status_color:    statusColor,
            owed_line:       owedLine,
            urgency_line:    urgencyLine,
            open_actions:    myActions.length,
            overdue_actions: myOverdue.length,
            open_dissents:   myDissents
          };
        });

        var hotButtons = [];
        dissents.forEach(function(d) {
          var age = d.created_at
            ? Math.round((now - new Date(d.created_at).getTime()) / 86400000)
            : 0;
          if (age >= 14) {
            hotButtons.push({
              type:     'dissent',
              text:     (d.seq_id || 'Dissent') + ' \u00b7 ' +
                        (d.summary || '').slice(0, 60) + ' \u00b7 ' + age + 'd unresolved',
              severity: age >= 20 ? 'high' : 'mid'
            });
          }
        });

        var privateNote = noteRows[0] || { note_id: null, body: '' };

        callback({
          attendees:    attendeeIntel,
          hot_buttons:  hotButtons.slice(0, 5),
          private_note: privateNote
        });
      });
    }).catch(function(e) {
      console.error('[AccordMeetingSetup] intel derivation failed', e);
      callback({ attendees: [], hot_buttons: [], private_note: { note_id: null, body: '' } });
    });
  }

  // §5 — Attendee card enrichment
  function _enrichAttendeeCards(block, intel) {
    var intelMap = {};
    intel.attendees.forEach(function(a) { intelMap[a.resource_id] = a; });

    block.querySelectorAll('.ac-attendee-card').forEach(function(card) {
      var resourceId = card.dataset.resourceId;
      if (!resourceId) return;
      var intelA = intelMap[resourceId];
      if (!intelA) return;

      // Replace rsvp status badge with behavioral badge
      var existingBadge = card.querySelector('.ac-attendee-badge');
      if (existingBadge) existingBadge.remove();

      var badge = document.createElement('span');
      badge.className = 'ac-attendee-badge ac-attendee-badge--behavioral ac-badge--' +
                        intelA.status_color;
      badge.textContent = intelA.status_tag;
      card.appendChild(badge);

      if (intelA.owed_line && !card.querySelector('.ac-attendee-owed')) {
        var owedEl = document.createElement('div');
        owedEl.className = 'ac-attendee-owed';
        owedEl.textContent = intelA.owed_line;
        card.appendChild(owedEl);
      }

      if (intelA.urgency_line && !card.querySelector('.ac-attendee-urgency')) {
        var urgEl = document.createElement('div');
        urgEl.className = 'ac-attendee-urgency';
        urgEl.textContent = intelA.urgency_line;
        card.appendChild(urgEl);
      }
    });
  }

  // §6 — Intelligence overlay
  function _onIntelKey(ev) {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'i' && !ev.shiftKey) {
      ev.preventDefault();
      _toggleIntelOverlay();
      return;
    }
    if (ev.ctrlKey && ev.shiftKey && ev.key === 'I') {
      ev.preventDefault();
      _toggleIntelOverlay();
    }
    if (ev.key === 'Escape') {
      var overlay = document.getElementById('ac-intel-overlay');
      if (overlay && overlay.style.display !== 'none') {
        _closeIntelOverlay();
      }
    }
  }

  function _toggleIntelOverlay() {
    _intelOpen ? _closeIntelOverlay() : _openIntelOverlay();
  }

  function _openIntelOverlay() {
    var overlay = document.getElementById('ac-intel-overlay');
    var shell   = document.querySelector('.ac-setup-shell');
    if (!overlay || !shell) return;

    _paintIntelOverlay(overlay, _intelData);
    overlay.style.display = '';
    shell.classList.add('ac-intel-dimmed');
    _intelOpen = true;

    requestAnimationFrame(function() {
      overlay.classList.add('ac-intel-overlay--visible');
    });
  }

  function _closeIntelOverlay() {
    var overlay = document.getElementById('ac-intel-overlay');
    var shell   = document.querySelector('.ac-setup-shell');
    if (!overlay) return;

    overlay.classList.remove('ac-intel-overlay--visible');
    shell && shell.classList.remove('ac-intel-dimmed');
    _intelOpen = false;

    setTimeout(function() {
      if (!_intelOpen) overlay.style.display = 'none';
    }, 280);
  }

  function _paintIntelOverlay(overlay, intel) {
    if (!intel) {
      overlay.innerHTML = [
        '<div class="ac-intel-panel">',
          '<div class="ac-intel-hint">Esc or Cmd+I to close</div>',
          '<div class="ac-intel-loading">Deriving intelligence\u2026</div>',
          '<div class="ac-intel-watermark">PRIVATE VIEW</div>',
        '</div>'
      ].join('');
      _wireIntelEvents(overlay);
      return;
    }

    var html = '<div class="ac-intel-panel">';
    html += '<div class="ac-intel-hint">Esc or Cmd+I to close \u00b7 Ctrl+Shift+I fallback</div>';
    html += '<div class="ac-intel-watermark">PRIVATE VIEW</div>';

    // Per-attendee section
    html += '<div class="ac-intel-section">';
    html += '<div class="ac-intel-section-label">PER ATTENDEE</div>';
    if (!intel.attendees.length) {
      html += '<div class="ac-intel-empty">No attendees in this meeting.</div>';
    } else {
      intel.attendees.forEach(function(a) {
        html += '<div class="ac-intel-attendee">';
        html += '<div class="ac-intel-att-header">';
        html += '<span class="ac-intel-att-name">' + esc(a.name) + '</span>';
        html += '<span class="ac-intel-badge ac-intel-badge--' + a.status_color + '">' +
                esc(a.status_tag) + '</span>';
        if (a.role === 'organizer') {
          html += '<span class="ac-intel-att-role">ORGANIZER</span>';
        }
        html += '</div>';
        if (a.owed_line) {
          html += '<div class="ac-intel-att-owed">' + esc(a.owed_line) + '</div>';
        }
        if (a.urgency_line) {
          html += '<div class="ac-intel-att-urgency">\u25b8 ' + esc(a.urgency_line) + '</div>';
        }
        a.open_dissents.forEach(function(d) {
          html += '<div class="ac-intel-att-dissent">\u2298 ' +
                  esc(d.seq_id || 'DS') + ' \u00b7 ' +
                  esc((d.summary || '').slice(0, 60)) +
                  (d.age_days ? ' \u00b7 ' + d.age_days + 'd' : '') +
                  '</div>';
        });
        html += '</div>';
      });
    }
    html += '</div>';

    // Hot-buttons section
    if (intel.hot_buttons.length) {
      html += '<div class="ac-intel-section">';
      html += '<div class="ac-intel-section-label">HOT-BUTTON ITEMS</div>';
      intel.hot_buttons.forEach(function(hb) {
        html += '<div class="ac-intel-hotbtn ac-intel-hotbtn--' + hb.severity + '">' +
                '\u26a1 ' + esc(hb.text) + '</div>';
      });
      html += '</div>';
    }

    // Private notes section
    html += '<div class="ac-intel-section ac-intel-section--notes">';
    html += '<div class="ac-intel-section-label">PRIVATE NOTES ' +
            '<span class="ac-intel-note-hint">\u2014 never shared</span></div>';
    html += '<textarea class="ac-intel-notes-textarea" id="ac-intel-notes-textarea" ' +
            'placeholder="Your private prep notes\u2026">' +
            esc(intel.private_note.body || '') + '</textarea>';
    html += '</div>';

    html += '</div>';
    overlay.innerHTML = html;
    _wireIntelEvents(overlay);
  }

  function _wireIntelEvents(overlay) {
    overlay.addEventListener('click', function(ev) {
      if (ev.target === overlay) _closeIntelOverlay();
    });

    var textarea = overlay.querySelector('#ac-intel-notes-textarea');
    if (textarea && !textarea.dataset.listenerBound) {
      textarea.dataset.listenerBound = '1';
      textarea.addEventListener('input', function() {
        if (_intelNoteTimer) clearTimeout(_intelNoteTimer);
        _intelNoteTimer = setTimeout(function() {
          _saveIntelNote(textarea.value);
        }, 800);
      });
    }
  }

  var _intelNoteSaving = false;

  function _saveIntelNote(body) {
    if (!_currentMeeting || !_currentResourceId) return;
    if (_intelNoteSaving) return;  // in-flight guard — prevents duplicate INSERTs
    var note = _intelData && _intelData.private_note;

    if (note && note.note_id) {
      API.patch(
        'accord_meeting_intel_notes?note_id=eq.' + note.note_id,
        { body: body, updated_at: new Date().toISOString() }
      ).catch(function(e) {
        console.error('[AccordMeetingSetup] intel note update failed', e);
      });
    } else {
      _intelNoteSaving = true;
      API.post('accord_meeting_intel_notes', {
        firm_id:            _currentMeeting.firm_id,
        meeting_id:         _currentMeeting.meeting_id,
        author_resource_id: _currentResourceId,
        body:               body,
        is_private:         true
      }).then(function(rows) {
        _intelNoteSaving = false;
        var row = rows && rows[0];
        if (row && _intelData) {
          _intelData.private_note = { note_id: row.note_id, body: body };
        }
      }).catch(function(e) {
        _intelNoteSaving = false;
        console.error('[AccordMeetingSetup] intel note insert failed', e);
      });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // ACTION ITEMS KANBAN — CMD-ACCORD-SETUP-ACTION-KANBAN-1
  // §4 right tab bar · §5 fetch · §6 kanban · §7 grid · §8 events
  // §9 drag-to-reschedule
  // V1: UPDATE RLS requires created_by = auth.uid() — PATCH only
  //     works on own actions; others silently return 0 rows.
  // V4: ISO week Monday-start via (day+6)%7 formula.
  // CPM critical-path spine deferred — Track F prerequisite.
  // ══════════════════════════════════════════════════════════════

  // §4 — Right column tab bar
  function _renderRightTabBar(meeting, workstreamId) {
    var tabbar = document.querySelector('.ac-col-tabbar[data-col="right"]');
    if (!tabbar || tabbar.dataset.wired) return;
    tabbar.dataset.wired = '1';

    var tabs = [
      { id: 'attendees',    label: 'Attendees'    },
      { id: 'action-items', label: 'Action Items' }
    ];

    tabbar.innerHTML = [
      '<div class="ac-tabs">',
        tabs.map(function(t) {
          var active = t.id === _rightActiveTab ? ' ac-tab--active' : '';
          return '<button class="ac-tab' + active + '" data-action="right-tab" ' +
                 'data-tab="' + t.id + '">' + t.label + '</button>';
        }).join(''),
      '</div>',
      '<div class="ac-col-stepper" data-col="right" style="display:none"></div>',
      '<div class="ac-rotation-progress ac-rotation-progress--frozen" data-col="right"></div>'
    ].join('');

    tabbar.addEventListener('click', function(ev) {
      var target = ev.target.closest('[data-action]');
      var action = target && target.dataset.action;

      // ── right-tab click ───────────────────────────────────────
      if (action === 'right-tab') {
        var tab = target.dataset.tab;
        if (!tab || tab === _rightActiveTab) return;
        _rightActiveTab = tab;
        tabbar.querySelectorAll('.ac-tabs .ac-tab').forEach(function(b) {
          b.classList.toggle('ac-tab--active', b.dataset.tab === tab);
        });
        _activateRightTab(tab, meeting, workstreamId);
        var re = _slideshowEngines['right'];
        if (re) {
          var rtabs = _getSlideshowTabs('right');
          re.currentIdx = rtabs.indexOf(tab);
          if (re.currentIdx < 0) re.currentIdx = 0;
          _slideshowUpdateStepper('right', re.currentIdx);
          _slideshowManualClick('right');
        }
        return;
      }

      // ── stepper chevron click ─────────────────────────────────
      if (action === 'slideshow-prev' || action === 'slideshow-next') {
        if (!target || target.dataset.col !== 'right') return;
        var re2 = _slideshowEngines['right'];
        if (!re2) return;
        var ctabs = _getSlideshowTabs('right');
        if (ctabs.length <= 1) return;
        var newIdx = action === 'slideshow-prev'
          ? (re2.currentIdx - 1 + ctabs.length) % ctabs.length
          : (re2.currentIdx + 1) % ctabs.length;
        re2.currentIdx = newIdx;
        _slideshowActivateTab('right', newIdx, meeting, workstreamId);
        _slideshowUpdateStepper('right', newIdx);
        _slideshowManualClick('right');
        re2.elapsed = 0;
        return;
      }

      // ── stepper dot click ─────────────────────────────────────
      var dot = ev.target.closest('.ac-stepper-dot[data-col="right"]');
      if (dot) {
        var re3 = _slideshowEngines['right'];
        if (!re3) return;
        var dotIdx = parseInt(dot.dataset.idx, 10);
        if (isNaN(dotIdx)) return;
        var dtabs = _getSlideshowTabs('right');
        if (dotIdx < 0 || dotIdx >= dtabs.length) return;
        re3.currentIdx = dotIdx;
        _slideshowActivateTab('right', dotIdx, meeting, workstreamId);
        _slideshowUpdateStepper('right', dotIdx);
        _slideshowManualClick('right');
        re3.elapsed = 0;
        return;
      }
    });
  }

  function _activateRightTab(tab, meeting, workstreamId) {
    var tabbody = document.querySelector('.ac-col-tabbody[data-col="right"]');
    if (!tabbody) return;
    if (tab === 'attendees') {
      _renderAttendees(meeting, workstreamId);
      return;
    }
    if (tab === 'action-items') {
      _renderActionItems(meeting, workstreamId);
      return;
    }
  }

  // ============================================================
  // CMD-ACCORD-SETUP-SLIDESHOW-1 — Per-column rotation engine
  // Exposes: window.AccordSlideshow = { pause(colId), resume(colId) }
  // ============================================================

  // IR71: reads tab list from DOM at call-time — auto-picks up future tabs.
  function _getSlideshowTabs(col) {
    var tabbar = document.querySelector('.ac-col-tabbar[data-col="' + col + '"]');
    if (!tabbar) return [];
    var btns = tabbar.querySelectorAll('.ac-tabs .ac-tab');
    return Array.prototype.slice.call(btns).map(function(b) { return b.dataset.tab; });
  }

  // Full stepper re-render (used when policy changes or engine inits).
  function _slideshowPaintStepper(col, currentIdx) {
    var stepper = document.querySelector('.ac-col-stepper[data-col="' + col + '"]');
    if (!stepper) return;
    var tabs = _getSlideshowTabs(col);
    stepper.innerHTML = [
      '<button class="ac-stepper-btn" data-action="slideshow-prev" data-col="' + col + '">\u2039</button>',
      tabs.map(function(t, i) {
        var cls = i === currentIdx ? ' ac-stepper-dot--active' : '';
        return '<span class="ac-stepper-dot' + cls + '" data-col="' + col + '" data-idx="' + i + '"></span>';
      }).join(''),
      '<button class="ac-stepper-btn" data-action="slideshow-next" data-col="' + col + '">\u203a</button>'
    ].join('');
  }

  // Toggle active dot class without re-rendering the whole stepper.
  function _slideshowUpdateStepper(col, currentIdx) {
    var stepper = document.querySelector('.ac-col-stepper[data-col="' + col + '"]');
    if (!stepper) return;
    stepper.querySelectorAll('.ac-stepper-dot').forEach(function(d, i) {
      d.classList.toggle('ac-stepper-dot--active', i === currentIdx);
    });
  }

  // Set progress bar fill via scaleX (0–1).
  function _slideshowSetProgress(col, scaleX) {
    var bar = document.querySelector('.ac-rotation-progress[data-col="' + col + '"]');
    if (!bar) return;
    bar.style.transform = 'scaleX(' + scaleX + ')';
  }

  // Show (frozen=false) or hide (frozen=true) the progress bar.
  function _slideshowFreezeProgress(col, frozen) {
    var bar = document.querySelector('.ac-rotation-progress[data-col="' + col + '"]');
    if (!bar) return;
    bar.classList.toggle('ac-rotation-progress--frozen', frozen);
  }

  // Call the same tab-switch path a user click would — no shadow render.
  function _slideshowActivateTab(col, idx, meeting, workstreamId) {
    var tabs = _getSlideshowTabs(col);
    if (!tabs.length) return;
    var tabId = tabs[idx];
    if (!tabId) return;
    var tabbar = document.querySelector('.ac-col-tabbar[data-col="' + col + '"]');
    if (tabbar) {
      tabbar.querySelectorAll('.ac-tabs .ac-tab').forEach(function(b) {
        b.classList.toggle('ac-tab--active', b.dataset.tab === tabId);
      });
    }
    if (col === 'left') {
      _leftActiveTab = tabId;
      _activateLeftTab(tabId, meeting);
    } else {
      _rightActiveTab = tabId;
      _activateRightTab(tabId, meeting, workstreamId);
    }
    // Soft fade-in on tabbody for rotation-driven switches.
    var tabbody = document.querySelector('.ac-col-tabbody[data-col="' + col + '"]');
    if (tabbody) {
      tabbody.classList.remove('ac-tab-fade-in');
      void tabbody.offsetWidth; // reflow — restarts CSS animation
      tabbody.classList.add('ac-tab-fade-in');
    }
  }

  // Apply 60s manual-click pause (resets progress to 0).
  function _slideshowManualClick(col) {
    var e = _slideshowEngines[col];
    if (!e || e.policy === 'manual') return;
    if (e.graceTimer) { clearTimeout(e.graceTimer); e.graceTimer = null; }
    e.paused     = false;
    e.pauseUntil = Date.now() + 60000;
    e.elapsed    = 0;
    _slideshowSetProgress(col, 0);
    _slideshowFreezeProgress(col, true);
  }

  // 50ms tick — drives progress drain and tab advance.
  function _slideshowTick(col, meeting, workstreamId) {
    var e = _slideshowEngines[col];
    if (!e || e.policy === 'manual') return;
    if (e.paused) return;
    if (e.pauseUntil > Date.now()) return;

    // Unfreeze progress bar if it was frozen by a now-expired 60s pause.
    var bar = document.querySelector('.ac-rotation-progress[data-col="' + col + '"]');
    if (bar && bar.classList.contains('ac-rotation-progress--frozen')) {
      bar.classList.remove('ac-rotation-progress--frozen');
    }

    var threshold = e.initialDwell ? 5000 : 15000;
    e.elapsed += 50;
    _slideshowSetProgress(col, Math.min(e.elapsed / threshold, 1));

    if (e.elapsed >= threshold) {
      var tabs = _getSlideshowTabs(col);  // IR71: re-read at advance time
      if (tabs.length > 1) {
        e.currentIdx   = (e.currentIdx + 1) % tabs.length;
        e.initialDwell = false;
        _slideshowActivateTab(col, e.currentIdx, meeting, workstreamId);
        _slideshowUpdateStepper(col, e.currentIdx);
      }
      e.elapsed = 0;
      _slideshowSetProgress(col, 0);
    }
  }

  function _initSlideshowCol(col, meeting, workstreamId) {
    var engine = {
      col:         col,
      policy:      col === 'left' ? 'manual' : 'auto',
      currentIdx:  0,
      elapsed:     0,
      initialDwell: false,
      paused:      false,
      pauseUntil:  0,
      graceTimer:  null,
      tickTimer:   null,
      _hoverEnter: null,
      _hoverLeave: null
    };
    _slideshowEngines[col] = engine;

    if (col === 'right') {
      var tabs = _getSlideshowTabs('right');
      if (tabs.length > 1) {
        _slideshowPaintStepper('right', 0);
        var stepper = document.querySelector('.ac-col-stepper[data-col="right"]');
        if (stepper) stepper.style.display = '';
      }
      _slideshowFreezeProgress('right', false);
      _slideshowSetProgress('right', 0);

      // Hover pause — target is full column container (Brief §2.3 + §8.2).
      var container = document.querySelector('.ac-setup-col-right');
      if (container) {
        engine._hoverEnter = function() {
          var e2 = _slideshowEngines['right'];
          if (!e2) return;
          if (e2.graceTimer) { clearTimeout(e2.graceTimer); e2.graceTimer = null; }
          e2.paused = true;
          _slideshowFreezeProgress('right', true);
        };
        engine._hoverLeave = function() {
          var e2 = _slideshowEngines['right'];
          if (!e2) return;
          // 3s grace — re-enter resets timer (Brief §2.3).
          e2.graceTimer = setTimeout(function() {
            var e3 = _slideshowEngines['right'];
            if (!e3) return;
            e3.graceTimer = null;
            e3.paused     = false;
            // Resume progress only if not in a 60s click-pause.
            if (!(e3.pauseUntil > Date.now())) {
              _slideshowFreezeProgress('right', false);
            }
          }, 3000);
        };
        container.addEventListener('mouseenter', engine._hoverEnter);
        container.addEventListener('mouseleave', engine._hoverLeave);
      }
    }

    // Left column stays frozen in MANUAL; progress and stepper already
    // rendered as frozen/hidden by _renderLeftTabBar.

    engine.tickTimer = setInterval(function() {
      _slideshowTick(col, meeting, workstreamId);
    }, 50);
  }

  function _initSlideshow(meeting, workstreamId) {
    _destroySlideshow();
    _initSlideshowCol('left',  meeting, workstreamId);
    _initSlideshowCol('right', meeting, workstreamId);
    // C-12 hook contract: AccordSlideshow.pause/resume(colId).
    window.AccordSlideshow = {
      pause: function(colId) {
        var e = _slideshowEngines[colId];
        if (!e) return;
        e.paused = true;
        _slideshowFreezeProgress(colId, true);
      },
      resume: function(colId) {
        var e = _slideshowEngines[colId];
        if (!e) return;
        e.paused = false;
        if (e.policy !== 'manual' && !(e.pauseUntil > Date.now())) {
          _slideshowFreezeProgress(colId, false);
        }
      }
    };
  }

  function _destroySlideshow() {
    ['left', 'right'].forEach(function(col) {
      var e = _slideshowEngines[col];
      if (!e) return;
      if (e.tickTimer)  { clearInterval(e.tickTimer);  e.tickTimer  = null; }
      if (e.graceTimer) { clearTimeout(e.graceTimer);  e.graceTimer = null; }
      if (col === 'right' && e._hoverEnter) {
        var container = document.querySelector('.ac-setup-col-right');
        if (container) {
          container.removeEventListener('mouseenter', e._hoverEnter);
          container.removeEventListener('mouseleave', e._hoverLeave);
        }
      }
      _slideshowEngines[col] = null;
    });
    if (window.AccordSlideshow) { window.AccordSlideshow = null; }
  }

  // ============================================================
  // CMD-ACCORD-SETUP-PERCOLATE-1 — Click-to-percolate by person
  // ============================================================

  function _setPercolate(resourceId, name) {
    if (_percolateResourceId === resourceId) { _clearPercolate(); return; }
    _percolateResourceId   = resourceId;
    _percolateResourceName = name;
    _applyPercolate();
    _renderPercolatePill();
  }

  function _clearPercolate() {
    _percolateResourceId   = null;
    _percolateResourceName = null;
    document.querySelectorAll('.ac-percolate-faded').forEach(function(el) {
      el.classList.remove('ac-percolate-faded');
    });
    document.querySelectorAll('.ac-percolate-raised').forEach(function(el) {
      el.classList.remove('ac-percolate-raised');
      el.style.order = '';
    });
    var pill = document.getElementById('ac-percolate-pill');
    if (pill) pill.remove();
  }

  function _applyPercolate() {
    if (!_percolateResourceId) return;
    var rid = _percolateResourceId;

    // ── Center: agenda items ─────────────────────────────────────
    var agendaList = document.getElementById('ac-agenda-list');
    if (agendaList) {
      var agendaOrder = 1;
      agendaList.querySelectorAll('.ac-agenda-item').forEach(function(item) {
        var chip = item.querySelector('[data-resource-id="' + rid + '"]');
        if (chip) {
          item.classList.add('ac-percolate-raised');
          item.classList.remove('ac-percolate-faded');
          item.style.order = String(agendaOrder++);
        } else {
          item.classList.add('ac-percolate-faded');
          item.classList.remove('ac-percolate-raised');
          item.style.order = '';
        }
      });
    }

    // ── Center: outcomes rows ────────────────────────────────────
    var outcomesList = document.getElementById('ac-outcomes-list');
    if (outcomesList) {
      outcomesList.querySelectorAll('.ac-outcome-row').forEach(function(row) {
        var chip = row.querySelector('[data-resource-id="' + rid + '"]');
        if (chip) {
          row.classList.add('ac-percolate-raised');
          row.classList.remove('ac-percolate-faded');
        } else {
          row.classList.add('ac-percolate-faded');
          row.classList.remove('ac-percolate-raised');
        }
      });
    }

    // ── Right: attendee cards ────────────────────────────────────
    var attendeesBlock = document.getElementById('ac-attendees-block');
    if (attendeesBlock) {
      attendeesBlock.querySelectorAll('.ac-attendee-card').forEach(function(card) {
        if (card.dataset.resourceId === rid) {
          card.classList.add('ac-percolate-raised');
          card.classList.remove('ac-percolate-faded');
        } else {
          card.classList.add('ac-percolate-faded');
          card.classList.remove('ac-percolate-raised');
        }
      });
    }

    // ── Right: action cards (kanban) ─────────────────────────────
    var kanbanTrack = document.querySelector('.ac-kanban-track');
    if (kanbanTrack) {
      kanbanTrack.querySelectorAll('.ac-action-card').forEach(function(card) {
        if (card.dataset.resourceId === rid) {
          card.classList.add('ac-percolate-raised');
          card.classList.remove('ac-percolate-faded');
        } else {
          card.classList.add('ac-percolate-faded');
          card.classList.remove('ac-percolate-raised');
        }
      });
    }

    // ── Right: action cards (grid view) ──────────────────────────
    var gridView = document.querySelector('.ac-grid-view');
    if (gridView) {
      gridView.querySelectorAll('.ac-grid-action-card').forEach(function(card) {
        if (card.dataset.resourceId === rid) {
          card.classList.add('ac-percolate-raised');
          card.classList.remove('ac-percolate-faded');
        } else {
          card.classList.add('ac-percolate-faded');
          card.classList.remove('ac-percolate-raised');
        }
      });
    }
  }

  function _renderPercolatePill() {
    var existing = document.getElementById('ac-percolate-pill');
    if (existing) existing.remove();
    if (!_percolateResourceId || !_percolateResourceName) return;

    // Mount in .ac-agenda-header (Option Y — stable per _paintAgenda repaint cycle).
    var header = document.querySelector('.ac-agenda-header');
    if (!header) return;

    var pill = document.createElement('div');
    pill.id        = 'ac-percolate-pill';
    pill.className = 'ac-percolate-pill';
    pill.innerHTML = 'Filtered: <span class="ac-percolate-name">' +
                     esc(_percolateResourceName) + '</span>' +
                     ' <button class="ac-percolate-dismiss" ' +
                     'data-action="percolate-clear" title="Clear filter">\u2715</button>';
    header.appendChild(pill);

    pill.querySelector('[data-action="percolate-clear"]')
      .addEventListener('click', function(ev) {
        ev.stopPropagation();
        _clearPercolate();
      });
  }

  // ── Percolate click wiring ────────────────────────────────────

  function _wirePercolateOnAttendees(block) {
    if (!block || block.dataset.percolateWired) return;
    block.dataset.percolateWired = '1';
    block.addEventListener('click', function(ev) {
      if (ev.target.closest('button')) return;
      var card = ev.target.closest('.ac-attendee-card[data-resource-id]');
      if (!card) return;
      var rid  = card.dataset.resourceId;
      var name = (card.querySelector('.ac-attendee-name') || {}).textContent || rid;
      _setPercolate(rid, name.trim());
    });
  }

  function _wirePercolateOnAgenda(container) {
    if (!container || container.dataset.percolateWired) return;
    container.dataset.percolateWired = '1';
    container.addEventListener('click', function(ev) {
      var chip = ev.target.closest('.ac-action-owner-chip[data-resource-id]');
      if (!chip) return;
      ev.stopPropagation();
      _setPercolate(chip.dataset.resourceId, chip.textContent.trim());
    });
  }

  function _wirePercolateOnOutcomes(block) {
    if (!block || block.dataset.percolateWired) return;
    block.dataset.percolateWired = '1';
    block.addEventListener('click', function(ev) {
      if (!ev.target.closest('.ac-outcome-row')) return;
      var chip = ev.target.closest('[data-resource-id]');
      if (!chip) return;
      ev.stopPropagation();
      _setPercolate(chip.dataset.resourceId, chip.textContent.trim());
    });
  }

  function _wirePercolateOnActions(tabbody) {
    if (!tabbody || tabbody.dataset.percolateWired) return;
    tabbody.dataset.percolateWired = '1';
    tabbody.addEventListener('click', function(ev) {
      // Try owner chip with data-resource-id first
      var chip = ev.target.closest('.ac-action-owner[data-resource-id]');
      if (chip) {
        ev.stopPropagation();
        _setPercolate(chip.dataset.resourceId, chip.textContent.trim());
        return;
      }
      // Fallback: owner div → card data-resource-id
      var ownerDiv = ev.target.closest('.ac-action-owner');
      if (!ownerDiv) return;
      var card = ownerDiv.closest('.ac-action-card[data-resource-id]');
      if (!card) return;
      var rid  = card.dataset.resourceId;
      var name = ownerDiv.textContent.trim();
      if (!rid || !name) return;
      _setPercolate(rid, name);
    });
  }

  // §5 — Action items fetch
  function _renderActionItems(meeting, workstreamId) {
    var myToken = ++_actionItemsToken;
    var tabbody = document.querySelector('.ac-col-tabbody[data-col="right"]');
    if (!tabbody) return;
    tabbody.innerHTML = '<div class="ac-actions-loading">Loading actions\u2026</div>';

    if (!workstreamId) {
      tabbody.innerHTML = '<div class="ac-actions-empty">No workstream context.</div>';
      return;
    }

    _fetchWorkstreamActions(workstreamId, meeting.meeting_id)
      .then(function(actions) {
        if (_actionItemsToken !== myToken) return;
        var liveBody = document.querySelector('.ac-col-tabbody[data-col="right"]');
        if (!liveBody || !liveBody.isConnected) return;
        _resolveActionOwners(actions).then(function(enriched) {
          if (_actionItemsToken !== myToken) return;
          var liveBody2 = document.querySelector('.ac-col-tabbody[data-col="right"]');
          if (!liveBody2 || !liveBody2.isConnected) return;
          _paintActionItems(liveBody2, enriched, meeting);
        });
      })
      .catch(function(e) {
        console.error('[AccordMeetingSetup] action items fetch failed', e);
        var liveBody = document.querySelector('.ac-col-tabbody[data-col="right"]');
        if (liveBody && liveBody.isConnected)
          liveBody.innerHTML = '<div class="ac-actions-error">Could not load actions.</div>';
      });
  }

  function _fetchWorkstreamActions(workstreamId, currentMeetingId) {
    return API.get(
      'accord_meetings?workstream_id=eq.' + workstreamId +
      '&state=in.(closed,sealed,running,idle)' +
      '&select=meeting_id&limit=50'
    ).then(function(meetings) {
      if (!meetings || !meetings.length) return [];
      var ids = meetings.map(function(m) { return m.meeting_id; }).join(',');
      return API.get(
        'accord_nodes?meeting_id=in.(' + ids + ')' +
        '&tag=eq.action' +
        '&select=node_id,summary,seq_id,due_date,created_by,meeting_id,agenda_item_id,sealed_at' +
        '&order=due_date.asc.nullslast,created_at.asc'
      ).then(function(nodes) { return nodes || []; });
    });
  }

  function _resolveActionOwners(actions) {
    if (!actions.length) return Promise.resolve(actions);
    var userIds = [];
    actions.forEach(function(a) {
      if (a.created_by && userIds.indexOf(a.created_by) === -1)
        userIds.push(a.created_by);
    });
    if (!userIds.length) return Promise.resolve(actions);

    return API.get(
      'resources?user_id=in.(' + userIds.join(',') + ')&select=id,name,user_id'
    ).then(function(resources) {
      var map = {};
      (resources || []).forEach(function(r) { map[r.user_id] = r; });
      actions.forEach(function(a) {
        var r = map[a.created_by];
        a._owner_name        = r ? r.name : null;
        a._owner_resource_id = r ? r.id   : null;
      });
      return actions;
    }).catch(function() { return actions; });
  }

  // §6 — Week bounds and column assignment
  // Rolling 5-weekday window starting today (or upcoming Monday on weekends).
  // Past days are never shown as drop targets; _assignColumn buckets past
  // due_dates to 'past-due' regardless. nextMonday is the first weekday
  // immediately AFTER the visible 5-day window — used as the cutoff for
  // the 'next-week' bucket.
  function _getWeekBounds() {
    var start = new Date();
    start.setHours(0, 0, 0, 0);
    var dow = start.getDay();
    if (dow === 0)      start.setDate(start.getDate() + 1);  // Sun -> Mon
    else if (dow === 6) start.setDate(start.getDate() + 2);  // Sat -> Mon

    var days = [];
    var d = new Date(start);
    while (days.length < 5) {
      var wd = d.getDay();
      if (wd !== 0 && wd !== 6) days.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    // d now points at the first calendar day after the 5-weekday window.
    // Advance to the next weekday for the 'next-week' cutoff.
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    var nextMonday = new Date(d);
    nextMonday.setHours(0, 0, 0, 0);

    // 'monday' retained for back-compat with any caller; equals window start.
    return { monday: new Date(days[0]), days: days, nextMonday: nextMonday };
  }

  function _assignColumn(action, bounds) {
    if (!action.due_date) return 'unscheduled';
    // Parse date components directly to avoid UTC/local timezone offset issues.
    // '2026-05-08' must be treated as local May 8, not UTC midnight (which can
    // shift to local May 7 in negative-offset timezones).
    var parts = action.due_date.slice(0, 10).split('-');
    var due = new Date(
      parseInt(parts[0], 10),
      parseInt(parts[1], 10) - 1,
      parseInt(parts[2], 10)
    );
    due.setHours(0, 0, 0, 0);

    var today = new Date();
    today.setHours(0, 0, 0, 0);

    if (due < today) return 'past-due';

    for (var i = 0; i < bounds.days.length; i++) {
      var d = new Date(bounds.days[i]);
      d.setHours(0, 0, 0, 0);
      if (due.getTime() === d.getTime()) return 'day-' + i;
    }

    if (due >= bounds.nextMonday) return 'next-week';
    return 'unscheduled';
  }

  function _slackDays(action) {
    if (!action.due_date) return null;
    var parts = action.due_date.slice(0, 10).split('-');
    var due = new Date(
      parseInt(parts[0], 10),
      parseInt(parts[1], 10) - 1,
      parseInt(parts[2], 10)
    ).getTime();
    var now = Date.now();
    return Math.floor((due - now) / 86400000);
  }

  function _fmtShort(date) {
    return date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
  }

  function _isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth()    === b.getMonth()    &&
           a.getDate()     === b.getDate();
  }

  // §6.3 — Paint kanban
  function _paintActionItems(tabbody, actions, meeting) {
    var bounds = _getWeekBounds();
    var view   = 'kanban';

    function _renderKanban() {
      var buckets = {
        'past-due':    [],
        'day-0': [], 'day-1': [], 'day-2': [], 'day-3': [], 'day-4': [],
        'next-week':   [],
        'unscheduled': []
      };
      actions.forEach(function(a) {
        var col = _assignColumn(a, bounds);
        buckets[col].push(a);
      });

      var DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

      var html = '<div class="ac-actions-toolbar">';
      html += '<div class="ac-view-toggle">';
      html += '<button class="ac-view-btn' + (view === 'kanban' ? ' active' : '') +
              '" data-action="actions-view" data-view="kanban">KANBAN</button>';
      html += '<button class="ac-view-btn' + (view === 'grid' ? ' active' : '') +
              '" data-action="actions-view" data-view="grid">GRID</button>';
      html += '</div>';
      html += '<span class="ac-actions-count ac-muted">' + actions.length + ' actions</span>';
      html += '</div>';

      html += '<div class="ac-kanban-track">';
      html += _kanbanCol('PAST DUE', buckets['past-due'], 'past-due', true, false);

      for (var i = 0; i < 5; i++) {
        var dayLabel = DAY_NAMES[i] + ' ' + _fmtShort(bounds.days[i]);
        var isToday  = _isSameDay(bounds.days[i], new Date());
        html += _kanbanCol(dayLabel, buckets['day-' + i], 'day-' + i, false, isToday);
      }

      html += _kanbanCol('NEXT WEEK', buckets['next-week'], 'next-week', false, false);

      if (buckets['unscheduled'].length) {
        html += _kanbanCol('UNSCHEDULED', buckets['unscheduled'], 'unscheduled', false, false);
      }

      html += '</div>';
      tabbody.innerHTML = html;
      _wireActionEvents(tabbody, actions, meeting, bounds, view, _renderKanban, _renderGrid);
      _initKanbanDrag(tabbody, actions, meeting, bounds);
      if (_percolateResourceId) _applyPercolate();
    }

    function _renderGrid() {
      _paintGridView(tabbody, actions, meeting, bounds, _renderKanban, _renderGrid);
    }

    _renderKanban();
    _wirePercolateOnActions(tabbody);
  }

  function _kanbanCol(label, items, colId, isAlert, isToday) {
    var colCls = 'ac-kanban-col';
    if (isAlert && items.length) colCls += ' ac-kanban-col--alert';
    if (isToday) colCls += ' ac-kanban-col--today';

    var html = '<div class="' + colCls + '" data-col-id="' + colId + '">';
    html += '<div class="ac-kanban-col-label">' + esc(label);
    if (items.length) html += ' <span class="ac-kanban-count">' + items.length + '</span>';
    html += '</div>';
    html += '<div class="ac-kanban-cards" data-col-id="' + colId + '">';

    if (!items.length) {
      html += '<div class="ac-kanban-empty">\u2014</div>';
    } else {
      items.forEach(function(a) { html += _actionCardHtml(a); });
    }

    html += '</div></div>';
    return html;
  }

  function _actionCardHtml(action) {
    var slack    = _slackDays(action);
    var isPast   = slack !== null && slack < 0;
    var slackCls = isPast ? 'ac-slack--past'
                 : slack === null ? ''
                 : slack <= 1 ? 'ac-slack--red'
                 : slack <= 5 ? 'ac-slack--amber'
                 : 'ac-slack--green';

    var html = '<div class="ac-action-card" ' +
               'draggable="true" ' +
               'data-node-id="' + esc(action.node_id) + '" ' +
               'data-agenda-item-id="' + esc(action.agenda_item_id || '') + '" ' +
               'data-resource-id="' + esc(action._owner_resource_id || '') + '" ' +
               'data-sealed="' + (action.sealed_at ? '1' : '0') + '" ' +
               'data-action="action-card-click">';

    html += '<div class="ac-action-seq">' + esc(action.seq_id || 'AX') + '</div>';
    html += '<div class="ac-action-summary">' +
            esc((action.summary || '').slice(0, 80)) + '</div>';

    if (action._owner_name) {
      html += '<div class="ac-action-owner">' + esc(action._owner_name) + '</div>';
    }

    if (slack !== null) {
      var slackText = isPast ? Math.abs(slack) + 'd overdue'
                    : slack === 0 ? 'due today'
                    : slack + 'd';
      html += '<div class="ac-action-slack ' + slackCls + '">' + esc(slackText) + '</div>';
    }

    html += '</div>';
    return html;
  }

  // §7 — Grid view
  function _paintGridView(tabbody, actions, meeting, bounds, onKanban, onGrid) {
    var DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    var HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

    var html = '<div class="ac-actions-toolbar">';
    html += '<div class="ac-view-toggle">';
    html += '<button class="ac-view-btn" data-action="actions-view" data-view="kanban">KANBAN</button>';
    html += '<button class="ac-view-btn active" data-action="actions-view" data-view="grid">GRID</button>';
    html += '</div>';
    html += '<span class="ac-actions-count ac-muted">' + actions.length + ' actions</span>';
    html += '</div>';

    html += '<div class="ac-grid-view">';
    html += '<div class="ac-grid-header">';
    html += '<div class="ac-grid-time-gutter"></div>';
    DAY_NAMES.forEach(function(name, i) {
      var isToday = _isSameDay(bounds.days[i], new Date());
      html += '<div class="ac-grid-day-header' + (isToday ? ' ac-grid-day-header--today' : '') + '">';
      html += esc(name) + ' ' + esc(_fmtShort(bounds.days[i]));
      html += '</div>';
    });
    html += '</div>';

    html += '<div class="ac-grid-body">';
    HOURS.forEach(function(h) {
      html += '<div class="ac-grid-row">';
      html += '<div class="ac-grid-time">' + h + ':00</div>';
      DAY_NAMES.forEach(function(name, i) {
        var dayActions = actions.filter(function(a) {
          return a.due_date && _isSameDay(new Date(a.due_date + 'T00:00:00'), bounds.days[i]);
        });
        html += '<div class="ac-grid-cell" data-day-idx="' + i + '" data-hour="' + h + '">';
        if (h === 8) {
          dayActions.forEach(function(a) {
            html += '<div class="ac-grid-action-card" ' +
                    'data-node-id="' + esc(a.node_id) + '" ' +
                    'data-agenda-item-id="' + esc(a.agenda_item_id || '') + '" ' +
                    'data-resource-id="' + esc(a._owner_resource_id || '') + '" ' +
                    'data-action="action-card-click">' +
                    esc(a.seq_id || 'AX') + ' \u00b7 ' +
                    esc((a.summary || '').slice(0, 40)) +
                    '</div>';
          });
        }
        html += '</div>';
      });
      html += '</div>';
    });
    html += '</div></div>';

    tabbody.innerHTML = html;
    _wireActionEvents(tabbody, actions, meeting, bounds, 'grid', onKanban, onGrid);
    if (_percolateResourceId) _applyPercolate();
  }

  // §8 — Event wiring
  function _wireActionEvents(tabbody, actions, meeting, bounds, currentView, onKanban, onGrid) {
    tabbody.addEventListener('click', function(ev) {
      var action = ev.target.dataset.action ||
                   (ev.target.closest('[data-action]') &&
                    ev.target.closest('[data-action]').dataset.action);
      if (!action) return;

      if (action === 'actions-view') {
        var btn  = ev.target.closest('[data-action="actions-view"]');
        var view = btn && btn.dataset.view;
        if (view === 'kanban' && currentView !== 'kanban') { onKanban(); return; }
        if (view === 'grid'   && currentView !== 'grid')   { onGrid();   return; }
        return;
      }

      if (action === 'action-card-click') {
        var card = ev.target.closest('[data-action="action-card-click"]');
        if (!card) return;
        _onActionCardClick(card, meeting);
        return;
      }
    });
  }

  function _onActionCardClick(card, meeting) {
    var agendaItemId = card.dataset.agendaItemId;
    var resourceId   = card.dataset.resourceId;

    if (agendaItemId) {
      document.querySelectorAll('.ac-agenda-item').forEach(function(el) {
        el.classList.remove('ac-highlight-pulse');
      });
      var agendaRow = document.querySelector(
        '.ac-agenda-item[data-item-id="' + agendaItemId + '"]'
      );
      if (agendaRow) {
        agendaRow.classList.add('ac-highlight-pulse');
        agendaRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        setTimeout(function() { agendaRow.classList.remove('ac-highlight-pulse'); }, 2000);
      }
    }

    if (resourceId) {
      document.querySelectorAll('.ac-attendee-card').forEach(function(el) {
        el.classList.remove('ac-highlight-pulse');
      });
      var attCard = document.querySelector(
        '.ac-attendee-card[data-resource-id="' + resourceId + '"]'
      );
      if (attCard) {
        attCard.classList.add('ac-highlight-pulse');
        setTimeout(function() { attCard.classList.remove('ac-highlight-pulse'); }, 2000);
      }
    }
  }

  // §9 — Drag-to-reschedule
  // Mirrors Pipeline's kanban DnD recipe: no setDragImage (browser default
  // ghost is the smooth visual). Source card fades via .ac-card-dragging.
  // Optimistic repaint on drop. Click suppression flag prevents post-drop
  // click from firing action-card-click (would jump-scroll to agenda item).
  function _initKanbanDrag(tabbody, actions, meeting, bounds) {
    if (tabbody.dataset.dragWired) return;
    tabbody.dataset.dragWired = '1';

    var _dragAction = null;
    var _wasDragging = false;

    tabbody.addEventListener('dragstart', function(ev) {
      var card = ev.target.closest('.ac-action-card');
      if (!card) { ev.preventDefault(); return; }
      ev.stopPropagation();
      _dragAction = card.dataset.nodeId;
      _wasDragging = true;
      card.classList.add('ac-card-dragging');
      ev.dataTransfer.effectAllowed = 'move';
      try { ev.dataTransfer.setData('text/plain', _dragAction); } catch (e) {}
      // Intentionally NO setDragImage — browser default produces the smooth
      // translucent-card-following-cursor visual. See Pipeline DnD parity.
    });

    // Suppress the click that fires immediately after a drop completes;
    // otherwise action-card-click handler scroll-targets the agenda item.
    tabbody.addEventListener('click', function(ev) {
      if (!_wasDragging) return;
      var card = ev.target.closest('.ac-action-card');
      if (!card) return;
      ev.stopPropagation();
      ev.preventDefault();
    }, true);

    tabbody.addEventListener('dragover', function(ev) {
      if (!_dragAction) return;
      ev.preventDefault();
      ev.stopPropagation();
      ev.dataTransfer.dropEffect = 'move';

      // Auto-scroll kanban track when near edges
      var track = tabbody.querySelector('.ac-kanban-track');
      if (track) {
        var rect = track.getBoundingClientRect();
        if (ev.clientX > rect.right - 40) track.scrollLeft += 10;
        if (ev.clientX < rect.left + 40)  track.scrollLeft -= 10;
      }

      var col = ev.target.closest('.ac-kanban-cards') ||
                (ev.target.closest('.ac-kanban-col') &&
                 ev.target.closest('.ac-kanban-col').querySelector('.ac-kanban-cards'));
      tabbody.querySelectorAll('.ac-kanban-cards--drag-over').forEach(function(el) {
        el.classList.remove('ac-kanban-cards--drag-over');
      });
      if (col) col.classList.add('ac-kanban-cards--drag-over');
    });

    tabbody.addEventListener('drop', function(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var col = ev.target.closest('.ac-kanban-cards') ||
                (ev.target.closest('.ac-kanban-col') &&
                 ev.target.closest('.ac-kanban-col').querySelector('.ac-kanban-cards'));
      if (!col || !_dragAction) return;
      var colId      = col.dataset.colId;
      var newDueDate = _colIdToDate(colId, bounds);
      if (newDueDate === undefined) return;  // past-due drop is a no-op

      tabbody.querySelectorAll('.ac-kanban-cards--drag-over').forEach(function(el) {
        el.classList.remove('ac-kanban-cards--drag-over');
      });

      // Optimistic update — repaint immediately so card appears in new column
      // before the network round-trip completes. No visible snap-back.
      var capturedAction = _dragAction;
      _dragAction = null;
      var a = actions.find(function(x) { return x.node_id === capturedAction; });
      if (a) a.due_date = newDueDate;
      var liveBody = document.querySelector('.ac-col-tabbody[data-col="right"]');
      if (liveBody) _paintActionItems(liveBody, actions, meeting);

      // PATCH in background — revert on failure
      API.patch('accord_nodes?node_id=eq.' + capturedAction, { due_date: newDueDate })
        .catch(function(e) {
          console.error('[AccordMeetingSetup] due_date patch failed — reverting', e);
          // Revert local state and repaint
          if (a) a.due_date = null;
          var revertBody = document.querySelector('.ac-col-tabbody[data-col="right"]');
          if (revertBody) _paintActionItems(revertBody, actions, meeting);
        });
    });

    tabbody.addEventListener('dragend', function() {
      tabbody.querySelectorAll('.ac-card-dragging, .ac-kanban-cards--drag-over')
        .forEach(function(el) {
          el.classList.remove('ac-card-dragging', 'ac-kanban-cards--drag-over');
        });
      _dragAction = null;
      // Release click-suppression after the post-drop click has fired & been
      // swallowed. 50ms matches Pipeline's pattern.
      setTimeout(function() { _wasDragging = false; }, 50);
    });

  }

  function _colIdToDate(colId, bounds) {
    if (colId === 'past-due') return undefined;  // no-op — cannot schedule in the past via drag
    if (colId === 'unscheduled') return null;    // explicitly removes due date
    if (colId === 'next-week') {
      return new Date(bounds.nextMonday).toISOString().slice(0, 10);
    }
    var dayIdx = parseInt(colId.replace('day-', ''), 10);
    if (isNaN(dayIdx)) return undefined;
    return new Date(bounds.days[dayIdx]).toISOString().slice(0, 10);
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER ENTRY POINT
  // ══════════════════════════════════════════════════════════════

  function render(host, meeting, workstreamId) {
    if (!host) return;
    teardown();
    _currentMeetingId      = meeting.meeting_id;
    _currentWorkstreamId   = workstreamId;          // C-13: cached for footer re-render triggers
    _agendaFetchAborted    = false;
    _outcomesAborted       = false;
    _attendeesAborted      = false;
    _filmstripAborted      = false;   // reset here AND in _renderFilmstrip; belt+suspenders
    window._accordDetachSurfaceHost = _detachHandler;

    // ── CMD-ACCORD-SETUP-LAYOUT-1: full-page host mechanism (§3, Option A)
    // Class applied to BOTH #accord-app AND document.body:
    //   #accord-app — specificity (1,2,0) beats existing rail CSS
    //                 which uses #accord-app as ancestor (1,1,0+).
    //   document.body — reaches running-meeting panes (agenda-rail etc.)
    //                   which live OUTSIDE #accord-app at y > 945px.
    // teardown() removes from both — smoke test 7.
    var appRoot = document.getElementById('accord-app');
    if (appRoot) appRoot.classList.add(FULLPAGE_CLS);
    document.body.classList.add(FULLPAGE_CLS);

    host.innerHTML = _buildHTML(meeting, workstreamId);

    // ── CMD-ACCORD-SETUP-LAYOUT-1: layout init + listeners ────
    _initColWidths();
    _initFilmstripHeight();
    _wireColumnHandles();
    _wireFilmstripHandle();
    document.addEventListener('keydown', _onIntelKey);

    // ── CMD-ACCORD-SETUP-BRIEFING-TABS-1: left column tab bar ────
    _renderLeftTabBar(meeting);
    _activateLeftTab(_leftActiveTab, meeting);

    // ── CMD-ACCORD-SETUP-AGENDA-ENHANCED-1: center tab bar + agenda
    _renderCenterTabBar(meeting);
    _renderAgendaContent(meeting, workstreamId);

    // ── CMD-ACCORD-SETUP-INTELLIGENCE-1: set current meeting + resolve resource ID
    _currentMeeting    = meeting;
    _currentResourceId = null;
    API.get('resources?user_id=eq.' + _getCurrentUserId() + '&select=id&limit=1')
      .then(function(rows) {
        if (rows && rows[0]) _currentResourceId = rows[0].id;
      });
    _deriveIntelData(meeting, workstreamId, function(intel) {
      _intelData = intel;
      // Enrich attendee cards if already rendered
      var block = document.getElementById('ac-attendees-block');
      if (block && block.querySelectorAll('.ac-attendee-card').length > 0) {
        _enrichAttendeeCards(block, intel);
      }
    });

    // ── CMD-ACCORD-SETUP-HEADER-1: header render ──────────────
    _renderHeader(meeting, workstreamId);

    // ── CMD-ACCORD-SETUP-OUTCOMES-1: outcomes render ──────────
    _renderOutcomes(meeting);

    // ── CMD-ACCORD-SETUP-ATTENDEES-1: attendees render ────────
    // Only render attendees if that tab is active; action-items tab
    // manages its own content via _activateRightTab
    if (_rightActiveTab === 'attendees') {
      _renderAttendees(meeting, workstreamId);
    }

    // ── CMD-ACCORD-SETUP-ACTION-KANBAN-1: right column tab bar
    _renderRightTabBar(meeting, workstreamId);
    if (_rightActiveTab === 'action-items') {
      _renderActionItems(meeting, workstreamId);
    }

    // ── CMD-ACCORD-SETUP-SLIDESHOW-1: rotation engine init ───────
    _initSlideshow(meeting, workstreamId);

    // Breadcrumb async resolve — also caches _workstreamName for briefing
    // CMD-ACCORD-SETUP-LAYOUT-1: breadcrumb element no longer in shell;
    // the header CMD will reintroduce a breadcrumb host. _workstreamName
    // caching no longer fires this CMD.
    // if (workstreamId) {
    //   _resolveWorkstreamName(workstreamId, host.querySelector('#ac-setup-crumb-ws'));
    // }

    // Begin Meeting
    // CMD-ACCORD-SETUP-LAYOUT-1: deferred to CMD-ACCORD-SETUP-VERDICT-1
    // var beginBtn = host.querySelector('#ac-setup-begin-btn');
    // if (beginBtn) {
    //   beginBtn.addEventListener('click', function () {
    //     _beginMeeting(meeting, workstreamId, beginBtn);
    //   });
    // }

    // Briefing + Agenda + Anticipation + Filmstrip + Footer duration in parallel
    // CMD-ACCORD-SETUP-LAYOUT-1: deferred to CMD-ACCORD-SETUP-BRIEFING-TABS-1
    // _renderBriefing(meeting, workstreamId);
    // CMD-ACCORD-SETUP-LAYOUT-1: deferred to CMD-ACCORD-SETUP-OUTCOMES-1
    // _renderAgenda(meeting, workstreamId);
    // CMD-ACCORD-SETUP-LAYOUT-1: deferred to CMD-ACCORD-SETUP-ATTENDEES-1
    // _renderAnticipation(meeting, workstreamId);
    // CMD-ACCORD-SETUP-FILMSTRIP-2: filmstrip now wired
    _renderFilmstrip(meeting, workstreamId);
    // CMD-ACCORD-SETUP-LAYOUT-1: deferred to CMD-ACCORD-SETUP-VERDICT-1
    // _renderFooterDuration(meeting);

    // ── CMD-ACCORD-SETUP-GATHERING-1 (C-12): start gathering timer ─
    // Polls scheduled_for every 30s and engages gathering mode within
    // the 15-min window; auto-exits when meeting transitions out of idle.
    _startGatheringTimer(meeting);

    // ── CMD-ACCORD-SETUP-VERDICT-1 (C-13): footer render ─────────
    _renderFooter(meeting, workstreamId);

    // NRA event listeners for live badge refresh -- Phase 5
    // CMD-ACCORD-SETUP-LAYOUT-1: paired with _renderAnticipation deferral.
    // Listeners target .ac-setup-anticipation-area which this CMD does not
    // render; revive when CMD-ACCORD-SETUP-ATTENDEES-1 ships the right column.
    // teardown()'s removeEventListener calls remain (idempotent and safe).
    // NRA_EVENTS.forEach(function(evt) {
    //   window.addEventListener(evt, _onNraEvent);
    // });
  }

  // ── Expose ────────────────────────────────────────────────────

  // ============================================================
  // ANTICIPATION COLUMN -- Phase 5
  // ============================================================

  var _anticipationFetchAborted = false;
  var NRA_EVENTS = [
    'accord:nra-declared', 'accord:nra-superseded',
    'accord:nra-resolved', 'accord:nra-deferred', 'accord:nra-waived'
  ];

  function _onNraEvent() {
    var area = document.querySelector('.ac-setup-anticipation-area');
    var list = area && area.querySelector('#ac-prior-actions-list');
    if (!list || !window.AccordNRA || !window.AccordNRA.wireBadgesIn) return;
    var rows = Array.from(list.querySelectorAll('[data-node-id]'));
    if (!rows.length) return;
    var firmId = window.Accord && window.Accord.state && window.Accord.state.meeting
      ? window.Accord.state.meeting.firm_id : null;
    var lookup = function(nodeId) { return { node_id: nodeId, firm_id: firmId }; };
    try { AccordNRA.wireBadgesIn(list, lookup); }
    catch(e) { console.error('[AccordMeetingSetup] NRA event badge refresh failed', e); }
  }

  function _fetchResources() {
    return API.get(
      'resources?is_active=eq.true' +
      '&select=id,name,title' +
      '&order=title.asc,name.asc'
    ).then(function(rows) { return rows || []; });
  }

  function _fetchPriorActions(currentMeetingId, workstreamId) {
    return API.get(
      'accord_meetings?workstream_id=eq.' + workstreamId +
      '&meeting_id=neq.' + currentMeetingId +
      '&state=in.(closed,sealed)' +
      '&select=meeting_id' +
      '&order=scheduled_for.desc.nullslast,created_at.desc' +
      '&limit=10'
    ).then(function(meetings) {
      if (!meetings || !meetings.length) return [];
      var ids = meetings.map(function(m) { return m.meeting_id; }).join(',');
      return API.get(
        'accord_nodes?meeting_id=in.(' + ids + ')' +
        '&tag=eq.action' +
        '&select=node_id,summary,meeting_id,created_at' +
        '&order=created_at.desc' +
        '&limit=20'
      ).then(function(nodes) { return nodes || []; });
    });
  }

  function _paintAnticipation(area, resources, actionNodes) {
    if (_anticipationFetchAborted || !area || !area.parentNode) return;
    var resHTML = '<div class="ac-anticipation-section">' +
      '<div class="ac-anticipation-section-label">Expected Attendees</div>';
    if (!resources.length) {
      resHTML += '<div class="ac-anticipation-empty">No attendees on record.</div>';
    } else {
      resHTML += '<div class="ac-anticipation-resources-list">';
      resources.forEach(function(r) {
        resHTML += (
          '<div class="ac-anticipation-resource">' +
            '<span class="ac-anticipation-resource-name">' + esc(r.name) + '</span>' +
            (r.title ? '<span class="ac-anticipation-resource-role">' + esc(r.title) + '</span>' : '') +
          '</div>'
        );
      });
      resHTML += '</div>';
    }
    resHTML += '</div>';

    var actHTML = '<div class="ac-anticipation-section">' +
      '<div class="ac-anticipation-section-label">Prior Actions</div>';
    if (!actionNodes.length) {
      actHTML += '<div class="ac-anticipation-empty">No prior actions in this workstream.</div>';
    } else {
      actHTML += '<div class="ac-anticipation-actions-list" id="ac-prior-actions-list">';
      actionNodes.forEach(function(n) {
        actHTML += (
          '<div class="ac-anticipation-action" data-node-id="' + esc(n.node_id) + '">' +
            '<span class="ac-anticipation-action-summary">' + esc(truncate(n.summary, 100)) + '</span>' +
            '<span class="ac-nra-badge-slot"></span>' +
          '</div>'
        );
      });
      actHTML += '</div>';
    }
    actHTML += '</div>';

    area.innerHTML = '<div class="ac-anticipation-host">' + resHTML + actHTML + '</div>';

    if (actionNodes.length && window.AccordNRA && window.AccordNRA.wireBadgesIn) {
      // wireBadgesIn expects a lookup function (nodeId) => nodeObject with firm_id.
      // Build index from fetched action nodes; fall back stub with firm_id from state.
      var nodeIndex = {};
      var firmId = window.Accord && window.Accord.state && window.Accord.state.meeting
        ? window.Accord.state.meeting.firm_id : null;
      actionNodes.forEach(function(n) { nodeIndex[n.node_id] = n; });
      var lookup = function(nodeId) {
        return nodeIndex[nodeId] || { node_id: nodeId, firm_id: firmId };
      };
      if (_anticipationFetchAborted) return;
      var list = area.querySelector('#ac-prior-actions-list');
      if (list) {
        try { AccordNRA.wireBadgesIn(list, lookup); }
        catch(e) { console.error('[AccordMeetingSetup] NRA badge wiring failed', e); }
      }
    }
  }

  function _renderAnticipation(meeting, workstreamId) {
    _anticipationFetchAborted = false;
    var area = document.querySelector('.ac-setup-anticipation-area');
    if (!area) return;
    area.innerHTML = '<div class="ac-anticipation-loading">Loading\u2026</div>';

    if (!workstreamId) {
      area.innerHTML = '<div class="ac-anticipation-empty">No workstream context.</div>';
      return;
    }

    Promise.all([
      _fetchResources(),
      _fetchPriorActions(meeting.meeting_id, workstreamId)
    ]).then(function(results) {
      if (_anticipationFetchAborted) return;
      _paintAnticipation(area, results[0], results[1]);
    }).catch(function(e) {
      console.error('[AccordMeetingSetup] anticipation fetch failed', e);
      if (!_anticipationFetchAborted) {
        area.innerHTML = '<div class="ac-anticipation-error">Could not load anticipation data.</div>';
      }
    });
  }


  // ============================================================
  // FILMSTRIP -- Phase 6
  // ============================================================

  var _filmstripFetchAborted = false;

  function _fmtDate(s) {
    if (!s) return '—';
    try {
      return new Date(s).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    } catch(e) { return '—'; }
  }

  function _buildCountSummary(counts) {
    // Canonical tag order: Note, Decision, Action, Risk, Question, Dissent
    // Platform-canonical display order for node tag summaries (Phase 6).
    // Dissent uses 'Di' to avoid collision with Decision 'D'.
    var order = [
      { tag: 'note',     abbr: 'N'  },
      { tag: 'decision', abbr: 'D'  },
      { tag: 'action',   abbr: 'A'  },
      { tag: 'risk',     abbr: 'R'  },
      { tag: 'question', abbr: 'Q'  },
      { tag: 'dissent',  abbr: 'Di' }
    ];
    var parts = [];
    order.forEach(function(t) {
      var c = counts[t.tag];
      if (c) parts.push(c + t.abbr);
    });
    return parts.length ? parts.join(' � ') : 'No captures';
  }

  function _onFilmCardClick(ev) {
    var card = ev.target.closest('.ac-film-card');
    if (!card) return;
    var meetingId    = card.dataset.meetingId;
    var workstreamId = card.dataset.workstreamId || null;
    if (!meetingId) return;
    if (window.Accord && Accord.setLevel) {
      Accord.setLevel('meeting', { meetingId: meetingId, workstreamId: workstreamId });
    } else {
      window.dispatchEvent(new CustomEvent('accord:level-changed', {
        detail: { level: 'meeting', context: { meetingId: meetingId, workstreamId: workstreamId } }
      }));
    }
  }

  function _fetchPriorMeetings(currentMeetingId, workstreamId) {
    return API.get(
      'accord_meetings?workstream_id=eq.' + workstreamId +
      '&meeting_id=neq.' + currentMeetingId +
      '&state=in.(closed,sealed)' +
      '&select=meeting_id,title,scheduled_for,sealed_at,state' +
      '&order=scheduled_for.desc.nullslast,created_at.desc' +
      '&limit=12'
    ).then(function(rows) { return rows || []; });
  }

  function _fetchNodeCounts(meetings) {
    if (!meetings.length) return Promise.resolve({});
    var ids = meetings.map(function(m) { return m.meeting_id; }).join(',');
    return API.get(
      'accord_nodes?meeting_id=in.(' + ids + ')&select=meeting_id,tag'
    ).then(function(nodes) {
      var map = {};
      meetings.forEach(function(m) { map[m.meeting_id] = {}; });
      (nodes || []).forEach(function(n) {
        if (!map[n.meeting_id]) map[n.meeting_id] = {};
        map[n.meeting_id][n.tag] = (map[n.meeting_id][n.tag] || 0) + 1;
      });
      return map;
    });
  }

  // ============================================================
  // FOOTER DURATION WIDGET -- Phase 7
  // ============================================================

  function _saveDuration(footerLeft, meeting, val) {
    API.patch(
      'accord_meetings?meeting_id=eq.' + meeting.meeting_id,
      { duration_minutes: val }
    ).then(function() {
      meeting.duration_minutes = val;
      _paintDuration(footerLeft, meeting);
    }).catch(function(e) {
      console.error('[AccordMeetingSetup] duration save failed', e);
      _paintDuration(footerLeft, meeting);
    });
  }

  function _openDurationInput(footerLeft, meeting, currentVal) {
    footerLeft.innerHTML =
      '<div class="ac-footer-duration ac-footer-duration--editing">' +
        '<input class="ac-footer-duration-input" type="number" min="1" max="480" ' +
          'placeholder="minutes"' +
          (currentVal != null ? ' value="' + esc(String(currentVal)) + '"' : '') +
          '>' +
        '<button class="btn btn-signal ac-footer-duration-save">Set</button>' +
        '<button class="btn btn-ghost ac-footer-duration-cancel">Cancel</button>' +
      '</div>';

    var input     = footerLeft.querySelector('.ac-footer-duration-input');
    var saveBtn   = footerLeft.querySelector('.ac-footer-duration-save');
    var cancelBtn = footerLeft.querySelector('.ac-footer-duration-cancel');

    input.focus();
    if (currentVal != null) input.select();

    function _doSave() {
      var val = parseInt(input.value, 10);
      if (!val || val < 1) { _paintDuration(footerLeft, meeting); return; }
      _saveDuration(footerLeft, meeting, val);
    }

    input.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); _doSave(); }
      if (ev.key === 'Escape') { _paintDuration(footerLeft, meeting); }
    });
    saveBtn.addEventListener('click', _doSave);
    cancelBtn.addEventListener('click', function() { _paintDuration(footerLeft, meeting); });
  }

  function _paintDuration(footerLeft, meeting) {
    var d = meeting.duration_minutes;
    if (d == null) {
      footerLeft.innerHTML =
        '<div class="ac-footer-duration">' +
          '<button class="btn btn-ghost ac-footer-duration-set">Set duration</button>' +
        '</div>';
      footerLeft.querySelector('.ac-footer-duration-set')
        .addEventListener('click', function() { _openDurationInput(footerLeft, meeting, null); });
    } else {
      footerLeft.innerHTML =
        '<div class="ac-footer-duration">' +
          '<span class="ac-footer-duration-value">' + esc(d + 'm') + '</span>' +
          '<button class="btn btn-ghost ac-footer-duration-edit" title="Edit">\u270e</button>' +
          '<button class="btn btn-ghost ac-footer-duration-clear" title="Clear">\u00d7</button>' +
        '</div>';
      footerLeft.querySelector('.ac-footer-duration-edit')
        .addEventListener('click', function() { _openDurationInput(footerLeft, meeting, d); });
      footerLeft.querySelector('.ac-footer-duration-clear')
        .addEventListener('click', function() { _saveDuration(footerLeft, meeting, null); });
    }
  }

  function _renderFooterDuration(meeting) {
    var footerLeft = document.querySelector('.ac-setup-footer-left');
    if (!footerLeft) return;
    _paintDuration(footerLeft, meeting);
  }

  window.AccordMeetingSetup = { render: render, teardown: teardown };

})();