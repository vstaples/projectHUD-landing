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
    streamTab:    'present',
    agendaFilter: 'active',
  };

  // ── A-08 Chat state ──────────────────────────────────────────
  var _chatMessages      = [];
  var _chatSubscription  = null;
  var _chatResourceId    = null;
  var _chatResourceName  = null;
  var _chatMeetingState  = 'idle';

  // ── Lifecycle hookup ─────────────────────────────────────────
  window.addEventListener('accord:meeting-loaded', async (ev) => {
    const { meeting, thread } = ev.detail;
    await _loadAll(meeting, thread);
    // A-08: initialise persisted chat after meeting loads
    _initChat(meeting);
  });

  window.addEventListener('accord:meeting-sealed', async (ev) => {
    // After seal, refresh nodes so sealed_at lands locally
    const m = ev.detail.meeting;
    await _loadCaptureNodes(m.meeting_id);
    await _loadThreadHistory(Accord.state.thread?.thread_id);
    _renderStream();
  });

  // ── Realtime fan-in ──────────────────────────────────────────
  window.addEventListener('accord:remote-node', (ev) => {
    const p = ev.detail?.payload || ev.detail;
    if (!p?.node_id) return;
    // Append remote node if not already present
    if (!local.captureNodes.find(n => n.node_id === p.node_id)) {
      local.captureNodes.unshift({
        node_id:    p.node_id,
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
  window.addEventListener('accord:remote-agenda', async () => {
    if (Accord.state.meeting) await _loadAgenda(Accord.state.meeting.meeting_id);
  });

  // ── Loaders ──────────────────────────────────────────────────
  async function _loadAll(meeting, thread) {
    if (!meeting) return;
    await _loadAgenda(meeting.meeting_id);
    await _loadCaptureNodes(meeting.meeting_id);
    if (thread) await _loadThreadHistory(thread.thread_id);
    _renderAgenda();
    _renderStream();
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
      if (!local.activeAgenda || !local.agendaItems.find(a => a.agenda_item_id === local.activeAgenda)) {
        const first = local.agendaItems.find(a => a.status !== 'archived');
        local.activeAgenda = first?.agenda_item_id || null;
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
      <div class="agenda-item ${a.agenda_item_id === local.activeAgenda ? 'active' : ''}" data-agenda-id="${a.agenda_item_id}">
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
        const a = local.agendaItems.find(x => x.agenda_item_id === id);
        if (!a) return;
        const action = ev.currentTarget.dataset.action;
        try {
          if (action === 'delete') {
            await API.del(`accord_agenda_items?agenda_item_id=eq.${id}`);
          } else if (action === 'archive') {
            await API.patch(`accord_agenda_items?agenda_item_id=eq.${id}`, { status: 'archived' });
          }
          await _loadAgenda(Accord.state.meeting.meeting_id);
          _renderAgenda();
          Accord.broadcast('accord.agenda.changed', { meeting_id: Accord.state.meeting.meeting_id });
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
          meeting_id: m.meeting_id,
          position:   nextPos,
          title:      title.trim(),
        });
        await _loadAgenda(m.meeting_id);
        _renderAgenda();
        _updateCoverage();
        Accord.broadcast('accord.agenda.changed', { meeting_id: m.meeting_id });
      } catch (e) {
        alert('Failed to add agenda item: ' + (e?.message || e));
      }
    });
  }

  // ── Context strip ────────────────────────────────────────────
  function _updateContextStrip() {
    const a = local.agendaItems.find(x => x.agenda_item_id === local.activeAgenda);
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
    const filled = local.agendaItems.filter(a => covered.has(a.agenda_item_id) && a.status !== 'archived').length;
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
    if (!thread?.thread_id) {
      alert('No thread bound to this meeting yet; commit aborted.');
      return;
    }

    // CMD-SUBSTRATE-COUNTERFACTUAL-MIN Phase 4: route decision/action
    // commits through the date-capture modal. Other tags commit directly.
    // CMD-ACCORD-NRA-SURFACE-1 Phase 3: pre-commit atomic — open NRA
    // modal before _doCommit fires. Modal cancel preserves operator
    // text input (no node POST). Modal submit calls _doCommit then
    // dispatches the NRA helper RPC + accord:nra-* CustomEvent.
    if (tag === 'decision' || tag === 'action') {
      _openCaptureDateModal(tag, text, (dateExtras) =>
        _openNRAModalThenCommit(tag, text, dateExtras));
      return;
    }
    return _openNRAModalThenCommit(tag, text, null);
  }

  // CMD-ACCORD-NRA-SURFACE-1 Phase 3: pre-commit atomic orchestrator.
  // Opens the AccordNRA modal in declare-at-creation mode; on submit
  // the callback calls _doCommit (creates node) and then dispatches
  // the appropriate NRA helper RPC. CustomEvent is dispatched on RPC
  // success. RPC failure falls through to non-blocking notification
  // (operator can recover via Phase 4 grandfathered "+ Add NRA" badge).
  // IR71 discipline: tag/text/dateExtras passed explicitly via closure
  // arguments; modal-callback receives {action,payload} explicitly.
  function _openNRAModalThenCommit(tag, text, dateExtras) {
    if (!window.AccordNRA?.Modal?.open) {
      console.warn('[Accord-capture] AccordNRA module not loaded; falling back to no-NRA commit');
      return _doCommit(tag, text, dateExtras);
    }
    const me = Accord.state.me;
    const nodeContext = { firm_id: me.firm_id, tag, text };
    AccordNRA.Modal.open(nodeContext, 'declare-at-creation', null, {
      onSubmit: async ({ action, payload }) => {
        const node = await _doCommit(tag, text, dateExtras);
        if (!node) {
          throw new Error('Node creation failed; NRA not addressed.');
        }
        await _dispatchNRAForNewNode(node, action, payload);
      },
    });
  }

  // CMD-ACCORD-NRA-SURFACE-1 Phase 3: helper that calls the appropriate
  // NRA RPC for a freshly-created node and dispatches the corresponding
  // CustomEvent on success. RPC failure logs + console.warn but does
  // NOT throw (orphan node is recoverable via Phase 4 display badge).
  async function _dispatchNRAForNewNode(node, action, payload) {
    try {
      if (action === 'declare') {
        const result = await API.rpc('declare_nra', {
          p_node_id:           node.node_id,
          p_nra_type:          payload.nra_type,
          p_due_date:          payload.due_date,
          p_description:       payload.description,
          p_owner_resource_id: null,
          p_owner_event_type:  payload.owner_event_type || null,
          p_owner_is_operator: payload.owner_is_operator,
          p_trigger_kind:      payload.trigger_kind || null,
          p_trigger_target_id: payload.trigger_target_id || null,
        });
        const row = Array.isArray(result) ? result[0] : result;
        AccordNRA.emit('nra-declared', {
          node_id:  node.node_id,
          nra_id:   row?.nra_id,
          firm_id:  node.firm_id,
          nra_type: payload.nra_type,
          due_date: payload.due_date,
        });
      } else if (action === 'waive') {
        const result = await API.rpc('waive_nra', {
          p_node_id: node.node_id,
          p_reason:  payload.reason,
        });
        const row = Array.isArray(result) ? result[0] : result;
        AccordNRA.emit('nra-waived', {
          node_id: node.node_id,
          nra_id:  row?.nra_id,
          firm_id: node.firm_id,
        });
      } else if (action === 'defer') {
        const result = await API.rpc('defer_nra', { p_node_id: node.node_id });
        const row = Array.isArray(result) ? result[0] : result;
        AccordNRA.emit('nra-deferred', {
          node_id: node.node_id,
          nra_id:  row?.nra_id,
          firm_id: node.firm_id,
        });
      }
    } catch (e) {
      // Non-blocking per architect disposition: log + console.warn.
      // Operator recovers via Phase 4 grandfathered "+ Add NRA" badge
      // when display surface renders this orphan node.
      console.warn(
        '[Accord-capture] NRA RPC failed for new node ' + node.node_id +
        ' (action=' + action + '). Node was created; NRA not addressed. ' +
        'Use the "+ Add NRA" affordance on the rendered node to recover.',
        e
      );
    }
  }

  // CMD-SUBSTRATE-COUNTERFACTUAL-MIN Phase 4: extracted commit-write
  // path so the date modal can call back with optional date extras.
  // dateExtras: { effective_date, due_date, effective_date_basis } | null
  // CMD-ACCORD-NRA-SURFACE-1 Phase 3: returns the created node (or null
  // on failure) so _openNRAModalThenCommit can dispatch NRA RPC after.
  async function _doCommit(tag, text, dateExtras) {
    const m = Accord.state.meeting;
    const me = Accord.state.me;
    const thread = Accord.state.thread;
    const row = {
      firm_id:        me.firm_id,
      thread_id:      thread.thread_id,
      meeting_id:     m.meeting_id,
      agenda_item_id: local.activeAgenda || null,
      tag,
      summary:        text.slice(0, 280),
      body:           text.length > 280 ? text : null,
      created_by:     me.id,
    };
    if (dateExtras) {
      if (dateExtras.effective_date)       row.effective_date = dateExtras.effective_date;
      if (dateExtras.due_date)             row.due_date = dateExtras.due_date;
      if (dateExtras.effective_date_basis) row.effective_date_basis = dateExtras.effective_date_basis;
    }
    try {
      const created = await API.post('accord_nodes', row);
      const node = Array.isArray(created) ? created[0] : created;
      local.captureNodes.unshift(node);
      $('captureInput').value = '';
      _renderStream();
      _updateCoverage();
      // Realtime broadcast of the commit (Iron Rule 41 commit gesture only)
      Accord.broadcast('accord.node.committed', {
        node_id:    node.node_id,
        thread_id:  node.thread_id,
        meeting_id: node.meeting_id,
        tag:        node.tag,
        summary:    node.summary,
        created_by: node.created_by,
        created_at: node.created_at,
      });
      // CMD-SUBSTRATE-COUNTERFACTUAL-MIN Phase 4: emit CoC event on
      // initial date set (capture-time path). Per F-P3-9: writer stores
      // event_type without 'accord.' prefix.
      if (dateExtras) {
        try {
          if (dateExtras.effective_date && window.CoC?.write) {
            await window.CoC.write('accord.node.effective_date_changed', node.node_id, {
              entityType: 'accord_node',
              meta: {
                tag,
                seq_id:                node.seq_id || null,
                effective_date:        dateExtras.effective_date,
                effective_date_basis:  dateExtras.effective_date_basis || null,
                from_value:            null,  // initial set
              },
            });
          }
          if (dateExtras.due_date && window.CoC?.write) {
            await window.CoC.write('accord.node.due_date_changed', node.node_id, {
              entityType: 'accord_node',
              meta: {
                tag,
                seq_id:     node.seq_id || null,
                due_date:   dateExtras.due_date,
                from_value: null,  // initial set
              },
            });
          }
        } catch (e) {
          console.warn('[Accord-capture] CoC.write date event best-effort failure', e);
        }
      }
      return node;
    } catch (e) {
      console.error('[Accord] commit failed', e);
      alert('Capture failed: ' + (e?.message || e));
      return null;
    }
  }

  // CMD-SUBSTRATE-COUNTERFACTUAL-MIN Phase 4: open the date-capture
  // modal. Skip = commit without date; Confirm = commit with date fields.
  // Cancel-via-backdrop/Esc = abort commit entirely (operator can re-attempt).
  let _captureDateCb = null;
  function _openCaptureDateModal(tag, text, onProceed) {
    const modal = $('captureDateModal');
    if (!modal) {
      // No modal in DOM: degrade silently to direct commit
      onProceed(null);
      return;
    }
    _captureDateCb = onProceed;
    const isDecision = (tag === 'decision');
    $('captureDateTitle').textContent = isDecision
      ? 'Set effective date'
      : 'Set due date';
    $('captureDateLabel').innerHTML = isDecision
      ? 'Effective date <span class="dissent-optional">optional</span>'
      : 'Due date <span class="dissent-optional">optional</span>';
    $('captureDateModalTarget').textContent =
      `${tag.toUpperCase()} · ${text.slice(0, 140)}${text.length > 140 ? '…' : ''}`;
    $('captureDateBasisRow').style.display = isDecision ? '' : 'none';
    $('captureDateInput').value = '';
    $('captureDateBasis').value = '';
    modal.dataset.tag = tag;
    modal.classList.add('visible');
    setTimeout(() => $('captureDateInput').focus(), 30);
  }

  function _closeCaptureDateModal() {
    const modal = $('captureDateModal');
    if (modal) {
      modal.classList.remove('visible');
      delete modal.dataset.tag;
    }
    _captureDateCb = null;
  }

  function _captureDateSkip() {
    const cb = _captureDateCb;
    _closeCaptureDateModal();
    if (cb) cb(null);  // commit with no date fields
  }

  function _captureDateConfirm() {
    const modal = $('captureDateModal');
    const tag = modal?.dataset?.tag;
    const dateVal = ($('captureDateInput').value || '').trim();
    if (!dateVal) {
      // No date entered → treat as Skip (operator clicked Confirm but
      // never typed a date; safest interpretation is no-op rather than
      // alert, matching the Skip action).
      _captureDateSkip();
      return;
    }
    const extras = {};
    if (tag === 'decision') {
      extras.effective_date = dateVal;
      const basis = ($('captureDateBasis').value || '').trim();
      if (basis) extras.effective_date_basis = basis;
    } else if (tag === 'action') {
      extras.due_date = dateVal;
    }
    const cb = _captureDateCb;
    _closeCaptureDateModal();
    if (cb) cb(extras);
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

    // CMD-ACCORD-NRA-SURFACE-1 Phase 4: paint NRA badges on each row.
    // wireBadgesIn is idempotent for delegation listeners (gated on
    // container._nraWired) and re-paints from substrate on every call.
    if (window.AccordNRA?.wireBadgesIn) {
      const lookup = (nodeId) => {
        return local.captureNodes.find(n => n.node_id === nodeId)
            || local.historyNodes.find(n => n.node_id === nodeId)
            || { node_id: nodeId, firm_id: Accord.state.me?.firm_id };
      };
      window.AccordNRA.wireBadgesIn($('captureStream'),       lookup);
      window.AccordNRA.wireBadgesIn($('threadHistoryStream'), lookup);
    }
  }

  function _streamHtml(nodes) {
    if (!nodes.length) return '<div class="stream-empty">No captures yet.</div>';
    return nodes.map(n => {
      const t = new Date(n.created_at);
      const time = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const date = t.toLocaleDateString([], { month: 'short', day: 'numeric' });
      const tag = n.tag || 'note';
      return `
        <div class="capture-row" data-node-id="${n.node_id}">
          <span class="cap-time">${date} ${time}</span>
          <span class="cap-tag"><span class="tag-dot ${tag}"></span>${tag.toUpperCase()}</span>
          <div>
            <div class="cap-summary">${esc(n.summary || '')}</div>
            <div class="cap-author">${n.sealed_at ? '· sealed' : '· draft'}</div>
          </div>
        </div>`;
    }).join('');
  }

  // ── A-08 Chat — CMD-ACCORD-CAPTURE-CHAT-1 ───────────────────
  // P1 amendment: Supabase client is window.supabase (not
  //   window.Accord.state.supabase — not exposed there).
  // P2 amendment: _chatResourceId resolved from resource row
  //   via API.get('resources?user_id=eq.') — state.me.id is
  //   auth user_id, not resource row id.
  // Replaces ephemeral broadcast chat (accord:remote-chat + local.chatMessages).

  function _initChat(meeting) {
    _teardownChat();
    _chatMeetingState = meeting.state;

    // P2: resolve resource row id from auth user_id
    var userId = Accord.state.me && Accord.state.me.id;
    if (!userId) { console.error('[AccordChat] no user id'); return; }

    API.get('resources?user_id=eq.' + userId + '&select=id,name&limit=1')
      .then(function(rows) {
        if (!rows || !rows.length) {
          console.error('[AccordChat] resource row not found');
          return;
        }
        _chatResourceId   = rows[0].id;
        _chatResourceName = rows[0].name;
        _loadChatHistory(meeting.meeting_id);
        _subscribeChatChannel(meeting.meeting_id);
        _wireChatInput(meeting);
      })
      .catch(function(e) {
        console.error('[AccordChat] resource resolve failed', e);
      });
  }

  function _teardownChat() {
    if (_chatSubscription) {
      try { _chatSubscription.unsubscribe(); } catch (e) {}
      _chatSubscription = null;
    }
    _chatMessages     = [];
    _chatResourceId   = null;
    _chatResourceName = null;
  }

  // §6 — History load
  function _loadChatHistory(meetingId) {
    API.get(
      'accord_chat_messages?meeting_id=eq.' + meetingId +
      '&order=created_at.asc&limit=50' +
      '&select=message_id,body,created_at,author_resource_id'
    ).then(function(rows) {
      rows = rows || [];
      if (!rows.length) { _renderChatStream([]); return; }
      var resourceIds = [];
      rows.forEach(function(r) {
        if (resourceIds.indexOf(r.author_resource_id) === -1)
          resourceIds.push(r.author_resource_id);
      });
      API.get('resources?id=in.(' + resourceIds.join(',') + ')&select=id,name')
        .then(function(resources) {
          var nameMap = {};
          (resources || []).forEach(function(r) { nameMap[r.id] = r.name; });
          rows.forEach(function(m) {
            m._author_name = nameMap[m.author_resource_id] || 'Unknown';
            m._is_me = m.author_resource_id === _chatResourceId;
          });
          _chatMessages = rows;
          _renderChatStream(_chatMessages);
          _scrollChatToBottom(false);
        });
    }).catch(function(e) {
      console.error('[AccordChat] history load failed', e);
    });
  }

  // §7 — Realtime subscription
  // P1 amendment (revised): window.supabase is the SDK library, not a client instance.
  // Actual realtime client is window.Accord.state.realtimeClient.realtime.
  function _subscribeChatChannel(meetingId) {
    var realtimeClient = window.Accord &&
                         window.Accord.state &&
                         window.Accord.state.realtimeClient &&
                         window.Accord.state.realtimeClient.realtime;
    if (!realtimeClient) {
      console.error('[AccordChat] realtime client not available');
      return;
    }

    _chatSubscription = realtimeClient
      .channel('accord-chat-' + meetingId)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'accord_chat_messages',
        filter: 'meeting_id=eq.' + meetingId
      }, function(payload) {
        var msg = payload.new;
        if (!msg) return;
        // Skip if already in local array (own send via realtime echo)
        if (_chatMessages.find(function(m) { return m.message_id === msg.message_id; })) return;
        API.get('resources?id=eq.' + msg.author_resource_id + '&select=id,name&limit=1')
          .then(function(rows) {
            msg._author_name = (rows && rows[0]) ? rows[0].name : 'Unknown';
            msg._is_me       = msg.author_resource_id === _chatResourceId;
            _chatMessages.push(msg);
            _appendChatMessage(msg);
            _scrollChatToBottom(true);
          });
      })
      .subscribe();
  }

  // §8.1 — Full stream render
  function _renderChatStream(messages) {
    var stream = document.querySelector('.chat-stream');
    if (!stream) return;

    if (!messages.length) {
      stream.innerHTML = '';
      return;
    }

    var html = '';
    var lastAuthorId = null;

    messages.forEach(function(msg) {
      var isMe    = msg._is_me;
      var meClass = isMe ? ' me' : ' other';

      if (msg.author_resource_id !== lastAuthorId) {
        if (lastAuthorId !== null) html += '</div>';
        var time = _fmtChatTime(msg.created_at);
        html += '<div class="chat-msg-group">';
        html += '<div class="chat-msg-header' + meClass + '">';
        html += '<span class="chat-msg-author">' + esc(msg._author_name || '') + '</span>';
        html += '<span class="chat-msg-time">' + esc(time) + '</span>';
        html += '</div>';
        lastAuthorId = msg.author_resource_id;
      }

      html += '<div class="chat-msg-row' + meClass + '">';
      html += '<div class="chat-msg-bubble" data-message-id="' +
              esc(msg.message_id) + '">' + esc(msg.body) + '</div>';
      html += '</div>';
    });

    if (lastAuthorId !== null) html += '</div>';
    stream.innerHTML = html;
  }

  // §8.2 — Append single new message (realtime)
  function _appendChatMessage(msg) {
    var stream = document.querySelector('.chat-stream');
    if (!stream) return;

    var isMe    = msg._is_me;
    var meClass = isMe ? ' me' : ' other';
    var time    = _fmtChatTime(msg.created_at);

    var lastGroup  = stream.querySelector('.chat-msg-group:last-child');
    var lastAuthor = lastGroup && lastGroup.querySelector('.chat-msg-author');
    var sameAuthor = lastAuthor && lastAuthor.textContent === (msg._author_name || '');

    var rowHtml = '<div class="chat-msg-row' + meClass + '">' +
                  '<div class="chat-msg-bubble new" data-message-id="' +
                  esc(msg.message_id) + '">' + esc(msg.body) + '</div>' +
                  '</div>';

    if (!lastGroup || !sameAuthor) {
      var groupHtml = '<div class="chat-msg-group">' +
                      '<div class="chat-msg-header' + meClass + '">' +
                      '<span class="chat-msg-author">' + esc(msg._author_name || '') + '</span>' +
                      '<span class="chat-msg-time">' + esc(time) + '</span>' +
                      '</div>' + rowHtml + '</div>';
      stream.insertAdjacentHTML('beforeend', groupHtml);
    } else {
      lastGroup.insertAdjacentHTML('beforeend', rowHtml);
    }

    var newBubble = stream.querySelector('[data-message-id="' + msg.message_id + '"]');
    if (newBubble) {
      setTimeout(function() { newBubble.classList.remove('new'); }, 1200);
    }
  }

  // §8.3 — Time formatter
  function _fmtChatTime(isoString) {
    if (!isoString) return '';
    var d = new Date(isoString);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  // §8.4 — Auto-scroll
  function _scrollChatToBottom(smooth) {
    var stream = document.querySelector('.chat-stream');
    if (!stream) return;
    stream.scrollTo({ top: stream.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
  }

  // §9 — Input wiring + send
  function _wireChatInput(meeting) {
    var input   = document.querySelector('.chat-input, #chatInput');
    var sendBtn = document.querySelector('.chat-send, #chatSendBtn');
    if (!input || !sendBtn) return;

    _applyChatState(meeting.state);

    input.addEventListener('input', function() {
      sendBtn.disabled = input.value.trim().length === 0;
    });

    input.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        if (!sendBtn.disabled) _sendChatMessage(meeting, input, sendBtn);
      }
    });

    sendBtn.addEventListener('click', function() {
      if (!sendBtn.disabled) _sendChatMessage(meeting, input, sendBtn);
    });
  }

  function _sendChatMessage(meeting, input, sendBtn) {
    var body = input.value.trim();
    if (!body || !_chatResourceId) return;

    sendBtn.disabled = true;
    input.value = '';

    API.post('accord_chat_messages', {
      firm_id:            meeting.firm_id,
      meeting_id:         meeting.meeting_id,
      author_resource_id: _chatResourceId,
      body:               body
    }).catch(function(e) {
      console.error('[AccordChat] send failed', e);
      input.value = body;
      sendBtn.disabled = false;
    });
    // Message display handled by realtime subscription — no optimistic insert
  }

  function _applyChatState(meetingState) {
    var input    = document.querySelector('.chat-input, #chatInput');
    var sendBtn  = document.querySelector('.chat-send, #chatSendBtn');
    var inputRow = document.querySelector('.chat-input-row');
    if (!input) return;

    if (meetingState === 'idle' || meetingState === 'running') {
      input.placeholder = 'Message the meeting\u2026';
      input.disabled    = false;
      if (sendBtn) sendBtn.disabled = input.value.trim().length === 0;
      if (inputRow) inputRow.style.display = '';
    } else if (meetingState === 'closed') {
      if (inputRow) inputRow.style.display = 'none';
      var stream = document.querySelector('.chat-stream, #chatStream');
      if (stream && !document.querySelector('.chat-closed-label')) {
        stream.insertAdjacentHTML('afterend',
          '<div class="chat-closed-label">Chat archived \u00b7 read-only</div>');
      }
    }
  }

  function _renderChat() {
    // Legacy stub — no-op. A-08 uses _renderChatStream.
  }

  // ── Init ────────────────────────────────────────────────────
  function _init() {
    _wireAgendaUI();
    _wireComposer();
    _wireStreamTabs();
    // A-08: chat wired in _initChat() after meeting-loaded (resource id resolved async)
    _wireCaptureDateModal();
    console.log('[Accord] capture surface ready');
  }

  // CMD-SUBSTRATE-COUNTERFACTUAL-MIN Phase 4: date-capture modal wire-up.
  function _wireCaptureDateModal() {
    const modal   = $('captureDateModal');
    const skipBtn = $('captureDateSkip');
    const okBtn   = $('captureDateConfirm');
    if (!modal) return;
    if (skipBtn) skipBtn.addEventListener('click', () => _captureDateSkip());
    if (okBtn)   okBtn.addEventListener('click',   () => _captureDateConfirm());
    // Backdrop click = abort (matches dissent modal pattern)
    modal.addEventListener('click', (ev) => {
      if (ev.target === modal) {
        _closeCaptureDateModal();
      }
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && modal.classList.contains('visible')) {
        _closeCaptureDateModal();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }
})();