// ============================================================
// ProjectHUD — accord-ledger.js
// CMD-A5 · Decision Ledger surface
//
// Read-only across sealed decision nodes; mutation surface is
// the belief-adjustment composer only (writes accord_belief_
// adjustments rows with sealed_at NULL — sealed by next
// meeting END via the CMD-A1 trigger).
//
// Doctrinal commitments:
//   - Iron Rule 42 — sealed-only render. Pre-END nodes hidden.
//   - Iron Rule 44 — visual treatments derived from edge graph.
//     R-44-extension applied: chip class decided at construction.
//   - Iron Rule 45 — declared belief, not measured confidence.
//     Vocabulary: high / mixed / low / none-declared. No
//     "confidence", "probability", "certainty", "likelihood",
//     "posterior", or "prior" appears in user-facing strings.
//   - Iron Rule 47 (amended) — explicit accord_* PK names
//     everywhere: node_id, thread_id, meeting_id, edge_id,
//     adjustment_id.
// ============================================================

(() => {
  'use strict';

  const $ = id => document.getElementById(id);

  function _defaultFilters() {
    return {
      tag:    new Set(['decision']),
      status: new Set(['active', 'superseded', 'contradicted']),
      belief: new Set(['high', 'mixed', 'low', 'none-declared']),
      edge:   new Set(),
    };
  }

  // ── Local state ───────────────────────────────────────────────
  const local = {
    initialized:    false,
    decisions:      [],         // sealed decision nodes
    threads:        {},         // { thread_id: thread } for crumb
    meetings:       {},         // { meeting_id: meeting } for crumb
    edges:          [],         // edges where from/to is a decision in scope
    adjustments:    [],         // belief adjustments for visible decisions
    declarers:      {},         // { user_id: name }
    nodeIndex:      {},         // { node_id: node } including evidence-chain targets
    activeDecision: null,       // node_id of currently expanded decision
    activeFilters:  _defaultFilters(),
    searchTerm:     '',
    composer: {
      level:     null,          // 'high' | 'mixed' | 'low'
      rationale: '',
    },
    // CMD-SUBSTRATE-COUNTERFACTUAL-MIN Phase 3: dissent substrate
    dissents:       [],         // dissent nodes (sealed and unsealed) for visible decisions
    dissentEdges:   [],         // dissents_from edges for visible decisions
    dissentersById: {},         // { resource_id: name } for attribution
  };

  const esc = s => Accord._esc ? Accord._esc(s) : String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // ── Surface activation ───────────────────────────────────────
  window.addEventListener('accord:surface-changed', async (ev) => {
    if (ev.detail?.surface !== 'ledger') return;
    if (!local.initialized) {
      _wireUI();
      local.initialized = true;
    }
    await _refresh();
  });

  // ── Top-level refresh ────────────────────────────────────────
  async function _refresh() {
    await _loadDecisions();
    await _loadThreadAndMeetingContext();
    await _loadEdgesAndEvidenceContext();
    await _loadAdjustments();
    await _loadDeclarers();
    await _loadDissents();
    _renderList();
    _renderAggregate();
    if (local.activeDecision &&
        local.decisions.find(d => d.node_id === local.activeDecision)) {
      _renderDetail();
    } else {
      _closeDetail();
    }
  }

  // ── Loaders ──────────────────────────────────────────────────
  async function _loadDecisions() {
    try {
      const rows = await API.get(
        'accord_nodes?tag=eq.decision&sealed_at=not.is.null' +
        '&select=*&order=sealed_at.desc'
      );
      local.decisions = rows || [];
      local.nodeIndex = {};
      local.decisions.forEach(d => { local.nodeIndex[d.node_id] = d; });
    } catch (e) {
      console.error('[Accord-ledger] loadDecisions failed', e);
      local.decisions = [];
    }
  }

  async function _loadThreadAndMeetingContext() {
    const threadIds  = Array.from(new Set(local.decisions.map(d => d.thread_id).filter(Boolean)));
    const meetingIds = Array.from(new Set(local.decisions.map(d => d.meeting_id).filter(Boolean)));
    local.threads = {};
    local.meetings = {};
    if (threadIds.length) {
      const rows = await API.get(
        `accord_threads?thread_id=in.(${threadIds.join(',')})&select=*`
      ).catch(() => []);
      (rows || []).forEach(t => { local.threads[t.thread_id] = t; });
    }
    if (meetingIds.length) {
      const rows = await API.get(
        `accord_meetings?meeting_id=in.(${meetingIds.join(',')})&select=*`
      ).catch(() => []);
      (rows || []).forEach(m => { local.meetings[m.meeting_id] = m; });
    }
  }

  async function _loadEdgesAndEvidenceContext() {
    const decisionIds = local.decisions.map(d => d.node_id);
    if (!decisionIds.length) {
      local.edges = [];
      return;
    }
    const idList = decisionIds.join(',');
    try {
      const rows = await API.get(
        `accord_edges?or=(from_node_id.in.(${idList}),to_node_id.in.(${idList}))&select=*`
      );
      local.edges = rows || [];
    } catch (e) {
      console.error('[Accord-ledger] loadEdges failed', e);
      local.edges = [];
    }
    // Hydrate any non-decision nodes referenced by edges (evidence chain)
    const foreign = new Set();
    local.edges.forEach(e => {
      if (e.from_node_id && !local.nodeIndex[e.from_node_id]) foreign.add(e.from_node_id);
      if (e.to_node_id   && !local.nodeIndex[e.to_node_id])   foreign.add(e.to_node_id);
    });
    if (foreign.size) {
      const rows = await API.get(
        `accord_nodes?node_id=in.(${Array.from(foreign).join(',')})&select=node_id,thread_id,tag,summary,sealed_at`
      ).catch(() => []);
      (rows || []).forEach(n => { local.nodeIndex[n.node_id] = n; });
    }
  }

  async function _loadAdjustments() {
    const decisionIds = local.decisions.map(d => d.node_id);
    if (!decisionIds.length) {
      local.adjustments = [];
      return;
    }
    try {
      const rows = await API.get(
        `accord_belief_adjustments?target_node_id=in.(${decisionIds.join(',')})&select=*&order=declared_at.desc`
      );
      local.adjustments = rows || [];
    } catch (e) {
      console.error('[Accord-ledger] loadAdjustments failed', e);
      local.adjustments = [];
    }
  }

  async function _loadDeclarers() {
    const ids = new Set();
    local.decisions.forEach(d => d.created_by && ids.add(d.created_by));
    local.adjustments.forEach(a => a.declared_by && ids.add(a.declared_by));
    local.declarers = {};
    if (!ids.size) return;
    try {
      const rows = await API.get(
        `users?id=in.(${Array.from(ids).join(',')})&select=id,name`
      );
      (rows || []).forEach(u => { local.declarers[u.id] = u.name; });
    } catch (e) {
      console.error('[Accord-ledger] loadDeclarers failed', e);
    }
  }

  // CMD-SUBSTRATE-COUNTERFACTUAL-MIN Phase 3: load dissent nodes
  // and their dissents_from edges into local state. Includes both
  // sealed and unsealed dissents (operator UI shows draft dissents
  // pre-seal so the dissenter can see their work).
  async function _loadDissents() {
    local.dissents = [];
    local.dissentEdges = [];
    local.dissentersById = {};
    const decisionIds = local.decisions.map(d => d.node_id);
    if (!decisionIds.length) return;
    try {
      // Edges first — defines the visible dissent set
      const eRows = await API.get(
        `accord_edges?edge_type=eq.dissents_from&to_node_id=in.(${decisionIds.join(',')})&select=*`
      );
      local.dissentEdges = eRows || [];
      const dissentNodeIds = local.dissentEdges.map(e => e.from_node_id);
      if (!dissentNodeIds.length) return;
      const nRows = await API.get(
        `accord_nodes?node_id=in.(${dissentNodeIds.join(',')})&select=*`
      );
      local.dissents = nRows || [];
      // Hydrate dissenter names via resources → users
      const resIds = Array.from(new Set(local.dissents
        .map(n => n.dissented_by).filter(Boolean)));
      if (resIds.length) {
        const rRows = await API.get(
          `resources?id=in.(${resIds.join(',')})&select=id,first_name,last_name,email`
        );
        (rRows || []).forEach(r => {
          const nm = `${r.first_name||''} ${r.last_name||''}`.trim() || r.email || '—';
          local.dissentersById[r.id] = nm;
        });
      }
    } catch (e) {
      console.error('[Accord-ledger] loadDissents failed', e);
    }
  }

  // ── Per-decision derived state ──────────────────────────────
  // All visual treatments are derived purely from the edge graph
  // and the adjustment timeline — Iron Rule 44.
  function _decorateDecision(d) {
    const incoming = local.edges.filter(e => e.to_node_id   === d.node_id);
    const outgoing = local.edges.filter(e => e.from_node_id === d.node_id);
    const isSuperseded   = outgoing.some(e => e.edge_type === 'supersedes') ||
                           incoming.some(e => e.edge_type === 'supersedes');
    // §6.2: superseded chip means this decision has an OUTGOING supersedes edge
    // (i.e., it supersedes something else). For the UI's "Superseded" status
    // we want this decision to be the SUPERSEDED one — i.e., has INCOMING
    // supersedes. The brief's §6.2 wording is ambiguous; we use the more
    // common reader semantic: a "superseded" decision is the one being replaced.
    const beingSuperseded = incoming.some(e => e.edge_type === 'supersedes');
    const supersedingThis = outgoing.some(e => e.edge_type === 'supersedes');
    const supportingCount = incoming.filter(e => e.edge_type === 'supports').length;
    const counterCount    = incoming.filter(e => e.edge_type === 'weakens').length;
    const contradictCount = incoming.filter(e => e.edge_type === 'contradicts').length;
    const isContradicted  = contradictCount > 0;

    // Belief aggregation per §5.4: most-recent-per-declarer; headline is the
    // most-recent-overall. delta → level: +1 high, 0 mixed, -1 low.
    const adjs = local.adjustments
      .filter(a => a.target_node_id === d.node_id)
      .slice() // already sorted desc by declared_at on load
      .sort((a, b) => String(b.declared_at).localeCompare(String(a.declared_at)));
    const perDeclarer = {};
    adjs.forEach(a => {
      if (!perDeclarer[a.declared_by]) perDeclarer[a.declared_by] = a;
    });
    const declarerCount = Object.keys(perDeclarer).length;
    const headlineAdj   = adjs[0] || null;
    const headlineLevel = headlineAdj ? _deltaToLevel(headlineAdj.delta) : 'none-declared';

    return {
      incoming,
      outgoing,
      beingSuperseded,
      supersedingThis,
      isSuperseded:   beingSuperseded,
      isContradicted,
      supportingCount,
      counterCount,
      contradictCount,
      adjs,
      perDeclarer,
      declarerCount,
      headlineAdj,
      headlineLevel,
      // CMD-SUBSTRATE-COUNTERFACTUAL-MIN Phase 3: dissent count derived
      // from dissents_from edges targeting this decision.
      dissentCount: local.dissentEdges.filter(e => e.to_node_id === d.node_id).length,
    };
  }

  function _deltaToLevel(delta) {
    if (delta == null) return 'none-declared';
    if (delta > 0) return 'high';
    if (delta < 0) return 'low';
    return 'mixed';
  }
  function _levelToDelta(level) {
    if (level === 'high')  return 1;
    if (level === 'mixed') return 0;
    if (level === 'low')   return -1;
    return null;
  }

  // ── Filter pass ─────────────────────────────────────────────
  function _passesFilters(d, derived) {
    const f = local.activeFilters;
    if (!f.tag.has(d.tag)) return false;

    // §6.2 status filter — a decision can be in multiple status states
    // simultaneously (e.g., both superseded and contradicted). The chip
    // is satisfied if ANY of the decision's status states is currently
    // active in the filter set. A decision is "active" only when it has
    // none of the decoration states.
    const statusSet = new Set();
    if (derived.isSuperseded)   statusSet.add('superseded');
    if (derived.isContradicted) statusSet.add('contradicted');
    if (statusSet.size === 0)   statusSet.add('active');
    let statusMatch = false;
    for (const s of statusSet) { if (f.status.has(s)) { statusMatch = true; break; } }
    if (!statusMatch) return false;

    if (!f.belief.has(derived.headlineLevel)) return false;

    if (f.edge.size) {
      if (f.edge.has('has-supporting') && derived.supportingCount === 0) return false;
      if (f.edge.has('has-counter')    && derived.counterCount    === 0) return false;
      if (f.edge.has('superseded')     && !derived.isSuperseded)         return false;
      if (f.edge.has('contradicted')   && !derived.isContradicted)       return false;
    }

    if (local.searchTerm) {
      const hay = (d.summary || '').toLowerCase();
      if (!hay.includes(local.searchTerm)) return false;
    }

    return true;
  }

  // ── List render ─────────────────────────────────────────────
  function _renderList() {
    const el = $('ledgerList');
    if (!local.decisions.length) {
      el.innerHTML =
        '<div class="doc-empty"><h3>No sealed decisions yet.</h3>' +
        '<p>Decisions captured in Live Capture appear here once a meeting closes.</p></div>';
      return;
    }
    const rows = [];
    local.decisions.forEach(d => {
      const derived = _decorateDecision(d);
      d._derived = derived;
      if (!_passesFilters(d, derived)) return;
      rows.push(_renderDecisionRow(d, derived));
    });
    el.innerHTML = rows.join('') ||
      '<div class="doc-empty"><h3>No decisions match filters.</h3>' +
      '<p>Adjust the filter chips on the left.</p></div>';

    el.querySelectorAll('.decision-row').forEach(node => {
      const id = node.dataset.nodeId;
      node.addEventListener('click', (ev) => {
        // Don't open detail if a meta-link was clicked (e.g., crumb to Living Document)
        if (ev.target.closest('a[data-nav]')) return;
        _selectDecision(id);
      });
    });
    // Crumb navigation (per §9.6)
    el.querySelectorAll('a[data-nav-thread]').forEach(a => {
      a.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const tid = a.dataset.navThread;
        Accord.switchSurface('document');
        // accord-document.js exposes _selectThread on AccordDocument
        if (window.AccordDocument && tid) {
          setTimeout(() => window.AccordDocument._selectThread(tid), 50);
        }
      });
    });
  }

  function _renderDecisionRow(d, derived) {
    const cls = ['decision-row', 'tag-' + d.tag];
    if (d.node_id === local.activeDecision) cls.push('active');
    if (derived.isSuperseded)   cls.push('is-superseded');
    if (derived.isContradicted) cls.push('is-contradicted');
    if (derived.counterCount > derived.supportingCount && !derived.isContradicted) {
      cls.push('has-counter-weight');
    }

    const declarer = local.declarers[d.created_by] || 'Unknown';
    const meeting  = d.meeting_id ? local.meetings[d.meeting_id] : null;
    const thread   = d.thread_id  ? local.threads[d.thread_id]  : null;
    const sealed   = d.sealed_at ? new Date(d.sealed_at) : null;
    const sealedFmt = sealed ? sealed.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }) : '';

    const badges = _renderRowBadges(d, derived);

    return `
      <div class="${cls.join(' ')}" data-node-id="${d.node_id}">
        <div class="decision-summary">${esc(d.summary || '')}</div>
        <div class="decision-meta">
          <span class="meta-byline">Declared by ${esc(declarer)}</span>
          <span class="meta-crumb">in
            ${meeting ? esc(meeting.title || '(meeting)') : '(meeting)'}, ${esc(sealedFmt)}
          </span>
          ${thread ? `<span class="meta-crumb">· thread: <a data-nav data-nav-thread="${thread.thread_id}">${esc(thread.title || '(thread)')}</a></span>` : ''}
        </div>
        ${badges}
      </div>`;
  }

  // R-44-extension: chip classes decided at construction-time
  function _renderRowBadges(d, derived) {
    const out = [];
    // Belief headline
    const belief = derived.headlineLevel;
    const beliefCls = `decision-badge belief-${belief === 'none-declared' ? 'none' : belief}`;
    const beliefText = belief === 'none-declared'
      ? 'no belief declared'
      : `belief: ${belief}` +
        (derived.declarerCount > 1 ? ` · ${derived.declarerCount} declarers` : '');
    out.push(`<span class="${beliefCls}">${esc(beliefText)}</span>`);

    // Superseded
    if (derived.isSuperseded) {
      const supEdge = derived.incoming.find(e => e.edge_type === 'supersedes');
      const supBy   = supEdge ? local.nodeIndex[supEdge.from_node_id] : null;
      const summary = supBy?.summary ? _truncate(supBy.summary, 32) : '';
      out.push(`<span class="decision-badge superseded">superseded${summary ? ' by "' + esc(summary) + '"' : ''}</span>`);
    }

    // Contradicted
    if (derived.isContradicted) {
      out.push(`<span class="decision-badge contradicted">⚠ contradicted${derived.contradictCount > 1 ? ` (${derived.contradictCount})` : ''}</span>`);
    }

    // Supporting / counter aggregate
    if (derived.supportingCount) {
      out.push(`<span class="decision-badge supporting">+${derived.supportingCount} supporting</span>`);
    }
    if (derived.counterCount) {
      out.push(`<span class="decision-badge counter">−${derived.counterCount} counter-evidence</span>`);
    }

    // CMD-SUBSTRATE-COUNTERFACTUAL-MIN Phase 3: dissent badge
    if (derived.dissentCount) {
      out.push(`<span class="decision-badge has-dissent">⚑ ${derived.dissentCount} dissent${derived.dissentCount === 1 ? '' : 's'}</span>`);
    }

    return `<div class="decision-badges">${out.join('')}</div>`;
  }

  // ── Aggregate counts ────────────────────────────────────────
  function _renderAggregate() {
    const total = local.decisions.length;
    let active = 0, superseded = 0, contradicted = 0;
    let visible = 0;
    local.decisions.forEach(d => {
      const derived = d._derived || _decorateDecision(d);
      if (derived.isSuperseded)   superseded++;
      if (derived.isContradicted) contradicted++;
      if (!derived.isSuperseded && !derived.isContradicted) active++;
      if (_passesFilters(d, derived)) visible++;
    });
    const lines = [];
    lines.push(`<span class="agg-line total">${visible} of ${total} matching filters</span>`);
    if (active)       lines.push(`<span class="agg-line">${active} active</span>`);
    if (superseded)   lines.push(`<span class="agg-line">${superseded} superseded</span>`);
    if (contradicted) lines.push(`<span class="agg-line">${contradicted} contradicted</span>`);
    $('ledgerAggregate').innerHTML = lines.join('');
  }

  // ── Detail panel ────────────────────────────────────────────
  function _selectDecision(nodeId) {
    local.activeDecision = nodeId;
    document.querySelectorAll('#ledgerList .decision-row').forEach(r => {
      r.classList.toggle('active', r.dataset.nodeId === nodeId);
    });
    $('ledgerDetail').parentElement.classList.add('detail-open');
    _renderDetail();
  }

  function _closeDetail() {
    local.activeDecision = null;
    document.querySelectorAll('#ledgerList .decision-row.active').forEach(r => r.classList.remove('active'));
    document.querySelector('#accord-app .ledger-body')?.classList.remove('detail-open');
  }

  function _renderDetail() {
    const d = local.decisions.find(x => x.node_id === local.activeDecision);
    const body = $('ledgerDetailBody');
    if (!d) { body.innerHTML = ''; return; }
    const derived = d._derived || _decorateDecision(d);
    const declarer = local.declarers[d.created_by] || 'Unknown';
    const meeting  = d.meeting_id ? local.meetings[d.meeting_id] : null;
    const thread   = d.thread_id  ? local.threads[d.thread_id]  : null;
    const sealed   = d.sealed_at ? new Date(d.sealed_at) : null;
    const sealedFmt = sealed ? sealed.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }) : '';

    body.innerHTML = `
      <div class="detail-section">
        <div class="detail-section-label">Decision</div>
        <div class="detail-summary">${esc(d.summary || '')}</div>
        <div class="detail-crumb">
          Declared by ${esc(declarer)}
          ${meeting ? ` · in <a data-nav-meeting="${meeting.meeting_id}" data-nav-thread="${thread?.thread_id || ''}">${esc(meeting.title || '(meeting)')}</a>, ${esc(sealedFmt)}` : ''}
          ${thread  ? `<br>thread: <a data-nav-thread="${thread.thread_id}">${esc(thread.title || '(thread)')}</a>` : ''}
        </div>
        ${_renderDecisionDates(d)}
      </div>

      <div class="detail-section">
        <div class="detail-section-label">Belief history</div>
        ${_renderBeliefHistory(d, derived)}
      </div>

      <div class="detail-section">
        <div class="detail-section-label">Evidence chain</div>
        ${_renderEvidenceChain(d, derived)}
      </div>

      <div class="detail-section">
        <div class="detail-section-label">Declare belief</div>
        ${_renderComposer(d)}
      </div>

      <div class="detail-section">
        <div class="detail-section-label">
          Dissent${derived.dissentCount ? ` (${derived.dissentCount})` : ''}
          <button class="ledger-detail-action" id="ledgerOpenDissent" type="button">Register dissent</button>
        </div>
        ${_renderDissentList(d, derived)}
      </div>
    `;

    // Wire up nav links
    body.querySelectorAll('a[data-nav-thread]').forEach(a => {
      a.addEventListener('click', () => {
        const tid = a.dataset.navThread;
        if (!tid) return;
        Accord.switchSurface('document');
        if (window.AccordDocument) {
          setTimeout(() => window.AccordDocument._selectThread(tid), 50);
        }
      });
    });
    body.querySelectorAll('.evidence-chip[data-nav-thread]').forEach(a => {
      a.addEventListener('click', () => {
        const tid = a.dataset.navThread;
        if (!tid) return;
        Accord.switchSurface('document');
        if (window.AccordDocument) {
          setTimeout(() => window.AccordDocument._selectThread(tid), 50);
        }
      });
    });

    _wireComposer(d);

    // CMD-SUBSTRATE-COUNTERFACTUAL-MIN Phase 3: Register-Dissent button
    const dBtn = body.querySelector('#ledgerOpenDissent');
    if (dBtn) {
      dBtn.addEventListener('click', () => _openDissentModal(d));
    }
  }

  // CMD-SUBSTRATE-COUNTERFACTUAL-MIN Phase 4: render the effective_date
  // row in the Decision detail panel. Display-only for now; capture-time
  // setting is the operator path per Q-P4-1 Option C. Post-seal mutation
  // is blocked by Migration 8 trigger; pre-seal mutation will land in a
  // follow-up CMD if operator-driven date correction proves necessary.
  function _renderDecisionDates(d) {
    if (!d.effective_date && !d.effective_date_basis) {
      return `
        <div class="detail-date-row">
          <span class="detail-date-label">effective date</span>
          <span class="detail-date-empty">not set</span>
        </div>`;
    }
    const dateFmt = d.effective_date
      ? new Date(d.effective_date + 'T00:00:00').toLocaleDateString([], { year:'numeric', month:'short', day:'numeric' })
      : '';
    const basis = d.effective_date_basis
      ? `<span class="detail-date-basis">(${esc(d.effective_date_basis)})</span>`
      : '';
    return `
      <div class="detail-date-row">
        <span class="detail-date-label">effective date</span>
        <span class="detail-date-value">${esc(dateFmt)}</span>
        ${basis}
      </div>`;
  }

  function _renderBeliefHistory(d, derived) {
    if (!derived.adjs.length) {
      return '<div style="color:var(--ink-faint);font-size:12px;font-style:italic">No belief declarations yet.</div>';
    }
    // Compute delta direction relative to previous declaration by same declarer.
    // ▲ raised, ▼ lowered, ▬ no-change.
    const adjsAsc = derived.adjs.slice().reverse();
    const dirs = {};
    const prevPerDeclarer = {};
    adjsAsc.forEach(a => {
      const prev = prevPerDeclarer[a.declared_by];
      if (prev == null) dirs[a.adjustment_id] = '·';
      else if (a.delta > prev) dirs[a.adjustment_id] = '▲';
      else if (a.delta < prev) dirs[a.adjustment_id] = '▼';
      else dirs[a.adjustment_id] = '▬';
      prevPerDeclarer[a.declared_by] = a.delta;
    });

    return derived.adjs.map(a => {
      const level = _deltaToLevel(a.delta);
      const declarer = local.declarers[a.declared_by] || 'Unknown';
      const when = new Date(a.declared_at).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const unsealedCls = a.sealed_at ? '' : ' is-unsealed';
      return `
        <div class="belief-history-row${unsealedCls}">
          <div class="belief-line">
            <span class="belief-level ${level}">${esc(level)}</span>
            <span class="belief-arrow">${dirs[a.adjustment_id] || ''}</span>
            <span class="belief-byline">${esc(declarer)}</span>
            <span class="belief-when">${esc(when)}</span>
          </div>
          ${a.rationale ? `<div class="belief-rationale">${esc(a.rationale)}</div>` : ''}
        </div>`;
    }).join('');
  }

  function _renderEvidenceChain(d, derived) {
    const chips = [];

    const supports     = derived.incoming.filter(e => e.edge_type === 'supports');
    const weakens      = derived.incoming.filter(e => e.edge_type === 'weakens');
    const contradicts  = derived.incoming.filter(e => e.edge_type === 'contradicts');
    const cites        = derived.outgoing.filter(e => e.edge_type === 'cites' && e.to_node_id);
    const answersIn    = derived.incoming.filter(e => e.edge_type === 'answers');
    const answersOut   = derived.outgoing.filter(e => e.edge_type === 'answers');
    const supersedeOut = derived.outgoing.filter(e => e.edge_type === 'supersedes');
    const supersedeIn  = derived.incoming.filter(e => e.edge_type === 'supersedes');

    function chipFor(e, side) {
      // side = 'from' (use e.from_node_id) or 'to' (use e.to_node_id)
      const refId = side === 'from' ? e.from_node_id : e.to_node_id;
      const node = refId ? local.nodeIndex[refId] : null;
      if (!node) return '';
      const summary = _truncate(node.summary || '', 56);
      const navAttr = node.thread_id ? ` data-nav-thread="${node.thread_id}"` : '';
      return `<a class="evidence-chip"${navAttr}>
        <span class="tag-dot ${esc(node.tag)}"></span>
        <span class="evidence-tag">${esc(node.tag)}</span>
        ${esc(summary)}
      </a>`;
    }

    function section(label, edges, side) {
      if (!edges.length) return '';
      return `
        <div style="margin-bottom: 10px;">
          <div style="font-size:11px;color:var(--ink-faint);margin-bottom:4px;font-family:'IBM Plex Mono',monospace;">${esc(label)}</div>
          <div>${edges.map(e => chipFor(e, side)).join('')}</div>
        </div>`;
    }

    chips.push(section('Supports',     supports,    'from'));
    chips.push(section('Weakens',      weakens,     'from'));
    chips.push(section('Contradicts',  contradicts, 'from'));
    chips.push(section('Cites',        cites,       'to'));
    chips.push(section('Answers',      answersOut,  'to'));
    chips.push(section('Resolves',     answersIn,   'from'));
    chips.push(section('Supersedes',   supersedeOut,'to'));
    chips.push(section('Superseded by',supersedeIn, 'from'));

    const inner = chips.join('').trim();
    if (!inner) {
      return '<div style="color:var(--ink-faint);font-size:12px;font-style:italic">No evidence chain yet.</div>';
    }
    return inner;
  }

  function _renderComposer(d) {
    const lvl = local.composer.level;
    const txt = local.composer.rationale;
    return `
      <div class="belief-composer">
        <span class="composer-label">Belief level</span>
        <div class="belief-level-row">
          <button class="belief-level-btn high${lvl === 'high' ? ' selected' : ''}"  data-belief-level="high">High</button>
          <button class="belief-level-btn mixed${lvl === 'mixed' ? ' selected' : ''}" data-belief-level="mixed">Mixed</button>
          <button class="belief-level-btn low${lvl === 'low' ? ' selected' : ''}"   data-belief-level="low">Low</button>
        </div>
        <span class="composer-label">Rationale</span>
        <textarea class="belief-rationale" id="ledgerComposerRationale"
                  placeholder="Why this declaration?">${esc(txt)}</textarea>
        <button class="belief-declare-btn" id="ledgerComposerDeclare"
                ${(!lvl || !txt.trim()) ? 'disabled' : ''}>Declare belief</button>
      </div>`;
  }

  function _wireComposer(d) {
    document.querySelectorAll('#ledgerDetailBody .belief-level-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        local.composer.level = btn.dataset.beliefLevel;
        // Re-render just the composer (cheap; preserves rationale text via local state)
        const ta = $('ledgerComposerRationale');
        if (ta) local.composer.rationale = ta.value;
        const composerEl = document.querySelector('#ledgerDetailBody .belief-composer');
        if (composerEl) composerEl.outerHTML = _renderComposer(d);
        _wireComposer(d);
      });
    });
    const ta = $('ledgerComposerRationale');
    if (ta) {
      ta.addEventListener('input', () => {
        local.composer.rationale = ta.value;
        const btn = $('ledgerComposerDeclare');
        if (btn) btn.disabled = !(local.composer.level && ta.value.trim());
      });
    }
    const submit = $('ledgerComposerDeclare');
    if (submit) {
      submit.addEventListener('click', () => _declareBelief(d));
    }
  }

  async function _declareBelief(d) {
    const me = Accord.state.me;
    if (!me?.id || !me.firm_id) {
      alert('Identity not resolved; cannot declare belief.');
      return;
    }
    const level = local.composer.level;
    const rationale = (local.composer.rationale || '').trim();
    if (!level || !rationale) return;
    const delta = _levelToDelta(level);
    const row = {
      firm_id:         me.firm_id,
      target_node_id:  d.node_id,
      delta,
      rationale,
      declared_by:     me.id,
    };
    try {
      const created = await API.post('accord_belief_adjustments', row);
      const adj = Array.isArray(created) ? created[0] : created;
      // Update local state and re-render
      local.adjustments.unshift(adj);
      local.composer = { level: null, rationale: '' };
      _renderList();
      _renderAggregate();
      _renderDetail();
      _toast('Belief declared.');
      // §5.3 step 5 — broadcast on the meeting channel if a meeting is running
      try {
        if (Accord.state.meeting && Accord.state.meeting.state === 'running' &&
            typeof Accord.broadcast === 'function') {
          Accord.broadcast('accord.belief.declared', {
            adjustment_id:   adj.adjustment_id,
            target_node_id:  adj.target_node_id,
            declared_by:     adj.declared_by,
            delta:           adj.delta,
            declared_at:     adj.declared_at,
          });
        }
      } catch (e) { /* broadcast best-effort */ }
    } catch (e) {
      console.error('[Accord-ledger] declareBelief failed', e);
      alert('Belief declaration failed: ' + (e?.message || e));
    }
  }

  // ── Dissent (CMD-SUBSTRATE-COUNTERFACTUAL-MIN Phase 3) ──────

  // CMD-A6 / IR58 amended: dissented_by references resources.id, not users.id.
  // Same pattern as accord-digest._resolveMyResourceId — translate the current
  // session's users.id to resources.id once per session and cache.
  let _myResourceId = null;
  async function _resolveMyResourceId() {
    if (_myResourceId) return _myResourceId;
    // Prefer window._myResource (set by Compass IC layer per Phase 1 §F)
    if (window._myResource?.id) {
      _myResourceId = window._myResource.id;
      return _myResourceId;
    }
    const me = Accord.state.me;
    if (!me?.id) return null;
    try {
      const result = await API.post('rpc/accord_user_to_resource', { p_user_id: me.id });
      const rid = (typeof result === 'string') ? result :
                  (Array.isArray(result) && result.length) ? (result[0]?.accord_user_to_resource ?? result[0]) :
                  result;
      _myResourceId = rid || null;
    } catch (e) {
      try {
        const rows = await API.get(`resources?user_id=eq.${me.id}&select=id&limit=1`);
        _myResourceId = rows?.[0]?.id || null;
      } catch (e2) {
        console.warn('[Accord-ledger] resource_id resolution failed', e2);
      }
    }
    return _myResourceId;
  }

  function _renderDissentList(d, derived) {
    const dissents = local.dissentEdges
      .filter(e => e.to_node_id === d.node_id)
      .map(e => local.dissents.find(n => n.node_id === e.from_node_id))
      .filter(Boolean)
      .sort((a, b) => String(b.dissent_recorded_at || b.created_at)
                       .localeCompare(String(a.dissent_recorded_at || a.created_at)));
    if (!dissents.length) {
      return '<div style="color:var(--ink-faint);font-size:12px;font-style:italic">No dissents registered.</div>';
    }
    const rows = dissents.map(n => {
      const who = n.dissented_by ? (local.dissentersById[n.dissented_by] || '—') : '—';
      const when = n.dissent_recorded_at
        ? new Date(n.dissent_recorded_at).toLocaleDateString([], { year:'numeric', month:'short', day:'numeric' })
        : '';
      const sealedBadge = n.sealed_at
        ? '<span class="dissent-sealed-badge">sealed</span>'
        : '<span class="dissent-draft-badge">draft</span>';
      const predicted = n.dissent_predicted_outcome
        ? `<div class="dissent-predicted"><span class="dissent-predicted-label">predicted alternative:</span> ${esc(n.dissent_predicted_outcome)}</div>`
        : '';
      return `
        <div class="dissent-entry">
          <div class="dissent-entry-head">
            <span class="dissent-entry-who">${esc(who)}</span>
            <span class="dissent-entry-when">${esc(when)}</span>
            ${sealedBadge}
          </div>
          <div class="dissent-entry-rationale">${esc(n.dissent_rationale || '')}</div>
          ${predicted}
        </div>`;
    }).join('');
    return `<div class="dissent-list">${rows}</div>`;
  }

  function _openDissentModal(d) {
    const modal = $('dissentModal');
    if (!modal) {
      console.error('[Accord-ledger] dissentModal not found in DOM');
      return;
    }
    // Populate target callout (decision being dissented from)
    const tgt = $('dissentModalTarget');
    if (tgt) {
      const seq = d.seq_id || '(decision)';
      tgt.textContent = `${seq} · ${(d.summary || '').slice(0, 140)}${(d.summary || '').length > 140 ? '…' : ''}`;
    }
    // Reset form
    const r = $('dissentRationale');
    const p = $('dissentPredicted');
    if (r) r.value = '';
    if (p) p.value = '';
    // Stash target on modal for submit
    modal.dataset.targetNodeId = d.node_id;
    modal.classList.add('visible');
    if (r) setTimeout(() => r.focus(), 30);
  }

  function _closeDissentModal() {
    const modal = $('dissentModal');
    if (modal) {
      modal.classList.remove('visible');
      delete modal.dataset.targetNodeId;
    }
  }

  async function _submitDissent() {
    const modal = $('dissentModal');
    if (!modal) return;
    const targetNodeId = modal.dataset.targetNodeId;
    const rationale = ($('dissentRationale')?.value || '').trim();
    const predicted = ($('dissentPredicted')?.value || '').trim();
    if (!targetNodeId) {
      alert('No target decision identified; close and reopen the modal.');
      return;
    }
    if (!rationale) {
      alert('Rationale is required.');
      return;
    }
    const me = Accord.state.me;
    if (!me?.id || !me.firm_id) {
      alert('Identity not resolved; cannot register dissent.');
      return;
    }
    const myResourceId = await _resolveMyResourceId();
    if (!myResourceId) {
      alert('Could not resolve your resource identity (required for dissent attribution).');
      return;
    }
    const target = local.decisions.find(x => x.node_id === targetNodeId);
    if (!target) {
      alert('Target decision not found in current set; refresh and try again.');
      return;
    }

    // Step 1: insert dissent node (tag=dissent + dissent_* typed columns).
    // The seq_alloc trigger assigns DS-NNN automatically; the dissent_fields_check
    // constraint enforces dissented_by + rationale + recorded_at presence.
    const dissentNodeRow = {
      firm_id:                   me.firm_id,
      thread_id:                 target.thread_id,
      meeting_id:                target.meeting_id || null,
      tag:                       'dissent',
      summary:                   `Dissent on ${target.seq_id || target.node_id}: ${rationale.slice(0, 80)}${rationale.length > 80 ? '…' : ''}`,
      created_by:                me.id,
      dissented_by:              myResourceId,
      dissent_rationale:         rationale,
      dissent_predicted_outcome: predicted || null,
      dissent_recorded_at:       new Date().toISOString(),
    };
    let dissentNode;
    try {
      const created = await API.post('accord_nodes', dissentNodeRow);
      dissentNode = Array.isArray(created) ? created[0] : created;
    } catch (e) {
      console.error('[Accord-ledger] dissent node insert failed', e);
      alert('Dissent registration failed: ' + (e?.message || e));
      return;
    }

    // Step 2: insert dissents_from edge (dissent → decision).
    // The enforce_dissents_from_invariants trigger validates source/target tags
    // and 1:1 cardinality.
    const edgeRow = {
      firm_id:      me.firm_id,
      from_node_id: dissentNode.node_id,
      to_node_id:   target.node_id,
      edge_type:    'dissents_from',
      rationale:    rationale.slice(0, 200),
      declared_by:  me.id,
    };
    try {
      await API.post('accord_edges', edgeRow);
    } catch (e) {
      console.error('[Accord-ledger] dissents_from edge insert failed', e);
      alert('Dissent edge insert failed: ' + (e?.message || e) +
            '\n(The dissent node was created but is not linked. Refresh and re-register.)');
      _closeDissentModal();
      await _refresh();
      return;
    }

    // Step 3: CoC.write for accord.dissent.recorded (uses IR58-amended writer;
    // actor resolution flows via window._myResource per Phase 1 §F).
    try {
      if (window.CoC && typeof window.CoC.write === 'function') {
        await window.CoC.write('accord.dissent.recorded', dissentNode.node_id, {
          entityType: 'accord_dissent',
          notes: rationale.slice(0, 500),
          meta: {
            decision_id:        target.node_id,
            decision_seq_id:    target.seq_id || null,
            dissent_seq_id:     dissentNode.seq_id || null,
            predicted_outcome:  predicted || null,
          },
        });
      }
    } catch (e) {
      console.warn('[Accord-ledger] CoC.write best-effort failure', e);
    }

    _closeDissentModal();
    await _refresh();
    _toast('Dissent registered.');
  }

  function _toast(msg) {
    // Reuse the existing #pdfToast surface for transient confirmations.
    const t = $('pdfToast');
    if (!t) return;
    const m = t.querySelector('.toast-msg');
    if (m) m.innerHTML = `<strong>${esc(msg)}</strong>`;
    t.classList.add('visible');
    setTimeout(() => t.classList.remove('visible'), 3500);
  }

  // ── Wire UI (one-time) ──────────────────────────────────────
  function _wireUI() {
    // Filter chips
    $('ledgerRail').addEventListener('click', (ev) => {
      const btn = ev.target.closest('.filter-chip');
      if (!btn || btn.disabled) return;
      const group = btn.dataset.filterGroup;
      const value = btn.dataset.filterValue;
      const set = local.activeFilters[group];
      if (!set) return;
      if (set.has(value)) set.delete(value);
      else set.add(value);
      btn.classList.toggle('active', set.has(value));
      _renderList();
      _renderAggregate();
    });

    // Search
    $('ledgerSearch').addEventListener('input', (ev) => {
      local.searchTerm = (ev.target.value || '').toLowerCase().trim();
      _renderList();
      _renderAggregate();
    });

    // Refresh
    $('ledgerRefreshBtn').addEventListener('click', () => _refresh());

    // Detail close
    $('ledgerDetailClose').addEventListener('click', () => _closeDetail());

    // CMD-SUBSTRATE-COUNTERFACTUAL-MIN Phase 3: dissent modal handlers
    const cancelBtn  = $('dissentCancel');
    const confirmBtn = $('dissentConfirm');
    const modal      = $('dissentModal');
    if (cancelBtn)  cancelBtn.addEventListener('click', () => _closeDissentModal());
    if (confirmBtn) confirmBtn.addEventListener('click', () => _submitDissent());
    if (modal) {
      // Backdrop click closes (matches newMeetingModal pattern); inner clicks don't bubble out
      modal.addEventListener('click', (ev) => {
        if (ev.target === modal) _closeDissentModal();
      });
    }
    // Esc closes when modal is open
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && modal && modal.classList.contains('visible')) {
        _closeDissentModal();
      }
    });
  }

  // ── Helpers ─────────────────────────────────────────────────
  function _truncate(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  // Public surface (for debugging / future cross-surface hooks)
  window.AccordLedger = {
    _state:           local,
    _renderList:      _renderList,
    _selectDecision:  _selectDecision,
    _refresh:         _refresh,
  };

  console.log('[Accord] ledger surface module loaded');
})();