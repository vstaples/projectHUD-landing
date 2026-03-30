// cdn-core-state.js — Cadence workflow builder: global state, constants, init
// ─────────────────────────────────────────────────────────────────────────────
// PURPOSE
//   Shared state, constants, and initialization for the Cadence module.
//   Must load FIRST — all other cdn-*.js modules depend on these globals.
//
// GLOBALS EXPORTED (all on window via closure — access as bare names within
//   cadence.html scope, or window._cadState for external inspection)
//   _templates, _instances, _selectedTmpl, _selectedStep, _dirtySteps
//   _users_cad, _resources_cad, _myResourceId, _myUserId
//   FIRM_ID_CAD, STEP_META, DEFAULT_OUTCOMES
//
// LOAD ORDER: 1st — before all other cdn-*.js files
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
// ── State ────────────────────────────────────────────────────────────────────
const FIRM_ID_CAD          = 'aaaaaaaa-0001-0001-0001-000000000001';
const AUTOSAVE_INTERVAL_MS = 30000; // 30 seconds
const SUPA_URL  = 'https://dvbetgdzksatcgdfftbs.supabase.co';
const SUPA_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR2YmV0Z2R6a3NhdGNnZGZmdGJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NDc2MTYsImV4cCI6MjA4OTEyMzYxNn0.1geeKhrLL3nhjW08ieKr7YZmE0AVX4xnom7i2j1W358';
const STORAGE_BUCKET = 'workflow-documents';
let _currentTab     = 'templates';
let _templates      = [];
let _instances      = [];
let _selectedTmpl   = null;   // full template object with .steps[]
let _selectedStep   = null;   // step object currently in config panel
let _dirtySteps     = false;  // unsaved changes flag
let _structuralChange = false; // true when steps added/deleted since last save
let _versionBumped  = false;  // true once version has been bumped in this draft session
let _autoSaveTimer  = null;   // setInterval handle
let _lastSavedAt    = null;   // Date of last successful auto-save
let _stepSnapshot   = {};     // { stepId: {name, assignee_type, assignee_name, ...} } at load/commit time
let _cocCommittedRows = [];   // cached committed CoC rows for live panel refresh

// ── Pending change bin — persisted in localStorage per template ───────────────
const _BIN_PREFIX = 'cadence_pending_';

function _binKey(templateId) { return _BIN_PREFIX + templateId; }


function _binLoad(templateId) {
  try { return JSON.parse(localStorage.getItem(_binKey(templateId)) || '[]'); }
  catch(e) { return []; }
}

function _binAppend(templateId, entry) {
  const bin = _binLoad(templateId);
  bin.push({ ...entry, ts: new Date().toISOString() });
  try { localStorage.setItem(_binKey(templateId), JSON.stringify(bin)); } catch(e) {}
}

function _binClear(templateId) {
  try { localStorage.removeItem(_binKey(templateId)); } catch(e) {}
}

function _binCount(templateId) { return _binLoad(templateId).length; }


function _stepSnap(step) {
  return {
    id:                  step.id,
    name:                step.name || '',
    step_type:           step.step_type || '',
    assignee_type:       step.assignee_type || '',
    assignee_user_id:    step.assignee_user_id || '',
    assignee_name:       step.assignee_name || '',
    assignee_email:      step.assignee_email || '',
    assignee_role:       step.assignee_role || '',
    assignee_org:        step.assignee_org || '',
    due_days:            step.due_days ?? null,
    due_type:            step.due_type || '',
    escalate_after_days: step.escalate_after_days ?? null,
    escalate_to:         step.escalate_to || '',
    parallel_required:   !!step.parallel_required,
    forward_input:       !!step.forward_input,
    instructions:        step.instructions || '',
    sequence_order:      step.sequence_order,
    meeting_agenda:      JSON.stringify(step._meetingAgenda || []),
    confirm_items:       JSON.stringify(step._confirmItems || []),
    outcomes:            JSON.stringify(step.outcomes || []),
  };
}

function _takeSnapshot() {
  if (!_selectedTmpl?.steps) return;
  _stepSnapshot = {};
  _selectedTmpl.steps.forEach(s => { _stepSnapshot[s.id] = _stepSnap(s); });
}

function _diffSteps(prevSnap, currentSteps) {
  const diffs = [];
  const prevIds  = new Set(Object.keys(prevSnap));
  const currIds  = new Set(currentSteps.map(s => s.id));

  // Added steps
  currentSteps.filter(s => !prevIds.has(s.id)).forEach(s => {
    diffs.push(`Step added: "${s.name || s.step_type}"`);
  });

  // Deleted steps
  [...prevIds].filter(id => !currIds.has(id)).forEach(id => {
    diffs.push(`Step deleted: "${prevSnap[id].name || prevSnap[id].step_type}"`);
  });

  // Modified steps + reorders
  currentSteps.filter(s => prevIds.has(s.id)).forEach(s => {
    const prev = prevSnap[s.id];
    const curr = _stepSnap(s);
    const label = `"${curr.name || curr.step_type}"`;

    if (prev.sequence_order !== curr.sequence_order)
      diffs.push(`Step reordered: ${label} position ${prev.sequence_order} → ${curr.sequence_order}`);
    if (prev.name !== curr.name)
      diffs.push(`Step name: "${prev.name}" → "${curr.name}"`);
    if (prev.step_type !== curr.step_type)
      diffs.push(`Step type: "${prev.step_type}" → "${curr.step_type}"`);
    if (prev.assignee_type !== curr.assignee_type)
      diffs.push(`${label} assignee type: "${prev.assignee_type}" → "${curr.assignee_type}"`);
    if (prev.assignee_name !== curr.assignee_name)
      diffs.push(`${label} assignee: "${prev.assignee_name || '—'}" → "${curr.assignee_name || '—'}"`);
    if (prev.assignee_email !== curr.assignee_email && (prev.assignee_email || curr.assignee_email))
      diffs.push(`${label} assignee email: "${prev.assignee_email || '—'}" → "${curr.assignee_email || '—'}"`);
    if (prev.assignee_role !== curr.assignee_role)
      diffs.push(`${label} role: "${prev.assignee_role || '—'}" → "${curr.assignee_role || '—'}"`);
    if (prev.due_days !== curr.due_days)
      diffs.push(`${label} due days: ${prev.due_days ?? '—'} → ${curr.due_days ?? '—'}`);
    if (prev.due_type !== curr.due_type && (prev.due_type || curr.due_type))
      diffs.push(`${label} due type: "${prev.due_type || '—'}" → "${curr.due_type || '—'}"`);
    if (prev.escalate_after_days !== curr.escalate_after_days)
      diffs.push(`${label} escalate after: ${prev.escalate_after_days ?? '—'} → ${curr.escalate_after_days ?? '—'}`);
    if (prev.escalate_to !== curr.escalate_to && (prev.escalate_to || curr.escalate_to))
      diffs.push(`${label} escalate to: "${prev.escalate_to || '—'}" → "${curr.escalate_to || '—'}"`);
    if (prev.parallel_required !== curr.parallel_required)
      diffs.push(`${label} multi-reviewer: ${prev.parallel_required} → ${curr.parallel_required}`);
    if (prev.forward_input !== curr.forward_input)
      diffs.push(`${label} forward input: ${prev.forward_input} → ${curr.forward_input}`);
    if (prev.instructions !== curr.instructions && (prev.instructions || curr.instructions))
      diffs.push(`${label} instructions updated`);
    if (prev.meeting_agenda !== curr.meeting_agenda) {
      const prevArr = JSON.parse(prev.meeting_agenda || '[]');
      const currArr = JSON.parse(curr.meeting_agenda || '[]');
      if (currArr.length > prevArr.length)
        diffs.push(`${label} agenda item added (${currArr.length} items)`);
      else if (currArr.length < prevArr.length)
        diffs.push(`${label} agenda item removed (${currArr.length} items)`);
      else
        diffs.push(`${label} agenda items updated`);
    }
    if (prev.outcomes !== curr.outcomes)
      diffs.push(`${label} outcomes updated`);
    if (prev.confirm_items !== curr.confirm_items) {
      const prevArr = JSON.parse(prev.confirm_items || '[]');
      const currArr = JSON.parse(curr.confirm_items || '[]');
      if (currArr.length > prevArr.length)
        diffs.push(`${label} attestation item added (${currArr.length} items)`);
      else if (currArr.length < prevArr.length)
        diffs.push(`${label} attestation item removed (${currArr.length} items)`);
      else
        diffs.push(`${label} attestation items updated`);
    }
  });

  return diffs;
}

// ── Step type metadata ────────────────────────────────────────────────────────
// Icon, label, and visual style for each workflow step type.
// Used by: cdn-template-editor.js, cdn-dag-viewer.js, cdn-instance-dag.js,
//          cdn-instances.js, cdn-intel.js
const STEP_META = {
  trigger:      { icon:'⚡', label:'Trigger',            nodeClass:'sn-trigger',  badgeColor:'rgba(192,64,74,.2)',    badgeText:'#c0404a' },
  approval:     { icon:'✓',  label:'Approval',           nodeClass:'sn-approval', badgeColor:'rgba(61,153,112,.15)',  badgeText:'#3d9970' },
  review:       { icon:'R',  label:'Review',             nodeClass:'sn-review',   badgeColor:'rgba(79,142,247,.15)',  badgeText:'#4f8ef7' },
  signoff:      { icon:'✍',  label:'Sign-off',           nodeClass:'sn-signoff',  badgeColor:'rgba(196,125,24,.15)',  badgeText:'#c47d18' },
  action:       { icon:'→',  label:'Action',             nodeClass:'sn-action',   badgeColor:'rgba(255,255,255,.06)', badgeText:'rgba(255,255,255,.5)' },
  external:     { icon:'E',  label:'External',           nodeClass:'sn-external', badgeColor:'rgba(201,168,76,.15)',  badgeText:'#c9a84c' },
  form:         { icon:'F',  label:'Collaborative Form', nodeClass:'sn-form',     badgeColor:'rgba(160,80,200,.15)',  badgeText:'#b070e0' },
  branch:       { icon:'⋔',  label:'Branch',             nodeClass:'sn-branch',   badgeColor:'rgba(255,255,255,.05)', badgeText:'rgba(255,255,255,.4)' },
  wait:         { icon:'⏱',  label:'Wait',               nodeClass:'sn-action',   badgeColor:'rgba(255,255,255,.06)', badgeText:'rgba(255,255,255,.4)' },
  confirmation: { icon:'✓✓', label:'Confirmation',       nodeClass:'sn-confirm',  badgeColor:'rgba(0,185,195,.15)',   badgeText:'#00b9c3' },
  meeting:      { icon:'◉',  label:'Meeting',            nodeClass:'sn-meeting',  badgeColor:'rgba(79,200,140,.15)',  badgeText:'#4fc88c' },
};

// ── Default outcomes per step type ────────────────────────────────────────────
// Each outcome: { id, label, color, isDefault, isReject, requiresReset, ... }
// Used by: _getOutcomes() below, cdn-template-editor.js, cdn-instances.js
const DEFAULT_OUTCOMES = {
  approval:     [
    { id:'approved',          label:'Approved',           color:'#1D9E75', isDefault:true  },
    { id:'changes_requested', label:'Changes requested',  color:'#BA7517', isDefault:false, requiresReset:true },
    { id:'rejected',          label:'Rejected',           color:'#E24B4A', isDefault:false, requiresReset:true },
  ],
  review:       [
    { id:'accepted',          label:'Accepted',           color:'#1D9E75', isDefault:true  },
    { id:'changes_requested', label:'Changes requested',  color:'#BA7517', isDefault:false, requiresReset:true },
    { id:'rejected',          label:'Rejected',           color:'#E24B4A', isDefault:false, requiresReset:true },
  ],
  signoff:      [
    { id:'signed',            label:'Signed',             color:'#1D9E75', isDefault:true  },
    { id:'declined',          label:'Declined',           color:'#E24B4A', isDefault:false, requiresReset:true },
  ],
  form:         [
    { id:'submitted',         label:'Submitted',          color:'#1D9E75', isDefault:true  },
    { id:'saved_incomplete',  label:'Saved (incomplete)', color:'#BA7517', isDefault:false, isPartial:true },
  ],
  action:       [
    { id:'done',              label:'Done',               color:'#1D9E75', isDefault:true  },
    { id:'blocked',           label:'Blocked',            color:'#E24B4A', isDefault:false, requiresReset:true },
    { id:'escalated',         label:'Escalated',          color:'#BA7517', isDefault:false },
  ],
  external:     [
    { id:'responded',         label:'Responded',          color:'#1D9E75', isDefault:true  },
    { id:'no_response',       label:'No response',        color:'#BA7517', isDefault:false },
  ],
  meeting:      [
    { id:'concluded',            label:'Concluded — no actions',      color:'#1D9E75', isDefault:true  },
    { id:'concluded_actions',    label:'Concluded — actions pending', color:'#BA7517', isDefault:false, holdsForActions:true },
    { id:'design_change',        label:'Design change required',      color:'#E24B4A', isDefault:false, requiresReset:true },
    { id:'full_reset',           label:'Full reset — awaiting input', color:'#E24B4A', isDefault:false, requiresReset:true, requiresSuspend:true },
    { id:'cancelled',            label:'Cancelled',                   color:'#888',    isDefault:false },
  ],
  confirmation: [
    { id:'confirmed',         label:'Confirmed',          color:'#1D9E75', isDefault:true  },
    { id:'incomplete',        label:'Incomplete',         color:'#BA7517', isDefault:false },
  ],
  wait:         [
    { id:'condition_met',     label:'Condition met',      color:'#1D9E75', isDefault:true  },
    { id:'timed_out',         label:'Timed out',          color:'#BA7517', isDefault:false },
  ],
};

function _getOutcomes(step) {
  // Use saved custom outcomes if present, else defaults for the step type
  if (Array.isArray(step.outcomes) && step.outcomes.length) return step.outcomes;
  return DEFAULT_OUTCOMES[step.step_type] || [{ id:'done', label:'Done', color:'#1D9E75', isDefault:true }];
}

async function loadAll() {
  try {
    const [tmpls, insts, users] = await Promise.all([
      API.get(`workflow_templates?firm_id=eq.${FIRM_ID_CAD}&order=created_at.desc`).catch(()=>[]),
      API.get(`workflow_instances?firm_id=eq.${FIRM_ID_CAD}&order=created_at.desc&limit=50`).catch(()=>[]),
      API.get('users?is_active=eq.true&select=id,name,title,resource_id,email').catch(()=>[]),
    ]);
    _templates = tmpls || [];
    _instances = insts || [];
    _users_cad = users || [];
    updateBadges();
  } catch(e) {
    cadToast('Failed to load workflows: ' + e.message, 'error');
  }
}

function updateBadges() {
  const tc = document.getElementById('tmpl-count');
  const ic = document.getElementById('inst-count');
  if (tc) { tc.textContent = _templates.length; tc.style.display = _templates.length ? '' : 'none'; }
  if (ic) { ic.textContent = _instances.filter(i=>i.status==='in_progress').length || ''; ic.style.display = _instances.filter(i=>i.status==='in_progress').length ? '' : 'none'; }
}

function switchTab(tab) {
  if (tab !== 'templates') stopAutoSave();
  if (tab !== 'instances') {
    _selectedInstance = null;
    _stopElapsedTimer();
    _stopExternalEventDetection();
  }
  _currentTab = tab;
  ['templates','instances','forms','triggers'].forEach(t => {
    document.getElementById('tab-'+t)?.classList.toggle('active', t===tab);
  });
  renderTab(tab);
}

function renderTab(tab) {
  const el = document.getElementById('cad-content');
  if (tab === 'templates') renderTemplatesTab(el);
  else if (tab === 'instances') renderInstancesTab(el);
  else if (tab === 'forms')    renderFormsTab(el);
  else if (tab === 'triggers') renderTriggersTab(el);
}

function markDirty() {
  _dirtySteps = true;
  _updateAutoSaveIndicator('unsaved');
  _updateVersionDisplay();
  document.getElementById('save-btn')?.classList.add('dirty');
}

function startAutoSave() {
  stopAutoSave(); // clear any existing interval first
  _autoSaveTimer = setInterval(async () => {
    if (_dirtySteps && _selectedTmpl) {
      _updateAutoSaveIndicator('saving');
      await saveTemplate(true); // silent = true
    }
  }, AUTOSAVE_INTERVAL_MS);
  _updateAutoSaveIndicator('saved');
}

function stopAutoSave() {
  if (_autoSaveTimer) {
    clearInterval(_autoSaveTimer);
    _autoSaveTimer = null;
  }
}

function _updateAutoSaveIndicator(state) {
  const dot  = document.getElementById('autosave-dot');
  const text = document.getElementById('autosave-text');
  if (!dot || !text) return;
  const states = {
    saved:   { color: 'var(--green)', label: _lastSavedAt ? 'Saved ' + _fmtSaveTime(_lastSavedAt) : 'Saved' },
    unsaved: { color: 'var(--amber)', label: 'Unsaved changes' },
    saving:  { color: 'var(--cyan)',  label: 'Saving…' },
    error:   { color: 'var(--red)',   label: 'Save failed' },
  };
  const s = states[state] || states.saved;
  dot.style.background  = s.color;
  text.style.color      = s.color;
  text.textContent      = s.label;
}

function _fmtSaveTime(d) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function _updateVersionDisplay() {
  if (!_selectedTmpl) return;
  const ver     = _selectedTmpl.version || '0.0.0';
  const pending = _binCount(_selectedTmpl.id) > 0 || _dirtySteps;
  const display = pending ? ver + '*' : ver;
  const verEl   = document.querySelector('.editor-toolbar [title="Version"]');
  if (verEl) verEl.textContent = display;
}

function escHtml(s) {
  return (s || '').toString()
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function cadToast(msg, type='info') {
  // Prefer shared showToast if available
  if (typeof showToast === 'function') { showToast(msg, type); return; }
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadAll();

  // ── Deep link: ?instance=<id> navigates straight to that instance ──
  const params = new URLSearchParams(window.location.search);
  const deepInst = params.get('instance');
  if (deepInst) {
    renderTab('instances');
    // Wait for instances tab to render then select
    setTimeout(() => selectInstance(deepInst), 120);
  } else {
    renderTab('templates');
  }
});

let _users_cad     = []; // app users (for template editor assignee dropdowns)
let _resources_cad = []; // all firm resources (for instance reassignment)
let _myResourceId  = null; // current user's resource ID (for owner auto-select)
let _myUserId      = null; // current user's user ID (for launched_by FK)

// ── Selected instance ─────────────────────────────────────────────────────────
let _selectedInstance  = null;  // full instance object currently open in detail view

// ── Instances tab UI state ────────────────────────────────────────────────────
let _instFilter        = 'all';  // 'all' | 'mine' | 'active' | 'done'
let _instSearch        = '';     // current search query string

// ── Instance DAG (pan/zoom canvas) state ─────────────────────────────────────
let _instDagScale      = 1;
let _instDagPanX       = 0;
let _instDagPanY       = 0;
let _instDagFitted     = false;
let _instDagPulseFrame = null;
let _instDagDrag       = false;  // drag-pan in progress
let _instDagDSX        = 0;      // drag start clientX
let _instDagDSY        = 0;      // drag start clientY
let _instDagPSX        = 0;      // pan origin X at drag start
let _instDagPSY        = 0;      // pan origin Y at drag start

// ── Instance scrubber state ───────────────────────────────────────────────────
let _instScrubEvents   = [];
let _instScrubPos      = 100;    // scrubber position 0-100

// ── Instance polling / realtime ───────────────────────────────────────────────
let _lastCoCCount      = 0;      // CoC event count at last render - drives change detection
let _pollTimer         = null;   // setInterval handle for CoC polling
let _realtimeChannel   = null;   // Supabase realtime channel handle
let _elapsedTimer      = null;   // setInterval handle for elapsed-time display

// ── Template editor DAG state ─────────────────────────────────────────────────
let _dagScale          = 1;
let _dagPanX           = 0;
let _dagPanY           = 0;
let _dagAutoFitted     = false;
let _dagDragging       = false;
let _dagDragStartX     = 0;
let _dagDragStartY     = 0;
let _dagPanStartX      = 0;
let _dagPanStartY      = 0;
let _dagActiveCard     = -1;     // index of hovered/selected step card in DAG
let _dagPanelOpen      = false;  // step config panel open
let _dagInsertAfterIdx = null;   // insertion point for new step drag
let _dragStepId        = null;   // step ID being dragged in spine
let _editorView        = 'dag';  // 'dag' | 'spine' | 'split'

// ── History / swimlane overlay (instance DAG) ─────────────────────────────────
let _historyActive     = false;
let _historyClusters   = [];
let _swimlaneActive    = false;
let _swimlaneClusters  = [];
let _confDots          = [];

// ── Tooltip state (cdn-tooltips.js) ───────────────────────────────────────────
let _tooltipTimer      = null;
let _tooltipVisible    = false;
let _tooltipStepId     = null;
let _tooltipSticky     = false;
let _confTooltipEl     = null;
let _confTooltipTimer  = null;
let _historyPopup      = null;
let _historyHideTimer  = null;
let _hxHighlightStep   = null;
let _hxHighlightTimer  = null;
let _hxCardDwellTimer  = null;
let _swimlanePopup     = null;
let _swimlaneHideTimer = null;
let _swimlaneDwellRow  = null;
let _swimlaneDwellTimer = null;

// ── DAG resize handle state ────────────────────────────────────────────────────
let _resizeStartX      = 0;
let _resizeStartW      = 0;

API.get('users?is_active=eq.true&select=id,name,title,resource_id').then(u => {
  _users_cad = u || [];
  // Back-fill assignee_resource_id on any already-loaded steps
  if (_selectedTmpl?.steps) {
    _selectedTmpl.steps.forEach(s => {
      if (s.assignee_user_id && !s.assignee_resource_id) {
        s.assignee_resource_id =
          _users_cad.find(u => u.id === s.assignee_user_id)?.resource_id || null;
      }
    });
  }
}).catch(() => {});

// Load current user's resource ID for owner auto-select
(async () => {
  try {
    const token = await Auth.getFreshToken().catch(() => Auth.getToken());
    const sub   = JSON.parse(atob(token.split('.')[1])).sub;
    const rows  = await API.get(`users?id=eq.${sub}&select=id,resource_id`).catch(() => []);
    _myResourceId = rows?.[0]?.resource_id || null;
    _myUserId     = rows?.[0]?.id          || null;
  } catch(e) {}
})();

API.get(`resources?firm_id=eq.${FIRM_ID_CAD}&is_active=eq.true&select=id,first_name,last_name,title,email,department,is_external&order=last_name.asc`)
  .then(r => { _resources_cad = (r || []).map(x => ({
    ...x, name: `${x.first_name||''} ${x.last_name||''}`.trim()
  })).sort((a,b) => {
    // Externals last, then sort by department, then name
    if (a.is_external !== b.is_external) return a.is_external ? 1 : -1;
    const da = a.department||'', db = b.department||'';
    return da < db ? -1 : da > db ? 1 : a.name.localeCompare(b.name);
  }); })
  .catch(() => {});

// ── CoC + Tests panel drag-to-resize ─────────────────────────────────────────
(function() {
  let _dragging      = false;
  let _dragPanelId   = null;
  let _dragHandleId  = null;
  let _startX        = 0;
  let _startW        = 0;

  document.addEventListener('mousedown', e => {
    const handle = e.target.closest('#tmpl-coc-resize, #tmpl-tests-resize');
    if (!handle) return;
    _dragPanelId  = handle.id === 'tmpl-coc-resize' ? 'tmpl-coc-panel' : 'tmpl-tests-panel';
    _dragHandleId = handle.id;
    const panel   = document.getElementById(_dragPanelId);
    if (!panel) return;
    _dragging = true;
    _startX   = e.clientX;
    _startW   = panel.offsetWidth;
    handle.classList.add('dragging');
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener('mousemove', e => {
    if (!_dragging || !_dragPanelId) return;
    const panel = document.getElementById(_dragPanelId);
    if (!panel) return;
    const delta    = _startX - e.clientX; // drag left = wider
    const newWidth = Math.max(240, Math.min(600, _startW + delta));
    panel.style.width      = newWidth + 'px';
    panel.style.transition = 'none';
  });

  document.addEventListener('mouseup', () => {
    if (!_dragging) return;
    _dragging = false;
    document.getElementById(_dragHandleId)?.classList.remove('dragging');
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
    const panel = document.getElementById(_dragPanelId);
    if (panel) panel.style.transition = '';
    _dragPanelId  = null;
    _dragHandleId = null;
  });
})();

function escHtml(s) {
  return (s || '').toString()
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function cadToast(msg, type='info') {
  // Prefer shared showToast if available
  if (typeof showToast === 'function') { showToast(msg, type); return; }
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}