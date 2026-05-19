// ============================================================
// ProjectHUD — accord-knowledge-base.js
// CMD-ACCORD-KNOWLEDGE-BASE-1 · Phase 2
// Shell + tab wiring + header + stats + filter pills + status bar.
// Canvas placeholder only — Phase 3 adds discipline/topic hierarchy.
//
// Public API:
//   AccordKnowledgeBase.render(workstreamId, host)
//   AccordKnowledgeBase.destroy()
//   AccordKnowledgeBase._activeTab  — 'meetings' (default) | 'kb'
// ============================================================

(function () {
  'use strict';

  var API = window.API;

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
        'cursor:default;color:var(--md);border:1px solid transparent;' +
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
    ].join('');
    document.head.appendChild(s);
    console.log('%c[accord-knowledge-base.js] v20260519-CMD-ACCORD-KNOWLEDGE-BASE-1-P2 styles injected',
      'background:#e89430;color:#fff;padding:2px 6px;border-radius:3px;font-weight:600');
  })();

  // ── Helpers ────────────────────────────────────────────────
  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString([], {
      year: 'numeric', month: 'short', day: 'numeric',
    });
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

  // ── Render ─────────────────────────────────────────────────
  function render(workstreamId, host) {
    destroy();

    // Workstream name from already-rendered header — no extra query needed
    var titleEl = host ? host.querySelector('.ac-view-title') : null;
    var wsName  = titleEl ? titleEl.textContent.trim() : 'Workstream';

    var shell = document.createElement('div');
    shell.id = 'ac-kb-shell';
    shell.className = 'ac-kb-shell';
    host.appendChild(shell);
    shell.innerHTML = '<div class="ac-kb-placeholder">Loading knowledge base\u2026</div>';

    // Load closed/sealed meetings for this workstream
    API.get(
      'accord_meetings' +
      '?workstream_id=eq.' + workstreamId +
      '&state=in.(closed,sealed)' +
      '&select=meeting_id,title,scheduled_for,state,sealed_at' +
      '&order=scheduled_for.asc'
    ).then(function (meetings) {
      meetings = Array.isArray(meetings) ? meetings : [];

      if (!meetings.length) {
        // No closed meetings yet — render shell with zero stats
        _renderContent(shell, wsName, [], []);
        return;
      }

      var ids = meetings.map(function (m) { return m.meeting_id; }).join(',');

      // Load nodes for those meetings
      return API.get(
        'accord_nodes' +
        '?meeting_id=in.(' + ids + ')' +
        '&select=tag,status'
      ).then(function (nodes) {
        nodes = Array.isArray(nodes) ? nodes : [];
        // Safe no-op guard — 'deleted' not in production per Phase 1
        nodes = nodes.filter(function (n) { return n.status !== 'deleted'; });
        _renderContent(shell, wsName, meetings, nodes);
      });

    }).catch(function (e) {
      console.error('[AccordKB] load failed', e);
      // Guard: shell may have been destroyed before async resolves
      if (document.getElementById('ac-kb-shell') === shell) {
        shell.innerHTML = '<div class="ac-kb-placeholder" style="color:var(--rsk)">' +
          'Failed to load knowledge base.</div>';
      }
    });
  }

  function _renderContent(shell, wsName, meetings, nodes) {
    // Guard: shell may have been destroyed while async was in-flight
    if (!shell || !shell.parentElement) return;

    // ── Count stats ──
    var decCount    = 0;
    var actOpenCount = 0;
    var rskCount    = 0;
    var ntCount     = 0;

    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.tag === 'decision') {
        decCount++;
      } else if (n.tag === 'action' && n.status !== 'committed') {
        actOpenCount++;
      } else if (n.tag === 'risk' || n.tag === 'dissent') {
        rskCount++;
      } else if (n.tag === 'note') {
        ntCount++;
      }
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

    // Latest meeting chip (last in ASC order = most recent)
    var latestId = mtgCount ? meetings[mtgCount - 1].meeting_id : null;

    var html = '';

    // ── Workspace header ──
    html += '<div class="ac-kb-header">';
    html += '<h2 class="ac-kb-ws-name">' + _esc(wsName) + '</h2>';
    html += '<p class="ac-kb-subtitle">' + _esc(subtitle) + '</p>';
    html += '<div class="ac-kb-stats">';
    html += '<div class="ac-kb-stat ac-kb-stat--dec">' +
              '<span class="ac-kb-stat-val">' + decCount + '</span>' +
              '<span class="ac-kb-stat-lbl">Decisions</span></div>';
    html += '<div class="ac-kb-stat ac-kb-stat--act">' +
              '<span class="ac-kb-stat-val">' + actOpenCount + '</span>' +
              '<span class="ac-kb-stat-lbl">Actions open</span></div>';
    html += '<div class="ac-kb-stat ac-kb-stat--rsk">' +
              '<span class="ac-kb-stat-val">' + rskCount + '</span>' +
              '<span class="ac-kb-stat-lbl">Risk / Dissent</span></div>';
    html += '<div class="ac-kb-stat ac-kb-stat--nt">' +
              '<span class="ac-kb-stat-val">' + ntCount + '</span>' +
              '<span class="ac-kb-stat-lbl">Notes</span></div>';
    html += '</div>'; // .ac-kb-stats
    html += '</div>'; // .ac-kb-header

    // ── Filter pills (non-functional — Phase 4 wires) ──
    html += '<div class="ac-kb-filter-bar">';
    html += '<span class="ac-kb-filter-label">Show</span>';
    html += '<div class="ac-kb-pills">';
    html += '<div class="ac-kb-pill active" data-pill="all">All</div>';
    html += '<div class="ac-kb-pill" data-pill="decisions">Decisions</div>';
    html += '<div class="ac-kb-pill" data-pill="actions">Action Items</div>';
    html += '<div class="ac-kb-pill" data-pill="risks">Risks</div>';
    html += '<div class="ac-kb-pill" data-pill="notes">Notes</div>';
    html += '</div>'; // .ac-kb-pills
    html += '<div class="ac-kb-mtg-filter">All meetings &#9660;</div>';
    html += '</div>'; // .ac-kb-filter-bar

    // ── Canvas placeholder (Phase 3 replaces) ──
    html += '<div class="ac-kb-canvas">';
    html += '<div class="ac-kb-placeholder">Loading knowledge base\u2026</div>';
    html += '</div>';

    // ── Status bar — meeting timeline chips ──
    html += '<div class="ac-kb-status-bar">';
    html += '<span class="ac-kb-status-label">Meetings</span>';
    html += '<div class="ac-kb-chips">';

    if (mtgCount) {
      for (var j = 0; j < meetings.length; j++) {
        var m   = meetings[j];
        var lbl = m.title || '(untitled)';
        if (lbl.length > 28) lbl = lbl.slice(0, 25) + '\u2026';
        var isLatest = (m.meeting_id === latestId);
        html += '<div class="ac-kb-chip' + (isLatest ? ' ac-kb-chip--active' : '') +
                '">' + _esc(lbl) + '</div>';
      }
    } else {
      html += '<div class="ac-kb-chip" style="color:var(--lo);font-style:italic">' +
              'No closed meetings</div>';
    }

    html += '</div>'; // .ac-kb-chips
    html += '</div>'; // .ac-kb-status-bar

    shell.innerHTML = html;
  }

  // ── Destroy ────────────────────────────────────────────────
  function destroy() {
    var existing = document.getElementById('ac-kb-shell');
    if (existing && existing.parentElement) {
      existing.parentElement.removeChild(existing);
    }
  }

  // ── Expose ─────────────────────────────────────────────────
  window.AccordKnowledgeBase = {
    render:     render,
    destroy:    destroy,
    _activeTab: 'meetings',   // mutable — accord-views.js tab wiring sets this
  };

})();