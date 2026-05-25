// ============================================================
// ProjectHUD — accord-knowledge-base.js
// CMD-ACCORD-KNOWLEDGE-BASE-1 · Phase 4
// Flat filter views: Decisions, Action Items, Risks, Notes.
//
// Public API:
//   AccordKnowledgeBase.render(workstreamId, host)
//   AccordKnowledgeBase.destroy()
//   AccordKnowledgeBase._activeTab  — 'meetings' (default) | 'kb'
// ============================================================

(function () {
  'use strict';

  var API = window.API;

  // ── Collapse state (persists within session across re-renders) ──
  var _discCollapsed  = {};  // { disciplineKey: true|false }
  var _topicCollapsed = {};  // { 'disciplineKey::topicKey': true|false }

  // ── Cached data for collapse re-renders ────────────────────
  var _lastNodes    = [];
  var _lastMeetings = [];
  var _lastNameMap  = {};

  // ── Discipline colors ───────────────────────────────────────
  var DISC_COLORS = {
    'Electrical Engineering': 'var(--dec)',
    'Mechanical Engineering': 'var(--act)',
    'Software Integration':   'var(--nt)',
    'Vendor Management':      'var(--dcn)',
    '__ungrouped__':          'var(--b2)'
  };

  var DISC_BORDER_COLORS = {
    'Electrical Engineering': 'rgba(74,140,245,.40)',
    'Mechanical Engineering': 'rgba(232,148,48,.40)',
    'Software Integration':   'rgba(72,170,136,.40)',
    'Vendor Management':      'rgba(139,110,245,.40)',
    '__ungrouped__':          'rgba(255,255,255,.12)'
  };

  // ── Tag badge colors / labels ───────────────────────────────
  var TAG_COLORS = {
    decision: { color:'var(--dcn)', bg:'var(--dcn-bg)', bd:'var(--dcn-bd)' },
    note:     { color:'var(--nt)',  bg:'var(--nt-bg)',  bd:'var(--nt-bd)'  },
    action:   { color:'var(--act)', bg:'var(--act-bg)', bd:'var(--act-bd)' },
    risk:     { color:'var(--rsk)', bg:'var(--rsk-bg)', bd:'var(--rsk-bd)' },
    dissent:  { color:'var(--rsk)', bg:'var(--rsk-bg)', bd:'var(--rsk-bd)' },
    question: { color:'var(--dcn)', bg:'var(--dcn-bg)', bd:'var(--dcn-bd)' }
  };

  var TAG_LABELS = {
    decision: 'DC', note: 'NT', action: 'AX',
    risk: 'RK', dissent: 'DS', question: 'Q'
  };

  // ── CSS injection (once per page load) ─────────────────────
  (function _injectStyles() {
    if (document.getElementById('ac-kb-styles')) return;
    var s = document.createElement('style');
    s.id = 'ac-kb-styles';
    s.textContent = [
      /* ── Workstream-level tab bar ── */
      '.ac-ws-tabs{display:flex;align-items:stretch;' +
        'background:var(--surface,#10131e);' +
        'border-bottom:2px solid var(--b0,#1e2438);' +
        'padding:0 22px;flex-shrink:0}',
      '.ac-ws-tab{font-family:"Outfit",system-ui,sans-serif;' +
        'font-size:13px;font-weight:600;padding:10px 18px;' +
        'cursor:pointer;color:var(--md,#8899b2);' +
        'border-bottom:2px solid transparent;margin-bottom:-2px;' +
        'transition:color .13s,border-color .13s;user-select:none}',
      '.ac-ws-tab:hover{color:var(--hi,#dce6f5)}',
      '.ac-ws-tab.active{color:var(--hi,#dce6f5);' +
        'border-bottom-color:var(--dec,#4a8cf5)}',

      /* ── Workstream view layout ── */
      '.ac-view-workstream{display:flex;flex-direction:column;overflow:hidden}',

      /* ── KB shell container ── */
      '.ac-kb-shell{' +
        '--void:#0b0d14;--surface:#10131e;--raised:#171c2e;--hover:#1d2338;' +
        '--b0:#1e2438;--b1:#252d44;--b2:#313d5e;' +
        '--hi:#dce6f5;--md:#8899b2;--lo:#7a8a9a;' +
        '--dec:#4a8cf5;--dec-bg:rgba(74,140,245,.09);--dec-bd:rgba(74,140,245,.24);' +
        '--dcn:#8b6ef5;--dcn-bg:rgba(139,110,245,.09);--dcn-bd:rgba(139,110,245,.24);' +
        '--act:#e89430;--act-bg:rgba(232,148,48,.08);--act-bd:rgba(232,148,48,.24);' +
        '--rsk:#e05252;--rsk-bg:rgba(224,82,82,.09);--rsk-bd:rgba(224,82,82,.24);' +
        '--nt:#48aa88;--nt-bg:rgba(72,170,136,.08);--nt-bd:rgba(72,170,136,.22);' +
        'font-family:"Outfit",system-ui,sans-serif;' +
        'display:flex;flex-direction:column;flex:1;overflow:hidden;min-height:0;' +
        'background:var(--void)}',

      /* ── Header ── */
      '.ac-kb-header{padding:22px 28px 18px;' +
        'border-bottom:1px solid var(--b0);flex-shrink:0}',
      '.ac-kb-ws-name{font-size:20px;font-weight:600;color:var(--hi);' +
        'margin:0 0 4px;line-height:1.2}',
      '.ac-kb-subtitle{font-size:12px;color:var(--lo);margin:0 0 16px;line-height:1.5}',
      '.ac-kb-stats{display:flex;gap:12px;flex-wrap:wrap}',
      '.ac-kb-stat{display:flex;flex-direction:column;gap:3px;' +
        'padding:8px 16px;background:var(--raised);' +
        'border-radius:6px;border:1px solid var(--b1);min-width:90px}',
      '.ac-kb-stat-val{font-size:22px;font-weight:700;line-height:1;color:var(--hi)}',
      '.ac-kb-stat-lbl{font-size:11px;color:var(--lo);white-space:nowrap}',
      '.ac-kb-stat--dec .ac-kb-stat-val{color:var(--dec)}',
      '.ac-kb-stat--act .ac-kb-stat-val{color:var(--act)}',
      '.ac-kb-stat--rsk .ac-kb-stat-val{color:var(--rsk)}',
      '.ac-kb-stat--nt  .ac-kb-stat-val{color:var(--nt)}',

      /* ── Filter bar ── */
      '.ac-kb-filter-bar{display:flex;align-items:center;gap:10px;' +
        'padding:10px 28px;border-bottom:1px solid var(--b0);' +
        'flex-shrink:0;flex-wrap:wrap}',
      '.ac-kb-filter-label{font-size:10px;font-weight:700;letter-spacing:.08em;' +
        'color:var(--lo);text-transform:uppercase;flex-shrink:0}',
      '.ac-kb-pills{display:flex;gap:4px;flex:1;flex-wrap:wrap}',
      '.ac-kb-pill{font-size:12px;font-weight:600;padding:5px 13px;border-radius:20px;' +
        'cursor:pointer;color:var(--md);border:1px solid transparent;' +
        'transition:color .13s,border-color .13s;user-select:none}',
      '.ac-kb-pill.active[data-pill="all"]{color:var(--dec);border-color:var(--dec-bd)}',
      '.ac-kb-pill.active[data-pill="decisions"]{color:var(--dcn);border-color:var(--dcn-bd)}',
      '.ac-kb-pill.active[data-pill="actions"]{color:var(--act);border-color:var(--act-bd)}',
      '.ac-kb-pill.active[data-pill="risks"]{color:var(--rsk);border-color:var(--rsk-bd)}',
      '.ac-kb-pill.active[data-pill="notes"]{color:var(--nt);border-color:var(--nt-bd)}',
      '.ac-kb-mtg-filter{font-size:12px;color:var(--lo);padding:5px 10px;' +
        'border:1px solid var(--b1);border-radius:4px;cursor:default;' +
        'margin-left:auto;white-space:nowrap;flex-shrink:0}',

      /* ── Canvas ── */
      '.ac-kb-canvas{flex:1;overflow-y:auto;padding:22px 28px}',
      '.ac-kb-placeholder{font-size:13px;color:var(--lo);' +
        'padding:40px 0;text-align:center}',

      /* ── Discipline block ── */
      '.ac-kb-disc-block{border:1px solid var(--b0);border-radius:7px;' +
        'overflow:hidden;margin-bottom:12px}',
      '.ac-kb-disc-row{display:flex;align-items:center;gap:10px;' +
        'padding:11px 20px 11px 16px;background:var(--surface);' +
        'cursor:pointer;user-select:none;' +
        'border-bottom:1px solid var(--b0);' +
        'transition:background .12s;' +
        'position:sticky;top:0;z-index:5}',
      '.ac-kb-disc-row:hover{background:var(--hover)}',
      '.ac-kb-disc-name{font-size:14px;font-weight:600;color:var(--hi);flex:1}',
      '.ac-kb-disc-chip{font-size:11px;padding:2px 9px;border-radius:10px;' +
        'background:var(--raised);color:var(--lo);border:1px solid var(--b0)}',
      '.ac-kb-disc-chevron{font-size:10px;color:var(--md);flex-shrink:0;' +
        'transition:transform .2s;display:inline-block}',
      '.ac-kb-disc-chevron.collapsed{transform:rotate(-90deg)}',

      /* ── Topic row ── */
      '.ac-kb-topic-row{display:flex;align-items:center;gap:10px;' +
        'padding:8px 28px 8px 20px;' +
        'cursor:pointer;user-select:none;' +
        'border-left:3px solid transparent;' +
        'transition:background .12s,border-color .12s;' +
        'border-bottom:1px solid rgba(255,255,255,.04)}',
      '.ac-kb-topic-row:hover{background:var(--raised);border-left-color:var(--b2)}',
      '.ac-kb-topic-name{font-size:13px;font-weight:600;color:var(--hi);flex:1}',
      '.ac-kb-topic-meta{font-size:11px;color:var(--lo)}',
      '.ac-kb-topic-chevron{font-size:9px;color:var(--md);flex-shrink:0;' +
        'transition:transform .2s;display:inline-block}',
      '.ac-kb-topic-chevron.collapsed{transform:rotate(-90deg)}',

      /* ── Entry list ── */
      '.ac-kb-entry-list{padding:4px 28px 10px 50px;' +
        'margin-left:24px;border-radius:6px 0 0 6px}',
      '.ac-kb-entry{display:flex;align-items:flex-start;gap:10px;' +
        'padding:7px 0;border-bottom:1px solid rgba(255,255,255,.04)}',
      '.ac-kb-entry:last-child{border-bottom:none}',
      '.ac-kb-entry-date{font-size:12px;color:var(--md);flex-shrink:0;' +
        'min-width:48px;padding-top:2px;white-space:nowrap}',
      '.ac-kb-entry-badge{font-size:10px;font-weight:700;' +
        'padding:0 5px;border-radius:2px;border:1px solid;' +
        'white-space:nowrap;margin-top:2px;line-height:1.4;flex-shrink:0}',
      '.ac-kb-entry-body{flex:1;min-width:0}',
      '.ac-kb-entry-text{font-size:13px;color:var(--hi);line-height:1.5}',
      '.ac-kb-entry-meta{display:flex;align-items:center;gap:8px;margin-top:3px}',
      '.ac-kb-entry-author{font-size:11px;color:var(--lo)}',
      '.ac-kb-entry-mtg{font-size:11px;color:var(--lo);' +
        'padding:1px 7px;border-radius:10px;' +
        'background:rgba(255,255,255,.04);border:1px solid var(--b0)}',

      /* ── Status bar ── */
      '.ac-kb-status-bar{display:flex;align-items:center;gap:12px;' +
        'padding:10px 22px;border-top:1px solid var(--b0);' +
        'background:var(--surface);flex-shrink:0}',
      '.ac-kb-status-label{font-size:10px;font-weight:700;letter-spacing:.08em;' +
        'color:var(--lo);text-transform:uppercase;flex-shrink:0}',
      '.ac-kb-chips{display:flex;gap:8px;overflow-x:auto;flex:1;padding-bottom:2px}',
      '.ac-kb-chips::-webkit-scrollbar{height:3px}',
      '.ac-kb-chips::-webkit-scrollbar-track{background:transparent}',
      '.ac-kb-chips::-webkit-scrollbar-thumb{background:var(--b2);border-radius:2px}',
      '.ac-kb-chip{font-size:11px;padding:4px 10px;border-radius:4px;' +
        'white-space:nowrap;flex-shrink:0;' +
        'border:1px solid var(--b0);background:var(--raised);color:var(--md)}',
      '.ac-kb-chip--active{border-color:var(--dec-bd);color:var(--dec);' +
        'background:var(--dec-bg)}',

      /* ── Flat filter views ── */
      '.ac-kb-flat-sec{font-size:11px;font-weight:700;letter-spacing:.10em;' +
        'text-transform:uppercase;color:var(--lo);' +
        'padding:14px 0 6px;display:flex;align-items:center;gap:10px}',
      '.ac-kb-flat-sec::after{content:"";flex:1;height:1px;background:var(--b0)}',
      '.ac-kb-flat-list{display:flex;flex-direction:column;gap:6px;margin-bottom:4px}',
      '.ac-kb-flat-entry{display:flex;align-items:flex-start;gap:12px;' +
        'padding:10px 14px;background:var(--raised);border:1px solid var(--b0);' +
        'border-left:3px solid var(--b2);border-radius:6px;transition:border-color .12s}',
      '.ac-kb-flat-entry:hover{border-color:var(--b1)}',
      '.ac-kb-flat-entry--dc{border-left-color:var(--dcn)}',
      '.ac-kb-flat-entry--ax{border-left-color:var(--act)}',
      '.ac-kb-flat-entry--rk{border-left-color:var(--rsk)}',
      '.ac-kb-flat-body{flex:1;min-width:0}',
      '.ac-kb-flat-text{font-size:13px;color:var(--hi);line-height:1.5}',
      '.ac-kb-flat-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:5px}',
      '.ac-kb-flat-author{font-size:11px;color:var(--lo)}',
      '.ac-kb-flat-date{font-size:11px;color:var(--lo)}',
      '.ac-kb-flat-mtg{font-size:11px;color:var(--lo);padding:1px 7px;border-radius:10px;' +
        'background:rgba(255,255,255,.04);border:1px solid var(--b0)}',
      '.ac-kb-flat-status{font-size:11px;font-weight:600}',
      '.ac-kb-flat-status--open{color:var(--act)}',
      '.ac-kb-flat-status--done{color:var(--nt)}',
      '.ac-kb-flat-status--over{color:var(--rsk)}',
      '.ac-kb-flat-severity{font-size:11px;font-weight:600;padding:1px 7px;border-radius:10px;border:1px solid}',
      '.ac-kb-flat-severity--low,.ac-kb-flat-severity--medium{color:var(--act);border-color:var(--act-bd);background:var(--act-bg)}',
      '.ac-kb-flat-severity--high{color:var(--rsk);border-color:var(--rsk-bd);background:var(--rsk-bg)}',
    ].join('');
    document.head.appendChild(s);
    console.log('%c[accord-knowledge-base.js] v20260519-CMD-ACCORD-KNOWLEDGE-BASE-1-P4 styles injected',
      'background:#e89430;color:#fff;padding:2px 6px;border-radius:3px;font-weight:600');
  })();

  // ── Helpers ────────────────────────────────────────────────
  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _fmtDate(iso) {
    if (!iso) return '\u2014';
    return new Date(iso).toLocaleDateString([], {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  }

  function _fmtShortDate(iso) {
    if (!iso) return '\u2014';
    var d   = new Date(iso);
    var now = new Date();
    if (d.getFullYear() !== now.getFullYear()) {
      return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function _fmtDateRange(firstIso, lastIso) {
    if (!firstIso) return '';
    if (!lastIso || firstIso === lastIso) return _fmtDate(firstIso);
    var a = new Date(firstIso);
    var b = new Date(lastIso);
    if (a.getFullYear() === b.getFullYear()) {
      var aMon  = a.toLocaleDateString([], { month: 'short', day: 'numeric' });
      var bFull = b.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      return aMon + ' \u2013 ' + bFull;
    }
    return _fmtDate(firstIso) + ' \u2013 ' + _fmtDate(lastIso);
  }

  function _discColor(dk) {
    return DISC_COLORS[dk] || 'var(--md)';
  }

  function _discBorderColor(dk) {
    return DISC_BORDER_COLORS[dk] || 'rgba(136,153,178,.40)';
  }

  // ── Grouping ───────────────────────────────────────────────
  function _groupNodes(nodes) {
    var map = {};
    for (var i = 0; i < nodes.length; i++) {
      var n  = nodes[i];
      var dk = (n.discipline && n.discipline.length) ? n.discipline : '__ungrouped__';
      var tk = (n.topic      && n.topic.length)      ? n.topic      : '__ungrouped__';

      if (!map[dk]) {
        map[dk] = { label: dk === '__ungrouped__' ? 'Ungrouped' : dk, topics: {} };
      }
      if (!map[dk].topics[tk]) {
        map[dk].topics[tk] = { label: tk === '__ungrouped__' ? 'Ungrouped' : tk, entries: [] };
      }
      map[dk].topics[tk].entries.push(n);
    }
    return map;
  }

  function _sortedKeys(map, ungroupedKey) {
    var keys = Object.keys(map);
    keys.sort(function (a, b) {
      if (a === ungroupedKey) return 1;
      if (b === ungroupedKey) return -1;
      return a.localeCompare(b);
    });
    return keys;
  }

  // ── Entry HTML ─────────────────────────────────────────────
  function _entryHtml(n, nameMap, mtgTitleMap) {
    var tc  = TAG_COLORS[n.tag] || TAG_COLORS.note;
    var lbl = n.seq_id || TAG_LABELS[n.tag] || (n.tag ? n.tag.toUpperCase().slice(0, 2) : 'NT');
    var badgeStyle = 'color:' + tc.color + ';background:' + tc.bg + ';border-color:' + tc.bd;

    var dateStr = _fmtShortDate(n.created_at);

    var authorTxt = '';
    if (n.created_by) {
      authorTxt = nameMap[n.created_by] || (String(n.created_by).slice(0, 8) + '\u2026');
    }

    var mtgTitle = '';
    if (n.meeting_id && mtgTitleMap[n.meeting_id]) {
      mtgTitle = mtgTitleMap[n.meeting_id];
      if (mtgTitle.length > 28) mtgTitle = mtgTitle.slice(0, 25) + '\u2026';
    }

    var h = '';
    h += '<div class="ac-kb-entry">';
    h +=   '<span class="ac-kb-entry-date">' + _esc(dateStr) + '</span>';
    h +=   '<span class="ac-kb-entry-badge" style="' + badgeStyle + '">' + _esc(lbl) + '</span>';
    h +=   '<div class="ac-kb-entry-body">';
    h +=     '<div class="ac-kb-entry-text">' + _esc(n.summary || '(no summary)') + '</div>';
    h +=     '<div class="ac-kb-entry-meta">';
    if (authorTxt) h += '<span class="ac-kb-entry-author">' + _esc(authorTxt) + '</span>';
    if (mtgTitle)  h += '<span class="ac-kb-entry-mtg">'    + _esc(mtgTitle)  + '</span>';
    h +=     '</div>';
    h +=   '</div>';
    h += '</div>';
    return h;
  }

  // ── Filter state ────────────────────────────────────────────
  var _activeFilter = 'all';

  // ── Flat entry HTML ─────────────────────────────────────────
  function _flatEntryHtml(n, typeClass, badgeStyle, badgeLbl, meta) {
    var h = '';
    h += '<div class="ac-kb-flat-entry ac-kb-flat-entry--' + typeClass + '">';
    h +=   '<span class="ac-kb-entry-badge" style="' + badgeStyle + '">' + _esc(badgeLbl) + '</span>';
    h +=   '<div class="ac-kb-flat-body">';
    h +=     '<div class="ac-kb-flat-text">' + _esc(n.summary || '(no summary)') + '</div>';
    h +=     '<div class="ac-kb-flat-meta">' + meta + '</div>';
    h +=   '</div>';
    h += '</div>';
    return h;
  }

  function _mtgChipHtml(meetingId, mtgTitleMap) {
    if (!meetingId || !mtgTitleMap[meetingId]) return '';
    var t = mtgTitleMap[meetingId];
    if (t.length > 28) t = t.slice(0, 25) + '\u2026';
    return '<span class="ac-kb-flat-mtg">' + _esc(t) + '</span>';
  }

  function _authorHtml(n, nameMap) {
    if (!n.created_by) return '';
    var name = nameMap[n.created_by] || (String(n.created_by).slice(0, 8) + '\u2026');
    return '<span class="ac-kb-flat-author">' + _esc(name) + '</span>';
  }

  function _flatSectionHtml(label, entries, rowFn) {
    if (!entries.length) return '';
    var h = '';
    h += '<div class="ac-kb-flat-sec">' + _esc(label) + '</div>';
    h += '<div class="ac-kb-flat-list">';
    for (var i = 0; i < entries.length; i++) h += rowFn(entries[i]);
    h += '</div>';
    return h;
  }

  // ── Decisions flat view ─────────────────────────────────────
  function _decisionsHtml(nodes, nameMap, mtgTitleMap) {
    var decisions = [];
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].tag === 'decision') decisions.push(nodes[i]);
    }
    if (!decisions.length) {
      return '<div class="ac-kb-placeholder">No decisions recorded yet.</div>';
    }
    var tc = TAG_COLORS.decision;
    var bs = 'color:' + tc.color + ';background:' + tc.bg + ';border-color:' + tc.bd;
    return _flatSectionHtml('Recorded', decisions, function (n) {
      var meta = '';
      meta += _authorHtml(n, nameMap);
      meta += '<span class="ac-kb-flat-date">' + _esc(_fmtShortDate(n.created_at)) + '</span>';
      meta += _mtgChipHtml(n.meeting_id, mtgTitleMap);
      return _flatEntryHtml(n, 'dc', bs, n.seq_id || 'DC', meta);
    });
  }

  // ── Action Items flat view ──────────────────────────────────
  function _actionsHtml(nodes, nameMap, mtgTitleMap) {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var overdue = [], open = [], closed = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.tag !== 'action') continue;
      if (n.status === 'committed') {
        closed.push(n);
      } else if (n.due_date && new Date(n.due_date) < today) {
        overdue.push(n);
      } else {
        open.push(n);
      }
    }
    if (!overdue.length && !open.length && !closed.length) {
      return '<div class="ac-kb-placeholder">No action items recorded yet.</div>';
    }
    var tc = TAG_COLORS.action;
    var bs = 'color:' + tc.color + ';background:' + tc.bg + ';border-color:' + tc.bd;

    function _axRow(n, statusLabel, statusCls, dueCls) {
      var body = {};
      try { body = JSON.parse(n.body || '{}'); } catch (e) {}
      var assignee = body.assignee_name || '\u2014';
      var dueStr = n.due_date ? _fmtShortDate(n.due_date) : '';
      var meta = '';
      meta += '<span class="ac-kb-flat-author">' + _esc(assignee) + '</span>';
      if (dueStr) {
        meta += '<span class="ac-kb-flat-date" style="color:' + dueCls + '">' + _esc(dueStr) + '</span>';
      }
      meta += _mtgChipHtml(n.meeting_id, mtgTitleMap);
      meta += '<span class="ac-kb-flat-status ac-kb-flat-status--' + statusCls + '">' +
              _esc(statusLabel) + '</span>';
      return _flatEntryHtml(n, 'ax', bs, n.seq_id || 'AX', meta);
    }

    var html = '';
    html += _flatSectionHtml('Overdue', overdue, function (n) {
      return _axRow(n, 'Overdue', 'over', 'var(--rsk)');
    });
    html += _flatSectionHtml('Open', open, function (n) {
      return _axRow(n, 'Open', 'open', n.due_date ? 'var(--act)' : 'var(--lo)');
    });
    html += _flatSectionHtml('Closed', closed, function (n) {
      return _axRow(n, 'Done', 'done', 'var(--lo)');
    });
    return html;
  }

  // ── Risks flat view ─────────────────────────────────────────
  function _risksHtml(nodes, nameMap, mtgTitleMap) {
    var open = [], mitigated = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.tag !== 'risk' && n.tag !== 'dissent') continue;
      if (n.status === 'committed') {
        mitigated.push(n);
      } else {
        open.push(n);
      }
    }
    if (!open.length && !mitigated.length) {
      return '<div class="ac-kb-placeholder">No risks recorded yet.</div>';
    }
    var tc = TAG_COLORS.risk;
    var bs = 'color:' + tc.color + ';background:' + tc.bg + ';border-color:' + tc.bd;

    function _rkRow(n) {
      var body = {};
      try { body = JSON.parse(n.body || '{}'); } catch (e) {}
      var severity = body.severity ? String(body.severity).toLowerCase() : null;
      var lbl = n.seq_id || (n.tag === 'dissent' ? 'DS' : 'RK');
      var meta = '';
      if (severity) {
        meta += '<span class="ac-kb-flat-severity ac-kb-flat-severity--' + _esc(severity) + '">' +
                _esc(severity.charAt(0).toUpperCase() + severity.slice(1)) + '</span>';
      }
      meta += _authorHtml(n, nameMap);
      meta += _mtgChipHtml(n.meeting_id, mtgTitleMap);
      return _flatEntryHtml(n, 'rk', bs, lbl, meta);
    }

    var html = '';
    html += _flatSectionHtml('Open',      open,      _rkRow);
    html += _flatSectionHtml('Mitigated', mitigated, _rkRow);
    return html;
  }

  // ── _setFilter ──────────────────────────────────────────────
  function _setFilter(type) {
    _activeFilter = type;

    var pills = document.querySelectorAll('#ac-kb-shell .ac-kb-pill');
    for (var pi = 0; pi < pills.length; pi++) {
      pills[pi].classList.toggle('active', pills[pi].getAttribute('data-pill') === type);
    }

    var canvas = document.getElementById('ac-kb-canvas');
    if (!canvas) return;

    var mtgTitleMap = {};
    for (var mi = 0; mi < _lastMeetings.length; mi++) {
      mtgTitleMap[_lastMeetings[mi].meeting_id] = _lastMeetings[mi].title || '(untitled)';
    }

    if (type === 'all') {
      canvas.innerHTML = _canvasHtml(_lastNodes, _lastMeetings, _lastNameMap);
      _wireCanvas(canvas);
    } else if (type === 'notes') {
      var noteNodes = [];
      for (var ni = 0; ni < _lastNodes.length; ni++) {
        if (_lastNodes[ni].tag === 'note') noteNodes.push(_lastNodes[ni]);
      }
      canvas.innerHTML = _canvasHtml(noteNodes, _lastMeetings, _lastNameMap);
      _wireCanvas(canvas);
    } else if (type === 'decisions') {
      canvas.innerHTML = _decisionsHtml(_lastNodes, _lastNameMap, mtgTitleMap);
    } else if (type === 'actions') {
      canvas.innerHTML = _actionsHtml(_lastNodes, _lastNameMap, mtgTitleMap);
    } else if (type === 'risks') {
      canvas.innerHTML = _risksHtml(_lastNodes, _lastNameMap, mtgTitleMap);
    }
  }

  // ── Canvas HTML ────────────────────────────────────────────
  function _canvasHtml(nodes, meetings, nameMap) {
    if (!nodes.length) {
      return '<div class="ac-kb-placeholder">No captured nodes in this workstream yet.</div>';
    }

    var groupMap  = _groupNodes(nodes);
    var discKeys  = _sortedKeys(groupMap, '__ungrouped__');

    var mtgTitleMap = {};
    for (var mi = 0; mi < meetings.length; mi++) {
      mtgTitleMap[meetings[mi].meeting_id] = meetings[mi].title || '(untitled)';
    }

    var html = '';

    for (var di = 0; di < discKeys.length; di++) {
      var dk   = discKeys[di];
      var disc = groupMap[dk];
      var dCollapsed = !!_discCollapsed[dk];
      var topicKeys  = _sortedKeys(disc.topics, '__ungrouped__');

      // Aggregate counts and latest date
      var totalEntries = 0;
      var latestEntry  = null;
      for (var ti2 = 0; ti2 < topicKeys.length; ti2++) {
        var ents2 = disc.topics[topicKeys[ti2]].entries;
        totalEntries += ents2.length;
        for (var ei3 = 0; ei3 < ents2.length; ei3++) {
          if (!latestEntry || ents2[ei3].created_at > latestEntry) latestEntry = ents2[ei3].created_at;
        }
      }

      html += '<div class="ac-kb-disc-block">';

      // Disc header
      html += '<div class="ac-kb-disc-row" data-action="toggle-disc" data-disc="' + _esc(dk) + '"' +
              ' style="border-left:4px solid ' + _discColor(dk) + '">';
      html += '<span class="ac-kb-disc-chevron' + (dCollapsed ? ' collapsed' : '') + '">&#9660;</span>';
      html += '<span class="ac-kb-disc-name">' + _esc(disc.label) + '</span>';
      html += '<span class="ac-kb-disc-chip">' + topicKeys.length + ' topic' +
              (topicKeys.length === 1 ? '' : 's') + '</span>';
      html += '<span class="ac-kb-disc-chip">' + totalEntries + ' entr' +
              (totalEntries === 1 ? 'y' : 'ies') + '</span>';
      if (latestEntry) {
        html += '<span class="ac-kb-disc-chip">last: ' + _esc(_fmtShortDate(latestEntry)) + '</span>';
      }
      html += '</div>';

      if (!dCollapsed) {
        html += '<div class="ac-kb-disc-body">';

        for (var ti = 0; ti < topicKeys.length; ti++) {
          var tk    = topicKeys[ti];
          var topic = disc.topics[tk];
          var tKey  = dk + '::' + tk;
          var tCollapsed = !!_topicCollapsed[tKey];

          var latestTopic  = null;
          var topicMtgIds  = {};
          for (var tei = 0; tei < topic.entries.length; tei++) {
            var te = topic.entries[tei];
            if (!latestTopic || te.created_at > latestTopic) latestTopic = te.created_at;
            if (te.meeting_id) topicMtgIds[te.meeting_id] = true;
          }
          var topicMtgCount = Object.keys(topicMtgIds).length;

          // When both discipline and topic are null, skip the topic row entirely
          // and render entries directly in the discipline block.
          var skipTopicRow = (dk === '__ungrouped__' && tk === '__ungrouped__');

          if (!skipTopicRow) {
            html += '<div class="ac-kb-topic-row" data-action="toggle-topic"' +
                    ' data-disc="' + _esc(dk) + '" data-topic="' + _esc(tk) + '">';
            html += '<span class="ac-kb-topic-chevron' + (tCollapsed ? ' collapsed' : '') + '">&#9660;</span>';
            html += '<span class="ac-kb-topic-name">' + _esc(topic.label) + '</span>';
            html += '<span class="ac-kb-topic-meta">' + topic.entries.length +
                    ' entr' + (topic.entries.length === 1 ? 'y' : 'ies') + '</span>';
            if (latestTopic) {
              html += '<span class="ac-kb-topic-meta">\u00b7 last: ' + _esc(_fmtShortDate(latestTopic)) + '</span>';
            }
            html += '<span class="ac-kb-topic-meta">\u00b7 ' + topicMtgCount +
                    ' mtg' + (topicMtgCount === 1 ? '' : 's') + '</span>';
            html += '</div>';
          }

          if (skipTopicRow || !tCollapsed) {
            html += '<div class="ac-kb-entry-list"' +
                    ' style="border-left:3px solid ' + _discBorderColor(dk) + '">';
            for (var ei2 = 0; ei2 < topic.entries.length; ei2++) {
              html += _entryHtml(topic.entries[ei2], nameMap, mtgTitleMap);
            }
            html += '</div>';
          }
        }

        html += '</div>'; // .ac-kb-disc-body
      }

      html += '</div>'; // .ac-kb-disc-block
    }

    return html;
  }

  // ── Canvas event delegation ─────────────────────────────────
  function _wireCanvas(canvasEl) {
    canvasEl.addEventListener('click', function (e) {
      var discRow  = e.target.closest('[data-action="toggle-disc"]');
      var topicRow = e.target.closest('[data-action="toggle-topic"]');

      if (discRow) {
        var dk = discRow.getAttribute('data-disc');
        _discCollapsed[dk] = !_discCollapsed[dk];
        canvasEl.innerHTML = _canvasHtml(_lastNodes, _lastMeetings, _lastNameMap);
        return;
      }
      if (topicRow) {
        var tdk = topicRow.getAttribute('data-disc');
        var tk  = topicRow.getAttribute('data-topic');
        _topicCollapsed[tdk + '::' + tk] = !_topicCollapsed[tdk + '::' + tk];
        canvasEl.innerHTML = _canvasHtml(_lastNodes, _lastMeetings, _lastNameMap);
      }
    });
  }

  // ── Render ─────────────────────────────────────────────────
  function render(workstreamId, host) {
    destroy();

    var titleEl = host ? host.querySelector('.ac-view-title') : null;
    var wsName  = titleEl ? titleEl.textContent.trim() : 'Workstream';

    var viewEl = host.querySelector('.ac-view-workstream') || host;
    var shell  = document.createElement('div');
    shell.id   = 'ac-kb-shell';
    shell.className = 'ac-kb-shell';
    viewEl.appendChild(shell);
    shell.innerHTML = '<div class="ac-kb-placeholder">Loading knowledge base\u2026</div>';

    API.get(
      'accord_meetings' +
      '?workstream_id=eq.' + workstreamId +
      '&state=in.(closed,sealed)' +
      '&select=meeting_id,title,scheduled_for,state,sealed_at' +
      '&order=scheduled_for.asc'
    ).then(function (meetings) {
      meetings = Array.isArray(meetings) ? meetings : [];

      if (!meetings.length) {
        _renderContent(shell, wsName, [], [], {});
        return;
      }

      var ids = meetings.map(function (m) { return m.meeting_id; }).join(',');

      return API.get(
        'accord_nodes' +
        '?meeting_id=in.(' + ids + ')' +
        '&select=node_id,seq_id,tag,summary,discipline,topic,' +
        'created_by,created_at,meeting_id,due_date,status,body' +
        '&order=created_at.asc'
      ).then(function (nodes) {
        nodes = Array.isArray(nodes) ? nodes : [];
        nodes = nodes.filter(function (n) { return n.status !== 'deleted'; });

        // Collect unique created_by values
        var byIds = {};
        for (var i = 0; i < nodes.length; i++) {
          if (nodes[i].created_by) byIds[nodes[i].created_by] = true;
        }
        var byIdList = Object.keys(byIds);

        if (!byIdList.length) {
          _renderContent(shell, wsName, meetings, nodes, {});
          return;
        }

        // IR47 — attempt resources?user_id=in.(...).
        // Falls back to truncated ID if column absent (400 from Supabase).
        return API.get(
          'resources?user_id=in.(' + byIdList.join(',') + ')&select=user_id,name'
        ).then(function (resources) {
          var nameMap = {};
          if (Array.isArray(resources)) {
            for (var ri = 0; ri < resources.length; ri++) {
              if (resources[ri].user_id) nameMap[resources[ri].user_id] = resources[ri].name || '';
            }
          }
          _renderContent(shell, wsName, meetings, nodes, nameMap);
        }).catch(function () {
          console.warn('[AccordKB] IR47: resources.user_id query failed — showing truncated IDs for authors');
          _renderContent(shell, wsName, meetings, nodes, {});
        });
      });

    }).catch(function (e) {
      console.error('[AccordKB] load failed', e);
      if (document.getElementById('ac-kb-shell') === shell) {
        shell.innerHTML = '<div class="ac-kb-placeholder" style="color:var(--rsk)">' +
          'Failed to load knowledge base.</div>';
      }
    });
  }

  function _renderContent(shell, wsName, meetings, nodes, nameMap) {
    if (!shell || !shell.parentElement) return;

    // Cache for collapse re-renders
    _lastNodes    = nodes;
    _lastMeetings = meetings;
    _lastNameMap  = nameMap;

    // ── Stats ──
    var decCount     = 0;
    var actOpenCount = 0;
    var rskCount     = 0;
    var ntCount      = 0;

    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if      (n.tag === 'decision')                          decCount++;
      else if (n.tag === 'action' && n.status !== 'committed') actOpenCount++;
      else if (n.tag === 'risk' || n.tag === 'dissent')       rskCount++;
      else if (n.tag === 'note')                              ntCount++;
    }

    // ── Date range ──
    var mtgCount  = meetings.length;
    var firstDate = mtgCount ? meetings[0].scheduled_for : null;
    var lastDate  = mtgCount ? meetings[mtgCount - 1].scheduled_for : null;

    var subtitle = mtgCount
      ? 'Knowledge accumulated across ' + mtgCount +
        ' meeting' + (mtgCount === 1 ? '' : 's') +
        (firstDate ? ' \u00b7 ' + _fmtDateRange(firstDate, lastDate) : '')
      : 'No closed meetings yet';

    var latestId = mtgCount ? meetings[mtgCount - 1].meeting_id : null;

    var html = '';

    // ── Header ──
    html += '<div class="ac-kb-header">';
    html += '<p class="ac-kb-subtitle">'  + _esc(subtitle) + '</p>';
    html += '<div class="ac-kb-stats">';
    html += '<div class="ac-kb-stat ac-kb-stat--dec"><span class="ac-kb-stat-val">' + decCount     + '</span><span class="ac-kb-stat-lbl">Decisions</span></div>';
    html += '<div class="ac-kb-stat ac-kb-stat--act"><span class="ac-kb-stat-val">' + actOpenCount + '</span><span class="ac-kb-stat-lbl">Actions open</span></div>';
    html += '<div class="ac-kb-stat ac-kb-stat--rsk"><span class="ac-kb-stat-val">' + rskCount     + '</span><span class="ac-kb-stat-lbl">Risk / Dissent</span></div>';
    html += '<div class="ac-kb-stat ac-kb-stat--nt" ><span class="ac-kb-stat-val">' + ntCount      + '</span><span class="ac-kb-stat-lbl">Notes</span></div>';
    html += '</div></div>';

    // ── Filter pills ──
    html += '<div class="ac-kb-filter-bar">';
    html += '<span class="ac-kb-filter-label">Show</span>';
    html += '<div class="ac-kb-pills">';
    html += '<div class="ac-kb-pill active" data-pill="all">All</div>';
    html += '<div class="ac-kb-pill" data-pill="decisions">Decisions</div>';
    html += '<div class="ac-kb-pill" data-pill="actions">Action Items</div>';
    html += '<div class="ac-kb-pill" data-pill="risks">Risks</div>';
    html += '<div class="ac-kb-pill" data-pill="notes">Notes</div>';
    html += '</div>';
    html += '<div class="ac-kb-mtg-filter">All meetings &#9660;</div>';
    html += '</div>';

    // ── Canvas ──
    html += '<div class="ac-kb-canvas" id="ac-kb-canvas">';
    html += _canvasHtml(nodes, meetings, nameMap);
    html += '</div>';

    // ── Status bar ──
    html += '<div class="ac-kb-status-bar"><span class="ac-kb-status-label">Meetings</span>';
    html += '<div class="ac-kb-chips">';
    if (mtgCount) {
      for (var j = 0; j < meetings.length; j++) {
        var m   = meetings[j];
        var lbl = m.title || '(untitled)';
        if (lbl.length > 28) lbl = lbl.slice(0, 25) + '\u2026';
        html += '<div class="ac-kb-chip' + (m.meeting_id === latestId ? ' ac-kb-chip--active' : '') +
                '">' + _esc(lbl) + '</div>';
      }
    } else {
      html += '<div class="ac-kb-chip" style="color:var(--lo);font-style:italic">No closed meetings</div>';
    }
    html += '</div></div>';

    shell.innerHTML = html;

    _activeFilter = 'all';

    var canvasEl = shell.querySelector('#ac-kb-canvas');
    if (canvasEl) _wireCanvas(canvasEl);

    var pillsBar = shell.querySelector('.ac-kb-pills');
    if (pillsBar) {
      pillsBar.addEventListener('click', function (e) {
        var pill = e.target.closest('.ac-kb-pill');
        if (!pill) return;
        _setFilter(pill.getAttribute('data-pill'));
      });
    }
  }

  // ── Destroy ────────────────────────────────────────────────
  function destroy() {
    var existing = document.getElementById('ac-kb-shell');
    if (existing && existing.parentElement) existing.parentElement.removeChild(existing);
  }

  // ── Expose ─────────────────────────────────────────────────
  window.AccordKnowledgeBase = {
    render:     render,
    destroy:    destroy,
    _activeTab: 'meetings',
  };

})();
// ============================================================
// Firm-Wide Knowledge Base
// Renders into #ac-fw-kb-host — a full-width surface injected
// into the center pane of accord.html when the KB tier-1 tab
// is clicked at constellation level.
// ============================================================

(function () {

  var _fwHost     = null;   // #ac-fw-kb-host element
  var _fwPanel    = null;   // slide-in detail panel
  var _fwData     = [];     // all nodes fetched
  var _fwMtgMap   = {};     // meeting_id → { title, workstreamName, state, workstreamId }
  var _fwActiveTag = 'all'; // current filter tab
  var _fwSearchQ   = '';    // current search string
  var _fwSlideOpen = false;

  // ── CSS injection ──────────────────────────────────────────
  (function _injectFwStyles() {
    if (document.getElementById('ac-fw-kb-styles')) return;
    var s = document.createElement('style');
    s.id = 'ac-fw-kb-styles';
    s.textContent = [
      // Host
      '#ac-fw-kb-host{display:flex;flex-direction:column;width:100%;height:100%;overflow:hidden;background:#060a10;position:relative;}',
      // Splash
      '#ac-fw-kb-splash{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;padding:40px;}',
      // Filter bar
      '#ac-fw-kb-bar{display:flex;align-items:center;gap:8px;padding:12px 20px;border-bottom:1px solid rgba(0,210,255,0.1);flex-shrink:0;flex-wrap:wrap;}',
      '.ac-fw-pill{font-family:Arial,sans-serif;font-size:12px;padding:5px 12px;border-radius:3px;border:1px solid rgba(0,210,255,0.35);color:#e8f0f8;background:rgba(0,210,255,0.08);cursor:pointer;transition:all 120ms;white-space:nowrap;letter-spacing:0.05em;}',
      '.ac-fw-pill.active{background:rgba(0,210,255,0.15);border-color:rgba(0,210,255,0.6);color:#ffffff;}',
      '.ac-fw-pill:hover:not(.active){background:rgba(0,210,255,0.12);border-color:rgba(0,210,255,0.5);color:#ffffff;}',
      '#ac-fw-search{flex:1;min-width:180px;max-width:340px;background:#243550;border:1px solid rgba(0,210,255,0.3);color:#a0b8cc;font-family:"JetBrains Mono",monospace;font-size:12px;padding:5px 10px;border-radius:4px;outline:none;}',
      '#ac-fw-search:focus{border-color:rgba(0,210,255,0.5);}',
      '#ac-fw-search::placeholder{color:#6a8aaa;opacity:1;}',
      '#ac-fw-count{font-family:"JetBrains Mono",monospace;font-size:11px;color:#5a7a9f;margin-left:auto;white-space:nowrap;}',
      // List
      '#ac-fw-kb-list{flex:1;overflow-y:auto;padding:8px 0;}',
      '.ac-fw-row{display:grid;grid-template-columns:64px 1fr auto auto auto;align-items:center;gap:10px;padding:7px 20px;cursor:pointer;border-left:3px solid transparent;transition:background 80ms,border-color 80ms;}',
      '.ac-fw-row:hover{background:rgba(0,210,255,0.04);border-left-color:rgba(0,210,255,0.3);}',
      '.ac-fw-row.ac-fw-selected{background:rgba(0,210,255,0.08);border-left-color:#00d2ff;}',
      '.ac-fw-seq{font-family:"JetBrains Mono",monospace;font-size:10px;padding:2px 6px;border-radius:3px;text-align:center;white-space:nowrap;}',
      '.ac-fw-summary{font-family:Arial,sans-serif;font-size:13px;color:#e8f0f8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.ac-fw-ws{font-family:"JetBrains Mono",monospace;font-size:10px;color:#00d2ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px;}',
      '.ac-fw-mtg{font-family:"JetBrains Mono",monospace;font-size:10px;color:#5a7a9f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px;}',
      '.ac-fw-date{font-family:"JetBrains Mono",monospace;font-size:10px;color:#5a7a9f;white-space:nowrap;}',
      '.ac-fw-badge{font-family:Arial,sans-serif;font-size:10px;padding:2px 6px;border-radius:3px;white-space:nowrap;}',
      '.ac-fw-badge-overdue{background:rgba(255,77,109,0.12);color:#ff4d6d;border:1px solid rgba(255,77,109,0.3);}',
      '.ac-fw-badge-open{background:rgba(0,210,255,0.08);color:#7a9abf;border:1px solid rgba(0,210,255,0.15);}',
      '.ac-fw-badge-done{background:rgba(52,192,112,0.08);color:#34c070;border:1px solid rgba(52,192,112,0.2);}',
      // Seq badge colors by tag
      '.ac-fw-seq-decision{background:rgba(0,210,255,0.12);color:#00d2ff;border:1px solid rgba(0,210,255,0.25);}',
      '.ac-fw-seq-action{background:rgba(240,160,32,0.12);color:#f0a020;border:1px solid rgba(240,160,32,0.25);}',
      '.ac-fw-seq-risk{background:rgba(255,77,109,0.12);color:#ff4d6d;border:1px solid rgba(255,77,109,0.25);}',
      '.ac-fw-seq-note{background:rgba(168,85,247,0.12);color:#a855f7;border:1px solid rgba(168,85,247,0.25);}',
      '.ac-fw-seq-question{background:rgba(52,192,112,0.12);color:#34c070;border:1px solid rgba(52,192,112,0.25);}',
      '.ac-fw-seq-agenda{background:rgba(251,191,36,0.12);color:#fbbf24;border:1px solid rgba(251,191,36,0.25);}',
      // Slide-in panel
      '#ac-fw-panel{position:absolute;top:0;right:0;width:50%;height:100%;background:#0a1119;border-left:1px solid rgba(0,210,255,0.15);display:flex;flex-direction:column;transform:translateX(100%);transition:transform 260ms cubic-bezier(.25,.46,.45,.94);z-index:50;overflow:hidden;}',
      '#ac-fw-panel.open{transform:translateX(0);}',
      '#ac-fw-panel-header{padding:14px 18px 12px;border-bottom:1px solid rgba(0,210,255,0.1);flex-shrink:0;display:flex;align-items:flex-start;gap:10px;}',
      '#ac-fw-panel-close{background:none;border:none;color:#5a7a9f;font-size:18px;cursor:pointer;padding:0;line-height:1;flex-shrink:0;margin-top:2px;}',
      '#ac-fw-panel-close:hover{color:#00d2ff;}',
      '#ac-fw-panel-title{font-family:"Syne",system-ui,sans-serif;font-size:16px;font-weight:700;color:#e8f0f8;line-height:1.3;}',
      '#ac-fw-panel-breadcrumb{font-family:"JetBrains Mono",monospace;font-size:10px;color:#5a7a9f;margin-top:3px;}',
      '#ac-fw-panel-breadcrumb span{color:#00d2ff;}',
      '#ac-fw-panel-body{flex:1;overflow-y:auto;padding:16px 18px;}',
      '#ac-fw-panel-body .ac-fw-notice-field{margin-bottom:12px;}',
      '#ac-fw-panel-body .ac-fw-notice-label{font-family:"JetBrains Mono",monospace;font-size:10px;color:#5a7a9f;letter-spacing:.1em;text-transform:uppercase;margin-bottom:3px;}',
      '#ac-fw-panel-body .ac-fw-notice-value{font-family:Arial,sans-serif;font-size:13px;color:#c8d8e8;}',
      '#ac-fw-panel-body .ac-fw-minutes-node{padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);}',
      '#ac-fw-panel-body .ac-fw-minutes-seq{font-family:"JetBrains Mono",monospace;font-size:10px;color:#5a7a9f;margin-bottom:3px;}',
      '#ac-fw-panel-body .ac-fw-minutes-summary{font-family:Arial,sans-serif;font-size:13px;color:#e8f0f8;}',
      // Empty state
      '.ac-fw-empty{padding:40px;text-align:center;color:#5a7a9f;font-family:"JetBrains Mono",monospace;font-size:12px;}',
      // Loading
      '.ac-fw-loading{padding:40px;text-align:center;color:#5a7a9f;font-family:"JetBrains Mono",monospace;font-size:12px;}',
    ].join('');
    document.head.appendChild(s);
  })();

  // ── Helpers ────────────────────────────────────────────────
  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function _fmt(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
  }
  function _isOverdue(node) {
    if (node.tag !== 'action') return false;
    if (node.status === 'committed' || node.status === 'closed') return false;
    if (!node.due_date) return false;
    return new Date(node.due_date) < new Date();
  }
  function _seqClass(tag) {
    var map = { decision:'decision', action:'action', risk:'risk', note:'note', question:'question', agenda:'agenda' };
    return 'ac-fw-seq-' + (map[tag] || 'note');
  }
  function _tagLabel(tag) {
    var map = { decision:'DECISION', action:'ACTION', risk:'RISK', note:'NOTE', question:'QUESTION', agenda:'AGENDA' };
    return map[tag] || tag.toUpperCase();
  }

  // ── Splash SVG ─────────────────────────────────────────────
  function _splashHtml() {
    return '<div id="ac-fw-kb-splash" style="display:flex;flex-direction:column;align-items:center;justify-content:flex-start;flex:1;padding:20px 40px 40px;">' +
      '<svg width="100%" viewBox="0 0 680 420" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto -30px;max-width:65%;">' +
        '<defs><style>' +
          '.kbs-orb{fill:none;stroke:rgba(0,210,255,0.3);stroke-width:0.8}' +
          '.kbs-line{stroke:rgba(0,210,255,0.5);stroke-width:0.6;fill:none}' +
          '.kbs-node{fill:rgba(0,210,255,0.3);stroke:#00d2ff;stroke-width:1;}' +
          '.kbs-halo{fill:rgba(0,210,255,0.35);stroke:none;}' +
          '.kbs-dot{fill:#00d2ff;opacity:0.8;}' +
          '.kbs-label{font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:0.1em;}' +
          '.kbs-p1{animation:kbs-pulse 3s ease-in-out infinite}' +
          '.kbs-p2{animation:kbs-pulse 3s ease-in-out 1s infinite}' +
          '.kbs-p3{animation:kbs-pulse 3s ease-in-out 2s infinite}' +
          '.kbs-f1{animation:kbs-float 5s ease-in-out infinite}' +
          '.kbs-f2{animation:kbs-float 5s ease-in-out 1.5s infinite}' +
          '.kbs-f3{animation:kbs-float 5s ease-in-out 3s infinite}' +
          '.kbs-g1{animation:kbs-glow 2.5s ease-in-out infinite}' +
          '.kbs-g2{animation:kbs-glow 2.5s ease-in-out 0.8s infinite}' +
          '.kbs-g3{animation:kbs-glow 2.5s ease-in-out 1.6s infinite}' +
          '@keyframes kbs-pulse{0%,100%{opacity:0.3}50%{opacity:0.6}}' +
          '@keyframes kbs-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}' +
          '@keyframes kbs-glow{0%,100%{opacity:0.1}50%{opacity:0.35}}' +
        '</style></defs>' +
        // Central hub
        '<g class="kbs-f1"><circle class="kbs-halo kbs-g1" cx="340" cy="185" r="36"/><circle class="kbs-node" cx="340" cy="185" r="22"/><circle class="kbs-dot" cx="340" cy="185" r="8"/></g>' +
        // Spokes
        '<line class="kbs-line" x1="340" y1="185" x2="200" y2="90"/>' +
        '<line class="kbs-line" x1="340" y1="185" x2="480" y2="90"/>' +
        '<line class="kbs-line" x1="340" y1="185" x2="170" y2="210"/>' +
        '<line class="kbs-line" x1="340" y1="185" x2="510" y2="220"/>' +
        '<line class="kbs-line" x1="340" y1="185" x2="270" y2="300"/>' +
        '<line class="kbs-line" x1="340" y1="185" x2="430" y2="295"/>' +
        // Decision node — top left
        '<g class="kbs-f2"><circle class="kbs-halo kbs-g2" cx="200" cy="90" r="22"/><circle class="kbs-node" cx="200" cy="90" r="14" style="stroke:rgba(0,210,255,0.9)"/><circle class="kbs-dot" cx="200" cy="90" r="5"/></g>' +
        '<text class="kbs-label" x="200" y="66" text-anchor="middle" fill="rgba(0,210,255,0.7)">DECISIONS</text>' +
        // Action node — top right
        '<g class="kbs-f3"><circle class="kbs-halo kbs-g3" cx="480" cy="90" r="24"/><circle class="kbs-node" cx="480" cy="90" r="16" style="stroke:rgba(240,160,32,0.9)"/><circle class="kbs-dot" cx="480" cy="90" r="6" style="fill:#f0a020"/></g>' +
        '<text class="kbs-label" x="480" y="66" text-anchor="middle" style="fill:#f0a020">ACTIONS</text>' +
        // Risk node — left
        '<g class="kbs-f1"><circle class="kbs-halo kbs-g1" cx="170" cy="210" r="20"/><circle class="kbs-node" cx="170" cy="210" r="13" style="stroke:rgba(255,77,109,0.9)"/><circle class="kbs-dot" cx="170" cy="210" r="4.5" style="fill:#ff4d6d"/></g>' +
        '<text class="kbs-label" x="118" y="232" text-anchor="middle" style="fill:#ff4d6d">RISKS</text>' +
        // Note node — right
        '<g class="kbs-f2"><circle class="kbs-halo kbs-g2" cx="510" cy="220" r="19"/><circle class="kbs-node" cx="510" cy="220" r="12" style="stroke:rgba(168,85,247,0.9)"/><circle class="kbs-dot" cx="510" cy="220" r="4" style="fill:#a855f7"/></g>' +
        '<text class="kbs-label" x="556" y="236" text-anchor="middle" style="fill:#a855f7">NOTES</text>' +
        // Question node — bottom left
        '<g class="kbs-f3"><circle class="kbs-halo kbs-g3" cx="270" cy="300" r="18"/><circle class="kbs-node" cx="270" cy="300" r="12" style="stroke:rgba(52,192,112,0.9)"/><circle class="kbs-dot" cx="270" cy="300" r="4" style="fill:#34c070"/></g>' +
        '<text class="kbs-label" x="270" y="328" text-anchor="middle" style="fill:#34c070">QUESTIONS</text>' +
        // Extra node — bottom right
        '<g class="kbs-f1"><circle class="kbs-halo kbs-g1" cx="430" cy="295" r="16"/><circle class="kbs-node" cx="430" cy="295" r="11" style="stroke:rgba(0,210,255,0.5)"/><circle class="kbs-dot" cx="430" cy="295" r="3.5"/></g>' +
      '</svg>' +
      '<div style="font-family:\'Syne\',system-ui,sans-serif;font-size:22px;font-weight:700;color:#ffffff;margin-bottom:8px;text-align:center;">Knowledge Base</div>' +
      '<div style="font-family:\'JetBrains Mono\',monospace;font-size:12px;color:#f0a020;margin-bottom:16px;text-align:center;">Firm-wide decisions, actions, risks, notes &amp; questions</div>' +
      '<div style="font-family:Arial,sans-serif;font-size:13px;color:#7a9abf;text-align:center;line-height:1.7;max-width:420px;">' +
        'Use the filter pills to browse by type, or search by keyword.<br>' +
        'Click any entry to view its meeting context in the slide-in panel.' +
      '</div>' +
    '</div>';
  }

  // ── Load firm-wide data ─────────────────────────────────────
  async function _fwLoad() {
    var nodes = await API.get(
      'accord_nodes?select=node_id,tag,summary,body,seq_id,seq_class,seq_number,status,' +
      'due_date,created_at,sealed_at,meeting_id,discipline,topic,created_by' +
      '&order=created_at.desc&limit=500'
    );
    nodes = Array.isArray(nodes) ? nodes : [];

    // Fetch all meetings referenced
    var mtgIds = [...new Set(nodes.map(function(n){ return n.meeting_id; }).filter(Boolean))];
    var mtgs = [];
    if (mtgIds.length) {
      mtgs = await API.get(
        'accord_meetings?meeting_id=in.(' + mtgIds.join(',') + ')' +
        '&select=meeting_id,title,state,stakes,location,scheduled_for,workstream_id,organizer_id'
      ) || [];
    }

    // Fetch workstream names
    var wsIds = [...new Set(mtgs.map(function(m){ return m.workstream_id; }).filter(Boolean))];
    var wss = [];
    if (wsIds.length) {
      wss = await API.get(
        'workstreams?workstream_id=in.(' + wsIds.join(',') + ')&select=workstream_id,name'
      ) || [];
    }
    var wsMap = {};
    wss.forEach(function(w){ wsMap[w.workstream_id] = w.name; });

    _fwMtgMap = {};
    mtgs.forEach(function(m){
      _fwMtgMap[m.meeting_id] = {
        title:         m.title || 'Untitled',
        state:         m.state,
        stakes:        m.stakes,
        location:      m.location,
        scheduledFor:  m.scheduled_for,
        workstreamId:  m.workstream_id,
        workstreamName:wsMap[m.workstream_id] || '',
        organizerId:   m.organizer_id,
      };
    });

    // Fetch agenda items for all referenced meetings and merge as tag='agenda'
    var agendaItems = [];
    if (mtgIds.length) {
      var rawAgenda = await API.get(
        'accord_agenda_items?meeting_id=in.(' + mtgIds.join(',') + ')' +
        '&select=agenda_item_id,meeting_id,title,status,position,created_at&order=created_at.desc'
      ).catch(function() { return []; });
      agendaItems = (rawAgenda || []).map(function(a) {
        return {
          node_id:    a.agenda_item_id,
          tag:        'agenda',
          summary:    a.title || '(untitled)',
          body:       '',
          meeting_id: a.meeting_id,
          created_at: a.created_at,
          status:     a.status,
          seq_id:     'AG-' + (a.position != null ? a.position : '?'),
        };
      });
    }

    _fwData = nodes.concat(agendaItems);
    return _fwData;
  }

  // ── Render a single row ─────────────────────────────────────
  function _fwRowHtml(n) {
    var mtg   = _fwMtgMap[n.meeting_id] || {};
    var date  = _fmt(n.sealed_at || n.created_at);
    var badge = '';
    if (n.tag === 'action') {
      if (_isOverdue(n)) {
        badge = '<span class="ac-fw-badge ac-fw-badge-overdue">OVERDUE</span>';
      } else if (n.status === 'committed' || n.status === 'closed') {
        badge = '<span class="ac-fw-badge ac-fw-badge-done">DONE</span>';
      } else {
        badge = '<span class="ac-fw-badge ac-fw-badge-open">OPEN</span>';
      }
    }
    return '<div class="ac-fw-row" data-node-id="' + _esc(n.node_id) + '" data-meeting-id="' + _esc(n.meeting_id) + '" data-tag="' + _esc(n.tag) + '">' +
      '<span class="ac-fw-seq ' + _seqClass(n.tag) + '">' + _esc(n.seq_id || _tagLabel(n.tag)) + '</span>' +
      '<span class="ac-fw-summary">' + _esc(n.summary || '—') + '</span>' +
      '<span class="ac-fw-ws">' + _esc(mtg.workstreamName || '') + '</span>' +
      '<span class="ac-fw-mtg">' + _esc(mtg.title || '') + '</span>' +
      '<span class="ac-fw-date">' + _esc(date) + '</span>' +
      (badge ? badge : '<span></span>') +
    '</div>';
  }

  // ── Filter + render list ────────────────────────────────────
  function _fwRenderList() {
    var list = document.getElementById('ac-fw-kb-list');
    var count = document.getElementById('ac-fw-count');
    if (!list) return;

    var filtered = _fwData.filter(function(n) {
      if (_fwActiveTag !== 'all' && n.tag !== _fwActiveTag) return false;
      if (_fwSearchQ) {
        var q = _fwSearchQ.toLowerCase();
        var mtg = _fwMtgMap[n.meeting_id] || {};
        var hay = [
          n.summary   || '',
          n.body      || '',
          n.tag       || '',
          n.topic     || '',
          n.discipline|| '',
          mtg.title   || '',
          mtg.workstreamName || '',
          mtg.stakes  || '',
        ].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    if (count) count.textContent = filtered.length + ' item' + (filtered.length !== 1 ? 's' : '');

    if (!filtered.length) {
      list.innerHTML = '<div class="ac-fw-empty">No results' + (_fwSearchQ ? ' for "' + _esc(_fwSearchQ) + '"' : '') + '</div>';
      return;
    }
    list.innerHTML = filtered.map(_fwRowHtml).join('');

    // Wire row clicks
    list.querySelectorAll('.ac-fw-row').forEach(function(row) {
      row.addEventListener('click', function() {
        list.querySelectorAll('.ac-fw-row').forEach(function(r){ r.classList.remove('ac-fw-selected'); });
        row.classList.add('ac-fw-selected');
        if (row.dataset.tag === 'agenda') {
          // Agenda rows: navigate to the meeting
          var mtgId = row.dataset.meetingId;
          var activeTab = document.querySelector('#hud-tier1 .hud-tier1-tab.active');
          if (activeTab && activeTab.dataset.tier1Id !== 'workstreams') {
            document.querySelector('[data-tier1-id="workstreams"]')?.click();
          }
          if (window.Accord?.setLevel) {
            window.Accord.setLevel('meeting', { meetingId: mtgId, workstreamId: null });
          }
        } else {
          _fwOpenPanel(row.dataset.meetingId);
        }
      });
    });
  }

  // ── Slide-in panel ─────────────────────────────────────────
  async function _fwOpenPanel(meetingId) {
    var panel = document.getElementById('ac-fw-panel');
    if (!panel) return;

    var mtg = _fwMtgMap[meetingId] || {};
    var titleEl = document.getElementById('ac-fw-panel-title');
    var breadEl = document.getElementById('ac-fw-panel-breadcrumb');
    var bodyEl  = document.getElementById('ac-fw-panel-body');

    if (titleEl) titleEl.textContent = mtg.title || 'Meeting';
    if (breadEl) breadEl.innerHTML = (mtg.workstreamName
      ? '<span>' + _esc(mtg.workstreamName) + '</span> › '
      : '') + _esc(mtg.title || '');

    if (bodyEl) bodyEl.innerHTML = '<div class="ac-fw-loading">Loading\u2026</div>';

    panel.classList.add('open');
    _fwSlideOpen = true;

    // Fetch meeting nodes for panel
    var nodes = await API.get(
      'accord_nodes?meeting_id=eq.' + meetingId +
      '&select=node_id,tag,seq_id,summary,body,status,due_date,sealed_at,created_at' +
      '&order=created_at.asc'
    );
    nodes = Array.isArray(nodes) ? nodes : [];

    if (!bodyEl) return;

    var isSealed = mtg.state === 'sealed';
    var html = '';

    // Header fields (always shown)
    if (mtg.stakes) {
      html += '<div class="ac-fw-notice-field"><div class="ac-fw-notice-label">Stakes</div>' +
              '<div class="ac-fw-notice-value">' + _esc(mtg.stakes) + '</div></div>';
    }
    if (mtg.location) {
      html += '<div class="ac-fw-notice-field"><div class="ac-fw-notice-label">Location</div>' +
              '<div class="ac-fw-notice-value">' + _esc(mtg.location) + '</div></div>';
    }
    if (mtg.scheduledFor) {
      html += '<div class="ac-fw-notice-field"><div class="ac-fw-notice-label">Scheduled</div>' +
              '<div class="ac-fw-notice-value">' + _esc(_fmt(mtg.scheduledFor)) + '</div></div>';
    }

    // Divider
    if (nodes.length) {
      html += '<div style="height:1px;background:rgba(0,210,255,0.1);margin:12px 0;"></div>';
      html += '<div style="font-family:\'JetBrains Mono\',monospace;font-size:10px;color:#5a7a9f;letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px;">' +
        (isSealed ? 'Meeting Minutes' : 'Captured Items') + '</div>';

      if (!nodes.length) {
        html += '<div style="color:#5a7a9f;font-size:12px;font-family:Arial,sans-serif;">No items captured.</div>';
      } else {
        nodes.forEach(function(n) {
          var overdue = _isOverdue(n);
          html += '<div class="ac-fw-minutes-node">' +
            '<div class="ac-fw-minutes-seq">' +
              '<span class="ac-fw-seq ' + _seqClass(n.tag) + '" style="display:inline-block;margin-right:6px;">' + _esc(n.seq_id || _tagLabel(n.tag)) + '</span>' +
              (overdue ? '<span class="ac-fw-badge ac-fw-badge-overdue" style="display:inline-block;">OVERDUE</span>' : '') +
            '</div>' +
            '<div class="ac-fw-minutes-summary">' + _esc(n.summary || '—') + '</div>' +
            (n.body ? '<div style="font-family:Arial,sans-serif;font-size:12px;color:#7a9abf;margin-top:3px;">' + _esc(n.body) + '</div>' : '') +
          '</div>';
        });
      }
    } else {
      html += '<div style="color:#5a7a9f;font-size:12px;font-family:Arial,sans-serif;margin-top:12px;">No items captured for this meeting.</div>';
    }

    bodyEl.innerHTML = html;
  }

  function _fwClosePanel() {
    var panel = document.getElementById('ac-fw-panel');
    if (panel) panel.classList.remove('open');
    _fwSlideOpen = false;
    var list = document.getElementById('ac-fw-kb-list');
    if (list) list.querySelectorAll('.ac-fw-row').forEach(function(r){ r.classList.remove('ac-fw-selected'); });
  }

  var _fwLoaded = false;

  async function _fwEnsureLoaded() {
    if (_fwLoaded) return;
    _fwLoaded = true;
    var list = document.getElementById('ac-fw-kb-list');
    if (list) list.innerHTML = '<div class="ac-fw-loading">Loading\u2026</div>';
    var splash = document.getElementById('ac-fw-kb-splash');
    var bar    = document.getElementById('ac-fw-kb-bar');
    if (splash) splash.style.display = 'none';
    if (bar)    bar.style.display    = '';
    if (list)   list.style.display   = '';
    await _fwLoad();
  }

  // ── Main render ─────────────────────────────────────────────
  async function renderFirmWide(container) {
    destroyFirmWide();

    container = container || document.querySelector('.ac-center, .ac-stage, #ac-constellation-host');
    if (!container) return;

    // Build host
    _fwHost = document.createElement('div');
    _fwHost.id = 'ac-fw-kb-host';
    container.appendChild(_fwHost);

    // Show splash immediately — bar anchored above splash
    _fwHost.innerHTML =
      '<div id="ac-fw-kb-bar">' +
        ['all','decision','action','risk','note','question','agenda'].map(function(tag) {
          return '<button class="ac-fw-pill' + (tag === 'all' ? ' active' : '') + '" data-tag="' + tag + '">' +
            (tag === 'all' ? 'All' : tag.charAt(0).toUpperCase() + tag.slice(1) + 's') +
          '</button>';
        }).join('') +
        '<input id="ac-fw-search" type="text" placeholder="Search keywords\u2026" autocomplete="off">' +
        '<span id="ac-fw-count"></span>' +
      '</div>' +
      _splashHtml() +
      '<div id="ac-fw-kb-list" style="display:none;"></div>' +
      // Slide-in panel
      '<div id="ac-fw-panel">' +
        '<div id="ac-fw-panel-header">' +
          '<button id="ac-fw-panel-close">&#x2715;</button>' +
          '<div>' +
            '<div id="ac-fw-panel-title"></div>' +
            '<div id="ac-fw-panel-breadcrumb"></div>' +
          '</div>' +
        '</div>' +
        '<div id="ac-fw-panel-body"></div>' +
      '</div>';

    // Show splash until search string entered; returns when cleared

    // Wire filter pills — set active tag only; re-render if data already loaded
    _fwHost.querySelectorAll('.ac-fw-pill').forEach(function(btn) {
      btn.addEventListener('click', function() {
        _fwHost.querySelectorAll('.ac-fw-pill').forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        _fwActiveTag = btn.dataset.tag;
        if (_fwLoaded) _fwRenderList();
      });
    });

    // Wire search — splash until query entered; splash returns when cleared
    var searchEl = document.getElementById('ac-fw-search');
    if (searchEl) {
      searchEl.addEventListener('input', async function() {
        _fwSearchQ = searchEl.value.trim();
        var splash = document.getElementById('ac-fw-kb-splash');
        var list   = document.getElementById('ac-fw-kb-list');
        if (!_fwSearchQ) {
          if (list)   list.style.display   = 'none';
          if (splash) splash.style.display = '';
          return;
        }
        await _fwEnsureLoaded();
        _fwRenderList();
      });
    }

    // Wire panel close
    var closeBtn = document.getElementById('ac-fw-panel-close');
    if (closeBtn) closeBtn.addEventListener('click', _fwClosePanel);
  }

  function destroyFirmWide() {
    _fwLoaded    = false;
    _fwClosePanel();
    if (_fwHost && _fwHost.parentElement) _fwHost.parentElement.removeChild(_fwHost);
    _fwHost     = null;
    _fwData     = [];
    _fwMtgMap   = {};
    _fwActiveTag = 'all';
    _fwSearchQ   = '';
  }

  // Extend the public API set up by the first IIFE
  if (window.AccordKnowledgeBase) {
    window.AccordKnowledgeBase.renderFirmWide  = renderFirmWide;
    window.AccordKnowledgeBase.destroyFirmWide = destroyFirmWide;
  }

})();