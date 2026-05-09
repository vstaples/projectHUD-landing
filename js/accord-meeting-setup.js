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

    // ── CMD-ACCORD-SETUP-LAYOUT-1: layout teardown ─────────────
    // Undo full-page mechanism (regression-critical — smoke test 7).
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
  // RENDER ENTRY POINT
  // ══════════════════════════════════════════════════════════════

  function render(host, meeting, workstreamId) {
    if (!host) return;
    teardown();
    _currentMeetingId   = meeting.meeting_id;
    _agendaFetchAborted = false;
    window._accordDetachSurfaceHost = _detachHandler;

    // ── CMD-ACCORD-SETUP-LAYOUT-1: full-page host mechanism (§3, Option A)
    // Class applied to document.body — the reliable ancestor of both the
    // structural rails (.ac-rail-left / .ac-rail-right inside #accord-app)
    // AND the running-meeting tab panes (agenda-rail, meta-pane, etc.) which
    // live OUTSIDE #accord-app at y > 945px in the document.
    // Diagnostic finding (CMD-ACCORD-SETUP-HEADER-1 smoke): #accord-app ends
    // at y:945; panes start at y:1001 — #accord-app selector missed them.
    // teardown() removes the class — smoke test 7.
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
    // CMD-ACCORD-SETUP-LAYOUT-1: deferred to CMD-ACCORD-SETUP-FILMSTRIP-2
    // _renderFilmstrip(meeting, workstreamId);
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

  function _paintFilmstrip(strip, meetings, countMap, workstreamId) {
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

  function _renderFilmstrip(meeting, workstreamId) {
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