// ── HUD Platform · action-items.js ──────────────────────────────────────────
// Shared action item module — used by ProjectHUD, CadenceHUD, and all pages
// that display, create, or manage action items from either table.
//
// Tables served:
//   prospect_action_items   — standalone items on a prospect
//   meeting_action_items    — items generated from a meeting
//
// Depends on: config.js, auth.js, api.js, ui.js
// ────────────────────────────────────────────────────────────────────────────

(function() {

// ── Internal helpers — safe fallbacks so module works on any page ─────────────

function _today() {
  return new Date().toLocaleDateString('en-CA');
}
function _fmt(d) {
  // Prefer page-level fmtDate (from ui.js) if available
  if (typeof fmtDate === 'function') return fmtDate(d);
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function _esc(s) {
  if (typeof escHtml === 'function') return escHtml(s);
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function _toast(msg, type) {
  if (typeof showToast === 'function') { showToast(msg, type); return; }
  if (window.HUD?.UI?.showToast) { window.HUD.UI.showToast(msg, type); return; }
  console[type === 'error' ? 'error' : 'log']('[ActionItems]', msg);
}
function _closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
  // Also support drawer pattern used by prospect-detail
  if (typeof window.closeDrawer === 'function') window.closeDrawer(id);
}

// ── Internal state ────────────────────────────────────────────────────────────
// Pages that use this module must pass their resources array via
// HUD.ActionItems.setContext({ resources, onRefresh })

let _resources     = [];
let _onRefresh     = null;  // callback to re-render the page after a change
let _attachments   = {};    // { [aiId]: [{name, size, type, url, path}] }
let _commentCounts = {};    // { [aiId]: number }
let _attachedFiles = [];    // staged files in the edit drawer

// ── Context ───────────────────────────────────────────────────────────────────

function setContext({ resources, onRefresh, attachments, commentCounts }) {
  if (resources)    _resources    = resources;
  if (onRefresh)    _onRefresh    = onRefresh;
  if (attachments)  _attachments  = attachments;
  if (commentCounts) _commentCounts = commentCounts;
}

// ── renderList — renders an array of action_items into a container element ────
// resolveFn(id) → { first_name, last_name } — caller provides person lookup
// Called by: projects.html _renderActionItemsList, project-detail.html overview

function renderList(listEl, items, resolveFn) {
  if (!items || items.length === 0) {
    listEl.innerHTML = '<div style="font-size:10px;color:var(--muted);font-style:italic;padding:4px 0">No action items yet.</div>';
    return;
  }
  const priColor = { critical:'#f07a7a', high:'#f07a7a', medium:'var(--amber,#d4901f)', low:'var(--muted,#7a8099)' };
  const today    = _today();

  listEl.innerHTML = items.map(item => {
    const done     = item.status === 'complete';
    const assignee = resolveFn ? resolveFn(item.responsible) : null;
    const aName    = assignee ? (assignee.first_name + ' ' + assignee.last_name).trim() : '—';
    const initials = assignee ? ((assignee.first_name[0] || '') + (assignee.last_name[0] || '')).toUpperCase() : '?';
    const pc       = priColor[item.priority] || 'var(--muted,#7a8099)';
    const overdue  = !done && item.target_date && item.target_date < today;
    const due      = item.target_date ? _fmt(item.target_date) : null;

    const badgeBg  = done ? 'rgba(42,157,64,.15)' : overdue ? 'rgba(192,64,74,.12)' : 'rgba(212,144,31,.12)';
    const badgeClr = done ? '#7af0a0'              : overdue ? '#f07a7a'             : 'var(--amber,#d4901f)';

    return `<div style="display:flex;align-items:flex-start;gap:8px;padding:7px 0;
        border-bottom:1px solid rgba(255,255,255,.04)"
        data-ai-id="${_esc(item.id)}"
        data-ai-status="${_esc(item.status||'open')}">
      <!-- Checkbox -->
      <div style="width:15px;height:15px;border-radius:4px;flex-shrink:0;margin-top:2px;
          border:1px solid ${done?'var(--green,#2a9d40)':'rgba(255,255,255,.14)'};
          background:${done?'var(--green,#2a9d40)':'transparent'};
          display:flex;align-items:center;justify-content:center;
          cursor:pointer;font-size:9px;color:#fff;user-select:none"
          onclick="event.stopPropagation();HUD.ActionItems.toggleFromRow(this)">
        ${done?'✓':''}
      </div>
      <!-- Body -->
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;font-weight:500;line-height:1.45;margin-bottom:4px;
            color:${done?'var(--muted,#7a8099)':'var(--text,#e8eaf0)'};
            text-decoration:${done?'line-through':'none'}">
          ${_esc(item.description)}
        </div>
        <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:4px">
            <div style="width:5px;height:5px;border-radius:50%;background:${pc};flex-shrink:0"></div>
            <div style="width:15px;height:15px;border-radius:50%;flex-shrink:0;
                background:rgba(79,142,247,.15);color:var(--accent,#4f8ef7);
                font-size:7px;font-weight:700;
                display:flex;align-items:center;justify-content:center">
              ${_esc(initials)}
            </div>
            <span style="font-size:10px;color:var(--muted,#7a8099)">${_esc(aName)}</span>
          </div>
          ${due ? `<span style="font-size:10px;color:${overdue?'#f07a7a':'var(--muted,#7a8099)'}"
              data-due="${_esc(item.target_date||'')}">
            ${overdue?'⚠ ':''}Due ${due}
          </span>` : ''}
          <span data-status-badge
              style="font-size:10px;padding:1px 6px;border-radius:4px;
              background:${badgeBg};color:${badgeClr}">
            ${_esc((item.status||'open').replace('_',' '))}
          </span>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── open — Add Action Item modal ──────────────────────────────────────────────
// config: {
//   table        — DB table to write to (default: 'action_items')
//   firmId       — required
//   projectId    — required
//   taskId       — optional, links item to a task + drives CoC log
//   taskName     — optional, shown in modal context line
//   projectName  — optional, shown in modal context line
//   submittedBy  — users.id of current user (required for action_items FK)
//   people       — array of optgroup entries: [{group, id, label, sub}]
//   defaultDueDays — offset from today (default: 7)
//   onSave       — async fn(savedItem) called after successful DB write
//   onCoCLog     — async fn(payload) — caller handles CoC annotation if needed
// }

function open(config) {
  const {
    table         = 'action_items',
    firmId,
    projectId,
    taskId        = null,
    taskName      = null,
    projectName   = null,
    submittedBy,
    people        = [],
    defaultDueDays = 7,
    onSave,
    onCoCLog,
  } = config;

  // Remove any stale modal
  document.getElementById('aim-modal-overlay')?.remove();

  const dueDefault = new Date(Date.now() + defaultDueDays * 86400000).toLocaleDateString('en-CA');

  // Build grouped <option> list
  // people: [{group, id, label, sub}] — already sorted by caller
  const byGroup = {};
  people.forEach(p => {
    const g = p.group || 'Other';
    if (!byGroup[g]) byGroup[g] = [];
    byGroup[g].push(p);
  });
  const resOptions = Object.entries(byGroup).map(([grp, list]) =>
    `<optgroup label="${_esc(grp)}">${list.map(p =>
      `<option value="${_esc(p.id)}">${_esc(p.label)}${p.sub?' — '+p.sub:''}</option>`
    ).join('')}</optgroup>`
  ).join('');

  const overlay = document.createElement('div');
  overlay.id        = 'aim-modal-overlay';
  overlay.className = 'hud-modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.62);z-index:900;display:flex;align-items:center;justify-content:center;';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = `
    <div style="background:var(--surf2,#1e2436);border:1px solid rgba(255,255,255,.14);
        border-radius:10px;width:500px;max-width:94vw;
        display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,.55);">
      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;
          padding:14px 18px 12px;border-bottom:1px solid rgba(255,255,255,.08);">
        <div style="font-size:13px;font-weight:700;letter-spacing:.04em">✚ Add Action Item</div>
        <button onclick="document.getElementById('aim-modal-overlay').remove()"
            style="background:none;border:none;color:var(--muted,#7a8099);cursor:pointer;
            font-size:16px;padding:2px 6px;border-radius:4px;">✕</button>
      </div>
      <!-- Body -->
      <div style="padding:16px 18px;overflow-y:auto;max-height:60vh;">
        ${(taskName||projectName) ? `
        <div style="font-size:11px;background:rgba(0,0,0,.25);padding:6px 10px;border-radius:5px;
            color:var(--muted,#7a8099);margin-bottom:14px;border-left:2px solid rgba(79,142,247,.4);">
          ${taskName  ? `Task: <strong style="color:var(--text,#e8eaf0)">${_esc(taskName)}</strong>` : ''}
          ${taskName && projectName ? ' · ' : ''}
          ${projectName ? `<span>${_esc(projectName)}</span>` : ''}
        </div>` : ''}

        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;
            color:var(--muted,#7a8099);margin-bottom:5px;">Description *</div>
        <textarea id="aim-desc" rows="3" autofocus
            placeholder="What needs to be done..."
            style="width:100%;padding:7px 10px;border:1px solid rgba(255,255,255,.14);border-radius:6px;
            background:rgba(0,0,0,.25);color:var(--text,#e8eaf0);font-size:12px;font-family:inherit;
            outline:none;resize:vertical;min-height:68px;line-height:1.5;box-sizing:border-box;"></textarea>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px;">
          <div>
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;
                color:var(--muted,#7a8099);margin-bottom:5px;">Assigned To *</div>
            <select id="aim-responsible" class="hud-select"
                style="width:100%;padding:7px 10px;border:1px solid rgba(255,255,255,.14);border-radius:6px;
                background:var(--surf2,#1e2436);color:var(--text,#e8eaf0);font-size:12px;font-family:inherit;
                outline:none;box-sizing:border-box;">
              <option value="">— Select person —</option>
              ${resOptions}
            </select>
          </div>
          <div>
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;
                color:var(--muted,#7a8099);margin-bottom:5px;">Due Date *</div>
            <input id="aim-target" type="date" value="${dueDefault}"
                style="width:100%;padding:7px 10px;border:1px solid rgba(255,255,255,.14);border-radius:6px;
                background:rgba(0,0,0,.25);color:var(--text,#e8eaf0);font-size:12px;font-family:inherit;
                outline:none;box-sizing:border-box;color-scheme:dark;">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px;">
          <div>
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;
                color:var(--muted,#7a8099);margin-bottom:5px;">Priority</div>
            <select id="aim-priority"
                style="width:100%;padding:7px 10px;border:1px solid rgba(255,255,255,.14);border-radius:6px;
                background:var(--surf2,#1e2436);color:var(--text,#e8eaf0);font-size:12px;font-family:inherit;
                outline:none;box-sizing:border-box;">
              <option value="critical">CRITICAL</option>
              <option value="high">HIGH</option>
              <option value="medium" selected>MEDIUM</option>
              <option value="low">LOW</option>
            </select>
          </div>
          <div>
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;
                color:var(--muted,#7a8099);margin-bottom:5px;">Source</div>
            <select id="aim-source"
                style="width:100%;padding:7px 10px;border:1px solid rgba(255,255,255,.14);border-radius:6px;
                background:var(--surf2,#1e2436);color:var(--text,#e8eaf0);font-size:12px;font-family:inherit;
                outline:none;box-sizing:border-box;">
              <option value="internal" selected>Internal</option>
              <option value="client_request">Client Request</option>
              <option value="meeting">Meeting</option>
            </select>
          </div>
        </div>

        <div style="margin-top:10px;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;
              color:var(--muted,#7a8099);margin-bottom:5px;">Deliverable / Expected Output</div>
          <input id="aim-deliverable" type="text" placeholder="What will be produced when this is done..."
              style="width:100%;padding:7px 10px;border:1px solid rgba(255,255,255,.14);border-radius:6px;
              background:rgba(0,0,0,.25);color:var(--text,#e8eaf0);font-size:12px;font-family:inherit;
              outline:none;box-sizing:border-box;">
        </div>

        <div style="margin-top:10px;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;
              color:var(--muted,#7a8099);margin-bottom:5px;">Comments</div>
          <textarea id="aim-comments" rows="2" placeholder="Additional context..."
              style="width:100%;padding:7px 10px;border:1px solid rgba(255,255,255,.14);border-radius:6px;
              background:rgba(0,0,0,.25);color:var(--text,#e8eaf0);font-size:12px;font-family:inherit;
              outline:none;resize:vertical;line-height:1.5;box-sizing:border-box;"></textarea>
        </div>
      </div>
      <!-- Footer -->
      <div style="padding:12px 18px;border-top:1px solid rgba(255,255,255,.08);
          display:flex;gap:8px;justify-content:flex-end;">
        <button onclick="document.getElementById('aim-modal-overlay').remove()"
            style="padding:7px 14px;border-radius:6px;cursor:pointer;
            border:1px solid rgba(255,255,255,.14);background:transparent;
            color:var(--muted,#7a8099);font-size:12px;font-family:inherit;">Cancel</button>
        <button id="aim-save-btn"
            style="padding:7px 16px;border-radius:6px;cursor:pointer;
            border:1px solid var(--accent,#4f8ef7);background:var(--accent,#4f8ef7);
            color:#fff;font-size:12px;font-weight:600;font-family:inherit;">✚ Save Action Item</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('aim-desc')?.focus(), 50);

  // Wire save button — keep all save logic here, no inline onclick with escaping nightmares
  document.getElementById('aim-save-btn').addEventListener('click', async () => {
    const desc       = document.getElementById('aim-desc')?.value?.trim();
    const responsible = document.getElementById('aim-responsible')?.value;
    const targetDate = document.getElementById('aim-target')?.value;
    const priority   = document.getElementById('aim-priority')?.value   || 'medium';
    const source     = document.getElementById('aim-source')?.value     || 'internal';
    const deliverable = document.getElementById('aim-deliverable')?.value?.trim() || null;
    const comments   = document.getElementById('aim-comments')?.value?.trim()    || null;

    if (!desc)       { _toast('Description is required', 'warning'); return; }
    if (!responsible){ _toast('Please assign to someone', 'warning'); return; }
    if (!targetDate) { _toast('Due date is required', 'warning'); return; }

    const btn = document.getElementById('aim-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    try {
      const payload = {
        firm_id:       firmId,
        project_id:    projectId || null,
        submitted_by:  submittedBy || null,
        description:   desc,
        responsible:   responsible,
        target_date:   targetDate,
        assigned_date: _today(),
        priority,
        source,
        deliverable,
        comments,
        status: 'open',
      };

      // ── Step 1: write the action item — must succeed before anything else
      const [saved] = await API.post(table, payload);

      // ── Step 2: close modal and confirm immediately
      // Done before callbacks so a slow/failing CoC log never leaves the
      // modal open or makes the user think the save itself failed.
      document.getElementById('aim-modal-overlay')?.remove();
      _toast('Action item saved', 'success');

      // ── Step 3: CoC annotation — fire-and-forget, never blocks or errors
      // A 409 unique-constraint hit on exception_annotations must not surface
      // as a user-facing failure — the action item is already written to the DB.
      if (onCoCLog) {
        onCoCLog({ ...payload, id: saved?.id, responsible })
          .catch(e => console.warn('[ActionItems] CoC log skipped:', e.message));
      }

      // ── Step 4: page refresh callback
      if (onSave) await onSave(saved || payload);

    } catch(e) {
      // Only reached if the action_items POST itself failed
      _toast('Error saving: ' + e.message, 'error');
      const retryBtn = document.getElementById('aim-save-btn');
      if (retryBtn) { retryBtn.disabled = false; retryBtn.textContent = '✚ Save Action Item'; }
    }
  });
}

// ── render — single row (used by prospect-detail via HUD.ActionItems.render) ─
function render(ai, table, meetId) {
  // Delegate to renderAIRow if it exists on the page (prospect-detail pattern)
  if (typeof window.renderAIRow === 'function') {
    return window.renderAIRow(ai, table, meetId, _resources, {
      attachments:   _attachments,
      commentCounts: _commentCounts,
    });
  }
  // Fallback: render a simple row using renderList logic
  const tmp = document.createElement('div');
  renderList(tmp, [ai], id => _resources.find(r => r.id === id) || null);
  return tmp.innerHTML;
}

// ── Toggle status from checkbox ───────────────────────────────────────────────

function toggleFromRow(el) {
  const row    = el.closest('[data-ai-id]');
  const id     = row?.dataset.aiId;
  const status = row?.dataset.aiStatus || 'open';
  const table  = row?.dataset.aiTable  || 'prospect_action_items';
  const meetId = row?.dataset.aiMeetid || null;
  if (!id) return;
  toggleStatus(id, status, el, table, meetId);
}

async function toggleStatus(id, currentStatus, el, table, meetId) {
  const tbl       = table || 'prospect_action_items';
  const newStatus = currentStatus === 'complete' ? 'open' : 'complete';
  const today     = _today();

  try {
    const patchBody = { status: newStatus };
    if (tbl === 'prospect_action_items') {
      patchBody.completed_at = newStatus === 'complete' ? new Date().toISOString() : null;
    }
    await API.patch(`${tbl}?id=eq.${id}`, patchBody);

    // Immediate visual update
    el.style.background  = newStatus === 'complete' ? 'var(--green)' : 'transparent';
    el.style.borderColor = newStatus === 'complete' ? 'var(--green)' : 'rgba(255,255,255,.14)';
    el.textContent       = newStatus === 'complete' ? '✓' : '';

    const row = el.closest('[data-ai-id]');
    if (row) {
      row.dataset.aiStatus = newStatus;

      // Status badge
      const badge = row.querySelector('[data-status-badge]');
      if (badge) {
        badge.textContent      = newStatus;
        badge.style.background = newStatus === 'complete' ? 'rgba(42,157,64,.15)' : 'rgba(212,144,31,.12)';
        badge.style.color      = newStatus === 'complete' ? '#7af0a0' : 'var(--amber)';
      }

      // Description strikethrough
      const descEl = row.querySelector('[style*="text-decoration"]');
      if (descEl) {
        descEl.style.textDecoration = newStatus === 'complete' ? 'line-through' : 'none';
        descEl.style.color          = newStatus === 'complete' ? 'var(--muted)' : 'var(--text)';
      }

      // Due date color and ⚠ prefix
      const dueSpans = row.querySelectorAll('[data-due], .ai-due');
      dueSpans.forEach(dueSpan => {
        const due       = dueSpan.dataset?.due || row.dataset?.aiDue || '';
        const isOverdue = due && due < today && newStatus !== 'complete';
        dueSpan.classList.toggle('overdue', isOverdue);
        dueSpan.style.color = isOverdue ? '#f07a7a' : 'var(--muted)';
        if (due) dueSpan.textContent = (isOverdue ? '⚠ ' : '') + 'Due ' + _fmt(due);
      });
    }

    // Notify page to refresh badges — all optional, only called if defined
    if (typeof updateActionsBadge  === 'function') updateActionsBadge();
    if (typeof updateMeetingsBadge === 'function') updateMeetingsBadge();
    if (meetId && typeof updateMeetingCardBadge === 'function') updateMeetingCardBadge(meetId);
    if (typeof renderOverview === 'function') renderOverview();

  } catch(e) {
    console.error('toggleStatus failed:', e);
    _toast('Failed to update status.', 'error');
  }
}

// ── Edit drawer ───────────────────────────────────────────────────────────────

function openEditFromRow(row, sourceMeetId) {
  if (!row) return;
  const id     = row.dataset.aiId;
  const desc   = row.dataset.aiDesc   || '';
  const rid    = row.dataset.aiAssigned || '';
  const due    = row.dataset.aiDue    || '';
  const status = row.dataset.aiStatus || 'open';
  const tbl    = row.dataset.aiTable  || 'prospect_action_items';
  const meetId = sourceMeetId || row.dataset.aiMeetid || null;
  openEditDrawer({ id, desc, rid, due, status, table: tbl, meetId });
}

function openEditDrawer({ id, desc, rid, due, status, table, meetId }) {
  // Populate fields
  const setVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val || ''; };
  setVal('ai-edit-id',       id);
  setVal('ai-edit-desc',     desc);
  setVal('ai-edit-assignee', rid);
  setVal('ai-edit-due',      due);
  setVal('ai-edit-status',   status);

  const tableEl = document.getElementById('ai-edit-table');
  if (tableEl) tableEl.value = table || 'prospect_action_items';

  const meetEl = document.getElementById('ai-edit-meetid');
  if (meetEl) meetEl.value = meetId || '';

  // Restore attachments
  _attachedFiles = _attachments[id] ? [..._attachments[id]] : [];
  if (typeof renderAttachedFiles === 'function') renderAttachedFiles();

  _closeModal('edit-ai-overlay');
  setTimeout(() => {
    const overlay = document.getElementById('edit-ai-overlay');
    if (overlay) overlay.classList.add('open');
  }, 10);
}

async function saveEdit() {
  const id     = document.getElementById('ai-edit-id')?.value;
  const desc   = document.getElementById('ai-edit-desc')?.value.trim();
  const rid    = document.getElementById('ai-edit-assignee')?.value;
  const due    = document.getElementById('ai-edit-due')?.value;
  const status = document.getElementById('ai-edit-status')?.value;
  const tbl    = document.getElementById('ai-edit-table')?.value || 'prospect_action_items';
  const meetId = document.getElementById('ai-edit-meetid')?.value || null;

  if (!desc) { _toast('Description is required.', 'error'); return; }
  if (!id)   { _toast('No action item ID found.', 'error'); return; }

  try {
    const patch = {
      description: desc,
      due_date:    due || null,
      status:      status || 'open',
    };
    if (tbl === 'prospect_action_items') {
      patch.assigned_to = rid || null;
    } else {
      patch.assigned_to_resource = rid || null;
    }
    await API.patch(`${tbl}?id=eq.${id}`, patch);

    _closeModal('edit-ai-overlay');
    _toast('Action item updated.', 'success');

    if (_onRefresh) await _onRefresh();

  } catch(e) {
    console.error('saveEdit failed:', e);
    _toast('Failed to save changes.', 'error');
  }
}

async function deleteItem() {
  const id  = document.getElementById('ai-edit-id')?.value;
  const tbl = document.getElementById('ai-edit-table')?.value || 'prospect_action_items';
  if (!id) return;
  if (!confirm('Delete this action item? This cannot be undone.')) return;
  try {
    await API.del(`${tbl}?id=eq.${id}`);
    _closeModal('edit-ai-overlay');
    _toast('Action item deleted.', 'success');
    if (_onRefresh) await _onRefresh();
  } catch(e) {
    _toast('Failed to delete.', 'error');
  }
}

// ── Attachment helpers (used by edit drawer) ──────────────────────────────────

function getStagedFiles() { return _attachedFiles; }
function setStagedFiles(files) { _attachedFiles = files; }

function handleFileAttach(input, prospectId, aiId) {
  Array.from(input.files).forEach(f => {
    if (f.size > 20 * 1024 * 1024) {
      _toast(f.name + ' exceeds the 20MB limit.', 'error');
      return;
    }
    _attachedFiles.push({ name: f.name, size: f.size, type: f.type, file: f });
  });
  input.value = '';
  if (typeof renderAttachedFiles === 'function') renderAttachedFiles();
}

function removeAttachment(index) {
  _attachedFiles.splice(index, 1);
  if (typeof renderAttachedFiles === 'function') renderAttachedFiles();
}

async function uploadStagedFiles(prospectId, aiId) {
  if (!_attachedFiles.some(f => f.file)) return;
  const key = aiId;
  if (!_attachments[key]) _attachments[key] = [];

  for (const sf of _attachedFiles.filter(f => f.file)) {
    const path = `${prospectId}/${aiId}/${Date.now()}_${sf.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    try {
      const { url } = await window.uploadFile(sf.file, path);
      if (url) _attachments[key].push({ name: sf.name, size: sf.size, type: sf.type, url, path });
    } catch(e) {
      _toast('Failed to upload ' + sf.name, 'warning');
    }
  }
  // Clear staged file objects (keep already-uploaded entries)
  _attachedFiles = _attachedFiles.filter(f => !f.file);
}

// ── Comments ─────────────────────────────────────────────────────────────────
// Comment threads on action items — stored as prospect_activities tagged [ai-comment:ID]

async function postComment(aiId, text, prospectId, resourceId) {
  if (!text?.trim()) return;
  await API.post('prospect_activities', {
    prospect_id: prospectId,
    type:        'note',
    date:        new Date().toISOString(),
    summary:     text.trim() + ` [ai-comment:${aiId}]`,
    ...(resourceId ? { created_by: resourceId } : {}),
  });
}

// ── Badge helpers (page-level — called if page defines these elements) ─────────

function updateBadge(badgeId, items) {
  const badge = document.getElementById(badgeId);
  if (!badge) return;
  const today      = _today();
  const open       = items.filter(a => a.status !== 'complete');
  const hasOverdue = open.some(a => a.due_date && a.due_date < today);
  badge.textContent = open.length;
  badge.classList.toggle('overdue', hasOverdue);
}

// ── Public API ────────────────────────────────────────────────────────────────

window.HUD = window.HUD || {};
window.HUD.ActionItems = {
  setContext,
  open,
  render,
  renderList,
  toggleFromRow,
  toggleStatus,
  openEditFromRow,
  openEditDrawer,
  saveEdit,
  deleteItem,
  handleFileAttach,
  removeAttachment,
  uploadStagedFiles,
  getStagedFiles,
  setStagedFiles,
  postComment,
  updateBadge,
};

})();