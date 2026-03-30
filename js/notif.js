// ============================================================
// ProjectHUD — notif.js v1.0
// Universal notification singleton: window.HUDNotif
//
// Usage:
//   HUDNotif.init(userId)              — call once from sidebar after login
//   HUDNotif.notify(userId, type, body, linkType, linkId)
//                                      — write a notification for any user
//   HUDNotif.getUnread()               — returns current unread count (from memory)
//   HUDNotif.markAllRead()             — mark all read for current user
//
// Notification types (extend as needed):
//   loe_response   — assignee submitted LOE rating on your action item
//   loe_counter    — PM countered your LOE proposal
//   loe_agreed     — LOE negotiation locked/agreed
//   task_overdue   — a task you own is overdue
//   risk_flag      — a risk flag on a project you manage
//   mention        — you were mentioned in a comment
// ============================================================

window.HUDNotif = (() => {

  // ── Internal state ───────────────────────────────────────────
  let _userId       = null;
  let _notifs       = [];       // cached notification rows
  let _pollTimer    = null;
  let _lastCount    = 0;        // unread count on last poll
  let _initialized  = false;

  const POLL_MS     = 10000;    // 10 seconds
  const TOAST_MS    = 6000;     // auto-dismiss toasts after 6s
  const FIRM_ID     = 'aaaaaaaa-0001-0001-0001-000000000001';

  // ── Type metadata ────────────────────────────────────────────
  const TYPE_META = {
    loe_response:  { glyph: '◑', color: '#00D2FF',  label: 'LOE response'    },
    loe_counter:   { glyph: '⇄', color: '#EF9F27',  label: 'LOE counter'     },
    loe_agreed:    { glyph: '✓', color: '#1D9E75',  label: 'LOE agreed'      },
    task_overdue:  { glyph: '⚑', color: '#E24B4A',  label: 'Overdue'         },
    risk_flag:     { glyph: '⚑', color: '#E24B4A',  label: 'Risk flag'       },
    mention:       { glyph: '@', color: '#8B5CF6',  label: 'Mention'         },
    new_ticket:    { glyph: '◉', color: '#00D2FF',  label: 'New ticket'      },
    ticket_update: { glyph: '◉', color: '#90B8D8',  label: 'Ticket update'   },
  };

  // ── Toast container ──────────────────────────────────────────
  function _ensureToastContainer() {
    let el = document.getElementById('hud-toast-container');
    if (!el) {
      el = document.createElement('div');
      el.id = 'hud-toast-container';
      el.style.cssText = [
        'position:fixed', 'bottom:24px', 'right:24px', 'z-index:99999',
        'display:flex', 'flex-direction:column-reverse', 'gap:8px',
        'pointer-events:none',
      ].join(';');
      document.body.appendChild(el);
    }
    return el;
  }

  function _showToast(notif) {
    const meta = TYPE_META[notif.type] || { glyph: '◈', color: '#00D2FF', label: notif.type };
    const container = _ensureToastContainer();
    const toast = document.createElement('div');
    const id = 'hud-toast-' + Date.now();
    toast.id = id;
    toast.style.cssText = [
      'background:#0a1628', 'border:1px solid rgba(0,210,255,.25)',
      'border-left:3px solid ' + meta.color,
      'padding:10px 14px', 'min-width:280px', 'max-width:380px',
      'font-family:var(--font-mono,monospace)', 'font-size:12px',
      'color:#F0F6FF', 'box-shadow:0 8px 32px rgba(0,0,0,.6)',
      'pointer-events:auto', 'cursor:pointer',
      'transition:opacity .3s', 'border-radius:3px',
    ].join(';');
    toast.innerHTML =
      '<div style="display:flex;align-items:flex-start;gap:10px">' +
        '<span style="color:' + meta.color + ';font-size:14px;flex-shrink:0;margin-top:1px">' + meta.glyph + '</span>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:' + meta.color + ';margin-bottom:3px">' + meta.label + '</div>' +
          '<div style="font-size:12px;color:#C8DFF0;line-height:1.4">' + _esc(notif.body || '') + '</div>' +
        '</div>' +
        '<span style="color:rgba(255,255,255,.25);font-size:16px;line-height:1;cursor:pointer;flex-shrink:0" onclick="document.getElementById(\'' + id + '\')?.remove()">×</span>' +
      '</div>';
    toast.addEventListener('click', () => toast.remove());
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 320);
    }, TOAST_MS);
  }

  // ── Badge update ─────────────────────────────────────────────
  function _updateBadge(count) {
    const badge = document.querySelector('.notif-badge');
    const btn   = document.querySelector('.op-notif');
    if (!badge) return;
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.style.display = count > 0 ? '' : 'none';
    if (btn) {
      btn.style.color      = count > 0 ? '#00D2FF' : '';
      btn.style.borderColor = count > 0 ? 'rgba(0,210,255,.4)' : '';
    }
  }

  // ── Poll ─────────────────────────────────────────────────────
  async function _poll() {
    if (!_userId || typeof API === 'undefined') return;
    try {
      const rows = await API.get(
        'notifications?user_id=eq.' + _userId +
        '&order=created_at.desc&limit=30'
      ).catch(() => null);
      if (!rows) return;

      _notifs = rows;
      const unread = rows.filter(n => !n.read).length;
      _updateBadge(unread);

      // Toast any new unread notifications that arrived since last poll
      if (unread > _lastCount) {
        const newOnes = rows
          .filter(n => !n.read)
          .slice(0, unread - _lastCount);
        newOnes.forEach(_showToast);
      }
      _lastCount = unread;
    } catch (e) {
      console.warn('[HUDNotif] Poll error:', e);
    }
  }

  // ── Write a notification ─────────────────────────────────────
  // Tries API.post (direct table insert) first.
  // Falls back to RPC create_notification if API exposes _url/_key.
  async function notify(userId, type, body, linkType, linkId) {
    if (!userId) { console.warn('[HUDNotif] notify() called with no userId'); return; }
    try {
      // Attempt 1: direct table insert via API.post
      const row = {
        user_id:    userId,
        type:       type,
        body:       body,
        link_type:  linkType  || null,
        link_id:    linkId    || null,
        read:       false,
        created_at: new Date().toISOString(),
      };
      const result = await API.post('notifications', row).catch(async (err) => {
        console.warn('[HUDNotif] Direct insert failed, trying RPC:', err);
        // Attempt 2: RPC create_notification (security definer, bypasses RLS)
        // Requires API to expose _url and _key (or similar)
        const base = API._url || API._base || API.url || null;
        const key  = API._key || API._anon || API.key  || null;
        if (!base || !key) throw new Error('No Supabase URL/key accessible on API object');
        const token = await Auth.getToken?.().catch(() => null);
        const r = await fetch(base + '/rest/v1/rpc/create_notification', {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'apikey':         key,
            'Authorization': 'Bearer ' + (token || key),
          },
          body: JSON.stringify({
            p_user_id:   userId,
            p_type:      type,
            p_body:      body,
            p_link_type: linkType || null,
            p_link_id:   linkId   || null,
          }),
        });
        if (!r.ok) throw new Error('RPC failed: ' + r.status);
        return await r.json();
      });
      console.log('[HUDNotif] Notification written:', type, '→', userId, result);
    } catch (e) {
      console.error('[HUDNotif] notify() failed — notification NOT delivered:', e);
    }
  }

  // ── Mark all read ────────────────────────────────────────────
  async function markAllRead() {
    if (!_userId) return;
    try {
      await API.patch('notifications?user_id=eq.' + _userId + '&read=eq.false', { read: true });
      _notifs = _notifs.map(n => ({ ...n, read: true }));
      _lastCount = 0;
      _updateBadge(0);
    } catch (e) {
      console.warn('[HUDNotif] markAllRead error:', e);
    }
  }

  // ── Mark one read ─────────────────────────────────────────────
  async function markRead(id) {
    try {
      await API.patch('notifications?id=eq.' + id, { read: true });
      _notifs = _notifs.map(n => n.id === id ? { ...n, read: true } : n);
      const unread = _notifs.filter(n => !n.read).length;
      _lastCount = unread;
      _updateBadge(unread);
    } catch (e) {
      console.warn('[HUDNotif] markRead error:', e);
    }
  }

  // ── Notification panel (opens from sidebar bell button) ──────
  function _buildPanel() {
    const existing = document.getElementById('hud-notif-panel');
    if (existing) { existing.remove(); return; }

    const btn   = document.querySelector('.op-notif');
    const rect  = btn ? btn.getBoundingClientRect() : { bottom: 100, left: 50 };

    const panel = document.createElement('div');
    panel.id = 'hud-notif-panel';
    panel.style.cssText = [
      'position:fixed',
      'top:' + (rect.bottom + 6) + 'px',
      'right:14px',
      'width:340px',
      'max-height:480px',
      'background:#080f1e',
      'border:1px solid rgba(0,210,255,.2)',
      'border-radius:4px',
      'box-shadow:0 16px 48px rgba(0,0,0,.7)',
      'z-index:9998',
      'display:flex',
      'flex-direction:column',
      'overflow:hidden',
      'font-family:var(--font-mono,monospace)',
    ].join(';');

    const unread = _notifs.filter(n => !n.read).length;

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid rgba(0,210,255,.12);flex-shrink:0';
    header.innerHTML =
      '<div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#00D2FF;flex:1">Notifications' +
        (unread > 0 ? ' <span style="color:#E24B4A">(' + unread + ')</span>' : '') +
      '</div>' +
      (unread > 0
        ? '<button onclick="window.HUDNotif.markAllRead()" style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;background:none;border:1px solid rgba(0,210,255,.2);color:#6A94B8;padding:2px 8px;cursor:pointer;margin-right:8px">Mark all read</button>'
        : '') +
      '<span onclick="document.getElementById(\'hud-notif-panel\')?.remove()" style="color:rgba(255,255,255,.3);font-size:16px;cursor:pointer;line-height:1">×</span>';

    // Body
    const body = document.createElement('div');
    body.style.cssText = 'flex:1;overflow-y:auto;min-height:0';

    if (!_notifs.length) {
      body.innerHTML = '<div style="padding:24px;text-align:center;font-size:11px;color:#3A5C80">No notifications yet.</div>';
    } else {
      body.innerHTML = _notifs.map(n => {
        const meta = TYPE_META[n.type] || { glyph: '◈', color: '#6A94B8', label: n.type };
        const age  = _fmtAge(n.created_at);
        const bg   = n.read ? '' : 'background:rgba(0,210,255,.03);';
        const dot  = n.read ? '' : '<span style="width:6px;height:6px;border-radius:50%;background:#00D2FF;flex-shrink:0;margin-top:4px"></span>';
        return '<div onclick="window.HUDNotif.markRead(\'' + n.id + '\')" style="display:flex;gap:10px;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.04);cursor:pointer;' + bg + '"' +
          ' onmouseenter="this.style.background=\'rgba(0,210,255,.06)\'" onmouseleave="this.style.background=\'' + (n.read ? '' : 'rgba(0,210,255,.03)') + '\'">' +
          '<span style="color:' + meta.color + ';font-size:14px;flex-shrink:0;margin-top:2px">' + meta.glyph + '</span>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:' + meta.color + ';margin-bottom:2px">' + meta.label + '</div>' +
            '<div style="font-size:11px;color:#C8DFF0;line-height:1.4;margin-bottom:3px">' + _esc(n.body || '') + '</div>' +
            '<div style="font-size:10px;color:#3A5C80">' + age + '</div>' +
          '</div>' +
          dot +
          '</div>';
      }).join('');
    }

    panel.appendChild(header);
    panel.appendChild(body);
    document.body.appendChild(panel);

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', function _close(e) {
        if (!panel.contains(e.target) && e.target !== btn) {
          panel.remove();
          document.removeEventListener('click', _close);
        }
      });
    }, 50);
  }

  // ── Helpers ──────────────────────────────────────────────────
  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function _fmtAge(iso) {
    if (!iso) return '';
    const mins = Math.floor((Date.now() - new Date(iso)) / 60000);
    if (mins < 1)  return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
  }

  // ── Public init ──────────────────────────────────────────────
  function init(userId) {
    if (_initialized && userId === _userId) return;
    _userId      = userId;
    _initialized = true;
    console.log('[HUDNotif] Init for user:', userId);

    // Initial poll immediately
    _poll();

    // Start polling interval
    if (_pollTimer) clearInterval(_pollTimer);
    _pollTimer = setInterval(_poll, POLL_MS);

    // Wire the sidebar bell button to open the panel
    // Use event delegation — button may not exist yet when this runs
    document.addEventListener('click', (e) => {
      if (e.target.closest('.op-notif')) {
        e.stopPropagation();
        _buildPanel();
      }
    }, true);
  }

  return {
    init,
    notify,
    markAllRead,
    markRead,
    getUnread:   () => _notifs.filter(n => !n.read).length,
    getAll:      () => [..._notifs],
    _openPanel:  _buildPanel,
  };

})();