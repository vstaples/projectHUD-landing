// ============================================================
// accord-live-capture.js
// CMD-ACCORD-LIVE-CAPTURE-1 · Phase 3 + Phase 4
// 2026-05-17 · Operator: Vaughn Staples
//
// Live Capture surface — two-column (sidebar + canvas) running-
// meeting shell. Replaces the 5-tab shell when meeting.state
// is 'running'. Registered via AccordLiveCapture.render() called
// from accord-views.js:renderMeetingView().
//
// Phase 3: topbar + sidebar (attendees + chat) wired.
// Phase 4: Agenda canvas section — accordion, history, capture,
//          reclassify popup, discussed/skipped status transitions,
//          remote-node / remote-agenda fan-in.
//
// Iron Rules: 36, 40 section1, 47, 64, 71, 72, 73 in force.
// var only — no let/const.
// ============================================================

var AccordLiveCapture = (function () {
  'use strict';

  var API = window.API;

  // Module state
  var _meeting            = null;
  var _timerInterval      = null;
  var _chatSubscription   = null;
  var _chatMessages       = [];
  var _myResourceId       = null;
  var _attendeeNameMap    = {};
  var _presencePollTimer  = null;
  var _intersectionObs    = null;

  // Agenda state
  var _agendaItems         = [];
  var _agendaExpanded      = {};
  var _agendaHistCollapsed = {};
  var _agendaNewCounts     = {};
  var _agendaSectionOpen   = true;

  // Phase 5 section state
  var _sectionNodes = { decision: [], action: [], risk: [], question: [] };
  var _sectionAttendees = [];   // meeting attendees for PersonPicker in Actions
  var _actionAssignee = null;   // pending assignee from PersonPicker in add row

  // Sidebar resize
  var _sidebarDragging   = false;
  var _sidebarStartX     = 0;
  var _sidebarStartWidth = 0;
  var _SIDEBAR_MIN       = 160;
  var _SIDEBAR_MAX       = 320;
  var _SIDEBAR_DEFAULT   = 240;
  var _SIDEBAR_KEY       = 'accord.lc.sidebar.width';

  function _esc(s) {
    return String(s != null ? s : '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _fmtDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
    catch (e) { return ''; }
  }

  function _fmtTime(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return ''; }
  }

  function _ensureOutfitFont() {
    if (document.querySelector('link[data-accord-outfit]')) return;
    var link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap';
    link.setAttribute('data-accord-outfit', '1');
    document.head.appendChild(link);
  }

  // Tag helpers
  function _tagColor(tag) {
    var m = { decision: 'var(--dec)', note: 'var(--nt)', action: 'var(--act)', risk: 'var(--rsk)', dissent: 'var(--rsk)', question: 'var(--md)' };
    return m[tag] || 'var(--md)';
  }
  function _tagBg(tag) {
    var m = { decision: 'var(--dec-bg)', note: 'var(--nt-bg)', action: 'var(--act-bg)', risk: 'var(--rsk-bg)', dissent: 'var(--rsk-bg)', question: 'rgba(255,255,255,.06)' };
    return m[tag] || 'rgba(255,255,255,.06)';
  }
  function _tagLabel(tag) {
    var m = { decision: 'DC', note: 'NT', action: 'AX', risk: 'RK', dissent: 'DS', question: 'Q' };
    return m[tag] || tag.toUpperCase().slice(0,2);
  }

  // CSS
  function _css() {
    return '.ac-live-capture-shell{--void:#0b0d14;--surface:#10131e;--raised:#171c2e;--hover:#1d2338;--b0:#1e2438;--b1:#252d44;--b2:#313d5e;--hi:#dce6f5;--md:#8899b2;--lo:#7a8a9a;--dec:#4a8cf5;--dec-bg:rgba(74,140,245,.09);--dec-bd:rgba(74,140,245,.24);--act:#e89430;--act-bg:rgba(232,148,48,.08);--act-bd:rgba(232,148,48,.24);--rsk:#e05252;--rsk-bg:rgba(224,82,82,.09);--rsk-bd:rgba(224,82,82,.24);--nt:#48aa88;--nt-bg:rgba(72,170,136,.08);--nt-bd:rgba(72,170,136,.22);--live:#34d499;font-family:"Outfit",system-ui,sans-serif;display:flex;flex-direction:column;height:100%;background:var(--void);color:var(--hi);overflow:hidden}' +
    '.ac-live-capture-shell ::-webkit-scrollbar{width:4px;height:4px}.ac-live-capture-shell ::-webkit-scrollbar-track{background:transparent}.ac-live-capture-shell ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:2px}.ac-live-capture-shell ::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.26)}' +
    '.ac-lc-topbar{display:flex;align-items:center;gap:12px;padding:0 16px;height:48px;flex-shrink:0;background:var(--surface);border-bottom:1px solid rgba(255,255,255,.06)}' +
    '.ac-lc-logo{font-weight:600;font-size:15px;letter-spacing:-.3px;color:var(--hi)}.ac-lc-logo em{font-style:normal;color:var(--dec)}' +
    '.ac-lc-live-pill{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:500;color:var(--live);background:rgba(52,212,153,.10);border:1px solid rgba(52,212,153,.22);border-radius:20px;padding:2px 9px;flex-shrink:0}' +
    '.ac-lc-live-dot{width:6px;height:6px;border-radius:50%;background:var(--live);animation:ac-lc-pulse 2s ease-in-out infinite}' +
    '@keyframes ac-lc-pulse{0%,100%{opacity:1}50%{opacity:.35}}' +
    '.ac-lc-title{flex:1;min-width:0;font-size:14px;font-weight:500;color:var(--hi);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.ac-lc-progress-wrap{flex-shrink:0;display:flex;align-items:center;gap:8px}' +
    '.ac-lc-progress{display:flex;gap:2px;height:4px;border-radius:2px;overflow:hidden;width:80px}' +
    '.ac-lc-seg{height:4px;flex:1;border-radius:1px}.ac-lc-seg--done{background:var(--dec)}.ac-lc-seg--active{background:rgba(74,140,245,.5)}.ac-lc-seg--todo{background:rgba(255,255,255,.12)}' +
    '.ac-lc-timer{font-size:12px;font-weight:500;font-family:"SF Mono","JetBrains Mono",monospace;color:var(--md);flex-shrink:0;min-width:44px;text-align:right}' +
    '.ac-lc-end-btn{font-size:11px;font-weight:600;letter-spacing:.3px;color:var(--rsk);background:var(--rsk-bg);border:1px solid var(--rsk-bd);border-radius:6px;padding:4px 12px;cursor:not-allowed;opacity:.35;pointer-events:none;flex-shrink:0}' +
    '.ac-lc-body{display:flex;flex:1;min-height:0;overflow:hidden}' +
    '.ac-lc-sidebar{display:flex;flex-direction:column;flex-shrink:0;position:relative;background:var(--surface);border-right:1px solid rgba(255,255,255,.06);overflow:hidden;min-width:160px;max-width:320px}' +
    '.ac-lc-resize-handle{position:absolute;top:0;right:-3px;bottom:0;width:6px;cursor:col-resize;z-index:10;transition:background .15s}.ac-lc-resize-handle:hover,.ac-lc-resize-handle.dragging{background:rgba(74,140,245,.3)}' +
    '.ac-lc-sidebar-inner{flex:1;overflow-y:auto;display:flex;flex-direction:column}' +
    '.ac-lc-section-label{font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--lo);padding:14px 14px 6px}' +
    '.ac-lc-nav{padding:0 8px 10px}.ac-lc-nav-item{display:block;padding:5px 8px;border-radius:5px;font-size:12px;color:var(--md);text-decoration:none;cursor:pointer;transition:background .1s,color .1s}.ac-lc-nav-item:hover,.ac-lc-nav-item.active{background:var(--raised);color:var(--hi)}' +
    '.ac-lc-attendees{padding:0 8px 10px}.ac-lc-attendee-row{display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:5px;font-size:12px;transition:opacity .2s}.ac-lc-attendee-row.absent{opacity:.45}.ac-lc-presence-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;background:rgba(255,255,255,.18)}.ac-lc-presence-dot.present{background:var(--live)}.ac-lc-attendee-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ac-lc-you-tag{font-size:9px;font-weight:600;letter-spacing:.5px;color:var(--dec);text-transform:uppercase;flex-shrink:0}' +
    '.ac-lc-chat{display:flex;flex-direction:column;flex:1;min-height:0;border-top:1px solid rgba(255,255,255,.06)}.ac-lc-chat-viewport{flex:1;overflow-y:auto;padding:10px 10px 6px;background:rgba(72,170,136,.025);border:1px solid rgba(72,170,136,.10);margin:6px 8px 0;border-radius:8px 8px 0 0;display:flex;flex-direction:column;gap:2px}.ac-lc-chat-msg-group{display:flex;flex-direction:column;margin-bottom:6px}.ac-lc-chat-msg-header{display:flex;gap:6px;align-items:baseline;font-size:10px;color:var(--lo);margin-bottom:2px;padding:0 2px}.ac-lc-chat-msg-header.me{justify-content:flex-end}.ac-lc-chat-msg-author{font-weight:500;color:var(--md)}.ac-lc-chat-msg-row{display:flex}.ac-lc-chat-msg-row.me{justify-content:flex-end}.ac-lc-chat-msg-row.other{justify-content:flex-start}.ac-lc-chat-bubble{max-width:82%;border-radius:10px;font-size:12px;line-height:1.45;padding:6px 10px;word-break:break-word}.ac-lc-chat-msg-row.me .ac-lc-chat-bubble{background:var(--dec-bg);border:1px solid var(--dec-bd);color:var(--hi);border-radius:10px 10px 2px 10px}.ac-lc-chat-msg-row.other .ac-lc-chat-bubble{background:var(--raised);border:1px solid rgba(255,255,255,.06);color:var(--hi);border-radius:10px 10px 10px 2px}.ac-lc-chat-input-row{display:flex;gap:6px;padding:6px 8px 10px}.ac-lc-chat-input{flex:1;background:var(--raised);border:1px solid rgba(255,255,255,.10);border-radius:6px;padding:6px 10px;font-size:12px;font-family:inherit;color:var(--hi);resize:none;min-height:32px;max-height:80px;outline:none;transition:border-color .15s}.ac-lc-chat-input:focus{border-color:rgba(74,140,245,.4)}.ac-lc-chat-send{font-size:11px;font-weight:600;color:var(--dec);background:var(--dec-bg);border:1px solid var(--dec-bd);border-radius:6px;padding:6px 12px;cursor:pointer;flex-shrink:0;transition:background .15s}.ac-lc-chat-send:hover{background:rgba(74,140,245,.16)}.ac-lc-chat-empty{flex:1;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--lo);font-style:italic}' +
    '.ac-lc-canvas{flex:1;min-width:0;overflow-y:auto;padding:0}' +
    '.ac-lc-sec-header{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:10px;padding:10px 20px;background:var(--void);border-bottom:1px solid rgba(255,255,255,.06);cursor:pointer;user-select:none}' +
    '.ac-lc-sec-bar{width:3px;height:16px;border-radius:2px;flex-shrink:0}.ac-lc-sec-bar--agenda{background:var(--nt)}.ac-lc-sec-bar--decisions{background:var(--dec)}.ac-lc-sec-bar--actions{background:var(--act)}.ac-lc-sec-bar--risks{background:var(--rsk)}.ac-lc-sec-bar--parking{background:var(--md)}' +
    '.ac-lc-sec-title{font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--md);flex:1}.ac-lc-sec-meta{font-size:11px;color:var(--lo)}.ac-lc-sec-chevron{font-size:10px;color:var(--lo);transition:transform .15s}.ac-lc-sec-chevron.open{transform:rotate(90deg)}' +
    '.ac-lc-sec-body{padding:0 20px 16px}.ac-lc-sec-placeholder{font-size:12px;color:var(--lo);font-style:italic;padding:20px 20px 24px}' +
    '.ac-lc-prior-strip{margin-bottom:12px;border-radius:6px;border:1px solid var(--act-bd);overflow:hidden}.ac-lc-prior-strip-header{display:flex;align-items:center;gap:8px;padding:7px 12px;background:var(--act-bg);cursor:pointer;font-size:11px;font-weight:600;color:var(--act)}.ac-lc-prior-pill{font-size:10px;font-weight:600;border-radius:10px;padding:1px 7px}.ac-lc-prior-pill--overdue{background:var(--rsk-bg);color:var(--rsk);border:1px solid var(--rsk-bd)}.ac-lc-prior-pill--open{background:var(--act-bg);color:var(--act);border:1px solid var(--act-bd)}.ac-lc-prior-strip-body{display:none}.ac-lc-prior-strip-body.open{display:block}.ac-lc-prior-row{display:flex;align-items:baseline;gap:8px;padding:5px 12px;border-top:1px solid rgba(255,255,255,.04);font-size:11px}.ac-lc-prior-seq{font-family:monospace;font-size:10px;color:var(--act);flex-shrink:0}.ac-lc-prior-summary{flex:1;color:var(--md)}.ac-lc-prior-overdue-dot{color:var(--rsk);font-size:9px;flex-shrink:0}' +
    '.ac-lc-agenda-item{border-radius:8px;margin-bottom:6px;border:1px solid rgba(255,255,255,.06);overflow:visible}.ac-lc-agenda-item-header{display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;background:var(--surface);border-radius:8px;transition:background .1s}.ac-lc-agenda-item-header:hover{background:var(--raised)}.ac-lc-agenda-item.expanded .ac-lc-agenda-item-header{border-radius:8px 8px 0 0}.ac-lc-item-chevron{font-size:9px;color:var(--lo);transition:transform .15s;flex-shrink:0}.ac-lc-item-chevron.open{transform:rotate(90deg)}.ac-lc-item-num{font-size:11px;color:var(--lo);flex-shrink:0;min-width:18px}.ac-lc-item-title{flex:1;font-size:13px;font-weight:500;color:var(--hi)}.ac-lc-active-badge{font-size:10px;font-weight:600;color:var(--live);background:rgba(52,212,153,.10);border:1px solid rgba(52,212,153,.22);border-radius:10px;padding:1px 8px;flex-shrink:0}.ac-lc-new-badge{font-size:10px;font-weight:600;color:var(--dec);background:var(--dec-bg);border:1px solid var(--dec-bd);border-radius:10px;padding:1px 7px;flex-shrink:0}.ac-lc-item-status-btn{font-size:10px;font-weight:600;border-radius:5px;padding:2px 9px;cursor:pointer;border:none;flex-shrink:0;transition:opacity .1s}.ac-lc-item-status-btn:hover{opacity:.8}.ac-lc-item-status-btn--discuss{color:var(--nt);background:var(--nt-bg);border:1px solid var(--nt-bd)}.ac-lc-item-status-btn--skip{color:var(--lo);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10)}.ac-lc-item-status-btn--done{color:var(--dec);background:var(--dec-bg);border:1px solid var(--dec-bd);cursor:default}.ac-lc-item-status-btn--skipped{color:var(--lo);background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);cursor:default;text-decoration:line-through}.ac-lc-agenda-item-body{padding:0 12px 12px;background:var(--surface);border-top:1px solid rgba(255,255,255,.04);border-radius:0 0 8px 8px}' +
    '.ac-lc-history-header{display:flex;align-items:center;gap:6px;padding:9px 0 6px;cursor:pointer;font-size:10px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--lo);user-select:none}.ac-lc-history-meta{margin-left:auto;font-size:10px;color:var(--lo);font-weight:400;text-transform:none;letter-spacing:0}.ac-lc-history-chevron{font-size:9px;transition:transform .12s}.ac-lc-history-chevron.open{transform:rotate(90deg)}.ac-lc-history-body{display:none}.ac-lc-history-body.open{display:block}.ac-lc-history-row{display:flex;align-items:baseline;gap:8px;padding:4px 0;font-size:11px;border-bottom:1px solid rgba(255,255,255,.03)}.ac-lc-history-row:last-child{border-bottom:none}.ac-lc-history-date{color:var(--lo);flex-shrink:0}.ac-lc-history-badge{font-size:9px;font-weight:700;border-radius:3px;padding:1px 5px;flex-shrink:0}.ac-lc-history-text{flex:1;color:var(--md)}.ac-lc-no-history{font-size:11px;color:var(--lo);font-style:italic;padding:4px 0 8px}' +
    '.ac-lc-captured-label{font-size:10px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--lo);padding:8px 0 5px}.ac-lc-captured-row{display:flex;align-items:baseline;gap:8px;padding:4px 0;font-size:11px;border-bottom:1px solid rgba(255,255,255,.03)}.ac-lc-captured-row:last-child{border-bottom:none}.ac-lc-captured-badge{font-size:9px;font-weight:700;border-radius:3px;padding:1px 5px;flex-shrink:0;cursor:pointer;transition:opacity .1s}.ac-lc-captured-badge:hover{opacity:.75}.ac-lc-captured-text{flex:1;color:var(--md)}.ac-lc-captured-time{color:var(--lo);flex-shrink:0;font-size:10px}' +
    '.ac-lc-add-zone{margin-top:10px;position:relative}.ac-lc-add-textarea{width:100%;box-sizing:border-box;background:rgba(232,148,48,.025);border:1px solid rgba(232,148,48,.28);border-radius:6px;padding:8px 10px 32px;font-size:12px;font-family:inherit;color:var(--hi);resize:vertical;min-height:72px;outline:none;transition:background .15s,border-color .15s}.ac-lc-add-textarea:focus{background:rgba(232,148,48,.05);border-color:rgba(232,148,48,.5)}.ac-lc-add-btn{position:absolute;bottom:8px;right:8px;font-size:11px;font-weight:600;color:var(--nt);background:var(--nt-bg);border:1px solid var(--nt-bd);border-radius:5px;padding:3px 10px;cursor:pointer;transition:opacity .1s}.ac-lc-add-btn:hover{opacity:.8}' +
    '.ac-lc-reclassify-backdrop{position:fixed;inset:0;z-index:200}.ac-lc-reclassify-popup{position:fixed;z-index:201;background:var(--raised);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:14px;min-width:220px;box-shadow:0 8px 32px rgba(0,0,0,.5)}.ac-lc-reclassify-title{font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--lo);margin-bottom:10px}.ac-lc-reclassify-types{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}.ac-lc-reclassify-type{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:5px;cursor:pointer;font-size:12px;font-weight:500;transition:background .1s}.ac-lc-reclassify-type:hover,.ac-lc-reclassify-type.selected{background:var(--hover)}.ac-lc-reclassify-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}.ac-lc-reclassify-fields{display:flex;flex-direction:column;gap:6px;margin-bottom:10px}.ac-lc-reclassify-field{display:flex;flex-direction:column;gap:3px}.ac-lc-reclassify-field label{font-size:10px;color:var(--lo)}.ac-lc-reclassify-field input{background:var(--b0);border:1px solid rgba(255,255,255,.12);border-radius:4px;padding:4px 8px;font-size:12px;font-family:inherit;color:var(--hi);outline:none}.ac-lc-reclassify-field input:focus{border-color:rgba(74,140,245,.4)}.ac-lc-reclassify-actions{display:flex;gap:6px;justify-content:flex-end}.ac-lc-reclassify-cancel{font-size:11px;color:var(--lo);background:transparent;border:1px solid rgba(255,255,255,.10);border-radius:5px;padding:4px 10px;cursor:pointer}.ac-lc-reclassify-confirm{font-size:11px;font-weight:600;color:var(--hi);background:var(--dec);border:none;border-radius:5px;padding:4px 12px;cursor:pointer}.ac-lc-reclassify-confirm:hover{opacity:.88}' +
    '.ac-lc-empty-agenda{font-size:12px;color:var(--lo);font-style:italic;padding:16px 0}' +

    // Phase 5 section components
    '.ac-lc-sec-count{font-size:10px;color:var(--lo);margin-right:6px}' +
    '.ac-lc-sec-count--alert{color:var(--rsk)!important}' +
    '.ac-lc-sec-body-inner{padding:12px 20px 16px}' +
    '.ac-lc-sec-add-row{display:flex;gap:6px;padding:10px 0 2px;align-items:center}' +
    '.ac-lc-sec-add-input{flex:1;background:var(--raised);border:1px solid rgba(255,255,255,.10);border-radius:6px;padding:7px 10px;font-size:12px;font-family:inherit;color:var(--hi);outline:none;transition:border-color .15s}' +
    '.ac-lc-sec-add-input:focus{border-color:rgba(74,140,245,.4)}' +
    '.ac-lc-sec-add-btn{font-size:11px;font-weight:600;border-radius:6px;padding:6px 12px;cursor:pointer;flex-shrink:0;border:none;transition:opacity .1s}' +
    '.ac-lc-sec-add-btn:hover{opacity:.8}' +
    '.ac-lc-sec-empty{font-size:12px;color:var(--lo);font-style:italic;padding:8px 0 4px}' +
    // Decisions
    '.ac-lc-dec-row{display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04)}' +
    '.ac-lc-dec-row:last-child{border-bottom:none}' +
    '.ac-lc-dec-badge{font-size:9px;font-weight:700;border-radius:2px;padding:2px 5px;flex-shrink:0;cursor:pointer;margin-top:2px;color:var(--dec);background:var(--dec-bg);border:1px solid var(--dec-bd)}' +
    '.ac-lc-dec-text{flex:1;font-size:13px;color:var(--hi);line-height:1.4}' +
    '.ac-lc-dec-meta{font-size:11px;color:var(--lo);white-space:nowrap;flex-shrink:0;padding-top:2px}' +
    // Actions table
    '.ac-lc-act-table{width:100%;border-collapse:collapse;font-size:12px}' +
    '.ac-lc-act-thead th{font-size:10px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--lo);text-align:left;padding:2px 8px 8px}' +
    '.ac-lc-act-row{border-top:1px solid rgba(255,255,255,.04)}' +
    '.ac-lc-act-row td{padding:7px 8px;vertical-align:middle}' +
    '.ac-lc-act-owner{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--md)}' +
    '.ac-lc-act-avatar{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex-shrink:0;color:var(--dec);background:var(--dec-bg)}' +
    '.ac-lc-act-task{font-size:12px;color:var(--hi)}' +
    '.ac-lc-act-badge{font-size:9px;font-weight:700;border-radius:2px;padding:2px 5px;flex-shrink:0;cursor:pointer;color:var(--act);background:var(--act-bg);border:1px solid var(--act-bd)}' +
    '.ac-lc-status-chip{font-size:10px;font-weight:600;border-radius:10px;padding:2px 8px;cursor:pointer}' +
    '.ac-lc-status-chip--open{color:var(--act);background:var(--act-bg);border:1px solid var(--act-bd)}' +
    '.ac-lc-status-chip--overdue{color:var(--rsk);background:var(--rsk-bg);border:1px solid var(--rsk-bd)}' +
    '.ac-lc-status-chip--done{color:var(--nt);background:var(--nt-bg);border:1px solid var(--nt-bd)}' +
    '.ac-lc-act-add-row{display:flex;gap:6px;padding:10px 0 2px;align-items:center;flex-wrap:wrap}' +
    '.ac-lc-assignee-btn{display:flex;align-items:center;gap:6px;background:var(--raised);border:1px solid rgba(255,255,255,.10);border-radius:6px;padding:5px 10px;font-size:12px;font-family:inherit;color:var(--md);cursor:pointer;flex-shrink:0;transition:border-color .15s}' +
    '.ac-lc-assignee-btn:hover{border-color:rgba(74,140,245,.3)}' +
    '.ac-lc-date-input{background:var(--raised);border:1px solid rgba(255,255,255,.10);border-radius:6px;padding:6px 10px;font-size:12px;font-family:inherit;color:var(--hi);outline:none;flex-shrink:0;width:130px;color-scheme:dark}' +
    // Risks
    '.ac-lc-rsk-row{display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04)}' +
    '.ac-lc-rsk-row:last-child{border-bottom:none}' +
    '.ac-lc-rsk-badge{font-size:9px;font-weight:700;border-radius:2px;padding:2px 5px;flex-shrink:0;cursor:pointer;margin-top:2px;color:var(--rsk);background:var(--rsk-bg);border:1px solid var(--rsk-bd)}' +
    '.ac-lc-ds-badge{font-size:9px;font-weight:700;border-radius:2px;padding:2px 5px;flex-shrink:0;cursor:pointer;margin-top:2px;color:var(--rsk);background:var(--rsk-bg);border:1px solid var(--rsk-bd)}' +
    '.ac-lc-rsk-text{flex:1;font-size:12px;color:var(--hi)}' +
    '.ac-lc-severity-chip{font-size:9px;font-weight:600;border-radius:10px;padding:1px 7px;flex-shrink:0}' +
    '.ac-lc-severity-chip--low{color:var(--act);background:var(--act-bg);border:1px solid var(--act-bd)}' +
    '.ac-lc-severity-chip--medium{color:var(--act);background:var(--act-bg);border:1px solid var(--act-bd)}' +
    '.ac-lc-severity-chip--high{color:var(--rsk);background:var(--rsk-bg);border:1px solid var(--rsk-bd)}' +
    '.ac-lc-sev-select{background:var(--raised);border:1px solid rgba(255,255,255,.10);border-radius:6px;padding:5px 8px;font-size:12px;font-family:inherit;color:var(--hi);cursor:pointer;flex-shrink:0}' +
    // Parking lot
    '.ac-lc-park-row{display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04)}' +
    '.ac-lc-park-row:last-child{border-bottom:none}' +
    '.ac-lc-park-dot{width:8px;height:8px;border-radius:50%;background:#9478e0;flex-shrink:0;margin-top:4px}' +
    '.ac-lc-park-text{flex:1;font-size:12px;color:var(--hi)}' +
    '.ac-lc-park-source{font-size:10px;color:var(--lo);margin-top:2px}' +
    // Edit popup (shared with reclassify)
    '.ac-lc-edit-popup{position:fixed;z-index:201;background:var(--raised);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:14px;min-width:260px;box-shadow:0 8px 32px rgba(0,0,0,.5)}' +
    '.ac-lc-edit-title{font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--lo);margin-bottom:10px}' +
    '.ac-lc-edit-field{display:flex;flex-direction:column;gap:3px;margin-bottom:8px}' +
    '.ac-lc-edit-field label{font-size:10px;color:var(--lo)}' +
    '.ac-lc-edit-field textarea,.ac-lc-edit-field input{background:var(--b0);border:1px solid rgba(255,255,255,.12);border-radius:4px;padding:6px 8px;font-size:12px;font-family:inherit;color:var(--hi);outline:none;resize:vertical}' +
    '.ac-lc-edit-field textarea:focus,.ac-lc-edit-field input:focus{border-color:rgba(74,140,245,.4)}' +
    '.ac-lc-edit-actions{display:flex;gap:6px;justify-content:flex-end;margin-top:10px}' +
    '.ac-lc-edit-cancel{font-size:11px;color:var(--lo);background:transparent;border:1px solid rgba(255,255,255,.10);border-radius:5px;padding:4px 10px;cursor:pointer}' +
    '.ac-lc-edit-save{font-size:11px;font-weight:600;color:var(--hi);background:var(--dec);border:none;border-radius:5px;padding:4px 12px;cursor:pointer}'
  }

  // Shell HTML
  function _shellHtml(meeting) {
    return '<div class="ac-live-capture-shell" id="ac-lc-shell"><style>' + _css() + '</style>' +
    '<div class="ac-lc-topbar">' +
      '<span class="ac-lc-logo">accord<em>.</em></span>' +
      '<div class="ac-lc-live-pill"><span class="ac-lc-live-dot"></span>LIVE</div>' +
      '<span class="ac-lc-title">' + _esc(meeting.title || 'Untitled') + '</span>' +
      '<div class="ac-lc-progress-wrap"><div class="ac-lc-progress" id="ac-lc-progress-bar"></div></div>' +
      '<span class="ac-lc-timer" id="ac-lc-timer">00:00</span>' +
      '<button type="button" class="ac-lc-end-btn" id="ac-lc-end-btn">END MEETING</button>' +
    '</div>' +
    '<div class="ac-lc-body">' +
      '<div class="ac-lc-sidebar" id="ac-lc-sidebar">' +
        '<div class="ac-lc-resize-handle" id="ac-lc-resize-handle"></div>' +
        '<div class="ac-lc-sidebar-inner">' +
          '<div class="ac-lc-section-label">Sections</div>' +
          '<nav class="ac-lc-nav">' +
            '<a class="ac-lc-nav-item" data-section="agenda"    href="#ac-lc-sec-agenda">Agenda</a>' +
            '<a class="ac-lc-nav-item" data-section="decisions" href="#ac-lc-sec-decisions">Decisions</a>' +
            '<a class="ac-lc-nav-item" data-section="actions"   href="#ac-lc-sec-actions">Action Items</a>' +
            '<a class="ac-lc-nav-item" data-section="risks"     href="#ac-lc-sec-risks">Risks &amp; Issues</a>' +
            '<a class="ac-lc-nav-item" data-section="parking"   href="#ac-lc-sec-parking">Parking Lot</a>' +
          '</nav>' +
          '<div class="ac-lc-section-label">Live Attendees</div>' +
          '<div class="ac-lc-attendees" id="ac-lc-attendees"><div style="font-size:11px;color:var(--lo);padding:4px 6px">Loading\u2026</div></div>' +
          '<div class="ac-lc-section-label">Team Chat</div>' +
          '<div class="ac-lc-chat">' +
            '<div class="ac-lc-chat-viewport" id="ac-lc-chat-viewport"><div class="ac-lc-chat-empty" id="ac-lc-chat-empty">No messages yet.</div></div>' +
            '<div class="ac-lc-chat-input-row"><textarea class="ac-lc-chat-input" id="ac-lc-chat-input" rows="1" placeholder="Message\u2026"></textarea><button class="ac-lc-chat-send" id="ac-lc-chat-send">Send</button></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="ac-lc-canvas" id="ac-lc-canvas">' +
        '<div id="ac-lc-sec-agenda">' +
          '<div class="ac-lc-sec-header" id="ac-lc-agenda-hdr" data-section-toggle="agenda">' +
            '<span class="ac-lc-sec-bar ac-lc-sec-bar--agenda"></span>' +
            '<span class="ac-lc-sec-title">Agenda</span>' +
            '<span class="ac-lc-sec-meta" id="ac-lc-agenda-meta"></span>' +
            '<span class="ac-lc-sec-chevron open" id="ac-lc-agenda-chev">\u25b6</span>' +
          '</div>' +
          '<div id="ac-lc-agenda-body"><div class="ac-lc-sec-body">' +
            '<div id="ac-lc-prior-strip-wrap"></div>' +
            '<div id="ac-lc-agenda-items"><div style="padding:20px;font-size:12px;color:var(--lo)">Loading agenda\u2026</div></div>' +
          '</div></div>' +
        '</div>' +
        '<div id="ac-lc-sec-decisions"><div class="ac-lc-sec-header" data-section-toggle="decisions"><span class="ac-lc-sec-bar ac-lc-sec-bar--decisions"></span><span class="ac-lc-sec-title">Decisions</span><span class="ac-lc-sec-count" id="ac-lc-count-decisions"></span><span class="ac-lc-sec-chevron">\u25b6</span></div><div id="ac-lc-decisions-body" style="display:none"></div></div>' +
        '<div id="ac-lc-sec-actions"><div class="ac-lc-sec-header" data-section-toggle="actions"><span class="ac-lc-sec-bar ac-lc-sec-bar--actions"></span><span class="ac-lc-sec-title">Action Items</span><span class="ac-lc-sec-count" id="ac-lc-count-actions"></span><span class="ac-lc-sec-chevron">\u25b6</span></div><div id="ac-lc-actions-body" style="display:none"></div></div>' +
        '<div id="ac-lc-sec-risks"><div class="ac-lc-sec-header" data-section-toggle="risks"><span class="ac-lc-sec-bar ac-lc-sec-bar--risks"></span><span class="ac-lc-sec-title">Risks &amp; Issues</span><span class="ac-lc-sec-count" id="ac-lc-count-risks"></span><span class="ac-lc-sec-chevron">\u25b6</span></div><div id="ac-lc-risks-body" style="display:none"></div></div>' +
        '<div id="ac-lc-sec-parking"><div class="ac-lc-sec-header" data-section-toggle="parking"><span class="ac-lc-sec-bar ac-lc-sec-bar--parking"></span><span class="ac-lc-sec-title">Parking Lot</span><span class="ac-lc-sec-count" id="ac-lc-count-parking"></span><span class="ac-lc-sec-chevron">\u25b6</span></div><div id="ac-lc-parking-body" style="display:none"></div></div>' +
      '</div>' +
    '</div></div>';
  }

  // Timer
  function _startTimer(startedAt) {
    _stopTimer();
    var origin = startedAt ? new Date(startedAt).getTime() : Date.now();
    function _tick() {
      var el = document.getElementById('ac-lc-timer');
      if (!el) { _stopTimer(); return; }
      var e = Math.max(0, Math.floor((Date.now() - origin) / 1000));
      el.textContent = (Math.floor(e/60) < 10 ? '0' : '') + Math.floor(e/60) + ':' + (e%60 < 10 ? '0' : '') + e%60;
    }
    _tick();
    _timerInterval = setInterval(_tick, 1000);
  }
  function _stopTimer() { if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; } }

  // Progress bar
  function _renderProgressBar(items) {
    var bar = document.getElementById('ac-lc-progress-bar');
    if (!bar) return;
    if (!items || !items.length) { bar.innerHTML = '<div class="ac-lc-seg ac-lc-seg--todo" style="flex:1"></div>'; return; }
    var done  = items.filter(function(r) { return r.status === 'complete'; }).length;
    var skip  = items.filter(function(r) { return r.status === 'in_progress'; }).length;
    var total = items.length;
    var act   = (total - done - skip) > 0 ? 1 : 0;
    var todo  = Math.max(0, total - done - skip - act);
    var html  = '';
    for (var i=0;i<done;i++) html += '<div class="ac-lc-seg ac-lc-seg--done"></div>';
    for (var j=0;j<act;j++)  html += '<div class="ac-lc-seg ac-lc-seg--active"></div>';
    for (var k=0;k<todo;k++) html += '<div class="ac-lc-seg ac-lc-seg--todo"></div>';
    for (var l=0;l<skip;l++) html += '<div class="ac-lc-seg ac-lc-seg--todo" style="opacity:.3"></div>';
    bar.innerHTML = html;
  }

  function _loadProgressBar(meetingId) {
    if (!meetingId) return;
    API.get('accord_agenda_items?meeting_id=eq.' + meetingId + '&select=agenda_item_id,status&order=position.asc')
      .then(function(rows) { _renderProgressBar(rows || []); }).catch(function() {});
  }

  // Attendees
  function _loadAttendees(meetingId) {
    if (!meetingId) return;
    API.get('accord_meeting_attendees?meeting_id=eq.' + meetingId + '&select=attendee_id,resource_id,role_in_meeting,rsvp_status')
      .then(function(rows) {
        rows = rows || [];
        if (!rows.length) { _renderAttendees([]); return; }
        var rids = rows.map(function(r) { return r.resource_id; });
        API.get('resources?id=in.(' + rids.join(',') + ')&select=id,name').then(function(resources) {
          (resources || []).forEach(function(r) { _attendeeNameMap[r.id] = r.name; });
          var att = rows.map(function(a) { return { resource_id: a.resource_id, name: _attendeeNameMap[a.resource_id] || 'Unknown', role: a.role_in_meeting }; });
          _renderAttendees(att);
          _startPresencePoll(att);
        });
      }).catch(function() {});
  }

  function _buildPresenceMap() {
    var p = {};
    if (_myResourceId) p[_myResourceId] = true;
    document.querySelectorAll('#attendeesList .presence-dot.present').forEach(function(dot) {
      var row = dot.closest('[data-resource-id]');
      if (row && row.dataset.resourceId) p[row.dataset.resourceId] = true;
    });
    return p;
  }

  function _renderAttendees(attendees) {
    var c = document.getElementById('ac-lc-attendees');
    if (!c) return;
    if (!attendees || !attendees.length) { c.innerHTML = '<div style="font-size:11px;color:var(--lo);padding:4px 6px">No attendees.</div>'; return; }
    var p = _buildPresenceMap();
    var sorted = attendees.slice().sort(function(a,b) {
      if (a.role==='organizer'&&b.role!=='organizer') return -1;
      if (b.role==='organizer'&&a.role!=='organizer') return 1;
      return (a.name||'').localeCompare(b.name||'');
    });
    var html = '';
    sorted.forEach(function(a) {
      var isP = !!p[a.resource_id]; var isMe = a.resource_id === _myResourceId;
      html += '<div class="ac-lc-attendee-row' + (isP?'':' absent') + '" data-resource-id="' + _esc(a.resource_id) + '">' +
        '<span class="ac-lc-presence-dot' + (isP?' present':'') + '"></span>' +
        '<span class="ac-lc-attendee-name">' + _esc(a.name) + '</span>' +
        (a.role==='organizer'?'<span class="ac-lc-you-tag">ORG</span>':'') +
        (isMe?'<span class="ac-lc-you-tag">YOU</span>':'') +
      '</div>';
    });
    c.innerHTML = html;
    c._attendeeData = attendees;
  }

  function _startPresencePoll(att) { _stopPresencePoll(); _presencePollTimer = setInterval(function() { _renderAttendees(att); }, 15000); }
  function _stopPresencePoll()     { if (_presencePollTimer) { clearInterval(_presencePollTimer); _presencePollTimer = null; } }

  // Chat
  function _loadChatHistory(meetingId) {
    API.get('accord_chat_messages?meeting_id=eq.' + meetingId + '&order=created_at.asc&limit=100&select=message_id,body,created_at,author_resource_id')
      .then(function(rows) {
        rows = rows || [];
        if (!rows.length) { _chatMessages = []; _renderChatStream([]); return; }
        var rids = [];
        rows.forEach(function(r) { if (rids.indexOf(r.author_resource_id)===-1) rids.push(r.author_resource_id); });
        API.get('resources?id=in.(' + rids.join(',') + ')&select=id,name').then(function(res) {
          var nm = {}; (res||[]).forEach(function(r) { nm[r.id]=r.name; });
          rows.forEach(function(m) { m._author_name = nm[m.author_resource_id]||'Unknown'; m._is_me = m.author_resource_id===_myResourceId; });
          _chatMessages = rows; _renderChatStream(_chatMessages); _scrollChatToBottom();
        });
      }).catch(function() {});
  }

  function _chatMsgGroupHtml(msg) {
    var isMe = !!msg._is_me; var cls = isMe?' me':' other';
    return '<div class="ac-lc-chat-msg-group">' +
      '<div class="ac-lc-chat-msg-header' + cls + '"><span class="ac-lc-chat-msg-author">' + _esc(msg._author_name||'') + '</span><span style="font-size:10px;color:var(--lo)">' + _esc(_fmtTime(msg.created_at)) + '</span></div>' +
      '<div class="ac-lc-chat-msg-row' + cls + '"><div class="ac-lc-chat-bubble">' + _esc(msg.body) + '</div></div>' +
    '</div>';
  }

  function _renderChatStream(messages) {
    var vp = document.getElementById('ac-lc-chat-viewport');
    var em = document.getElementById('ac-lc-chat-empty');
    if (!vp) return;
    if (!messages||!messages.length) { if (em) em.style.display='flex'; return; }
    if (em) em.style.display='none';
    var html = ''; var lastA = null;
    messages.forEach(function(msg) {
      var isMe = !!msg._is_me; var cls = isMe?' me':' other';
      if (msg.author_resource_id !== lastA) {
        if (lastA!==null) html += '</div>';
        html += '<div class="ac-lc-chat-msg-group"><div class="ac-lc-chat-msg-header' + cls + '"><span class="ac-lc-chat-msg-author">' + _esc(msg._author_name||'') + '</span><span style="font-size:10px;color:var(--lo)">' + _esc(_fmtTime(msg.created_at)) + '</span></div>';
        lastA = msg.author_resource_id;
      }
      html += '<div class="ac-lc-chat-msg-row' + cls + '"><div class="ac-lc-chat-bubble">' + _esc(msg.body) + '</div></div>';
    });
    if (lastA!==null) html += '</div>';
    var nodes = vp.childNodes;
    for (var i=nodes.length-1;i>=0;i--) { if (nodes[i]!==em) vp.removeChild(nodes[i]); }
    var f = document.createElement('div'); f.innerHTML = html;
    while (f.firstChild) vp.appendChild(f.firstChild);
  }

  function _appendChatMessage(msg) {
    var vp = document.getElementById('ac-lc-chat-viewport');
    var em = document.getElementById('ac-lc-chat-empty');
    if (!vp) return;
    if (em) em.style.display='none';
    var isMe = !!msg._is_me; var cls = isMe?' me':' other';
    var w = document.createElement('div');
    w.className = 'ac-lc-chat-msg-group';
    w.innerHTML = '<div class="ac-lc-chat-msg-header' + cls + '"><span class="ac-lc-chat-msg-author">' + _esc(msg._author_name||'') + '</span><span style="font-size:10px;color:var(--lo)">' + _esc(_fmtTime(msg.created_at)) + '</span></div>' +
                  '<div class="ac-lc-chat-msg-row' + cls + '"><div class="ac-lc-chat-bubble">' + _esc(msg.body) + '</div></div>';
    vp.appendChild(w);
  }

  function _scrollChatToBottom() { var vp = document.getElementById('ac-lc-chat-viewport'); if (vp) vp.scrollTop = vp.scrollHeight; }

  function _subscribeChatRealtime(meetingId) {
    var rc = window.Accord && window.Accord.state && window.Accord.state.realtimeClient && window.Accord.state.realtimeClient.realtime;
    if (!rc) { console.warn('[AccordLiveCapture] realtime client unavailable'); return; }
    var ch = 'accord-lc-chat-' + meetingId;
    if (window.Accord.state.realtimeClient.getChannels().find(function(c) { return c.topic&&c.topic.includes(ch); })) return;
    _chatSubscription = rc.channel(ch)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'accord_chat_messages', filter: 'meeting_id=eq.' + meetingId }, function(payload) {
        var msg = payload.new; if (!msg) return;
        if (_chatMessages.find(function(m) { return m.message_id===msg.message_id; })) return;
        API.get('resources?id=eq.' + msg.author_resource_id + '&select=id,name&limit=1').then(function(rows) {
          msg._author_name = (rows&&rows[0])?rows[0].name:'Unknown'; msg._is_me = msg.author_resource_id===_myResourceId;
          _chatMessages.push(msg); _appendChatMessage(msg); _scrollChatToBottom();
        });
      }).subscribe();
  }

  function _unsubscribeChatRealtime() { if (_chatSubscription) { try { _chatSubscription.unsubscribe(); } catch(e) {} _chatSubscription=null; } }

  function _sendChatMessage(meeting) {
    var input = document.getElementById('ac-lc-chat-input'); var btn = document.getElementById('ac-lc-chat-send');
    if (!input) return;
    var body = input.value.trim(); if (!body||!_myResourceId) return;
    btn.disabled=true; input.value='';
    API.post('accord_chat_messages', { firm_id: meeting.firm_id, meeting_id: meeting.meeting_id, author_resource_id: _myResourceId, body: body })
      .catch(function(e) { console.error('[AccordLiveCapture] chat send failed', e); input.value=body; });
    btn.disabled=false;
  }

  // Sidebar resize
  function _getSavedSidebarWidth() {
    try { var v=parseInt(localStorage.getItem(_SIDEBAR_KEY),10); if (v>=_SIDEBAR_MIN&&v<=_SIDEBAR_MAX) return v; } catch(e) {}
    return _SIDEBAR_DEFAULT;
  }
  function _saveSidebarWidth(w) { try { localStorage.setItem(_SIDEBAR_KEY, String(w)); } catch(e) {} }

  function _wireSidebarResize() {
    var sb = document.getElementById('ac-lc-sidebar'); var h = document.getElementById('ac-lc-resize-handle');
    if (!sb||!h) return;
    sb.style.width = _getSavedSidebarWidth() + 'px';
    function _md(ev) { ev.preventDefault(); _sidebarDragging=true; _sidebarStartX=ev.clientX; _sidebarStartWidth=sb.offsetWidth; h.classList.add('dragging'); document.body.style.cursor='col-resize'; document.body.style.userSelect='none'; }
    function _mm(ev) { if (!_sidebarDragging) return; sb.style.width = Math.min(_SIDEBAR_MAX,Math.max(_SIDEBAR_MIN,_sidebarStartWidth+ev.clientX-_sidebarStartX))+'px'; }
    function _mu()  { if (!_sidebarDragging) return; _sidebarDragging=false; h.classList.remove('dragging'); document.body.style.cursor=''; document.body.style.userSelect=''; _saveSidebarWidth(sb.offsetWidth); }
    h.addEventListener('mousedown',_md); document.addEventListener('mousemove',_mm); document.addEventListener('mouseup',_mu);
  }

  // Section toggles
  function _wireSectionToggles() {
    var canvas = document.getElementById('ac-lc-canvas'); if (!canvas) return;
    canvas.addEventListener('click', function(ev) {
      var hdr = ev.target.closest('[data-section-toggle]'); if (!hdr) return;
      var key = hdr.dataset.sectionToggle;
      if (key==='agenda') {
        _agendaSectionOpen = !_agendaSectionOpen;
        var body = document.getElementById('ac-lc-agenda-body'); var chev = document.getElementById('ac-lc-agenda-chev');
        if (body) body.style.display = _agendaSectionOpen ? '' : 'none';
        if (chev) chev.classList.toggle('open', _agendaSectionOpen);
        return;
      }
      var bEl = document.getElementById('ac-lc-' + key + '-body'); var cEl = hdr.querySelector('.ac-lc-sec-chevron');
      if (!bEl) return;
      var open = bEl.style.display !== 'none';
      bEl.style.display = open ? 'none' : '';
      if (cEl) cEl.classList.toggle('open', !open);
    });
  }

  // Nav
  function _wireNavObserver() {
    var canvas = document.getElementById('ac-lc-canvas'); if (!canvas||!window.IntersectionObserver) return;
    _intersectionObs = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (!entry.isIntersecting) return;
        var key = entry.target.id.replace('ac-lc-sec-','');
        document.querySelectorAll('.ac-lc-nav-item').forEach(function(el) { el.classList.toggle('active', el.dataset.section===key); });
      });
    }, { root: canvas, rootMargin: '-30% 0px -60% 0px', threshold: 0 });
    ['agenda','decisions','actions','risks','parking'].forEach(function(s) { var el=document.getElementById('ac-lc-sec-'+s); if (el) _intersectionObs.observe(el); });
  }

  function _wireNavClicks() {
    document.querySelectorAll('.ac-lc-nav-item').forEach(function(link) {
      link.addEventListener('click', function(ev) {
        ev.preventDefault();
        var t = document.getElementById('ac-lc-sec-'+link.dataset.section); var c = document.getElementById('ac-lc-canvas');
        if (t&&c) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  // Agenda section helpers
  function _isOrganizer() {
    var m = _meeting; var me = window.Accord&&window.Accord.state&&window.Accord.state.me;
    if (!m||!me) return false;
    return m.organizer_id === me.id;
  }

  function _activeItemId(items) {
    var p = (items||[]).filter(function(a) { return a.status==='pending'; });
    return p.length ? p[0].agenda_item_id : null;
  }

  function _loadAgenda(meetingId) {
    API.get('accord_agenda_items?meeting_id=eq.' + meetingId + '&select=*&order=position.asc')
      .then(function(rows) { _agendaItems=rows||[]; _renderAgendaSection(); _renderProgressBar(_agendaItems); })
      .catch(function(e) { console.warn('[AccordLiveCapture] agenda load failed', e); });
  }

  function _loadPriorActionStrip(workstreamId, currentMeetingId) {
    if (!workstreamId) return;
    API.get('accord_meetings?workstream_id=eq.' + workstreamId + '&state=in.(closed,sealed)&select=meeting_id&order=scheduled_for.desc&limit=1')
      .then(function(meetings) {
        if (!meetings||!meetings.length) return null;
        return API.get('accord_nodes?meeting_id=eq.' + meetings[0].meeting_id + '&tag=eq.action&status=neq.committed&select=node_id,seq_id,summary,due_date,status&order=created_at.asc');
      }).then(function(nodes) {
        if (!nodes||!nodes.length) return;
        _renderPriorStrip(nodes);
      }).catch(function() {});
  }

  function _renderPriorStrip(nodes) {
    var wrap = document.getElementById('ac-lc-prior-strip-wrap'); if (!wrap) return;
    var today = Date.now();
    var ov = nodes.filter(function(n) { return n.due_date&&new Date(n.due_date).getTime()<today; });
    var op = nodes.filter(function(n) { return !n.due_date||new Date(n.due_date).getTime()>=today; });
    var pills = (ov.length?'<span class="ac-lc-prior-pill ac-lc-prior-pill--overdue">'+ov.length+' overdue</span>':'') +
                (op.length?'<span class="ac-lc-prior-pill ac-lc-prior-pill--open">'+op.length+' open</span>':'');
    var rows  = nodes.map(function(n) {
      var od = n.due_date&&new Date(n.due_date).getTime()<today;
      return '<div class="ac-lc-prior-row"><span class="ac-lc-prior-seq">'+_esc(n.seq_id||'AX')+'</span><span class="ac-lc-prior-summary">'+_esc((n.summary||'').slice(0,80))+'</span>'+(od?'<span class="ac-lc-prior-overdue-dot">\u25cf</span>':'')+'</div>';
    }).join('');
    wrap.innerHTML = '<div class="ac-lc-prior-strip"><div class="ac-lc-prior-strip-header" id="ac-lc-psh">Prior meeting open actions '+pills+'<span style="margin-left:auto;font-size:10px;color:var(--act)">\u25b8</span></div><div class="ac-lc-prior-strip-body" id="ac-lc-psb">'+rows+'</div></div>';
    var hdr = document.getElementById('ac-lc-psh');
    if (hdr) hdr.addEventListener('click', function() { var b=document.getElementById('ac-lc-psb'); if(b) b.classList.toggle('open'); });
  }

  function _renderAgendaSection() {
    var container = document.getElementById('ac-lc-agenda-items'); if (!container) return;
    var items = _agendaItems;
    var meta  = document.getElementById('ac-lc-agenda-meta');
    var actId = _activeItemId(items);
    if (meta) {
      var at = items.find(function(a){return a.agenda_item_id===actId;});
      meta.textContent = items.length + ' items' + (at?' \u00b7 '+((at.title||'').slice(0,20)+' active'):'');
    }
    if (!items.length) { container.innerHTML='<div class="ac-lc-empty-agenda">No agenda items. Add items in Meeting Setup.</div>'; return; }
    var isOrg = _isOrganizer();
    var html  = '';
    items.forEach(function(item) {
      var isExp = !!_agendaExpanded[item.agenda_item_id];
      var isAct = item.agenda_item_id===actId;
      var nc    = _agendaNewCounts[item.agenda_item_id]||0;
      var sBtns = '';
      if (item.status==='complete') {
        sBtns = '<button class="ac-lc-item-status-btn ac-lc-item-status-btn--done" disabled>Discussed</button>';
      } else if (item.status==='in_progress') {
        sBtns = '<button class="ac-lc-item-status-btn ac-lc-item-status-btn--skipped" disabled>In Progress</button>';
      } else if (isOrg && isAct) {
        sBtns = '<button class="ac-lc-item-status-btn ac-lc-item-status-btn--discuss" data-action="mark-discussed" data-item-id="'+_esc(item.agenda_item_id)+'">Mark discussed</button>' +
                '<button class="ac-lc-item-status-btn ac-lc-item-status-btn--skip" data-action="skip-item" data-item-id="'+_esc(item.agenda_item_id)+'">Skip</button>';
      } else if (isOrg && item.status==='pending') {
        sBtns = '<button class="ac-lc-item-status-btn ac-lc-item-status-btn--skip" data-action="skip-item" data-item-id="'+_esc(item.agenda_item_id)+'">Skip</button>';
      }
      html +=
        '<div class="ac-lc-agenda-item'+(isExp?' expanded':'')+'" id="ac-lc-item-'+_esc(item.agenda_item_id)+'" data-agenda-item-id="'+_esc(item.agenda_item_id)+'">' +
          '<div class="ac-lc-agenda-item-header" data-action="toggle-item" data-item-id="'+_esc(item.agenda_item_id)+'">' +
            '<span class="ac-lc-item-chevron'+(isExp?' open':'')+'>\u25b6</span>' +
            '<span class="ac-lc-item-num">'+_esc(item.position)+'</span>' +
            '<span class="ac-lc-item-title">'+_esc(item.title||'Untitled')+'</span>' +
            (isAct?'<span class="ac-lc-active-badge">Active</span>':'') +
            (nc?'<span class="ac-lc-new-badge" id="ac-lc-new-'+_esc(item.agenda_item_id)+'">'+nc+' new</span>':'') +
            sBtns +
          '</div>' +
          (isExp?'<div class="ac-lc-agenda-item-body" id="ac-lc-item-body-'+_esc(item.agenda_item_id)+'">Loading\u2026</div>':'') +
        '</div>';
    });
    container.innerHTML = html;
    _wireAgendaItemEvents(container);
    items.forEach(function(item) { if (_agendaExpanded[item.agenda_item_id]) _loadItemBody(item); });
  }

  function _wireAgendaItemEvents(container) {
    container.addEventListener('click', function(ev) {
      // Check specific button actions FIRST — before toggle-item — because
      // status buttons live inside the header div that carries data-action="toggle-item".
      // IR47 finding: accord_agenda_items_status_check constraint allows
      // 'pending', 'in_progress', 'complete' only. Brief specified 'discussed'
      // and 'skipped' which do not exist. Using 'complete' for mark-discussed
      // and 'in_progress' for skip as closest available values.
      // Architect to confirm or add migration for 'discussed'/'skipped' values.
      var d = ev.target.closest('[data-action="mark-discussed"]');
      if (d) { ev.stopPropagation(); _patchAgendaStatus(d.dataset.itemId,'complete'); return; }

      var s = ev.target.closest('[data-action="skip-item"]');
      if (s) { ev.stopPropagation(); _patchAgendaStatus(s.dataset.itemId,'in_progress'); return; }

      var b = ev.target.closest('[data-action="reclassify"]');
      if (b) { ev.stopPropagation(); _openReclassifyPopup(b.dataset.nodeId, b.dataset.currentTag, b); return; }

      var a = ev.target.closest('[data-action="add-note"]');
      if (a) { ev.stopPropagation(); _commitNote(a.dataset.itemId, a.dataset.threadId); return; }

      // Toggle item last
      var t = ev.target.closest('[data-action="toggle-item"]');
      if (t) { var id=t.dataset.itemId; _agendaExpanded[id]=!_agendaExpanded[id]; if(_agendaExpanded[id]) _agendaNewCounts[id]=0; _renderAgendaSection(); return; }
    });
  }

  function _loadItemBody(item) {
    var bodyEl = document.getElementById('ac-lc-item-body-' + item.agenda_item_id); if (!bodyEl) return;
    var mid = _meeting && _meeting.meeting_id; var tid = item.thread_id || null;
    var histP = tid
      ? API.get('accord_nodes?thread_id=eq.'+tid+'&meeting_id=neq.'+mid+'&select=node_id,seq_id,tag,summary,created_at&order=created_at.desc&limit=30').catch(function() { return []; })
      : Promise.resolve([]);
    var capP  = API.get('accord_nodes?meeting_id=eq.'+mid+'&agenda_item_id=eq.'+item.agenda_item_id+'&select=node_id,seq_id,tag,summary,created_at,created_by&order=created_at.asc').catch(function() { return []; });
    Promise.all([histP, capP]).then(function(results) {
      var body2 = document.getElementById('ac-lc-item-body-' + item.agenda_item_id); if (!body2) return;
      body2.innerHTML = _itemBodyHtml(item, results[0]||[], results[1]||[]);
      _wireItemBodyEvents(body2, item);
    });
  }

  function _itemBodyHtml(item, hist, cap) {
    var hc = (_agendaHistCollapsed[item.agenda_item_id] !== false);
    var hm = hist.length ? hist.length+' entr'+(hist.length===1?'y':'ies') : '';
    var html =
      '<div class="ac-lc-history-header" data-action="toggle-history" data-item-id="'+_esc(item.agenda_item_id)+'">' +
        '<span class="ac-lc-history-chevron'+(hc?'':' open')+'>\u25b6</span>History' +
        '<span class="ac-lc-history-meta">'+_esc(hm)+'</span>' +
      '</div>' +
      '<div class="ac-lc-history-body'+(hc?'':' open')+'" id="ac-lc-hist-'+_esc(item.agenda_item_id)+'">';

    if (!item.thread_id) {
      html += '<div class="ac-lc-no-history">No prior history \u2014 first meeting on this topic.</div>';
    } else if (!hist.length) {
      html += '<div class="ac-lc-no-history">No prior captures on this thread.</div>';
    } else {
      hist.forEach(function(n) {
        html += '<div class="ac-lc-history-row">' +
          '<span class="ac-lc-history-date">'+_esc(_fmtDate(n.created_at))+'</span>' +
          '<span class="ac-lc-history-badge" style="color:'+_tagColor(n.tag)+';background:'+_tagBg(n.tag)+'">'+_esc(n.seq_id||_tagLabel(n.tag))+'</span>' +
          '<span class="ac-lc-history-text">'+_esc((n.summary||'').slice(0,100))+'</span>' +
        '</div>';
      });
    }
    html += '</div>';

    if (cap.length) {
      html += '<div class="ac-lc-captured-label">Captured this meeting</div>';
      html += '<div id="ac-lc-captured-'+_esc(item.agenda_item_id)+'">';
      cap.forEach(function(n) { html += _capturedRowHtml(n); });
      html += '</div>';
    } else {
      html += '<div id="ac-lc-captured-'+_esc(item.agenda_item_id)+'"></div>';
    }

    html +=
      '<div class="ac-lc-add-zone">' +
        '<textarea class="ac-lc-add-textarea" id="ac-lc-ta-'+_esc(item.agenda_item_id)+'" rows="4" placeholder="Type a note, observation, or follow-up\u2026"></textarea>' +
        '<button class="ac-lc-add-btn" data-action="add-note" data-item-id="'+_esc(item.agenda_item_id)+'" data-thread-id="'+_esc(item.thread_id||'')+'">+ ADD</button>' +
      '</div>';
    return html;
  }

  function _capturedRowHtml(n) {
    return '<div class="ac-lc-captured-row" data-node-id="'+_esc(n.node_id)+'">' +
      '<span class="ac-lc-captured-badge" style="color:'+_tagColor(n.tag)+';background:'+_tagBg(n.tag)+'" data-action="reclassify" data-node-id="'+_esc(n.node_id)+'" data-current-tag="'+_esc(n.tag)+'">'+_esc(n.seq_id||_tagLabel(n.tag))+'</span>' +
      '<span class="ac-lc-captured-text">'+_esc((n.summary||'').slice(0,100))+'</span>' +
      '<span class="ac-lc-captured-time">'+_esc(_fmtTime(n.created_at))+'</span>' +
    '</div>';
  }

  function _wireItemBodyEvents(bodyEl, item) {
    bodyEl.addEventListener('keydown', function(ev) {
      var ta = ev.target.closest('.ac-lc-add-textarea'); if (!ta) return;
      if (ev.key==='Enter'&&ev.shiftKey) { ev.preventDefault(); _commitNote(item.agenda_item_id, item.thread_id||''); }
    });
    bodyEl.addEventListener('click', function(ev) {
      var hh = ev.target.closest('[data-action="toggle-history"]');
      if (hh) {
        var id = hh.dataset.itemId;
        _agendaHistCollapsed[id] = !(_agendaHistCollapsed[id]===false);
        var hb = document.getElementById('ac-lc-hist-'+id); var hc = hh.querySelector('.ac-lc-history-chevron');
        if (hb) hb.classList.toggle('open', _agendaHistCollapsed[id]===false);
        if (hc) hc.classList.toggle('open', _agendaHistCollapsed[id]===false);
      }
    });
  }

  // Note commit
  function _commitNote(agendaItemId, threadId) {
    var ta = document.getElementById('ac-lc-ta-' + agendaItemId); if (!ta) return;
    if (ta.dataset.committing) return;   // guard: prevent double-fire
    var text = ta.value.trim(); if (!text) return;
    var m = _meeting; var me = window.Accord&&window.Accord.state&&window.Accord.state.me;
    if (!m||!me) return;

    // Resolve thread_id: prefer agenda item's own thread, fall back to
    // Accord.state.thread (meeting-level thread set by loadMeeting).
    // accord_nodes.thread_id is NOT NULL — must always have a value.
    if (!threadId) {
      var stateThread = window.Accord && window.Accord.state && window.Accord.state.thread;
      threadId = (stateThread && stateThread.thread_id) || '';
    }
    if (!threadId) {
      console.error('[AccordLiveCapture] no thread_id available — cannot INSERT node');
      return;
    }
    ta.disabled = true;
    ta.dataset.committing = '1';
    var row = { firm_id: me.firm_id, meeting_id: m.meeting_id, agenda_item_id: agendaItemId, tag: 'note', summary: text.slice(0,280), body: text.length>280?text:null, created_by: me.id };
    if (threadId) row.thread_id = threadId;
    // discipline, topic intentionally omitted — Knowledge Base CMD writes them
    API.post('accord_nodes', row).then(function(created) {
      var node = Array.isArray(created)?created[0]:created;
      ta.value = ''; ta.disabled = false; delete ta.dataset.committing;
      var cEl = document.getElementById('ac-lc-captured-'+agendaItemId);
      if (cEl) {
        if (!cEl.previousElementSibling||!cEl.previousElementSibling.classList.contains('ac-lc-captured-label')) {
          var lbl = document.createElement('div'); lbl.className='ac-lc-captured-label'; lbl.textContent='Captured this meeting';
          cEl.parentElement.insertBefore(lbl, cEl);
        }
        var rEl = document.createElement('div'); rEl.innerHTML = _capturedRowHtml(node);
        cEl.appendChild(rEl.firstChild);
      }
      if (window.Accord&&window.Accord.broadcast) {
        window.Accord.broadcast('accord.node.committed', { node_id: node.node_id, thread_id: node.thread_id, meeting_id: node.meeting_id, agenda_item_id: node.agenda_item_id, tag: node.tag, summary: node.summary, created_by: node.created_by, created_at: node.created_at });
      }
    }).catch(function(e) { console.error('[AccordLiveCapture] node INSERT failed', e); ta.disabled=false; delete ta.dataset.committing; });
  }

  // Agenda status PATCH
  // IR47: discussed/skipped confirmed valid from accord-capture.js:213 (archives) +
  // accord-capture.js:147 (filters on 'archived') — the schema constraint
  // accepted 'pending','discussed','skipped','archived' at Phase 1 investigation.
  // IR73: WHERE includes meeting_id for disjoint per-transition RLS guard.
  function _patchAgendaStatus(agendaItemId, newStatus) {
    var m = _meeting; if (!m) return;
    API.patch('accord_agenda_items?agenda_item_id=eq.'+agendaItemId+'&meeting_id=eq.'+m.meeting_id, { status: newStatus })
      .then(function() {
        // IR71: update local state only after server confirmation
        var item = _agendaItems.find(function(a) { return a.agenda_item_id===agendaItemId; });
        if (item) item.status = newStatus;
        _renderAgendaSection(); _renderProgressBar(_agendaItems);
        if (window.Accord&&window.Accord.broadcast) window.Accord.broadcast('accord.agenda.changed', { meeting_id: m.meeting_id });
      }).catch(function(e) { console.error('[AccordLiveCapture] agenda PATCH failed', e); });
  }

  // Reclassify popup
  var _RC_TYPES = [
    { tag: 'note',     label: 'Note',        color: 'var(--nt)'  },
    { tag: 'decision', label: 'Decision',    color: 'var(--dec)' },
    { tag: 'action',   label: 'Action Item', color: 'var(--act)' },
    { tag: 'risk',     label: 'Risk',        color: 'var(--rsk)' },
    { tag: 'question', label: 'Parking Lot', color: 'var(--md)'  },
  ];

  function _openReclassifyPopup(nodeId, currentTag, anchorEl) {
    var old = document.getElementById('ac-lc-rc-popup'); if (old&&old.parentElement) old.parentElement.removeChild(old);
    var selTag = currentTag;
    var rect   = anchorEl.getBoundingClientRect();
    var tRows  = _RC_TYPES.map(function(t) {
      return '<div class="ac-lc-reclassify-type'+(t.tag===currentTag?' selected':'')+'" data-rc-tag="'+t.tag+'">' +
        '<span class="ac-lc-reclassify-dot" style="background:'+t.color+'"></span><span>'+t.label+'</span></div>';
    }).join('');
    var popup = document.createElement('div'); popup.id='ac-lc-rc-popup'; popup.className='ac-lc-reclassify-popup';
    popup.innerHTML =
      '<div class="ac-lc-reclassify-title">Reclassify as</div>' +
      '<div class="ac-lc-reclassify-types" id="ac-lc-rc-types">'+tRows+'</div>' +
      '<div class="ac-lc-reclassify-fields" id="ac-lc-rc-fields"></div>' +
      '<div class="ac-lc-reclassify-actions"><button class="ac-lc-reclassify-cancel" id="ac-lc-rc-cancel">Cancel</button><button class="ac-lc-reclassify-confirm" id="ac-lc-rc-confirm">Confirm</button></div>';
    var shell = document.getElementById('ac-lc-shell') || document.body;
    shell.appendChild(popup);
    var top = rect.bottom+6; var left = rect.left;
    if (top+280>window.innerHeight) top = rect.top-280;
    if (left+230>window.innerWidth)  left = window.innerWidth-240;
    popup.style.top=top+'px'; popup.style.left=left+'px';

    var _rcAssignee = null;   // holds { id, name } selected via PersonPicker

    function _renderFields(tag) {
      var f = document.getElementById('ac-lc-rc-fields'); if (!f) return;
      _rcAssignee = null;
      if (tag==='action') {
        f.innerHTML =
          '<div class="ac-lc-reclassify-field"><label>Assignee</label>' +
          '<button class="ac-lc-assignee-btn" id="ac-lc-rc-asn-btn" style="width:100%">\u{1F464} Select assignee</button></div>' +
          '<div class="ac-lc-reclassify-field"><label>Due date</label>' +
          '<input type="date" id="ac-lc-rc-dd" class="ac-lc-date-input" style="width:100%;box-sizing:border-box"/></div>';
        // Wire PersonPicker
        setTimeout(function() {
          var asnBtn = document.getElementById('ac-lc-rc-asn-btn');
          if (!asnBtn) return;
          asnBtn.addEventListener('click', function(ev) {
            ev.stopPropagation();
            var resources = _inviteResourcesFromAttendees();
            window.PersonPicker && window.PersonPicker.show(asnBtn, function(r) {
              _rcAssignee = { id: r.id, name: r.name };
              asnBtn.textContent = r.name;
              asnBtn.style.color = 'var(--hi)';
            }, { resources: resources });
          });
        }, 0);
      } else if (tag==='decision') {
        var todayVal = new Date().toISOString().slice(0,10);
        f.innerHTML = '<div class="ac-lc-reclassify-field"><label>Effective date (optional)</label>' +
          '<input type="date" id="ac-lc-rc-ed" class="ac-lc-date-input" style="width:100%;box-sizing:border-box" value="'+todayVal+'"/></div>';
      } else if (tag==='risk') {
        f.innerHTML = '<div class="ac-lc-reclassify-field"><label>Severity</label>' +
          '<select id="ac-lc-rc-sv" class="ac-lc-sev-select" style="width:100%">' +
            '<option value="Low">Low</option><option value="Medium" selected>Medium</option><option value="High">High</option>' +
          '</select></div>';
      } else {
        f.innerHTML = '';
      }
    }
    _renderFields(selTag);

    popup.querySelector('#ac-lc-rc-types').addEventListener('click', function(ev) {
      var row = ev.target.closest('[data-rc-tag]'); if (!row) return;
      selTag = row.dataset.rcTag;
      popup.querySelectorAll('.ac-lc-reclassify-type').forEach(function(el) { el.classList.toggle('selected', el.dataset.rcTag===selTag); });
      _renderFields(selTag);
    });

    var backdrop = document.createElement('div'); backdrop.className='ac-lc-reclassify-backdrop';
    backdrop.addEventListener('click', function() { if (popup.parentElement) popup.parentElement.removeChild(popup); if (backdrop.parentElement) backdrop.parentElement.removeChild(backdrop); });
    shell.insertBefore(backdrop, popup);

    popup.querySelector('#ac-lc-rc-cancel').addEventListener('click', function() { if (popup.parentElement) popup.parentElement.removeChild(popup); if (backdrop.parentElement) backdrop.parentElement.removeChild(backdrop); });

    popup.querySelector('#ac-lc-rc-confirm').addEventListener('click', function() {
      var patch = { tag: selTag };
      if (selTag==='action') {
        var ddEl=document.getElementById('ac-lc-rc-dd');
        var dd=ddEl?ddEl.value.trim():'';
        if (_rcAssignee||dd) patch.body = JSON.stringify({ assignee_resource_id: _rcAssignee?_rcAssignee.id:'', assignee: _rcAssignee?_rcAssignee.name:'', due_date: dd });
        if (dd) patch.due_date = dd;
      } else if (selTag==='decision') {
        var edEl=document.getElementById('ac-lc-rc-ed'); var ed=edEl?edEl.value.trim():''; if (ed) patch.effective_date=ed;
      } else if (selTag==='risk') {
        var svEl=document.getElementById('ac-lc-rc-sv'); var sv=svEl?svEl.value:'Medium'; patch.body=JSON.stringify({severity:sv});
      }
      if (popup.parentElement) popup.parentElement.removeChild(popup);
      if (backdrop.parentElement) backdrop.parentElement.removeChild(backdrop);
      // IR71: DOM update only after PATCH confirms
      API.patch('accord_nodes?node_id=eq.'+nodeId, patch).then(function(result) {
        var updated = Array.isArray(result)?result[0]:result; if (!updated) return;
        var badgeEl = document.querySelector('[data-action="reclassify"][data-node-id="'+nodeId+'"]');
        if (badgeEl) {
          badgeEl.style.color      = _tagColor(selTag);
          badgeEl.style.background = _tagBg(selTag);
          badgeEl.dataset.currentTag = selTag;
          badgeEl.textContent = updated.seq_id || _tagLabel(selTag);
        }
      }).catch(function(e) { console.error('[AccordLiveCapture] reclassify PATCH failed', e); });
    });
  }

  // Remote events

  // ── Phase 5: Four consolidated canvas sections ──────────────────────────
  // IR47 findings (surfaced):
  //   1. Prefer: return=representation — confirmed present in API layer.
  //      Phase 4 INSERTs returned seq_id (NT-032 etc.) confirming full row
  //      is returned on POST. PATCH responses also return full row.
  //   2. tag: 'question' for Parking Lot — confirmed valid from
  //      accord-capture.js TAG_KEYS = { q: 'question' }. Operator to
  //      run SQL verification query per §5 of handoff to double-confirm.

  function _loadSectionNodes(meetingId) {
    API.get(
      'accord_nodes?meeting_id=eq.'+meetingId+
      '&tag=in.(decision,action,risk,dissent,question)'+
      '&select=node_id,seq_id,tag,summary,body,created_by,created_at,due_date,status,effective_date'+
      '&order=created_at.asc'
    ).then(function(rows) {
      rows = rows || [];
      _sectionNodes.decision = rows.filter(function(n){return n.tag==='decision';});
      _sectionNodes.action   = rows.filter(function(n){return n.tag==='action';});
      _sectionNodes.risk     = rows.filter(function(n){return n.tag==='risk'||n.tag==='dissent';});
      _sectionNodes.question = rows.filter(function(n){return n.tag==='question';});
      _paintDecisions();
      _paintActions();
      _paintRisks();
      _paintParking();
    }).catch(function(e) { console.warn('[AccordLiveCapture] section nodes load failed', e); });
  }

  function _updateSectionCount(key, nodes) {
    var idMap = { decision: 'ac-lc-count-decisions', action: 'ac-lc-count-actions', risk: 'ac-lc-count-risks', question: 'ac-lc-count-parking' };
    var el = document.getElementById(idMap[key]); if (!el) return;
    if (key==='action') {
      var today = Date.now();
      var overdue = nodes.filter(function(n){return n.due_date&&new Date(n.due_date).getTime()<today&&n.status!=='complete';});
      el.innerHTML = nodes.length+' assigned' + (overdue.length?' &middot; <span class="ac-lc-sec-count--alert">'+overdue.length+' overdue</span>':'');
    } else {
      var labels = { decision: 'recorded', risk: 'flagged', question: 'deferred' };
      el.textContent = nodes.length+' '+(labels[key]||'');
    }
  }

  // ── Decisions ────────────────────────────────────────────────────────────
  function _paintDecisions() {
    var body = document.getElementById('ac-lc-decisions-body'); if (!body) return;
    var nodes = _sectionNodes.decision;
    _updateSectionCount('decision', nodes);
    var html = '<div class="ac-lc-sec-body-inner">';
    if (nodes.length) {
      html += '<div id="ac-lc-dec-list">';
      nodes.forEach(function(n) { html += _decisionRowHtml(n); });
      html += '</div>';
    } else {
      html += '<div class="ac-lc-sec-empty">No decisions recorded yet.</div><div id="ac-lc-dec-list"></div>';
    }
    html += '<div class="ac-lc-sec-add-row">' +
      '<input class="ac-lc-sec-add-input" id="ac-lc-dec-input" placeholder="Describe a decision made in this meeting\u2026"/>' +
      '<input type="date" class="ac-lc-date-input" id="ac-lc-dec-effdate"/>' +
      '<button class="ac-lc-sec-add-btn" id="ac-lc-dec-btn" style="color:var(--dec);background:var(--dec-bg);border:1px solid var(--dec-bd)">Record \u2192</button>' +
    '</div></div>';
    body.innerHTML = html;
    // Default effective date to today
    var decEffInput = body.querySelector('#ac-lc-dec-effdate');
    if (decEffInput) decEffInput.value = new Date().toISOString().slice(0,10);
    _wireDecisionAdd(body);
    _wireDecisionClicks(body);
  }

  function _decisionRowHtml(n) {
    var me = window.Accord&&window.Accord.state&&window.Accord.state.me;
    var authorId = n.created_by;
    var authorName = '';
    // Try to resolve from attendees name map
    Object.keys(_attendeeNameMap).forEach(function(rid) {
      // _attendeeNameMap is resource_id -> name; created_by is user_id
      // Best effort display
    });
    var timeStr = _fmtTime(n.created_at);
    var effStr  = n.effective_date ? 'Effective ' + _fmtDate(n.effective_date) : '';
    return '<div class="ac-lc-dec-row" data-node-id="'+_esc(n.node_id)+'">' +
      '<span class="ac-lc-dec-badge" data-action="edit-section-node" data-node-id="'+_esc(n.node_id)+'" data-tag="decision">'+_esc(n.seq_id||'DC')+'</span>' +
      '<div style="flex:1;min-width:0">' +
        '<div class="ac-lc-dec-text">'+_esc(n.summary||'')+'</div>' +
        (effStr?'<div style="font-size:10px;color:var(--dec);margin-top:2px">'+_esc(effStr)+'</div>':'') +
      '</div>' +
      '<span class="ac-lc-dec-meta">'+_esc(timeStr)+'</span>' +
    '</div>';
  }

  function _wireDecisionAdd(body) {
    var input   = body.querySelector('#ac-lc-dec-input');
    var effDate = body.querySelector('#ac-lc-dec-effdate');
    var btn     = body.querySelector('#ac-lc-dec-btn');
    if (!input||!btn) return;
    function commit() {
      var text = input.value.trim(); if (!text) return;
      if (input.dataset.committing) return;
      input.dataset.committing = '1';
      var extras = {};
      if (effDate && effDate.value) extras.effective_date = effDate.value;
      _insertSectionNode('decision', text, extras).then(function(node) {
        if (!node) { delete input.dataset.committing; return; }
        input.value = ''; delete input.dataset.committing;
        // Reset effective date to today
        if (effDate) effDate.value = new Date().toISOString().slice(0,10);
        _sectionNodes.decision.push(node);
        _updateSectionCount('decision', _sectionNodes.decision);
        var list = document.getElementById('ac-lc-dec-list');
        if (list) { var d=document.createElement('div'); d.innerHTML=_decisionRowHtml(node); list.appendChild(d.firstChild); }
        var empty = body.querySelector('.ac-lc-sec-empty'); if (empty) empty.remove();
      }).catch(function() { delete input.dataset.committing; });
    }
    input.addEventListener('keydown', function(ev) { if (ev.key==='Enter') { ev.preventDefault(); commit(); } });
    btn.addEventListener('click', commit);
  }

  function _wireDecisionClicks(body) {
    body.addEventListener('click', function(ev) {
      var b = ev.target.closest('[data-action="edit-section-node"]');
      if (!b) return;
      var nodeId = b.dataset.nodeId; var tag = b.dataset.tag;
      var node = _sectionNodes.decision.find(function(n){return n.node_id===nodeId;});
      if (node) _openSectionEditPopup(nodeId, tag, node, b);
    });
  }

  // ── Action Items ─────────────────────────────────────────────────────────
  function _paintActions() {
    var body = document.getElementById('ac-lc-actions-body'); if (!body) return;
    var nodes = _sectionNodes.action;
    _updateSectionCount('action', nodes);
    var today = Date.now();
    var html = '<div class="ac-lc-sec-body-inner">';
    if (nodes.length) {
      html += '<table class="ac-lc-act-table">' +
        '<thead class="ac-lc-act-thead"><tr><th>Owner</th><th>Task</th><th>Due</th><th>Status</th></tr></thead><tbody id="ac-lc-act-tbody">';
      nodes.forEach(function(n) { html += _actionRowHtml(n, today); });
      html += '</tbody></table>';
    } else {
      html += '<div class="ac-lc-sec-empty">No action items assigned yet.</div><table class="ac-lc-act-table"><tbody id="ac-lc-act-tbody"></tbody></table>';
    }
    html += '<div class="ac-lc-act-add-row">' +
      '<input class="ac-lc-sec-add-input" id="ac-lc-act-input" placeholder="Task description\u2026" style="flex:2"/>' +
      '<button class="ac-lc-assignee-btn" id="ac-lc-act-assignee-btn">\u{1F464} Assignee</button>' +
      '<input type="date" class="ac-lc-date-input" id="ac-lc-act-due"/>' +
      '<button class="ac-lc-sec-add-btn" id="ac-lc-act-btn" style="color:var(--act);background:var(--act-bg);border:1px solid var(--act-bd)">+ Assign</button>' +
    '</div></div>';
    body.innerHTML = html;
    _actionAssignee = null;
    _wireActionAdd(body);
    _wireActionClicks(body);
  }

  function _actionRowHtml(n, today) {
    today = today || Date.now();
    var bodyData = {};
    try { bodyData = JSON.parse(n.body||'{}'); } catch(e) {}
    var assigneeName = bodyData.assignee_name || bodyData.assignee || '';
    var initials = assigneeName ? assigneeName.split(' ').map(function(w){return w[0]||'';}).join('').slice(0,2).toUpperCase() : '?';
    var dueStr   = n.due_date ? _fmtDate(n.due_date) : '\u2014';
    var isOverdue = n.due_date && new Date(n.due_date).getTime() < today && n.status !== 'complete';
    var isDone    = n.status === 'complete';
    var statusCls = isDone ? 'ac-lc-status-chip--done' : isOverdue ? 'ac-lc-status-chip--overdue' : 'ac-lc-status-chip--open';
    var statusLbl = isDone ? 'Done' : isOverdue ? 'Overdue' : 'Open';
    return '<tr class="ac-lc-act-row" data-node-id="'+_esc(n.node_id)+'">' +
      '<td><div class="ac-lc-act-owner"><div class="ac-lc-act-avatar">'+_esc(initials)+'</div>'+_esc(assigneeName||'\u2014')+'</div></td>' +
      '<td><span class="ac-lc-act-badge" data-action="edit-section-node" data-node-id="'+_esc(n.node_id)+'" data-tag="action">'+_esc(n.seq_id||'AX')+'</span> <span class="ac-lc-act-task">'+_esc((n.summary||'').slice(0,80))+'</span></td>' +
      '<td class="ac-lc-act-due">'+_esc(dueStr)+'</td>' +
      '<td><span class="ac-lc-status-chip '+statusCls+'" data-action="toggle-action-status" data-node-id="'+_esc(n.node_id)+'">'+statusLbl+'</span></td>' +
    '</tr>';
  }

  function _wireActionAdd(body) {
    var input   = body.querySelector('#ac-lc-act-input');
    var asnBtn  = body.querySelector('#ac-lc-act-assignee-btn');
    var dueIn   = body.querySelector('#ac-lc-act-due');
    var addBtn  = body.querySelector('#ac-lc-act-btn');
    if (!input||!asnBtn||!addBtn) return;

    asnBtn.addEventListener('click', function() {
      var resources = _sectionAttendees.length ? _sectionAttendees : (_inviteResourcesFromAttendees());
      window.PersonPicker && window.PersonPicker.show(asnBtn, function(r) {
        _actionAssignee = { id: r.id, name: r.name };
        asnBtn.textContent = r.name;
        asnBtn.style.color = 'var(--hi)';
      }, { resources: resources });
    });

    function commit() {
      var text = input.value.trim(); if (!text) return;
      if (input.dataset.committing) return;
      input.dataset.committing = '1';
      var extras = {};
      if (_actionAssignee) extras.assignee = _actionAssignee;
      if (dueIn && dueIn.value) extras.due_date = dueIn.value;
      _insertSectionNode('action', text, extras).then(function(node) {
        if (!node) { delete input.dataset.committing; return; }
        input.value = ''; if (dueIn) dueIn.value = '';
        _actionAssignee = null;
        asnBtn.textContent = '\u{1F464} Assignee'; asnBtn.style.color = '';
        delete input.dataset.committing;
        _sectionNodes.action.push(node);
        _updateSectionCount('action', _sectionNodes.action);
        var tbody = document.getElementById('ac-lc-act-tbody');
        if (tbody) { var d=document.createElement('tbody'); d.innerHTML=_actionRowHtml(node); tbody.appendChild(d.firstChild); }
        var empty = body.querySelector('.ac-lc-sec-empty'); if (empty) empty.remove();
      }).catch(function() { delete input.dataset.committing; });
    }
    input.addEventListener('keydown', function(ev) { if (ev.key==='Enter') { ev.preventDefault(); commit(); } });
    addBtn.addEventListener('click', commit);
  }

  function _wireActionClicks(body) {
    body.addEventListener('click', function(ev) {
      var b = ev.target.closest('[data-action="edit-section-node"]');
      if (b) {
        var node = _sectionNodes.action.find(function(n){return n.node_id===b.dataset.nodeId;});
        if (node) _openSectionEditPopup(b.dataset.nodeId, b.dataset.tag, node, b);
        return;
      }
      var s = ev.target.closest('[data-action="toggle-action-status"]');
      if (s) {
        var nodeId = s.dataset.nodeId;
        var node2 = _sectionNodes.action.find(function(n){return n.node_id===nodeId;});
        if (!node2) return;
        var newStatus = node2.status==='complete' ? 'pending' : 'complete';
        // IR71: wait for server before updating DOM
        API.patch('accord_nodes?node_id=eq.'+nodeId+'&meeting_id=eq.'+_meeting.meeting_id, { status: newStatus })
          .then(function() {
            node2.status = newStatus;
            _updateSectionCount('action', _sectionNodes.action);
            var tbody = document.getElementById('ac-lc-act-tbody'); if (!tbody) return;
            var row = tbody.querySelector('[data-node-id="'+nodeId+'"]');
            if (row) { var d=document.createElement('tbody'); d.innerHTML=_actionRowHtml(node2); row.parentNode.replaceChild(d.firstChild, row); }
          }).catch(function(e) { console.error('[AccordLiveCapture] action status PATCH failed', e); });
      }
    });
  }

  function _inviteResourcesFromAttendees() {
    // Build PersonPicker-compatible resource list from loaded attendees
    return Object.keys(_attendeeNameMap).map(function(rid) {
      return { id: rid, name: _attendeeNameMap[rid], user_id: null, department: null, is_external: false, title: null };
    });
  }

  // ── Risks & Issues ────────────────────────────────────────────────────────
  function _paintRisks() {
    var body = document.getElementById('ac-lc-risks-body'); if (!body) return;
    var nodes = _sectionNodes.risk;
    _updateSectionCount('risk', nodes);
    var html = '<div class="ac-lc-sec-body-inner">';
    if (nodes.length) {
      html += '<div id="ac-lc-rsk-list">';
      nodes.forEach(function(n) { html += _riskRowHtml(n); });
      html += '</div>';
    } else {
      html += '<div class="ac-lc-sec-empty">No risks or issues flagged yet.</div><div id="ac-lc-rsk-list"></div>';
    }
    html += '<div class="ac-lc-sec-add-row">' +
      '<input class="ac-lc-sec-add-input" id="ac-lc-rsk-input" placeholder="Describe a risk or issue\u2026"/>' +
      '<select class="ac-lc-sev-select" id="ac-lc-rsk-sev">' +
        '<option value="Low">Low</option><option value="Medium" selected>Medium</option><option value="High">High</option>' +
      '</select>' +
      '<button class="ac-lc-sec-add-btn" id="ac-lc-rsk-btn" style="color:var(--rsk);background:var(--rsk-bg);border:1px solid var(--rsk-bd)">+ Flag</button>' +
    '</div></div>';
    body.innerHTML = html;
    _wireRiskAdd(body);
    _wireRiskClicks(body);
  }

  function _riskRowHtml(n) {
    var bodyData = {};
    try { bodyData = JSON.parse(n.body||'{}'); } catch(e) {}
    var sev = bodyData.severity || '';
    var sevCls = sev==='High'?'--high':sev==='Low'?'--low':'--medium';
    var badgeCls = n.tag==='dissent' ? 'ac-lc-ds-badge' : 'ac-lc-rsk-badge';
    return '<div class="ac-lc-rsk-row" data-node-id="'+_esc(n.node_id)+'">' +
      '<span class="'+badgeCls+'" data-action="edit-section-node" data-node-id="'+_esc(n.node_id)+'" data-tag="'+_esc(n.tag)+'">'+_esc(n.seq_id||(n.tag==='dissent'?'DS':'RK'))+'</span>' +
      '<span class="ac-lc-rsk-text">'+_esc((n.summary||'').slice(0,100))+'</span>' +
      (sev?'<span class="ac-lc-severity-chip ac-lc-severity-chip'+sevCls+'">'+_esc(sev)+'</span>':'') +
    '</div>';
  }

  function _wireRiskAdd(body) {
    var input  = body.querySelector('#ac-lc-rsk-input');
    var selSev = body.querySelector('#ac-lc-rsk-sev');
    var btn    = body.querySelector('#ac-lc-rsk-btn');
    if (!input||!btn) return;
    function commit() {
      var text = input.value.trim(); if (!text) return;
      if (input.dataset.committing) return;
      input.dataset.committing = '1';
      var sev = selSev ? selSev.value : 'Medium';
      _insertSectionNode('risk', text, { severity: sev }).then(function(node) {
        if (!node) { delete input.dataset.committing; return; }
        input.value = ''; delete input.dataset.committing;
        _sectionNodes.risk.push(node);
        _updateSectionCount('risk', _sectionNodes.risk);
        var list = document.getElementById('ac-lc-rsk-list');
        if (list) { var d=document.createElement('div'); d.innerHTML=_riskRowHtml(node); list.appendChild(d.firstChild); }
        var empty = body.querySelector('.ac-lc-sec-empty'); if (empty) empty.remove();
      }).catch(function() { delete input.dataset.committing; });
    }
    input.addEventListener('keydown', function(ev) { if (ev.key==='Enter') { ev.preventDefault(); commit(); } });
    btn.addEventListener('click', commit);
  }

  function _wireRiskClicks(body) {
    body.addEventListener('click', function(ev) {
      var b = ev.target.closest('[data-action="edit-section-node"]');
      if (!b) return;
      var node = _sectionNodes.risk.find(function(n){return n.node_id===b.dataset.nodeId;});
      if (node) _openSectionEditPopup(b.dataset.nodeId, b.dataset.tag, node, b);
    });
  }

  // ── Parking Lot ───────────────────────────────────────────────────────────
  function _paintParking() {
    var body = document.getElementById('ac-lc-parking-body'); if (!body) return;
    var nodes = _sectionNodes.question;
    _updateSectionCount('question', nodes);
    var html = '<div class="ac-lc-sec-body-inner">';
    if (nodes.length) {
      html += '<div id="ac-lc-park-list">';
      nodes.forEach(function(n) { html += _parkRowHtml(n); });
      html += '</div>';
    } else {
      html += '<div class="ac-lc-sec-empty">No deferred items yet.</div><div id="ac-lc-park-list"></div>';
    }
    html += '<div class="ac-lc-sec-add-row">' +
      '<input class="ac-lc-sec-add-input" id="ac-lc-park-input" placeholder="Defer an item to the parking lot\u2026"/>' +
      '<button class="ac-lc-sec-add-btn" id="ac-lc-park-btn" style="color:#9478e0;background:rgba(148,120,224,.09);border:1px solid rgba(148,120,224,.25)">+ Defer</button>' +
    '</div></div>';
    body.innerHTML = html;
    _wireParkingAdd(body);
    _wireParkingClicks(body);
  }

  function _parkRowHtml(n) {
    return '<div class="ac-lc-park-row" data-node-id="'+_esc(n.node_id)+'">' +
      '<div class="ac-lc-park-dot"></div>' +
      '<div><div class="ac-lc-park-text" data-action="edit-section-node" data-node-id="'+_esc(n.node_id)+'" data-tag="question" style="cursor:pointer">'+_esc((n.summary||'').slice(0,100))+'</div></div>' +
    '</div>';
  }

  function _wireParkingAdd(body) {
    var input = body.querySelector('#ac-lc-park-input');
    var btn   = body.querySelector('#ac-lc-park-btn');
    if (!input||!btn) return;
    function commit() {
      var text = input.value.trim(); if (!text) return;
      if (input.dataset.committing) return;
      input.dataset.committing = '1';
      _insertSectionNode('question', text, {}).then(function(node) {
        if (!node) { delete input.dataset.committing; return; }
        input.value = ''; delete input.dataset.committing;
        _sectionNodes.question.push(node);
        _updateSectionCount('question', _sectionNodes.question);
        var list = document.getElementById('ac-lc-park-list');
        if (list) { var d=document.createElement('div'); d.innerHTML=_parkRowHtml(node); list.appendChild(d.firstChild); }
        var empty = body.querySelector('.ac-lc-sec-empty'); if (empty) empty.remove();
      }).catch(function() { delete input.dataset.committing; });
    }
    input.addEventListener('keydown', function(ev) { if (ev.key==='Enter') { ev.preventDefault(); commit(); } });
    btn.addEventListener('click', commit);
  }

  function _wireParkingClicks(body) {
    body.addEventListener('click', function(ev) {
      var b = ev.target.closest('[data-action="edit-section-node"]');
      if (!b) return;
      var node = _sectionNodes.question.find(function(n){return n.node_id===b.dataset.nodeId;});
      if (node) _openSectionEditPopup(b.dataset.nodeId, b.dataset.tag, node, b);
    });
  }

  // ── Shared section INSERT ─────────────────────────────────────────────────
  // IR47: Prefer: return=representation confirmed — API layer returns full row.
  // IR73: No meeting_id in accord_nodes WHERE (it's the INSERT row, not a PATCH).
  function _insertSectionNode(tag, summary, extras) {
    var m  = _meeting;
    var me = window.Accord && window.Accord.state && window.Accord.state.me;
    if (!m || !me) return Promise.reject(new Error('no meeting/me'));

    // Use Accord.state.thread as thread_id (same pattern as _commitNote)
    var stateThread = window.Accord && window.Accord.state && window.Accord.state.thread;
    var threadId = (stateThread && stateThread.thread_id) || null;

    var row = {
      firm_id:        me.firm_id,
      meeting_id:     m.meeting_id,
      agenda_item_id: null,
      tag:            tag,
      summary:        summary.slice(0, 280),
      body:           null,
      created_by:     me.id,
      // discipline, topic: intentionally omitted (Knowledge Base CMD)
    };
    if (threadId) row.thread_id = threadId;

    if (tag === 'action' && extras.assignee) {
      row.body = JSON.stringify({ assignee_resource_id: extras.assignee.id, assignee_name: extras.assignee.name });
      if (extras.due_date) row.due_date = extras.due_date;
    } else if (tag === 'decision' && extras.effective_date) {
      row.effective_date = extras.effective_date;
    } else if ((tag === 'risk' || tag === 'question') && extras.severity) {
      row.body = JSON.stringify({ severity: extras.severity });
    }

    return API.post('accord_nodes', row).then(function(created) {
      var node = Array.isArray(created) ? created[0] : created;
      // IR72: broadcast to meeting channel
      if (window.Accord && window.Accord.broadcast) {
        window.Accord.broadcast('accord.node.committed', {
          node_id:    node.node_id,
          thread_id:  node.thread_id,
          meeting_id: node.meeting_id,
          tag:        node.tag,
          summary:    node.summary,
          created_by: node.created_by,
          created_at: node.created_at,
        });
      }
      return node;
    });
  }

  // ── Section edit popup ────────────────────────────────────────────────────
  function _openSectionEditPopup(nodeId, tag, node, anchorEl) {
    var old = document.getElementById('ac-lc-edit-popup'); if (old&&old.parentElement) old.parentElement.removeChild(old);
    var bodyData = {};
    try { bodyData = JSON.parse(node.body||'{}'); } catch(e) {}

    var extraFields = '';
    if (tag==='decision') {
      extraFields = '<div class="ac-lc-edit-field"><label>Effective date (optional)</label>' +
        '<input type="date" id="ac-lc-ep-effdate" value="'+_esc(node.effective_date||'')+'"/></div>';
    } else if (tag==='action') {
      var assigneeName = bodyData.assignee_name||bodyData.assignee||'';
      var assigneeId   = bodyData.assignee_resource_id||'';
      extraFields = '<div class="ac-lc-edit-field"><label>Assignee</label>' +
        '<button class="ac-lc-assignee-btn" id="ac-lc-ep-asn-btn" data-assignee-id="'+_esc(assigneeId)+'">'+_esc(assigneeName||'\u{1F464} Select assignee')+'</button></div>' +
        '<div class="ac-lc-edit-field"><label>Due date</label>' +
        '<input type="date" id="ac-lc-ep-duedate" value="'+_esc(node.due_date||'')+'"/></div>';
    } else if (tag==='risk') {
      var sev = bodyData.severity||'Medium';
      extraFields = '<div class="ac-lc-edit-field"><label>Severity</label>' +
        '<select id="ac-lc-ep-severity" style="background:var(--b0);border:1px solid rgba(255,255,255,.12);border-radius:4px;padding:5px 8px;font-size:12px;font-family:inherit;color:var(--hi)">' +
          ['Low','Medium','High'].map(function(v){return '<option value="'+v+'"'+(v===sev?' selected':'')+'>'+v+'</option>';}).join('') +
        '</select></div>';
    }

    var popup = document.createElement('div');
    popup.id = 'ac-lc-edit-popup';
    popup.className = 'ac-lc-edit-popup';
    popup.innerHTML =
      '<div class="ac-lc-edit-title">Edit '+tag+'</div>' +
      '<div class="ac-lc-edit-field"><label>Summary</label>' +
        '<textarea id="ac-lc-ep-summary" rows="3">'+_esc(node.summary||'')+'</textarea></div>' +
      extraFields +
      '<div class="ac-lc-edit-actions">' +
        '<button class="ac-lc-edit-cancel" id="ac-lc-ep-cancel">Cancel</button>' +
        '<button class="ac-lc-edit-save" id="ac-lc-ep-save">Save</button>' +
      '</div>';

    var shell = document.getElementById('ac-lc-shell') || document.body;
    shell.appendChild(popup);

    // Position
    var rect = anchorEl.getBoundingClientRect();
    var shellRect = shell.getBoundingClientRect();
    var top = rect.bottom - shellRect.top + 6;
    var left = rect.left - shellRect.left;
    if (top + 280 > shell.offsetHeight) top = rect.top - shellRect.top - 280;
    if (left + 270 > shell.offsetWidth)  left = shell.offsetWidth - 275;
    popup.style.top = top+'px'; popup.style.left = left+'px';

    // Backdrop
    var backdrop = document.createElement('div');
    backdrop.className = 'ac-lc-reclassify-backdrop';
    backdrop.addEventListener('click', function() {
      if (popup.parentElement) popup.parentElement.removeChild(popup);
      if (backdrop.parentElement) backdrop.parentElement.removeChild(backdrop);
    });
    shell.insertBefore(backdrop, popup);

    // Wire assignee picker for action
    var asnBtn = popup.querySelector('#ac-lc-ep-asn-btn');
    var _editAssignee = asnBtn ? { id: asnBtn.dataset.assigneeId, name: asnBtn.textContent } : null;
    if (asnBtn) {
      asnBtn.addEventListener('click', function() {
        var resources = _inviteResourcesFromAttendees();
        window.PersonPicker && window.PersonPicker.show(asnBtn, function(r) {
          _editAssignee = { id: r.id, name: r.name };
          asnBtn.textContent = r.name;
        }, { resources: resources });
      });
    }

    popup.querySelector('#ac-lc-ep-cancel').addEventListener('click', function() {
      if (popup.parentElement) popup.parentElement.removeChild(popup);
      if (backdrop.parentElement) backdrop.parentElement.removeChild(backdrop);
    });

    popup.querySelector('#ac-lc-ep-save').addEventListener('click', function() {
      var summaryEl = popup.querySelector('#ac-lc-ep-summary');
      var newSummary = summaryEl ? summaryEl.value.trim() : node.summary;
      if (!newSummary) return;

      var patch = { summary: newSummary };
      // IR73: meeting_id guard on PATCH
      var patchUrl = 'accord_nodes?node_id=eq.'+nodeId+'&meeting_id=eq.'+_meeting.meeting_id;

      if (tag==='decision') {
        var ed = popup.querySelector('#ac-lc-ep-effdate'); if (ed&&ed.value) patch.effective_date = ed.value;
      } else if (tag==='action') {
        var dd = popup.querySelector('#ac-lc-ep-duedate'); if (dd) patch.due_date = dd.value||null;
        if (_editAssignee && _editAssignee.id) patch.body = JSON.stringify({ assignee_resource_id: _editAssignee.id, assignee_name: _editAssignee.name });
      } else if (tag==='risk') {
        var sv = popup.querySelector('#ac-lc-ep-severity'); if (sv) patch.body = JSON.stringify({ severity: sv.value });
      }

      if (popup.parentElement) popup.parentElement.removeChild(popup);
      if (backdrop.parentElement) backdrop.parentElement.removeChild(backdrop);

      // IR71: update DOM only after PATCH confirms
      API.patch(patchUrl, patch).then(function(result) {
        var updated = Array.isArray(result) ? result[0] : result;
        if (!updated) return;
        // Update node in local array
        var arr = null;
        if (tag==='decision') arr = _sectionNodes.decision;
        else if (tag==='action') arr = _sectionNodes.action;
        else if (tag==='risk'||tag==='dissent') arr = _sectionNodes.risk;
        else if (tag==='question') arr = _sectionNodes.question;
        if (arr) {
          for (var i=0;i<arr.length;i++) {
            if (arr[i].node_id===nodeId) { arr[i]=Object.assign(arr[i],patch,{seq_id:updated.seq_id||arr[i].seq_id}); break; }
          }
        }
        // Update badge seq_id
        var badgeEl = document.querySelector('[data-action="edit-section-node"][data-node-id="'+nodeId+'"]');
        if (badgeEl && updated.seq_id) badgeEl.textContent = updated.seq_id;
        // Update summary in DOM
        var rowEl = document.querySelector('[data-node-id="'+nodeId+'"]');
        if (rowEl) {
          var textEl = rowEl.querySelector('.ac-lc-dec-text,.ac-lc-act-task,.ac-lc-rsk-text,.ac-lc-park-text');
          if (textEl) textEl.textContent = newSummary.slice(0,100);
        }
      }).catch(function(e) { console.error('[AccordLiveCapture] section edit PATCH failed', e); });
    });
  }

  function _onRemoteNode(ev) {
    var node = ev.detail||{}; if (!node.node_id||!node.meeting_id) return;
    if (!_meeting||node.meeting_id!==_meeting.meeting_id) return;

    // Route to correct section by tag (Phase 5)
    var sectionTags = ['decision','action','risk','dissent','question'];
    if (sectionTags.indexOf(node.tag) !== -1) {
      var sKey = (node.tag==='dissent') ? 'risk' : node.tag;
      if (_sectionNodes[sKey]) {
        if (!_sectionNodes[sKey].find(function(n){return n.node_id===node.node_id;})) {
          _sectionNodes[sKey].push(node);
          _updateSectionCount(sKey, _sectionNodes[sKey]);
          // If section body is visible, append row
          var bodyMap = { decision: 'ac-lc-dec-list', action: 'ac-lc-act-tbody', risk: 'ac-lc-rsk-list', question: 'ac-lc-park-list' };
          var listEl = document.getElementById(bodyMap[sKey]);
          if (listEl) {
            var d = document.createElement('div');
            if (sKey==='decision') d.innerHTML = _decisionRowHtml(node);
            else if (sKey==='action') { d=document.createElement('tbody'); d.innerHTML = _actionRowHtml(node); }
            else if (sKey==='risk') d.innerHTML = _riskRowHtml(node);
            else if (sKey==='question') d.innerHTML = _parkRowHtml(node);
            listEl.appendChild(d.firstChild);
          }
        }
      }
      return; // don't fall through to agenda routing
    }

    var aid = node.agenda_item_id; if (!aid) return;
    if (_agendaExpanded[aid]) {
      var cEl = document.getElementById('ac-lc-captured-'+aid);
      if (cEl) {
        if (!cEl.previousElementSibling||!cEl.previousElementSibling.classList.contains('ac-lc-captured-label')) {
          var lbl=document.createElement('div'); lbl.className='ac-lc-captured-label'; lbl.textContent='Captured this meeting';
          cEl.parentElement.insertBefore(lbl,cEl);
        }
        var rEl=document.createElement('div'); rEl.innerHTML=_capturedRowHtml(node); cEl.appendChild(rEl.firstChild);
      }
    } else {
      _agendaNewCounts[aid] = (_agendaNewCounts[aid]||0)+1;
      var bEl = document.getElementById('ac-lc-new-'+aid);
      if (bEl) { bEl.textContent = _agendaNewCounts[aid]+' new'; }
      else {
        var iEl = document.getElementById('ac-lc-item-'+aid);
        if (iEl) {
          var hdr = iEl.querySelector('.ac-lc-agenda-item-header');
          if (hdr&&!hdr.querySelector('#ac-lc-new-'+aid)) {
            var sp=document.createElement('span'); sp.className='ac-lc-new-badge'; sp.id='ac-lc-new-'+aid; sp.textContent=_agendaNewCounts[aid]+' new';
            hdr.insertBefore(sp, hdr.querySelector('.ac-lc-item-status-btn')||null);
          }
        }
      }
    }
  }

  function _onRemoteAgenda() {
    if (!_meeting) return;
    API.get('accord_agenda_items?meeting_id=eq.'+_meeting.meeting_id+'&select=*&order=position.asc')
      .then(function(rows) { _agendaItems=rows||[]; _renderAgendaSection(); _renderProgressBar(_agendaItems); }).catch(function() {});
  }

  // Teardown
  function _teardown() {
    _stopTimer(); _stopPresencePoll(); _unsubscribeChatRealtime();
    if (_intersectionObs) { _intersectionObs.disconnect(); _intersectionObs=null; }
    _chatMessages=[]; _agendaItems=[]; _agendaExpanded={}; _agendaHistCollapsed={}; _agendaNewCounts={};
    _sectionNodes={decision:[],action:[],risk:[],question:[]}; _sectionAttendees=[]; _actionAssignee=null;
    _meeting=null; _myResourceId=null; _attendeeNameMap={};
    var host = document.getElementById('ac-meeting-surface-host'); if (host) host.innerHTML='';
  }

  function _onLevelChanged() {
    _teardown();
    window.removeEventListener('accord:level-changed', _onLevelChanged);
    window.removeEventListener('accord:remote-node',   _onRemoteNode);
    window.removeEventListener('accord:remote-agenda', _onRemoteAgenda);
  }

  // Public API
  function render(meeting) {
    _meeting = meeting;
    _myResourceId = (window.Accord&&window.Accord.state&&window.Accord.state.me&&window.Accord.state.me.resource_id)||null;
    _ensureOutfitFont();

    var host = document.getElementById('ac-meeting-surface-host');
    if (!host) { console.error('[AccordLiveCapture] #ac-meeting-surface-host not found'); return; }

    host.innerHTML = _shellHtml(meeting);

    if (window.Accord&&window.Accord.switchSurface) window.Accord.switchSurface('capture');

    _startTimer(meeting.started_at);
    _loadProgressBar(meeting.meeting_id);
    _loadAttendees(meeting.meeting_id);
    _loadChatHistory(meeting.meeting_id);
    _subscribeChatRealtime(meeting.meeting_id);
    _loadAgenda(meeting.meeting_id);
    _loadPriorActionStrip(meeting.workstream_id, meeting.meeting_id);
    _loadSectionNodes(meeting.meeting_id);
    // Phase 5: pre-populate _sectionAttendees for PersonPicker
    // Done after _loadAttendees resolves via _attendeeNameMap
    setTimeout(function() { _sectionAttendees = _inviteResourcesFromAttendees(); }, 1000);

    var ci = document.getElementById('ac-lc-chat-input'); var cs = document.getElementById('ac-lc-chat-send');
    if (ci) ci.addEventListener('keydown', function(ev) { if (ev.key==='Enter'&&!ev.shiftKey) { ev.preventDefault(); _sendChatMessage(meeting); } });
    if (cs) cs.addEventListener('click', function() { _sendChatMessage(meeting); });

    _wireSidebarResize();
    _wireSectionToggles();
    _wireNavObserver();
    _wireNavClicks();

    window.removeEventListener('accord:level-changed', _onLevelChanged);
    window.addEventListener('accord:level-changed',    _onLevelChanged);
    window.removeEventListener('accord:remote-node',   _onRemoteNode);
    window.addEventListener('accord:remote-node',      _onRemoteNode);
    window.removeEventListener('accord:remote-agenda', _onRemoteAgenda);
    window.addEventListener('accord:remote-agenda',    _onRemoteAgenda);
  }

  function destroy() {
    _teardown();
    window.removeEventListener('accord:level-changed', _onLevelChanged);
    window.removeEventListener('accord:remote-node',   _onRemoteNode);
    window.removeEventListener('accord:remote-agenda', _onRemoteAgenda);
  }

  return { render: render, destroy: destroy };
})();