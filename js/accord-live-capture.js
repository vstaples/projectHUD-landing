// ============================================================
// accord-live-capture.js
// CMD-ACCORD-LIVE-CAPTURE-1 · Phase 3 + Phase 4 + Phase 5 + Phase 6
// 2026-05-18 · Operator: Vaughn Staples
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
// Phase 5: Decisions, Actions, Risks, Parking Lot sections.
// Phase 6: End Meeting flow + status bar.
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
  var _agendaClickHandler  = null;  // named handler ref for remove/re-add
  var _updateNavActive     = null;  // set by _wireNavObserver; called on expand/collapse
  var _agendaSectionOpen   = true;

  // Phase 5 section state
  var _sectionNodes = { decision: [], action: [], risk: [], question: [] };
  var _sectionAttendees = [];   // meeting attendees for PersonPicker in Actions
  var _actionAssignee = null;   // pending assignee from PersonPicker in add row

  // Preview / Review mode state
  var _excludedNodeIds  = new Set();   // nodes struck from preview by Exclude button
  var _agendaNodeCache  = {};          // agenda_item_id → captured node array
  var _attendeesList    = [];          // full attendee list with rsvp_status for preview
  var _outcomesCache    = [];          // accord_meeting_outcomes rows for preview
  var _workstreamName   = '';          // workstream display name for preview

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
    var m = { decision: '#6a5acd', note: '#2a9d6e', action: '#c97d1a', risk: '#c0392b', dissent: '#c0392b', question: '#6b7590' };
    return m[tag] || 'var(--md)';
  }
  function _tagBg(tag) {
    var m = { decision: '#ede9fb', note: '#e6f7f0', action: '#fdf3e3', risk: '#fdecea', dissent: '#fdecea', question: '#f0f2f7' };
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
    '.ac-lc-end-btn{font-size:11px;font-weight:600;letter-spacing:.3px;color:var(--rsk);background:var(--rsk-bg);border:1px solid var(--rsk-bd);border-radius:6px;padding:4px 12px;cursor:pointer;flex-shrink:0;transition:opacity .1s}.ac-lc-end-btn:hover{opacity:.8}.ac-lc-end-btn:disabled{opacity:.45;cursor:not-allowed}' +
    '.ac-lc-body{display:flex;flex:1;min-height:0;overflow:hidden}' +
    '.ac-lc-sidebar{display:flex;flex-direction:column;flex-shrink:0;position:relative;background:var(--surface);border-right:1px solid rgba(255,255,255,.06);overflow:hidden;min-width:160px;max-width:320px}' +
    '.ac-lc-resize-handle{position:absolute;top:0;right:-3px;bottom:0;width:6px;cursor:col-resize;z-index:10;transition:background .15s}.ac-lc-resize-handle:hover,.ac-lc-resize-handle.dragging{background:rgba(74,140,245,.3)}' +
    '.ac-lc-sidebar-inner{flex:1;overflow-y:auto;display:flex;flex-direction:column}' +
    '.ac-lc-section-label{font-size:10px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:var(--hi);padding:14px 14px 6px}' +
    '.ac-lc-nav{padding:0 8px 10px}.ac-lc-nav-item{display:block;padding:5px 8px;border-radius:5px;font-size:12px;color:var(--md);text-decoration:none;cursor:pointer;transition:background .1s,color .1s}.ac-lc-nav-item:hover{background:var(--raised);color:var(--hi)}.ac-lc-nav-item.active{background:var(--b1);color:var(--hi);font-weight:600}.ac-lc-nav-item.active[data-section="agenda"]{box-shadow:-2px 0 0 0 var(--nt)}.ac-lc-nav-item.active[data-section="decisions"]{box-shadow:-2px 0 0 0 var(--dec)}.ac-lc-nav-item.active[data-section="actions"]{box-shadow:-2px 0 0 0 var(--act)}.ac-lc-nav-item.active[data-section="risks"]{box-shadow:-2px 0 0 0 var(--rsk)}.ac-lc-nav-item.active[data-section="parking"]{box-shadow:-2px 0 0 0 #9478e0}' +
    '.ac-lc-attendees{padding:0 8px 10px}.ac-lc-attendee-row{display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:5px;font-size:12px;transition:opacity .2s}.ac-lc-attendee-row.absent{opacity:.45}.ac-lc-presence-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;background:rgba(255,255,255,.18)}.ac-lc-presence-dot.present{background:var(--live)}.ac-lc-attendee-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ac-lc-you-tag{font-size:9px;font-weight:600;letter-spacing:.5px;color:var(--dec);text-transform:uppercase;flex-shrink:0}' +
    '.ac-lc-chat{display:flex;flex-direction:column;flex:1;min-height:0;border-top:1px solid rgba(255,255,255,.06)}.ac-lc-chat-viewport{flex:1;overflow-y:auto;padding:10px 10px 6px;background:#060a12;border:1px solid rgba(255,255,255,.08);margin:6px 8px 0;border-radius:8px 8px 0 0;display:flex;flex-direction:column;gap:2px;box-shadow:inset 0 2px 8px rgba(0,0,0,.4)}.ac-lc-chat-msg-group{display:flex;flex-direction:column;margin-bottom:6px}.ac-lc-chat-msg-header{display:flex;gap:6px;align-items:baseline;font-size:10px;color:var(--lo);margin-bottom:2px;padding:0 2px}.ac-lc-chat-msg-header.me{justify-content:flex-end}.ac-lc-chat-msg-author{font-weight:500;color:var(--md)}.ac-lc-chat-msg-row{display:flex}.ac-lc-chat-msg-row.me{justify-content:flex-end}.ac-lc-chat-msg-row.other{justify-content:flex-start}.ac-lc-chat-bubble{max-width:82%;border-radius:10px;font-size:12px;line-height:1.45;padding:6px 10px;word-break:break-word}.ac-lc-chat-msg-row.me .ac-lc-chat-bubble{background:var(--dec-bg);border:1px solid var(--dec-bd);color:var(--hi);border-radius:10px 10px 2px 10px}.ac-lc-chat-msg-row.other .ac-lc-chat-bubble{background:var(--raised);border:1px solid rgba(255,255,255,.06);color:var(--hi);border-radius:10px 10px 10px 2px}.ac-lc-chat-input-row{display:flex;gap:6px;padding:6px 8px 10px}.ac-lc-chat-input{flex:1;background:var(--raised);border:1px solid rgba(255,255,255,.10);border-radius:6px;padding:6px 10px;font-size:12px;font-family:inherit;color:var(--hi);resize:none;min-height:32px;max-height:80px;outline:none;transition:border-color .15s,background .15s}.ac-lc-chat-input:hover{border-color:rgba(255,255,255,.22);background:var(--hover)}.ac-lc-chat-input:focus{border-color:rgba(74,140,245,.5);background:var(--hover)}.ac-lc-chat-send{font-size:11px;font-weight:600;color:var(--dec);background:var(--dec-bg);border:1px solid var(--dec-bd);border-radius:6px;padding:6px 12px;cursor:pointer;flex-shrink:0;transition:background .15s}.ac-lc-chat-send:hover{background:rgba(74,140,245,.16)}.ac-lc-chat-empty{flex:1;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--lo);font-style:italic}' +
    '.ac-lc-canvas{flex:1;min-width:0;overflow-y:auto;padding:0}' +
    '.ac-lc-sec-header{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:10px;padding:10px 20px;background:var(--void);border-bottom:1px solid rgba(255,255,255,.06);cursor:pointer;user-select:none}' +
    '.ac-lc-sec-bar{width:3px;height:16px;border-radius:2px;flex-shrink:0}.ac-lc-sec-bar--agenda{background:var(--nt)}.ac-lc-sec-bar--decisions{background:var(--dec)}.ac-lc-sec-bar--actions{background:var(--act)}.ac-lc-sec-bar--risks{background:var(--rsk)}.ac-lc-sec-bar--parking{background:#9478e0}' +
    '.ac-lc-sec-title{font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--md);flex:1}.ac-lc-sec-meta{font-size:11px;color:var(--lo)}.ac-lc-sec-chevron{font-size:10px;color:var(--lo);transition:transform .15s}.ac-lc-sec-chevron.open{transform:rotate(90deg)}' +
    '.ac-lc-sec-body{padding:0 20px 16px}.ac-lc-sec-placeholder{font-size:12px;color:var(--lo);font-style:italic;padding:20px 20px 24px}' +
    '.ac-lc-prior-strip{margin-bottom:12px;border-radius:6px;border:1px solid var(--act-bd);overflow:hidden}.ac-lc-prior-strip-header{display:flex;align-items:center;gap:8px;padding:7px 12px;background:var(--act-bg);cursor:pointer;font-size:11px;font-weight:600;color:var(--act)}.ac-lc-prior-pill{font-size:10px;font-weight:600;border-radius:10px;padding:1px 7px}.ac-lc-prior-pill--overdue{background:var(--rsk-bg);color:var(--rsk);border:1px solid var(--rsk-bd)}.ac-lc-prior-pill--open{background:var(--act-bg);color:var(--act);border:1px solid var(--act-bd)}.ac-lc-prior-strip-body{display:none}.ac-lc-prior-strip-body.open{display:block}.ac-lc-prior-row{display:flex;align-items:baseline;gap:8px;padding:5px 12px;border-top:1px solid rgba(255,255,255,.04);font-size:11px}.ac-lc-prior-seq{font-family:monospace;font-size:10px;color:var(--act);flex-shrink:0}.ac-lc-prior-summary{flex:1;color:var(--md)}.ac-lc-prior-overdue-dot{color:var(--rsk);font-size:9px;flex-shrink:0}' +
    '.ac-lc-agenda-item{border-radius:6px;margin-bottom:8px;margin-left:8px;border:none;box-shadow:-2px 0 0 0 var(--nt);overflow:visible}.ac-lc-agenda-item-header{display:flex;align-items:center;gap:8px;padding:5px 10px;cursor:pointer;background:#13172a;border-radius:6px;transition:background .1s}.ac-lc-agenda-item-header:hover{background:var(--hover)}.ac-lc-agenda-item.expanded .ac-lc-agenda-item-header{border-radius:6px 6px 0 0}.ac-lc-item-chevron{font-size:9px;color:var(--lo);transition:transform .15s;flex-shrink:0}.ac-lc-item-chevron.open{transform:rotate(90deg)}.ac-lc-item-num{font-size:11px;color:var(--lo);flex-shrink:0;min-width:18px}.ac-lc-item-title{flex:1;font-size:13px;font-weight:500;color:var(--hi)}.ac-lc-active-badge{font-size:10px;font-weight:600;color:var(--live);background:rgba(52,212,153,.10);border:1px solid rgba(52,212,153,.22);border-radius:10px;padding:1px 8px;flex-shrink:0}.ac-lc-new-badge{font-size:10px;font-weight:600;color:var(--dec);background:var(--dec-bg);border:1px solid var(--dec-bd);border-radius:10px;padding:1px 7px;flex-shrink:0}.ac-lc-item-status-btn{font-size:10px;font-weight:600;border-radius:5px;padding:2px 9px;cursor:pointer;border:none;flex-shrink:0;transition:opacity .1s}.ac-lc-item-status-btn:hover{opacity:.8}.ac-lc-item-status-btn--discuss{color:var(--nt);background:var(--nt-bg);border:1px solid var(--nt-bd)}.ac-lc-item-status-btn--skip{color:var(--lo);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10)}.ac-lc-item-status-btn--done{color:var(--dec);background:var(--dec-bg);border:1px solid var(--dec-bd);cursor:default}.ac-lc-item-status-btn--skipped{color:var(--lo);background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);cursor:default;text-decoration:line-through}.ac-lc-agenda-item-body{padding:0 10px 8px;background:#13172a;border-top:1px solid rgba(255,255,255,.06);border-radius:0 0 6px 6px}' +
    '.ac-lc-history-header{display:flex;align-items:center;gap:6px;padding:5px 0 4px;cursor:pointer;font-size:10px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--lo);user-select:none}.ac-lc-history-meta{margin-left:auto;font-size:10px;color:var(--lo);font-weight:400;text-transform:none;letter-spacing:0}.ac-lc-history-chevron{font-size:9px;transition:transform .12s}.ac-lc-history-chevron.open{transform:rotate(90deg)}.ac-lc-history-body{display:none}.ac-lc-history-body.open{display:block}.ac-lc-history-row{display:flex;align-items:baseline;gap:8px;padding:4px 0;font-size:11px;border-bottom:1px solid rgba(255,255,255,.03)}.ac-lc-history-row:last-child{border-bottom:none}.ac-lc-history-date{color:var(--lo);flex-shrink:0}.ac-lc-history-badge{font-size:9px;font-weight:700;border-radius:3px;padding:1px 5px;flex-shrink:0}.ac-lc-history-text{flex:1;color:var(--md)}.ac-lc-no-history{font-size:11px;color:var(--lo);font-style:italic;padding:4px 0 8px}' +
    '.ac-lc-captured-label{font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--lo);padding:4px 0 4px 8px}.ac-lc-captured-row{display:flex;align-items:center;gap:8px;padding:5px 10px;font-size:12px;margin-left:8px;margin-bottom:4px;border-radius:6px;box-shadow:-2px 0 0 0 var(--nt);background:rgba(72,170,136,.10);cursor:pointer;transition:background .1s}.ac-lc-captured-badge{font-size:9px;font-weight:700;border-radius:3px;padding:1px 5px;flex-shrink:0;cursor:pointer;transition:opacity .1s}.ac-lc-captured-badge:hover{opacity:.75}.ac-lc-captured-text{flex:1;color:var(--md)}.ac-lc-captured-time{color:var(--lo);flex-shrink:0;font-size:10px;margin-right:18px}' +
    '.ac-lc-add-zone{margin-top:6px;margin-left:8px;position:relative}.ac-lc-add-textarea{width:100%;box-sizing:border-box;background:rgba(232,148,48,.025);border:1px solid rgba(232,148,48,.28);border-radius:6px;padding:8px 10px 32px;font-size:12px;font-family:inherit;color:var(--hi);resize:vertical;min-height:72px;outline:none;transition:background .15s,border-color .15s}.ac-lc-add-textarea:focus{background:rgba(232,148,48,.05);border-color:rgba(232,148,48,.5)}.ac-lc-add-btn{position:absolute;bottom:8px;right:8px;font-size:11px;font-weight:600;color:var(--nt);background:var(--nt-bg);border:1px solid var(--nt-bd);border-radius:5px;padding:3px 10px;cursor:pointer;transition:opacity .1s}.ac-lc-add-btn:hover{opacity:.8}' +
    '.ac-lc-reclassify-backdrop{position:fixed;inset:0;z-index:200}.ac-lc-reclassify-popup{position:fixed;z-index:201;background:var(--raised);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:14px;min-width:220px;box-shadow:0 8px 32px rgba(0,0,0,.5)}.ac-lc-reclassify-title{font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--lo);margin-bottom:10px}.ac-lc-reclassify-types{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}.ac-lc-reclassify-type{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:5px;cursor:pointer;font-size:12px;font-weight:500;transition:background .1s}.ac-lc-reclassify-type:hover,.ac-lc-reclassify-type.selected{background:var(--hover)}.ac-lc-reclassify-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}.ac-lc-reclassify-fields{display:flex;flex-direction:column;gap:6px;margin-bottom:10px}.ac-lc-reclassify-field{display:flex;flex-direction:column;gap:3px}.ac-lc-reclassify-field label{font-size:10px;color:var(--lo)}.ac-lc-reclassify-field input{background:var(--b0);border:1px solid rgba(255,255,255,.12);border-radius:4px;padding:4px 8px;font-size:12px;font-family:inherit;color:var(--hi);outline:none}.ac-lc-reclassify-field input:focus{border-color:rgba(74,140,245,.4)}.ac-lc-reclassify-actions{display:flex;gap:6px;justify-content:flex-end}.ac-lc-reclassify-cancel{font-size:11px;color:var(--lo);background:transparent;border:1px solid rgba(255,255,255,.10);border-radius:5px;padding:4px 10px;cursor:pointer}.ac-lc-reclassify-confirm{font-size:11px;font-weight:600;color:var(--hi);background:var(--dec);border:none;border-radius:5px;padding:4px 12px;cursor:pointer}.ac-lc-reclassify-confirm:hover{opacity:.88}' +
    '.ac-lc-timeline,.ac-ws-timeline,.ac-filmstrip,.ac-status-bar{display:none!important}' +
    // Phase 6: Status bar chips
    '.ac-lc-filmstrip-chip{display:inline-flex;align-items:center;gap:5px;font-size:11px;padding:3px 10px;border-radius:100px;background:var(--raised);border:1px solid var(--b0);color:var(--md);white-space:nowrap;cursor:default;flex-shrink:0}' +
    '.ac-lc-filmstrip-chip--current{border-color:var(--dec-bd);color:var(--dec);background:var(--dec-bg)}' +
    '.ac-lc-filmstrip-badge{font-size:9px;font-weight:700;border-radius:8px;padding:1px 6px;flex-shrink:0}' +
    '.ac-lc-filmstrip-badge--dec{color:var(--dcn,#9478e0);background:rgba(148,120,224,.12);border:1px solid rgba(148,120,224,.25)}' +
    '.ac-lc-filmstrip-badge--act{color:var(--act);background:var(--act-bg);border:1px solid var(--act-bd)}' +
    '.ac-lc-empty-agenda{font-size:12px;color:var(--lo);font-style:italic;padding:16px 0}' +'.ac-lc-dec-row:hover{background:#1a2035}' +'.ac-lc-rsk-row:hover{background:#1a2035}' +'.ac-lc-park-row:hover{background:#1a2035}' +
    '.ac-lc-captured-row{position:relative}' +
    '.ac-lc-captured-row:hover{background:rgba(72,170,136,.22)}' +
    '.ac-lc-captured-row.selected{background:rgba(72,170,136,.20);outline:1px solid var(--nt)}' +
    '.ac-lc-note-delete{display:none;position:absolute;right:6px;top:50%;transform:translateY(-50%);font-size:11px;font-weight:700;color:var(--rsk);background:var(--rsk-bg);border:1px solid var(--rsk-bd);border-radius:3px;padding:0 5px;cursor:pointer;line-height:18px;z-index:10}' +
    '.ac-lc-captured-row:hover .ac-lc-note-delete{display:block}' +
    '.ac-lc-note-edit-popup{position:fixed;z-index:201;background:var(--raised);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:14px;min-width:280px;box-shadow:0 8px 32px rgba(0,0,0,.5)}' +

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
    '.ac-lc-dec-row{display:flex;align-items:center;gap:10px;padding:5px 10px;margin-bottom:8px;margin-left:8px;border-radius:6px;box-shadow:-2px 0 0 0 var(--dec);background:#13172a;cursor:pointer;transition:background .1s}' +
    
    '.ac-lc-dec-badge{font-size:9px;font-weight:700;border-radius:2px;padding:2px 5px;flex-shrink:0;cursor:pointer;color:var(--dec);background:var(--dec-bg);border:1px solid var(--dec-bd)}' +
    '.ac-lc-dec-text{flex:1;font-size:12px;color:var(--hi);line-height:1.4}' +
    '.ac-lc-dec-meta{font-size:11px;color:var(--lo);white-space:nowrap;flex-shrink:0;padding-top:2px}' +
    // Actions table
    '.ac-lc-act-table{width:100%;border-collapse:collapse;font-size:12px}' +
    '.ac-lc-act-thead th{font-size:10px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--lo);text-align:left;padding:2px 8px 8px}' +
    '.ac-lc-act-table{margin-left:8px;width:calc(100% - 8px);border-spacing:0 4px;border-collapse:separate}' +'.ac-lc-act-row td{background:#13172a;padding:4px 8px;vertical-align:middle}' +'.ac-lc-act-row td:first-child{border-left:2px solid var(--act);border-radius:6px 0 0 6px;padding-left:10px}' +'.ac-lc-act-row td:last-child{border-radius:0 6px 6px 0}' +'.ac-lc-act-row:hover td{background:#1a2035;border-radius:inherit}' +
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
    '.ac-lc-rsk-row{display:flex;align-items:center;gap:10px;padding:5px 10px;margin-bottom:8px;margin-left:8px;border-radius:6px;box-shadow:-2px 0 0 0 var(--rsk);background:#13172a;cursor:pointer;transition:background .1s}' +
    
    '.ac-lc-rsk-badge{font-size:9px;font-weight:700;border-radius:2px;padding:2px 5px;flex-shrink:0;cursor:pointer;color:var(--rsk);background:var(--rsk-bg);border:1px solid var(--rsk-bd)}' +
    '.ac-lc-ds-badge{font-size:9px;font-weight:700;border-radius:2px;padding:2px 5px;flex-shrink:0;cursor:pointer;color:var(--rsk);background:var(--rsk-bg);border:1px solid var(--rsk-bd)}' +
    '.ac-lc-rsk-text{flex:1;font-size:12px;color:var(--hi)}' +
    '.ac-lc-severity-chip{font-size:9px;font-weight:600;border-radius:10px;padding:1px 7px;flex-shrink:0}' +
    '.ac-lc-severity-chip--low{color:var(--act);background:var(--act-bg);border:1px solid var(--act-bd)}' +
    '.ac-lc-severity-chip--medium{color:var(--act);background:var(--act-bg);border:1px solid var(--act-bd)}' +
    '.ac-lc-severity-chip--high{color:var(--rsk);background:var(--rsk-bg);border:1px solid var(--rsk-bd)}' +
    '.ac-lc-sev-select{background:var(--raised);border:1px solid rgba(255,255,255,.10);border-radius:6px;padding:5px 8px;font-size:12px;font-family:inherit;color:var(--hi);cursor:pointer;flex-shrink:0}' +
    // Parking lot
    '.ac-lc-park-row{display:flex;align-items:center;gap:10px;padding:5px 10px;margin-bottom:8px;margin-left:8px;border-radius:6px;box-shadow:-2px 0 0 0 #9478e0;background:#13172a;cursor:pointer;transition:background .1s}' +
    
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
    '.ac-lc-edit-save{font-size:11px;font-weight:600;color:var(--hi);background:var(--dec);border:none;border-radius:5px;padding:4px 12px;cursor:pointer}' +
    // Phase 7 (CMD-ACCORD-MINUTES-1 v2): Review mode
    '.ac-lc-topbar-right{display:flex;align-items:center;gap:8px;flex-shrink:0}' +
    '.ac-lc-topbar-btn{font-size:11px;font-weight:600;color:var(--hi);background:var(--raised);border:1px solid var(--b2);border-radius:6px;padding:4px 12px;cursor:pointer;flex-shrink:0;transition:opacity .1s;font-family:inherit}.ac-lc-topbar-btn:hover{opacity:.8}' +
    '.ac-lc-review-badge{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:3px 10px;border-radius:3px;flex-shrink:0}' +
    '.ac-lc-review-badge--review{background:rgba(232,148,48,.10);color:var(--act);border:1px solid rgba(232,148,48,.22)}' +
    '.ac-lc-review-badge--ready{background:var(--nt-bg);color:var(--nt);border:1px solid var(--nt-bd)}' +
    '.ac-lc-review-badge--sent{background:var(--dec-bg);color:var(--dec);border:1px solid var(--dec-bd)}' +
    '.ac-lc-send-btn.disabled{opacity:.35;pointer-events:none}' +
    '.ac-lc-review-sidebar{width:240px;flex-shrink:0;background:var(--surface);border-right:1px solid rgba(255,255,255,.06);display:flex;flex-direction:column;overflow-y:auto}' +
    '.ac-lc-rsb-section{padding:12px 16px 10px;border-bottom:1px solid rgba(255,255,255,.06)}' +
    '.ac-lc-rsb-label{font-size:11px;font-weight:700;letter-spacing:.10em;text-transform:uppercase;color:var(--hi);margin-bottom:8px}' +
    '.ac-lc-chk-row{display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer}' +
    '.ac-lc-chk-toggle{width:16px;height:16px;border-radius:50%;border:1px solid var(--b2);flex-shrink:0;transition:all .13s;display:flex;align-items:center;justify-content:center}' +
    '.ac-lc-chk-toggle.done{background:var(--nt);border-color:var(--nt)}' +
    '.ac-lc-chk-toggle.done::after{content:"✓";font-size:9px;color:white;font-weight:700}' +
    '.ac-lc-chk-lbl{font-size:12px;color:var(--md)}' +
    '.ac-lc-chk-row.done .ac-lc-chk-lbl{color:var(--nt)}' +
    '.ac-lc-rsb-add-recip{font-size:11px;color:var(--lo);cursor:pointer;padding:4px 0}.ac-lc-rsb-add-recip:hover{color:var(--md)}' +
    '.ac-lc-recip-row{display:flex;align-items:center;gap:7px;padding:4px 0}' +
    '.ac-lc-recip-av{width:22px;height:22px;border-radius:50%;background:#152c54;color:#4a8cf5;display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:700;flex-shrink:0}' +
    '.ac-lc-recip-name{font-size:12px;color:var(--md);flex:1}' +
    '.ac-lc-recip-role{font-size:11px;color:var(--lo);flex-shrink:0}' +
    // Exclude button (review mode only — visible via ac-lc-shell--review)
    '.ac-lc-note-exclude{display:none;position:absolute;right:30px;top:50%;transform:translateY(-50%);font-size:10px;font-weight:600;color:var(--act);background:var(--act-bg);border:1px solid var(--act-bd);border-radius:3px;padding:0 6px;cursor:pointer;line-height:18px;z-index:10;white-space:nowrap}' +
    '.ac-lc-shell--review .ac-lc-captured-row:hover .ac-lc-note-exclude{display:block}' +
    '.ac-lc-shell--review .ac-lc-captured-row:hover .ac-lc-note-delete{display:none}' +
    '.ac-lc-captured-row.excluded .ac-lc-captured-text{text-decoration:line-through;opacity:.4}' +
    '.ac-lc-captured-row.excluded{opacity:.6}' +
    '.ac-lc-captured-row.excluded .ac-lc-note-exclude{display:block;color:var(--lo);border-color:rgba(255,255,255,.12);background:transparent}' +
    // Preview overlay — dark topbar, light document
    '.ac-lc-preview-overlay{position:fixed;inset:0;z-index:200;background:#f4f5f7;display:none;flex-direction:column;overflow:hidden;font-family:"Outfit",system-ui,sans-serif}' +
    '.ac-lc-preview-overlay.open{display:flex}' +
    '.ac-lc-preview-topbar{height:50px;flex-shrink:0;display:flex;align-items:center;gap:12px;padding:0 24px;background:#10131e;border-bottom:1px solid #1e2438}' +
    '.ac-lc-preview-close{font-size:18px;color:#8899b2;cursor:pointer;flex-shrink:0;transition:color .12s}.ac-lc-preview-close:hover{color:#dce6f5}' +
    '.ac-lc-preview-title{font-size:13px;font-weight:500;color:#dce6f5}' +
    '.ac-lc-preview-doc{flex:1;overflow-y:auto;padding:48px 56px;max-width:800px;margin:0 auto;width:100%;box-sizing:border-box;background:#ffffff}' +
    // Preview document — light mode, print-ready
    '.ac-lc-preview-doc .pv-title{font-size:26px;font-weight:600;color:#1a1f2e;margin-bottom:8px;line-height:1.2}' +
    '.ac-lc-preview-doc .pv-stakes{font-size:13px;color:#555e70;font-style:italic;border-left:3px solid #d0d4df;padding-left:10px;margin-bottom:28px;line-height:1.6}' +
    '.ac-lc-preview-doc .pv-divider{border:none;border-top:2px solid #e8eaf0;margin:0 0 24px}' +
    '.ac-lc-preview-doc .pv-sec-hdr{font-size:11px;font-weight:700;letter-spacing:.10em;text-transform:uppercase;color:#6b7590;border-bottom:1px solid #e8eaf0;padding-bottom:7px;margin:28px 0 12px;display:flex;align-items:center;gap:8px}' +
    '.ac-lc-preview-doc .pv-sec-bar{width:4px;height:14px;border-radius:2px;flex-shrink:0}' +
    '.ac-lc-preview-doc .pv-meta-grid{display:grid;grid-template-columns:100px 1fr;gap:5px 12px;margin-bottom:16px}' +
    '.ac-lc-preview-doc .pv-meta-lbl{font-size:12px;color:#8b95a8;font-weight:600}' +
    '.ac-lc-preview-doc .pv-meta-val{font-size:13px;color:#2d3348;font-weight:500}' +
    '.ac-lc-preview-doc .pv-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:2px}' +
    '.ac-lc-preview-doc .pv-chip{font-size:12px;padding:3px 10px;border-radius:20px;background:#f0f2f7;border:1px solid #dde0ea;color:#3d4560}' +
    '.ac-lc-preview-doc .pv-row{display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid #f0f2f7}' +
    '.ac-lc-preview-doc .pv-row:last-child{border-bottom:none}' +
    '.ac-lc-preview-doc .pv-badge{font-size:10px;font-weight:700;padding:1px 6px;border-radius:3px;border:1px solid;white-space:nowrap;margin-top:3px;line-height:1.5;flex-shrink:0;letter-spacing:.03em}' +
    '.ac-lc-preview-doc .pv-text{font-size:13px;color:#2d3348;flex:1;line-height:1.6}' +
    '.ac-lc-preview-doc .pv-meta-sm{font-size:11px;color:#9aa0b2;flex-shrink:0;padding-top:2px}' +
    '.ac-lc-preview-doc .pv-empty{font-size:13px;color:#9aa0b2;font-style:italic;padding:6px 0}' +
    '.ac-lc-preview-doc .pv-agenda-item{margin-bottom:18px}' +
    '.ac-lc-preview-doc .pv-agenda-title{font-size:14px;font-weight:600;color:#1a1f2e;margin-bottom:8px;display:flex;align-items:center;gap:8px}' +
    '.ac-lc-preview-doc .pv-agenda-num{width:22px;height:22px;border-radius:50%;background:#e8eaf0;border:1px solid #d0d4df;font-size:11px;font-weight:700;color:#6b7590;display:flex;align-items:center;justify-content:center;flex-shrink:0}' +
    '.ac-lc-preview-doc .pv-outcome-flag{font-size:10px;font-weight:700;padding:2px 7px;border-radius:3px;white-space:nowrap;flex-shrink:0;margin-top:2px;letter-spacing:.03em}'
  }

  // Shell HTML
  function _shellHtml(meeting) {
    return '<div class="ac-live-capture-shell" id="ac-lc-shell"><style>' + _css() + '</style>' +
    '<div class="ac-lc-topbar" id="ac-lc-topbar">' +
      '<span class="ac-lc-logo">accord<em>.</em></span>' +
      '<div class="ac-lc-live-pill" id="ac-lc-live-pill"><span class="ac-lc-live-dot"></span>LIVE</div>' +
      '<span class="ac-lc-title">' + _esc(meeting.title || 'Untitled') + '</span>' +
      '<div class="ac-lc-topbar-right" id="ac-lc-topbar-right">' +
        '<div class="ac-lc-progress-wrap"><div class="ac-lc-progress" id="ac-lc-progress-bar"></div></div>' +
        '<span class="ac-lc-timer" id="ac-lc-timer">00:00</span>' +
        '<button type="button" class="ac-lc-end-btn" id="ac-lc-end-btn">END MEETING</button>' +
      '</div>' +
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
  function _injectFilmstripHide() {
    if (document.getElementById('ac-lc-filmstrip-hide')) return;
    var s = document.createElement('style');
    s.id = 'ac-lc-filmstrip-hide';
    s.textContent = '.ac-live-filmstrip{display:none!important}';
    document.head.appendChild(s);
  }

  function _removeFilmstripHide() {
    var s = document.getElementById('ac-lc-filmstrip-hide');
    if (s) s.parentNode.removeChild(s);
  }

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
          var att = rows.map(function(a) { return { resource_id: a.resource_id, name: _attendeeNameMap[a.resource_id] || 'Unknown', role: a.role_in_meeting, rsvp_status: a.rsvp_status }; });
          _attendeesList = att;
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
        _setNavActive('agenda');
        return;
      }
      var bEl = document.getElementById('ac-lc-' + key + '-body'); var cEl = hdr.querySelector('.ac-lc-sec-chevron');
      if (!bEl) return;
      var open = bEl.style.display !== 'none';
      bEl.style.display = open ? 'none' : '';
      if (cEl) cEl.classList.toggle('open', !open);
      _setNavActive(key);
    });
  }

  // Set nav active item directly by section key
  function _setNavActive(key) {
    document.querySelectorAll('.ac-lc-nav-item').forEach(function(link) {
      link.classList.toggle('active', link.dataset.section === key);
    });
  }

  // Nav
  function _wireNavObserver() {
    var canvas = document.getElementById('ac-lc-canvas');
    if (!canvas) return;
    var sections = ['agenda','decisions','actions','risks','parking'];

    _updateNavActive = function() {
      var canvasRect = canvas.getBoundingClientRect();
      var active = sections[0];
      sections.forEach(function(sec) {
        var el = document.getElementById('ac-lc-sec-' + sec);
        if (!el) return;
        var distFromTop = el.getBoundingClientRect().top - canvasRect.top;
        if (distFromTop <= 10) {
          var cur = document.getElementById('ac-lc-sec-' + active);
          if (el.offsetTop > (cur ? cur.offsetTop : -1)) active = sec;
        }
      });
      document.querySelectorAll('.ac-lc-nav-item').forEach(function(link) {
        link.classList.toggle('active', link.dataset.section === active);
      });
    };

    canvas.addEventListener('scroll', _updateNavActive, { passive: true });
    _updateNavActive();
  }

  function _wireNavClicks() {
    document.querySelectorAll('.ac-lc-nav-item').forEach(function(link) {
      link.addEventListener('click', function(ev) {
        ev.preventDefault();
        var sec = link.dataset.section;
        if (sec === 'agenda') {
          if (!_agendaSectionOpen) {
            _agendaSectionOpen = true;
            var ab = document.getElementById('ac-lc-agenda-body'); var ac = document.getElementById('ac-lc-agenda-chev');
            if (ab) ab.style.display = ''; if (ac) ac.classList.add('open');
          }
        } else {
          var bEl = document.getElementById('ac-lc-' + sec + '-body');
          var cEl = document.querySelector('[data-section-toggle="'+sec+'"] .ac-lc-sec-chevron');
          if (bEl && bEl.style.display === 'none') { bEl.style.display = ''; if (cEl) cEl.classList.add('open'); }
        }
        var target = document.getElementById('ac-lc-sec-' + sec);
        if (target) setTimeout(function() { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
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
    if (_agendaClickHandler) container.removeEventListener('click', _agendaClickHandler);
    _agendaClickHandler = _makeAgendaClickHandler(container);
    container.addEventListener('click', _agendaClickHandler);
    items.forEach(function(item) { if (_agendaExpanded[item.agenda_item_id]) _loadItemBody(item); });
  }

  function _makeAgendaClickHandler(container) {
    return function(ev) {
      _setNavActive('agenda');
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
      // Delete note
      var del = ev.target.closest('[data-action="delete-note"]');
      if (del) { ev.stopPropagation(); _deleteNote(del.dataset.nodeId); return; }

      // Exclude note (review mode)
      var exc = ev.target.closest('[data-action="exclude-note"]');
      if (exc) {
        ev.stopPropagation();
        var excId = exc.dataset.nodeId;
        var row = exc.closest('.ac-lc-captured-row');
        if (_excludedNodeIds.has(excId)) {
          _excludedNodeIds.delete(excId);
          if (row) { row.classList.remove('excluded'); exc.textContent = 'Exclude'; }
        } else {
          _excludedNodeIds.add(excId);
          if (row) { row.classList.add('excluded'); exc.textContent = 'Restore'; }
        }
        return;
      }

      // Note row click → edit popup
      var nr = ev.target.closest('[data-action="note-row"]');
      if (nr && !ev.target.closest('[data-action="reclassify"]')) {
        document.querySelectorAll('.ac-lc-captured-row.selected').forEach(function(el){el.classList.remove('selected');});
        nr.classList.add('selected');
        _openNoteEditPopup(nr.dataset.nodeId, nr);
        return;
      }

      // Toggle item last
      var t = ev.target.closest('[data-action="toggle-item"]');
      if (t) { var id=t.dataset.itemId; _agendaExpanded[id]=!_agendaExpanded[id]; if(_agendaExpanded[id]) _agendaNewCounts[id]=0; _renderAgendaSection(); return; }
    };
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
      _agendaNodeCache[item.agenda_item_id] = results[1] || [];
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
    return '<div class="ac-lc-captured-row" data-node-id="'+_esc(n.node_id)+'" data-action="note-row">' +
      '<span class="ac-lc-captured-badge" style="color:'+_tagColor(n.tag)+';background:'+_tagBg(n.tag)+';border:1px solid rgba(255,255,255,.18)" data-action="reclassify" data-node-id="'+_esc(n.node_id)+'" data-current-tag="'+_esc(n.tag)+'">'+_esc(n.seq_id||_tagLabel(n.tag))+'</span>' +
      '<span class="ac-lc-captured-text">'+_esc((n.summary||'').slice(0,100))+'</span>' +
      '<span class="ac-lc-captured-time">'+_esc(_fmtTime(n.created_at))+'</span>' +
      '<span class="ac-lc-note-exclude" data-action="exclude-note" data-node-id="'+_esc(n.node_id)+'">Exclude</span>' +
      '<span class="ac-lc-note-delete" data-action="delete-note" data-node-id="'+_esc(n.node_id)+'">×</span>' +
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
  // ── Note delete ────────────────────────────────────────────────────────
  function _deleteNote(nodeId) {
    if (!_meeting) return;
    var shell = document.getElementById('ac-lc-shell') || document.body;

    // Remove any existing confirm popup
    var old = document.getElementById('ac-lc-del-confirm'); if (old && old.parentElement) old.parentElement.removeChild(old);

    var popup = document.createElement('div');
    popup.id = 'ac-lc-del-confirm';
    popup.style.cssText = 'position:fixed;z-index:202;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--raised);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:20px 22px;min-width:260px;box-shadow:0 8px 40px rgba(0,0,0,.6);font-family:inherit';
    popup.innerHTML =
      '<div style="font-size:13px;font-weight:600;color:var(--hi);margin-bottom:6px">Delete note?</div>' +
      '<div style="font-size:12px;color:var(--md);margin-bottom:16px">This cannot be undone.</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
        '<button id="ac-lc-del-cancel" style="font-size:11px;color:var(--lo);background:transparent;border:1px solid rgba(255,255,255,.12);border-radius:5px;padding:5px 14px;cursor:pointer;font-family:inherit">Cancel</button>' +
        '<button id="ac-lc-del-confirm-btn" style="font-size:11px;font-weight:600;color:#fff;background:var(--rsk);border:none;border-radius:5px;padding:5px 14px;cursor:pointer;font-family:inherit">Delete</button>' +
      '</div>';

    var backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:fixed;inset:0;z-index:201;background:rgba(0,0,0,.4)';

    shell.appendChild(backdrop);
    shell.appendChild(popup);

    function _close() {
      if (popup.parentElement) popup.parentElement.removeChild(popup);
      if (backdrop.parentElement) backdrop.parentElement.removeChild(backdrop);
    }

    backdrop.addEventListener('click', _close);
    popup.querySelector('#ac-lc-del-cancel').addEventListener('click', _close);
    popup.querySelector('#ac-lc-del-confirm-btn').addEventListener('click', function() {
      _close();
      API.del('accord_nodes?node_id=eq.' + nodeId + '&meeting_id=eq.' + _meeting.meeting_id)
        .then(function() {
          var rowEl = document.querySelector('[data-action="note-row"][data-node-id="' + nodeId + '"]');
          if (rowEl && rowEl.parentElement) rowEl.parentElement.removeChild(rowEl);
        })
        .catch(function(e) { console.error('[AccordLiveCapture] note DELETE failed', e); });
    });
  }

  // ── Note edit popup ────────────────────────────────────────────────────
  function _openNoteEditPopup(nodeId, anchorEl) {
    var old = document.getElementById('ac-lc-note-edit-popup');
    if (old && old.parentElement) old.parentElement.removeChild(old);

    // Read current summary from DOM
    var textEl = anchorEl.querySelector('.ac-lc-captured-text');
    var currentText = textEl ? textEl.textContent : '';

    var popup = document.createElement('div');
    popup.id = 'ac-lc-note-edit-popup';
    popup.className = 'ac-lc-note-edit-popup';
    popup.innerHTML =
      '<div style="font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--lo);margin-bottom:8px">Edit note</div>' +
      '<textarea id="ac-lc-nep-text" style="width:100%;box-sizing:border-box;background:var(--b0);border:1px solid rgba(255,255,255,.12);border-radius:4px;padding:6px 8px;font-size:12px;font-family:inherit;color:var(--hi);resize:vertical;min-height:60px;outline:none;display:block" rows="3">'+_esc(currentText)+'</textarea>' +
      '<div style="display:flex;gap:6px;justify-content:flex-end;margin-top:8px">' +
        '<button id="ac-lc-nep-cancel" style="font-size:11px;color:var(--lo);background:transparent;border:1px solid rgba(255,255,255,.10);border-radius:5px;padding:4px 10px;cursor:pointer">Cancel</button>' +
        '<button id="ac-lc-nep-save" style="font-size:11px;font-weight:600;color:var(--hi);background:var(--dec);border:none;border-radius:5px;padding:4px 12px;cursor:pointer">Save</button>' +
      '</div>';

    var shell = document.getElementById('ac-lc-shell') || document.body;
    shell.appendChild(popup);

    // Position below anchor
    var shellRect = shell.getBoundingClientRect();
    var rect = anchorEl.getBoundingClientRect();
    var top  = rect.bottom - shellRect.top + 4;
    var left = rect.left   - shellRect.left;
    if (left + 290 > shell.offsetWidth) left = shell.offsetWidth - 295;
    if (top  + 160 > shell.offsetHeight) top = rect.top - shellRect.top - 160;
    popup.style.top  = top  + 'px';
    popup.style.left = left + 'px';

    // Focus textarea
    var ta = popup.querySelector('#ac-lc-nep-text');
    if (ta) { setTimeout(function(){ ta.focus(); ta.select(); }, 0); }

    function _close() {
      if (popup.parentElement) popup.parentElement.removeChild(popup);
      document.querySelectorAll('.ac-lc-captured-row.selected').forEach(function(el){ el.classList.remove('selected'); });
    }

    popup.querySelector('#ac-lc-nep-cancel').addEventListener('click', _close);

    popup.querySelector('#ac-lc-nep-save').addEventListener('click', function() {
      var newText = ta ? ta.value.trim() : '';
      if (!newText) return;
      API.patch('accord_nodes?node_id=eq.' + nodeId + '&meeting_id=eq.' + _meeting.meeting_id, { summary: newText })
        .then(function() {
          // IR71: update DOM only after confirm
          if (textEl) textEl.textContent = newText.slice(0, 100);
          _close();
        })
        .catch(function(e) { console.error('[AccordLiveCapture] note PATCH failed', e); });
    });

    // Close on outside click
    setTimeout(function() {
      document.addEventListener('mousedown', function _outsideClose(ev) {
        if (!popup.contains(ev.target) && !anchorEl.contains(ev.target)) {
          _close();
          document.removeEventListener('mousedown', _outsideClose);
        }
      });
    }, 0);
  }

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
            // Disable backdrop pointer-events so PersonPicker rows are clickable
            // (backdrop may be in a higher stacking context than PersonPicker)
            var bdEl = document.querySelector('.ac-lc-reclassify-backdrop');
            if (bdEl) bdEl.style.pointerEvents = 'none';
            var resources = _inviteResourcesFromAttendees();
            window.PersonPicker && window.PersonPicker.show(asnBtn, function(r) {
              _rcAssignee = { id: r.id, name: r.name };
              asnBtn.textContent = r.name;
              asnBtn.style.color = 'var(--hi)';
              // Restore backdrop pointer-events after selection
              var bdEl2 = document.querySelector('.ac-lc-reclassify-backdrop');
              if (bdEl2) bdEl2.style.pointerEvents = '';
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
    backdrop.addEventListener('click', function(ev) {
      // Don't close if PersonPicker is open anywhere in the document
      if (document.querySelector('.pp-overlay')) return;
      if (popup.parentElement) popup.parentElement.removeChild(popup);
      if (backdrop.parentElement) backdrop.parentElement.removeChild(backdrop);
    });
    shell.insertBefore(backdrop, popup);

    popup.querySelector('#ac-lc-rc-cancel').addEventListener('click', function() { if (popup.parentElement) popup.parentElement.removeChild(popup); if (backdrop.parentElement) backdrop.parentElement.removeChild(backdrop); });

    popup.querySelector('#ac-lc-rc-confirm').addEventListener('click', function() {
      var patch = { tag: selTag };
      if (selTag==='action') {
        var ddEl=document.getElementById('ac-lc-rc-dd');
        var dd=ddEl?ddEl.value.trim():'';
        if (_rcAssignee||dd) patch.body = JSON.stringify({ assignee_resource_id: _rcAssignee?_rcAssignee.id:'', assignee: _rcAssignee?_rcAssignee.name:'', due_date: dd });
        if (dd) patch.due_date = dd;
        patch.effective_date = null;  // clear decision scope field
      } else if (selTag==='decision') {
        var edEl=document.getElementById('ac-lc-rc-ed'); var ed=edEl?edEl.value.trim():''; if (ed) patch.effective_date=ed;
        patch.due_date = null;   // clear action scope field
        patch.body = null;
      } else if (selTag==='risk') {
        var svEl=document.getElementById('ac-lc-rc-sv'); var sv=svEl?svEl.value:'Medium'; patch.body=JSON.stringify({severity:sv});
        patch.due_date = null; patch.effective_date = null;
      } else {
        // note, question — clear all scope fields
        patch.due_date = null; patch.effective_date = null; patch.body = null;
      }
      if (popup.parentElement) popup.parentElement.removeChild(popup);
      if (backdrop.parentElement) backdrop.parentElement.removeChild(backdrop);

      // Reclassify = DELETE old node + INSERT new node with correct tag.
      // This is required because seq_id (e.g. NT-032, AX-019) is assigned
      // by the allocate_node_seq() trigger at INSERT time only — a PATCH
      // cannot reassign it. DELETE frees the old seq slot; INSERT triggers
      // fresh allocation for the new tag class.
      // IR73: DELETE and INSERT both scoped to current meeting_id.
      var meeting = window.Accord && window.Accord.state && window.Accord.state.me;
      var me = window.Accord && window.Accord.state && window.Accord.state.me;
      var stateThread = window.Accord && window.Accord.state && window.Accord.state.thread;
      var threadId = (stateThread && stateThread.thread_id) || null;
      var currentMeetingId = _meeting && _meeting.meeting_id;

      // Find the original node — check all section arrays first, then read summary from DOM
      var origNode = null;
      var allArrays = [_sectionNodes.decision, _sectionNodes.action, _sectionNodes.risk, _sectionNodes.question];
      allArrays.forEach(function(arr) {
        if (!origNode) { origNode = arr.find(function(n){return n.node_id===nodeId;})||null; }
      });
      // If not in a section array (e.g. agenda captured node), read summary from DOM
      var origSummary = origNode ? origNode.summary : '';
      var origAgendaItemId = origNode ? (origNode.agenda_item_id||null) : null;
      if (!origSummary) {
        var capturedTextEl = document.querySelector('.ac-lc-captured-row[data-node-id="'+nodeId+'"] .ac-lc-captured-text');
        if (capturedTextEl) origSummary = capturedTextEl.textContent || '';
      }

      var insertRow = {
        firm_id:        _meeting.firm_id,
        meeting_id:     currentMeetingId,
        agenda_item_id: origAgendaItemId,
        tag:            selTag,
        summary:        origSummary.slice(0, 280),
        body:           null,
        created_by:     me ? me.id : null,
      };
      if (threadId) insertRow.thread_id = threadId;

      if (selTag==='action') {
        var ddEl=document.getElementById('ac-lc-rc-dd');
        var dd=ddEl?ddEl.value.trim():'';
        if (_rcAssignee||dd) insertRow.body = JSON.stringify({ assignee_resource_id: _rcAssignee?_rcAssignee.id:'', assignee_name: _rcAssignee?_rcAssignee.name:'', due_date: dd });
        if (dd) insertRow.due_date = dd;
      } else if (selTag==='decision') {
        var edEl=document.getElementById('ac-lc-rc-ed'); var ed=edEl?edEl.value.trim():''; if (ed) insertRow.effective_date=ed;
      } else if (selTag==='risk') {
        var svEl=document.getElementById('ac-lc-rc-sv'); var sv=svEl?svEl.value:'Medium'; insertRow.body=JSON.stringify({severity:sv});
      }

      // INSERT new node first (gets correct seq_id from trigger), then attempt DELETE of old.
      // DELETE may be RLS-blocked on some installations — treat as best-effort.
      API.post('accord_nodes', insertRow)
        .then(function(created) {
          var newNode = Array.isArray(created) ? created[0] : created;
          if (!newNode) return;

          // Remove old node from local section arrays
          ['decision','action','risk','question'].forEach(function(k) {
            _sectionNodes[k] = _sectionNodes[k].filter(function(n){return n.node_id!==nodeId;});
          });

          // Remove old row from agenda captured list
          var oldBadge = document.querySelector('[data-action="reclassify"][data-node-id="'+nodeId+'"]');
          if (oldBadge) {
            var oldRow = oldBadge.closest('.ac-lc-captured-row');
            if (oldRow && oldRow.parentElement) oldRow.parentElement.removeChild(oldRow);
          }
          // Remove from section body lists too
          var oldSectionRow = document.querySelector('[data-node-id="'+nodeId+'"]');
          if (oldSectionRow && oldSectionRow.parentElement) oldSectionRow.parentElement.removeChild(oldSectionRow);

          // Add new node to correct section array and update count
          var sKey = (selTag==='dissent') ? 'risk' : selTag;
          if (_sectionNodes[sKey]) {
            _sectionNodes[sKey].push(newNode);
            _updateSectionCount(sKey, _sectionNodes[sKey]);
          }

          // Append new row to section body if visible
          var bodyMap = { decision:'ac-lc-dec-list', action:'ac-lc-act-tbody', risk:'ac-lc-rsk-list', question:'ac-lc-park-list' };
          var listEl = document.getElementById(bodyMap[sKey]);
          if (listEl) {
            var d = document.createElement('div');
            if (sKey==='decision')       d.innerHTML = _decisionRowHtml(newNode);
            else if (sKey==='action')  { d=document.createElement('tbody'); d.innerHTML = _actionRowHtml(newNode); }
            else if (sKey==='risk')      d.innerHTML = _riskRowHtml(newNode);
            else if (sKey==='question')  d.innerHTML = _parkRowHtml(newNode);
            listEl.appendChild(d.firstChild);
          }

          // IR72: broadcast new node
          if (window.Accord && window.Accord.broadcast) {
            window.Accord.broadcast('accord.node.committed', {
              node_id:    newNode.node_id, thread_id: newNode.thread_id,
              meeting_id: newNode.meeting_id, tag: newNode.tag,
              summary:    newNode.summary,   created_by: newNode.created_by,
            });
          }

          // Best-effort DELETE of old node (non-blocking — RLS may prevent it)
          API.del('accord_nodes?node_id=eq.'+nodeId+'&meeting_id=eq.'+currentMeetingId)
            .catch(function(e) { console.warn('[AccordLiveCapture] old node DELETE failed (non-blocking):', e.message); });
        })
        .catch(function(e) { console.error('[AccordLiveCapture] reclassify INSERT failed', e); });
    });
  }

  // ── Phase 6: End Meeting flow ────────────────────────────────────────────

  // Fill all progress segments visually (confirm-click, before PATCH)
  function _fillProgressBarAll() {
    var bar = document.getElementById('ac-lc-progress-bar');
    if (!bar) return;
    var total = _agendaItems.length || 3;
    var html  = '';
    for (var i = 0; i < total; i++) html += '<div class="ac-lc-seg ac-lc-seg--done"></div>';
    bar.innerHTML = html;
  }

  // _endMeeting — IR71: local state only in .then(); IR73: AND state=eq.running guard
  function _endMeeting() {
    // Recovery path: if PATCH already succeeded but _enterReviewMode failed on a prior
    // attempt, the meeting is already closed in the DB. Skip the PATCH and recover directly.
    if (_meeting && _meeting.state === 'closed') {
      var recoverBtn = document.getElementById('ac-lc-end-btn');
      if (recoverBtn) { recoverBtn.disabled = false; recoverBtn.style.opacity = ''; recoverBtn.style.pointerEvents = ''; }
      _enterReviewMode();
      return;
    }

    var btn = document.getElementById('ac-lc-end-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Ending\u2026'; }

    // Visual fill before PATCH (spec §4.4)
    _fillProgressBarAll();

    API.patch(
      'accord_meetings?meeting_id=eq.' + _meeting.meeting_id + '&state=eq.running',
      { state: 'closed', ended_at: new Date().toISOString() }
    ).then(function() {
      // IR71: update local state only after server confirms
      if (window.Accord && window.Accord.state && window.Accord.state.meeting) {
        window.Accord.state.meeting.state = 'closed';
      }
      // CMD-ACCORD-MINUTES-1 v2: stay in shell, transition to review mode.
      // IR72: accord:level-changed is NOT dispatched here. See finding below.
      _enterReviewMode();
    }).catch(function(err) {
      console.error('[AccordLiveCapture] _endMeeting PATCH failed', err);
      if (btn) { btn.disabled = false; btn.textContent = 'END MEETING'; }
      // Restore real progress bar on failure
      _renderProgressBar(_agendaItems);
    });
  }

  // Confirmation modal for End Meeting
  function _showEndMeetingModal() {
    var shell = document.getElementById('ac-lc-shell') || document.body;
    var old   = document.getElementById('ac-lc-end-modal-backdrop');
    if (old && old.parentElement) old.parentElement.removeChild(old);

    var backdrop = document.createElement('div');
    backdrop.id = 'ac-lc-end-modal-backdrop';
    backdrop.style.cssText = 'position:fixed;inset:0;z-index:210;background:rgba(0,0,0,.7);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center';

    var modal = document.createElement('div');
    modal.style.cssText = 'background:var(--raised);border:1px solid var(--b2);border-radius:10px;padding:24px;width:400px;max-width:calc(100vw - 32px);font-family:"Outfit",system-ui,sans-serif;box-shadow:0 16px 48px rgba(0,0,0,.6)';
    modal.innerHTML =
      '<div style="font-size:15px;font-weight:600;color:var(--hi);margin-bottom:10px">End this meeting?</div>' +
      '<div style="font-size:13px;color:var(--md);line-height:1.5;margin-bottom:22px">All captured nodes will be sealed. This cannot be undone.</div>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end">' +
        '<button id="ac-lc-end-modal-cancel" style="font-size:12px;font-weight:500;color:var(--md);background:transparent;border:1px solid var(--b2);border-radius:6px;padding:7px 18px;cursor:pointer;font-family:inherit">Cancel</button>' +
        '<button id="ac-lc-end-modal-confirm" style="font-size:12px;font-weight:600;color:var(--rsk);background:var(--rsk-bg);border:1px solid var(--rsk-bd);border-radius:6px;padding:7px 18px;cursor:pointer;font-family:inherit">End Meeting \u2192</button>' +
      '</div>';

    backdrop.appendChild(modal);
    shell.appendChild(backdrop);

    function _close() {
      if (backdrop.parentElement) backdrop.parentElement.removeChild(backdrop);
    }

    backdrop.addEventListener('click', function(ev) { if (ev.target === backdrop) _close(); });
    document.getElementById('ac-lc-end-modal-cancel').addEventListener('click', _close);
    document.getElementById('ac-lc-end-modal-confirm').addEventListener('click', function() {
      _close();
      _endMeeting();
    });
  }

  // ── Phase 6: Status bar (workstream filmstrip) ───────────────────────────
  // Non-blocking — shell mount does not wait for this data.
  // IR47: uses API.get() — confirmed pattern.

  function _fmtChipDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
    catch (e) { return ''; }
  }

  function _loadStatusBar(workstreamId, currentMeetingId) {
    if (!workstreamId) return;
    // Fetch prior closed/sealed meetings for this workstream (including counts via RPC-style join)
    // Supabase supports computed columns via select — use subquery syntax via PostgREST embed.
    // Phase 6: two-query approach — fetch meetings then counts per meeting.
    API.get(
      'accord_meetings?workstream_id=eq.' + workstreamId +
      '&state=in.(closed,sealed)' +
      '&select=meeting_id,title,scheduled_for,state' +
      '&order=scheduled_for.desc' +
      '&limit=8'
    ).then(function(meetings) {
      meetings = meetings || [];
      if (!meetings.length) {
        // Current meeting chip only
        _paintStatusBar([{ meeting_id: currentMeetingId, title: (_meeting && _meeting.title) || 'Current', scheduled_for: _meeting && _meeting.scheduled_for, state: 'running', decision_count: 0, action_count: 0 }], currentMeetingId);
        return;
      }
      // Fetch decision + action counts for each meeting via section nodes
      var meetingIds = meetings.map(function(m) { return m.meeting_id; });
      API.get(
        'accord_nodes?meeting_id=in.(' + meetingIds.join(',') + ')' +
        '&tag=in.(decision,action)' +
        '&select=meeting_id,tag'
      ).then(function(nodes) {
        nodes = nodes || [];
        // Build count map
        var countMap = {};
        meetingIds.forEach(function(id) { countMap[id] = { decision: 0, action: 0 }; });
        nodes.forEach(function(n) {
          if (!countMap[n.meeting_id]) countMap[n.meeting_id] = { decision: 0, action: 0 };
          if (n.tag === 'decision') countMap[n.meeting_id].decision++;
          else if (n.tag === 'action') countMap[n.meeting_id].action++;
        });
        var chips = meetings.map(function(m) {
          var c = countMap[m.meeting_id] || { decision: 0, action: 0 };
          return { meeting_id: m.meeting_id, title: m.title, scheduled_for: m.scheduled_for, state: m.state, decision_count: c.decision, action_count: c.action };
        });
        // Prepend current meeting chip
        chips.unshift({ meeting_id: currentMeetingId, title: (_meeting && _meeting.title) || 'Current', scheduled_for: _meeting && _meeting.scheduled_for, state: 'running', decision_count: 0, action_count: 0 });
        _paintStatusBar(chips, currentMeetingId);
      }).catch(function() {
        _paintStatusBar(meetings.map(function(m) { return Object.assign({ decision_count: 0, action_count: 0 }, m); }), currentMeetingId);
      });
    }).catch(function(e) {
      console.warn('[AccordLiveCapture] status bar load failed', e);
    });
  }

  function _paintStatusBar(chips, currentMeetingId) {
    var filmstrip = document.querySelector('.ac-live-filmstrip');
    if (!filmstrip) return;

    var html = '<div style="display:flex;align-items:center;gap:6px;padding:0 16px;height:100%;overflow-x:auto;flex-wrap:nowrap">';
    chips.forEach(function(chip) {
      var isCurrent = chip.meeting_id === currentMeetingId;
      var dateStr   = _fmtChipDate(chip.scheduled_for);
      var label     = (dateStr ? dateStr + ' \u00b7 ' : '') + _esc((chip.title || 'Untitled').slice(0, 28));
      var cls       = 'ac-lc-filmstrip-chip' + (isCurrent ? ' ac-lc-filmstrip-chip--current' : '');
      var badges    = '';
      if (chip.decision_count > 0) {
        badges += '<span class="ac-lc-filmstrip-badge ac-lc-filmstrip-badge--dec">' + chip.decision_count + '</span>';
      }
      if (chip.action_count > 0) {
        badges += '<span class="ac-lc-filmstrip-badge ac-lc-filmstrip-badge--act">' + chip.action_count + '</span>';
      }
      // Click deferred — Phase 7 / CMD-ACCORD-MEETING-SETUP-1
      html += '<span class="' + cls + '">' + label + badges + '</span>';
    });
    html += '</div>';

    filmstrip.innerHTML = html;
    filmstrip.style.display = '';   // ensure element itself is not inline-hidden

    // Remove the injected hide style tag so the bar becomes visible
    _removeFilmstripHide();
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
      '<span class="ac-lc-dec-text">'+_esc(n.summary||'')+'</span>' +
      (effStr?'<span style="font-size:11px;color:var(--dec);flex-shrink:0;white-space:nowrap">'+_esc(effStr)+'</span>':'') +
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
    body.addEventListener('click', function() { _setNavActive('decisions'); }, true);
    body.addEventListener('click', function(ev) {
      var row = ev.target.closest('.ac-lc-dec-row[data-node-id]');
      if (!row) return;
      var nodeId = row.dataset.nodeId;
      var node = _sectionNodes.decision.find(function(n){return n.node_id===nodeId;});
      if (node) _openSectionEditPopup(nodeId, 'decision', node, row);
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
        '<thead class="ac-lc-act-thead"><tr><th>Task</th><th style="width:120px">Owner</th><th style="width:90px">Due</th><th style="width:80px">Status</th></tr></thead><tbody id="ac-lc-act-tbody">';
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
      '<td><span class="ac-lc-act-badge" data-action="edit-section-node" data-node-id="'+_esc(n.node_id)+'" data-tag="action">'+_esc(n.seq_id||'AX')+'</span> <span class="ac-lc-act-task">'+_esc((n.summary||'').slice(0,80))+'</span></td>' +
      '<td style="width:160px"><div class="ac-lc-act-owner"><div class="ac-lc-act-avatar">'+_esc(initials)+'</div>'+_esc(assigneeName||'\u2014')+'</div></td>' +
      '<td style="width:90px">'+_esc(dueStr)+'</td>' +
      '<td style="width:80px"><span class="ac-lc-status-chip '+statusCls+'" data-action="toggle-action-status" data-node-id="'+_esc(n.node_id)+'">'+statusLbl+'</span></td>' +
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
    body.addEventListener('click', function() { _setNavActive('actions'); }, true);
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
    body.addEventListener('click', function() { _setNavActive('risks'); }, true);
    body.addEventListener('click', function(ev) {
      var row = ev.target.closest('.ac-lc-rsk-row[data-node-id]');
      if (!row) return;
      var nodeId = row.dataset.nodeId;
      var node = _sectionNodes.risk.find(function(n){return n.node_id===nodeId;});
      if (node) _openSectionEditPopup(nodeId, node.tag, node, row);
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
    body.addEventListener('click', function() { _setNavActive('parking'); }, true);
    body.addEventListener('click', function(ev) {
      var row = ev.target.closest('.ac-lc-park-row[data-node-id]');
      if (!row) return;
      var nodeId = row.dataset.nodeId;
      var node = _sectionNodes.question.find(function(n){return n.node_id===nodeId;});
      if (node) _openSectionEditPopup(nodeId, 'question', node, row);
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
      '<div class="ac-lc-edit-field"><label>'+(tag==="action"?'Description':'Summary')+'</label>' +
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
        var bdEl = backdrop;
        if (bdEl) bdEl.style.pointerEvents = 'none';
        window.PersonPicker && window.PersonPicker.show(asnBtn, function(r) {
          _editAssignee = { id: r.id, name: r.name };
          asnBtn.textContent = r.name;
          if (bdEl) bdEl.style.pointerEvents = '';
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
        // Re-render full row for action items (assignee/due/status all change).
        // For other types, targeted text update is sufficient.
        if (tag==='action') {
          var updatedNode = arr ? arr.find(function(n){return n.node_id===nodeId;}) : null;
          if (updatedNode) {
            var oldRow = document.querySelector('tr.ac-lc-act-row[data-node-id="'+nodeId+'"]');
            if (oldRow) {
              var d = document.createElement('tbody');
              d.innerHTML = _actionRowHtml(updatedNode);
              oldRow.parentNode.replaceChild(d.firstChild, oldRow);
              _updateSectionCount('action', _sectionNodes.action);
            }
          }
        } else {
          var badgeEl = document.querySelector('[data-action="edit-section-node"][data-node-id="'+nodeId+'"]');
          if (badgeEl && updated.seq_id) badgeEl.textContent = updated.seq_id;
          var rowEl = document.querySelector('[data-node-id="'+nodeId+'"]');
          if (rowEl) {
            var textEl = rowEl.querySelector('.ac-lc-dec-text,.ac-lc-act-task,.ac-lc-rsk-text,.ac-lc-park-text');
            if (textEl) textEl.textContent = newSummary.slice(0,100);
          }
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

  // ── CMD-ACCORD-MINUTES-1 v2: Review Mode ────────────────────────────────

  // IR72 FINDING: accord:level-changed is no longer dispatched from _endMeeting().
  // Confirmed consumers of this event for the running→closed transition:
  //   1. _onLevelChanged() in this module — teardown; NOT desirable here (shell stays mounted).
  //   2. accord.html _applyTopnavContext() — updates topnav prefix/brand-meta label.
  //      Without the dispatch, topnav will still show "In Session · Live Capture" until
  //      the operator navigates away. Accepted cosmetic gap for Phase 1; the Live Capture
  //      shell is full-panel so topnav chrome is not visible during review.
  //   3. accord-transitions.js — drives renderMeetingView (routes to closed surface).
  //      This is exactly what we're replacing with in-place review mode.
  // No other module depends on accord:level-changed for running→closed.

  function _enterReviewMode() {
    // 1. Stop timer and live data streams
    _stopTimer();
    _stopPresencePoll();
    _unsubscribeChatRealtime();
    window.removeEventListener('accord:remote-node',   _onRemoteNode);
    window.removeEventListener('accord:remote-agenda', _onRemoteAgenda);

    // 2. Hide LIVE pill
    var liveEl = document.getElementById('ac-lc-live-pill');
    if (liveEl) liveEl.style.display = 'none';

    // 3. Insert state badge after live pill position (before title = children[2])
    var badge = document.getElementById('ac-lc-state-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'ac-lc-state-badge';
      var topbar = document.getElementById('ac-lc-topbar');
      if (topbar) topbar.insertBefore(badge, topbar.children[2]);
    }
    badge.className = 'ac-lc-review-badge ac-lc-review-badge--review';
    badge.textContent = 'Under Review';

    // 4. Disable END MEETING
    var endBtn = document.getElementById('ac-lc-end-btn');
    if (endBtn) {
      endBtn.textContent = 'END MEETING';
      endBtn.disabled = true;
      endBtn.style.opacity = '.35';
      endBtn.style.pointerEvents = 'none';
    }

    // 5. Add Preview + Route+Send to topbar
    _renderReviewTopbarActions();

    // 6. Swap sidebar
    _renderReviewSidebar();

    // 7. Load recipients (non-blocking)
    _loadRecipients();

    // 8. Mark shell as review mode (enables Exclude buttons, hides delete)
    var shell = document.getElementById('ac-lc-shell');
    if (shell) shell.classList.add('ac-lc-shell--review');

    // 9. Pre-fetch data needed for preview render (IR71: no queries during render)
    _preloadPreviewData();
  }

  function _renderReviewTopbarActions() {
    var topbarRight = document.getElementById('ac-lc-topbar-right');
    if (!topbarRight) return;

    var previewBtn = document.createElement('button');
    previewBtn.id = 'ac-lc-preview-btn';
    previewBtn.className = 'ac-lc-topbar-btn';
    previewBtn.textContent = 'Preview \u2192';
    previewBtn.onclick = function() { _openPreview(); };

    var sendBtn = document.createElement('button');
    sendBtn.id = 'ac-lc-send-btn';
    sendBtn.className = 'ac-lc-topbar-btn ac-lc-send-btn disabled';
    sendBtn.textContent = 'Route + Send \u2191';
    sendBtn.disabled = true;
    sendBtn.onclick = function() { _openSendModal(); };

    topbarRight.insertBefore(sendBtn, topbarRight.firstChild);
    topbarRight.insertBefore(previewBtn, sendBtn);
  }

  function _renderReviewSidebar() {
    var liveSidebar = document.getElementById('ac-lc-sidebar');
    if (liveSidebar) liveSidebar.style.display = 'none';

    var reviewSidebar = document.createElement('div');
    reviewSidebar.id = 'ac-lc-review-sidebar';
    reviewSidebar.className = 'ac-lc-review-sidebar';
    reviewSidebar.innerHTML = _buildReviewSidebarHTML();

    if (liveSidebar && liveSidebar.parentNode) {
      liveSidebar.parentNode.insertBefore(reviewSidebar, liveSidebar);
    }

    _wireChecklistToggles();

    // Wire add-external link (Phase 3 stub)
    var addLink = document.getElementById('ac-lc-add-recip-link');
    if (addLink) addLink.addEventListener('click', function() { /* Phase 3 */ });

    // Re-wire sections nav clicks to new nav items
    _wireNavClicks();
    if (_updateNavActive) _updateNavActive();
  }

  function _buildReviewSidebarHTML() {
    return '<div class="ac-lc-rsb-section ac-lc-rsb-checklist">' +
      '<div class="ac-lc-rsb-label">Review Checklist</div>' +
      '<div class="ac-lc-rsb-items">' +
        _checklistItem('Meeting header') +
        _checklistItem('Attendance confirmed') +
        _checklistItem('Outcomes reviewed') +
        _checklistItem('Agenda entries checked') +
        _checklistItem('Decisions verified') +
        _checklistItem('Actions confirmed') +
      '</div>' +
    '</div>' +
    '<div class="ac-lc-rsb-section ac-lc-rsb-nav">' +
      '<div class="ac-lc-rsb-label">Sections</div>' +
      _buildSectionsNav() +
    '</div>' +
    '<div class="ac-lc-rsb-section ac-lc-rsb-recipients">' +
      '<div class="ac-lc-rsb-label">Recipients</div>' +
      '<div id="ac-lc-recipients-list"></div>' +
      '<div class="ac-lc-rsb-add-recip" id="ac-lc-add-recip-link">+ Add external recipient\u2026</div>' +
    '</div>';
  }

  function _checklistItem(label) {
    return '<div class="ac-lc-chk-row">' +
      '<div class="ac-lc-chk-toggle"></div>' +
      '<span class="ac-lc-chk-lbl">' + _esc(label) + '</span>' +
    '</div>';
  }

  function _buildSectionsNav() {
    return '<nav class="ac-lc-nav">' +
      '<a class="ac-lc-nav-item" data-section="agenda"    href="#ac-lc-sec-agenda">Agenda</a>' +
      '<a class="ac-lc-nav-item" data-section="decisions" href="#ac-lc-sec-decisions">Decisions</a>' +
      '<a class="ac-lc-nav-item" data-section="actions"   href="#ac-lc-sec-actions">Action Items</a>' +
      '<a class="ac-lc-nav-item" data-section="risks"     href="#ac-lc-sec-risks">Risks &amp; Issues</a>' +
      '<a class="ac-lc-nav-item" data-section="parking"   href="#ac-lc-sec-parking">Parking Lot</a>' +
    '</nav>';
  }

  function _wireChecklistToggles() {
    document.querySelectorAll('.ac-lc-rsb-checklist .ac-lc-chk-row').forEach(function(row) {
      row.addEventListener('click', function() { _toggleChecklist(row); });
    });
  }

  function _toggleChecklist(row) {
    var toggle = row.querySelector('.ac-lc-chk-toggle');
    if (!toggle) return;
    var done = toggle.classList.toggle('done');
    row.classList.toggle('done', done);

    var total   = document.querySelectorAll('.ac-lc-rsb-checklist .ac-lc-chk-toggle').length;
    var checked = document.querySelectorAll('.ac-lc-rsb-checklist .ac-lc-chk-toggle.done').length;
    var sendBtn = document.getElementById('ac-lc-send-btn');
    var badge   = document.getElementById('ac-lc-state-badge');

    if (checked === total) {
      if (sendBtn) { sendBtn.disabled = false; sendBtn.classList.remove('disabled'); }
      if (badge)   { badge.className = 'ac-lc-review-badge ac-lc-review-badge--ready'; badge.textContent = 'Ready to Send'; }
    } else {
      if (sendBtn) { sendBtn.disabled = true; sendBtn.classList.add('disabled'); }
      if (badge)   { badge.className = 'ac-lc-review-badge ac-lc-review-badge--review'; badge.textContent = 'Under Review'; }
    }
  }

  // IR47: organizer_id is on accord_meetings (_meeting.organizer_id), NOT on accord_meeting_attendees.
  function _loadRecipients() {
    if (!_meeting || !_meeting.meeting_id) return;
    return API.get('accord_meeting_attendees?meeting_id=eq.' + _meeting.meeting_id)
    .then(function(attendees) {
      if (!attendees || !attendees.length) return;
      var ids = attendees.map(function(a) { return a.resource_id; }).join(',');
      return API.get('resources?id=in.(' + ids + ')&select=id,name')
      .then(function(resources) {
        var nameMap = {};
        (resources || []).forEach(function(r) { nameMap[r.id] = r.name; });
        var list = document.getElementById('ac-lc-recipients-list');
        if (!list) return;
        list.innerHTML = attendees.map(function(a) {
          var name     = nameMap[a.resource_id] || 'Unknown';
          var initials = name.split(' ').map(function(w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
          var role     = a.resource_id === (_meeting.organizer_id || '') ? 'Organizer'
                       : a.rsvp_status === 'accepted' ? 'Attended' : 'Invited · absent';
          return '<div class="ac-lc-recip-row">' +
            '<div class="ac-lc-recip-av">' + _esc(initials) + '</div>' +
            '<span class="ac-lc-recip-name">' + _esc(name) + '</span>' +
            '<span class="ac-lc-recip-role">' + _esc(role) + '</span>' +
            '<input type="checkbox" class="ac-lc-recip-check" data-resource-id="' + _esc(a.resource_id) + '" checked>' +
          '</div>';
        }).join('');
      });
    }).catch(function(err) {
      console.warn('[AccordLiveCapture] _loadRecipients failed', err);
    });
  }

  // ── Preview Modal (Phase 2) ────────────────────────────────────────────────

  function _preloadPreviewData() {
    if (!_meeting || !_meeting.meeting_id) return;
    var mid = _meeting.meeting_id;

    // Load outcomes
    API.get('accord_meeting_outcomes?meeting_id=eq.' + mid + '&select=outcome_id,verb,description,owner_resource_id,status&order=created_at.asc')
      .then(function(rows) { _outcomesCache = rows || []; })
      .catch(function() { _outcomesCache = []; });

    // Load workstream name
    if (_meeting.workstream_id) {
      API.get('workstreams?id=eq.' + _meeting.workstream_id + '&select=id,name&limit=1')
        .then(function(rows) { _workstreamName = (rows && rows[0] && rows[0].name) || ''; })
        .catch(function() { _workstreamName = ''; });
    }

    // Load nodes for agenda items not yet cached
    _agendaItems.forEach(function(item) {
      if (!_agendaNodeCache[item.agenda_item_id]) {
        API.get('accord_nodes?meeting_id=eq.' + mid + '&agenda_item_id=eq.' + item.agenda_item_id + '&select=node_id,seq_id,tag,summary,created_at,created_by&order=created_at.asc')
          .then(function(nodes) { _agendaNodeCache[item.agenda_item_id] = nodes || []; })
          .catch(function() { _agendaNodeCache[item.agenda_item_id] = []; });
      }
    });
  }

  function _closePreview() {
    var overlay = document.getElementById('ac-lc-preview-overlay');
    if (overlay) overlay.classList.remove('open');
  }

  function _openPreview() {
    var overlay = document.getElementById('ac-lc-preview-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ac-lc-preview-overlay';
      overlay.className = 'ac-lc-preview-overlay';
      overlay.innerHTML =
        '<div class="ac-lc-preview-topbar">' +
          '<span class="ac-lc-preview-close" onclick="AccordLiveCapture._closePreview()">\u2715</span>' +
          '<span class="ac-lc-preview-title">Preview \u2014 ' + _esc(_meeting ? _meeting.title : '') + '</span>' +
        '</div>' +
        '<div class="ac-lc-preview-doc" id="ac-lc-preview-doc"></div>';
      document.body.appendChild(overlay);

      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') AccordLiveCapture._closePreview();
      });
    }

    document.getElementById('ac-lc-preview-doc').innerHTML = _buildPreviewDocument();
    overlay.classList.add('open');
  }


  function _pvSectionHeader(label, barColor) {
    return '<div class="pv-sec-hdr">' +
      '<div class="pv-sec-bar" style="background:' + barColor + '"></div>' +
      _esc(label) +
    '</div>';
  }

  function _pvOutcomeFlag(status) {
    var m = {
      achieved:  { text: '\u2713 Met',   color: 'var(--nt)',  bg: 'var(--nt-bg)',  bd: 'var(--nt-bd)'  },
      partial:   { text: 'Partial',       color: 'var(--act)', bg: 'var(--act-bg)', bd: 'var(--act-bd)' },
      abandoned: { text: 'Unmet',         color: 'var(--rsk)', bg: 'var(--rsk-bg)', bd: 'var(--rsk-bd)' },
      open:      { text: 'Open',          color: 'var(--md)',  bg: 'rgba(255,255,255,.06)', bd: 'rgba(255,255,255,.12)' },
      carried:   { text: 'Carried',       color: 'var(--lo)',  bg: 'rgba(255,255,255,.05)', bd: 'rgba(255,255,255,.10)' }
    };
    var s = m[status] || m.open;
    return '<span class="pv-outcome-flag" style="color:' + s.color + ';background:' + s.bg + ';border:1px solid ' + s.bd + '">' + s.text + '</span>';
  }

  function _buildPreviewDocument() {
    if (!_meeting) return '<div class="pv-empty">No meeting data.</div>';

    var html = '';

    // Title + stakes
    html += '<div class="pv-title">' + _esc(_meeting.title || 'Untitled') + '</div>';
    if (_meeting.stakes) {
      html += '<div class="pv-stakes">' + _esc(_meeting.stakes) + '</div>';
    }

    // ── MEETING DETAILS ──────────────────────────────────────────
    html += _pvSectionHeader('Meeting Details', '#9aa0b2');
    html += '<div class="pv-meta-grid">';

    var dateStr = _meeting.scheduled_for
      ? new Date(_meeting.scheduled_for).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : '—';
    html += '<span class="pv-meta-lbl">Date</span><span class="pv-meta-val">' + _esc(dateStr) + '</span>';

    var durStr = _meeting.duration_minutes ? _meeting.duration_minutes + ' min' : '—';
    html += '<span class="pv-meta-lbl">Duration</span><span class="pv-meta-val">' + _esc(durStr) + '</span>';

    var orgName = (_meeting.organizer_id && _attendeeNameMap[_meeting.organizer_id]) || '—';
    html += '<span class="pv-meta-lbl">Organizer</span><span class="pv-meta-val">' + _esc(orgName) + '</span>';

    var wsDisplay = _workstreamName || (_meeting.workstream_id ? String(_meeting.workstream_id).slice(0, 8) : '—');
    html += '<span class="pv-meta-lbl">Workstream</span><span class="pv-meta-val">' + _esc(wsDisplay) + '</span>';

    html += '</div>';

    // Attended / absent chips
    var attended = _attendeesList.filter(function(a) { return a.rsvp_status === 'accepted' || a.role === 'organizer'; });
    var absent   = _attendeesList.filter(function(a) { return a.rsvp_status !== 'accepted' && a.role !== 'organizer'; });

    if (attended.length) {
      html += '<div class="pv-meta-grid"><span class="pv-meta-lbl">Attended</span><div class="pv-chips">';
      attended.forEach(function(a) { html += '<span class="pv-chip">' + _esc(a.name) + '</span>'; });
      html += '</div></div>';
    }
    if (absent.length) {
      html += '<div class="pv-meta-grid"><span class="pv-meta-lbl">Absent</span><div class="pv-chips">';
      absent.forEach(function(a) { html += '<span class="pv-chip" style="opacity:.6">' + _esc(a.name) + '</span>'; });
      html += '</div></div>';
    }

    // ── INTENDED OUTCOMES ────────────────────────────────────────
    html += _pvSectionHeader('Intended Outcomes', '#2a9d6e');
    if (!_outcomesCache.length) {
      html += '<div class="pv-empty">No outcomes recorded.</div>';
    } else {
      _outcomesCache.forEach(function(o) {
        var ownerName = (o.owner_resource_id && _attendeeNameMap[o.owner_resource_id]) || '';
        html += '<div class="pv-row">' +
          _pvOutcomeFlag(o.status || 'open') +
          '<span class="pv-text">' + _esc((o.description || o.verb || '')) + '</span>' +
          (ownerName ? '<span class="pv-meta-sm">' + _esc(ownerName) + '</span>' : '') +
        '</div>';
      });
    }

    // ── AGENDA & CAPTURES ────────────────────────────────────────
    html += _pvSectionHeader('Agenda &amp; Captures', '#9aa0b2');
    if (!_agendaItems.length) {
      html += '<div class="pv-empty">No agenda items.</div>';
    } else {
      _agendaItems.forEach(function(item) {
        var nodes = (_agendaNodeCache[item.agenda_item_id] || []).filter(function(n) {
          return !_excludedNodeIds.has(n.node_id);
        });
        html += '<div class="pv-agenda-item">';
        html += '<div class="pv-agenda-title">' +
          '<div class="pv-agenda-num">' + _esc(item.position) + '</div>' +
          _esc(item.title || 'Untitled') +
        '</div>';
        if (nodes.length) {
          nodes.forEach(function(n) {
            var tagColor = { decision: '#6a5acd', note: '#2a9d6e', action: '#c97d1a', risk: '#c0392b', dissent: '#c0392b', question: '#6b7590' }[n.tag] || 'var(--md)';
            var tagBg    = { decision: '#ede9fb', note: '#e6f7f0', action: '#fdf3e3', risk: '#fdecea', dissent: '#fdecea', question: '#f0f2f7' }[n.tag] || 'rgba(255,255,255,.06)';
            var label    = { decision: 'DC', note: 'NT', action: 'AX', risk: 'RK', dissent: 'DS', question: 'Q' }[n.tag] || (n.tag||'').toUpperCase().slice(0,2);
            var authorName = (n.created_by && _attendeeNameMap[n.created_by]) || '';
            html += '<div class="pv-row">' +
              '<span class="pv-badge" style="color:' + tagColor + ';background:' + tagBg + ';border-color:' + tagColor + '">' + _esc(n.seq_id || label) + '</span>' +
              '<span class="pv-text">' + _esc((n.summary || '').slice(0, 200)) + '</span>' +
              '<span class="pv-meta-sm">' + (authorName ? _esc(authorName) + ' \u00b7 ' : '') + _esc(_fmtTime(n.created_at)) + '</span>' +
            '</div>';
          });
        }
        html += '</div>';
      });
    }

    // ── DECISIONS ────────────────────────────────────────────────
    html += _pvSectionHeader('Decisions', '#6a5acd');
    if (!_sectionNodes.decision.length) {
      html += '<div class="pv-empty">No decisions recorded.</div>';
    } else {
      _sectionNodes.decision.forEach(function(n) {
        var authorName = (n.created_by && _attendeeNameMap[n.created_by]) || '';
        html += '<div class="pv-row">' +
          '<span class="pv-badge" style="color:#6a5acd;background:#ede9fb;border-color:#9b8de8">' + _esc(n.seq_id || 'DC') + '</span>' +
          '<span class="pv-text">' + _esc((n.summary || '').slice(0, 200)) + '</span>' +
          '<span class="pv-meta-sm">' + (authorName ? _esc(authorName) + ' \u00b7 ' : '') + _esc(_fmtTime(n.created_at)) + '</span>' +
        '</div>';
      });
    }

    // ── ACTION ITEMS ─────────────────────────────────────────────
    html += _pvSectionHeader('Action Items', '#c97d1a');
    if (!_sectionNodes.action.length) {
      html += '<div class="pv-empty">No action items recorded.</div>';
    } else {
      _sectionNodes.action.forEach(function(n) {
        var ownerName = (n.body && _attendeeNameMap[n.body]) || (n.created_by && _attendeeNameMap[n.created_by]) || '';
        var dueStr = n.due_date ? _fmtDate(n.due_date) : '';
        html += '<div class="pv-row">' +
          '<span class="pv-badge" style="color:#c97d1a;background:#fdf3e3;border-color:#e8b86d">' + _esc(n.seq_id || 'AX') + '</span>' +
          '<span class="pv-text">' + _esc((n.summary || '').slice(0, 200)) + '</span>' +
          (ownerName ? '<span class="pv-meta-sm">' + _esc(ownerName) + '</span>' : '') +
          (dueStr ? '<span class="pv-meta-sm">' + _esc(dueStr) + '</span>' : '') +
        '</div>';
      });
    }

    // ── RISKS & DISSENTS ─────────────────────────────────────────
    html += _pvSectionHeader('Risks &amp; Dissents', '#c0392b');
    if (!_sectionNodes.risk.length) {
      html += '<div class="pv-empty">No risks recorded.</div>';
    } else {
      _sectionNodes.risk.forEach(function(n) {
        var label = (n.tag === 'dissent') ? 'DS' : 'RK';
        var authorName = (n.created_by && _attendeeNameMap[n.created_by]) || '';
        html += '<div class="pv-row">' +
          '<span class="pv-badge" style="color:#c0392b;background:#fdecea;border-color:#e88080">' + _esc(n.seq_id || label) + '</span>' +
          '<span class="pv-text">' + _esc((n.summary || '').slice(0, 200)) + '</span>' +
          (authorName ? '<span class="pv-meta-sm">' + _esc(authorName) + '</span>' : '') +
        '</div>';
      });
    }

    // ── PARKING LOT ──────────────────────────────────────────────
    html += _pvSectionHeader('Parking Lot', '#7c5cbf');
    if (!_sectionNodes.question.length) {
      html += '<div class="pv-empty">No parking lot items.</div>';
    } else {
      _sectionNodes.question.forEach(function(n) {
        var sourceItem = n.agenda_item_id
          ? _agendaItems.find(function(a) { return a.agenda_item_id === n.agenda_item_id; })
          : null;
        var sourceLabel = sourceItem ? sourceItem.title : '';
        html += '<div class="pv-row">' +
          '<span style="color:#9478e0;font-size:11px;flex-shrink:0;margin-top:3px">\u25cf</span>' +
          '<span class="pv-text">' + _esc((n.summary || '').slice(0, 200)) + '</span>' +
          (sourceLabel ? '<span class="pv-meta-sm">' + _esc(sourceLabel) + '</span>' : '') +
        '</div>';
      });
    }

    return html;
  }

  // Phase 3 stub — Route + Send modal
  function _openSendModal() {
    // TODO: Phase 3
  }

  // Teardown
  function _teardown() {
    _stopTimer(); _stopPresencePoll(); _unsubscribeChatRealtime();
    if (_intersectionObs) { _intersectionObs.disconnect(); _intersectionObs=null; }
    _chatMessages=[]; _agendaItems=[]; _agendaExpanded={}; _agendaHistCollapsed={}; _agendaNewCounts={}; _agendaClickHandler=null;
    _sectionNodes={decision:[],action:[],risk:[],question:[]}; _sectionAttendees=[]; _actionAssignee=null;
    _excludedNodeIds=new Set(); _agendaNodeCache={}; _attendeesList=[]; _outcomesCache=[]; _workstreamName='';
    _meeting=null; _myResourceId=null; _attendeeNameMap={};
    var host = document.getElementById('ac-meeting-surface-host'); if (host) host.innerHTML='';
  }

  function _onLevelChanged() {
    _removeFilmstripHide();
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

    _injectFilmstripHide();
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
    // Phase 6: status bar — non-blocking, fires after shell mount
    setTimeout(function() { _loadStatusBar(meeting.workstream_id, meeting.meeting_id); }, 0);

    var ci = document.getElementById('ac-lc-chat-input'); var cs = document.getElementById('ac-lc-chat-send');
    if (ci) ci.addEventListener('keydown', function(ev) { if (ev.key==='Enter'&&!ev.shiftKey) { ev.preventDefault(); _sendChatMessage(meeting); } });
    if (cs) cs.addEventListener('click', function() { _sendChatMessage(meeting); });

    // Phase 6: End Meeting button
    var endBtn = document.getElementById('ac-lc-end-btn');
    if (endBtn) endBtn.addEventListener('click', function() { _showEndMeetingModal(); });

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
    _removeFilmstripHide();
    _teardown();
    window.removeEventListener('accord:level-changed', _onLevelChanged);
    window.removeEventListener('accord:remote-node',   _onRemoteNode);
    window.removeEventListener('accord:remote-agenda', _onRemoteAgenda);
  }

  return { render: render, destroy: destroy, _toggleChecklist: _toggleChecklist, _enterReviewMode: _enterReviewMode, _closePreview: _closePreview };
})();