// ============================================================
// ProjectHUD — accord-digest.js
// CMD-A6 · Digest & Send surface
//
// Read-only across sealed substrate. Mutations:
//   - CoC events via window.CoC.write() for risk.registered and
//     accord.digest.delivered (per recipient)
//   - No accord_external_links INSERT this CMD (Path B: Compass
//     routing deferred to CMD-COMPASS-BRIDGE; the table ships
//     but has no consumer in CMD-A6)
//
// Doctrinal commitments:
//   - IR42  read-only sealed substrate (filtered server-side)
//   - IR44  digest content derives from edge graph + adjustments
//   - IR45  declared belief vocabulary; never confidence/probability
//   - IR47  explicit accord_* PK names everywhere
//   - IR51  chip/badge classes decided at construction time
//   - IR52  IIFE-wrapped, public surface namespaced under
//           window.AccordDigest; private functions _-prefixed
//   - IR54  SELECT-after-mutation pattern in idempotency checks
// ============================================================

(() => {
  'use strict';

  const $ = id => document.getElementById(id);

  function _defaultFilters() {
    return { status: new Set(['ready', 'sent']) };
  }

  // ── Local state ───────────────────────────────────────────────
  const local = {
    initialized:     false,
    meetings:        [],         // sealed meetings
    activeMeeting:   null,       // meeting_id
    digest:          null,       // computed digest object (per active meeting)
    recipientsAll:   [],         // all candidate recipients (attendees + thread participants)
    recipientsSelected: new Set(), // user_ids currently selected for send
    activeRecipient: null,       // user_id whose slice is shown
    sendStatus:      {},         // { meeting_id: 'unsent' | 'sending' | 'sent' }
    activeFilters:   _defaultFilters(),
  };

  const esc = s => Accord._esc ? Accord._esc(s) : String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // ── Surface activation ───────────────────────────────────────
  window.addEventListener('accord:surface-changed', async (ev) => {
    if (ev.detail?.surface !== 'digest') return;
    if (!local.initialized) {
      _wireUI();
      local.initialized = true;
    }
    await _refresh();
  });

  // ── Top-level refresh ────────────────────────────────────────
  async function _refresh() {
    await _loadMeetings();
    _renderRail();
    _renderAggregate();
    if (local.activeMeeting &&
        local.meetings.find(m => m.meeting_id === local.activeMeeting)) {
      await _loadDigestForActive();
      _renderPreview();
    } else {
      _renderEmptyPreview();
    }
  }

  // ── Loaders ──────────────────────────────────────────────────
  async function _loadMeetings() {
    try {
      // Sealed-only per IR42. RLS enforces firm-isolation.
      const rows = await API.get(
        'accord_meetings?sealed_at=not.is.null&select=*&order=sealed_at.desc'
      );
      local.meetings = rows || [];
      // Compute send-status from local cache + CoC events (best-effort).
      // Default to 'unsent' until we observe an accord.digest.delivered for
      // this meeting's id.
      local.meetings.forEach(m => {
        if (!local.sendStatus[m.meeting_id]) {
          local.sendStatus[m.meeting_id] = 'unsent';
        }
      });
      // Hydrate sent-status from CoC events (one round-trip)
      const meetingIds = local.meetings.map(m => m.meeting_id);
      if (meetingIds.length) {
        try {
          const ev = await API.get(
            `coc_events?event_class=eq.accord&event_type=eq.digest.delivered` +
            `&entity_id=in.(${meetingIds.join(',')})&select=entity_id&limit=2000`
          );
          (ev || []).forEach(r => {
            local.sendStatus[r.entity_id] = 'sent';
          });
        } catch (e) { /* non-fatal */ }
      }
    } catch (e) {
      console.error('[Accord-digest] loadMeetings failed', e);
      local.meetings = [];
    }
  }

  async function _loadDigestForActive() {
    const m = local.meetings.find(x => x.meeting_id === local.activeMeeting);
    if (!m) { local.digest = null; return; }
    try {
      // Sealed nodes for the meeting
      const nodes = await API.get(
        `accord_nodes?meeting_id=eq.${m.meeting_id}&sealed_at=not.is.null` +
        `&select=*&order=created_at.asc`
      );
      const allNodes = nodes || [];
      const nodeIds = allNodes.map(n => n.node_id);

      // Edges where from_node_id or to_node_id is in this meeting's node set
      let edges = [];
      if (nodeIds.length) {
        const idList = nodeIds.join(',');
        edges = await API.get(
          `accord_edges?or=(from_node_id.in.(${idList}),to_node_id.in.(${idList}))&select=*`
        ).catch(() => []) || [];
      }

      // Belief adjustments for any decision in this meeting
      const decisionIds = allNodes.filter(n => n.tag === 'decision').map(n => n.node_id);
      let adjustments = [];
      if (decisionIds.length) {
        adjustments = await API.get(
          `accord_belief_adjustments?target_node_id=in.(${decisionIds.join(',')})` +
          `&select=*&order=declared_at.desc`
        ).catch(() => []) || [];
      }

      // Organizer name
      let organizerName = null;
      if (m.organizer_id) {
        const u = await API.get(
          `users?id=eq.${m.organizer_id}&select=id,name`
        ).catch(() => []);
        organizerName = u?.[0]?.name || null;
      }

      // Build sections
      const decisions = allNodes.filter(n => n.tag === 'decision').map(n => {
        const adjs = adjustments.filter(a => a.target_node_id === n.node_id);
        const supportingCount = edges.filter(e => e.to_node_id === n.node_id && e.edge_type === 'supports').length;
        const counterCount    = edges.filter(e => e.to_node_id === n.node_id && (e.edge_type === 'weakens' || e.edge_type === 'contradicts')).length;
        return {
          node_id: n.node_id,
          summary: n.summary,
          declared_belief_summary: _beliefHeadline(adjs),
          evidence_count: supportingCount + counterCount,
          supporting_count: supportingCount,
          counter_count: counterCount,
        };
      });

      const actions = allNodes.filter(n => n.tag === 'action').map(n => ({
        node_id: n.node_id,
        summary: n.summary,
        suggested_assignee: n.created_by, // best-effort default; brief §4.3 allows operator adjust
        due_hint: null, // heuristic deferred per §4.3
      }));

      const risks = allNodes.filter(n => n.tag === 'risk').map(n => {
        const mitigationCount = edges.filter(e => e.to_node_id === n.node_id && e.edge_type === 'mitigates').length;
        return {
          node_id: n.node_id,
          summary: n.summary,
          mitigation_count: mitigationCount,
        };
      });

      const questionsOpen = allNodes.filter(n => {
        if (n.tag !== 'question') return false;
        const answered = edges.some(e => e.to_node_id === n.node_id &&
                                          (e.edge_type === 'answers' || e.edge_type === 'closes'));
        return !answered;
      }).map(n => ({
        node_id: n.node_id,
        summary: n.summary,
        raised_in_meeting_id: n.meeting_id,
      }));

      // Derive recipients: attendees (organizer for now — full attendees
      // require a meeting_attendees table not yet shipped) plus thread
      // participants (creators of any node in the thread).
      const recipientIds = new Set();
      if (m.organizer_id) recipientIds.add(m.organizer_id);

      // Thread participants — node creators in this thread
      let threadContribs = [];
      if (m.thread_id || allNodes[0]?.thread_id) {
        const tid = m.thread_id || allNodes[0].thread_id;
        try {
          const rows = await API.get(
            `accord_nodes?thread_id=eq.${tid}&select=created_by&limit=500`
          );
          threadContribs = Array.from(new Set((rows || []).map(r => r.created_by).filter(Boolean)));
        } catch (e) { /* non-fatal */ }
      }
      threadContribs.forEach(uid => recipientIds.add(uid));

      // Resolve names + roles
      const recipients = [];
      if (recipientIds.size) {
        const idList = Array.from(recipientIds).join(',');
        const users = await API.get(
          `users?id=in.(${idList})&select=id,name,role`
        ).catch(() => []);
        (users || []).forEach(u => {
          recipients.push({
            user_id: u.id,
            name:    u.name || 'Unknown',
            role:    u.role || null,
            has_actions: actions.some(a => a.suggested_assignee === u.id),
            has_beliefs: adjustments.some(adj => adj.declared_by === u.id),
          });
        });
      }

      local.digest = {
        meeting_id:     m.meeting_id,
        meeting_title:  m.title || 'Untitled',
        sealed_at:      m.sealed_at,
        organizer:      { user_id: m.organizer_id, name: organizerName || 'Unknown' },
        sections: { decisions, actions, risks, questions_open: questionsOpen },
        recipients,
      };

      // Default-select all recipients on first load for this meeting
      local.recipientsAll = recipients;
      if (!local.recipientsSelected.size ||
          ![...local.recipientsSelected].every(uid => recipients.find(r => r.user_id === uid))) {
        local.recipientsSelected = new Set(recipients.map(r => r.user_id));
      }
    } catch (e) {
      console.error('[Accord-digest] loadDigestForActive failed', e);
      local.digest = null;
    }
  }

  // ── Belief headline (CMD-A5 §5.4 vocabulary) ──────────────────
  function _beliefHeadline(adjs) {
    if (!adjs.length) return 'no belief declared';
    // Most recent overall is index 0 (already sorted desc by declared_at)
    const headline = adjs[0];
    const level = _deltaToLevel(headline.delta);
    const declarers = new Set(adjs.map(a => a.declared_by)).size;
    if (declarers > 1) return `belief: ${level} · ${declarers} declarers`;
    return `belief: ${level}`;
  }
  function _deltaToLevel(delta) {
    if (delta == null) return 'none-declared';
    if (delta > 0)     return 'high';
    if (delta < 0)     return 'low';
    return 'mixed';
  }

  // ── Rail render ──────────────────────────────────────────────
  function _renderRail() {
    const el = $('digestMeetingList');
    if (!local.meetings.length) {
      el.innerHTML = '<div style="color:var(--ink-faint);font-size:11px;padding:16px 4px;font-style:italic">No sealed meetings yet.</div>';
      return;
    }
    const f = local.activeFilters;
    const visible = local.meetings.filter(m => {
      const status = local.sendStatus[m.meeting_id] === 'sent' ? 'sent' : 'ready';
      return f.status.has(status);
    });
    if (!visible.length) {
      el.innerHTML = '<div style="color:var(--ink-faint);font-size:11px;padding:16px 4px;font-style:italic">No meetings match filters.</div>';
      return;
    }
    el.innerHTML = visible.map(m => {
      const status = local.sendStatus[m.meeting_id] === 'sent' ? 'sent' : 'ready';
      const sealedFmt = m.sealed_at
        ? new Date(m.sealed_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
        : '';
      const cls = ['digest-meeting-row'];
      if (m.meeting_id === local.activeMeeting) cls.push('active');
      return `
        <div class="${cls.join(' ')}" data-meeting-id="${m.meeting_id}">
          <div class="meeting-title">${esc(m.title || 'Untitled')}</div>
          <div class="meeting-meta">${esc(sealedFmt)}</div>
          <span class="meeting-status-pill ${status}">${esc(status)}</span>
        </div>`;
    }).join('');
    el.querySelectorAll('.digest-meeting-row').forEach(node => {
      node.addEventListener('click', () => _selectMeeting(node.dataset.meetingId));
    });
  }

  function _renderAggregate() {
    const total = local.meetings.length;
    let ready = 0, sent = 0;
    local.meetings.forEach(m => {
      if (local.sendStatus[m.meeting_id] === 'sent') sent++;
      else ready++;
    });
    const lines = [];
    lines.push(`<span class="agg-line total">${total} sealed meeting${total === 1 ? '' : 's'}</span>`);
    if (ready) lines.push(`<span class="agg-line">${ready} ready to send</span>`);
    if (sent)  lines.push(`<span class="agg-line">${sent} sent</span>`);
    $('digestAggregate').innerHTML = lines.join('');
  }

  async function _selectMeeting(meetingId) {
    local.activeMeeting = meetingId;
    local.recipientsSelected = new Set();
    local.activeRecipient = null;
    document.querySelectorAll('#digestMeetingList .digest-meeting-row').forEach(r => {
      r.classList.toggle('active', r.dataset.meetingId === meetingId);
    });
    await _loadDigestForActive();
    _renderPreview();
    // Open recipients panel automatically
    document.querySelector('#accord-app .digest-body')?.classList.add('recipients-open');
    _renderRecipients();
  }

  // ── Digest preview render ────────────────────────────────────
  function _renderEmptyPreview() {
    $('digestPreview').innerHTML =
      '<div class="digest-empty-cta">' +
      '<div><h3 style="font-family:Fraunces,serif;font-weight:600;font-size:18px;color:var(--ink-muted);margin-bottom:6px">Select a sealed meeting from the rail.</h3>' +
      '<p style="font-size:12px;color:var(--ink-faint);max-width:380px;line-height:1.55">The Digest & Send surface composes a per-meeting summary and routes its actions, risks, and per-recipient slices into the Chain of Custody.</p></div></div>';
    document.querySelector('#accord-app .digest-body')?.classList.remove('recipients-open');
  }

  function _renderPreview() {
    const d = local.digest;
    const el = $('digestPreview');
    if (!d) {
      _renderEmptyPreview();
      return;
    }
    const status = local.sendStatus[d.meeting_id] === 'sent' ? 'sent' : 'unsent';
    const sealedFmt = d.sealed_at
      ? new Date(d.sealed_at).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
      : '';

    const counts = {
      decisions: d.sections.decisions.length,
      actions:   d.sections.actions.length,
      risks:     d.sections.risks.length,
      questions: d.sections.questions_open.length,
    };

    const ctaStatusClass = (status === 'sent' ? 'sent' : '');
    const ctaStatusText  = (status === 'sent' ? 'sent — re-send to deliver to additional recipients' : 'ready to send');
    const sendDisabled   = (local.recipientsSelected.size === 0) ? 'disabled' : '';

    el.innerHTML = `
      <header class="digest-header">
        <h1 class="digest-title">${esc(d.meeting_title)}</h1>
        <div class="digest-meta">
          <span class="meta-pill">Sealed ${esc(sealedFmt)}</span>
          <span class="meta-pill">Organizer: ${esc(d.organizer.name)}</span>
          <span class="meta-pill">${counts.decisions}D · ${counts.actions}A · ${counts.risks}R · ${counts.questions}Q</span>
        </div>
      </header>

      <div class="digest-cta-row">
        <button class="digest-send-btn" id="digestRouteSendBtn" ${sendDisabled}>Route + Send</button>
        <span class="digest-send-status ${ctaStatusClass}">${esc(ctaStatusText)} · ${local.recipientsSelected.size} recipient${local.recipientsSelected.size === 1 ? '' : 's'}</span>
      </div>

      ${_renderDecisionsSection(d.sections.decisions)}
      ${_renderActionsSection(d.sections.actions)}
      ${_renderRisksSection(d.sections.risks)}
      ${_renderQuestionsSection(d.sections.questions_open)}
    `;

    $('digestRouteSendBtn')?.addEventListener('click', () => _openSendModal());
  }

  function _renderDecisionsSection(decisions) {
    if (!decisions.length) return '';
    const items = decisions.map(d => {
      const ctxPills = [];
      // R-51: pill class chosen at construction time
      if (d.declared_belief_summary === 'no belief declared') {
        ctxPills.push(`<span class="ctx-pill">${esc(d.declared_belief_summary)}</span>`);
      } else if (d.declared_belief_summary.startsWith('belief: high')) {
        ctxPills.push(`<span class="ctx-pill note">${esc(d.declared_belief_summary)}</span>`);
      } else if (d.declared_belief_summary.startsWith('belief: low')) {
        ctxPills.push(`<span class="ctx-pill warn">${esc(d.declared_belief_summary)}</span>`);
      } else {
        ctxPills.push(`<span class="ctx-pill signal">${esc(d.declared_belief_summary)}</span>`);
      }
      if (d.supporting_count) ctxPills.push(`<span class="ctx-pill">+${d.supporting_count} supporting</span>`);
      if (d.counter_count)    ctxPills.push(`<span class="ctx-pill warn">−${d.counter_count} counter</span>`);
      return `
        <div class="digest-item" data-node-id="${d.node_id}">
          <div class="digest-summary">${esc(d.summary || '')}</div>
          <div class="digest-context">${ctxPills.join('')}</div>
        </div>`;
    }).join('');
    return `
      <div class="digest-section">
        <div class="digest-section-header">
          <span class="digest-section-label">Decisions</span>
          <span class="digest-section-count">${decisions.length}</span>
        </div>
        ${items}
        <div style="font-size:11px;color:var(--ink-faint);margin-top:6px;font-style:italic">
          Decisions are already in the Decision Ledger.
        </div>
      </div>`;
  }

  function _renderActionsSection(actions) {
    if (!actions.length) return '';
    // Path B: deferred Compass routing. Render each action as a placeholder
    // card per CMD-COMPASS-BRIDGE deferral.
    const items = actions.map(a => `
      <div class="digest-action-placeholder" data-node-id="${a.node_id}">
        <div class="placeholder-tag">Action — routing deferred</div>
        <div class="digest-summary">${esc(a.summary || '')}</div>
        <div class="placeholder-deferral">
          Compass-side handler not yet implemented. Cross-module link will be created when CMD-COMPASS-BRIDGE ships.
        </div>
      </div>`).join('');
    return `
      <div class="digest-section">
        <div class="digest-section-header">
          <span class="digest-section-label">Actions</span>
          <span class="digest-section-count">${actions.length}</span>
        </div>
        ${items}
      </div>`;
  }

  function _renderRisksSection(risks) {
    if (!risks.length) return '';
    const items = risks.map(r => {
      const ctxPills = [];
      // R-51: mitigation pill class chosen at construction time
      if (r.mitigation_count) {
        ctxPills.push(`<span class="ctx-pill note">${r.mitigation_count} mitigating action${r.mitigation_count === 1 ? '' : 's'}</span>`);
      } else {
        ctxPills.push(`<span class="ctx-pill warn">unmitigated</span>`);
      }
      return `
        <div class="digest-item" data-node-id="${r.node_id}">
          <div class="digest-summary">${esc(r.summary || '')}</div>
          <div class="digest-context">${ctxPills.join('')}</div>
        </div>`;
    }).join('');
    return `
      <div class="digest-section">
        <div class="digest-section-header">
          <span class="digest-section-label">Risks</span>
          <span class="digest-section-count">${risks.length}</span>
        </div>
        ${items}
      </div>`;
  }

  function _renderQuestionsSection(questions) {
    if (!questions.length) return '';
    const items = questions.map(q => `
      <div class="digest-item" data-node-id="${q.node_id}">
        <div class="digest-summary">${esc(q.summary || '')}</div>
        <div class="digest-context">
          <span class="ctx-pill">carried forward</span>
        </div>
      </div>`).join('');
    return `
      <div class="digest-section">
        <div class="digest-section-header">
          <span class="digest-section-label">Open questions</span>
          <span class="digest-section-count">${questions.length}</span>
        </div>
        ${items}
      </div>`;
  }

  // ── Recipients panel ─────────────────────────────────────────
  function _renderRecipients() {
    const body = $('digestRecipientsBody');
    const d = local.digest;
    if (!d) { body.innerHTML = ''; return; }
    const recipients = local.recipientsAll;
    if (!recipients.length) {
      body.innerHTML = `
        <div class="detail-section-label" style="font:500 11px 'IBM Plex Mono',monospace;text-transform:uppercase;letter-spacing:0.08em;color:var(--ink-faint);margin-bottom:8px">Recipients</div>
        <div style="font-size:12px;color:var(--ink-faint);font-style:italic">No recipients derived. The meeting has no organizer or thread participants.</div>`;
      return;
    }
    const rows = recipients.map(r => {
      const isSelected = local.recipientsSelected.has(r.user_id);
      const isActive   = local.activeRecipient === r.user_id;
      const cls = ['recipient-row'];
      if (isSelected) cls.push('selected');
      if (isActive)   cls.push('active');
      return `
        <div class="${cls.join(' ')}" data-user-id="${r.user_id}">
          <span class="recipient-checkbox">${isSelected ? '✓' : ''}</span>
          <span class="recipient-name">${esc(r.name)}</span>
          <span class="recipient-role">${esc(r.role || '')}</span>
        </div>`;
    }).join('');
    const sliceHtml = local.activeRecipient ? _renderRecipientSlice(local.activeRecipient) : '';
    body.innerHTML = `
      <div style="font:500 11px 'IBM Plex Mono',monospace;text-transform:uppercase;letter-spacing:0.08em;color:var(--ink-faint);margin-bottom:8px">Recipients (${recipients.length})</div>
      ${rows}
      ${sliceHtml}
    `;
    body.querySelectorAll('.recipient-row').forEach(row => {
      const uid = row.dataset.userId;
      row.addEventListener('click', (ev) => {
        // Click on checkbox region toggles selection; click on body sets active
        if (ev.target.closest('.recipient-checkbox')) {
          if (local.recipientsSelected.has(uid)) local.recipientsSelected.delete(uid);
          else local.recipientsSelected.add(uid);
        } else {
          local.activeRecipient = uid;
        }
        _renderRecipients();
        // Update the send button enable + status text
        const sendBtn = $('digestRouteSendBtn');
        if (sendBtn) sendBtn.disabled = (local.recipientsSelected.size === 0);
        const status = document.querySelector('#digestPreview .digest-send-status');
        if (status) {
          const cur = status.textContent.split('·')[0].trim();
          status.textContent = cur + ' · ' + local.recipientsSelected.size +
            ' recipient' + (local.recipientsSelected.size === 1 ? '' : 's');
        }
      });
    });
  }

  function _renderRecipientSlice(userId) {
    const d = local.digest;
    if (!d) return '';
    const recipient = local.recipientsAll.find(r => r.user_id === userId);
    if (!recipient) return '';
    // Their actions
    const myActions = d.sections.actions.filter(a => a.suggested_assignee === userId);
    // Their declared beliefs — we re-fetch from adjustments cached during digest load
    // (we don't have direct access here; instead, summarize whether any belief was attributed
    // to them via has_beliefs flag from recipient derivation)
    const beliefHint = recipient.has_beliefs
      ? 'Has declared beliefs in this meeting (see Decision Ledger).'
      : null;
    const decisionsAll = d.sections.decisions;
    const itemsActions = myActions.length
      ? myActions.map(a => `<div class="slice-item"><span class="slice-tag">action</span>${esc(a.summary || '')}</div>`).join('')
      : '<div class="recipient-slice-empty">None.</div>';
    const beliefBlock = beliefHint
      ? `<div class="slice-item" style="font-style:italic;color:var(--ink-muted);margin-top:6px">${esc(beliefHint)}</div>`
      : '';
    return `
      <div class="recipient-slice">
        <div class="recipient-slice-label">Slice for ${esc(recipient.name)}</div>
        <div style="font:500 10px 'IBM Plex Mono',monospace;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-faint);margin-top:6px;margin-bottom:4px">Their actions</div>
        ${itemsActions}
        ${beliefBlock}
        <div style="font:500 10px 'IBM Plex Mono',monospace;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-faint);margin-top:8px;margin-bottom:4px">Decisions in this meeting</div>
        ${
          decisionsAll.length
            ? decisionsAll.slice(0, 5).map(dec =>
                `<div class="slice-item"><span class="slice-tag">decision</span>${esc(dec.summary || '')}</div>`
              ).join('') +
              (decisionsAll.length > 5 ? `<div style="font-size:11px;color:var(--ink-faint);margin-top:4px">+${decisionsAll.length - 5} more</div>` : '')
            : '<div class="recipient-slice-empty">None.</div>'
        }
      </div>`;
  }

  // ── Send flow (Path B — risks + per-recipient delivery only) ─
  function _openSendModal() {
    const d = local.digest;
    if (!d) return;
    const summary = `Send digest for "${d.meeting_title}" to ${local.recipientsSelected.size} recipient${local.recipientsSelected.size === 1 ? '' : 's'}? ` +
                    `Risks will register CoC events. Action routing to Compass is deferred to CMD-COMPASS-BRIDGE.`;
    $('digestSendModalSummary').textContent = summary;
    $('digestSendModal').classList.add('visible');
  }

  async function _send() {
    const d = local.digest;
    if (!d) return;
    const me = Accord.state.me;
    if (!me?.id) { alert('Identity not resolved; cannot send.'); return; }

    local.sendStatus[d.meeting_id] = 'sending';
    let risksRegistered = 0;
    let recipientsDelivered = 0;
    let risksSkipped = 0;

    try {
      // ── Risks: register each risk node via CoC. Idempotent per §7.3:
      // SELECT-before-INSERT — skip if a risk.registered event already
      // exists for this source_node_id in this firm.
      for (const r of d.sections.risks) {
        try {
          // §7.3 idempotency check (IR54: SELECT-after-mutation is the
          // discipline; here it's SELECT-before-mutation, the same family)
          const existing = await API.get(
            `coc_events?event_class=eq.risk&event_type=eq.registered` +
            `&entity_type=eq.accord_node&entity_id=eq.${r.node_id}&select=id&limit=1`
          ).catch(() => []);
          if (existing && existing.length) {
            risksSkipped++;
            continue;
          }
          await window.CoC.write('risk.registered', r.node_id, {
            entityType: 'accord_node',
            notes: 'Risk registered via Accord digest send: ' + (r.summary || '').slice(0, 240),
            meta: {
              source_meeting_id: d.meeting_id,
              source_node_id:    r.node_id,
              mitigation_count:  r.mitigation_count,
              source_uri:        'accord://node/' + r.node_id,
            },
          });
          risksRegistered++;
        } catch (e) {
          console.warn('[Accord-digest] risk.registered write failed for', r.node_id, e);
        }
      }

      // ── Per-recipient delivery: write accord.digest.delivered per
      // selected recipient. Each delivery is its own auditable event;
      // re-sends create fresh events per §7.3.
      const sliceCache = {};
      for (const uid of local.recipientsSelected) {
        const recipient = local.recipientsAll.find(x => x.user_id === uid);
        if (!recipient) continue;
        // Render a per-recipient slice as a compact text body for metadata
        const sliceText = _renderRecipientSliceText(uid);
        try {
          await window.CoC.write('accord.digest.delivered', d.meeting_id, {
            entityType: 'accord_meeting',
            notes: `Digest delivered to ${recipient.name}`,
            meta: {
              source_meeting_id: d.meeting_id,
              recipient_user_id: uid,
              recipient_name:    recipient.name,
              recipient_role:    recipient.role || null,
              digest_body:       sliceText,
              delivery_mode:     'mock-email-v0.1',
            },
          });
          recipientsDelivered++;
        } catch (e) {
          console.warn('[Accord-digest] digest.delivered write failed for', uid, e);
        }
      }

      local.sendStatus[d.meeting_id] = 'sent';
      _toast(`Digest sent to ${recipientsDelivered} recipient${recipientsDelivered === 1 ? '' : 's'}. ` +
             `${risksRegistered} risk${risksRegistered === 1 ? '' : 's'} registered` +
             (risksSkipped ? ` (${risksSkipped} already registered)` : '') + '.');
      _renderRail();
      _renderAggregate();
      _renderPreview();
      _renderRecipients();
    } catch (e) {
      console.error('[Accord-digest] send failed', e);
      local.sendStatus[d.meeting_id] = 'unsent';
      alert('Send failed: ' + (e?.message || e));
    }
  }

  function _renderRecipientSliceText(userId) {
    const d = local.digest;
    if (!d) return '';
    const recipient = local.recipientsAll.find(r => r.user_id === userId);
    if (!recipient) return '';
    const lines = [];
    lines.push(`Digest: ${d.meeting_title}`);
    lines.push(`Sealed: ${d.sealed_at}`);
    lines.push(`Recipient: ${recipient.name}` + (recipient.role ? ` (${recipient.role})` : ''));
    lines.push('');
    if (d.sections.decisions.length) {
      lines.push('DECISIONS:');
      d.sections.decisions.forEach(dec => {
        lines.push(`  - ${dec.summary} [${dec.declared_belief_summary}]`);
      });
      lines.push('');
    }
    const myActions = d.sections.actions.filter(a => a.suggested_assignee === userId);
    if (myActions.length) {
      lines.push('YOUR ACTIONS:');
      myActions.forEach(a => lines.push(`  - ${a.summary}`));
      lines.push('');
    }
    if (d.sections.risks.length) {
      lines.push('RISKS:');
      d.sections.risks.forEach(r => {
        lines.push(`  - ${r.summary} (${r.mitigation_count} mitigation${r.mitigation_count === 1 ? '' : 's'})`);
      });
      lines.push('');
    }
    if (d.sections.questions_open.length) {
      lines.push('OPEN QUESTIONS:');
      d.sections.questions_open.forEach(q => lines.push(`  - ${q.summary}`));
      lines.push('');
    }
    return lines.join('\n');
  }

  function _toast(msg) {
    const t = $('pdfToast');
    if (!t) return;
    const m = t.querySelector('.toast-msg');
    if (m) m.innerHTML = `<strong>${esc(msg)}</strong>`;
    t.classList.add('visible');
    setTimeout(() => t.classList.remove('visible'), 4500);
  }

  // ── Wire UI (one-time) ──────────────────────────────────────
  function _wireUI() {
    // Filter chips
    $('digestRail').addEventListener('click', (ev) => {
      const btn = ev.target.closest('.filter-chip');
      if (!btn || btn.disabled) return;
      const group = btn.dataset.filterGroup;
      const value = btn.dataset.filterValue;
      const set = local.activeFilters[group];
      if (!set) return;
      if (set.has(value)) set.delete(value);
      else set.add(value);
      btn.classList.toggle('active', set.has(value));
      _renderRail();
    });
    // Refresh
    $('digestRefreshBtn').addEventListener('click', () => _refresh());
    // Recipients close
    $('digestRecipientsClose').addEventListener('click', () => {
      document.querySelector('#accord-app .digest-body')?.classList.remove('recipients-open');
    });
    // Confirm modal
    $('digestSendCancel').addEventListener('click', () => {
      $('digestSendModal').classList.remove('visible');
    });
    $('digestSendConfirm').addEventListener('click', async () => {
      $('digestSendModal').classList.remove('visible');
      await _send();
    });
  }

  // Public surface
  window.AccordDigest = {
    _state:         local,
    _renderDigest:  _renderPreview,
    _selectMeeting: _selectMeeting,
    _send:          _send,
  };

  console.log('[Accord] digest surface module loaded');
})();