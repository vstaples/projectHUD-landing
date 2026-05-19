// ============================================================
// accord-minutes.js
// CMD-ACCORD-MINUTES-1 · Phase 2 + Phase 3 + Phase 4
// 2026-05-19 · Operator: Vaughn Staples
//
// Minutes surface — review, edit, route + send.
// Renders when accord_meetings.state = 'closed'.
//
// Phase 2: shell + topbar + sidebar + canvas chrome.
// Phase 3: Meeting Header + Outcomes + Agenda sections wired.
// Phase 4: Decisions + Actions + Risks & Dissents + Parking Lot.
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
  var _attendees        = [];   // [{ resource_id, name, checked, role, rsvp_status }]
  var _externalRecs     = [];   // [{ email, checked }]
  var _checkedItems     = {};
  var _attendeeNameMap  = {};   // resource_id → name
  var _userIdNameMap    = {};   // user_id → name
  var _outcomes         = [];
  var _agendaItems      = [];
  var _agendaExpanded   = {};
  var _agendaNodes      = {};
  var _excludedNodeIds  = {};   // node_id → true (Phase 3+4 exclude from send)

  // Phase 4 section state
  var _decisions        = [];
  var _actions          = [];
  var _risks            = [];
  var _parking          = [];
  var _dtColsVerified   = false;  // IR47: discipline+topic verified on accord_nodes
  var _actionPopupNodeId = null;  // node_id of currently-open action edit popup

  // ── Checklist ────────────────────────────────────────────────
  var _CHECKLIST = [
    { id: 'header',     label: 'Meeting header' },
    { id: 'attendance', label: 'Attendance confirmed' },
    { id: 'outcomes',   label: 'Outcomes reviewed' },
    { id: 'agenda',     label: 'Agenda entries checked' },
    { id: 'decisions',  label: 'Decisions verified' },
    { id: 'actions',    label: 'Actions confirmed' },
  ];

  // ── Canvas sections ──────────────────────────────────────────
  var _SECTIONS = [
    { id: 'sec-header',    title: 'Meeting Details',   bar: 'var(--md)',  edit: true,      open: false },
    { id: 'sec-outcomes',  title: 'Intended Outcomes', bar: 'var(--dec)',                  open: true  },
    { id: 'sec-agenda',    title: 'Agenda & Captures', bar: 'var(--nt)',  agendaAdd: true, open: true  },
    { id: 'sec-decisions', title: 'Decisions',         bar: 'var(--dcn)', add: true,       open: false },
    { id: 'sec-actions',   title: 'Action Items',      bar: 'var(--act)', add: true,       open: false },
    { id: 'sec-risks',     title: 'Risks & Dissents',  bar: 'var(--rsk)', add: true,       open: false },
    { id: 'sec-parking',   title: 'Parking Lot',       bar: '#9478e0',    add: true,       open: false },
  ];

  // ── Sidebar nav ──────────────────────────────────────────────
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

  function _fmtFullDate(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      var DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      return DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
    } catch(e) { return ''; }
  }

  function _fmtTimePart(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      var h = d.getHours(); var m = d.getMinutes();
      var ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
    } catch(e) { return ''; }
  }

  function _fmtShortDate(iso) {
    if (!iso) return '';
    try {
      var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      var d = new Date(iso + 'T00:00:00');
      return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
    } catch(e) { return iso; }
  }

  function _isOverdue(dueDateStr) {
    if (!dueDateStr) return false;
    var today = new Date(); today.setHours(0,0,0,0);
    return new Date(dueDateStr + 'T00:00:00') < today;
  }

  function _tagLabel(tag) {
    var m = { note:'NT', decision:'DC', action:'AX', risk:'RK', dissent:'DS', question:'Q' };
    return m[tag] || tag.toUpperCase().slice(0,2);
  }

  function _tagBadgeStyle(tag) {
    var s = {
      note:     'color:var(--nt);background:var(--nt-bg);border-color:var(--nt-bd)',
      decision: 'color:var(--dcn);background:var(--dcn-bg);border-color:var(--dcn-bd)',
      action:   'color:var(--act);background:var(--act-bg);border-color:var(--act-bd)',
      risk:     'color:var(--rsk);background:var(--rsk-bg);border-color:var(--rsk-bd)',
      dissent:  'color:var(--rsk);background:var(--rsk-bg);border-color:var(--rsk-bd)',
      question: 'color:var(--dcn);background:var(--dcn-bg);border-color:var(--dcn-bd)',
    };
    return s[tag] || 'color:var(--md);background:transparent;border-color:var(--b2)';
  }

  function _padSeq(n) {
    var s = String(n || 0);
    while (s.length < 3) s = '0' + s;
    return s;
  }

  function _seqLabel(tag, seqId) {
    var prefixes = { decision:'DC', action:'AX', risk:'RK', dissent:'DS', question:'PK' };
    var prefix = prefixes[tag] || _tagLabel(tag);
    return seqId ? prefix + '-' + _padSeq(seqId) : prefix;
  }

  function _outcomeStatusHtml(status) {
    var MAP = {
      achieved: { label:'\u2713 Met', style:'color:var(--nt);background:var(--nt-bg);border:1px solid var(--nt-bd)'    },
      partial:  { label:'Partial',   style:'color:var(--act);background:var(--act-bg);border:1px solid var(--act-bd)' },
      abandoned:{ label:'Unmet',     style:'color:var(--rsk);background:var(--rsk-bg);border:1px solid var(--rsk-bd)' },
      open:     { label:'Open',      style:'color:var(--md);background:var(--raised);border:1px solid var(--b1)'      },
      carried:  { label:'Carried',   style:'color:var(--md);background:var(--raised);border:1px solid var(--b1)'      },
    };
    var s = MAP[status] || MAP['open'];
    return '<span class="ac-min-outcome-status" style="'+s.style+'">'+_esc(s.label)+'</span>';
  }

  // ── Font ─────────────────────────────────────────────────────
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
                  + '.ac-meeting-tabs-shell{display:none!important}'
                  + '.ac-live-filmstrip{display:none!important}'
                  + '.ac-ws-timeline{display:none!important}'
                  + '.ac-filmstrip{display:none!important}'
                  + '.ac-status-bar{display:none!important}';
    document.head.appendChild(s);
  }

  function _removeSuppressionStyles() {
    var s = document.getElementById('ac-minutes-suppress');
    if (s && s.parentNode) s.parentNode.removeChild(s);
  }

  // ── CSS ──────────────────────────────────────────────────────
  function _css() {
    return (
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
      '.ac-minutes-shell ::-webkit-scrollbar{width:4px;height:4px}' +
      '.ac-minutes-shell ::-webkit-scrollbar-track{background:transparent}' +
      '.ac-minutes-shell ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:2px}' +
      '.ac-minutes-shell ::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.26)}' +
      // Topbar
      '.ac-min-topbar{display:flex;align-items:center;gap:12px;padding:0 16px;height:48px;flex-shrink:0;background:var(--surface);border-bottom:1px solid rgba(255,255,255,.06)}' +
      '.ac-min-logo{font-weight:600;font-size:15px;letter-spacing:-.3px;color:var(--hi);flex-shrink:0}' +
      '.ac-min-logo em{font-style:normal;color:var(--dec)}' +
      '.ac-min-state-badge{font-size:11px;font-weight:600;border-radius:20px;padding:2px 10px;flex-shrink:0;white-space:nowrap}' +
      '.ac-min-state-badge--review{color:var(--act);background:rgba(232,148,48,.10);border:1px solid rgba(232,148,48,.25)}' +
      '.ac-min-state-badge--ready{color:var(--nt);background:rgba(72,170,136,.10);border:1px solid rgba(72,170,136,.25)}' +
      '.ac-min-state-badge--sent{color:var(--dec);background:var(--dec-bg);border:1px solid var(--dec-bd)}' +
      '.ac-min-title{flex:1;min-width:0;font-size:14px;font-weight:500;color:var(--hi);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.ac-min-preview-btn{font-size:11px;font-weight:500;color:var(--lo);background:transparent;border:1px solid rgba(255,255,255,.10);border-radius:6px;padding:4px 12px;cursor:not-allowed;opacity:.35;flex-shrink:0;font-family:inherit}' +
      '.ac-min-send-btn{font-size:11px;font-weight:600;border-radius:6px;padding:4px 14px;flex-shrink:0;cursor:pointer;transition:opacity .15s;font-family:inherit}' +
      '.ac-min-send-btn--disabled{color:var(--lo);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);cursor:not-allowed;opacity:.5}' +
      '.ac-min-send-btn--enabled{color:#fff;background:var(--nt);border:1px solid var(--nt-bd)}' +
      '.ac-min-send-btn--enabled:hover{opacity:.85}' +
      '.ac-min-send-btn--sent{color:var(--dec);background:var(--dec-bg);border:1px solid var(--dec-bd);cursor:default}' +
      '.ac-min-user-chip{display:flex;align-items:center;gap:7px;flex-shrink:0;padding:3px 10px 3px 5px;border-radius:20px;background:var(--b0);border:1px solid rgba(255,255,255,.07)}' +
      '.ac-min-user-avatar{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:var(--dec);background:var(--dec-bg);flex-shrink:0}' +
      '.ac-min-user-name{font-size:11px;font-weight:500;color:var(--md);white-space:nowrap}' +
      // Body
      '.ac-min-body{display:flex;flex:1;min-height:0;overflow:hidden}' +
      // Sidebar
      '.ac-min-sidebar{width:240px;flex-shrink:0;display:flex;flex-direction:column;background:var(--surface);border-right:1px solid rgba(255,255,255,.06);overflow-y:auto}' +
      '.ac-min-sb-section{padding:14px 14px 2px}' +
      '.ac-min-sb-label{display:block;font-size:11px;font-weight:700;color:var(--hi);letter-spacing:.10em;text-transform:uppercase;margin-bottom:6px}' +
      '.ac-min-checklist{padding:0 8px 10px}' +
      '.ac-min-check-row{display:flex;align-items:center;gap:10px;padding:5px 8px;border-radius:5px;cursor:pointer;transition:background .1s;user-select:none}' +
      '.ac-min-check-row:hover{background:var(--raised)}' +
      '.ac-min-circle{width:16px;height:16px;border-radius:50%;border:1px solid var(--b2);display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s,border-color .15s;font-size:0}' +
      '.ac-min-circle.checked{background:var(--nt);border-color:var(--nt);font-size:9px;font-weight:700;color:#fff;line-height:1}' +
      '.ac-min-check-label{font-size:12px;color:var(--md)}' +
      '.ac-min-nav{padding:0 8px 10px}' +
      '.ac-min-nav-item{display:flex;align-items:center;gap:7px;padding:5px 8px;border-radius:5px;cursor:pointer;font-size:12px;color:var(--md);text-decoration:none;transition:background .1s,color .1s}' +
      '.ac-min-nav-item:hover{background:var(--raised);color:var(--hi)}' +
      '.ac-min-nav-item.active{background:var(--b1);color:var(--hi);font-weight:600}' +
      '.ac-min-nav-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}' +
      '.ac-min-nav-lbl{flex:1}' +
      '.ac-min-nav-count{font-size:10px;color:var(--lo);flex-shrink:0}' +
      '.ac-min-recipients{padding:0 8px 16px}' +
      '.ac-min-rec-row{display:flex;align-items:center;gap:8px;padding:4px 8px;border-radius:5px;cursor:pointer;transition:background .1s;user-select:none}' +
      '.ac-min-rec-row:hover{background:var(--raised)}' +
      '.ac-min-rec-avatar{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:var(--dec);background:var(--dec-bg);flex-shrink:0}' +
      '.ac-min-rec-name{flex:1;min-width:0;font-size:12px;color:var(--md);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.ac-min-rec-check{width:14px;height:14px;border-radius:3px;border:1px solid var(--b2);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:0}' +
      '.ac-min-rec-check.checked{background:var(--nt);border-color:var(--nt);font-size:8px;font-weight:700;color:#fff;line-height:1}' +
      '.ac-min-add-ext-link{display:block;padding:5px 8px;font-size:11px;color:var(--dec);cursor:pointer;border-radius:5px;transition:background .1s;text-decoration:none}' +
      '.ac-min-add-ext-link:hover{background:var(--raised)}' +
      '.ac-min-ext-input-row{display:flex;gap:6px;padding:4px 8px;align-items:center}' +
      '.ac-min-ext-input{flex:1;background:var(--raised);border:1px solid rgba(255,255,255,.10);border-radius:5px;padding:5px 8px;font-size:11px;font-family:inherit;color:var(--hi);outline:none}' +
      '.ac-min-ext-input:focus{border-color:rgba(74,140,245,.4)}' +
      '.ac-min-ext-add-btn{font-size:10px;font-weight:600;color:var(--dec);background:var(--dec-bg);border:1px solid var(--dec-bd);border-radius:4px;padding:4px 9px;cursor:pointer;font-family:inherit;flex-shrink:0}' +
      // Canvas
      '.ac-min-canvas{flex:1;min-width:0;overflow-y:auto;padding:0}' +
      '.ac-min-mtg-title{font-size:26px;font-weight:600;color:var(--hi);padding:24px 28px 4px;line-height:1.2}' +
      '.ac-min-stakes{font-size:13px;font-style:italic;color:var(--md);border-left:3px solid var(--b2);padding:5px 12px;margin:8px 28px 16px}' +
      // Section chrome
      '.ac-min-sec{margin-bottom:0}' +
      '.ac-min-sec-header{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:10px;padding:10px 24px;background:var(--void);border-bottom:1px solid rgba(255,255,255,.06);cursor:pointer;user-select:none}' +
      '.ac-min-sec-bar{width:4px;height:16px;border-radius:2px;flex-shrink:0}' +
      '.ac-min-sec-title{font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--md);flex:1}' +
      '.ac-min-sec-add{font-size:11px;font-weight:600;color:var(--dec);background:var(--dec-bg);border:1px solid var(--dec-bd);border-radius:5px;padding:3px 10px;cursor:pointer;flex-shrink:0;font-family:inherit;transition:opacity .1s}' +
      '.ac-min-sec-add:hover{opacity:.8}' +
      '.ac-min-sec-add--amber{font-size:11px;font-weight:600;color:var(--act);background:var(--act-bg);border:1px solid var(--act-bd);border-radius:5px;padding:3px 10px;cursor:not-allowed;flex-shrink:0;opacity:.4;font-family:inherit}' +
      '.ac-min-sec-edit-btn{font-size:11px;font-weight:500;color:var(--lo);background:transparent;border:1px solid rgba(255,255,255,.10);border-radius:5px;padding:3px 10px;cursor:not-allowed;opacity:.5;flex-shrink:0;font-family:inherit}' +
      '.ac-min-sec-chevron{font-size:10px;color:var(--lo);transition:transform .15s;flex-shrink:0;line-height:1}' +
      '.ac-min-sec-chevron.open{transform:rotate(90deg)}' +
      '.ac-min-sec-body{overflow:hidden}' +
      '.ac-min-sec-body-inner{padding:16px 24px 20px}' +
      '.ac-min-sec-placeholder{font-size:12px;color:var(--lo);font-style:italic}' +
      '.ac-min-sec-empty{font-size:12px;color:var(--lo);font-style:italic;padding:2px 0 6px}' +
      // Meeting details
      '.ac-min-details-grid{display:grid;grid-template-columns:auto 1fr;gap:4px 16px;margin-bottom:16px}' +
      '.ac-min-detail-lbl{font-size:12px;color:var(--lo);font-weight:600;white-space:nowrap;padding:1px 0}' +
      '.ac-min-detail-val{font-size:13px;color:var(--hi);padding:1px 0}' +
      '.ac-min-chip-section{margin-top:14px}' +
      '.ac-min-chip-label{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--lo);display:block;margin-bottom:7px}' +
      '.ac-min-chips{display:flex;flex-wrap:wrap;gap:6px}' +
      '.ac-min-chip{display:flex;align-items:center;gap:7px;background:var(--raised);border:1px solid var(--b1);border-radius:20px;padding:4px 10px 4px 5px}' +
      '.ac-min-chip-avatar{width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;color:var(--dec);background:var(--dec-bg);flex-shrink:0}' +
      '.ac-min-chip-name{font-size:12px;color:var(--hi)}' +
      '.ac-min-chip-role{font-size:11px;color:var(--lo)}' +
      // Outcomes
      '.ac-min-outcome-row{display:flex;align-items:flex-start;gap:10px;padding:7px 10px;margin-bottom:4px;border-radius:6px;background:var(--surface);position:relative}' +
      '.ac-min-outcome-row:hover .ac-min-outcome-del{display:flex}' +
      '.ac-min-outcome-row.deleted{opacity:.35}' +
      '.ac-min-outcome-row.deleted .ac-min-outcome-desc{text-decoration:line-through}' +
      '.ac-min-outcome-status{font-size:11px;font-weight:600;border-radius:10px;padding:2px 8px;flex-shrink:0;white-space:nowrap;margin-top:1px}' +
      '.ac-min-outcome-desc{flex:1;font-size:13px;color:var(--hi);outline:none;word-break:break-word;min-width:0}' +
      '.ac-min-outcome-desc:focus{outline:1px solid rgba(74,140,245,.3);border-radius:3px;padding:1px 3px}' +
      '.ac-min-outcome-owner{font-size:11px;color:var(--lo);flex-shrink:0;white-space:nowrap;margin-top:2px}' +
      '.ac-min-outcome-del{display:none;align-items:center;font-size:13px;font-weight:700;color:var(--rsk);background:var(--rsk-bg);border:1px solid var(--rsk-bd);border-radius:3px;padding:0 6px;cursor:pointer;line-height:18px;flex-shrink:0;font-family:inherit}' +
      '.ac-min-outcome-add-row{display:flex;gap:6px;padding:10px 0 4px;align-items:center}' +
      '.ac-min-outcome-input{flex:1;background:var(--raised);border:1px solid rgba(255,255,255,.10);border-radius:6px;padding:7px 10px;font-size:12px;font-family:inherit;color:var(--hi);outline:none;transition:border-color .15s}' +
      '.ac-min-outcome-input:focus{border-color:rgba(74,140,245,.4)}' +
      '.ac-min-outcome-add-btn{font-size:11px;font-weight:600;color:var(--dec);background:var(--dec-bg);border:1px solid var(--dec-bd);border-radius:6px;padding:6px 12px;cursor:pointer;flex-shrink:0;font-family:inherit}' +
      '.ac-min-outcome-add-btn:hover{opacity:.8}' +
      // Agenda
      '.ac-min-agenda-item{margin-bottom:6px;margin-left:8px;border-radius:6px;box-shadow:-2px 0 0 0 var(--nt)}' +
      '.ac-min-agenda-item-header{display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer;background:#13172a;border-radius:6px;transition:background .1s}' +
      '.ac-min-agenda-item-header:hover{background:var(--hover)}' +
      '.ac-min-agenda-item.expanded .ac-min-agenda-item-header{border-radius:6px 6px 0 0}' +
      '.ac-min-item-chevron{font-size:9px;color:var(--lo);transition:transform .15s;flex-shrink:0}' +
      '.ac-min-item-chevron.open{transform:rotate(90deg)}' +
      '.ac-min-item-num{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:var(--hi);background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.13);flex-shrink:0}' +
      '.ac-min-item-title{flex:1;font-size:14px;font-weight:500;color:var(--hi)}' +
      '.ac-min-item-add-btn{font-size:10px;font-weight:600;color:var(--act);background:var(--act-bg);border:1px solid var(--act-bd);border-radius:5px;padding:2px 8px;cursor:not-allowed;opacity:.4;font-family:inherit;flex-shrink:0}' +
      '.ac-min-agenda-item-body{padding:6px 10px 10px;background:#13172a;border-top:1px solid rgba(255,255,255,.05);border-radius:0 0 6px 6px}' +
      // Entry rows (agenda captures)
      '.ac-min-entry-list{display:flex;flex-direction:column;gap:4px}' +
      '.ac-min-entry-row{display:flex;align-items:baseline;gap:8px;padding:5px 8px;border-radius:5px;background:rgba(255,255,255,.03);position:relative}' +
      '.ac-min-entry-row:hover .ac-min-entry-exclude{display:block}' +
      '.ac-min-entry-row.excluded{opacity:.35}' +
      '.ac-min-tag-badge{font-size:10px;font-weight:700;padding:0 5px;border-radius:2px;border:1px solid;flex-shrink:0;line-height:1.5;white-space:nowrap}' +
      '.ac-min-entry-summary{flex:1;font-size:13px;color:var(--hi)}' +
      '.ac-min-entry-summary.struck{text-decoration:line-through}' +
      '.ac-min-entry-author{font-size:11px;color:var(--lo);flex-shrink:0;white-space:nowrap}' +
      '.ac-min-entry-time{font-size:11px;color:var(--lo);flex-shrink:0;white-space:nowrap}' +
      '.ac-min-entry-exclude{display:none;font-size:10px;font-weight:600;color:var(--rsk);background:var(--rsk-bg);border:1px solid var(--rsk-bd);border-radius:3px;padding:1px 6px;cursor:pointer;flex-shrink:0;font-family:inherit}' +
      '.ac-min-entry-empty{font-size:12px;color:var(--lo);font-style:italic;padding:6px 0}' +
      // ── Phase 4 node rows ────────────────────────────────────
      '.ac-min-node-list{display:flex;flex-direction:column;gap:3px;margin-bottom:10px}' +
      '.ac-min-node-row{display:flex;align-items:flex-start;gap:8px;padding:7px 8px;border-radius:5px;background:rgba(255,255,255,.03);position:relative;transition:background .1s}' +
      '.ac-min-node-row:hover{background:var(--raised)}' +
      '.ac-min-node-row:hover .ac-min-node-del{opacity:1}' +
      '.ac-min-node-row.deleted{opacity:.35}' +
      '.ac-min-node-row.deleted .ac-min-node-summary{text-decoration:line-through}' +
      '.ac-min-node-badge{font-size:10px;font-weight:700;padding:0 5px;border-radius:2px;border:1px solid;line-height:1.5;flex-shrink:0;margin-top:3px;white-space:nowrap}' +
      '.ac-min-node-summary{flex:1;font-size:13px;color:var(--hi);outline:none;word-break:break-word;min-width:0;line-height:1.5}' +
      '.ac-min-node-summary:focus{outline:1px solid rgba(74,140,245,.3);border-radius:3px;padding:1px 3px}' +
      '.ac-min-node-meta{font-size:11px;color:var(--lo);flex-shrink:0;white-space:nowrap;margin-top:3px}' +
      '.ac-min-node-del{font-size:11px;opacity:0;transition:opacity .12s;font-weight:700;color:var(--rsk);background:var(--rsk-bg);border:1px solid var(--rsk-bd);border-radius:3px;padding:0 5px;cursor:pointer;line-height:1.5;flex-shrink:0;margin-top:3px;font-family:inherit}' +
      // Action-specific meta chips
      '.ac-min-node-owner{font-size:11px;color:var(--lo);flex-shrink:0;white-space:nowrap;margin-top:3px}' +
      '.ac-min-node-due{font-size:11px;flex-shrink:0;white-space:nowrap;margin-top:3px}' +
      '.ac-min-node-due--future{color:var(--act)}' +
      '.ac-min-node-due--overdue{color:var(--rsk);font-weight:600}' +
      '.ac-min-node-status{font-size:10px;font-weight:600;border-radius:10px;padding:1px 7px;flex-shrink:0;white-space:nowrap;margin-top:4px;border:1px solid}' +
      '.ac-min-node-status--open{color:var(--act);background:var(--act-bg);border-color:var(--act-bd)}' +
      '.ac-min-node-status--overdue{color:var(--rsk);background:var(--rsk-bg);border-color:var(--rsk-bd)}' +
      '.ac-min-node-status--done{color:var(--nt);background:var(--nt-bg);border-color:var(--nt-bd)}' +
      // Severity chip
      '.ac-min-node-sev{font-size:10px;font-weight:600;border-radius:10px;padding:1px 7px;flex-shrink:0;white-space:nowrap;margin-top:4px;border:1px solid}' +
      '.ac-min-node-sev--low{color:var(--act);background:var(--act-bg);border-color:var(--act-bd)}' +
      '.ac-min-node-sev--medium{color:var(--act);background:var(--act-bg);border-color:var(--act-bd)}' +
      '.ac-min-node-sev--high{color:var(--rsk);background:var(--rsk-bg);border-color:var(--rsk-bd)}' +
      // Parking lot dot
      '.ac-min-node-dot{width:6px;height:6px;border-radius:50%;background:#9478e0;flex-shrink:0;margin-top:6px}' +
      '.ac-min-node-source{font-size:11px;color:var(--lo);flex-shrink:0;white-space:nowrap;margin-top:3px}' +
      // Add row (bottom of each section)
      '.ac-min-node-add-row{display:flex;gap:6px;padding:6px 0 2px;align-items:center}' +
      '.ac-min-node-input{flex:1;background:var(--raised);border:1px solid rgba(255,255,255,.10);border-radius:6px;padding:7px 10px;font-size:12px;font-family:inherit;color:var(--hi);outline:none;transition:border-color .15s}' +
      '.ac-min-node-input:focus{border-color:rgba(74,140,245,.4)}' +
      '.ac-min-node-add-btn{font-size:11px;font-weight:600;color:var(--dec);background:var(--dec-bg);border:1px solid var(--dec-bd);border-radius:6px;padding:6px 12px;cursor:pointer;flex-shrink:0;font-family:inherit;transition:opacity .1s}' +
      '.ac-min-node-add-btn:hover{opacity:.8}' +
      '.ac-min-node-add-btn:disabled{opacity:.4;cursor:not-allowed}' +
      // Action edit popup
      '.ac-min-action-popup{position:relative;background:var(--surface);border:1px solid var(--b2);border-radius:8px;padding:12px 14px;margin:4px 0 8px;display:flex;flex-direction:column;gap:8px}' +
      '.ac-min-action-popup-row{display:flex;align-items:center;gap:8px}' +
      '.ac-min-action-popup-lbl{font-size:11px;font-weight:600;color:var(--lo);min-width:60px;flex-shrink:0}' +
      '.ac-min-action-popup-input{flex:1;background:var(--raised);border:1px solid rgba(255,255,255,.10);border-radius:5px;padding:5px 9px;font-size:12px;font-family:inherit;color:var(--hi);outline:none}' +
      '.ac-min-action-popup-input:focus{border-color:rgba(74,140,245,.4)}' +
      '.ac-min-action-popup-select{flex:1;background:var(--raised);border:1px solid rgba(255,255,255,.10);border-radius:5px;padding:5px 9px;font-size:12px;font-family:inherit;color:var(--hi);outline:none}' +
      '.ac-min-action-popup-btns{display:flex;gap:6px;justify-content:flex-end;padding-top:2px}' +
      '.ac-min-action-popup-cancel{font-size:11px;color:var(--lo);background:transparent;border:1px solid rgba(255,255,255,.10);border-radius:5px;padding:4px 12px;cursor:pointer;font-family:inherit}' +
      '.ac-min-action-popup-confirm{font-size:11px;font-weight:600;color:#fff;background:var(--nt);border:1px solid var(--nt-bd);border-radius:5px;padding:4px 12px;cursor:pointer;font-family:inherit}' +
      '.ac-min-action-popup-confirm:hover{opacity:.85}'
    );
  }

  // ── Shell HTML ───────────────────────────────────────────────
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
        (n.countKey ? '<span class="ac-min-nav-count" id="ac-min-nc-'+n.countKey+'">\u2014</span>' : '') +
      '</a>';
    }).join('');
  }

  function _secHeaderBtnHtml(sec) {
    if (sec.edit)      return '<button type="button" class="ac-min-sec-edit-btn" disabled>Edit</button>';
    if (sec.agendaAdd) return '<button type="button" class="ac-min-sec-add--amber" disabled>+ Add item</button>';
    if (sec.add)       return '<button type="button" class="ac-min-sec-add" data-sec-add="'+sec.id+'">+ Add</button>';
    return '';
  }

  function _canvasHtml(meeting) {
    var title  = '<div class="ac-min-mtg-title">'+_esc(meeting.title||'Untitled')+'</div>';
    var stakes = meeting.stakes
      ? '<div class="ac-min-stakes">'+_esc(meeting.stakes)+'</div>' : '';

    var secs = _SECTIONS.map(function(sec) {
      var isOpen = !!sec.open;
      return '<div class="ac-min-sec" id="'+sec.id+'">' +
        '<div class="ac-min-sec-header" data-sec-toggle="'+sec.id+'">' +
          '<span class="ac-min-sec-bar" style="background:'+sec.bar+'"></span>' +
          '<span class="ac-min-sec-title">'+_esc(sec.title)+'</span>' +
          _secHeaderBtnHtml(sec) +
          '<span class="ac-min-sec-chevron'+(isOpen?' open':'')+'">\u25b6</span>' +
        '</div>' +
        '<div class="ac-min-sec-body" id="ac-min-sb-'+sec.id+'"'+(isOpen?'':' style="display:none"')+'>' +
          '<div class="ac-min-sec-body-inner"><div class="ac-min-sec-placeholder">Loading\u2026</div></div>' +
        '</div>' +
      '</div>';
    }).join('');

    return title + stakes + secs;
  }

  function _shellHtml(meeting) {
    return '<div class="ac-minutes-shell" id="ac-min-shell">' +
      '<style>'+_css()+'</style>' +
      '<div class="ac-min-topbar">' +
        '<span class="ac-min-logo">accord<em>.</em></span>' +
        '<span class="ac-min-state-badge ac-min-state-badge--review" id="ac-min-badge">Under Review</span>' +
        '<span class="ac-min-title">'+_esc((meeting.title||'Untitled')+' \u00b7 Minutes')+'</span>' +
        '<button type="button" class="ac-min-preview-btn" disabled>Preview \u2192</button>' +
        '<button type="button" class="ac-min-send-btn ac-min-send-btn--disabled" id="ac-min-send-btn" disabled>Route + Send \u2191</button>' +
        _userChipHtml() +
      '</div>' +
      '<div class="ac-min-body">' +
        '<div class="ac-min-sidebar" id="ac-min-sidebar">' +
          '<div class="ac-min-sb-section"><span class="ac-min-sb-label">Review Checklist</span></div>' +
          '<div class="ac-min-checklist" id="ac-min-checklist">'+_checklistHtml()+'</div>' +
          '<div class="ac-min-sb-section"><span class="ac-min-sb-label">Sections</span></div>' +
          '<nav class="ac-min-nav" id="ac-min-nav">'+_navHtml()+'</nav>' +
          '<div class="ac-min-sb-section"><span class="ac-min-sb-label">Recipients</span></div>' +
          '<div class="ac-min-recipients" id="ac-min-recipients"><div style="font-size:11px;color:var(--lo);padding:4px 8px">Loading\u2026</div></div>' +
        '</div>' +
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

  // ── Section toggles ──────────────────────────────────────────
  function _wireSectionToggles() {
    var canvas = document.getElementById('ac-min-canvas'); if (!canvas) return;
    canvas.addEventListener('click', function(ev) {
      if (ev.target.closest('[data-sec-add]')) return;
      if (ev.target.closest('.ac-min-agenda-item-header')) return;
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

  // ── Canvas + Add button routing ──────────────────────────────
  function _wireCanvasAddBtns() {
    var canvas = document.getElementById('ac-min-canvas'); if (!canvas) return;
    var inputMap = {
      'sec-decisions': 'ac-min-dc-input',
      'sec-actions':   'ac-min-ax-input',
      'sec-risks':     'ac-min-rk-input',
      'sec-parking':   'ac-min-pk-input',
    };
    canvas.addEventListener('click', function(ev) {
      var btn = ev.target.closest('[data-sec-add]'); if (!btn) return;
      var secId = btn.dataset.secAdd;
      var body  = document.getElementById('ac-min-sb-' + secId);
      var hdr   = document.querySelector('[data-sec-toggle="'+secId+'"]');
      var chev  = hdr ? hdr.querySelector('.ac-min-sec-chevron') : null;
      if (body && body.style.display === 'none') {
        body.style.display = '';
        if (chev) chev.classList.add('open');
      }
      var inputId = inputMap[secId];
      if (inputId) {
        var inp = document.getElementById(inputId);
        if (inp) {
          setTimeout(function() {
            inp.focus();
            inp.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 60);
        }
      }
    });
  }

  // ── Nav ──────────────────────────────────────────────────────
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

  function _wireNavClicks() {
    document.querySelectorAll('.ac-min-nav-item').forEach(function(link) {
      link.addEventListener('click', function(ev) {
        ev.preventDefault();
        var secId = link.dataset.navSec;
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

  function _wireSendBtn() {
    var btn = document.getElementById('ac-min-send-btn'); if (!btn) return;
    btn.addEventListener('click', function() {
      if (btn.disabled) return;
      console.log('[AccordMinutes] Route + Send — Phase 5 scope');
    });
  }

  // ── Recipients ───────────────────────────────────────────────
  function _loadRecipients(meetingId) {
    if (!meetingId) return Promise.resolve();
    return API.get('accord_meeting_attendees?meeting_id=eq.'+meetingId+'&select=attendee_id,resource_id,role_in_meeting,rsvp_status')
      .then(function(rows) {
        rows = rows || [];
        if (!rows.length) { _renderRecipients(); return; }
        var rids = rows.map(function(r) { return r.resource_id; });
        return API.get('resources?id=in.('+rids.join(',')+')'+'&select=id,user_id,name')
          .then(function(res) {
            var nm = {};
            (res||[]).forEach(function(r) {
              nm[r.id] = r.name;
              _attendeeNameMap[r.id] = r.name;
              if (r.user_id) _userIdNameMap[r.user_id] = r.name;
            });
            _attendees = rows.map(function(a) {
              return {
                resource_id: a.resource_id,
                name:        nm[a.resource_id]||'Unknown',
                checked:     true,
                role:        a.role_in_meeting,
                rsvp_status: a.rsvp_status,
              };
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

  // ── Nav counts ───────────────────────────────────────────────
  function _loadSectionCounts(meetingId) {
    if (!meetingId) return;
    API.get('accord_meeting_outcomes?meeting_id=eq.'+meetingId+'&select=outcome_id')
      .then(function(r) { _setCount('outcomes', (r||[]).length); }).catch(function(){});
    API.get('accord_agenda_items?meeting_id=eq.'+meetingId+'&select=agenda_item_id')
      .then(function(r) { _setCount('agenda', (r||[]).length); }).catch(function(){});
    API.get('accord_nodes?meeting_id=eq.'+meetingId+'&tag=in.(decision,action,risk,dissent,question)&select=node_id,tag')
      .then(function(rows) {
        rows = rows || [];
        var dc=0; var ax=0; var rk=0; var pk=0;
        rows.forEach(function(n) {
          if      (n.tag==='decision')                dc++;
          else if (n.tag==='action')                  ax++;
          else if (n.tag==='risk'||n.tag==='dissent') rk++;
          else if (n.tag==='question')                pk++;
        });
        _setCount('decisions',dc); _setCount('risks',rk); _setCount('parking',pk);
        // Actions count updated by _loadActions with overdue info; set placeholder here
        _setCount('actions', ax);
      }).catch(function(){});
  }

  function _setCount(key, n) {
    var el = document.getElementById('ac-min-nc-'+key);
    if (!el) return;
    if (typeof n === 'string') { el.textContent = n || '\u2014'; return; }
    el.textContent = n > 0 ? String(n) : '\u2014';
  }

  // ── Meeting Details ──────────────────────────────────────────
  function _loadMeetingDetails(meeting) {
    var extrasP = API.get('accord_meetings?meeting_id=eq.'+meeting.meeting_id+'&select=started_at,ended_at')
      .then(function(r) { return (r&&r[0])||{}; }).catch(function() { return {}; });
    var orgP = meeting.organizer_id
      ? API.get('resources?user_id=eq.'+meeting.organizer_id+'&select=id,name&limit=1')
          .then(function(r) { return (r&&r[0])||null; }).catch(function() { return null; })
      : Promise.resolve(null);
    var wsP = meeting.workstream_id
      ? API.get('workstreams?workstream_id=eq.'+meeting.workstream_id+'&select=workstream_id,name&limit=1')
          .then(function(r) { return (r&&r[0])||null; }).catch(function() { return null; })
      : Promise.resolve(null);
    Promise.all([extrasP, orgP, wsP]).then(function(res) {
      _renderMeetingDetails(meeting, res[0]||{}, res[1], res[2]?res[2].name:null);
    }).catch(function() { _renderMeetingDetails(meeting, {}, null, null); });
  }

  function _renderMeetingDetails(meeting, extras, organizer, workstreamName) {
    var body = document.getElementById('ac-min-sb-sec-header'); if (!body) return;
    var dateStr  = _fmtFullDate(meeting.scheduled_for);
    var durStr   = meeting.duration_minutes ? meeting.duration_minutes + ' minutes' : '\u2014';
    var timeRange = '';
    if (extras && extras.started_at) {
      timeRange = _fmtTimePart(extras.started_at);
      if (extras.ended_at) timeRange += ' \u2013 ' + _fmtTimePart(extras.ended_at);
    }
    var durFull = durStr + (timeRange ? ' \u00b7 ' + timeRange : '');
    var orgName = organizer ? organizer.name : '\u2014';
    var wsName  = workstreamName || '\u2014';

    var metaHtml =
      '<div class="ac-min-details-grid">' +
        '<span class="ac-min-detail-lbl">Date</span><span class="ac-min-detail-val">'+_esc(dateStr||'\u2014')+'</span>' +
        '<span class="ac-min-detail-lbl">Duration</span><span class="ac-min-detail-val">'+_esc(durFull)+'</span>' +
        '<span class="ac-min-detail-lbl">Organizer</span><span class="ac-min-detail-val">'+_esc(orgName)+'</span>' +
        '<span class="ac-min-detail-lbl">Workstream</span><span class="ac-min-detail-val">'+_esc(wsName)+'</span>' +
      '</div>';

    var attended = _attendees.filter(function(a) { return a.rsvp_status === 'accepted'; });
    var absent   = _attendees.filter(function(a) { return a.rsvp_status !== 'accepted'; });

    var attendedHtml = '';
    if (attended.length) {
      attendedHtml = '<div class="ac-min-chip-section">' +
        '<span class="ac-min-chip-label">Attended</span><div class="ac-min-chips">' +
        attended.map(function(a) {
          return '<div class="ac-min-chip"><span class="ac-min-chip-avatar">'+_esc(_initials(a.name))+'</span>' +
            '<span class="ac-min-chip-name">'+_esc(a.name)+
              (a.role==='organizer'?' <span class="ac-min-chip-role">\u00b7 Organizer</span>':'')+'</span></div>';
        }).join('') + '</div></div>';
    }

    var absentHtml = '';
    if (absent.length) {
      absentHtml = '<div class="ac-min-chip-section" style="opacity:.45">' +
        '<span class="ac-min-chip-label">Invited \u00b7 Did Not Join</span><div class="ac-min-chips">' +
        absent.map(function(a) {
          return '<div class="ac-min-chip"><span class="ac-min-chip-avatar">'+_esc(_initials(a.name))+'</span>' +
            '<span class="ac-min-chip-name">'+_esc(a.name)+'</span></div>';
        }).join('') + '</div></div>';
    }

    body.innerHTML = '<div class="ac-min-sec-body-inner">'+metaHtml+attendedHtml+absentHtml+'</div>';
  }

  // ── Outcomes ─────────────────────────────────────────────────
  function _loadOutcomes(meetingId) {
    if (!meetingId) return;
    API.get('accord_meeting_outcomes?meeting_id=eq.'+meetingId+'&select=outcome_id,verb,description,owner_resource_id,status,position&order=position.asc')
      .then(function(rows) {
        _outcomes = rows || [];
        _renderOutcomes();
        _setCount('outcomes', _outcomes.length);
      }).catch(function() {
        var body = document.getElementById('ac-min-sb-sec-outcomes');
        if (body) body.innerHTML = '<div class="ac-min-sec-body-inner"><div class="ac-min-sec-empty">Could not load outcomes.</div></div>';
      });
  }

  function _outcomeRowHtml(outcome) {
    var ownerName = _attendeeNameMap[outcome.owner_resource_id] || '';
    var isDeleted = outcome.status === 'abandoned';
    return '<div class="ac-min-outcome-row'+(isDeleted?' deleted':'')+'" data-outcome-id="'+_esc(outcome.outcome_id)+'">' +
      _outcomeStatusHtml(outcome.status) +
      '<span class="ac-min-outcome-desc" contenteditable="true" data-orig="'+_esc(outcome.description||'')+'">'+
        _esc(outcome.description||'')+'</span>' +
      (ownerName ? '<span class="ac-min-outcome-owner">'+_esc(ownerName)+'</span>' : '') +
      '<button type="button" class="ac-min-outcome-del" data-action="del-outcome" data-outcome-id="'+_esc(outcome.outcome_id)+'">\u00d7</button>' +
    '</div>';
  }

  function _renderOutcomes() {
    var body = document.getElementById('ac-min-sb-sec-outcomes'); if (!body) return;
    // Phase 3 carry-forward: outcomes are read-only — DB trigger blocks INSERT on closed meetings.
    // No + Add row rendered. Display only.
    var listHtml = _outcomes.length
      ? '<div id="ac-min-outcomes-list">'+_outcomes.map(_outcomeRowHtml).join('')+'</div>'
      : '<div id="ac-min-outcomes-list"><div class="ac-min-sec-empty">No outcomes recorded.</div></div>';
    body.innerHTML = '<div class="ac-min-sec-body-inner">'+listHtml+'</div>';
    _wireOutcomeSection(body);
  }

  function _wireOutcomeSection(body) {
    // Description edit
    body.addEventListener('focusout', function(ev) {
      var desc = ev.target;
      if (!desc.classList || !desc.classList.contains('ac-min-outcome-desc')) return;
      var newText = desc.textContent.trim();
      var orig    = desc.dataset.orig;
      if (newText === orig) return;
      var row = desc.closest('[data-outcome-id]'); if (!row) return;
      var oid = row.dataset.outcomeId;
      // IR71: update DOM only after PATCH confirms
      // IR73: filter includes meeting_id
      API.patch('accord_meeting_outcomes?outcome_id=eq.'+oid+'&meeting_id=eq.'+_meeting.meeting_id, { description: newText })
        .then(function() {
          desc.dataset.orig = newText;
          var o = _outcomes.find(function(x) { return x.outcome_id === oid; });
          if (o) o.description = newText;
        }).catch(function(e) {
          console.error('[AccordMinutes] outcome PATCH failed', e);
          desc.textContent = orig;
        });
    });

    // × soft delete (mark abandoned — status that renders as Unmet)
    body.addEventListener('click', function(ev) {
      var delBtn = ev.target.closest('[data-action="del-outcome"]'); if (!delBtn) return;
      var oid = delBtn.dataset.outcomeId;
      API.patch('accord_meeting_outcomes?outcome_id=eq.'+oid+'&meeting_id=eq.'+_meeting.meeting_id, { status: 'abandoned' })
        .then(function() {
          var o = _outcomes.find(function(x) { return x.outcome_id === oid; });
          if (o) o.status = 'abandoned';
          var row = body.querySelector('[data-outcome-id="'+oid+'"]');
          if (row) row.classList.add('deleted');
        }).catch(function(e) { console.error('[AccordMinutes] outcome delete failed', e); });
    });
  }

  // ── Agenda & Captures ────────────────────────────────────────
  function _loadAgenda(meetingId) {
    if (!meetingId) return;
    API.get('accord_agenda_items?meeting_id=eq.'+meetingId+'&select=agenda_item_id,title,position,status&order=position.asc')
      .then(function(rows) {
        _agendaItems = rows || [];
        _renderAgendaSection();
        _setCount('agenda', _agendaItems.length);
      }).catch(function() {
        var body = document.getElementById('ac-min-sb-sec-agenda');
        if (body) body.innerHTML = '<div class="ac-min-sec-body-inner"><div class="ac-min-sec-empty">Could not load agenda.</div></div>';
      });
  }

  function _renderAgendaSection() {
    var body = document.getElementById('ac-min-sb-sec-agenda'); if (!body) return;
    if (!_agendaItems.length) {
      body.innerHTML = '<div class="ac-min-sec-body-inner"><div class="ac-min-sec-empty">No agenda items.</div></div>';
      return;
    }
    var html = '<div class="ac-min-sec-body-inner"><div id="ac-min-agenda-list">';
    _agendaItems.forEach(function(item) {
      html += _agendaItemHtml(item, !!_agendaExpanded[item.agenda_item_id]);
    });
    html += '</div></div>';
    body.innerHTML = html;
    _wireAgendaSection(body);
  }

  function _agendaItemHtml(item, expanded) {
    var bodyHtml = expanded
      ? '<div class="ac-min-agenda-item-body" id="ac-min-aib-'+_esc(item.agenda_item_id)+'">' +
          '<div style="font-size:11px;color:var(--lo);padding:6px 0">Loading\u2026</div></div>'
      : '';
    return '<div class="ac-min-agenda-item'+(expanded?' expanded':'')+'" id="ac-min-ai-'+_esc(item.agenda_item_id)+'">' +
      '<div class="ac-min-agenda-item-header" data-action="toggle-item" data-item-id="'+_esc(item.agenda_item_id)+'">' +
        '<span class="ac-min-item-chevron'+(expanded?' open':'')+'">&#9654;</span>' +
        '<span class="ac-min-item-num">'+_esc(item.position)+'</span>' +
        '<span class="ac-min-item-title">'+_esc(item.title||'Untitled')+'</span>' +
        '<button type="button" class="ac-min-item-add-btn" disabled>+ Add</button>' +
      '</div>' +
      bodyHtml +
    '</div>';
  }

  function _wireAgendaSection(body) {
    body.addEventListener('click', function(ev) {
      var hdr = ev.target.closest('[data-action="toggle-item"]'); if (!hdr) return;
      var itemId = hdr.dataset.itemId;
      var item   = _agendaItems.find(function(a) { return a.agenda_item_id === itemId; });
      if (!item) return;
      _agendaExpanded[itemId] = !_agendaExpanded[itemId];
      var itemEl = document.getElementById('ac-min-ai-'+itemId); if (!itemEl) return;
      var chev   = hdr.querySelector('.ac-min-item-chevron');
      if (_agendaExpanded[itemId]) {
        itemEl.classList.add('expanded');
        if (chev) chev.classList.add('open');
        if (!document.getElementById('ac-min-aib-'+itemId)) {
          var bd = document.createElement('div');
          bd.className = 'ac-min-agenda-item-body';
          bd.id = 'ac-min-aib-'+itemId;
          bd.innerHTML = '<div style="font-size:11px;color:var(--lo);padding:6px 0">Loading\u2026</div>';
          itemEl.appendChild(bd);
        }
        _loadAgendaItemNodes(item);
      } else {
        itemEl.classList.remove('expanded');
        if (chev) chev.classList.remove('open');
        var bdEl = document.getElementById('ac-min-aib-'+itemId);
        if (bdEl && bdEl.parentElement) bdEl.parentElement.removeChild(bdEl);
      }
    });
  }

  function _loadAgendaItemNodes(item) {
    if (!_meeting) return;
    if (_agendaNodes[item.agenda_item_id]) {
      _renderAgendaItemBody(item, _agendaNodes[item.agenda_item_id]);
      return;
    }
    API.get('accord_nodes?meeting_id=eq.'+_meeting.meeting_id+'&agenda_item_id=eq.'+item.agenda_item_id+'&select=node_id,seq_id,tag,summary,created_by,created_at&order=created_at.asc')
      .then(function(rows) {
        _agendaNodes[item.agenda_item_id] = rows || [];
        _renderAgendaItemBody(item, _agendaNodes[item.agenda_item_id]);
      }).catch(function() {
        var bd = document.getElementById('ac-min-aib-'+item.agenda_item_id);
        if (bd) bd.innerHTML = '<div class="ac-min-entry-empty">Failed to load.</div>';
      });
  }

  function _renderAgendaItemBody(item, nodes) {
    var bd = document.getElementById('ac-min-aib-'+item.agenda_item_id); if (!bd) return;
    if (!nodes || !nodes.length) {
      bd.innerHTML = '<div class="ac-min-entry-empty">No captures for this item.</div>';
      return;
    }
    var unknown = [];
    nodes.forEach(function(n) {
      if (n.created_by && !_userIdNameMap[n.created_by]) unknown.push(n.created_by);
    });
    var resolveP = unknown.length
      ? API.get('resources?user_id=in.('+unknown.join(',')+')'+'&select=user_id,name')
          .then(function(res) {
            (res||[]).forEach(function(r) { if (r.user_id) _userIdNameMap[r.user_id] = r.name; });
          }).catch(function(){})
      : Promise.resolve();

    resolveP.then(function() {
      var html = nodes.map(function(n) {
        return _entryRowHtml(n, _userIdNameMap[n.created_by]||'');
      }).join('');
      bd.innerHTML = '<div class="ac-min-entry-list">'+html+'</div>';
      _wireEntryExclude(bd);
    });
  }

  function _entryRowHtml(node, authorName) {
    var excluded = !!_excludedNodeIds[node.node_id];
    return '<div class="ac-min-entry-row'+(excluded?' excluded':'')+'" data-node-id="'+_esc(node.node_id)+'">' +
      '<span class="ac-min-tag-badge" style="'+_tagBadgeStyle(node.tag)+'">'+_esc(node.seq_id||_tagLabel(node.tag))+'</span>' +
      '<span class="ac-min-entry-summary'+(excluded?' struck':'')+'">'+_esc((node.summary||'').slice(0,140))+'</span>' +
      (authorName ? '<span class="ac-min-entry-author">'+_esc(authorName)+'</span>' : '') +
      '<span class="ac-min-entry-time">'+_esc(_fmtTimePart(node.created_at))+'</span>' +
      '<button type="button" class="ac-min-entry-exclude" data-action="toggle-exclude" data-node-id="'+_esc(node.node_id)+'">'+
        (excluded?'Include':'Exclude')+'</button>' +
    '</div>';
  }

  function _wireEntryExclude(bodyEl) {
    bodyEl.addEventListener('click', function(ev) {
      var btn = ev.target.closest('[data-action="toggle-exclude"]'); if (!btn) return;
      var nodeId = btn.dataset.nodeId;
      if (_excludedNodeIds[nodeId]) { delete _excludedNodeIds[nodeId]; }
      else { _excludedNodeIds[nodeId] = true; }
      var row = bodyEl.querySelector('[data-node-id="'+nodeId+'"]');
      if (row) {
        row.classList.toggle('excluded', !!_excludedNodeIds[nodeId]);
        var sum = row.querySelector('.ac-min-entry-summary');
        if (sum) sum.classList.toggle('struck', !!_excludedNodeIds[nodeId]);
        btn.textContent = _excludedNodeIds[nodeId] ? 'Include' : 'Exclude';
      }
    });
  }

  // ── IR47 — Verify discipline + topic columns ──────────────────
  // Run once at init. If columns absent, _dtColsVerified stays false
  // and _buildNodePayload omits those fields from all INSERTs.
  function _verifyDisciplineTopic() {
    return API.get('information_schema/columns?table_name=eq.accord_nodes&column_name=in.(discipline,topic)&select=column_name')
      .then(function(rows) {
        _dtColsVerified = (rows && rows.length === 2);
        if (!_dtColsVerified) {
          console.warn('[AccordMinutes] IR47 finding: discipline/topic cols ' +
            (rows ? rows.length : 0) + '/2 present on accord_nodes. Omitting from INSERTs.');
        } else {
          console.log('[AccordMinutes] IR47: discipline + topic confirmed on accord_nodes.');
        }
      }).catch(function(e) {
        _dtColsVerified = false;
        console.warn('[AccordMinutes] IR47: column check errored — omitting discipline/topic from INSERTs.', e);
      });
  }

  // ── Node INSERT payload builder ───────────────────────────────
  function _buildNodePayload(tag, summary) {
    var me = window.Accord && window.Accord.state && window.Accord.state.me;
    var payload = {
      firm_id:        (me && me.firm_id)                          || null,
      meeting_id:     _meeting.meeting_id,
      agenda_item_id: null,
      thread_id:      null,
      tag:            tag,
      summary:        summary,
      body:           null,
      created_by:     (me && (me.resource_id || me.id))           || null,
    };
    if (_dtColsVerified) {
      payload.discipline = null;
      payload.topic      = null;
    }
    return payload;
  }

  // ── Author resolution helper ─────────────────────────────────
  function _resolveAuthors(nodes, cb) {
    var unknown = [];
    nodes.forEach(function(n) {
      if (n.created_by && !_userIdNameMap[n.created_by]) unknown.push(n.created_by);
    });
    if (!unknown.length) { cb(); return; }
    API.get('resources?user_id=in.('+unknown.join(',')+')'+'&select=user_id,name')
      .then(function(res) {
        (res||[]).forEach(function(r) { if (r.user_id) _userIdNameMap[r.user_id] = r.name; });
        cb();
      }).catch(function() { cb(); });
  }

  // ── Shared node row soft-delete handler ──────────────────────
  // Used by Decisions, Risks, Parking Lot.
  // IR71: DOM fade only after server PATCH confirms.
  // IR73: meeting_id guard included in filter.
  function _softDeleteNode(nodeId, listArray, listEl) {
    API.patch(
      'accord_nodes?node_id=eq.'+nodeId+'&meeting_id=eq.'+_meeting.meeting_id,
      { status: 'deleted' }
    ).then(function() {
      var i = listArray.findIndex(function(n) { return n.node_id === nodeId; });
      if (i > -1) listArray[i].status = 'deleted';
      var row = listEl.querySelector('[data-node-id="'+nodeId+'"]');
      if (row) { row.classList.add('deleted'); }
    }).catch(function(e) {
      console.error('[AccordMinutes] soft-delete failed for', nodeId, e);
    });
  }

  // ── Summary PATCH helper ─────────────────────────────────────
  // IR71: reverts on failure. IR73: meeting_id guard.
  function _patchNodeSummary(nodeId, newText, origText, descEl, listArray) {
    API.patch(
      'accord_nodes?node_id=eq.'+nodeId+'&meeting_id=eq.'+_meeting.meeting_id,
      { summary: newText }
    ).then(function() {
      if (descEl) descEl.dataset.orig = newText;
      var n = listArray.find(function(x) { return x.node_id === nodeId; });
      if (n) n.summary = newText;
    }).catch(function(e) {
      console.error('[AccordMinutes] summary PATCH failed', e);
      if (descEl) descEl.textContent = origText;
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // ── Phase 4 §4.1 — Decisions ─────────────────────────────────
  // ═══════════════════════════════════════════════════════════════

  function _loadDecisions(meetingId) {
    if (!meetingId) return;
    API.get('accord_nodes?meeting_id=eq.'+meetingId+
        '&tag=eq.decision&select=node_id,seq_id,tag,summary,created_by,created_at,status&order=created_at.asc')
      .then(function(rows) {
        _decisions = (rows||[]).filter(function(n) { return n.status !== 'deleted'; });
        _renderDecisions();
        _setCount('decisions', _decisions.length);
      }).catch(function() {
        var body = document.getElementById('ac-min-sb-sec-decisions');
        if (body) body.innerHTML = '<div class="ac-min-sec-body-inner"><div class="ac-min-sec-empty">Could not load decisions.</div></div>';
      });
  }

  function _dcRowHtml(node) {
    var label = _seqLabel('decision', node.seq_id);
    var author = _userIdNameMap[node.created_by] || '';
    var meta = author
      ? _esc(author) + (node.created_at ? ' \u00b7 '+_esc(_fmtTimePart(node.created_at)) : '')
      : (node.created_at ? _esc(_fmtTimePart(node.created_at)) : '');
    return '<div class="ac-min-node-row'+(node.status==='deleted'?' deleted':'')+'" data-node-id="'+_esc(node.node_id)+'">' +
      '<span class="ac-min-node-badge" style="'+_tagBadgeStyle('decision')+'">'+_esc(label)+'</span>' +
      '<span class="ac-min-node-summary" contenteditable="true" data-orig="'+_esc(node.summary||'')+'">'+_esc(node.summary||'')+'</span>' +
      (meta ? '<span class="ac-min-node-meta">'+meta+'</span>' : '') +
      '<button type="button" class="ac-min-node-del" data-action="del-dc" data-node-id="'+_esc(node.node_id)+'">\u00d7</button>' +
    '</div>';
  }

  function _renderDecisions() {
    var body = document.getElementById('ac-min-sb-sec-decisions'); if (!body) return;
    _resolveAuthors(_decisions, function() {
      var listHtml = _decisions.length
        ? _decisions.map(_dcRowHtml).join('')
        : '<div class="ac-min-sec-empty">No decisions recorded.</div>';
      body.innerHTML =
        '<div class="ac-min-sec-body-inner">' +
          '<div class="ac-min-node-list" id="ac-min-dc-list">'+listHtml+'</div>' +
          '<div class="ac-min-node-add-row">' +
            '<input type="text" class="ac-min-node-input" id="ac-min-dc-input" placeholder="Add a decision\u2026" />' +
            '<button type="button" class="ac-min-node-add-btn" id="ac-min-dc-add">+ Add</button>' +
          '</div>' +
        '</div>';
      _wireDecisions(body);
    });
  }

  function _wireDecisions(body) {
    var list = document.getElementById('ac-min-dc-list');

    // Summary contenteditable — blur → PATCH (IR71, IR73)
    body.addEventListener('focusout', function(ev) {
      var desc = ev.target;
      if (!desc.classList.contains('ac-min-node-summary')) return;
      var row = desc.closest('[data-node-id]'); if (!row) return;
      var nodeId  = row.dataset.nodeId;
      var newText = desc.textContent.trim();
      var origText = desc.dataset.orig;
      if (newText === origText) return;
      _patchNodeSummary(nodeId, newText, origText, desc, _decisions);
    });

    // × soft delete
    body.addEventListener('click', function(ev) {
      var btn = ev.target.closest('[data-action="del-dc"]'); if (!btn) return;
      var nodeId = btn.dataset.nodeId;
      _softDeleteNode(nodeId, _decisions, list || body);
    });

    // + Add INSERT
    var inp    = document.getElementById('ac-min-dc-input');
    var addBtn = document.getElementById('ac-min-dc-add');
    if (!inp || !addBtn) return;

    function _commitDc() {
      var text = inp.value.trim(); if (!text) return;
      var payload = _buildNodePayload('decision', text);
      addBtn.disabled = true;
      API.post('accord_nodes', payload)
        .then(function(created) {
          var newNode = Array.isArray(created) ? created[0] : created;
          inp.value = ''; addBtn.disabled = false;
          if (!newNode) return;
          newNode.status = newNode.status || null;
          _decisions.push(newNode);
          if (list) {
            // Remove empty placeholder if present
            var empty = list.querySelector('.ac-min-sec-empty');
            if (empty) list.innerHTML = '';
            // Resolve author then append
            _resolveAuthors([newNode], function() {
              var d = document.createElement('div');
              d.innerHTML = _dcRowHtml(newNode);
              list.appendChild(d.firstChild);
            });
          }
          _setCount('decisions', _decisions.length);
        }).catch(function(e) {
          console.error('[AccordMinutes] decision INSERT failed', e);
          addBtn.disabled = false;
        });
    }

    addBtn.addEventListener('click', _commitDc);
    inp.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); _commitDc(); }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // ── Phase 4 §4.2 — Action Items ──────────────────────────────
  // ═══════════════════════════════════════════════════════════════

  function _loadActions(meetingId) {
    if (!meetingId) return;
    API.get('accord_nodes?meeting_id=eq.'+meetingId+
        '&tag=eq.action&select=node_id,seq_id,tag,summary,body,created_by,created_at,due_date,status&order=created_at.asc')
      .then(function(rows) {
        _actions = (rows||[]).filter(function(n) { return n.status !== 'deleted'; });
        var overdue = _actions.filter(function(a) {
          return _isOverdue(a.due_date) && a.status !== 'closed';
        }).length;
        var countStr = _actions.length + ' assigned' + (overdue > 0 ? ' \u00b7 ' + overdue + ' overdue' : '');
        _renderActions();
        _setCount('actions', countStr);
      }).catch(function() {
        var body = document.getElementById('ac-min-sb-sec-actions');
        if (body) body.innerHTML = '<div class="ac-min-sec-body-inner"><div class="ac-min-sec-empty">Could not load action items.</div></div>';
      });
  }

  function _parseActionBody(bodyStr) {
    if (!bodyStr) return { assignee_name: null, assignee_resource_id: null };
    try { return JSON.parse(bodyStr) || {}; } catch(e) { return {}; }
  }

  function _axRowHtml(node) {
    var label    = _seqLabel('action', node.seq_id);
    var bodyData = _parseActionBody(node.body);
    var owner    = bodyData.assignee_name || 'Unassigned';
    var overdue  = _isOverdue(node.due_date) && node.status !== 'closed';
    var dueStr   = node.due_date ? _fmtShortDate(node.due_date) : '\u2014';
    var dueCls   = node.due_date
      ? (overdue ? 'ac-min-node-due--overdue' : 'ac-min-node-due--future')
      : '';
    var statusCls, statusLabel;
    if (node.status === 'closed') {
      statusCls = 'ac-min-node-status--done'; statusLabel = 'Done';
    } else if (overdue) {
      statusCls = 'ac-min-node-status--overdue'; statusLabel = 'Overdue';
    } else {
      statusCls = 'ac-min-node-status--open'; statusLabel = 'Open';
    }
    return '<div class="ac-min-node-row'+(node.status==='deleted'?' deleted':'')+'" data-node-id="'+_esc(node.node_id)+'" data-action-row="1">' +
      '<span class="ac-min-node-badge" style="'+_tagBadgeStyle('action')+'">'+_esc(label)+'</span>' +
      '<span class="ac-min-node-summary" contenteditable="true" data-orig="'+_esc(node.summary||'')+'">'+_esc(node.summary||'')+'</span>' +
      '<span class="ac-min-node-owner">'+_esc(owner)+'</span>' +
      (node.due_date ? '<span class="ac-min-node-due '+dueCls+'">'+_esc(dueStr)+'</span>' : '') +
      '<span class="ac-min-node-status '+statusCls+'">'+statusLabel+'</span>' +
      '<button type="button" class="ac-min-node-del" data-action="del-ax" data-node-id="'+_esc(node.node_id)+'">\u00d7</button>' +
    '</div>';
  }

  function _renderActions() {
    var body = document.getElementById('ac-min-sb-sec-actions'); if (!body) return;
    _resolveAuthors(_actions, function() {
      var listHtml = _actions.length
        ? _actions.map(_axRowHtml).join('')
        : '<div class="ac-min-sec-empty">No action items recorded.</div>';
      body.innerHTML =
        '<div class="ac-min-sec-body-inner">' +
          '<div class="ac-min-node-list" id="ac-min-ax-list">'+listHtml+'</div>' +
          '<div class="ac-min-node-add-row">' +
            '<input type="text" class="ac-min-node-input" id="ac-min-ax-input" placeholder="Add an action item\u2026" />' +
            '<button type="button" class="ac-min-node-add-btn" id="ac-min-ax-add">+ Add</button>' +
          '</div>' +
        '</div>';
      _wireActions(body);
    });
  }

  function _wireActions(body) {
    var list = document.getElementById('ac-min-ax-list');

    // Summary contenteditable — blur → PATCH (IR71, IR73)
    body.addEventListener('focusout', function(ev) {
      var desc = ev.target;
      if (!desc.classList.contains('ac-min-node-summary')) return;
      var row = desc.closest('[data-action-row]'); if (!row) return;
      var nodeId   = row.dataset.nodeId;
      var newText  = desc.textContent.trim();
      var origText = desc.dataset.orig;
      if (newText === origText) return;
      _patchNodeSummary(nodeId, newText, origText, desc, _actions);
    });

    // × soft delete
    body.addEventListener('click', function(ev) {
      if (ev.target.closest('.ac-min-action-popup')) return; // don't intercept popup clicks
      var delBtn = ev.target.closest('[data-action="del-ax"]'); if (!delBtn) return;
      var nodeId = delBtn.dataset.nodeId;
      _softDeleteNode(nodeId, _actions, list || body);
    });

    // Row click → edit popup (not on badge, not on del, not on summary focus)
    body.addEventListener('click', function(ev) {
      if (ev.target.closest('.ac-min-node-del'))    return;
      if (ev.target.closest('.ac-min-action-popup')) return;
      if (ev.target.closest('[data-action="del-ax"]')) return;
      var row = ev.target.closest('[data-action-row]'); if (!row) return;
      if (ev.target.classList.contains('ac-min-node-summary')) return; // let contenteditable handle
      var nodeId = row.dataset.nodeId;
      _openActionPopup(row, nodeId);
    });

    // + Add INSERT
    var inp    = document.getElementById('ac-min-ax-input');
    var addBtn = document.getElementById('ac-min-ax-add');
    if (!inp || !addBtn) return;

    function _commitAx() {
      var text = inp.value.trim(); if (!text) return;
      var payload = _buildNodePayload('action', text);
      addBtn.disabled = true;
      API.post('accord_nodes', payload)
        .then(function(created) {
          var newNode = Array.isArray(created) ? created[0] : created;
          inp.value = ''; addBtn.disabled = false;
          if (!newNode) return;
          newNode.status = newNode.status || null;
          _actions.push(newNode);
          if (list) {
            var empty = list.querySelector('.ac-min-sec-empty');
            if (empty) list.innerHTML = '';
            var d = document.createElement('div');
            d.innerHTML = _axRowHtml(newNode);
            list.appendChild(d.firstChild);
          }
          // Recount with overdue
          var overdue = _actions.filter(function(a) {
            return _isOverdue(a.due_date) && a.status !== 'closed';
          }).length;
          var countStr = _actions.length + ' assigned' + (overdue > 0 ? ' \u00b7 '+overdue+' overdue' : '');
          _setCount('actions', countStr);
        }).catch(function(e) {
          console.error('[AccordMinutes] action INSERT failed', e);
          addBtn.disabled = false;
        });
    }

    addBtn.addEventListener('click', _commitAx);
    inp.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); _commitAx(); }
    });
  }

  function _openActionPopup(row, nodeId) {
    // Close any existing popup first
    _closeActionPopup();
    _actionPopupNodeId = nodeId;

    var node = _actions.find(function(n) { return n.node_id === nodeId; });
    if (!node) return;
    var bodyData = _parseActionBody(node.body);
    var assigneeName = bodyData.assignee_name || '';
    var assigneeId   = bodyData.assignee_resource_id || '';
    var dueVal   = node.due_date || '';
    var statusVal = (node.status === 'closed') ? 'closed' : 'open';

    var popup = document.createElement('div');
    popup.className = 'ac-min-action-popup';
    popup.id = 'ac-min-ax-popup-'+nodeId;
    popup.innerHTML =
      '<div class="ac-min-action-popup-row">' +
        '<span class="ac-min-action-popup-lbl">Task</span>' +
        '<input type="text" class="ac-min-action-popup-input" id="ac-min-ax-p-sum" value="'+_esc(node.summary||'')+'" />' +
      '</div>' +
      '<div class="ac-min-action-popup-row">' +
        '<span class="ac-min-action-popup-lbl">Assignee</span>' +
        '<input type="text" class="ac-min-action-popup-input" id="ac-min-ax-p-assignee" ' +
          'value="'+_esc(assigneeName)+'" placeholder="Name or leave blank" />' +
      '</div>' +
      '<div class="ac-min-action-popup-row">' +
        '<span class="ac-min-action-popup-lbl">Due date</span>' +
        '<input type="date" class="ac-min-action-popup-input" id="ac-min-ax-p-due" value="'+_esc(dueVal)+'" />' +
      '</div>' +
      '<div class="ac-min-action-popup-row">' +
        '<span class="ac-min-action-popup-lbl">Status</span>' +
        '<select class="ac-min-action-popup-select" id="ac-min-ax-p-status">' +
          '<option value="open"'+(statusVal==='open'?' selected':'')+'>Open</option>' +
          '<option value="closed"'+(statusVal==='closed'?' selected':'')+'>Done</option>' +
        '</select>' +
      '</div>' +
      '<div class="ac-min-action-popup-btns">' +
        '<button type="button" class="ac-min-action-popup-cancel" id="ac-min-ax-p-cancel">Cancel</button>' +
        '<button type="button" class="ac-min-action-popup-confirm" id="ac-min-ax-p-confirm">Save</button>' +
      '</div>';

    // Insert popup directly after the row
    row.parentNode.insertBefore(popup, row.nextSibling);

    document.getElementById('ac-min-ax-p-cancel').addEventListener('click', function() {
      _closeActionPopup();
    });

    document.getElementById('ac-min-ax-p-confirm').addEventListener('click', function() {
      var sumEl      = document.getElementById('ac-min-ax-p-sum');
      var assigneeEl = document.getElementById('ac-min-ax-p-assignee');
      var dueEl      = document.getElementById('ac-min-ax-p-due');
      var statusEl   = document.getElementById('ac-min-ax-p-status');

      var newSummary  = sumEl      ? sumEl.value.trim()      : (node.summary || '');
      var newAssignee = assigneeEl ? assigneeEl.value.trim() : assigneeName;
      var newDue      = dueEl      ? dueEl.value             : dueVal;
      var newStatus   = statusEl   ? statusEl.value          : statusVal;

      var newBody = JSON.stringify({
        assignee_name:        newAssignee || null,
        assignee_resource_id: (newAssignee === assigneeName ? assigneeId : null) || null,
      });

      var patch = {
        summary:  newSummary,
        body:     newBody,
        due_date: newDue || null,
        status:   newStatus === 'closed' ? 'closed' : null,
      };

      // IR71: wait for confirm before DOM update
      // IR73: meeting_id guard in filter
      API.patch(
        'accord_nodes?node_id=eq.'+nodeId+'&meeting_id=eq.'+_meeting.meeting_id,
        patch
      ).then(function() {
        // Update in-memory record
        var n = _actions.find(function(x) { return x.node_id === nodeId; });
        if (n) {
          n.summary  = newSummary;
          n.body     = newBody;
          n.due_date = newDue || null;
          n.status   = newStatus === 'closed' ? 'closed' : null;
        }
        // Re-render the row
        var list = document.getElementById('ac-min-ax-list');
        var oldRow = list ? list.querySelector('[data-node-id="'+nodeId+'"]') : null;
        if (oldRow && n) {
          var tmp = document.createElement('div');
          tmp.innerHTML = _axRowHtml(n);
          oldRow.parentNode.replaceChild(tmp.firstChild, oldRow);
        }
        _closeActionPopup();
        // Update overdue count
        var overdue = _actions.filter(function(a) {
          return _isOverdue(a.due_date) && a.status !== 'closed';
        }).length;
        var countStr = _actions.length + ' assigned' + (overdue > 0 ? ' \u00b7 '+overdue+' overdue' : '');
        _setCount('actions', countStr);
      }).catch(function(e) {
        console.error('[AccordMinutes] action PATCH failed', e);
        _closeActionPopup();
      });
    });
  }

  function _closeActionPopup() {
    if (_actionPopupNodeId) {
      var p = document.getElementById('ac-min-ax-popup-'+_actionPopupNodeId);
      if (p && p.parentNode) p.parentNode.removeChild(p);
      _actionPopupNodeId = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ── Phase 4 §4.3 — Risks & Dissents ──────────────────────────
  // ═══════════════════════════════════════════════════════════════

  function _loadRisks(meetingId) {
    if (!meetingId) return;
    API.get('accord_nodes?meeting_id=eq.'+meetingId+
        '&tag=in.(risk,dissent)&select=node_id,seq_id,tag,summary,body,created_by,created_at,status&order=created_at.asc')
      .then(function(rows) {
        _risks = (rows||[]).filter(function(n) { return n.status !== 'deleted'; });
        _renderRisks();
        _setCount('risks', _risks.length);
      }).catch(function() {
        var body = document.getElementById('ac-min-sb-sec-risks');
        if (body) body.innerHTML = '<div class="ac-min-sec-body-inner"><div class="ac-min-sec-empty">Could not load risks.</div></div>';
      });
  }

  function _parseRiskBody(bodyStr) {
    if (!bodyStr) return {};
    try { return JSON.parse(bodyStr) || {}; } catch(e) { return {}; }
  }

  function _sevChipHtml(severity) {
    if (!severity) return '';
    var cls = severity === 'high' ? 'ac-min-node-sev--high' : 'ac-min-node-sev--' + severity;
    var label = severity.charAt(0).toUpperCase() + severity.slice(1);
    return '<span class="ac-min-node-sev '+cls+'">'+_esc(label)+'</span>';
  }

  function _rkRowHtml(node) {
    var label    = _seqLabel(node.tag, node.seq_id);
    var bodyData = _parseRiskBody(node.body);
    var author   = _userIdNameMap[node.created_by] || '';
    var metaParts = [];
    if (author) metaParts.push(author);
    if (node.created_at) metaParts.push(_fmtTimePart(node.created_at));
    var meta = metaParts.join(' \u00b7 ');
    return '<div class="ac-min-node-row'+(node.status==='deleted'?' deleted':'')+'" data-node-id="'+_esc(node.node_id)+'">' +
      '<span class="ac-min-node-badge" style="'+_tagBadgeStyle(node.tag)+'">'+_esc(label)+'</span>' +
      '<span class="ac-min-node-summary" contenteditable="true" data-orig="'+_esc(node.summary||'')+'">'+_esc(node.summary||'')+'</span>' +
      _sevChipHtml(bodyData.severity) +
      (meta ? '<span class="ac-min-node-meta">'+_esc(meta)+'</span>' : '') +
      '<button type="button" class="ac-min-node-del" data-action="del-rk" data-node-id="'+_esc(node.node_id)+'">\u00d7</button>' +
    '</div>';
  }

  function _renderRisks() {
    var body = document.getElementById('ac-min-sb-sec-risks'); if (!body) return;
    _resolveAuthors(_risks, function() {
      var listHtml = _risks.length
        ? _risks.map(_rkRowHtml).join('')
        : '<div class="ac-min-sec-empty">No risks or dissents recorded.</div>';
      body.innerHTML =
        '<div class="ac-min-sec-body-inner">' +
          '<div class="ac-min-node-list" id="ac-min-rk-list">'+listHtml+'</div>' +
          '<div class="ac-min-node-add-row">' +
            '<input type="text" class="ac-min-node-input" id="ac-min-rk-input" placeholder="Add a risk\u2026" />' +
            '<button type="button" class="ac-min-node-add-btn" id="ac-min-rk-add">+ Add</button>' +
          '</div>' +
        '</div>';
      _wireRisks(body);
    });
  }

  function _wireRisks(body) {
    var list = document.getElementById('ac-min-rk-list');

    // Summary contenteditable — blur → PATCH (IR71, IR73)
    body.addEventListener('focusout', function(ev) {
      var desc = ev.target;
      if (!desc.classList.contains('ac-min-node-summary')) return;
      var row = desc.closest('[data-node-id]'); if (!row) return;
      var nodeId   = row.dataset.nodeId;
      var newText  = desc.textContent.trim();
      var origText = desc.dataset.orig;
      if (newText === origText) return;
      _patchNodeSummary(nodeId, newText, origText, desc, _risks);
    });

    // × soft delete
    body.addEventListener('click', function(ev) {
      var btn = ev.target.closest('[data-action="del-rk"]'); if (!btn) return;
      var nodeId = btn.dataset.nodeId;
      _softDeleteNode(nodeId, _risks, list || body);
    });

    // + Add INSERT (tag='risk')
    var inp    = document.getElementById('ac-min-rk-input');
    var addBtn = document.getElementById('ac-min-rk-add');
    if (!inp || !addBtn) return;

    function _commitRk() {
      var text = inp.value.trim(); if (!text) return;
      var payload = _buildNodePayload('risk', text);
      addBtn.disabled = true;
      API.post('accord_nodes', payload)
        .then(function(created) {
          var newNode = Array.isArray(created) ? created[0] : created;
          inp.value = ''; addBtn.disabled = false;
          if (!newNode) return;
          newNode.status = newNode.status || null;
          _risks.push(newNode);
          if (list) {
            var empty = list.querySelector('.ac-min-sec-empty');
            if (empty) list.innerHTML = '';
            _resolveAuthors([newNode], function() {
              var d = document.createElement('div');
              d.innerHTML = _rkRowHtml(newNode);
              list.appendChild(d.firstChild);
            });
          }
          _setCount('risks', _risks.length);
        }).catch(function(e) {
          console.error('[AccordMinutes] risk INSERT failed', e);
          addBtn.disabled = false;
        });
    }

    addBtn.addEventListener('click', _commitRk);
    inp.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); _commitRk(); }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // ── Phase 4 §4.4 — Parking Lot ───────────────────────────────
  // ═══════════════════════════════════════════════════════════════

  function _loadParking(meetingId) {
    if (!meetingId) return;
    API.get('accord_nodes?meeting_id=eq.'+meetingId+
        '&tag=eq.question&select=node_id,seq_id,tag,summary,created_by,created_at,agenda_item_id,status&order=created_at.asc')
      .then(function(rows) {
        _parking = (rows||[]).filter(function(n) { return n.status !== 'deleted'; });
        _renderParking();
        _setCount('parking', _parking.length);
      }).catch(function() {
        var body = document.getElementById('ac-min-sb-sec-parking');
        if (body) body.innerHTML = '<div class="ac-min-sec-body-inner"><div class="ac-min-sec-empty">Could not load parking lot.</div></div>';
      });
  }

  function _pkRowHtml(node) {
    // Resolve source agenda item title from already-loaded _agendaItems
    var sourceTitle = null;
    if (node.agenda_item_id) {
      var ai = _agendaItems.find(function(a) { return a.agenda_item_id === node.agenda_item_id; });
      if (ai) sourceTitle = ai.title;
    }
    return '<div class="ac-min-node-row'+(node.status==='deleted'?' deleted':'')+'" data-node-id="'+_esc(node.node_id)+'">' +
      '<span class="ac-min-node-dot"></span>' +
      '<span class="ac-min-node-summary" contenteditable="true" data-orig="'+_esc(node.summary||'')+'">'+_esc(node.summary||'')+'</span>' +
      (sourceTitle ? '<span class="ac-min-node-source">\u2192 '+_esc(sourceTitle)+'</span>' : '') +
      '<button type="button" class="ac-min-node-del" data-action="del-pk" data-node-id="'+_esc(node.node_id)+'">\u00d7</button>' +
    '</div>';
  }

  function _renderParking() {
    var body = document.getElementById('ac-min-sb-sec-parking'); if (!body) return;
    var listHtml = _parking.length
      ? _parking.map(_pkRowHtml).join('')
      : '<div class="ac-min-sec-empty">No parking lot items.</div>';
    body.innerHTML =
      '<div class="ac-min-sec-body-inner">' +
        '<div class="ac-min-node-list" id="ac-min-pk-list">'+listHtml+'</div>' +
        '<div class="ac-min-node-add-row">' +
          '<input type="text" class="ac-min-node-input" id="ac-min-pk-input" placeholder="Add to parking lot\u2026" />' +
          '<button type="button" class="ac-min-node-add-btn" id="ac-min-pk-add">+ Add</button>' +
        '</div>' +
      '</div>';
    _wireParking(body);
  }

  function _wireParking(body) {
    var list = document.getElementById('ac-min-pk-list');

    // Summary contenteditable — blur → PATCH (IR71, IR73)
    body.addEventListener('focusout', function(ev) {
      var desc = ev.target;
      if (!desc.classList.contains('ac-min-node-summary')) return;
      var row = desc.closest('[data-node-id]'); if (!row) return;
      var nodeId   = row.dataset.nodeId;
      var newText  = desc.textContent.trim();
      var origText = desc.dataset.orig;
      if (newText === origText) return;
      _patchNodeSummary(nodeId, newText, origText, desc, _parking);
    });

    // × soft delete
    body.addEventListener('click', function(ev) {
      var btn = ev.target.closest('[data-action="del-pk"]'); if (!btn) return;
      var nodeId = btn.dataset.nodeId;
      _softDeleteNode(nodeId, _parking, list || body);
    });

    // + Add INSERT (tag='question')
    var inp    = document.getElementById('ac-min-pk-input');
    var addBtn = document.getElementById('ac-min-pk-add');
    if (!inp || !addBtn) return;

    function _commitPk() {
      var text = inp.value.trim(); if (!text) return;
      var payload = _buildNodePayload('question', text);
      addBtn.disabled = true;
      API.post('accord_nodes', payload)
        .then(function(created) {
          var newNode = Array.isArray(created) ? created[0] : created;
          inp.value = ''; addBtn.disabled = false;
          if (!newNode) return;
          newNode.status = newNode.status || null;
          _parking.push(newNode);
          if (list) {
            var empty = list.querySelector('.ac-min-sec-empty');
            if (empty) list.innerHTML = '';
            var d = document.createElement('div');
            d.innerHTML = _pkRowHtml(newNode);
            list.appendChild(d.firstChild);
          }
          _setCount('parking', _parking.length);
        }).catch(function(e) {
          console.error('[AccordMinutes] parking INSERT failed', e);
          addBtn.disabled = false;
        });
    }

    addBtn.addEventListener('click', _commitPk);
    inp.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); _commitPk(); }
    });
  }

  // ── Level-changed ────────────────────────────────────────────
  function _onLevelChanged() {
    window.removeEventListener('accord:level-changed', _onLevelChanged);
    destroy();
  }

  // ── Teardown ─────────────────────────────────────────────────
  function _teardown() {
    _removeSuppressionStyles();
    _closeActionPopup();
    var host = document.getElementById('ac-meeting-surface-host');
    if (host) host.innerHTML = '';
    _meeting            = null;
    _myResourceId       = null;
    _attendees          = [];
    _externalRecs       = [];
    _checkedItems       = {};
    _attendeeNameMap    = {};
    _userIdNameMap      = {};
    _outcomes           = [];
    _agendaItems        = [];
    _agendaExpanded     = {};
    _agendaNodes        = {};
    _excludedNodeIds    = {};
    _decisions          = [];
    _actions            = [];
    _risks              = [];
    _parking            = [];
    _dtColsVerified     = false;
    _actionPopupNodeId  = null;
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
    _wireCanvasAddBtns();
    _wireNavObserver();
    _wireNavClicks();
    _wireSendBtn();

    // Recipients first — _loadMeetingDetails chains off its promise so attendee
    // maps are guaranteed populated before chips render (no setTimeout sequencing)
    _loadRecipients(meeting.meeting_id)
      .then(function() { _loadMeetingDetails(meeting); })
      .catch(function() { _loadMeetingDetails(meeting); });

    _loadSectionCounts(meeting.meeting_id);
    _loadOutcomes(meeting.meeting_id);
    _loadAgenda(meeting.meeting_id);

    // IR47: verify discipline+topic columns, then load Phase 4 sections.
    // _agendaItems may not be populated yet when Phase 4 sections load —
    // that's acceptable; Parking Lot resolveTitle will find empty array
    // and degrade gracefully (no source label shown). If agenda is needed
    // before parking, chain off _loadAgenda's promise in Phase 5+.
    _verifyDisciplineTopic().then(function() {
      _loadDecisions(meeting.meeting_id);
      _loadActions(meeting.meeting_id);
      _loadRisks(meeting.meeting_id);
      _loadParking(meeting.meeting_id);
    });

    window.removeEventListener('accord:level-changed', _onLevelChanged);
    window.addEventListener('accord:level-changed',    _onLevelChanged);
  }

  function destroy() {
    _teardown();
    window.removeEventListener('accord:level-changed', _onLevelChanged);
  }

  return { render: render, destroy: destroy };

})();