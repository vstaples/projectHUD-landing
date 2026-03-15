// ============================================================
// ProjectHUD — journal-replies.js  v3
// Uses API + Auth globals. Expand/collapse nested replies.
// ============================================================

const REPLY_INDENT_PX  = 24;
const REPLY_MAX_INDENT = 5;

let _replyCache  = {};
let _currentUser = null;

async function initReplies() {
  try {
    const userId = await Auth.getCurrentUserId();
    if (userId) _currentUser = { id: userId };
  } catch(e) {
    console.warn('[Replies] initReplies:', e.message);
  }
}

async function loadRepliesForProject(projectId) {
  try {
    const data = await API.get(
      `journal_replies?select=id,parent_id,parent_type,task_id,author_id,body,created_at,users:author_id(name,email)&project_id=eq.${projectId}&order=created_at.asc`
    );
    _replyCache = {};
    (data || []).forEach(r => {
      if (!_replyCache[r.parent_id]) _replyCache[r.parent_id] = [];
      _replyCache[r.parent_id].push(r);
    });
  } catch(e) {
    console.error('[Replies] loadRepliesForProject:', e.message);
  }
}

async function loadRepliesForTask(taskId) {
  try {
    const data = await API.get(
      `journal_replies?select=id,parent_id,parent_type,task_id,author_id,body,created_at,users:author_id(name,email)&task_id=eq.${taskId}&order=created_at.asc`
    );
    (data || []).forEach(r => {
      if (!_replyCache[r.parent_id]) _replyCache[r.parent_id] = [];
      if (!_replyCache[r.parent_id].find(x => x.id === r.id)) {
        _replyCache[r.parent_id].push(r);
      }
    });
  } catch(e) {
    console.error('[Replies] loadRepliesForTask:', e.message);
  }
}

async function saveReply(parentId, parentType, taskId, projectId, body) {
  if (!body || !body.trim()) return null;
  if (!_currentUser) {
    if (typeof showToast==='function') showToast('You must be logged in to reply.','error');
    return null;
  }
  const payload = {
    parent_id:   parentId,
    parent_type: parentType,
    task_id:     taskId,
    project_id:  projectId,
    author_id:   _currentUser.id,
    body:        body.trim(),
  };
  try {
    await API.post('journal_replies', payload);
    const rows = await API.get(
      `journal_replies?select=id,parent_id,parent_type,task_id,author_id,body,created_at,users:author_id(name,email)&parent_id=eq.${parentId}&order=created_at.desc&limit=1`
    );
    const reply = rows?.[0];
    if (!reply) return null;
    if (!_replyCache[parentId]) _replyCache[parentId] = [];
    if (!_replyCache[parentId].find(x => x.id === reply.id)) {
      _replyCache[parentId].push(reply);
    }
    return reply;
  } catch(e) {
    console.error('[Replies] saveReply:', e.message);
    if (typeof showToast==='function') showToast('Failed to save reply.','error');
    return null;
  }
}

async function deleteReply(replyId, parentId) {
  try {
    await API.del(`journal_replies?id=eq.${replyId}`);
    if (_replyCache[parentId]) {
      _replyCache[parentId] = _replyCache[parentId].filter(r => r.id !== replyId);
    }
    delete _replyCache[replyId];
    return true;
  } catch(e) {
    console.error('[Replies] deleteReply:', e.message);
    if (typeof showToast==='function') showToast('Failed to delete reply.','error');
    return false;
  }
}

// ── Reply arrow icon ────────────────────────────────────────
function _replyIcon() {
  return `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" style="display:block;">
    <path d="M2 8L7 3v3c5.5 0 8 2 8 7-1.5-3-4-4.5-8-4.5V12L2 8z" fill="currentColor"/>
  </svg>`;
}

// ── Expand/collapse triangle ────────────────────────────────
function _expandIcon(expanded) {
  // ▶ collapsed, ▼ expanded
  return expanded ? '▼' : '▶';
}

// ── Toggle expand/collapse of ONE level of replies ──────────
function toggleReplies(parentId, taskId, projectId, btn) {
  const childrenSlot = btn.closest('[data-reply-id], [data-journal-id]')
                          ?.querySelector(':scope > .jr-children-slot');
  if (!childrenSlot) return;

  const isExpanded = childrenSlot.dataset.expanded === '1';

  if (isExpanded) {
    // Collapse: clear children
    childrenSlot.innerHTML = '';
    childrenSlot.dataset.expanded = '0';
    btn.textContent = _expandIcon(false);
    btn.title = 'Show replies';
  } else {
    // Expand: render ONE level only (direct children)
    childrenSlot.innerHTML = '';
    const directReplies = _replyCache[parentId] || [];
    directReplies.forEach(reply => {
      const wrap = _buildSingleReply(reply, taskId, projectId, 1);
      childrenSlot.appendChild(wrap);
    });
    childrenSlot.dataset.expanded = '1';
    btn.textContent = _expandIcon(true);
    btn.title = 'Hide replies';
  }
}

// ── Build a single reply element (one level, no children rendered) ──
function _buildSingleReply(reply, taskId, projectId, depth) {
  const wrap = document.createElement('div');
  wrap.className = 'jr-reply-wrap';
  wrap.dataset.replyId = reply.id;
  const indentPx = Math.min(depth, REPLY_MAX_INDENT) * REPLY_INDENT_PX;
  wrap.style.marginLeft = indentPx + 'px';
  wrap.style.borderLeft = '1px solid rgba(0,210,255,0.18)';
  wrap.style.paddingLeft = '10px';

  const authorName = reply.users?.name || reply.users?.email?.split('@')[0] || 'Unknown';
  const initials   = authorName.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
  const ts         = _replyRelTime(reply.created_at);
  const isMine     = _currentUser && reply.author_id === _currentUser.id;
  const hasChildren = (_replyCache[reply.id] || []).length > 0;
  const childCount  = hasChildren ? (_replyCache[reply.id] || []).length : 0;

  wrap.innerHTML = `
    <div class="jr-reply-row">
      <div class="jr-avatar">${initials}</div>
      <div class="jr-reply-body-wrap">
        <div class="jr-reply-meta">
          <span class="jr-author">${_esc(authorName)}</span>
          <span class="jr-ts">${ts}</span>
          <button class="jr-reply-icon-btn" title="Reply"
            onclick="handleReplyClick('${reply.id}','reply','${taskId}','${projectId}',this)">
            ${_replyIcon()}
          </button>
          ${isMine ? `<button class="jr-del-btn" title="Delete" onclick="handleDeleteReply('${reply.id}','${reply.parent_id || ''}',this)">✕</button>` : ''}
          ${hasChildren ? `<button class="jr-expand-btn" title="Show replies"
            onclick="toggleReplies('${reply.id}','${taskId}','${projectId}',this)">▶ ${childCount}</button>` : ''}
        </div>
        <div class="jr-reply-text">${_esc(reply.body)}</div>
      </div>
    </div>
    <div class="jr-composer-slot"></div>
    <div class="jr-children-slot" data-expanded="0"></div>
  `;

  return wrap;
}

// ── Inject reply thread into a journal entry element ────────
function injectReplyThread(journalEntryEl, journalId, taskId, projectId) {
  if (!journalId || !taskId) return;

  const existing = journalEntryEl.querySelector('.jr-thread-root');
  if (existing) existing.remove();

  const root = document.createElement('div');
  root.className = 'jr-thread-root';
  root.dataset.journalId = journalId;

  const directReplies = _replyCache[journalId] || [];
  const replyCount = directReplies.length;

  // Build: expand toggle (only if replies exist) + composer slot + children slot
  root.innerHTML = `
    <div class="jr-composer-slot"></div>
    <div class="jr-children-slot" data-expanded="0"></div>
  `;

  journalEntryEl.appendChild(root);

  // Inject reply icon + optional expand toggle into the journal-header
  _injectHeaderControls(journalEntryEl, journalId, taskId, projectId, replyCount);
}

// ── Inject controls into .journal-header ────────────────────
function _injectHeaderControls(entryEl, journalId, taskId, projectId, replyCount) {
  const header = entryEl.querySelector('.journal-header');
  if (!header) return;

  // Remove any previously injected controls
  header.querySelectorAll('.jr-reply-icon-btn, .jr-expand-btn').forEach(e => e.remove());

  // Reply arrow — right-aligned via margin-left:auto
  const replyBtn = document.createElement('button');
  replyBtn.className = 'jr-reply-icon-btn';
  replyBtn.title = 'Reply';
  replyBtn.style.marginLeft = 'auto';
  replyBtn.innerHTML = _replyIcon();
  replyBtn.onclick = () => handleReplyClick(journalId, 'journal', taskId, projectId, replyBtn);
  header.appendChild(replyBtn);

  // Expand toggle — only shown when replies exist
  if (replyCount > 0) {
    const expandBtn = document.createElement('button');
    expandBtn.className = 'jr-expand-btn';
    expandBtn.title = 'Show replies';
    expandBtn.textContent = `▶ ${replyCount}`;
    expandBtn.onclick = () => toggleReplies(journalId, taskId, projectId, expandBtn);
    header.appendChild(expandBtn);
  }
}

// ── Composer open/close ──────────────────────────────────────
function handleReplyClick(parentId, parentType, taskId, projectId, triggerBtn) {
  document.querySelectorAll('.jr-composer').forEach(c => c.remove());

  // Find the nearest jr-thread-root or jr-reply-wrap ancestor
  const container = triggerBtn.closest('.jr-reply-wrap, .jr-thread-root, .journal-entry');
  if (!container) return;

  let slot;
  if (container.classList.contains('journal-entry')) {
    slot = container.querySelector('.jr-thread-root > .jr-composer-slot');
  } else {
    slot = container.querySelector(':scope > .jr-composer-slot');
  }
  if (!slot) return;

  if (slot.querySelector('.jr-composer')) { slot.innerHTML = ''; return; }

  const composer = document.createElement('div');
  composer.className = 'jr-composer';
  composer.innerHTML = `
    <textarea class="jr-textarea" placeholder="Write a reply…" rows="3"></textarea>
    <div class="jr-composer-actions">
      <button class="jr-submit-btn"
        onclick="handleReplySubmit(this,'${parentId}','${parentType}','${taskId}','${projectId}')">SUBMIT</button>
      <button class="jr-cancel-btn" onclick="this.closest('.jr-composer').remove()">CANCEL</button>
    </div>
  `;

  slot.appendChild(composer);
  composer.querySelector('.jr-textarea').focus();
}

// ── Submit ───────────────────────────────────────────────────
async function handleReplySubmit(btn, parentId, parentType, taskId, projectId) {
  const composer = btn.closest('.jr-composer');
  const textarea = composer.querySelector('.jr-textarea');
  const body = textarea.value.trim();
  if (!body) { textarea.focus(); return; }

  btn.disabled = true;
  btn.textContent = 'SAVING…';

  const reply = await saveReply(parentId, parentType, taskId, projectId, body);
  if (!reply) { btn.disabled = false; btn.textContent = 'SUBMIT'; return; }

  composer.remove();

  // Re-render the parent entry's controls (update reply count on expand btn)
  const journalEntry = document.querySelector(`.jr-thread-root[data-journal-id="${parentId}"]`)?.closest('.journal-entry');
  const replyWrap    = document.querySelector(`[data-reply-id="${parentId}"]`);

  if (journalEntry) {
    // Top-level reply to a journal entry — refresh header controls
    const directCount = (_replyCache[parentId] || []).length;
    _injectHeaderControls(journalEntry, parentId, taskId, projectId, directCount);
    // If children slot is expanded, refresh it
    const slot = journalEntry.querySelector('.jr-thread-root > .jr-children-slot');
    if (slot?.dataset.expanded === '1') {
      slot.innerHTML = '';
      (_replyCache[parentId] || []).forEach(r => {
        slot.appendChild(_buildSingleReply(r, taskId, projectId, 1));
      });
    }
  } else if (replyWrap) {
    // Reply to a reply — refresh the expand button on that reply
    const existingExpand = replyWrap.querySelector(':scope > .jr-reply-row .jr-expand-btn');
    const childCount = (_replyCache[parentId] || []).length;
    if (existingExpand) {
      existingExpand.textContent = `${existingExpand.textContent.startsWith('▼') ? '▼' : '▶'} ${childCount}`;
    } else {
      // Add expand button
      const meta = replyWrap.querySelector('.jr-reply-meta');
      if (meta) {
        const eb = document.createElement('button');
        eb.className = 'jr-expand-btn';
        eb.title = 'Show replies';
        eb.textContent = `▶ ${childCount}`;
        eb.onclick = () => toggleReplies(parentId, taskId, projectId, eb);
        meta.appendChild(eb);
      }
    }
  }
}

// ── Delete ───────────────────────────────────────────────────
async function handleDeleteReply(replyId, parentId, btn) {
  if (!confirm('Delete this reply?')) return;
  const ok = await deleteReply(replyId, parentId);
  if (ok) {
    const wrap = document.querySelector(`[data-reply-id="${replyId}"]`);
    if (wrap) wrap.remove();
  }
}

// ── Utilities ────────────────────────────────────────────────
function _esc(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _replyRelTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  if (days < 7)  return days + 'd ago';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

if (typeof showToast === 'undefined') {
  window.showToast = function(msg, type) { console.log('[Toast]', type, msg); };
}