// ============================================================
// accord-meeting-setup.js — Meeting Setup surface
// CMD-ACCORD-MEETING-SETUP-1 Phase 2 + Phase 3
//
// Phase 2: shell chrome, briefing autosave, Begin Meeting.
// Phase 3: agenda render, add-item, reorder, pull-as-thread.
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
  var _saveTimer       = null;
  var _currentMeetingId = null;
  var _agendaFetchAborted = false;

  // ── Detach hook ───────────────────────────────────────────────
  function _detachHandler() { teardown(); }

  // ── teardown ──────────────────────────────────────────────────
  function teardown() {
    if (window._accordDetachSurfaceHost === _detachHandler) {
      window._accordDetachSurfaceHost = null;
    }
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
    _agendaFetchAborted = true;
    _currentMeetingId = null;
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
        if (name) crumbEl.textContent = esc(name) + ' \u203a ';
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
            '<div class="ac-setup-briefing-area">' +
              '<textarea class="ac-setup-briefing-text" id="ac-setup-briefing-text" ' +
                'placeholder="Add prep notes\u2026" aria-label="Meeting briefing">' +
                esc(meeting.briefing_text || '') +
              '</textarea>' +
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

  // ── Agenda: fetch ─────────────────────────────────────────────
  function _fetchAgendaItems(meetingId) {
    return API.get(
      'accord_agenda_items?meeting_id=eq.' + meetingId +
      '&order=position.asc,created_at.asc&select=*'
    ).then(function (rows) { return rows || []; });
  }

  // ── Agenda: paint ─────────────────────────────────────────────
  function _paintAgenda(area, items, meeting, workstreamId) {
    var firmId = (window.Accord && window.Accord.state && window.Accord.state.meeting)
      ? window.Accord.state.meeting.firm_id
      : null;

    // Item list
    var listHTML = '<ul class="ac-agenda-list">';
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var isFirst = (i === 0);
      var isLast  = (i === items.length - 1);
      var pulledBadge = item.pulled_from_node_id
        ? '<span class="ac-agenda-pulled-badge">\u2190 pulled</span>'
        : '';
      listHTML += (
        '<li class="ac-agenda-item" data-item-id="' + esc(item.agenda_item_id) + '">' +
          '<span class="ac-agenda-item-pos">' + (i + 1) + '</span>' +
          '<span class="ac-agenda-item-title" data-orig="' + esc(item.title) + '">' +
            esc(item.title) +
          '</span>' +
          pulledBadge +
          '<span class="ac-agenda-item-controls">' +
            '<button class="ac-agenda-up" data-action="up" title="Move up"' +
              (isFirst ? ' disabled' : '') + '>\u25b2</button>' +
            '<button class="ac-agenda-down" data-action="down" title="Move down"' +
              (isLast ? ' disabled' : '') + '>\u25bc</button>' +
          '</span>' +
        '</li>'
      );
    }
    listHTML += '</ul>';

    // Add-item row
    var addRow = (
      '<div class="ac-agenda-add-row">' +
        '<input type="text" class="ac-agenda-add-input" placeholder="Add agenda item\u2026" ' +
          'aria-label="New agenda item">' +
        '<button type="button" class="ac-agenda-add-btn" title="Add">+</button>' +
      '</div>'
    );

    // Pull-as-thread row (workstream meetings only)
    var pullRow = workstreamId
      ? '<div class="ac-agenda-pull-row">' +
          '<button type="button" class="ac-agenda-pull-btn">\u2190 Pull from prior meeting</button>' +
        '</div>'
      : '';

    area.innerHTML = listHTML + addRow + pullRow;

    // Wire event delegation
    _wireAgendaEvents(area, items, meeting, workstreamId, firmId);
  }

  // ── Agenda: event delegation ──────────────────────────────────
  function _wireAgendaEvents(area, items, meeting, workstreamId, firmId) {

    // Reorder buttons
    area.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-action="up"],[data-action="down"]');
      if (!btn || btn.disabled) return;
      var row = btn.closest('.ac-agenda-item');
      if (!row) return;
      var itemId = row.dataset.itemId;
      var dir = btn.dataset.action;
      _reorderItem(itemId, dir, items, meeting, workstreamId);
    });

    // Inline title edit — click to activate
    area.addEventListener('click', function (ev) {
      var titleEl = ev.target.closest('.ac-agenda-item-title');
      if (!titleEl || titleEl.contentEditable === 'true') return;
      titleEl.contentEditable = 'true';
      titleEl.focus();
      // Place cursor at end
      var range = document.createRange();
      range.selectNodeContents(titleEl);
      range.collapse(false);
      var sel = window.getSelection();
      if (sel) { sel.removeAllRanges(); sel.addRange(range); }
    });

    // Inline title edit — save on blur
    area.addEventListener('focusout', function (ev) {
      var titleEl = ev.target.closest('.ac-agenda-item-title');
      if (!titleEl || titleEl.contentEditable !== 'true') return;
      titleEl.contentEditable = 'false';
      var newVal = titleEl.textContent.trim();
      var orig   = titleEl.dataset.orig || '';
      if (!newVal || newVal === orig) {
        titleEl.textContent = orig;
        return;
      }
      var row    = titleEl.closest('.ac-agenda-item');
      var itemId = row && row.dataset.itemId;
      if (!itemId) return;
      API.patch('accord_agenda_items?agenda_item_id=eq.' + itemId, { title: newVal })
        .then(function () {
          titleEl.dataset.orig = newVal;
        })
        .catch(function (e) {
          console.error('[AccordMeetingSetup] title PATCH failed', e);
          titleEl.textContent = orig;
        });
    });

    // Inline title edit — keyboard
    area.addEventListener('keydown', function (ev) {
      var titleEl = ev.target.closest('.ac-agenda-item-title');
      if (!titleEl || titleEl.contentEditable !== 'true') return;
      if (ev.key === 'Enter') {
        ev.preventDefault();
        titleEl.blur();
      } else if (ev.key === 'Escape') {
        titleEl.textContent = titleEl.dataset.orig || '';
        titleEl.contentEditable = 'false';
      }
    });

    // Add-item input — Enter key
    area.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter') return;
      var input = ev.target.closest('.ac-agenda-add-input');
      if (!input) return;
      ev.preventDefault();
      _addItem(input, items, meeting, workstreamId, firmId);
    });

    // Add-item button
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
      var nodeId  = nodeRow.dataset.nodeId;
      var summary = nodeRow.dataset.summary;
      if (!nodeId) return;
      _pullNode(nodeId, summary, items, meeting, workstreamId, firmId);
    });
  }

  // ── Agenda: add item ──────────────────────────────────────────
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

  // ── Agenda: reorder ───────────────────────────────────────────
  function _reorderItem(itemId, dir, items, meeting, workstreamId) {
    var idx = -1;
    for (var i = 0; i < items.length; i++) {
      if (items[i].agenda_item_id === itemId) { idx = i; break; }
    }
    if (idx < 0) return;
    var swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= items.length) return;

    var idA  = items[idx].agenda_item_id;
    var posA = items[idx].position;
    var idB  = items[swapIdx].agenda_item_id;
    var posB = items[swapIdx].position;

    // Sequential PATCHes — not Promise.all (shared-state race antipattern)
    API.patch('accord_agenda_items?agenda_item_id=eq.' + idA, { position: posB })
      .then(function () {
        return API.patch('accord_agenda_items?agenda_item_id=eq.' + idB, { position: posA });
      })
      .then(function () {
        return _refreshAgenda(meeting, workstreamId);
      })
      .catch(function (e) {
        console.error('[AccordMeetingSetup] reorder failed', e);
        _refreshAgenda(meeting, workstreamId);
      });
  }

  // ── Agenda: pull picker ───────────────────────────────────────
  function _openPullPicker(area, items, meeting, workstreamId, firmId) {
    var pullRow = area.querySelector('.ac-agenda-pull-row');
    if (!pullRow) return;
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
        if (panel) {
          panel.querySelector('.ac-agenda-pull-empty').textContent =
            'No prior meetings in this workstream.';
        }
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
        nodes = nodes || [];
        var panel = pullRow.querySelector('.ac-agenda-pull-panel');
        if (!panel) return;
        if (!nodes.length) {
          panel.querySelector('.ac-agenda-pull-empty').textContent =
            'No action, decision, or dissent nodes in prior meetings.';
          return;
        }
        var listHTML = '';
        for (var i = 0; i < nodes.length; i++) {
          var n = nodes[i];
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
              'data-summary="' + esc(n.summary) + '">' +
              '<span class="ac-agenda-pull-tag" data-tag="' + esc(n.tag) + '">' +
                esc(n.tag.toUpperCase()) +
              '</span>' +
              '<span class="ac-agenda-pull-text">' + esc(truncate(n.summary, 120)) + '</span>' +
              '<span class="ac-agenda-pull-meta">' +
                esc(mtg.title || '') + (dateStr ? ' \u00b7 ' + dateStr : '') +
              '</span>' +
            '</div>'
          );
        }
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

  // ── Agenda: pull node → insert ────────────────────────────────
  function _pullNode(nodeId, summary, items, meeting, workstreamId, firmId) {
    var useFirmId = firmId ||
      (window.Accord && window.Accord.state && window.Accord.state.meeting &&
       window.Accord.state.meeting.firm_id);
    var area = document.getElementById('ac-setup-agenda-area');
    _closePullPicker(area, workstreamId);
    _fetchMaxPosition(meeting.meeting_id).then(function (maxPos) {
      return API.post('accord_agenda_items', {
        firm_id:              useFirmId,
        meeting_id:           meeting.meeting_id,
        title:                summary,
        position:             maxPos + 1,
        status:               'pending',
        pulled_from_node_id:  nodeId
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

  // ── Agenda: refresh (re-fetch + re-paint) ─────────────────────
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

  // ── Agenda: initial render ────────────────────────────────────
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

  // ── render ────────────────────────────────────────────────────
  function render(host, meeting, workstreamId) {
    if (!host) return;
    teardown();
    _currentMeetingId = meeting.meeting_id;
    _agendaFetchAborted = false;
    window._accordDetachSurfaceHost = _detachHandler;

    host.innerHTML = _buildHTML(meeting, workstreamId);

    // Breadcrumb async resolve
    if (workstreamId) {
      _resolveWorkstreamName(workstreamId, host.querySelector('#ac-setup-crumb-ws'));
    }

    // Briefing autosave
    var textarea = host.querySelector('#ac-setup-briefing-text');
    if (textarea) _wireBriefingAutosave(textarea, meeting.meeting_id);

    // Begin Meeting
    var beginBtn = host.querySelector('#ac-setup-begin-btn');
    if (beginBtn) {
      beginBtn.addEventListener('click', function () {
        _beginMeeting(meeting, workstreamId, beginBtn);
      });
    }

    // Agenda
    _renderAgenda(meeting, workstreamId);
  }

  // ── Expose ────────────────────────────────────────────────────
  window.AccordMeetingSetup = { render: render, teardown: teardown };

})();