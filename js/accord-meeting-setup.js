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
  var COL_MAX_W    = 600;
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

  // ── CMD-ACCORD-SETUP-OUTCOMES-1: outcomes state ───────────────
  var _outcomesAborted  = false;
  var _descPatchTimers  = {};   // keyed by outcome_id

  // ── CMD-ACCORD-SETUP-ATTENDEES-1: attendees state ─────────────
  var _attendeesAborted = false;
  var _searchTimer      = null;

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

  // ── Detach hook ───────────────────────────────────────────────
  function _detachHandler() { teardown(); }

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

    // ── CMD-ACCORD-SETUP-OUTCOMES-1: outcomes teardown ──────────
    _outcomesAborted = true;
    Object.keys(_descPatchTimers).forEach(function(k) {
      if (_descPatchTimers[k]) clearTimeout(_descPatchTimers[k]);
    });
    _descPatchTimers = {};

    // ── CMD-ACCORD-SETUP-ATTENDEES-1: attendees teardown ────────
    _attendeesAborted = true;
    if (_searchTimer) { clearTimeout(_searchTimer); _searchTimer = null; }

    // ── CMD-ACCORD-SETUP-FILMSTRIP-2: filmstrip teardown ────────
    _filmstripAborted = true;
    _filmstripToken++;            // invalidates all in-flight filmstrip callbacks
    if (_filmResizeObserver) { _filmResizeObserver.disconnect(); _filmResizeObserver = null; }
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

    // ── CMD-ACCORD-SETUP-LAYOUT-1: layout teardown ─────────────
    // Undo full-page mechanism (regression-critical — smoke test 7).
    var appRoot = document.getElementById('accord-app');
    if (appRoot) appRoot.classList.remove(FULLPAGE_CLS);
    document.body.classList.remove(FULLPAGE_CLS);
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
              '<div class="ac-meta-row">' +
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
      whenEl.textContent = _fmtWhen(meeting.scheduled_for, meeting.duration_minutes);
    }

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
    var d    = new Date(scheduledFor);
    var opts = { weekday: 'short', month: 'short', day: 'numeric' };
    var date      = d.toLocaleDateString(undefined, opts);
    var startTime = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    if (!durationMinutes) return date + ' \u00b7 ' + startTime;
    var end     = new Date(d.getTime() + durationMinutes * 60000);
    var endTime = end.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return date + ' \u00b7 ' + startTime + ' \u2014 ' + endTime;
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
      html += '<span class="ac-outcome-owner">' + esc(o._owner_name) + '</span>';
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
    }).catch(function(e) {
      block.dataset.submitting = '';
      console.error('[AccordMeetingSetup] add outcome failed', e);
    });
  }

  function _deleteOutcome(outcomeId, meeting) {
    API.del('accord_meeting_outcomes?outcome_id=eq.' + outcomeId)
      .then(function() { _loadOutcomes(meeting); })
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
    _setGatheringMode(block, meeting);
    _wireAttendeeEvents(block, meeting);
  }

  // §5.6 — Attendee card HTML
  function _attendeeCardHtml(attendee, meeting, canRemove) {
    var isYou       = attendee.role_in_meeting === 'organizer';
    var initials    = _initials(attendee._name || '');
    var statusBadge = _statusBadge(attendee);

    var html = '<div class="ac-attendee-card" data-attendee-id="' +
               esc(attendee.attendee_id) + '">';

    // Connection dot (static; C-12 wires presence)
    html += '<div class="ac-conn-dot ac-conn-dot--idle" title="Connection status"></div>';

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
    var map = {
      'accepted':  { cls: 'ac-badge--accepted',  label: 'ACCEPTED'  },
      'declined':  { cls: 'ac-badge--declined',  label: 'DECLINED'  },
      'tentative': { cls: 'ac-badge--tentative', label: 'TENTATIVE' },
      'pending':   null
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
    }).catch(function(e) {
      console.error('[AccordMeetingSetup] add attendee failed', e);
    });
  }

  function _removeAttendee(attendeeId, meeting) {
    API.del('accord_meeting_attendees?attendee_id=eq.' + attendeeId)
      .then(function() { _loadAttendees(meeting); })
      .catch(function(e) {
        console.error('[AccordMeetingSetup] remove attendee failed', e);
      });
  }

  // §5.10 — Gathering mode data attribute (C-12 wires visual transition)
  function _setGatheringMode(block, meeting) {
    if (!meeting.scheduled_for) {
      block.setAttribute('data-mode', 'prep');
      return;
    }
    var diffMs = new Date(meeting.scheduled_for).getTime() - Date.now();
    var isGathering = diffMs > 0 && diffMs < 15 * 60 * 1000;
    block.setAttribute('data-mode', isGathering ? 'gathering' : 'prep');
  }

  // ══════════════════════════════════════════════════════════════
  // FILMSTRIP — CMD-ACCORD-SETUP-FILMSTRIP-2
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
      html += '<div class="ac-film-date' + (isCurrent ? ' ac-film-date--current' : '') + '">';
      html += esc(date) + '</div>';
      if (summary) html += '<div class="ac-film-counts">' + esc(summary) + '</div>';
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

    var todayCtrl = document.querySelector('[data-action="scrub-today"]');
    if (todayCtrl) todayCtrl.classList.add('ac-film-ctrl--active');
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
            workstreamId: workstreamId
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
  // RENDER ENTRY POINT
  // ══════════════════════════════════════════════════════════════

  function render(host, meeting, workstreamId) {
    if (!host) return;
    teardown();
    _currentMeetingId      = meeting.meeting_id;
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

    // ── CMD-ACCORD-SETUP-HEADER-1: header render ──────────────
    _renderHeader(meeting, workstreamId);

    // ── CMD-ACCORD-SETUP-OUTCOMES-1: outcomes render ──────────
    _renderOutcomes(meeting);

    // ── CMD-ACCORD-SETUP-ATTENDEES-1: attendees render ────────
    _renderAttendees(meeting, workstreamId);

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

  function _paintFilmstripPhase6Legacy(strip, meetings, countMap, workstreamId) {
    if (_filmstripFetchAborted || !strip || !strip.parentNode) return;
    if (!meetings.length) {
      strip.innerHTML = '<div class="ac-film-empty">No prior meetings in this workstream.</div>';
      return;
    }
    var html = '<div class="ac-film-track">';
    meetings.forEach(function(m) {
      var counts  = countMap[m.meeting_id] || {};
      var date    = _fmtDate(m.scheduled_for || m.sealed_at);
      var summary = _buildCountSummary(counts);
      html += (
        '<div class="ac-film-card"' +
          ' data-meeting-id="' + esc(m.meeting_id) + '"' +
          ' data-workstream-id="' + esc(workstreamId) + '">' +
          '<div class="ac-film-card-title">' + esc(m.title || '(untitled)') + '</div>' +
          '<div class="ac-film-card-date">' + esc(date) + '</div>' +
          '<div class="ac-film-card-summary">' + esc(summary) + '</div>' +
        '</div>'
      );
    });
    html += '</div>';
    strip.innerHTML = html;
    strip.addEventListener('click', _onFilmCardClick);
  }

  function _renderFilmstripPhase6Legacy(meeting, workstreamId) {
    _filmstripFetchAborted = false;
    var strip = document.querySelector('.ac-setup-filmstrip');
    if (!strip) return;
    if (!workstreamId) {
      strip.style.display = 'none';
      return;
    }
    strip.innerHTML = '<div class="ac-film-loading">Loading\u2026</div>';
    _fetchPriorMeetings(meeting.meeting_id, workstreamId)
      .then(function(meetings) {
        if (_filmstripFetchAborted) return;
        return _fetchNodeCounts(meetings).then(function(countMap) {
          if (_filmstripFetchAborted) return;
          _paintFilmstrip(strip, meetings, countMap, workstreamId);
        });
      })
      .catch(function(e) {
        console.error('[AccordMeetingSetup] filmstrip fetch failed', e);
        if (!_filmstripFetchAborted && strip && strip.parentNode) {
          strip.innerHTML = '<div class="ac-film-error">Could not load prior meetings.</div>';
        }
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