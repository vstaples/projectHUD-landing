// ============================================================
// ProjectHUD — accord-capture.js
// CMD-A3 · Live Capture surface — agenda + composer + stream + chat
//
// Iron Rule 41 — composer is local; only commit gestures broadcast.
// Iron Rule 42 — post-seal mutations rejected at the DB; UI reflects
//   the closed-state via the .meeting-closed class set by accord-core.
// ============================================================

(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = s => Accord._esc(s);

  // ── Local state ───────────────────────────────────────────────
  const local = {
    agendaItems:  [],
    activeAgenda: null,
    captureNodes: [],   // current meeting
    historyNodes: [],   // thread history (across meetings)
    chatMessages: [],
    streamTab:    'present',
    agendaFilter: 'active',
  };

  // ── Lifecycle hookup ─────────────────────────────────────────
  window.addEventListener('accord:meeting-loaded', async (ev) => {
    const { meeting, thread } = ev.detail;
    await _loadAll(meeting, thread);
  });

  window.addEventListener('accord:meeting-sealed', async (ev) => {
    // After seal, refresh nodes so sealed_at lands locally
    const m = ev.detail.meeting;
    await _loadCaptureNodes(m.id);
    await _loadThreadHistory(Accord.state.thread?.id);
    _renderStream();
  });

  // ── Realtime fan-in ──────────────────────────────────────────
  window.addEventListener('accord:remote-node', (ev) => {
    const p = ev.detail?.payload || ev.detail;
    if (!p?.node_id) return;
    // Append remote node if not already present
    if (!local.captureNodes.find(n => n.id === p.node_id)) {
      local.captureNodes.unshift({
        id:         p.node_id,
        thread_id:  p.thread_id,
        meeting_id: p.meeting_id,
        tag:        p.tag,
        summary:    p.summary,
        created_at: p.created_at,
        created_by: p.created_by,
        sealed_at:  null,
      });
      _renderStream();
    }
  });
  window.addEventListener('accord:remote-chat', (ev) => {
    const p = ev.detail?.payload || ev.detail;
    if (!p) return;
    local.chatMessages.push({
      author: p.author_name || 'Unknown',
      text:   p.text || '',
      ts:     p.ts || Date.now(),
      isMe:   false,
    });
    _renderChat();
  });
  window.addEventListener('accord:remote-agenda', async () => {
    if (Accord.state.meeting) await _loadAgenda(Accord.state.meeting.id);
  });

  // ── Loaders ──────────────────────────────────────────────────
  async function _loadAll(meeting, thread) {
    if (!meeting) return;
    await _loadAgenda(meeting.id);
    await _loadCaptureNodes(meeting.id);
    if (thread) await _loadThreadHistory(thread.id);
    _renderAgenda();
    _renderStream();
    _renderChat();
    _updateContextStrip();
    _updateCoverage();
  }

  async function _loadAgenda(meetingId) {
    try {
      const rows = await API.get(
        `accord_agenda_items?meeting_id=eq.${meetingId}&select=*&order=position.asc`
      );
      local.agendaItems = rows || [];
      // Default active agenda = first non-archived item
      if (!local.activeAgenda || !local.agendaItems.find(a => a.id === local.activeAgenda)) {
        const first = local.agendaItems.find(a => a.status !== 'archived');
        local.activeAgenda = first?.id || null;
      }
    } catch (e) { console.error('[Accord] agenda load failed', e); }
  }

  async function _loadCaptureNodes(meetingId) {
    try {
      const rows = await API.get(
        `accord_nodes?meeting_id=eq.${meetingId}&select=*&order=created_at.desc`
      );
      local.captureNodes = rows || [];
    } catch (e) { console.error('[Accord] nodes load failed', e); }
  }

  async function _loadThreadHistory(threadId) {
    if (!threadId) { local.historyNodes = []; return; }
    try {
      const rows = await API.get(
        `accord_nodes?thread_id=eq.${threadId}&select=*&order=created_at.desc`
      );
      local.historyNodes = rows || [];
    } catch (e) { console.error('[Accord] history load failed', e); }
  }

  // ── Agenda render + interactions ─────────────────────────────
  function _renderAgenda() {
    const el = $('agendaList');
    const filtered = local.agendaItems.filter(a =>
      local.agendaFilter === 'all' ? true : a.status !== 'archived'
    );
    $('agendaCount').textContent = `${local.agendaItems.length} item${local.agendaItems.length === 1 ? '' : 's'}`;
    if (!filtered.length) {
      el.innerHTML = '<div style="color:var(--ink-faint);font-size:11px;padding:8px 4px">No agenda items yet. Use + New item.</div>';
      return;
    }
    const sealed = !!Accord.state.meeting?.sealed_at;
    el.innerHTML = filtered.map(a => `
      <div class="agenda-item ${a.id === local.activeAgenda ? 'active' : ''}" data-agenda-id="${a.id}">
        <span class="agenda-pos">${a.position}</span>
        <span class="agenda-title">${esc(a.title)}</span>
        <span class="agenda-actions">
          ${sealed
            ? `<button data-action="archive" title="Archive">⊘</button>`
            : `<button data-action="delete"  title="Delete">×</button>`
          }
        </span>
      </div>
    `).join('');
    el.querySelectorAll('.agenda-item').forEach(node => {
      const id = node.dataset.agendaId;
      node.addEventListener('click', (ev) => {
        if (ev.target.closest('button')) return;
        local.activeAgenda = id;
        _renderAgenda();
        _updateContextStrip();
      });
      node.querySelector('button[data-action]')?.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const a = local.agendaItems.find(x => x.id === id);
        if (!a) return;
        const action = ev.currentTarget.dataset.action;
        try {
          if (action === 'delete') {
            await API.del(`accord_agenda_items?id=eq.${id}`);
          } else if (action === 'archive') {
            await API.patch(`accord_agenda_items?id=eq.${id}`, { status: 'archived' });
          }
          await _loadAgenda(Accord.state.meeting.id);
          _renderAgenda();
          Accord.broadcast('accord.agenda.changed', { meeting_id: Accord.state.meeting.id });
        } catch (e) { console.error('[Accord] agenda mutate failed', e); }
      });
    });
  }

  function _wireAgendaUI() {
    document.querySelectorAll('#accord-app .agenda-toggle button').forEach(btn => {
      btn.addEventListener('click', () => {
        local.agendaFilter = btn.dataset.agendaFilter;
        document.querySelectorAll('#accord-app .agenda-toggle button').forEach(b => b.classList.toggle('active', b === btn));
        _renderAgenda();
      });
    });

    $('newAgendaBtn').addEventListener('click', async () => {
      const m = Accord.state.meeting;
      if (!m) { alert('Create a meeting first.'); return; }
      if (m.state === 'closed') return;
      const title = prompt('Agenda item title:');
      if (!title || !title.trim()) return;
      const nextPos = (local.agendaItems.length
        ? Math.max(...local.agendaItems.map(a => a.position || 0)) : 0) + 1;
      try {
        await API.post('accord_agenda_items', {
          firm_id:    m.firm_id,
          meeting_id: m.id,
          position:   nextPos,
          title:      title.trim(),
        });
        await _loadAgenda(m.id);
        _renderAgenda();
        _updateCoverage();
        Accord.broadcast('accord.agenda.changed', { meeting_id: m.id });
      } catch (e) {
        alert('Failed to add agenda item: ' + (e?.message || e));
      }
    });
  }

  // ── Context strip ────────────────────────────────────────────
  function _updateContextStrip() {
    const a = local.agendaItems.find(x => x.id === local.activeAgenda);
    if (a) {
      $('captureTarget').textContent = a.title;
      $('capturePath').textContent   = `Agenda ${a.position} · ${Accord.state.meeting?.title || ''}`;
    } else {
      $('captureTarget').textContent = '— pick an agenda item —';
      $('capturePath').textContent   = '';
    }
  }

  // ── Coverage meter ───────────────────────────────────────────
  function _updateCoverage() {
    const total = local.agendaItems.filter(a => a.status !== 'archived').length;
    if (!total) {
      $('coverageFill').style.width = '0%';
      $('coverageText').textContent = '0 of 0 agenda items have entries';
      return;
    }
    const covered = new Set(local.captureNodes.map(n => n.agenda_item_id).filter(Boolean));
    const filled = local.agendaItems.filter(a => covered.has(a.id) && a.status !== 'archived').length;
    const pct = Math.round((filled / total) * 100);
    $('coverageFill').style.width = pct + '%';
    $('coverageText').textContent = `${filled} of ${total} agenda items have entries`;
  }

  // ── Composer + tag bar (commit gesture) ──────────────────────
  const TAG_KEYS = { n: 'note', d: 'decision', a: 'action', r: 'risk', q: 'question' };

  function _wireComposer() {
    document.querySelectorAll('#accord-app .tag-btn').forEach(btn => {
      btn.addEventListener('click', () => _commit(btn.dataset.tag));
    });
    // Keyboard shortcuts (only when composer is focused)
    $('captureInput').addEventListener('keydown', (ev) => {
      if (!ev.metaKey && !ev.ctrlKey && !ev.altKey) {
        // Letter shortcuts only on Shift+letter so as not to break typing
        if (ev.shiftKey && TAG_KEYS[ev.key.toLowerCase()]) {
          ev.preventDefault();
          _commit(TAG_KEYS[ev.key.toLowerCase()]);
        }
      }
    });
  }

  async function _commit(tag) {
    const m = Accord.state.meeting;
    if (!m || m.state !== 'running') return;
    const text = $('captureInput').value.trim();
    if (!text) { $('captureInput').focus(); return; }
    const me = Accord.state.me;
    if (!me?.id || !me.firm_id) {
      alert('Identity not resolved; cannot commit.');
      return;
    }
    const thread = Accord.state.thread;
    if (!thread?.id) {
      alert('No thread bound to this meeting yet; commit aborted.');
      return;
    }
    const row = {
      firm_id:        me.firm_id,
      thread_id:      thread.id,
      meeting_id:     m.id,
      agenda_item_id: local.activeAgenda || null,
      tag,
      summary:        text.slice(0, 280),
      body:           text.length > 280 ? text : null,
      created_by:     me.id,
    };
    try {
      const created = await API.post('accord_nodes', row);
      const node = Array.isArray(created) ? created[0] : created;
      local.captureNodes.unshift(node);
      $('captureInput').value = '';
      _renderStream();
      _updateCoverage();
      // Realtime broadcast of the commit (Iron Rule 41 commit gesture only)
      Accord.broadcast('accord.node.committed', {
        node_id:    node.id,
        thread_id:  node.thread_id,
        meeting_id: node.meeting_id,
        tag:        node.tag,
        summary:    node.summary,
        created_by: node.created_by,
        created_at: node.created_at,
      });
    } catch (e) {
      console.error('[Accord] commit failed', e);
      alert('Capture failed: ' + (e?.message || e));
    }
  }

  // ── Stream render ────────────────────────────────────────────
  function _wireStreamTabs() {
    document.querySelectorAll('#accord-app .stream-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        local.streamTab = btn.dataset.streamTab;
        document.querySelectorAll('#accord-app .stream-tab').forEach(b => b.classList.toggle('active', b === btn));
        $('captureStream').style.display       = local.streamTab === 'present' ? '' : 'none';
        $('threadHistoryStream').style.display = local.streamTab === 'history' ? '' : 'none';
      });
    });
  }

  function _renderStream() {
    $('streamCountPresent').textContent = String(local.captureNodes.length);
    $('streamCountHistory').textContent = String(local.historyNodes.length);
    $('captureStream').innerHTML       = _streamHtml(local.captureNodes);
    $('threadHistoryStream').innerHTML = _streamHtml(local.historyNodes);
  }

  function _streamHtml(nodes) {
    if (!nodes.length) return '<div class="stream-empty">No captures yet.</div>';
    return nodes.map(n => {
      const t = new Date(n.created_at);
      const time = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const date = t.toLocaleDateString([], { month: 'short', day: 'numeric' });
      const tag = n.tag || 'note';
      return `
        <div class="capture-row" data-node-id="${n.id}">
          <span class="cap-time">${date} ${time}</span>
          <span class="cap-tag"><span class="tag-dot ${tag}"></span>${tag.toUpperCase()}</span>
          <div>
            <div class="cap-summary">${esc(n.summary || '')}</div>
            <div class="cap-author">${n.sealed_at ? '· sealed' : '· draft'}</div>
          </div>
        </div>`;
    }).join('');
  }

  // ── Chat ─────────────────────────────────────────────────────
  function _wireChat() {
    const send = async () => {
      const m = Accord.state.meeting;
      if (!m || m.state !== 'running') return;
      const text = $('chatInput').value.trim();
      if (!text) return;
      const author = Accord.state.me?.name || 'You';
      const ts = Date.now();
      local.chatMessages.push({ author, text, ts, isMe: true });
      $('chatInput').value = '';
      _renderChat();
      // Broadcast (chat is ephemeral for v0.1; not persisted)
      Accord.broadcast('accord.chat.posted', {
        author_name: author,
        text,
        ts,
      });
    };
    $('chatSendBtn').addEventListener('click', send);
    $('chatInput').addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); send(); }
    });
  }

  function _renderChat() {
    const el = $('chatStream');
    el.innerHTML = local.chatMessages.map(m => {
      const t = new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `
        <div class="chat-msg">
          <span class="chat-author">${esc(m.author)}</span>
          <span class="chat-text">${esc(m.text)}</span>
          <span class="chat-time">${t}</span>
        </div>`;
    }).join('');
    el.scrollTop = el.scrollHeight;
  }

  // ── Init ────────────────────────────────────────────────────
  function _init() {
    _wireAgendaUI();
    _wireComposer();
    _wireStreamTabs();
    _wireChat();
    console.log('[Accord] capture surface ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }
})();