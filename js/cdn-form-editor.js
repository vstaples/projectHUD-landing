// cdn-form-editor.js — Cadence: Form Library tab
// Renders the Forms tab: document list, form editor canvas, field list, routing panel
// LOAD ORDER: after cdn-core-state.js
// ─────────────────────────────────────────────────────────────────────────────
//
// STATE (all module-scoped)
//   _formDefs         — array of form definitions for this firm/template
//   _selectedForm     — the form definition currently open in the editor
//   _formFields       — working copy of fields for the open form
//   _formRouting      — { mode: 'serial'|'parallel', roles: [{role,label,order}] }
//   _formDragField    — field being dragged in the routing list
//   _formDragRole     — role row being dragged (serial reorder)
//   _pdfDoc           — PDF.js document handle for the loaded source
//   _pdfPage          — current page number (1-based)
//   _pdfTotalPages    — total page count
//   _pdfScale         — render scale (1.5 default)
//   _drawingRect      — { startX, startY, active } for manual field draw
//
// ─────────────────────────────────────────────────────────────────────────────

let _formDefs        = [];
let _selectedForm    = null;
let _formFields      = [];
let _formRouting     = { mode: 'serial', roles: [] };
let _formDragField   = null;
let _formDragRole    = null;
let _pdfDoc          = null;
let _pdfPage         = 1;
let _pdfTotalPages   = 1;
let _pdfScale        = 1.5;
let _drawingRect     = null;

// ── Role vocabulary ──────────────────────────────────────────────────────────
// Maps field.role values to display labels and colours
const FORM_ROLES = {
  assignee: { label: 'Assignee',  color: '#4f8ef7', dim: 'rgba(79,142,247,.15)' },
  reviewer: { label: 'Reviewer',  color: '#c47d18', dim: 'rgba(196,125,24,.15)' },
  pm:       { label: 'PM',        color: '#2a9d40', dim: 'rgba(42,157,64,.15)'  },
  external: { label: 'External',  color: '#7c4dff', dim: 'rgba(124,77,255,.15)' },
};

const FIELD_TYPES = ['text', 'date', 'number', 'checkbox', 'signature', 'textarea'];

// ─────────────────────────────────────────────────────────────────────────────
// TAB ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

function renderFormsTab(el) {
  el.innerHTML = `
    <div style="display:flex;height:100%;overflow:hidden">

      <!-- ── Left column: form list ───────────────────────────────── -->
      <div style="width:220px;min-width:220px;border-right:1px solid var(--border);
                  display:flex;flex-direction:column;background:var(--bg1)">
        <div style="padding:10px 14px;border-bottom:1px solid var(--border);
                    display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
          <span style="font-size:9px;font-weight:600;letter-spacing:.14em;
                       text-transform:uppercase;color:var(--muted)">Form Library</span>
          <button class="btn btn-cad btn-sm" onclick="_formUploadClick()"
            style="font-size:10px;padding:3px 9px">↑ Import</button>
        </div>
        <div id="form-list" style="flex:1;overflow-y:auto;padding:6px 0">
          ${_renderFormList()}
        </div>
        <!-- Hidden file input -->
        <input type="file" id="form-file-input" accept=".pdf,.doc,.docx"
          style="display:none" onchange="_formFileChosen(event)"/>
      </div>

      <!-- ── Main area: editor or empty state ─────────────────────── -->
      <div id="form-editor-main" style="flex:1;display:flex;overflow:hidden">
        ${_selectedForm ? _renderFormEditor() : _renderFormEmpty()}
      </div>

    </div>`;

  if (_selectedForm && _pdfDoc) {
    requestAnimationFrame(() => _renderPdfPage(_pdfPage));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FORM LIST
// ─────────────────────────────────────────────────────────────────────────────

function _renderFormList() {
  if (!_formDefs.length) {
    return `<div style="padding:24px 14px;text-align:center;font-size:11px;
                        color:var(--muted);line-height:1.8">
              No forms yet.<br/>Import a PDF or Word document<br/>to create a fillable form.
            </div>`;
  }
  return _formDefs.map(f => {
    const sel = _selectedForm?.id === f.id;
    const fieldCount = (f.fields || []).length;
    return `
      <div onclick="_formSelect('${f.id}')"
        style="padding:9px 14px;cursor:pointer;border-left:2px solid ${sel ? 'var(--cad)' : 'transparent'};
               background:${sel ? 'var(--surf3)' : 'transparent'};transition:background .1s">
        <div style="font-size:12px;font-weight:500;color:${sel ? 'var(--text)' : 'var(--text1)'};
                    white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${escHtml(f.source_name || 'Untitled form')}
        </div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px;display:flex;gap:8px">
          <span>${fieldCount} field${fieldCount !== 1 ? 's' : ''}</span>
          <span>${f.page_count || '?'} page${(f.page_count || 1) !== 1 ? 's' : ''}</span>
          ${_routingBadge(f)}
        </div>
      </div>`;
  }).join('');
}

function _routingBadge(form) {
  const mode = form.routing?.mode || 'serial';
  return `<span style="color:${mode === 'parallel' ? 'var(--accent)' : 'var(--amber)'};font-size:9px">
    ${mode === 'parallel' ? '⇉ parallel' : '↓ serial'}
  </span>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPTY STATE
// ─────────────────────────────────────────────────────────────────────────────

function _renderFormEmpty() {
  return `
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;
                justify-content:center;gap:14px;color:var(--muted)">
      <div style="font-size:48px;opacity:.12">📄</div>
      <div style="font-size:13px;font-weight:500;color:var(--text2)">No form selected</div>
      <div style="font-size:11px;max-width:280px;text-align:center;line-height:1.7">
        Import a PDF or Word document — CadenceHUD will detect fields automatically.
        You can then add, edit, and assign roles to each field.
      </div>
      <button class="btn btn-cad" onclick="_formUploadClick()"
        style="margin-top:4px">↑ Import Document</button>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// FORM EDITOR — three-column layout
// ─────────────────────────────────────────────────────────────────────────────

function _renderFormEditor() {
  const f = _selectedForm;
  const totalFields = (_formFields || []).length;
  const roles = _deriveRoles(_formFields);

  return `
    <div style="flex:1;display:flex;flex-direction:column;overflow:hidden">

      <!-- ── Editor toolbar ─────────────────────────────────────────── -->
      <div style="display:flex;align-items:center;gap:10px;padding:8px 14px;
                  border-bottom:1px solid var(--border);flex-shrink:0;background:var(--bg2)">
        <span style="font-size:13px;font-weight:500;color:var(--text);
                     flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          ${escHtml(f.source_name || 'Untitled')}
        </span>
        <!-- Page navigation -->
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
          <button onclick="_formPrevPage()" class="btn btn-ghost btn-sm"
            style="padding:3px 8px" ${_pdfPage <= 1 ? 'disabled' : ''}>‹</button>
          <span id="form-page-indicator"
            style="font-size:10px;color:var(--muted);white-space:nowrap;font-family:var(--font-mono)">
            ${_pdfPage} / ${_pdfTotalPages}
          </span>
          <button onclick="_formNextPage()" class="btn btn-ghost btn-sm"
            style="padding:3px 8px" ${_pdfPage >= _pdfTotalPages ? 'disabled' : ''}>›</button>
        </div>
        <div style="width:1px;height:18px;background:var(--border);flex-shrink:0"></div>
        <!-- Zoom -->
        <button onclick="_formZoomOut()" class="btn btn-ghost btn-sm"
          style="padding:3px 8px">−</button>
        <button onclick="_formZoomIn()"  class="btn btn-ghost btn-sm"
          style="padding:3px 8px">+</button>
        <div style="width:1px;height:18px;background:var(--border);flex-shrink:0"></div>
        <button class="btn btn-ghost btn-sm" onclick="_formDelete('${f.id}')"
          style="color:var(--red);font-size:10px">🗑 Remove</button>
        <button class="btn btn-solid btn-sm" onclick="_formSave()"
          style="font-size:10px">Save</button>
      </div>

      <!-- ── Three-column body ────────────────────────────────────── -->
      <div style="flex:1;display:flex;overflow:hidden;min-height:0">

        <!-- Column 1: Document canvas -->
        <div style="flex:1;overflow:auto;background:var(--bg);position:relative;min-width:0"
          id="form-canvas-wrap">
          <div style="display:inline-block;position:relative;margin:20px">
            <canvas id="form-pdf-canvas" style="display:block;box-shadow:0 4px 24px rgba(0,0,0,.5)"></canvas>
            <!-- SVG overlay for field rectangles -->
            <svg id="form-field-overlay" style="position:absolute;top:0;left:0;
              pointer-events:none;overflow:visible"
              width="100%" height="100%">
            </svg>
            <!-- Draw interaction layer -->
            <div id="form-draw-layer" style="position:absolute;top:0;left:0;
              width:100%;height:100%;cursor:crosshair"
              onmousedown="_formDrawStart(event)"
              onmousemove="_formDrawMove(event)"
              onmouseup="_formDrawEnd(event)">
            </div>
          </div>
          <div style="padding:6px 20px 4px;font-size:10px;color:var(--muted);
                      display:flex;align-items:center;gap:8px;flex-shrink:0">
            <span>✎ Click and drag on the document to add a field</span>
          </div>
        </div>

        <!-- Column 2: Field list -->
        <div style="width:240px;min-width:240px;border-left:1px solid var(--border);
                    display:flex;flex-direction:column;background:var(--bg1)">
          <div style="padding:10px 14px;border-bottom:1px solid var(--border);
                      display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
            <span style="font-size:9px;font-weight:600;letter-spacing:.14em;
                         text-transform:uppercase;color:var(--muted)">
              Fields <span style="font-weight:400;color:var(--text3)">(${totalFields})</span>
            </span>
          </div>
          <div id="form-field-list" style="flex:1;overflow-y:auto;padding:4px 0">
            ${_renderFieldList()}
          </div>
        </div>

        <!-- Column 3: Routing panel -->
        <div style="width:220px;min-width:220px;border-left:1px solid var(--border);
                    display:flex;flex-direction:column;background:var(--bg1)">
          <div style="padding:10px 14px;border-bottom:1px solid var(--border);flex-shrink:0">
            <span style="font-size:9px;font-weight:600;letter-spacing:.14em;
                         text-transform:uppercase;color:var(--muted)">Fill Routing</span>
          </div>
          <div style="flex:1;overflow-y:auto;padding:14px">
            ${_renderRoutingPanel(roles)}
          </div>
        </div>

      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// FIELD LIST (Column 2)
// ─────────────────────────────────────────────────────────────────────────────

function _renderFieldList() {
  if (!_formFields.length) {
    return `<div style="padding:16px 14px;font-size:11px;color:var(--muted);line-height:1.8;text-align:center">
              No fields detected yet.<br/>Draw rectangles on the document<br/>to add fields manually.
            </div>`;
  }

  return _formFields.map((field, idx) => {
    const roleConf = FORM_ROLES[field.role] || FORM_ROLES.assignee;
    const typeIcon = { text:'T', date:'📅', number:'#', checkbox:'☑', signature:'✍', textarea:'¶' }[field.type] || 'T';

    return `
      <div id="frow-${field.id}"
        style="padding:7px 12px;border-bottom:1px solid var(--border);
               display:flex;align-items:flex-start;gap:8px;cursor:pointer;
               transition:background .1s"
        onmouseenter="this.style.background='var(--surf2)'"
        onmouseleave="this.style.background=''"
        onclick="_formSelectField('${field.id}')">

        <!-- Type badge -->
        <div style="flex-shrink:0;width:20px;height:20px;border-radius:3px;
                    background:rgba(255,255,255,.05);border:1px solid var(--border2);
                    display:flex;align-items:center;justify-content:center;
                    font-size:10px;color:var(--text2);margin-top:1px">
          ${typeIcon}
        </div>

        <!-- Label + meta -->
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;color:var(--text1);white-space:nowrap;
                      overflow:hidden;text-overflow:ellipsis;margin-bottom:2px">
            ${escHtml(field.label || 'Unlabelled')}
          </div>
          <div style="display:flex;align-items:center;gap:5px">
            <span style="font-size:9px;padding:1px 5px;border-radius:3px;
                         background:${roleConf.dim};color:${roleConf.color}">
              ${roleConf.label}
            </span>
            ${field.required ? `<span style="font-size:9px;color:var(--red)">required</span>` : ''}
            <span style="font-size:9px;color:var(--muted)">p${field.page || 1}</span>
          </div>
        </div>

        <!-- Delete -->
        <button onclick="event.stopPropagation();_formRemoveField('${field.id}')"
          style="background:none;border:none;color:var(--muted);cursor:pointer;
                 font-size:11px;padding:0;opacity:0;transition:opacity .15s;flex-shrink:0"
          onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=0"
          title="Remove field">✕</button>
      </div>`;
  }).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTING PANEL (Column 3) — the key UI you described
// ─────────────────────────────────────────────────────────────────────────────

function _renderRoutingPanel(roles) {
  const mode = _formRouting.mode || 'serial';
  const isSerial = mode === 'serial';

  if (!roles.length) {
    return `<div style="font-size:11px;color:var(--muted);line-height:1.8">
              Assign roles to fields to configure routing.
            </div>`;
  }

  return `
    <!-- Mode selector -->
    <div style="margin-bottom:16px">
      <div style="font-size:9px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;
                  color:var(--muted);margin-bottom:10px">Fill Order</div>

      <!-- Serial radio -->
      <label style="display:flex;align-items:flex-start;gap:9px;cursor:pointer;
                    padding:8px 10px;border-radius:5px;margin-bottom:6px;
                    border:1px solid ${isSerial ? 'var(--cad-wire)' : 'var(--border)'};
                    background:${isSerial ? 'var(--cad-dim)' : 'transparent'};
                    transition:all .15s">
        <input type="radio" name="form-routing-mode" value="serial"
          ${isSerial ? 'checked' : ''}
          onchange="_formSetMode('serial')"
          style="margin-top:2px;accent-color:var(--cad);flex-shrink:0"/>
        <div>
          <div style="font-size:11px;font-weight:600;color:${isSerial ? 'var(--text)' : 'var(--text2)'}">
            Serial
          </div>
          <div style="font-size:10px;color:var(--muted);margin-top:2px;line-height:1.5">
            Roles fill in sequence.<br/>Each is notified only after the prior role submits.
          </div>
        </div>
      </label>

      <!-- Parallel radio -->
      <label style="display:flex;align-items:flex-start;gap:9px;cursor:pointer;
                    padding:8px 10px;border-radius:5px;
                    border:1px solid ${!isSerial ? 'var(--accent)' : 'var(--border)'};
                    background:${!isSerial ? 'rgba(79,142,247,.08)' : 'transparent'};
                    transition:all .15s">
        <input type="radio" name="form-routing-mode" value="parallel"
          ${!isSerial ? 'checked' : ''}
          onchange="_formSetMode('parallel')"
          style="margin-top:2px;accent-color:var(--accent);flex-shrink:0"/>
        <div>
          <div style="font-size:11px;font-weight:600;color:${!isSerial ? 'var(--text)' : 'var(--text2)'}">
            Parallel
          </div>
          <div style="font-size:10px;color:var(--muted);margin-top:2px;line-height:1.5">
            All roles notified simultaneously. Any can fill in any order.
          </div>
        </div>
      </label>
    </div>

    <!-- Role sequence (shown always; drag handle only active in serial mode) -->
    <div>
      <div style="font-size:9px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;
                  color:var(--muted);margin-bottom:8px;display:flex;align-items:center;gap:6px">
        Roles in this form
        ${isSerial ? `<span style="font-weight:400;color:var(--text3)">— drag to reorder</span>` : ''}
      </div>
      <div id="form-role-list" style="display:flex;flex-direction:column;gap:4px">
        ${_renderRoleRows(roles, isSerial)}
      </div>
      ${isSerial ? `
      <div style="margin-top:10px;padding:8px 10px;border-radius:4px;
                  background:rgba(196,125,24,.06);border:1px solid var(--cad-wire)">
        <div style="font-size:10px;color:var(--amber);line-height:1.5">
          ↓ Top role receives the form first. Each subsequent role is notified only after the role above submits.
        </div>
      </div>` : `
      <div style="margin-top:10px;padding:8px 10px;border-radius:4px;
                  background:rgba(79,142,247,.06);border:1px solid rgba(79,142,247,.2)">
        <div style="font-size:10px;color:var(--accent);line-height:1.5">
          ⇉ All roles receive the form simultaneously. The form step completes when all have submitted.
        </div>
      </div>`}
    </div>`;
}

function _renderRoleRows(roles, isSerial) {
  // roles is sorted by _formRouting.roles[].order when serial
  const ordered = _formRoutingRolesOrdered(roles);

  return ordered.map((r, idx) => {
    const roleConf = FORM_ROLES[r.role] || { label: r.role, color: 'var(--muted)', dim: 'rgba(255,255,255,.05)' };
    const fieldCount = (_formFields || []).filter(f => f.role === r.role).length;

    return `
      <div id="role-row-${r.role}"
        draggable="${isSerial}"
        ondragstart="${isSerial ? `_formRoleDragStart(event,'${r.role}')` : ''}"
        ondragover="${isSerial ? `_formRoleDragOver(event,'${r.role}')` : ''}"
        ondragleave="${isSerial ? `_formRoleDragLeave(event)` : ''}"
        ondrop="${isSerial ? `_formRoleDrop(event,'${r.role}')` : ''}"
        ondragend="${isSerial ? `_formRoleDragEnd()` : ''}"
        style="display:flex;align-items:center;gap:8px;padding:7px 10px;
               border-radius:5px;border:1px solid var(--border);
               background:var(--surf2);
               ${isSerial ? 'cursor:grab' : 'cursor:default'};
               transition:border-color .15s">

        <!-- Order number (serial) or parallel indicator -->
        ${isSerial
          ? `<span style="font-size:10px;font-weight:700;color:var(--muted);
                         width:14px;text-align:center;flex-shrink:0">${idx + 1}</span>`
          : `<span style="font-size:12px;color:var(--accent);flex-shrink:0">⇉</span>`}

        <!-- Role colour dot + label -->
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px">
            <div style="width:7px;height:7px;border-radius:50%;
                        background:${roleConf.color};flex-shrink:0"></div>
            <span style="font-size:11px;font-weight:600;color:${roleConf.color}">
              ${roleConf.label}
            </span>
          </div>
          <div style="font-size:9px;color:var(--muted);margin-top:2px">
            ${fieldCount} field${fieldCount !== 1 ? 's' : ''}
          </div>
        </div>

        <!-- Drag handle (serial only) -->
        ${isSerial
          ? `<span style="font-size:13px;color:var(--border2);flex-shrink:0;
                         user-select:none;line-height:1">⠿</span>`
          : ''}
      </div>`;
  }).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTING LOGIC
// ─────────────────────────────────────────────────────────────────────────────

function _deriveRoles(fields) {
  // Extract unique roles from fields, maintaining insertion order
  const seen = new Set();
  const roles = [];
  (fields || []).forEach(f => {
    if (f.role && !seen.has(f.role)) {
      seen.add(f.role);
      roles.push({ role: f.role });
    }
  });
  return roles;
}

function _formRoutingRolesOrdered(roles) {
  const routingRoles = _formRouting.roles || [];
  // Merge: routing order for roles we know about, append any new roles at end
  const ordered = [];
  const rolesInRouting = routingRoles
    .filter(r => roles.find(dr => dr.role === r.role))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  rolesInRouting.forEach(r => ordered.push(r));

  // Append roles in fields not yet in routing config
  roles.forEach(r => {
    if (!ordered.find(o => o.role === r.role)) {
      ordered.push({ role: r.role, order: ordered.length + 1 });
    }
  });

  return ordered;
}

function _formSetMode(mode) {
  _formRouting = { ..._formRouting, mode };
  _reRenderRoutingPanel();
}

function _reRenderRoutingPanel() {
  const roles = _deriveRoles(_formFields);
  const panel = document.getElementById('form-role-list')?.closest('[style*="flex-direction:column"]');
  // Re-render just the routing panel content
  const routingCol = document.querySelector('#form-editor-main [style*="width:220px"]');
  if (routingCol) {
    const inner = routingCol.querySelector('[style*="flex:1"]');
    if (inner) inner.innerHTML = _renderRoutingPanel(roles);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ROLE DRAG-AND-DROP (serial reorder)
// ─────────────────────────────────────────────────────────────────────────────

function _formRoleDragStart(event, role) {
  _formDragRole = role;
  event.dataTransfer.effectAllowed = 'move';
  event.currentTarget.style.opacity = '0.4';
}

function _formRoleDragOver(event, role) {
  if (!_formDragRole || _formDragRole === role) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  event.currentTarget.style.borderColor = 'var(--cad-wire)';
  event.currentTarget.style.background = 'var(--surf3)';
}

function _formRoleDragLeave(event) {
  event.currentTarget.style.borderColor = 'var(--border)';
  event.currentTarget.style.background = 'var(--surf2)';
}

function _formRoleDrop(event, targetRole) {
  event.preventDefault();
  if (!_formDragRole || _formDragRole === targetRole) return;

  const roles = _deriveRoles(_formFields);
  const ordered = _formRoutingRolesOrdered(roles);

  const fromIdx = ordered.findIndex(r => r.role === _formDragRole);
  const toIdx   = ordered.findIndex(r => r.role === targetRole);
  if (fromIdx === -1 || toIdx === -1) return;

  // Reorder
  const moved = ordered.splice(fromIdx, 1)[0];
  ordered.splice(toIdx, 0, moved);

  // Write back with new order values
  _formRouting.roles = ordered.map((r, i) => ({ role: r.role, order: i + 1 }));

  // Clean up and re-render
  event.currentTarget.style.borderColor = 'var(--border)';
  event.currentTarget.style.background  = 'var(--surf2)';
  _reRenderRoutingPanel();
}

function _formRoleDragEnd() {
  _formDragRole = null;
  document.querySelectorAll('[id^="role-row-"]').forEach(el => {
    el.style.opacity      = '';
    el.style.borderColor  = 'var(--border)';
    el.style.background   = 'var(--surf2)';
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// FIELD CLICK — inline edit popover
// ─────────────────────────────────────────────────────────────────────────────

function _formSelectField(fieldId) {
  const field = _formFields.find(f => f.id === fieldId);
  if (!field) return;

  // Remove any existing popover
  document.getElementById('field-edit-popover')?.remove();

  const row = document.getElementById(`frow-${fieldId}`);
  if (!row) return;

  const popover = document.createElement('div');
  popover.id = 'field-edit-popover';
  popover.style.cssText = `
    position:fixed;z-index:200;background:var(--bg2);
    border:1px solid var(--border2);border-radius:6px;
    padding:14px;width:220px;
    box-shadow:0 8px 32px rgba(0,0,0,.6);
  `;

  // Position relative to the row
  const rect = row.getBoundingClientRect();
  popover.style.top  = rect.top + 'px';
  popover.style.left = (rect.right + 8) + 'px';

  const roleOptions = Object.entries(FORM_ROLES).map(([key, conf]) =>
    `<option value="${key}" ${field.role === key ? 'selected' : ''}>${conf.label}</option>`
  ).join('');

  const typeOptions = FIELD_TYPES.map(t =>
    `<option value="${t}" ${field.type === t ? 'selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`
  ).join('');

  popover.innerHTML = `
    <div style="font-size:9px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;
                color:var(--muted);margin-bottom:10px">Edit Field</div>

    <div style="margin-bottom:8px">
      <label class="config-label">Label</label>
      <input class="config-input" id="fedit-label" value="${escHtml(field.label || '')}"
        placeholder="Field label" style="font-size:11px"
        oninput="_formUpdateField('${fieldId}','label',this.value)"/>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
      <div>
        <label class="config-label">Type</label>
        <select class="config-select" style="font-size:11px"
          onchange="_formUpdateField('${fieldId}','type',this.value)">
          ${typeOptions}
        </select>
      </div>
      <div>
        <label class="config-label">Role</label>
        <select class="config-select" style="font-size:11px"
          onchange="_formUpdateField('${fieldId}','role',this.value)">
          ${roleOptions}
        </select>
      </div>
    </div>

    <div style="margin-bottom:10px">
      <label class="config-toggle">
        <div class="toggle-box${field.required ? ' on' : ''}" id="fedit-req-toggle"
          onclick="_formToggleRequired('${fieldId}')"></div>
        <span style="font-size:11px">Required</span>
      </label>
    </div>

    <button onclick="document.getElementById('field-edit-popover')?.remove()"
      class="btn btn-ghost btn-sm" style="width:100%;font-size:11px">Done</button>
  `;

  document.body.appendChild(popover);

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!popover.contains(e.target) && !row.contains(e.target)) {
        popover.remove();
        document.removeEventListener('click', close);
      }
    });
  }, 50);

  // Highlight corresponding SVG rect on canvas
  _highlightFieldRect(fieldId);
}

function _formUpdateField(fieldId, key, value) {
  const field = _formFields.find(f => f.id === fieldId);
  if (!field) return;
  field[key] = value;

  // Re-render the field list row and routing panel
  const listEl = document.getElementById('form-field-list');
  if (listEl) listEl.innerHTML = _renderFieldList();
  _reRenderRoutingPanel();
  _renderFieldOverlays();
}

function _formToggleRequired(fieldId) {
  const field = _formFields.find(f => f.id === fieldId);
  if (!field) return;
  field.required = !field.required;
  const toggle = document.getElementById('fedit-req-toggle');
  if (toggle) toggle.className = 'toggle-box' + (field.required ? ' on' : '');
  const listEl = document.getElementById('form-field-list');
  if (listEl) listEl.innerHTML = _renderFieldList();
}

function _formRemoveField(fieldId) {
  _formFields = _formFields.filter(f => f.id !== fieldId);
  const listEl = document.getElementById('form-field-list');
  if (listEl) listEl.innerHTML = _renderFieldList();
  _reRenderRoutingPanel();
  _renderFieldOverlays();
  document.getElementById('field-edit-popover')?.remove();
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG OVERLAY — field rectangles on the canvas
// ─────────────────────────────────────────────────────────────────────────────

function _renderFieldOverlays() {
  const svg = document.getElementById('form-field-overlay');
  if (!svg) return;

  const currentPageFields = _formFields.filter(f => (f.page || 1) === _pdfPage);

  svg.innerHTML = currentPageFields.map(field => {
    const roleConf = FORM_ROLES[field.role] || FORM_ROLES.assignee;
    const r = field.rect || { x: 0, y: 0, w: 80, h: 18 };
    const x = r.x * _pdfScale, y = r.y * _pdfScale;
    const w = r.w * _pdfScale, h = r.h * _pdfScale;

    return `
      <g class="field-rect-group" data-field-id="${field.id}"
        style="cursor:pointer" onclick="_formSelectField('${field.id}')">
        <rect x="${x}" y="${y}" width="${w}" height="${h}"
          fill="${roleConf.dim}" stroke="${roleConf.color}" stroke-width="1.5"
          rx="2" opacity="0.85"/>
        <rect x="${x}" y="${y - 16}" width="${Math.min(w, 90)}" height="14"
          fill="${roleConf.color}" rx="2" opacity="0.9"/>
        <text x="${x + 4}" y="${y - 5}"
          fill="white" font-size="8" font-family="monospace"
          style="pointer-events:none">
          ${escHtml((field.label || 'field').slice(0, 14))}
        </text>
      </g>`;
  }).join('');
}

function _highlightFieldRect(fieldId) {
  document.querySelectorAll('.field-rect-group rect:first-child').forEach(r => {
    r.style.strokeWidth = '1.5';
    r.style.filter = '';
  });
  const group = document.querySelector(`.field-rect-group[data-field-id="${fieldId}"]`);
  if (group) {
    const rect = group.querySelector('rect');
    if (rect) {
      rect.style.strokeWidth = '2.5';
      rect.style.filter = 'drop-shadow(0 0 4px currentColor)';
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MANUAL DRAW — click-drag to add field rectangle
// ─────────────────────────────────────────────────────────────────────────────

function _formDrawStart(event) {
  const layer = document.getElementById('form-draw-layer');
  if (!layer) return;
  const layerRect = layer.getBoundingClientRect();
  _drawingRect = {
    active: true,
    startX: event.clientX - layerRect.left,
    startY: event.clientY - layerRect.top,
  };
  // Create preview rect
  const preview = document.getElementById('form-draw-preview');
  if (preview) preview.remove();
  const p = document.createElement('div');
  p.id = 'form-draw-preview';
  p.style.cssText = `
    position:absolute;border:2px dashed var(--cad);background:var(--cad-dim);
    pointer-events:none;border-radius:2px;
    left:${_drawingRect.startX}px;top:${_drawingRect.startY}px;width:0;height:0
  `;
  layer.appendChild(p);
}

function _formDrawMove(event) {
  if (!_drawingRect?.active) return;
  const layer = document.getElementById('form-draw-layer');
  const preview = document.getElementById('form-draw-preview');
  if (!layer || !preview) return;
  const layerRect = layer.getBoundingClientRect();
  const curX = event.clientX - layerRect.left;
  const curY = event.clientY - layerRect.top;
  const x = Math.min(curX, _drawingRect.startX);
  const y = Math.min(curY, _drawingRect.startY);
  const w = Math.abs(curX - _drawingRect.startX);
  const h = Math.abs(curY - _drawingRect.startY);
  preview.style.left   = x + 'px';
  preview.style.top    = y + 'px';
  preview.style.width  = w + 'px';
  preview.style.height = h + 'px';
}

function _formDrawEnd(event) {
  if (!_drawingRect?.active) return;
  const layer = document.getElementById('form-draw-layer');
  const preview = document.getElementById('form-draw-preview');
  if (preview) preview.remove();
  if (!layer) { _drawingRect = null; return; }

  const layerRect = layer.getBoundingClientRect();
  const curX = event.clientX - layerRect.left;
  const curY = event.clientY - layerRect.top;
  const w = Math.abs(curX - _drawingRect.startX);
  const h = Math.abs(curY - _drawingRect.startY);

  if (w > 12 && h > 8) {
    // Convert canvas coords back to PDF points
    const x = Math.min(curX, _drawingRect.startX) / _pdfScale;
    const y = Math.min(curY, _drawingRect.startY) / _pdfScale;
    const fieldId = 'manual_' + Date.now();
    _formFields.push({
      id: fieldId,
      page: _pdfPage,
      rect: { x, y, w: w / _pdfScale, h: h / _pdfScale },
      label: '',
      type: 'text',
      role: 'assignee',
      required: false,
      detection: 'manual',
    });
    _renderFieldOverlays();
    const listEl = document.getElementById('form-field-list');
    if (listEl) listEl.innerHTML = _renderFieldList();
    _reRenderRoutingPanel();
    // Open the edit popover immediately for the new field
    setTimeout(() => _formSelectField(fieldId), 50);
  }

  _drawingRect = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF RENDERING (PDF.js)
// ─────────────────────────────────────────────────────────────────────────────

async function _ensurePdfJs() {
  if (window.pdfjsLib) return;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      res();
    };
    s.onerror = rej;
    document.head.appendChild(s);
  });
}

async function _renderPdfPage(pageNum) {
  if (!_pdfDoc) return;
  try {
    const page    = await _pdfDoc.getPage(pageNum);
    const vp      = page.getViewport({ scale: _pdfScale });
    const canvas  = document.getElementById('form-pdf-canvas');
    const overlay = document.getElementById('form-field-overlay');
    if (!canvas) return;
    canvas.width  = vp.width;
    canvas.height = vp.height;
    canvas.style.width  = vp.width  + 'px';
    canvas.style.height = vp.height + 'px';
    if (overlay) {
      overlay.setAttribute('width',  vp.width  + 'px');
      overlay.setAttribute('height', vp.height + 'px');
      overlay.style.width  = vp.width  + 'px';
      overlay.style.height = vp.height + 'px';
    }
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    _renderFieldOverlays();
  } catch(e) {
    cadToast('Page render failed: ' + e.message, 'error');
  }
}

function _formPrevPage() {
  if (_pdfPage <= 1) return;
  _pdfPage--;
  _updatePageIndicator();
  _renderPdfPage(_pdfPage);
}

function _formNextPage() {
  if (_pdfPage >= _pdfTotalPages) return;
  _pdfPage++;
  _updatePageIndicator();
  _renderPdfPage(_pdfPage);
}

function _updatePageIndicator() {
  const el = document.getElementById('form-page-indicator');
  if (el) el.textContent = `${_pdfPage} / ${_pdfTotalPages}`;
}

function _formZoomIn()  { _pdfScale = Math.min(3, _pdfScale * 1.25); _renderPdfPage(_pdfPage); }
function _formZoomOut() { _pdfScale = Math.max(0.5, _pdfScale * 0.8); _renderPdfPage(_pdfPage); }

// ─────────────────────────────────────────────────────────────────────────────
// FILE IMPORT — upload, detect fields, open editor
// ─────────────────────────────────────────────────────────────────────────────

function _formUploadClick() {
  document.getElementById('form-file-input')?.click();
}

async function _formFileChosen(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  cadToast(`Loading ${file.name}…`, 'info');

  try {
    await _ensurePdfJs();
    const arrayBuffer = await file.arrayBuffer();
    _pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    _pdfTotalPages = _pdfDoc.numPages;
    _pdfPage = 1;
    _pdfScale = 1.5;

    // Run AcroForm field detection on all pages
    const detectedFields = await _detectAcroFormFields(_pdfDoc);

    // Create a new form definition (not yet saved to DB)
    const newForm = {
      id: 'local_' + Date.now(),
      source_name: file.name,
      page_count: _pdfTotalPages,
      fields: detectedFields,
      routing: { mode: 'serial', roles: [] },
      _unsaved: true,
      _file: file,
    };

    _formDefs.push(newForm);
    _formFields = detectedFields;
    _formRouting = { mode: 'serial', roles: _deriveRoles(detectedFields).map((r, i) => ({ role: r.role, order: i + 1 })) };
    _selectedForm = newForm;

    // Re-render the full tab
    const el = document.getElementById('cad-content');
    if (el) renderFormsTab(el);

    // Render first page
    await _renderPdfPage(1);

    cadToast(`${detectedFields.length} field${detectedFields.length !== 1 ? 's' : ''} detected in ${file.name}`, 'success');
  } catch(e) {
    cadToast('Import failed: ' + e.message, 'error');
  }

  event.target.value = '';
}

async function _detectAcroFormFields(pdfDoc) {
  const fields = [];
  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const annotations = await page.getAnnotations();

    for (const ann of annotations) {
      if (!ann.fieldType) continue; // not a form field
      const [x1, y1, x2, y2] = ann.rect;
      const vp = page.getViewport({ scale: 1 });
      // PDF coords are bottom-left origin; convert to top-left
      const x = Math.min(x1, x2);
      const y = vp.height - Math.max(y1, y2);
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);

      const typeMap = { Tx: 'text', Btn: 'checkbox', Ch: 'text', Sig: 'signature' };

      // Infer role from field name heuristics
      const nameL = (ann.fieldName || '').toLowerCase();
      const role = nameL.includes('sign') || nameL.includes('approv') || nameL.includes('review')
        ? 'reviewer'
        : nameL.includes('pm') || nameL.includes('manager') || nameL.includes('authoriz')
          ? 'pm'
          : 'assignee';

      fields.push({
        id: 'acro_' + pageNum + '_' + fields.length,
        page: pageNum,
        rect: { x, y, w, h },
        label: ann.fieldName || ann.alternativeText || 'Field ' + (fields.length + 1),
        type: typeMap[ann.fieldType] || 'text',
        role,
        required: !!(ann.fieldFlags & 2),
        detection: 'acroform',
      });
    }

    // Also run text heuristics for non-AcroForm content
    const textContent = await page.getTextContent();
    const heuristicFields = _detectTextHeuristics(textContent, page, pageNum, fields.length);
    fields.push(...heuristicFields);
  }
  return fields;
}

function _detectTextHeuristics(textContent, page, pageNum, startIdx) {
  const found = [];
  const items = textContent.items;
  const vp = page.getViewport({ scale: 1 });

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const str  = item.str || '';
    const [, , , , tx, ty] = item.transform; // x, y in PDF coords
    const x = tx;
    const y = vp.height - ty;

    // Underscore run: Name: ____________
    if (/_{4,}/.test(str)) {
      const label = items.slice(Math.max(0, i - 2), i)
        .map(it => it.str).join(' ').replace(/:?\s*$/, '').trim();
      const underLen = (str.match(/_{4,}/)?.[0] || '').length;
      found.push({
        id: `heur_${pageNum}_${startIdx + found.length}`,
        page: pageNum,
        rect: { x: x, y: y - 4, w: underLen * 5, h: 14 },
        label: label || 'Text field',
        type: /date|dated|as of/i.test(label) ? 'date' : 'text',
        role: /sign|approv|authoriz|review/i.test(label) ? 'reviewer' : 'assignee',
        required: false,
        detection: 'heuristic:underscore',
      });
    }

    // Signature keyword
    if (/^(signature|sign here|authorized by|approved by|reviewed by)/i.test(str.trim())) {
      found.push({
        id: `heur_${pageNum}_${startIdx + found.length}`,
        page: pageNum,
        rect: { x, y: y + 2, w: 160, h: 22 },
        label: str.trim(),
        type: 'signature',
        role: /approv|authoriz/i.test(str) ? 'pm' : 'reviewer',
        required: true,
        detection: 'heuristic:signature_keyword',
      });
    }
  }

  return found;
}

// ─────────────────────────────────────────────────────────────────────────────
// FORM SELECT / DELETE / SAVE
// ─────────────────────────────────────────────────────────────────────────────

async function _formSelect(formId) {
  const form = _formDefs.find(f => f.id === formId);
  if (!form) return;
  _selectedForm = form;
  _formFields   = JSON.parse(JSON.stringify(form.fields || []));
  _formRouting  = JSON.parse(JSON.stringify(form.routing || { mode: 'serial', roles: [] }));
  _pdfPage      = 1;
  _pdfDoc       = null; // will re-load

  const el = document.getElementById('cad-content');
  if (el) renderFormsTab(el);

  // If form has a stored path, load the PDF from storage
  if (form.source_path) {
    try {
      await _ensurePdfJs();
      const url = await _getSignedUrl(form.source_path);
      _pdfDoc = await pdfjsLib.getDocument(url).promise;
      _pdfTotalPages = _pdfDoc.numPages;
      await _renderPdfPage(1);
    } catch(e) {
      cadToast('Could not load document: ' + e.message, 'error');
    }
  }
}

function _formDelete(formId) {
  if (!confirm('Remove this form definition? The source document is not deleted.')) return;
  _formDefs = _formDefs.filter(f => f.id !== formId);
  if (_selectedForm?.id === formId) {
    _selectedForm = null;
    _formFields   = [];
    _pdfDoc       = null;
  }
  const el = document.getElementById('cad-content');
  if (el) renderFormsTab(el);
}

async function _formSave() {
  if (!_selectedForm) return;

  // Merge working state back
  _selectedForm.fields  = JSON.parse(JSON.stringify(_formFields));
  _selectedForm.routing = JSON.parse(JSON.stringify(_formRouting));

  // If local (just uploaded), persist to DB and storage
  if (_selectedForm._unsaved) {
    cadToast('Saving…', 'info');
    try {
      // Upload PDF to storage if we have the file
      if (_selectedForm._file) {
        const safeName = _selectedForm._file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const path     = `${FIRM_ID_CAD}/forms/${Date.now()}_${safeName}`;
        const token    = await Auth.getToken();
        const res = await fetch(`${SUPA_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
          method: 'POST',
          headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + token,
                     'Content-Type': _selectedForm._file.type || 'application/pdf',
                     'x-upsert': 'true' },
          body: _selectedForm._file,
        });
        if (!res.ok) throw new Error('Storage upload failed');
        _selectedForm.source_path = path;
      }

      // Insert DB row
      const rows = await API.post('workflow_form_definitions', {
        firm_id:     FIRM_ID_CAD,
        source_path: _selectedForm.source_path || null,
        source_name: _selectedForm.source_name,
        page_count:  _selectedForm.page_count,
        fields:      _selectedForm.fields,
        routing:     _selectedForm.routing,
      });

      if (rows?.[0]?.id) {
        _selectedForm.id       = rows[0].id;
        _selectedForm._unsaved = false;
        delete _selectedForm._file;
      }

      cadToast('Form saved', 'success');

      // Re-render list
      const listEl = document.getElementById('form-list');
      if (listEl) listEl.innerHTML = _renderFormList();
    } catch(e) {
      cadToast('Save failed: ' + e.message, 'error');
    }
  } else {
    // Update existing
    await API.patch(`workflow_form_definitions?id=eq.${_selectedForm.id}`, {
      fields:  _selectedForm.fields,
      routing: _selectedForm.routing,
    }).catch(e => cadToast('Save failed: ' + e.message, 'error'));
    cadToast('Form saved', 'success');
    const listEl = document.getElementById('form-list');
    if (listEl) listEl.innerHTML = _renderFormList();
  }
}

async function _getSignedUrl(path) {
  const token = await Auth.getToken();
  const res = await fetch(`${SUPA_URL}/storage/v1/object/sign/${STORAGE_BUCKET}/${path}`, {
    method: 'POST',
    headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + token,
               'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 3600 }),
  });
  const data = await res.json();
  if (!data.signedURL) throw new Error('Could not generate URL');
  return `${SUPA_URL}/storage/v1${data.signedURL}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOAD FORMS FROM DB ON TAB OPEN
// ─────────────────────────────────────────────────────────────────────────────

async function _loadFormDefs() {
  try {
    const rows = await API.get(
      `workflow_form_definitions?firm_id=eq.${FIRM_ID_CAD}&order=created_at.desc`
    ).catch(() => []);
    _formDefs = rows || [];
  } catch(e) { _formDefs = []; }
}

// Patch switchTab to load form defs when Forms tab is opened
const _origSwitchTab = typeof switchTab === 'function' ? switchTab : null;
if (_origSwitchTab) {
  window.switchTab = function(tab) {
    if (tab === 'forms' && !_formDefs.length) {
      _loadFormDefs().then(() => {
        const el = document.getElementById('cad-content');
        if (el) renderFormsTab(el);
      });
    }
    _origSwitchTab(tab);
  };
}