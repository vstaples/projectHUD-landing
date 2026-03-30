// cdn-assignee.js — Cadence: assignee/resource picker
// ─────────────────────────────────────────────────────────────────────────────
// NOTE: renderResourceOptions() renders a <select> optgroup list.
//       addReassignment / overrideTemplateAssignee open the grouped PersonPicker
//       (window.PersonPicker.show) when available, falling back to the <select>.
//       All person selection in Cadence MUST route through this module.
//       Do NOT implement custom resource pickers inline elsewhere.
// LOAD ORDER: 3rd

function autoFillAssignee(stepId, resourceId) {
  const r = _resources_cad.find(x => x.id === resourceId);
  if (!r) return;
  const user = _users_cad.find(u => u.resource_id === resourceId);

  const prevName = _selectedStep?.assignee_name || '';

  // Write all related fields directly — bypass updateStepField to avoid
  // multiple bin entries; we write one consolidated entry below
  if (_selectedStep) {
    _selectedStep.assignee_user_id     = user?.id     || null;
    _selectedStep.assignee_resource_id = resourceId;
    _selectedStep.assignee_email       = r.email      || null;
    _selectedStep.assignee_name        = r.name       || null;
    _dirtySteps = true;
    _updateVersionDisplay();
  }

  // Single CoC bin entry for the whole assignee change
  if (_selectedTmpl?.id && prevName !== r.name) {
    const authorName = _resources_cad.find(x => x.id === _myResourceId)?.name || 'Team Member';
    _binAppend(_selectedTmpl.id, {
      type:      'field_changed',
      stepName:  _selectedStep?.name || _selectedStep?.step_type || 'Step',
      field:     'assignee',
      from:      prevName || '—',
      to:        r.name || '—',
      changedBy: authorName,
      ts:        new Date().toISOString(),
    });
    _refreshCoCIfOpen();
  }

  // Re-render spine so card summary + config panel update
  reRenderSpine();
}

function selectExternalAssignee(stepId, resourceId) {
  const r = _resources_cad.find(x => x.id === resourceId);
  if (!r) return;
  updateStepField('assignee_name',  r.name  || '');
  updateStepField('assignee_email', r.email || '');
  updateStepField('assignee_org',   r.department || '');
  // Update the text inputs immediately
  const nameEl  = document.getElementById(`scfg-extname-${stepId}`);
  const emailEl = document.getElementById(`scfg-extemail-${stepId}`);
  const orgEl   = document.getElementById(`scfg-extorg-${stepId}`);
  if (nameEl)  nameEl.value  = r.name  || '';
  if (emailEl) emailEl.value = r.email || '';
  if (orgEl)   orgEl.value   = r.department || '';
}

function renderResourceOptions(selectedId = '', placeholder = '— Select resource —') {
  const groups = {};
  _resources_cad.forEach(r => {
    const grp = r.is_external
      ? ('External' + (r.department ? ': ' + r.department : ''))
      : (r.department || 'Internal');
    if (!groups[grp]) groups[grp] = [];
    groups[grp].push(r);
  });
  const opts = Object.entries(groups).map(([grp, members]) =>
    `<optgroup label="${escHtml(grp)}">
      ${members.map(r =>
        `<option value="${r.id}" ${r.id === selectedId ? 'selected' : ''}>
          ${escHtml(r.name)}${r.title ? ' — ' + escHtml(r.title) : ''}
        </option>`
      ).join('')}
    </optgroup>`
  ).join('');
  return `<option value="">${escHtml(placeholder)}</option>${opts}`;
}

async function addReassignment(instId, stepId) {
  const statusEl = document.getElementById(`reassign-status-${stepId}`);
  const sel      = document.getElementById(`reassign-res-${stepId}`);
  const resId    = sel?.value;

  if (!resId) {
    if (statusEl) { statusEl.textContent = 'Select a resource first'; statusEl.style.color = 'var(--red)'; }
    return;
  }

  const inst     = _instances.find(i => i.id === instId);
  const step     = inst?._tmplSteps?.find(s => s.id === stepId);
  const resource = _resources_cad.find(r => r.id === resId);
  if (statusEl) { statusEl.textContent = 'Saving…'; statusEl.style.color = 'var(--muted)'; }

  try {
    const payload = {
      instance_id:      instId,
      firm_id:          FIRM_ID_CAD,
      event_type:       'step_reassigned',
      template_step_id: stepId,
      step_type:        step?.step_type || 'action',
      step_name:        step?.name || null,
      assignee_name:    resource?.name || null,
      assignee_email:   resource?.email || null,
      created_at:       new Date().toISOString(),
    };

    // For external steps also read the override fields if present
    const nameOverride  = document.getElementById(`reassign-name-${stepId}`)?.value?.trim();
    const emailOverride = document.getElementById(`reassign-email-${stepId}`)?.value?.trim();
    if (nameOverride)  payload.assignee_name  = nameOverride;
    if (emailOverride) payload.assignee_email = emailOverride;

    await API.post('workflow_step_instances', payload);

    // Reload CoC
    if (inst) {
      inst._stepInsts = await API.get(
        `workflow_step_instances?instance_id=eq.${instId}&order=created_at.asc,id.asc`
      ).catch(() => inst._stepInsts);
    }

    if (statusEl) { statusEl.textContent = `✓ ${resource?.name||'Resource'} added`; statusEl.style.color = 'var(--green)'; }
    cadToast(`${resource?.name||'Resource'} assigned — recorded in Chain of Custody`, 'success');

    // Reset picker
    if (sel) sel.value = '';

    const detailEl = document.getElementById('instance-detail');
    if (detailEl && inst) renderInstanceDetail(detailEl, inst);

  } catch(e) {
    if (statusEl) { statusEl.textContent = 'Failed: ' + e.message; statusEl.style.color = 'var(--red)'; }
    cadToast('Reassignment failed: ' + e.message, 'error');
  }
}

async function removeReassignment(instId, stepId, cocEventId) {
  try {
    const inst = _instances.find(i => i.id === instId);
    const step = inst?._tmplSteps?.find(s => s.id === stepId);
    const orig = inst?._stepInsts?.find(e => e.id === cocEventId);

    await API.post('workflow_step_instances', {
      instance_id:      instId,
      firm_id:          FIRM_ID_CAD,
      event_type:       'step_reassignment_removed',
      template_step_id: stepId,
      step_type:        step?.step_type || 'action',
      step_name:        step?.name || null,
      assignee_name:    orig?.assignee_name || null,
      assignee_email:   orig?.assignee_email || null,
      event_notes:      `Removed assignee: ${orig?.assignee_name||orig?.assignee_email||'unknown'}`,
      created_at:       new Date().toISOString(),
    });

    // Reload CoC and re-render
    if (inst) {
      inst._stepInsts = await API.get(
        `workflow_step_instances?instance_id=eq.${instId}&order=created_at.asc,id.asc`
      ).catch(() => inst._stepInsts);
    }
    cadToast('Assignee removed', 'success');
    const detailEl = document.getElementById('instance-detail');
    if (detailEl && inst) renderInstanceDetail(detailEl, inst);
  } catch(e) {
    cadToast('Remove failed: ' + e.message, 'error');
  }
}

async function overrideTemplateAssignee(instId, stepId) {
  const inst = _instances.find(i => i.id === instId);
  const step = inst?._tmplSteps?.find(s => s.id === stepId);
  try {
    await API.post('workflow_step_instances', {
      instance_id:      instId,
      firm_id:          FIRM_ID_CAD,
      event_type:       'step_assignee_override',
      template_step_id: stepId,
      step_type:        step?.step_type || 'action',
      step_name:        step?.name || null,
      event_notes:      'Template default assignee removed for this instance',
      created_at:       new Date().toISOString(),
    });
    if (inst) {
      inst._stepInsts = await API.get(
        `workflow_step_instances?instance_id=eq.${instId}&order=created_at.asc,id.asc`
      ).catch(() => inst._stepInsts);
    }
    cadToast('Template assignee removed', 'success');
    const detailEl = document.getElementById('instance-detail');
    if (detailEl && inst) renderInstanceDetail(detailEl, inst);
  } catch(e) { cadToast('Failed: ' + e.message, 'error'); }
}

function toggleCadReassign(stepId) {
  const panel   = document.getElementById('cad-reassign-panel-' + stepId);
  const chevron = document.getElementById('cad-reassign-chevron-' + stepId);
  if (!panel) return;
  const open = panel.style.display !== 'none';
  panel.style.display  = open ? 'none' : 'block';
  if (chevron) chevron.style.transform = open ? '' : 'rotate(90deg)';
}