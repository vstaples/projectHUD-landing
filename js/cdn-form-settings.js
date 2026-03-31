// cdn-form-settings.js — Form Library Settings tab
// Manages form_categories, global version format, and lifecycle role assignments
// LOAD ORDER: after cdn-core-state.js, cdn-utils.js
// VERSION: 20260331-050000
console.log('[cdn-form-settings] LOADED v20260331-050000');

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────
let _fsCats        = [];   // form_categories array
let _fsEditingId   = null; // category being edited (null = new)

const FIRM_ID_FS   = () => window.FIRM_ID || 'aaaaaaaa-0001-0001-0001-000000000001';
const VER_FORMATS  = {
  semver:     { label: 'Semantic (1.0.0)',  example: '1.0.0 → 1.1.0 → 2.0.0' },
  rev_letter: { label: 'Rev Letter (Rev A)',example: 'Rev A → Rev B → Rev C'  },
  integer:    { label: 'Integer (v1)',      example: 'v1 → v2 → v3'           },
};

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT — called by switchTab('form-settings')
// ─────────────────────────────────────────────────────────────────────────────
async function renderFormSettingsTab(el) {
  el.innerHTML = _fsShell();
  await _fsLoad();
  _fsRender();
}

function _fsShell() {
  return `
    <div style="display:flex;height:100%;overflow:hidden;background:var(--bg)">

      <!-- Left: category list -->
      <div style="width:280px;min-width:220px;border-right:1px solid var(--border);
                  display:flex;flex-direction:column;background:var(--bg1);flex-shrink:0">
        <div style="padding:10px 16px;border-bottom:1px solid var(--border);
                    display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
          <span style="font-size:14px;font-weight:600;color:var(--text);font-family:Arial,sans-serif">
            Categories
          </span>
          <button class="btn btn-cad btn-sm" onclick="_fsNewCategory()"
            style="font-size:14px;padding:4px 12px">+ New</button>
        </div>
        <div id="fs-cat-list" style="flex:1;overflow-y:auto;padding:6px 0">
          <div style="padding:20px;text-align:center;color:var(--muted);font-size:14px;font-family:Arial,sans-serif">
            Loading…
          </div>
        </div>
      </div>

      <!-- Right: editor panel -->
      <div id="fs-editor-panel" style="flex:1;overflow-y:auto;padding:28px;min-width:0">
        <div style="padding:60px;text-align:center;color:var(--muted);font-size:14px;font-family:Arial,sans-serif">
          Select a category to edit, or create a new one.
        </div>
      </div>

    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOAD
// ─────────────────────────────────────────────────────────────────────────────
async function _fsLoad() {
  try {
    _fsCats = await API.get(
      `form_categories?firm_id=eq.${FIRM_ID_FS()}&order=name.asc`
    ).catch(() => []) || [];

    // Resolve all reviewer/approver UUIDs to names in one batch query
    const allIds = [...new Set(_fsCats.flatMap(c => [
      ...(c.reviewer_ids||[]), ...(c.approver_id?[c.approver_id]:[])
    ]))].filter(Boolean);

    if (allIds.length) {
      const rows = await API.get(
        `resources?id=in.(${allIds.join(',')})&select=id,first_name,last_name`
      ).catch(()=>[]) || [];
      const nameMap = Object.fromEntries(rows.map(r => [
        r.id, ((r.first_name||'')+' '+(r.last_name||'')).trim() || r.id
      ]));
      _fsCats.forEach(cat => {
        cat._reviewerNames = cat._reviewerNames || {};
        (cat.reviewer_ids||[]).forEach(id => {
          if (nameMap[id]) cat._reviewerNames[id] = nameMap[id];
        });
        if (cat.approver_id && nameMap[cat.approver_id]) {
          cat._approverName = nameMap[cat.approver_id];
        }
      });
    }
  } catch(e) { _fsCats = []; }
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────────────────────────────────────
function _fsRender() {
  const listEl = document.getElementById('fs-cat-list');
  if (listEl) listEl.innerHTML = _fsCatListHtml();
  if (_fsEditingId !== null) _fsRenderEditor(_fsEditingId);
}

function _fsCatListHtml() {
  if (!_fsCats.length) return `
    <div style="padding:20px 14px;text-align:center;font-size:14px;color:var(--muted);
                line-height:1.8;font-family:Arial,sans-serif">
      No categories yet.<br/>Create one to enable<br/>controlled document routing.
    </div>`;

  return _fsCats.map(cat => {
    const sel = _fsEditingId === cat.id;
    const rCount = (cat.reviewer_ids||[]).length;
    return `
      <div onclick="_fsRenderEditor('${cat.id}')"
        style="padding:12px 16px;cursor:pointer;
               border-left:3px solid ${sel?'var(--cad)':'transparent'};
               background:${sel?'var(--surf3)':'transparent'};transition:background .1s">
        <div style="font-size:15px;font-weight:500;color:${sel?'var(--text)':'var(--text1)'};
                    font-family:Arial,sans-serif">${escHtml(cat.name)}</div>
        <div style="font-size:14px;color:var(--muted);margin-top:3px;font-family:Arial,sans-serif">
          ${VER_FORMATS[cat.version_format]?.label || cat.version_format}
          · ${rCount} reviewer${rCount!==1?'s':''}
          ${cat.approver_id?'· approver set':'· <span style="color:var(--amber)">no approver</span>'}
        </div>
      </div>`;
  }).join('');
}

function _fsRenderEditor(catId) {
  _fsEditingId = catId;
  const listEl = document.getElementById('fs-cat-list');
  if (listEl) listEl.innerHTML = _fsCatListHtml();

  const panel = document.getElementById('fs-editor-panel');
  if (!panel) return;

  const cat = catId === 'new'
    ? { id:'new', name:'', description:'', reviewer_ids:[], approver_id:null, version_format:'semver' }
    : _fsCats.find(c => c.id === catId);
  if (!cat) return;

  const verOpts = Object.entries(VER_FORMATS).map(([k,v]) =>
    `<option value="${k}" ${cat.version_format===k?'selected':''}>${v.label}</option>`
  ).join('');

  const reviewerNames = (cat.reviewer_ids||[]).map((id,i) => {
    const name = cat._reviewerNames?.[id] || id;
    const ini  = name.split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;
                 background:var(--surf2);border:1px solid var(--border);
                 border-radius:4px;margin-bottom:6px">
      <div style="width:28px;height:28px;border-radius:50%;background:var(--accent);
                  display:flex;align-items:center;justify-content:center;
                  font-size:11px;font-weight:700;color:white;flex-shrink:0">${ini}</div>
      <span style="flex:1;font-size:14px;color:var(--text1);font-family:Arial,sans-serif">${name}</span>
      <button onclick="_fsRemoveReviewer('${catId}','${id}')"
        style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;padding:0">✕</button>
    </div>`;
  }).join('');

  panel.innerHTML = `
    <div style="max-width:540px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <div style="font-size:18px;font-weight:600;color:var(--text);font-family:Arial,sans-serif">
          ${catId==='new'?'New Category':escHtml(cat.name)}
        </div>
        ${catId!=='new'?`<button onclick="_fsDeleteCategory('${cat.id}')"
          style="font-size:14px;background:none;border:1px solid var(--red);color:var(--red);
                 border-radius:4px;padding:3px 10px;cursor:pointer;font-family:Arial,sans-serif">
          Delete
        </button>`:''}
      </div>

      <!-- Name -->
      <div style="margin-bottom:14px">
        <label style="font-size:15px;font-weight:600;color:var(--text2);display:block;margin-bottom:6px;
                      font-family:Arial,sans-serif">Category Name *</label>
        <input id="fs-cat-name" class="config-input" value="${escHtml(cat.name)}"
          placeholder="e.g. Engineering, HR, Purchasing"
          style="font-size:15px;font-family:Arial,sans-serif;width:100%"/>
      </div>

      <!-- Description -->
      <div style="margin-bottom:14px">
        <label style="font-size:14px;color:var(--muted);display:block;margin-bottom:4px;
                      font-family:Arial,sans-serif">Description</label>
        <input id="fs-cat-desc" class="config-input" value="${escHtml(cat.description||'')}"
          placeholder="Brief description of forms in this category"
          style="font-size:15px;font-family:Arial,sans-serif;width:100%"/>
      </div>

      <!-- Version Format -->
      <div style="margin-bottom:14px">
        <label style="font-size:14px;color:var(--muted);display:block;margin-bottom:4px;
                      font-family:Arial,sans-serif">Version Format</label>
        <select id="fs-cat-ver" class="config-select"
          style="font-size:15px;font-family:Arial,sans-serif;width:100%"
          onchange="_fsVerFormatChange(this.value)">
          ${verOpts}
        </select>
        <div id="fs-ver-example"
          style="font-size:14px;color:var(--muted);margin-top:4px;font-family:Arial,sans-serif">
          ${VER_FORMATS[cat.version_format]?.example||''}
        </div>
      </div>

      <!-- Reviewers -->
      <div style="margin-bottom:14px">
        <label style="font-size:14px;color:var(--muted);display:block;margin-bottom:6px;
                      font-family:Arial,sans-serif">
          Reviewers <span style="color:var(--text3)">(all must approve)</span>
        </label>
        <div id="fs-reviewer-list">${reviewerNames||'<div style="font-size:14px;color:var(--muted);font-family:Arial,sans-serif;padding:4px 0">No reviewers assigned</div>'}</div>
        <button onclick="_fsAddReviewer('${catId}',this)"
          style="margin-top:6px;font-size:14px;padding:4px 12px;background:var(--surf2);
                 border:1px solid var(--border);border-radius:4px;cursor:pointer;
                 color:var(--text2);font-family:Arial,sans-serif">
          + Add Reviewer
        </button>
      </div>

      <!-- Approver -->
      <div style="margin-bottom:20px">
        <label style="font-size:14px;color:var(--muted);display:block;margin-bottom:6px;
                      font-family:Arial,sans-serif">Approver (single)</label>
        <div style="display:flex;align-items:center;gap:8px">
          <div id="fs-approver-display"
            style="flex:1;font-size:15px;color:${cat.approver_id?'var(--text1)':'var(--muted)'};
                   font-family:Arial,sans-serif;padding:5px 8px;background:var(--surf2);
                   border:1px solid var(--border);border-radius:4px;min-height:32px">
            ${cat.approver_id ? (()=>{
              const n = cat._approverName||cat.approver_id;
              const ini = n.split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
              return '<div style="display:flex;align-items:center;gap:8px"><div style=\"width:28px;height:28px;border-radius:50%;background:var(--cad);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:white;flex-shrink:0\">'+ini+'</div><span style=\"font-size:14px;font-family:Arial,sans-serif\">'+n+'</span></div>';
            })() : '<span style=\"font-size:14px;font-family:Arial,sans-serif;color:var(--muted)\">No approver assigned</span>'}
          </div>
          <button onclick="_fsPickApprover('${catId}',this)"
            style="font-size:14px;padding:4px 12px;background:var(--surf2);
                   border:1px solid var(--border);border-radius:4px;cursor:pointer;
                   color:var(--text2);font-family:Arial,sans-serif;flex-shrink:0">
            ${cat.approver_id ? 'Change' : 'Assign'}
          </button>
          ${cat.approver_id?`<button onclick="_fsClearApprover('${catId}')"
            style="font-size:14px;padding:4px 8px;background:none;border:1px solid var(--border);
                   border-radius:4px;cursor:pointer;color:var(--muted);font-family:Arial,sans-serif">✕</button>`:''}
        </div>
      </div>

      <!-- Save -->
      <div style="display:flex;gap:10px">
        <button onclick="_fsSaveCategory('${catId}')"
          style="padding:8px 28px;border-radius:999px;background:var(--cad);color:var(--bg);
                 border:none;cursor:pointer;font-size:15px;font-weight:600;
                 font-family:Arial,sans-serif">
          ${catId==='new'?'Create':'Save'}
        </button>
        <button onclick="_fsCancelEdit()"
          style="padding:8px 20px;border-radius:999px;background:transparent;
                 border:1px solid var(--border);color:var(--muted);cursor:pointer;
                 font-size:15px;font-family:Arial,sans-serif">
          Cancel
        </button>
      </div>
    </div>`;

  // Resolve reviewer/approver UUIDs to names if PersonPicker available
  _fsResolveNames(cat);
}

// ─────────────────────────────────────────────────────────────────────────────
// RESOLVE NAMES (PersonPicker may expose a lookup)
// ─────────────────────────────────────────────────────────────────────────────
async function _fsResolveNames(cat) {
  // PersonPicker already provides names via _reviewerNames / _approverName caches.
  // If loading from DB (names not yet cached), try resources table fallback.
  const needsResolve = (cat.reviewer_ids||[]).some(id => !cat._reviewerNames?.[id])
    || (cat.approver_id && !cat._approverName);
  if (!needsResolve) return;

  const allIds = [...(cat.reviewer_ids||[]), ...(cat.approver_id?[cat.approver_id]:[])];
  if (!allIds.length) return;

  try {
    // Use resources table (not persons — that table doesn't exist in this app)
    const rows = await API.get(
      `resources?id=in.(${allIds.join(',')})&select=id,first_name,last_name`
    ).catch(()=>[]) || [];
    const nameMap = Object.fromEntries(rows.map(r=>[
      r.id,
      ((r.first_name||'')+' '+(r.last_name||'')).trim() || r.id
    ]));
    cat._reviewerNames = cat._reviewerNames || {};
    (cat.reviewer_ids||[]).forEach(id => {
      if (nameMap[id]) cat._reviewerNames[id] = nameMap[id];
    });
    if (cat.approver_id && nameMap[cat.approver_id]) {
      cat._approverName = nameMap[cat.approver_id];
    }
    // Re-render to show resolved names
    if (Object.keys(nameMap).length) _fsRenderEditor(cat.id || 'new');
  } catch(e) { /* names stay as UUIDs */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────
function _fsNewCategory() {
  _fsEditingId = 'new';
  _fsRenderEditor('new');
}

function _fsCancelEdit() {
  _fsEditingId = null;
  const panel = document.getElementById('fs-editor-panel');
  if (panel) panel.innerHTML = `
    <div style="padding:60px;text-align:center;color:var(--muted);font-size:15px;font-family:Arial,sans-serif">
      Select a category to edit, or create a new one.
    </div>`;
  const listEl = document.getElementById('fs-cat-list');
  if (listEl) listEl.innerHTML = _fsCatListHtml();
}

async function _fsSaveCategory(catId) {
  const name = document.getElementById('fs-cat-name')?.value?.trim();
  if (!name) { cadToast('Category name is required', 'error'); return; }
  const desc   = document.getElementById('fs-cat-desc')?.value?.trim() || '';
  const verFmt = document.getElementById('fs-cat-ver')?.value || 'semver';

  const cat = catId === 'new'
    ? { id:'new', reviewer_ids:[], approver_id:null }
    : _fsCats.find(c => c.id === catId) || { reviewer_ids:[], approver_id:null };

  const payload = {
    firm_id:        FIRM_ID_FS(),
    name,
    description:    desc,
    version_format: verFmt,
    reviewer_ids:   cat.reviewer_ids || [],
    approver_id:    cat.approver_id  || null,
    updated_at:     new Date().toISOString(),
  };

  try {
    if (catId === 'new') {
      const rows = await API.post('form_categories', payload);
      if (rows?.[0]) { _fsCats.push(rows[0]); _fsEditingId = rows[0].id; }
      cadToast(`Category "${name}" created`, 'success');
    } else {
      await API.patch(`form_categories?id=eq.${catId}`, payload);
      const idx = _fsCats.findIndex(c => c.id === catId);
      if (idx >= 0) _fsCats[idx] = { ..._fsCats[idx], ...payload };
      cadToast(`Category "${name}" saved`, 'success');
    }
    _fsRender();
  } catch(e) { cadToast('Save failed: ' + e.message, 'error'); }
}

async function _fsDeleteCategory(catId) {
  const cat = _fsCats.find(c => c.id === catId);
  if (!confirm(`Delete category "${cat?.name}"? Forms using it will become uncategorised.`)) return;
  try {
    await API.delete?.(`form_categories?id=eq.${catId}`) ||
          await fetch(`${window.SUPABASE_URL||SUPA_URL}/rest/v1/form_categories?id=eq.${catId}`,{
            method:'DELETE', headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+await Auth.getToken()}
          });
    _fsCats = _fsCats.filter(c => c.id !== catId);
    _fsEditingId = null;
    _fsRender();
    cadToast('Category deleted', 'info');
  } catch(e) { cadToast('Delete failed: ' + e.message, 'error'); }
}

// ─────────────────────────────────────────────────────────────────────────────
// REVIEWER / APPROVER PICKERS
// ─────────────────────────────────────────────────────────────────────────────
function _fsAddReviewer(catId, anchorEl) {
  // anchorEl required — PersonPicker.show(anchorEl, onSelect, options)
  const cat = catId === 'new'
    ? { id:'new', reviewer_ids:[], approver_id:null, version_format:'semver' }
    : _fsCats.find(c => c.id === catId);
  if (!cat) return;
  if (window.PersonPicker?.show) {
    window.PersonPicker.show(anchorEl, function(person) {
      if (!person?.id) return;
      if (!(cat.reviewer_ids||[]).includes(person.id)) {
        cat.reviewer_ids = [...(cat.reviewer_ids||[]), person.id];
        cat._reviewerNames = cat._reviewerNames || {};
        cat._reviewerNames[person.id] = person.name;
      }
      _fsRenderEditor(catId);
    });
  } else {
    const id = prompt('Enter reviewer user ID:');
    if (id?.trim()) { cat.reviewer_ids = [...new Set([...(cat.reviewer_ids||[]),id.trim()])]; _fsRenderEditor(catId); }
  }
}

function _fsRemoveReviewer(catId, userId) {
  const cat = _fsCats.find(c => c.id === catId);
  if (!cat) return;
  cat.reviewer_ids = (cat.reviewer_ids||[]).filter(id => id !== userId);
  _fsRenderEditor(catId);
}

function _fsPickApprover(catId, anchorEl) {
  const cat = catId === 'new'
    ? { id:'new', reviewer_ids:[], approver_id:null, version_format:'semver' }
    : _fsCats.find(c => c.id === catId);
  if (!cat) return;
  if (window.PersonPicker?.show) {
    window.PersonPicker.show(anchorEl, function(person) {
      cat.approver_id = person.id;
      cat._approverName = person.name;
      _fsRenderEditor(catId);
    });
  } else {
    const id = prompt('Enter approver user ID:');
    if (id?.trim()) { cat.approver_id = id.trim(); _fsRenderEditor(catId); }
  }
}

function _fsClearApprover(catId) {
  const cat = _fsCats.find(c => c.id === catId);
  if (cat) { cat.approver_id = null; _fsRenderEditor(catId); }
}

function _fsVerFormatChange(val) {
  const ex = document.getElementById('fs-ver-example');
  if (ex) ex.textContent = VER_FORMATS[val]?.example || '';
}

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL ACCESSOR — used by cdn-form-editor.js
// ─────────────────────────────────────────────────────────────────────────────
window.FormSettings = {
  getCategories: () => _fsCats,
  loadCategories: _fsLoad,
  getCategoryById: id => _fsCats.find(c => c.id === id),
};

// Patch switchTab to intercept form-settings tab only
// IMPORTANT: must call through for ALL other tabs so renderFormsTab etc. stay reachable
const _origSwitchTabFS = typeof switchTab === 'function' ? switchTab : null;
if (_origSwitchTabFS) {
  window.switchTab = function(tab) {
    if (tab === 'form-settings') {
      // Handle nav highlight ourselves then render settings
      document.querySelectorAll('.subnav-item').forEach(el => el.classList.remove('active'));
      const tabEl = document.getElementById('tab-form-settings');
      if (tabEl) tabEl.classList.add('active');
      const content = document.getElementById('cad-content');
      if (content) renderFormSettingsTab(content);
      return; // do NOT call through — core-state doesn't know this tab
    }
    _origSwitchTabFS(tab); // all other tabs handled normally
  };
}