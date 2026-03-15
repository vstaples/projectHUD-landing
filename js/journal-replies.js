// ============================================================
// ProjectHUD — journal-replies.js
// Threaded replies on task_journal entries
// Include AFTER config.js and api.js in project-detail.html
// ============================================================

// ── Constants ──────────────────────────────────────────────
const REPLY_INDENT_PX   = 24;   // px indent per depth level
const REPLY_MAX_INDENT  = 5;    // cap visual indent at 5 levels
const REPLY_AVATAR_SIZE = 26;   // px

// ── State ──────────────────────────────────────────────────
// Map of parentId → [reply objects]
let _replyCache = {};           // populated by loadRepliesForJournal()
let _currentUser = null;        // set by initReplies()

// ── Init ───────────────────────────────────────────────────
async function initReplies() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    _currentUser = user;
  } catch(e) { /* anon fallback */ }
}

// ── Load all replies for a project (batch, one query) ──────
async function loadRepliesForProject(projectId) {
  const { data, error } = await supabase
    .from('journal_replies')
    .select(`
      id, parent_id, parent_type, task_id, author_id, body, created_at,
      users:author_id ( full_name, email, avatar_url )
    `)
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  if (error) { console.error('[Replies] load error:', error); return; }

  // Group by parent_id
  _replyCache = {};
  (data || []).forEach(r => {
    if (!_replyCache[r.parent_id]) _replyCache[r.parent_id] = [];
    _replyCache[r.parent_id].push(r);
  });
}

// ── Load replies for a specific task (slide-in panel) ──────
async function loadRepliesForTask(taskId) {
  const { data, error } = await supabase
    .from('journal_replies')
    .select(`
      id, parent_id, parent_type, task_id, author_id, body, created_at,
      users:author_id ( full_name, email, avatar_url )
    `)
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });

  if (error) { console.error('[Replies] task load error:', error); return; }

  // Merge into cache without clearing other tasks
  (data || []).forEach(r => {
    if (!_replyCache[r.parent_id]) _replyCache[r.parent_id] = [];
    // Avoid duplicates
    if (!_replyCache[r.parent_id].find(x => x.id === r.id)) {
      _replyCache[r.parent_id].push(r);
    }
  });
}

// ── Save a new reply ────────────────────────────────────────
async function saveReply(parentId, parentType, taskId, projectId, body) {
  if (!body || !body.trim()) return null;
  if (!_currentUser) {
    showToast('You must be logged in to reply.', 'error');
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

  const { data, error } = await supabase
    .from('journal_replies')
    .insert(payload)
    .select(`
      id, parent_id, parent_type, task_id, author_id, body, created_at,
      users:author_id ( full_name, email, avatar_url )
    `)
    .single();

  if (error) { console.error('[Replies] save error:', error); showToast('Failed to save reply.', 'error'); return null; }

  // Update local cache
  if (!_replyCache[parentId]) _replyCache[parentId] = [];
  _replyCache[parentId].push(data);

  return data;
}

// ── Delete a reply ──────────────────────────────────────────
async function deleteReply(replyId, parentId) {
  const { error } = await supabase.from('journal_replies').delete().eq('id', replyId);
  if (error) { showToast('Failed to delete reply.', 'error'); return false; }

  // Remove from cache
  if (_replyCache[parentId]) {
    _replyCache[parentId] = _replyCache[parentId].filter(r => r.id !== replyId);
  }
  // Also clear any children of this reply
  delete _replyCache[replyId];
  return true;
}

// ── Render reply thread (recursive) ────────────────────────
// Returns an HTMLElement subtree
function buildReplyThread(parentId, taskId, projectId, depth) {
  depth = depth || 0;
  const replies = _replyCache[parentId] || [];
  if (!replies.length && depth > 0) return null;

  const indentPx = Math.min(depth, REPLY_MAX_INDENT) * REPLY_INDENT_PX;
  const frag = document.createDocumentFragment();

  replies.forEach(reply => {
    const wrap = document.createElement('div');
    wrap.className = 'jr-reply-wrap';
    wrap.dataset.replyId = reply.id;
    wrap.dataset.parentId = parentId;
    wrap.style.marginLeft = indentPx + 'px';
    wrap.style.borderLeft = depth > 0
      ? '1px solid rgba(0,210,255,0.20)'
      : 'none';
    wrap.style.paddingLeft = depth > 0 ? '10px' : '0';

    const authorName = reply.users?.full_name || reply.users?.email?.split('@')[0] || 'Unknown';
    const initials   = authorName.split(' ').map(w=>w[0]).join('').toUpperCase().substring(0,2);
    const ts         = formatRelativeTime(reply.created_at);
    const isMine     = _currentUser && reply.author_id === _currentUser.id;

    wrap.innerHTML = `
      <div class="jr-reply-row">
        <div class="jr-avatar">${initials}</div>
        <div class="jr-reply-body-wrap">
          <div class="jr-reply-meta">
            <span class="jr-author">${escHtml(authorName)}</span>
            <span class="jr-ts">${ts}</span>
            ${isMine ? `<button class="jr-del-btn" title="Delete reply" onclick="handleDeleteReply('${reply.id}','${parentId}',this)">✕</button>` : ''}
          </div>
          <div class="jr-reply-text">${escHtml(reply.body)}</div>
          <button class="jr-reply-btn" onclick="handleReplyClick('${reply.id}','reply','${taskId}','${projectId}',this)">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 8L7 3v3c5.5 0 8 2 8 7-1.5-3-4-4.5-8-4.5V12L2 8z" fill="currentColor"/></svg>
            REPLY
          </button>
        </div>
      </div>
      <div class="jr-composer-slot"></div>
      <div class="jr-children-slot"></div>
    `;

    // Recurse children
    const childrenSlot = wrap.querySelector('.jr-children-slot');
    const childTree = buildReplyThread(reply.id, taskId, projectId, depth + 1);
    if (childTree) childrenSlot.appendChild(childTree);

    frag.appendChild(wrap);
  });

  return frag;
}

// ── Inject reply thread after a journal row ─────────────────
function injectReplyThread(journalEntryEl, journalId, taskId, projectId) {
  // Remove any existing thread for this entry
  const existingThread = journalEntryEl.querySelector('.jr-thread-root');
  if (existingThread) existingThread.remove();

  const root = document.createElement('div');
  root.className = 'jr-thread-root';
  root.dataset.journalId = journalId;

  // Top-level reply button
  root.innerHTML = `
    <div class="jr-top-reply-btn-wrap">
      <button class="jr-reply-btn jr-top-reply-btn"
        onclick="handleReplyClick('${journalId}','journal','${taskId}','${projectId}',this)">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 8L7 3v3c5.5 0 8 2 8 7-1.5-3-4-4.5-8-4.5V12L2 8z" fill="currentColor"/></svg>
        REPLY
      </button>
    </div>
    <div class="jr-composer-slot"></div>
    <div class="jr-children-slot"></div>
  `;

  const childrenSlot = root.querySelector('.jr-children-slot');
  const childTree = buildReplyThread(journalId, taskId, projectId, 1);
  if (childTree) childrenSlot.appendChild(childTree);

  journalEntryEl.appendChild(root);
}

// ── Open inline composer ────────────────────────────────────
function handleReplyClick(parentId, parentType, taskId, projectId, triggerBtn) {
  // Close any other open composers
  document.querySelectorAll('.jr-composer').forEach(c => {
    if (c !== triggerBtn.closest('.jr-reply-wrap, .jr-thread-root')?.querySelector('.jr-composer-slot .jr-composer')) {
      closeComposer(c);
    }
  });

  // Find the slot adjacent to this button
  const slot = triggerBtn.closest('.jr-reply-wrap, .jr-thread-root')
                          ?.querySelector(':scope > .jr-composer-slot');
  if (!slot) return;

  // If already open, close it
  if (slot.querySelector('.jr-composer')) {
    slot.innerHTML = '';
    return;
  }

  const composer = document.createElement('div');
  composer.className = 'jr-composer';
  composer.innerHTML = `
    <textarea class="jr-textarea" placeholder="Write a reply…" rows="3" autofocus></textarea>
    <div class="jr-composer-actions">
      <button class="jr-submit-btn" onclick="handleReplySubmit(this,'${parentId}','${parentType}','${taskId}','${projectId}')">SUBMIT</button>
      <button class="jr-cancel-btn" onclick="closeComposer(this.closest('.jr-composer'))">CANCEL</button>
    </div>
  `;

  slot.appendChild(composer);
  composer.querySelector('.jr-textarea').focus();
}

function closeComposer(composerEl) {
  if (composerEl && composerEl.parentElement) {
    composerEl.parentElement.innerHTML = '';
  }
}

// ── Submit reply ────────────────────────────────────────────
async function handleReplySubmit(btn, parentId, parentType, taskId, projectId) {
  const composer = btn.closest('.jr-composer');
  const textarea = composer.querySelector('.jr-textarea');
  const body = textarea.value.trim();
  if (!body) { textarea.focus(); return; }

  btn.disabled = true;
  btn.textContent = 'SAVING…';

  const reply = await saveReply(parentId, parentType, taskId, projectId, body);
  if (!reply) { btn.disabled = false; btn.textContent = 'SUBMIT'; return; }

  // Close composer
  closeComposer(composer);

  // Re-render just the children slot of the parent container
  const parentWrap = document.querySelector(
    `[data-reply-id="${parentId}"], [data-journal-id="${parentId}"]`
  );
  if (parentWrap) {
    const childrenSlot = parentWrap.querySelector(':scope > .jr-children-slot');
    if (childrenSlot) {
      childrenSlot.innerHTML = '';
      const childTree = buildReplyThread(parentId, taskId, projectId, 1);
      if (childTree) childrenSlot.appendChild(childTree);
    }
  }

  showToast('Reply saved.', 'success');
}

// ── Delete reply ────────────────────────────────────────────
async function handleDeleteReply(replyId, parentId, btn) {
  if (!confirm('Delete this reply?')) return;
  const ok = await deleteReply(replyId, parentId);
  if (ok) {
    const wrap = document.querySelector(`[data-reply-id="${replyId}"]`);
    if (wrap) wrap.remove();
  }
}

// ── Utility ─────────────────────────────────────────────────
function escHtml(str) {
  return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatRelativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  if (days < 7)  return days + 'd ago';
  return new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric' });
}

// showToast — use existing if present, else stub
if (typeof showToast === 'undefined') {
  window.showToast = function(msg, type) { console.log('[Toast]', type, msg); };
}