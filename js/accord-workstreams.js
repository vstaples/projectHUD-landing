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
        if (action === 'archive')  _archiveWorkstream(id);
        if (action === 'restore')  _restoreWorkstream(id);
      });
    });
  }

  // ── Create / rename modal ───────────────────────────────────
  function _openCreateModal(mode, renameTargetId) {
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
      title.textContent = 'New workstream';
      nameInput.value = '';
      descInput.value = '';
      parentSelect.value = '';
      parentSelect.disabled = false;
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
    }

    _closeCreateModal();
    await _refresh();
  }

  // ── Archive / restore ───────────────────────────────────────
  async function _archiveWorkstream(workstreamId) {
    const w = local.workstreams.find(x => x.workstream_id === workstreamId);
    if (!w) return;
    const filedCount = local.meetingCounts[workstreamId] || 0;
    const subCount = local.workstreams.filter(x => x.parent_workstream_id === workstreamId && x.state === 'active').length;
    const warning = (filedCount + subCount > 0)
      ? `\n\nThis will:\n` +
        (filedCount > 0 ? `• Return ${filedCount} filed meeting${filedCount === 1 ? '' : 's'} to the parking lot\n` : '') +
        (subCount > 0   ? `• Cascade-archive ${subCount} sub-workstream${subCount === 1 ? '' : 's'}\n` : '')
      : '';
    if (!confirm(`Archive "${w.name}"?${warning}\n\nArchived workstreams can be restored.`)) return;

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
      // Meetings directly under this workstream
      const directMtgs = await API.get(`accord_meetings?workstream_id=eq.${workstreamId}&select=meeting_id`);
      affectedMeetings = (directMtgs || []).map(m => ({ meeting_id: m.meeting_id, from: workstreamId }));
      // Sub-workstreams about to cascade-archive + their meetings
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

    // Emit CoC events: archive of this workstream, archive of each cascaded
    // sub, unplace of each affected meeting (one event per meeting per brief §4.3).
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
  window.AccordWorkstreams = {
    refresh: _refresh,
    openFileModal: _openFileModal,
  };
})();