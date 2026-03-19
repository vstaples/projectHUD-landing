// ── ProjectHUD · project-drawer.js ──────────────────────────────────────────
// Shared "Add / Edit Project" drawer used by:
//   - dashboard.html        (Add Project + Edit via ✎ EDIT button)
//   - project-detail.html   (Edit current project)
//
// Requires: config.js, auth.js, api.js
// Injects its own HTML into <body> on first call.
// ────────────────────────────────────────────────────────────────────────────

(function() {

const DRAWER_ID = 'shared-proj-drawer-overlay';

// ── Inject drawer HTML once ──────────────────────────────────────────────────
function ensureDrawer() {
  if (document.getElementById(DRAWER_ID)) return;

  const html = `
<div id="${DRAWER_ID}" class="overlay" onclick="if(event.target===this)ProjectDrawer.close()"
    style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);
      z-index:500;align-items:flex-start;justify-content:flex-end;overflow-y:auto">
  <div style="width:480px;max-width:95vw;background:#181c27;border-left:1px solid rgba(255,255,255,.12);
      min-height:100vh;display:flex;flex-direction:column;font-family:inherit">

    <!-- Header -->
    <div style="display:flex;align-items:flex-start;justify-content:space-between;
        padding:20px 24px 14px;border-bottom:1px solid rgba(255,255,255,.08)">
      <div>
        <div id="pd-title" style="font-family:var(--font-hud,monospace);font-size:16px;
            font-weight:700;letter-spacing:.06em;color:#e8eaf0">ADD PROJECT</div>
        <div id="pd-subtitle" style="font-family:var(--font-mono,monospace);font-size:10px;
            color:#7a8099;margin-top:3px;letter-spacing:.04em">
          Set project title, client &amp; budget</div>
      </div>
      <button onclick="ProjectDrawer.close()"
          style="background:none;border:1px solid rgba(255,255,255,.14);color:#7a8099;
            border-radius:5px;width:28px;height:28px;cursor:pointer;font-size:14px;
            display:flex;align-items:center;justify-content:center">✕</button>
    </div>

    <!-- Body -->
    <div style="flex:1;overflow-y:auto;padding:20px 24px">
      <input type="hidden" id="pd-edit-id" />

      <!-- PROJECT IDENTITY -->
      <div style="font-size:9px;font-weight:700;letter-spacing:.1em;color:#7a8099;
          text-transform:uppercase;margin-bottom:10px;padding-bottom:4px;
          border-bottom:1px solid rgba(255,255,255,.06)">Project identity</div>

      <div style="margin-bottom:14px">
        <label style="display:block;font-size:10px;font-weight:700;letter-spacing:.06em;
            color:#7a8099;text-transform:uppercase;margin-bottom:5px">
          PROJECT NAME <span style="color:#f07a7a">*</span></label>
        <input id="pd-name" type="text" maxlength="120"
            placeholder="e.g. NovaBio — Quality System Implementation"
            style="width:100%;padding:8px 10px;border-radius:5px;
              border:1px solid rgba(255,255,255,.14);background:#1e2436;
              color:#e8eaf0;font-size:12px;font-family:inherit;outline:none">
      </div>

      <div style="margin-bottom:14px">
        <label style="display:block;font-size:10px;font-weight:700;letter-spacing:.06em;
            color:#7a8099;text-transform:uppercase;margin-bottom:5px">Description</label>
        <textarea id="pd-desc" rows="3"
            placeholder="Brief scope summary..."
            style="width:100%;padding:8px 10px;border-radius:5px;resize:vertical;
              border:1px solid rgba(255,255,255,.14);background:#1e2436;
              color:#e8eaf0;font-size:12px;font-family:inherit;outline:none"></textarea>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div>
          <label style="display:block;font-size:10px;font-weight:700;letter-spacing:.06em;
              color:#7a8099;text-transform:uppercase;margin-bottom:5px">
            CLIENT / FIRM <span style="color:#f07a7a">*</span></label>
          <select id="pd-client"
              style="width:100%;padding:8px 10px;border-radius:5px;
                border:1px solid rgba(255,255,255,.14);background:#1e2436;
                color:#e8eaf0;font-size:12px;font-family:inherit;outline:none">
            <option value="">— Select client —</option>
          </select>
        </div>
        <div>
          <label style="display:block;font-size:10px;font-weight:700;letter-spacing:.06em;
              color:#7a8099;text-transform:uppercase;margin-bottom:5px">Phase</label>
          <input id="pd-phase" type="text" placeholder="e.g. Design Verification"
              style="width:100%;padding:8px 10px;border-radius:5px;
                border:1px solid rgba(255,255,255,.14);background:#1e2436;
                color:#e8eaf0;font-size:12px;font-family:inherit;outline:none">
        </div>
      </div>

      <!-- PM -->
      <div style="margin-bottom:14px">
        <label style="display:block;font-size:10px;font-weight:700;letter-spacing:.06em;
            color:#7a8099;text-transform:uppercase;margin-bottom:5px">
          Project Manager</label>
        <select id="pd-pm"
            style="width:100%;padding:8px 10px;border-radius:5px;
              border:1px solid rgba(255,255,255,.14);background:#1e2436;
              color:#e8eaf0;font-size:12px;font-family:inherit;outline:none">
          <option value="">— Select PM —</option>
        </select>
      </div>

      <!-- SCHEDULE -->
      <div style="font-size:9px;font-weight:700;letter-spacing:.1em;color:#7a8099;
          text-transform:uppercase;margin-bottom:10px;margin-top:18px;padding-bottom:4px;
          border-bottom:1px solid rgba(255,255,255,.06)">Schedule</div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div>
          <label style="display:block;font-size:10px;font-weight:700;letter-spacing:.06em;
              color:#7a8099;text-transform:uppercase;margin-bottom:5px">Start date</label>
          <input id="pd-start" type="date"
              style="width:100%;padding:8px 10px;border-radius:5px;
                border:1px solid rgba(255,255,255,.14);background:#1e2436;
                color:#e8eaf0;font-size:12px;font-family:inherit;outline:none">
        </div>
        <div>
          <label style="display:block;font-size:10px;font-weight:700;letter-spacing:.06em;
              color:#7a8099;text-transform:uppercase;margin-bottom:5px">Target date</label>
          <input id="pd-target" type="date"
              style="width:100%;padding:8px 10px;border-radius:5px;
                border:1px solid rgba(255,255,255,.14);background:#1e2436;
                color:#e8eaf0;font-size:12px;font-family:inherit;outline:none">
        </div>
      </div>

      <!-- BUDGET -->
      <div style="font-size:9px;font-weight:700;letter-spacing:.1em;color:#7a8099;
          text-transform:uppercase;margin-bottom:10px;margin-top:18px;padding-bottom:4px;
          border-bottom:1px solid rgba(255,255,255,.06)">Budget</div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div>
          <label style="display:block;font-size:10px;font-weight:700;letter-spacing:.06em;
              color:#7a8099;text-transform:uppercase;margin-bottom:5px">Labor budget (hours)</label>
          <input id="pd-hours" type="number" min="0" placeholder="e.g. 2400"
              style="width:100%;padding:8px 10px;border-radius:5px;
                border:1px solid rgba(255,255,255,.14);background:#1e2436;
                color:#e8eaf0;font-size:12px;font-family:inherit;outline:none">
        </div>
        <div>
          <label style="display:block;font-size:10px;font-weight:700;letter-spacing:.06em;
              color:#7a8099;text-transform:uppercase;margin-bottom:5px">Materials budget ($)</label>
          <input id="pd-materials" type="number" min="0" placeholder="e.g. 50000"
              style="width:100%;padding:8px 10px;border-radius:5px;
                border:1px solid rgba(255,255,255,.14);background:#1e2436;
                color:#e8eaf0;font-size:12px;font-family:inherit;outline:none">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div>
          <label style="display:block;font-size:10px;font-weight:700;letter-spacing:.06em;
              color:#7a8099;text-transform:uppercase;margin-bottom:5px">Expense budget ($)</label>
          <input id="pd-expense" type="number" min="0" placeholder="e.g. 150000"
              style="width:100%;padding:8px 10px;border-radius:5px;
                border:1px solid rgba(255,255,255,.14);background:#1e2436;
                color:#e8eaf0;font-size:12px;font-family:inherit;outline:none">
        </div>
        <div>
          <label style="display:block;font-size:10px;font-weight:700;letter-spacing:.06em;
              color:#7a8099;text-transform:uppercase;margin-bottom:5px">Status</label>
          <select id="pd-status"
              style="width:100%;padding:8px 10px;border-radius:5px;
                border:1px solid rgba(255,255,255,.14);background:#1e2436;
                color:#e8eaf0;font-size:12px;font-family:inherit;outline:none">
            <option value="active">Active</option>
            <option value="planning">Planning</option>
            <option value="on_hold">On Hold</option>
            <option value="complete">Complete</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <!-- Error -->
      <div id="pd-error" style="font-size:11px;color:#f07a7a;min-height:16px;
          font-family:var(--font-mono,monospace)"></div>
    </div>

    <!-- Footer -->
    <div style="display:flex;gap:10px;padding:14px 24px;
        border-top:1px solid rgba(255,255,255,.08)">
      <button id="pd-save-btn" onclick="ProjectDrawer.save()"
          style="flex:1;padding:10px;background:rgba(0,210,255,.1);
            border:1px solid rgba(0,210,255,.4);color:#00d2ff;
            font-family:var(--font-mono,monospace);font-size:11px;
            letter-spacing:.1em;cursor:pointer;border-radius:4px;
            transition:background .15s">CREATE PROJECT →</button>
      <button onclick="ProjectDrawer.close()"
          style="padding:10px 20px;background:none;
            border:1px solid rgba(255,255,255,.12);color:#7a8099;
            font-family:var(--font-mono,monospace);font-size:11px;
            letter-spacing:.1em;cursor:pointer;border-radius:4px">CANCEL</button>
    </div>
  </div>
</div>`;

  document.body.insertAdjacentHTML('beforeend', html);
}

// ── State ─────────────────────────────────────────────────────────────────────
let _firms       = [];
let _pmResources = [];
let _internalId  = null;
let _onSave      = null;  // callback after successful save

// ── Load reference data ───────────────────────────────────────────────────────
async function loadRefData() {
  if (!_firms.length) {
    _firms      = await API.getFirms().catch(() => []);
    _internalId = _firms.find(f => f.is_internal)?.id || null;
  }
  if (!_pmResources.length) {
    // PM/PGM roles only
    const pmRoles = await API.get(
      'hud_roles?is_active=eq.true&select=id&or=(abbreviation.eq.PM,abbreviation.eq.PGM,name.ilike.*Project Manager*,name.ilike.*Program Manager*)'
    ).catch(() => []);
    const ids = pmRoles.map(r => r.id);
    if (ids.length) {
      _pmResources = await API.get(
        `resources?is_active=eq.true&hud_role_id=in.(${ids.join(',')})&order=last_name&select=id,first_name,last_name,title`
      ).catch(() => []);
    }
    if (!_pmResources.length) {
      _pmResources = await API.get(
        'resources?is_active=eq.true&order=last_name&select=id,first_name,last_name,title'
      ).catch(() => []);
    }
  }

  // Populate client dropdown
  document.getElementById('pd-client').innerHTML =
    '<option value="">— Select client —</option>' +
    _firms.filter(f => !f.is_internal)
      .sort((a,b) => a.name.localeCompare(b.name))
      .map(f => `<option value="${f.id}">${f.name}</option>`)
      .join('');

  // Populate PM dropdown
  document.getElementById('pd-pm').innerHTML =
    '<option value="">— Select PM —</option>' +
    _pmResources.map(r =>
      `<option value="${r.id}">${r.first_name} ${r.last_name}${r.title ? ' · ' + r.title : ''}</option>`
    ).join('');
}

// ── Open in ADD mode ──────────────────────────────────────────────────────────
async function openAdd(callback) {
  ensureDrawer();
  _onSave = callback || null;
  await loadRefData();

  document.getElementById('pd-title').textContent    = 'ADD PROJECT';
  document.getElementById('pd-subtitle').textContent = 'Set project title, client & budget';
  document.getElementById('pd-save-btn').textContent = 'CREATE PROJECT →';
  document.getElementById('pd-edit-id').value        = '';
  document.getElementById('pd-error').textContent    = '';
  document.getElementById('pd-save-btn').disabled    = false;

  // Default start = today
  document.getElementById('pd-start').value = new Date().toLocaleDateString('en-CA');

  // Clear all fields
  ['pd-name','pd-desc','pd-phase','pd-target','pd-hours',
   'pd-materials','pd-expense'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('pd-client').value = '';
  document.getElementById('pd-pm').value     = '';
  document.getElementById('pd-status').value = 'active';

  show();
  setTimeout(() => document.getElementById('pd-name').focus(), 100);
}

// ── Open in EDIT mode ─────────────────────────────────────────────────────────
async function openEdit(projId, callback) {
  ensureDrawer();
  _onSave = callback || null;
  await loadRefData();

  document.getElementById('pd-title').textContent    = 'EDIT PROJECT';
  document.getElementById('pd-subtitle').textContent = 'Update project title, client & description';
  document.getElementById('pd-save-btn').textContent = 'SAVE CHANGES →';
  document.getElementById('pd-edit-id').value        = projId;
  document.getElementById('pd-error').textContent    = '';
  document.getElementById('pd-save-btn').disabled    = false;

  show();

  try {
    const rows = await API.get(`projects?id=eq.${projId}&select=*`);
    const proj = rows?.[0];
    if (!proj) throw new Error('Project not found');

    document.getElementById('pd-name').value      = proj.name                   || '';
    document.getElementById('pd-desc').value      = proj.description            || '';
    document.getElementById('pd-phase').value     = proj.phase                  || '';
    document.getElementById('pd-start').value     = proj.start_date             || '';
    document.getElementById('pd-target').value    = proj.target_date            || '';
    document.getElementById('pd-hours').value     = proj.budget_baseline_hours  || '';
    document.getElementById('pd-materials').value = proj.materials_budget       || '';
    document.getElementById('pd-expense').value   = proj.expense_budget_baseline|| '';
    document.getElementById('pd-status').value    = proj.status                 || 'active';
    document.getElementById('pd-pm').value        = proj.pm_resource_id         || '';
    setTimeout(() => {
      document.getElementById('pd-client').value = proj.client_id || '';
    }, 50);
  } catch(e) {
    document.getElementById('pd-error').textContent = 'Failed to load: ' + e.message;
  }
}

// ── Save ──────────────────────────────────────────────────────────────────────
async function save() {
  const editId   = document.getElementById('pd-edit-id').value;
  const isEdit   = !!editId;
  const name     = document.getElementById('pd-name').value.trim();
  const clientId = document.getElementById('pd-client').value;
  const errEl    = document.getElementById('pd-error');
  const saveBtn  = document.getElementById('pd-save-btn');

  errEl.textContent = '';

  if (!name) {
    errEl.textContent = 'Project name is required.';
    document.getElementById('pd-name').focus();
    return;
  }
  if (!isEdit && !clientId) {
    errEl.textContent = 'Please select a client firm.';
    document.getElementById('pd-client').focus();
    return;
  }

  const hours     = parseFloat(document.getElementById('pd-hours').value)     || null;
  const materials = parseFloat(document.getElementById('pd-materials').value) || null;
  const expense   = parseFloat(document.getElementById('pd-expense').value)   || null;
  const pmId      = document.getElementById('pd-pm').value                    || null;

  const payload = {
    name,
    description:             document.getElementById('pd-desc').value.trim()    || null,
    phase:                   document.getElementById('pd-phase').value.trim()   || null,
    status:                  document.getElementById('pd-status').value,
    start_date:              document.getElementById('pd-start').value          || null,
    target_date:             document.getElementById('pd-target').value         || null,
    budget_baseline_hours:   hours,
    current_budget_hours:    hours,
    materials_budget:        materials,
    expense_budget_baseline: expense,
    current_expense_budget:  expense,
    budget_baseline_locked:  false,
    pm_resource_id:          pmId,
  };

  if (!isEdit) {
    payload.firm_id   = _internalId || null;
    payload.client_id = clientId;
  }

  saveBtn.textContent = isEdit ? 'SAVING...' : 'CREATING...';
  saveBtn.disabled    = true;

  try {
    let resultId = editId;
    if (isEdit) {
      await API.patch(`projects?id=eq.${editId}`, payload);
    } else {
      const result  = await API.post('projects', payload);
      const created = Array.isArray(result) ? result[0] : result;
      if (!created?.id) throw new Error('No project returned from server.');
      resultId = created.id;
    }

    close();

    if (_onSave) {
      _onSave(resultId, isEdit);
    } else if (!isEdit) {
      window.location.href = `/project-detail.html?id=${resultId}`;
    } else if (typeof loadDashboard === 'function') {
      loadDashboard();
    } else if (typeof loadProjectDetail === 'function') {
      loadProjectDetail();
    }
  } catch(e) {
    errEl.textContent    = 'Save failed: ' + (e.message || 'Unknown error');
    saveBtn.textContent  = isEdit ? 'SAVE CHANGES →' : 'CREATE PROJECT →';
    saveBtn.disabled     = false;
  }
}

// ── Show / Close ──────────────────────────────────────────────────────────────
function show() {
  const el = document.getElementById(DRAWER_ID);
  if (el) { el.style.display = 'flex'; el.scrollTop = 0; }
}

function close() {
  const el = document.getElementById(DRAWER_ID);
  if (el) el.style.display = 'none';
}

// ── Keyboard close ────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') close();
});

// ── Public API ────────────────────────────────────────────────────────────────
window.ProjectDrawer = { openAdd, openEdit, save, close };

})();