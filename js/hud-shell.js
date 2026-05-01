// ============================================================
// ProjectHUD — hud-shell.js v1.2 (CMD95.5)
// CMD100.25: Tier 2 strip shifted +6px (left:6→width:144) to clear the slide-in edge trigger.
// CMD100.26: Display brightness/contrast tuning popover added to header strip (sun icon).
// CMD100.31: Display popover extended — saturation slider + Compass panel color picker (HEX) + panel transparency.
// CMD100.37: Shell uses min-height instead of fixed height so page scrolls naturally past the viewport.
// CMD100.40: Sidebar nav reordered — Dashboard top + divider; main and admin sections alphabetized.
// CMD100.41: Header avatar populated from sidebar's resolved currentUser (no more "—").
// CMD100.42: Per-module icons + split-color wordmarks; shared scrolling ticker; standardized header across all modules.
// Unified shell: slide-in sidebar (absorbed from sidebar.js v3.1)
//                + unified header bar (logo / ticker / operator-status)
//                + Tier 1 sub-header strip (major-area tabs)
//                + Tier 2 contextual vertical icon strip (sub-views)
// ============================================================
const HUDShell = (() => {

  console.log('%c[hud-shell.js] ' + (window._PROJECTHUD_VERSION || '(version constant not set)'),
    'background:#EF9F27;color:#1a1a1a;font-weight:700;padding:2px 8px;border-radius:3px');

  // ── Page → module-name derivation (used by Sidebar shim) ─────
  const PAGE_TO_MODULE = {
    'compass':    'Compass',
    'cadence':    'Cadence',
    'pipeline':   'Pipeline',
    'dashboard':  'Dashboard',
    'aegis':      'Aegis',
    'resources':  'Resources',
    'requests':         'Requests',
    'resource-requests':'Requests',
    'users':            'User Mgmt',
    'users.html':       'User Mgmt',
    'dashboard.html':   'Dashboard',
  };

  function _deriveModuleName(page) {
    if (!page) return '';
    const key = String(page).toLowerCase();
    if (PAGE_TO_MODULE[key]) return PAGE_TO_MODULE[key];
    const stripped = key.replace(/\.html$/, '');
    if (PAGE_TO_MODULE[stripped]) return PAGE_TO_MODULE[stripped];
    return stripped.charAt(0).toUpperCase() + stripped.slice(1);
  }

  // ── Module wordmark icons (header) — CMD100.42 ──────────────
  // Each module (except Dashboard, which keeps the universal ProjectHUD
  // triangle) has a 90×90 SVG glyph that renders to the left of the
  // module name in the header.
  const MODULE_ICONS = {
    'Compass': `<svg viewBox="-30 -30 60 60" xmlns="http://www.w3.org/2000/svg"><circle r="28" fill="none" stroke="#00D2FF" stroke-width="1" opacity=".2"/><circle r="22" fill="none" stroke="#00D2FF" stroke-width="1" opacity=".38"/><circle r="15" fill="#0c1628"/><circle r="15" fill="none" stroke="#00D2FF" stroke-width="1.2"/><line x1="0" y1="-12" x2="0" y2="-15" stroke="#00D2FF" stroke-width="1.8" opacity=".9"/><line x1="0" y1="12" x2="0" y2="15" stroke="#00D2FF" stroke-width="1.8" opacity=".9"/><line x1="-12" y1="0" x2="-15" y2="0" stroke="#00D2FF" stroke-width="1.8" opacity=".9"/><line x1="12" y1="0" x2="15" y2="0" stroke="#00D2FF" stroke-width="1.8" opacity=".9"/><line x1="8" y1="-8" x2="10" y2="-10" stroke="#00D2FF" stroke-width="1.2" opacity=".6"/><line x1="-8" y1="-8" x2="-10" y2="-10" stroke="#00D2FF" stroke-width="1.2" opacity=".6"/><line x1="8" y1="8" x2="10" y2="10" stroke="#00D2FF" stroke-width="1.2" opacity=".6"/><line x1="-8" y1="8" x2="-10" y2="10" stroke="#00D2FF" stroke-width="1.2" opacity=".6"/><path d="M0,-13 L2.5,-3 L0,-1.5 L-2.5,-3Z" fill="#00D2FF"/><path d="M0,-10 L1.4,-6.5 L0,-5.8 L-1.4,-6.5Z" fill="#EF9F27"/><path d="M0,10 L2,2 L0,1 L-2,2Z" fill="#00D2FF" opacity=".5"/><circle r="1.8" fill="#00D2FF"/></svg>`,
    'Cadence': `<svg viewBox="0 0 90 90" xmlns="http://www.w3.org/2000/svg"><circle cx="45" cy="45" r="42" fill="#080e1c" stroke="#1a3050" stroke-width="1.5"/><circle cx="45" cy="45" r="32" fill="none" stroke="#1a3050" stroke-width="0.8" opacity="0.5"/><polygon points="45,20 64,32 64,58 45,70 26,58 26,32" fill="#0e1e38" stroke="#2a4a70" stroke-width="1.2"/><circle cx="45" cy="20" r="2.5" fill="#2a4a70"/><circle cx="64" cy="32" r="2.5" fill="#2a4a70"/><circle cx="64" cy="58" r="2.5" fill="#2a4a70"/><circle cx="45" cy="70" r="2.5" fill="#2a4a70"/><circle cx="26" cy="58" r="2.5" fill="#2a4a70"/><circle cx="26" cy="32" r="2.5" fill="#2a4a70"/><path d="M 45 20 L 64 32 L 64 58" fill="none" stroke="#00c9c9" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="64" cy="58" r="4" fill="#00c9c9"/><circle cx="45" cy="45" r="3" fill="#4d9fff"/><circle cx="45" cy="45" r="6" fill="none" stroke="#4d9fff" stroke-width="0.8" opacity="0.5"/></svg>`,
    'Pipeline': `<svg viewBox="0 0 90 90" xmlns="http://www.w3.org/2000/svg"><circle cx="45" cy="45" r="42" fill="#080e1c" stroke="#1a3050" stroke-width="1.5"/><circle cx="45" cy="45" r="32" fill="none" stroke="#1a3050" stroke-width="0.8" opacity="0.5"/><path d="M 22 22 L 68 22 L 56 44 L 56 64 L 34 64 L 34 44 Z" fill="none" stroke="#2a4a70" stroke-width="1.2" stroke-linejoin="round"/><path d="M 22 22 L 68 22 L 60 36 L 30 36 Z" fill="#0e1e38" stroke="#4d9fff" stroke-width="1" stroke-linejoin="round" opacity="0.85"/><path d="M 30 36 L 60 36 L 56 50 L 34 50 Z" fill="#0e1e38" stroke="#4d9fff" stroke-width="1" stroke-linejoin="round" opacity="0.65"/><path d="M 34 50 L 56 50 L 56 64 L 34 64 Z" fill="#0e1e38" stroke="#00c9c9" stroke-width="1.5" stroke-linejoin="round"/><circle cx="45" cy="64" r="3" fill="#00c9c9"/><line x1="22" y1="22" x2="68" y2="22" stroke="#00c9c9" stroke-width="2.5" stroke-linecap="round"/><circle cx="68" cy="22" r="4" fill="#00c9c9"/></svg>`,
    'Aegis': `<svg viewBox="0 0 90 90" xmlns="http://www.w3.org/2000/svg"><circle cx="45" cy="45" r="42" fill="#080e1c" stroke="#1a3050" stroke-width="1.5"/><circle cx="45" cy="45" r="32" fill="none" stroke="#1a3050" stroke-width="0.8" opacity="0.5"/><polygon points="45,18 58,62 45,54 32,62" fill="#0e1e38" stroke="#2a4a70" stroke-width="1"/><line x1="45" y1="18" x2="45" y2="54" stroke="#4d9fff" stroke-width="1.5" opacity="0.5"/><line x1="32" y1="62" x2="58" y2="62" stroke="#4d9fff" stroke-width="2" opacity="0.6"/><path d="M 72 20 A 36 36 0 0 1 81 45 A 36 36 0 0 1 45 81" fill="none" stroke="#00c9c9" stroke-width="4" stroke-linecap="round"/><circle cx="72" cy="20" r="4" fill="#00c9c9"/></svg>`,
    'Requests': `<svg viewBox="0 0 90 90" xmlns="http://www.w3.org/2000/svg"><circle cx="45" cy="45" r="42" fill="#080e1c" stroke="#1a3050" stroke-width="1.5"/><circle cx="45" cy="45" r="32" fill="none" stroke="#1a3050" stroke-width="0.8" opacity="0.5"/><path d="M 22 26 Q 22 22 26 22 L 56 22 Q 60 22 60 26 L 60 42 Q 60 46 56 46 L 38 46 L 30 54 L 30 46 L 26 46 Q 22 46 22 42 Z" fill="#0e1e38" stroke="#2a4a70" stroke-width="1.2" stroke-linejoin="round"/><path d="M 30 50 Q 30 46 34 46 L 64 46 Q 68 46 68 50 L 68 64 Q 68 68 64 68 L 56 68 L 50 74 L 50 68 L 34 68 Q 30 68 30 64 Z" fill="#0e1e38" stroke="#4d9fff" stroke-width="1.2" stroke-linejoin="round"/><line x1="36" y1="32" x2="50" y2="32" stroke="#4d9fff" stroke-width="0.8" opacity="0.5"/><line x1="36" y1="36" x2="46" y2="36" stroke="#4d9fff" stroke-width="0.8" opacity="0.5"/><line x1="38" y1="56" x2="58" y2="56" stroke="#00c9c9" stroke-width="0.8" opacity="0.7"/><line x1="38" y1="60" x2="56" y2="60" stroke="#00c9c9" stroke-width="0.8" opacity="0.7"/><line x1="22" y1="26" x2="60" y2="26" stroke="#00c9c9" stroke-width="2.5" stroke-linecap="round"/><circle cx="60" cy="26" r="4" fill="#00c9c9"/></svg>`,
    'Resources': `<svg viewBox="0 0 90 90" xmlns="http://www.w3.org/2000/svg"><circle cx="45" cy="45" r="42" fill="#080e1c" stroke="#1a3050" stroke-width="1.5"/><circle cx="45" cy="45" r="32" fill="none" stroke="#1a3050" stroke-width="0.8" opacity="0.5"/><circle cx="29" cy="36" r="6" fill="#0e1e38" stroke="#2a4a70" stroke-width="1.2"/><path d="M 19 56 Q 19 48 29 48 Q 39 48 39 56 L 39 60 L 19 60 Z" fill="#0e1e38" stroke="#2a4a70" stroke-width="1.2"/><circle cx="61" cy="36" r="6" fill="#0e1e38" stroke="#2a4a70" stroke-width="1.2"/><path d="M 51 56 Q 51 48 61 48 Q 71 48 71 56 L 71 60 L 51 60 Z" fill="#0e1e38" stroke="#2a4a70" stroke-width="1.2"/><circle cx="45" cy="30" r="7" fill="#0e1e38" stroke="#4d9fff" stroke-width="1.5"/><path d="M 33 56 Q 33 44 45 44 Q 57 44 57 56 L 57 64 L 33 64 Z" fill="#0e1e38" stroke="#4d9fff" stroke-width="1.5"/><circle cx="68" cy="22" r="4" fill="#00c9c9"/></svg>`,
    'User Mgmt': `<svg viewBox="0 0 90 90" xmlns="http://www.w3.org/2000/svg"><circle cx="45" cy="45" r="42" fill="#080e1c" stroke="#1a3050" stroke-width="1.5"/><circle cx="45" cy="45" r="32" fill="none" stroke="#1a3050" stroke-width="0.8" opacity="0.5"/><polygon points="45,14 70,28 70,56 45,70 20,56 20,28" fill="#0e1e38" stroke="#00c9c9" stroke-width="1.5" stroke-linejoin="round"/><polygon points="45,20 64,30 64,52 45,62 26,52 26,30" fill="none" stroke="#4d9fff" stroke-width="0.6" opacity="0.4" stroke-linejoin="round"/><polygon points="45,26 58,33 58,49 45,56 32,49 32,33" fill="none" stroke="#4d9fff" stroke-width="0.6" opacity="0.4" stroke-linejoin="round"/><circle cx="45" cy="36" r="6.5" fill="#0e1e38" stroke="#4d9fff" stroke-width="1.5"/><path d="M 33 56 Q 33 46 45 46 Q 57 46 57 56 L 57 58 L 33 58 Z" fill="#0e1e38" stroke="#4d9fff" stroke-width="1.5" stroke-linejoin="round"/><line x1="42" y1="34" x2="44" y2="36" stroke="#00c9c9" stroke-width="1" opacity="0.7"/><line x1="48" y1="34" x2="46" y2="36" stroke="#00c9c9" stroke-width="1" opacity="0.7"/><path d="M 41 40 Q 45 42 49 40" fill="none" stroke="#00c9c9" stroke-width="1" stroke-linecap="round"/><circle cx="20" cy="28" r="2.5" fill="#4d9fff" opacity="0.65"/><circle cx="70" cy="28" r="3.5" fill="#00c9c9"/><circle cx="20" cy="56" r="2.5" fill="#4d9fff" opacity="0.65"/><circle cx="70" cy="56" r="2.5" fill="#4d9fff" opacity="0.65"/></svg>`
  };

  // ── Module wordmark split-color rules ───────────────────────
  // Each entry: [white prefix, aqua suffix]. The aqua portion uses #00D2FF.
  const WORDMARK_SPLITS = {
    'Compass':   ['Com',  'pass'],
    'Cadence':   ['Cad',  'ence'],
    'Pipeline':  ['Pipe', 'line'],
    'Aegis':     ['Ae',   'gis'],
    'Requests':  ['Re',   'quests'],
    'Resources': ['Res',  'ources'],
    'User Mgmt': ['User ','Mgmt'],
    'Dashboard': ['Dash', 'board']
  };

  // ── Header ticker content (shared across all modules) ───────
  // Currently static; future: feed from a live event stream.
  const TICKER_ITEMS = [
    {dot:'#1D9E75', who:'VS', verb:'approved',         tail:"Expense Report \u00b7 step 2 \u00b7 2m ago"},
    {dot:'#00c9c9', who:'Cadence', verb:'cert issued', tail:"Expense Report v1.2 \u00b7 6/6 paths \u00b7 22m ago"},
    {dot:'#EF9F27', who:'AK', verb:'pending approval', tail:"NovaBio QMS \u00b7 step 3 \u00b7 34m ago"},
    {dot:'#E24B4A', who:'instance blocked', verb:'Finance unassigned', tail:"Design Review \u00b7 1h ago"},
    {dot:'#1D9E75', who:'DN', verb:'completed',        tail:"Flexscope \u00b7 PCB fabrication \u00b7 1h ago"},
    {dot:'#00c9c9', who:'Cadence', verb:'suite run',   tail:"359 runs \u00b7 87% pass rate \u00b7 2h ago"},
    {dot:'#EF9F27', who:'RC', verb:'updated quote',    tail:"Endoscopic Platform \u00b7 In Progress \u00b7 2h ago"}
  ];

  // ── SVG icons (sidebar) ─────────────────────────────────────
  const ICONS = {
    projects: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="7" width="9" height="13" rx="1.2"/><rect x="13" y="3" width="9" height="17" rx="1.2"/><path d="M5 7V5a2 2 0 012-2h3"/></svg>`,
    meetings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>`,
    documents: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>`,
    risks: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    stakeholders: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="7" r="3"/><path d="M2 21c0-4 2.7-7 6-7"/><circle cx="17" cy="8" r="2.5"/><path d="M13 21c0-3.5 1.8-6 4-6s4 2.5 4 6"/></svg>`,
    actions: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 5H7a2 2 0 00-2 2v13a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/><path d="M15 19l-1.5-1.5 1-3.5 3-3 2 2-3 3z" stroke="#ffaa00" fill="none"/><line x1="17" y1="13.5" x2="18.5" y2="15" stroke="#ffaa00"/></svg>`,
    usermgmt: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`,
    auditlog: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><line x1="8" y1="9" x2="10" y2="9"/></svg>`,
    videolibrary: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="4" width="20" height="16" rx="2"/><polygon points="10,8 16,12 10,16" fill="currentColor" stroke="none"/></svg>`,
    pipeline:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="5" width="4" height="14" rx="1"/><rect x="8" y="8" width="4" height="11" rx="1"/><rect x="14" y="3" width="4" height="16" rx="1"/><rect x="20" y="10" width="2" height="9" rx="1"/></svg>`,
    cadence:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`,
    compass:      `<svg viewBox="-14 -14 28 28" fill="none"><circle r="12" stroke="currentColor" stroke-width="2"/><line x1="0" y1="-7" x2="0" y2="-12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><line x1="0" y1="7" x2="0" y2="12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><line x1="-7" y1="0" x2="-12" y2="0" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><line x1="7" y1="0" x2="12" y2="0" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M0,-10 L2.5,-2 L0,-1 L-2.5,-2Z" fill="currentColor"/><path d="M0,-10 L1.4,-6.5 L0,-5.8 L-1.4,-6.5Z" fill="#EF9F27"/><path d="M0,10 L2,2 L0,1 L-2,2Z" fill="currentColor" opacity=".5"/><circle r="1.8" fill="currentColor"/></svg>`,
    aegis:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2L3 6.5V12c0 5 3.5 9.2 9 10 5.5-.8 9-5 9-10V6.5L12 2z"/><path d="M9 12l2 2 4-4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    bell:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>`,
    display:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/><line x1="4.93" y1="4.93" x2="7.05" y2="7.05"/><line x1="16.95" y1="16.95" x2="19.07" y2="19.07"/><line x1="4.93" y1="19.07" x2="7.05" y2="16.95"/><line x1="16.95" y1="7.05" x2="19.07" y2="4.93"/></svg>`,
  };

  const TOOLBAR_ITEMS = [
    { key: 'aegis',       label: 'Aegis — Command Surface', href: '/aegis.html', target: '_blank' },
    null,
    { key: 'compass',      label: 'Compass',      href: '/compass.html' },
    { key: 'pipeline',     label: 'Pipeline',     href: '/pipeline.html' },
    { key: 'cadence',      label: 'CadenceHUD',   href: '/cadence.html' },
    { key: 'projects',     label: 'Projects',     href: '/projects.html' },
    { key: 'meetings',     label: 'Meetings',     href: '/meetings.html' },
    { key: 'documents',    label: 'Documents',    href: '/documents.html' },
    { key: 'risks',        label: 'Risk Register',href: '/risks.html' },
    { key: 'stakeholders', label: 'Stakeholders', href: '/stakeholders.html' },
    { key: 'actions',      label: 'Action Items', href: '/action-items.html' },
    null,
    { key: 'usermgmt',     label: 'User Mgmt',   href: '/users.html' },
    { key: 'auditlog',     label: 'Audit Log',   href: '/audit-log.html' },
    null,
    { key: 'videolibrary', label: 'Video Library',href: '/video-library.html' },
  ];

  // ── Inject sidebar styles (preserved from sidebar.js v3.1) ───
  function injectSidebarStyles() {
    if (document.getElementById('sidebar-v3-styles')) return;
    const s = document.createElement('style');
    s.id = 'sidebar-v3-styles';
    s.textContent = `
      #sidebar {
        display: flex !important;
        flex-direction: column !important;
        height: calc(100vh - 32px) !important;
        max-height: calc(100vh - 32px) !important;
        overflow: hidden !important;
        box-sizing: border-box !important;
      }
      .sidebar-logo { flex-shrink: 0; }
      #sidebar-body {
        display: flex; flex-direction: row;
        flex: 1 1 0; min-height: 0; overflow: hidden;
      }
      #sidebar-nav {
        flex: 1 1 0; min-width: 0; min-height: 0;
        overflow-y: auto; overflow-x: hidden;
        display: flex; flex-direction: column;
      }
      #sidebar-nav .nav-item {
        font-size: 11px; padding: 9px 10px 9px 12px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      #sidebar-nav .nav-section-label { font-size:11px; padding:8px 12px 4px; }
      #sidebar-nav .nav-divider { height:1px; background:rgba(0,210,255,.18); margin:6px 12px 8px; }
      .sidebar-operator {
        flex-shrink: 0 !important;
        overflow-y: auto !important; overflow-x: hidden !important;
      }
      #ctx-toolbar {
        width: 56px; flex-shrink: 0;
        background: rgba(0,0,0,0.15);
        border-left: 1px solid rgba(0,210,255,0.08);
        display: flex; flex-direction: column;
        align-items: center; padding: 6px 0; gap: 2px;
        overflow-y: auto; overflow-x: hidden;
      }
      .ctx-sep { width:32px; height:1px; background:rgba(0,210,255,0.12); margin:4px 0; flex-shrink:0; }
      .ctx-btn {
        position: relative; width:48px; height:48px;
        display:flex; align-items:center; justify-content:center;
        background:none; border:none; border-radius:5px;
        color:rgba(160,200,235,0.38); cursor:pointer;
        transition:background 0.15s, color 0.15s; flex-shrink:0;
        text-decoration:none; border-left:2px solid transparent;
      }
      .ctx-btn:hover { background:rgba(0,210,255,0.08); color:#00d2ff; }
      .ctx-btn.active { background:rgba(0,210,255,0.10); color:#00d2ff; border-left-color:#00d2ff; }
      .ctx-btn svg { width:22px; height:22px; pointer-events:none; flex-shrink:0; }
      .ctx-btn::after {
        content: attr(data-label);
        position: fixed; left: 224px;
        background:#0a1525; border:1px solid rgba(0,210,255,0.28);
        color:#00d2ff; font-family:'Barlow Condensed',sans-serif;
        font-size:11px; font-weight:600; letter-spacing:0.12em;
        text-transform:uppercase; white-space:nowrap; padding:5px 12px;
        pointer-events:none; opacity:0; transition:opacity 0.12s;
        z-index:9999; box-shadow:0 4px 14px rgba(0,0,0,0.5);
      }
      .ctx-btn:hover::after { opacity:1; }
      .ctx-btn[href="/aegis.html"] { color:rgba(0,201,201,0.55); }
      .ctx-btn[href="/aegis.html"]:hover { color:#00c9c9; background:rgba(0,201,201,0.1); }
    `;
    document.head.appendChild(s);
  }

  // ── Inject unified header styles ─────────────────────────────
  function injectHeaderStyles() {
    if (document.getElementById('hud-header-styles')) return;
    const s = document.createElement('style');
    s.id = 'hud-header-styles';
    s.textContent = `
      #hud-header {
        position: fixed; top: 0; left: 0; right: 0;
        height: 48px; z-index: 500;
        display: flex; align-items: stretch;
        background: rgba(8,13,24,0.92);
        border-bottom: 1px solid rgba(0,210,255,0.18);
        backdrop-filter: blur(6px);
        font-family: 'Rajdhani','Inter',sans-serif;
      }
      /* When unified header renders, shift the first/main shell child below it.
         Targets common root patterns without padding the body itself (which
         breaks 100vh layouts on surfaces that use overflow:hidden).
         CMD100.37: min-height instead of fixed height so content longer than
         the viewport extends the shell and the page scrolls naturally. */
      body.hud-header-rendered .hud-shell,
      body.hud-header-rendered #compass-app,
      body.hud-header-rendered #app {
        min-height: calc(100vh - 48px) !important;
        margin-top: 48px;
      }
      #hud-header-left {
        display: flex; align-items: center; gap: 10px;
        padding: 0 16px;
        border-right: 1px solid rgba(0,210,255,0.10);
        flex-shrink: 0;
      }
      #hud-header-left .hud-logo {
        width: 40px; height: 40px; flex-shrink: 0;
        color: #00d2ff;
      }
      #hud-header-left .hud-logo svg { width:100%; height:100%; display:block; }
      #hud-header-left .hud-module-name {
        font-size: 16px; font-weight: 700;
        letter-spacing: 0.08em; text-transform: uppercase;
        color: #e8f4ff;
        font-family: 'Inter', system-ui, sans-serif;
        white-space: nowrap;
      }
      #hud-header-left .hud-module-name .wm-aqua { color: #00D2FF; }
      #hud-header-ticker {
        flex: 1 1 auto; min-width: 0;
        display: flex; align-items: center;
        padding: 0;
        border-right: 1px solid rgba(0,210,255,0.10);
        background: rgba(0,210,255,0.02);
        overflow: hidden;
        position: relative;
      }
      #hud-header-ticker .hud-ticker-track {
        display: flex; align-items: center; white-space: nowrap;
        animation: hud-ticker-slide 60s linear infinite;
        padding-left: 100%;
      }
      #hud-header-ticker:hover .hud-ticker-track { animation-play-state: paused; }
      @keyframes hud-ticker-slide {
        from { transform: translateX(0); }
        to   { transform: translateX(-50%); }
      }
      #hud-header-ticker .ti {
        display: inline-flex; align-items: center; gap: 6px;
        font-family: 'Inter', system-ui, sans-serif;
        font-size: 11px; color: #a8c5e0;
        margin-right: 28px;
      }
      #hud-header-ticker .ti .td {
        width: 6px; height: 6px; border-radius: 50%;
        flex-shrink: 0;
      }
      #hud-header-ticker .ti .tw { color: #e8f4ff; font-weight: 600; }
      #hud-header-ticker .ti .ta { color: #00D2FF; }
      #hud-header-ticker:empty::before {
        content: ''; display: block; width: 100%; height: 1px;
      }
      #hud-header-status {
        display: flex; align-items: center; gap: 14px;
        padding: 0 14px; flex-shrink: 0;
      }
      #hud-status-live {
        display: flex; align-items: center; gap: 6px;
        font-family: 'Inter', system-ui, sans-serif;
        font-size: 11px; font-weight: 600;
        color: #00e5a0;
        letter-spacing: 0.12em;
      }
      #hud-status-live .live-dot {
        width: 7px; height: 7px; border-radius: 50%;
        background: #00e5a0; box-shadow: 0 0 6px #00e5a0;
        animation: hud-live-pulse 2s infinite;
      }
      @keyframes hud-live-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.35; }
      }
      #hud-status-datetime {
        font-family: 'Inter', system-ui, sans-serif;
        font-size: 11px; font-weight: 500;
        color: #a8c5e0;
        letter-spacing: 0.06em; white-space: nowrap;
        font-feature-settings: "tnum";
      }
      #hud-status-bell {
        position: relative;
        background: rgba(6,10,16,0.6);
        border: 1px solid rgba(0,210,255,0.20);
        border-radius: 4px;
        color: rgba(160,200,235,0.6);
        width: 32px; height: 32px;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; padding: 0;
        transition: color .15s, border-color .15s, background .15s;
      }
      #hud-status-bell svg { width: 16px; height: 16px; }
      #hud-status-bell:hover { color:#00d2ff; border-color:rgba(0,210,255,.45); background:rgba(0,210,255,.08); }
      #hud-status-bell.has-unread { color:#00d2ff; border-color:rgba(0,210,255,.4); }
      #hud-display-btn {
        position: relative;
        background: rgba(6,10,16,0.6);
        border: 1px solid rgba(0,210,255,0.20);
        border-radius: 4px;
        color: rgba(160,200,235,0.6);
        width: 32px; height: 32px;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; padding: 0;
        transition: color .15s, border-color .15s, background .15s;
      }
      #hud-display-btn svg { width: 16px; height: 16px; }
      #hud-display-btn:hover, #hud-display-btn.active { color:#EF9F27; border-color:rgba(239,159,39,.45); background:rgba(239,159,39,.08); }
      #hud-display-popover {
        position: fixed; top: 50px; right: 12px;
        width: 260px;
        background: #0c1628;
        border: 1px solid rgba(0,210,255,0.25);
        border-radius: 6px;
        box-shadow: 0 6px 24px rgba(0,0,0,.6);
        padding: 14px;
        z-index: 700;
        font-family: 'Inter', system-ui, sans-serif;
        display: none;
        max-height: calc(100vh - 70px); overflow-y: auto;
      }
      #hud-display-popover.open { display: block; }
      #hud-display-popover .dp-section-label { font-size:10px; color:rgba(0,210,255,.55); letter-spacing:.12em; text-transform:uppercase; margin-bottom:8px; padding-bottom:4px; border-bottom:1px solid rgba(0,210,255,.12); }
      #hud-display-popover .row { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; }
      #hud-display-popover .row label { font-size:11px; color:rgba(160,200,235,0.85); letter-spacing:.04em; text-transform:uppercase; }
      #hud-display-popover .row .val { font-size:11px; color:#EF9F27; font-feature-settings:"tnum"; min-width:36px; text-align:right; }
      #hud-display-popover input[type=range] { width:100%; margin: 0 0 12px; accent-color:#EF9F27; }
      #hud-display-popover .actions { display:flex; gap:6px; margin-top:4px; }
      #hud-display-popover button.dp-btn {
        flex:1; background: rgba(6,10,16,0.6);
        border: 1px solid rgba(0,210,255,0.25);
        color: rgba(160,200,235,0.85);
        font-family: 'Inter', system-ui, sans-serif;
        font-size: 11px; padding:6px 0; border-radius:3px; cursor:pointer;
        transition: color .12s, border-color .12s, background .12s;
      }
      #hud-display-popover button.dp-btn:hover { color:#00d2ff; border-color:rgba(0,210,255,.5); background:rgba(0,210,255,.08); }
      #hud-status-bell-badge {
        position: absolute; top: -5px; right: -5px;
        background: #E24B4A; color: #fff;
        font-family: 'Inter', system-ui, sans-serif;
        font-size: 11px; font-weight: 700;
        min-width: 16px; height: 16px; border-radius: 8px;
        display: flex; align-items: center; justify-content: center;
        padding: 0 3px; pointer-events: none;
        font-feature-settings: "tnum";
      }
      #hud-status-avatar {
        width: 32px; height: 32px; border-radius: 50%;
        background: rgba(0,210,255,0.15);
        border: 1px solid rgba(0,210,255,0.3);
        display: flex; align-items: center; justify-content: center;
        font-family: 'Inter', system-ui, sans-serif;
        font-size: 13px; font-weight: 600;
        color: #00d2ff;
        cursor: default;
      }
      /* Slide-in trigger sits below the unified header */
      body.hud-header-rendered #hud-sidebar-trigger { top: 48px; }
      body.hud-header-rendered #hud-sidebar-panel { top: 48px; }

      /* ── Tier 1 sub-header (major-area tabs) ─────────────────── */
      #hud-tier1 {
        position: fixed; left: 0; right: 0; top: 48px;
        height: 42px; z-index: 499;
        display: flex; align-items: stretch;
        background: rgba(10,16,28,0.95);
        border-bottom: 1px solid rgba(0,210,255,0.12);
        padding: 0 14px;
        font-family: 'Barlow Condensed','Rajdhani',sans-serif;
      }
      .hud-tier1-tab {
        display: flex; align-items: center; gap: 7px;
        padding: 0 16px; height: 42px;
        background: none; border: none;
        border-bottom: 2px solid transparent;
        color: #7a9bbf;
        font-family: 'Barlow Condensed','Rajdhani',sans-serif;
        font-size: 13px; font-weight: 600;
        letter-spacing: 0.10em; text-transform: uppercase;
        cursor: pointer; white-space: nowrap;
        transition: color .12s, background .12s, border-color .12s;
      }
      .hud-tier1-tab:hover { color: #e8f4ff; background: rgba(255,255,255,0.03); }
      .hud-tier1-tab.active { color: #00d2ff; border-bottom-color: #00d2ff; }
      .hud-tier1-tab .tab-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: currentColor; opacity: 0.5;
      }
      .hud-tier1-tab.active .tab-dot { opacity: 1; }

      /* When Tier 1 renders, push slide-in + content area down further */
      body.hud-tier1-rendered #hud-sidebar-trigger { top: 90px; }
      body.hud-tier1-rendered #hud-sidebar-panel { top: 90px; }
      body.hud-tier1-rendered.hud-header-rendered .hud-shell,
      body.hud-tier1-rendered.hud-header-rendered #compass-app,
      body.hud-tier1-rendered.hud-header-rendered #app {
        height: calc(100vh - 90px) !important;
        margin-top: 90px;
      }

      /* ── Tier 2 contextual vertical strip (CMD95.5: icon+label rows) ── */
      #hud-tier2 {
        position: fixed; left: 6px; top: 90px; bottom: 0;
        width: 144px; z-index: 498;
        background: rgba(8,13,24,0.96);
        border-right: 1px solid rgba(0,210,255,0.12);
        display: flex; flex-direction: column;
        align-items: stretch; padding: 8px 0; gap: 1px;
        overflow-y: auto; overflow-x: hidden;
      }
      .hud-tier2-btn {
        position: relative;
        display: flex; align-items: center; gap: 10px;
        width: 100%; height: 40px;
        padding: 0 12px;
        background: none; border: none; border-radius: 0;
        color: rgba(160,200,235,0.55); cursor: pointer;
        transition: background 0.12s, color 0.12s, border-color 0.12s;
        flex-shrink: 0;
        border-left: 2px solid transparent;
        font-family: 'Barlow Condensed','Rajdhani',sans-serif;
        font-size: 12px; font-weight: 600;
        letter-spacing: 0.08em; text-transform: uppercase;
        text-align: left;
      }
      .hud-tier2-btn:hover { background: rgba(0,210,255,0.06); color: #e8f4ff; }
      .hud-tier2-btn.active {
        background: rgba(0,210,255,0.10); color: #00d2ff;
        border-left-color: #00d2ff;
      }
      .hud-tier2-btn .tier2-glyph {
        font-size: 18px; line-height: 1; width: 22px;
        flex-shrink: 0; text-align: center; pointer-events: none;
      }
      .hud-tier2-btn .tier2-label {
        flex: 1; min-width: 0;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        pointer-events: none;
      }

      /* When Tier 2 renders, indent main content from the left */
      body.hud-tier2-rendered .hud-shell,
      body.hud-tier2-rendered #compass-app,
      body.hud-tier2-rendered #app {
        margin-left: 150px;
        width: calc(100% - 150px);
      }
      /* Slide-in trigger stays at app-window left edge regardless of Tier 2;
         CMD100 — relocating to left:170px placed the trigger on the RIGHT
         edge of the persistent Tier 2 strip, causing the panel to slide in
         when the cursor crossed the toolbar boundary instead of the window edge. */
      body.hud-tier2-rendered #hud-sidebar-trigger { left: 0; }
      /* Slide-in panel sits above Tier 2 strip when open */
      body.hud-tier2-rendered #hud-sidebar-panel { z-index: 600; }
    `;
    document.head.appendChild(s);
  }

  // ── Sidebar: build right icon toolbar ────────────────────────
  function buildToolbar(currentPage) {
    const bar = document.createElement('div');
    bar.id = 'ctx-toolbar';
    TOOLBAR_ITEMS.forEach(item => {
      if (item === null) {
        const sep = document.createElement('div'); sep.className = 'ctx-sep'; bar.appendChild(sep); return;
      }
      const btn = document.createElement('a');
      btn.className = 'ctx-btn'; btn.href = item.href; btn.dataset.label = item.label;
      if (item.target) btn.setAttribute('target', item.target);
      btn.innerHTML = ICONS[item.key] || '';
      if (item.key === 'aegis') btn.style.cssText += ';color:rgba(0,201,201,0.6)';
      if (currentPage && window.location.pathname === item.href) btn.classList.add('active');
      bar.appendChild(btn);
    });
    return bar;
  }

  // ── Sidebar: render HTML ─────────────────────────────────────
  function renderSidebar(activePage, firmName, currentUser, notifCount, showToolbar) {
    const currentPath = window.location.pathname;
    const NAV_ITEMS = [
      { href: '/dashboard.html',           icon: '◈', label: 'Dashboard',  section: 'top'   },
      { href: '/cadence.html',             icon: '⬡', label: 'Cadence',    section: 'main'  },
      { href: '/compass.html',             icon: '◈', label: 'Compass',    section: 'main'  },
      { href: '/pipeline.html',            icon: '▥', label: 'Pipeline',   section: 'main'  },
      { href: '/resource-requests.html',   icon: '⬡', label: 'Requests',   section: 'main'  },
      { href: '/resources.html',           icon: '◎', label: 'Resources',  section: 'main'  },
      { href: '/aegis.html',               icon: '⬡', label: 'Aegis',      section: 'admin', target: '_blank' },
      { href: '/audit-log.html',           icon: '▦', label: 'Audit Log',  section: 'admin' },
      { href: '/users.html',               icon: '◑', label: 'User Mgmt',  section: 'admin' },
    ];
    const navItem = item => {
      const isActive = currentPath === item.href || (activePage && activePage === item.href.replace('/',''));
      return `<a href="${item.href}" class="nav-item${isActive?' active':''}">
        <span class="nav-icon">${item.icon}</span>${item.label}
      </a>`;
    };
    const topItems   = NAV_ITEMS.filter(n=>n.section==='top').map(navItem).join('');
    const mainItems  = NAV_ITEMS.filter(n=>n.section==='main').map(navItem).join('');
    const adminItems = NAV_ITEMS.filter(n=>n.section==='admin').map(navItem).join('');
    const initStr = (window.UI && UI.initials)
      ? UI.initials(currentUser?.name||'')
      : (currentUser?.name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().substring(0,2);
    const roleName = currentUser?.is_admin ? 'ADMIN' : 'OPERATOR';

    return `
      <div class="sidebar-logo">
        <div class="logo-mark">
          <svg viewBox="0 0 40 40" width="32" height="32">
            <polygon points="20,4 36,36 4,36" fill="none" stroke="#00d2ff" stroke-width="2"/>
            <polygon points="20,10 31,32 9,32" fill="rgba(0,210,255,0.08)"/>
            <circle cx="20" cy="20" r="4" fill="#00d2ff"/>
            <line x1="20" y1="14" x2="20" y2="10" stroke="#00d2ff" stroke-width="1.5"/>
          </svg>
        </div>
        <div class="logo-text">
          <div class="wordmark"><span>Project</span>HUD</div>
          <div class="firm" id="firm-name">${firmName||''}</div>
        </div>
      </div>
      <div id="sidebar-body">
        <div id="sidebar-nav">
          ${topItems}
          <div class="nav-divider"></div>
          ${mainItems}
          <div class="nav-section-label">Admin</div>
          ${adminItems}
          <div style="flex:1;"></div>
        </div>
        ${showToolbar ? '<div id="ctx-toolbar-placeholder"></div>' : ''}
      </div>
      <div class="sidebar-operator">
        <div class="op-label">OPERATOR</div>
        <div class="op-user">
          <div class="op-avatar">${initStr}</div>
          <div>
            <div class="op-name">${currentUser?.name||'—'}</div>
            <div class="op-role">${roleName}</div>
          </div>
        </div>
        <div class="op-tools">
          <button class="op-btn" title="HUD Intelligence">◈</button>
          <button class="op-btn" title="Report Issue">⚑</button>
          <button class="op-btn" title="Chat">◉</button>
          <button class="op-btn" title="Start Recording" data-rec="1" onclick="HUDRecorder.toggle()" style="font-size:16px;line-height:1;">⏺</button>
        </div>
        <div class="op-bottom">
          <div class="op-version">
            <span class="nominal"><span class="nominal-dot"></span><span class="nominal-text">NOMINAL</span></span>
            <a href="#" style="font-size:11px;color:var(--text3);font-family:var(--font-mono);">RELEASE NOTES</a>
          </div>
          <div style="display:flex;gap:6px;align-items:center;">
            <button class="op-notif" title="Notifications">◉
              <span class="notif-badge" style="${notifCount>0?'':'display:none'}">${notifCount}</span>
            </button>
            <button class="op-logout" onclick="Auth.logout()">LOGOUT</button>
          </div>
        </div>
      </div>
    `;
  }

  // ── Inject slide-in CSS (fallback for surfaces that don't load /css/hud.css) ──
  function injectSlideInStyles() {
    if (document.getElementById('hud-slidein-styles')) return;
    const s = document.createElement('style');
    s.id = 'hud-slidein-styles';
    s.textContent = `
      #hud-sidebar-trigger {
        position: fixed; left: 0; top: 0; bottom: 0;
        width: 6px; z-index: 399; cursor: pointer;
      }
      #hud-sidebar-panel {
        position: fixed; left: 0; top: 0; bottom: 0; width: 220px;
        background: #0c1628;
        border-right: 1px solid rgba(0,210,255,.15);
        box-shadow: 4px 0 24px rgba(0,0,0,.6);
        z-index: 400;
        transform: translateX(-220px);
        transition: transform 220ms cubic-bezier(.4,0,.2,1);
        overflow: hidden; display: flex; flex-direction: column;
      }
      #hud-sidebar-panel.open { transform: translateX(0); }
      #hud-sidebar-inner { flex: 1; overflow-y: auto; overflow-x: hidden; }
      #hud-sidebar-panel #sidebar { height: 100% !important; max-height: 100% !important; }
      #hud-sidebar-panel #ctx-toolbar,
      #hud-sidebar-panel #ctx-toolbar-placeholder { display: none !important; }

      /* ── Sidebar internals (scoped fallback for surfaces without /css/hud.css) ── */
      #hud-sidebar-panel .sidebar-logo {
        padding: 16px 18px 14px;
        border-bottom: 1px solid rgba(100,160,220,0.12);
        display: flex; align-items: center; gap: 10px; flex-shrink: 0;
      }
      #hud-sidebar-panel .logo-mark { width: 28px; height: 28px; flex-shrink: 0; }
      #hud-sidebar-panel .logo-mark svg { width: 100%; height: 100%; }
      #hud-sidebar-panel .wordmark {
        font-family: 'Rajdhani', sans-serif; font-size: 18px; font-weight: 700;
        letter-spacing: 0.08em; color: #e8f4ff; line-height: 1;
      }
      #hud-sidebar-panel .wordmark span { color: #00d2ff; }
      #hud-sidebar-panel .firm {
        font-family: 'Share Tech Mono', monospace; font-size: 11px;
        color: #3a5a7a; letter-spacing: 0.18em; margin-top: 3px;
      }
      #hud-sidebar-panel #sidebar-nav { padding: 8px 10px; }
      #hud-sidebar-panel .nav-section-label {
        font-family: 'Share Tech Mono', monospace; font-size: 11px;
        color: #3a5a7a; letter-spacing: 0.2em; padding: 10px 8px 4px;
      }
      #hud-sidebar-panel .nav-item {
        display: flex; align-items: center; gap: 9px;
        padding: 9px 10px; border-left: 2px solid transparent;
        cursor: pointer;
        font-family: 'DM Sans','Inter',system-ui,sans-serif;
        font-size: 13px; font-weight: 500;
        color: #7a9bbf; letter-spacing: 0.04em;
        transition: all 0.12s; margin-bottom: 1px;
        text-decoration: none;
      }
      #hud-sidebar-panel .nav-item:hover { color:#e8f4ff; background:rgba(0,210,255,0.04); }
      #hud-sidebar-panel .nav-item.active {
        border-left-color:#00d2ff; background:rgba(0,210,255,0.08); color:#00d2ff;
      }
      #hud-sidebar-panel .nav-icon { font-size: 13px; width: 16px; text-align: center; flex-shrink: 0; }
      #hud-sidebar-panel .sidebar-operator {
        border-top: 1px solid rgba(100,160,220,0.12);
        padding: 12px 14px; flex-shrink: 0;
      }
      #hud-sidebar-panel .op-label {
        font-family: 'Share Tech Mono', monospace; font-size: 11px;
        color: #3a5a7a; letter-spacing: 0.2em; margin-bottom: 8px;
      }
      #hud-sidebar-panel .op-user {
        display: flex; align-items: center; gap: 9px;
        padding: 8px 10px; background: #0c1628;
        border: 1px solid rgba(100,160,220,0.12); margin-bottom: 8px;
      }
      #hud-sidebar-panel .op-avatar {
        width: 32px; height: 32px; flex-shrink: 0;
        background: #1a3a5a; border: 1px solid rgba(0,210,255,0.3);
        display: flex; align-items: center; justify-content: center;
        font-family: 'Rajdhani', sans-serif; font-size: 13px;
        font-weight: 700; color: #00d2ff;
      }
      #hud-sidebar-panel .op-name {
        font-family: 'DM Sans','Inter',system-ui,sans-serif;
        font-size: 13px; font-weight: 600; color: #e8f4ff; line-height: 1.2;
      }
      #hud-sidebar-panel .op-role {
        font-family: 'Share Tech Mono', monospace; font-size: 11px;
        color: #ffaa00; letter-spacing: 0.12em; margin-top: 1px;
      }
      #hud-sidebar-panel .op-tools { display: flex; gap: 6px; margin-bottom: 8px; }
      #hud-sidebar-panel .op-btn {
        flex: 1; padding: 6px 0; background: transparent;
        border: 1px solid rgba(100,160,220,0.12);
        color: #3a5a7a; cursor: pointer; font-size: 13px;
        display: flex; align-items: center; justify-content: center;
        transition: all 0.12s;
      }
      #hud-sidebar-panel .op-btn:hover {
        border-color:#00d2ff; color:#00d2ff; background:rgba(0,210,255,0.08);
      }
      #hud-sidebar-panel .op-version {
        display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;
      }
      #hud-sidebar-panel .op-version span,
      #hud-sidebar-panel .op-version a {
        font-family: 'Share Tech Mono', monospace; font-size: 11px;
        color: #3a5a7a; letter-spacing: 0.08em; text-decoration: none;
      }
      #hud-sidebar-panel .op-bottom { display: flex; align-items: center; gap: 6px; }
      #hud-sidebar-panel .nominal { display: flex; align-items: center; gap: 5px; flex: 1; }
      #hud-sidebar-panel .nominal-dot {
        width: 5px; height: 5px; background: #00e5a0;
        transform: rotate(45deg); flex-shrink: 0;
      }
      #hud-sidebar-panel .nominal-text {
        font-family: 'Share Tech Mono', monospace; font-size: 11px;
        color: #7a9bbf; letter-spacing: 0.1em;
      }
      #hud-sidebar-panel .op-notif {
        position: relative; background: none;
        border: 1px solid rgba(100,160,220,0.12);
        color: #7a9bbf; cursor: pointer; padding: 3px 7px;
        font-size: 12px; transition: all 0.12s;
      }
      #hud-sidebar-panel .op-notif:hover { border-color:#00d2ff; color:#00d2ff; }
      #hud-sidebar-panel .notif-badge {
        position: absolute; top: -5px; right: -5px;
        background: #ff4757; color: #fff;
        font-family: 'Share Tech Mono', monospace;
        font-size: 11px; font-weight: 700;
        width: 15px; height: 15px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
      }
      #hud-sidebar-panel .op-logout {
        background: none; border: 1px solid rgba(100,160,220,0.12);
        color: #3a5a7a; cursor: pointer; padding: 3px 8px;
        font-family: 'Share Tech Mono', monospace; font-size: 11px;
        letter-spacing: 0.1em; transition: all 0.12s;
      }
      #hud-sidebar-panel .op-logout:hover { border-color:#ff4757; color:#ff4757; }
    `;
    document.head.appendChild(s);
  }

  // ── Slide-in shell (preserved from sidebar.js v3.1) ──────────
  function _installSlideIn() {
    injectSlideInStyles();
    let trigger = document.getElementById('hud-sidebar-trigger');
    let panel   = document.getElementById('hud-sidebar-panel');
    let inner   = document.getElementById('hud-sidebar-inner');

    if (!trigger) {
      trigger = document.createElement('div');
      trigger.id = 'hud-sidebar-trigger';
      document.body.appendChild(trigger);
    }
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'hud-sidebar-panel';
      document.body.appendChild(panel);
    }
    if (!inner) {
      inner = document.createElement('div');
      inner.id = 'hud-sidebar-inner';
      panel.appendChild(inner);
    }

    if (!panel.dataset.slideinWired) {
      let hideTimer = null;
      const open  = () => { clearTimeout(hideTimer); panel.classList.add('open'); };
      const close = () => { hideTimer = setTimeout(() => panel.classList.remove('open'), 300); };
      trigger.addEventListener('mouseenter', open);
      trigger.addEventListener('mouseleave', close);
      panel.addEventListener('mouseenter', () => clearTimeout(hideTimer));
      panel.addEventListener('mouseleave', close);
      panel.dataset.slideinWired = '1';
    }

    return inner;
  }

  // ── Tier 1 / Tier 2 state ────────────────────────────────────
  // _tier1Active: currently active Tier 1 tab id
  // _tier2Map:    config object { tier1Id: [{ id, label, glyph }] }
  // _tier2Memory: per-Tier-1 last-selected Tier 2 id (persisted)
  // _tier1OnSelect / _tier2OnSelect: caller-supplied click handlers
  let _tier1Active   = null;
  let _tier2Map      = {};
  let _tier2Memory   = {};
  let _tier1OnSelect = null;
  let _tier2OnSelect = null;
  const _TIER2_STORAGE_KEY = 'hud-tier2-state';

  function _loadTier2Memory() {
    try {
      const raw = localStorage.getItem(_TIER2_STORAGE_KEY);
      _tier2Memory = raw ? JSON.parse(raw) : {};
    } catch (e) { _tier2Memory = {}; }
  }
  function _saveTier2Memory() {
    try { localStorage.setItem(_TIER2_STORAGE_KEY, JSON.stringify(_tier2Memory)); }
    catch (e) {}
  }

  // ── Build Tier 1 sub-header strip ────────────────────────────
  function _buildTier1(tabs, initialActive, onSelect) {
    if (document.getElementById('hud-tier1')) return;
    const strip = document.createElement('div');
    strip.id = 'hud-tier1';
    tabs.forEach(t => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hud-tier1-tab';
      btn.dataset.tier1Id = t.id;
      btn.innerHTML = `<span class="tab-dot"></span><span>${t.label}</span>`;
      btn.addEventListener('click', () => _selectTier1(t.id));
      strip.appendChild(btn);
    });
    document.body.insertBefore(strip, document.body.firstChild.nextSibling);
    document.body.classList.add('hud-tier1-rendered');
    _tier1OnSelect = onSelect || null;
    if (initialActive) _selectTier1(initialActive, /*skipCallback=*/true);
  }

  function _selectTier1(tier1Id, skipCallback) {
    _tier1Active = tier1Id;
    document.querySelectorAll('#hud-tier1 .hud-tier1-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.tier1Id === tier1Id);
    });
    _renderTier2(tier1Id);
    if (!skipCallback && typeof _tier1OnSelect === 'function') {
      try { _tier1OnSelect(tier1Id); } catch (e) { console.error('[HUDShell] tier1 onSelect error:', e); }
    }
    // CMD95p3: do NOT auto-fire onTier2Select after Tier 1 change.
    // Tier 1 callback owns surface setup; sub-view restoration is the
    // caller's responsibility (e.g. compass loadUserView's savedTab
    // path). Auto-firing caused unmounted-container races and blank
    // surfaces when returning to a Tier 1 tab whose remembered Tier 2
    // sub-view hadn't been visited in this session.
  }

  // ── Build / refresh Tier 2 vertical strip ────────────────────
  function _ensureTier2Container() {
    let strip = document.getElementById('hud-tier2');
    if (strip) return strip;
    strip = document.createElement('div');
    strip.id = 'hud-tier2';
    document.body.insertBefore(strip, document.body.firstChild.nextSibling);
    document.body.classList.add('hud-tier2-rendered');
    return strip;
  }

  function _renderTier2(tier1Id) {
    const items = _tier2Map[tier1Id] || [];
    const strip = _ensureTier2Container();
    strip.innerHTML = '';
    if (!items.length) {
      strip.style.display = 'none';
      document.body.classList.remove('hud-tier2-rendered');
      return;
    }
    strip.style.display = '';
    document.body.classList.add('hud-tier2-rendered');

    // Determine active Tier 2 for this Tier 1: memory wins, else first item
    let activeId = _tier2Memory[tier1Id];
    if (!activeId || !items.find(i => i.id === activeId)) {
      activeId = items[0].id;
      _tier2Memory[tier1Id] = activeId;
      _saveTier2Memory();
    }

    items.forEach(it => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hud-tier2-btn' + (it.id === activeId ? ' active' : '');
      btn.dataset.tier2Id = it.id;
      btn.dataset.label = it.label;
      btn.title = it.label;
      btn.innerHTML =
        `<span class="tier2-glyph">${it.glyph || '◆'}</span>` +
        `<span class="tier2-label">${it.label}</span>`;
      btn.addEventListener('click', () => _selectTier2(it.id));
      strip.appendChild(btn);
    });
  }

  function _selectTier2(tier2Id) {
    if (!_tier1Active) return;
    _tier2Memory[_tier1Active] = tier2Id;
    _saveTier2Memory();
    document.querySelectorAll('#hud-tier2 .hud-tier2-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tier2Id === tier2Id);
    });
    if (typeof _tier2OnSelect === 'function') {
      try { _tier2OnSelect(_tier1Active, tier2Id); }
      catch (e) { console.error('[HUDShell] tier2 onSelect error:', e); }
    }
  }


  function _buildHeader(moduleName) {
    if (document.getElementById('hud-header')) return; // idempotent
    const initials = _userInitialsFallback();

    // Resolve module-specific icon and wordmark split.
    const modKey = moduleName || '';
    const moduleIcon = MODULE_ICONS[modKey] || `
      <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
        <polygon points="20,4 36,36 4,36" fill="none" stroke="currentColor" stroke-width="2"/>
        <polygon points="20,10 31,32 9,32" fill="rgba(0,210,255,0.10)"/>
        <circle cx="20" cy="20" r="4" fill="currentColor"/>
        <line x1="20" y1="14" x2="20" y2="10" stroke="currentColor" stroke-width="1.5"/>
      </svg>`;
    const split = WORDMARK_SPLITS[modKey];
    const wordmarkHTML = split
      ? `${split[0]}<span class="wm-aqua">${split[1]}</span>`
      : (modKey || '');

    // Build ticker: items repeated twice for seamless animation loop.
    const tiHTML = TICKER_ITEMS.map(t =>
      `<span class="ti"><span class="td" style="background:${t.dot}"></span><span class="tw">${t.who}</span> <span class="ta">${t.verb}</span> ${t.tail}</span>`
    ).join('');

    const header = document.createElement('div');
    header.id = 'hud-header';
    header.innerHTML = `
      <div id="hud-header-left">
        <div class="hud-logo">${moduleIcon}</div>
        <div class="hud-module-name">${wordmarkHTML}</div>
      </div>
      <div id="hud-header-ticker">
        <div class="hud-ticker-track">${tiHTML}${tiHTML}</div>
      </div>
      <div id="hud-header-status">
        <div id="hud-status-live"><span class="live-dot"></span>LIVE</div>
        <div id="hud-status-datetime">\u2014</div>
        <button id="hud-status-bell" title="Notifications" type="button">
          ${ICONS.bell}
          <span id="hud-status-bell-badge" style="display:none">0</span>
        </button>
        <button id="hud-display-btn" title="Display brightness & contrast" type="button">
          ${ICONS.display}
        </button>
        <div id="hud-status-avatar" title="Operator">${initials}</div>
      </div>
    `;
    document.body.insertBefore(header, document.body.firstChild);
    document.body.classList.add('hud-header-rendered');
    document.body.classList.add('hud-shell-body');

    _startDatetimeTicker();
    _bindNotifBtn();
    _refreshAvatarFromAuth();
    _bindDisplayTuningBtn();
  }

  // ── Display tuning (CMD100.26 → CMD100.31) ─────────────────────
  // Floating popover with brightness/contrast/saturation sliders, plus
  // panel background color picker and panel alpha slider. Settings persist
  // per-user in localStorage. Filter values apply to documentElement;
  // panel overrides go through a dedicated injected stylesheet.
  const _DISPLAY_KEY = 'hud-display-tuning';
  const _DISPLAY_DEFAULTS = {
    brightness: 100,
    contrast:   100,
    saturation: 100,
    panelColor: '',     // empty string = no override (use original CSS)
    panelAlpha: 100     // % opacity applied to panel background
  };
  function _hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    return m ? { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) } : null;
  }
  function _loadDisplayTuning() {
    try {
      const raw = localStorage.getItem(_DISPLAY_KEY);
      if (!raw) return Object.assign({}, _DISPLAY_DEFAULTS);
      const parsed = JSON.parse(raw);
      return {
        brightness: Math.max(50,  Math.min(150, +parsed.brightness || 100)),
        contrast:   Math.max(50,  Math.min(200, +parsed.contrast   || 100)),
        saturation: Math.max(0,   Math.min(200, parsed.saturation == null ? 100 : +parsed.saturation)),
        panelColor: typeof parsed.panelColor === 'string' ? parsed.panelColor : '',
        panelAlpha: Math.max(0,   Math.min(100, parsed.panelAlpha == null ? 100 : +parsed.panelAlpha))
      };
    } catch(e) { return Object.assign({}, _DISPLAY_DEFAULTS); }
  }
  function _saveDisplayTuning(t) {
    try { localStorage.setItem(_DISPLAY_KEY, JSON.stringify(t)); } catch(e) {}
  }
  function _applyDisplayTuning(t) {
    // Filter chain on documentElement
    const el = document.documentElement;
    const parts = [];
    if (t.brightness !== 100) parts.push(`brightness(${t.brightness}%)`);
    if (t.contrast   !== 100) parts.push(`contrast(${t.contrast}%)`);
    if (t.saturation !== 100) parts.push(`saturate(${t.saturation}%)`);
    el.style.filter = parts.length ? parts.join(' ') : '';

    // Panel overrides via injected stylesheet (only .cmp-panel)
    let style = document.getElementById('hud-panel-tuning-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'hud-panel-tuning-style';
      document.head.appendChild(style);
    }
    if (!t.panelColor && t.panelAlpha === 100) {
      style.textContent = '';
      return;
    }
    const rgb = _hexToRgb(t.panelColor) || { r: 12, g: 22, b: 40 }; // fallback to current default panel bg
    const a = (t.panelAlpha / 100).toFixed(2);
    style.textContent = `.cmp-panel { background: rgba(${rgb.r},${rgb.g},${rgb.b},${a}) !important; }`;
  }
  function _bindDisplayTuningBtn() {
    const btn = document.getElementById('hud-display-btn');
    if (!btn || btn.dataset.wired) return;
    btn.dataset.wired = '1';

    let popover = document.getElementById('hud-display-popover');
    if (!popover) {
      popover = document.createElement('div');
      popover.id = 'hud-display-popover';
      popover.innerHTML = `
        <div class="dp-section-label">Display</div>
        <div class="row"><label>Brightness</label><span class="val" id="dp-bri-val">100%</span></div>
        <input type="range" id="dp-bri" min="50" max="150" step="1" value="100">
        <div class="row"><label>Contrast</label><span class="val" id="dp-con-val">100%</span></div>
        <input type="range" id="dp-con" min="50" max="200" step="1" value="100">
        <div class="row"><label>Saturation</label><span class="val" id="dp-sat-val">100%</span></div>
        <input type="range" id="dp-sat" min="0" max="200" step="1" value="100">
        <div class="dp-section-label" style="margin-top:6px">Panel (Compass main card)</div>
        <div class="row"><label>Color</label><span class="val" id="dp-pnc-val" style="font-family:'JetBrains Mono',ui-monospace,monospace">—</span></div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <input type="color" id="dp-pnc" value="#0c1628" style="width:36px;height:28px;border:1px solid rgba(0,210,255,.25);background:transparent;cursor:pointer;padding:0">
          <button class="dp-btn" id="dp-pnc-clear" style="flex:0 0 auto;padding:5px 8px">Clear</button>
        </div>
        <div class="row"><label>Transparency</label><span class="val" id="dp-pna-val">100%</span></div>
        <input type="range" id="dp-pna" min="0" max="100" step="1" value="100">
        <div class="actions">
          <button class="dp-btn" id="dp-reset">Reset all</button>
          <button class="dp-btn" id="dp-close">Close</button>
        </div>
      `;
      document.body.appendChild(popover);
    }

    const tuning = _loadDisplayTuning();
    const briEl = popover.querySelector('#dp-bri');
    const conEl = popover.querySelector('#dp-con');
    const satEl = popover.querySelector('#dp-sat');
    const pncEl = popover.querySelector('#dp-pnc');
    const pnaEl = popover.querySelector('#dp-pna');
    const briVal = popover.querySelector('#dp-bri-val');
    const conVal = popover.querySelector('#dp-con-val');
    const satVal = popover.querySelector('#dp-sat-val');
    const pncVal = popover.querySelector('#dp-pnc-val');
    const pnaVal = popover.querySelector('#dp-pna-val');

    briEl.value = tuning.brightness; briVal.textContent = tuning.brightness + '%';
    conEl.value = tuning.contrast;   conVal.textContent = tuning.contrast + '%';
    satEl.value = tuning.saturation; satVal.textContent = tuning.saturation + '%';
    if (tuning.panelColor) { pncEl.value = tuning.panelColor; pncVal.textContent = tuning.panelColor.toUpperCase(); }
    else { pncVal.textContent = '—'; }
    pnaEl.value = tuning.panelAlpha; pnaVal.textContent = tuning.panelAlpha + '%';

    const onInput = () => {
      const t = {
        brightness: +briEl.value,
        contrast:   +conEl.value,
        saturation: +satEl.value,
        panelColor: (pncVal.textContent === '—') ? '' : pncEl.value,
        panelAlpha: +pnaEl.value
      };
      briVal.textContent = t.brightness + '%';
      conVal.textContent = t.contrast + '%';
      satVal.textContent = t.saturation + '%';
      pnaVal.textContent = t.panelAlpha + '%';
      _applyDisplayTuning(t);
      _saveDisplayTuning(t);
    };
    briEl.addEventListener('input', onInput);
    conEl.addEventListener('input', onInput);
    satEl.addEventListener('input', onInput);
    pnaEl.addEventListener('input', onInput);
    pncEl.addEventListener('input', () => {
      pncVal.textContent = pncEl.value.toUpperCase();
      onInput();
    });
    popover.querySelector('#dp-pnc-clear').addEventListener('click', () => {
      pncVal.textContent = '—';
      onInput();
    });

    popover.querySelector('#dp-reset').addEventListener('click', () => {
      briEl.value = 100; conEl.value = 100; satEl.value = 100;
      pnaEl.value = 100; pncEl.value = '#0c1628';
      pncVal.textContent = '—';
      onInput();
    });
    popover.querySelector('#dp-close').addEventListener('click', () => {
      popover.classList.remove('open'); btn.classList.remove('active');
    });

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = popover.classList.toggle('open');
      btn.classList.toggle('active', isOpen);
    });
    document.addEventListener('click', (e) => {
      if (!popover.classList.contains('open')) return;
      if (popover.contains(e.target) || btn.contains(e.target)) return;
      popover.classList.remove('open');
      btn.classList.remove('active');
    });
  }
  // Apply persisted tuning ASAP, before the header has rendered, so the
  // first paint reflects the user's preference.
  try { _applyDisplayTuning(_loadDisplayTuning()); } catch(e) {}

  // ── Footer strip with version display (v1.5 §4.9, CMD99) ─────
  // Fallback styles for surfaces that do not load /css/hud.css.
  // The canonical rules live in hud.css; these are scoped to the
  // footer element only and use literal values so they don't depend
  // on tokens that may be absent on shim-era pages.
  function injectFooterFallbackStyles() {
    if (document.getElementById('hud-footer-styles')) return;
    const s = document.createElement('style');
    s.id = 'hud-footer-styles';
    s.textContent = `
      #hud-footer.hud-footer {
        position: fixed; bottom: 0; left: 0; right: 0;
        height: 24px;
        background: #0d1424;
        border-top: 1px solid rgba(100,160,220,0.12);
        display: flex; align-items: center; justify-content: flex-end;
        padding: 0 14px; z-index: 60;
      }
      #hud-footer .hud-footer__version {
        font-family: 'Inter', system-ui, sans-serif;
        font-size: 11px; font-weight: 400;
        color: #a8c5e0;
        letter-spacing: 0.04em;
        font-feature-settings: "tnum";
      }
    `;
    document.head.appendChild(s);
  }

  function _buildFooter() {
    if (document.getElementById('hud-footer')) return; // idempotent
    const v = window._PROJECTHUD_VERSION || '';
    const footer = document.createElement('footer');
    footer.id = 'hud-footer';
    footer.className = 'hud-footer';
    footer.innerHTML = `<span class="hud-footer__version">${v}</span>`;
    document.body.appendChild(footer);
    document.body.classList.add('hud-footer-rendered');
    document.body.classList.add('hud-shell-body');
  }

  // ── Datetime updater (newly written; no prior canonical) ─────
  function _startDatetimeTicker() {
    const el = document.getElementById('hud-status-datetime');
    if (!el) return;
    const DOW = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
    const MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const pad = n => String(n).padStart(2,'0');
    const tick = () => {
      const d = new Date();
      el.textContent =
        `${DOW[d.getDay()]}, ${MON[d.getMonth()]} ${pad(d.getDate())}, ${d.getFullYear()} `
        + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };
    tick();
    if (window._hudDtTimer) clearInterval(window._hudDtTimer);
    window._hudDtTimer = setInterval(tick, 1000);
  }

  // ── Bell wiring (absorbed from compass.html IIFE) ────────────
  function _bindNotifBtn() {
    const btn   = document.getElementById('hud-status-bell');
    const badge = document.getElementById('hud-status-bell-badge');
    if (!btn) return;

    function _syncBadge() {
      const count = window.HUDNotif ? window.HUDNotif.getUnread() : 0;
      if (badge) {
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.style.display = count > 0 ? 'flex' : 'none';
      }
      btn.classList.toggle('has-unread', count > 0);
    }
    if (window._hudBellTimer) clearInterval(window._hudBellTimer);
    window._hudBellTimer = setInterval(_syncBadge, 2000);
    _syncBadge();

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.HUDNotif && typeof window.HUDNotif._openPanel === 'function') {
        window.HUDNotif._openPanel(btn);
      } else {
        console.warn('[HUDShell] Bell clicked — window.HUDNotif._openPanel unavailable. cmd-center.js may not be loaded on this surface.');
      }
    });
  }

  // ── Avatar (no click handler in CMD94 — broken-as-is) ────────
  function _userInitialsFallback() {
    try {
      const name = (window.CURRENT_USER && window.CURRENT_USER.name) || '';
      if (!name) return '—';
      return name.split(' ').map(w=>w[0]).join('').toUpperCase().substring(0,2);
    } catch (e) { return '—'; }
  }
  function _refreshAvatarFromAuth() {
    const av = document.getElementById('hud-status-avatar');
    if (!av) return;
    Promise.resolve()
      .then(() => (window.API && API.getUsers) ? API.getUsers() : [])
      .then(users => (window.Auth && Auth.getCurrentUserId) ? Promise.all([users, Auth.getCurrentUserId()]) : null)
      .then(pair => {
        if (!pair) return;
        const [users, uid] = pair;
        const me = (users || []).find(u => u.id === uid);
        if (me && me.name) {
          av.textContent = me.name.split(' ').map(w=>w[0]).join('').toUpperCase().substring(0,2);
        }
      })
      .catch(() => { /* leave fallback initials in place */ });
  }

  // ── cmd-center loader (preserved from sidebar.js) ────────────
  function _loadCmdCenter() {
    if (window._cmdCenterLoaded) return;
    if (window._aegisMode) return;
    const v = window._PROJECTHUD_VERSION;
    if (!v) {
      console.warn('[HUDShell] window._PROJECTHUD_VERSION not set — js/version.js must load before hud-shell.js');
      return;
    }
    const s = document.createElement('script');
    s.src = '/js/cmd-center.js?v=' + v;
    s.onerror = () => console.warn('[HUDShell] cmd-center.js not found — session will not appear in Aegis');
    document.head.appendChild(s);
  }

  // ── Public init ──────────────────────────────────────────────
  // options: {
  //   page:         active page key (e.g. 'compass')
  //   moduleName:   text shown in header left region. If omitted,
  //                 derived from `page`. If empty string, header is
  //                 NOT rendered.
  //   header:       explicit override. If false, suppresses header.
  //   tier1:        [{ id, label }] — major-area tabs (CMD95). Optional.
  //   tier2:        { tier1Id: [{ id, label, glyph }] } — sub-view icons
  //                 per Tier 1 tab. Optional. Required if tier1 supplied.
  //   initialTier1: id of initially-active Tier 1 tab.
  //   onTier1Select(tier1Id): called after Tier 1 selection.
  //   onTier2Select(tier1Id, tier2Id): called after Tier 2 selection
  //                 (or after Tier 1 changes and restores its remembered Tier 2).
  // }
  async function init(options) {
    options = options || {};
    const page = options.page || '';
    const renderHeader =
      options.header === true
        ? true
        : (options.header === false ? false : !!options.moduleName);
    const moduleName = options.moduleName || '';

    _loadCmdCenter();

    // Slide-in shell is the only sidebar pattern (uniform across all surfaces).
    // Pre-existing #sidebar / #sidebar-container hosts are collapsed so they
    // don't reserve gutter space in the layout.
    const preHost = document.getElementById('sidebar');
    if (preHost && !preHost.dataset.hudShellShimmed) {
      preHost.id = 'sidebar-legacy-host';
      preHost.style.display = 'none';
      preHost.dataset.hudShellShimmed = '1';
    }
    const container = document.getElementById('sidebar-container');
    if (container && !container.dataset.hudShellShimmed) {
      container.style.display = 'none';
      container.dataset.hudShellShimmed = '1';
    }
    const inner = _installSlideIn();
    let sidebar = document.getElementById('sidebar');
    if (!sidebar) {
      sidebar = document.createElement('div');
      sidebar.id = 'sidebar';
      inner.appendChild(sidebar);
    }

    if (renderHeader) {
      injectHeaderStyles();
      _buildHeader(moduleName);
    }

    // Footer strip renders on every surface platform-wide per v1.5 §4.9.
    // Independent of the header opt-in: even shim-era surfaces that
    // suppress the unified header still get the version-display footer.
    injectFooterFallbackStyles();
    _buildFooter();

    // ── Tier 1 / Tier 2 setup (CMD95) ─────────────────────────
    if (Array.isArray(options.tier1) && options.tier1.length) {
      _tier2Map      = options.tier2 || {};
      _tier2OnSelect = typeof options.onTier2Select === 'function' ? options.onTier2Select : null;
      _loadTier2Memory();
      const initial = options.initialTier1 || options.tier1[0].id;
      _buildTier1(options.tier1, initial,
        typeof options.onTier1Select === 'function' ? options.onTier1Select : null);
    }

    const showToolbar = true;
    try {
      const [users, firms] = await Promise.all([API.getUsers(), API.getFirms()]);
      const userId      = await Auth.getCurrentUserId();
      const currentUser = users?.find(u => u.id === userId);
      const internalFirm = firms?.find(f => f.is_internal);
      let notifCount = 0;
      if (typeof window.HUDNotif !== 'undefined' && userId) {
        window.HUDNotif.init(userId);
        notifCount = window.HUDNotif.getUnread();
      } else {
        try { const notifs = await API.getNotifications?.(); notifCount = notifs?.filter(n=>!n.read)?.length||0; } catch(e) {}
      }
      injectSidebarStyles();
      sidebar.innerHTML = renderSidebar(page, internalFirm?.name||'', currentUser, notifCount, showToolbar);
      // CMD100.41: push the resolved currentUser into the header avatar so it
      // shows initials instead of the "—" fallback. The slide-in panel and
      // the header avatar are populated by separate paths; this links them.
      if (currentUser && currentUser.name) {
        const av = document.getElementById('hud-status-avatar');
        if (av) {
          av.textContent = currentUser.name.split(' ').map(w=>w[0]).join('').toUpperCase().substring(0,2);
          av.title = currentUser.name;
        }
        // Also expose globally so any later _refreshAvatarFromAuth pass succeeds.
        window.CURRENT_USER = currentUser;
      }
      if (showToolbar) {
        const ph = document.getElementById('ctx-toolbar-placeholder');
        if (ph) ph.replaceWith(buildToolbar(page));
      }
    } catch(err) {
      console.error('HUDShell init error:', err);
      injectSidebarStyles();
      sidebar.innerHTML = renderSidebar(page, '', null, 0, showToolbar);
      if (showToolbar) {
        const ph = document.getElementById('ctx-toolbar-placeholder');
        if (ph) ph.replaceWith(buildToolbar(page));
      }
    }
  }

  // ── Public API ───────────────────────────────────────────────
  const api = {
    init,
    selectTier1: _selectTier1,
    selectTier2: _selectTier2,
    getActiveTier1: () => _tier1Active,
    getActiveTier2: () => (_tier1Active ? _tier2Memory[_tier1Active] : null),
  };
  window.HUDShell = api;

  // Backward-compat shim: window.Sidebar.init(page) → HUDShell.init({page})
  // No moduleName supplied ⇒ unified header NOT rendered for shim-era
  // surfaces. Per CMD94 §4.6, only Cadence renders the unified header
  // in this brief; CMD95-CMD99 retrofit surfaces opt in by passing
  // moduleName themselves.
  window.Sidebar = {
    init: function(page) {
      return api.init({ page: page || '', moduleName: '' });
    }
  };

  return api;
})();