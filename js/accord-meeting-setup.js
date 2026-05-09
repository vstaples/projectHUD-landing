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
  function _buildHTML(meeting, workstreamId) {
    var title = esc(meeting.title || '(untitled)');
    var scheduledStr = '';
    if (meeting.scheduled_for) {
      try {
        scheduledStr = new Date(meeting.scheduled_for).toLocaleDateString([], {
          year: 'numeric', month: 'short', day: 'numeric',
          hour: '2-digit', minute: '2-digit'
        });
      } catch (e) {}
    }
    var crumbWs = workstreamId
      ? '<span class="ac-setup-crumb-ws" id="ac-setup-crumb-ws">\u2026 \u203a </span>'
      : '<span class="ac-setup-crumb-ws">Accord \u203a </span>';
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
            '<div class="ac-setup-col-label">Briefing</div>' +
            '<div class="ac-setup-briefing-area" id="ac-setup-briefing-area">' +
              '<div class="ac-agenda-loading">Loading\u2026</div>' +
            '</div>' +
          '</div>' +
          '<div class="ac-setup-col ac-setup-col--agenda">' +
            '<div class="ac-setup-col-label">Agenda</div>' +
            '<div class="ac-setup-agenda-area" id="ac-setup-agenda-area">' +
              '<div class="ac-agenda-loading">Loading\u2026</div>' +
            '</div>' +
          '</div>' +
          '<div class="ac-setup-col ac-setup-col--anticipation">' +
            '<div class="ac-setup-col-label">Anticipation</div>' +
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
  // RENDER ENTRY POINT
  // ══════════════════════════════════════════════════════════════

  function render(host, meeting, workstreamId) {
    if (!host) return;
    teardown();
    _currentMeetingId   = meeting.meeting_id;
    _agendaFetchAborted = false;
    window._accordDetachSurfaceHost = _detachHandler;

    host.innerHTML = _buildHTML(meeting, workstreamId);

    // Breadcrumb async resolve — also caches _workstreamName for briefing
    if (workstreamId) {
      _resolveWorkstreamName(workstreamId, host.querySelector('#ac-setup-crumb-ws'));
    }

    // Begin Meeting
    var beginBtn = host.querySelector('#ac-setup-begin-btn');
    if (beginBtn) {
      beginBtn.addEventListener('click', function () {
        _beginMeeting(meeting, workstreamId, beginBtn);
      });
    }

    // Briefing + Agenda + Anticipation + Filmstrip in parallel
    _renderBriefing(meeting, workstreamId);
    _renderAgenda(meeting, workstreamId);
    _renderAnticipation(meeting, workstreamId);
    _renderFilmstrip(meeting, workstreamId);

    // NRA event listeners for live badge refresh -- Phase 5
    NRA_EVENTS.forEach(function(evt) {
      window.addEventListener(evt, _onNraEvent);
    });
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

  window.AccordMeetingSetup = { render: render, teardown: teardown };

})();