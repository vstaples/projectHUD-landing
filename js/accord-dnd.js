// ============================================================
// ProjectHUD — accord-dnd.js
// CMD-ACCORD-CONSTELLATION-ENTRY-1 · Phase 4b
//
// Drag-and-drop orchestration: parking-lot meeting → workstream
// drop targets. Adopts Pipeline kanban pattern verbatim
// (pipeline.html lines 2664-2725).
//
// Drag sources:
//   .ac-parking-row[data-mtg-id]              (right rail)
//
// Drop targets (resolution order on drop):
//   .ac-node[data-ws-id]                      (constellation node)
//   .ac-tree-row[data-ws-id]                  (tree workstream/sub)
//   .ac-view-workstream[data-ws-id]           (workstream-view body)
//
// Disambiguation: when target workstream has sub-workstreams, a
// modal opens letting the operator file under the parent or one of
// its subs. When target has no subs, file proceeds immediately.
//
// Touch fallback: long-press on any element with a contextmenu
// handler triggers a synthetic contextmenu event. Pointer-based
// (works on mouse, touch, pen).
//
// Constellation keyboard navigation: arrow keys cycle the focused
// node; ENTER descends. Pairs with this module because keyboard
// navigation is the a11y partner to drag-drop (operator without
// pointer can still file via contextmenu Rename/Archive on tree;
// dedicated file affordance for keyboard pending Phase 5 if needed).
// ============================================================

(function () {
  'use strict';

  const API = window.API;
  const $   = id => document.getElementById(id);

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Module state ────────────────────────────────────────────
  const state = {
    dragMtgId:        null,
    dragWasDragging:  false,
    initialized:      false,
  };

  // ── Drag-source wiring (parking-lot rows) ───────────────────
  // Re-runs on every parking-lot render. accord-rails.js calls
  // wireParkingDragSources() — exposed below — after each render.
  function wireParkingDragSources() {
    document.querySelectorAll('.ac-parking-row[draggable="true"][data-mtg-id]').forEach(row => {
      if (row.dataset.acDndBound) return;
      row.dataset.acDndBound = '1';

      row.addEventListener('dragstart', (ev) => {
        state.dragMtgId = row.dataset.mtgId;
        state.dragWasDragging = true;
        row.classList.add('ac-parking-row-dragging');
        try { ev.dataTransfer.setData('text/plain', state.dragMtgId); } catch (e) {}
        ev.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('ac-parking-row-dragging');
        state.dragMtgId = null;
        // Clear hover state on any leftover targets
        document.querySelectorAll('.ac-dnd-droppable-active').forEach(el => {
          el.classList.remove('ac-dnd-droppable-active');
        });
        // Defer-clear so click-after-drag suppresses descent navigation
        setTimeout(() => { state.dragWasDragging = false; }, 50);
      });
      // Suppress descent click when a drag just finished
      row.addEventListener('click', (ev) => {
        if (state.dragWasDragging) {
          ev.stopPropagation();
          ev.preventDefault();
        }
      }, true);
    });
  }

  // ── Drop-target wiring (constellation, tree, workstream-view) ──
  // Document-level dragover/dragleave/drop with target-detection at
  // event time. This is more robust than per-element wiring because
  // accord-views and accord-rails re-render their DOM frequently;
  // doc-level listeners survive the re-renders.
  function _initDropListeners() {
    document.addEventListener('dragover', (ev) => {
      if (!state.dragMtgId) return;
      const target = _resolveDropTarget(ev.target);
      if (!target) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'move';
      // Visual hover state (only one at a time)
      document.querySelectorAll('.ac-dnd-droppable-active').forEach(el => {
        if (el !== target.element) el.classList.remove('ac-dnd-droppable-active');
      });
      target.element.classList.add('ac-dnd-droppable-active');
    });

    document.addEventListener('dragleave', (ev) => {
      if (!state.dragMtgId) return;
      const target = _resolveDropTarget(ev.target);
      if (target?.element) {
        // Only clear if leaving the element entirely (not entering a child)
        const related = ev.relatedTarget;
        if (!related || !target.element.contains(related)) {
          target.element.classList.remove('ac-dnd-droppable-active');
        }
      }
    });

    document.addEventListener('drop', async (ev) => {
      if (!state.dragMtgId) return;
      const target = _resolveDropTarget(ev.target);
      if (!target) return;
      ev.preventDefault();
      target.element.classList.remove('ac-dnd-droppable-active');

      const mtgId = state.dragMtgId || ev.dataTransfer.getData('text/plain');
      if (!mtgId || !target.workstreamId) return;

      await _handleDrop(mtgId, target.workstreamId);
    });
  }

  // Resolve a drop event's target element to { element, workstreamId }
  // by walking up through plausible drop-target classes. Returns null
  // if not a recognized drop target.
  function _resolveDropTarget(eventTarget) {
    if (!eventTarget?.closest) return null;
    // Constellation node
    const node = eventTarget.closest('.ac-node[data-ws-id]');
    if (node) return { element: node, workstreamId: node.dataset.wsId };
    // Tree workstream/sub row
    const treeRow = eventTarget.closest('.ac-tree-row[data-toggle][data-ws-id]');
    if (treeRow) return { element: treeRow, workstreamId: treeRow.dataset.wsId };
    // Workstream-view (body level — drop anywhere on the view fills the current ws)
    const wsView = eventTarget.closest('.ac-view-workstream[data-ws-id]');
    if (wsView) return { element: wsView, workstreamId: wsView.dataset.wsId };
    return null;
  }

  // ── Drop handler with disambiguation ────────────────────────
  async function _handleDrop(meetingId, workstreamId) {
    // Look up sub-workstreams for the target
    let subs = [];
    try {
      subs = await API.get(
        `workstreams?parent_workstream_id=eq.${workstreamId}&state=eq.active&select=workstream_id,name&order=name.asc`
      ) || [];
    } catch (e) {
      console.warn('[Accord-dnd] sub-lookup failed', e);
    }

    if (!subs.length) {
      // No subs — file directly
      await _fileMeeting(meetingId, workstreamId);
      return;
    }

    // Sub-bearing target — disambiguation modal
    _openDisambigModal(meetingId, workstreamId, subs);
  }

  function _openDisambigModal(meetingId, parentWorkstreamId, subs) {
    const modal      = $('acDndDisambigModal');
    const titleEl    = $('acDndModalTitle');
    const subtitleEl = $('acDndModalSubtitle');
    const choicesEl  = $('acDndModalChoices');
    const okBtn      = $('acDndConfirm');
    const cancelBtn  = $('acDndCancel');
    if (!modal || !choicesEl || !okBtn || !cancelBtn) {
      console.error('[Accord-dnd] disambig modal anchors missing — falling back to direct file');
      _fileMeeting(meetingId, parentWorkstreamId);
      return;
    }

    const parent = (window.AccordWorkstreams && _findWorkstreamName(parentWorkstreamId)) || 'this workstream';
    titleEl.textContent = `File this meeting under…`;
    subtitleEl.textContent = `${parent} has ${subs.length} sub-workstream${subs.length === 1 ? '' : 's'}. Pick a destination:`;

    // Choices: parent first, then subs
    let html = `
      <label class="ac-dnd-choice">
        <input type="radio" name="acDndChoice" value="${esc(parentWorkstreamId)}">
        <span class="ac-dnd-choice-label"><strong>${esc(parent)}</strong> <span class="ac-dnd-choice-meta">(parent)</span></span>
      </label>`;
    subs.forEach(s => {
      html += `
        <label class="ac-dnd-choice">
          <input type="radio" name="acDndChoice" value="${esc(s.workstream_id)}">
          <span class="ac-dnd-choice-label">${esc(s.name)}</span>
        </label>`;
    });
    choicesEl.innerHTML = html;
    okBtn.disabled = true;

    // Wire radios
    choicesEl.querySelectorAll('input[type="radio"]').forEach(r => {
      r.addEventListener('change', () => {
        okBtn.disabled = !choicesEl.querySelector('input[type="radio"]:checked');
      });
    });

    // Re-bind buttons idempotently
    const newOk = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOk, okBtn);
    const newCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

    const close = () => modal.classList.remove('visible');

    newOk.addEventListener('click', async () => {
      const checked = choicesEl.querySelector('input[type="radio"]:checked');
      if (!checked) return;
      newOk.disabled = true;
      newOk.textContent = 'Filing…';
      try {
        await _fileMeeting(meetingId, checked.value);
      } finally {
        newOk.textContent = 'File here';
        close();
      }
    });
    newCancel.addEventListener('click', close);

    modal.classList.add('visible');
  }

  function _findWorkstreamName(workstreamId) {
    // Best-effort cache lookup via AccordViews if it has data
    // (fall through if not — the modal subtitle just reads "this workstream")
    try {
      // accord-rails.js holds local.workstreams for the tree; we don't
      // have direct access, but we can re-fetch quickly via the cached
      // constellation render data. For modal subtitles, slight latency
      // is acceptable; we use a synchronous cache-only fallback here
      // and let the caller handle the no-data path with a generic label.
      return null;
    } catch (e) { return null; }
  }

  // ── Substrate write ─────────────────────────────────────────
  // Mirrors accord-workstreams.js's _confirmFileMeeting, but with a
  // direct PATCH path since this module is the drop handler. Emits
  // both CoC events and the rails-listened CustomEvent.
  async function _fileMeeting(meetingId, newWorkstreamId) {
    // Determine current workstream_id for the meeting
    let oldWorkstreamId = null;
    try {
      const rows = await API.get(`accord_meetings?meeting_id=eq.${meetingId}&select=workstream_id,sealed_at`);
      oldWorkstreamId = rows?.[0]?.workstream_id || null;
    } catch (e) { /* tolerate */ }

    if (oldWorkstreamId === newWorkstreamId) return;  // no-op

    try {
      await API.patch(`accord_meetings?meeting_id=eq.${meetingId}`, {
        workstream_id: newWorkstreamId,
      });
    } catch (e) {
      console.error('[Accord-dnd] file failed', e);
      alert('File failed: ' + (e?.message || e));
      return;
    }

    // CoC + reactive event
    let typeKey, eventName, notes;
    if (oldWorkstreamId === null) {
      typeKey = 'accord.meeting.placed';
      eventName = 'accord:meeting-filed';
      notes = 'Meeting filed via drag-drop';
    } else if (newWorkstreamId === null) {
      typeKey = 'accord.meeting.unplaced';
      eventName = 'accord:meeting-unfiled';
      notes = 'Meeting returned to parking lot';
    } else {
      typeKey = 'accord.meeting.refiled';
      eventName = 'accord:meeting-refiled';
      notes = 'Meeting refiled via drag-drop';
    }

    try {
      if (window.CoC?.write) {
        await window.CoC.write(typeKey, meetingId, {
          entityType: 'accord_meeting',
          notes,
          meta: {
            from_workstream_id: oldWorkstreamId,
            to_workstream_id:   newWorkstreamId,
            via: 'drag_drop',
          },
        });
      }
    } catch (e) { console.warn('[Accord-dnd] CoC.write best-effort failure', e); }

    try {
      window.dispatchEvent(new CustomEvent(eventName, {
        detail: {
          meeting_id: meetingId,
          from_workstream_id: oldWorkstreamId,
          to_workstream_id:   newWorkstreamId,
        },
      }));
    } catch (e) {}
  }

  // ── Touch long-press → contextmenu fallback ─────────────────
  // For tree rows + constellation nodes. Operator-friendly on tablet.
  function _initTouchLongPress() {
    const LONG_PRESS_MS = 550;
    let pressTimer = null;
    let pressTarget = null;
    let pressX = 0, pressY = 0;
    const MOVE_THRESHOLD_PX = 8;

    document.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType === 'mouse') return;        // mouse uses native contextmenu
      const target = ev.target.closest('.ac-tree-row[data-ws-id], .ac-node[data-ws-id]');
      if (!target) return;
      pressTarget = target;
      pressX = ev.clientX;
      pressY = ev.clientY;
      pressTimer = setTimeout(() => {
        if (pressTarget) {
          // Synthesize contextmenu event
          const cm = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: pressX,
            clientY: pressY,
          });
          pressTarget.dispatchEvent(cm);
        }
        pressTimer = null;
        pressTarget = null;
      }, LONG_PRESS_MS);
    });

    const cancel = () => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      pressTarget = null;
    };
    document.addEventListener('pointerup', cancel);
    document.addEventListener('pointercancel', cancel);
    document.addEventListener('pointermove', (ev) => {
      if (!pressTimer) return;
      if (Math.abs(ev.clientX - pressX) > MOVE_THRESHOLD_PX ||
          Math.abs(ev.clientY - pressY) > MOVE_THRESHOLD_PX) {
        cancel();
      }
    });
  }

  // ── Constellation keyboard navigation ───────────────────────
  // Arrow keys cycle through visible constellation nodes (ordered by
  // ring then angle); ENTER descends. Activated only when level is
  // 'constellation' and focus is inside the constellation host.
  function _initConstellationKeyboard() {
    const host = $('ac-constellation-host');
    if (!host) return;

    host.setAttribute('tabindex', '0');

    host.addEventListener('keydown', (ev) => {
      if (window.Accord?.state?.level !== 'constellation') return;
      if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter', 'Home', 'End'].includes(ev.key)) return;

      const nodes = Array.from(host.querySelectorAll('.ac-node[data-ws-id]'));
      if (!nodes.length) return;

      const focused = document.activeElement?.closest('.ac-node[data-ws-id]');
      let idx = focused ? nodes.indexOf(focused) : -1;

      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') {
        idx = (idx + 1) % nodes.length;
        ev.preventDefault();
      } else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') {
        idx = idx <= 0 ? nodes.length - 1 : idx - 1;
        ev.preventDefault();
      } else if (ev.key === 'Home') {
        idx = 0;
        ev.preventDefault();
      } else if (ev.key === 'End') {
        idx = nodes.length - 1;
        ev.preventDefault();
      } else if (ev.key === 'Enter') {
        if (focused) {
          // Synthesize click to leverage existing descent path
          focused.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          ev.preventDefault();
        }
        return;
      }

      const next = nodes[idx];
      if (next) {
        next.setAttribute('tabindex', '0');
        next.focus();
      }
    });
  }

  // ── Init ────────────────────────────────────────────────────
  function _init() {
    if (state.initialized) return;
    state.initialized = true;
    _initDropListeners();
    _initTouchLongPress();
    _initConstellationKeyboard();

    // Re-wire drag sources after every parking-lot render. The rails
    // module dispatches a pseudo-event we can latch onto, but for now
    // we use a MutationObserver on the parking-lot body — robust to any
    // re-render path.
    const parkingBody = $('ac-parking-body');
    if (parkingBody) {
      const obs = new MutationObserver(() => wireParkingDragSources());
      obs.observe(parkingBody, { childList: true, subtree: false });
      // Initial wire
      wireParkingDragSources();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  // ── Expose ──────────────────────────────────────────────────
  window.AccordDnD = {
    wireParkingDragSources,
    isDragging: () => !!state.dragMtgId,
  };
})();