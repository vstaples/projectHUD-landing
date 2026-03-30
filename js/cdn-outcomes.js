// cdn-outcomes.js — Cadence: outcome/confirm/agenda item CRUD
// LOAD ORDER: 4th

function addMeetingAgendaItem(stepId) {
  const step = _selectedTmpl?.steps?.find(s => s.id === stepId);
  if (!step) return;
  if (!step._meetingAgenda) step._meetingAgenda = [];
  step._meetingAgenda.push('');
  const authorName = _resources_cad.find(r => r.id === _myResourceId)?.name || 'Team Member';
  if (_selectedTmpl?.id) _binAppend(_selectedTmpl.id, {
    type: 'field_changed', stepName: step.name || 'Meeting',
    field: 'meeting_agenda', from: null, to: 'added',
    changedBy: authorName, ts: new Date().toISOString(),
  });
  markDirty(); reRenderSpine(); _refreshCoCIfOpen();
}

function removeMeetingAgendaItem(stepId, idx) {
  const step = _selectedTmpl?.steps?.find(s => s.id === stepId);
  if (!step?._meetingAgenda) return;
  const removed = step._meetingAgenda[idx];
  step._meetingAgenda.splice(idx, 1);
  const authorName = _resources_cad.find(r => r.id === _myResourceId)?.name || 'Team Member';
  if (_selectedTmpl?.id) _binAppend(_selectedTmpl.id, {
    type: 'field_changed', stepName: step.name || 'Meeting',
    field: 'meeting_agenda', from: removed, to: null,
    changedBy: authorName, ts: new Date().toISOString(),
  });
  markDirty(); reRenderSpine(); _refreshCoCIfOpen();
}

function updateMeetingAgendaItem(stepId, idx, value) {
  const step = _selectedTmpl?.steps?.find(s => s.id === stepId);
  if (!step?._meetingAgenda) return;
  const prev = step._meetingAgenda[idx];
  step._meetingAgenda[idx] = value;
  // Only bin on blur-equivalent — debounce so we don't flood on every keystroke
  clearTimeout(step._agendaDebounce);
  step._agendaDebounce = setTimeout(() => {
    if (prev !== value && _selectedTmpl?.id) {
      const authorName = _resources_cad.find(r => r.id === _myResourceId)?.name || 'Team Member';
      _binAppend(_selectedTmpl.id, {
        type: 'field_changed', stepName: step.name || 'Meeting',
        field: 'meeting_agenda', from: prev || '—', to: value || '—',
        changedBy: authorName, ts: new Date().toISOString(),
      });
      _refreshCoCIfOpen();
    }
  }, 800);
  markDirty();
}

function addOutcome(stepId) {
  const step = _selectedTmpl?.steps?.find(s => s.id === stepId);
  if (!step) return;
  if (!step.outcomes || !step.outcomes.length) {
    // Initialize from defaults first
    step.outcomes = _getOutcomes(step).map(o => ({...o}));
  }
  step.outcomes.push({ id: 'outcome_' + Date.now(), label: 'New outcome', color: '#888', isDefault: false });
  const authorName = _resources_cad.find(r => r.id === _myResourceId)?.name || 'Team Member';
  if (_selectedTmpl?.id) _binAppend(_selectedTmpl.id, {
    type: 'field_changed', stepName: step.name || 'Step',
    field: 'outcomes', from: null, to: 'added',
    changedBy: authorName, ts: new Date().toISOString(),
  });
  markDirty(); reRenderSpine(); _refreshCoCIfOpen();
}

function removeOutcome(stepId, idx) {
  const step = _selectedTmpl?.steps?.find(s => s.id === stepId);
  if (!step?.outcomes) return;
  step.outcomes.splice(idx, 1);
  const authorName = _resources_cad.find(r => r.id === _myResourceId)?.name || 'Team Member';
  if (_selectedTmpl?.id) _binAppend(_selectedTmpl.id, {
    type: 'field_changed', stepName: step.name || 'Step',
    field: 'outcomes', from: null, to: 'removed',
    changedBy: authorName, ts: new Date().toISOString(),
  });
  markDirty(); reRenderSpine(); _refreshCoCIfOpen();
}

function updateOutcomeField(stepId, idx, field, value) {
  const step = _selectedTmpl?.steps?.find(s => s.id === stepId);
  if (!step) return;
  // Ensure outcomes array is initialized from defaults
  if (!step.outcomes || !step.outcomes.length) {
    step.outcomes = _getOutcomes(step).map(o => ({...o}));
  }
  if (!step.outcomes[idx]) return;
  step.outcomes[idx][field] = value;
  markDirty();
  // Refresh dot color inline without full re-render
  const row = document.querySelector(`#outcomes-list-${stepId} > div:nth-child(${idx + 1}) > div:first-child`);
  if (row && field === 'color') row.style.background = value;
}

function addConfirmItem(stepId) {
  const step = _selectedTmpl?.steps?.find(s => s.id === stepId);
  if (!step) return;
  if (!step._confirmItems) step._confirmItems = [];
  step._confirmItems.push('');
  _dirtySteps = true;
  reRenderSpine();
}

function removeConfirmItem(stepId, idx) {
  const step = _selectedTmpl?.steps?.find(s => s.id === stepId);
  if (!step?._confirmItems) return;
  step._confirmItems.splice(idx, 1);
  _dirtySteps = true;
  reRenderSpine();
}

function updateConfirmItem(stepId, idx, value) {
  const step = _selectedTmpl?.steps?.find(s => s.id === stepId);
  if (!step?._confirmItems) return;
  step._confirmItems[idx] = value;
  _dirtySteps = true;
}