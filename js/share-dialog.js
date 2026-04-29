// js/share-dialog.js · Shared MY VIEWS / MY NOTES share-dialog module.
//
// Brief 2.5 (2026-04-29): extracted from my-notes.html so both surfaces can
// load the share dialog independently. MY VIEWS no longer requires MY NOTES
// to be loaded once per session for its Share button to work.
//
// EXPORTS (all on window.* — preserves Brief-2 call-site contract)
//   window._notesShowShareViewDialog
//   window._notesShowViewInviteDialog
//   window._notesLoadViewParticipants
//   window._notesGetViewParticipants
//   window._notesStartViewPresence
//   window._notesStopViewPresence
//   window._notesRenderViewPresenceStrip
//
// FALLBACK EXPORTS (installed only if the surface hasn't already provided one)
//   window._notesShowResourcePicker      — MY VIEWS has its own (PersonPicker)
//   window._notesLoadInviteResources     — MY VIEWS has its own (_loadResources)
//   window._notesGetInviteResources      — MY VIEWS has its own
//   window.PARTICIPANT_COLORS            — palette
//   window._inviteResources              — populated by load fallback
//
// LOADED BY
//   compass.html shared-scripts block (loads before mw-tabs.js fetches either
//   surface), so the functions are defined before either surface's main
//   script block runs.
//
// DEPENDENCIES (resolved at call-time, not load-time)
//   API                          — Supabase wrapper from api.js
//   compassToast                 — toast helper from ui.js
//   window._notesResource        — {id, user_id, name}
//   window._workspace            — MY NOTES workspace (for default viewName)
//   window._notesCv              — current MY NOTES view accessor (heartbeat sync)
//   window._notesRenderGrid      — MY NOTES grid renderer (heartbeat sync)
//
// PRESERVED VERBATIM FROM my-notes.html (Brief 2 state). No behavioral changes.
// notes_workspace.state interactions inside _notesViewHeartbeat are kept as-is
// per Brief 2.5 §2.5.

(function() {
'use strict';

// ── Constants ─────────────────────────────────────────────────────────────
const PARTICIPANT_COLORS = ['#E25B6B','#EF9F27','#1D9E75','#8B5CF6','#E879A0','#00B4D8'];
const FIRM_ID_FALLBACK = 'aaaaaaaa-0001-0001-0001-000000000001';

// Install palette on window only if not already present (MY VIEWS may set it).
if (!window.PARTICIPANT_COLORS) window.PARTICIPANT_COLORS = PARTICIPANT_COLORS;

// ── Module-private state ──────────────────────────────────────────────────
let _inviteResources_local = null;            // resource cache for fallback loader
const _viewParticipants     = {};              // viewKey → [participant rows]
const _viewPresenceIntervals = {};             // viewKey → setInterval id
const _viewConfigHash       = {};              // viewKey → hash of last-seen owner config
const _viewIdLookupCache    = {};              // (owner+name) → compass_views.id

function _vpViewKey(ownerUserId, viewName) {
  return ownerUserId + '::' + viewName;
}

// ── Tiny utilities ────────────────────────────────────────────────────────
function _api()        { return (typeof API !== 'undefined' && API) || window._notesAPI; }
function _firmId()     { return (typeof FIRM_ID !== 'undefined' ? FIRM_ID : null) || window.FIRM_ID || FIRM_ID_FALLBACK; }
function _toast(msg, ms) {
  try { if (typeof compassToast === 'function') compassToast(msg, ms || 3000); } catch(e) {}
}
function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Fallback resource loader (used only when surface hasn't installed one) ─
async function _fallbackLoadInviteResources() {
  if (_inviteResources_local) return _inviteResources_local;
  const api = _api();
  if (!api) { _inviteResources_local = []; return _inviteResources_local; }
  try {
    const rows = await api.get(
      'resources?select=id,first_name,last_name,email,department,title,is_external,user_id,avatar_url&order=last_name.asc&limit=200'
    ).catch(function() { return []; });
    _inviteResources_local = (Array.isArray(rows) ? rows : []).map(function(r) {
      return Object.assign({}, r, {
        name: ((r.first_name || '') + ' ' + (r.last_name || '')).trim() || r.email || r.id,
      });
    });
    window._inviteResources = _inviteResources_local;
  } catch(e) { _inviteResources_local = []; }
  return _inviteResources_local;
}

// Resolve resource cache through the surface's loader if installed; else fallback.
async function _resolveResources() {
  if (typeof window._notesLoadInviteResources === 'function' &&
      window._notesLoadInviteResources !== _fallbackLoadInviteResources) {
    try {
      const r = await window._notesLoadInviteResources();
      if (Array.isArray(r)) return r;
    } catch(e) {}
  }
  if (typeof window._notesGetInviteResources === 'function') {
    const r = window._notesGetInviteResources();
    if (Array.isArray(r) && r.length) return r;
  }
  if (Array.isArray(window._inviteResources) && window._inviteResources.length) {
    return window._inviteResources;
  }
  return _fallbackLoadInviteResources();
}

// Install fallbacks only if the surface hasn't already provided them.
if (typeof window._notesLoadInviteResources !== 'function') {
  window._notesLoadInviteResources = _fallbackLoadInviteResources;
}
if (typeof window._notesGetInviteResources !== 'function') {
  window._notesGetInviteResources = function() { return window._inviteResources || _inviteResources_local || []; };
}

// ── Resource picker (fallback only — MY VIEWS provides its own PersonPicker) ─
async function _fallbackShowResourcePicker(anchorEl, onSelect) {
  document.querySelectorAll('.notes-invite-pop').forEach(function(p) { p.remove(); });

  const pop = document.createElement('div');
  pop.className = 'notes-invite-pop';
  pop.innerHTML =
    '<div style="font-family:var(--font-mono);font-size:11px;' +
      'color:var(--text3);letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px">Select person</div>' +
    '<input id="notes-picker-input" placeholder="Search by name or department\u2026" autocomplete="off"/>' +
    '<div class="notes-invite-result" id="notes-picker-results">' +
      '<div style="padding:6px 7px;font-family:var(--font-mono);font-size:11px;color:var(--text3)">Loading\u2026</div>' +
    '</div>';

  document.body.appendChild(pop);
  const rect = anchorEl.getBoundingClientRect();
  const popW = 280;
  let left = rect.left;
  let top  = rect.bottom + 4;
  if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
  if (left < 8) left = 8;
  if (top + 400 > window.innerHeight) top = rect.top - 420;
  pop.style.left  = left + 'px';
  pop.style.top   = top  + 'px';
  pop.style.width = popW + 'px';

  const input      = pop.querySelector('#notes-picker-input');
  const resultsEl  = pop.querySelector('#notes-picker-results');
  const allRes     = await _resolveResources();

  function render(q) {
    const lower = (q||'').toLowerCase().trim();
    const filtered = allRes.filter(function(r) {
      if (!r.id) return false;
      if (!lower) return true;
      return (r.name||'').toLowerCase().includes(lower) ||
             (r.department||'').toLowerCase().includes(lower) ||
             (r.email||'').toLowerCase().includes(lower);
    });

    if (!filtered.length) {
      resultsEl.innerHTML = '<div style="padding:6px 7px;font-family:var(--font-mono);font-size:11px;color:var(--text3)">No results</div>';
      return;
    }

    const groups = {};
    filtered.forEach(function(r) {
      const grp = r.is_external ? 'External' : (r.department || 'Other');
      (groups[grp] = groups[grp] || []).push(r);
    });
    const keys = Object.keys(groups).sort(function(a,b) {
      if (a==='External') return 1; if (b==='External') return -1; return a.localeCompare(b);
    });

    let html = '';
    let colorIdx = 0;
    keys.forEach(function(grp) {
      html += '<div style="padding:4px 7px 2px;font-family:var(--font-mono,monospace);font-size:11px;' +
        'color:var(--text3);letter-spacing:.08em;text-transform:uppercase;' +
        'border-top:1px solid rgba(0,210,255,.08);margin-top:2px">' + _esc(grp) + '</div>';
      groups[grp].forEach(function(r) {
        const initials = (r.name || '?').split(' ').map(function(w){return w[0];}).join('').slice(0,2).toUpperCase();
        const color    = (window.PARTICIPANT_COLORS || PARTICIPANT_COLORS)[colorIdx++ % (window.PARTICIPANT_COLORS || PARTICIPANT_COLORS).length];
        html += '<div class="notes-invite-row" data-resid="' + _esc(r.id) + '" data-userid="' + _esc(r.user_id||'') + '" data-name="' + _esc(r.name) + '">' +
          '<div class="notes-avatar" style="background:' + color + ';color:#000">' + _esc(initials) + '</div>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-family:var(--font-mono);font-size:12px;color:var(--text0)">' + _esc(r.name) + '</div>' +
            (r.email ? '<div style="font-family:var(--font-mono,monospace);font-size:11px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _esc(r.email) + '</div>' : '') +
          '</div>' +
        '</div>';
      });
    });

    resultsEl.innerHTML = html;
    resultsEl.querySelectorAll('.notes-invite-row').forEach(function(row) {
      row.onclick = function() {
        pop.remove();
        onSelect({ id: row.dataset.resid, user_id: row.dataset.userid || null, name: row.dataset.name });
      };
    });
  }

  render('');
  input.focus();
  input.addEventListener('input', function() { render(input.value); });

  setTimeout(function() {
    document.addEventListener('mousedown', function _close(e) {
      if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('mousedown', _close); }
    });
  }, 50);
}

if (typeof window._notesShowResourcePicker !== 'function') {
  window._notesShowResourcePicker = _fallbackShowResourcePicker;
}

// ── view_id resolution (Brief 2) ──────────────────────────────────────────
async function _resolveViewId(ownerUserId, viewName) {
  if (!ownerUserId || !viewName) return null;
  const key = ownerUserId + '::' + viewName;
  if (Object.prototype.hasOwnProperty.call(_viewIdLookupCache, key)) {
    return _viewIdLookupCache[key];
  }
  const api = _api();
  if (!api) return null;
  try {
    const rows = await api.get(
      'compass_views?owner_user_id=eq.' + ownerUserId +
      '&view_name=eq.' + encodeURIComponent(viewName) +
      '&select=id&limit=1'
    ).catch(function() { return []; });
    const id = (rows && rows[0] && rows[0].id) || null;
    _viewIdLookupCache[key] = id;
    return id;
  } catch(e) {
    _viewIdLookupCache[key] = null;
    return null;
  }
}

// Load view_participants rows for a given (view_id) — bypasses name-based
// resolution. Used by the share dialog where the caller knows the target.
async function _loadParticipantsByViewId(cacheKey, viewId) {
  const api = _api();
  if (!viewId || !api) { _viewParticipants[cacheKey] = []; return _viewParticipants[cacheKey]; }
  try {
    const rows = await api.get(
      'view_participants?view_id=eq.' + viewId +
      '&select=id,view_id,user_id,view_role,tile_edit_overrides,color,invited_at,accepted_at,last_seen_at' +
      '&order=invited_at.asc'
    ).catch(function() { return []; });
    const resources = await _resolveResources();
    const palette = (window.PARTICIPANT_COLORS && window.PARTICIPANT_COLORS.length)
      ? window.PARTICIPANT_COLORS : PARTICIPANT_COLORS;
    _viewParticipants[cacheKey] = (Array.isArray(rows) ? rows : []).map(function(p) {
      const res = resources.find(function(r) { return r.user_id === p.user_id; });
      const name = res
        ? ((res.first_name || '') + ' ' + (res.last_name || '')).trim() || res.email || res.name || 'User'
        : 'User';
      return Object.assign({}, p, {
        name:     name,
        initials: name.split(' ').map(function(w) { return w[0]; }).join('').slice(0, 2).toUpperCase(),
        color:    p.color || palette[
          (Array.isArray(rows) ? rows : []).indexOf(p) % palette.length
        ],
      });
    });
  } catch(e) {
    _viewParticipants[cacheKey] = [];
  }
  return _viewParticipants[cacheKey];
}

// ── Load view_participants for a given owner+viewName (post-Brief-1 schema) ─
async function _notesLoadViewParticipants(ownerUserId, viewName) {
  const key = _vpViewKey(ownerUserId, viewName);
  const viewId = await _resolveViewId(ownerUserId, viewName);
  if (!viewId) {
    _viewParticipants[key] = [];
    return _viewParticipants[key];
  }
  const api = _api();
  if (!api) { _viewParticipants[key] = []; return _viewParticipants[key]; }
  try {
    const rows = await api.get(
      'view_participants?view_id=eq.' + viewId +
      '&select=id,view_id,user_id,view_role,tile_edit_overrides,color,invited_at,accepted_at,last_seen_at' +
      '&order=invited_at.asc'
    ).catch(function() { return []; });
    const resources = await _resolveResources();
    const palette = (window.PARTICIPANT_COLORS && window.PARTICIPANT_COLORS.length)
      ? window.PARTICIPANT_COLORS : PARTICIPANT_COLORS;
    _viewParticipants[key] = (Array.isArray(rows) ? rows : []).map(function(p) {
      const res = resources.find(function(r) { return r.user_id === p.user_id; });
      const name = res
        ? ((res.first_name || '') + ' ' + (res.last_name || '')).trim() || res.email || res.name || 'User'
        : 'User';
      return Object.assign({}, p, {
        name:     name,
        initials: name.split(' ').map(function(w) { return w[0]; }).join('').slice(0, 2).toUpperCase(),
        color:    p.color || palette[
          (Array.isArray(rows) ? rows : []).indexOf(p) % palette.length
        ],
      });
    });
  } catch(e) {
    _viewParticipants[key] = [];
  }
  return _viewParticipants[key];
}

// ── Render presence strip above the workspace grid ────────────────────────
function _notesRenderViewPresenceStrip(ownerUserId, viewName) {
  const key    = _vpViewKey(ownerUserId, viewName);
  const parts  = _viewParticipants[key] || [];
  const now    = Date.now();
  const selfId = window._notesResource && window._notesResource.user_id;

  const visible = parts.filter(function(p) {
    return p.accepted_at && p.user_id !== selfId;
  });

  let strip = document.getElementById('notes-view-presence-strip');
  if (!strip) {
    strip = document.createElement('div');
    strip.id = 'notes-view-presence-strip';
    strip.style.cssText =
      'display:flex;align-items:center;gap:5px;padding:3px 14px;' +
      'border-bottom:1px solid rgba(0,210,255,.06);flex-shrink:0;min-height:0;' +
      'background:rgba(0,210,255,.02);transition:all .2s';
    const rowEditor = document.getElementById('notes-row-editor');
    if (rowEditor && rowEditor.parentNode) {
      rowEditor.parentNode.insertBefore(strip, rowEditor.nextSibling);
    }
  }

  if (!visible.length) {
    strip.style.display = 'none';
    return;
  }

  strip.style.display = 'flex';
  strip.innerHTML =
    '<span style="font-family:var(--font-mono,monospace);font-size:11px;color:var(--text3);' +
    'letter-spacing:.08em;text-transform:uppercase;margin-right:3px">Also viewing</span>';

  visible.forEach(function(p) {
    const seenAgo = p.last_seen_at ? now - new Date(p.last_seen_at).getTime() : Infinity;
    const active  = seenAgo < 15000;
    const avatar  = document.createElement('div');
    avatar.className = 'notes-avatar' + (active ? ' active' : '');
    avatar.style.cssText =
      'width:18px;height:18px;font-size:11px;background:' + p.color +
      ';color:#000;cursor:default;flex-shrink:0';
    avatar.title    = p.name + (active ? ' (active)' : ' (away)');
    avatar.textContent = p.initials;
    strip.appendChild(avatar);
  });
}

// ── Heartbeat (Brief 2 fix preserved verbatim — notes_workspace.state read    ─
//    inside the participant-sync branch is intentional per Brief 2.5 §2.5)   ─
async function _notesViewHeartbeat(ownerUserId, viewName) {
  const userId = window._notesResource && window._notesResource.user_id;
  if (!userId) return;
  const api = _api();
  if (!api) return;

  const viewId = await _resolveViewId(ownerUserId, viewName);
  if (!viewId) return;

  let participantRow = null;
  try {
    const rows = await api.get(
      'view_participants?view_id=eq.' + viewId +
      '&user_id=eq.' + userId +
      '&select=id&limit=1'
    ).catch(function() { return []; });
    participantRow = (rows && rows[0]) || null;
  } catch(e) { participantRow = null; }
  if (!participantRow) return;

  try {
    await api.patch(
      'view_participants?id=eq.' + participantRow.id,
      { last_seen_at: new Date().toISOString() }
    );
  } catch(e) {}

  await _notesLoadViewParticipants(ownerUserId, viewName);
  _notesRenderViewPresenceStrip(ownerUserId, viewName);

  if (userId !== ownerUserId) {
    try {
      const cvRows = await api.get(
        'compass_views?id=eq.' + viewId + '&select=state&limit=1'
      ).catch(function() { return []; });
      const ownerView = cvRows && cvRows[0] && cvRows[0].state;
      if (!ownerView) return;

      const key  = _vpViewKey(ownerUserId, viewName);
      const hash = JSON.stringify({ rows: ownerView.rows, tiles: ownerView.tiles });
      if (_viewConfigHash[key] !== hash) {
        _viewConfigHash[key] = hash;
        const cvFn = window._notesCv;
        if (typeof cvFn === 'function') {
          const cv = cvFn();
          if (cv) {
            cv.rows  = JSON.parse(JSON.stringify(ownerView.rows  || []));
            cv.tiles = JSON.parse(JSON.stringify(ownerView.tiles || []));
            const newNoteIds = (ownerView.tiles || [])
              .map(function(t) { return t.noteId; })
              .filter(function(id) {
                if (!id) return false;
                const notesArr = (typeof window._notes !== 'undefined' && window._notes) || [];
                return !notesArr.find(function(n) { return n.id === id; });
              });
            if (newNoteIds.length) {
              api.get('notes?id=in.(' + newNoteIds.join(',') + ')&limit=50')
                .then(function(rows) {
                  (rows || []).forEach(function(n) {
                    const notesArr = (typeof window._notes !== 'undefined' && window._notes) || [];
                    if (!notesArr.find(function(x) { return x.id === n.id; })) notesArr.push(n);
                  });
                  if (typeof window._notesRenderGrid === 'function') window._notesRenderGrid();
                })
                .catch(function() {
                  if (typeof window._notesRenderGrid === 'function') window._notesRenderGrid();
                });
            } else {
              if (typeof window._notesRenderGrid === 'function') window._notesRenderGrid();
            }
          }
        }
      }
    } catch(e) {}
  }
}

// ── Start/stop view-level presence polling ────────────────────────────────
function _notesStartViewPresence(ownerUserId, viewName) {
  const key = _vpViewKey(ownerUserId, viewName);
  if (_viewPresenceIntervals[key]) return;
  _notesViewHeartbeat(ownerUserId, viewName);
  _viewPresenceIntervals[key] = setInterval(function() {
    _notesViewHeartbeat(ownerUserId, viewName);
  }, 5000);
}

function _notesStopViewPresence(ownerUserId, viewName) {
  const key = _vpViewKey(ownerUserId, viewName);
  clearInterval(_viewPresenceIntervals[key]);
  delete _viewPresenceIntervals[key];
  const strip = document.getElementById('notes-view-presence-strip');
  if (strip) strip.style.display = 'none';
}

window._notesStartViewPresence       = _notesStartViewPresence;
window._notesStopViewPresence        = _notesStopViewPresence;
window._notesLoadViewParticipants    = _notesLoadViewParticipants;
window._notesRenderViewPresenceStrip = _notesRenderViewPresenceStrip;
window._notesResolveViewId           = _resolveViewId;
window._notesGetViewParticipants     = function(ownerUserId, viewName) {
  return _viewParticipants[_vpViewKey(ownerUserId, viewName)] || [];
};

// ── Share View dialog (Brief 2: opts.viewId / opts.viewName) ──────────────
window._notesShowShareViewDialog = async function(opts) {
  const userId = window._notesResource && window._notesResource.user_id;
  let viewName, providedViewId;
  if (opts && (opts.viewName || opts.viewId)) {
    viewName       = opts.viewName || (window._workspace && window._workspace.activeView);
    providedViewId = opts.viewId   || null;
  } else {
    viewName       = window._workspace && window._workspace.activeView;
    providedViewId = null;
  }
  if (!userId || !viewName) return;
  const api = _api();
  if (!api) return;

  // Brief 2.5 fix: dialog uses ONLY the caller-provided view_id for its
  // participant query. No name-based resolution — name collisions across
  // surfaces (MY VIEWS "Default" vs MY NOTES "Default") would otherwise
  // surface the wrong dashboard's participants. When providedViewId is
  // null (MY NOTES surface), the participant list is empty and the Add
  // path surfaces the §7.5 toast.
  const dialogViewId = providedViewId;
  const dialogKey    = '__dialog__::' + (dialogViewId || ('noview::' + viewName));

  if (dialogViewId) {
    const myParts = await _loadParticipantsByViewId(dialogKey, dialogViewId);
    const myRow   = myParts.find(function(p) { return p.user_id === userId; });
    if (myRow && myRow.view_role === 'viewer') return;
  } else {
    _viewParticipants[dialogKey] = [];
  }

  const cvFn  = window._notesCv || window._viewsCv;
  const cv    = typeof cvFn === 'function' ? cvFn() : null;
  const tiles = (cv && cv.tiles) || [];
  const rows  = (cv && cv.rows)  || [];
  const notesArr = (typeof window._notes !== 'undefined' && window._notes) || [];

  const slots = [];
  rows.forEach(function(row) {
    const cols = Math.max(1, Math.min(8, row.columns || 2));
    for (var s = 0; s < cols; s++) {
      const tile   = tiles.find(function(t) { return t.row === row.id && t.slot === s; });
      const noteId = tile && tile.noteId;
      const note   = noteId ? notesArr.find(function(n) { return n.id === noteId; }) : null;
      slots.push({ slotKey: row.id + ':' + s, label: note ? (note.title || 'Untitled').slice(0,18) : 'Empty' });
    }
  });

  async function renderDialog() {
    if (dialogViewId) {
      await _loadParticipantsByViewId(dialogKey, dialogViewId);
    } else {
      _viewParticipants[dialogKey] = [];
    }
    const existing = _viewParticipants[dialogKey] || [];
    const others   = existing.filter(function(p) { return p.user_id !== userId; });

    function peopleRowHtml(p) {
      const isPending = !p.accepted_at;
      const roleOpts  = ['editor','viewer'].map(function(r) {
        return '<option value="' + r + '"' + (p.view_role === r ? ' selected' : '') + '>' + r[0].toUpperCase() + r.slice(1) + '</option>';
      }).join('');
      return '<div class="nvsd-person-row" data-participantid="' + _esc(p.id) + '">' +
        '<div class="notes-avatar" style="background:' + _esc(p.color||'#00D2FF') + ';color:#000;width:22px;height:22px;font-size:11px;flex-shrink:0">' + _esc(p.initials||'?') + '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-family:var(--font-mono);font-size:13px;color:var(--text0);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _esc(p.name||'Unknown') + '</div>' +
          (isPending ? '<div style="font-family:var(--font-mono,monospace);font-size:11px;color:var(--amber,#EF9F27)">Invitation pending</div>' : '') +
        '</div>' +
        '<select class="nvsd-role-sel ntd-select" data-pid="' + _esc(p.id) + '" style="font-size:11px;padding:2px 4px;width:74px">' + roleOpts + '</select>' +
        '<button class="nvsd-remove" data-pid="' + _esc(p.id) + '" style="background:none;border:none;color:rgba(226,75,74,.5);cursor:pointer;font-size:13px;padding:0 3px;line-height:1" title="Remove">\u2715</button>' +
      '</div>';
    }

    function matrixHtml() {
      if (!others.length || !slots.length) return '';
      var hdr = '<div class="nvsd-matrix-row" style="padding-bottom:3px;border-bottom:1px solid rgba(0,210,255,.08)">' +
        '<div style="width:130px;flex-shrink:0"></div>';
      slots.forEach(function(sl) {
        hdr += '<div class="nvsd-matrix-cell-hdr" title="' + _esc(sl.slotKey) + '">' + _esc(sl.label) + '</div>';
      });
      hdr += '</div>';
      var body = '';
      others.forEach(function(p) {
        const overrides   = Array.isArray(p.tile_edit_overrides) ? p.tile_edit_overrides : [];
        const myOverride  = overrides.find(function(o) { return o.user_id === p.user_id; });
        const editSlots   = new Set(myOverride ? (myOverride.slot_keys||[]) : []);
        const isEditor    = p.view_role === 'editor';
        body += '<div class="nvsd-matrix-row" data-matrixpid="' + _esc(p.id) + '">' +
          '<div style="width:130px;flex-shrink:0;font-family:var(--font-mono);font-size:12px;color:var(--text1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _esc(p.name||'Unknown') + '</div>';
        slots.forEach(function(sl) {
          const checked  = isEditor || editSlots.has(sl.slotKey);
          const disabled = isEditor;
          body += '<div class="nvsd-matrix-cell"><input type="checkbox" class="nvsd-slot-chk" data-pid="' + _esc(p.id) + '" data-uid="' + _esc(p.user_id||'') + '" data-slot="' + _esc(sl.slotKey) + '"' + (checked?' checked':'') + (disabled?' disabled title="Editor has full access"':'') + '/></div>';
        });
        body += '</div>';
      });
      return '<div style="margin-top:12px"><div class="ntd-label" style="margin-bottom:6px">Tile edit permissions <span style="text-transform:none;letter-spacing:0;color:var(--text3)">(viewers only)</span></div><div style="overflow-x:auto"><div style="min-width:max-content">' + hdr + body + '</div></div></div>';
    }

    var overlay = document.getElementById('nvsd-overlay');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = 'nvsd-overlay';
    overlay.className = 'ntd-overlay';
    document.body.appendChild(overlay);

    overlay.innerHTML =
      '<div class="ntd-dialog" style="width:540px;max-height:86vh;display:flex;flex-direction:column">' +
        '<div class="ntd-header"><div class="ntd-sub">Share View</div><div class="ntd-title">' + _esc(viewName) + '</div></div>' +
        '<div class="ntd-body" style="overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:10px">' +
          '<div><div class="ntd-label" style="margin-bottom:6px">People with access</div>' +
            '<div id="nvsd-people">' +
              (others.length ? others.map(peopleRowHtml).join('') :
                '<div style="font-family:var(--font-mono,monospace);font-size:11px;color:var(--text3)">No one else has access yet</div>') +
            '</div>' +
          '</div>' +
          '<div class="ntd-field"><label class="ntd-label">Add person</label>' +
            '<button class="ntd-input" id="nvsd-add-btn" style="text-align:left;cursor:pointer;color:rgba(0,210,255,.6);font-style:italic">Click to search\u2026</button></div>' +
          '<div id="nvsd-matrix">' + matrixHtml() + '</div>' +
        '</div>' +
        '<div class="ntd-actions">' +
          '<button class="ntd-btn ntd-btn-cancel" id="nvsd-cancel">Close</button>' +
          '<button class="ntd-btn ntd-btn-save" id="nvsd-save">Save Changes</button>' +
        '</div>' +
      '</div>';

    overlay.querySelector('#nvsd-cancel').onclick = function() {
      delete _viewParticipants[dialogKey];
      overlay.remove();
    };
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

    overlay.querySelectorAll('.nvsd-role-sel').forEach(function(sel) {
      sel.onchange = function() {
        const pid  = sel.dataset.pid;
        const part = (_viewParticipants[dialogKey]||[]).find(function(p){ return p.id===pid; });
        if (part) part.view_role = sel.value;
        overlay.querySelector('#nvsd-matrix').innerHTML = matrixHtml();
      };
    });

    overlay.querySelectorAll('.nvsd-remove').forEach(function(btn) {
      btn.onclick = async function() {
        btn.disabled = true;
        btn.style.opacity = '0.3';
        const pid  = btn.dataset.pid;
        const part = (_viewParticipants[dialogKey]||[]).find(function(p){ return p.id===pid; });
        _viewParticipants[dialogKey] = (_viewParticipants[dialogKey]||[]).filter(function(p){ return p.id !== pid; });
        try { await api.del('view_participants?id=eq.' + pid); }
        catch(e) { console.warn('[Compass] Remove view participant delete error:', e); }
        if (part && part.user_id) {
          const myName = (window._notesResource && window._notesResource.name) || 'Someone';
          api.post('notes', {
            firm_id: _firmId(), owner_user_id: part.user_id,
            title: myName + ' removed you from view: ' + viewName,
            content: myName + ' has removed your access to the shared view "' + viewName + '".',
            hierarchy_path: 'Inbox', is_inbox: true, entity_id: null, entity_type: 'view_removed',
            created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          }).catch(function(){});
        }
        renderDialog();
      };
    });

    overlay.querySelector('#nvsd-add-btn').onclick = function(e) {
      // No compass_views row → no view_id → §7.5 toast and exit before opening picker.
      if (!dialogViewId) {
        console.warn('[Compass] Share view "' + viewName + '": no compass_views row — invite skipped (see Brief 2 §7.5).');
        _toast('Sharing for this dashboard is not yet supported (Brief 2 §7.5).', 4000);
        return;
      }
      window._notesShowResourcePicker(e.currentTarget, async function(res) {
        if (!res.user_id) return;
        if (dialogViewId) await _loadParticipantsByViewId(dialogKey, dialogViewId);
        const existing2 = _viewParticipants[dialogKey] || [];
        if (existing2.some(function(p){ return p.user_id===res.user_id; })) return;
        try {
          const _vpColors = ['#E25B6B','#EF9F27','#1D9E75','#8B5CF6','#E879A0','#00B4D8'];
          const _vpColor = _vpColors[(existing2.length) % _vpColors.length];

          let participantRowId = null;
          try {
            const created = await api.post('view_participants', {
              firm_id: _firmId(),
              view_id: dialogViewId,
              user_id: res.user_id,
              view_role: 'viewer', tile_edit_overrides: {}, color: _vpColor,
              invited_at: new Date().toISOString(), accepted_at: null, last_seen_at: null,
            }, { Prefer: 'return=representation' });
            const newPart = Array.isArray(created) ? created[0] : created;
            if (newPart && newPart.id) participantRowId = newPart.id;
          } catch(eIns) { console.warn('[Compass] Add view participant insert failed:', eIns); }

          const myName = (window._notesResource && window._notesResource.name) || 'Someone';
          await api.post('notes', {
            firm_id: _firmId(), owner_user_id: res.user_id,
            title: myName + ' invited you to view: ' + viewName,
            content: myName + ' has shared the view "' + viewName + '" with you. Accept in your inbox to access it.',
            hierarchy_path: 'Inbox', is_inbox: true,
            entity_id: participantRowId, entity_type: 'view_invite',
            entity_meta: { viewId: dialogViewId, viewName: viewName },
            created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          }).catch(function(){});
        } catch(e) { console.warn('[Compass] Add view participant error:', e); }
        await renderDialog();
      });
    };

    overlay.querySelector('#nvsd-save').onclick = async function() {
      const parts2 = _viewParticipants[dialogKey] || [];
      for (var i = 0; i < parts2.length; i++) {
        var p = parts2[i];
        if (p.user_id === userId) continue;
        const checkedSlots = [];
        overlay.querySelectorAll('.nvsd-slot-chk[data-pid="' + p.id + '"]:checked:not(:disabled)').forEach(function(chk) {
          checkedSlots.push(chk.dataset.slot);
        });
        const overrides = checkedSlots.length ? [{ user_id: p.user_id, slot_keys: checkedSlots }] : {};
        try {
          await api.patch('view_participants?id=eq.' + p.id, { view_role: p.view_role, tile_edit_overrides: overrides });
        } catch(e) { console.warn('[Compass] Save view participant error:', e); }
      }
      overlay.remove();
      if (dialogViewId) await _loadParticipantsByViewId(dialogKey, dialogViewId);
    };
  }

  if (!document.getElementById('nvsd-styles')) {
    const sty = document.createElement('style');
    sty.id = 'nvsd-styles';
    sty.textContent =
      '.nvsd-person-row{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(0,210,255,.06)}' +
      '.nvsd-matrix-row{display:flex;align-items:center;gap:0;padding:3px 0}' +
      '.nvsd-matrix-cell-hdr{width:54px;flex-shrink:0;font-family:var(--font-mono,monospace);font-size:11px;color:var(--text3);text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 2px}' +
      '.nvsd-matrix-cell{width:54px;flex-shrink:0;display:flex;align-items:center;justify-content:center}' +
      '.nvsd-slot-chk{accent-color:#00D2FF;width:13px;height:13px;cursor:pointer}' +
      '.nvsd-slot-chk:disabled{opacity:.3;cursor:not-allowed}';
    document.head.appendChild(sty);
  }
  await renderDialog();
};

// ── View invite inbox dialog — accept / decline (Brief 2: view_id-aware) ──
async function _notesShowViewInviteDialog(inviteNote) {
  const titleMatch  = (inviteNote.title || '').match(/^(.+?) invited you to view: (.+)$/);
  const inviterName = titleMatch ? titleMatch[1] : 'Someone';
  const viewName    = titleMatch ? titleMatch[2] : 'a view';
  let ownerUserId = null;
  let viewId      = null;
  const participantRowId = inviteNote.entity_id || null;
  try {
    const meta = inviteNote.entity_meta
      ? (typeof inviteNote.entity_meta === 'string' ? JSON.parse(inviteNote.entity_meta) : inviteNote.entity_meta)
      : null;
    if (meta) {
      viewId      = meta.viewId      || null;
      ownerUserId = meta.ownerUserId || null;
    }
  } catch(e) {}
  const api = _api();
  if (!api) return;
  if (viewId && !ownerUserId) {
    try {
      const rows = await api.get('compass_views?id=eq.' + viewId + '&select=owner_user_id&limit=1').catch(function(){return [];});
      if (rows && rows[0]) ownerUserId = rows[0].owner_user_id;
    } catch(e) {}
  }
  if (!ownerUserId && !viewId) return;

  const overlay = document.createElement('div');
  overlay.className = 'notes-invite-dialog-overlay';
  overlay.innerHTML =
    '<div class="notes-invite-dialog">' +
      '<div class="nid-header">' +
        '<div class="nid-from">View Invitation</div>' +
        '<div class="nid-title">' + _esc(inviterName) + ' invited you to a view</div>' +
        '<div class="nid-note-name">\u229e ' + _esc(viewName) + '</div>' +
      '</div>' +
      '<div class="nid-body">' +
        _esc(inviterName) + ' has shared the view <strong style="color:#00D2FF">' + _esc(viewName) + '</strong> with you.' +
        '<br><br>Accepting will add this view to your workspace switcher. The view owner controls the layout.' +
        '<br><br>Declining will remove this invitation from your inbox.' +
      '</div>' +
      '<div class="nid-actions">' +
        '<button class="nid-btn nid-btn-reject" id="nvid-decline">\u2715 Decline</button>' +
        '<button class="nid-btn nid-btn-accept" id="nvid-accept">\u2713 Accept &amp; Open \u2192</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('mousedown', function(e) { if (e.target === overlay) overlay.remove(); });

  async function _deleteParticipantRow(selfUserId) {
    if (participantRowId) {
      try { await api.del('view_participants?id=eq.' + participantRowId); return; } catch(e) {}
    }
    if (viewId && selfUserId) {
      try { await api.del('view_participants?view_id=eq.' + viewId + '&user_id=eq.' + selfUserId); return; } catch(e) {}
    }
  }

  async function _markAcceptedAt(selfUserId) {
    if (participantRowId) {
      try { await api.patch('view_participants?id=eq.' + participantRowId, { accepted_at: new Date().toISOString() }); return; } catch(e) {}
    }
    if (viewId && selfUserId) {
      try { await api.patch('view_participants?view_id=eq.' + viewId + '&user_id=eq.' + selfUserId, { accepted_at: new Date().toISOString() }); return; } catch(e) {}
    }
  }

  overlay.querySelector('#nvid-decline').onclick = async function() {
    overlay.remove();
    const selfUserId = window._notesResource && window._notesResource.user_id;
    const notesArr = (typeof window._notes !== 'undefined' && window._notes) || null;
    if (notesArr) {
      const didx = notesArr.findIndex(function(n) { return n.id === inviteNote.id; });
      if (didx >= 0) notesArr.splice(didx, 1);
    }
    api.del('notes?id=eq.' + inviteNote.id).catch(function(){});
    if (selfUserId && (ownerUserId || viewId)) {
      await _deleteParticipantRow(selfUserId);
      const myName = (window._notesResource && window._notesResource.name) || 'Someone';
      if (ownerUserId) {
        try {
          await api.post('notes', {
            firm_id: _firmId(), owner_user_id: ownerUserId,
            title: myName + ' declined your view invitation: ' + viewName,
            content: myName + ' has declined your invitation to the view "' + viewName + '".',
            hierarchy_path: 'Inbox', is_inbox: true, entity_id: null, entity_type: null,
            created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          });
        } catch(e) {}
      }
    }
    if (typeof window._notesRenderLeft === 'function') window._notesRenderLeft();
    else if (typeof window._viewsRenderLeft === 'function') window._viewsRenderLeft();
  };

  overlay.querySelector('#nvid-accept').onclick = async function() {
    overlay.remove();
    const selfUserId = window._notesResource && window._notesResource.user_id;
    if (!selfUserId) return;

    await _markAcceptedAt(selfUserId);

    const wsKey = _vpViewKey(ownerUserId || 'unknown', viewName);
    if (window._workspace) {
      if (!window._workspace.sharedViews) window._workspace.sharedViews = {};
      window._workspace.sharedViews[wsKey] = { ownerUserId: ownerUserId, viewName: viewName, viewId: viewId, acceptedAt: new Date().toISOString() };
    }
    try {
      const wsRows = await api.get('notes_workspace?user_id=eq.' + selfUserId + '&limit=1').catch(function(){ return []; });
      const existing = wsRows && wsRows[0];
      const state = (existing && existing.state) ? existing.state : (window._workspace ? JSON.parse(JSON.stringify(window._workspace)) : {});
      if (!state.sharedViews) state.sharedViews = {};
      state.sharedViews[wsKey] = { ownerUserId: ownerUserId, viewName: viewName, viewId: viewId, acceptedAt: new Date().toISOString() };
      if (existing) {
        await api.patch('notes_workspace?user_id=eq.' + selfUserId, { state: state, updated_at: new Date().toISOString() });
      } else {
        await api.post('notes_workspace', { firm_id: _firmId(), user_id: selfUserId, state: state, updated_at: new Date().toISOString() });
      }
    } catch(e) { console.warn('[Compass] Accept view invite workspace write error:', e); }

    const notesArr = (typeof window._notes !== 'undefined' && window._notes) || null;
    if (notesArr) {
      const idx = notesArr.findIndex(function(n) { return n.id === inviteNote.id; });
      if (idx >= 0) notesArr.splice(idx, 1);
    }
    try { window._inboxLastChecked = new Date().toISOString(); } catch(e) {}
    api.del('notes?id=eq.' + inviteNote.id).catch(function(e) { console.warn('[Compass] Inbox delete error:', e); });

    if (typeof window._notesRenderLeft === 'function') window._notesRenderLeft();
    else if (typeof window._viewsRenderLeft === 'function') window._viewsRenderLeft();
    if (window._notesSwitchToSharedView) {
      if (viewId) window._notesSwitchToSharedView(viewId);
      else if (ownerUserId) window._notesSwitchToSharedView(ownerUserId, viewName);
    }
  };
}
window._notesShowViewInviteDialog = _notesShowViewInviteDialog;

})();