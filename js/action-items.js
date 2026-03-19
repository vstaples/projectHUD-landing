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

// ── Internal state ────────────────────────────────────────────────────────────
// Pages that use this module must pass their resources array via
// HUD.ActionItems.setContext({ resources, onRefresh })

let _resources   = [];
let _onRefresh   = null;  // callback to re-render the page after a change
let _attachments = {};    // { [aiId]: [{name, size, type, url, path}] }
let _commentCounts = {};  // { [aiId]: number }
let _attachedFiles = [];  // staged files in the edit drawer

// ── Context ───────────────────────────────────────────────────────────────────

function setContext({ resources, onRefresh, attachments, commentCounts }) {
  if (resources)    _resources    = resources;
  if (onRefresh)    _onRefresh    = onRefresh;
  if (attachments)  _attachments  = attachments;
  if (commentCounts) _commentCounts = commentCounts;
}

// ── Render ────────────────────────────────────────────────────────────────────

function render(ai, table, meetId) {
  return window.renderAIRow(ai, table, meetId, _resources, {
    attachments:   _attachments,
    commentCounts: _commentCounts,
  });
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
  const today     = window.todayISO();

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
        badge.textContent        = newStatus;
        badge.style.background   = newStatus === 'complete' ? 'rgba(42,157,64,.15)' : 'rgba(212,144,31,.12)';
        badge.style.color        = newStatus === 'complete' ? '#7af0a0' : 'var(--amber)';
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
        const due      = dueSpan.dataset?.due || row.dataset?.aiDue || '';
        const isOverdue = due && due < today && newStatus !== 'complete';
        dueSpan.classList.toggle('overdue', isOverdue);
        dueSpan.style.color = isOverdue ? '#f07a7a' : 'var(--muted)';
        if (due) dueSpan.textContent = (isOverdue ? '⚠ ' : '') + 'Due ' + window.fmtDate(due);
      });
    }

    // Notify page to refresh badges
    if (typeof updateActionsBadge  === 'function') updateActionsBadge();
    if (typeof updateMeetingsBadge === 'function') updateMeetingsBadge();
    if (meetId && typeof updateMeetingCardBadge === 'function') updateMeetingCardBadge(meetId);
    if (typeof renderOverview === 'function') renderOverview();

  } catch(e) {
    console.error('toggleStatus failed:', e);
    window.HUD.UI.showToast('Failed to update status.', 'error');
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

  window.closeDrawer('edit-ai-overlay');
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

  if (!desc) { window.HUD.UI.showToast('Description is required.', 'error'); return; }
  if (!id)   { window.HUD.UI.showToast('No action item ID found.', 'error'); return; }

  try {
    const patch = {
      description:    desc,
      due_date:       due || null,
      status:         status || 'open',
    };
    if (tbl === 'prospect_action_items') {
      patch.assigned_to = rid || null;
    } else {
      patch.assigned_to_resource = rid || null;
    }
    await API.patch(`${tbl}?id=eq.${id}`, patch);

    window.closeDrawer('edit-ai-overlay');
    window.HUD.UI.showToast('Action item updated.', 'success');

    if (_onRefresh) await _onRefresh();

  } catch(e) {
    console.error('saveEdit failed:', e);
    window.HUD.UI.showToast('Failed to save changes.', 'error');
  }
}

async function deleteItem() {
  const id  = document.getElementById('ai-edit-id')?.value;
  const tbl = document.getElementById('ai-edit-table')?.value || 'prospect_action_items';
  if (!id) return;
  if (!confirm('Delete this action item? This cannot be undone.')) return;
  try {
    await API.del(`${tbl}?id=eq.${id}`);
    window.closeDrawer('edit-ai-overlay');
    window.HUD.UI.showToast('Action item deleted.', 'success');
    if (_onRefresh) await _onRefresh();
  } catch(e) {
    window.HUD.UI.showToast('Failed to delete.', 'error');
  }
}

// ── Attachment helpers (used by edit drawer) ──────────────────────────────────

function getStagedFiles() { return _attachedFiles; }
function setStagedFiles(files) { _attachedFiles = files; }

function handleFileAttach(input, prospectId, aiId) {
  Array.from(input.files).forEach(f => {
    if (f.size > 20 * 1024 * 1024) {
      window.HUD.UI.showToast(f.name + ' exceeds the 20MB limit.', 'error');
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
      window.HUD.UI.showToast('Failed to upload ' + sf.name, 'warning');
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
  const today    = window.todayISO();
  const open     = items.filter(a => a.status !== 'complete');
  const hasOverdue = open.some(a => a.due_date && a.due_date < today);
  badge.textContent = open.length;
  badge.classList.toggle('overdue', hasOverdue);
}

// ── Public API ────────────────────────────────────────────────────────────────

window.HUD = window.HUD || {};
window.HUD.ActionItems = {
  setContext,
  render,
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