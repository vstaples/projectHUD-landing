// ============================================================
// ProjectHUD — sidebar.js  v2
// Primary nav (trimmed) + context toolbar on dashboard
// ============================================================

const Sidebar = (() => {

  // ── SVG icons for context toolbar ────────────────────────
  const ICONS = {
    projects:
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
        <rect x="2" y="7" width="9" height="13" rx="1.2"/>
        <rect x="13" y="3" width="9" height="17" rx="1.2"/>
        <path d="M5 7V5a2 2 0 012-2h3"/>
      </svg>`,
    meetings:
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
        <rect x="3" y="4" width="18" height="17" rx="2"/>
        <path d="M3 9h18M8 2v4M16 2v4"/>
      </svg>`,
    documents:
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="8" y1="13" x2="16" y2="13"/>
        <line x1="8" y1="17" x2="13" y2="17"/>
      </svg>`,
    risks:
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>`,
    stakeholders:
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
        <circle cx="8" cy="7" r="3"/>
        <path d="M2 21c0-4 2.7-7 6-7"/>
        <circle cx="17" cy="8" r="2.5"/>
        <path d="M13 21c0-3.5 1.8-6 4-6s4 2.5 4 6"/>
      </svg>`,
    actions:
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
        <path d="M9 5H7a2 2 0 00-2 2v13a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
        <rect x="9" y="3" width="6" height="4" rx="1"/>
        <path d="M9 12h6M9 16h4"/>
        <path d="M16 19l-2-2 1-4 3-3 2 2-3 3z" stroke="#ffaa00"/>
        <path d="M17.5 14.5l1.5 1.5" stroke="#ffaa00"/>
      </svg>`,
    usermgmt:
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
        <circle cx="12" cy="8" r="4"/>
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
      </svg>`,
    auditlog:
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="8" y1="13" x2="16" y2="13"/>
        <line x1="8" y1="17" x2="16" y2="17"/>
        <line x1="8" y1="9" x2="10" y2="9"/>
      </svg>`,
  };

  const TOOLBAR_ITEMS = [
    { key: 'projects',     label: 'Projects',      href: '/projects.html' },
    { key: 'meetings',     label: 'Meetings',      href: '/meetings.html' },
    { key: 'documents',    label: 'Documents',     href: '/documents.html' },
    { key: 'risks',        label: 'Risk Register', href: '/risks.html' },
    { key: 'stakeholders', label: 'Stakeholders',  href: '/stakeholders.html' },
    { key: 'actions',      label: 'Action Items',  href: '/action-items.html' },
    null, // separator — admin group below
    { key: 'usermgmt',     label: 'User Mgmt',     href: '/users.html' },
    { key: 'auditlog',     label: 'Audit Log',     href: '/audit-log.html' },
  ];

  // ── Inject context toolbar styles ────────────────────────
  function injectStyles() {
    if (document.getElementById('ctx-toolbar-styles')) return;
    const s = document.createElement('style');
    s.id = 'ctx-toolbar-styles';
    s.textContent = `
      #ctx-toolbar {
        position: fixed;
        left: 220px;
        top: 32px;
        width: 56px;
        bottom: 0;
        background: var(--bg2, #0c1628);
        border-right: 1px solid rgba(0,210,255,0.10);
        z-index: 100;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 8px 0;
        gap: 2px;
        box-shadow: 2px 0 12px rgba(0,0,0,0.25);
      }
      .ctx-sep {
        width: 32px;
        height: 1px;
        background: rgba(0,210,255,0.12);
        margin: 6px 0;
        flex-shrink: 0;
      }
      .ctx-btn {
        position: relative;
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        border-radius: 6px;
        color: rgba(160, 200, 235, 0.40);
        cursor: pointer;
        transition: background 0.15s, color 0.15s, border-left 0.15s;
        flex-shrink: 0;
        text-decoration: none;
        border-left: 2px solid transparent;
      }
      .ctx-btn:hover {
        background: rgba(0,210,255,0.08);
        color: #00d2ff;
      }
      .ctx-btn.active {
        background: rgba(0,210,255,0.10);
        color: #00d2ff;
        border-left-color: #00d2ff;
      }
      .ctx-btn svg {
        width: 22px;
        height: 22px;
        pointer-events: none;
        flex-shrink: 0;
      }
      /* Tooltip — appears to the right */
      .ctx-btn::after {
        content: attr(data-label);
        position: fixed;
        left: 278px;
        background: #0c1628;
        border: 1px solid rgba(0,210,255,0.28);
        color: #00d2ff;
        font-family: 'Barlow Condensed', sans-serif;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        white-space: nowrap;
        padding: 5px 12px;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.12s;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      }
      .ctx-btn:hover::after {
        opacity: 1;
      }
      /* Push content right when toolbar present */
      body.has-ctx-toolbar #main {
        margin-left: 56px;
      }
    `;
    document.head.appendChild(s);
  }

  // ── Build and inject context toolbar ─────────────────────
  function buildContextToolbar(currentPage) {
    document.getElementById('ctx-toolbar')?.remove();
    injectStyles();

    const bar = document.createElement('div');
    bar.id = 'ctx-toolbar';

    TOOLBAR_ITEMS.forEach(item => {
      if (item === null) {
        const sep = document.createElement('div');
        sep.className = 'ctx-sep';
        bar.appendChild(sep);
        return;
      }
      const btn = document.createElement('a');
      btn.className = 'ctx-btn';
      btn.href = item.href;
      btn.dataset.label = item.label;
      btn.innerHTML = ICONS[item.key] || '';
      // Active state
      if (currentPage && (currentPage.includes(item.href.replace('/','').replace('.html',''))
          || window.location.pathname === item.href)) {
        btn.classList.add('active');
      }
      bar.appendChild(btn);
    });

    document.body.appendChild(bar);
    document.body.classList.add('has-ctx-toolbar');
  }

  // ── Render sidebar HTML (preserves existing hud.css classes) ──
  function render(activePage, firmName, currentUser, notifCount) {
    const currentPath = window.location.pathname;

    const NAV_ITEMS = [
      { href: '/dashboard.html',  icon: '◈', label: 'Dashboard', section: 'main' },
      { href: '/gantt.html',      icon: '▤', label: 'Gantt',     section: 'main' },
      { href: '/audit-log.html',  icon: '▦', label: 'Audit Log', section: 'admin' },
      { href: '/users.html',      icon: '◑', label: 'User Mgmt', section: 'admin' },
    ];

    function navItem(item) {
      const isActive = currentPath === item.href || (activePage && activePage === item.href.replace('/',''));
      return `<a href="${item.href}" class="nav-item${isActive ? ' active' : ''}">
        <span class="nav-icon">${item.icon}</span>${item.label}
      </a>`;
    }

    const mainItems  = NAV_ITEMS.filter(n => n.section === 'main').map(navItem).join('');
    const adminItems = NAV_ITEMS.filter(n => n.section === 'admin').map(navItem).join('');

    const initStr  = UI.initials ? UI.initials(currentUser?.name || '') : (currentUser?.name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().substring(0,2);
    const roleName = currentUser?.is_admin ? 'Admin' : 'Operator';
    const notifBadge = notifCount > 0
      ? `<span class="notif-badge">${notifCount}</span>` : '';

    return `
      <div class="sidebar-logo">
        <div class="logo-mark">
          <svg viewBox="0 0 40 40" width="32" height="32">
            <polygon points="20,4 36,36 4,36" fill="none" stroke="#00d2ff" stroke-width="2"/>
            <polygon points="20,10 31,32 9,32" fill="rgba(0,210,255,0.08)" stroke="none"/>
            <circle cx="20" cy="20" r="4" fill="#00d2ff"/>
            <line x1="20" y1="14" x2="20" y2="10" stroke="#00d2ff" stroke-width="1.5"/>
          </svg>
        </div>
        <div class="logo-text">
          <div class="wordmark"><span>Project</span>HUD</div>
          <div class="firm" id="firm-name">${firmName || ''}</div>
        </div>
      </div>

      <div id="sidebar-nav">
        ${mainItems}
        <div class="nav-section-label">Admin</div>
        ${adminItems}
      </div>

      <div class="sidebar-operator">
        <div class="op-label">OPERATOR</div>
        <div class="op-user">
          <div class="op-avatar">${initStr}</div>
          <div>
            <div class="op-name">${currentUser?.name || '—'}</div>
            <div class="op-role">${roleName.toUpperCase()}</div>
          </div>
        </div>
        <div class="op-tools">
          <button class="op-btn" title="HUD Intelligence" onclick="UI && console.log('HUD Intelligence')">◈</button>
          <button class="op-btn" title="Report Issue" onclick="UI && console.log('Report Issue')">⚑</button>
          <button class="op-btn" title="Chat" onclick="UI && console.log('Chat')">◉</button>
        </div>
        <div class="op-bottom">
          <div class="op-version">
            <span class="nominal"><span class="nominal-dot"></span><span class="nominal-text">NOMINAL</span></span>
            <a href="#" style="font-size:10px;color:var(--text3);font-family:var(--font-mono);">RELEASE NOTES</a>
          </div>
          <div style="display:flex;gap:6px;align-items:center;">
            <button class="op-notif" title="Notifications">◉ <span class="notif-badge" style="${notifCount>0?'':'display:none'}">${notifCount}</span></button>
            <button class="op-logout" onclick="Auth.logout()">LOGOUT</button>
          </div>
        </div>
      </div>
    `;
  }

  // ── Public init ───────────────────────────────────────────
  async function init(activePage = '') {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    try {
      const [users, firms] = await Promise.all([
        API.getUsers(),
        API.getFirms(),
      ]);

      const userId      = await Auth.getCurrentUserId();
      const currentUser = users?.find(u => u.id === userId);
      const internalFirm = firms?.find(f => f.is_internal);

      let notifCount = 0;
      try {
        const notifs = await API.getNotifications?.();
        notifCount = notifs?.filter(n => !n.read_at)?.length || 0;
      } catch(e) {}

      sidebar.innerHTML = render(activePage, internalFirm?.name || '', currentUser, notifCount);

      // Context toolbar — dashboard only, always visible
      if (activePage === 'dashboard.html') {
        buildContextToolbar(activePage);
      }

    } catch(err) {
      console.error('Sidebar init error:', err);
      sidebar.innerHTML = render(activePage, '', null, 0);
      if (activePage === 'dashboard.html') {
        buildContextToolbar(activePage);
      }
    }
  }

  return { init };
})();