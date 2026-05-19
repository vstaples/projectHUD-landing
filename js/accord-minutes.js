// ============================================================
// accord-minutes.js
// CMD-ACCORD-MINUTES-1 · Phase 2
// 2026-05-19 · Operator: Vaughn Staples
//
// Minutes surface — review, edit, route + send.
// Renders when accord_meetings.state = 'closed'.
// Registered via AccordMinutes.render() called from
// accord-views.js:renderMeetingView() closed-state branch.
//
// Phase 2: shell + topbar + sidebar (checklist, sections nav,
//          recipients) + canvas section anchors/placeholders.
//
// Iron Rules: 36, 40 §1, 47, 64, 71, 72, 73 in force.
// var only — no let/const.
// ============================================================

var AccordMinutes = (function () {
  'use strict';

  var API = window.API;

  // ── Module state ────────────────────────────────────────────
  var _meeting          = null;
  var _myResourceId     = null;
  var _attendees        = [];   // [{ resource_id, name, checked }]
  var _externalRecs     = [];   // [{ email, checked }]
  var _checkedItems     = {};   // { 'header': true, … }

  // ── Checklist items ─────────────────────────────────────────
  var _CHECKLIST = [
    { id: 'header',     label: 'Meeting header' },
    { id: 'attendance', label: 'Attendance confirmed' },
    { id: 'outcomes',   label: 'Outcomes reviewed' },
    { id: 'agenda',     label: 'Agenda entries checked' },
    { id: 'decisions',  label: 'Decisions verified' },
    { id: 'actions',    label: 'Actions confirmed' },
  ];

  // ── Canvas sections ─────────────────────────────────────────
  var _SECTIONS = [
    { id: 'sec-header',    title: 'Meeting Details',   bar: 'var(--md)',  add: false },
    { id: 'sec-outcomes',  title: 'Intended Outcomes', bar: 'var(--dec)', add: true  },
    { id: 'sec-agenda',    title: 'Agenda & Captures', bar: 'var(--nt)',  add: false },
    { id: 'sec-decisions', title: 'Decisions',         bar: 'var(--dcn)', add: true  },
    { id: 'sec-actions',   title: 'Action Items',      bar: 'var(--act)', add: true  },
    { id: 'sec-risks',     title: 'Risks & Dissents',  bar: 'var(--rsk)', add: true  },
    { id: 'sec-parking',   title: 'Parking Lot',       bar: '#9478e0',    add: true  },
  ];

  // ── Sidebar nav items ───────────────────────────────────────
  var _NAV = [
    { secId: 'sec-header',    label: 'Meeting Header',    dot: 'var(--md)',  countKey: null        },
    { secId: 'sec-outcomes',  label: 'Intended Outcomes', dot: 'var(--dec)', countKey: 'outcomes'  },
    { secId: 'sec-agenda',    label: 'Agenda & Captures', dot: 'var(--nt)',  countKey: 'agenda'    },
    { secId: 'sec-decisions', label: 'Decisions',         dot: 'var(--dcn)', countKey: 'decisions' },
    { secId: 'sec-actions',   label: 'Action Items',      dot: 'var(--act)', countKey: 'actions'   },
    { secId: 'sec-risks',     label: 'Risks & Dissents',  dot: 'var(--rsk)', countKey: 'risks'     },
    { secId: 'sec-parking',   label: 'Parking Lot',       dot: '#9478e0',    countKey: 'parking'   },
  ];

  // ── Helpers ──────────────────────────────────────────────────
  function _esc(s) {
    return String(s != null ? s : '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _initials(name) {
    if (!name) return '?';
    var p = name.trim().split(/\s+/);
    return p.length === 1 ? p[0].slice(0,2).toUpperCase()
                          : (p[0][0] + p[p.length-1][0]).toUpperCase();
  }

  function _ensureOutfitFont() {
    if (document.querySelector('link[data-accord-outfit]')) return;
    var link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap';
    link.setAttribute('data-accord-outfit', '1');
    document.head.appendChild(link);
  }

  // ── Suppression ──────────────────────────────────────────────
  function _injectSuppressionStyles() {
    if (document.getElementById('ac-minutes-suppress')) return;
    var s = document.createElement('style');
    s.id = 'ac-minutes-suppress';
    s.textContent = '#closedBanner{display:none!important}'
                  + '.ac-meeting-tabs-shell{display:none!important}';
    document.head.appendChild(s);
  }

  function _removeSuppressionStyles() {
    var s = document.getElementById('ac-minutes-suppress');
    if (s && s.parentNode) s.parentNode.removeChild(s);
  }

  // ── CSS ──────────────────────────────────────────────────────
  function _css() {
    return (
      // Shell root
      '.ac-minutes-shell{' +
        '--void:#0b0d14;--surface:#10131e;--raised:#171c2e;--hover:#1d2338;' +
        '--b0:#1e2438;--b1:#252d44;--b2:#313d5e;' +
        '--hi:#dce6f5;--md:#8899b2;--lo:#7a8a9a;' +
        '--dec:#4a8cf5;--dec-bg:rgba(74,140,245,.09);--dec-bd:rgba(74,140,245,.24);' +
        '--dcn:#8b6ef5;--dcn-bg:rgba(139,110,245,.09);--dcn-bd:rgba(139,110,245,.24);' +
        '--act:#e89430;--act-bg:rgba(232,148,48,.08);--act-bd:rgba(232,148,48,.24);' +
        '--rsk:#e05252;--rsk-bg:rgba(224,82,82,.09);--rsk-bd:rgba(224,82,82,.24);' +
        '--nt:#48aa88;--nt-bg:rgba(72,170,136,.08);--nt-bd:rgba(72,170,136,.22);' +
        'font-family:"Outfit",system-ui,sans-serif;' +
        'display:flex;flex-direction:column;height:100%;' +
        'background:var(--void);color:var(--hi);overflow:hidden' +
      '}' +

      // Scrollbars
      '.ac-minutes-shell ::-webkit-scrollbar{width:4px;height:4px}' +
      '.ac-minutes-shell ::-webkit-scrollbar-track{background:transparent}' +
      '.ac-minutes-shell ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:2px}' +
      '.ac-minutes-shell ::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.26)}' +

      // Topbar
      '.ac-min-topbar{display:flex;align-items:center;gap:12px;padding:0 16px;height:48px;flex-shrink:0;background:var(--surface);border-bottom:1px solid rgba(255,255,255,.06)}' +
      '.ac-min-logo{font-weight:600;font-size:15px;letter-spacing:-.3px;color:var(--hi);flex-shrink:0}' +
      '.ac-min-logo em{font-style:normal;color:var(--dec)}' +
      '.ac-min-state-badge{font-size:11px;font-weight:600;border-radius:20px;padding:2px 10px;flex-shrink:0;white-space:nowrap;transition:background .2s,color .2s}' +
      '.ac-min-state-badge--review{color:var(--act);background:rgba(232,148,48,.10);border:1px solid rgba(232,148,48,.25)}' +
      '.ac-min-state-badge--ready{color:var(--nt);background:rgba(72,170,136,.10);border:1px solid rgba(72,170,136,.25)}' +
      '.ac-min-state-badge--sent{color:var(--dec);background:var(--dec-bg);border:1px solid var(--dec-bd)}' +
      '.ac-min-title{flex:1;min-width:0;font-size:14px;font-weight:500;color:var(--hi);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.ac-min-preview-btn{font-size:11px;font-weight:500;color:var(--lo);background:transparent;border:1px solid rgba(255,255,255,.10);border-radius:6px;padding:4px 12px;cursor:not-allowed;opacity:.35;flex-shrink:0;font-family:inherit}' +
      '.ac-min-send-btn{font-size:11px;font-weight:600;border-radius:6px;padding:4px 14px;flex-shrink:0;cursor:pointer;transition:opacity .15s,background .15s;font-family:inherit}' +
      '.ac-min-send-btn--disabled{color:var(--lo);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);cursor:not-allowed;opacity:.5}' +
      '.ac-min-send-btn--enabled{color:#fff;background:var(--nt);border:1px solid var(--nt-bd)}' +
      '.ac-min-send-btn--enabled:hover{opacity:.85}' +
      '.ac-min-send-btn--sent{color:var(--dec);background:var(--dec-bg);border:1px solid var(--dec-bd);cursor:default}' +
      '.ac-min-user-chip{display:flex;align-items:center;gap:7px;flex-shrink:0;padding:3px 10px 3px 5px;border-radius:20px;background:var(--b0);border:1px solid rgba(255,255,255,.07)}' +
      '.ac-min-user-avatar{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:var(--dec);background:var(--dec-bg);flex-shrink:0}' +
      '.ac-min-user-name{font-size:11px;font-weight:500;color:var(--md);white-space:nowrap}' +

      // Body layout
      '.ac-min-body{display:flex;flex:1;min-height:0;overflow:hidden}' +

      // Sidebar
      '.ac-min-sidebar{width:240px;flex-shrink:0;display:flex;flex-direction:column;background:var(--surface);border-right:1px solid rgba(255,255,255,.06);overflow-y:auto}' +
      '.ac-min-sb-section{padding:14px 14px 2px}' +
      '.ac-min-sb-label{display:block;font-size:11px;font-weight:700;color:var(--hi);letter-spacing:.10em;text-transform:uppercase;margin-bottom:6px}' +

      // Checklist
      '.ac-min-checklist{padding:0 8px 10px}' +
      '.ac-min-check-row{display:flex;align-items:center;gap:10px;padding:5px 8px;border-radius:5px;cursor:pointer;transition:background .1s;user-select:none}' +
      '.ac-min-check-row:hover{background:var(--raised)}' +
      '.ac-min-circle{width:16px;height:16px;border-radius:50%;border:1px solid var(--b2);display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s,border-color .15s;font-size:0}' +
      '.ac-min-circle.checked{background:var(--nt);border-color:var(--nt);font-size:9px;font-weight:700;color:#fff;line-height:1}' +
      '.ac-min-check-label{font-size:12px;color:var(--md)}' +

      // Sections nav
      '.ac-min-nav{padding:0 8px 10px}' +
      '.ac-min-nav-item{display:flex;align-items:center;gap:7px;padding:5px 8px;border-radius:5px;cursor:pointer;font-size:12px;color:var(--md);text-decoration:none;transition:background .1s,color .1s}' +
      '.ac-min-nav-item:hover{background:var(--raised);color:var(--hi)}' +
      '.ac-min-nav-item.active{background:var(--b1);color:var(--hi);font-weight:600}' +
      '.ac-min-nav-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}' +
      '.ac-min-nav-lbl{flex:1}' +
      '.ac-min-nav-count{font-size:10px;color:var(--lo);flex-shrink:0}' +

      // Recipients
      '.ac-min-recipients{padding:0 8px 16px}' +
      '.ac-min-rec-row{display:flex;align-items:center;gap:8px;padding:4px 8px;border-radius:5px;cursor:pointer;transition:background .1s;user-select:none}' +
      '.ac-min-rec-row:hover{background:var(--raised)}' +
      '.ac-min-rec-avatar{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:var(--dec);background:var(--dec-bg);flex-shrink:0}' +
      '.ac-min-rec-name{flex:1;min-width:0;font-size:12px;color:var(--md);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.ac-min-rec-check{width:14px;height:14px;border-radius:3px;border:1px solid var(--b2);display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s;font-size:0}' +
      '.ac-min-rec-check.checked{background:var(--nt);border-color:var(--nt);font-size:8px;font-weight:700;color:#fff;line-height:1}' +
      '.ac-min-add-ext-link{display:block;padding:5px 8px;font-size:11px;color:var(--dec);cursor:pointer;border-radius:5px;transition:background .1s;text-decoration:none}' +
      '.ac-min-add-ext-link:hover{background:var(--raised)}' +
      '.ac-min-ext-input-row{display:flex;gap:6px;padding:4px 8px;align-items:center}' +
      '.ac-min-ext-input{flex:1;background:var(--raised);border:1px solid rgba(255,255,255,.10);border-radius:5px;padding:5px 8px;font-size:11px;font-family:inherit;color:var(--hi);outline:none;transition:border-color .15s}' +
      '.ac-min-ext-input:focus{border-color:rgba(74,140,245,.4)}' +
      '.ac-min-ext-add-btn{font-size:10px;font-weight:600;color:var(--dec);background:var(--dec-bg);border:1px solid var(--dec-bd);border-radius:4px;padding:4px 9px;cursor:pointer;font-family:inherit;flex-shrink:0}' +
      '.ac-min-ext-add-btn:hover{opacity:.8}' +

      // Canvas
      '.ac-min-canvas{flex:1;min-width:0;overflow-y:auto;padding:0}' +

      // Canvas meeting title
      '.ac-min-mtg-title{font-size:26px;font-weight:600;color:var(--hi);padding:24px 28px 0;line-height:1.2}' +

      // Section chrome
      '.ac-min-sec{margin-bottom:0}' +
      '.ac-min-sec-header{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:10px;padding:10px 24px;background:var(--void);border-bottom:1px solid rgba(255,255,255,.06);cursor:pointer;user-select:none}' +
      '.ac-min-sec-bar{width:4px;height:16px;border-radius:2px;flex-shrink:0}' +
      '.ac-min-sec-title{font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--md);flex:1}' +
      '.ac-min-sec-add{font-size:11px;font-weight:600;color:var(--dec);background:var(--dec-bg);border:1px solid var(--dec-bd);border-radius:5px;padding:3px 10px;cursor:pointer;flex-shrink:0;transition:opacity .1s;font-family:inherit}' +
      '.ac-min-sec-add:hover{opacity:.8}' +
      '.ac-min-sec-chevron{font-size:20px;color:var(--md);transition:transform .15s;flex-shrink:0;line-height:1}' +
      '.ac-min-sec-chevron.open{transform:rotate(90deg)}' +
      '.ac-min-sec-body{padding:16px 24px 20px}' +
      '.ac-min-sec-placeholder{font-size:12px;color:var(--lo);font-style:italic}'
    );
  }

  // ── HTML builders ────────────────────────────────────────────
  function _userChipHtml() {
    var me = window.Accord && window.Accord.state && window.Accord.state.me;
    var name = (me && me.name) || '';
    return '<div class="ac-min-user-chip">' +
      '<span class="ac-min-user-avatar">'+_esc(_initials(name))+'</span>' +
      (name ? '<span class="ac-min-user-name">'+_esc(name)+'</span>' : '') +
    '</div>';
  }

  function _checklistHtml() {
    return _CHECKLIST.map(function(item) {
      return '<div class="ac-min-check-row" data-check-id="'+item.id+'">' +
        '<span class="ac-min-circle" id="ac-min-cc-'+item.id+'"></span>' +
        '<span class="ac-min-check-label">'+_esc(item.label)+'</span>' +
      '</div>';
    }).join('');
  }

  function _navHtml() {
    return _NAV.map(function(n) {
      return '<a class="ac-min-nav-item" data-nav-sec="'+n.secId+'" href="#'+n.secId+'">' +
        '<span class="ac-min-nav-dot" style="background:'+n.dot+'"></span>' +
        '<span class="ac-min-nav-lbl">'+_esc(n.label)+'</span>' +
        (n.countKey
          ? '<span class="ac-min-nav-count" id="ac-min-nc-'+n.countKey+'">\u2014</span>'
          : '') +
      '</a>';
    }).join('');
  }

  function _canvasHtml(meeting) {
    var titleHtml = '<div class="ac-min-mtg-title">'+_esc(meeting.title||'Untitled')+'</div>';
    var sectionsHtml = _SECTIONS.map(function(sec) {
      return '<div class="ac-min-sec" id="'+sec.id+'">' +
        '<div class="ac-min-sec-header" data-sec-toggle="'+sec.id+'">' +
          '<span class="ac-min-sec-bar" style="background:'+sec.bar+'"></span>' +
          '<span class="ac-min-sec-title">'+_esc(sec.title)+'</span>' +
          (sec.add
            ? '<button type="button" class="ac-min-sec-add" data-sec-add="'+sec.id+'">+ Add</button>'
            : '') +
          '<span class="ac-min-sec-chevron open">\u25b6</span>' +
        '</div>' +
        '<div class="ac-min-sec-body" id="ac-min-sb-'+sec.id+'">' +
          '<div class="ac-min-sec-placeholder">Content loads in Phase 3 &amp; 4.</div>' +
        '</div>' +
      '</div>';
    }).join('');
    return titleHtml + sectionsHtml;
  }

  function _shellHtml(meeting) {
    return '<div class="ac-minutes-shell" id="ac-min-shell">' +
      '<style>'+_css()+'</style>' +
      // Topbar
      '<div class="ac-min-topbar">' +
        '<span class="ac-min-logo">accord<em>.</em></span>' +
        '<span class="ac-min-state-badge ac-min-state-badge--review" id="ac-min-badge">Under Review</span>' +
        '<span class="ac-min-title">'+_esc((meeting.title||'Untitled')+' \u00b7 Minutes')+'</span>' +
        '<button type="button" class="ac-min-preview-btn" disabled>Preview \u2192</button>' +
        '<button type="button" class="ac-min-send-btn ac-min-send-btn--disabled" id="ac-min-send-btn" disabled>Route + Send \u2191</button>' +
        _userChipHtml() +
      '</div>' +
      // Body
      '<div class="ac-min-body">' +
        // Sidebar
        '<div class="ac-min-sidebar" id="ac-min-sidebar">' +
          '<div class="ac-min-sb-section"><span class="ac-min-sb-label">Review Checklist</span></div>' +
          '<div class="ac-min-checklist" id="ac-min-checklist">'+_checklistHtml()+'</div>' +
          '<div class="ac-min-sb-section"><span class="ac-min-sb-label">Sections</span></div>' +
          '<nav class="ac-min-nav" id="ac-min-nav">'+_navHtml()+'</nav>' +
          '<div class="ac-min-sb-section"><span class="ac-min-sb-label">Recipients</span></div>' +
          '<div class="ac-min-recipients" id="ac-min-recipients"><div style="font-size:11px;color:var(--lo);padding:4px 8px">Loading\u2026</div></div>' +
        '</div>' +
        // Canvas
        '<div class="ac-min-canvas" id="ac-min-canvas">'+_canvasHtml(meeting)+'</div>' +
      '</div>' +
    '</div>';
  }

  // ── Checklist ────────────────────────────────────────────────
  function _wireChecklist() {
    var cl = document.getElementById('ac-min-checklist'); if (!cl) return;
    cl.addEventListener('click', function(ev) {
      var row = ev.target.closest('.ac-min-check-row'); if (!row) return;
      var id = row.dataset.checkId;
      _checkedItems[id] = !_checkedItems[id];
      var circle = document.getElementById('ac-min-cc-' + id);
      if (circle) {
        circle.classList.toggle('checked', !!_checkedItems[id]);
        circle.textContent = _checkedItems[id] ? '\u2713' : '';
      }
      _updateSendGate();
    });
  }

  function _updateSendGate() {
    var allChecked = _CHECKLIST.every(function(item) { return !!_checkedItems[item.id]; });
    var btn   = document.getElementById('ac-min-send-btn');
    var badge = document.getElementById('ac-min-badge');
    if (allChecked) {
      if (btn)   { btn.disabled = false; btn.className = 'ac-min-send-btn ac-min-send-btn--enabled'; }
      if (badge) { badge.className = 'ac-min-state-badge ac-min-state-badge--ready'; badge.textContent = 'Ready to Send'; }
    } else {
      if (btn)   { btn.disabled = true; btn.className = 'ac-min-send-btn ac-min-send-btn--disabled'; }
      if (badge) { badge.className = 'ac-min-state-badge ac-min-state-badge--review'; badge.textContent = 'Under Review'; }
    }
  }

  // ── Section collapse/expand ──────────────────────────────────
  function _wireSectionToggles() {
    var canvas = document.getElementById('ac-min-canvas'); if (!canvas) return;
    canvas.addEventListener('click', function(ev) {
      if (ev.target.closest('[data-sec-add]')) return;  // + Add handled by Phases 3/4
      var hdr = ev.target.closest('[data-sec-toggle]'); if (!hdr) return;
      var secId = hdr.dataset.secToggle;
      var body  = document.getElementById('ac-min-sb-' + secId);
      var chev  = hdr.querySelector('.ac-min-sec-chevron');
      if (!body) return;
      var open = body.style.display !== 'none';
      body.style.display = open ? 'none' : '';
      if (chev) chev.classList.toggle('open', !open);
    });
  }

  // ── Sections nav — scroll observer ──────────────────────────
  function _wireNavObserver() {
    var canvas = document.getElementById('ac-min-canvas'); if (!canvas) return;
    var secIds = _NAV.map(function(n) { return n.secId; });

    function _update() {
      var cr = canvas.getBoundingClientRect();
      var active = secIds[0];
      secIds.forEach(function(id) {
        var el = document.getElementById(id); if (!el) return;
        if (el.getBoundingClientRect().top - cr.top <= 10) {
          var cur = document.getElementById(active);
          if (el.offsetTop > (cur ? cur.offsetTop : -1)) active = id;
        }
      });
      document.querySelectorAll('.ac-min-nav-item').forEach(function(link) {
        link.classList.toggle('active', link.dataset.navSec === active);
      });
    }

    canvas.addEventListener('scroll', _update, { passive: true });
    _update();
  }

  // ── Sections nav — click ─────────────────────────────────────
  function _wireNavClicks() {
    document.querySelectorAll('.ac-min-nav-item').forEach(function(link) {
      link.addEventListener('click', function(ev) {
        ev.preventDefault();
        var secId = link.dataset.navSec;
        // Expand section if collapsed
        var body = document.getElementById('ac-min-sb-' + secId);
        var hdr  = document.querySelector('[data-sec-toggle="'+secId+'"]');
        var chev = hdr ? hdr.querySelector('.ac-min-sec-chevron') : null;
        if (body && body.style.display === 'none') {
          body.style.display = '';
          if (chev) chev.classList.add('open');
        }
        var target = document.getElementById(secId);
        if (target) setTimeout(function() { target.scrollIntoView({ behavior:'smooth', block:'start' }); }, 60);
      });
    });
  }

  // ── Recipients ───────────────────────────────────────────────
  function _loadRecipients(meetingId) {
    if (!meetingId) return;
    API.get('accord_meeting_attendees?meeting_id=eq.'+meetingId+'&select=attendee_id,resource_id,role_in_meeting,rsvp_status')
      .then(function(rows) {
        rows = rows || [];
        if (!rows.length) { _renderRecipients([]); return; }
        var rids = rows.map(function(r) { return r.resource_id; });
        API.get('resources?id=in.('+rids.join(',')+')&select=id,name')
          .then(function(res) {
            var nm = {}; (res||[]).forEach(function(r) { nm[r.id] = r.name; });
            _attendees = rows.map(function(a) {
              return { resource_id: a.resource_id, name: nm[a.resource_id]||'Unknown', checked: true };
            });
            _renderRecipients();
          }).catch(function() { _renderRecipients(); });
      }).catch(function() { _renderRecipients(); });
  }

  function _renderRecipients() {
    var container = document.getElementById('ac-min-recipients'); if (!container) return;
    var html = _attendees.map(function(a) {
      return '<div class="ac-min-rec-row" data-rec-id="'+_esc(a.resource_id)+'">' +
        '<span class="ac-min-rec-avatar">'+_esc(_initials(a.name))+'</span>' +
        '<span class="ac-min-rec-name">'+_esc(a.name)+'</span>' +
        '<span class="ac-min-rec-check'+(a.checked?' checked':'') +
          '" id="ac-min-rck-'+_esc(a.resource_id)+'">'+(a.checked?'\u2713':'')+'</span>' +
      '</div>';
    }).join('');

    _externalRecs.forEach(function(ext) {
      html += '<div class="ac-min-rec-row" data-rec-ext="'+_esc(ext.email)+'">' +
        '<span class="ac-min-rec-avatar" style="font-size:8px;letter-spacing:0">EXT</span>' +
        '<span class="ac-min-rec-name">'+_esc(ext.email)+'</span>' +
        '<span class="ac-min-rec-check'+(ext.checked?' checked':'')+'">'+
          (ext.checked?'\u2713':'')+'</span>' +
      '</div>';
    });

    html += '<a class="ac-min-add-ext-link" id="ac-min-add-ext">+ Add external recipient\u2026</a>' +
      '<div id="ac-min-ext-wrap" style="display:none">' +
        '<div class="ac-min-ext-input-row">' +
          '<input type="email" class="ac-min-ext-input" id="ac-min-ext-input" placeholder="email@example.com" />' +
          '<button type="button" class="ac-min-ext-add-btn" id="ac-min-ext-add">Add</button>' +
        '</div>' +
      '</div>';

    container.innerHTML = html;
    _wireRecipientClicks(container);
  }

  function _wireRecipientClicks(container) {
    // Toggle checkboxes
    container.addEventListener('click', function(ev) {
      var row = ev.target.closest('.ac-min-rec-row'); if (!row) return;
      var rid  = row.dataset.recId;
      var rext = row.dataset.recExt;
      if (rid) {
        var att = _attendees.find(function(a) { return a.resource_id === rid; });
        if (att) {
          att.checked = !att.checked;
          var chk = document.getElementById('ac-min-rck-'+rid);
          if (chk) { chk.classList.toggle('checked', att.checked); chk.textContent = att.checked?'\u2713':''; }
        }
      } else if (rext) {
        var ext = _externalRecs.find(function(e) { return e.email === rext; });
        if (ext) {
          ext.checked = !ext.checked;
          var chkEl = row.querySelector('.ac-min-rec-check');
          if (chkEl) { chkEl.classList.toggle('checked', ext.checked); chkEl.textContent = ext.checked?'\u2713':''; }
        }
      }
    });

    // External recipient input
    var addLink = document.getElementById('ac-min-add-ext');
    var wrap    = document.getElementById('ac-min-ext-wrap');
    var input   = document.getElementById('ac-min-ext-input');
    var addBtn  = document.getElementById('ac-min-ext-add');
    if (!addLink || !wrap) return;

    addLink.addEventListener('click', function(ev) {
      ev.preventDefault();
      wrap.style.display = '';
      if (input) { input.value = ''; setTimeout(function() { input.focus(); }, 0); }
    });

    function _commitExt() {
      var email = input ? input.value.trim() : '';
      if (!email || email.indexOf('@') < 1) return;
      _externalRecs.push({ email: email, checked: true });
      wrap.style.display = 'none';
      _renderRecipients();
    }

    if (addBtn) addBtn.addEventListener('click', _commitExt);
    if (input) input.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); _commitExt(); }
    });
  }

  // ── Section counts (non-blocking) ────────────────────────────
  function _loadSectionCounts(meetingId) {
    if (!meetingId) return;

    API.get('accord_meeting_outcomes?meeting_id=eq.'+meetingId+'&select=outcome_id')
      .then(function(rows) { _setCount('outcomes', (rows||[]).length); }).catch(function(){});

    API.get('accord_agenda_items?meeting_id=eq.'+meetingId+'&select=agenda_item_id')
      .then(function(rows) { _setCount('agenda', (rows||[]).length); }).catch(function(){});

    API.get('accord_nodes?meeting_id=eq.'+meetingId+'&tag=in.(decision,action,risk,dissent,question)&select=node_id,tag')
      .then(function(rows) {
        rows = rows || [];
        var dc = 0; var ax = 0; var rk = 0; var pk = 0;
        rows.forEach(function(n) {
          if (n.tag==='decision') dc++;
          else if (n.tag==='action') ax++;
          else if (n.tag==='risk'||n.tag==='dissent') rk++;
          else if (n.tag==='question') pk++;
        });
        _setCount('decisions', dc);
        _setCount('actions',   ax);
        _setCount('risks',     rk);
        _setCount('parking',   pk);
      }).catch(function(){});
  }

  function _setCount(key, n) {
    var el = document.getElementById('ac-min-nc-' + key);
    if (el) el.textContent = n > 0 ? String(n) : '\u2014';
  }

  // ── Route + Send placeholder (Phase 5) ──────────────────────
  function _wireSendBtn() {
    var btn = document.getElementById('ac-min-send-btn'); if (!btn) return;
    btn.addEventListener('click', function() {
      if (btn.disabled) return;
      // Phase 5: open Route + Send modal
      console.log('[AccordMinutes] Route + Send — Phase 5 scope');
    });
  }

  // ── Level-changed listener ───────────────────────────────────
  function _onLevelChanged() {
    window.removeEventListener('accord:level-changed', _onLevelChanged);
    destroy();
  }

  // ── Teardown ─────────────────────────────────────────────────
  function _teardown() {
    _removeSuppressionStyles();
    var host = document.getElementById('ac-meeting-surface-host');
    if (host) host.innerHTML = '';
    _meeting      = null;
    _myResourceId = null;
    _attendees    = [];
    _externalRecs = [];
    _checkedItems = {};
  }

  // ── Public API ───────────────────────────────────────────────
  function render(meeting) {
    _meeting      = meeting;
    _myResourceId = (window.Accord&&window.Accord.state&&window.Accord.state.me&&window.Accord.state.me.resource_id)||null;

    _ensureOutfitFont();
    _injectSuppressionStyles();

    var host = document.getElementById('ac-meeting-surface-host');
    if (!host) { console.error('[AccordMinutes] #ac-meeting-surface-host not found'); return; }

    host.innerHTML = _shellHtml(meeting);

    _wireChecklist();
    _wireSectionToggles();
    _wireNavObserver();
    _wireNavClicks();
    _wireSendBtn();
    _loadRecipients(meeting.meeting_id);
    _loadSectionCounts(meeting.meeting_id);

    window.removeEventListener('accord:level-changed', _onLevelChanged);
    window.addEventListener('accord:level-changed',    _onLevelChanged);
  }

  function destroy() {
    _teardown();
    window.removeEventListener('accord:level-changed', _onLevelChanged);
  }

  return { render: render, destroy: destroy };

})();