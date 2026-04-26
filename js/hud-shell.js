// ============================================================
// ProjectHUD — hud-shell.js v1.0 (CMD94)
// Unified shell: slide-in sidebar (absorbed from sidebar.js v3.1)
//                + unified header bar (logo / ticker / operator-status).
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
    'users':      'User Management',
    'users.html': 'User Management',
    'dashboard.html': 'Dashboard',
  };

  function _deriveModuleName(page) {
    if (!page) return '';
    const key = String(page).toLowerCase();
    if (PAGE_TO_MODULE[key]) return PAGE_TO_MODULE[key];
    const stripped = key.replace(/\.html$/, '');
    if (PAGE_TO_MODULE[stripped]) return PAGE_TO_MODULE[stripped];
    return stripped.charAt(0).toUpperCase() + stripped.slice(1);
  }

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
      body.hud-header-pad { padding-top: 48px; }
      #hud-header-left {
        display: flex; align-items: center; gap: 10px;
        padding: 0 16px;
        border-right: 1px solid rgba(0,210,255,0.10);
        flex-shrink: 0;
      }
      #hud-header-left .hud-logo {
        width: 24px; height: 24px; flex-shrink: 0;
        color: #00d2ff;
      }
      #hud-header-left .hud-logo svg { width:100%; height:100%; display:block; }
      #hud-header-left .hud-module-name {
        font-size: 16px; font-weight: 700;
        letter-spacing: 0.08em; text-transform: uppercase;
        color: #e8f4ff;
      }
      #hud-header-ticker {
        flex: 1 1 auto; min-width: 0;
        display: flex; align-items: center;
        padding: 0 14px;
        border-right: 1px solid rgba(0,210,255,0.10);
        background: rgba(0,210,255,0.02);
        overflow: hidden;
      }
      #hud-header-ticker:empty::before {
        content: ''; display: block; width: 100%; height: 1px;
      }
      #hud-header-status {
        display: flex; align-items: center; gap: 14px;
        padding: 0 14px; flex-shrink: 0;
      }
      #hud-status-live {
        display: flex; align-items: center; gap: 6px;
        font-family: 'Share Tech Mono', monospace;
        font-size: 11px; color: #00e5a0;
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
        font-family: 'Share Tech Mono', monospace;
        font-size: 11px; color: #7a9bbf;
        letter-spacing: 0.06em; white-space: nowrap;
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
      #hud-status-bell-badge {
        position: absolute; top: -5px; right: -5px;
        background: #E24B4A; color: #fff;
        font-family: 'Share Tech Mono', monospace;
        font-size: 11px; font-weight: 700;
        min-width: 16px; height: 16px; border-radius: 8px;
        display: flex; align-items: center; justify-content: center;
        padding: 0 3px; pointer-events: none;
      }
      #hud-status-avatar {
        width: 30px; height: 30px; border-radius: 50%;
        background: rgba(0,210,255,0.15);
        border: 1px solid rgba(0,210,255,0.3);
        display: flex; align-items: center; justify-content: center;
        font-family: 'Rajdhani','Inter',sans-serif;
        font-size: 12px; font-weight: 700;
        color: #00d2ff;
        cursor: default;
      }
      /* Slide-in trigger sits below the unified header */
      body.hud-header-pad #hud-sidebar-trigger { top: 48px; }
      body.hud-header-pad #hud-sidebar-panel { top: 48px; }
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
      { href: '/compass.html',             icon: '◈', label: 'Compass',    section: 'main'  },
      { href: '/dashboard.html',           icon: '◈', label: 'Dashboard',  section: 'main'  },
      { href: '/pipeline.html',            icon: '▥', label: 'Pipeline',   section: 'main'  },
      { href: '/resources.html',           icon: '◎', label: 'Resources',  section: 'main'  },
      { href: '/resource-requests.html',   icon: '⬡', label: 'Requests',    section: 'main'  },
      { href: '/cadence.html',             icon: '⬡', label: 'CadenceHUD',  section: 'main'  },
      { href: '/aegis.html',               icon: '⬡', label: 'Aegis',       section: 'admin', target: '_blank' },
      { href: '/audit-log.html',           icon: '▦', label: 'Audit Log',  section: 'admin' },
      { href: '/users.html',               icon: '◑', label: 'User Mgmt',  section: 'admin' },
    ];
    const navItem = item => {
      const isActive = currentPath === item.href || (activePage && activePage === item.href.replace('/',''));
      return `<a href="${item.href}" class="nav-item${isActive?' active':''}">
        <span class="nav-icon">${item.icon}</span>${item.label}
      </a>`;
    };
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

  // ── Slide-in shell (preserved from sidebar.js v3.1) ──────────
  function _installSlideIn() {
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

  // ── Unified header: build & wire ─────────────────────────────
  function _buildHeader(moduleName) {
    if (document.getElementById('hud-header')) return; // idempotent
    const initials = _userInitialsFallback();

    const header = document.createElement('div');
    header.id = 'hud-header';
    header.innerHTML = `
      <div id="hud-header-left">
        <div class="hud-logo">
          <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
            <polygon points="20,4 36,36 4,36" fill="none" stroke="currentColor" stroke-width="2"/>
            <polygon points="20,10 31,32 9,32" fill="rgba(0,210,255,0.10)"/>
            <circle cx="20" cy="20" r="4" fill="currentColor"/>
            <line x1="20" y1="14" x2="20" y2="10" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        </div>
        <div class="hud-module-name">${moduleName || ''}</div>
      </div>
      <div id="hud-header-ticker"></div>
      <div id="hud-header-status">
        <div id="hud-status-live"><span class="live-dot"></span>LIVE</div>
        <div id="hud-status-datetime">—</div>
        <button id="hud-status-bell" title="Notifications" type="button">
          ${ICONS.bell}
          <span id="hud-status-bell-badge" style="display:none">0</span>
        </button>
        <div id="hud-status-avatar" title="Operator">${initials}</div>
      </div>
    `;
    document.body.insertBefore(header, document.body.firstChild);
    document.body.classList.add('hud-header-pad');

    _startDatetimeTicker();
    _bindNotifBtn();
    _refreshAvatarFromAuth();
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
  // options: { page: string, moduleName?: string, header?: boolean }
  // - page:        active page key (e.g. 'compass', 'cadence')
  // - moduleName:  text shown in header left region. If omitted,
  //                derived from `page`. If empty string, header is
  //                NOT rendered (used by backward-compat shim so
  //                CMD93-era surfaces don't sprout headers prematurely).
  // - header:      explicit override. If false, suppresses header.
  async function init(options) {
    options = options || {};
    const page = options.page || '';
    const renderHeader =
      options.header === true
        ? true
        : (options.header === false ? false : !!options.moduleName);
    const moduleName = options.moduleName || '';

    _loadCmdCenter();

    // Slide-in shell only if no persistent #sidebar host present
    let sidebar = document.getElementById('sidebar');
    if (!sidebar) {
      const inner = _installSlideIn();
      sidebar = document.createElement('div');
      sidebar.id = 'sidebar';
      inner.appendChild(sidebar);
    }

    if (renderHeader) {
      injectHeaderStyles();
      _buildHeader(moduleName);
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
  const api = { init };
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
