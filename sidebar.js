// ============================================================
// ProjectHUD — sidebar.js
// Renders the sidebar nav + operator block dynamically
// Depends on: config.js, auth.js, api.js, ui.js
// ============================================================

const Sidebar = (() => {

  const NAV_ITEMS = [
    { label: 'Dashboard',    icon: '◈', href: '/dashboard.html',      section: 'main',  badgeId: null },
    { label: 'Projects',     icon: '◧', href: '/projects.html',       section: 'main',  badgeId: 'nav-projects-count' },
    { label: 'EVM / KPIs',  icon: '◉', href: '/evm.html',            section: 'main',  badgeId: null },
    { label: 'Project Plan', icon: '▦', href: '/project-plan.html',   section: 'main',  badgeId: null },
    { label: 'Gantt',        icon: '▤', href: '/gantt.html',          section: 'main',  badgeId: null },
    { label: 'Meetings',     icon: '◎', href: '/meetings.html',       section: 'main',  badgeId: 'nav-meetings-count' },
    { label: 'Documents',    icon: '▣', href: '/documents.html',      section: 'main',  badgeId: null },
    { label: 'Risk Register',icon: '⚑', href: '/risks.html',          section: 'main',  badgeId: null },
    { label: 'Stakeholders', icon: '◑', href: '/stakeholders.html',   section: 'main',  badgeId: null },
    { label: 'Action Items', icon: '▶', href: '/action-items.html',   section: 'admin', badgeId: 'nav-actions-count' },
    { label: 'Snapshots',    icon: '◌', href: '/snapshots.html',      section: 'admin', badgeId: null },
    { label: 'Audit Log',    icon: '▦', href: '/audit-log.html',      section: 'admin', badgeId: null },
    { label: 'User Mgmt',    icon: '◑', href: '/users.html',          section: 'admin', badgeId: null },
  ];

  function render(activePage, firmName, currentUser, badges = {}) {
    const currentPath = window.location.pathname.split('/').pop() || 'dashboard.html';

    const mainItems = NAV_ITEMS.filter(n => n.section === 'main');
    const adminItems = NAV_ITEMS.filter(n => n.section === 'admin');

    function navItem(item) {
      const isActive = currentPath === item.href.replace('/', '');
      const badgeVal = item.badgeId && badges[item.badgeId];
      const badgeHTML = badgeVal
        ? `<span id="${item.badgeId}" style="margin-left:auto;background:rgba(255,71,87,0.15);border:1px solid rgba(255,71,87,0.3);color:var(--red);font-family:'Share Tech Mono',monospace;font-size:9px;font-weight:700;padding:1px 5px;border-radius:2px;min-width:18px;text-align:center;">${badgeVal}</span>`
        : item.badgeId ? `<span id="${item.badgeId}" style="display:none;"></span>` : '';

      return `<a class="nav-item${isActive ? ' active' : ''}" href="${item.href}">
        <span class="nav-icon">${item.icon}</span> ${item.label}${badgeHTML}
      </a>`;
    }

    const initStr = UI.initials(currentUser?.name || 'VS');
    const roleName = currentUser?.is_admin ? 'ADMIN' : 'TEAM MEMBER';

    return `
      <div class="sidebar-logo">
        <div class="logo-mark">
          <svg viewBox="0 0 28 28" fill="none">
            <polygon points="14,2 26,8 26,20 14,26 2,20 2,8" fill="none" stroke="#00d2ff" stroke-width="1.2"/>
            <polygon points="14,7 21,11 21,19 14,23 7,19 7,11" fill="rgba(0,210,255,0.08)" stroke="#00d2ff" stroke-width="0.7"/>
            <circle cx="14" cy="15" r="2.5" fill="#00d2ff"/>
            <line x1="14" y1="7" x2="14" y2="12.5" stroke="#00d2ff" stroke-width="1"/>
          </svg>
        </div>
        <div class="logo-text">
          <div class="wordmark">Project<span>HUD</span></div>
          <div class="firm" id="firm-name">${(firmName || '').toUpperCase()}</div>
        </div>
      </div>

      <div id="sidebar-nav">
        ${mainItems.map(navItem).join('')}
        <div class="nav-section-label">Admin</div>
        ${adminItems.map(navItem).join('')}
      </div>

      <div id="operator">
        <div class="op-label">OPERATOR</div>
        <div class="op-user">
          <div class="op-avatar" id="op-avatar">${initStr}</div>
          <div>
            <div class="op-name" id="op-name">${currentUser?.name || 'Loading...'}</div>
            <div class="op-role" id="op-role">${roleName}</div>
          </div>
        </div>
        <div class="op-tools">
          <button class="op-btn" title="HUD Intelligence" onclick="UI && console.log('HUD Intelligence')">◈</button>
          <button class="op-btn" title="Report Issue" onclick="UI && console.log('Report Issue')">⚑</button>
          <button class="op-btn" title="Chat" onclick="UI && console.log('Chat')">◉</button>
        </div>
        <div class="op-version">
          <span>${PHUD.VERSION}</span>
          <a href="#">RELEASE NOTES</a>
        </div>
        <div class="op-bottom">
          <div class="nominal">
            <div class="nominal-dot"></div>
            <span class="nominal-text">NOMINAL</span>
          </div>
          <button class="op-notif" title="Notifications" id="btn-notif">
            ◉
            <span class="notif-badge" id="notif-badge" style="display:none">0</span>
          </button>
          <button class="op-logout" id="btn-logout">LOGOUT</button>
        </div>
      </div>
    `;
  }

  async function init(activePage = '') {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    // Auth check
    if (!Auth.requireAuth()) return;

    try {
      const [users, firms] = await Promise.all([
        API.getUsers(),
        API.getFirms(),
      ]);
      const uid = Auth.getCurrentUserId();
      const currentUser = users.find(u => u.id === uid) || users.find(u => u.is_admin);
      const internalFirm = firms.find(f => f.is_internal);

      sidebar.innerHTML = render(activePage, internalFirm?.name || '', currentUser);

      // Logout handler
      document.getElementById('btn-logout')?.addEventListener('click', () => Auth.logout());

    } catch(err) {
      console.error('Sidebar init error:', err);
    }
  }

  return { init, render, NAV_ITEMS };

})();