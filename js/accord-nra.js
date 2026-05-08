// ============================================================
// accord-nra.js — NRA (Next Required Action) Surface components
// CMD-ACCORD-NRA-SURFACE-1 Phase 2
//
// Exposes window.AccordNRA = {
//   Modal:        { open(node, mode, currentNRA?) , close() }
//   Badge:        { render(node, currentNRA, history?) → htmlString }
//   HistoryPanel: { open(nodeId, history), close() }
//   Events:       6 CustomEvent kinds dispatched on window
// }
//
// Substrate API consumed via API.rpc():
//   declare_nra, waive_nra, defer_nra, resolve_nra, supersede_nra
// Plus direct PATCH on accord_nras for declared↔deferred transitions
// (via existing F-P4-9/IR73 RLS UPDATE policies).
//
// CustomEvents dispatched (window-level, NOT realtime broadcast):
//   accord:nra-declared
//   accord:nra-waived
//   accord:nra-deferred
//   accord:nra-resolved
//   accord:nra-superseded
//   accord:nra-candidate-flagged   (dispatched by surface code on Phase 4
//                                   trigger detection; this module emits
//                                   on operator-driven candidate confirm)
//
// Style Doctrine v1.8 §3.8: Accord palette tokens only (matched in
// accord-nra.css). No Compass/Cadence/Pipeline borrowing.
//
// IR71 vigilance (state-mutation-before-invalidation): modal lifecycle
// uses clone-replace pattern to wipe stale listeners. Pass NRA data
// explicitly via arguments; do not rely on enclosing-scope state.
// ============================================================

(function () {
  'use strict';

  // ── Owner-event-type vocabulary (substrate v1) ─────────────
  const OWNER_EVENT_TYPES = [
    { value: 'next_phase_review',         label: 'Next phase review' },
    { value: 'next_status_sync',          label: 'Next status sync' },
    { value: 'next_meeting_in_workstream', label: 'Next meeting in this workstream' },
    { value: 'next_decision_review',      label: 'Next decision review' },
    { value: 'next_regulatory_milestone', label: 'Next regulatory milestone' },
  ];

  // ── Trigger-kind vocabulary (substrate v1, surface-relevant) ─
  const TRIGGER_KINDS = [
    { value: '',                                  label: '— None —' },
    { value: 'meeting_scheduled_in_workstream',   label: 'Any meeting scheduled in this workstream' },
    { value: 'meeting_sealed_in_workstream',      label: 'Any meeting sealed in this workstream' },
    // action_resolved / decision_resolved are forward-flag values per
    // CMD-ACCORD-NODE-RESOLUTION-SUBSTRATE-1 (queued); not surfaced in v1
  ];

  // ── HTML escape helper ─────────────────────────────────────
  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── Date helpers ───────────────────────────────────────────
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function fmtDateShort(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  function daysSince(iso) {
    if (!iso) return 0;
    const ms = Date.now() - new Date(iso).getTime();
    return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
  }

  // ── Dispatch CustomEvent to window ─────────────────────────
  function emit(kind, detail) {
    try {
      window.dispatchEvent(new CustomEvent('accord:' + kind, { detail }));
    } catch (e) {
      console.warn('[AccordNRA] CustomEvent dispatch failed', kind, e);
    }
  }

  // ════════════════════════════════════════════════════════════
  // MODAL — declare / waive / defer / update
  // ════════════════════════════════════════════════════════════
  const Modal = (function () {
    const BACKDROP_ID = 'accord-nra-modal-backdrop';

    // Returns the live backdrop element; clones it (IR71) before each open
    // so prior listeners are wiped clean. Caller binds fresh listeners.
    function _replaceBackdrop() {
      const old = document.getElementById(BACKDROP_ID);
      if (!old) {
        console.error('[AccordNRA] modal backdrop element missing from DOM');
        return null;
      }
      const fresh = old.cloneNode(true);
      old.parentNode.replaceChild(fresh, old);
      return fresh;
    }

    function _formHtml(mode, node, currentNRA) {
      const isUpdate = mode === 'update';
      const seed = isUpdate ? (currentNRA || {}) : {};

      if (mode === 'waive') {
        return `
          <h3>Waive NRA</h3>
          <p>This artifact is a guardrail; no forward motion required. Provide a brief reason that captures why future review isn't needed.</p>
          <label for="nra-waiver-reason">Waiver reason</label>
          <textarea id="nra-waiver-reason" rows="3"
            placeholder="e.g., Reference decision; superseded by DC-014; standing record."
          ></textarea>
        `;
      }

      if (mode === 'defer') {
        return `
          <h3>Defer NRA</h3>
          <p>OK to defer? You'll be reminded periodically. Forward-motion intent is recorded as deferred — operator picks up later.</p>
        `;
      }

      // declare or update — same field set
      const titleText = isUpdate ? 'Update NRA' : 'Declare NRA';
      const introText = isUpdate
        ? 'Update the next required action for this artifact. The current NRA is preserved as history.'
        : 'Declare the next required action that moves this artifact forward.';

      const ownerEventOptions = OWNER_EVENT_TYPES.map(o =>
        `<option value="${esc(o.value)}"${seed.owner_event_type === o.value ? ' selected' : ''}>${esc(o.label)}</option>`
      ).join('');
      const triggerKindOptions = TRIGGER_KINDS.map(t =>
        `<option value="${esc(t.value)}"${seed.trigger_kind === t.value ? ' selected' : ''}>${esc(t.label)}</option>`
      ).join('');

      const dueValue   = seed.due_date ? esc(seed.due_date) : '';
      const descValue  = seed.description ? esc(seed.description) : '';
      const typeChecked = (val) => seed.nra_type === val ? ' checked' : '';
      const ownerKind   = seed.owner_resource_id ? 'resource'
                        : seed.owner_event_type   ? 'event'
                        : seed.owner_is_operator  ? 'operator'
                        : 'operator';

      return `
        <h3>${esc(titleText)}</h3>
        <p>${esc(introText)}</p>

        <label>NRA type</label>
        <div class="nra-radio-group">
          <label class="nra-radio">
            <input type="radio" name="nra-type" value="pending_internal"${typeChecked('pending_internal')}>
            <span>Pending internal — we / our team owns it</span>
          </label>
          <label class="nra-radio">
            <input type="radio" name="nra-type" value="pending_external"${typeChecked('pending_external')}>
            <span>Pending external — waiting on someone outside our control</span>
          </label>
        </div>

        <label for="nra-due-date">Due date</label>
        <input type="date" id="nra-due-date" value="${dueValue}">

        <label for="nra-description">What has to happen next</label>
        <textarea id="nra-description" rows="2"
          placeholder="e.g., Confirm BOM with Acme by EOM"
        >${descValue}</textarea>

        <label>Owner</label>
        <div class="nra-radio-group">
          <label class="nra-radio">
            <input type="radio" name="nra-owner-kind" value="operator"${ownerKind === 'operator' ? ' checked' : ''}>
            <span>Me (operator)</span>
          </label>
          <label class="nra-radio">
            <input type="radio" name="nra-owner-kind" value="event"${ownerKind === 'event' ? ' checked' : ''}>
            <span>An upcoming event:</span>
          </label>
        </div>
        <select id="nra-owner-event-type" ${ownerKind === 'event' ? '' : 'disabled'}>
          <option value="">— select event —</option>
          ${ownerEventOptions}
        </select>

        <label for="nra-trigger-kind">Optional: substrate condition that satisfies this NRA</label>
        <select id="nra-trigger-kind">
          ${triggerKindOptions}
        </select>
        <div class="modal-helper">When the chosen condition fires, the system will flag this NRA as a resolution candidate.</div>
      `;
    }

    function open(node, mode, currentNRA) {
      // mode: 'declare' | 'waive' | 'defer' | 'update'
      // node: { node_id, firm_id, ... }
      // currentNRA (update mode only): existing accord_nras row
      if (!node || !node.node_id) {
        console.error('[AccordNRA] Modal.open: missing node argument');
        return;
      }

      const backdrop = _replaceBackdrop();
      if (!backdrop) return;

      const modal = backdrop.querySelector('.modal');
      modal.innerHTML = _formHtml(mode, node, currentNRA) + `
        <div class="modal-actions">
          <button class="btn btn-ghost"  id="nra-cancel">Cancel</button>
          <button class="btn btn-signal" id="nra-submit">${
            mode === 'waive'  ? 'Waive' :
            mode === 'defer'  ? 'Defer' :
            mode === 'update' ? 'Update NRA' :
                                'Declare NRA'
          }</button>
        </div>
      `;

      backdrop.classList.add('visible');

      // Bind listeners on the cloned backdrop only — IR71 discipline
      const cancelBtn = modal.querySelector('#nra-cancel');
      const submitBtn = modal.querySelector('#nra-submit');

      const closeHandler = () => close();
      cancelBtn.addEventListener('click', closeHandler);
      backdrop.addEventListener('click', (ev) => {
        if (ev.target === backdrop) closeHandler();
      });
      const escHandler = (ev) => {
        if (ev.key === 'Escape') {
          closeHandler();
          window.removeEventListener('keydown', escHandler);
        }
      };
      window.addEventListener('keydown', escHandler);

      // Owner-kind radios enable/disable the event-type select
      if (mode === 'declare' || mode === 'update') {
        const eventSelect = modal.querySelector('#nra-owner-event-type');
        modal.querySelectorAll('input[name="nra-owner-kind"]').forEach(r => {
          r.addEventListener('change', () => {
            const kind = modal.querySelector('input[name="nra-owner-kind"]:checked')?.value;
            eventSelect.disabled = (kind !== 'event');
            if (kind !== 'event') eventSelect.value = '';
          });
        });
      }

      submitBtn.addEventListener('click', async () => {
        submitBtn.disabled = true;
        const origText = submitBtn.textContent;
        submitBtn.textContent = 'Working…';
        try {
          await _submit(mode, node, currentNRA, modal);
          close();
        } catch (e) {
          console.error('[AccordNRA] submit failed', e);
          alert('NRA action failed: ' + (e?.message || e));
          submitBtn.disabled = false;
          submitBtn.textContent = origText;
        }
      });
    }

    function close() {
      const backdrop = document.getElementById(BACKDROP_ID);
      if (backdrop) {
        backdrop.classList.remove('visible');
        backdrop.querySelector('.modal').innerHTML = '';
      }
    }

    async function _submit(mode, node, currentNRA, modal) {
      if (mode === 'waive') {
        const reason = modal.querySelector('#nra-waiver-reason').value.trim();
        if (!reason) throw new Error('Waiver reason is required');
        const result = await API.rpc('waive_nra', {
          p_node_id: node.node_id,
          p_reason:  reason,
        });
        const row = Array.isArray(result) ? result[0] : result;
        emit('nra-waived', { node_id: node.node_id, nra_id: row?.nra_id, firm_id: node.firm_id });
        return row;
      }

      if (mode === 'defer') {
        const result = await API.rpc('defer_nra', { p_node_id: node.node_id });
        const row = Array.isArray(result) ? result[0] : result;
        emit('nra-deferred', { node_id: node.node_id, nra_id: row?.nra_id, firm_id: node.firm_id });
        return row;
      }

      // declare or update
      const formData = _readForm(modal);
      _validateForm(formData);

      if (mode === 'update') {
        if (!currentNRA?.nra_id) throw new Error('Update mode requires currentNRA.nra_id');
        const result = await API.rpc('supersede_nra', {
          p_old_nra_id:   currentNRA.nra_id,
          p_new_nra_data: {
            nra_type:           formData.nra_type,
            due_date:           formData.due_date,
            description:        formData.description,
            owner_resource_id:  null, // v1: surface limits owner to operator OR event-type
            owner_event_type:   formData.owner_event_type || null,
            owner_is_operator:  formData.owner_is_operator,
            trigger_kind:       formData.trigger_kind || null,
            trigger_target_id:  formData.trigger_target_id || null,
          },
        });
        const row = Array.isArray(result) ? result[0] : result;
        emit('nra-superseded', {
          node_id:    node.node_id,
          nra_id:     row?.nra_id,
          old_nra_id: currentNRA.nra_id,
          new_nra_id: row?.nra_id,
          firm_id:    node.firm_id,
        });
        return row;
      }

      // declare
      const result = await API.rpc('declare_nra', {
        p_node_id:           node.node_id,
        p_nra_type:          formData.nra_type,
        p_due_date:          formData.due_date,
        p_description:       formData.description,
        p_owner_resource_id: null,
        p_owner_event_type:  formData.owner_event_type || null,
        p_owner_is_operator: formData.owner_is_operator,
        p_trigger_kind:      formData.trigger_kind || null,
        p_trigger_target_id: formData.trigger_target_id || null,
      });
      const row = Array.isArray(result) ? result[0] : result;
      emit('nra-declared', {
        node_id:   node.node_id,
        nra_id:    row?.nra_id,
        firm_id:   node.firm_id,
        nra_type:  formData.nra_type,
        due_date:  formData.due_date,
      });
      return row;
    }

    function _readForm(modal) {
      const nra_type    = modal.querySelector('input[name="nra-type"]:checked')?.value || null;
      const due_date    = modal.querySelector('#nra-due-date').value || null;
      const description = modal.querySelector('#nra-description').value.trim();
      const ownerKind   = modal.querySelector('input[name="nra-owner-kind"]:checked')?.value;
      const owner_event_type = ownerKind === 'event'
        ? (modal.querySelector('#nra-owner-event-type').value || null)
        : null;
      const owner_is_operator = ownerKind === 'operator';
      const trigger_kind = modal.querySelector('#nra-trigger-kind').value || null;

      return {
        nra_type,
        due_date,
        description,
        owner_event_type,
        owner_is_operator,
        trigger_kind,
        trigger_target_id: null, // v1: not surfaced; substrate accepts NULL
      };
    }

    function _validateForm(d) {
      if (!d.nra_type)        throw new Error('NRA type is required');
      if (!d.due_date)        throw new Error('Due date is required');
      if (!d.description)     throw new Error('Description is required');
      if (!d.owner_is_operator && !d.owner_event_type) {
        throw new Error('Owner is required (Me, or an upcoming event)');
      }
    }

    return { open, close };
  })();

  // ════════════════════════════════════════════════════════════
  // BADGE — render inline next to nodes
  // ════════════════════════════════════════════════════════════
  const Badge = (function () {

    function render(node, currentNRA, historyCount) {
      // Returns HTML string. Caller is responsible for click-handler wiring
      // via event delegation or by re-binding after innerHTML; module also
      // exposes wireClickHandlers() helper for delegation.

      if (!currentNRA) {
        if (historyCount && historyCount > 0) {
          return _renderHistoryOnly(node, historyCount);
        }
        return _renderGrandfathered(node);
      }

      switch (currentNRA.state) {
        case 'declared':
          if (currentNRA.resolution_candidate_at) {
            return _renderCandidate(node, currentNRA);
          }
          return _renderDeclared(node, currentNRA);
        case 'waived':
          return _renderWaived(node, currentNRA);
        case 'deferred':
          return _renderDeferred(node, currentNRA);
        case 'resolved':
          // resolved current NRA shouldn't appear in accord_nras_current,
          // but defensive render
          return _renderHistoryOnly(node, historyCount || 1);
        default:
          return '';
      }
    }

    function _renderDeclared(node, nra) {
      const ownerLabel = _ownerLabel(nra);
      const variant    = nra.owner_is_operator ? 'declared-internal-operator'
                       : nra.owner_event_type   ? 'declared-internal-event'
                       : 'declared-external';
      return `<span class="accord-nra-badge accord-nra-${variant}"
                data-nra-action="edit"
                data-node-id="${esc(node.node_id)}"
                data-nra-id="${esc(nra.nra_id)}"
                title="${esc(nra.description || '')}">→ ${esc(ownerLabel)} · ${esc(fmtDateShort(nra.due_date))}</span>`;
    }

    function _renderCandidate(node, nra) {
      const ownerLabel = _ownerLabel(nra);
      return `<span class="accord-nra-badge accord-nra-candidate"
                data-nra-action="edit"
                data-node-id="${esc(node.node_id)}"
                data-nra-id="${esc(nra.nra_id)}"
                title="System detected a substrate event that may have satisfied this NRA. Click to confirm or correct.">✓? ${esc(ownerLabel)} · candidate</span>`;
    }

    function _renderWaived(node, nra) {
      return `<span class="accord-nra-badge accord-nra-waived"
                data-nra-action="edit"
                data-node-id="${esc(node.node_id)}"
                data-nra-id="${esc(nra.nra_id)}"
                title="${esc(nra.waived_reason || 'Waived')}">⊘ guardrail</span>`;
    }

    function _renderDeferred(node, nra) {
      const days = daysSince(nra.deferred_at);
      const ageClass = days > 60 ? 'accord-nra-deferred-late'
                     : days > 30 ? 'accord-nra-deferred-aging'
                     : 'accord-nra-deferred';
      return `<span class="accord-nra-badge ${ageClass}"
                data-nra-action="edit"
                data-node-id="${esc(node.node_id)}"
                data-nra-id="${esc(nra.nra_id)}"
                title="Deferred ${days}d ago">⏸ deferred ${days}d</span>`;
    }

    function _renderHistoryOnly(node, count) {
      return `<span class="accord-nra-badge accord-nra-history"
                data-nra-action="history"
                data-node-id="${esc(node.node_id)}"
                title="Click to view NRA history">✓ NRA history (${count})</span>`;
    }

    function _renderGrandfathered(node) {
      return `<span class="accord-nra-badge accord-nra-grandfathered"
                data-nra-action="add"
                data-node-id="${esc(node.node_id)}"
                title="No NRA on record. Click to declare.">+ Add NRA</span>`;
    }

    function _ownerLabel(nra) {
      if (nra.owner_is_operator) return 'Me';
      if (nra.owner_event_type) {
        const o = OWNER_EVENT_TYPES.find(e => e.value === nra.owner_event_type);
        return o ? o.label : nra.owner_event_type;
      }
      return 'External';
    }

    // Click delegation helper — wire once on a container. Container's
    // descendants with data-nra-action are dispatched to Modal.open or
    // HistoryPanel.open. Caller provides node-lookup function.
    function wireClickHandlers(container, lookupNodeAndNRA) {
      if (!container || container._nraWired) return;
      container._nraWired = true;
      container.addEventListener('click', async (ev) => {
        const badge = ev.target.closest('.accord-nra-badge[data-nra-action]');
        if (!badge) return;
        const action = badge.dataset.nraAction;
        const nodeId = badge.dataset.nodeId;
        const nraId  = badge.dataset.nraId;
        try {
          const ctx = await lookupNodeAndNRA(nodeId, nraId);
          if (!ctx?.node) return;
          if (action === 'history') {
            const history = await _fetchHistory(nodeId);
            HistoryPanel.open(nodeId, history);
          } else if (action === 'add') {
            Modal.open(ctx.node, 'declare');
          } else if (action === 'edit') {
            Modal.open(ctx.node, 'update', ctx.currentNRA);
          }
        } catch (e) {
          console.error('[AccordNRA] click handler failed', e);
        }
      });
    }

    async function _fetchHistory(nodeId) {
      const rows = await API.get(
        `accord_nras?node_id=eq.${nodeId}&order=created_at.desc&select=*`
      ).catch(() => []);
      return rows || [];
    }

    return { render, wireClickHandlers };
  })();

  // ════════════════════════════════════════════════════════════
  // HISTORY PANEL — right-side timeline of NRAs on a node
  // ════════════════════════════════════════════════════════════
  const HistoryPanel = (function () {
    const PANEL_ID = 'accord-nra-history-panel';

    function open(nodeId, history) {
      const panel = document.getElementById(PANEL_ID);
      if (!panel) {
        console.error('[AccordNRA] history panel element missing from DOM');
        return;
      }
      panel.querySelector('.accord-nra-panel-body').innerHTML = _renderTimeline(history);
      panel.classList.add('visible');

      // Wire close handlers (clone-replace for IR71)
      const old = panel.querySelector('.accord-nra-panel-close');
      const fresh = old.cloneNode(true);
      old.parentNode.replaceChild(fresh, old);
      fresh.addEventListener('click', close);

      const escHandler = (ev) => {
        if (ev.key === 'Escape') {
          close();
          window.removeEventListener('keydown', escHandler);
        }
      };
      window.addEventListener('keydown', escHandler);
    }

    function close() {
      const panel = document.getElementById(PANEL_ID);
      if (panel) panel.classList.remove('visible');
    }

    function _renderTimeline(history) {
      if (!history || !history.length) {
        return '<div class="accord-nra-empty">No NRA history.</div>';
      }
      return history.map(_renderRow).join('');
    }

    function _renderRow(nra) {
      const stateGlyph = {
        declared:   '→',
        waived:     '⊘',
        deferred:   '⏸',
        resolved:   '✓',
        superseded: '⤴',
      }[nra.state] || '·';
      const stateLabel = nra.state.charAt(0).toUpperCase() + nra.state.slice(1);
      const date = nra.resolved_at  ? fmtDate(nra.resolved_at)
                 : nra.superseded_at ? fmtDate(nra.superseded_at)
                 : nra.deferred_at  ? fmtDate(nra.deferred_at)
                 : nra.waived_at    ? fmtDate(nra.waived_at)
                 : nra.due_date     ? fmtDate(nra.due_date)
                 : fmtDate(nra.created_at);
      const detail = nra.state === 'waived'    ? esc(nra.waived_reason || '')
                   : nra.state === 'resolved'  ? `Resolved via ${esc(nra.resolved_mechanism || 'manual')}`
                   : nra.state === 'superseded' ? 'Superseded by next entry above'
                   : esc(nra.description || '');
      const owner = nra.owner_is_operator ? 'Me'
                  : nra.owner_event_type   ? (OWNER_EVENT_TYPES.find(o => o.value === nra.owner_event_type)?.label || nra.owner_event_type)
                  : '';
      return `
        <div class="accord-nra-history-row accord-nra-state-${esc(nra.state)}">
          <div class="accord-nra-history-glyph">${stateGlyph}</div>
          <div class="accord-nra-history-content">
            <div class="accord-nra-history-head">
              <span class="accord-nra-history-state">${esc(stateLabel)}</span>
              <span class="accord-nra-history-date">${esc(date)}</span>
            </div>
            ${owner ? `<div class="accord-nra-history-owner">${esc(owner)}</div>` : ''}
            ${detail ? `<div class="accord-nra-history-detail">${detail}</div>` : ''}
          </div>
        </div>
      `;
    }

    return { open, close };
  })();

  // ════════════════════════════════════════════════════════════
  // EXPORTS
  // ════════════════════════════════════════════════════════════
  window.AccordNRA = {
    Modal,
    Badge,
    HistoryPanel,
    OWNER_EVENT_TYPES,
    TRIGGER_KINDS,
  };

  console.log('[AccordNRA] CMD-ACCORD-NRA-SURFACE-1 Phase 2 loaded');
})();