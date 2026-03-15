// ============================================================
// ProjectHUD — journal-replies.js
// Threaded replies on task_journal entries
// Uses API and Auth globals from api.js / auth.js
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
      `journal_replies?select=id,parent_id,parent_type,task_id,author_id,body,created_at,users:author_id(full_name,email)&project_id=eq.${projectId}&order=created_at.asc`
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
      `journal_replies?select=id,parent_id,parent_type,task_id,author_id,body,created_at,users:author_id(full_name,email)&task_id=eq.${taskId}&order=created_at.asc`
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
  if (!_currentUser) { if (typeof showToast==='function') showToast('You must be logged in to reply.','error'); return null; }
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
      `journal_replies?select=id,parent_id,parent_type,task_id,author_id,body,created_at,users:author_id(full_name,email)&parent_id=eq.${parentId}&order=created_at.desc&limit=1`
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
    if (typeof showToast==='function') showToast('Failed to delete reply.','error');
    return false;
  }
}

function buildReplyThread(parentId, taskId, projectId, depth) {
  depth = depth || 0;
  const replies = _replyCache[parentId] || [];
  if (!replies.length) return null;
  const indentPx = Math.min(depth, REPLY_MAX_INDENT) * REPLY_INDENT_PX;
  const frag = document.createDocumentFragment();
  replies.forEach(reply => {
    const wrap = document.createElement('div');
    wrap.className = 'jr-reply-wrap';
    wrap.dataset.replyId = reply.id;
    wrap.dataset.parentId = parentId;
    wrap.style.marginLeft = indentPx + 'px';
    if (depth > 0) { wrap.style.borderLeft = '1px solid rgba(0,210,255,0.20)'; wrap.style.paddingLeft = '10px'; }
    const authorName = reply.users?.full_name || reply.users?.email?.split('@')[0] || 'Unknown';
    const initials   = authorName.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
    const ts         = _replyRelTime(reply.created_at);
    const isMine     = _currentUser && reply.author_id === _currentUser.id;
    wrap.innerHTML = `
      <div class="jr-reply-row">
        <div class="jr-avatar">${initials}</div>
        <div class="jr-reply-body-wrap">
          <div class="jr-reply-meta">
            <span class="jr-author">${_esc(authorName)}</span>
            <span class="jr-ts">${ts}</span>
            ${isMine ? `<button class="jr-del-btn" title="Delete" onclick="handleDeleteReply('${reply.id}','${parentId}',this)">✕</button>` : ''}
          </div>
          <div class="jr-reply-text">${_esc(reply.body)}</div>
          <button class="jr-reply-btn" onclick="handleReplyClick('${reply.id}','reply','${taskId}','${projectId}',this)">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 8L7 3v3c5.5 0 8 2 8 7-1.5-3-4-4.5-8-4.5V12L2 8z" fill="currentColor"/></svg>
            REPLY
          </button>
        </div>
      </div>
      <div class="jr-composer-slot"></div>
      <div class="jr-children-slot"></div>
    `;
    const childrenSlot = wrap.querySelector('.jr-children-slot');
    const childTree = buildReplyThread(reply.id, taskId, projectId, depth + 1);
    if (childTree) childrenSlot.appendChild(childTree);
    frag.appendChild(wrap);
  });
  return frag;
}

function injectReplyThread(journalEntryEl, journalId, taskId, projectId) {
  if (!journalId || !taskId) return;
  const existing = journalEntryEl.querySelector('.jr-thread-root');
  if (existing) existing.remove();
  const root = document.createElement('div');
  root.className = 'jr-thread-root';
  root.dataset.journalId = journalId;
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

function handleReplyClick(parentId, parentType, taskId, projectId, triggerBtn) {
  document.querySelectorAll('.jr-composer').forEach(c => c.remove());
  const slot = triggerBtn.closest('.jr-reply-wrap, .jr-thread-root')
                          ?.querySelector(':scope > .jr-composer-slot');
  if (!slot) return;
  if (slot.querySelector('.jr-composer')) { slot.innerHTML = ''; return; }
  const composer = document.createElement('div');
  composer.className = 'jr-composer';
  composer.innerHTML = `
    <textarea class="jr-textarea" placeholder="Write a reply…" rows="3"></textarea>
    <div class="jr-composer-actions">
      <button class="jr-submit-btn" onclick="handleReplySubmit(this,'${parentId}','${parentType}','${taskId}','${projectId}')">SUBMIT</button>
      <button class="jr-cancel-btn" onclick="this.closest('.jr-composer').remove()">CANCEL</button>
    </div>
  `;
  slot.appendChild(composer);
  composer.querySelector('.jr-textarea').focus();
}

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
  const parentWrap = document.querySelector(`[data-reply-id="${parentId}"], [data-journal-id="${parentId}"]`);
  if (parentWrap) {
    const childrenSlot = parentWrap.querySelector(':scope > .jr-children-slot');
    if (childrenSlot) {
      childrenSlot.innerHTML = '';
      const childTree = buildReplyThread(parentId, taskId, projectId, 1);
      if (childTree) childrenSlot.appendChild(childTree);
    }
  }
  if (typeof showToast === 'function') showToast('Reply saved.', 'success');
}

async function handleDeleteReply(replyId, parentId, btn) {
  if (!confirm('Delete this reply?')) return;
  const ok = await deleteReply(replyId, parentId);
  if (ok) { const wrap = document.querySelector(`[data-reply-id="${replyId}"]`); if (wrap) wrap.remove(); }
}

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