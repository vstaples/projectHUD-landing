// cdn-utils.js — Cadence: shared utilities
// escHtml, cadToast, linked task helpers, stub tabs
// LOAD ORDER: 2nd (after cdn-core-state)

function escHtml(s) {
  return (s || '').toString()
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function cadToast(msg, type='info') {
  // Prefer shared showToast if available
  if (typeof showToast === 'function') { showToast(msg, type); return; }
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function _openLinkedTask(taskId, projectId) {
  if (!taskId) return;
  const url = projectId
    ? `/project-detail.html?id=${projectId}&task=${taskId}`
    : `/project-detail.html?task=${taskId}`;
  window.open(url, '_blank');
}

function _resolveLinkedTaskName(instId, taskId) {
  if (!taskId) return;
  const el = document.getElementById(`inst-task-name-${instId}`);
  if (!el) return;
  API.get(`tasks?id=eq.${taskId}&select=id,name`).then(rows => {
    const name = rows?.[0]?.name;
    if (name && el) el.textContent = escHtml(name);
  }).catch(() => {});
}

// renderFormsTab is defined in cdn-form-editor.js (loaded after this file)

function renderTriggersTab(el) {
  el.innerHTML = `
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--muted);gap:12px;padding:40px">
      <div style="font-size:40px;opacity:.2">⚡</div>
      <div style="font-size:14px;font-weight:600;color:var(--text2)">Trigger Rules</div>
      <p style="font-size:13px;max-width:320px;text-align:center;line-height:1.6">
        Configure automatic workflow launches based on project events — missed milestones, denied resource requests, material requests, and more.
        Coming in Session 3.
      </p>
    </div>`;
}