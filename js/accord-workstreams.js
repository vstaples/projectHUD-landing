/* ============================================================
 * accord-workstreams.js
 * CMD-ACCORD-WORKSTREAMS-SUBSTRATE-1 · Phase 4
 *
 * Workstream management surface + Filed-under affordances
 * for both running-meeting header (Q-INV-1 Option C) and
 * post-seal closed-banner.
 *
 * Module organization rationale: introduced as a new file
 * (mirrors per-surface convention: accord-capture, -document,
 * -ledger, -digest, -minutes). Workstreams is its own surface
 * (the management page) plus cross-surface Filed-under
 * affordances; bundling into accord-core would bloat the
 * cross-surface hub.
 *
 * F-pattern integrations:
 *   F-P3-2: SECURITY INVOKER triggers (Migration 9) read
 *           workstreams under caller RLS scope; this module
 *           never bypasses RLS.
 *   F-P3-6: navigational-classification IR42 pattern. Workstream
 *           reassignment on sealed meetings is permitted by
 *           absence of trigger blocks (Migration 10). UI here
 *           presents the affordance in both running and closed
 *           banner contexts.
 *   F-P3-9 / F-P4-1: CoC.write() uses prefixed event keys
 *           ('accord.workstream.created', etc.); writer
 *           normalizes the 'accord.' prefix for storage.
 *   IR58 amended: actor_resource_id resolved by defensive
 *           layer; no per-call resolution required.
 * ============================================================ */

(function() {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // ── Local state ─────────────────────────────────────────────
  const local = {
    workstreams:    [],   // all (active + archived) for this firm
    showArchived:   false,
    meetingCounts:  {},   // { workstream_id: count }
    // Modal mode-state
    createMode:     'create',  // 'create' | 'rename'
    renameTargetId: null,
    fileTargetMeetingId: null,
  };

  // ── Resource resolver (mirrors accord-ledger / accord-digest pattern) ──
  let _myResourceId = null;
  async function _resolveMyResourceId() {
    if (_myResourceId) return _myResourceId;
    if (window._myResource?.id) {
      _myResourceId = window._myResource.id;
      return _myResourceId;
    }
    const me = window.Accord?.state?.me;
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
        console.warn('[Accord-workstreams] resource_id resolution failed', e2);
      }
    }
    return _myResourceId;
  }

  // ── Data loaders ────────────────────────────────────────────
  async function _loadWorkstreams() {
    try {
      const rows = await API.get('workstreams?select=*&order=parent_workstream_id.asc.nullsfirst,name.asc');
      local.workstreams = Array.isArray(rows) ? rows : [];
    } catch (e) {
      console.error('[Accord-workstreams] load failed', e);
      local.workstreams = [];
    }
  }

  async function _loadMeetingCounts() {
    // Counts of meetings filed under each workstream (firm-scoped via RLS)
    local.meetingCounts = {};
    try {
      const rows = await API.get('accord_meetings?workstream_id=not.is.null&select=workstream_id');
      (rows || []).forEach(r => {
        if (!local.meetingCounts[r.workstream_id]) local.meetingCounts[r.workstream_id] = 0;
        local.meetingCounts[r.workstream_id] += 1;
      });
    } catch (e) {
      console.warn('[Accord-workstreams] meeting count load failed', e);
    }
  }

  // ── Management surface render ───────────────────────────────
  function _renderSurface() {
    const tbody = $('ws-tbody');
    const empty = $('ws-empty');
    const table = $('ws-table');
    if (!tbody || !empty || !table) return;

    const visible = local.workstreams.filter(w =>
      local.showArchived ? true : w.state === 'active'
    );

    if (visible.length === 0) {
      table.style.display = 'none';
      empty.style.display = 'block';
      return;
    }
    table.style.display = '';
    empty.style.display = 'none';

    // Two-pass render: top-level first, then their sub-workstreams
    const topLevels = visible.filter(w => !w.parent_workstream_id);
    const subsByParent = {};
    visible.filter(w => w.parent_workstream_id).forEach(w => {
      if (!subsByParent[w.parent_workstream_id]) subsByParent[w.parent_workstream_id] = [];
      subsByParent[w.parent_workstream_id].push(w);
    });

    const rows = [];
    topLevels.forEach(top => {
      rows.push(_renderRow(top, false));
      (subsByParent[top.workstream_id] || []).forEach(sub => {
        rows.push(_renderRow(sub, true));
      });
    });

    tbody.innerHTML = rows.join('');
    _wireRowActions();
  }

  function _renderRow(w, isSub) {
    const archived = w.state === 'archived';
    const cls = archived ? 'ws-row-archived' : '';
    const nameCls = isSub ? 'ws-name ws-sub-name' : 'ws-name';
    const level = isSub ? 'sub-workstream' : 'top-level';
    const parentName = isSub
      ? esc((local.workstreams.find(x => x.workstream_id === w.parent_workstream_id) || {}).name || '—')
      : '—';
    const created = w.created_at
      ? new Date(w.created_at).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
      : '—';
    const filedCount = local.meetingCounts[w.workstream_id] || 0;

    let actions = '';
    if (archived) {
      actions = `<a href="#" class="ws-row-action" data-ws-action="restore" data-ws-id="${esc(w.workstream_id)}">restore</a>`;
    } else {
      actions = `
        <a href="#" class="ws-row-action" data-ws-action="rename"  data-ws-id="${esc(w.workstream_id)}">rename</a>
        <a href="#" class="ws-row-action ws-action-archive" data-ws-action="archive" data-ws-id="${esc(w.workstream_id)}">archive</a>`;
    }

    return `
      <tr class="${cls}" data-ws-id="${esc(w.workstream_id)}">
        <td class="${nameCls}">${esc(w.name)}${archived ? ' <span style="color:var(--ink-faint);font-size:11px;font-style:italic">(archived)</span>' : ''}</td>
        <td><span class="ws-level-pill">${esc(level)}</span></td>
        <td>${parentName}</td>
        <td>${esc(created)}</td>
        <td class="ws-meetings-col">${filedCount}</td>
        <td class="ws-actions-col">${actions}</td>
      </tr>`;
  }

  function _wireRowActions() {
    document.querySelectorAll('#ws-tbody [data-ws-action]').forEach(a => {
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        const action = a.dataset.wsAction;
        const id = a.dataset.wsId;
        if (action === 'rename')   _openCreateModal('rename', id);
        if (action === 'archive')  _openArchiveConfirm(id);
        if (action === 'restore')  _restoreWorkstream(id);
      });
    });
  }

  // ── Create / rename modal ───────────────────────────────────
  // Signature: _openCreateModal(mode, renameTargetId?, parentPresetId?)
  //   mode:            'create' | 'rename'
  //   renameTargetId:  workstream id to rename (rename mode only)
  //   parentPresetId:  workstream id to pre-select as parent (create
  //                    mode only). Used by workstream-view's
  //                    "+ New sub-workstream" affordance to bypass
  //                    operator-error of leaving the parent unset.
  function _openCreateModal(mode, renameTargetId, parentPresetId) {
    const modal = $('wsCreateModal');
    if (!modal) return;
    local.createMode = mode || 'create';
    local.renameTargetId = renameTargetId || null;

    const title = $('wsCreateModalTitle');
    const nameInput = $('wsCreateName');
    const descInput = $('wsCreateDescription');
    const parentSelect = $('wsCreateParent');
    const confirmBtn = $('wsCreateConfirm');

    // Populate parent options (top-level active workstreams only)
    const tops = local.workstreams.filter(w => !w.parent_workstream_id && w.state === 'active');
    parentSelect.innerHTML = '<option value="">— top-level (no parent) —</option>' +
      tops.map(w => `<option value="${esc(w.workstream_id)}">${esc(w.name)}</option>`).join('');

    if (mode === 'rename') {
      const w = local.workstreams.find(x => x.workstream_id === renameTargetId);
      title.textContent = `Rename: ${w ? w.name : '—'}`;
      nameInput.value = w ? w.name : '';
      descInput.value = w ? (w.description || '') : '';
      // Disable parent change in rename (re-parenting is structural, not in MIN scope)
      parentSelect.value = w ? (w.parent_workstream_id || '') : '';
      parentSelect.disabled = true;
      confirmBtn.textContent = 'Rename';
    } else {
      // Create mode. If a parent is pre-selected, signal the sub-creation
      // intent in the title and pre-fill the dropdown. Phase 4a operator
      // bug: bare "+ New workstream" copy was indistinguishable between
      // top-level vs sub creation contexts.
      const presetParent = parentPresetId
        ? tops.find(w => w.workstream_id === parentPresetId)
        : null;
      if (presetParent) {
        title.textContent = `New sub-workstream under ${presetParent.name}`;
      } else {
        title.textContent = 'New workstream';
      }
      nameInput.value = '';
      descInput.value = '';
      parentSelect.value = parentPresetId || '';
      parentSelect.disabled = false;   // operator may still override the preset
      confirmBtn.textContent = 'Create';
    }
    modal.classList.add('visible');
    setTimeout(() => nameInput.focus(), 30);
  }

  function _closeCreateModal() {
    const modal = $('wsCreateModal');
    if (modal) modal.classList.remove('visible');
    local.createMode = 'create';
    local.renameTargetId = null;
  }

  async function _submitCreateOrRename() {
    const name = ($('wsCreateName').value || '').trim();
    const description = ($('wsCreateDescription').value || '').trim();
    const parentId = ($('wsCreateParent').value || '').trim() || null;

    if (!name) { alert('Name is required.'); return; }

    const me = window.Accord?.state?.me;
    if (!me?.firm_id || !me.id) {
      alert('Identity not resolved; cannot create workstream.');
      return;
    }
    const myResourceId = await _resolveMyResourceId();
    if (!myResourceId) {
      alert('Could not resolve your resource identity (required for workstream attribution).');
      return;
    }

    if (local.createMode === 'rename' && local.renameTargetId) {
      // Rename path
      const oldName = (local.workstreams.find(x => x.workstream_id === local.renameTargetId) || {}).name || '';
      try {
        await API.patch(`workstreams?workstream_id=eq.${local.renameTargetId}`, {
          name,
          description: description || null,
        });
        try {
          if (window.CoC?.write) {
            await window.CoC.write('accord.workstream.renamed', local.renameTargetId, {
              entityType: 'workstream',
              notes: `Renamed: "${oldName}" → "${name}"`,
              meta: { from_name: oldName, to_name: name },
            });
          }
        } catch (e) { console.warn('[Accord-workstreams] CoC.write best-effort failure', e); }

        // CMD-ACCORD-CONSTELLATION-ENTRY-1 Phase 4a — reactive refresh hook
        try {
          window.dispatchEvent(new CustomEvent('accord:workstream-renamed', {
            detail: { workstream_id: local.renameTargetId, from_name: oldName, to_name: name },
          }));
        } catch (e) {}
      } catch (e) {
        console.error('[Accord-workstreams] rename failed', e);
        alert('Rename failed: ' + (e?.message || e));
        return;
      }
    } else {
      // Create path
      const row = {
        firm_id:              me.firm_id,
        parent_workstream_id: parentId,
        name,
        description:          description || null,
        created_by:           myResourceId,
      };
      let created;
      try {
        const out = await API.post('workstreams', row);
        created = Array.isArray(out) ? out[0] : out;
      } catch (e) {
        console.error('[Accord-workstreams] create failed', e);
        alert('Create failed: ' + (e?.message || e));
        return;
      }
      try {
        if (window.CoC?.write && created?.workstream_id) {
          await window.CoC.write('accord.workstream.created', created.workstream_id, {
            entityType: 'workstream',
            notes: `Created workstream: "${name}"${parentId ? ' (sub)' : ' (top-level)'}`,
            meta: {
              name,
              parent_workstream_id: parentId,
              level: parentId ? 'sub-workstream' : 'top-level',
            },
          });
        }
      } catch (e) { console.warn('[Accord-workstreams] CoC.write best-effort failure', e); }

      // CMD-ACCORD-CONSTELLATION-ENTRY-1 Phase 4a — Phase 3 carry-forward.
      // Reactive refresh hook for accord-rails / accord-constellation.
      try {
        window.dispatchEvent(new CustomEvent('accord:workstream-created', {
          detail: {
            workstream_id: created?.workstream_id,
            parent_workstream_id: parentId,
            name,
          },
        }));
      } catch (e) {}
    }

    _closeCreateModal();
    await _refresh();
  }

  // ── Archive / restore ───────────────────────────────────────
  //
  // CMD-ACCORD-CONSTELLATION-ENTRY-1 Phase 4b — Q4 source-of-truth.
  // The archive flow split into two functions:
  //   _openArchiveConfirm(id)  — UI flow: gathers cascade data,
  //                              renders mid-detail modal, awaits
  //                              operator confirm/cancel, calls
  //                              _executeArchive on confirm.
  //   _executeArchive(id)       — pure execute: PATCH + CoC writes
  //                              + CustomEvent dispatch.
  //
  // The former bare-confirm() `_archiveWorkstream` is GONE — not
  // wrapped, not aliased. Public API exposes openArchiveConfirm
  // (see exports block at file end).

  // Phase 4b helper: build cascade summary for the confirmation modal.
  // Returns { subs: [{name, meetingCount}], directMeetings: [{title}],
  //           directMeetingTotal, allMeetingTotal }.
  async function _gatherArchiveImpact(workstreamId) {
    const result = {
      subs: [],
      directMeetings: [],
      directMeetingTotal: 0,
      allMeetingTotal: 0,
    };
    try {
      // Direct meetings (with title for ≤10 enumeration path)
      const directMtgs = await API.get(
        `accord_meetings?workstream_id=eq.${workstreamId}&select=meeting_id,title`
      );
      result.directMeetings = (directMtgs || []).map(m => ({
        meeting_id: m.meeting_id,
        title: m.title || '(untitled)',
      }));
      result.directMeetingTotal = result.directMeetings.length;

      // Sub-workstreams + per-sub meeting count
      const subs = await API.get(
        `workstreams?parent_workstream_id=eq.${workstreamId}&state=eq.active&select=workstream_id,name`
      );
      for (const sub of (subs || [])) {
        const mtgs = await API.get(
          `accord_meetings?workstream_id=eq.${sub.workstream_id}&select=meeting_id`
        );
        result.subs.push({
          workstream_id: sub.workstream_id,
          name: sub.name,
          meetingCount: (mtgs || []).length,
        });
      }
      result.allMeetingTotal = result.directMeetingTotal +
        result.subs.reduce((acc, s) => acc + s.meetingCount, 0);
    } catch (e) {
      console.warn('[Accord-workstreams] _gatherArchiveImpact partial failure', e);
    }
    return result;
  }

  // Phase 4b: open the archive confirmation modal. Single entry-point
  // for archive flow across all four affordance surfaces (constellation
  // right-click, tree right-click, workstream-view header, sub-list
  // hover-buttons).
  async function _openArchiveConfirm(workstreamId) {
    const w = local.workstreams.find(x => x.workstream_id === workstreamId);
    if (!w) return;

    const modal   = $('acArchiveConfirmModal');
    const titleEl = $('acArchiveModalTitle');
    const sumEl   = $('acArchiveModalSummary');
    const okBtn   = $('acArchiveConfirm');
    const cancelBtn = $('acArchiveCancel');
    if (!modal || !titleEl || !sumEl || !okBtn || !cancelBtn) {
      console.error('[Accord-workstreams] archive-confirm modal anchors missing');
      return;
    }

    // Wire OK / Cancel idempotently — clone-replace drops prior listeners.
    // Pattern note (Phase 4b operator-found defect, dnd disambig modal):
    // when both setting disabled state AND wiring listeners on the same
    // button, clone FIRST and operate on the new node throughout. Setting
    // state on the OLD node before cloning is a footgun if any listener
    // (radio change, etc.) closes over the OLD reference — those mutations
    // target a detached element after replaceChild.
    const newOk = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOk, okBtn);
    const newCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

    // Show modal in loading state, gather impact, then enable confirm
    titleEl.textContent = `Archive "${w.name}"?`;
    sumEl.innerHTML = '<p class="ac-archive-loading">Calculating impact…</p>';
    newOk.disabled = true;
    modal.classList.add('visible');

    const impact = await _gatherArchiveImpact(workstreamId);
    sumEl.innerHTML = _renderArchiveSummary(w, impact);
    newOk.disabled = false;

    const close = () => modal.classList.remove('visible');

    newOk.addEventListener('click', async () => {
      newOk.disabled = true;
      newOk.textContent = 'Archiving…';
      try {
        await _executeArchive(workstreamId);
      } finally {
        newOk.textContent = 'Archive';
        close();
      }
    });
    newCancel.addEventListener('click', close);
  }

  // Render the mid-detail summary per Q2 disposition:
  //   sub-workstreams: enumerate names always
  //   meetings: enumerate titles when total ≤ 10; count-only when > 10
  function _renderArchiveSummary(w, impact) {
    const parts = [];

    // Subs section
    if (impact.subs.length > 0) {
      parts.push(`<div class="ac-archive-section">
        <div class="ac-archive-section-label">Cascading sub-workstreams (${impact.subs.length})</div>
        <ul class="ac-archive-list">
          ${impact.subs.map(s => `
            <li><span class="ac-archive-list-name">${esc(s.name)}</span>` +
            (s.meetingCount > 0
              ? ` <span class="ac-archive-list-meta">(${s.meetingCount} meeting${s.meetingCount === 1 ? '' : 's'})</span>`
              : '') +
            `</li>`).join('')}
        </ul>
      </div>`);
    }

    // Meetings section
    if (impact.allMeetingTotal > 0) {
      const heading = `<div class="ac-archive-section-label">Meetings returning to parking lot (${impact.allMeetingTotal})</div>`;
      if (impact.allMeetingTotal <= 10) {
        // Enumerated path: show direct + sub meetings (we have direct titles;
        // sub meetings are count-only because we only fetched meeting_ids for them)
        const directList = impact.directMeetings.length > 0
          ? `<ul class="ac-archive-list">${impact.directMeetings.map(m => `<li><span class="ac-archive-list-name">${esc(m.title)}</span></li>`).join('')}</ul>`
          : '';
        // For meetings under cascading subs, we have counts only — name them by sub
        const subContrib = impact.subs.filter(s => s.meetingCount > 0).map(s =>
          `<li><span class="ac-archive-list-meta">${s.meetingCount} under "${esc(s.name)}"</span></li>`
        ).join('');
        const subList = subContrib ? `<ul class="ac-archive-list ac-archive-list-tight">${subContrib}</ul>` : '';
        parts.push(`<div class="ac-archive-section">${heading}${directList}${subList}</div>`);
      } else {
        // Count-only path
        parts.push(`<div class="ac-archive-section">${heading}
          <p class="ac-archive-count-only">${impact.allMeetingTotal} meetings will return to the parking lot. (Count exceeds enumeration threshold.)</p>
        </div>`);
      }
    }

    if (!parts.length) {
      parts.push(`<p class="ac-archive-empty">No sub-workstreams or filed meetings will be affected.</p>`);
    }

    parts.push(`<p class="ac-archive-footnote">Archived workstreams can be restored from the legacy management surface.</p>`);

    return parts.join('');
  }

  // Pure execute — no UI. Caller (openArchiveConfirm or any future
  // programmatic path) is responsible for confirming intent first.
  async function _executeArchive(workstreamId) {
    const w = local.workstreams.find(x => x.workstream_id === workstreamId);
    if (!w) return;

    const myResourceId = await _resolveMyResourceId();
    if (!myResourceId) {
      alert('Could not resolve your resource identity.');
      return;
    }

    // Identify meetings that will be unplaced by the cascade trigger.
    // Per brief §4.3 architect note: CoC events for unplacement emit
    // from the writer-side (here), not from the trigger. We capture the
    // affected meeting IDs BEFORE the archive so we can emit one
    // accord.meeting.unplaced event per meeting after the cascade fires.
    let affectedMeetings = [];
    let affectedSubs = [];
    try {
      const directMtgs = await API.get(`accord_meetings?workstream_id=eq.${workstreamId}&select=meeting_id`);
      affectedMeetings = (directMtgs || []).map(m => ({ meeting_id: m.meeting_id, from: workstreamId }));
      const subs = await API.get(`workstreams?parent_workstream_id=eq.${workstreamId}&state=eq.active&select=workstream_id,name`);
      affectedSubs = subs || [];
      for (const sub of affectedSubs) {
        const subMtgs = await API.get(`accord_meetings?workstream_id=eq.${sub.workstream_id}&select=meeting_id`);
        (subMtgs || []).forEach(m => affectedMeetings.push({ meeting_id: m.meeting_id, from: sub.workstream_id }));
      }
    } catch (e) {
      console.warn('[Accord-workstreams] could not enumerate affected meetings', e);
    }

    const archivedAt = new Date().toISOString();
    try {
      await API.patch(`workstreams?workstream_id=eq.${workstreamId}`, {
        state:       'archived',
        archived_at: archivedAt,
        archived_by: myResourceId,
      });
    } catch (e) {
      console.error('[Accord-workstreams] archive failed', e);
      alert('Archive failed: ' + (e?.message || e));
      return;
    }

    // Emit CoC events
    try {
      if (window.CoC?.write) {
        await window.CoC.write('accord.workstream.archived', workstreamId, {
          entityType: 'workstream',
          notes: `Archived workstream: "${w.name}"`,
          meta: { name: w.name, cascaded_subs: affectedSubs.length, affected_meetings: affectedMeetings.length },
        });
        for (const sub of affectedSubs) {
          await window.CoC.write('accord.workstream.archived', sub.workstream_id, {
            entityType: 'workstream',
            notes: `Cascade-archived sub-workstream: "${sub.name}"`,
            meta: { name: sub.name, cascaded_from: workstreamId },
          });
        }
        for (const am of affectedMeetings) {
          await window.CoC.write('accord.meeting.unplaced', am.meeting_id, {
            entityType: 'accord_meeting',
            notes: `Returned to parking lot via workstream archive cascade`,
            meta: { from_workstream_id: am.from, reason: 'archive_cascade' },
          });
        }
      }
    } catch (e) {
      console.warn('[Accord-workstreams] CoC.write best-effort failure', e);
    }

    // Reactive refresh hook
    try {
      window.dispatchEvent(new CustomEvent('accord:workstream-archived', {
        detail: { workstream_id: workstreamId },
      }));
    } catch (e) {}

    await _refresh();
  }

  async function _restoreWorkstream(workstreamId) {
    const w = local.workstreams.find(x => x.workstream_id === workstreamId);
    if (!w) return;
    if (!confirm(`Restore "${w.name}" to active state?\n\nNote: this does NOT restore cascade-archived sub-workstreams or refile meetings (those moved to the parking lot).`)) return;

    try {
      // Q-INV-3 Option A: state-aware UPDATE RLS policy permits this transition.
      // Must also clear archived_at and archived_by per the table-level
      // workstreams_archived_consistency check constraint.
      await API.patch(`workstreams?workstream_id=eq.${workstreamId}`, {
        state:       'active',
        archived_at: null,
        archived_by: null,
      });
    } catch (e) {
      console.error('[Accord-workstreams] restore failed', e);
      alert('Restore failed: ' + (e?.message || e));
      return;
    }

    try {
      if (window.CoC?.write) {
        await window.CoC.write('accord.workstream.restored', workstreamId, {
          entityType: 'workstream',
          notes: `Restored workstream: "${w.name}"`,
          meta: { name: w.name },
        });
      }
    } catch (e) { console.warn('[Accord-workstreams] CoC.write best-effort failure', e); }

    // CMD-ACCORD-CONSTELLATION-ENTRY-1 Phase 4a — reactive refresh hook
    try {
      window.dispatchEvent(new CustomEvent('accord:workstream-restored', {
        detail: { workstream_id: workstreamId, name: w.name },
      }));
    } catch (e) {}

    await _refresh();
  }

  // ── File-meeting modal ──────────────────────────────────────
  function _openFileModal(meetingId) {
    const modal = $('wsFileModal');
    if (!modal) return;
    const m = window.Accord?.state?.meeting;
    if (!m || m.meeting_id !== meetingId) {
      // Allow filing any meeting whose ID is supplied; load minimal context
    }
    local.fileTargetMeetingId = meetingId;

    const target = $('wsFileModalTarget');
    if (target) {
      target.textContent = m
        ? `${(m.title || 'Untitled meeting').slice(0, 80)}${m.sealed_at ? ' · sealed' : ' · running'}`
        : `Meeting ${meetingId.slice(0, 8)}…`;
    }

    // Populate selector: top-level workstreams + sub-workstreams (visually nested)
    const select = $('wsFileSelect');
    const tops = local.workstreams.filter(w => !w.parent_workstream_id && w.state === 'active');
    const subsByParent = {};
    local.workstreams.filter(w => w.parent_workstream_id && w.state === 'active').forEach(w => {
      if (!subsByParent[w.parent_workstream_id]) subsByParent[w.parent_workstream_id] = [];
      subsByParent[w.parent_workstream_id].push(w);
    });
    let opts = '<option value="">— Unfiled (parking lot) —</option>';
    tops.forEach(top => {
      opts += `<option value="${esc(top.workstream_id)}">${esc(top.name)}</option>`;
      (subsByParent[top.workstream_id] || []).forEach(sub => {
        opts += `<option value="${esc(sub.workstream_id)}">↳ ${esc(top.name)} / ${esc(sub.name)}</option>`;
      });
    });
    select.innerHTML = opts;

    // Preselect current value if known
    if (m && m.workstream_id) select.value = m.workstream_id;
    else select.value = '';

    modal.classList.add('visible');
    setTimeout(() => select.focus(), 30);
  }

  function _closeFileModal() {
    const modal = $('wsFileModal');
    if (modal) modal.classList.remove('visible');
    local.fileTargetMeetingId = null;
  }

  async function _submitFile() {
    const meetingId = local.fileTargetMeetingId;
    if (!meetingId) { _closeFileModal(); return; }
    const newWorkstreamId = ($('wsFileSelect').value || '').trim() || null;

    // Find current value (prefer state.meeting if it matches; else fetch)
    let oldWorkstreamId = null;
    const m = window.Accord?.state?.meeting;
    if (m && m.meeting_id === meetingId) {
      oldWorkstreamId = m.workstream_id || null;
    } else {
      try {
        const rows = await API.get(`accord_meetings?meeting_id=eq.${meetingId}&select=workstream_id`);
        oldWorkstreamId = rows?.[0]?.workstream_id || null;
      } catch (e) { /* tolerate */ }
    }

    if (oldWorkstreamId === newWorkstreamId) {
      _closeFileModal();
      return;
    }

    try {
      await API.patch(`accord_meetings?meeting_id=eq.${meetingId}`, {
        workstream_id: newWorkstreamId,
      });
    } catch (e) {
      console.error('[Accord-workstreams] file failed', e);
      alert('File failed: ' + (e?.message || e));
      return;
    }

    // Determine which CoC event applies (placed / unplaced / refiled)
    let typeKey, notes;
    if (oldWorkstreamId === null && newWorkstreamId !== null) {
      typeKey = 'accord.meeting.placed';
      notes = 'Meeting filed under workstream';
    } else if (oldWorkstreamId !== null && newWorkstreamId === null) {
      typeKey = 'accord.meeting.unplaced';
      notes = 'Meeting returned to parking lot';
    } else {
      typeKey = 'accord.meeting.refiled';
      notes = 'Meeting refiled to a different workstream';
    }

    try {
      if (window.CoC?.write) {
        await window.CoC.write(typeKey, meetingId, {
          entityType: 'accord_meeting',
          notes,
          meta: {
            from_workstream_id: oldWorkstreamId,
            to_workstream_id:   newWorkstreamId,
            sealed_at:          m?.sealed_at || null,
          },
        });
      }
    } catch (e) { console.warn('[Accord-workstreams] CoC.write best-effort failure', e); }

    // CMD-ACCORD-CONSTELLATION-ENTRY-1 Phase 4a — Phase 3 carry-forward.
    // Three distinct events so accord-rails can tailor refreshes (parking
    // lot only / tree only / both).
    let eventName;
    if (typeKey === 'accord.meeting.placed')         eventName = 'accord:meeting-filed';
    else if (typeKey === 'accord.meeting.unplaced')  eventName = 'accord:meeting-unfiled';
    else                                             eventName = 'accord:meeting-refiled';
    try {
      window.dispatchEvent(new CustomEvent(eventName, {
        detail: {
          meeting_id: meetingId,
          from_workstream_id: oldWorkstreamId,
          to_workstream_id:   newWorkstreamId,
        },
      }));
    } catch (e) {}

    // Update local meeting state if it was the active meeting
    if (m && m.meeting_id === meetingId) {
      m.workstream_id = newWorkstreamId;
      _refreshFiledAffordances();
    }

    _closeFileModal();
    // Refresh management surface counts (best-effort)
    if (document.getElementById('surface-workstreams')?.classList.contains('active')) {
      await _refresh();
    }
  }

  // ── Filed-under affordances (running header + closed banner) ──
  function _refreshFiledAffordances() {
    const m = window.Accord?.state?.me ? window.Accord.state.meeting : null;
    const capFiled = $('cap-filed');
    const closedFiledRow = $('closed-filed');
    const capValue = $('cap-filed-value');
    const closedValue = $('closed-filed-value');
    const capAction = $('cap-filed-action');
    const closedAction = $('closed-filed-action');

    if (!m) {
      // No meeting loaded — hide running header affordance
      if (capFiled) capFiled.style.display = 'none';
      return;
    }

    // Render label + state on running header
    if (capFiled) {
      capFiled.style.display = '';
      const valEl = capValue;
      const acEl = capAction;
      if (m.workstream_id) {
        const w = local.workstreams.find(x => x.workstream_id === m.workstream_id);
        const top = w && w.parent_workstream_id
          ? local.workstreams.find(x => x.workstream_id === w.parent_workstream_id)
          : null;
        const label = w
          ? (top ? `${top.name} / ${w.name}` : w.name)
          : '(unknown workstream)';
        if (valEl) { valEl.textContent = label; valEl.classList.remove('unfiled'); }
        if (acEl) acEl.textContent = '[change]';
      } else {
        if (valEl) { valEl.textContent = 'Unfiled'; valEl.classList.add('unfiled'); }
        if (acEl) acEl.textContent = '[file]';
      }
    }

    // Closed-banner affordance: same logic, only visible when banner is shown
    if (closedFiledRow) {
      if (m.workstream_id) {
        const w = local.workstreams.find(x => x.workstream_id === m.workstream_id);
        const top = w && w.parent_workstream_id
          ? local.workstreams.find(x => x.workstream_id === w.parent_workstream_id)
          : null;
        const label = w
          ? (top ? `${top.name} / ${w.name}` : w.name)
          : '(unknown workstream)';
        if (closedValue) { closedValue.textContent = label; closedValue.classList.remove('unfiled'); }
        if (closedAction) closedAction.textContent = '[change]';
      } else {
        if (closedValue) { closedValue.textContent = 'Unfiled'; closedValue.classList.add('unfiled'); }
        if (closedAction) closedAction.textContent = '[file]';
      }
    }
  }

  // ── Refresh ─────────────────────────────────────────────────
  async function _refresh() {
    await _loadWorkstreams();
    await _loadMeetingCounts();
    _renderSurface();
    _refreshFiledAffordances();
  }

  // ── Wire-up (one-time) ──────────────────────────────────────
  function _wireUI() {
    // Chrome link → switch to workstreams surface + refresh
    const chrome = $('manageWorkstreamsLink');
    if (chrome) {
      chrome.addEventListener('click', async (ev) => {
        ev.preventDefault();
        if (window.Accord?.switchSurface) {
          window.Accord.switchSurface('workstreams');
        } else {
          // Fallback: directly toggle the surface
          document.querySelectorAll('#accord-app .surface').forEach(s => s.classList.remove('active'));
          $('surface-workstreams')?.classList.add('active');
          window.dispatchEvent(new CustomEvent('accord:surface-changed', { detail: { surface: 'workstreams' } }));
        }
        chrome.classList.add('active');
        await _refresh();
      });
    }

    // Top-nav surface change deactivates chrome-link active state
    window.addEventListener('accord:surface-changed', (ev) => {
      const surf = ev?.detail?.surface;
      if (surf !== 'workstreams' && chrome) chrome.classList.remove('active');
    });

    // New-workstream button on management surface
    $('ws-new-btn')?.addEventListener('click', () => _openCreateModal('create'));

    // Show-archived toggle
    $('ws-show-archived')?.addEventListener('change', (ev) => {
      local.showArchived = !!ev.target.checked;
      _renderSurface();
    });

    // Create / rename modal handlers
    $('wsCreateCancel')?.addEventListener('click', () => _closeCreateModal());
    $('wsCreateConfirm')?.addEventListener('click', () => _submitCreateOrRename());
    const cm = $('wsCreateModal');
    cm?.addEventListener('click', (ev) => { if (ev.target === cm) _closeCreateModal(); });

    // File modal handlers
    $('wsFileCancel')?.addEventListener('click', () => _closeFileModal());
    $('wsFileConfirm')?.addEventListener('click', () => _submitFile());
    const fm = $('wsFileModal');
    fm?.addEventListener('click', (ev) => { if (ev.target === fm) _closeFileModal(); });

    // Esc closes whichever modal is open
    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape') return;
      if (cm && cm.classList.contains('visible')) _closeCreateModal();
      if (fm && fm.classList.contains('visible')) _closeFileModal();
    });

    // Filed-under action affordances (running + closed-banner)
    $('cap-filed-action')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      const m = window.Accord?.state?.meeting;
      if (m?.meeting_id) _openFileModal(m.meeting_id);
    });
    $('closed-filed-action')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      const m = window.Accord?.state?.meeting;
      if (m?.meeting_id) _openFileModal(m.meeting_id);
    });

    // Listen for meeting-loaded events to refresh Filed-under affordances
    window.addEventListener('accord:meeting-loaded', () => _refreshFiledAffordances());
    window.addEventListener('accord:meeting-sealed', () => _refreshFiledAffordances());
  }

  // ── Init ────────────────────────────────────────────────────
  async function _init() {
    _wireUI();
    // Load workstreams once at startup so Filed-under labels can resolve
    // immediately when a meeting loads. Cheap; firm-scoped via RLS.
    await _refresh();
    console.log('[Accord] workstreams surface ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  // Expose minimal API for cross-module use (Accord-core fires meeting-loaded;
  // this module reacts via the event; no direct API needed yet).
  //
  // CMD-ACCORD-CONSTELLATION-ENTRY-1 Phase 3: expanded public API to
  // receive the four constellation/rails CustomEvents (per Phase 2
  // Decision 1 — expose existing internals, no new behavior). Coding
  // agents wiring these handlers can call the public methods directly
  // without reaching into module-private functions.
  window.AccordWorkstreams = {
    refresh: _refresh,
    openFileModal: _openFileModal,

    // Create — opens the create-modal in 'create' mode. Optional
    // parentWorkstreamId pre-selects the parent dropdown so callers
    // (e.g. workstream-view's "+ New sub-workstream" button) don't
    // require the operator to remember to pick the parent manually.
    openCreate(parentWorkstreamId) {
      _openCreateModal('create', null, parentWorkstreamId || null);
    },

    // Rename — set the rename target then open the modal in 'rename' mode.
    // Pass the id through to _openCreateModal explicitly; relying on the
    // local-state assignment alone is fragile because _openCreateModal
    // overwrites local.renameTargetId from its own argument.
    openRename(workstreamId) {
      if (!workstreamId) return;
      _openCreateModal('rename', workstreamId);
    },

    // CMD-ACCORD-CONSTELLATION-ENTRY-1 Phase 4b — Q4 source-of-truth.
    // Archive flow is gated through the rich confirmation modal. The
    // bare-confirm `archiveWorkstream` of Phase 3 is GONE — not aliased,
    // not wrapped. Any caller that wants to archive MUST go through
    // openArchiveConfirm so the operator always sees cascade impact.
    openArchiveConfirm(workstreamId) {
      if (!workstreamId) return;
      return _openArchiveConfirm(workstreamId);
    },

    // Restore — management-surface only per Q3 disposition. Public API
    // exposes it for that surface; new view (constellation/tree/
    // workstream-view) does NOT call it.
    restoreWorkstream(workstreamId) {
      if (!workstreamId) return;
      return _restoreWorkstream(workstreamId);
    },

    // View subs — Phase 3 minimum: switch to the manage-workstreams surface
    // so the operator can see the parent + its sub-workstreams in the table.
    // Phase 4 may replace this with a workstream-level center-pane view.
    viewSubs(workstreamId) {
      if (window.Accord?.switchSurface) {
        window.Accord.switchSurface('workstreams');
      }
      // Best-effort scroll-into-view of the parent row after surface activates
      setTimeout(() => {
        const row = document.querySelector(`#ws-tbody tr[data-ws-id="${workstreamId}"]`);
        row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row?.classList.add('ws-row-flash');
        setTimeout(() => row?.classList.remove('ws-row-flash'), 1400);
      }, 60);
    },
  };
})();