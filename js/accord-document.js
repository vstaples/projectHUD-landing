// ============================================================
// ProjectHUD — accord-document.js
// CMD-A4 · Living Document surface — read-only spine over sealed
// CoC nodes, grouped by meeting, with edge-derived rendering.
//
// Doctrinal commitments operationalized here:
//   - Iron Rule 42 — only sealed_at IS NOT NULL nodes render
//   - Iron Rule 44 — rendering is a pure function of the edge graph;
//     no authored decoration. Adding/removing edges via SQL re-renders
//     the surface on next load without code change.
//   - Iron Rule 47 — explicit accord_* PK names everywhere
//
// Lazy-loads on first activation of the Living Document tab.
// Manual refresh on subsequent activations (no live subscription).
// ============================================================

(() => {
  'use strict';

  const $ = id => document.getElementById(id);

  // ── Local state ───────────────────────────────────────────────
  const local = {
    initialized:   false,
    threads:       [],         // [{ thread_id, title, status, ... }]
    activeThread:  null,       // thread_id
    nodes:         [],         // sealed nodes for active thread (all meetings)
    meetings:      {},         // { meeting_id: { meeting_id, title, sealed_at, ... } }
    edges:         [],         // edges where from_node_id OR to_node_id is in this thread
    nodeIndex:     {},         // { node_id: node }  (for active thread + cross-thread targets)
    activeFilters: _defaultFilters(),
  };

  function _defaultFilters() {
    return {
      tag:    new Set(['note','decision','action','risk','question']),
      status: new Set(['active','superseded','answered','closed']),
      edge:   new Set(),  // edge presence chips are opt-in (default empty)
    };
  }

  const esc = s => Accord._esc ? Accord._esc(s) : String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // ── Surface activation ───────────────────────────────────────
  window.addEventListener('accord:surface-changed', async (ev) => {
    if (ev.detail?.surface !== 'document') return;
    if (!local.initialized) {
      _wireFilters();
      local.initialized = true;
    }
    await _loadThreads();
    _renderRail();
    if (local.activeThread) {
      // Re-fetch in case sealing happened in another tab
      await _loadThreadData(local.activeThread);
      _renderSpine();
    } else {
      _renderEmptySpine('no-selection');
    }
  });

  // ── Loaders ──────────────────────────────────────────────────
  async function _loadThreads() {
    try {
      const me = Accord.state.me;
      if (!me?.firm_id) {
        local.threads = [];
        return;
      }
      // RLS handles firm-isolation; no firm filter applied here.
      const rows = await API.get(
        'accord_threads?select=*&order=created_at.desc'
      );
      local.threads = rows || [];

      // Per-thread aggregate counts. Two strategies were considered:
      //  (a) one node SELECT per thread (N round-trips)
      //  (b) one bulk SELECT covering the firm's nodes, then group locally
      // (b) wins for any non-trivial thread count. PostgREST doesn't have
      // group-by, so we fetch the columns we need and aggregate client-side.
      const nodes = await API.get(
        'accord_nodes?select=node_id,thread_id,tag,sealed_at&sealed_at=not.is.null'
      ).catch(() => []);
      const counts = {};
      (nodes || []).forEach(n => {
        const t = (counts[n.thread_id] ||= { total: 0, byTag: {} });
        t.total++;
        t.byTag[n.tag] = (t.byTag[n.tag] || 0) + 1;
      });
      local.threads.forEach(t => {
        t._counts = counts[t.thread_id] || { total: 0, byTag: {} };
      });
    } catch (e) {
      console.error('[Accord-doc] loadThreads failed', e);
      local.threads = [];
    }
  }

  async function _loadThreadData(threadId) {
    if (!threadId) return;
    try {
      // Sealed nodes for the thread, ordered by created_at ASC for stable
      // grouping pass.
      const nodes = await API.get(
        `accord_nodes?thread_id=eq.${threadId}&sealed_at=not.is.null&select=*&order=created_at.asc`
      );
      local.nodes = nodes || [];

      // Build an index. We'll add cross-thread edge targets to it later.
      local.nodeIndex = {};
      local.nodes.forEach(n => { local.nodeIndex[n.node_id] = n; });

      // Meetings referenced
      const meetingIds = Array.from(new Set(local.nodes.map(n => n.meeting_id).filter(Boolean)));
      local.meetings = {};
      if (meetingIds.length) {
        const meetings = await API.get(
          `accord_meetings?meeting_id=in.(${meetingIds.join(',')})&select=*`
        );
        (meetings || []).forEach(m => { local.meetings[m.meeting_id] = m; });
      }

      // Edges where from_node_id OR to_node_id is in our node set.
      // PostgREST: use `or=(from_node_id.in.(...),to_node_id.in.(...))`.
      const nodeIds = local.nodes.map(n => n.node_id);
      if (nodeIds.length) {
        const idList = nodeIds.join(',');
        const edges = await API.get(
          `accord_edges?or=(from_node_id.in.(${idList}),to_node_id.in.(${idList}))&select=*`
        ).catch(() => []);
        local.edges = edges || [];

        // Hydrate any cross-thread node targets we don't already have, so
        // edge chips can render their target's summary.
        const foreignIds = new Set();
        local.edges.forEach(e => {
          if (e.from_node_id && !local.nodeIndex[e.from_node_id]) foreignIds.add(e.from_node_id);
          if (e.to_node_id   && !local.nodeIndex[e.to_node_id])   foreignIds.add(e.to_node_id);
        });
        if (foreignIds.size) {
          const foreign = await API.get(
            `accord_nodes?node_id=in.(${Array.from(foreignIds).join(',')})&select=node_id,thread_id,tag,summary`
          ).catch(() => []);
          (foreign || []).forEach(n => { local.nodeIndex[n.node_id] = n; });
        }
      } else {
        local.edges = [];
      }
    } catch (e) {
      console.error('[Accord-doc] loadThreadData failed', e);
      local.nodes = []; local.edges = []; local.meetings = {};
    }
  }

  // ── Rail render ──────────────────────────────────────────────
  function _renderRail() {
    const el = $('docThreadList');
    $('docThreadCount').textContent = String(local.threads.length);
    if (!local.threads.length) {
      el.innerHTML = '<div class="doc-empty" style="padding:18px 4px;text-align:left">No threads yet. Create one in Live Capture.</div>';
      return;
    }
    el.innerHTML = local.threads.map(t => {
      const c = t._counts || { total: 0, byTag: {} };
      const decisions = c.byTag.decision || 0;
      const questions = c.byTag.question || 0;
      const risks     = c.byTag.risk     || 0;
      const pills = [];
      if (c.total)    pills.push(`<span class="pill">${c.total} node${c.total === 1 ? '' : 's'}</span>`);
      if (decisions)  pills.push(`<span class="pill">${decisions}D</span>`);
      if (questions)  pills.push(`<span class="pill signal">${questions}Q</span>`);
      if (risks)      pills.push(`<span class="pill warn">${risks}R</span>`);
      return `
        <div class="thread-row ${t.thread_id === local.activeThread ? 'active' : ''}" data-thread-id="${t.thread_id}">
          <div class="thread-title">${esc(t.title)}</div>
          <div class="thread-meta">${pills.join('') || '<span class="pill">no nodes</span>'}</div>
        </div>`;
    }).join('');
    el.querySelectorAll('.thread-row').forEach(node => {
      node.addEventListener('click', async () => {
        await _selectThread(node.dataset.threadId);
      });
    });
  }

  async function _selectThread(threadId) {
    local.activeThread = threadId;
    local.activeFilters = _defaultFilters();
    await _loadThreadData(threadId);
    _renderRail();
    _renderSpine();
    _resetFilterChipsUi();
  }

  // ── Status derivation per §6.1 ──────────────────────────────
  // Returns 'active' | 'superseded' | 'answered' | 'closed'
  // Closed (action with closed Compass artifact) is not implemented
  // here per §6.1 — mark as 'active' for now and surface in findings.
  function _statusOf(node, edgesByTarget) {
    const incoming = edgesByTarget[node.node_id] || [];
    if (incoming.some(e => e.edge_type === 'supersedes' || e.edge_type === 'retracts')) {
      return 'superseded';
    }
    if (node.tag === 'question' &&
        incoming.some(e => e.edge_type === 'answers' || e.edge_type === 'closes')) {
      return 'answered';
    }
    if (node.tag === 'risk' && incoming.some(e => e.edge_type === 'mitigates')) {
      // Mitigated risks render with the mitigated treatment but counted
      // as "active" status for filter purposes — they remain on the
      // record. The caller treats them via class-based render.
      return 'active';
    }
    return 'active';
  }

  // ── Spine render ────────────────────────────────────────────
  function _renderSpine() {
    if (!local.activeThread) {
      _renderEmptySpine('no-selection');
      return;
    }
    const thread = local.threads.find(t => t.thread_id === local.activeThread);
    if (!thread) {
      _renderEmptySpine('no-selection');
      return;
    }

    if (!local.nodes.length) {
      $('docHeader').style.display = '';
      $('docFilters').style.display = 'none';
      $('docTitle').textContent = thread.title;
      $('docAggregate').innerHTML = '';
      $('docStream').innerHTML =
        '<div class="doc-empty"><h3>No sealed entries yet.</h3><p>Captures appear here once a meeting closes.</p></div>';
      return;
    }

    // Index edges by source and target for O(1) lookup
    const byTarget = {};
    const bySource = {};
    local.edges.forEach(e => {
      if (e.to_node_id) (byTarget[e.to_node_id] ||= []).push(e);
      if (e.from_node_id) (bySource[e.from_node_id] ||= []).push(e);
    });

    // Decorate every node with derived status + edge-driven flags
    local.nodes.forEach(n => {
      n._incoming = byTarget[n.node_id] || [];
      n._outgoing = bySource[n.node_id] || [];
      n._status   = _statusOf(n, byTarget);
      n._mitigated = n.tag === 'risk' &&
                     n._incoming.some(e => e.edge_type === 'mitigates');
    });

    // Header + aggregate
    $('docHeader').style.display = '';
    $('docFilters').style.display = '';
    $('docTitle').textContent = thread.title;
    _renderAggregate(thread);

    // Apply filters
    const visible = local.nodes.filter(n => _passesFilters(n, byTarget, bySource));

    // Group by meeting; preserve meeting chronological order via
    // earliest-node-time per meeting.
    const groups = [];                       // [{ meeting_id, nodes: [...] }]
    const groupIndex = {};
    visible.forEach(n => {
      let g = groupIndex[n.meeting_id || 'orphan'];
      if (!g) {
        g = { meeting_id: n.meeting_id, nodes: [] };
        groupIndex[n.meeting_id || 'orphan'] = g;
        groups.push(g);
      }
      g.nodes.push(n);
    });
    groups.sort((a, b) => {
      const ma = a.meeting_id ? local.meetings[a.meeting_id]?.sealed_at || a.nodes[0]?.created_at : '';
      const mb = b.meeting_id ? local.meetings[b.meeting_id]?.sealed_at || b.nodes[0]?.created_at : '';
      return String(ma).localeCompare(String(mb));
    });

    $('docStream').innerHTML = groups.map(g => _renderGroup(g)).join('') ||
      '<div class="doc-empty"><h3>No entries match filters.</h3><p>Adjust the filter chips above.</p></div>';

    // Wire cross-thread links
    $('docStream').querySelectorAll('.doc-cross-link').forEach(el => {
      el.addEventListener('click', async () => {
        const tid = el.dataset.threadId;
        const nid = el.dataset.nodeId;
        if (!tid) return;
        await _selectThread(tid);
        if (nid) {
          setTimeout(() => {
            const target = $('docStream').querySelector(`[data-node-id="${nid}"]`);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 50);
        }
      });
    });
  }

  function _renderEmptySpine(kind) {
    $('docHeader').style.display = 'none';
    $('docFilters').style.display = 'none';
    if (kind === 'no-selection') {
      $('docStream').innerHTML =
        '<div class="doc-empty"><h3>Select a thread from the rail.</h3>' +
        '<p>The Living Document surface renders the sealed evidence chain for one thread at a time.</p></div>';
    } else {
      $('docStream').innerHTML =
        '<div class="doc-empty"><h3>No threads in this project yet.</h3>' +
        '<p>Create one in Live Capture.</p></div>';
    }
  }

  // ── Aggregate strip ─────────────────────────────────────────
  function _renderAggregate(thread) {
    const total      = local.nodes.length;
    const decisions  = local.nodes.filter(n => n.tag === 'decision').length;
    const openQs     = local.nodes.filter(n =>
      n.tag === 'question' && n._status !== 'answered').length;
    const unmitRisks = local.nodes.filter(n =>
      n.tag === 'risk' && !n._mitigated).length;

    const segs = [];
    if (total)      segs.push({ k: 'total',     html: `${total} nodes` });
    if (decisions)  segs.push({ k: 'decision',  html: `${decisions} decision${decisions === 1 ? '' : 's'}` });
    if (openQs)     segs.push({ k: 'open-q',    html: `${openQs} open question${openQs === 1 ? '' : 's'}` });
    if (unmitRisks) segs.push({ k: 'unmit-r',   html: `${unmitRisks} unmitigated risk${unmitRisks === 1 ? '' : 's'}` });

    const el = $('docAggregate');
    el.innerHTML = segs.map((s, i) =>
      `${i ? '<span class="agg-sep">·</span>' : ''}<span class="agg-segment" data-agg="${s.k}">${s.html}</span>`
    ).join('');

    el.querySelectorAll('.agg-segment').forEach(seg => {
      seg.addEventListener('click', () => {
        const k = seg.dataset.agg;
        if (k === 'decision') {
          _setOnlyTagFilters(['decision']);
        } else if (k === 'open-q') {
          _setOnlyTagFilters(['question']);
          // Question that's not answered = active in our derivation
          _setStatusFilters(['active']);
        } else if (k === 'unmit-r') {
          _setOnlyTagFilters(['risk']);
          local.activeFilters.edge.add('has-unmitigated-risks');
        }
        _resetFilterChipsUi();
        _renderSpine();
      });
    });
  }

  function _setOnlyTagFilters(tags) {
    local.activeFilters.tag = new Set(tags);
  }
  function _setStatusFilters(statuses) {
    local.activeFilters.status = new Set(statuses);
  }

  // ── Filter chips ────────────────────────────────────────────
  function _wireFilters() {
    const filterEl = $('docFilters');
    filterEl.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.filter-chip');
      if (!btn) return;
      const group = btn.dataset.filterGroup;
      const value = btn.dataset.filterValue;
      const set = local.activeFilters[group];
      if (set.has(value)) set.delete(value);
      else set.add(value);
      btn.classList.toggle('active', set.has(value));
      _renderSpine();
    });
  }

  function _resetFilterChipsUi() {
    document.querySelectorAll('#docFilters .filter-chip').forEach(b => {
      const set = local.activeFilters[b.dataset.filterGroup];
      b.classList.toggle('active', set && set.has(b.dataset.filterValue));
    });
  }

  function _passesFilters(node, byTarget, bySource) {
    const f = local.activeFilters;
    // Tag
    if (!f.tag.has(node.tag)) return false;

    // Status — derive 4-way state for the chip set:
    //   active     = neither superseded nor (Q & answered)
    //   superseded = has incoming supersedes/retracts
    //   answered   = Q with incoming answers/closes
    //   closed     = Action whose Compass artifact is closed (not impl; omitted)
    let status;
    if (node._status === 'superseded') status = 'superseded';
    else if (node._status === 'answered') status = 'answered';
    else status = 'active';
    if (!f.status.has(status)) return false;

    // Edge presence (opt-in; AND across selected)
    if (f.edge.size) {
      const incoming = node._incoming;
      if (f.edge.has('has-supersession') &&
          !incoming.some(e => e.edge_type === 'supersedes')) return false;
      if (f.edge.has('has-contradicting') &&
          !incoming.some(e => e.edge_type === 'contradicts')) return false;
      if (f.edge.has('has-open-questions')) {
        if (!(node.tag === 'question' && status !== 'answered')) return false;
      }
      if (f.edge.has('has-unmitigated-risks')) {
        if (!(node.tag === 'risk' && !node._mitigated)) return false;
      }
    }

    return true;
  }

  // ── Group + node rendering ─────────────────────────────────
  function _renderGroup(g) {
    const m = g.meeting_id ? local.meetings[g.meeting_id] : null;
    const title = m?.title || (g.meeting_id ? '(meeting unavailable)' : 'Pre-meeting captures');
    const date  = m?.sealed_at ? new Date(m.sealed_at).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }) : '';
    const hasSuperseded = g.nodes.some(n => n._status === 'superseded');
    return `
      <div class="meeting-group">
        <div class="meeting-group-header">
          <div>
            <span class="meeting-group-title">${esc(title)}</span>
            ${hasSuperseded ? '<span class="meeting-group-delta" title="Includes superseded nodes">Δ</span>' : ''}
          </div>
          <span class="meeting-group-date">${esc(date)}</span>
        </div>
        ${g.nodes.map(n => _renderNode(n)).join('')}
      </div>`;
  }

  function _renderNode(node) {
    const t = new Date(node.created_at);
    const time = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const date = t.toLocaleDateString([], { month: 'short', day: 'numeric' });

    // Derive class flags entirely from edge graph (Iron Rule 44).
    const classes = ['doc-node', 'tag-' + node.tag];
    if (node._status === 'superseded') classes.push('is-superseded');
    if (node._status === 'answered')   classes.push('is-answered');
    if (node._mitigated)               classes.push('is-mitigated');
    // Elevation: a node is elevated if it has outgoing supersedes or
    // contradicts edges (it acts upon the record), or if it's a risk
    // with incoming raises edges. Authored decoration = none.
    if (node._outgoing.some(e => e.edge_type === 'supersedes' ||
                                 e.edge_type === 'contradicts')) {
      classes.push('is-elevated');
    }

    const chips = _renderEdgeChips(node);

    // CMD-SUBSTRATE-COUNTERFACTUAL-MIN Phase 5: seq_id prefix on inline
    // node references in the document spine. Applies to all node tags
    // (DC-NNN, AX-NNN, RK-NNN, OQ-NNN, NT-NNN, DS-NNN). Mono treatment
    // to match Decision Ledger row prefix.
    const seqPrefix = node.seq_id ? `<span class="doc-seq">${esc(node.seq_id)}</span> · ` : '';

    return `
      <div class="${classes.join(' ')}" data-node-id="${node.node_id}">
        <span class="doc-time">${esc(date)} ${esc(time)}</span>
        <span class="doc-tag"><span class="tag-dot ${esc(node.tag)}"></span>${esc(node.tag.toUpperCase())}</span>
        <div class="doc-content">
          <span class="doc-summary">${seqPrefix}${esc(node.summary || '')}</span>
          ${chips ? `<div class="doc-edge-row">${chips}</div>` : ''}
        </div>
      </div>`;
  }

  // ── Edge chip rendering (§5) ────────────────────────────────
  function _renderEdgeChips(node) {
    const out = [];
    const o = node._outgoing;
    const i = node._incoming;

    // Source-side chips for each outgoing edge type that has source-render
    o.forEach(e => {
      const tgt = e.to_node_id ? local.nodeIndex[e.to_node_id] : null;
      const tgtSummary = tgt?.summary ? _truncate(tgt.summary, 64) : null;
      const xthread    = tgt && tgt.thread_id !== local.activeThread;

      // Build linkAttrs with the correct class up-front. If the target lives
      // in another thread, add doc-cross-link so the click handler at the
      // top of _renderSpine() picks it up. Without this, cross-thread chips
      // for non-supersedes edge types render but don't navigate.
      const baseClass = xthread ? 'doc-edge-chip doc-cross-link' : 'doc-edge-chip';
      const linkAttrs = (xthread && tgt) ?
        ` class="${baseClass}" data-thread-id="${tgt.thread_id}" data-node-id="${tgt.node_id}"` :
        ` class="${baseClass}"`;

      switch (e.edge_type) {
        case 'supersedes':
          out.push(`<span${linkAttrs}>supersedes${tgtSummary ? ' "' + esc(tgtSummary) + '"' : ''}</span>`);
          break;
        case 'retracts':
          out.push(`<span${linkAttrs}>retracts${tgtSummary ? ' "' + esc(tgtSummary) + '"' : ''}</span>`);
          break;
        case 'answers':
          out.push(`<span${linkAttrs}>answers${tgtSummary ? ' "' + esc(tgtSummary) + '"' : ''}</span>`);
          break;
        case 'closes':
          out.push(`<span${linkAttrs}>closes${tgtSummary ? ' "' + esc(tgtSummary) + '"' : ''}</span>`);
          break;
        case 'supports':
          out.push(`<span${linkAttrs}>supports${tgtSummary ? ' "' + esc(tgtSummary) + '"' : ''}</span>`);
          break;
        case 'weakens':
          out.push(`<span${linkAttrs}>weakens${tgtSummary ? ' "' + esc(tgtSummary) + '"' : ''}</span>`);
          break;
        case 'contradicts': {
          const contraClass = xthread ? 'doc-edge-chip doc-cross-link contradiction' : 'doc-edge-chip contradiction';
          out.push(`<span class="${contraClass}"${xthread && tgt ? ' data-thread-id="' + tgt.thread_id + '" data-node-id="' + tgt.node_id + '"' : ''}>⚠ contradicts${tgtSummary ? ' "' + esc(tgtSummary) + '"' : ''}</span>`);
          break;
        }
        case 'raises':
          out.push(`<span${linkAttrs}>raises${tgtSummary ? ' "' + esc(tgtSummary) + '"' : ''}</span>`);
          break;
        case 'mitigates':
          out.push(`<span${linkAttrs}>mitigates${tgtSummary ? ' "' + esc(tgtSummary) + '"' : ''}</span>`);
          break;
        case 'cites':
          if (e.to_external_ref) {
            const m = e.to_external_ref.match(/^([a-z]+):\/\/([a-z_]+)\//);
            const badge = m ? m[1] : 'ext';
            out.push(`<span class="doc-edge-chip" title="${esc(e.to_external_ref)}">${esc(badge)} · ${esc(e.to_external_ref)}</span>`);
          } else if (tgt) {
            out.push(`<span${linkAttrs}>cites${tgtSummary ? ' "' + esc(tgtSummary) + '"' : ''}</span>`);
          }
          break;
      }
    });

    // Target-side aggregations for decisions (incoming supports/weakens/
    // contradicts → single aggregate chip per §5.2)
    if (node.tag === 'decision') {
      const sup = i.filter(e => e.edge_type === 'supports').length;
      const wk  = i.filter(e => e.edge_type === 'weakens').length;
      const ct  = i.filter(e => e.edge_type === 'contradicts').length;
      const parts = [];
      if (sup) parts.push(`+${sup} supporting`);
      if (wk)  parts.push(`−${wk} weakening`);
      if (ct)  parts.push(`${ct} contradicting`);
      if (parts.length) {
        const cls = ct ? 'doc-edge-chip aggregate contradiction' : 'doc-edge-chip aggregate';
        out.push(`<span class="${cls}">${parts.join(' · ')}</span>`);
      }

      // CMD-SUBSTRATE-COUNTERFACTUAL-MIN Phase 3: dissent count badge.
      // Inline counterpart to the Decision Ledger badge; uses same .has-dissent
      // class for visual consistency. Click is non-interactive in Living
      // Document; dissent details are accessed via the Decision Ledger surface.
      const dis = i.filter(e => e.edge_type === 'dissents_from').length;
      if (dis) {
        out.push(`<span class="doc-edge-chip has-dissent" title="View dissent details on Decision Ledger">⚑ ${dis} dissent${dis === 1 ? '' : 's'}</span>`);
      }

      // CMD-SUBSTRATE-COUNTERFACTUAL-MIN Phase 4: effective_date chip
      // for decisions. Display-only.
      if (node.effective_date) {
        const fmt = new Date(node.effective_date + 'T00:00:00').toLocaleDateString([], { year:'numeric', month:'short', day:'numeric' });
        const basis = node.effective_date_basis ? ` · ${esc(node.effective_date_basis)}` : '';
        out.push(`<span class="doc-edge-chip date-chip" title="Effective date">◷ effective ${esc(fmt)}${basis}</span>`);
      }
    }

    // CMD-SUBSTRATE-COUNTERFACTUAL-MIN Phase 4: due_date chip for actions
    if (node.tag === 'action' && node.due_date) {
      const fmt = new Date(node.due_date + 'T00:00:00').toLocaleDateString([], { year:'numeric', month:'short', day:'numeric' });
      out.push(`<span class="doc-edge-chip date-chip" title="Due date">◷ due ${esc(fmt)}</span>`);
    }

    // Question target-side: "answered by" link (most-recent answers/closes)
    if (node.tag === 'question') {
      const ans = i.find(e => e.edge_type === 'answers' || e.edge_type === 'closes');
      if (ans) {
        const src = local.nodeIndex[ans.from_node_id];
        if (src) {
          const xthread = src.thread_id !== local.activeThread;
          const cls = xthread ? 'doc-edge-chip doc-cross-link' : 'doc-edge-chip';
          out.push(`<span class="${cls}"${xthread ? ' data-thread-id="' + src.thread_id + '" data-node-id="' + src.node_id + '"' : ''}>answered by "${esc(_truncate(src.summary || '', 64))}"</span>`);
        }
      }
    }

    // Risk target-side: "mitigated by" with most recent action
    if (node.tag === 'risk' && node._mitigated) {
      const mits = i.filter(e => e.edge_type === 'mitigates');
      if (mits.length) {
        // Most recent by declared_at
        mits.sort((a, b) => String(b.declared_at).localeCompare(String(a.declared_at)));
        const src = local.nodeIndex[mits[0].from_node_id];
        if (src) {
          const xthread = src.thread_id !== local.activeThread;
          const cls = xthread ? 'doc-edge-chip doc-cross-link' : 'doc-edge-chip';
          const more = mits.length > 1 ? ` (+${mits.length - 1} more)` : '';
          out.push(`<span class="${cls}"${xthread ? ' data-thread-id="' + src.thread_id + '" data-node-id="' + src.node_id + '"' : ''}>mitigated by "${esc(_truncate(src.summary || '', 48))}"${esc(more)}</span>`);
        }
      }
    }

    // Superseded target-side: "superseded by" link
    if (node._status === 'superseded') {
      const sup = i.find(e => e.edge_type === 'supersedes');
      if (sup) {
        const src = local.nodeIndex[sup.from_node_id];
        if (src) {
          const xthread = src.thread_id !== local.activeThread;
          const cls = xthread ? 'doc-edge-chip doc-cross-link' : 'doc-edge-chip';
          out.push(`<span class="${cls}"${xthread ? ' data-thread-id="' + src.thread_id + '" data-node-id="' + src.node_id + '"' : ''}>superseded by "${esc(_truncate(src.summary || '', 48))}"</span>`);
        }
      }
    }

    return out.join('');
  }

  function _truncate(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  // Public API surface (mostly for debugging / future cross-surface
  // hooks). Not relied on by current consumers.
  window.AccordDocument = {
    _state:        local,
    _renderSpine:  _renderSpine,
    _selectThread: _selectThread,
  };

  console.log('[Accord] document surface module loaded');
})();