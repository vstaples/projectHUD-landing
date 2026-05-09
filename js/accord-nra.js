// ============================================================
// accord-nra.js — NRA (Next Required Action) Surface components
// CMD-ACCORD-NRA-SURFACE-1 Phase 2 + Phase 3
//
// Phase 3 addition: 'declare-at-creation' modal mode for pre-commit
// atomic capture flow. New 4th argument `options.onSubmit` allows
// caller to handle the substrate write itself (instead of the modal
// invoking API.rpc internally). Used when node does not yet exist
// at modal-open time.
//
// Also exports window.AccordNRA.emit() so surface code can dispatch
// CustomEvents using the same path the modal uses internally.
//
// Exposes window.AccordNRA = {
//   Modal:        { open(node, mode, currentNRA?, options?) , close() }
//   Badge:        { render(node, currentNRA, history?) → htmlString,
//                   wireClickHandlers(container, lookup) }
//   HistoryPanel: { open(nodeId, history), close() }
//   emit:         (kind, detail) → dispatch accord:<kind> CustomEvent
// }
//
// IR71 vigilance: clone-replace-before-listener-bind in modal lifecycle.
// Pass NRA data and callbacks explicitly via arguments; no enclosing-
// scope state mutations carry through modal lifecycle.
// ============================================================

(function () {
  'use strict';

  const OWNER_EVENT_TYPES = [
    { value: 'next_phase_review',         label: 'Next phase review' },
    { value: 'next_status_sync',          label: 'Next status sync' },
    { value: 'next_meeting_in_workstream', label: 'Next meeting in this workstream' },
    { value: 'next_decision_review',      label: 'Next decision review' },
    { value: 'next_regulatory_milestone', label: 'Next regulatory milestone' },
  ];

  const TRIGGER_KINDS = [
    { value: '',                                  label: '— None —' },
    { value: 'meeting_scheduled_in_workstream',   label: 'Any meeting scheduled in this workstream' },
    { value: 'meeting_sealed_in_workstream',      label: 'Any meeting sealed in this workstream' },
  ];

  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
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

  function emit(kind, detail) {
    try {
      window.dispatchEvent(new CustomEvent('accord:' + kind, { detail }));
    } catch (e) {
      console.warn('[AccordNRA] CustomEvent dispatch failed', kind, e);
    }
  }

  // ════════════════════════════════════════════════════════════
  // MODAL
  // ════════════════════════════════════════════════════════════
  const Modal = (function () {
    const BACKDROP_ID = 'accord-nra-modal-backdrop';

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

    function _declareFieldsHtml(seed) {
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

    function _waiveFieldsHtml() {
      return `
        <label for="nra-waiver-reason">Waiver reason</label>
        <textarea id="nra-waiver-reason" rows="3"
          placeholder="e.g., Reference decision; superseded by DC-014; standing record."
        ></textarea>
      `;
    }

    function _deferFieldsHtml() {
      return `
        <p style="font-size:13px;color:var(--ink-body);margin-top:8px;">
          OK to defer? You'll be reminded periodically. Forward-motion intent is recorded as deferred — pick up later.
        </p>
      `;
    }

    function _formHtml(mode, node, currentNRA) {
      const isUpdate = mode === 'update';
      const seed = isUpdate ? (currentNRA || {}) : {};

      // Phase 3: pre-commit atomic mode — action selector + dynamic field pane
      if (mode === 'declare-at-creation') {
        const tag  = (node && node.tag)  ? node.tag  : 'item';
        const text = (node && node.text) ? node.text : '';
        const ctxPreview = text
          ? `<div class="nra-creation-context">
               <span class="nra-creation-tag">${esc(tag.toUpperCase())}</span>
               <span class="nra-creation-text">${esc(text.slice(0, 200))}${text.length > 200 ? '…' : ''}</span>
             </div>`
          : '';
        return `
          <h3>Address NRA for this ${esc(tag)}</h3>
          ${ctxPreview}
          <p>Before committing, decide how to address the next required action.</p>
          <label>Action</label>
          <div class="nra-radio-group">
            <label class="nra-radio">
              <input type="radio" name="nra-action" value="declare" checked>
              <span>Declare — there's a forward action</span>
            </label>
            <label class="nra-radio">
              <input type="radio" name="nra-action" value="waive">
              <span>Waive — guardrail; no forward action needed</span>
            </label>
            <label class="nra-radio">
              <input type="radio" name="nra-action" value="defer">
              <span>Defer — pick up later</span>
            </label>
          </div>
          <div id="nra-action-pane">
            ${_declareFieldsHtml({})}
          </div>
        `;
      }

      if (mode === 'waive') {
        return `
          <h3>Waive NRA</h3>
          <p>This artifact is a guardrail; no forward motion required. Provide a brief reason that captures why future review isn't needed.</p>
          ${_waiveFieldsHtml()}
        `;
      }

      if (mode === 'defer') {
        return `
          <h3>Defer NRA</h3>
          ${_deferFieldsHtml()}
        `;
      }

      const titleText = isUpdate ? 'Update NRA' : 'Declare NRA';
      const introText = isUpdate
        ? 'Update the next required action for this artifact. The current NRA is preserved as history.'
        : 'Declare the next required action that moves this artifact forward.';
      return `
        <h3>${esc(titleText)}</h3>
        <p>${esc(introText)}</p>
        ${_declareFieldsHtml(seed)}
      `;
    }

    function open(node, mode, currentNRA, options) {
      // mode: 'declare' | 'waive' | 'defer' | 'update' | 'declare-at-creation'
      // node: { node_id, firm_id, ... } OR pre-creation context
      //       { firm_id, tag, text } for declare-at-creation mode
      // currentNRA (update mode): existing accord_nras row
      // options: { onSubmit?: async ({action, payload}) => void }
      //          When provided AND mode === 'declare-at-creation', the
      //          modal calls onSubmit({action, payload}) on submit
      //          instead of invoking RPC. Caller handles substrate
      //          write themselves.
      options = options || {};

      if (!node) {
        console.error('[AccordNRA] Modal.open: missing node argument');
        return;
      }
      if (mode !== 'declare-at-creation' && !node.node_id) {
        console.error('[AccordNRA] Modal.open: node.node_id required for mode', mode);
        return;
      }

      const backdrop = _replaceBackdrop();
      if (!backdrop) return;

      const modal = backdrop.querySelector('.modal');
      const submitLabel =
        mode === 'declare-at-creation' ? 'Commit + address NRA' :
        mode === 'waive'   ? 'Waive' :
        mode === 'defer'   ? 'Defer' :
        mode === 'update'  ? 'Update NRA' :
                             'Declare NRA';

      modal.innerHTML = _formHtml(mode, node, currentNRA) + `
        <div class="modal-actions">
          <button class="btn btn-ghost"  id="nra-cancel">Cancel</button>
          <button class="btn btn-signal" id="nra-submit">${esc(submitLabel)}</button>
        </div>
      `;

      backdrop.classList.add('visible');

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

      // Owner-kind dynamic enable/disable for declare/update/declare-at-creation
      function _wireOwnerToggle(scope) {
        const eventSelect = scope.querySelector('#nra-owner-event-type');
        if (!eventSelect) return;
        scope.querySelectorAll('input[name="nra-owner-kind"]').forEach(r => {
          r.addEventListener('change', () => {
            const kind = scope.querySelector('input[name="nra-owner-kind"]:checked')?.value;
            eventSelect.disabled = (kind !== 'event');
            if (kind !== 'event') eventSelect.value = '';
          });
        });
      }
      if (mode === 'declare' || mode === 'update' || mode === 'declare-at-creation') {
        _wireOwnerToggle(modal);
      }

      // Phase 3: declare-at-creation action-toggle — swap pane on radio change
      if (mode === 'declare-at-creation') {
        const pane = modal.querySelector('#nra-action-pane');
        modal.querySelectorAll('input[name="nra-action"]').forEach(r => {
          r.addEventListener('change', () => {
            const action = modal.querySelector('input[name="nra-action"]:checked')?.value;
            if (action === 'waive')      pane.innerHTML = _waiveFieldsHtml();
            else if (action === 'defer') pane.innerHTML = _deferFieldsHtml();
            else                         pane.innerHTML = _declareFieldsHtml({});
            if (action === 'declare') _wireOwnerToggle(pane);
          });
        });
      }

      submitBtn.addEventListener('click', async () => {
        submitBtn.disabled = true;
        const origText = submitBtn.textContent;
        submitBtn.textContent = 'Working…';
        try {
          await _submit(mode, node, currentNRA, modal, options);
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
        const m = backdrop.querySelector('.modal');
        if (m) m.innerHTML = '';
      }
    }

    async function _submit(mode, node, currentNRA, modal, options) {
      // Phase 3: declare-at-creation mode — caller handles RPC
      if (mode === 'declare-at-creation') {
        if (typeof options.onSubmit !== 'function') {
          throw new Error('declare-at-creation mode requires options.onSubmit');
        }
        const action = modal.querySelector('input[name="nra-action"]:checked')?.value;
        let payload;
        if (action === 'declare') {
          payload = _readDeclareForm(modal);
          _validateDeclareForm(payload);
        } else if (action === 'waive') {
          const reason = modal.querySelector('#nra-waiver-reason')?.value.trim() || '';
          if (!reason) throw new Error('Waiver reason is required');
          payload = { reason };
        } else if (action === 'defer') {
          payload = {};
        } else {
          throw new Error('Action selection missing');
        }
        await options.onSubmit({ action, payload });
        return;
      }

      // Phase 2 modes — modal owns RPC
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

      const formData = _readDeclareForm(modal);
      _validateDeclareForm(formData);

      if (mode === 'update') {
        if (!currentNRA?.nra_id) throw new Error('Update mode requires currentNRA.nra_id');
        const result = await API.rpc('supersede_nra', {
          p_old_nra_id:   currentNRA.nra_id,
          p_new_nra_data: {
            nra_type:           formData.nra_type,
            due_date:           formData.due_date,
            description:        formData.description,
            owner_resource_id:  null,
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

    function _readDeclareForm(modal) {
      const nra_type    = modal.querySelector('input[name="nra-type"]:checked')?.value || null;
      const due_date    = modal.querySelector('#nra-due-date')?.value || null;
      const description = modal.querySelector('#nra-description')?.value.trim() || '';
      const ownerKind   = modal.querySelector('input[name="nra-owner-kind"]:checked')?.value;
      const owner_event_type = ownerKind === 'event'
        ? (modal.querySelector('#nra-owner-event-type')?.value || null)
        : null;
      const owner_is_operator = ownerKind === 'operator';
      const trigger_kind = modal.querySelector('#nra-trigger-kind')?.value || null;
      return {
        nra_type, due_date, description, owner_event_type, owner_is_operator,
        trigger_kind, trigger_target_id: null,
      };
    }

    function _validateDeclareForm(d) {
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
  // BADGE
  // ════════════════════════════════════════════════════════════
  const Badge = (function () {

    function render(node, currentNRA, historyCount) {
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
        case 'waived':   return _renderWaived(node, currentNRA);
        case 'deferred': return _renderDeferred(node, currentNRA);
        case 'resolved': return _renderHistoryOnly(node, historyCount || 1);
        default: return '';
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
  // HISTORY PANEL
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
    emit,
  };

  console.log('[AccordNRA] CMD-ACCORD-NRA-SURFACE-1 Phase 3 loaded');
})();