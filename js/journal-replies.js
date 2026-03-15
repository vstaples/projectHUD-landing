// ============================================================
// ProjectHUD — journal-replies.js  v4
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
  if (!body?.trim()) return null;
  if (!_currentUser) {
    if (typeof showToast==='function') showToast('You must be logged in to reply.','error');
    return null;
  }
  try {
    await API.post('journal_replies', {
      parent_id: parentId, parent_type: parentType,
      task_id: taskId, project_id: projectId,
      author_id: _currentUser.id, body: body.trim(),
    });
    const rows = await API.get(
      `journal_replies?select=id,parent_id,parent_type,task_id,author_id,body,created_at,users:author_id(name,email)&parent_id=eq.${parentId}&order=created_at.desc&limit=1`
    );
    const reply = rows?.[0];
    if (!reply) return null;
    if (!_replyCache[parentId]) _replyCache[parentId] = [];
    if (!_replyCache[parentId].find(x => x.id === reply.id)) _replyCache[parentId].push(reply);
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
    if (_replyCache[parentId]) _replyCache[parentId] = _replyCache[parentId].filter(r => r.id !== replyId);
    delete _replyCache[replyId];
    return true;
  } catch(e) {
    console.error('[Replies] deleteReply:', e.message);
    return false;
  }
}

// ── Icons ────────────────────────────────────────────────────
function _replyArrow() {
  return `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" style="display:block;">
    <path d="M2 8L7 3v3c5.5 0 8 2 8 7-1.5-3-4-4.5-8-4.5V12L2 8z" fill="currentColor"/>
  </svg>`;
}

// ── Build one reply element (no children rendered yet) ───────
function _buildReplyEl(reply, taskId, projectId, depth) {
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
  const childCount = (_replyCache[reply.id] || []).length;

  wrap.innerHTML = `
    <div class="jr-reply-row">
      <div class="jr-avatar">${initials}</div>
      <div class="jr-reply-body-wrap">
        <div class="jr-reply-meta">
          <span class="jr-author">${_esc(authorName)}</span>
          <span class="jr-ts">${ts}</span>
          <button class="jr-reply-icon-btn" title="Reply">${_replyArrow()}</button>
          ${childCount > 0 ? `<button class="jr-expand-btn" title="Show replies">▼ ${childCount}</button>` : ''}
          ${isMine ? `<button class="jr-del-btn" title="Delete">✕</button>` : ''}
        </div>
        <div class="jr-reply-text">${_esc(reply.body)}</div>
      </div>
    </div>
    <div class="jr-composer-slot"></div>
    <div class="jr-children-slot"></div>
  `;

  // Wire up buttons after innerHTML (avoids inline handler ID escaping issues)
  const replyBtn  = wrap.querySelector('.jr-reply-icon-btn');
  const expandBtn = wrap.querySelector('.jr-expand-btn');
  const delBtn    = wrap.querySelector('.jr-del-btn');

  replyBtn.addEventListener('click', () =>
    _openComposer(reply.id, 'reply', taskId, projectId, wrap)
  );
  if (expandBtn) {
    // Children start collapsed — icon shows ▼ = "click to expand"
    // We use ▼ for collapsed (pointing down = "there are replies below") 
    // and ▲ for expanded (pointing up = "click to collapse")
    expandBtn.dataset.expanded = '0';
    expandBtn.textContent = `▼ ${childCount}`;
    expandBtn.addEventListener('click', () =>
      _toggleChildren(reply.id, taskId, projectId, expandBtn, wrap, depth)
    );
  }
  if (delBtn) {
    delBtn.addEventListener('click', () => _handleDelete(reply.id, reply.parent_id, wrap));
  }

  return wrap;
}

// ── Toggle children (one level at a time) ───────────────────
function _toggleChildren(parentId, taskId, projectId, btn, containerEl, parentDepth) {
  const slot = containerEl.querySelector(':scope > .jr-children-slot');
  if (!slot) return;

  const isExpanded = btn.dataset.expanded === '1';
  const childCount = (_replyCache[parentId] || []).length;

  if (isExpanded) {
    slot.innerHTML = '';
    btn.dataset.expanded = '0';
    btn.textContent = `▼ ${childCount}`;
    btn.title = 'Show replies';
  } else {
    slot.innerHTML = '';
    (_replyCache[parentId] || []).forEach(r => {
      slot.appendChild(_buildReplyEl(r, taskId, projectId, parentDepth + 1));
    });
    btn.dataset.expanded = '1';
    btn.textContent = `▲ ${childCount}`;
    btn.title = 'Hide replies';
  }
}

// ── Inject reply thread into a journal entry ─────────────────
function injectReplyThread(journalEntryEl, journalId, taskId, projectId) {
  if (!journalId || !taskId) return;

  journalEntryEl.querySelector('.jr-thread-root')?.remove();

  const root = document.createElement('div');
  root.className = 'jr-thread-root';
  root.dataset.journalId = journalId;
  root.innerHTML = `<div class="jr-composer-slot"></div><div class="jr-children-slot"></div>`;
  journalEntryEl.appendChild(root);

  // Inject controls into .journal-header
  _injectHeaderControls(journalEntryEl, journalId, taskId, projectId);
}

function _injectHeaderControls(entryEl, journalId, taskId, projectId) {
  const header = entryEl.querySelector('.journal-header');
  if (!header) return;
  header.querySelectorAll('.jr-reply-icon-btn, .jr-expand-btn').forEach(e => e.remove());

  // Reply arrow — margin-left:auto pushes it to the right
  const replyBtn = document.createElement('button');
  replyBtn.className = 'jr-reply-icon-btn';
  replyBtn.title = 'Reply';
  replyBtn.style.marginLeft = 'auto';
  replyBtn.innerHTML = _replyArrow();
  replyBtn.addEventListener('click', () =>
    _openComposer(journalId, 'journal', taskId, projectId, entryEl)
  );
  header.appendChild(replyBtn);

  // Expand toggle — only if replies exist, ▼ = collapsed
  const childCount = (_replyCache[journalId] || []).length;
  if (childCount > 0) {
    const expandBtn = document.createElement('button');
    expandBtn.className = 'jr-expand-btn';
    expandBtn.dataset.expanded = '0';
    expandBtn.textContent = `▼ ${childCount}`;
    expandBtn.title = 'Show replies';
    expandBtn.addEventListener('click', () => {
      const root = entryEl.querySelector('.jr-thread-root');
      const slot = root?.querySelector(':scope > .jr-children-slot');
      if (!slot) return;
      const isExpanded = expandBtn.dataset.expanded === '1';
      if (isExpanded) {
        slot.innerHTML = '';
        expandBtn.dataset.expanded = '0';
        expandBtn.textContent = `▼ ${childCount}`;
        expandBtn.title = 'Show replies';
      } else {
        slot.innerHTML = '';
        (_replyCache[journalId] || []).forEach(r => {
          slot.appendChild(_buildReplyEl(r, taskId, projectId, 1));
        });
        expandBtn.dataset.expanded = '1';
        expandBtn.textContent = `▲ ${childCount}`;
        expandBtn.title = 'Hide replies';
      }
    });
    header.appendChild(expandBtn);
  }
}

// ── Open inline composer ─────────────────────────────────────
function _openComposer(parentId, parentType, taskId, projectId, containerEl) {
  document.querySelectorAll('.jr-composer').forEach(c => c.remove());

  // Find the correct composer slot:
  // For journal-entry: inside .jr-thread-root > .jr-composer-slot
  // For jr-reply-wrap: :scope > .jr-composer-slot
  let slot;
  if (containerEl.classList.contains('journal-entry')) {
    slot = containerEl.querySelector('.jr-thread-root > .jr-composer-slot');
  } else {
    slot = containerEl.querySelector(':scope > .jr-composer-slot');
  }
  if (!slot) return;

  const composer = document.createElement('div');
  composer.className = 'jr-composer';
  composer.innerHTML = `
    <textarea class="jr-textarea" placeholder="Write a reply…" rows="3"></textarea>
    <div class="jr-composer-actions">
      <button class="jr-submit-btn">SUBMIT</button>
      <button class="jr-cancel-btn">CANCEL</button>
    </div>
  `;

  composer.querySelector('.jr-submit-btn').addEventListener('click', function() {
    _submitReply(this, parentId, parentType, taskId, projectId, containerEl);
  });
  composer.querySelector('.jr-cancel-btn').addEventListener('click', () => composer.remove());

  slot.appendChild(composer);
  composer.querySelector('.jr-textarea').focus();
}

// Public wrapper kept for any inline onclick still in HTML (none expected, but safe)
function handleReplyClick(parentId, parentType, taskId, projectId, btn) {
  const container = btn.closest('.jr-reply-wrap, .jr-thread-root, .journal-entry');
  if (container) _openComposer(parentId, parentType, taskId, projectId,
    container.classList.contains('jr-thread-root') ? container.closest('.journal-entry') : container
  );
}

// ── Submit ────────────────────────────────────────────────────
async function _submitReply(btn, parentId, parentType, taskId, projectId, containerEl) {
  const composer = btn.closest('.jr-composer');
  const body = composer.querySelector('.jr-textarea').value.trim();
  if (!body) { composer.querySelector('.jr-textarea').focus(); return; }

  btn.disabled = true;
  btn.textContent = 'SAVING…';

  const reply = await saveReply(parentId, parentType, taskId, projectId, body);
  if (!reply) { btn.disabled = false; btn.textContent = 'SUBMIT'; return; }

  composer.remove();

  // Refresh controls on the parent journal entry or reply
  const journalEntry = containerEl.classList.contains('journal-entry')
    ? containerEl
    : containerEl.closest('.journal-entry');

  if (journalEntry) {
    const threadRoot = journalEntry.querySelector('.jr-thread-root');
    if (threadRoot) {
      const jId = threadRoot.dataset.journalId;
      // If replying to the top-level entry, update header controls
      if (parentId === jId) {
        _injectHeaderControls(journalEntry, jId, taskId, projectId);
        // If expanded, refresh children
        const slot = threadRoot.querySelector(':scope > .jr-children-slot');
        if (slot?.innerHTML) {
          slot.innerHTML = '';
          (_replyCache[jId] || []).forEach(r => {
            slot.appendChild(_buildReplyEl(r, taskId, projectId, 1));
          });
        }
      } else {
        // Replying to a nested reply — update that reply's expand button
        const replyWrap = journalEntry.querySelector(`[data-reply-id="${parentId}"]`);
        if (replyWrap) {
          const existExpand = replyWrap.querySelector('.jr-reply-meta > .jr-expand-btn');
          const cnt = (_replyCache[parentId] || []).length;
          if (existExpand) {
            existExpand.textContent = existExpand.dataset.expanded === '1' ? `▲ ${cnt}` : `▼ ${cnt}`;
          } else {
            const eb = document.createElement('button');
            eb.className = 'jr-expand-btn';
            eb.dataset.expanded = '0';
            eb.textContent = `▼ ${cnt}`;
            eb.title = 'Show replies';
            eb.addEventListener('click', () =>
              _toggleChildren(parentId, taskId, projectId, eb, replyWrap,
                parseInt(replyWrap.style.marginLeft || '0') / REPLY_INDENT_PX)
            );
            replyWrap.querySelector('.jr-reply-meta')?.appendChild(eb);
          }
        }
      }
    }
  }
}

// ── Delete Function ────────────────────────────────────────────────────
async function _handleDelete(replyId, parentId, wrapEl) {
  if (!confirm('Delete this reply?')) return;
  const ok = await deleteReply(replyId, parentId);
  if (ok) wrapEl.remove();
}

// ── Utilities ─────────────────────────────────────────────────
function _esc(str) {
  return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _replyRelTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff/60000);
  if (m < 1)  return 'just now';
  if (m < 60) return m+'m ago';
  const h = Math.floor(m/60);
  if (h < 24) return h+'h ago';
  const d = Math.floor(h/24);
  if (d < 7)  return d+'d ago';
  return new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric'});
}
if (typeof showToast==='undefined') window.showToast = (m,t) => console.log('[Toast]',t,m);