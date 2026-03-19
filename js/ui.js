// ── HUD Platform · ui.js ────────────────────────────────────────────────────
// Shared UI utilities, formatters, renderers, and drawer management.
// Used by ProjectHUD, CadenceHUD, and all shared pages.
// Depends on: config.js, auth.js
// ────────────────────────────────────────────────────────────────────────────

// ── String & HTML helpers ────────────────────────────────────────────────────

function escHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : '';
}

// ── Date & time formatters ───────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '';
  return new Date(d.includes('T') ? d : d + 'T00:00:00')
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtRelativeDate(d) {
  // Returns "Today", "Yesterday", "3 days ago", etc.
  if (!d) return '';
  const now  = new Date();
  const date = new Date(d.includes('T') ? d : d + 'T00:00:00');
  const diff = Math.floor((now - date) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7)  return diff + ' days ago';
  return fmtDate(d);
}

function todayISO() {
  return new Date().toLocaleDateString('en-CA');
}

// ── File helpers ─────────────────────────────────────────────────────────────

function fileIcon(type) {
  if (!type) return '📄';
  if (type.startsWith('image/'))                            return '🖼';
  if (type === 'application/pdf')                           return '📕';
  if (type.includes('word') || type.includes('document'))   return '📝';
  if (type.includes('sheet') || type.includes('excel'))     return '📊';
  if (type.includes('presentation') || type.includes('powerpoint')) return '📋';
  if (type.includes('zip') || type.includes('compressed'))  return '🗜';
  return '📄';
}

// ── Storage: signed URL fetch ────────────────────────────────────────────────

async function getSignedUrl(path) {
  try {
    const token = await Auth.getFreshToken().catch(() => Auth.getToken());
    const res = await fetch(
      `${PHUD.SUPABASE_URL}/storage/v1/object/sign/attachments/${path}`,
      {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey':        PHUD.SUPABASE_KEY,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ expiresIn: 86400 }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return PHUD.SUPABASE_URL + '/storage/v1' + data.signedURL;
  } catch(e) {
    return null;
  }
}

async function uploadFile(file, storagePath) {
  // Returns { url, path } on success, throws on failure
  const token = await Auth.getFreshToken().catch(() => Auth.getToken());
  const res = await fetch(
    `${PHUD.SUPABASE_URL}/storage/v1/object/attachments/${storagePath}`,
    {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey':        PHUD.SUPABASE_KEY,
        'Content-Type':  file.type || 'application/octet-stream',
        'x-upsert':      'true',
      },
      body: file,
    }
  );
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  const url = await getSignedUrl(storagePath);
  return { url, path: storagePath };
}

// ── Drawer management ─────────────────────────────────────────────────────────

function openDrawer(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeDrawer(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

function handleOverlay(e, id) {
  if (e.target === document.getElementById(id)) closeDrawer(id);
}

// ── Toast notifications ───────────────────────────────────────────────────────

let _toastTimer = null;

function showToast(message, type = 'info', duration = 3000) {
  // type: 'info' | 'success' | 'error' | 'warning'
  let el = document.getElementById('hud-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'hud-toast';
    el.style.cssText = `
      position:fixed;bottom:24px;right:24px;z-index:9999;
      padding:10px 16px;border-radius:8px;font-size:12px;font-weight:500;
      font-family:inherit;max-width:320px;line-height:1.5;
      box-shadow:0 4px 16px rgba(0,0,0,.4);
      transition:opacity .2s;pointer-events:none;
    `;
    document.body.appendChild(el);
  }
  const colors = {
    success: ['rgba(42,157,64,.95)',  '#7af0a0'],
    error:   ['rgba(192,64,74,.95)',  '#f07a7a'],
    warning: ['rgba(212,144,31,.95)', '#ffd080'],
    info:    ['rgba(30,36,54,.97)',   '#e8eaf0'],
  };
  const [bg, color] = colors[type] || colors.info;
  el.style.background = bg;
  el.style.color = color;
  el.style.opacity = '1';
  el.textContent = message;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.style.opacity = '0'; }, duration);
}

// ── User avatar renderer ──────────────────────────────────────────────────────

function renderAvatar(name, size = 24, bgColor = 'rgba(79,142,247,.15)', textColor = 'var(--accent)') {
  const initials = (name || '?')
    .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;
    background:${bgColor};color:${textColor};
    font-size:${Math.round(size * 0.38)}px;font-weight:700;flex-shrink:0;
    display:flex;align-items:center;justify-content:center">${initials}</div>`;
}

// ── Status badge renderer ─────────────────────────────────────────────────────

function renderStatusBadge(status, overdue = false) {
  const done = status === 'complete';
  const bg    = done ? 'rgba(42,157,64,.15)' : overdue ? 'rgba(192,64,74,.12)' : 'rgba(212,144,31,.12)';
  const color = done ? '#7af0a0'             : overdue ? '#f07a7a'              : 'var(--amber)';
  return `<span data-status-badge style="font-size:10px;padding:1px 6px;border-radius:4px;
    background:${bg};color:${color}">${status || 'open'}</span>`;
}

// ── Action item row renderer (shared across all pages) ────────────────────────
// Used by: Overview panel, Actions tab, Meeting card expand, CadenceHUD meeting view
// Parameters:
//   ai         — action item record
//   table      — 'meeting_action_items' | 'prospect_action_items'
//   meetId     — meeting UUID or null
//   resources  — array of resource records (must be passed in — no global assumed)
//   opts       — { attachments, commentCounts } optional extra data

function renderAIRow(ai, table, meetId, resources, opts = {}) {
  const today       = todayISO();
  const done        = ai.status === 'complete';
  const overdue     = !done && ai.due_date && ai.due_date < today;
  const tbl         = table || ai._table || 'prospect_action_items';
  const mid         = meetId || ai.meeting_id || '';
  const rid         = ai.assigned_to_resource || ai.assigned_to || null;
  const assignee    = rid && resources ? resources.find(r => r.id === rid) : null;
  const name        = assignee ? assignee.first_name + ' ' + assignee.last_name : '—';
  const desc        = (ai.description || '').replace(/\[attachments:[^\]]*\]/g, '').trim();

  const attachments  = opts.attachments  || {};
  const commentCounts = opts.commentCounts || {};
  const hasAttach    = (attachments[ai.id]?.length > 0)
    || (ai.description && ai.description.includes('[attachments:'));
  const commentCount = commentCounts[ai.id] || 0;

  return `
    <div style="display:flex;align-items:flex-start;gap:8px;padding:9px 0;
        border-bottom:1px solid var(--border)"
        data-ai-id="${ai.id}"
        data-ai-desc="${escHtml(desc)}"
        data-ai-assigned="${rid || ''}"
        data-ai-due="${ai.due_date || ''}"
        data-ai-status="${ai.status || 'open'}"
        data-ai-table="${tbl}"
        data-ai-meetid="${mid}">
      <div style="width:16px;height:16px;border-radius:4px;flex-shrink:0;margin-top:2px;
          border:1px solid ${done ? 'var(--green)' : 'var(--border2)'};
          background:${done ? 'var(--green)' : 'transparent'};
          display:flex;align-items:center;justify-content:center;
          cursor:pointer;font-size:9px;color:#fff"
          onclick="event.stopPropagation();HUD.ActionItems.toggleFromRow(this)">
        ${done ? '✓' : ''}
      </div>
      <div style="flex:1;min-width:0;cursor:pointer"
          onclick="event.stopPropagation();HUD.ActionItems.openEditFromRow(
            this.closest('[data-ai-id]'),
            this.closest('[data-ai-id]').dataset.aiMeetid || null)">
        <div style="font-size:12px;line-height:1.45;margin-bottom:4px;
            color:${done ? 'var(--muted)' : 'var(--text)'};
            text-decoration:${done ? 'line-through' : 'none'}">
          ${escHtml(desc)}
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:4px">
            ${renderAvatar(name, 16)}
            <span style="font-size:10px;color:var(--muted)">${escHtml(name)}</span>
          </div>
          ${ai.due_date ? `<span class="ai-due${overdue ? ' overdue' : ''}" data-due="${ai.due_date}"
            style="font-size:10px;color:${overdue ? '#f07a7a' : 'var(--muted)'}">
            ${overdue ? '⚠ ' : ''}Due ${fmtDate(ai.due_date)}
          </span>` : ''}
          ${renderStatusBadge(ai.status, overdue)}
          ${hasAttach ? `<span style="font-size:10px;cursor:pointer;padding:1px 6px;
              border-radius:8px;background:rgba(255,255,255,.06);color:var(--muted)"
              title="View attachments"
              onclick="event.stopPropagation();HUD.Attachments.show('${ai.id}')">
            📎 ${attachments[ai.id]?.length || ''}
          </span>` : ''}
          ${commentCount > 0 ? `<span style="font-size:10px;padding:1px 6px;border-radius:8px;
              background:rgba(79,142,247,.12);color:var(--accent)">
            💬 ${commentCount}
          </span>` : ''}
        </div>
      </div>
    </div>`;
}

// ── Attachments popup (shared) ────────────────────────────────────────────────

async function showAttachmentsPopup(files, title = 'Attachments') {
  if (!files || !files.length) {
    showToast('No attachments yet.', 'info');
    return;
  }
  const existing = document.getElementById('hud-attach-popup');
  if (existing) existing.remove();

  const popup = document.createElement('div');
  popup.id = 'hud-attach-popup';
  popup.style.cssText = `
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    background:#1e2436;border:1px solid rgba(255,255,255,.14);border-radius:10px;
    padding:16px;z-index:300;min-width:320px;max-width:480px;
    box-shadow:0 8px 32px rgba(0,0,0,.6);font-family:inherit;
  `;
  popup.innerHTML = '<div style="color:#7a8099;text-align:center;padding:20px">Loading…</div>';
  document.body.appendChild(popup);

  // Fetch signed URLs
  const rows = await Promise.all(files.map(async f => {
    if (!f.url && f.path) f.url = await getSignedUrl(f.path);
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;
        border-bottom:1px solid rgba(255,255,255,.08)">
      <span style="font-size:16px">${fileIcon(f.type)}</span>
      <div style="flex:1;min-width:0">
        ${f.url
          ? `<a href="${f.url}" target="_blank" download="${escHtml(f.name)}"
              style="color:#4f8ef7;text-decoration:none;font-size:12px;
                display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
              onclick="event.stopPropagation()">${escHtml(f.name)}</a>`
          : `<span style="color:#e8eaf0;font-size:12px">${escHtml(f.name)}</span>`}
        <div style="font-size:10px;color:#7a8099">
          ${f.size > 0 ? (f.size / 1024).toFixed(0) + ' KB' : 'Re-upload to access'}
        </div>
      </div>
      ${f.url ? `<a href="${f.url}" target="_blank" download="${escHtml(f.name)}"
          style="color:#7a8099;font-size:14px;text-decoration:none"
          onclick="event.stopPropagation()">⬇</a>` : ''}
    </div>`;
  }));

  popup.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div style="font-size:13px;font-weight:600;color:#e8eaf0">${escHtml(title)}</div>
      <button onclick="document.getElementById('hud-attach-popup').remove()"
        style="background:none;border:none;color:#7a8099;cursor:pointer;font-size:18px;
          line-height:1;padding:0">✕</button>
    </div>
    ${rows.join('')}
    <div style="margin-top:10px;font-size:10px;color:#7a8099">
      Click filename to open · ⬇ to download
    </div>`;

  setTimeout(() => {
    document.addEventListener('click', function closePopup(e) {
      const p = document.getElementById('hud-attach-popup');
      if (p && !p.contains(e.target)) {
        p.remove();
        document.removeEventListener('click', closePopup);
      }
    });
  }, 100);
}

// ── Empty state renderer ──────────────────────────────────────────────────────

function renderEmptyState(icon, title, message, action = null) {
  return `<div style="text-align:center;padding:48px 24px;color:var(--muted)">
    <div style="font-size:36px;margin-bottom:12px">${icon}</div>
    <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:6px">${escHtml(title)}</div>
    <div style="font-size:12px;line-height:1.6;margin-bottom:${action ? '16px' : '0'}">${escHtml(message)}</div>
    ${action ? `<button class="btn btn-primary" onclick="${action.onclick}">${escHtml(action.label)}</button>` : ''}
  </div>`;
}

// ── Loading state ─────────────────────────────────────────────────────────────

function renderLoadingState(message = 'Loading…') {
  return `<div style="display:flex;align-items:center;justify-content:center;
    height:120px;color:var(--muted);font-size:13px;gap:8px">
    <div class="spinner"></div> ${escHtml(message)}
  </div>`;
}

// ── Expose shared UI namespace ────────────────────────────────────────────────
// Individual modules (action-items.js, attachments.js) register themselves
// onto window.HUD when loaded.

window.HUD = window.HUD || {};
window.HUD.UI = {
  escHtml, capitalize,
  fmtDate, fmtDateTime, fmtRelativeDate, todayISO,
  fileIcon,
  openDrawer, closeDrawer, handleOverlay,
  showToast,
  renderAvatar, renderStatusBadge, renderAIRow,
  showAttachmentsPopup,
  renderEmptyState, renderLoadingState,
};

// ── window.UI alias ───────────────────────────────────────────────────────────
// dashboard.html, sidebar.js, and any pre-core pages reference `UI.xxx`.
// Expose a legacy-compatible UI object so those pages don't break.

window.UI = {
  // Initials from a full name string — used by sidebar avatar
  initials(name) {
    return (name || '?')
      .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  },

  // Avatar HTML — used by dashboard user cards
  avatar(name, size = 32) {
    return renderAvatar(name, size);
  },

  // Format helpers — used directly in dashboard template literals
  fmtDate,
  fmtDateTime,
  fmtRelativeDate,
  capitalize,
  escHtml,

  // Status badge
  statusBadge: renderStatusBadge,

  // Toast
  toast: showToast,
};

// Also expose top-level for backward compatibility with existing pages
// (existing pages call escHtml(), fmtDate() etc. directly — no breaking change)