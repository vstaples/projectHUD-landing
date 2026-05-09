// ============================================================
// accord-nra.js — NRA (Next Required Action) Surface components
// CMD-ACCORD-NRA-SURFACE-1 Phase 2 + Phase 3 + Phase 4
//
// Phase 4 additions:
//   - Modal 'update' mode renders a candidate-confirmation region
//     ABOVE the supersede form when currentNRA.resolution_candidate_at
//     IS NOT NULL. Two buttons: "Confirm resolved" → resolve_nra RPC,
//     "Update instead" → collapses region, reveals supersede form.
//     No "Not yet" button per RLS gap (Phase 4 RLS halt §3 / Option B).
//   - AccordNRA.fetchBadgeData(nodeIds) — batched GET of current NRA
//     + history count for many nodes at once. N+1 avoided per
//     Phase 4 commission §2 D2 architect-lean.
//   - AccordNRA.wireBadgesIn(container, getNodeById) — surface helper
//     that paints badges next to data-node-id elements and wires
//     click handlers for edit/history/add affordances. Listens to
//     accord:nra-* CustomEvents and refreshes affected badge cells
//     in-place (event delegation; IR71-safe).
//
// Exposes window.AccordNRA = {
//   Modal:        { open(node, mode, currentNRA?, options?), close() }
//   Badge:        { render, wireClickHandlers }
//   HistoryPanel: { open(nodeId, history), close() }
//   fetchBadgeData(nodeIds)         → Map<nodeId, {current, historyCount}>
//   wireBadgesIn(container, getNode)→ install + return refresh()
//   emit:         (kind, detail) → dispatch accord:<kind>
// }
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
  // BATCHED FETCH — Phase 4
  // ════════════════════════════════════════════════════════════
  // Returns Map<nodeId, {current, historyCount}>. Two PostgREST GETs
  // total regardless of nodeIds.length: one against accord_nras_current,
  // one against accord_nras for history-count rollup. nodeIds expected
  // to be unique; caller dedupes if needed. Empty input returns empty Map.
  async function fetchBadgeData(nodeIds) {
    const out = new Map();
    const ids = Array.isArray(nodeIds) ? nodeIds.filter(Boolean) : [];
    if (!ids.length) return out;

    const idList = ids.join(',');

    // Initialize all entries with default empty state
    ids.forEach(id => out.set(id, { current: null, historyCount: 0 }));

    try {
      const [currents, all] = await Promise.all([
        API.get(`accord_nras_current?node_id=in.(${idList})&select=*`).catch(() => []),
        API.get(`accord_nras?node_id=in.(${idList})&select=node_id`).catch(() => []),
      ]);

      (currents || []).forEach(row => {
        const e = out.get(row.node_id);
        if (e) e.current = row;
      });

      (all || []).forEach(row => {
        const e = out.get(row.node_id);
        if (e) e.historyCount = (e.historyCount || 0) + 1;
      });
    } catch (e) {
      console.warn('[AccordNRA] fetchBadgeData failed', e);
    }
    return out;
  }

  // Single-node helper for click handler use (history view, edit lookup)
  async function fetchOneBadgeData(nodeId) {
    const m = await fetchBadgeData([nodeId]);
    return m.get(nodeId) || { current: null, historyCount: 0 };
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

    // Phase 4: candidate-confirmation region, rendered inside 'update'
    // mode when currentNRA.resolution_candidate_at IS NOT NULL.
    function _candidateRegionHtml(currentNRA) {
      const flaggedAt = currentNRA?.resolution_candidate_at
        ? fmtDate(currentNRA.resolution_candidate_at)
        : '';
      return `
        <div class="nra-candidate-region" id="nra-candidate-region">
          <div class="nra-candidate-banner">
            <span class="nra-candidate-glyph">✓?</span>
            <div class="nra-candidate-text">
              <div class="nra-candidate-title">System detected a resolution candidate</div>
              <div class="nra-candidate-body">
                A substrate event matching this NRA's trigger condition fired
                ${flaggedAt ? `on ${esc(flaggedAt)}` : ''}.
                Confirm whether the action is now resolved — or update the NRA to
                reflect the current state.
              </div>
            </div>
          </div>
          <div class="nra-candidate-actions">
            <button type="button" class="btn btn-signal"  id="nra-confirm-resolved">Confirm resolved</button>
            <button type="button" class="btn"             id="nra-update-instead">Update instead</button>
          </div>
        </div>
      `;
    }

    function _formHtml(mode, node, currentNRA) {
      const isUpdate = mode === 'update';
      const seed = isUpdate ? (currentNRA || {}) : {};

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
          <div id="nra-action-pane">${_declareFieldsHtml({})}</div>
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

      // declare or update
      const titleText = isUpdate ? 'Update NRA' : 'Declare NRA';
      const introText = isUpdate
        ? 'Update the next required action for this artifact. The current NRA is preserved as history.'
        : 'Declare the next required action that moves this artifact forward.';

      // Phase 4: candidate region rendered ABOVE the supersede form
      // when current NRA is flagged as a resolution candidate.
      const candidateRegion = (isUpdate && currentNRA?.resolution_candidate_at)
        ? _candidateRegionHtml(currentNRA)
        : '';
      const updateFormHidden = candidateRegion ? ' style="display:none"' : '';
      const updateFormId = candidateRegion ? 'nra-update-form' : '';

      return `
        <h3>${esc(titleText)}</h3>
        ${candidateRegion}
        <div${candidateRegion ? ` id="${updateFormId}"` : ''}${updateFormHidden}>
          <p>${esc(introText)}</p>
          ${_declareFieldsHtml(seed)}
        </div>
      `;
    }

    function open(node, mode, currentNRA, options) {
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

      const isCandidateUpdate = mode === 'update' && currentNRA?.resolution_candidate_at;

      modal.innerHTML = _formHtml(mode, node, currentNRA) + `
        <div class="modal-actions"${isCandidateUpdate ? ' id="nra-update-actions" style="display:none"' : ''}>
          <button class="btn btn-ghost"  id="nra-cancel">Cancel</button>
          <button class="btn btn-signal" id="nra-submit">${esc(submitLabel)}</button>
        </div>
      `;

      backdrop.classList.add('visible');

      const closeHandler = () => close();
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

      // Standard Cancel button (also wired when candidate region is present
      // — Cancel is in the same modal-actions block which is hidden until
      // "Update instead" is clicked. For candidate-mode Cancel-equivalent,
      // ESC + click-outside provide dismissal.)
      const cancelBtn = modal.querySelector('#nra-cancel');
      if (cancelBtn) cancelBtn.addEventListener('click', closeHandler);

      // Phase 4: candidate-region wiring
      const confirmBtn = modal.querySelector('#nra-confirm-resolved');
      const updateInsteadBtn = modal.querySelector('#nra-update-instead');
      if (confirmBtn && currentNRA) {
        confirmBtn.addEventListener('click', async () => {
          confirmBtn.disabled = true;
          updateInsteadBtn.disabled = true;
          const orig = confirmBtn.textContent;
          confirmBtn.textContent = 'Working…';
          try {
            const result = await API.rpc('resolve_nra', {
              p_nra_id:           currentNRA.nra_id,
              p_mechanism:        currentNRA.trigger_kind || 'manual',
              p_resolved_event_id: null,
            });
            const row = Array.isArray(result) ? result[0] : result;
            emit('nra-resolved', {
              node_id:            node.node_id,
              nra_id:             row?.nra_id || currentNRA.nra_id,
              firm_id:            node.firm_id || currentNRA.firm_id,
              resolved_mechanism: currentNRA.trigger_kind || 'manual',
            });
            close();
          } catch (e) {
            console.error('[AccordNRA] resolve_nra failed', e);
            alert('Could not confirm resolved: ' + (e?.message || e));
            confirmBtn.disabled = false;
            updateInsteadBtn.disabled = false;
            confirmBtn.textContent = orig;
          }
        });
      }
      if (updateInsteadBtn) {
        updateInsteadBtn.addEventListener('click', () => {
          const region = modal.querySelector('#nra-candidate-region');
          const form   = modal.querySelector('#nra-update-form');
          const acts   = modal.querySelector('#nra-update-actions');
          if (region) region.style.display = 'none';
          if (form) form.style.display = '';
          if (acts) acts.style.display = '';
          // Wire owner toggle now that the form is visible
          _wireOwnerToggle(modal);
        });
      }

      // Owner-kind dynamic enable/disable for declare/update/declare-at-creation
      function _wireOwnerToggle(scope) {
        const eventSelect = scope.querySelector('#nra-owner-event-type');
        if (!eventSelect) return;
        if (eventSelect._wired) return;
        eventSelect._wired = true;
        scope.querySelectorAll('input[name="nra-owner-kind"]').forEach(r => {
          r.addEventListener('change', () => {
            const kind = scope.querySelector('input[name="nra-owner-kind"]:checked')?.value;
            eventSelect.disabled = (kind !== 'event');
            if (kind !== 'event') eventSelect.value = '';
          });
        });
      }
      if (mode === 'declare' || (mode === 'update' && !isCandidateUpdate) || mode === 'declare-at-creation') {
        _wireOwnerToggle(modal);
      }

      if (mode === 'declare-at-creation') {
        const pane = modal.querySelector('#nra-action-pane');
        modal.querySelectorAll('input[name="nra-action"]').forEach(r => {
          r.addEventListener('change', () => {
            const action = modal.querySelector('input[name="nra-action"]:checked')?.value;
            if (action === 'waive')      pane.innerHTML = _waiveFieldsHtml();
            else if (action === 'defer') pane.innerHTML = _deferFieldsHtml();
            else                         pane.innerHTML = _declareFieldsHtml({});
            if (action === 'declare') {
              const select = pane.querySelector('#nra-owner-event-type');
              if (select) select._wired = false;
              _wireOwnerToggle(pane);
            }
          });
        });
      }

      const submitBtn = modal.querySelector('#nra-submit');
      if (submitBtn) {
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

      if (mode === 'waive') {
        const reason = modal.querySelector('#nra-waiver-reason').value.trim();
        if (!reason) throw new Error('Waiver reason is required');
        const result = await API.rpc('waive_nra', {
          p_node_id: node.node_id, p_reason: reason,
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
        ev.stopPropagation();
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
        declared:   '→', waived: '⊘', deferred: '⏸',
        resolved:   '✓', superseded: '⤴',
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
  // SURFACE HELPER — wireBadgesIn
  // ════════════════════════════════════════════════════════════
  // Paints badges next to all elements matching `[data-node-id]` inside
  // `container`. Each row's badge is appended into a child element with
  // class `accord-nra-badge-slot` (auto-created if absent). Wires click
  // handlers via Badge.wireClickHandlers (delegation; IR71-safe). Also
  // installs accord:nra-* listeners so badge cells refresh on substrate
  // mutations.
  //
  // Returns { refresh, refreshOne, dispose }.
  //   refresh()        — re-fetch + re-paint all badges in the container
  //   refreshOne(id)   — re-fetch + re-paint only the row matching node_id
  //   dispose()        — remove window listeners
  function wireBadgesIn(container, getNodeContext) {
    if (!container) return { refresh: () => {}, refreshOne: () => {}, dispose: () => {} };

    // Click handler delegation
    Badge.wireClickHandlers(container, async (nodeId /*, nraId */) => {
      const node = getNodeContext ? getNodeContext(nodeId) : { node_id: nodeId };
      const data = await fetchOneBadgeData(nodeId);
      return { node: node || { node_id: nodeId }, currentNRA: data.current, historyCount: data.historyCount };
    });

    async function _paintAll() {
      const rows = container.querySelectorAll('[data-node-id]');
      const ids = Array.from(new Set(
        Array.from(rows).map(r => r.dataset.nodeId).filter(Boolean)
      ));
      if (!ids.length) return;
      const data = await fetchBadgeData(ids);
      rows.forEach(row => {
        const id = row.dataset.nodeId;
        const slot = _ensureSlot(row);
        const ctx = data.get(id) || { current: null, historyCount: 0 };
        const nodeForBadge = (getNodeContext ? getNodeContext(id) : null) || { node_id: id };
        slot.innerHTML = Badge.render(nodeForBadge, ctx.current, ctx.historyCount);
      });
    }

    async function _paintOne(nodeId) {
      const rows = container.querySelectorAll(`[data-node-id="${cssEscape(nodeId)}"]`);
      if (!rows.length) return;
      const data = await fetchOneBadgeData(nodeId);
      rows.forEach(row => {
        const slot = _ensureSlot(row);
        const nodeForBadge = (getNodeContext ? getNodeContext(nodeId) : null) || { node_id: nodeId };
        slot.innerHTML = Badge.render(nodeForBadge, data.current, data.historyCount);
      });
    }

    function _ensureSlot(row) {
      let slot = row.querySelector(':scope > .accord-nra-badge-slot');
      if (!slot) {
        slot = document.createElement('span');
        slot.className = 'accord-nra-badge-slot';
        row.appendChild(slot);
      }
      return slot;
    }

    // CSS.escape polyfill-lite for attribute selector escaping
    function cssEscape(s) {
      if (window.CSS && CSS.escape) return CSS.escape(s);
      return String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
    }

    const eventKinds = [
      'accord:nra-declared',
      'accord:nra-waived',
      'accord:nra-deferred',
      'accord:nra-resolved',
      'accord:nra-superseded',
      'accord:nra-candidate-flagged',
    ];
    const handler = async (ev) => {
      const nodeId = ev?.detail?.node_id;
      if (!nodeId) return;
      try { await _paintOne(nodeId); }
      catch (e) { console.warn('[AccordNRA] paintOne failed', e); }
    };
    eventKinds.forEach(k => window.addEventListener(k, handler));

    function dispose() {
      eventKinds.forEach(k => window.removeEventListener(k, handler));
    }

    // Kick off initial paint
    _paintAll();

    return { refresh: _paintAll, refreshOne: _paintOne, dispose };
  }

  // ════════════════════════════════════════════════════════════
  // EXPORTS
  // ════════════════════════════════════════════════════════════
  window.AccordNRA = {
    Modal,
    Badge,
    HistoryPanel,
    OWNER_EVENT_TYPES,
    TRIGGER_KINDS,
    fetchBadgeData,
    fetchOneBadgeData,
    wireBadgesIn,
    emit,
  };

  console.log('[AccordNRA] CMD-ACCORD-NRA-SURFACE-1 Phase 4 loaded');
})();